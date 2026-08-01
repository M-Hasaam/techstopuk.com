import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { DEFAULT_TRADE_IN_DEVICES } from '../src/modules/trade-in-devices/trade-in-devices.seed-data';

const connectionString = process.env.DATABASE_URL ?? 'postgresql://ai_ecommerce:ai_ecommerce@localhost:5432/ai_ecommerce?schema=public';
const pool    = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma  = new PrismaClient({ adapter } as any);

async function main() {
    let created = 0;
    for (const d of DEFAULT_TRADE_IN_DEVICES) {
        await prisma.tradeInDevice.upsert({
            where:  { brand_name: { brand: d.brand, name: d.name } },
            update: {},
            create: { ...d, isActive: true },
        });
        created++;
    }
    console.log(`✓ Seeded ${created} trade-in search devices`);
}

main()
    .catch(e => { console.error(e.message); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); await pool.end(); });
