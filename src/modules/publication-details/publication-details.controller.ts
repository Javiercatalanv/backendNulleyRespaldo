import {Controller,Get,Param,ParseUUIDPipe,Post} from '@nestjs/common';
import { PublicationDetailsService } from './publication-details.service';
import { ScopusFetcherService } from '../scopus-fetcher/scopus-fetcher.service';
import { WosFetcherService } from '../wos-fetcher/wos-fetcher.service';

@Controller('publication-details')
export class PublicationDetailsController {
  constructor(
    private readonly publicationDetailsService: PublicationDetailsService,
    private readonly scopusFetcherService: ScopusFetcherService,
    private readonly wosFetcherService: WosFetcherService,
  ) {}

  @Get()
  findAll() {
    return this.publicationDetailsService.findAll();
  }

  @Get('researcher/:researcherId')
  findByResearcher(
    @Param('researcherId', ParseUUIDPipe) researcherId: string,
  ) {
    return this.publicationDetailsService.findByResearcher(researcherId);
  }

  @Post('rebuild-from-snapshots')
  async rebuildFromSnapshots() {
    const reset = await this.publicationDetailsService.resetAll();
    const scopus = await this.scopusFetcherService.reprocessAllSnapshots();
    const wos = await this.wosFetcherService.reprocessAllSnapshots();
    return {
      reset,
      scopus,
      wos,
      message:
        'Rebuild complete. All publications were re-processed from MongoDB snapshots; no external API calls were made.',
    };
  }
}
