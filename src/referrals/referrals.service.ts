import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Referral } from './schemas/referrals.schema';
import { UsersService } from '../users/users.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as mongoose from 'mongoose';
import { TransactionsService } from '../transactions/transactions.service'; // ✅ اضافه شد

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectModel(Referral.name) private referralModel: Model<Referral>,
    private readonly usersService: UsersService,
    private readonly transactionsService: TransactionsService, // ✅ اضافه شد
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

    newUser.referredBy = referrer.vxCode;
    await newUser.save();

    await this.referralModel.create({
      referrer: referrer._id,
      referredUser: newUser._id,
    });

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

  // 📊 لیست زیرمجموعه‌ها
  async getUserReferrals(userId: string) {
    const referrals = await this.referralModel
      .find({ referrer: new Types.ObjectId(userId) })
      .populate('referredUser', 'firstName lastName email vxCode mainBalance profitBalance')
      .exec();

    return referrals.map((r) => ({
      user: r.referredUser,
      profitEarned: r.profitEarned,
      joinedAt: r.joinedAt,
    }));
  }

  // 💰 افزودن سود ریفرال
  async addReferralProfit(referrerId: string, amount: number, fromUserId: string) {
    await this.referralModel.findOneAndUpdate(
      { referrer: referrerId, referredUser: fromUserId },
      { $inc: { profitEarned: amount } },
    );
    await this.usersService.addBalance(referrerId, 'referralProfit', amount);
  }

  // 📈 آمار کلی زیرمجموعه‌ها
  async getReferralStats(userId: string) {
    const referrals = await this.getUserReferrals(userId);
    const totalReferrals = referrals.length;
    const totalProfit = referrals.reduce((sum, r) => sum + (r.profitEarned || 0), 0);

    const referredUsers = await Promise.all(
      referrals.map(async (r) => {
        const user = await this.usersService.findById(r.user._id.toString());
        return user ? user.mainBalance + user.profitBalance : 0;
      }),
    );

    const totalInvested = referredUsers.reduce((a, b) => a + b, 0);

    return { totalReferrals, totalProfit, totalInvested };
  }

  // 🔍 جزئیات نود (برای نمایش در درخت ریفرال)
  async getReferralNodeDetails(userId: string) {
    const referrals = await this.referralModel
      .find({ referrer: new Types.ObjectId(userId) })
      .populate('referredUser', 'firstName lastName email vxCode mainBalance profitBalance')
      .exec();

    return referrals.map((r) => ({
      id: r.referredUser['_id'],
      name: `${r.referredUser['firstName']} ${r.referredUser['lastName']}`,
      email: r.referredUser['email'],
      vxCode: r.referredUser['vxCode'],
      balances: {
        main: r.referredUser['mainBalance'],
        profit: r.referredUser['profitBalance'],
      },
      profitEarned: r.profitEarned,
      joinedAt: r.joinedAt,
    }));
  }

@Cron('30 1 * * *')
async calculateReferralProfits() {
  this.logger.log('🔁 Running daily referral profit calculation (corrected)...');

  // دریافت تراکنش‌های سود روز گذشته
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const profitTransactions = await this.transactionsService.findByTypeAndDate('profit', since);

  for (const tx of profitTransactions) {
    const userId = tx.userId.toString();
    const user = await this.usersService.findById(userId);
    if (!user || !user.referredBy) continue;

    const profitAmount = tx.amount; // سودی که از این سرمایه‌گذاری تولید شده
    let currentReferrerCode = user.referredBy;
    let level = 1;

    // تا سه سطح بالا
    while (currentReferrerCode && level <= 3) {
      const referrer = await this.usersService.findByVxCode(currentReferrerCode);
      if (!referrer) break;

      let percentage = level === 1 ? 0.15 : level === 2 ? 0.1 : 0.05;
      const reward = profitAmount * percentage;

      if (reward > 0) {
        await this.addReferralProfit(referrer._id.toString(), reward, user._id.toString());

        // ثبت تراکنش ریفرال
        await this.transactionsService.createTransaction({
          userId: referrer._id.toString(),
          type: 'referral-profit',
          amount: reward,
          currency: 'USD',
          status: 'completed',
          note: `Referral profit (Level ${level}) from ${user.email} | source: profit ${profitAmount}`,
        });

        this.logger.log(
          `💰 Level ${level} referral profit: +${reward.toFixed(
            2,
          )} USD to ${referrer.email} from ${user.email}`,
        );
      }

      currentReferrerCode = referrer.referredBy;
      level++;
    }
  }

  this.logger.log('✅ Referral profit distribution completed successfully (based on daily profits only).');
}

  // 🧾 گرفتن تراکنش‌های ریفرال کاربر برای داشبورد
  async getReferralTransactions(userId: string) {
    const transactions = await this.transactionsService.getUserTransactions(userId);
    return transactions.filter((tx) => tx.type === 'referral-profit');
  }
}
