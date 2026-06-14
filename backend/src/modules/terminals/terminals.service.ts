import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTerminalDto, UpdateTerminalDto } from './dto/terminal.dto';

@Injectable()
export class TerminalsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateTerminalDto) {
    return this.prisma.terminal.create({
      data: dto,
    });
  }

  async findAll() {
    return this.prisma.terminal.findMany({
      include: { routes: { include: { route: true } } },
    });
  }

  async findOne(id: string) {
    const terminal = await this.prisma.terminal.findUnique({
      where: { id },
      include: { routes: { include: { route: true } } },
    });
    if (!terminal) {
      throw new NotFoundException(`Terminal with ID ${id} not found`);
    }
    return terminal;
  }

  async update(id: string, dto: UpdateTerminalDto) {
    await this.findOne(id);
    return this.prisma.terminal.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.terminal.delete({
      where: { id },
    });
  }
}
