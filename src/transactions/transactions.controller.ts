import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // 🔹 دریافت لیست تراکنش‌های کاربر
  @UseGuards(JwtAuthGuard)
  @Get('my')
  async getUserTransactions(@Req() req) {
    const userId = req.user.sub;
    return this.transactionsService.getUserTransactions(userId);
  }

  // 🔹 مشاهده جزئیات تراکنش خاص
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getTransaction(@Param('id') id: string) {
    const tx = await this.transactionsService.getTransactionById(id);
    if (!tx) throw new BadRequestException('Transaction not found');
    return tx;
  }

  // 🔹 ایجاد تراکنش جدید (مثلاً توسط مدیر یا برای تست)
  @UseGuards(JwtAuthGuard)
  @Post('create')
  async createTransaction(@Req() req, @Body() body: {
    type: string;
    amount: number;
    currency?: string;
    note?: string;
  }) {
    const userId = req.user.sub;
    return this.transactionsService.createTransaction({
      userId,
      type: body.type,
      amount: body.amount,
      currency: body.currency,
      status: 'completed',
      note: body.note || 'Manual transaction',
    });
  }

  // 🔹 درخواست برداشت از حساب (10٪ کارمزد)
  @UseGuards(JwtAuthGuard)
  @Post('withdraw')
  async requestWithdrawal(@Req() req, @Body() body: { amount: number }) {
    const userId = req.user.sub;
    if (!body.amount || body.amount <= 0) {
      throw new BadRequestException('Invalid withdrawal amount');
    }

    return this.transactionsService.requestWithdrawal(userId, body.amount);
  }
}
