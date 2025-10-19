import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Investment extends Document {
  // ارتباط با کاربر
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;

  // ارتباط با پکیج
  @Prop({ type: Types.ObjectId, ref: 'Package', required: true })
  package: Types.ObjectId;

  // مبلغ سرمایه‌گذاری
  @Prop({ type: Number, required: true })
  amount: number;

  // درصد روزانه (از پکیج گرفته میشه ولی قابل override هست)
  @Prop({ type: Number, required: true })
  dailyRate: number;

  // سود فعلی (مجموع تا این لحظه)
  @Prop({ type: Number, default: 0 })
  totalProfit: number;

  // مبلغ برداشت‌شده
  @Prop({ type: Number, default: 0 })
  withdrawn: number;

  // وضعیت سرمایه‌گذاری
  @Prop({ type: String, enum: ['active', 'completed', 'canceled'], default: 'active' })
  status: string;

  // تاریخ شروع و پایان
  @Prop({ type: Date, default: Date.now })
  startDate: Date;

  @Prop({ type: Date })
  endDate?: Date;

  // رفرال‌های فعال برای این پکیج
  @Prop({ type: Number, default: 0 })
  activeReferrals: number;

  @Prop({ type: Number, default: 0 })
  requiredReferrals: number;

  // نرخ ارتقا یافته (درصورت فعال شدن با رفرال)
  @Prop({ type: Number, default: 0 })
  upgradedRate: number;

  // توضیحات
  @Prop({ type: String, default: '' })
  notes: string;
}

export const InvestmentSchema = SchemaFactory.createForClass(Investment);
