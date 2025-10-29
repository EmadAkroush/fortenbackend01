import { Controller, Post, Body } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // 🟢 ایجاد پرداخت جدید (قابل انتخاب بودن شبکه)
  @Post('addfunds')
  async addFunds(
    @Body() body: { userId: string; amountUsd: number; network?: string },
  ) {
    const { userId, amountUsd, network } = body;

    if (!userId || !amountUsd) {
      throw new Error('userId and amountUsd are required.');
    }

    return this.paymentsService.createTrxPayment(userId, amountUsd, network || 'TRX');
  }

  // 🟢 مسیر callback برای IPN از NOWPayments
  @Post('ipn')
  async ipnCallback(@Body() body: any) {
    await this.paymentsService.handleIpn(body);
    // ✅ پاسخ برای تأیید دریافت
    return { status: 'ok' };
  }
}
