import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Query,
    Request,
    UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TradeInsService } from './trade-ins.service';
import { CreateTradeInDto } from './dto/create-trade-in.dto';
import { UpdateTradeInDto } from './dto/update-trade-in.dto';
import { ApproveTradeInDto } from './dto/approve-trade-in.dto';
import { RejectTradeInDto } from './dto/reject-trade-in.dto';
import { CounterOfferTradeInDto } from './dto/counter-offer-trade-in.dto';
import { AiPriceDto } from './dto/ai-price.dto';
import { SuggestSpecsDto } from './dto/suggest-specs.dto';

@Controller('trade-ins')
export class TradeInsController {
    constructor(private readonly tradeInsService: TradeInsService) {}

    // Public – submit without account, but links to user if authenticated
    @Post()
    @UseGuards(OptionalJwtAuthGuard)
    submit(@Body() dto: CreateTradeInDto, @Request() req: { user?: { id: string } }) {
        return this.tradeInsService.submit(dto, req.user?.id);
    }

    // Authenticated user – their own submissions
    @Get('my')
    @UseGuards(JwtAuthGuard)
    findMine(@CurrentUser() user: { id: string }) {
        return this.tradeInsService.findByUser(user.id);
    }

    @Get('my/:id')
    @UseGuards(JwtAuthGuard)
    findMineById(@Param('id') id: string, @CurrentUser() user: { id: string }) {
        return this.tradeInsService.findByIdForUser(id, user.id);
    }

    @Post('my/:id/accept-counter')
    @UseGuards(JwtAuthGuard)
    acceptCounter(@Param('id') id: string, @CurrentUser() user: { id: string }) {
        return this.tradeInsService.acceptCounterOffer(id, user.id);
    }

    @Post('my/:id/decline-counter')
    @UseGuards(JwtAuthGuard)
    declineCounter(@Param('id') id: string, @CurrentUser() user: { id: string }) {
        return this.tradeInsService.declineCounterOffer(id, user.id);
    }

    // Public — AI-powered price estimate (uses OpenAI Vision if images provided).
    // Tightly throttled: unauthenticated and hits a real, billed OpenAI call.
    @Post('ai-price')
    @Throttle({ default: { limit: 5, ttl: 60000 } })
    aiPrice(@Body() dto: AiPriceDto) {
        return this.tradeInsService.aiPrice(dto);
    }

    // Public — AI-generated spec fields for unlisted/custom devices
    @Post('suggest-specs')
    @Throttle({ default: { limit: 10, ttl: 60000 } })
    suggestSpecs(@Body() dto: SuggestSpecsDto) {
        return this.tradeInsService.suggestSpecs(dto.brand, dto.model, dto.category);
    }

    // Public reference lookup (for confirmation page)
    @Get('ref/:reference')
    findByRef(@Param('reference') reference: string) {
        return this.tradeInsService.findByReference(reference);
    }

    // Public — lets a guest (no account) respond to a counter-offer from the link in
    // their email. The reference is the same identifier already treated as a public
    // bearer token by the lookup above.
    @Post('ref/:reference/accept-counter')
    acceptCounterByRef(@Param('reference') reference: string) {
        return this.tradeInsService.acceptCounterOfferByReference(reference);
    }

    @Post('ref/:reference/decline-counter')
    declineCounterByRef(@Param('reference') reference: string) {
        return this.tradeInsService.declineCounterOfferByReference(reference);
    }

    // Public statistics for trade-in page
    @Get('stats')
    getPublicStats() {
        return this.tradeInsService.getPublicStats();
    }

    // Admin routes
    @Get()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    findAll(
        @Query('status') status?: string,
        @Query('search') search?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.tradeInsService.findAll({
            status,
            search: search || undefined,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
        });
    }

    @Get(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    findOne(@Param('id') id: string) {
        return this.tradeInsService.findById(id);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    update(@Param('id') id: string, @Body() dto: UpdateTradeInDto) {
        return this.tradeInsService.update(id, dto);
    }

    @Post(':id/review')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    markUnderReview(@Param('id') id: string) {
        return this.tradeInsService.markUnderReview(id);
    }

    @Post(':id/approve')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    approve(@Param('id') id: string, @Body() dto: ApproveTradeInDto) {
        return this.tradeInsService.approve(id, dto);
    }

    @Post(':id/reject')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    reject(@Param('id') id: string, @Body() dto: RejectTradeInDto) {
        return this.tradeInsService.reject(id, dto);
    }

    @Post(':id/counter-offer')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    counterOffer(@Param('id') id: string, @Body() dto: CounterOfferTradeInDto) {
        return this.tradeInsService.counterOffer(id, dto);
    }

    @Post(':id/complete')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    complete(@Param('id') id: string) {
        return this.tradeInsService.complete(id);
    }

    @Post(':id/resend-label')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    resendLabel(@Param('id') id: string) {
        return this.tradeInsService.resendShippingLabel(id);
    }

    @Delete('purge')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    purgeAll() {
        return this.tradeInsService.purgeAll();
    }
}
