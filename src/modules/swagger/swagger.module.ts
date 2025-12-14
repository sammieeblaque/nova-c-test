import { INestApplication, Module } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule as Swagger } from '@nestjs/swagger';

@Module({})
export class SwaggerModule {
  static setup(app: INestApplication, path: string) {
    const options = new DocumentBuilder()
      .setTitle('Novacrust API Documentation')
      .setDescription('List of all the APIs for Novacrust API.')
      .setVersion('1.0')
      .addTag('Novacrust')
      .addBearerAuth()
      .build();
    const document = Swagger.createDocument(app, options);
    Swagger.setup(path, app, document, {
      swaggerOptions: { persistAuthorization: true }, // Keeps auth after refresh
    });
  }
}
