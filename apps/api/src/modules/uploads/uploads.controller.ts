import { BadRequestException, Body, Controller, Get, InternalServerErrorException, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { StorageService } from '../../common/services/storage.service';
import path from 'path';

// Resolve the dist/ directory of the package wherever npm hoisted it.
// The default publicPath the library uses is relative to process.cwd(), which
// points at apps/api — wrong when the package is hoisted to the monorepo root.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const _bgDistDir = path.dirname(require.resolve('@imgly/background-removal-node'));
const _bgPublicPath = `file://${_bgDistDir.replace(/\\/g, '/')}/`;

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

function assertAllowedImageType(contentType: string) {
    if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
        throw new BadRequestException('Unsupported image type');
    }
}

@Controller('uploads')
export class UploadsController {
    constructor(private readonly storage: StorageService) {}

    // ── Presign (direct browser → Garage upload) ─────────────────────────────

    @Get('presign-image')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async presignImage(@Query('filename') filename: string, @Query('contentType') contentType: string) {
        if (!filename || !contentType) throw new BadRequestException('filename and contentType required');
        assertAllowedImageType(contentType);
        const key = this.storage.buildKey('device-images', filename);
        const [uploadUrl, viewUrl] = await Promise.all([
            this.storage.presignPut(key, contentType),
            this.storage.generatePresignedUrl(key),
        ]);
        return { uploadUrl, key, viewUrl };
    }

    @Get('presign-trade-in-image')
    async presignTradeInImage(
        @Query('filename') filename: string,
        @Query('contentType') contentType: string,
        @Query('groupId') groupId?: string,
    ) {
        if (!filename || !contentType) throw new BadRequestException('filename and contentType required');
        assertAllowedImageType(contentType);
        const key = this.storage.buildKey('trade-in-images', filename, groupId);
        const [uploadUrl, viewUrl] = await Promise.all([
            this.storage.presignPut(key, contentType),
            this.storage.generatePresignedUrl(key),
        ]);
        return { uploadUrl, key, viewUrl };
    }

    @Get('presign-repair-image')
    async presignRepairImage(
        @Query('filename') filename: string,
        @Query('contentType') contentType: string,
        @Query('groupId') groupId?: string,
    ) {
        if (!filename || !contentType) throw new BadRequestException('filename and contentType required');
        assertAllowedImageType(contentType);
        const key = this.storage.buildKey('repair-images', filename, groupId);
        const [uploadUrl, viewUrl] = await Promise.all([
            this.storage.presignPut(key, contentType),
            this.storage.generatePresignedUrl(key),
        ]);
        return { uploadUrl, key, viewUrl };
    }

    @Get('presign-review-image')
    @UseGuards(JwtAuthGuard)
    async presignReviewImage(@Query('filename') filename: string, @Query('contentType') contentType: string) {
        if (!filename || !contentType) throw new BadRequestException('filename and contentType required');
        assertAllowedImageType(contentType);
        const key = this.storage.buildKey('review-images', filename);
        const [uploadUrl, viewUrl] = await Promise.all([
            this.storage.presignPut(key, contentType),
            this.storage.generatePresignedUrl(key),
        ]);
        return { uploadUrl, key, viewUrl };
    }

    // ── Legacy multipart (kept for backward compat) ───────────────────────────

    @Post('image')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    @UseInterceptors(FileInterceptor('file'))
    async uploadImage(@UploadedFile() file: any) {
        if (!file) throw new BadRequestException('No file provided');
        assertAllowedImageType(file.mimetype);
        return this.storage.uploadFile(file, 'device-images');
    }

    @Post('trade-in-image')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FileInterceptor('file'))
    async uploadTradeInImage(@UploadedFile() file: any, @Query('groupId') groupId?: string) {
        if (!file) throw new BadRequestException('No file provided');
        assertAllowedImageType(file.mimetype);
        return this.storage.uploadFile(file, 'trade-in-images', groupId);
    }

    @Post('repair-image')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FileInterceptor('file'))
    async uploadRepairImage(@UploadedFile() file: any, @Query('groupId') groupId?: string) {
        if (!file) throw new BadRequestException('No file provided');
        assertAllowedImageType(file.mimetype);
        return this.storage.uploadFile(file, 'repair-images', groupId);
    }

    @Post('review-image')
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(FileInterceptor('file'))
    async uploadReviewImage(@UploadedFile() file: any) {
        if (!file) throw new BadRequestException('No file provided');
        assertAllowedImageType(file.mimetype);
        return this.storage.uploadFile(file, 'review-images');
    }

    @Post('remove-background')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    async removeBackground(@Body('imageRef') imageRef: string): Promise<StreamableFile> {
        if (!imageRef) throw new BadRequestException('imageRef is required');
        try {
            const key = this.storage.extractKey(imageRef);
            const imageBuffer = await this.storage.getObjectBuffer(key);
            const imageBlob = new Blob([imageBuffer], { type: 'application/octet-stream' });
            const { removeBackground } = await import('@imgly/background-removal-node');
            const blob = await removeBackground(imageBlob, { publicPath: _bgPublicPath });
            const outBuffer = Buffer.from(await blob.arrayBuffer());
            return new StreamableFile(outBuffer, { type: 'image/png', disposition: 'inline' });
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Background removal failed';
            console.error('[remove-background]', err);
            throw new InternalServerErrorException(msg);
        }
    }
}
