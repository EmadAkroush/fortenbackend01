import { Controller } from '@nestjs/common';
import { BonusesService } from './bonuses.service';

@Controller('bonuses')
export class BonusesController {
  constructor(private readonly bonusesService: BonusesService) {}
}
