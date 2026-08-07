import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TradeInQuestionsService } from './trade-in-questions.service';
import { UpsertQuestionDto } from './dto/upsert-question.dto';

@Controller('trade-in-questions')
export class TradeInQuestionsController {
    constructor(private readonly service: TradeInQuestionsService) {}

    // Public — trade-in wizard's Quick Check step. ?all=true (used by the admin panel)
    // also returns inactive questions, mirroring /trade-in-devices' convention.
    @Get()
    findAll(@Query('all') all?: string, @Query('category') category?: string) {
        return this.service.findAll(all !== 'true', category);
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    create(@Body() dto: UpsertQuestionDto) {
        return this.service.create(dto);
    }

    @Post('seed')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    seedDefaults() {
        return this.service.seedDefaults();
    }

    @Delete('all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    removeAll() {
        return this.service.removeAll();
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    update(@Param('id') id: string, @Body() dto: UpsertQuestionDto) {
        return this.service.update(id, dto);
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
