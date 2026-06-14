import { IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'dispatcher1' })
  @IsNotEmpty()
  @IsString()
  username!: string;

  @ApiProperty({ example: 'password123' })
  @IsNotEmpty()
  @IsString()
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  refreshToken!: string;
}

export class DeviceRegisterDto {
  @ApiProperty({ example: 'c7b5b5df-16e6-42e7-9c98-1e42b26090e0' })
  @IsNotEmpty()
  @IsUUID()
  terminalId!: string;

  @ApiProperty({ example: 'device-uuid-12345' })
  @IsNotEmpty()
  @IsString()
  deviceUuid!: string;

  @ApiProperty({ description: 'PEM public key generated on client' })
  @IsNotEmpty()
  @IsString()
  publicKey!: string;
}
