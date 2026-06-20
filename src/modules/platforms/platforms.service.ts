import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Platform } from './entities/platform.entity';

@Injectable()
export class PlatformsService implements OnModuleInit {
  private static readonly DEFAULT_PLATFORMS: Array<{ code: string; name: string }> = [
    { code: 'WOS', name: 'Web of Science' },
    { code: 'SCOPUS', name: 'Scopus' },
  ];

  constructor(
    @InjectRepository(Platform)
    private readonly platformRepository: Repository<Platform>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const platform of PlatformsService.DEFAULT_PLATFORMS) {
      const exists = await this.platformRepository.findOne({
        where: { code: platform.code },
      });
      if (!exists) {
        await this.platformRepository.save(
          this.platformRepository.create(platform),
        );
      }
    }
  }

  findAll(): Promise<Platform[]> {
    return this.platformRepository.find({ order: { name: 'ASC' } });
  }

  async findByCode(code: string): Promise<Platform> {
    const platform = await this.platformRepository.findOne({ where: { code } });
    if (!platform) {
      throw new NotFoundException(`Platform with code ${code} not found`);
    }
    return platform;
  }
}
