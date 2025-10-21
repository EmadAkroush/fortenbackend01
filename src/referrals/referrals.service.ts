import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Referral } from './schemas/referrals.schema';
import { UsersService } from '../users/users.service';
import * as mongoose from 'mongoose'; // 👈 این خط اضافه شده

@Injectable()
export class ReferralsService {
  constructor(
    @InjectModel(Referral.name) private referralModel: Model<Referral>,
    private readonly usersService: UsersService,
  ) {}

  // 📥 ثبت زیرمجموعه جدید (در ثبت‌نام یا پروفایل)
  async registerReferral(referrerCode: string, newUserId: string) {
    const newUser = await this.usersService.findById(newUserId);
    if (!newUser) throw new NotFoundException('User not found');

    if (newUser.referredBy) {
      return { success: false, message: 'You already have a referrer.' };
    }

    const referrer = await this.usersService.findByVxCode(referrerCode);
    if (!referrer)
      return { success: false, message: 'Invalid referral code.' };

    // ذخیره در مدل user
    newUser.referredBy = referrer.vxCode;
    await newUser.save();

    // ثبت در مدل referral
    await this.referralModel.create({
      referrer: referrer._id,
      referredUser: newUser._id,
    });

    // افزودن آی‌دی زیرمجموعه در کاربر لیدر
    referrer.referrals.push(new mongoose.Types.ObjectId(newUser._id.toString()));
    await referrer.save();

    return {
      success: true,
      message: `Referral connected to ${referrer.firstName} ${referrer.lastName}`,
      referrer: {
        id: referrer._id,
        name: `${referrer.firstName} ${referrer.lastName}`,
        vxCode: referrer.vxCode,
      },
    };
  }

  // 📊 دریافت لیست زیرمجموعه‌ها برای کاربر
  async getUserReferrals(userId: string) {
    const referrals = await this.referralModel
      .find({ referrer: new Types.ObjectId(userId) })
      .populate('referredUser', 'firstName lastName email vxCode')
      .exec();

    return referrals.map((r) => ({
      user: r.referredUser,
      profitEarned: r.profitEarned,
      joinedAt: r.joinedAt,
    }));
  }

  // 💰 افزودن سود ریفرال (برای سودهای پکیج‌ها)
  async addReferralProfit(referrerId: string, amount: number, fromUserId: string) {
    await this.referralModel.findOneAndUpdate(
      { referrer: referrerId, referredUser: fromUserId },
      { $inc: { profitEarned: amount } },
    );

    await this.usersService.addBalance(referrerId, 'referralProfit', amount);
  }

  // 🧮 آمار کلی زیرمجموعه‌ها (تعداد + مجموع سود + کل سرمایه‌گذاری زیرمجموعه‌ها)
  async getReferralStats(userId: string) {
    const referrals = await this.getUserReferrals(userId);

    const totalReferrals = referrals.length;
    const totalProfit = referrals.reduce((sum, r) => sum + (r.profitEarned || 0), 0);

    // محاسبه مجموع سرمایه‌گذاری زیرمجموعه‌ها از usersService
    const referredUsers = await Promise.all(
      referrals.map(async (r) => {
        const user = await this.usersService.findByEmail(r.user.email);
        return user ? user.mainBalance + user.profitBalance : 0;
      }),
    );
    const totalInvested = referredUsers.reduce((a, b) => a + b, 0);

    return {
      totalReferrals,
      totalProfit,
      totalInvested,
    };
  }
}
