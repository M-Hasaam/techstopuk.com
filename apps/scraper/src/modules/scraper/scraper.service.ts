import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ProxyPoolService, type ProxyConfig } from './proxy-pool.service';
import { chromium } from 'playwright';
import type { Browser, BrowserContext } from 'playwright';

// These are used inside page.evaluate() which runs in browser context — not Node.js globals
declare const navigator: any;
declare const globalThis: any;

interface CompetitorPrices {
    sellPrice: number | null;
    buyCashPrice?: number | null;
    buyExchangePrice?: number | null;
}

interface DevicePrices {
    cex: CompetitorPrices | null;
    backMarket: JinaResult;
    musicMagpie: JinaResult;
    envirofone: JinaResult;
}

type Reason = 'ok' | 'not-found' | 'timeout' | 'error' | 'rate-limit';
interface JinaResult { price: number | null; reason: Reason; }

// Chromium flags that cut CPU/GPU overhead for a headless, single-tab scraper —
// we never render or screenshot anything, so compositing/GPU work is pure waste.
const CHROMIUM_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--disable-extensions',
    '--mute-audio',
];

// We only need the JSON/text a page's own JS fetches — not what it looks like.
// Dropping images/fonts/media/stylesheets avoids the decode+layout+paint work
// that was the main source of sustained CPU load on the VPS.
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font', 'stylesheet']);

async function blockHeavyResources(context: BrowserContext): Promise<void> {
    await context.route('**/*', route => {
        if (BLOCKED_RESOURCE_TYPES.has(route.request().resourceType())) {
            return route.abort();
        }
        return route.continue();
    });
}

// How many items to scrape through one proxy/context before rotating to the next —
// only takes effect once SCRAPER_PROXIES is actually configured (see ProxyPoolService).
const PROXY_ROTATE_EVERY = Number(process.env.SCRAPER_PROXY_ROTATE_EVERY) || 25;

