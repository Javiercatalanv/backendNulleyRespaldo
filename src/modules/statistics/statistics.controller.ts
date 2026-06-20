import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
 
// Agregar este DTO (puede ir en el mismo archivo o en dto/counterfactual-group.dto.ts)
import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';
 
export class CounterfactualGroupDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  researcherIds: string[];
}
 

@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Post('counterfactual-group')
  counterfactualGroup(@Body() dto: CounterfactualGroupDto) {
    return this.statisticsService.getCounterfactualGroup(dto.researcherIds);
  }

  /**
   * GET /statistics/yearly-per-researcher
   * → Publications per year per researcher (deduplicated across platforms,
   *   counts each paper once even if co-authored by multiple UCN people).
   */
  @Get('yearly-per-researcher')
  yearlyPerResearcher() {
    return this.statisticsService.getYearlyPublicationsPerResearcher();
  }

  /**
   * GET /statistics/global-yearly
   * → Institution-wide totals per year for the dashboard summary chart.
   */
  @Get('global-yearly')
  globalYearly() {
    return this.statisticsService.getGlobalYearlyTotals();
  }

  /**
   * GET /statistics/counterfactual/:researcherId
   * → What the institution loses if this researcher leaves.
   */
  @Get('counterfactual/:researcherId')
  counterfactual(@Param('researcherId', ParseUUIDPipe) researcherId: string) {
    return this.statisticsService.getCounterfactual(researcherId);
  }
}
