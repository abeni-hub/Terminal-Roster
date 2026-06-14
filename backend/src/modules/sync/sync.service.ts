import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FifoQueueService } from '../fifo-queue/fifo-queue.service';
import { OverridesService } from '../overrides/overrides.service';
import { BatchSyncDto } from './dto/sync.dto';
import { ViolationType } from '@prisma/client';

@Injectable()
export class SyncService {
  constructor(
    private prisma: PrismaService,
    private fifoQueueService: FifoQueueService,
    private overridesService: OverridesService,
  ) {}

  async processBatchSync(dto: BatchSyncDto) {
    // 1. Verify device binding and approval status
    const binding = await this.prisma.deviceBinding.findUnique({
      where: { deviceUuid: dto.deviceUuid },
    });

    if (!binding) {
      throw new UnauthorizedException('Device is not registered on this system');
    }

    if (!binding.isApproved) {
      throw new UnauthorizedException('Device binding registration is pending administrative approval');
    }

    const succeeded: string[] = [];
    const failed: { syncId: string; error: string }[] = [];

    // 2. Process each action sequentially
    for (const item of dto.actions) {
      try {
        await this.prisma.$transaction(async (tx) => {
          switch (item.action) {
            case 'CHECKIN': {
              const { plateNumber, routeId, terminalId } = item.payload;
              await this.fifoQueueService.checkIn({
                plateNumber,
                routeId,
                terminalId,
                syncId: item.syncId,
              });
              break;
            }
            case 'DISPATCH': {
              const { routeId, terminalId, vehicleId, dispatcherId } = item.payload;
              await this.fifoQueueService.dispatch({
                routeId,
                terminalId,
                vehicleId,
                syncId: item.syncId,
              }, dispatcherId);
              break;
            }
            case 'OVERRIDE': {
              const { queueEntryId, supervisorUsername, supervisorPin, overrideType, reason } = item.payload;
              await this.overridesService.createOverride({
                queueEntryId,
                supervisorUsername,
                supervisorPin,
                overrideType,
                reason,
              });
              break;
            }
            case 'VIOLATION': {
              const { vehicleId, violationType, details, severityScore } = item.payload;
              await tx.violationRecord.create({
                data: {
                  vehicleId,
                  violationType: violationType as ViolationType,
                  details,
                  severityScore: severityScore || 50,
                  timestamp: new Date(item.timestamp),
                },
              });
              break;
            }
            default:
              throw new BadRequestException(`Unknown sync action: ${item.action}`);
          }
        });

        succeeded.push(item.syncId);
      } catch (err: any) {
        failed.push({
          syncId: item.syncId,
          error: err.message || 'Unknown database error occurred during sync processing',
        });
      }
    }

    // Update last active metadata for the tablet device
    await this.prisma.deviceBinding.update({
      where: { deviceUuid: dto.deviceUuid },
      data: { lastActiveAt: new Date() },
    });

    return {
      succeeded,
      failed,
    };
  }
}
