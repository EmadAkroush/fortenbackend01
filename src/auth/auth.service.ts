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
  async refresh(userId: string, refreshToken: string) {
    const user = await this.userModel.findById(userId);
    if (!user || !user.refreshToken)
      throw new UnauthorizedException('Invalid token');

    const isMatch = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isMatch) throw new UnauthorizedException('Token mismatch');

    const tokens = await this.generateTokens(userId, user.email);
    await this.updateRefreshToken(userId, tokens.refreshToken);

    return tokens;
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
      subject: 'Verify your FORTEN account',
      html: `
        <div style="font-family: Arial, sans-serif; padding:20px;">
          <h2>Welcome to FORTEN</h2>
          <p>Please verify your email to activate your account:</p>
          <a href="${verificationUrl}" style="background:#2ff1b4;padding:10px 20px;border-radius:5px;">Verify Email</a>
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
