import { IsNotEmpty, IsString, IsEmail, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { RoleName } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'planner_kebede' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ example: 'user@aatdrs.gov.et' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: 'Password123!', required: false })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiProperty({ enum: RoleName, example: RoleName.DISPATCHER })
  @IsEnum(RoleName)
  @IsNotEmpty()
  roleName!: RoleName;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateUserDto {
  @ApiProperty({ example: 'planner_kebede', required: false })
  @IsString()
  @IsOptional()
  username?: string;

  @ApiProperty({ example: 'user@aatdrs.gov.et', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'Password123!', required: false })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiProperty({ enum: RoleName, example: RoleName.DISPATCHER, required: false })
  @IsEnum(RoleName)
  @IsOptional()
  roleName?: RoleName;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
