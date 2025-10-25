import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Payment } from './payment.schema';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TransactionsService } from '../transactions/transactions.service';
import { BonusesService } from '../bonuses/bonuses.service'; // 👈 اضافه شد

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
    private readonly bonusesService: BonusesService, // 👈 اضافه شد
  ) {}

  // 🟢 ایجاد پرداخت TRX جدید
  async createTrxPayment(userId: string, amountUsd: number) {
    try {
      const apiKey = this.config.get('NOWPAYMENTS_API_KEY');
      const appUrl = this.config.get('APP_URL');

      const response = await axios.post(
        'https://api.nowpayments.io/v1/payment',
        {
          price_amount: amountUsd,
          price_currency: 'USD',
          pay_currency: 'TRX',
          order_id: userId,
          ipn_callback_url: `${appUrl}/payments/ipn`,
        },
        {
          headers: { 'x-api-key': apiKey },
        },
      );

      const payment = await this.paymentModel.create({
        userId, // ✅ ذخیره آیدی کاربر
        paymentId: response.data.payment_id,
        status: response.data.payment_status,
        amount: amountUsd,
        currency: 'USD',
        payCurrency: 'TRX',
        payAddress: response.data.pay_address,
      });

      return {
        message: 'Payment created successfully',
        paymentId: payment.paymentId,
        payAddress: response.data.pay_address, // ✅ آدرس پرداخت برای نمایش به کاربر
      };
    } catch (error) {
      this.logger.error('Error creating payment', error);
      throw error;
    }
  }

  // ✅ IPN Handler (تأیید پرداخت و به‌روزرسانی)
  async handleIpn(data: any) {
    const payment = await this.paymentModel.findOne({
      paymentId: data.payment_id,
    });
    if (!payment) return;

    payment.status = data.payment_status;

    if (data.payment_status === 'finished') {
      payment.confirmedAt = new Date();
      payment.txHash = data.payin_hash;

      // 🔹 ثبت تراکنش
      await this.transactionsService.createTransaction({
        userId: payment.userId,
        type: 'deposit',
        amount: payment.amount,
        currency: 'USD',
        status: 'completed',
        note: `Deposit confirmed via NOWPayments (TRX) #${payment.paymentId}`,
      });

      // 🔹 افزایش موجودی حساب اصلی
      await this.usersService.addBalance(
        payment.userId,
        'mainBalance',
        payment.amount,
      );

      // 🎁 بررسی پاداش لیدر (فقط اولین سپرده بالای 100 دلار)
      try {
        await this.bonusesService.checkAndAwardReferralBonus(
          payment.userId,
          payment.amount,
        );
      } catch (bonusError) {
        this.logger.warn(
          `Bonus check failed for user ${payment.userId}: ${bonusError.message}`,
        );
      }
    }

    await payment.save();
  }
}
