import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CheckInVehicleDto, DispatchVehicleDto } from './dto/queue.dto';
import { QueueStatus, VehicleStatus, ViolationType } from '@prisma/client';

@Injectable()
export class FifoQueueService {
  constructor(private prisma: PrismaService) {}

  async checkIn(dto: CheckInVehicleDto) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { plateNumber: dto.plateNumber },
    });

    if (!vehicle) {
      throw new BadRequestException(`Vehicle with plate ${dto.plateNumber} not found`);
    }

    if (vehicle.status !== VehicleStatus.ACTIVE) {
      throw new BadRequestException(`Vehicle is not active (current status: ${vehicle.status})`);
    }

    // 1. Check if vehicle is already in the queue as PENDING
    const existingQueue = await this.prisma.queueEntry.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: QueueStatus.PENDING,
      },
    });

    if (existingQueue) {
      throw new ConflictException(`Vehicle is already checked in and pending dispatch`);
    }

    // 2. Validate roster assignments
    const now = new Date();
    const assignment = await this.prisma.vehicleRouteAssignment.findFirst({
      where: {
        vehicleId: vehicle.id,
        routeId: dto.routeId,
        expiresAt: {
          gt: now,
        },
      },
    });

    if (!assignment) {
      // Log Route Hopping Violation
      await this.prisma.violationRecord.create({
        data: {
          vehicleId: vehicle.id,
          violationType: ViolationType.ROUTE_HOPPING,
          details: `Vehicle checked in to route ${dto.routeId} at terminal ${dto.terminalId} without a valid weekly assignment.`,
          severityScore: 80, // Severity: High
        },
      });

      throw new BadRequestException(`Vehicle is not assigned to this route on the current weekly roster`);
    }

    // 3. Ensure terminal has this route mapped
    const terminalRoute = await this.prisma.terminalRoute.findUnique({
      where: {
        terminalId_routeId: {
          terminalId: dto.terminalId,
          routeId: dto.routeId,
        },
      },
    });

    if (!terminalRoute) {
      await this.prisma.violationRecord.create({
        data: {
          vehicleId: vehicle.id,
          violationType: ViolationType.UNAUTHORIZED_TERMINAL,
          details: `Vehicle checked in to route ${dto.routeId} at terminal ${dto.terminalId} which does not serve this route.`,
          severityScore: 75,
        },
      });
      throw new BadRequestException('Terminal is not assigned to serve this route');
    }

    // 4. Determine monotonic sequence number for the day
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const countToday = await this.prisma.queueEntry.count({
      where: {
        terminalId: dto.terminalId,
        routeId: dto.routeId,
        checkInTime: {
          gte: startOfDay,
        },
      },
    });

    return this.prisma.queueEntry.create({
      data: {
        terminalId: dto.terminalId,
        routeId: dto.routeId,
        vehicleId: vehicle.id,
        sequence: countToday + 1,
        syncId: dto.syncId,
      },
      include: {
        vehicle: true,
      },
    });
  }

  async dispatch(dto: DispatchVehicleDto, dispatcherId: string) {
    // 1. Fetch current pending queue sorted strictly by entry timestamp and sequence
    const queue = await this.prisma.queueEntry.findMany({
      where: {
        terminalId: dto.terminalId,
        routeId: dto.routeId,
        status: QueueStatus.PENDING,
      },
      orderBy: [
        { checkInTime: 'asc' },
        { sequence: 'asc' },
      ],
    });

    if (queue.length === 0) {
      throw new BadRequestException('The queue is empty');
    }

    const firstInQueue = queue[0];
    if (firstInQueue.vehicleId !== dto.vehicleId) {
      throw new BadRequestException(
        'Strict FIFO Violation: The selected vehicle is not at the front of the queue',
      );
    }

    // 2. Fetch Route to get pricing/fare charged
    const route = await this.prisma.route.findUnique({
      where: { id: dto.routeId },
    });

    if (!route) {
      throw new BadRequestException('Route not found');
    }

    // 3. Atomically update queue status and create dispatch record
    return this.prisma.$transaction(async (tx) => {
      // Mark as dispatched
      const updatedQueue = await tx.queueEntry.update({
        where: { id: firstInQueue.id },
        data: { status: QueueStatus.DISPATCHED },
      });

      // Create dispatch log with commissions
      const dispatchRecord = await tx.dispatchRecord.create({
        data: {
          terminalId: dto.terminalId,
          routeId: dto.routeId,
          vehicleId: dto.vehicleId,
          dispatcherId,
          fareChargedETB: route.baseFareETB,
          municipalCommission: 10.00, // 10 ETB
          platformCommission: 1.00,    // 1 ETB
          syncId: dto.syncId,
        },
        include: {
          vehicle: true,
          route: true,
        },
      });

      return {
        queueEntry: updatedQueue,
        dispatchRecord,
      };
    });
  }

  async getLiveQueue(terminalId: string, routeId: string) {
    return this.prisma.queueEntry.findMany({
      where: {
        terminalId,
        routeId,
        status: QueueStatus.PENDING,
      },
      orderBy: [
        { checkInTime: 'asc' },
        { sequence: 'asc' },
      ],
      include: {
        vehicle: true,
      },
    });
  }
}
