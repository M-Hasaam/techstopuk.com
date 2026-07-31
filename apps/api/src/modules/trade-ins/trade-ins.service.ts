import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import OpenAI from 'openai';
import { Condition } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../../common/services/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ShippingService } from '../shipping/shipping.service';
import { CreateTradeInDto } from './dto/create-trade-in.dto';
import { UpdateTradeInDto } from './dto/update-trade-in.dto';
import { ApproveTradeInDto } from './dto/approve-trade-in.dto';
import { RejectTradeInDto } from './dto/reject-trade-in.dto';
import { CounterOfferTradeInDto } from './dto/counter-offer-trade-in.dto';
import { AiPriceDto } from './dto/ai-price.dto';
import { ScraperDataService } from '../scraper-data/scraper-data.service';
import { ProductPricingService } from '../product-pricing/product-pricing.service';

function applyMargin(marketPrice: number, marginPct: number): number {
    return Math.max(Math.round(marketPrice * (1 - marginPct / 100) / 5) * 5, 10);
}

@Injectable()
export class TradeInsService {
    private readonly logger = new Logger(TradeInsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StorageService,
        private readonly notifications: NotificationsService,
        private readonly shipping: ShippingService,
        private readonly scraper: ScraperDataService,
        private readonly productPricing: ProductPricingService,
    ) {}

    async submit(dto: CreateTradeInDto, userId?: string) {
        let contact: object = dto.contact as object;
        if (userId) {
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (user) {
                contact = {
                    name:     user.name                          || (dto.contact as any).name     || '',
                    email:    user.email                         || (dto.contact as any).email    || '',
                    phone:    user.phone  || (dto.contact as any).phone    || '',
                    address:  user.address || (dto.contact as any).address || '',
                    postcode: user.postcode || (dto.contact as any).postcode || '',
                };
            }
        }
        return this.prisma.tradeIn.create({
            data: {
                userId,
                category: dto.category,
                brand: dto.brand,
                model: dto.model,
                specs: dto.specs,
                condition: dto.condition as Condition,
                answers: dto.answers,
                fulfillment: dto.fulfillment,
                offerPrice: dto.offerPrice,
                images: dto.images,
                storeId: dto.storeId ?? null,
                customerNotes: dto.customerNotes ?? null,
                contact,
            },
        });
    }

