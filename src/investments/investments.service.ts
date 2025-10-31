import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose'; 
import { Cron, CronExpression } from '@nestjs/schedule';
import { Investment } from './schemas/investments.schema';
import { CreateInvestmentDto } from './dto/create-investment.dto';
import { User } from '../users/schemas/user.schema';
import { Package } from '../packages/schemas/packages.schema';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class InvestmentsService {
  private readonly logger = new Logger(InvestmentsService.name);

  constructor(
    @InjectModel(Investment.name) private investmentModel: Model<Investment>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Package.name) private packageModel: Model<Package>,
    @InjectConnection() private readonly connection: Connection, // ✅ اضافه شد
    private readonly transactionsService: TransactionsService,
  ) {}

  // 🟢 ایجاد یا ارتقا سرمایه‌گذاری با لاگ خطا و ارتقای هوشمند
// 🟢 ایجاد یا ارتقا سرمایه‌گذاری با کنترل خطا و پشتیبانی از Transaction در صورت فعال بودن Replica Set
// 🟢 ایجاد یا ارتقا سرمایه‌گذاری با کنترل خطا و پشتیبانی از Transaction در صورت فعال بودن Replica Set
// 🟢 ایجاد یا ارتقا سرمایه‌گذاری
// 🟢 ایجاد یا ارتقا سرمایه‌گذاری
async createInvestment(dto: CreateInvestmentDto) {
  try {
    const user = await this.userModel.findById(dto.user);
    if (!user) throw new NotFoundException('User not found');

    const packages = await this.packageModel.find().sort({ minDeposit: 1 });
    if (!packages || !packages.length) {
      throw new NotFoundException('No packages found');
    }

    // بررسی سرمایه‌گذاری فعال فعلی کاربر
    let investment = await this.investmentModel.findOne({
      user: user._id,
      status: 'active',
    });

    const depositAmount = Number(dto.amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      throw new BadRequestException('Invalid investment amount');
    }

    if (user.mainBalance < depositAmount) {
      throw new BadRequestException('Insufficient balance');
    }

    // 📉 کسر از حساب اصلی
    user.mainBalance -= depositAmount;
    await user.save();

    // 🧾 ثبت لاگ اولیه تراکنش
    await this.transactionsService.createTransaction({
      userId: user._id.toString(),
      type: investment ? 'investment-upgrade-init' : 'investment-init',
      amount: depositAmount,
      currency: 'USD',
      status: 'pending',
      note: 'Investment process started',
    });

    if (investment) {
      // 🟢 افزایش سرمایه
      investment.amount = Number(investment.amount) + depositAmount;
      const totalAmount = Number(investment.amount);

      // 📦 پیدا کردن پکیج جدید مناسب
      let newPackage = packages.find(
        (p) =>
          totalAmount >= Number(p.minDeposit) &&
          totalAmount <= Number(p.maxDeposit),
      );

      // اگر از محدوده بالاتر بود، آخرین پکیج رو بگیر
      if (!newPackage && totalAmount > Number(packages[packages.length - 1].maxDeposit)) {
        newPackage = packages[packages.length - 1];
      }

      if (!newPackage)
        throw new BadRequestException('No matching package found for new total');

      // ارتقا پکیج در صورت نیاز
      if (investment.package.toString() !== newPackage._id.toString()) {
        // Cast the package id to Types.ObjectId to satisfy TS types
        investment.package = newPackage._id as unknown as Types.ObjectId;
        investment.dailyRate = newPackage.dailyRate;
        this.logger.log(`⬆️ User ${user.email} upgraded to ${newPackage.name} package`);
      }

      await investment.save();

      // ✅ ثبت تراکنش موفق
      await this.transactionsService.createTransaction({
        userId: user._id.toString(),
        type: 'investment-upgrade',
        amount: depositAmount,
        currency: 'USD',
        status: 'completed',
        note: `Increased investment and upgraded to ${newPackage.name}`,
      });

      return {
        success: true,
        message: `Investment updated successfully. Current package: ${newPackage.name}`,
        investment,
      };
    } else {
      // 🟢 اگر اولین بار است → پکیج مناسب را پیدا کن
      const selectedPackage = packages.find(
        (p) => depositAmount >= Number(p.minDeposit) && depositAmount <= Number(p.maxDeposit),
      );

      if (!selectedPackage)
        throw new BadRequestException('No matching package for this amount');

      // ساخت سرمایه‌گذاری جدید
      investment = new this.investmentModel({
        user: user._id,
        package: selectedPackage._id,
        amount: depositAmount,
        dailyRate: selectedPackage.dailyRate,
        requiredReferrals: 3,
        status: 'active',
      });

      const saved = await investment.save();

      // ✅ ثبت تراکنش شروع
      await this.transactionsService.createTransaction({
        userId: user._id.toString(),
        type: 'investment',
        amount: depositAmount,
        currency: 'USD',
        status: 'completed',
        note: `Started investment in ${selectedPackage.name}`,
      });

      return {
        success: true,
        message: `Investment started successfully in ${selectedPackage.name} package.`,
        investment: saved,
      };
    }
  } catch (error) {
    this.logger.error('❌ Investment creation failed:', error);

    // 🧾 ثبت لاگ خطا (اگر کاربر شناخته شده بود)
    if (dto?.user) {
      await this.transactionsService.createTransaction({
        userId: dto.user,
        type: 'investment-error',
        amount: Number(dto.amount) || 0,
        currency: 'USD',
        status: 'failed',
        note: `Investment failed: ${error.message || 'Unknown error'}`,
      });
    }

    // بازگرداندن پول به حساب کاربر در صورت خطا
    if (dto?.user) {
      const user = await this.userModel.findById(dto.user);
      if (user) {
        user.mainBalance += Number(dto.amount) || 0;
        await user.save();
        this.logger.warn(`💰 Refunded ${dto.amount} USD to ${user.email}`);
      }
    }

    throw new BadRequestException(error.message || 'Investment operation failed');
  }
}






  // 🟣 لیست سرمایه‌گذاری‌ها
  async getUserInvestments(userId: string) {
    return this.investmentModel
      .find({ user: new Types.ObjectId(userId) })
      .populate('package')
      .sort({ createdAt: -1 });
  }



