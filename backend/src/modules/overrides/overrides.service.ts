import { Injectable, UnauthorizedException, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { CreateOverrideDto } from './dto/override.dto';
import { QueueStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class OverridesService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async createOverride(dto: CreateOverrideDto) {
    // 1. Verify supervisor credentials and PIN
    const isValidPin = await this.authService.validateSupervisorPin(
      dto.supervisorUsername,
      dto.supervisorPin,
    );

    if (!isValidPin) {
      throw new UnauthorizedException('Invalid Supervisor credentials or PIN');
    }

    const supervisor = await this.prisma.user.findUnique({
      where: { username: dto.supervisorUsername },
    });

    if (!supervisor) {
      throw new NotFoundException('Supervisor record not found');
    }

    // 2. Fetch the queue entry to skip
    const queueEntry = await this.prisma.queueEntry.findUnique({
      where: { id: dto.queueEntryId },
    });

    if (!queueEntry) {
      throw new NotFoundException(`Queue entry ${dto.queueEntryId} not found`);
    }

    if (queueEntry.status !== QueueStatus.PENDING) {
      throw new BadRequestException(`Queue entry is not pending (current status: ${queueEntry.status})`);
    }

    // 3. Create a cryptographic signature to guarantee audit log integrity
    const timestamp = new Date();
    const signaturePayload = `${queueEntry.id}:${supervisor.id}:${dto.overrideType}:${dto.reason}:${timestamp.toISOString()}`;
    const hmacSecret = process.env.OVERRIDE_HMAC_SECRET || 'override-secret-key-2026';
    const signature = crypto
      .createHmac('sha256', hmacSecret)
      .update(signaturePayload)
      .digest('hex');

    // 4. Update queue status and create override log atomically in a transaction
    return this.prisma.$transaction(async (tx) => {
      // Mark queue status as SKIPPED
      const updatedQueue = await tx.queueEntry.update({
        where: { id: queueEntry.id },
        data: { status: QueueStatus.SKIPPED },
      });

      // Insert override audit entry
      const log = await tx.overrideLog.create({
        data: {
          queueEntryId: queueEntry.id,
          supervisorId: supervisor.id,
          overrideType: dto.overrideType,
          reason: dto.reason,
          timestamp,
          signature,
        },
      });

      // Add to main audit log
      await tx.auditLog.create({
        data: {
          userId: supervisor.id,
          action: 'QUEUE_OVERRIDE_SKIP',
          details: `Supervisor skipped vehicle queue entry ${queueEntry.id} with reason: ${dto.reason}`,
        },
      });

      return {
        queueEntry: updatedQueue,
        overrideLog: log,
      };
    });
  }

  async getOverrideLogs() {
    return this.prisma.overrideLog.findMany({
      include: {
        supervisor: true,
        queueEntry: {
          include: {
            vehicle: true,
            route: true,
            terminal: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
    });
  }
}
