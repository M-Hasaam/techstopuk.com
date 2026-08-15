import { Module } from '@nestjs/common';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';
import { DatabaseModule } from '../database/database.module';
import { SettingsModule } from '../settings/settings.module';
import { TradeInQuestionsModule } from '../trade-in-questions/trade-in-questions.module';

@Module({
    imports: [DatabaseModule, SettingsModule, TradeInQuestionsModule],
    controllers: [SeedController],
    providers: [SeedService],
})
export class SeedModule {}
