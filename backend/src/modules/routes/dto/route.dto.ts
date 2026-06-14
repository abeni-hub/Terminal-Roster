import { IsNotEmpty, IsString, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRouteDto {
  @ApiProperty({ example: 'R-001' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ example: 'Megenagna' })
  @IsNotEmpty()
  @IsString()
  origin!: string;

  @ApiProperty({ example: 'Bole' })
  @IsNotEmpty()
  @IsString()
  destination!: string;

  @ApiProperty({ example: 15.00 })
  @IsNotEmpty()
  @IsNumber()
  baseFareETB!: number;
}

export class AssignRouteToTerminalDto {
  @ApiProperty({ example: 'terminal-uuid' })
  @IsNotEmpty()
  @IsUUID()
  terminalId!: string;
}

export class UpdateRouteDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  origin?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  destination?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  baseFareETB?: number;
}
