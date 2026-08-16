import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ScraperCronService } from './scraper-cron.service';
import { PrismaService } from '../database/prisma.service';
import { ProductPricingService } from '../product-pricing/product-pricing.service';

describe('ScraperCronService', () => {
    let service: ScraperCronService;
    let prismaMock: any;
    let productPricingMock: any;
    let fetchMock: jest.Mock<any>;
    let setIntervalSpy: jest.SpiedFunction<typeof global.setInterval>;
    let clearIntervalSpy: jest.SpiedFunction<typeof global.clearInterval>;

    beforeEach(async () => {
        jest.useFakeTimers();
        prismaMock = {
            pricingConfig: {
                findUnique: jest.fn<() => Promise<any>>().mockResolvedValue(null),
                upsert: jest.fn<() => Promise<any>>().mockResolvedValue({}),
            },
            scraperRun: {
                findFirst: jest.fn<() => Promise<any>>().mockResolvedValue(null),
                findUnique: jest.fn<() => Promise<any>>().mockResolvedValue(null),
            },
        };
        productPricingMock = {
            runPriceCatalog: jest.fn<() => Promise<any>>().mockResolvedValue(undefined),
            getJobStatus: jest.fn().mockReturnValue({ result: { applied: 1, flagged: 0 } }),
        };

        fetchMock = jest.fn();
        (global as any).fetch = fetchMock;

        setIntervalSpy = jest.spyOn(global, 'setInterval');
        clearIntervalSpy = jest.spyOn(global, 'clearInterval');

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ScraperCronService,
                { provide: PrismaService, useValue: prismaMock },
                { provide: ProductPricingService, useValue: productPricingMock },
            ],
        }).compile();

        service = module.get<ScraperCronService>(ScraperCronService);
    });

    afterEach(() => {
        service.onModuleDestroy();
        jest.useRealTimers();
        jest.restoreAllMocks();
        delete (global as any).fetch;
    });

    describe('onModuleInit', () => {
        it('defaults to 168 hours (1 week) and starts a periodic checker interval when there is no saved config row', async () => {
            await service.onModuleInit();
            expect(service.getSchedule()).toEqual({ hours: 168 });
            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
        });

        it('uses the saved hours value from the DB', async () => {
            prismaMock.pricingConfig.findUnique.mockResolvedValueOnce({ value: 6 });
            await service.onModuleInit();
            expect(service.getSchedule()).toEqual({ hours: 6 });
            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
        });

        it('does not start an interval when the saved schedule is 0 (disabled)', async () => {
            prismaMock.pricingConfig.findUnique.mockResolvedValueOnce({ value: 0 });
            await service.onModuleInit();
            expect(service.getSchedule()).toEqual({ hours: 0 });
            expect(setIntervalSpy).not.toHaveBeenCalled();
        });

        it('falls back to default hours (168) when the DB read fails', async () => {
            prismaMock.pricingConfig.findUnique.mockRejectedValueOnce(new Error('db down'));
            await service.onModuleInit();
            expect(service.getSchedule()).toEqual({ hours: 168 });
        });
    });

    describe('setSchedule', () => {
        it('throws for a negative value', async () => {
            await expect(service.setSchedule(-1)).rejects.toThrow('Hours must be a non-negative integer.');
        });

        it('throws for a NaN value', async () => {
            await expect(service.setSchedule(NaN)).rejects.toThrow('Hours must be a non-negative integer.');
        });

        it('floors fractional hours and persists via upsert', async () => {
            const result = await service.setSchedule(2.9);
            expect(result).toEqual({ hours: 2 });
            expect(prismaMock.pricingConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({
                where: { key: 'scraper_schedule_hours' },
                update: expect.objectContaining({ value: 2 }),
            }));
        });

        it('starts a new periodic checker when set to a positive value', async () => {
            await service.setSchedule(3);
            expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
        });

        it('stops any existing interval when set to 0', async () => {
            await service.setSchedule(3);
            await service.setSchedule(0);
            expect(clearIntervalSpy).toHaveBeenCalled();
            expect(service.getSchedule()).toEqual({ hours: 0 });
        });
    });

    describe('checkAndTriggerIfNeeded (active run & elapsed time guards)', () => {
        it('skips triggering if another scraper run is currently RUNNING', async () => {
            await service.setSchedule(168);
            prismaMock.scraperRun.findFirst.mockResolvedValueOnce({ id: 101, status: 'RUNNING' });

            await service.checkAndTriggerIfNeeded();
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('skips triggering if less than scheduled interval has elapsed since last run', async () => {
            await service.setSchedule(168); // 1 week schedule
            prismaMock.scraperRun.findFirst
                .mockResolvedValueOnce(null) // no active RUNNING run
                .mockResolvedValueOnce({ id: 99, startedAt: new Date(Date.now() - 3 * 3600 * 1000) }); // run started 3 hours ago

            await service.checkAndTriggerIfNeeded();
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('triggers scraper when no active run exists and elapsed time exceeds schedule', async () => {
            fetchMock.mockResolvedValueOnce({ ok: true });
            await service.setSchedule(168); // 1 week schedule
            prismaMock.scraperRun.findFirst
                .mockResolvedValueOnce(null) // no active RUNNING run
                .mockResolvedValueOnce({ id: 99, startedAt: new Date(Date.now() - 170 * 3600 * 1000) }); // started 170 hours ago

            const triggerPromise = service.checkAndTriggerIfNeeded();
            await jest.advanceTimersByTimeAsync(30_000);
            await triggerPromise;

            expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/scraper/run'), { method: 'POST' });
        });
    });
});