// 🟠 محاسبه سود روزانه (تابع عمومی برای CronJob)
// 🟠 محاسبه سود روزانه (تابع عمومی برای CronJob)
async calculateDailyProfits() {
  // 👇 اینجا populate انجام می‌دهیم تا به package.name و user.email دسترسی داشته باشیم
  const investments = await this.investmentModel
    .find({ status: 'active' })
    .populate<{ user: User }>('user')
    .populate<{ package: Package }>('package');

  for (const inv of investments) {
    const profit = (inv.amount * inv.dailyRate) / 100;

    // ✅ افزودن سود به سرمایه‌گذاری
    inv.totalProfit += profit;
    await inv.save();

    // ✅ افزودن سود به حساب کاربر
    await this.userModel.findByIdAndUpdate(inv.user._id, {
      $inc: { profitBalance: profit },
    });

    // ✅ ثبت تراکنش سود روزانه
    await this.transactionsService.createTransaction({
      userId: inv.user._id.toString(),
      type: 'profit',
      amount: profit,
      currency: 'USD',
      status: 'completed',
      note: `Daily profit (${inv.dailyRate}% of ${inv.amount}) for ${inv.package.name}`,
    });

    this.logger.log(
      `💰 Profit ${profit.toFixed(2)} USD added for ${inv.user.email} (${inv.package.name})`,
    );
  }

  this.logger.log('✅ Daily profits calculated successfully');
  return { message: 'Daily profits calculated and logged successfully' };
}














  // 🕒 کرون جاب خودکار
  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async autoCalculateProfits() {
    this.logger.log('⏰ Starting daily profit cron job...');
    await this.calculateDailyProfits();
  }

  // 🔴 لغو سرمایه‌گذاری
  async cancelInvestment(id: string) {
    const inv = await this.investmentModel.findById(id);
    if (!inv) throw new NotFoundException('Investment not found');
    if (inv.status !== 'active')
      throw new BadRequestException('Investment already closed');

    inv.status = 'canceled';
    await inv.save();

    await this.userModel.findByIdAndUpdate(inv.user, {
      $inc: { mainBalance: inv.amount },
    });

    await this.transactionsService.createTransaction({
      userId: inv.user.toString(),
      type: 'refund',
      amount: inv.amount,
      status: 'completed',
      note: `Investment canceled and refunded`,
    });

    return { message: 'Investment canceled and funds returned' };
  }
}
