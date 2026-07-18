import { IsNotEmpty, IsString, IsNumber, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRouteDto {
  @ApiProperty({ example: 'R-001' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ example: 'terminal-uuid-1' })
  @IsNotEmpty()
  @IsString()
  sourceTerminalId!: string;

  @ApiProperty({ example: 'terminal-uuid-2' })
  @IsNotEmpty()
  @IsString()
  destinationTerminalId!: string;

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
  sourceTerminalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  destinationTerminalId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  baseFareETB?: number;
}
