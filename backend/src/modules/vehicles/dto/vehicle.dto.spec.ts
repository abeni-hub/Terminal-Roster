import { ValidationPipe } from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';
import { CreateVehicleDto } from './vehicle.dto';

describe('CreateVehicleDto', () => {
  it('accepts status when registering a vehicle', async () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    });

    const result = await pipe.transform(
      {
        plateNumber: 'AA-1-B12345',
        ownerName: 'Bekele Alemu',
        ownerPhone: '+251911000001',
        capacity: 12,
        status: VehicleStatus.ACTIVE,
      },
      { type: 'body', metatype: CreateVehicleDto },
    );

    expect(result).toEqual(
      expect.objectContaining({
        plateNumber: 'AA-1-B12345',
        status: VehicleStatus.ACTIVE,
      }),
    );
  });
});
