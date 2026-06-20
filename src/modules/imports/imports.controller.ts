import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ImportsService } from './imports.service';

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Get()
  findRecent() {
    return this.importsService.findRecent();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const record = await this.importsService.findById(id);
    if (!record) {
      throw new NotFoundException(`Import ${id} not found`);
    }
    return record;
  }
}
