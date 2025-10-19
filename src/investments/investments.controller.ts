import { Body, Controller, Get, Param, Post, Delete } from '@nestjs/common';
import { InvestmentsService } from './investments.service';
import { CreateInvestmentDto } from './dto/create-investment.dto';

@Controller('investments')
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  // 🟢 ایجاد سرمایه‌گذاری جدید
  @Post()
  async create(@Body() dto: CreateInvestmentDto) {
    return this.investmentsService.createInvestment(dto);
  }

  // 🟣 لیست سرمایه‌گذاری‌های کاربر
  @Get('user/:userId')
  async getUserInvestments(@Param('userId') userId: string) {
    return this.investmentsService.getUserInvestments(userId);
  }

  // 🟠 محاسبه سود روزانه (می‌تونه CronJob باشه)
  @Post('calculate-profits')
  async calculateProfits() {
    return this.investmentsService.calculateDailyProfits();
  }

  // 🔴 لغو سرمایه‌گذاری
  @Delete(':id')
  async cancel(@Param('id') id: string) {
    return this.investmentsService.cancelInvestment(id);
  }
}
