import {
    Controller, Get, Post, Param, Query,
    HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ProductPricingService } from './product-pricing.service';
import { JwtAuthGuard }          from '../../common/guards/jwt-auth.guard';
import { RolesGuard }            from '../../common/guards/roles.guard';
import { Roles }                 from '../../common/decorators/roles.decorator';

@Controller('product-pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ProductPricingController {
    constructor(private readonly service: ProductPricingService) {}

    @Post('run')
    @HttpCode(HttpStatus.OK)
    run() {
        return this.service.startPriceCatalog();
    }

    @Get('run/status')
    runStatus() {
        return this.service.getJobStatus();
    }

    @Post('product/:id')
    @HttpCode(HttpStatus.OK)
    priceOne(@Param('id') id: string) {
        return this.service.priceProduct(id);
    }

    @Get('estimate')
    estimate(
        @Query('brand')     brand:     string,
        @Query('model')     model:     string,
        @Query('storage')   storage:   string,
        @Query('condition') condition: string,
        @Query('ram')       ram?:      string,
    ) {
        return this.service.getEstimate(
            brand     ?? '',
            model     ?? '',
            storage   ?? '',
            condition ?? 'Good',
            ram       ?? '',
        );
    }

    @Get('flagged')
    flagged() {
        return this.service.getFlaggedProducts();
    }

    @Get('ranges')
    ranges() {
        return this.service.getPricingRanges();
    }
}
