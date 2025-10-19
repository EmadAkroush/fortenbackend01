import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async createDemoUser() {
    return this.userModel.create({
      username: 'demo',
      firstName: 'John',
      lastName: 'Doe',
      email: 'demo@example.com',
      password: '123456',
      vxCode: 'FO-10001',
    });
  }
}

