// One-time migration: the trade-in question seed images used to live as static
// files in apps/web/public/diagnostics/, referenced by a web-app-relative path
// ("/diagnostics/x.png"). That works fine for the customer wizard (same origin as
// the assets) but is cross-origin from the admin panel, which the web app's own
// Cross-Origin-Resource-Policy: same-origin header blocks outright — no CSP
// allowlist can work around that. Moving these into Garage (same place every other
// admin-uploaded image already lives) fixes admin previews and removes the
// cross-app coupling. Keys are deterministic (no uuid) so this script is safe to
// re-run — it just overwrites the same objects.
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const bucketName = process.env.GARAGE_BUCKET || 'ai-ecommerce';
const endpoint = process.env.GARAGE_ENDPOINT || 'http://localhost:9000';
const credentials = {
    accessKeyId: process.env.GARAGE_ACCESS_KEY || 'minioadmin',
    secretAccessKey: process.env.GARAGE_SECRET_KEY || 'minioadmin',
};
const s3 = new S3Client({ region: 'us-east-1', endpoint, credentials, forcePathStyle: true });

const diagnosticsDir = path.resolve(__dirname, '../../web/public/diagnostics');

async function main() {
    const files = fs.readdirSync(diagnosticsDir).filter((f) => f.endsWith('.png'));
    const mapping: Record<string, string> = {};

    for (const filename of files) {
        const key = `device-images/diagnostics/${filename}`;
        const body = fs.readFileSync(path.join(diagnosticsDir, filename));
        await s3.send(new PutObjectCommand({ Bucket: bucketName, Key: key, Body: body, ContentType: 'image/png' }));
        mapping[`/diagnostics/${filename}`] = key;
        console.log(`✓ ${filename} -> ${key}`);
    }

    fs.writeFileSync(
        path.join(__dirname, 'diagnostic-image-key-mapping.json'),
        JSON.stringify(mapping, null, 2),
    );
    console.log(`\nUploaded ${files.length} images. Mapping written to diagnostic-image-key-mapping.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
