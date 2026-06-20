import { Module } from '@nestjs/common';
import { ExcelService } from './excel.service';
import { ResearchersModule } from '../researchers/researchers.module';
import { PlatformsModule } from '../platforms/platforms.module';
import { ResearcherProfilesModule } from '../researcher-profiles/researcher-profiles.module';
import { PublicationsModule } from '../publications/publications.module';
import { ImportsModule } from '../imports/imports.module';

@Module({
  imports: [
    ResearchersModule,
    PlatformsModule,
    ResearcherProfilesModule,
    PublicationsModule,
    ImportsModule,
  ],
  providers: [ExcelService],
  exports: [ExcelService],
})
export class ExcelModule {}
