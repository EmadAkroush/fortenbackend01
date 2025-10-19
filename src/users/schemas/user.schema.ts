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
  avatar?: string;

  @Prop({ required: true })
  password: string;

  // ===== Wallet & Referral =====
  @Prop({ default: null })
  wallet?: string;

  @Prop({ unique: true })
  vxCode: string; // referral code

  @Prop({ default: null })
  referredBy?: string;

  @Prop({ type: [String], default: [] })
  referrals?: string[];

  // ===== Financial Balances =====
  @Prop({ type: Number, default: 0 })
  mainBalance: number;

  @Prop({ type: Number, default: 0 })
  profitBalance: number;

  @Prop({ type: Number, default: 0 })
  referralProfit: number;

  @Prop({ type: Number, default: 0 })
  bonusBalance: number;

  // ===== Security =====
  @Prop({ default: false })
  twoFAEnabled: boolean;

  @Prop({ default: null })
  twoFASecret?: string;

  // ===== Meta =====
  @Prop({ default: 'user' })
  role: string;

  @Prop({ default: Date.now })
  lastLogin: Date;

  @Prop({ default: true })
  isActive: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
