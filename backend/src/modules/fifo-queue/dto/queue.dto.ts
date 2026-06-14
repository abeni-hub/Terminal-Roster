import { IsNotEmpty, IsString, IsUUID, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckInVehicleDto {
  @ApiProperty({ example: 'AA-3-A12345' })
  @IsNotEmpty()
  @IsString()
  plateNumber!: string;

  @ApiProperty({ example: 'route-uuid' })
  @IsNotEmpty()
  @IsUUID()
  routeId!: string;

  @ApiProperty({ example: 'terminal-uuid' })
  @IsNotEmpty()
  @IsUUID()
  terminalId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  syncId?: string;
}

export class DispatchVehicleDto {
  @ApiProperty({ example: 'route-uuid' })
  @IsNotEmpty()
  @IsUUID()
  routeId!: string;

  @ApiProperty({ example: 'terminal-uuid' })
  @IsNotEmpty()
  @IsUUID()
  terminalId!: string;

  @ApiProperty({ example: 'vehicle-uuid' })
  @IsNotEmpty()
  @IsUUID()
  vehicleId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  syncId?: string;
}
