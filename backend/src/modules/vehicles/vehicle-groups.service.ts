import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  CreateVehicleGroupDto,
  UpdateVehicleGroupDto,
  BulkImportVehiclesToGroupDto,
  BulkImportVehicleItemDto,
} from './dto/vehicle-group.dto';
import { VehicleStatus } from '@prisma/client';

@Injectable()
export class VehicleGroupsService {
  constructor(private prisma: PrismaService) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async createGroup(dto: CreateVehicleGroupDto) {
    const existing = await this.prisma.vehicleGroup.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new BadRequestException(`Vehicle group "${dto.name}" already exists`);
    }

    return this.prisma.vehicleGroup.create({
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async findAllGroups() {
    return this.prisma.vehicleGroup.findMany({
      include: {
        vehicles: {
          select: {
            id: true,
            plateNumber: true,
            ownerName: true,
            ownerPhone: true,
            capacity: true,
            status: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneGroup(id: string) {
    const group = await this.prisma.vehicleGroup.findUnique({
      where: { id },
      include: {
        vehicles: {
          select: {
            id: true,
            plateNumber: true,
            ownerName: true,
            ownerPhone: true,
            capacity: true,
            status: true,
          },
        },
      },
    });
    if (!group) {
      throw new NotFoundException(`Vehicle group with ID ${id} not found`);
    }
    return group;
  }

  async updateGroup(id: string, dto: UpdateVehicleGroupDto) {
    await this.findOneGroup(id);

    if (dto.name) {
      const existing = await this.prisma.vehicleGroup.findFirst({
        where: { name: dto.name, NOT: { id } },
      });
      if (existing) {
        throw new BadRequestException(`Vehicle group "${dto.name}" already exists`);
      }
    }

    return this.prisma.vehicleGroup.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
      },
    });
  }

  async deleteGroup(id: string) {
    await this.findOneGroup(id);
    return this.prisma.vehicleGroup.delete({ where: { id } });
  }

  // ─── Vehicle membership ───────────────────────────────────────────────────

  async addVehiclesToGroup(groupId: string, vehicleIds: string[]) {
    await this.findOneGroup(groupId);
    await this.prisma.vehicle.updateMany({
      where: { id: { in: vehicleIds } },
      data: { groupId },
    });
    return { success: true };
  }

  async removeVehiclesFromGroup(groupId: string, vehicleIds: string[]) {
    await this.findOneGroup(groupId);
    await this.prisma.vehicle.updateMany({
      where: { id: { in: vehicleIds }, groupId },
      data: { groupId: null },
    });
    return { success: true };
  }

  async moveVehicles(vehicleIds: string[], targetGroupId: string) {
    await this.findOneGroup(targetGroupId);
    await this.prisma.vehicle.updateMany({
      where: { id: { in: vehicleIds } },
      data: { groupId: targetGroupId },
    });
    return { success: true };
  }

  async swapVehiclesGroups(vehicleId1: string, vehicleId2: string) {
    const v1 = await this.prisma.vehicle.findUnique({ where: { id: vehicleId1 } });
    const v2 = await this.prisma.vehicle.findUnique({ where: { id: vehicleId2 } });

    if (!v1 || !v2) {
      throw new BadRequestException('One or both vehicles not found');
    }

    await this.prisma.$transaction([
      this.prisma.vehicle.update({ where: { id: vehicleId1 }, data: { groupId: v2.groupId } }),
      this.prisma.vehicle.update({ where: { id: vehicleId2 }, data: { groupId: v1.groupId } }),
    ]);

    return { success: true };
  }

  // ─── Bulk import ──────────────────────────────────────────────────────────

  async bulkImportToGroup(groupId: string, dto: BulkImportVehiclesToGroupDto) {
    await this.findOneGroup(groupId);

    let rows: BulkImportVehicleItemDto[] = [];

    if (dto.csvData) {
      rows = this.parseCsv(dto.csvData);
    } else if (dto.vehicles && dto.vehicles.length > 0) {
      rows = dto.vehicles;
    } else {
      throw new BadRequestException('Provide either csvData or a vehicles array');
    }

    let imported = 0;
    const errors: string[] = [];

    for (const row of rows) {
      try {
        if (!row.plateNumber || !row.ownerName || !row.ownerPhone) {
          errors.push(`Missing required fields for row: ${JSON.stringify(row)}`);
          continue;
        }

        await this.prisma.vehicle.upsert({
          where: { plateNumber: row.plateNumber },
          create: {
            plateNumber: row.plateNumber,
            ownerName: row.ownerName,
            ownerPhone: row.ownerPhone,
            capacity: row.capacity ?? 12,
            status: row.status ?? VehicleStatus.ACTIVE,
            groupId,
          },
          update: {
            ownerName: row.ownerName,
            ownerPhone: row.ownerPhone,
            capacity: row.capacity ?? 12,
            status: row.status ?? VehicleStatus.ACTIVE,
            groupId,
          },
        });

        imported++;
      } catch (err: any) {
        errors.push(`Failed for ${row.plateNumber ?? 'unknown'}: ${err.message}`);
      }
    }

    return { success: true, imported, errors };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private parseCsv(raw: string): BulkImportVehicleItemDto[] {
    const cleaned = raw.replace(/^\uFEFF/, '').trim();
    const lines = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    if (lines.length === 0) return [];

    const header = lines[0] ?? '';
    const delimiter = header.includes('\t') ? '\t' : ',';
    const hasHeader = header.toLowerCase().includes('plate');
    const startIndex = hasHeader ? 1 : 0;

    const results: BulkImportVehicleItemDto[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
      // Expected columns: plateNumber, ownerName, ownerPhone[, capacity][, status]
      const [plateNumber, ownerName, ownerPhone, capacityStr, statusStr] = cols;

      const capacity = capacityStr ? parseInt(capacityStr, 10) : undefined;
      const status =
        statusStr && Object.values(VehicleStatus).includes(statusStr.toUpperCase() as VehicleStatus)
          ? (statusStr.toUpperCase() as VehicleStatus)
          : undefined;

      results.push({ plateNumber, ownerName, ownerPhone, capacity, status });
    }

    return results;
  }
}
