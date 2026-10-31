import { Module } from '@nestjs/common';
import { TeachersModule } from '../teachers/teachers.module';
import { UploadsModule } from '../uploads/uploads.module';
import { CvController } from './cv.controller';
import { CvService } from './cv.service';

@Module({
  imports: [UploadsModule, TeachersModule],
  controllers: [CvController],
  providers: [CvService],
  exports: [CvService],
})
export class CvModule {}
