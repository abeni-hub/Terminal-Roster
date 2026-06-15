import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { TerminalsService } from './terminals.service';
import { CreateTerminalDto, UpdateTerminalDto } from './dto/terminal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Terminals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('terminals')
export class TerminalsController {
  constructor(private readonly terminalsService: TerminalsService) {}

  @Post()
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Create a new terminal (Admin/Planner only)' })
  async create(@Body() createTerminalDto: CreateTerminalDto) {
    return this.terminalsService.create(createTerminalDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all terminals' })
  async findAll() {
    return this.terminalsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get terminal details by ID' })
  async findOne(@Param('id') id: string) {
    return this.terminalsService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Update terminal settings' })
  async update(@Param('id') id: string, @Body() updateTerminalDto: UpdateTerminalDto) {
    return this.terminalsService.update(id, updateTerminalDto);
  }

  @Delete(':id')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Remove terminal (System Admin only)' })
  async remove(@Param('id') id: string) {
    return this.terminalsService.remove(id);
  }
}
