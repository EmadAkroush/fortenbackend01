import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReferralsService } from './referrals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('referrals')
@UseGuards(JwtAuthGuard) // تمام مسیرها نیازمند احراز هویت هستند
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  // 📥 ثبت زیرمجموعه جدید (کاربر در پروفایل خودش لیدر را وارد می‌کند)
  @Post('register')
  async registerReferral(
    @Req() req,
    @Body() body: { referrerCode: string },
  ) {
    const userId = req.user.userId; // گرفتن آی‌دی کاربر از JWT
    return this.referralsService.registerReferral(body.referrerCode, userId);
  }

  // 📊 دریافت لیست زیرمجموعه‌ها برای کاربر لاگین‌شده
  @Get()
  async getUserReferrals(@Req() req) {
    const userId = req.user.userId;
    return this.referralsService.getUserReferrals(userId);
  }

  // 🧮 آمار کلی زیرمجموعه‌ها (تعداد، مجموع سود، کل سرمایه‌گذاری)
  @Get('stats')
  async getReferralStats(@Req() req) {
    const userId = req.user.userId;
    return this.referralsService.getReferralStats(userId);
  }

  // 🔍 دریافت جزئیات هر نود (زیرمجموعه خاص)
  @Get('node/:id')
  async getReferralNodeDetails(@Param('id') id: string) {
    return this.referralsService.getReferralNodeDetails(id);
  }

  // 💰 اجرای دستی محاسبه سود ریفرال‌ها (برای تست یا ادمین)
  @Post('calculate-profits')
  async calculateReferralProfits() {
    const result = await this.referralsService.calculateReferralProfits();
    return {
      success: true,
      message: 'Referral profit calculation triggered successfully.',
      result,
    };
  }
}
