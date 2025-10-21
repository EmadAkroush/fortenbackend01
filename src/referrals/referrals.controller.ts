import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('set-leader')
  async setLeader(@Req() req, @Body() body: { referrerCode: string }) {
    const userId = req.user.userId;
    return this.referralsService.registerReferral(body.referrerCode, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-team')
  async getMyTeam(@Req() req) {
    const userId = req.user.userId;
    return this.referralsService.getUserReferrals(userId);
  }

  // 📊 مسیر جدید برای آمار کلی ریفرال‌ها
  @UseGuards(JwtAuthGuard)
  @Get('stats')
  async getReferralStats(@Req() req) {
    const userId = req.user.userId;
    return this.referralsService.getReferralStats(userId);
  }
}
