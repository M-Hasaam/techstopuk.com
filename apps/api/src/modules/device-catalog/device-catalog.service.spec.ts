import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { DeviceCatalogService } from './device-catalog.service';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../../common/services/storage.service';

function makeDevice(overrides: Partial<any> = {}) {
    return {
        id: 'device-1',
        model: 'iPhone 13',
        brandCategoryId: 'bc-1',
        isActive: true,
        tradeInEnabled: true,
        manualMarketPrice: null,
        brandCategory: {
            brand: { name: 'Apple' },
            category: { name: 'Phones' },
        },
        ...overrides,
    };
}

describe('DeviceCatalogService', () => {
    let service: DeviceCatalogService;
    let prismaMock: any;
    let storageMock: any;

    beforeEach(async () => {
        prismaMock = {
            deviceCatalog: {
                findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]),
                count: jest.fn<() => Promise<any>>().mockResolvedValue(0),
                findUnique: jest.fn<() => Promise<any>>(),
                create: jest.fn<() => Promise<any>>(),
                update: jest.fn<() => Promise<any>>(),
                delete: jest.fn<() => Promise<any>>(),
                deleteMany: jest.fn<() => Promise<any>>(),
            },
            scrapedPrice: {
                findFirst: jest.fn<() => Promise<any>>().mockResolvedValue(null),
            },
            product: {
                findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]),
                deleteMany: jest.fn<() => Promise<any>>(),
            },
            orderItem: {
                deleteMany: jest.fn<() => Promise<any>>(),
            },
        };
        storageMock = {
            deleteFiles: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                DeviceCatalogService,
                { provide: PrismaService, useValue: prismaMock },
                { provide: StorageService, useValue: storageMock },
            ],
        }).compile();

        service = module.get<DeviceCatalogService>(DeviceCatalogService);
    });

    describe('findAll', () => {
        it('returns plain entries when forTradeIn is not requested', async () => {
            prismaMock.deviceCatalog.findMany.mockResolvedValueOnce([makeDevice()]);
            const result = await service.findAll();
            expect(result).toEqual([makeDevice()]);
            expect(prismaMock.scrapedPrice.findFirst).not.toHaveBeenCalled();
        });

        it('supports paged mode and returns pagination metadata', async () => {
            prismaMock.deviceCatalog.findMany.mockResolvedValueOnce([makeDevice()]);
            prismaMock.deviceCatalog.count.mockResolvedValueOnce(1);
            const result = await service.findAll({ paged: true, page: 1, limit: 50 });
            expect(result).toEqual({ items: [makeDevice()], total: 1, page: 1, pages: 1 });
        });

        it('caps paged limit at 200', async () => {
            prismaMock.deviceCatalog.findMany.mockResolvedValueOnce([]);
            prismaMock.deviceCatalog.count.mockResolvedValueOnce(0);
            await service.findAll({ paged: true, limit: 500 });
            const call = prismaMock.deviceCatalog.findMany.mock.calls[0][0];
            expect(call.take).toBe(200);
        });

        it('augments with tradeInMode "auto" when a scraped price exists', async () => {
            prismaMock.deviceCatalog.findMany.mockResolvedValueOnce([makeDevice()]);
            prismaMock.scrapedPrice.findFirst.mockResolvedValueOnce({ id: 'sp-1' });
            const result = await service.findAll({ forTradeIn: true }) as any[];
            expect(result[0].tradeInMode).toBe('auto');
        });

        it('augments with tradeInMode "manual_price" when no scraped price but manualMarketPrice set', async () => {
            prismaMock.deviceCatalog.findMany.mockResolvedValueOnce([makeDevice({ manualMarketPrice: 100 })]);
            prismaMock.scrapedPrice.findFirst.mockResolvedValueOnce(null);
            const result = await service.findAll({ forTradeIn: true }) as any[];
            expect(result[0].tradeInMode).toBe('manual_price');
        });

        it('augments with tradeInMode "unpriced" when neither scraped nor manual price exists', async () => {
            prismaMock.deviceCatalog.findMany.mockResolvedValueOnce([makeDevice({ manualMarketPrice: null })]);
            prismaMock.scrapedPrice.findFirst.mockResolvedValueOnce(null);
            const result = await service.findAll({ forTradeIn: true }) as any[];
            expect(result[0].tradeInMode).toBe('unpriced');
        });

        it('manualMarketPrice overrides an existing scraped price — "manual_price" wins, not "auto"', async () => {
            prismaMock.deviceCatalog.findMany.mockResolvedValueOnce([makeDevice({ manualMarketPrice: 100 })]);
            prismaMock.scrapedPrice.findFirst.mockResolvedValueOnce({ id: 'sp-1' });
            const result = await service.findAll({ forTradeIn: true }) as any[];
            expect(result[0].tradeInMode).toBe('manual_price');
            // The override short-circuits before even checking for a scraped price
            expect(prismaMock.scrapedPrice.findFirst).not.toHaveBeenCalled();
        });

        it('sets tradeInEnabled filter only when forTradeIn is true', async () => {
            prismaMock.deviceCatalog.findMany.mockResolvedValueOnce([]);
            await service.findAll({ forTradeIn: true });
            const call = prismaMock.deviceCatalog.findMany.mock.calls[0][0];
            expect(call.where.tradeInEnabled).toBe(true);
        });
    });

    describe('create', () => {
        it('creates a device with included relations', async () => {
            prismaMock.deviceCatalog.create.mockResolvedValueOnce(makeDevice());
            const dto = { brandCategoryId: 'bc-1', model: 'iPhone 13', storageOptions: ['128GB'] } as any;
            const result = await service.create(dto);
            expect(result).toEqual(makeDevice());
            expect(prismaMock.deviceCatalog.create).toHaveBeenCalledWith(
                expect.objectContaining({ data: dto }),
            );
        });
    });

    describe('update', () => {
        it('throws NotFoundException when device does not exist', async () => {
            prismaMock.deviceCatalog.findUnique.mockResolvedValueOnce(null);
            await expect(service.update('missing', {})).rejects.toThrow(NotFoundException);
        });

        it('updates an existing device', async () => {
            prismaMock.deviceCatalog.findUnique.mockResolvedValueOnce(makeDevice());
            prismaMock.deviceCatalog.update.mockResolvedValueOnce(makeDevice({ model: 'iPhone 13 Pro' }));
            const result = await service.update('device-1', { model: 'iPhone 13 Pro' });
            expect(result.model).toBe('iPhone 13 Pro');
        });
    });

    describe('findOne', () => {
        it('throws NotFoundException when device does not exist', async () => {
            prismaMock.deviceCatalog.findUnique.mockResolvedValueOnce(null);
            await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
        });

        it('returns the device when found', async () => {
            prismaMock.deviceCatalog.findUnique.mockResolvedValueOnce(makeDevice());
            const result = await service.findOne('device-1');
            expect(result).toEqual(makeDevice());
        });
    });

    describe('listForSearch', () => {
        it('flattens brand/category names', async () => {
            prismaMock.deviceCatalog.findMany.mockResolvedValueOnce([
                { model: 'iPhone 13', brandCategory: { brand: { name: 'Apple' }, category: { name: 'Phones' } } },
            ]);
            const result = await service.listForSearch();
            expect(result).toEqual([{ model: 'iPhone 13', brand: 'Apple', category: 'Phones' }]);
        });
    });

    describe('remove', () => {
        it('throws NotFoundException when device does not exist', async () => {
            prismaMock.deviceCatalog.findUnique.mockResolvedValueOnce(null);
            await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
        });

        it('removes device and cascades linked products/images', async () => {
            prismaMock.deviceCatalog.findUnique.mockResolvedValueOnce(makeDevice());
            prismaMock.product.findMany.mockResolvedValueOnce([
                { id: 'p-1', images: ['img-1.png'] },
            ]);
            const result = await service.remove('device-1');
            expect(prismaMock.orderItem.deleteMany).toHaveBeenCalledWith({ where: { productId: { in: ['p-1'] } } });
            expect(prismaMock.product.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p-1'] } } });
            expect(storageMock.deleteFiles).toHaveBeenCalledWith(['img-1.png']);
            expect(prismaMock.deviceCatalog.delete).toHaveBeenCalledWith({ where: { id: 'device-1' } });
            expect(result).toEqual({ message: 'Device removed' });
        });

        it('skips product cleanup when no linked products exist', async () => {
            prismaMock.deviceCatalog.findUnique.mockResolvedValueOnce(makeDevice());
            prismaMock.product.findMany.mockResolvedValueOnce([]);
            await service.remove('device-1');
            expect(prismaMock.orderItem.deleteMany).not.toHaveBeenCalled();
            expect(storageMock.deleteFiles).not.toHaveBeenCalled();
        });

        it('deletes all devices/products when id is "all"', async () => {
            prismaMock.product.findMany.mockResolvedValueOnce([
                { images: ['img-a.png', 'img-b.png'] },
            ]);
            const result = await service.remove('all');
            expect(prismaMock.orderItem.deleteMany).toHaveBeenCalledWith({});
            expect(prismaMock.product.deleteMany).toHaveBeenCalledWith({});
            expect(prismaMock.deviceCatalog.deleteMany).toHaveBeenCalledWith({});
            expect(storageMock.deleteFiles).toHaveBeenCalledWith(['img-a.png', 'img-b.png']);
            expect(result).toEqual({ message: 'All devices and products deleted' });
            expect(prismaMock.deviceCatalog.findUnique).not.toHaveBeenCalled();
        });
    });
});
