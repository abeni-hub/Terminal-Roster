import { IsNotEmpty, IsString, IsUUID, IsEnum } from 'class-validator';
import { OverrideType } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOverrideDto {
  @ApiProperty({ example: 'queue-entry-uuid' })
  @IsNotEmpty()
  @IsUUID()
  queueEntryId!: string;

  @ApiProperty({ example: 'supervisor1' })
  @IsNotEmpty()
  @IsString()
  supervisorUsername!: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  supervisorPin!: string;

  @ApiProperty({ enum: OverrideType, example: OverrideType.VEHICLE_SKIP })
  @IsNotEmpty()
  @IsEnum(OverrideType)
  overrideType!: OverrideType;

  @ApiProperty({ example: 'Vehicle tire puncture. Needs to skip queue for repair.' })
  @IsNotEmpty()
  @IsString()
  reason!: string;
}
