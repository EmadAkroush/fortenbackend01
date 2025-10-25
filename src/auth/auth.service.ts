import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import * as nodemailer from 'nodemailer';
import { randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
  ) {}

  // === Register User ===
  async register(dto: any) {
    const existingUser = await this.userModel.findOne({ email: dto.email });
    if (existingUser) throw new ConflictException('Email already in use');

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const vxCode = 'FO-' + Math.floor(100000 + Math.random() * 900000);
    const verificationToken = randomBytes(32).toString('hex');

    const user = await this.userModel.create({
      username: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      password: hashedPassword,
      vxCode,
      isVerified: false,
      verificationToken,
    });

    // ارسال ایمیل تأیید
    await this.sendVerificationEmail(user.email, verificationToken);

    const userId = user._id.toString();
    const tokens = await this.generateTokens(userId, user.email);
    await this.updateRefreshToken(userId, tokens.refreshToken);

    return {
      message: 'Registration successful. Please verify your email before login.',
      user,
    };
  }

  // === Verify Email ===
  async verifyEmail(token: string) {
    const user = await this.userModel.findOne({ verificationToken: token });
    if (!user) throw new NotFoundException('Invalid or expired verification token');

    // use Mongoose Document.set to avoid TypeScript property errors on the Document type
    user.set('isVerified', true);
    user.set('verificationToken', null);
    await user.save();

    return { message: 'Email verified successfully. You can now log in.' };
  }

  // === Login User ===
  async login(email: string, password: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // read isVerified using Mongoose document accessor or cast to any to avoid TS errors
    const isVerified = (user as any).get ? (user as any).get('isVerified') : (user as any).isVerified;
    if (!isVerified) {
      throw new UnauthorizedException('Please verify your email first.');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const userId = user._id.toString();
    const tokens = await this.generateTokens(userId, user.email);
    await this.updateRefreshToken(userId, tokens.refreshToken);

    return { user, ...tokens };
  }

  // === Refresh Token ===
  async refresh(userId: string, refreshToken: string) {
    const user = await this.userModel.findById(userId);
    if (!user || !user.refreshToken)
      throw new UnauthorizedException('Invalid token');

    const isMatch = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isMatch) throw new UnauthorizedException('Token mismatch');

    const userIds = user._id.toString();
    const tokens = await this.generateTokens(userIds, user.email);
    await this.updateRefreshToken(userIds, tokens.refreshToken);

    return tokens;
  }

  // === Logout ===
  async logout(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });
    return { message: 'Logged out successfully' };
  }

  // === Token Helpers ===
  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };
    const accessToken = this.jwtService.sign(payload, { expiresIn: '1h' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });
    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashed = await bcrypt.hash(refreshToken, 10);
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: hashed });
  }

  // === Send Verification Email ===
  private async sendVerificationEmail(email: string, token: string) {
    // ⚙️ SMTP تنظیمات
    const transporter = nodemailer.createTransport({
      service: 'gmail', // می‌تونی Mailtrap یا SMTP اختصاصی بذاری
      auth: {
        user: process.env.MAIL_USER, // آدرس ایمیل
        pass: process.env.MAIL_PASS, // رمز عبور یا App Password
      },
    });

    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    const mailOptions = {
      from: `"FORTEN Support" <${process.env.MAIL_USER}>`,
      to: email,
      subject: 'Verify your FORTEN account',
      html: `
        <div style="font-family: Arial, sans-serif; padding:20px; border-radius:8px; background:#f9f9f9">
          <h2>Welcome to FORTEN</h2>
          <p>Hi 👋, please verify your email to activate your account.</p>
          <a href="${verificationUrl}" style="background:#2ff1b4;color:#021510;padding:10px 20px;text-decoration:none;border-radius:5px;font-weight:bold;">Verify Email</a>
          <p style="margin-top:20px;font-size:12px;color:#888;">If you didn't register, please ignore this email.</p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`📧 Verification email sent to ${email}`);
    } catch (error) {
      console.error('❌ Failed to send verification email:', error.message);
      throw new BadRequestException('Failed to send verification email');
    }
  }
}
