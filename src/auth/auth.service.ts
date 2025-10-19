import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService, private jwtService: JwtService) {}

  // 🟢 Register new user
  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new BadRequestException('Email already exists');

    const hashed = await bcrypt.hash(dto.password, 10);
    const newUser = await this.usersService.create({
      ...dto,
      password: hashed,
      vxCode: `FO-${Math.floor(Math.random() * 900000 + 100000)}`,
    });

    const token = this.jwtService.sign({ id: newUser._id, email: newUser.email });
    return { token, user: newUser };
  }

  // 🔐 Login user
  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const token = this.jwtService.sign({ id: user._id, email: user.email });
    return { token, user };
  }

  async verifyToken(token: string) {
    return this.jwtService.verify(token);
  }
}
