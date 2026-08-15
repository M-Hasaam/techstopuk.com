import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const databaseUrl =
    process.env.DATABASE_URL ??
    'postgresql://prisma:prisma@localhost:5432/shadow';

const shadowDatabaseUrl =
    process.env.SHADOW_DATABASE_URL ??
    'postgresql://prisma:prisma@localhost:5432/shadow';

export default defineConfig({
    schema: 'prisma/schema.prisma',
    migrations: {
        path: 'prisma/migrations',
    },
    datasource: {
        url: databaseUrl,
        shadowDatabaseUrl: shadowDatabaseUrl,
    },
});
