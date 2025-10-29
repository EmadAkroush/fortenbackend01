import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  // 🟢 ایجاد کاربر جدید
  async create(data: Partial<User>): Promise<User> {
    const user = new this.userModel(data);
    return user.save();
  }

  // 🔍 پیدا کردن با ایمیل
  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email }).exec();
  }

  // داخل UsersService اضافه کن 👇
  async findByVxCode(vxCode: string): Promise<User | null> {
    return this.userModel.findOne({ vxCode });
  }

  // 🔍 پیدا کردن با ID
  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  // 🔍 پیدا کردن با نام کاربری
  async findByUsername(username: string): Promise<User | null> {
    return this.userModel.findOne({ username }).exec();
  }

  // 🧾 دریافت همه کاربران (برای admin)
  async findAll(): Promise<User[]> {
    return this.userModel.find().select('-password').exec();
  }

  // ✏️ آپدیت اطلاعات کاربر
  async updateUser(id: string, data: Partial<User>): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(id, data, {
      new: true,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // 💰 افزودن مبلغ به یکی از حساب‌ها
  async addBalance(
    userId: string,
    type: 'mainBalance' | 'profitBalance' | 'referralBalance' | 'bonusBalance',
    amount: number,
  ) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    user[type] = (user[type] ?? 0) + amount; // اطمینان از عدد بودن فیلد
    await user.save();
    return user;
  }

  // 🧨 حذف کاربر (در صورت نیاز)
  async deleteUser(id: string) {
    return this.userModel.findByIdAndDelete(id);
  }

  // 🟢 دریافت موجودی‌های حساب کاربر
  async getUserBalances(userId: string) {
    const user = await this.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    return {
      mainBalance: user.mainBalance ?? 0,
      profitBalance: user.profitBalance ?? 0,
      referralBalance: user.referralBalance ?? 0,
      bonusBalance: user.bonusBalance ?? 0,
    };
  }
}
