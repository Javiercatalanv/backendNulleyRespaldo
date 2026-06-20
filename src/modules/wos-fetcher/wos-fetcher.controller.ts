import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { WosFetcherService } from './wos-fetcher.service';

@Controller('wos-fetcher')
export class WosFetcherController {
  constructor(private readonly wosFetcherService: WosFetcherService) {}

  /**
   * GET /wos-fetcher/test/:researcherId
   * Example:
   *   curl http://localhost:3000/wos-fetcher/test/MIK-4669-2025
   */
  @Get('test/:researcherId')
  test(@Param('researcherId') researcherId: string) {
    return this.wosFetcherService.testByExternalId(researcherId);
  }

  /**
   * POST /wos-fetcher/sync
   * → syncs every WOS profile registered in the database.
   */
  @Post('sync')
  syncAll() {
    return this.wosFetcherService.syncAllProfiles();
  }

  /**
   * POST /wos-fetcher/sync/:profileId
   * → syncs a single profile by its internal UUID. Useful for ad-hoc
   *   refreshes after editing a researcher.
   */
  @Post('sync/:profileId')
  syncOne(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.wosFetcherService.syncOneProfile(profileId);
  }
}
