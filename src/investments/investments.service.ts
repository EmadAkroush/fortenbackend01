import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Investment } from './schemas/investments.schema';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { User } from '../users/schemas/user.schema';
import { Package } from '../packages/schemas/packages.schema';

@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);

  constructor(
    @InjectModel(Investment.name) private investmentModel: Model<Investment>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Package.name) private packageModel: Model<Package>,
  ) {}

  // 🟢 ایجاد سرمایه‌گذاری جدید
  async createInvestment(dto: CreateInvestmentDto) {
    const user = await this.userModel.findById(dto.user);
    if (!user) throw new NotFoundException('User not found');

    const pack = await this.packageModel.findById(dto.package);
    if (!pack) throw new NotFoundException('Package not found');

    if (dto.amount < pack.minDeposit || dto.amount > pack.maxDeposit) {
      throw new BadRequestException(`Amount must be between ${pack.minDeposit} and ${pack.maxDeposit}`);
    }

    if (user.mainBalance < dto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // کم کردن از حساب اصلی کاربر
    user.mainBalance -= dto.amount;
    await user.save();

    // ساخت سرمایه‌گذاری جدید
    const investment = new this.investmentModel({
      user: user._id,
      package: pack._id,
      amount: dto.amount,
      dailyRate: dto.dailyRate || pack.dailyRate,
      requiredReferrals: 3, // به‌صورت پیش‌فرض
    });

    return investment.save();
  }

  // 🟣 دریافت لیست سرمایه‌گذاری‌های یک کاربر
  async getUserInvestments(userId: string) {
    return this.investmentModel
      .find({ user: new Types.ObjectId(userId) })
      .populate('package')
      .sort({ createdAt: -1 });
  }

  // 🟠 محاسبه سود روزانه (تابع معمولی برای CronJob)
  async calculateDailyProfits() {
    const investments = await this.investmentModel.find({ status: 'active' });

    for (const inv of investments) {
      const profit = (inv.amount * inv.dailyRate) / 100;

      // افزودن سود به مجموع سرمایه‌گذاری
      inv.totalProfit += profit;
      await inv.save();

      // افزودن سود به حساب سود کاربر
      await this.userModel.findByIdAndUpdate(inv.user, {
        $inc: { profitBalance: profit },
      });

      this.logger.log(
        `💰 Profit ${profit.toFixed(2)} USD added for user ${inv.user.toString()} (Investment: ${inv._id})`,
      );
    }

    this.logger.log('✅ Daily profits calculation completed successfully.');
    return { message: 'Daily profits calculated successfully' };
  }

  // 🕒 کرون جاب خودکار برای محاسبه سود پکیج‌ها هر 24 ساعت
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async autoCalculateProfits() {
    this.logger.log('⏰ Starting daily profit calculation (cron job)...');
    await this.calculateDailyProfits();
  }

  // 🔴 لغو سرمایه‌گذاری (بازگشت سرمایه اصلی)
  async cancelInvestment(id: string) {
    const inv = await this.investmentModel.findById(id);
    if (!inv) throw new NotFoundException('Investment not found');
    if (inv.status !== 'active') throw new BadRequestException('Investment already closed');

    inv.status = 'canceled';
    await inv.save();

    // بازگرداندن مبلغ به حساب اصلی کاربر
    await this.userModel.findByIdAndUpdate(inv.user, {
      $inc: { mainBalance: inv.amount },
    });

    return { message: 'Investment canceled and funds returned' };
  }
}
