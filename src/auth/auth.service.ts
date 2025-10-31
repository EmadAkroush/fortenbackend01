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
import * as path from 'path';
import * as fs from 'fs';

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

    user.set('isVerified', true);
    user.set('verificationToken', null);
    await user.save();

    return { message: 'Email verified successfully. You can now log in.' };
  }

  // === Login User ===
  async login(email: string, password: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const isVerified = (user as any).isVerified;
    if (!isVerified) throw new UnauthorizedException('Please verify your email first.');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const userId = user._id.toString();
    const tokens = await this.generateTokens(userId, user.email);
    await this.updateRefreshToken(userId, tokens.refreshToken);

    return { user, ...tokens };
  }

  // === Refresh Token ===
 async refresh(authHeader: string) {
    // 🧩 بررسی وجود هدر
    if (!authHeader || !authHeader.startsWith('Bearer '))
      throw new UnauthorizedException('Missing or invalid Authorization header');

    const refreshToken = authHeader.split(' ')[1];
    if (!refreshToken) throw new UnauthorizedException('Refresh token not found');

    // 🧠 بررسی اعتبار JWT
    let decoded: any;
    try {
      decoded = this.jwtService.verify(refreshToken);
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // 🔎 پیدا کردن کاربر
    const user = await this.userModel.findById(decoded.sub);
    if (!user || !user.refreshToken)
      throw new UnauthorizedException('User not found or token missing');

    // 🔐 تطبیق refreshToken با دیتابیس
    const isMatch = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isMatch) throw new UnauthorizedException('Token mismatch');

    // 🎟 تولید توکن جدید
    const tokens = await this.generateTokens(user._id.toString(), user.email);

    // 📦 آپدیت رفرش توکن در دیتابیس
    await this.updateRefreshToken(user._id.toString(), tokens.refreshToken);

    // ✅ بازگشت توکن جدید + اطلاعات کاربر
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        vxCode: user.vxCode,
        isVerified: user.isVerified,
      },
    };
  }

  // === Logout ===
  async logout(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: null });
    return { message: 'Logged out successfully' };
  }

  // === Forgot Password (Send Reset Email) ===
  async requestPasswordReset(email: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) throw new NotFoundException('User with this email does not exist');

    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 دقیقه اعتبار

    user.set('resetPasswordToken', resetToken);
    user.set('resetPasswordExpires', resetTokenExpires);
    await user.save();

    await this.sendResetPasswordEmail(user.email, resetToken, user.firstName);

    return { message: 'Password reset email sent successfully' };
  }

  // === Verify Reset Token ===
  async verifyResetToken(token: string) {
    const user = await this.userModel.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) throw new BadRequestException('Invalid or expired reset token');

    return {
      message: 'Reset token is valid',
      email: user.email,
    };
  }

  // === Reset Password ===
  async resetPassword(token: string, newPassword: string) {
    const user = await this.userModel.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.set('password', hashedPassword);
    user.set('resetPasswordToken', null);
    user.set('resetPasswordExpires', null);
    await user.save();

    return { message: 'Password reset successfully. You can now log in.' };
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
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });

  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  const mailOptions = {
    from: `"FORTEN Support" <${process.env.MAIL_USER}>`,
    to: email,
    subject: 'Your FORTEN Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #0b0f14; color: #e5fff7;">
        <h2 style="color:#2ff1b4;">Welcome to FORTEN</h2>
        <p style="font-size:15px;">Please use the verification code below to verify your email address.</p>

        <div style="margin:25px 0; text-align:center;">
          <div style="
            display:inline-block;
            background:#1a2b23;
            border:2px dashed #2ff1b4;
            color:#2ff1b4;
            font-size:18px;
            font-weight:bold;
            letter-spacing:2px;
            padding:12px 20px;
            border-radius:8px;
          ">
            ${token}
          </div>
        </div>

        <p style="font-size:14px;color:#9fc9b7;">
          Copy the above code and paste it into the verification form in your FORTEN account.
        </p>

        <hr style="border:0;border-top:1px solid #2ff1b422;margin:25px 0;">
        <p style="font-size:12px;color:#6b8a7c;">
          If you did not request this, please ignore this email.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
}


  // === Send Password Reset Email ===
  private async sendResetPasswordEmail(email: string, token: string, firstName?: string) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    const templatePath = path.resolve(__dirname, '../templates/reset-password-email.html');

    let html = fs.readFileSync(templatePath, 'utf8')
      .replace(/{{resetUrl}}/g, resetUrl)
      .replace(/{{firstName \|\| 'کاربر'}}/g, firstName || 'کاربر');

    const mailOptions = {
      from: `"Forten Support" <${process.env.MAIL_USER}>`,
      to: email,
      subject: 'بازیابی رمز عبور — Forten',
      html,
    };

    await transporter.sendMail(mailOptions);
  }
}
