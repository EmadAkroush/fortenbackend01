import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('add-funds')
  async addFunds(
    @Req() req,
    @Body() body: { amountUsd: number },
  ) {
    const userId = req.user.sub; // ✅ مقدار درست از JWT
    return this.paymentsService.createTrxPayment(userId, body.amountUsd);
  }

  // مسیر callback برای IPN
  @Post('ipn')
  async ipnCallback(@Body() body: any) {
    await this.paymentsService.handleIpn(body);
    // پاسخ 200 برای NOWPayments
    return { status: 'ok' };
  }
}
