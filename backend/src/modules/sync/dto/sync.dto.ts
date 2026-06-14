import { IsNotEmpty, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class SyncActionDto {
  @ApiProperty({ example: 'CHECKIN' })
  @IsNotEmpty()
  @IsString()
  action!: 'CHECKIN' | 'DISPATCH' | 'OVERRIDE' | 'VIOLATION';

  @ApiProperty()
  @IsNotEmpty()
  payload!: any;

  @ApiProperty()
  @IsNotEmpty()
  timestamp!: number;

  @ApiProperty({ example: 'client-sync-uuid' })
  @IsNotEmpty()
  @IsString()
  syncId!: string;
}

export class BatchSyncDto {
  @ApiProperty({ example: 'device-uuid-12345' })
  @IsNotEmpty()
  @IsString()
  deviceUuid!: string;

  @ApiProperty({ type: [SyncActionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncActionDto)
  actions!: SyncActionDto[];
}
