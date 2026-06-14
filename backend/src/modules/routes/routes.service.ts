import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateRouteDto, UpdateRouteDto } from './dto/route.dto';

@Injectable()
export class RoutesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateRouteDto) {
    const existing = await this.prisma.route.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(`Route with code ${dto.code} already exists`);
    }
    return this.prisma.route.create({
      data: dto,
    });
  }

  async findAll() {
    return this.prisma.route.findMany({
      include: { terminals: { include: { terminal: true } } },
    });
  }

  async findOne(id: string) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: { terminals: { include: { terminal: true } } },
    });
    if (!route) {
      throw new NotFoundException(`Route with ID ${id} not found`);
    }
    return route;
  }

  async update(id: string, dto: UpdateRouteDto) {
    await this.findOne(id);
    return this.prisma.route.update({
      where: { id },
      data: dto,
    });
  }

  async assignToTerminal(routeId: string, terminalId: string) {
    const route = await this.findOne(routeId);
    const terminal = await this.prisma.terminal.findUnique({
      where: { id: terminalId },
    });
    if (!terminal) {
      throw new NotFoundException(`Terminal with ID ${terminalId} not found`);
    }

    const link = await this.prisma.terminalRoute.findUnique({
      where: {
        terminalId_routeId: {
          terminalId,
          routeId,
        },
      },
    });

    if (link) {
      return link; // Already assigned
    }

    return this.prisma.terminalRoute.create({
      data: {
        terminalId,
        routeId,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.route.delete({
      where: { id },
    });
  }
}
