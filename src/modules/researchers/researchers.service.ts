import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Researcher } from './entities/researcher.entity';
import { CreateResearcherDto } from './dto/create-researcher.dto';

@Injectable()
export class ResearchersService {
  constructor(
    @InjectRepository(Researcher)
    private readonly researcherRepository: Repository<Researcher>,
  ) {}

  async create(dto: CreateResearcherDto): Promise<Researcher> {
    const researcher = this.researcherRepository.create(dto);
    return this.researcherRepository.save(researcher);
  }

  /**
   * Returns every researcher together with their profiles, the platform
   * each profile belongs to, and the publication counts.
   */
  findAll(): Promise<Researcher[]> {
    return this.researcherRepository.find({
      relations: ['profiles', 'profiles.platform', 'profiles.publications'],
      order: { lastName: 'ASC', firstName: 'ASC' },
    });
  }

  /**
   * Loads a single researcher by primary key, throwing 404 if not found
   * so the controller can rely on a non-null result.
   */
  async findOne(id: string): Promise<Researcher> {
    const researcher = await this.researcherRepository.findOne({
      where: { id },
      relations: ['profiles', 'profiles.platform', 'profiles.publications'],
    });
    if (!researcher) {
      throw new NotFoundException(`Researcher ${id} not found`);
    }
    return researcher;
  }

  /**
   * Looks up a researcher by full name.
   */
  findByFullName(
    firstName: string,
    lastName: string,
  ): Promise<Researcher | null> {
    return this.researcherRepository
      .createQueryBuilder('r')
      .where('LOWER(r.firstName) = LOWER(:firstName)', { firstName })
      .andWhere('LOWER(r.lastName) = LOWER(:lastName)', { lastName })
      .getOne();
  }
}
