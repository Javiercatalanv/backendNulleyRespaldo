import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResearcherProfile } from './entities/researcher-profile.entity';
import { CreateResearcherProfileDto } from './dto/create-researcher-profile.dto';

@Injectable()
export class ResearcherProfilesService {
  constructor(
    @InjectRepository(ResearcherProfile)
    private readonly profileRepository: Repository<ResearcherProfile>,
  ) {}

  async create(dto: CreateResearcherProfileDto): Promise<ResearcherProfile> {
    const existing = await this.profileRepository.findOne({
      where: {
        researcher: { id: dto.researcherId },
        platform: { id: dto.platformId },
      },
    });
    if (existing) {
      throw new ConflictException(
        'This researcher already has a profile on this platform',
      );
    }
    const profile = this.profileRepository.create({
      externalId: dto.externalId,
      researcher: { id: dto.researcherId } as any,
      platform: { id: dto.platformId } as any,
    });
    return this.profileRepository.save(profile);
  }

  async findOrCreate(params: {
    researcherId: string;
    platformId: string;
    externalId: string;
  }): Promise<ResearcherProfile> {
    const existing = await this.profileRepository.findOne({
      where: {
        researcher: { id: params.researcherId },
        platform: { id: params.platformId },
      },
      relations: ['researcher', 'platform'],
    });
    if (existing) {
      if (existing.externalId !== params.externalId) {
        existing.externalId = params.externalId;
        await this.profileRepository.save(existing);
      }
      return existing;
    }
    const created = this.profileRepository.create({
      externalId: params.externalId,
      researcher: { id: params.researcherId } as any,
      platform: { id: params.platformId } as any,
    });
    return this.profileRepository.save(created);
  }

  findAll(): Promise<ResearcherProfile[]> {
    return this.profileRepository.find({
      relations: ['researcher', 'platform', 'publications'],
    });
  }
}
