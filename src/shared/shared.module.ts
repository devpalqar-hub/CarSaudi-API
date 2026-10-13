import { Global, Module } from '@nestjs/common';
import { MinioService } from './minio.service';
import { MailService } from './mail.service';
import { FirebaseService } from './firebase.service';
import { WatermarkService } from './watermark.service';

@Global()
@Module({
  providers: [MinioService, MailService, FirebaseService, WatermarkService],
  exports: [MinioService, MailService, FirebaseService, WatermarkService],
})
export class SharedModule {}
