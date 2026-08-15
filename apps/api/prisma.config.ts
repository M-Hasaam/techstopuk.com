try {
    require('dotenv/config');
} catch {
    // Optional in bare CI runners
}

let defineConfig: any = (config: any) => config;
try {
    defineConfig = require('prisma/config').defineConfig;
} catch {
    // Optional in bare CI runners
}

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
