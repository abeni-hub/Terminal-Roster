import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, BadRequestException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { IsNotEmpty, IsString } from 'class-validator';

export class SettingUpdateDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  value!: string;
}


@ApiTags('System Administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── USER CRUD (System Admin only) ──────────────────────────────────────────
  @Get('users')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'List all system users with their terminal assignments' })
  async getUsers() {
    return this.adminService.getUsersWithTerminals();
  }

  @Post('users')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Create a new system user' })
  @ApiBody({ type: CreateUserDto })
  async createUser(@Body() dto: CreateUserDto) {
    return this.adminService.createUser(dto);
  }

  @Patch('users/:id')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Update system user properties' })
  @ApiBody({ type: UpdateUserDto })
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.adminService.updateUser(id, dto);
  }

  @Delete('users/:id')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Disable/Archive system user' })
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  // ── TERMINAL ASSIGNMENT (Dispatcher 1:1) ───────────────────────────────────
  @Get('users/:id/terminal')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: "Get a dispatcher's assigned terminal" })
  async getDispatcherTerminal(@Param('id') id: string) {
    return this.adminService.getDispatcherTerminal(id);
  }

  @Post('users/:id/assign-terminal')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Assign a dispatcher to a terminal (1:1 — replaces any existing assignment)' })
  @ApiBody({ schema: { properties: { terminalId: { type: 'string', nullable: true } } } })
  async assignDispatcherTerminal(
    @Param('id') id: string,
    @Body() body: { terminalId: string | null },
  ) {
    return this.adminService.assignDispatcherTerminal(id, body.terminalId ?? null);
  }

  // ── SETTINGS CRUD (System Admin only) ──────────────────────────────────────
  @Get('settings')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Get global system settings configuration' })
  async getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Batch update system settings configuration' })
  @ApiBody({ type: [SettingUpdateDto] })
  async updateSettings(@Body() settings: SettingUpdateDto[]) {
    return this.adminService.updateSettings(settings);
  }

  // ── AUDIT LOGS (System Admin only) ────────────────────────────────────────
  @Get('audit-logs')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Get system-wide audit trail logs' })
  async getAuditLogs() {
    return this.adminService.getAuditLogs();
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  @Get('dashboard/transport')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.MUNICIPAL_PLANNER)
  @ApiOperation({ summary: 'Get transport dashboard metrics' })
  async getTransportDashboardMetrics() {
    return this.adminService.getTransportDashboardMetrics();
  }

  // ── PRICING RULES ──────────────────────────────────────────────────────────
  @Get('pricing-rules')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Get all dynamic pricing rules' })
  async getPricingRules() {
    return this.adminService.getPricingRules();
  }

  @Post('pricing-rules')
  @Roles(RoleName.SYSTEM_ADMIN)
  @ApiOperation({ summary: 'Create or update a dynamic pricing rule for a dispatcher' })
  async upsertPricingRule(
    @Body() body: { dispatcherId: string; fareMultiplier: number }
  ) {
    if (!body.dispatcherId || body.fareMultiplier == null) {
      throw new BadRequestException('dispatcherId and fareMultiplier are required');
    }
    return this.adminService.upsertPricingRule(body.dispatcherId, body.fareMultiplier);
  }
}
