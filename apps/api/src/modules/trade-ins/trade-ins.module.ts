import { Module } from '@nestjs/common';
import { TradeInsController } from './trade-ins.controller';
import { TradeInsService } from './trade-ins.service';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../../common/services/storage.module';
import { EmailModule } from '../../common/services/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ShippingModule } from '../shipping/shipping.module';
import { ScraperDataModule } from '../scraper-data/scraper-data.module';
import { ProductPricingModule } from '../product-pricing/product-pricing.module';

@Module({
    imports: [DatabaseModule, StorageModule, EmailModule, NotificationsModule, ShippingModule, ScraperDataModule, ProductPricingModule],
    controllers: [TradeInsController],
    providers: [TradeInsService],
})
export class TradeInsModule {}
