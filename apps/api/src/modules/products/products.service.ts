import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Condition } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../../common/services/storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductPricingService } from '../product-pricing/product-pricing.service';
import { evaluateActive, computeTradeInOffer, round5 } from '../product-pricing/product-pricing.helpers';

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

const CATALOG_INCLUDE = {
    catalog: {
        include: {
            brandCategory: {
                include: { brand: true, category: true },
            },
        },
    },
    otherBrand: true,
    otherSubcategory: true,
} as const;

@Injectable()
export class ProductsService {
    private readonly logger = new Logger(ProductsService.name);

    constructor(
        private readonly prisma:          PrismaService,
        private readonly storage:         StorageService,
        private readonly productPricing:  ProductPricingService,
    ) {}

    private async presignAndFlatten(
        product: any,
        tradeInConfig?: { tradeInRatio: number; tradeInMargin: number },
    ) {
        const images = await Promise.all(
            (product.images as string[]).map((img: string) => this.storage.resolveImageUrl(img)),
        );
        const { catalog, otherBrand, otherSubcategory, ...rest } = product;

        // What we'd offer a customer trading in this exact model/condition — same
        // formula as the trade-in wizard's anchor, driven off this product's own resale price.
        const cfg = tradeInConfig ?? await this.productPricing.getTradeInFormulaConfig();
        const tradeInPrice = rest.price && rest.price > 0
            ? round5(computeTradeInOffer(rest.price, cfg.tradeInRatio) * (1 - cfg.tradeInMargin / 100))
            : null;

        return {
            ...rest,
            tradeInPrice,
            images: images.filter(Boolean) as string[],
            brand:    catalog?.brandCategory?.brand?.name    ?? otherBrand?.name       ?? '',
            model:    catalog?.model                          ?? '',
            category: catalog?.brandCategory?.category?.name ?? otherSubcategory?.name ?? '',
        };
    }

    async create(dto: CreateProductDto) {
        const isMain  = !!dto.catalogId;
        const isOther = !!dto.otherBrandId && !!dto.otherSubcategoryId;

        if (!isMain && !isOther) {
            throw new BadRequestException(
                'Provide either catalogId (main product) or otherBrandId + otherSubcategoryId (other product)',
            );
        }
        if (isMain && isOther) {
            throw new BadRequestException('Cannot set both catalogId and otherBrandId/otherSubcategoryId');
        }

        let slug: string;

        if (isMain) {
            const catalog = await this.prisma.deviceCatalog.findUnique({
                where: { id: dto.catalogId },
                include: { brandCategory: { include: { brand: true } } },
            });
            if (!catalog) throw new NotFoundException('Device catalog entry not found');

            const brandName = catalog.brandCategory.brand.name;
            const storage   = dto.storage ?? '';
            const baseSlug  = slugify(`${brandName}-${catalog.model}-${dto.condition}${storage ? `-${storage}` : ''}`);
            slug = baseSlug;
            let counter = 1;
            while (await this.prisma.product.findUnique({ where: { slug } })) {
                slug = `${baseSlug}-${counter++}`;
            }

            if (storage && !(catalog.storageOptions as string[]).includes(storage)) {
                await this.prisma.deviceCatalog.update({
                    where: { id: dto.catalogId },
                    data: { storageOptions: { push: storage } },
                });
            }
        } else {
            const [brand, subcat] = await Promise.all([
                this.prisma.otherBrand.findUnique({ where: { id: dto.otherBrandId } }),
                this.prisma.otherSubcategory.findUnique({ where: { id: dto.otherSubcategoryId } }),
            ]);
            if (!brand)  throw new NotFoundException('OtherBrand not found');
            if (!subcat) throw new NotFoundException('OtherSubcategory not found');

            const baseSlug = slugify(`${brand.name}-${dto.name}-${dto.condition}`);
            slug = baseSlug;
            let counter = 1;
            while (await this.prisma.product.findUnique({ where: { slug } })) {
                slug = `${baseSlug}-${counter++}`;
            }
        }

        const { catalogId, otherBrandId, otherSubcategoryId, storage: _s, ...rest } = dto;
        const product = await this.prisma.product.create({
            data: {
                ...rest,
                catalogId:          isMain  ? catalogId          : null,
                otherBrandId:       isOther ? otherBrandId       : null,
                otherSubcategoryId: isOther ? otherSubcategoryId : null,
                storage: dto.storage ?? '',
                slug,
                images: dto.images ?? [],
                specs:  (dto.specs ?? {}) as never,
            } as never,
            include: CATALOG_INCLUDE,
        });

        // Auto-price catalog products; other products start as no_data
        if (product.catalogId) {
            this.productPricing.priceProduct(product.id).catch((err: Error) =>
                this.logger.error(`Auto-price on create failed: ${err.message}`),
            );
        } else {
            await this.prisma.product.update({
                where: { id: product.id },
                data:  { pricingStatus: 'no_data' },
            });
        }
        return this.presignAndFlatten(product);
    }

