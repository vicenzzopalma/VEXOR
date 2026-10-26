import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({ imports: [WorkflowsModule] })
class AppModule {}

// After an uncaught exception the process state is undefined; log and exit so the
// supervisor stops cleanly instead of serving requests from a broken process.
process.on('uncaughtException', (err) => {
  console.error('FATAL [apps/api] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('FATAL [apps/api] unhandledRejection:', reason);
});

async function bootstrap() {
  if (process.env.NODE_ENV === 'production' || process.env.DEVELOPMENT_WORKSPACE !== 'true')
    throw new Error(
      'A API desta fase é local. Configure DEVELOPMENT_WORKSPACE=true; autenticação será entregue na fase 3.',
    );
  const app = await NestFactory.create(AppModule, { rawBody: true, logger: ['error', 'warn', 'log'] });
  app.enableShutdownHooks();
  app.use(
    (req: { method: string }, res: { setHeader: (key: string, value: string) => void }, next: () => void) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      next();
    },
  );
  await app.listen(Number(process.env.API_PORT ?? 4000), '127.0.0.1');
}
bootstrap().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falha ao iniciar API.');
  process.exit(1);
});
