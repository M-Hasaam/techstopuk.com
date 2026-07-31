import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../../common/services/storage.service';
import { ProductPricingService } from '../product-pricing/product-pricing.service';

function makeProduct(overrides: Partial<any> = {}) {
    return {
        id: 'prod-1',
        slug: 'apple-iphone-13-a',
        catalogId: 'cat-1',
        otherBrandId: null,
        otherSubcategoryId: null,
        price: 100,
        images: ['img/one.jpg'],
        pricingStatus: 'auto',
        isActive: true,
        catalog: {
            model: 'iPhone 13',
            brandCategory: { brand: { name: 'Apple' }, category: { name: 'Phones' } },
        },
        otherBrand: null,
        otherSubcategory: null,
        ...overrides,
    };
}

describe('ProductsService', () => {
    let service: ProductsService;
    let prismaMock: any;
    let storageMock: any;
    let productPricingMock: any;

    beforeEach(async () => {
        prismaMock = {
            deviceCatalog: {
                findUnique: jest.fn<() => Promise<any>>(),
                update: jest.fn<() => Promise<any>>(),
            },
            product: {
                findUnique: jest.fn<() => Promise<any>>(),
                findUniqueOrThrow: jest.fn<() => Promise<any>>(),
                findFirst: jest.fn<() => Promise<any>>(),
                findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]),
                count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
                create: jest.fn<() => Promise<any>>(),
                update: jest.fn<() => Promise<any>>(),
                delete: jest.fn<() => Promise<any>>(),
                deleteMany: jest.fn<() => Promise<any>>(),
            },
            otherBrand: { findUnique: jest.fn<() => Promise<any>>() },
            otherSubcategory: {
                findUnique: jest.fn<() => Promise<any>>(),
                findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]),
            },
            brandCategory: { findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]) },
            pricingConfig: { findUnique: jest.fn<() => Promise<any>>().mockResolvedValue(null) },
            orderItem: { deleteMany: jest.fn<() => Promise<any>>() },
        };
        storageMock = {
            resolveImageUrl: jest.fn<(k: string) => Promise<string>>().mockImplementation((k: any) => Promise.resolve(`https://cdn/${k}`)),
            deleteFiles: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        };
        productPricingMock = {
            priceProduct: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
            getTradeInFormulaConfig: jest.fn<() => Promise<any>>().mockResolvedValue({ tradeInRatio: 0.5, tradeInMargin: 0 }),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProductsService,
                { provide: PrismaService, useValue: prismaMock },
                { provide: StorageService, useValue: storageMock },
                { provide: ProductPricingService, useValue: productPricingMock },
            ],
        }).compile();

        service = module.get<ProductsService>(ProductsService);
    });

    describe('create', () => {
        it('throws BadRequestException when neither catalogId nor otherBrand/subcategory provided', async () => {
            await expect(service.create({} as any)).rejects.toThrow(BadRequestException);
        });

        it('throws BadRequestException when both catalogId and otherBrand/subcategory provided', async () => {
            await expect(
                service.create({ catalogId: 'c1', otherBrandId: 'b1', otherSubcategoryId: 's1' } as any),
            ).rejects.toThrow(BadRequestException);
        });

        it('throws NotFoundException when catalog entry not found (main product)', async () => {
            prismaMock.deviceCatalog.findUnique.mockResolvedValueOnce(null);
            await expect(service.create({ catalogId: 'missing', condition: 'A' } as any)).rejects.toThrow(NotFoundException);
        });

        it('creates a main product, auto-prices it, and presigns images', async () => {
            prismaMock.deviceCatalog.findUnique.mockResolvedValueOnce({
                model: 'iPhone 13',
                storageOptions: ['128GB'],
                brandCategory: { brand: { name: 'Apple' } },
            });
            prismaMock.product.findUnique.mockResolvedValueOnce(null); // slug uniqueness check
            const created = makeProduct({ catalogId: 'cat-1' });
            prismaMock.product.create.mockResolvedValueOnce(created);

            const result = await service.create({ catalogId: 'cat-1', condition: 'A', images: ['a.jpg'] } as any);

            expect(prismaMock.product.create).toHaveBeenCalled();
            expect(productPricingMock.priceProduct).toHaveBeenCalledWith(created.id);
            expect(prismaMock.product.update).not.toHaveBeenCalled();
            expect(result.brand).toBe('Apple');
            expect(result.model).toBe('iPhone 13');
        });

        it('sets pricingStatus to no_data for other (non-catalog) products instead of auto-pricing', async () => {
            prismaMock.otherBrand.findUnique.mockResolvedValueOnce({ id: 'ob1', name: 'Anker' });
            prismaMock.otherSubcategory.findUnique.mockResolvedValueOnce({ id: 'os1', name: 'Cables' });
            prismaMock.product.findUnique.mockResolvedValueOnce(null);
            const created = makeProduct({ catalogId: null, catalog: null, otherBrand: { name: 'Anker' }, otherSubcategory: { name: 'Cables' } });
            prismaMock.product.create.mockResolvedValueOnce(created);

            await service.create({ otherBrandId: 'ob1', otherSubcategoryId: 'os1', name: 'Cable', condition: 'A' } as any);

            expect(productPricingMock.priceProduct).not.toHaveBeenCalled();
            expect(prismaMock.product.update).toHaveBeenCalledWith({
                where: { id: created.id },
                data: { pricingStatus: 'no_data' },
            });
        });

        it('throws NotFoundException when otherBrand does not exist', async () => {
            prismaMock.otherBrand.findUnique.mockResolvedValueOnce(null);
            await expect(
                service.create({ otherBrandId: 'missing', otherSubcategoryId: 'os1', name: 'x', condition: 'A' } as any),
            ).rejects.toThrow(NotFoundException);
        });

        it('throws NotFoundException when otherSubcategory does not exist', async () => {
            prismaMock.otherBrand.findUnique.mockResolvedValueOnce({ id: 'ob1', name: 'Anker' });
            prismaMock.otherSubcategory.findUnique.mockResolvedValueOnce(null);
            await expect(
                service.create({ otherBrandId: 'ob1', otherSubcategoryId: 'missing', name: 'x', condition: 'A' } as any),
            ).rejects.toThrow(NotFoundException);
        });
    });

    describe('findBySlug', () => {
        it('throws NotFoundException when product not found', async () => {
            prismaMock.product.findUnique.mockResolvedValueOnce(null);
            await expect(service.findBySlug('missing')).rejects.toThrow(NotFoundException);
        });

        it('returns the flattened product when found', async () => {
            prismaMock.product.findUnique.mockResolvedValueOnce(makeProduct());
            const result = await service.findBySlug('apple-iphone-13-a');
            expect(result.brand).toBe('Apple');
            expect(result.category).toBe('Phones');
        });
    });

    describe('findById', () => {
        it('throws NotFoundException when product not found', async () => {
            prismaMock.product.findUnique.mockResolvedValueOnce(null);
            await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
        });

        it('includes rawImages alongside the flattened result', async () => {
            prismaMock.product.findUnique.mockResolvedValueOnce(makeProduct({ images: ['a.jpg', 'b.jpg'] }));
            const result = await service.findById('prod-1');
            expect(result.rawImages).toEqual(['a.jpg', 'b.jpg']);
        });
    });

    describe('update', () => {
        it('throws BadRequestException when enabling a product that fails the activation gate', async () => {
            prismaMock.product.findUniqueOrThrow.mockResolvedValueOnce(makeProduct());
            prismaMock.product.findUnique.mockResolvedValueOnce({ price: 0, images: [], pricingStatus: 'no_data' });
            await expect(service.update('prod-1', { isActive: true } as any)).rejects.toThrow(BadRequestException);
        });

        it('allows enabling a product that meets the activation gate', async () => {
            prismaMock.product.findUniqueOrThrow.mockResolvedValueOnce(makeProduct());
            prismaMock.product.findUnique
                .mockResolvedValueOnce({ price: 50, images: ['a.jpg'], pricingStatus: 'auto' })
                .mockResolvedValueOnce(makeProduct());
            await service.update('prod-1', { isActive: true } as any);
            expect(prismaMock.product.update).toHaveBeenCalled();
        });

        it('marks pricingStatus manual when admin sets a positive price', async () => {
            prismaMock.product.findUniqueOrThrow.mockResolvedValueOnce(makeProduct());
            prismaMock.product.findUnique.mockResolvedValueOnce(makeProduct());
            await service.update('prod-1', { price: 250 } as any);
            const updateCall = prismaMock.product.update.mock.calls[0][0];
            expect(updateCall.data.pricingStatus).toBe('manual');
        });

        it('revalidates isActive when isActive is not explicitly set in the dto', async () => {
            prismaMock.product.findUniqueOrThrow.mockResolvedValueOnce(makeProduct());
            // second findUnique call is inside revalidateActive
            prismaMock.product.findUnique
                .mockResolvedValueOnce({ price: 100, images: ['a.jpg'], pricingStatus: 'auto' })
                .mockResolvedValueOnce(makeProduct());
            await service.update('prod-1', { name: 'New name' } as any);
            const calls = prismaMock.product.update.mock.calls;
            const revalidateCall = calls.find((c: any) => 'isActive' in (c[0].data ?? {}));
            expect(revalidateCall).toBeTruthy();
            expect(revalidateCall[0].data.isActive).toBe(true);
        });
    });

    describe('remove', () => {
        it('deletes all products, order items, and images when id is "all"', async () => {
            prismaMock.product.findMany.mockResolvedValueOnce([{ images: ['a.jpg'] }, { images: ['b.jpg'] }]);
            const result = await service.remove('all');
            expect(prismaMock.orderItem.deleteMany).toHaveBeenCalled();
            expect(prismaMock.product.deleteMany).toHaveBeenCalled();
            expect(storageMock.deleteFiles).toHaveBeenCalledWith(['a.jpg', 'b.jpg']);
            expect(result.message).toBe('All products deleted');
        });

        it('deletes a single product and its images', async () => {
            prismaMock.product.findUniqueOrThrow.mockResolvedValueOnce(makeProduct({ images: ['x.jpg'] }));
            const result = await service.remove('prod-1');
            expect(prismaMock.product.delete).toHaveBeenCalledWith({ where: { id: 'prod-1' } });
            expect(storageMock.deleteFiles).toHaveBeenCalledWith(['x.jpg']);
            expect(result.message).toBe('Product deleted');
        });
    });

    describe('findAll', () => {
        it('applies isActive+price filter by default (includeInactive not set)', async () => {
            await service.findAll({});
            const where = prismaMock.product.findMany.mock.calls[0][0].where;
            expect(where.isActive).toBe(true);
            expect(where.price).toEqual({ gt: 0 });
        });

        it('caps limit at 200', async () => {
            await service.findAll({ limit: 5000 });
            const args = prismaMock.product.findMany.mock.calls[0][0];
            expect(args.take).toBe(200);
        });
    });

    describe('getAdminCategories / getOthersCategories', () => {
        it('maps brand categories to category names', async () => {
            prismaMock.brandCategory.findMany.mockResolvedValueOnce([{ category: { name: 'Phones' } }]);
            const result = await service.getAdminCategories();
            expect(result).toEqual(['Phones']);
        });

        it('maps other subcategories to names', async () => {
            prismaMock.otherSubcategory.findMany.mockResolvedValueOnce([{ name: 'Cables' }]);
            const result = await service.getOthersCategories();
            expect(result).toEqual(['Cables']);
        });
    });
});
