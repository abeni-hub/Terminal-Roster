import { Test, TestingModule } from '@nestjs/testing';
import { FifoQueueService } from './fifo-queue.service';
import { PrismaService } from '../../database/prisma.service';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { QueueStatus, VehicleStatus, ViolationType } from '@prisma/client';

// ── Prisma mock ───────────────────────────────────────────────────────────────
const mockVehicle = {
  id: 'vehicle-uuid-1',
  plateNumber: 'AA-3-A12345',
  status: VehicleStatus.ACTIVE,
  ownerName: 'Test Owner',
  ownerPhone: '+251900000000',
  capacity: 12,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRoute = {
  id: 'route-uuid-1',
  code: 'R-001',
  origin: 'Megenagna',
  destination: 'Bole',
  baseFareETB: 15.0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockQueueEntry = {
  id: 'queue-uuid-1',
  terminalId: 'terminal-uuid-1',
  routeId: 'route-uuid-1',
  vehicleId: 'vehicle-uuid-1',
  checkInTime: new Date('2026-06-13T08:00:00Z'),
  status: QueueStatus.PENDING,
  sequence: 1,
  syncId: 'sync-id-1',
};

const mockPrisma = {
  vehicle: {
    findUnique: jest.fn(),
  },
  queueEntry: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  vehicleRouteAssignment: {
    findFirst: jest.fn(),
  },
  terminalRoute: {
    findUnique: jest.fn(),
  },
  violationRecord: {
    create: jest.fn(),
  },
  dispatchRecord: {
    create: jest.fn(),
  },
  route: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('FifoQueueService', () => {
  let service: FifoQueueService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FifoQueueService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<FifoQueueService>(FifoQueueService);
    jest.clearAllMocks();
  });

  // ── checkIn ────────────────────────────────────────────────────────────────

  describe('checkIn()', () => {
    const dto = {
      plateNumber: 'AA-3-A12345',
      routeId: 'route-uuid-1',
      terminalId: 'terminal-uuid-1',
      syncId: 'sync-id-1',
    };

    it('should successfully check in an active vehicle on an assigned route', async () => {
      mockPrisma.vehicle.findUnique.mockResolvedValue(mockVehicle);
      mockPrisma.queueEntry.findFirst.mockResolvedValue(null);         // Not already in queue
      mockPrisma.vehicleRouteAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' }); // Valid roster
      mockPrisma.terminalRoute.findUnique.mockResolvedValue({ id: 'tr-1' }); // Terminal serves route
      mockPrisma.queueEntry.count.mockResolvedValue(0);                // First entry today
      mockPrisma.queueEntry.create.mockResolvedValue({
        ...mockQueueEntry,
        vehicle: mockVehicle,
      });

      const result = await service.checkIn(dto);

      expect(mockPrisma.queueEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            terminalId: dto.terminalId,
            routeId: dto.routeId,
            vehicleId: mockVehicle.id,
            sequence: 1,
            syncId: dto.syncId,
          }),
        }),
      );
      expect(result).toHaveProperty('id', 'queue-uuid-1');
    });

    it('should throw BadRequestException if vehicle is not found', async () => {
      mockPrisma.vehicle.findUnique.mockResolvedValue(null);

      await expect(service.checkIn(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if vehicle is SUSPENDED', async () => {
      mockPrisma.vehicle.findUnique.mockResolvedValue({
        ...mockVehicle,
        status: VehicleStatus.SUSPENDED,
      });

      await expect(service.checkIn(dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if vehicle is already in the pending queue', async () => {
      mockPrisma.vehicle.findUnique.mockResolvedValue(mockVehicle);
      mockPrisma.queueEntry.findFirst.mockResolvedValue(mockQueueEntry); // Already queued

      await expect(service.checkIn(dto)).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException and log ROUTE_HOPPING violation if vehicle has no valid roster assignment', async () => {
      mockPrisma.vehicle.findUnique.mockResolvedValue(mockVehicle);
      mockPrisma.queueEntry.findFirst.mockResolvedValue(null);
      mockPrisma.vehicleRouteAssignment.findFirst.mockResolvedValue(null); // No roster assignment
      mockPrisma.violationRecord.create.mockResolvedValue({});

      await expect(service.checkIn(dto)).rejects.toThrow(BadRequestException);

      expect(mockPrisma.violationRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vehicleId: mockVehicle.id,
            violationType: ViolationType.ROUTE_HOPPING,
          }),
        }),
      );
    });

    it('should throw BadRequestException and log UNAUTHORIZED_TERMINAL violation if terminal does not serve the route', async () => {
      mockPrisma.vehicle.findUnique.mockResolvedValue(mockVehicle);
      mockPrisma.queueEntry.findFirst.mockResolvedValue(null);
      mockPrisma.vehicleRouteAssignment.findFirst.mockResolvedValue({ id: 'assignment-1' });
      mockPrisma.terminalRoute.findUnique.mockResolvedValue(null); // Terminal NOT serving this route
      mockPrisma.violationRecord.create.mockResolvedValue({});

      await expect(service.checkIn(dto)).rejects.toThrow(BadRequestException);

      expect(mockPrisma.violationRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vehicleId: mockVehicle.id,
            violationType: ViolationType.UNAUTHORIZED_TERMINAL,
          }),
        }),
      );
    });

    it('should set sequence to countToday + 1 (monotonically increasing)', async () => {
      mockPrisma.vehicle.findUnique.mockResolvedValue(mockVehicle);
      mockPrisma.queueEntry.findFirst.mockResolvedValue(null);
      mockPrisma.vehicleRouteAssignment.findFirst.mockResolvedValue({ id: 'a1' });
      mockPrisma.terminalRoute.findUnique.mockResolvedValue({ id: 'tr-1' });
      mockPrisma.queueEntry.count.mockResolvedValue(5); // 5 previous entries today
      mockPrisma.queueEntry.create.mockResolvedValue({
        ...mockQueueEntry,
        sequence: 6,
        vehicle: mockVehicle,
      });

      await service.checkIn(dto);

      expect(mockPrisma.queueEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sequence: 6 }),
        }),
      );
    });
  });

  // ── dispatch ───────────────────────────────────────────────────────────────

  describe('dispatch()', () => {
    const dto = {
      routeId: 'route-uuid-1',
      terminalId: 'terminal-uuid-1',
      vehicleId: 'vehicle-uuid-1',
    };
    const dispatcherId = 'user-uuid-1';

    const mockQueue = [
      { ...mockQueueEntry, vehicleId: 'vehicle-uuid-1', checkInTime: new Date('2026-06-13T08:00:00Z'), sequence: 1 },
      { ...mockQueueEntry, id: 'queue-uuid-2', vehicleId: 'vehicle-uuid-2', checkInTime: new Date('2026-06-13T08:02:00Z'), sequence: 2 },
      { ...mockQueueEntry, id: 'queue-uuid-3', vehicleId: 'vehicle-uuid-3', checkInTime: new Date('2026-06-13T08:05:00Z'), sequence: 3 },
    ];

    it('should dispatch the FIRST vehicle in queue (strict FIFO)', async () => {
      mockPrisma.queueEntry.findMany.mockResolvedValue(mockQueue);
      mockPrisma.route.findUnique.mockResolvedValue(mockRoute);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          queueEntry: {
            update: jest.fn().mockResolvedValue({ ...mockQueueEntry, status: QueueStatus.DISPATCHED }),
          },
          dispatchRecord: {
            create: jest.fn().mockResolvedValue({ id: 'dispatch-uuid-1' }),
          },
          auditLog: {
            create: jest.fn(),
          },
        });
      });

      await service.dispatch(dto, dispatcherId);
      // Vehicle A (08:00) must be selected, not B or C
      expect(mockPrisma.queueEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ checkInTime: 'asc' }, { sequence: 'asc' }],
        }),
      );
    });

    it('should throw BadRequestException if requested vehicle is NOT at the head of the queue', async () => {
      const dtoWrongVehicle = { ...dto, vehicleId: 'vehicle-uuid-2' }; // vehicle B, not vehicle A

      mockPrisma.queueEntry.findMany.mockResolvedValue(mockQueue); // queue[0] is vehicle A
      mockPrisma.route.findUnique.mockResolvedValue(mockRoute);

      await expect(service.dispatch(dtoWrongVehicle, dispatcherId)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if the queue is empty', async () => {
      mockPrisma.queueEntry.findMany.mockResolvedValue([]);
      mockPrisma.route.findUnique.mockResolvedValue(mockRoute);

      await expect(service.dispatch(dto, dispatcherId)).rejects.toThrow(BadRequestException);
    });
  });

  // ── getLiveQueue ───────────────────────────────────────────────────────────

  describe('getLiveQueue()', () => {
    it('should return queue sorted strictly by checkInTime ASC then sequence ASC', async () => {
      const unorderedEntries = [
        { ...mockQueueEntry, id: 'q3', checkInTime: new Date('2026-06-13T08:05:00Z'), sequence: 3, vehicle: mockVehicle },
        { ...mockQueueEntry, id: 'q1', checkInTime: new Date('2026-06-13T08:00:00Z'), sequence: 1, vehicle: mockVehicle },
        { ...mockQueueEntry, id: 'q2', checkInTime: new Date('2026-06-13T08:02:00Z'), sequence: 2, vehicle: mockVehicle },
      ];
      mockPrisma.queueEntry.findMany.mockResolvedValue(unorderedEntries);

      const result = await service.getLiveQueue('terminal-uuid-1', 'route-uuid-1');

      expect(mockPrisma.queueEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: QueueStatus.PENDING }),
          orderBy: [{ checkInTime: 'asc' }, { sequence: 'asc' }],
        }),
      );
      expect(result).toEqual(unorderedEntries);
    });
  });
});
