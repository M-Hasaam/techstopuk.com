import { Controller, Post, Get, Query, HttpCode, HttpStatus, ConflictException } from '@nestjs/common';
import { ScraperService } from './scraper.service.js';

@Controller('scraper')
export class ScraperController {
    constructor(private readonly scraperService: ScraperService) {}

    @Post('run')
    @HttpCode(HttpStatus.ACCEPTED)
    async runScraper(@Query('sync') sync?: string, @Query('limit') limit?: string): Promise<any> {
        const isSync = sync === 'true';
        const limitNum = limit ? Number(limit) : undefined;

        if (isSync) {
            try {
                const results = await this.scraperService.runScraper(limitNum);
                return { message: 'Scraper finished (synchronous).', results };
            } catch (err: any) {
                if (err?.message === 'A scraper run is already in progress.') {
                    throw new ConflictException(err.message);
                }
                throw err;
            }
        }

        if (this.scraperService.isBusy()) {
            throw new ConflictException('A scraper run is already in progress.');
        }

        this.scraperService.runScraper(limitNum).catch(err => {
            console.error('Background scraper failed:', err);
        });
        return { message: 'Scraper started in the background.' };
    }

    @Get('prices')
    listPrices(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
    ) {
        return this.scraperService.listPrices(
            page ? Number(page) : 1,
            limit ? Number(limit) : 50,
            search,
        );
    }

    @Get('device')
    getDevicePrices(@Query('brand') brand: string, @Query('model') model: string) {
        return this.scraperService.getDevicePrices(brand ?? '', model ?? '');
    }

    @Post('device')
    async scrapeDevice(
        @Query('brand') brand: string,
        @Query('model') model: string,
        @Query('sync') sync?: string,
    ) {
        const b = brand ?? '';
        const m = model ?? '';
        if (sync === 'true') {
            // Synchronous: await scrape and return fresh prices immediately
            await this.scraperService.scrapeDevice(b, m);
            const prices = await this.scraperService.getDevicePrices(b, m);
            return { ok: true, prices };
        }
        this.scraperService.scrapeDevice(b, m).catch(err => {
            console.error('Background device scrape failed:', err);
        });
        return { ok: false, message: `Scraping ${b} ${m} in the background.` };
    }

    @Post('stop')
    @HttpCode(HttpStatus.OK)
    stopScraper() {
        return this.scraperService.stop();
    }

    @Get('stats')
    getStats() {
        return this.scraperService.getStats();
    }

}
