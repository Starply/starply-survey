import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  const port = Number(process.env['PORT'] ?? 25200);

  await app.listen(port);
  console.log(`starply-api listening on http://localhost:${port}`);
}

void bootstrap();
