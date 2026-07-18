import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { RosterService } from './roster.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName, User } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';

class UploadRosterDto {
  csvData!: string;
}

@ApiTags('Roster Assignments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roster')
export class RosterController {
  constructor(private readonly rosterService: RosterService) {}

  // ── POST /roster/upload ──────────────────────────────────────────────────
  @Post('upload')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Upload weekly vehicle schedule CSV' })
  @ApiBody({ type: UploadRosterDto })
  async uploadRoster(@Body() body: UploadRosterDto) {
    if (!body.csvData) {
      throw new BadRequestException('csvData string field is required');
    }
    return this.rosterService.uploadRosterCsv(body.csvData);
  }

  // ── GET /roster/schedules ────────────────────────────────────────────────
  @Get('schedules')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER, RoleName.DISPATCHER)
  @ApiOperation({ summary: 'Get weekly vehicle schedules, filterable by terminal code and week number' })
  @ApiQuery({ name: 'terminalCode', required: false })
  @ApiQuery({ name: 'weekNumber',   required: false })
  @ApiQuery({ name: 'vehicleGroupId', required: false })
  async getSchedules(
    @CurrentUser() user: any,
    @Query('terminalCode') terminalCode?: string,
    @Query('weekNumber')   weekNumberStr?: string,
    @Query('vehicleGroupId') vehicleGroupId?: string,
  ) {
    const weekNumber = weekNumberStr ? parseInt(weekNumberStr, 10) : undefined;
    return this.rosterService.getSchedules({
      terminalCode,
      weekNumber,
      vehicleGroupId,
      userId: user.id,
      userRole: user.roleName,
    });
  }

  // ── GET /roster/terminals ────────────────────────────────────────────────
  @Get('terminals')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER, RoleName.DISPATCHER)
  @ApiOperation({ summary: 'List all active terminals' })
  async getTerminals(@CurrentUser() user: any) {
    return this.rosterService.getTerminals({ userId: user.id, userRole: user.roleName });
  }

  // ── GET /roster/routes?terminalId=... ────────────────────────────────────
  @Get('routes')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Get routes that originate from a specific terminal (for scheduling)' })
  @ApiQuery({ name: 'terminalId', required: true, description: 'Terminal UUID' })
  async getRoutesByTerminal(@Query('terminalId') terminalId: string) {
    if (!terminalId) {
      throw new BadRequestException('terminalId query parameter is required');
    }
    return this.rosterService.getRoutesByTerminal(terminalId);
  }

  // ── GET /roster/dispatchers?terminalId=... ────────────────────────────────
  @Get('dispatchers')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Get dispatchers assigned to a specific terminal' })
  @ApiQuery({ name: 'terminalId', required: true, description: 'Terminal UUID' })
  async getDispatchersByTerminal(@Query('terminalId') terminalId: string) {
    if (!terminalId) {
      throw new BadRequestException('terminalId query parameter is required');
    }
    return this.rosterService.getDispatchersByTerminal(terminalId);
  }

  // ── GET /roster/rotation-history?terminalId=... ────────────────────────────
  @Get('rotation-history')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Get vehicle group rotation history for a terminal' })
  @ApiQuery({ name: 'terminalId', required: true })
  async getRotationHistory(@Query('terminalId') terminalId: string) {
    if (!terminalId) {
      throw new BadRequestException('terminalId query parameter is required');
    }
    return this.rosterService.getRotationHistory(terminalId);
  }

  // ── POST /roster/assign-dispatcher ───────────────────────────────────────
  @Post('assign-dispatcher')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Assign a dispatcher to a terminal route on a roster (with terminal validation)' })
  async assignDispatcher(
    @Body() body: { dispatcherId: string; terminalId: string; routeId: string; rosterId?: string },
  ) {
    if (!body.dispatcherId || !body.terminalId || !body.routeId) {
      throw new BadRequestException('dispatcherId, terminalId, and routeId are required');
    }
    return this.rosterService.assignDispatcher(body);
  }

  // ── DELETE /roster/dispatcher-assignments/:id ─────────────────────────────
  @Delete('dispatcher-assignments/:id')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Remove a dispatcher assignment from a roster' })
  async removeDispatcherAssignment(@Param('id') id: string) {
    return this.rosterService.removeDispatcherAssignment(id);
  }

  // ── GET /roster/dispatcher-assignments ───────────────────────────────────
  @Get('dispatcher-assignments')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Get all dispatcher assignments on the active roster (or specific roster)' })
  @ApiQuery({ name: 'rosterId', required: false })
  async getDispatcherAssignments(@Query('rosterId') rosterId?: string) {
    return this.rosterService.getDispatcherAssignments(rosterId);
  }

  // ── POST /roster/swap-routes ──────────────────────────────────────────────
  @Post('swap-routes')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Swap assigned routes between two dispatcher assignments' })
  async swapRoutes(
    @Body() body: { assignmentId1: string; assignmentId2: string },
  ) {
    if (!body.assignmentId1 || !body.assignmentId2) {
      throw new BadRequestException('assignmentId1 and assignmentId2 are required');
    }
    return this.rosterService.swapRoutes(body.assignmentId1, body.assignmentId2);
  }

  // ── POST /roster/bulk-assign-vehicles ────────────────────────────────────
  @Post('bulk-assign-vehicles')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Bulk assign vehicles to a route/terminal for a specific roster' })
  async bulkAssignVehicles(
    @Body() body: { vehicleIds: string[]; terminalId: string; routeId: string; rosterId: string },
  ) {
    if (!body.vehicleIds || !body.terminalId || !body.routeId || !body.rosterId) {
      throw new BadRequestException('vehicleIds, terminalId, routeId, and rosterId are required');
    }
    return this.rosterService.bulkAssignVehicles(body);
  }

  // ── POST /roster/assign-vehicle-with-violation ────────────────────────────
  @Post('assign-vehicle-with-violation')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Assign a vehicle to an additional route and add a violation flag' })
  async assignVehicleWithViolation(
    @Body() body: { vehicleId: string; terminalId: string; routeId: string },
  ) {
    if (!body.vehicleId || !body.terminalId || !body.routeId) {
      throw new BadRequestException('vehicleId, terminalId, and routeId are required');
    }
    return this.rosterService.assignVehicleWithViolation(body);
  }

  // ── GET /roster ──────────────────────────────────────────────────────────
  @Get()
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER, RoleName.DISPATCHER)
  @ApiOperation({ summary: 'List all weekly rosters' })
  async getRosters() {
    return this.rosterService.getRosters();
  }

  // ── GET /roster/my-assignments ───────────────────────────────────────────
  @Get('my-assignments')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER, RoleName.DISPATCHER)
  @ApiOperation({ summary: "Get the currently logged-in dispatcher's assigned terminal and routes" })
  async getMyAssignments(@CurrentUser() user: any) {
    return this.rosterService.getMyDispatcherAssignments(user.id);
  }

  // ── POST /roster/:id/activate ─────────────────────────────────────────────
  @Post(':id/activate')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Activate a specific roster and deactivate all others' })
  async activateRoster(@Param('id') id: string) {
    return this.rosterService.activateRoster(id);
  }

  // ── POST /roster/:id/finalize ─────────────────────────────────────────────
  @Post(':id/finalize')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Finalize a specific roster (locks assignments)' })
  async finalizeRoster(@Param('id') id: string) {
    return this.rosterService.finalizeRoster(id);
  }

  // ── POST /roster/:id/publish ──────────────────────────────────────────────
  @Post(':id/publish')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Publish a roster: finalize + activate in one step. Locks assignments permanently.' })
  async publishRoster(@Param('id') id: string) {
    return this.rosterService.publishRoster(id);
  }

  // ── POST /roster/generate ─────────────────────────────────────────────────
  @Post('generate')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Generate weekly roster with per-terminal round-robin Vehicle Group rotation' })
  async generateWeeklyRoster(
    @Body() body: {
      startDate: string;
      endDate: string;
      weekNumber: number;
      terminalId?: string;
      preview?: boolean;
    },
  ) {
    if (!body.startDate || !body.endDate || !body.weekNumber) {
      throw new BadRequestException('startDate, endDate, and weekNumber are required');
    }
    return this.rosterService.generateWeeklyRoster({
      startDate: new Date(body.startDate),
      endDate: new Date(body.endDate),
      weekNumber: body.weekNumber,
      terminalId: body.terminalId,
      preview: body.preview,
    });
  }
}
