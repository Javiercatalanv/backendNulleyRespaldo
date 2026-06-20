import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ResearchersService } from './researchers.service';
import { CreateResearcherDto } from './dto/create-researcher.dto';

@Controller('researchers')
export class ResearchersController {
  constructor(private readonly researchersService: ResearchersService) {}

  @Post()
  create(@Body() dto: CreateResearcherDto) {
    return this.researchersService.create(dto);
  }

  @Get()
  findAll() {
    return this.researchersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.researchersService.findOne(id);
  }
}
