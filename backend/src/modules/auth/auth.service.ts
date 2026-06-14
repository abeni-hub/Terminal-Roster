import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service';
import * as bcrypt from 'bcrypt';
import { LoginDto, RefreshDto, DeviceRegisterDto } from './dto/auth.dto';
import { RoleName } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: loginDto.username },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials or inactive account');
    }

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user.id, user.username, user.roleName);
  }

  async refresh(refreshDto: RefreshDto) {
    try {
      const payload = this.jwtService.verify(refreshDto.refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key-for-aatdrs-2026',
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User no longer exists or is disabled');
      }

      return this.generateTokens(user.id, user.username, user.roleName);
    } catch (e) {
      throw new UnauthorizedException('Expired or malformed refresh token');
    }
  }

  async validateSupervisorPin(username: string, pin: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    if (!user || user.roleName !== RoleName.SUPERVISOR || !user.pinHash) {
      return false;
    }
    return bcrypt.compare(pin, user.pinHash);
  }

  async registerDevice(dto: DeviceRegisterDto) {
    const terminal = await this.prisma.terminal.findUnique({
      where: { id: dto.terminalId },
    });
    if (!terminal) {
      throw new BadRequestException('Terminal does not exist');
    }

    const existingDevice = await this.prisma.deviceBinding.findUnique({
      where: { deviceUuid: dto.deviceUuid },
    });

    if (existingDevice) {
      return this.prisma.deviceBinding.update({
        where: { deviceUuid: dto.deviceUuid },
        data: {
          terminalId: dto.terminalId,
          publicKey: dto.publicKey,
          isApproved: false, // Re-request approval
        },
      });
    }

    return this.prisma.deviceBinding.create({
      data: {
        terminalId: dto.terminalId,
        deviceUuid: dto.deviceUuid,
        publicKey: dto.publicKey,
        isApproved: false, // Needs manual approval by TerminalAdmin / SuperAdmin
      },
    });
  }

  private async generateTokens(userId: string, username: string, roleName: RoleName) {
    const payload = { sub: userId, username, roleName };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
      secret: process.env.JWT_SECRET || 'super-secret-jwt-key-for-aatdrs-2026',
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: '7d',
      secret: process.env.JWT_REFRESH_SECRET || 'super-secret-refresh-key-for-aatdrs-2026',
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        username,
        roleName,
      },
    };
  }
}
