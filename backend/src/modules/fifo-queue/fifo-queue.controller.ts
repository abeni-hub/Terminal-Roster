import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { FifoQueueService } from './fifo-queue.service';
import { CheckInVehicleDto, DispatchVehicleDto } from './dto/queue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Queue Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('queue')
export class FifoQueueController {
  constructor(private readonly fifoQueueService: FifoQueueService) {}

  @Post('check-in')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.DISPATCHER)
  @ApiOperation({ summary: 'Check in a vehicle into the queue (Dispatcher only)' })
  async checkIn(@Body() dto: CheckInVehicleDto, @CurrentUser() user: any) {
    return this.fifoQueueService.checkIn(dto, user.id, user.roleName);
  }

  @Post('dispatch')
  @Roles(RoleName.SYSTEM_ADMIN, RoleName.DISPATCHER)
  @ApiOperation({ summary: 'Dispatch a vehicle (Dispatcher only)' })
  async dispatch(@Body() dto: DispatchVehicleDto, @CurrentUser() user: any) {
    return this.fifoQueueService.dispatch(dto, user.id, user.roleName);
  }

  @Get('live/:terminalId/:routeId')
  @ApiOperation({ summary: 'Get live pending queue sorted strictly by FIFO constraints' })
  async getLiveQueue(
    @Param('terminalId') terminalId: string,
    @Param('routeId') routeId: string,
    @CurrentUser() user: any,
  ) {
    return this.fifoQueueService.getLiveQueue(terminalId, routeId, user.id, user.roleName);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get recent dispatch history (last 50 records)' })
  async getHistory(@CurrentUser() user: any) {
    return this.fifoQueueService.getDispatchHistory(user.id, user.roleName);
  }
}
