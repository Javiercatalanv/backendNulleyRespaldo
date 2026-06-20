import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublicationDetail } from './entities/publication-detail.entity';
import { PublicationAuthorship } from './entities/publication-authorship.entity';
import { PublicationDetailsService } from './publication-details.service';
import { PublicationDetailsController } from './publication-details.controller';
import { ScopusFetcherModule } from '../scopus-fetcher/scopus-fetcher.module';
import { WosFetcherModule } from '../wos-fetcher/wos-fetcher.module';
import { JcrResolverModule } from '../jcr-resolver/jcr-resolver.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PublicationDetail, PublicationAuthorship]),
    JcrResolverModule,
    forwardRef(() => ScopusFetcherModule),
    forwardRef(() => WosFetcherModule),
  ],
  controllers: [PublicationDetailsController],
  providers: [PublicationDetailsService],
  exports: [PublicationDetailsService],
})
export class PublicationDetailsModule {}
