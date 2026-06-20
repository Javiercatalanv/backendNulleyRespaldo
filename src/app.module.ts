import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { postgresConfig } from './config/postgres.config';
import { mongoConfig } from './config/mongo.config';
import { ResearchersModule } from './modules/researchers/researchers.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { ResearcherProfilesModule } from './modules/researcher-profiles/researcher-profiles.module';
import { PublicationsModule } from './modules/publications/publications.module';
import { ImportsModule } from './modules/imports/imports.module';
import { ExcelModule } from './modules/excel/excel.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { UploadModule } from './modules/upload/upload.module';
import { OrcidScraperModule } from './modules/modules-orcid/orcid-scraper/orcid-scraper.module';
import { SjrResolverModule } from './modules/sjr-resolver/sjr-resolver.module';
import { PublicationDetailsModule } from './modules/publication-details/publication-details.module';
import { WosFetcherModule } from './modules/wos-fetcher/wos-fetcher.module';
import { ScopusFetcherModule } from './modules/scopus-fetcher/scopus-fetcher.module';
import { ApiSnapshotsModule } from './modules/api-snapshots/api-snapshots.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: postgresConfig,
    }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: mongoConfig,
    }),

    ResearchersModule,
    PlatformsModule,
    ResearcherProfilesModule,
    PublicationsModule,
    ImportsModule,
    ExcelModule,
    StatisticsModule,
    UploadModule,
    OrcidScraperModule,
    SjrResolverModule,
    PublicationDetailsModule,
    ApiSnapshotsModule,
    WosFetcherModule,
    ScopusFetcherModule,
  ],
})
export class AppModule {}
