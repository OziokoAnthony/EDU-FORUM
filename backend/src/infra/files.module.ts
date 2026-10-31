import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DOCUMENT_CONVERTER, GotenbergConverter, MemoryConverter } from './converter/document-converter';
import { BullJobQueue, InlineJobQueue, JOB_QUEUE } from './queue/job-queue';
import { ClamavScanner, MemoryScanner, VIRUS_SCANNER } from './scanner/virus-scanner';
import { MemoryStorage, OBJECT_STORAGE } from './storage/object-storage';
import { S3Storage } from './storage/s3.storage';

/** Object storage, virus scanner, DOC→PDF converter and job queue, chosen by *_DRIVER env vars. */
@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('STORAGE_DRIVER') === 'memory'
          ? new MemoryStorage()
          : new S3Storage({
              endpoint: config.getOrThrow('S3_ENDPOINT'),
              region: config.getOrThrow('S3_REGION'),
              bucket: config.getOrThrow('S3_BUCKET'),
              accessKeyId: config.getOrThrow('S3_ACCESS_KEY'),
              secretAccessKey: config.getOrThrow('S3_SECRET_KEY'),
              signedUrlTtlSeconds: config.getOrThrow('SIGNED_URL_TTL_SECONDS'),
            }),
    },
    {
      provide: VIRUS_SCANNER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('SCANNER_DRIVER') === 'memory'
          ? new MemoryScanner()
          : new ClamavScanner(config.getOrThrow('CLAMAV_HOST'), config.getOrThrow('CLAMAV_PORT')),
    },
    {
      provide: DOCUMENT_CONVERTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('CONVERTER_DRIVER') === 'memory'
          ? new MemoryConverter()
          : new GotenbergConverter(config.getOrThrow('GOTENBERG_URL')),
    },
    {
      provide: JOB_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('QUEUE_DRIVER') === 'inline' ? new InlineJobQueue() : new BullJobQueue(config.getOrThrow('REDIS_URL')),
    },
  ],
  exports: [OBJECT_STORAGE, VIRUS_SCANNER, DOCUMENT_CONVERTER, JOB_QUEUE],
})
export class FilesModule {}
