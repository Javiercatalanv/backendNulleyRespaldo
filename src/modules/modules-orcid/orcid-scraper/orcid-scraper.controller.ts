import { Controller, Get, Param, Query, BadRequestException } from '@nestjs/common';
import { OrcidScraperService } from './orcid-scraper.service';

@Controller('scraper')
export class OrcidScraperController {
  constructor(private readonly orcidScraperService: OrcidScraperService) {}

  @Get('orcid/academic')
  async getAcademicPublications(@Query('name') name: string) {
    if (!name) {
      throw new BadRequestException(
        'You must provide ?name= as a query parameter',
      );
    }
    return this.orcidScraperService.getAcademicByName(name);
  }

  @Get('orcid/by-id/:orcidId')
  async getByOrcidId(@Param('orcidId') orcidId: string) {
    if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(orcidId)) {
      throw new BadRequestException(
        `Invalid ORCID iD format: "${orcidId}" — expected e.g. "0000-0002-1825-0097"`,
      );
    }
    return this.orcidScraperService.getAcademicByOrcidId(orcidId);
  }
}