    async findAll(query: { status?: string; search?: string; page?: number; limit?: number }) {
        const { status, search, page = 1, limit = 20 } = query;
        const skip = (page - 1) * limit;
        const where: Record<string, unknown> = {};
        if (status) where.status = status as never;
        if (search) {
            where.OR = [
                { model:     { contains: search, mode: 'insensitive' } },
                { reference: { contains: search, mode: 'insensitive' } },
                { user: { name: { contains: search, mode: 'insensitive' } } },
            ];
        }

        const [items, total] = await Promise.all([
            this.prisma.tradeIn.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: { user: { select: { id: true, name: true, email: true } } },
            }),
            this.prisma.tradeIn.count({ where }),
        ]);

        return { items, total, page, limit, pages: Math.ceil(total / limit) };
    }

    async findById(id: string) {
        const tradeIn = await this.prisma.tradeIn.findUnique({
            where: { id },
            include: { user: { select: { id: true, name: true, email: true } } },
        });
        if (!tradeIn) throw new NotFoundException('Trade-in not found');
        const imageUrls = await Promise.all(
            tradeIn.images.map(key => this.storage.generatePresignedUrl(key).catch(() => null)),
        );
        return { ...tradeIn, images: imageUrls.filter(Boolean) as string[] };
    }

    async findByReference(reference: string) {
        const tradeIn = await this.prisma.tradeIn.findUnique({ where: { reference } });
        if (!tradeIn) throw new NotFoundException('Trade-in not found');
        return tradeIn;
    }

    async findByUser(userId: string) {
        return this.prisma.tradeIn.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
    }

    async findByIdForUser(id: string, userId: string) {
        const tradeIn = await this.prisma.tradeIn.findFirst({ where: { id, userId } });
        if (!tradeIn) throw new NotFoundException('Trade-in not found');
        const imageUrls = await Promise.all(
            tradeIn.images.map(key => this.storage.generatePresignedUrl(key).catch(() => null)),
        );
        return { ...tradeIn, images: imageUrls.filter(Boolean) as string[] };
    }

    async acceptCounterOffer(id: string, userId: string) {
        const tradeIn = await this.prisma.tradeIn.findFirst({ where: { id, userId } });
        if (!tradeIn) throw new NotFoundException('Trade-in not found');
        if (tradeIn.status !== 'COUNTER_OFFERED') {
            throw new BadRequestException('No counter offer to accept');
        }
        const updated = await this.prisma.tradeIn.update({
            where: { id },
            data: { status: 'APPROVED', offerPrice: tradeIn.counterOffer ?? tradeIn.offerPrice },
        });

        if (tradeIn.fulfillment === 'ship') {
            try {
                await this.issueShippingLabel(tradeIn);
            } catch (err) {
                this.logger.error(`Failed to generate shipping label for trade-in ${id}`, err);
            }
        }

        return updated;
    }

    async declineCounterOffer(id: string, userId: string) {
        const tradeIn = await this.prisma.tradeIn.findFirst({ where: { id, userId } });
        if (!tradeIn) throw new NotFoundException('Trade-in not found');
        if (tradeIn.status !== 'COUNTER_OFFERED') {
            throw new BadRequestException('No counter offer to decline');
        }
        return this.prisma.tradeIn.update({ where: { id }, data: { status: 'CANCELLED' } });
    }

    async update(id: string, dto: UpdateTradeInDto) {
        await this.findById(id);
        return this.prisma.tradeIn.update({ where: { id }, data: dto as never });
    }

    async markUnderReview(id: string) {
        const tradeIn = await this.findById(id);
        if (tradeIn.status !== 'SUBMITTED') {
            throw new BadRequestException(`Cannot review a trade-in with status ${tradeIn.status}`);
        }
        return this.prisma.tradeIn.update({ where: { id }, data: { status: 'UNDER_REVIEW' } });
    }

    async approve(id: string, dto: ApproveTradeInDto) {
        const tradeIn = await this.findById(id);
        if (!['SUBMITTED', 'UNDER_REVIEW', 'COUNTER_OFFERED'].includes(tradeIn.status)) {
            throw new BadRequestException(`Cannot approve a trade-in with status ${tradeIn.status}`);
        }
        const finalPrice = tradeIn.counterOffer ?? tradeIn.offerPrice;
        if (finalPrice <= 0) {
            throw new BadRequestException('Set an offer price for this trade-in before approving it');
        }
        const updated = await this.prisma.tradeIn.update({
            where: { id },
            data: { status: 'APPROVED', offerPrice: finalPrice, adminNotes: dto.adminNotes },
        });
        if (tradeIn.userId) {
            await this.notifications.create(
                tradeIn.userId,
                'trade_in_approved',
                'Trade-in Approved!',
                `Your ${tradeIn.brand} ${tradeIn.model} trade-in has been approved. We'll be in touch shortly to arrange collection.`,
                { tradeInId: id, reference: tradeIn.reference, price: finalPrice },
            );
        }

        // Generate prepaid label for mail-in trade-ins
        if (tradeIn.fulfillment === 'ship') {
            try {
                await this.issueShippingLabel(tradeIn);
            } catch (err) {
                this.logger.error(`Failed to generate shipping label for trade-in ${id}`, err);
            }
        }

        return updated;
    }

    /**
     * Purchases (or reuses) a prepaid label and emails it to the customer, recording
     * `labelEmailSentAt` so admins can see confirmation the customer was actually notified —
     * shared by approve(), acceptCounterOffer(), and the admin-triggered resend.
     */
    private async issueShippingLabel(tradeIn: { id: string; reference: string; contact: unknown; trackingNumber: string | null; labelUrl: string | null }) {
        const contact = tradeIn.contact as Record<string, string>;
        if (!contact?.email) {
            throw new BadRequestException('No customer email on file — cannot send shipping label');
        }

        let trackingNumber = tradeIn.trackingNumber;
        let labelPdf: Buffer;

        if (tradeIn.trackingNumber && tradeIn.labelUrl) {
            // Reuse the label we already purchased — never buy a second one just to resend the email.
            labelPdf = await this.shipping.fetchLabelPdf(tradeIn.labelUrl);
        } else {
            const result = await this.shipping.generatePrepaidLabel({
                reference:     tradeIn.reference,
                customerName:  contact.name || 'Customer',
                customerEmail: contact.email,
                customerPhone: contact.phone,
                type:          'trade-in',
            });
            trackingNumber = result.trackingNumber;
            labelPdf = result.labelPdf;
            await this.prisma.tradeIn.update({
                where: { id: tradeIn.id },
                data:  { trackingNumber: result.trackingNumber, labelUrl: result.labelUrl },
            });
        }

        await this.shipping.sendLabelEmail(
            { reference: tradeIn.reference, customerName: contact.name || 'Customer', customerEmail: contact.email, type: 'trade-in' },
            { trackingNumber: trackingNumber!, labelPdf },
        );

        await this.prisma.tradeIn.update({
            where: { id: tradeIn.id },
            data:  { labelEmailSentAt: new Date() },
        });
    }

    /** Admin-triggered retry when a customer never received their shipping label email. */
    async resendShippingLabel(id: string) {
        const tradeIn = await this.findById(id);
        if (tradeIn.fulfillment !== 'ship') {
            throw new BadRequestException('This trade-in is not set up for shipping');
        }
        if (tradeIn.status !== 'APPROVED') {
            throw new BadRequestException('Trade-in must be approved before (re)sending a shipping label');
        }
        const contact = tradeIn.contact as Record<string, string>;
        if (!contact.email) {
            throw new BadRequestException('No customer email on file for this trade-in');
        }

        await this.issueShippingLabel(tradeIn);
        const refreshed = await this.prisma.tradeIn.findUnique({ where: { id } });
        return { success: true, trackingNumber: refreshed?.trackingNumber, labelEmailSentAt: refreshed?.labelEmailSentAt };
    }

    async reject(id: string, dto: RejectTradeInDto) {
        const tradeIn = await this.findById(id);
        if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(tradeIn.status)) {
            throw new BadRequestException(`Cannot reject a trade-in with status ${tradeIn.status}`);
        }
        const updated = await this.prisma.tradeIn.update({
            where: { id },
            data: { status: 'REJECTED', adminNotes: dto.adminNotes },
        });
        if (tradeIn.userId) {
            await this.notifications.create(
                tradeIn.userId,
                'trade_in_rejected',
                'Trade-in Not Accepted',
                `Unfortunately we're unable to accept your ${tradeIn.brand} ${tradeIn.model} trade-in at this time.${dto.adminNotes ? ` Reason: ${dto.adminNotes}` : ''}`,
                { tradeInId: id, reference: tradeIn.reference },
            );
        }
        return updated;
    }

    async counterOffer(id: string, dto: CounterOfferTradeInDto) {
        const tradeIn = await this.findById(id);
        if (!['SUBMITTED', 'UNDER_REVIEW', 'COUNTER_OFFERED'].includes(tradeIn.status)) {
            throw new BadRequestException(`Cannot counter-offer a trade-in with status ${tradeIn.status}`);
        }
        const updated = await this.prisma.tradeIn.update({
            where: { id },
            data: {
                status: 'COUNTER_OFFERED',
                counterOffer: dto.counterOffer,
                adminNotes: dto.adminNotes,
            },
        });
        if (tradeIn.userId) {
            await this.notifications.create(
                tradeIn.userId,
                'trade_in_counter_offer',
                'New Offer on Your Trade-in',
                `We've reviewed your ${tradeIn.brand} ${tradeIn.model} and are offering £${dto.counterOffer}. Check your trade-in to accept or decline.`,
                { tradeInId: id, reference: tradeIn.reference, counterOffer: dto.counterOffer },
            );
        }
        return updated;
    }

    private async getMarginPct(): Promise<number> {
        const row = await this.prisma.pricingConfig.findUnique({ where: { key: 'margin_pct' } });
        return row?.value ?? 30;
    }

    async aiPrice(dto: AiPriceDto): Promise<{ price: number; aiUsed: boolean; source?: string }> {
        const storage = (dto.specs as Record<string, string>)?.storage
                     ?? (dto.specs as Record<string, string>)?.Storage
                     ?? '';

        // Priority 1 & 2: deterministic anchor (catalog product price → scraped price)
        const anchor = await this.productPricing.getTradeInAnchor(
            dto.brand, dto.model, storage, dto.condition,
        );
        if (anchor !== null) {
            this.logger.log(
                `Trade-in anchor for ${dto.brand} ${dto.model} ${storage} (${dto.condition}): £${anchor}`,
            );
            return { price: anchor, aiUsed: false, source: 'anchor' };
        }

        // Priority 3: AI fallback — only when no scraped/catalog data exists
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new InternalServerErrorException('AI pricing is not configured');

        const openai = new OpenAI({ apiKey });

        const specsText   = Object.entries(dto.specs).map(([k, v]) => `${k}: ${v}`).join(', ');
        const answersText = Object.entries(dto.answers).map(([k, v]) => `${k}: ${v}`).join(', ');

        const systemMessage = `You are a UK second-hand electronics pricing expert for a refurbished device buyback service. You must always respond with a JSON object containing a "price" field. Be deterministic — given the same inputs always return the same price. Never return an empty object. If uncertain, give your best estimate based on similar devices.`;

        const prompt = `Estimate the current UK resale market value in GBP for this device.

Device:
- Brand: ${dto.brand}
- Model: ${dto.model}
- Category: ${dto.category}
- Condition: ${dto.condition}
- Specs: ${specsText || 'standard'}
- Diagnostic answers: ${answersText || 'none'}

${dto.images?.length ? `${dto.images.length} photo(s) attached — assess physical condition from the images and adjust price accordingly.` : 'No photos — use condition grade and diagnostic answers only.'}

Base your estimate on mid-2025 UK prices from BackMarket, CEX, Music Magpie, and eBay completed listings. This is the raw market resale value before any trade-in margin is applied.

Respond with ONLY: {"price": <number rounded to nearest 5, minimum 10>}`;

        const content: OpenAI.Chat.ChatCompletionContentPart[] = [{ type: 'text', text: prompt }];

        if (dto.images?.length) {
            for (const img of dto.images.slice(0, 4)) {
                content.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
            }
            const imgSample = dto.images[0]?.substring(0, 80) ?? '';
            this.logger.log(`Images attached: ${dto.images.length}, first URL prefix: ${imgSample}`);
        }

        const response = await openai.chat.completions.create({
            model:           'gpt-4o',
            messages: [
                { role: 'system', content: systemMessage },
                { role: 'user',   content },
            ],
            temperature:     0,
            max_tokens:      100,
            response_format: { type: 'json_object' },
        });

        const choice      = response.choices[0];
        const finishReason = choice?.finish_reason;
        const raw         = choice?.message?.content ?? '{}';
        this.logger.log(`OpenAI finish_reason: ${finishReason} | raw: ${raw}`);

        if (finishReason === 'content_filter') {
            throw new InternalServerErrorException('AI pricing unavailable — please try again');
        }

        const parsed     = JSON.parse(raw) as { price?: number };
        const marketPrice = parsed.price && parsed.price > 0 ? parsed.price : null;
        if (!marketPrice) {
            throw new InternalServerErrorException('AI pricing returned an invalid response — please try again');
        }

        const marginPct = await this.getMarginPct();
        return { price: applyMargin(marketPrice, marginPct), aiUsed: true, source: 'ai' };
    }

    async suggestSpecs(brand: string, model: string, category: string): Promise<{ label: string; options: string[] }[]> {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) return [];

        const openai = new OpenAI({ apiKey });

        const prompt = `Device trade-in assistant. Customer wants to sell: brand="${brand}", model="${model}", category="${category}".
Return JSON with 2-4 relevant specification fields and their options so we can log key details about this device.
Example: { "specs": [{ "label": "Storage", "options": ["64GB","128GB","256GB","512GB"] }, { "label": "Connectivity", "options": ["Wi-Fi Only","Wi-Fi + Cellular"] }] }
For unknown/other categories use generic fields like Storage, Accessories Included, Color.
Do NOT include a condition/grade/physical-state field — that is captured separately by our own condition grading step.
Respond only with valid JSON.`;

        try {
            const response = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                temperature: 0,
                max_tokens: 400,
                response_format: { type: 'json_object' },
                messages: [{ role: 'user', content: prompt }],
            });

            const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as { specs?: { label: string; options: string[] }[] };
            const specs = parsed.specs ?? [];
            // Defensive filter in case the model ignores the instruction above —
            // condition/grade is always handled by the dedicated grading step, never here.
            return specs.filter(s => !/condition|grade|physical state/i.test(s.label));
        } catch {
            return [];
        }
    }

    async complete(id: string) {
        const tradeIn = await this.findById(id);
        if (tradeIn.status !== 'APPROVED') {
            throw new BadRequestException(`Cannot complete a trade-in with status ${tradeIn.status}`);
        }
        return this.prisma.tradeIn.update({ where: { id }, data: { status: 'COMPLETED' } });
    }

    async getPublicStats() {
        const [tradeInCount, productCount] = await Promise.all([
            this.prisma.tradeIn.count({
                where: {
                    status: {
                        in: ['APPROVED', 'COMPLETED']
                    }
                }
            }),
            this.prisma.product.count({
                where: {
                    isActive: true
                }
            })
        ]);

        return {
            devicesRepurposed: 1542830 + tradeInCount + productCount,
            lifespanExtension: 2.0,
            idleElectronics: 5000000000,
        };
    }

    async purgeAll(): Promise<{ deleted: number }> {
        const all = await this.prisma.tradeIn.findMany({ select: { images: true } });
        const keys = all.flatMap(t => t.images as string[]).filter(Boolean);
        if (keys.length) await this.storage.deleteFiles(keys);
        await this.prisma.tradeIn.deleteMany({});
        return { deleted: keys.length };
    }
}
