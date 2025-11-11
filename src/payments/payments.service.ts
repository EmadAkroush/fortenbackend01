import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { Payment } from './payment.schema';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TransactionsService } from '../transactions/transactions.service';
import { BonusesService } from '../bonuses/bonuses.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
    private readonly bonusesService: BonusesService,
  ) {}

  // 🟢 ایجاد پرداخت آزاد (کاربر هر مبلغی پرداخت کند قبول شود)
  // 🟢 ایجاد پرداخت آزاد با مبلغ حداقل
  async createTrxPayment(userId: string, amountUsd: number, network: string) {
    this.logger.log(
      `📤 [createTrxPayment] User: ${userId}, Network: ${network}`,
    );

    try {
      const apiKey = this.config.get('NOWPAYMENTS_API_KEY');
      const appUrl = this.config.get('APP_URL');

      if (!apiKey)
        throw new Error(
          'Server configuration error: Missing NOWPAYMENTS_API_KEY',
        );
      if (!appUrl)
        throw new Error('Server configuration error: Missing APP_URL');

      const supportedNetworks = ['MATIC', 'USDTBSC', 'BNBBSC', 'USDTMATIC'];
      if (!supportedNetworks.includes(network)) {
        this.logger.warn(`⚠️ Unsupported network requested: ${network}`);
        throw new Error(`Unsupported payment network: ${network}`);
      }

      // 💡 استفاده از مبلغ حداقل (1 دلار) برای NowPayments
      // کاربر می‌تواند بیشتر از این مبلغ پرداخت کند
      const minimalAmount = 1;

      const response = await axios.post(
        'https://api.nowpayments.io/v1/invoice',
        {
          price_amount: minimalAmount, // اجباری - مبلغ حداقل
          price_currency: 'USD',
          pay_currency: network,
          order_id: `${userId}_${Date.now()}`,
          ipn_callback_url: `${appUrl}/payments/ipn`,
          is_fixed_rate: false,
          is_fee_paid_by_user: false,
        },
        {
          headers: { 'x-api-key': apiKey },
          timeout: 15000,
        },
      );

      if (!response.data?.payment_id || !response.data?.pay_address) {
        throw new Error('Invalid response from NOWPayments API');
      }

      // 🧾 ذخیره در دیتابیس
      const payment = await this.paymentModel.create({
        userId,
        paymentId: response.data.payment_id,
        status: response.data.payment_status,
        amount: minimalAmount, // مقدار درخواستی (حداقل)
        actualAmount: 0, // مقدار واقعی که کاربر پرداخت می‌کند
        currency: 'USD',
        payCurrency: network.toUpperCase(),
        payAddress: response.data.pay_address,
      });

      // ✅ تراکنش اولیه
      await this.transactionsService.createTransaction({
        userId,
        type: 'deposit',
        amount: minimalAmount,
        currency: 'USD',
        status: 'pending',
        note: `Flexible payment created (${network.toUpperCase()}) - Min: $${minimalAmount} #${payment.paymentId}`,
      });

      return {
        success: true,
        message: `Payment address generated. Minimum amount: $${minimalAmount}`,
        paymentId: payment.paymentId,
        payAddress: response.data.pay_address,
        payCurrency: network.toUpperCase(),
        minAmount: minimalAmount,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `❌ [AxiosError] ${error.message}`,
          JSON.stringify(error.response?.data || {}, null, 2),
        );
        // خطای واضح‌تر برای کاربر
        throw new Error(
          `Payment gateway error: ${error.response?.data?.message || error.message}`,
        );
      } else {
        this.logger.error(
          '❌ [Free Payment Creation Error]',
          error.stack || error.message,
        );
        throw new Error(error?.message || 'Payment creation failed');
      }
    }
  }
  // ✅ IPN Handler اصلاح شده
  async handleIpn(data: any) {
    this.logger.log(`📩 [IPN Received] Data: ${JSON.stringify(data, null, 2)}`);

    const payment = await this.paymentModel.findOne({
      paymentId: data.payment_id,
    });

    if (!payment) {
      this.logger.warn(
        `⚠️ No matching payment found for IPN (id: ${data.payment_id})`,
      );
      return;
    }

    // 🔄 به‌روزرسانی وضعیت
    payment.status = data.payment_status;

    // 💰 اگر مبلغ واقعی از NowPayments دریافت شده، آن را ذخیره کنید
    if (data.actually_paid) {
      payment.actualAmount = data.actually_paid;
    }

    // 🧾 همیشه لاگ تراکنش IPN
    await this.transactionsService.createTransaction({
      userId: payment.userId,
      type: 'deposit',
      amount: payment.actualAmount || payment.amount,
      currency: 'USD',
      status: data.payment_status,
      note: `IPN update: ${data.payment_status} (${payment.payCurrency}) #${payment.paymentId}`,
    });

    if (data.payment_status === 'finished') {
      this.logger.log(`✅ Payment finished for user: ${payment.userId}`);

      payment.confirmedAt = new Date();
      payment.txHash = data.payin_hash;

      // 💵 افزودن موجودی واقعی به کاربر
      const finalAmount = payment.actualAmount || payment.amount;
      await this.usersService.addBalance(
        payment.userId,
        'mainBalance',
        finalAmount,
      );

      // 🎁 بررسی پاداش لیدر
      try {
        await this.bonusesService.checkAndAwardReferralBonus(
          payment.userId,
          finalAmount,
        );
      } catch (bonusError) {
        this.logger.warn(
          `⚠️ Bonus check failed for user ${payment.userId}: ${bonusError.message}`,
        );
      }
    }

    await payment.save();
    this.logger.log(
      `💾 Payment updated in DB: ${payment.paymentId} | Status: ${payment.status} | Amount: ${payment.actualAmount}`,
    );
  }
}
