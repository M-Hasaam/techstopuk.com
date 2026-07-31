import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { Condition } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ScraperDataService } from '../scraper-data/scraper-data.service';
import { PricingConfigService } from '../pricing-config/pricing-config.service';
import {
    round5,
    computeCandidatePrice,
    computeTradeInOffer,
    evaluateActive,
    conditionToMultiplierKey,
} from './product-pricing.helpers';
import type {
    PricingDetail,
    PricingRunResult,
    EstimateResult,
    ScrapedPricesSnapshot,
} from './dto/price-estimate.dto';

export interface PricingJobStatus {
    running: boolean;
    done: number;
    total: number;
    result: PricingRunResult | null;
    error: string | null;
    startedAt: string | null;
    finishedAt: string | null;
}

@Injectable()
export class ProductPricingService {
    private readonly logger = new Logger(ProductPricingService.name);
    private readonly openai: OpenAI;

    private jobStatus: PricingJobStatus = {
        running: false, done: 0, total: 0,
        result: null, error: null, startedAt: null, finishedAt: null,
    };

    constructor(
        private readonly prisma:        PrismaService,
        private readonly scraperData:   ScraperDataService,
        private readonly pricingConfig: PricingConfigService,
    ) {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    async getEstimate(
        brand: string, model: string, storage: string, condition: string, ram = '',
    ): Promise<EstimateResult> {
        const configs        = await this.getAllConfigs();
        const multiplierKey  = conditionToMultiplierKey(condition);
        const conditionMult  = configs[multiplierKey]           ?? 0.82;
        const sellMargin     = configs['sell_margin_pct']       ?? 0;
        const sellDiscount   = configs['sell_discount_pct']     ?? 0;

        const scrapedPrices  = await this.getScrapedSnapshot(brand, model, storage, ram);
        const marketPrice    = scrapedPrices?.marketPrice ?? null;

        const candidatePrice = marketPrice
            ? computeCandidatePrice(marketPrice, conditionMult, sellMargin, sellDiscount)
            : null;

        // Once a scraped market price gives us a formulaic candidatePrice, the AI range
        // is purely informational display — not worth a live OpenAI call on every
        // storage/condition click in the admin product editor. AI is only the real
        // pricing signal when there's no market price to compute from.
        const aiRange        = candidatePrice !== null
            ? this.fallbackRange(marketPrice, candidatePrice)
            : await this.getAiRange(brand, model, storage, condition, marketPrice, candidatePrice, ram);
        const suggested      = candidatePrice ?? round5((aiRange.low + aiRange.high) / 2);

        return { ...aiRange, suggested, marketPrice, scrapedPrices };
    }

    async priceProduct(productId: string): Promise<PricingDetail> {
        const product = await this.prisma.product.findUnique({
            where:   { id: productId },
            include: {
                catalog: {
                    include: { brandCategory: { include: { brand: true } } },
                },
            },
        });

        if (!product) {
            return { productId, status: 'no_data', reason: 'product_not_found' };
        }

        if (!product.catalogId || !product.catalog) {
            return { productId, status: 'no_data', reason: 'no_catalog_link' };
        }

        const brand   = product.catalog.brandCategory.brand.name;
        const model   = product.catalog.model;
        const storage = product.storage ?? '';
        const ram     = (product.attributes as Record<string, string> | null)?.RAM ?? '';

        const marketPrice = await this.scraperData.lookupPrice(brand, model, storage, ram);

        if (!marketPrice) {
            await this.prisma.product.update({
                where: { id: productId },
                data:  { pricingStatus: 'no_data', isActive: false },
            });
            return { productId, status: 'no_data', reason: 'no_scraped_price' };
        }

        const configs        = await this.getAllConfigs();
        const multiplierKey  = conditionToMultiplierKey(product.condition);
        const conditionMult  = configs[multiplierKey]           ?? 0.82;
        const sellMargin     = configs['sell_margin_pct']       ?? 0;
        const sellDiscount   = configs['sell_discount_pct']     ?? 0;

        const candidatePrice = computeCandidatePrice(marketPrice, conditionMult, sellMargin, sellDiscount);
        const aiRange        = await this.getAiRange(brand, model, storage, product.condition, marketPrice, candidatePrice, ram);

        const withinRange = candidatePrice >= aiRange.low && candidatePrice <= aiRange.high;

        if (!withinRange) {
            await this.prisma.product.update({
                where: { id: productId },
                data:  { pricingStatus: 'flagged', isActive: false, aiRangeLow: aiRange.low, aiRangeHigh: aiRange.high },
            });
            this.logger.warn(
                `${brand} ${model} ${storage} flagged: £${candidatePrice} outside AI range £${aiRange.low}–£${aiRange.high}`,
            );
            return { productId, status: 'flagged', candidatePrice, aiRange, reason: 'outside_ai_range' };
        }

        const images   = product.images as string[];
        const isActive = evaluateActive(candidatePrice, images, 'auto_priced');

        // comparePrice = actual competitor market price (shown as "was £X" on storefront)
        await this.prisma.product.update({
            where: { id: productId },
            data:  { price: candidatePrice, comparePrice: marketPrice, pricingStatus: 'auto_priced', isActive, aiRangeLow: aiRange.low, aiRangeHigh: aiRange.high },
        });

        this.logger.log(`Priced ${brand} ${model} ${storage}: £${candidatePrice} (market £${marketPrice}, active: ${isActive})`);
        return { productId, status: 'applied', candidatePrice, aiRange };
    }

    getJobStatus(): PricingJobStatus {
        return { ...this.jobStatus };
    }

    startPriceCatalog(): { started: boolean; alreadyRunning: boolean } {
        if (this.jobStatus.running) return { started: false, alreadyRunning: true };
        this.jobStatus = { running: true, done: 0, total: 0, result: null, error: null, startedAt: new Date().toISOString(), finishedAt: null };
        this.runPriceCatalog().catch(err => {
            this.jobStatus.running = false;
            this.jobStatus.error = err?.message ?? 'Unknown error';
            this.jobStatus.finishedAt = new Date().toISOString();
        });
        return { started: true, alreadyRunning: false };
    }

    async runPriceCatalog(): Promise<void> {
        this.logger.log('Starting catalog pricing run…');

        const products = await this.prisma.product.findMany({
            where: {
                catalogId: { not: null },
                OR: [
                    { isActive: true },
                    { price: 0 },
                    { pricingStatus: { in: ['no_data', 'flagged'] } },
                ],
            },
            select: { id: true },
        });

        this.jobStatus.total = products.length;
        const details: PricingDetail[] = [];

        for (const { id } of products) {
            const detail = await this.priceProduct(id);
            details.push(detail);
            this.jobStatus.done++;
            await new Promise(r => setTimeout(r, 250));
        }

        const result: PricingRunResult = {
            applied: details.filter(d => d.status === 'applied').length,
            flagged: details.filter(d => d.status === 'flagged').length,
            skipped: details.filter(d => d.status === 'no_data').length,
            details,
        };

        this.jobStatus.running = false;
        this.jobStatus.result = result;
        this.jobStatus.finishedAt = new Date().toISOString();
        this.logger.log(`Pricing run complete: ${result.applied} applied, ${result.flagged} flagged, ${result.skipped} skipped`);

        try {
            const { estimated } = await this.estimateMissingScrapedPrices();
            if (estimated > 0) this.logger.log(`AI-estimated ${estimated} device(s) with no scraped market price.`);
        } catch (err: any) {
            this.logger.warn(`Estimating no-data devices failed: ${err?.message}`);
        }
    }

    /**
     * Fills in an AI resale-price estimate for scraped devices CeX/Envirofone don't carry
     * (marketPrice null) — so admins have a starting point for manually pricing them. Only
     * ever computed once per device (skips rows that already have an estimate) to avoid
     * spending OpenAI tokens re-estimating the same unchanged, still-uncarried device every run.
     */
    private async estimateMissingScrapedPrices(): Promise<{ estimated: number }> {
        const MAX_PER_RUN = 100;
        const rows = await this.prisma.scrapedPrice.findMany({
            where: { marketPrice: null, aiRangeLow: null },
            select: { id: true, brand: true, model: true, storage: true, ram: true },
            take: MAX_PER_RUN,
        });

        let estimated = 0;
        for (const row of rows) {
            try {
                const range = await this.getAiRange(row.brand, row.model, row.storage, 'Good', null, null, row.ram);
                await this.prisma.scrapedPrice.update({
                    where: { id: row.id },
                    data:  { aiRangeLow: range.low, aiRangeHigh: range.high },
                });
                estimated++;
            } catch (err: any) {
                this.logger.warn(`AI estimate failed for ${row.brand} ${row.model}: ${err?.message}`);
            }
            await new Promise(r => setTimeout(r, 250));
        }
        return { estimated };
    }

    async getTradeInAnchor(
        brand: string, model: string, storage: string, condition: string,
    ): Promise<number | null> {
        const configs          = await this.getAllConfigs();
        const tradeInRatio     = configs['tradein_ratio']      ?? 0.5;
        const tradeInMargin    = configs['tradein_margin_pct'] ?? 0;
        const multiplierKey    = conditionToMultiplierKey(condition);
        const conditionMult    = configs[multiplierKey]        ?? 0.82;
        const sellMargin       = configs['sell_margin_pct']    ?? 0;

        // Priority 1: catalog product resale price
        const product = await this.prisma.product.findFirst({
            where: {
                catalog: {
                    brandCategory: { brand: { name: { equals: brand, mode: 'insensitive' } } },
                    model: { equals: model, mode: 'insensitive' },
                },
                storage:       { equals: storage,   mode: 'insensitive' },
                condition:     condition as Condition,
                price:         { gt: 0 },
                pricingStatus: { not: 'flagged' },
            },
            orderBy: { updatedAt: 'desc' },
            select:  { price: true },
        });

        if (product) {
            const rawOffer = computeTradeInOffer(product.price, tradeInRatio);
            const offer    = round5(rawOffer * (1 - tradeInMargin / 100));
            this.logger.log(`Trade-in anchor (catalog): £${product.price} × ${tradeInRatio} − ${tradeInMargin}% = £${offer}`);
            return offer;
        }

        // Priority 2: scraped market price
        const marketPrice = await this.scraperData.lookupPrice(brand, model, storage);
        if (marketPrice) {
            const resalePrice  = computeCandidatePrice(marketPrice, conditionMult, sellMargin);
            const rawOffer     = computeTradeInOffer(resalePrice, tradeInRatio);
            const offer        = round5(rawOffer * (1 - tradeInMargin / 100));
            this.logger.log(`Trade-in anchor (scraped): market £${marketPrice} → resale £${resalePrice} × ${tradeInRatio} − ${tradeInMargin}% margin = £${offer}`);
            return offer;
        }

        return null;
    }

    async getTradeInFormulaConfig(): Promise<{ tradeInRatio: number; tradeInMargin: number }> {
        const configs = await this.getAllConfigs();
        return {
            tradeInRatio:  configs['tradein_ratio']      ?? 0.5,
            tradeInMargin: configs['tradein_margin_pct'] ?? 0,
        };
    }

    async getFlaggedProducts() {
        const products = await this.prisma.product.findMany({
            where:   { pricingStatus: 'flagged' },
            select: {
                id: true, name: true, condition: true, storage: true, attributes: true, updatedAt: true,
                catalog: { select: { model: true, brandCategory: { select: { brand: { select: { name: true } } } } } },
                otherBrand: { select: { name: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });
        return products.map(p => ({
            id: p.id, name: p.name, condition: p.condition, storage: p.storage, updatedAt: p.updatedAt,
            brand: p.catalog?.brandCategory?.brand?.name ?? p.otherBrand?.name ?? '',
            model: p.catalog?.model ?? '',
            ram: (p.attributes as Record<string, string> | null)?.RAM ?? '',
        }));
    }

    /**
     * AI price range per brand/model/storage, for display on the scraper price table.
     * Prefers the real, condition-aware range persisted the last time that product was
     * actually priced. Most scraped rows have no linked Product though (no catalog match,
     * or a storage variant nobody's created a sellable Product for yet) — those fall back
     * to the same ±25% heuristic used elsewhere as a purely informational estimate, so the
     * column isn't empty just because the full pricing job has never touched that row.
     */
    async getPricingRanges(): Promise<{ brand: string; model: string; storage: string; ram: string; low: number; high: number }[]> {
        const products = await this.prisma.product.findMany({
            where:  { aiRangeLow: { not: null }, aiRangeHigh: { not: null } },
            select: {
                storage: true, attributes: true, aiRangeLow: true, aiRangeHigh: true, updatedAt: true,
                catalog: { select: { model: true, brandCategory: { select: { brand: { select: { name: true } } } } } },
                otherBrand: { select: { name: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });

        const rangeMap = new Map<string, { brand: string; model: string; storage: string; ram: string; low: number; high: number }>();
        for (const p of products) {
            const brand = p.catalog?.brandCategory?.brand?.name ?? p.otherBrand?.name ?? '';
            const model = p.catalog?.model ?? '';
            const ram   = (p.attributes as Record<string, string> | null)?.RAM ?? '';
            const key   = `${brand}|${model}|${p.storage}|${ram}`;
            if (rangeMap.has(key)) continue; // already-seen entries are more recent (orderBy updatedAt desc)
            rangeMap.set(key, { brand, model, storage: p.storage, ram, low: p.aiRangeLow!, high: p.aiRangeHigh! });
        }

        const scrapedRows = await this.prisma.scrapedPrice.findMany({
            where: {
                OR: [{ marketPrice: { not: null } }, { aiRangeLow: { not: null } }],
            },
            select: { brand: true, model: true, storage: true, ram: true, marketPrice: true, aiRangeLow: true, aiRangeHigh: true },
        });
        for (const row of scrapedRows) {
            const key = `${row.brand}|${row.model}|${row.storage}|${row.ram}`;
            if (rangeMap.has(key)) continue;
            if (row.marketPrice !== null) {
                rangeMap.set(key, { brand: row.brand, model: row.model, storage: row.storage, ram: row.ram, ...this.fallbackRange(row.marketPrice, null) });
            } else if (row.aiRangeLow !== null && row.aiRangeHigh !== null) {
                // No market data — this is the one-off AI estimate computed by estimateMissingScrapedPrices().
                rangeMap.set(key, { brand: row.brand, model: row.model, storage: row.storage, ram: row.ram, low: row.aiRangeLow, high: row.aiRangeHigh });
            }
        }

        return [...rangeMap.values()];
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    protected async getAllConfigs(): Promise<Record<string, number>> {
        const rows = await this.pricingConfig.findAll();
        return Object.fromEntries(rows.map(r => [r.key, r.value]));
    }

    protected async getScrapedSnapshot(
        brand: string, model: string, storage: string, ram = '',
    ): Promise<ScrapedPricesSnapshot | null> {
        const rows = await this.scraperData.getDevicePrices(brand, model);
        const storageL = storage?.toLowerCase();
        const ramL     = ram.toLowerCase();
        const row =
            rows.find(r => r.storage?.toLowerCase() === storageL && (r.ram ?? '').toLowerCase() === ramL)
            ?? rows.find(r => r.storage?.toLowerCase() === storageL)
            ?? rows[0] ?? null;
        if (!row) return null;
        return {
            cexSellPrice:     row.cexSellPrice     ?? null,
            cexCashPrice:     row.cexCashPrice      ?? null,
            cexExchangePrice: row.cexExchangePrice  ?? null,
            envirofonePrice:  row.envirofonePrice   ?? null,
            marketPrice:      row.marketPrice       ?? null,
            scrapedAt:        row.scrapedAt as unknown as string,
        };
    }

    protected async getAiRange(
        brand: string, model: string, storage: string, condition: string,
        marketPrice: number | null, candidatePrice: number | null, ram = '',
    ): Promise<{ low: number; high: number }> {
        try {
            const prompt = [
                `Device: ${[brand, model, ram, storage].filter(Boolean).join(' ')}`,
                `Condition: ${condition}`,
                marketPrice    ? `Competitor market price: £${marketPrice}`    : 'No competitor price available.',
                candidatePrice ? `Proposed store price: £${candidatePrice}` : '',
                '',
                'Return JSON only: {"low": number, "high": number}',
                'These are the expected resale price bounds in GBP for this exact device and condition at a UK second-hand store.',
            ].filter(Boolean).join('\n');

            const response = await this.openai.chat.completions.create({
                model:           'gpt-4o',
                temperature:     0,
                max_tokens:      60,
                response_format: { type: 'json_object' },
                messages: [
                    {
                        role:    'system',
                        content: 'You are a UK mobile phone resale pricing expert. Return valid JSON only. No markdown, no explanation.',
                    },
                    { role: 'user', content: prompt },
                ],
            });

            const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as {
                low?: number; high?: number;
            };
            if (typeof parsed.low === 'number' && typeof parsed.high === 'number') {
                return { low: round5(parsed.low), high: round5(parsed.high) };
            }
        } catch (err: any) {
            this.logger.warn(`AI range check failed for ${brand} ${model}: ${err.message}`);
        }
        return this.fallbackRange(marketPrice, candidatePrice);
    }

    /** Same ±25% heuristic getAiRange falls back to on error — used directly (skipping
     *  the OpenAI call) wherever a market price already gives us a formulaic price and
     *  the AI range is purely informational rather than the actual pricing signal. */
    private fallbackRange(marketPrice: number | null, candidatePrice: number | null): { low: number; high: number } {
        const base = candidatePrice ?? (marketPrice ? round5(marketPrice * 0.7) : 50);
        return { low: round5(base * 0.75), high: round5(base * 1.25) };
    }
}
