import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { REDIS_HOST, REDIS_PORT, REDIS_USERNAME, REDIS_PASSWORD } from '../../config';

// Redis connection only — no job-specific logic here. Producers/processors
// for a given job (e.g. transcribe) live in their own app-logic module and
// import BullModule.registerQueue([...]) using the names in queue.constants.ts.
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: REDIS_HOST,
        port: Number(REDIS_PORT),
        username: REDIS_USERNAME,
        password: REDIS_PASSWORD,
      },
      // Redis Cloud's restricted-permission users typically deny admin
      // commands like INFO, which BullMQ otherwise calls on connect to
      // check the server version — skip that check to avoid a NOPERM error.
      skipVersionCheck: true,
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
