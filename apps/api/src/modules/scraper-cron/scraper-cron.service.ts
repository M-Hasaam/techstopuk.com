import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService }         from '../database/prisma.service';
import { ProductPricingService } from '../product-pricing/product-pricing.service';

const CONFIG_KEY = 'scraper_schedule_hours';
const AUTO_PRICE_CONFIG_KEY = 'auto_price_after_manual_run';
const DEFAULT_SCHEDULE_HOURS = 168; // Default to 1 week (168 hours)

@Injectable()
export class ScraperCronService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ScraperCronService.name);
    private currentHours = DEFAULT_SCHEDULE_HOURS;
    private checkTimer: ReturnType<typeof setInterval> | null = null;

    constructor(
        private readonly prisma:         PrismaService,
        private readonly productPricing: ProductPricingService,
    ) {}

    async onModuleInit() {
        const row = await this.prisma.pricingConfig
            .findUnique({ where: { key: CONFIG_KEY } })
            .catch(() => null);
        this.currentHours = row?.value ?? DEFAULT_SCHEDULE_HOURS;
        this.startPeriodicChecker();
        this.logger.log(
            this.currentHours === 0
                ? 'Auto-scraper: disabled'
                : `Auto-scraper: active (every ${this.currentHours}h)`,
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
        this.startPeriodicChecker();
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

        this.logger.log('Scraper run finished — auto-pricing catalog (toggle enabled)…');
        this.productPricing.startPriceCatalog();
    }

    // ── internals ─────────────────────────────────────────────────────────────

    private startPeriodicChecker() {
        this.stopInterval();
        if (this.currentHours <= 0) return;

        // Check every 5 minutes whether a scheduled run is due based on database history
        const CHECK_INTERVAL_MS = 5 * 60 * 1000;
        this.checkTimer = setInterval(() => {
            this.checkAndTriggerIfNeeded().catch(err =>
                this.logger.error(`Error during scheduled scraper check: ${err?.message}`),
            );
        }, CHECK_INTERVAL_MS);
        this.logger.log(`Periodic checker started: polling DB every 5m for ${this.currentHours}h schedule`);
    }

    public async checkAndTriggerIfNeeded(): Promise<void> {
        if (this.currentHours <= 0) return;

        // 1. Guard against overlapping runs: Do not trigger if ANY run is currently RUNNING
        const activeRun = await this.prisma.scraperRun.findFirst({
            where: { status: 'RUNNING' },
        });
        if (activeRun) {
            this.logger.debug(`Scheduled scraper check: Run #${activeRun.id} is currently RUNNING. Skipping.`);
            return;
        }

        // 2. Guard against early triggers: Verify elapsed time since the latest run started
        const latestRun = await this.prisma.scraperRun.findFirst({
            orderBy: { startedAt: 'desc' },
        });

        if (latestRun) {
            const elapsedMs = Date.now() - new Date(latestRun.startedAt).getTime();
            const requiredMs = this.currentHours * 60 * 60 * 1000;
            if (elapsedMs < requiredMs) {
                return;
            }
        }

        // 3. Due and no active run -> Trigger auto-scraper!
        this.logger.log(`Auto-scraper scheduled run due (schedule: every ${this.currentHours}h). Triggering...`);
        const url = process.env.SCRAPER_URL || 'http://localhost:3003';
        try {
            await fetch(`${url}/scraper/run`, { method: 'POST' });
            this.logger.log('Auto-scraper triggered successfully.');

            // Wait 30s for scraper to start writing data, then auto-price if enabled
            await new Promise(r => setTimeout(r, 30_000));
            this.watchAndAutoPrice().catch(err =>
                this.logger.error(`Auto-price watcher failed after scheduled run: ${err?.message}`),
            );
        } catch (err: any) {
            this.logger.error(`Auto-scraper scheduled run failed to trigger: ${err?.message}`);
        }
    }

    private stopInterval() {
        if (this.checkTimer !== null) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    }
}
