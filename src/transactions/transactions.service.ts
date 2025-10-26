import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transaction } from './schemas/transactions.schema';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<Transaction>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  // 🔹 ایجاد تراکنش جدید
  async createTransaction(data: {
    userId: string;
    type: string;
    amount: number;
    currency?: string;
    status?: string;
    paymentId?: string;
    statusUrl?: string;
    note?: string;
    txHash?: string;
  }) {
    const newTx = new this.transactionModel({
      ...data,
      currency: data.currency || 'USD',
      status: data.status || 'pending',
    });
    return await newTx.save();
  }

  // 🔹 آپدیت وضعیت تراکنش بر اساس paymentId
  async updateTransactionStatus(paymentId: string, status: string, txHash?: string) {
    return await this.transactionModel.findOneAndUpdate(
      { paymentId },
      { status, txHash },
      { new: true },
    );
  }

  // 🔹 لیست تراکنش‌های کاربر
  async getUserTransactions(userId: string) {
    return await this.transactionModel.find({ userId }).sort({ createdAt: -1 }).lean();
  }

  // 🔹 گرفتن جزئیات تراکنش خاص
  async getTransactionById(id: string) {
    return await this.transactionModel.findById(id);
  }

  // 🟥 برداشت از حساب (با 10٪ کارمزد)
  async requestWithdrawal(userId: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Invalid withdrawal amount');
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.mainBalance < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // 💰 کم کردن از حساب کاربر
    user.mainBalance -= amount;
    await user.save();

    // محاسبه مبلغ خالص دریافتی بعد از کارمزد
    const netAmount = amount * 0.9;

    // 📘 ثبت تراکنش برداشت
    const tx = new this.transactionModel({
      userId,
      type: 'withdraw',
      amount,
      currency: 'USD',
      status: 'pending', // مدیر بعداً تأیید می‌کند
      note: `Withdrawal request submitted. User will receive ${netAmount.toFixed(2)} USD after 10% fee.`,
    });

    return await tx.save();
  }
}
