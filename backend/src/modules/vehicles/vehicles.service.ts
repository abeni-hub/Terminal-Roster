import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/vehicle.dto';

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
      data: dto,
    });
  }

  async findAll() {
    return this.prisma.vehicle.findMany({
      include: { rosterVehicleAssignments: { include: { route: true } } },
    });
  }

  async findOne(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { rosterVehicleAssignments: { include: { route: true } } },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with ID ${id} not found`);
    }
    return vehicle;
  }

  async findByPlate(plateNumber: string) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { plateNumber },
      include: { rosterVehicleAssignments: { include: { route: true } } },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle with plate number ${plateNumber} not found`);
    }
    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleDto) {
    await this.findOne(id);
    return this.prisma.vehicle.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.vehicle.delete({
      where: { id },
    });
  }
}
