import { Module } from '@nestjs/common';
import { TradeInQuestionsController } from './trade-in-questions.controller';
import { TradeInQuestionsService } from './trade-in-questions.service';
import { StorageModule } from '../../common/services/storage.module';

@Module({
    imports: [StorageModule],
    controllers: [TradeInQuestionsController],
    providers: [TradeInQuestionsService],
    exports: [TradeInQuestionsService],
})
export class TradeInQuestionsModule {}
