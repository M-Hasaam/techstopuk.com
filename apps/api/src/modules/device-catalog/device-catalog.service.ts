import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../../common/services/storage.service';
import { UpsertDeviceDto } from './dto/upsert-device.dto';

@Injectable()
export class DeviceCatalogService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StorageService,
    ) {}

    async findAll(params?: {
        categorySlug?: string;
        brandSlug?: string;
        search?: string;
        isActive?: boolean;
        forTradeIn?: boolean;
        page?: number;
        limit?: number;
        paged?: boolean;
    }) {
        const where: Record<string, unknown> = {};
        if (params?.isActive !== undefined) where.isActive = params.isActive;
        if (params?.forTradeIn) where.tradeInEnabled = true;
        if (params?.categorySlug || params?.brandSlug) {
            const bc: Record<string, unknown> = {};
            if (params?.categorySlug) bc.category = { name: { equals: params.categorySlug, mode: 'insensitive' } };
            if (params?.brandSlug)    bc.brand    = { slug: params.brandSlug };
            where.brandCategory = bc;
        }
        if (params?.search) {
            where.OR = [
                { model: { contains: params.search, mode: 'insensitive' } },
                { brandCategory: { brand: { name: { contains: params.search, mode: 'insensitive' } } } },
            ];
        }

        if (params?.paged) {
            const page  = params.page  ?? 1;
            const limit = Math.min(params.limit ?? 50, 200);
            const skip  = (page - 1) * limit;
            const [entries, total] = await Promise.all([
                this.prisma.deviceCatalog.findMany({
                    where, skip, take: limit,
                    include: { brandCategory: { include: { brand: true, category: true } } },
                    orderBy: [{ brandCategory: { brand: { name: 'asc' } } }, { model: 'asc' }],
                }),
                this.prisma.deviceCatalog.count({ where }),
            ]);
            return { items: entries, total, page, pages: Math.ceil(total / limit) };
        }

        const entries = await this.prisma.deviceCatalog.findMany({
            where,
            include: { brandCategory: { include: { brand: true, category: true } } },
            orderBy: { model: 'asc' },
        });

        // Augment with tradeInMode only when forTradeIn is requested (avoids extra queries otherwise)
        if (!params?.forTradeIn) return entries;

        const augmented = await Promise.all(entries.map(async (entry) => {
            // An admin-set manual price is an explicit override — it always wins over
            // automated scraped data, both here (display label) and in the actual offer
            // calculation (ProductPricingService.getTradeInAnchor).
            if ((entry as any).manualMarketPrice) {
                return { ...entry, tradeInMode: 'manual_price' as const };
            }

            // Only real scraped market data counts as 'auto' — AI-estimated product prices do not
            const hasScrapedPrice = await this.prisma.scrapedPrice.findFirst({
                where: {
                    brand: { equals: entry.brandCategory.brand.name, mode: 'insensitive' },
                    model: { equals: entry.model,                    mode: 'insensitive' },
                    marketPrice: { gt: 0 },
                },
                select: { id: true },
            });

            const tradeInMode = hasScrapedPrice ? 'auto' : 'unpriced';

            return { ...entry, tradeInMode: tradeInMode as 'auto' | 'manual_price' | 'unpriced' };
        }));

        return augmented;
    }

    create(dto: UpsertDeviceDto) {
        return this.prisma.deviceCatalog.create({
            data: dto as never,
            include: { brandCategory: { include: { brand: true, category: true } } },
        });
    }

    async update(id: string, dto: Partial<UpsertDeviceDto>) {
        const existing = await this.prisma.deviceCatalog.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Device not found');
        return this.prisma.deviceCatalog.update({
            where: { id },
            data: dto as never,
            include: { brandCategory: { include: { brand: true, category: true } } },
        });
    }

    async findOne(id: string) {
        const item = await this.prisma.deviceCatalog.findUnique({
            where: { id },
            include: { brandCategory: { include: { brand: true, category: true } } },
        });
        if (!item) throw new NotFoundException('Device not found');
        return item;
    }

    // Flat list of all active tradeable models for client-side fuzzy search
    async listForSearch(): Promise<{ model: string; brand: string; category: string }[]> {
        const items = await this.prisma.deviceCatalog.findMany({
            where: { isActive: true, tradeInEnabled: true },
            select: {
                model: true,
                brandCategory: {
                    select: {
                        brand:    { select: { name: true } },
                        category: { select: { name: true } },
                    },
                },
            },
            orderBy: [
                { brandCategory: { brand: { name: 'asc' } } },
                { model: 'asc' },
            ],
        });
        return items.map(i => ({
            model:    i.model,
            brand:    i.brandCategory.brand.name,
            category: i.brandCategory.category.name,
        }));
    }

    async remove(id: string) {
        if (id === 'all') {
            const products = await this.prisma.product.findMany({ select: { images: true } });
            const imageKeys = products.flatMap(p => p.images as string[]).filter(Boolean);

            await this.prisma.orderItem.deleteMany({});
            await this.prisma.product.deleteMany({});
            await this.prisma.deviceCatalog.deleteMany({});

            await this.storage.deleteFiles(imageKeys);

            return { message: 'All devices and products deleted' };
        }
        const existing = await this.prisma.deviceCatalog.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Device not found');

        const linkedProducts = await this.prisma.product.findMany({
            where: { catalogId: id },
            select: { id: true, images: true },
        });
        if (linkedProducts.length) {
            const productIds = linkedProducts.map(p => p.id);
            const imageKeys = linkedProducts.flatMap(p => p.images as string[]).filter(Boolean);
            await this.prisma.orderItem.deleteMany({ where: { productId: { in: productIds } } });
            await this.prisma.product.deleteMany({ where: { id: { in: productIds } } });
            await this.storage.deleteFiles(imageKeys);
        }

        await this.prisma.deviceCatalog.delete({ where: { id } });
        return { message: 'Device removed' };
    }
}
