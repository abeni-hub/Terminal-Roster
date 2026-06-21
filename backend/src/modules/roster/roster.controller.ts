import {
  Controller,
  Post,
  Get,
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

  // ── POST /roster/upload  (Transport Office & Super Admin only) ──────────────
  @Post('upload')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({
    summary:
      'Upload weekly vehicle schedule CSV from Transport Office. ' +
      'Accepts 7-column format: plate_number, assigned_terminal, assigned_route, ' +
      'week_number, valid_from, valid_until, status.',
  })
  @ApiBody({ type: UploadRosterDto })
  async uploadRoster(@Body() body: UploadRosterDto) {
    if (!body.csvData) {
      throw new BadRequestException('csvData string field is required');
    }
    return this.rosterService.uploadRosterCsv(body.csvData);
  }

  // ── GET /roster/schedules  (all authenticated roles) ───────────────────────
  @Get('schedules')
  @Roles(
    RoleName.SYSTEM_ADMIN,
    RoleName.MUNICIPAL_PLANNER,
    RoleName.DISPATCHER,
  )
  @ApiOperation({ summary: 'Get weekly vehicle schedules, filterable by terminal code and week number' })
  @ApiQuery({ name: 'terminalCode', required: false, description: 'Terminal code, e.g. MEG-01' })
  @ApiQuery({ name: 'weekNumber',   required: false, description: 'ISO week number, e.g. 24'   })
  async getSchedules(
    @CurrentUser() user: any,
    @Query('terminalCode') terminalCode?: string,
    @Query('weekNumber')   weekNumberStr?: string,
  ) {
    const weekNumber = weekNumberStr ? parseInt(weekNumberStr, 10) : undefined;
    return this.rosterService.getSchedules({
      terminalCode,
      weekNumber,
      userId: user.id,
      userRole: user.roleName,
    });
  }

  // ── GET /roster/terminals  (all authenticated roles — feeds the dropdown) ───
  @Get('terminals')
  @Roles(
    RoleName.SYSTEM_ADMIN,
    RoleName.MUNICIPAL_PLANNER,
    RoleName.DISPATCHER,
  )
  @ApiOperation({ summary: 'List all active terminals (used to populate terminal selector)' })
  async getTerminals(@CurrentUser() user: any) {
    return this.rosterService.getTerminals({ userId: user.id, userRole: user.roleName });
  }

  // ── POST /roster/assign-dispatcher  (System Admin & Municipal Planner only) ─
  @Post('assign-dispatcher')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Assign a dispatcher to a terminal and route on the active roster' })
  async assignDispatcher(
    @Body() body: { dispatcherId: string; terminalId: string; routeId: string },
  ) {
    if (!body.dispatcherId || !body.terminalId || !body.routeId) {
      throw new BadRequestException('dispatcherId, terminalId, and routeId are required');
    }
    return this.rosterService.assignDispatcher(body);
  }

  // ── GET /roster/dispatcher-assignments  (System Admin & Municipal Planner only) ─
  @Get('dispatcher-assignments')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Get all dispatcher assignments on the active roster' })
  async getDispatcherAssignments() {
    return this.rosterService.getDispatcherAssignments();
  }
}

