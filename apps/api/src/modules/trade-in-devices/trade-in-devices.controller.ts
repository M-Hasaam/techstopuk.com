import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TradeInDevicesService, CreateTradeInDeviceDto } from './trade-in-devices.service';

@Controller('trade-in-devices')
export class TradeInDevicesController {
    constructor(private readonly service: TradeInDevicesService) {}

    // Public — returns active devices for DeviceSearchBox fuzzy search
    @Get()
    findAll(@Query('all') all?: string) {
        return this.service.findAll(all !== 'true');
    }

    @Post()
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    create(@Body() dto: CreateTradeInDeviceDto) {
        return this.service.create(dto);
    }

    @Patch(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    update(@Param('id') id: string, @Body() dto: Partial<CreateTradeInDeviceDto>) {
        return this.service.update(id, dto);
    }

    @Delete('all')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    removeAll() {
        return this.service.removeAll();
    }

    @Post('seed')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    seedDefaults() {
        return this.service.seedDefaults();
    }

    @Delete(':id')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN')
    remove(@Param('id') id: string) {
        return this.service.remove(id);
    }
}
