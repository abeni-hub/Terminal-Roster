import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ViolationsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.violationRecord.findMany({
      include: { vehicle: true },
      orderBy: { timestamp: 'desc' },
    });
  }

  async findByVehicle(vehicleId: string) {
    return this.prisma.violationRecord.findMany({
      where: { vehicleId },
      orderBy: { timestamp: 'desc' },
    });
  }

  async resolve(id: string) {
    const record = await this.prisma.violationRecord.findUnique({
      where: { id },
    });
    if (!record) {
      throw new NotFoundException(`Violation record ${id} not found`);
    }

    return this.prisma.violationRecord.update({
      where: { id },
      data: {
        resolved: true,
        resolvedAt: new Date(),
      },
    });
  }
}
