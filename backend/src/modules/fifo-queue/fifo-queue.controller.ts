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
  @Roles(RoleName.SUPER_ADMIN, RoleName.DISPATCHER)
  @ApiOperation({ summary: 'Check in a vehicle into the queue (Dispatcher only)' })
  async checkIn(@Body() dto: CheckInVehicleDto) {
    return this.fifoQueueService.checkIn(dto);
  }

  @Post('dispatch')
  @Roles(RoleName.SUPER_ADMIN, RoleName.DISPATCHER)
  @ApiOperation({ summary: 'Dispatch a vehicle (Dispatcher only)' })
  async dispatch(@Body() dto: DispatchVehicleDto, @CurrentUser() user: { id: string }) {
    return this.fifoQueueService.dispatch(dto, user.id);
  }

  @Get('live/:terminalId/:routeId')
  @ApiOperation({ summary: 'Get live pending queue sorted strictly by FIFO constraints' })
  async getLiveQueue(
    @Param('terminalId') terminalId: string,
    @Param('routeId') routeId: string,
  ) {
    return this.fifoQueueService.getLiveQueue(terminalId, routeId);
  }
}
