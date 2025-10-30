import {
  Controller,
  Get,
  Post,
  Body,
  Put,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './schemas/user.schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 🟢 ایجاد کاربر جدید
  @Post('create')
  create(@Body() body: Partial<User>) {
    return this.usersService.create(body);
  }

  // 🟢 دریافت همه کاربران
  @Post('all')
  findAll() {
    return this.usersService.findAll();
  }

  // 🟢 دریافت یک کاربر با آیدی از بادی
  @Post('find')
  findOne(@Body('id') id: string) {
    return this.usersService.findById(id);
  }

  // 🟢 به‌روزرسانی کاربر با آیدی از بادی
  @Post('update')
  update(@Body() body: { id: string; data: Partial<User> }) {
    return this.usersService.updateUser(body.id, body.data);
  }

  // 🟢 دریافت موجودی حساب‌های کاربر
  @Post('balances')
  async getUserBalances(@Body('userId') userId: string) {
    return this.usersService.getUserBalances(userId);
  }

  // 🟢 حذف کاربر با آیدی از بادی
  @Post('delete')
  remove(@Body('id') id: string) {
    return this.usersService.deleteUser(id);
  }
}
