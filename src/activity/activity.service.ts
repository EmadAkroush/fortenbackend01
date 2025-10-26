import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  // 🟢 انتقال از profitBalance به mainBalance
  async transferFromProfitToMain(userId: string, amount: number) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.profitBalance < amount)
      throw new BadRequestException('Insufficient profit balance');

    // انتقال وجه
    user.profitBalance -= amount;
    user.mainBalance += amount;

    await user.save();

    return {
      message: `Transferred ${amount} USD from profit balance to main balance.`,
      mainBalance: user.mainBalance,
    };
  }

  // 🟣 انتقال از referralProfit به mainBalance
  async transferFromReferralToMain(userId: string, amount: number) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.referralProfit < amount)
      throw new BadRequestException('Insufficient referral profit');

    user.referralProfit -= amount;
    user.mainBalance += amount;

    await user.save();

    return {
      message: `Transferred ${amount} USD from referral profit to main balance.`,
      mainBalance: user.mainBalance,
    };
  }

  // 🟡 انتقال از bonusBalance به mainBalance
  async transferFromBonusToMain(userId: string, amount: number) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (user.bonusBalance < amount)
      throw new BadRequestException('Insufficient bonus balance');

    user.bonusBalance -= amount;
    user.mainBalance += amount;

    await user.save();

    return {
      message: `Transferred ${amount} USD from bonus balance to main balance.`,
      mainBalance: user.mainBalance,
    };
  }
}
