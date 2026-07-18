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
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ── TERMINAL ASSIGNMENT (1:1 for dispatchers) ──────────────────────────────
  async assignDispatcherTerminal(userId: string, terminalId: string | null) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { terminalAssignments: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.roleName !== 'DISPATCHER') {
      throw new BadRequestException('Terminal assignment is only for Dispatcher accounts.');
    }

    // Remove all existing terminal assignments for this dispatcher (1:1 enforcement)
    await this.prisma.userTerminalAssignment.deleteMany({
      where: { userId },
    });

    if (!terminalId) {
      return { success: true, message: 'Terminal assignment cleared.' };
    }

    const terminal = await this.prisma.terminal.findUnique({ where: { id: terminalId } });
    if (!terminal) {
      throw new NotFoundException('Terminal not found');
    }

    const assignment = await this.prisma.userTerminalAssignment.create({
      data: { userId, terminalId },
      include: { terminal: { select: { id: true, name: true, code: true } } },
    });

    return { success: true, assignment };
  }

  async getDispatcherTerminal(userId: string) {
    const assignment = await this.prisma.userTerminalAssignment.findFirst({
      where: { userId },
      include: { terminal: { select: { id: true, name: true, code: true } } },
    });
    return assignment ? assignment.terminal : null;
  }

  async getUsersWithTerminals() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        roleName: true,
        isActive: true,
        createdAt: true,
        terminalAssignments: {
          include: {
            terminal: { select: { id: true, name: true, code: true } },
          },
          take: 1, // dispatchers have max 1
        },
      },
      orderBy: { username: 'asc' },
    });

    return users.map((u) => ({
      ...u,
      assignedTerminal: u.terminalAssignments[0]?.terminal ?? null,
    }));
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

  // ── DASHBOARD METRICS ──────────────────────────────────────────────────────
  async getTransportDashboardMetrics() {
    const totalAvailableVehicles = await this.prisma.vehicle.count({
      where: { status: 'ACTIVE' },
    });

    const activeVehicles = await this.prisma.queueEntry.count({
      where: { status: { in: ['WAITING', 'DISPATCHED'] } },
    });

    const vehiclesWithViolations = await this.prisma.violationRecord.groupBy({
      by: ['vehicleId'],
      where: { resolved: false },
    });

    return {
      totalAvailableVehicles,
      activeVehicles,
      vehiclesWithViolations: vehiclesWithViolations.length,
    };
  }

  // ── PRICING RULES ──────────────────────────────────────────────────────────
  async getPricingRules() {
    return this.prisma.pricingRule.findMany({
      include: {
        dispatcher: {
          select: { username: true, email: true }
        }
      }
    });
  }

  async upsertPricingRule(dispatcherId: string, fareMultiplier: number) {
    const user = await this.prisma.user.findUnique({ where: { id: dispatcherId } });
    if (!user || user.roleName !== RoleName.DISPATCHER) {
      throw new BadRequestException('Dispatcher not found or user is not a dispatcher');
    }
    return this.prisma.pricingRule.upsert({
      where: { dispatcherId },
      update: { fareMultiplier },
      create: { dispatcherId, fareMultiplier },
    });
  }
}
