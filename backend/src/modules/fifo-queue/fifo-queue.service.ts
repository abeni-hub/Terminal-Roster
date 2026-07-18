import { Injectable, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CheckInVehicleDto, DispatchVehicleDto } from './dto/queue.dto';
import { QueueStatus, VehicleStatus, ViolationType } from '@prisma/client';

@Injectable()
export class FifoQueueService {
  constructor(private prisma: PrismaService) {}

  private sortQueueEntries<T extends { checkInTime: Date | string | number; sequence?: number | null }>(entries: T[]): T[] {
    return [...entries].sort((a, b) => {
      const aTime = a.checkInTime instanceof Date ? a.checkInTime.getTime() : new Date(a.checkInTime).getTime();
      const bTime = b.checkInTime instanceof Date ? b.checkInTime.getTime() : new Date(b.checkInTime).getTime();

      if (aTime !== bTime) {
        return aTime - bTime;
      }

      return (a.sequence ?? 0) - (b.sequence ?? 0);
    });
  }

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
          terminalId: terminal.id,
          routeId: route.id,
        },
      });
      if (!assignment) {
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
      // Log Route Hopping Violation but still allow the vehicle into the queue
      await this.prisma.violationRecord.create({
        data: {
          vehicleId: vehicle.id,
          violationType: ViolationType.ROUTE_HOPPING,
          details: `Vehicle checked in to route ${route.code} at terminal ${terminal.name} without a valid weekly assignment. Remark: ${dto.remark || 'None'}`,
          severityScore: 80, // Severity: High
        },
      });
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
          details: `Vehicle checked in to route ${route.code} at terminal ${terminal.name} which does not serve this route. Remark: ${dto.remark || 'None'}`,
          severityScore: 75,
        },
      });
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
          terminalId: dto.terminalId,
          routeId: dto.routeId,
        },
      });
      if (!assignment) {
        throw new BadRequestException('You are not authorized to dispatch vehicles from this terminal/route');
      }
    }

    // 1. Fetch current pending queue sorted strictly by entry timestamp and sequence
    const queue = this.sortQueueEntries(
      await this.prisma.queueEntry.findMany({
        where: {
          terminalId: dto.terminalId,
          routeId: dto.routeId,
          status: QueueStatus.WAITING,
        },
        orderBy: [
          { checkInTime: 'asc' },
          { sequence: 'asc' },
        ],
      }),
    );

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

    const route = await this.prisma.route.findUnique({
      where: { id: dto.routeId },
    });

    if (!route) {
      throw new BadRequestException('Route not found');
    }

    // Fetch dispatcher pricing rule if any
    const pricingRule = await this.prisma.pricingRule.findUnique({
      where: { dispatcherId },
    });
    const multiplier = pricingRule ? Number(pricingRule.fareMultiplier) : 1.0;
    const finalFare = Number(route.baseFareETB) * multiplier;

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
          fareChargedETB: finalFare,
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
        route: { select: { code: true, sourceTerminal: { select: { name: true } }, destinationTerminal: { select: { name: true } } } },
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
          terminalId,
          routeId,
        },
      });
      if (!assignment) {
        return [];
      }
    }

    const queueEntries = await this.prisma.queueEntry.findMany({
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
        vehicle: {
          include: {
            violations: {
              where: { resolved: false }
            }
          }
        },
      },
    });

    return this.sortQueueEntries(queueEntries);
  }
}
