import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { RoutesService } from './routes.service';
import { CreateRouteDto, UpdateRouteDto, AssignRouteToTerminalDto } from './dto/route.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Routes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Post()
  @Roles(RoleName.SUPER_ADMIN, RoleName.TRANSPORT_OFFICE_ADMIN)
  @ApiOperation({ summary: 'Create a new route (Admin only)' })
  async create(@Body() createRouteDto: CreateRouteDto) {
    return this.routesService.create(createRouteDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all routes' })
  async findAll() {
    return this.routesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get route details by ID' })
  async findOne(@Param('id') id: string) {
    return this.routesService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TRANSPORT_OFFICE_ADMIN)
  @ApiOperation({ summary: 'Update route' })
  async update(@Param('id') id: string, @Body() updateRouteDto: UpdateRouteDto) {
    return this.routesService.update(id, updateRouteDto);
  }

  @Post(':id/assign')
  @Roles(RoleName.SUPER_ADMIN, RoleName.TRANSPORT_OFFICE_ADMIN)
  @ApiOperation({ summary: 'Assign a route to a terminal' })
  async assignToTerminal(
    @Param('id') routeId: string,
    @Body() dto: AssignRouteToTerminalDto,
  ) {
    return this.routesService.assignToTerminal(routeId, dto.terminalId);
  }

  @Delete(':id')
  @Roles(RoleName.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete route (Super Admin only)' })
  async remove(@Param('id') id: string) {
    return this.routesService.remove(id);
  }
}
