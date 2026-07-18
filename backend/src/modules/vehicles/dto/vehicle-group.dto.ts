import { IsNotEmpty, IsString, IsOptional, IsEnum, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { VehicleStatus } from '@prisma/client';

// ─── Group create / update ────────────────────────────────────────────────────

export class CreateVehicleGroupDto {
  @ApiProperty({ example: 'Group A' })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({ example: 'Vehicles assigned to the morning shift', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateVehicleGroupDto {
  @ApiProperty({ example: 'Group A Updated', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'Updated description', required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

// ─── Bulk import of vehicles into a group ────────────────────────────────────

export class BulkImportVehicleItemDto {
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

  @ApiProperty({ example: 12, required: false })
  @IsOptional()
  @IsNumber()
  capacity?: number;

  @ApiProperty({ enum: VehicleStatus, required: false })
  @IsOptional()
  @IsEnum(VehicleStatus)
  status?: VehicleStatus;
}

export class BulkImportVehiclesToGroupDto {
  /**
   * CSV rows: plateNumber,ownerName,ownerPhone[,capacity][,status]
   * First row is treated as a header when it contains "plate".
   */
  @ApiProperty({
    example: 'plate_number,owner_name,owner_phone,capacity,status\nAA-2-B44910,Bekele Alemu,+251911000001,12,ACTIVE',
    required: false,
  })
  @IsOptional()
  @IsString()
  csvData?: string;

  @ApiProperty({ type: [BulkImportVehicleItemDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportVehicleItemDto)
  vehicles?: BulkImportVehicleItemDto[];
}
