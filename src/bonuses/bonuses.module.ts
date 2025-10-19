import { Module } from '@nestjs/common';
import { BonusesService } from './bonuses.service';
import { BonusesController } from './bonuses.controller';

@Module({
  controllers: [BonusesController],
  providers: [BonusesService],
})
export class BonusesModule {}
