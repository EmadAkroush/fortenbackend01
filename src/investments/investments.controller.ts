import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Delete,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InvestmentsService } from './investments.service';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('investments')
@UseGuards(JwtAuthGuard)
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  // 🟢 ایجاد یا ارتقای سرمایه‌گذاری
  @Post()
  async createOrUpgrade(@Req() req, @Body() dto: CreateInvestmentDto) {
    const userId = req.user.userId;
    return this.investmentsService.createInvestment({ ...dto, user: userId });
  }

  // 🟣 لیست سرمایه‌گذاری‌های کاربر لاگین‌شده
  @Get('my')
  async getMyInvestments(@Req() req) {
    const userId = req.user.userId;
    return this.investmentsService.getUserInvestments(userId);
  }

  // 🟢 لیست سرمایه‌گذاری‌های هر کاربر (برای ادمین)
  @Get('user/:userId')
  async getUserInvestments(@Param('userId') userId: string) {
    return this.investmentsService.getUserInvestments(userId);
  }

  // 🟠 اجرای دستی محاسبه سود روزانه
  @Post('calculate-profits')
  async calculateProfits() {
    return this.investmentsService.calculateDailyProfits();
  }

  // 🔴 لغو سرمایه‌گذاری و بازگشت وجه
  @Delete(':id')
  async cancel(@Param('id') id: string) {
    return this.investmentsService.cancelInvestment(id);
  }
}
