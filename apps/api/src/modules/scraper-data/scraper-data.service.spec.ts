import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ScraperDataService } from './scraper-data.service';
import { PrismaService } from '../database/prisma.service';

describe('ScraperDataService', () => {
    let service: ScraperDataService;
    let prismaMock: any;
    let fetchMock: jest.Mock<any>;

    beforeEach(async () => {
        prismaMock = {
            scrapedPrice: {
                findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]),
                count: jest.fn<() => Promise<number>>().mockResolvedValue(0),
            },
            scraperRun: {
                updateMany: jest.fn<() => Promise<any>>().mockResolvedValue({ count: 0 }),
                findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]),
            },
            deviceCatalog: { findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]) },
            product: { findMany: jest.fn<() => Promise<any>>().mockResolvedValue([]) },
            pricingConfig: {
                findUnique: jest.fn<() => Promise<any>>().mockResolvedValue(null),
                upsert: jest.fn<() => Promise<any>>().mockResolvedValue({}),
            },
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ScraperDataService,
                { provide: PrismaService, useValue: prismaMock },
            ],
        }).compile();

        service = module.get<ScraperDataService>(ScraperDataService);

        fetchMock = jest.fn();
        (global as any).fetch = fetchMock;
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete (global as any).fetch;
    });

    describe('listPrices', () => {
        it('builds a case-insensitive brand/model OR filter when search is provided', async () => {
            await service.listPrices(1, 50, 'iphone');
            const where = prismaMock.scrapedPrice.findMany.mock.calls[0][0].where;
            expect(where.OR).toEqual([
                { brand: { contains: 'iphone', mode: 'insensitive' } },
                { model: { contains: 'iphone', mode: 'insensitive' } },
            ]);
        });

        it('uses an empty filter when no search term given', async () => {
            await service.listPrices(1, 50);
            expect(prismaMock.scrapedPrice.findMany.mock.calls[0][0].where).toEqual({});
        });

        it('computes pagination fields', async () => {
            prismaMock.scrapedPrice.count.mockResolvedValueOnce(101);
            const result = await service.listPrices(2, 50);
            expect(result.pages).toBe(3);
            expect(result.page).toBe(2);
        });
    });

    describe('cleanupStuckRuns', () => {
        it('only targets runs older than 1h when force=false', async () => {
            await service.cleanupStuckRuns(false);
            const where = prismaMock.scraperRun.updateMany.mock.calls[0][0].where;
            expect(where.status).toBe('RUNNING');
            expect(where.startedAt.lt).toBeInstanceOf(Date);
        });

        it('targets all RUNNING runs when force=true, with a distinct error message', async () => {
            prismaMock.scraperRun.updateMany.mockResolvedValueOnce({ count: 2 });
            const result = await service.cleanupStuckRuns(true);
            const args = prismaMock.scraperRun.updateMany.mock.calls[0][0];
            expect(args.where).toEqual({ status: 'RUNNING' });
            expect(args.data.errorMessage).toContain('offline');
            expect(result).toEqual({ cleaned: 2 });
        });
    });

    describe('getRuns', () => {
        it('returns runs unchanged when none are RUNNING', async () => {
            prismaMock.scraperRun.findMany.mockResolvedValueOnce([{ id: 'r1', status: 'COMPLETED' }]);
            const result = await service.getRuns();
            expect(result).toEqual([{ id: 'r1', status: 'COMPLETED', currentProgress: null, totalVariants: null }]);
            expect(prismaMock.deviceCatalog.findMany).not.toHaveBeenCalled();
        });

        it('computes progress totals for the RUNNING run', async () => {
            const startedAt = new Date('2026-01-01T00:00:00Z');
            prismaMock.scraperRun.findMany.mockResolvedValueOnce([{ id: 'r1', status: 'RUNNING', startedAt }]);
            prismaMock.deviceCatalog.findMany.mockResolvedValueOnce([{ storageOptions: ['64GB', '128GB'] }, { storageOptions: [] }]);
            prismaMock.product.findMany.mockResolvedValueOnce([{ name: 'Watch', otherBrand: { name: 'Casio' } }]);
            prismaMock.scrapedPrice.count.mockResolvedValueOnce(5).mockResolvedValueOnce(1);

            const result = await service.getRuns();
            expect((result[0] as any).totalCatalog).toBe(3); // 2 + max(0,1)
            expect((result[0] as any).totalOthers).toBe(1);
            expect(result[0]!.totalVariants).toBe(4);
            expect(result[0]!.currentProgress).toBe(6);
        });
    });

    describe('triggerScraper', () => {
        it('returns ok:true when the scraper responds 2xx', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true, status: 202 });
            const result = await service.triggerScraper();
            expect(result.ok).toBe(true);
        });

        it('force-cleans stuck runs and returns ok:false when scraper responds with an error status', async () => {
            fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
            prismaMock.scraperRun.updateMany.mockResolvedValueOnce({ count: 1 });
            const result = await service.triggerScraper();
            expect(result.ok).toBe(false);
            expect(result.message).toContain('500');
            expect(prismaMock.scraperRun.updateMany).toHaveBeenCalled();
        });

        it('returns a timeout-specific message and cleans stuck runs when fetch times out', async () => {
            const timeoutErr = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
            fetchMock.mockRejectedValueOnce(timeoutErr);
            prismaMock.scraperRun.updateMany.mockResolvedValueOnce({ count: 1 });
            const result = await service.triggerScraper();
            expect(result.ok).toBe(false);
            expect(result.message).toContain('did not respond');
            expect(result.message).toContain('1 stuck run cleared');
        });

        it('returns an offline message when fetch fails for a non-timeout reason', async () => {
            fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
            prismaMock.scraperRun.updateMany.mockResolvedValueOnce({ count: 0 });
            const result = await service.triggerScraper();
            expect(result.ok).toBe(false);
            expect(result.message).toContain('offline');
            expect(result.message).not.toContain('stuck run');
        });
    });

    describe('lookupPrice', () => {
        it('returns marketPrice of the most recent matching row', async () => {
            prismaMock.scrapedPrice.findMany.mockResolvedValueOnce([{ marketPrice: 199 }]);
            const result = await service.lookupPrice('Apple', 'iPhone 13');
            expect(result).toBe(199);
        });

        it('returns null when no rows match', async () => {
            prismaMock.scrapedPrice.findMany.mockResolvedValueOnce([]);
            const result = await service.lookupPrice('Apple', 'iPhone 999');
            expect(result).toBeNull();
        });

        it('includes storage in the where filter when provided', async () => {
            await service.lookupPrice('Apple', 'iPhone 13', '128GB');
            const where = prismaMock.scrapedPrice.findMany.mock.calls[0][0].where;
            expect(where.storage).toEqual({ equals: '128GB', mode: 'insensitive' });
        });
    });

    describe('stopScraper', () => {
        it('returns ok:true when scraper accepts the stop signal', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true });
            const result = await service.stopScraper();
            expect(result.ok).toBe(true);
        });

        it('returns ok:false with status when scraper responds with an error', async () => {
            fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
            const result = await service.stopScraper();
            expect(result.ok).toBe(false);
            expect(result.message).toContain('503');
        });

        it('returns unreachable message when fetch throws', async () => {
            fetchMock.mockRejectedValueOnce(new Error('down'));
            const result = await service.stopScraper();
            expect(result.ok).toBe(false);
            expect(result.message).toContain('unreachable');
        });
    });

    describe('triggerDeviceScrape', () => {
        it('returns ok:true and includes brand/model in the message', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true });
            const result = await service.triggerDeviceScrape('Apple', 'iPhone 13');
            expect(result.ok).toBe(true);
            expect(result.message).toContain('Apple');
            expect(result.message).toContain('iPhone 13');
        });

        it('returns unreachable message on fetch failure', async () => {
            fetchMock.mockRejectedValueOnce(new Error('down'));
            const result = await service.triggerDeviceScrape('Apple', 'iPhone 13');
            expect(result.ok).toBe(false);
            expect(result.message).toContain('unreachable');
        });
    });

    describe('triggerDeviceScrapeSync', () => {
        it('returns prices on success', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ prices: [{ storage: '128GB', price: 100 }] }) });
            const result = await service.triggerDeviceScrapeSync('Apple', 'iPhone 13');
            expect(result.ok).toBe(true);
            expect(result.prices).toHaveLength(1);
        });

        it('returns a timeout-specific message when the sync call times out', async () => {
            const timeoutErr = Object.assign(new Error('timeout'), { name: 'TimeoutError' });
            fetchMock.mockRejectedValueOnce(timeoutErr);
            const result = await service.triggerDeviceScrapeSync('Apple', 'iPhone 13');
            expect(result.ok).toBe(false);
            expect(result.message).toContain('timed out');
        });
    });
});
