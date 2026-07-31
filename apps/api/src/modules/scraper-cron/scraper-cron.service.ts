import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService }         from '../database/prisma.service';
import { ProductPricingService } from '../product-pricing/product-pricing.service';

const CONFIG_KEY = 'scraper_schedule_hours';
const AUTO_PRICE_CONFIG_KEY = 'auto_price_after_manual_run';

@Injectable()
export class ScraperCronService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ScraperCronService.name);
    private currentHours = 1;
    private intervalId: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly prisma:         PrismaService,
        private readonly productPricing: ProductPricingService,
    ) {}

    async onModuleInit() {
        const row = await this.prisma.pricingConfig
            .findUnique({ where: { key: CONFIG_KEY } })
            .catch(() => null);
        this.currentHours = row?.value ?? 1;
        if (this.currentHours > 0) this.startInterval(this.currentHours);
        this.logger.log(
            this.currentHours === 0
                ? 'Auto-scraper: disabled'
                : `Auto-scraper: every ${this.currentHours}h`,
        );
    }

    onModuleDestroy() { this.stopInterval(); }

    getSchedule(): { hours: number } { return { hours: this.currentHours }; }

    async setSchedule(hours: number): Promise<{ hours: number }> {
        const h = Math.floor(Number(hours));
        if (isNaN(h) || h < 0) throw new Error('Hours must be a non-negative integer.');
        await this.prisma.pricingConfig.upsert({
            where:  { key: CONFIG_KEY },
            update: { value: h, label: 'Scraper auto-run interval (hours, 0 = off)' },
            create: { key: CONFIG_KEY, value: h, label: 'Scraper auto-run interval (hours, 0 = off)' },
        });
        this.currentHours = h;
        this.stopInterval();
        if (h > 0) this.startInterval(h);
        this.logger.log(h === 0 ? 'Auto-scraper disabled.' : `Auto-scraper rescheduled: every ${h}h`);
        return { hours: h };
    }

    async getAutoPriceAfterScrape(): Promise<{ enabled: boolean }> {
        const row = await this.prisma.pricingConfig
            .findUnique({ where: { key: AUTO_PRICE_CONFIG_KEY } })
            .catch(() => null);
        return { enabled: (row?.value ?? 0) === 1 };
    }

    async setAutoPriceAfterScrape(enabled: boolean): Promise<{ enabled: boolean }> {
        await this.prisma.pricingConfig.upsert({
            where:  { key: AUTO_PRICE_CONFIG_KEY },
            update: { value: enabled ? 1 : 0, label: 'Auto-price catalog after a manual scraper run completes' },
            create: { key: AUTO_PRICE_CONFIG_KEY, value: enabled ? 1 : 0, label: 'Auto-price catalog after a manual scraper run completes' },
        });
        this.logger.log(`Auto-price-after-manual-run ${enabled ? 'enabled' : 'disabled'}.`);
        return { enabled };
    }

    /** Fire-and-forget: called right after a manual "Run Now" is triggered. If the
     *  toggle is on, waits for that run to finish (polling ScraperRun), then auto-prices. */
    notifyManualRunTriggered(): void {
        this.watchAndAutoPrice().catch(err => this.logger.error(`Auto-price watcher failed: ${err?.message}`));
    }

    private async watchAndAutoPrice(): Promise<void> {
        const { enabled } = await this.getAutoPriceAfterScrape();
        if (!enabled) return;

        // Give the scraper a moment to create its RUNNING row before we look for it.
        await new Promise(r => setTimeout(r, 5_000));
        const run = await this.prisma.scraperRun.findFirst({
            where:   { status: 'RUNNING' },
            orderBy: { startedAt: 'desc' },
        });
        if (!run) return;

        const pollMs   = 15_000;
        const deadline = Date.now() + 4 * 60 * 60 * 1000; // 4h safety cap — large catalogs can run over an hour
        while (Date.now() < deadline) {
            await new Promise(r => setTimeout(r, pollMs));
            const current = await this.prisma.scraperRun.findUnique({ where: { id: run.id } });
            if (!current || current.status !== 'RUNNING') break;
        }

        this.logger.log('Manual scraper run finished — auto-pricing catalog (toggle enabled)…');
        this.productPricing.startPriceCatalog();
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private startInterval(hours: number) {
        const ms = hours * 60 * 60 * 1000;
        this.intervalId = setInterval(async () => {
            const url = process.env.SCRAPER_URL || 'http://localhost:3003';
            this.logger.log('Auto-scraper fired — triggering scraper service…');
            try {
                await fetch(`${url}/scraper/run`, { method: 'POST' });
                // Wait 30s for scraper to start writing data, then auto-price
                await new Promise(r => setTimeout(r, 30_000));
                this.logger.log('Triggering auto-pricing after scraper run…');
                await this.productPricing.runPriceCatalog();
                const status = this.productPricing.getJobStatus();
                this.logger.log(
                    `Auto-pricing complete: ${status.result?.applied ?? 0} applied, ${status.result?.flagged ?? 0} flagged`,
                );
            } catch (err: any) {
                this.logger.error(`Auto-scraper/pricing cycle failed: ${err?.message}`);
            }
        }, ms);
        this.logger.log(`Interval registered: every ${hours}h`);
    }

    private stopInterval() {
        if (this.intervalId !== null) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}
