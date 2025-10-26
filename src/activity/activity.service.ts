import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  // 🟢 انتقال از profitBalance → mainBalance
  async transferProfitToMain(userId: string, amount: number) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.profitBalance < amount)
      throw new BadRequestException('Insufficient profit balance');

    user.profitBalance -= amount;
    user.mainBalance += amount;
    await user.save();

    return {
      success: true,
      message: `✅ ${amount} USD transferred from Profit Balance to Main Balance.`,
      balances: {
        mainBalance: user.mainBalance,
        profitBalance: user.profitBalance,
      },
    };
  }

  // 🟣 انتقال از referralProfit → mainBalance
  async transferReferralToMain(userId: string, amount: number) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.referralProfit < amount)
      throw new BadRequestException('Insufficient referral profit balance');

    user.referralProfit -= amount;
    user.mainBalance += amount;
    await user.save();

    return {
      success: true,
      message: `✅ ${amount} USD transferred from Referral Profit to Main Balance.`,
      balances: {
        mainBalance: user.mainBalance,
        referralProfit: user.referralProfit,
      },
    };
  }

  // 🟡 انتقال از bonusBalance → mainBalance
  async transferBonusToMain(userId: string, amount: number) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.bonusBalance < amount)
      throw new BadRequestException('Insufficient bonus balance');

    user.bonusBalance -= amount;
    user.mainBalance += amount;
    await user.save();

    return {
      success: true,
      message: `✅ ${amount} USD transferred from Bonus Balance to Main Balance.`,
      balances: {
        mainBalance: user.mainBalance,
        bonusBalance: user.bonusBalance,
      },
    };
  }
}
