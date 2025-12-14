import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from './modules/swagger/swagger.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const reflector = app.get(Reflector);
  const configService = app.get(ConfigService);
  const { swaggerApiRoot } = configService.get('swagger');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );

  app.use(helmet());

  const options = {
    methods: 'GET,HEAD,POST,',
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'X-Forwarded-Host',
      'X-Forwarded-For',
      'X-Business-Id',
      'X-Platform',
      'Content-Type',
      'Accept',
      'Authorization',
    ],
    credentials: true,
  };
  app.enableCors(options);
  SwaggerModule.setup(app, swaggerApiRoot);

  app.useGlobalInterceptors(new ClassSerializerInterceptor(reflector));
  console.log(
    `Swagger available at http://localhost:${process.env.PORT ?? 3000}/${swaggerApiRoot}`,
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
