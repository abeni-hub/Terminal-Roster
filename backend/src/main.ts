import 'dotenv/config'; // Must be first — populates process.env before any module reads it
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for PWA client queries
  app.enableCors();

  // Enable validation globally using class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Configure Swagger OpenAPI
  const config = new DocumentBuilder()
    .setTitle('Addis Ababa Terminal Digital Roster System')
    .setDescription('Production-grade API backend endpoints for minibus taxi terminal FIFO dispatches, weekly rosters, and audit trails.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`AATDRS Backend running on port ${port}`);
  console.log(`Swagger documentation available at http://localhost:${port}/api/docs`);
}
bootstrap();
