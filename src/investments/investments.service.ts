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
    if (!isFinite(depositAmount) || depositAmount <= 0) {
      throw new BadRequestException('Invalid investment amount');
    }

    if (user.mainBalance < depositAmount) {
      throw new BadRequestException('Insufficient balance');
    }

    // ===== helpers: robust numeric parsing (removes commas, currency symbols, spaces) =====
    const toNumeric = (val: any): number => {
      if (val == null) return NaN;
      if (typeof val === 'number') return val;
      let s = String(val);
      // remove anything except digits, dot and minus (commas, spaces, currency symbols)
      s = s.replace(/[^\d.\-]/g, '');
      // if multiple dots (e.g. "1.000.00") remove all but first
      const parts = s.split('.');
      if (parts.length > 2) s = parts.shift() + '.' + parts.join('');
      const n = Number(s);
      return isFinite(n) ? n : NaN;
    };

    const parseMin = (p: any) => {
      const n = toNumeric(p);
      return isFinite(n) ? n : 0;
    };
    const parseMax = (p: any) => {
      const n = toNumeric(p);
      return isFinite(n) ? n : Infinity;
    };

    // 📉 کسر از حساب اصلی (همان رفتار قبلی شما)
    user.mainBalance -= depositAmount;
    await user.save();

    // 🧾 ثبت لاگ اولیه تراکنش (pending)
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

      // ---- DEBUG LOG: show totalAmount and package ranges ----
      this.logger.log(`🔎 Investment increase: user=${user.email} deposit=${depositAmount} totalAfter=${totalAmount}`);
      this.logger.debug('📦 packages ranges:');
      packages.forEach((p, idx) => {
        const min = parseMin(p.minDeposit);
        const max = parseMax(p.maxDeposit);
        this.logger.debug(`  [${idx}] ${p.name || p._id} -> min:${min} max:${max}`);
      });

      // 📦 پیدا کردن پکیج جدید مناسب (با parsing مقاوم)
      let newPackage = packages.find((p) => {
        const min = parseMin(p.minDeposit);
        const maxVal = parseMax(p.maxDeposit);
        return totalAmount >= min && totalAmount <= maxVal;
      });

      // fallback: اگر یافت نشد و مجموع از مینِ آخرین پکیج >= بود => آخرین را انتخاب کن
      if (!newPackage) {
        const last = packages[packages.length - 1];
        if (last) {
          const lastMin = parseMin(last.minDeposit);
          if (totalAmount >= lastMin) {
            newPackage = last;
            this.logger.log(`⚠️ No exact package range matched; using last package ${String(last._id)} because total ${totalAmount} >= last.min ${lastMin}`);
          }
        }
      }

      // آخرین تلاش: اگر هنوز null، لاگ دقیق بزن و خطا بده
      if (!newPackage) {
        // log helpful debug to find why no match
        this.logger.error(
          `❌ No matching package for totalAmount=${totalAmount}. Checked packages: ${packages
            .map((p) => {
              return `${p.name || p._id}(${parseMin(p.minDeposit)}-${parseMax(p.maxDeposit)})`;
            })
            .join('; ')}`,
        );

        // مشاهده: بازگرداندن پول اینجا انجام می‌شود در catch هم تکرار می‌شود
        // برای شفافیت در اینجا هم لاگ بزنیم
        throw new BadRequestException('No matching package found for new total');
      }

      // ارتقا پکیج در صورت نیاز
      if (investment.package.toString() !== newPackage._id.toString()) {
        // Cast the package id to Types.ObjectId to satisfy TS types
        investment.package = (newPackage._id as unknown) as Types.ObjectId;
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
        note: `Upgraded investment to ${newPackage.name}`,
      });

      return {
        success: true,
        message: `Investment updated successfully. Current package: ${newPackage.name}`,
        investment,
      };
    } else {
      // 🟢 اولین سرمایه‌گذاری
      const selectedPackage = packages.find((p) => {
        const min = parseMin(p.minDeposit);
        const maxVal = parseMax(p.maxDeposit);
        return depositAmount >= min && depositAmount <= maxVal;
      });

      if (!selectedPackage) {
        // try fallback: if depositAmount >= last.min choose last
        const last = packages[packages.length - 1];
        if (last && depositAmount >= parseMin(last.minDeposit)) {
          // choose last
          this.logger.log(`⚠️ No direct package match for deposit ${depositAmount} — selecting last package ${String(last._id)}`);
          // use last as selected
          // (no further check)
        } else {
          this.logger.error(
            `❌ No matching package for depositAmount=${depositAmount}. Package ranges: ${packages
              .map((p) => `${p.name || p._id}(${parseMin(p.minDeposit)}-${parseMax(p.maxDeposit)})`)
              .join('; ')}`,
          );
          throw new BadRequestException('No matching package for this amount');
        }
      }

      // if selectedPackage is null but last is valid and deposit >= last.min, use last
      const finalPackage = selectedPackage || packages[packages.length - 1];

      // ساخت سرمایه‌گذاری جدید
      investment = new this.investmentModel({
        user: user._id,
        package: finalPackage._id,
        amount: depositAmount,
        dailyRate: finalPackage.dailyRate,
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
        note: `Started investment in ${finalPackage.name}`,
      });

      return {
        success: true,
        message: `Investment started successfully in ${finalPackage.name} package.`,
        investment: saved,
      };
    }
  } catch (error) {
    this.logger.error('❌ Investment creation failed:', error);

    // 🧾 ثبت لاگ خطا (اگر کاربر شناخته شده بود)
    if (dto?.user) {
      try {
        await this.transactionsService.createTransaction({
          userId: dto.user,
          type: 'investment-error',
          amount: Number(dto.amount) || 0,
          currency: 'USD',
          status: 'failed',
          note: `Investment failed: ${error.message || 'Unknown error'}`,
        });
      } catch (txErr) {
        this.logger.error('Failed to record investment-error transaction:', txErr);
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
