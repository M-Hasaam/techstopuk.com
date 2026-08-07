import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { DEFAULT_TRADE_IN_QUESTIONS } from '../src/modules/trade-in-questions/trade-in-questions.seed-data';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://ai_ecommerce:ai_ecommerce@localhost:5432/ai_ecommerce?schema=public';
const pool    = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter } as any);

async function main() {
    let seeded = 0;
    for (const q of DEFAULT_TRADE_IN_QUESTIONS) {
        const existing = await prisma.tradeInQuestion.findUnique({
            where: { category_key: { category: q.category, key: q.key } },
        });
        if (existing) continue;
        await prisma.tradeInQuestion.create({
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
    console.log(`✓ Seeded ${seeded} trade-in questions`);
}

main()
    .catch(e => { console.error(e.message); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
