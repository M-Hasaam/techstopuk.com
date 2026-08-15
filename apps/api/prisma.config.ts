import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://ai_ecommerce:ai_ecommerce@localhost:5432/ai_ecommerce?schema=public';

const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL ?? undefined;

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: databaseUrl,
        ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
    },
});
