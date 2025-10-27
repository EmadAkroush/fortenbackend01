import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('referrals')
@UseGuards(JwtAuthGuard)
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  // 📊 لیست زیرمجموعه‌ها
  @Get()
  async getUserReferrals(@Req() req) {
    return this.referralsService.getUserReferrals(req.user.userId);
  }

  // 📈 آمار کلی
  @Get('stats')
  async getReferralStats(@Req() req) {
    return this.referralsService.getReferralStats(req.user.userId);
  }

  // 🔍 جزئیات نود خاص
  @Get('node/:id')
  async getReferralNodeDetails(@Param('id') id: string) {
    return this.referralsService.getReferralNodeDetails(id);
  }

  // 🧾 تاریخچه تراکنش‌های ریفرال برای داشبورد
  @Get('transactions/my')
  async getReferralTransactions(@Req() req) {
    return this.referralsService.getReferralTransactions(req.user.userId);
  }
}
