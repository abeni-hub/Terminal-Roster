import { IsNotEmpty, IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { VehicleStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateVehicleDto {
  @ApiProperty({ example: 'AA-3-A12345' })
  @IsNotEmpty()
  @IsString()
  plateNumber!: string;

  @ApiProperty({ example: 'Abebe Kebede' })
  @IsNotEmpty()
  @IsString()
  ownerName!: string;

  @ApiProperty({ example: '+251911223344' })
  @IsNotEmpty()
  @IsString()
  ownerPhone!: string;

  @ApiProperty({ example: 12 })
  @IsOptional()
  @IsNumber()
  capacity?: number;
}

export class UpdateVehicleDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ownerName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ownerPhone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  capacity?: number;

  @ApiProperty({ enum: VehicleStatus, required: false })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}
