import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CheckInVehicleDto, DispatchVehicleDto } from './dto/queue.dto';
import { QueueStatus, VehicleStatus, ViolationType } from '@prisma/client';

@Injectable()
export class FifoQueueService {
  constructor(private prisma: PrismaService) {}

  async checkIn(dto: CheckInVehicleDto, userId?: string, userRole?: string) {
    if (dto.syncId) {
      const existing = await this.prisma.queueEntry.findUnique({
        where: { syncId: dto.syncId },
        include: { vehicle: true },
      });
      if (existing) {
        return existing;
      }
    }

    // Resolve route by ID or code
    const route = await this.prisma.route.findFirst({
      where: {
        OR: [
          { id: dto.routeId },
          { code: dto.routeId },
        ],
      },
    });
    if (!route) {
      throw new BadRequestException(`Route not found: ${dto.routeId}`);
    }

    // Resolve terminal by ID or code
    const terminal = await this.prisma.terminal.findFirst({
      where: {
        OR: [
          { id: dto.terminalId },
          { code: dto.terminalId },
        ],
      },
    });
    if (!terminal) {
      throw new BadRequestException(`Terminal not found: ${dto.terminalId}`);
    }

    if (userRole === 'DISPATCHER' && userId) {
      const activeRoster = await this.prisma.roster.findFirst({
        where: { isActive: true },
      });
      if (!activeRoster) {
        throw new BadRequestException('No active roster in the system');
      }
      const assignment = await this.prisma.rosterDispatcherAssignment.findFirst({
        where: {
          rosterId: activeRoster.id,
          dispatcherId: userId,
        },
      });
      if (!assignment || assignment.terminalId !== terminal.id || assignment.routeId !== route.id) {
        throw new BadRequestException('You are not authorized to check in vehicles for this terminal/route');
      }
    }

    const vehicle = await this.prisma.vehicle.findUnique({
      where: { plateNumber: dto.plateNumber },
    });

    if (!vehicle) {
      throw new BadRequestException(`Vehicle with plate ${dto.plateNumber} not found`);
    }

    if (vehicle.status !== VehicleStatus.ACTIVE) {
      throw new BadRequestException(`Vehicle is not active (current status: ${vehicle.status})`);
    }

    // 1. Check if vehicle is already in the queue as WAITING
    const existingQueue = await this.prisma.queueEntry.findFirst({
      where: {
        vehicleId: vehicle.id,
        status: QueueStatus.WAITING,
      },
    });

    if (existingQueue) {
      throw new ConflictException(`Vehicle is already checked in and pending dispatch`);
    }

    // 2. Validate roster assignments
    const now = new Date();
    const assignment = await this.prisma.rosterVehicleAssignment.findFirst({
      where: {
        vehicleId: vehicle.id,
        routeId: route.id,
        roster: {
          isActive: true,
          startDate: {
            lte: now,
          },
          endDate: {
            gte: now,
          },
        },
      },
    });

    if (!assignment) {
      // Log Route Hopping Violation
      await this.prisma.violationRecord.create({
        data: {
          vehicleId: vehicle.id,
          violationType: ViolationType.ROUTE_HOPPING,
          details: `Vehicle checked in to route ${route.id} at terminal ${terminal.id} without a valid weekly assignment.`,
          severityScore: 80, // Severity: High
        },
      });

      throw new BadRequestException(`Vehicle is not assigned to this route on the current weekly roster`);
    }

    // 3. Ensure terminal has this route mapped
    const terminalRoute = await this.prisma.terminalRoute.findUnique({
      where: {
        terminalId_routeId: {
          terminalId: terminal.id,
          routeId: route.id,
        },
      },
    });

    if (!terminalRoute) {
      await this.prisma.violationRecord.create({
        data: {
          vehicleId: vehicle.id,
          violationType: ViolationType.UNAUTHORIZED_TERMINAL,
          details: `Vehicle checked in to route ${route.id} at terminal ${terminal.id} which does not serve this route.`,
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
        terminalId: terminal.id,
        routeId: route.id,
        checkInTime: {
          gte: startOfDay,
        },
      },
    });

    return this.prisma.queueEntry.create({
      data: {
        terminalId: terminal.id,
        routeId: route.id,
        vehicleId: vehicle.id,
        sequence: countToday + 1,
        syncId: dto.syncId,
      },
      include: {
        vehicle: true,
      },
    });
  }

  async dispatch(dto: DispatchVehicleDto, dispatcherId: string, userRole?: string) {
    if (dto.syncId) {
      const existing = await this.prisma.dispatchRecord.findUnique({
        where: { syncId: dto.syncId },
        include: { vehicle: true, route: true },
      });
      if (existing) {
        const queueEntry = await this.prisma.queueEntry.findFirst({
          where: {
            vehicleId: existing.vehicleId,
            routeId: existing.routeId,
            terminalId: existing.terminalId,
            status: QueueStatus.DISPATCHED,
          },
          orderBy: { checkOutTime: 'desc' },
        });
        return {
          queueEntry,
          dispatchRecord: existing,
        };
      }
    }

    if (userRole === 'DISPATCHER') {
      const activeRoster = await this.prisma.roster.findFirst({
        where: { isActive: true },
      });
      if (!activeRoster) {
        throw new BadRequestException('No active roster in the system');
      }
      const assignment = await this.prisma.rosterDispatcherAssignment.findFirst({
        where: {
          rosterId: activeRoster.id,
          dispatcherId,
        },
      });
      if (!assignment || assignment.terminalId !== dto.terminalId || assignment.routeId !== dto.routeId) {
        throw new BadRequestException('You are not authorized to dispatch vehicles from this terminal/route');
      }
    }

    // 1. Fetch current pending queue sorted strictly by entry timestamp and sequence
    const queue = await this.prisma.queueEntry.findMany({
      where: {
        terminalId: dto.terminalId,
        routeId: dto.routeId,
        status: QueueStatus.WAITING,
      },
      orderBy: [
        { checkInTime: 'asc' },
        { sequence: 'asc' },
      ],
    });

    if (queue.length === 0) {
      throw new BadRequestException('The queue is empty');
    }

    // Resolve vehicle by ID or plate number
    const vehicle = await this.prisma.vehicle.findFirst({
      where: {
        OR: [
          { id: dto.vehicleId },
          { plateNumber: dto.vehicleId },
        ],
      },
    });

    if (!vehicle) {
      throw new BadRequestException(`Vehicle not found: ${dto.vehicleId}`);
    }

    const firstInQueue = queue[0];
    if (firstInQueue.vehicleId !== vehicle.id) {
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
        data: { status: QueueStatus.DISPATCHED, checkOutTime: new Date() },
      });

      // Create dispatch log with commissions
      const dispatchRecord = await tx.dispatchRecord.create({
        data: {
          terminalId: dto.terminalId,
          routeId: dto.routeId,
          vehicleId: vehicle.id,
          dispatcherId,
          checkInTime: firstInQueue.checkInTime,
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

  async getDispatchHistory(userId?: string, userRole?: string) {
    const where: Record<string, any> = {};

    if (userRole === 'DISPATCHER' && userId) {
      const activeRoster = await this.prisma.roster.findFirst({
        where: { isActive: true },
      });
      if (activeRoster) {
        const assignment = await this.prisma.rosterDispatcherAssignment.findFirst({
          where: { rosterId: activeRoster.id, dispatcherId: userId },
        });
        if (assignment) {
          where.terminalId = assignment.terminalId;
          where.routeId = assignment.routeId;
        }
      }
    }

    return this.prisma.dispatchRecord.findMany({
      where,
      orderBy: { checkInTime: 'desc' },
      take: 50,
      include: {
        vehicle: { select: { plateNumber: true, ownerName: true } },
        dispatcher: { select: { username: true } },
        route: { select: { code: true, origin: true, destination: true } },
      },
    });
  }

  async getLiveQueue(terminalId: string, routeId: string, userId?: string, userRole?: string) {
    if (userRole === 'DISPATCHER' && userId) {
      const activeRoster = await this.prisma.roster.findFirst({
        where: { isActive: true },
      });
      if (!activeRoster) {
        return [];
      }
      const assignment = await this.prisma.rosterDispatcherAssignment.findFirst({
        where: {
          rosterId: activeRoster.id,
          dispatcherId: userId,
        },
      });
      if (!assignment || assignment.terminalId !== terminalId || assignment.routeId !== routeId) {
        return [];
      }
    }

    return this.prisma.queueEntry.findMany({
      where: {
        terminalId,
        routeId,
        status: QueueStatus.WAITING,
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
