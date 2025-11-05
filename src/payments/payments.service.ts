// ===========================
// ✅ PaymentsService (نسخه‌ی بهینه و ایمن)
// ===========================

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Payment } from '../payments/payment.schema';
import { UsersService } from '../users/users.service';
import { TransactionsService } from '../transactions/transactions.service';
import { BonusesService } from '../bonuses/bonuses.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
    private readonly bonusesService: BonusesService,
  ) {}

  // 🟢 ایجاد پرداخت جدید با انتخاب شبکه (TRX, BTC, USDT, ...)
  async createTrxPayment(userId: string, amountUsd: number, network: string) {
    this.logger.log(
      `📤 [createTrxPayment] User: ${userId}, Amount: ${amountUsd}, Network: ${network}`,
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

      // 🟢 درخواست ایجاد پرداخت در NowPayments
      const response = await axios.post(
        'https://api.nowpayments.io/v1/payment',
        {
          price_amount: amountUsd,
          price_currency: 'USD',
          pay_currency: network,
          order_id: userId,
          ipn_callback_url: `${appUrl}/payments/ipn`,
        },
        {
          headers: { 'x-api-key': apiKey },
          timeout: 15000,
        },
      );

      const { payment_id, pay_address, payment_status } = response.data;

      if (!payment_id || !pay_address)
        throw new Error('Invalid response from NOWPayments API');

      // 🧾 ذخیره در دیتابیس (تبدیل همه چیز به رشته ایمن)
      const payment = await this.paymentModel.create({
        userId,
        paymentId: String(payment_id),
        status: payment_status || 'pending',
        amount: amountUsd,
        currency: 'USD',
        payCurrency: network.toUpperCase(),
        payAddress: pay_address,
      });

      // ✅ ثبت تراکنش اولیه
      await this.transactionsService.createTransaction({
        userId,
        type: 'deposit',
        amount: amountUsd,
        currency: 'USD',
        status: 'pending',
        note: `Payment created (${network.toUpperCase()}) #${String(payment_id)}`,
      });

      this.logger.log(
        `✅ Payment created successfully | paymentId=${payment.paymentId}`,
      );

      return {
        success: true,
        message: 'Payment created successfully',
        paymentId: payment.paymentId,
        payAddress: payment.payAddress,
        payCurrency: network.toUpperCase(),
      };
    } catch (error) {
      if (axios.isAxiosError(error))
        this.logger.error(
          `❌ [AxiosError] ${error.message}`,
          JSON.stringify(error.response?.data || {}, null, 2),
        );
      else
        this.logger.error(
          '❌ [Payment Creation Error]',
          error.stack || error.message,
        );

      throw new Error(error?.message || 'Payment creation failed');
    }
  }

  // ✅ IPN Handler (تأیید پرداخت و به‌روزرسانی)
  async handleIpn(data: any) {
    this.logger.log(`📩 [IPN Received] Data: ${JSON.stringify(data, null, 2)}`);

    // 🔍 پیدا کردن پرداخت (با id یا parent id)
    const payment = await this.paymentModel.findOne({
      $or: [
        { paymentId: String(data.payment_id) },
        { paymentId: String(data.parent_payment_id) },
      ],
    });

    if (!payment) {
      this.logger.warn(
        `⚠️ No matching payment found for IPN (id: ${data.payment_id})`,
      );
      return;
    }

    // ⏳ به‌روزرسانی وضعیت
    payment.status = data.payment_status || payment.status;

    // 🧾 لاگ‌گذاری هر نوع IPN
    await this.transactionsService.createTransaction({
      userId: payment.userId,
      type: 'deposit',
      amount: payment.amount,
      currency: 'USD',
      status: data.payment_status,
      note: `IPN update: ${data.payment_status} (${payment.payCurrency}) #${payment.paymentId}`,
    });

    // ✅ پرداخت موفق
    if (data.payment_status === 'finished') {
      this.logger.log(`✅ Payment finished for user: ${payment.userId}`);

      payment.confirmedAt = new Date();
      payment.txHash = data.payin_hash || payment.txHash;

      // 💰 افزودن موجودی به حساب کاربر
      try {
        await this.usersService.addBalance(
          payment.userId,
          'mainBalance',
          payment.amount,
        );
        this.logger.log(
          `💰 Balance updated successfully for user: ${payment.userId}`,
        );
      } catch (err) {
        this.logger.error(
          `❌ Failed to update user balance: ${payment.userId}`,
          err.message,
        );
      }

      // 🎁 بررسی پاداش لیدر
      try {
        await this.bonusesService.checkAndAwardReferralBonus(
          payment.userId,
          payment.amount,
        );
      } catch (bonusError) {
        this.logger.warn(
          `⚠️ Bonus check failed for user ${payment.userId}: ${bonusError.message}`,
        );
      }
    }

    await payment.save();
    this.logger.log(
      `💾 Payment updated in DB: ${payment.paymentId} | Status: ${payment.status}`,
    );
  }
}
