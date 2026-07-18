import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateVehicleDto, UpdateVehicleDto, BatchImportVehiclesDto } from './dto/vehicle.dto';
import { VehicleStatus, ViolationType } from '@prisma/client';

@Injectable()
export class VehiclesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateVehicleDto) {
    const existing = await this.prisma.vehicle.findUnique({
      where: { plateNumber: dto.plateNumber },
    });
    if (existing) {
      throw new BadRequestException(`Vehicle with plate number ${dto.plateNumber} already registered`);
    }

    return this.prisma.vehicle.create({
      data: {
        ...dto,
        status: dto.status ?? VehicleStatus.ACTIVE,
      },
    });
  }

  async findAll() {
    return this.prisma.vehicle.findMany({
      include: { group: true, rosterVehicleAssignments: { include: { route: true } } },
    });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { group: true, rosterVehicleAssignments: { include: { route: true } } },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }
    return vehicle;
  }

  async findByPlate(plateNumber: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { plateNumber },
      include: { group: true, rosterVehicleAssignments: { include: { route: true } } },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with plate number ${plateNumber} not found`);
    }
    return vehicle;
  }

  async getPlateHistory(id: string) {
    return this.prisma.vehiclePlateHistory.findMany({
      where: { vehicleId: id },
      orderBy: { changedAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateVehicleDto) {
    const existing = await this.findOne(id);

    if (dto.plateNumber && dto.plateNumber !== existing.plateNumber) {
      await this.prisma.vehiclePlateHistory.create({
        data: {
          vehicleId: id,
          oldPlate: existing.plateNumber,
          newPlate: dto.plateNumber,
        },
      });
    }

    return this.prisma.vehicle.update({
      where: { id },
      data: dto,
    });
  }

  async registerVehicleWithViolation(data: { vehicle: CreateVehicleDto, violationDetails: string, violationType: ViolationType, severityScore?: number }) {
    const existing = await this.prisma.vehicle.findUnique({
      where: { plateNumber: data.vehicle.plateNumber },
    });
    if (existing) {
      throw new BadRequestException(`Vehicle with plate number ${data.vehicle.plateNumber} already registered`);
    }

    return this.prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({
        data: {
          ...data.vehicle,
          status: data.vehicle.status ?? VehicleStatus.ACTIVE,
        },
      });

      const violation = await tx.violationRecord.create({
        data: {
          vehicleId: vehicle.id,
          violationType: data.violationType,
          details: data.violationDetails,
          severityScore: data.severityScore ?? 0,
        }
      });

      return { vehicle, violation };
    });
  }

  async batchImport(dto: BatchImportVehiclesDto) {
    let vehiclesToImport: CreateVehicleDto[] = [];

    if (dto.csvData) {
      const cleanCsv = dto.csvData.replace(/^\uFEFF/, '').trim();
      const lines = cleanCsv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      const header = lines[0] ?? '';
      const delimiter = header.includes('\t') ? '\t' : ',';
      const startIndex = header.toLowerCase().includes('plate') ? 1 : 0;

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(delimiter).map(c => c.trim());
        if (cols.length < 3) continue;

        const [plateNumber, ownerName, ownerPhone, capacityStr] = cols;
        vehiclesToImport.push({
          plateNumber,
          ownerName,
          ownerPhone,
          capacity: capacityStr ? parseInt(capacityStr, 10) : 12,
        });
      }
    } else if (dto.vehicles) {
      vehiclesToImport = dto.vehicles;
    } else {
      throw new BadRequestException('Either csvData or vehicles array must be provided');
    }

    let importedCount = 0;
    const errors: string[] = [];

    for (const v of vehiclesToImport) {
      try {
        if (!v.plateNumber || !v.ownerName || !v.ownerPhone) {
          errors.push(`Row has missing required fields (plateNumber, ownerName, ownerPhone): ${JSON.stringify(v)}`);
          continue;
        }

        await this.prisma.vehicle.upsert({
          where: { plateNumber: v.plateNumber },
          create: {
            plateNumber: v.plateNumber,
            ownerName: v.ownerName,
            ownerPhone: v.ownerPhone,
            capacity: v.capacity ?? 12,
            status: 'ACTIVE',
          },
          update: {
            ownerName: v.ownerName,
            ownerPhone: v.ownerPhone,
            capacity: v.capacity ?? 12,
          },
        });
        importedCount++;
      } catch (err: any) {
        errors.push(`Failed to import vehicle ${v.plateNumber || 'unknown'}: ${err.message}`);
      }
    }

    return { success: true, imported: importedCount, errors };
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.vehicle.delete({
      where: { id },
    });
  }
}
