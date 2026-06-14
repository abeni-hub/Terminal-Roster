import { IsNotEmpty, IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTerminalDto {
  @ApiProperty({ example: 'Megenagna Taxi Terminal' })
  @IsNotEmpty()
  @IsString()
  name!: string;

  @ApiProperty({ example: 'MEG-01' })
  @IsNotEmpty()
  @IsString()
  code!: string;

  @ApiProperty({ example: '9.0223,38.8021' })
  @IsNotEmpty()
  @IsString()
  location!: string;
}

export class UpdateTerminalDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
