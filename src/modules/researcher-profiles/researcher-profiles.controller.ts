import { Body, Controller, Get, Post } from '@nestjs/common';
import { ResearcherProfilesService } from './researcher-profiles.service';
import { CreateResearcherProfileDto } from './dto/create-researcher-profile.dto';

@Controller('researcher-profiles')
export class ResearcherProfilesController {
  constructor(
    private readonly researcherProfilesService: ResearcherProfilesService,
  ) {}

  @Post()
  create(@Body() dto: CreateResearcherProfileDto) {
    return this.researcherProfilesService.create(dto);
  }

  @Get()
  findAll() {
    return this.researcherProfilesService.findAll();
  }
}