    async getAdminCategories(): Promise<string[]> {
        const bcs = await this.prisma.brandCategory.findMany({
            where: { deviceCatalogs: { some: { products: { some: {} } } } },
            select: { category: { select: { name: true } } },
            distinct: ['categoryId'],
            orderBy: { category: { name: 'asc' } },
        });
        return bcs.map(bc => bc.category.name);
    }

    async getOthersCategories(): Promise<string[]> {
        const subcats = await this.prisma.otherSubcategory.findMany({
            where: { products: { some: {} } },
            select: { name: true },
            orderBy: { name: 'asc' },
        });
        return subcats.map(s => s.name);
    }

    async findAll(query: {
        category?: string;
        brand?: string;
        condition?: string;
        minPrice?: number;
        maxPrice?: number;
        search?: string;
        page?: number;
        limit?: number;
        includeInactive?: boolean;
        pricingStatus?: string;
        excludeOthers?: boolean;
        onlyOthers?: boolean;
    }) {
        const { category, brand, condition, minPrice, maxPrice, search, page = 1, limit = 20, includeInactive, pricingStatus, excludeOthers } = query;
        const safeLimit = Math.min(limit, 200);
        const skip = (page - 1) * safeLimit;

        const where: Record<string, unknown> = {};

        if (!includeInactive) {
            const showUnpriced = await this.prisma.pricingConfig
                .findUnique({ where: { key: 'show_unpriced_products' } })
                .then(r => (r?.value ?? 0) === 1)
                .catch(() => false);
            if (showUnpriced) {
                // Products with price=0 are isActive=false (evaluateActive gate), so we must
                // explicitly allow them here — otherwise isActive=true would exclude them.
                where.AND = [{ OR: [{ isActive: true }, { pricingStatus: 'no_data' }] }];
            } else {
                where.isActive = true;
                where.price = { gt: 0 };
            }
        }

        if (condition) where.condition = condition as Condition;
        if (minPrice !== undefined || maxPrice !== undefined) {
            where.price = { gte: minPrice, lte: maxPrice };
        }

        if (category || brand) {
            const mainClause: Record<string, unknown> = {};
            const brandCategoryWhere: Record<string, unknown> = {};
            if (category) brandCategoryWhere.category = { name: { equals: category, mode: 'insensitive' } };
            if (brand)    brandCategoryWhere.brand     = { name: { equals: brand,    mode: 'insensitive' } };
            if (Object.keys(brandCategoryWhere).length > 0) {
                mainClause.catalog = { is: { brandCategory: brandCategoryWhere } };
            }

            const otherClause: Record<string, unknown> = { catalog: { is: null } };
            if (category) otherClause.otherSubcategory = { name: { equals: category, mode: 'insensitive' } };
            if (brand)    otherClause.otherBrand        = { name: { equals: brand,    mode: 'insensitive' } };

            if (Array.isArray(where.AND)) {
                (where.AND as unknown[]).push({ OR: [mainClause, otherClause] });
            } else {
                where.OR = [mainClause, otherClause];
            }
        }

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { catalog: { is: { model: { contains: search, mode: 'insensitive' } } } },
                { catalog: { is: { brandCategory: { is: { brand: { is: { name: { contains: search, mode: 'insensitive' } } } } } } } },
                { otherBrand: { name: { contains: search, mode: 'insensitive' } } },
                { otherSubcategory: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }

        if (pricingStatus) where.pricingStatus = pricingStatus;
        if (excludeOthers) where.otherBrandId = null;
        if (query.onlyOthers) where.otherBrandId = { not: null };

        const [rawItems, total] = await Promise.all([
            this.prisma.product.findMany({ where, skip, take: safeLimit, orderBy: { createdAt: 'desc' }, include: CATALOG_INCLUDE }),
            this.prisma.product.count({ where }),
        ]);

        const tradeInConfig = await this.productPricing.getTradeInFormulaConfig();
        const items = await Promise.all(rawItems.map(p => this.presignAndFlatten(p, tradeInConfig)));
        return { items, total, page, limit: safeLimit, pages: Math.ceil(total / safeLimit) };
    }

