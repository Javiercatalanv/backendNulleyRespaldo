import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { ExcelModule } from '../excel/excel.module';
import { JcrResolverModule } from '../jcr-resolver/jcr-resolver.module';
import { PublicationDetailsModule } from '../publication-details/publication-details.module';

@Module({
  imports: [
    ExcelModule,
    JcrResolverModule,           
    PublicationDetailsModule,
  ],
  controllers: [UploadController],
})
export class UploadModule {}