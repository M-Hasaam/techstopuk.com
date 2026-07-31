import { Controller, Post, Get, Delete, Query, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { IsInt, IsBoolean, Min } from 'class-validator';
import { ScraperDataService } from './scraper-data.service';
import { ScraperCronService } from '../scraper-cron/scraper-cron.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

class SetScheduleDto {
    @IsInt() @Min(0) hours!: number;
}

class SetThresholdDto {
    @IsInt() @Min(1) hours!: number;
}

class SetAutoPriceDto {
    @IsBoolean() enabled!: boolean;
}

@Controller('scraper')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ScraperDataController {
    constructor(
        private readonly service: ScraperDataService,
        private readonly cron: ScraperCronService,
    ) {}

    @Post('run')
    @HttpCode(HttpStatus.ACCEPTED)
    run() {
        return this.service.triggerScraper();
    }

    @Get('prices')
    prices(
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
    ) {
        return this.service.listPrices(page ? Number(page) : 1, limit ? Number(limit) : 50, search);
    }

    @Get('device')
    devicePrices(@Query('brand') brand: string, @Query('model') model: string) {
        return this.service.getDevicePrices(brand ?? '', model ?? '');
    }

    @Post('device')
    @HttpCode(HttpStatus.OK)
    scrapeDevice(
        @Query('brand') brand: string,
        @Query('model') model: string,
        @Query('sync') sync?: string,
    ) {
        if (sync === 'true') {
            return this.service.triggerDeviceScrapeSync(brand ?? '', model ?? '');
        }
        return this.service.triggerDeviceScrape(brand ?? '', model ?? '');
    }

    @Get('stats')
    stats() {
        return this.service.getStats();
    }

    @Get('runs')
    runs(@Query('limit') limit?: string) {
        return this.service.getRuns(limit ? Number(limit) : 20);
    }

    @Post('stop')
    @HttpCode(HttpStatus.OK)
    stop() {
        return this.service.stopScraper();
    }

    @Post('cleanup')
    @HttpCode(HttpStatus.OK)
    cleanup(@Query('force') force?: string) {
        return this.service.cleanupStuckRuns(force === 'true');
    }

    @Delete('purge')
    purgeAll() {
        return this.service.purgeAll();
    }

    @Get('stuck-threshold')
    getStuckThreshold() {
        return this.service.getStuckThresholdHours();
    }

    @Post('stuck-threshold')
    @HttpCode(HttpStatus.OK)
    setStuckThreshold(@Body() body: SetThresholdDto) {
        return this.service.setStuckThresholdHours(Number(body.hours));
    }

    @Get('schedule')
    getSchedule() {
        return this.cron.getSchedule();
    }

    @Post('schedule')
    @HttpCode(HttpStatus.OK)
    setSchedule(@Body() body: SetScheduleDto) {
        return this.cron.setSchedule(Number(body.hours));
    }

    @Get('auto-price')
    getAutoPrice() {
        return this.cron.getAutoPriceAfterScrape();
    }

    @Post('auto-price')
    @HttpCode(HttpStatus.OK)
    setAutoPrice(@Body() body: SetAutoPriceDto) {
        return this.cron.setAutoPriceAfterScrape(body.enabled);
    }
}