    async getBrands(category?: string) {
        const bcWhere: Record<string, unknown> = { isActive: true };
        if (category) bcWhere.category = { name: { equals: category, mode: 'insensitive' } };

        const brandCategories = await this.prisma.brandCategory.findMany({
            where: bcWhere,
            include: { brand: true },
            distinct: ['brandId'],
            orderBy: { brand: { name: 'asc' } },
        });

        const result: { brand: string; slug: string; logo: string | null; image: string | null }[] = [];
        for (const bc of brandCategories) {
            const logo = bc.brand.logo
                ? await this.storage.resolveImageUrl(bc.brand.logo)
                : null;

            const bcImages = bc.images as string[];
            let image: string | null = null;
            if (bcImages.length > 0) {
                image = await this.storage.resolveImageUrl(bcImages[0]);
            } else {
                const product = await this.prisma.product.findFirst({
                    where: {
                        catalog: { is: { brandCategory: { is: { id: bc.id } } } },
                        isActive: true,
                    },
                    select: { images: true },
                });
                const imgs = product?.images as string[] | null;
                image = imgs?.[0] ? await this.storage.resolveImageUrl(imgs[0]) : null;
            }
            result.push({ brand: bc.brand.name, slug: bc.brand.slug, logo, image });
        }
        return result;
    }

    async findBySlug(slug: string) {
        const product = await this.prisma.product.findUnique({ where: { slug }, include: CATALOG_INCLUDE });
        if (!product) throw new NotFoundException('Product not found');
        return this.presignAndFlatten(product);
    }

    async findById(id: string) {
        const product = await this.prisma.product.findUnique({ where: { id }, include: CATALOG_INCLUDE });
        if (!product) throw new NotFoundException('Product not found');
        const presigned = await this.presignAndFlatten(product);
        return { ...presigned, rawImages: product.images as string[] };
    }

    async update(id: string, dto: UpdateProductDto) {
        await this.prisma.product.findUniqueOrThrow({ where: { id } });

        // Block explicit enable if activation gate is not met
        if (dto.isActive === true) {
            const current = await this.prisma.product.findUnique({
                where:  { id },
                select: { price: true, images: true, pricingStatus: true },
            });
            if (current && !evaluateActive(
                (dto.price !== undefined ? dto.price : current.price),
                (dto.images     ?? current.images) as string[],
                current.pricingStatus as string,
            )) {
                throw new BadRequestException(
                    'Cannot enable product: requires a price > £0, at least one image, and no active pricing flag.',
                );
            }
        }

        // When admin manually sets a positive price, record it as manual
        const extraData: Record<string, unknown> = {};
        if (typeof dto.price === 'number' && dto.price > 0) {
            extraData['pricingStatus'] = 'manual';
        }

        await this.prisma.product.update({
            where: { id },
            data:  { ...(dto as object), ...extraData } as never,
        });

        // Re-evaluate isActive unless admin explicitly set it
        if (dto.isActive === undefined) {
            await this.revalidateActive(id);
        }

        return this.prisma.product.findUnique({ where: { id } });
    }

    async remove(id: string) {
        if (id === 'all') {
            const products = await this.prisma.product.findMany({ select: { images: true } });
            const imageKeys = products.flatMap(p => p.images as string[]).filter(Boolean);
            await this.prisma.orderItem.deleteMany({});
            await this.prisma.product.deleteMany({});
            await this.storage.deleteFiles(imageKeys);
            return { message: 'All products deleted' };
        }
        const product = await this.prisma.product.findUniqueOrThrow({ where: { id } });
        const imageKeys = (product.images as string[]).filter(Boolean);
        await this.prisma.product.delete({ where: { id } });
        await this.storage.deleteFiles(imageKeys);
        return { message: 'Product deleted' };
    }

    private async revalidateActive(productId: string): Promise<void> {
        const p = await this.prisma.product.findUnique({
            where:  { id: productId },
            select: { price: true, images: true, pricingStatus: true },
        });
        if (!p) return;
        const active = evaluateActive(
            p.price,
            p.images as string[],
            p.pricingStatus,
        );
        await this.prisma.product.update({
            where: { id: productId },
            data:  { isActive: active },
        });
    }
}