@Injectable()
export class ScraperService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ScraperService.name);
    private stopRequested = false;
    private isRunning = false;
    private runStartedAt: number | null = null;
    // Absolute safety net: if a run's in-memory lock is somehow still held this long
    // (e.g. a single Puppeteer page interaction hangs forever with no timeout of its
    // own), treat it as stale and self-clear rather than blocking every future run
    // indefinitely — confirmed in practice: isRunning stuck true with zero rows in
    // scraper_runs, surviving even a DB-side stuck-run cleanup, because that only
    // touches the DB and has no way to reach into this process's memory.
    private static readonly STALE_LOCK_HOURS = 3;

    constructor(
        private readonly prisma: PrismaService,
        private readonly proxyPool: ProxyPoolService,
    ) {}

    // Same config key/default the admin's "Stuck Run Threshold" setting (and apps/api's
    // manual stuck-run cleanup) already use — one admin-configurable value governs
    // "how long is too long" everywhere, instead of this service having its own
    // silently-inconsistent idea of it.
    private static readonly STUCK_THRESHOLD_CONFIG_KEY = 'scraper_stuck_threshold_hours';
    private static readonly DEFAULT_STUCK_THRESHOLD_HOURS = 3;

    private async getStuckThresholdHours(): Promise<number> {
        const row = await this.prisma.pricingConfig
            .findUnique({ where: { key: ScraperService.STUCK_THRESHOLD_CONFIG_KEY } })
            .catch(() => null);
        return row?.value ?? ScraperService.DEFAULT_STUCK_THRESHOLD_HOURS;
    }

    /** Opens a fresh, fully-configured browser context — with a proxy from the pool if one is set. */
    private async openContext(browser: Browser): Promise<{ context: BrowserContext; proxy: ProxyConfig | null }> {
        const proxy = this.proxyPool.next();
        const context = await browser.newContext({
            userAgent:  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport:   { width: 1366, height: 768 },
            locale:     'en-GB',
            timezoneId: 'Europe/London',
            extraHTTPHeaders: { 'Accept-Language': 'en-GB,en;q=0.9' },
            ...(proxy ? { proxy: { server: proxy.server, username: proxy.username, password: proxy.password } } : {}),
        });
        await context.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            globalThis.chrome = { runtime: {} };
        });
        await blockHeavyResources(context);
        if (proxy) this.logger.log(`Context using proxy ${this.proxyPool.redact(proxy.server)}`);
        return { context, proxy };
    }

    /** Closes the current context and opens a new one on the next proxy in the pool. */
    private async rotateContext(
        browser: Browser, context: BrowserContext, reason: string,
    ): Promise<{ context: BrowserContext; proxy: ProxyConfig | null }> {
        this.logger.log(`Rotating context/proxy (${reason})…`);
        await context.close();
        return this.openContext(browser);
    }

    /** Whether a scraper run (fresh or auto-resumed) is currently in progress. */
    isBusy(): boolean {
        if (this.isRunning && this.runStartedAt) {
            const hoursSinceStart = (Date.now() - this.runStartedAt) / (60 * 60 * 1000);
            if (hoursSinceStart > ScraperService.STALE_LOCK_HOURS) {
                this.logger.warn(
                    `isRunning has been held for ${hoursSinceStart.toFixed(1)}h — treating as a stale lock ` +
                    `from a hung run and clearing it so new runs aren't blocked forever.`,
                );
                this.isRunning = false;
                this.runStartedAt = null;
            }
        }
        return this.isRunning;
    }

    /** Signal the running scraper to stop after the current device finishes. */
    async stop(): Promise<{ stopped: boolean }> {
        if (this.stopRequested) return { stopped: false };
        this.stopRequested = true;
        this.logger.log('Stop requested — will halt after current device completes.');
        return { stopped: true };
    }

    // ─── Startup: resume any interrupted run ──────────────────────────────────
    async onApplicationBootstrap() {
        // Wait for DB connection to fully stabilise
        await this.delay(3000);

        let stuckRun: { id: string; startedAt: Date } | null;
        try {
            stuckRun = await this.prisma.scraperRun.findFirst({
                where: { status: 'RUNNING' },
                orderBy: { startedAt: 'desc' },
            });
        } catch (error) {
            this.logger.warn(
                `Database unavailable at startup — skipping interrupted run check. ${error instanceof Error ? error.message : ''}`,
            );
            return;
        }

        if (!stuckRun) {
            this.logger.log('Startup check: no interrupted runs found.');
            return;
        }

        try {
            // Which devices were already written to the DB in this run?
            const alreadyDone = await this.prisma.scrapedPrice.findMany({
                where: { scrapedAt: { gte: stuckRun.startedAt } },
                select: { deviceKey: true },
            });
            const doneKeys = new Set(alreadyDone.map(r => r.deviceKey));

            // Mark the old run as failed regardless of whether we resume
            await this.prisma.scraperRun.update({
                where: { id: stuckRun.id },
                data: {
                    status: 'FAILED',
                    finishedAt: new Date(),
                    errorMessage: doneKeys.size > 0
                        ? `Service restarted mid-run — ${doneKeys.size} devices were already scraped and will be skipped in the resumed run.`
                        : `Service restarted before any devices were scraped — not auto-resuming to avoid crash loop. Trigger manually.`,
                },
            });

            if (doneKeys.size === 0) {
                // Crashed before doing any work — auto-resuming would just crash again.
                // Leave it for the admin to trigger manually once the underlying issue is fixed.
                this.logger.warn(
                    `Startup: interrupted run ${stuckRun.id} had 0 devices scraped — skipping auto-resume to avoid crash loop.`,
                );
                return;
            }

            this.logger.warn(
                `Startup: found interrupted run ${stuckRun.id} from ${stuckRun.startedAt.toISOString()}. ` +
                `${doneKeys.size} devices already done — resuming the rest.`,
            );

            // Fire the resume in the background (non-blocking)
            this.runScraper(undefined, doneKeys).catch(err => {
                this.logger.error(`Auto-resume after crash failed: ${err?.message}`);
            });
        } catch (error) {
            this.logger.warn(
                `Failed to resume interrupted run — ${error instanceof Error ? error.message : error}`,
            );
        }
    }

    async runScraper(limit?: number, skipKeys?: Set<string>): Promise<Record<string, DevicePrices>> {
        // A resumed run (from onApplicationBootstrap) keeps executing this same loop in the
        // background — without this guard, a manually-triggered run overlaps it and both hammer
        // CeX/Envirofone concurrently, which is what causes a flood of Algolia timeouts.
        if (this.isRunning) {
            this.logger.warn('runScraper() called while a run is already in progress — ignoring.');
            throw new Error('A scraper run is already in progress.');
        }
        this.isRunning = true;
        this.runStartedAt = Date.now();
        try {
            return await this.runScraperImpl(limit, skipKeys);
        } finally {
            this.isRunning = false;
            this.runStartedAt = null;
        }
    }

    private async runScraperImpl(limit?: number, skipKeys?: Set<string>): Promise<Record<string, DevicePrices>> {
        const isResume = skipKeys && skipKeys.size > 0;
        this.logger.log(isResume
            ? `Resuming scraper — skipping ${skipKeys!.size} already-done devices…`
            : 'Starting competitor price scraper…',
        );

        // Mark any OTHER genuinely-stuck RUNNING runs as FAILED (but not if we're in a
        // resume, since we already handled the stuck run in onApplicationBootstrap).
        // This used to unconditionally fail *every* RUNNING row the instant a new run
        // started, with no age check at all — a full catalog run legitimately takes
        // 5-7+ hours, so any overlap at all (a manual "Run Now" while the scheduled run
        // was still going, a slightly-early scheduler tick, etc.) killed the older run
        // out from under itself: its own row got FAILED here mid-flight, then its
        // in-flight process finished normally minutes/hours later and overwrote status
        // back to COMPLETED — leaving a COMPLETED run that still shows this run's old
        // "timed out" error message, since finishing successfully never cleared it.
        // Only touch rows that have actually exceeded the admin-configured stuck
        // threshold (same config the manual "stuck run cleanup" in apps/api uses).
        if (!isResume) {
            const thresholdHours = await this.getStuckThresholdHours();
            const { count: stuckCount } = await this.prisma.scraperRun.updateMany({
                where: { status: 'RUNNING', startedAt: { lt: new Date(Date.now() - thresholdHours * 60 * 60 * 1000) } },
                data:  { status: 'FAILED', finishedAt: new Date(), errorMessage: 'Run timed out — marked failed automatically' },
            });
            if (stuckCount > 0) this.logger.warn(`Marked ${stuckCount} stuck run(s) as FAILED.`);
        }

        const run = await this.prisma.scraperRun.create({
            data: { status: 'RUNNING' },
        });

        const devices = await this.prisma.deviceCatalog.findMany({
            where:   { isActive: true },
            include: { brandCategory: { include: { brand: true } } },
        });
        this.logger.log(`Found ${devices.length} active devices in catalog.`);

        const searchItems: { brand: string; model: string; storage: string; ram: string; fullName: string; cexOnly?: boolean }[] = [];
        for (const dev of devices) {
            const brandName = dev.brandCategory.brand.name;
            const storageOpts = dev.storageOptions?.length ? dev.storageOptions : [''];
            // RAM materially changes resale value (mainly laptops) — scrape it as its own
            // dimension alongside storage, same way. Devices with no RAM attribute group
            // (phones, consoles, etc.) get ramOpts = [''], so nothing changes for them.
            const ramGroup = (dev.attributeOptions as { label: string; options: string[] }[] | null)?.find(g => g.label === 'RAM');
            const ramOpts = ramGroup?.options?.length ? ramGroup.options : [''];
            for (const storage of storageOpts) {
                for (const ram of ramOpts) {
                    const fullName = [brandName, dev.model, ram, storage].filter(Boolean).join(' ');
                    searchItems.push({
                        brand:   brandName,
                        model:   dev.model,
                        storage: storage as string,
                        ram:     ram as string,
                        fullName,
                    });
                }
            }
        }

        // Also scrape active "other" products (accessories, games, cables, etc.) — CeX only
        const otherProducts = await this.prisma.product.findMany({
            where:   { otherBrandId: { not: null }, isActive: true },
            include: { otherBrand: true },
            orderBy: { name: 'asc' },
        });
        const seenOthers = new Set<string>();
        for (const p of otherProducts) {
            const brandName = p.otherBrand!.name;
            const key = `${brandName}|||${p.name}`;
            if (seenOthers.has(key)) continue;
            seenOthers.add(key);
            searchItems.push({
                brand:    brandName,
                model:    p.name,
                storage:  '',
                ram:      '',
                fullName: `${brandName} ${p.name}`,
                cexOnly:  true,
            });
        }
        if (seenOthers.size > 0) this.logger.log(`Added ${seenOthers.size} other products to scrape queue.`);

        // Skip devices already completed in the interrupted run (resume support)
        const filteredItems = skipKeys && skipKeys.size > 0
            ? searchItems.filter(item => !skipKeys.has(item.fullName))
            : searchItems;

        const itemsToScrape = limit && limit > 0 ? filteredItems.slice(0, limit) : filteredItems;
        this.logger.log(`Scraping ${itemsToScrape.length} device variants${isResume ? ` (${skipKeys!.size} skipped — already done)` : ''}.`);

        const browser = await chromium.launch({
            headless: true,
            args: CHROMIUM_ARGS,
        });

        let { context, proxy: activeProxy } = await this.openContext(browser);

        const results: Record<string, DevicePrices> = {};
        const total   = itemsToScrape.length;
        const startMs = Date.now();

        const ts  = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const bar = (done: number) => {
            const pct  = Math.round((done / total) * 100);
            const fill = Math.round((done / total) * 20);
            return `[${'='.repeat(fill)}${'-'.repeat(20 - fill)}] ${String(pct).padStart(3)}%`;
        };
        const p = (v: number | null) => v ? `£${v}` : '--';
        const SEP = '-'.repeat(80);

        const othersCount = itemsToScrape.filter(i => i.cexOnly).length;
        console.log(`\n${SEP}`);
        console.log(`  SCRAPER RUN STARTED`);
        console.log(`  Devices : ${total - othersCount} catalog variants + ${othersCount} other products = ${total} total${isResume ? `  (resume — ${skipKeys!.size} skipped)` : ''}`);
        console.log(`  Started : ${ts()}`);
        console.log(`${SEP}\n`);

        this.stopRequested = false; // reset before each run

        try {
            for (const [i, item] of itemsToScrape.entries()) {
                // Admin requested stop — halt cleanly between devices
                if (this.stopRequested) {
                    this.logger.log(`Stop requested — halting after ${i} of ${total} devices.`);
                    await browser.close();
                    await this.prisma.scraperRun.update({
                        where: { id: run.id },
                        data:  { status: 'FAILED', finishedAt: new Date(), errorMessage: `Stopped manually by admin after ${i} of ${total} devices.` },
                    });
                    this.stopRequested = false;
                    return results;
                }

                const num = `[${String(i + 1).padStart(2, '0')}/${String(total).padStart(2, '0')}]`;

                let cex = await this.scrapeCeX(context, item.brand, item.model, item.storage, item.ram, !item.cexOnly);
                if (!cex && item.storage) {
                    await this.delay(500);
                    cex = await this.scrapeCeX(context, item.brand, item.model, '', item.ram, !item.cexOnly);
                }
                await this.delay(500);
                const ref = cex?.sellPrice ?? undefined;
                const SKIP: JinaResult = { price: null, reason: 'not-found' };
                const backMarket  = item.cexOnly ? SKIP : await this.scrapeBackMarket(context, item.fullName, item.storage, ref);
                await this.delay(500);
                const musicMagpie = item.cexOnly ? SKIP : await this.scrapeMusicMagpie(context, item.fullName, item.storage, ref);
                await this.delay(500);
                const envirofone  = item.cexOnly ? SKIP : await this.scrapeEnvirofone(item.brand, item.model, item.storage, ref);

                results[item.fullName] = { cex, backMarket, musicMagpie, envirofone };
                const marketPrice = cex?.sellPrice ?? backMarket.price ?? musicMagpie.price ?? envirofone.price ?? null;

                await this.prisma.scrapedPrice.upsert({
                    where:  { deviceKey: item.fullName },
                    create: {
                        deviceKey:        item.fullName,
                        brand:            item.brand,
                        model:            item.model,
                        storage:          item.storage,
                        ram:              item.ram,
                        cexSellPrice:     cex?.sellPrice        ?? null,
                        cexCashPrice:     cex?.buyCashPrice     ?? null,
                        cexExchangePrice: cex?.buyExchangePrice ?? null,
                        backMarketPrice:  backMarket.price,
                        musicMagpiePrice: musicMagpie.price,
                        envirofonePrice:  envirofone.price,
                        marketPrice,
                        scrapedAt:        new Date(),
                    },
                    update: {
                        cexSellPrice:     cex?.sellPrice        ?? null,
                        cexCashPrice:     cex?.buyCashPrice     ?? null,
                        cexExchangePrice: cex?.buyExchangePrice ?? null,
                        backMarketPrice:  backMarket.price,
                        musicMagpiePrice: musicMagpie.price,
                        envirofonePrice:  envirofone.price,
                        marketPrice,
                        scrapedAt:        new Date(),
                    },
                });

                // Show price OR reason why it's missing
                const fmt = (r: JinaResult) => r.price ? `£${r.price}`.padEnd(8) : `(${r.reason})`.padEnd(8);
                const best = marketPrice ? `Best: £${marketPrice}` : 'Best: none';
                console.log(`[${ts()}]  ${num}  ${bar(i + 1)}  ${item.fullName}`);
                console.log(`  ==> CeX: ${p(cex?.sellPrice ?? null).padEnd(8)}  BM: ${fmt(backMarket)}  MM: ${fmt(musicMagpie)}  EF: ${fmt(envirofone)}  ${best}`);
                console.log('');

                // Proxy rotation is a no-op unless SCRAPER_PROXIES is configured.
                if (this.proxyPool.enabled) {
                    if (envirofone.reason === 'rate-limit' && activeProxy) {
                        this.proxyPool.markBad(activeProxy);
                        ({ context, proxy: activeProxy } = await this.rotateContext(browser, context, 'rate-limited by Envirofone'));
                    } else if ((i + 1) % PROXY_ROTATE_EVERY === 0 && i < total - 1) {
                        ({ context, proxy: activeProxy } = await this.rotateContext(browser, context, `periodic after ${i + 1} items`));
                    }
                }

                if (i < total - 1) {
                    // Spread devices out further so the browser isn't kept busy
                    // back-to-back — trades run time for a lower average CPU load.
                    await this.delay(3000 + Math.random() * 2000);
                }
            }
        } catch (err: any) {
            await browser.close();
            await this.prisma.scraperRun.update({
                where: { id: run.id },
                data: { status: 'FAILED', finishedAt: new Date(), errorMessage: err?.message ?? 'Unknown error' },
            });
            console.error(`\n[${ts()}]  ERROR: Scraper run failed — ${err?.message}\n`);
            throw err;
        }

        await browser.close();

        const elapsed = Math.round((Date.now() - startMs) / 1000);
        const mins = Math.floor(elapsed / 60), secs = elapsed % 60;

        await this.prisma.scraperRun.update({
            where: { id: run.id },
            // errorMessage is explicitly cleared here — if this exact row was ever
            // touched by the stuck-run cleanup above (e.g. a run that legitimately
            // finishes right around the threshold boundary), a genuine successful
            // completion should never still be showing a stale "timed out" message.
            data: { status: 'COMPLETED', finishedAt: new Date(), totalScraped: total, errorMessage: null },
        });

        console.log(`${SEP}`);
        console.log(`  COMPLETED`);
        console.log(`  Devices : ${total}/${total} done`);
        console.log(`  Duration: ${mins}m ${secs}s`);
        console.log(`${SEP}\n`);
        return results;
    }

    // ─── CeX (Playwright + Algolia interception) ──────────────────────────────
    // CeX loads search results from Algolia (search.webuy.io). By intercepting
    // that network response we get clean JSON with all prices — no HTML parsing.
    private async scrapeCeX(
        context: BrowserContext, brand: string, model: string, storage: string, ram = '',
        isMainDevice = true,
    ): Promise<CompetitorPrices | null> {
        // CeX uses "Plus" not "+": "Galaxy S24+" → "Galaxy S24 Plus"
        // CeX (like Sony) has no listing called "Disc Edition" — only the no-drive
        // "Digital Edition" gets a qualifier; the base console is just "PlayStation 5".
        // Searching/matching "Disc Edition" literally only surfaces unrelated
        // aftermarket "Disc Edition Covers" accessories, never the actual console.
        const normModel = model
            .replace(/\+/g, 'Plus')
            .replace(/\bdisc edition\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();
        const query = [brand, normModel, ram, storage].filter(Boolean).join(' ');
        const page = await context.newPage();
        try {
            // Helper: navigate and capture the Algolia JSON response
            const fetchHits = async (q: string): Promise<any[]> => {
                const promise = page.waitForResponse(
                    r => r.url().includes('search.webuy.io') && r.status() === 200,
                    { timeout: 28_000 },
                );
                await page.goto(
                    `https://uk.webuy.com/search?stext=${encodeURIComponent(q)}`,
                    { waitUntil: 'domcontentloaded', timeout: 32_000 },
                );
                const json = await (await promise).json() as { results?: { hits?: any[] }[] };
                return json?.results?.[0]?.hits ?? [];
            };

            // CeX/Algolia intermittently just doesn't respond within the timeout — not
            // a "no results" case, so the simplified-query fallback below (which only
            // triggers on an empty hit array) never gets a chance to run. One retry
            // catches most of these transient stalls before we give up on the device.
            const fetchHitsWithRetry = async (q: string): Promise<any[]> => {
                try {
                    return await fetchHits(q);
                } catch (e: any) {
                    const isTimeout = e.name === 'TimeoutError' || e.message?.includes('Timeout');
                    if (!isTimeout) throw e;
                    await this.delay(1500);
                    return fetchHits(q);
                }
            };

            let hits = await fetchHitsWithRetry(query);

            // Retry with a simplified query when Algolia returns nothing.
            // Strips words CeX commonly omits: connectivity ("5G","4G"), "Edition", "Wireless".
            if (hits.length === 0) {
                const simplified = normModel
                    .replace(/\b5g\b|\b4g\b|\blte\b/gi, '')
                    .replace(/\bedition\b/gi, '')
                    .replace(/\bwireless\b/gi, '')
                    .replace(/\s+/g, ' ').trim();
                if (simplified !== normModel) {
                    hits = await fetchHits([brand, simplified, ram, storage].filter(Boolean).join(' '));
                }
            }

            if (hits.length === 0) return null;

            // ── Matching ───────────────────────────────────────────────────────
            // Use normModel (not the raw catalog model) so "Disc Edition" is already
            // stripped here too — otherwise "disc" would stay a required word and
            // reject the real console listing just like it rejected the search above.
            const modelL  = normModel.toLowerCase();
            const storageN = (storage ?? '').toLowerCase().replace(/\s+/g, '');
            const ramN     = (ram ?? '').toLowerCase().replace(/\s+/g, '');

            // Normalize model: drop a bare release year in parens e.g. "(2020)" — CeX
            // identifies MacBooks by Apple's internal model number, not release year, so
            // keeping "2020" as a required word would reject every real match. Strip
            // remaining parens, "+" → "plus", "11-inch"/"11 inch" → "11" (CeX box names
            // use bare `11"` — literal "inch" never appears), collapse spaces.
            const modelN = modelL
                .replace(/\(\d{4}\)/g, '')
                .replace(/\+/g, 'plus')
                .replace(/[()]/g, '')
                .replace(/(\d)-inch\b/gi, '$1')
                .replace(/\binch\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

            // Words CeX sometimes omits (treat as optional in matching)
            const OPTIONAL = new Set(['5g', '4g', 'lte', 'wireless', 'edition']);

            // Words that differentiate product tiers — reject a CeX result that
            // has one of these UNLESS our model also contains it. "digital" catches
            // PS5 Digital Edition — since "Disc Edition" is stripped to a bare
            // "PlayStation 5" above, without this a Digital Edition console (cheaper,
            // no disc drive) could tie/outscore the real disc-drive console it should match.
            const TIER_WORDS = new Set(['ultra', 'plus', 'max', 'mini', 'lite', 'fe', 'air', 'slim', 'pro', 'digital']);

            // Generic guard against matching an accessory *for* the device instead of the
            // device itself (the PS5 "Disc Edition Covers" incident, generalized) — a phone
            // case, tempered glass, charging cable etc. can otherwise pass the required-word
            // check just by having the brand/model in its title. Skipped for isMainDevice=false
            // (the "Other Products" catalog, e.g. "Xbox Wireless Controller"), since those
            // entries genuinely ARE accessories and would always false-positive here.
            const ACCESSORY_WORDS = new Set([
                'case', 'cover', 'skin', 'sleeve', 'pouch', 'bag',
                'protector', 'tempered',
                'dock', 'stand', 'mount', 'holder',
                'charger', 'charging', 'cable', 'adapter',
                'strap', 'faceplate', 'lens',
                'warranty', 'insurance', 'subscription', 'membership',
            ]);

            const modelWords    = modelN.split(/\s+/).filter(w => w.length > 1);
            const requiredWords = modelWords.filter(w => !OPTIONAL.has(w));
            const modelWordSet  = new Set(modelWords);

            const score = (h: any): number => {
                // CeX's own product classification is a far more reliable signal than
                // guessing "is this an accessory" from free text — it consistently buckets
                // cases/cables/covers/chargers/screen protectors under a category literally
                // named "... Accessories" for every product line, while real products (even
                // ones that are themselves controllers/headphones in our catalog) get their
                // own real category ("Xbox One Controllers", "Headphones & Earphones").
                // Applied unconditionally — nothing in our catalog is itself an "Accessory".
                const category = `${h.categoryFriendlyName ?? h.categoryName ?? ''}`.toLowerCase();
                if (/\baccessor/.test(category)) return -999;

                const raw   = (h.boxName ?? '').toLowerCase();
                const nameN = raw.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
                // Strip punctuation stuck to each token (CeX names read like "...Case, Black" —
                // without this, "case," never equals "case" and the whole-word checks below
                // silently never match anything that isn't followed by whitespace).
                const nameWords = new Set(nameN.split(/\s+/).map((w: string) => w.replace(/[^a-z0-9]/g, '')));

                // Every required word must appear somewhere in the CeX name
                if (!requiredWords.every(w => nameN.includes(w))) return -999;

                // Reject if CeX name has a tier-differentiating word we didn't search for
                // e.g. searching "Galaxy S21" must not match "Galaxy S21 Ultra"
                const unexpectedTier = [...TIER_WORDS].some(t => nameWords.has(t) && !modelWordSet.has(t));
                if (unexpectedTier) return -999;

                // Reject accessories-for-the-device when we're matching the device itself
                if (isMainDevice) {
                    const isAccessory = [...ACCESSORY_WORDS].some(w => nameWords.has(w) && !modelWordSet.has(w));
                    if (isAccessory) return -999;
                }

                const nameFlat = raw.replace(/\s+/g, '');
                // RAM is checked as a whole token, not a substring of nameFlat — "8gb" RAM
                // would otherwise falsely match inside "128gb" storage text (both use "GB").
                return (storageN && nameFlat.includes(storageN) ? 2 : 0)
                     + (ramN && nameWords.has(ramN) ? 2 : 0)
                     + (raw.includes('unlocked') ? 1 : 0);
            };

            const best = hits.reduce((a, b) => (score(b) > score(a) ? b : a), hits[0]);
            if (score(best) < 0) return null;

            const cash     = best.cashPriceCalculated     || best.cashBuyPrice     || null;
            const exchange = best.exchangePriceCalculated || best.exchangePrice    || null;

            return {
                sellPrice:        typeof best.sellPrice === 'number' && best.sellPrice > 0 ? best.sellPrice : null,
                buyCashPrice:     typeof cash           === 'number' && cash > 0           ? cash           : null,
                buyExchangePrice: typeof exchange       === 'number' && exchange > 0       ? exchange       : null,
            };
        } catch (e: any) {
            this.logger.error(`CeX error for "${query}": ${e.message}`);
            return null;
        } finally {
            await page.close();
        }
    }

    // ─── BackMarket ───────────────────────────────────────────────────────────────
    // Blocked by Cloudflare on both Jina.ai (403) and headless Playwright.
    // Kept as a stub so the call site compiles; returns 'blocked' immediately.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async scrapeBackMarket(_context: BrowserContext, _query: string, _storage: string, _cexPrice?: number): Promise<JinaResult> {
        return { price: null, reason: 'error' };
    }

    // ─── MusicMagpie ──────────────────────────────────────────────────────────────
    // Their prices are JS-rendered. Playwright navigates their search page but
    // the first £ price found is a "next day delivery £1.09" fee — not a product price.
    // Disabled until a reliable extraction strategy is found.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private async scrapeMusicMagpie(_context: BrowserContext, _query: string, _storage: string, _cexPrice?: number): Promise<JinaResult> {
        return { price: null, reason: 'not-found' };
    }

    // ─── Envirofone (Jina.ai) ─────────────────────────────────────────────────────
    // Envirofone product pages render server-side — Jina works fine.
    // URL pattern: /en-gb/buy/products/{model-slug}
    // e.g. "Apple iPhone 14 Pro Max" → iphone-14-pro-max
    private async scrapeEnvirofone(brand: string, model: string, storage: string, cexPrice?: number): Promise<JinaResult> {
        try {
            const slug = this.envirofoneSlug(brand, model);
            if (!slug) return { price: null, reason: 'not-found' };
            const url = `https://www.envirofone.com/en-gb/buy/products/${slug}`;
            const markdown = await this.fetchWithJina(url);
            if (markdown.includes('404') || markdown.includes('Page not found')) return { price: null, reason: 'not-found' };
            if (markdown.includes('429') || markdown.includes('Too Many Requests')) return { price: null, reason: 'rate-limit' };
            const price = this.extractPriceFromMarkdown(markdown, storage, cexPrice);
            return price ? { price, reason: 'ok' } : { price: null, reason: 'not-found' };
        } catch (e: any) {
            const reason: Reason = e.name === 'TimeoutError' || e.message?.includes('timeout') ? 'timeout' : 'error';
            this.logger.error(`Envirofone (${reason}) for "${brand} ${model}": ${e.message}`);
            return { price: null, reason };
        }
    }

    // Convert brand + model name to Envirofone URL slug
    // "Apple" + "iPhone 14 Pro Max" → "iphone-14-pro-max"
    // "Samsung" + "Galaxy S24 Ultra" → "samsung-galaxy-s24-ultra"
    private envirofoneSlug(brand: string, model: string): string | null {
        const full = `${brand} ${model}`.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-');

        // Apple iPhones: strip "apple-" prefix since Envirofone uses "iphone-14" not "apple-iphone-14"
        if (brand.toLowerCase() === 'apple' && model.toLowerCase().startsWith('iphone')) {
            return full.replace(/^apple-/, '');
        }
        // iPads: same pattern
        if (brand.toLowerCase() === 'apple' && model.toLowerCase().startsWith('ipad')) {
            return full.replace(/^apple-/, '');
        }
        // MacBooks: same
        if (brand.toLowerCase() === 'apple' && model.toLowerCase().startsWith('macbook')) {
            return full.replace(/^apple-/, '');
        }
        // Samsung, Google, Sony etc: keep full slug "samsung-galaxy-s24"
        return full;
    }

    // ─── Single-device scrape (for the "Re-scrape" button on catalog detail page) ─
    async scrapeDevice(brand: string, model: string): Promise<void> {
        this.logger.log(`----  Single scrape: ${brand} ${model}  ----`);

        const device = await this.prisma.deviceCatalog.findFirst({
            where: {
                brandCategory: { brand: { name: { equals: brand, mode: 'insensitive' } } },
                model:         { equals: model, mode: 'insensitive' },
            },
            include: { brandCategory: { include: { brand: true } } },
        });

        const storageOptions = device?.storageOptions?.length ? device.storageOptions as string[] : [''];
        const ramGroup = (device?.attributeOptions as { label: string; options: string[] }[] | null)?.find(g => g.label === 'RAM');
        const ramOptions = ramGroup?.options?.length ? ramGroup.options : [''];
        const browser = await chromium.launch({
            headless: true,
            args: CHROMIUM_ARGS,
        });
        const { context } = await this.openContext(browser);

        try {
            for (const storage of storageOptions) {
                for (const ram of ramOptions) {
                    const fullName = [brand, model, ram, storage].filter(Boolean).join(' ');
                    this.logger.log(`  → ${fullName}`);

                    let cex = await this.scrapeCeX(context, brand, model, storage, ram, !!device);
                    if (!cex && storage) {
                        await this.delay(500);
                        cex = await this.scrapeCeX(context, brand, model, '', ram, !!device);
                    }
                    await this.delay(500);
                    const ref2 = cex?.sellPrice ?? undefined;
                    const backMarket  = await this.scrapeBackMarket(context, fullName, storage, ref2);
                    await this.delay(500);
                    const musicMagpie = await this.scrapeMusicMagpie(context, fullName, storage, ref2);
                    await this.delay(500);
                    const envirofone  = await this.scrapeEnvirofone(brand, model, storage, ref2);

                    const marketPrice = cex?.sellPrice ?? backMarket.price ?? musicMagpie.price ?? envirofone.price ?? null;

                    await this.prisma.scrapedPrice.upsert({
                        where:  { deviceKey: fullName },
                        create: {
                            deviceKey: fullName, brand, model, storage, ram,
                            cexSellPrice:     cex?.sellPrice        ?? null,
                            cexCashPrice:     cex?.buyCashPrice     ?? null,
                            cexExchangePrice: cex?.buyExchangePrice ?? null,
                            backMarketPrice:  backMarket.price,
                            musicMagpiePrice: musicMagpie.price,
                            envirofonePrice:  envirofone.price,
                            marketPrice, scrapedAt: new Date(),
                        },
                        update: {
                            cexSellPrice:     cex?.sellPrice        ?? null,
                            cexCashPrice:     cex?.buyCashPrice     ?? null,
                            cexExchangePrice: cex?.buyExchangePrice ?? null,
                            backMarketPrice:  backMarket.price,
                            musicMagpiePrice: musicMagpie.price,
                            envirofonePrice:  envirofone.price,
                            marketPrice, scrapedAt: new Date(),
                        },
                    });

                    const fmtJ = (r: JinaResult) => r.price ? `£${r.price}` : `(${r.reason})`;
                    const fmtN = (v: number | null) => v ? `£${v}` : '--';
                    this.logger.log(`     CeX:${fmtN(cex?.sellPrice ?? null)}  BM:${fmtJ(backMarket)}  MM:${fmtJ(musicMagpie)}  EF:${fmtJ(envirofone)}  Best:${marketPrice ? `£${marketPrice}` : 'none'}`);
                }
            }
        } finally {
            await browser.close();
        }
    }

    // ─── Public helpers used by other services ────────────────────────────────

    async lookupPrice(brand: string, model: string, storage?: string, maxAgeDays = 7): Promise<number | null> {
        const deviceKey = [brand, model, storage].filter(Boolean).join(' ');
        const row = await this.prisma.scrapedPrice.findUnique({ where: { deviceKey } });
        if (!row || row.marketPrice === null) return null;

        const ageDays = (Date.now() - row.scrapedAt.getTime()) / 86_400_000;
        if (ageDays > maxAgeDays) {
            this.logger.log(`Stale scraped price for "${deviceKey}" (${Math.round(ageDays)}d) — falling back to AI`);
            return null;
        }

        this.logger.log(`Cache hit for "${deviceKey}": £${row.marketPrice} (${ageDays.toFixed(1)}d old)`);
        return row.marketPrice;
    }

    async listPrices(page = 1, limit = 50, search?: string) {
        const skip  = (page - 1) * limit;
        const where = search
            ? { OR: [{ brand: { contains: search, mode: 'insensitive' as const } }, { model: { contains: search, mode: 'insensitive' as const } }] }
            : {};
        const [items, total] = await Promise.all([
            this.prisma.scrapedPrice.findMany({ where, skip, take: limit, orderBy: { scrapedAt: 'desc' } }),
            this.prisma.scrapedPrice.count({ where }),
        ]);
        return { items, total, page, limit, pages: Math.ceil(total / limit) };
    }

    async getDevicePrices(brand: string, model: string) {
        return this.prisma.scrapedPrice.findMany({
            where: {
                brand: { equals: brand, mode: 'insensitive' },
                model: { equals: model, mode: 'insensitive' },
            },
            orderBy: { storage: 'asc' },
        });
    }

    async getStats() {
        const [total, withMarketPrice, withCex, withBM, withMM, withEF, latest] = await Promise.all([
            this.prisma.scrapedPrice.count(),
            this.prisma.scrapedPrice.count({ where: { marketPrice:      { not: null } } }),
            this.prisma.scrapedPrice.count({ where: { cexSellPrice:     { not: null } } }),
            this.prisma.scrapedPrice.count({ where: { backMarketPrice:  { not: null } } }),
            this.prisma.scrapedPrice.count({ where: { musicMagpiePrice: { not: null } } }),
            this.prisma.scrapedPrice.count({ where: { envirofonePrice:  { not: null } } }),
            this.prisma.scrapedPrice.findFirst({ orderBy: { scrapedAt: 'desc' }, select: { scrapedAt: true } }),
        ]);
        return { total, withMarketPrice, withCex, withBM, withMM, withEnvirofone: withEF, lastScrapedAt: latest?.scrapedAt ?? null };
    }

    private delay(ms: number): Promise<void> {
        return new Promise(r => setTimeout(r, ms));
    }

    // ─── Jina.ai Reader ───────────────────────────────────────────────────────────
    // Fetches a URL via r.jina.ai which renders the page server-side and returns
    // clean plain text — bypasses Cloudflare without needing a headless browser.
    private async fetchWithJina(targetUrl: string): Promise<string> {
        const jinaUrl = `https://r.jina.ai/${targetUrl}`;
        const headers: Record<string, string> = {
            'Accept': 'text/plain',
            'X-Timeout': '30',
        };
        const apiKey = process.env.JINA_API_KEY;
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        const res = await fetch(jinaUrl, { headers, signal: AbortSignal.timeout(35_000) });
        if (!res.ok) throw new Error(`Jina.ai returned HTTP ${res.status}`);
        return res.text();
    }

    // Extracts the first £NNN price from Jina.ai markdown output.
    // Prefers a price within 3 lines of a storage mention (e.g. "128GB"),
    // since product name and price are often on adjacent lines in markdown.
    private extractPriceFromMarkdown(markdown: string, storage: string, referencePrice?: number): number | null {
        const lines    = markdown.split('\n');
        const storageN = storage.toLowerCase().replace(/\s+/g, '');

        // If we have a CeX reference price, only accept prices within 20%–300% of it.
        // This kills bogus extractions like £700 for an iPhone 11 (CeX: £180).
        const sane = (val: number): boolean => {
            if (val < 10) return false; // rejects delivery fees, promo codes, £1.09 etc.
            if (!referencePrice) return true;
            return val >= referencePrice * 0.20 && val <= referencePrice * 3.0;
        };

        // Pass 1: find a line mentioning the storage variant, then look up to
        // 3 lines ahead for a price — handles heading + price on next line patterns.
        if (storageN) {
            for (let i = 0; i < lines.length; i++) {
                if (!lines[i].toLowerCase().replace(/\s+/g, '').includes(storageN)) continue;
                for (let j = i; j <= Math.min(i + 3, lines.length - 1); j++) {
                    const m = lines[j].match(/£\s*(\d+(?:\.\d{1,2})?)/);
                    if (m) {
                        const val = parseFloat(m[1]);
                        if (sane(val)) return val;
                    }
                }
            }
        }

        // Pass 2: first price on any line that passes the sanity check
        for (const line of lines) {
            const m = line.match(/£\s*(\d+(?:\.\d{1,2})?)/);
            if (m) {
                const val = parseFloat(m[1]);
                if (sane(val)) return val;
            }
        }

        return null;
    }

}
