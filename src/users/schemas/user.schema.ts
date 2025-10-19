import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class User extends Document {
  // ===== Basic Profile =====
  @Prop({ required: true, unique: true })
  username: string;

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true, lowercase: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop({ default: null })
  avatar?: string; // آدرس عکس پروفایل

  @Prop({ required: true })
  password: string;

  // ===== Wallet & Referral =====
  @Prop({ default: null })
  wallet?: string;

  @Prop({ unique: true })
  vxCode: string; // کد FO یا referral code

  @Prop({ default: null })
  referredBy?: string; // چه کسی دعوت کرده

  @Prop({ type: [String], default: [] })
  referrals?: string[]; // لیست زیرمجموعه‌ها

  // ===== Financial Balances =====
  @Prop({ type: Number, default: 0 })
  mainBalance: number; // حساب اصلی (سپرده قابل استفاده)

  @Prop({ type: Number, default: 0 })
  profitBalance: number; // سود پکیج‌ها

  @Prop({ type: Number, default: 0 })
  referralProfit: number; // سود زیرمجموعه‌ها

  @Prop({ type: Number, default: 0 })
  bonusBalance: number; // بونوس‌ها یا پاداش‌ها

  // ===== Security =====
  @Prop({ default: false })
  twoFAEnabled: boolean; // فعال بودن احراز دو مرحله‌ای

  @Prop({ default: null })
  twoFASecret?: string;

  // ===== Meta Info =====
  @Prop({ default: 'user' })
  role: string;

  @Prop({ default: Date.now })
  lastLogin: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
