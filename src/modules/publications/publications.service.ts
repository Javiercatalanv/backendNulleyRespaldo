import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Publication } from './entities/publication.entity';

@Injectable()
export class PublicationsService {
  constructor(
    @InjectRepository(Publication)
    private readonly publicationRepository: Repository<Publication>,
  ) {}

  async upsert(params: {
    profileId: string;
    year: number;
    count: number;
  }): Promise<Publication> {
    const existing = await this.publicationRepository.findOne({
      where: {
        profile: { id: params.profileId },
        year: params.year,
      },
    });
    if (existing) {
      existing.count = params.count;
      return this.publicationRepository.save(existing);
    }
    const created = this.publicationRepository.create({
      year: params.year,
      count: params.count,
      profile: { id: params.profileId } as any,
    });
    return this.publicationRepository.save(created);
  }

  async upsertManyForProfile(
    profileId: string,
    yearCounts: Array<{ year: number; count: number }>,
  ): Promise<void> {
    for (const yc of yearCounts) {
      await this.upsert({ profileId, year: yc.year, count: yc.count });
    }
  }
}
