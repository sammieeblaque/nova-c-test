import { registerAs } from '@nestjs/config';

export default registerAs('swagger', () => ({
  swaggerApiRoot: process.env.SWAGGER_API_ROOT || 'api-docs',
}));
