import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';

class CreateUserDto {
  username!: string;
  email!: string;
  password?: string;
  roleName!: RoleName;
}

class UpdateUserDto {
  username?: string;
  email?: string;
  password?: string;
  roleName?: RoleName;
  isActive?: boolean;
}

class SettingUpdateDto {
  key!: string;
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
  @ApiOperation({ summary: 'List all system users' })
  async getUsers() {
    return this.adminService.getUsers();
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
}
