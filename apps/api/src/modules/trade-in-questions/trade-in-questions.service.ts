import { Injectable, NotFoundException } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../../common/services/storage.service';
import { UpsertQuestionDto } from './dto/upsert-question.dto';
import { DEFAULT_TRADE_IN_QUESTIONS } from './trade-in-questions.seed-data';

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 40) || 'question';
}

@Injectable()
export class TradeInQuestionsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StorageService,
    ) {}

    private async withResolvedImages<T extends { options: { image: string | null }[] }>(questions: T[]): Promise<T[]> {
        return Promise.all(
            questions.map(async (q) => ({
                ...q,
                options: await Promise.all(
                    q.options.map(async (o) => ({ ...o, image: await this.storage.resolveImageUrl(o.image) })),
                ),
            })),
        );
    }

    async findAll(activeOnly = true, category?: string) {
        const questions = await this.prisma.tradeInQuestion.findMany({
            where: {
                ...(activeOnly ? { isActive: true } : {}),
                ...(category ? { category } : {}),
            },
            include: { options: { orderBy: { order: 'asc' } } },
            orderBy: [{ category: 'asc' }, { order: 'asc' }],
        });
        return this.withResolvedImages(questions);
    }

    private async uniqueKey(category: string, question: string, ignoreId?: string): Promise<string> {
        const base = slugify(question);
        let key = base;
        let n = 2;
        for (;;) {
            const clash = await this.prisma.tradeInQuestion.findFirst({
                where: { category, key, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
                select: { id: true },
            });
            if (!clash) return key;
            key = `${base}-${n++}`;
        }
    }

    async create(dto: UpsertQuestionDto) {
        const key = dto.key?.trim() || (await this.uniqueKey(dto.category, dto.question));
        const question = await this.prisma.tradeInQuestion.create({
            data: {
                category: dto.category,
                key,
                question: dto.question,
                order: dto.order ?? 0,
                isActive: dto.isActive ?? true,
                options: {
                    create: dto.options.map((o, i) => ({
                        label: o.label,
                        order: o.order ?? i,
                        image: o.image ?? null,
                        icon: o.icon ?? null,
                        tone: o.tone ?? null,
                    })),
                },
            },
            include: { options: { orderBy: { order: 'asc' } } },
        });
        const [resolved] = await this.withResolvedImages([question]);
        return resolved;
    }

    async update(id: string, dto: UpsertQuestionDto) {
        const existing = await this.prisma.tradeInQuestion.findUnique({
            where: { id },
            include: { options: true },
        });
        if (!existing) throw new NotFoundException('Question not found');

        const keptIds = new Set(dto.options.filter((o) => o.id).map((o) => o.id));
        const toDelete = existing.options.filter((o) => !keptIds.has(o.id)).map((o) => o.id);

        await this.prisma.$transaction([
            this.prisma.tradeInQuestion.update({
                where: { id },
                data: {
                    category: dto.category,
                    question: dto.question,
                    order: dto.order ?? existing.order,
                    isActive: dto.isActive ?? existing.isActive,
                },
            }),
            ...(toDelete.length ? [this.prisma.tradeInQuestionOption.deleteMany({ where: { id: { in: toDelete } } })] : []),
            ...dto.options
                .filter((o) => o.id)
                .map((o) =>
                    this.prisma.tradeInQuestionOption.update({
                        where: { id: o.id },
                        data: { label: o.label, order: o.order, image: o.image ?? null, icon: o.icon ?? null, tone: o.tone ?? null },
                    }),
                ),
            ...dto.options
                .filter((o) => !o.id)
                .map((o) =>
                    this.prisma.tradeInQuestionOption.create({
                        data: { questionId: id, label: o.label, order: o.order, image: o.image ?? null, icon: o.icon ?? null, tone: o.tone ?? null },
                    }),
                ),
        ]);

        const updated = await this.prisma.tradeInQuestion.findUniqueOrThrow({
            where: { id },
            include: { options: { orderBy: { order: 'asc' } } },
        });
        const [resolved] = await this.withResolvedImages([updated]);
        return resolved;
    }

    async remove(id: string) {
        const existing = await this.prisma.tradeInQuestion.findUnique({ where: { id } });
        if (!existing) throw new NotFoundException('Question not found');
        return this.prisma.tradeInQuestion.delete({ where: { id } });
    }

    async removeAll() {
        const result = await this.prisma.tradeInQuestion.deleteMany({});
        return { deleted: result.count };
    }

    // Every admin-uploaded image (products, banners, etc.) gets a fresh uuid-prefixed
    // key per upload via StorageService.uploadFile(), so the exact URL a browser
    // requests has never been requested before — there's no way for a CDN to have a
    // stale cached 404 for a key that's brand new. These bundled diagnostic images
    // used a single fixed key instead, and one of them got requested (and 404'd, since
    // nothing had uploaded it yet) enough times that Cloudflare cached that 404 for a
    // year. "-v2" exists purely so this ships on a URL nobody has ever requested before,
    // matching how every other image in the app already behaves — no CDN purge required,
    // and if this ever needs to change again, bumping to -v3 has the same effect.
    private static readonly DIAGNOSTIC_IMAGE_PREFIX = 'device-images/diagnostics-v2/';
    private static readonly LEGACY_DIAGNOSTIC_IMAGE_PREFIX = 'device-images/diagnostics/';

    /** Uploads the diagnostic option photos bundled with this service into storage,
     *  keyed the same way DEFAULT_TRADE_IN_QUESTIONS references them, and migrates any
     *  option still pointing at the pre-versioning key onto the new one. Runs every time
     *  seedDefaults() is called (idempotent, ~19 small PNGs) rather than only when a
     *  question row is first created — a DB row referencing an image can already exist
     *  in an environment while the actual object was never uploaded to *that*
     *  environment's storage. This makes "Seed defaults" fully self-contained: it no
     *  longer depends on a separate one-off script run by hand against each
     *  environment's storage credentials. */
    private async ensureDiagnosticImages(): Promise<number> {
        const keys = new Set<string>();
        for (const q of DEFAULT_TRADE_IN_QUESTIONS) {
            for (const o of q.options) {
                if (o.image?.startsWith(TradeInQuestionsService.DIAGNOSTIC_IMAGE_PREFIX)) keys.add(o.image);
            }
        }

        const assetsDir = path.join(__dirname, 'seed-assets/diagnostics');
        let uploaded = 0;
        for (const key of keys) {
            const filename = key.slice(TradeInQuestionsService.DIAGNOSTIC_IMAGE_PREFIX.length);
            const filePath = path.join(assetsDir, filename);
            if (!fs.existsSync(filePath)) continue;
            await this.storage.putObject(key, fs.readFileSync(filePath), 'image/png');

            // Exact-match only, so an admin's manual image edit is never overwritten —
            // this only repoints options that still hold the untouched legacy default.
            const legacyKey = TradeInQuestionsService.LEGACY_DIAGNOSTIC_IMAGE_PREFIX + filename;
            await this.prisma.tradeInQuestionOption.updateMany({
                where: { image: legacyKey },
                data: { image: key },
            });

            uploaded++;
        }
        return uploaded;
    }

    /** Creates any default question missing by (category, key), and re-uploads the
     *  bundled diagnostic images to storage — safe to call repeatedly, never overwrites
     *  admin edits to existing questions. */
    async seedDefaults() {
        const imagesUploaded = await this.ensureDiagnosticImages();
        let seeded = 0;
        for (const q of DEFAULT_TRADE_IN_QUESTIONS) {
            const existing = await this.prisma.tradeInQuestion.findUnique({
                where: { category_key: { category: q.category, key: q.key } },
            });
            if (existing) continue;
            await this.prisma.tradeInQuestion.create({
                data: {
                    category: q.category,
                    key: q.key,
                    question: q.question,
                    order: q.order,
                    options: {
                        create: q.options.map((o, i) => ({
                            label: o.label,
                            order: i,
                            image: o.image ?? null,
                            icon: o.icon ?? null,
                            tone: o.tone ?? null,
                        })),
                    },
                },
            });
            seeded++;
        }
        return { seeded, imagesUploaded };
    }
}
