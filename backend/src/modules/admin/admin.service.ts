import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  // ── USER MANAGEMENT ────────────────────────────────────────────────────────
  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        roleName: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { username: 'asc' },
    });
  }

  async createUser(data: { username: string; email: string; password?: string; roleName: RoleName }) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: data.username }, { email: data.email }],
      },
    });
    if (existing) {
      throw new BadRequestException('Username or email already exists');
    }

    const passwordHash = await bcrypt.hash(data.password || 'Temp@1234', 10);
    const pinHash = data.roleName === RoleName.DISPATCHER ? await bcrypt.hash('998877', 10) : undefined;

    return this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        passwordHash,
        pinHash,
        roleName: data.roleName,
        isActive: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        roleName: true,
        isActive: true,
      },
    });
  }

  async updateUser(id: string, data: { username?: string; email?: string; roleName?: RoleName; isActive?: boolean; password?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: any = { ...data };
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
      delete updateData.password;
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        roleName: true,
        isActive: true,
      },
    });
  }

  async deleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Perform a soft delete / disable to preserve reference integrity
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ── SETTINGS MANAGEMENT ────────────────────────────────────────────────────
  async getSettings() {
    return this.prisma.settings.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async updateSettings(settings: { key: string; value: string }[]) {
    return this.prisma.$transaction(
      settings.map((s) =>
        this.prisma.settings.upsert({
          where: { key: s.key },
          update: { value: s.value },
          create: { key: s.key, value: s.value },
        }),
      ),
    );
  }

  // ── AUDIT TRAILS ───────────────────────────────────────────────────────────
  async getAuditLogs() {
    return this.prisma.auditLog.findMany({
      include: {
        user: {
          select: {
            username: true,
            roleName: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });
  }
}
