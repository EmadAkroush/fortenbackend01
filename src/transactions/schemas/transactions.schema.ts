import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Transaction extends Document {
  @Prop({ required: true })
  userId: string; // شناسه کاربر

  @Prop({ required: true })
  type: string; // deposit, withdraw, profit, referral, bonus

  @Prop({ required: true })
  amount: number; // مبلغ تراکنش

  @Prop({ default: 'pending' })
  status: string; // pending, completed, failed

  @Prop({ default: 'USD' })
  currency: string; // واحد پول (TRX, USD)

  @Prop({ default: null })
  paymentId?: string; // شناسه پرداخت NOWPayments

  @Prop({ default: null })
  statusUrl?: string; // لینک وضعیت پرداخت (invoice URL)

  @Prop({ default: null })
  note?: string; // توضیحات اضافی

  @Prop({ default: null })
  txHash?: string; // هش تراکنش (اگر بلاک‌چینی باشد)
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
