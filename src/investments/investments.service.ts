import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types , Document } from 'mongoose';
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
    private readonly transactionsService: TransactionsService,
  ) {}

  // 🟢 ایجاد یا ارتقا سرمایه‌گذاری
  async createInvestment(dto: CreateInvestmentDto) {
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

    if (user.mainBalance < dto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // کسر از حساب اصلی
    user.mainBalance -= dto.amount;
    await user.save();

    if (investment) {
      // 🔼 اگر کاربر از قبل سرمایه‌گذاری دارد → سرمایه را افزایش بده
      investment.amount += dto.amount;

      // بررسی آیا باید به پکیج بالاتر ارتقا داده شود؟
      const newPackage = packages.find(
        (p) =>
          investment.amount >= p.minDeposit && investment.amount <= p.maxDeposit,
      );

      if (!newPackage)
        throw new BadRequestException('No matching package found for new total');

      // اگر پکیج جدید سطح بالاتری دارد → ارتقا بده
      if (investment.package.toString() !== newPackage._id.toString()) {
        // investment.package = newPackage._id;
        // investment.package = new Types.ObjectId(newPackage._id);
        investment.package = new Types.ObjectId(String(newPackage._id));


        investment.dailyRate = newPackage.dailyRate;
        this.logger.log(
          `⬆️ User ${user.email} upgraded to ${newPackage.name} package.`,
        );
      }

      await investment.save();

      // ثبت تراکنش افزایش سرمایه
      await this.transactionsService.createTransaction({
        userId: user._id.toString(),
        type: 'investment-upgrade',
        amount: dto.amount,
        currency: 'USD',
        status: 'completed',
        note: `Increased investment and upgraded to ${newPackage.name}`,
      });

      return investment;
    } else {
      // 🟢 اگر اولین بار است → پکیج مناسب را پیدا کن
      const selectedPackage = packages.find(
        (p) => dto.amount >= p.minDeposit && dto.amount <= p.maxDeposit,
      );
      if (!selectedPackage)
        throw new BadRequestException('No matching package for this amount');

      // ساخت سرمایه‌گذاری جدید
      investment = new this.investmentModel({
        user: user._id,
        package: selectedPackage._id,
        amount: dto.amount,
        dailyRate: selectedPackage.dailyRate,
        requiredReferrals: 3,
      });

      const saved = await investment.save();

      // ثبت تراکنش شروع
      await this.transactionsService.createTransaction({
        userId: user._id.toString(),
        type: 'investment',
        amount: dto.amount,
        currency: 'USD',
        status: 'completed',
        note: `Started investment in ${selectedPackage.name}`,
      });

      return saved;
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
