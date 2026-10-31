import { Module } from '@nestjs/common';
import { StorageWebhooksController, UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController, StorageWebhooksController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
