import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Transaction } from './schemas/transactions.schema';

@Injectable()
export class TransactionsService {
  constructor(@InjectModel(Transaction.name) private transactionModel: Model<Transaction>) {}

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
}
