import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('activity')
@UseGuards(JwtAuthGuard) // فقط کاربران لاگین‌شده
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  // 🔹 انتقال از profitBalance به mainBalance
  @Post('transfer-profit')
  async transferProfitToMain(
    @Req() req,
    @Body() body: { amount: number },
  ) {
    const userId = req.user.userId || req.user.sub;
    return this.activityService.transferProfitToMain(userId, body.amount);
  }

  // 🔹 انتقال از referralProfit به mainBalance
  @Post('transfer-referral')
  async transferReferralToMain(
    @Req() req,
    @Body() body: { amount: number },
  ) {
    const userId = req.user.userId || req.user.sub;
    return this.activityService.transferReferralToMain(userId, body.amount);
  }

  // 🔹 انتقال از bonusBalance به mainBalance
  @Post('transfer-bonus')
  async transferBonusToMain(
    @Req() req,
    @Body() body: { amount: number },
  ) {
    const userId = req.user.userId || req.user.sub;
    return this.activityService.transferBonusToMain(userId, body.amount);
  }
}
