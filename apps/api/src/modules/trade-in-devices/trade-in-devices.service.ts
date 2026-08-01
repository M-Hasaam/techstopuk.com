import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { DEFAULT_TRADE_IN_DEVICES } from './trade-in-devices.seed-data';

export interface CreateTradeInDeviceDto {
    name:     string;
    brand:    string;
    category: string;
    isActive?: boolean;
}

@Injectable()
export class TradeInDevicesService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(activeOnly = false) {
        const devices = await this.prisma.tradeInDevice.findMany({
            where: activeOnly ? { isActive: true } : undefined,
            orderBy: [{ category: 'asc' }, { brand: 'asc' }, { name: 'asc' }],
        });

        // Cross-reference against the pricing catalog so the search box can show
        // an "auto-priced" badge for devices with a real, confirmed price — same
        // tradeInMode computation DeviceCatalogService uses for the wizard's list.
        return Promise.all(devices.map(async (d) => {
            const hasScrapedPrice = await this.prisma.scrapedPrice.findFirst({
                where: {
                    brand: { equals: d.brand, mode: 'insensitive' },
                    model: { equals: d.name,  mode: 'insensitive' },
                    marketPrice: { gt: 0 },
                },
                select: { id: true },
            });
            if (hasScrapedPrice) return { ...d, tradeInMode: 'auto' as const };

            const catalogEntry = await this.prisma.deviceCatalog.findFirst({
                where: {
                    model: { equals: d.name, mode: 'insensitive' },
                    brandCategory: { brand: { name: { equals: d.brand, mode: 'insensitive' } } },
                },
                select: { manualMarketPrice: true },
            });
            const tradeInMode = catalogEntry?.manualMarketPrice ? 'manual_price' as const : 'unpriced' as const;
            return { ...d, tradeInMode };
        }));
    }

    async create(dto: CreateTradeInDeviceDto) {
        return this.prisma.tradeInDevice.upsert({
            where:  { brand_name: { brand: dto.brand, name: dto.name } },
            update: { category: dto.category, isActive: dto.isActive ?? true },
            create: { name: dto.name, brand: dto.brand, category: dto.category, isActive: dto.isActive ?? true },
        });
    }

    async update(id: string, dto: Partial<CreateTradeInDeviceDto>) {
        const existing = await this.prisma.tradeInDevice.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Device not found');
        return this.prisma.tradeInDevice.update({ where: { id }, data: dto });
    }

    async remove(id: string) {
        const existing = await this.prisma.tradeInDevice.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Device not found');
        return this.prisma.tradeInDevice.delete({ where: { id } });
    }

    bulkCreate(devices: CreateTradeInDeviceDto[]) {
        return Promise.all(devices.map(d => this.create(d)));
    }

    async removeAll() {
        const result = await this.prisma.tradeInDevice.deleteMany({});
        return { deleted: result.count };
    }

    /** Upserts the canonical "genuine gaps" list — safe to call repeatedly, never deletes. */
    async seedDefaults() {
        await this.bulkCreate(DEFAULT_TRADE_IN_DEVICES);
        return { seeded: DEFAULT_TRADE_IN_DEVICES.length };
    }
}
