import { Module } from '@nestjs/common';
import { MetaController } from './meta.controller';
import { ReferenceCheckService } from './reference-check.service';

@Module({
  controllers: [MetaController],
  providers: [ReferenceCheckService],
  exports: [ReferenceCheckService],
})
export class MetaModule {}
