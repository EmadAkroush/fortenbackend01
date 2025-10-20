import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { Payment } from './payment.schema';
import { UsersService } from '../users/users.service';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    private readonly config: ConfigService,
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService,
  ) {}

  /**
   * ✅ مرحله اول: ساخت پرداخت TRX با NOWPayments
   */
  async createTrxPayment(userId: string, amountUsd: number) {
    try {
      const apiKey = this.config.get('NOWPAYMENTS_API_KEY');
      const appUrl = this.config.get('APP_URL') || 'http://127.0.0.1:3000';

      if (!apiKey) throw new Error('NOWPayments API key missing');

      const createResp = await axios.post(
        'https://api.nowpayments.io/v1/payment',
        {
          price_amount: amountUsd,
          price_currency: 'usd',
          pay_currency: 'trx',
          order_id: userId,
          ipn_callback_url: `${appUrl}/payments/ipn`,
        },
        {
          headers: {
            'x-api-key': apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      const data = createResp.data;

      // ثبت در دیتابیس
      const payment = await this.paymentModel.create({
        userId,
        amount: amountUsd,
        currency: 'TRX',
        paymentId: data.payment_id,
        status: data.payment_status || 'waiting',
        payAddress: data.pay_address,
        payAmount: data.pay_amount,
        statusUrl: data.invoice_url,
      });

      this.logger.log(`Payment created for user ${userId} | ID: ${data.payment_id}`);

      return {
        success: true,
        paymentId: data.payment_id,
        address: data.pay_address,
        payAmount: data.pay_amount,
        redirect: data.invoice_url,
      };
    } catch (error) {
      this.logger.error('Error creating payment', error.response?.data || error.message);
      throw new HttpException('Payment creation failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * ✅ مرحله دوم: مدیریت IPN callback از NOWPayments
   */
  async handleIpn(data: any) {
    try {
      this.logger.log(`Received IPN for payment ${data.payment_id}`);

      const payment = await this.paymentModel.findOne({ paymentId: data.payment_id });
      if (!payment) {
        this.logger.warn(`Payment ${data.payment_id} not found`);
        return;
      }

      payment.status = data.payment_status;

      if (data.payment_status === 'finished') {
        payment.confirmedAt = new Date();
        payment.txHash = data.payin_hash;
        await payment.save();

        // لاگ تراکنش
        await this.transactionsService.createTransaction({
          userId: payment.userId,
          type: 'deposit',
          amount: payment.amount,
          currency: 'USD',
          status: 'completed',
          note: `Deposit confirmed via NOWPayments TRX | TX: ${data.payin_hash}`,
        });

        // بروزرسانی موجودی حساب اصلی
        await this.usersService.updateBalance(payment.userId, 'mainBalance', payment.amount);

        this.logger.log(`Payment ${payment.paymentId} confirmed and user ${payment.userId} credited`);
      } else {
        await payment.save();
        this.logger.log(`Payment ${payment.paymentId} updated: ${data.payment_status}`);
      }
    } catch (error) {
      this.logger.error('IPN Handling Error', error.message);
    }
  }

  /**
   * ✅ بررسی وضعیت پرداخت (در صورت نیاز برای Admin Panel)
   */
  async checkPaymentStatus(paymentId: string) {
    const apiKey = this.config.get('NOWPAYMENTS_API_KEY');
    const resp = await axios.get(`https://api.nowpayments.io/v1/payment/${paymentId}`, {
      headers: { 'x-api-key': apiKey },
    });
    return resp.data;
  }
}
