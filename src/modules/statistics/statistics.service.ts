import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Researcher } from '../researchers/entities/researcher.entity';
import { PublicationDetail } from '../publication-details/entities/publication-detail.entity';
import { CounterfactualImpact, ResearcherYearlySeries, YearlyPublicationPoint } from './dto/chart.dto';

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(PublicationDetail)
    private readonly publicationRepository: Repository<PublicationDetail>,
    @InjectRepository(Researcher)
    private readonly researcherRepository: Repository<Researcher>,
  ) {}

  async getYearlyPublicationsPerResearcher(): Promise<ResearcherYearlySeries[]> {
    const rows = await this.publicationRepository
      .createQueryBuilder('pd')
      .innerJoin('pd.authorships', 'auth')
      .innerJoin('auth.profile', 'profile')
      .innerJoin('profile.researcher', 'researcher')
      .select('researcher.id', 'researcherId')
      .addSelect('researcher.firstName', 'firstName')
      .addSelect('researcher.lastName', 'lastName')
      .addSelect('pd.year', 'year')
      .addSelect('COUNT(DISTINCT pd.id)', 'total')
      .groupBy('researcher.id')
      .addGroupBy('researcher.firstName')
      .addGroupBy('researcher.lastName')
      .addGroupBy('pd.year')
      .orderBy('researcher.lastName', 'ASC')
      .addOrderBy('pd.year', 'ASC')
      .getRawMany<{
        researcherId: string;
        firstName: string;
        lastName: string;
        year: string;
        total: string;
      }>();

    const grouped = new Map<string, ResearcherYearlySeries>();
    for (const r of rows) {
      if (!grouped.has(r.researcherId)) {
        grouped.set(r.researcherId, {
          researcherId: r.researcherId,
          fullName: `${r.firstName} ${r.lastName}`.trim(),
          points: [],
        });
      }
      grouped.get(r.researcherId)!.points.push({
        year: Number(r.year),
        count: Number(r.total),
      });
    }
    return Array.from(grouped.values());
  }

  async getGlobalYearlyTotals(): Promise<YearlyPublicationPoint[]> {
    const rows = await this.publicationRepository
      .createQueryBuilder('pd')
      .select('pd.year', 'year')
      .addSelect('COUNT(*)', 'total')
      .groupBy('pd.year')
      .orderBy('pd.year', 'ASC')
      .getRawMany<{ year: string; total: string }>();
    return rows.map((r) => ({
      year: Number(r.year),
      count: Number(r.total),
    }));
  }

  async getCounterfactual(researcherId: string): Promise<CounterfactualImpact> {
    const researcher = await this.researcherRepository.findOne({
      where: { id: researcherId },
    });
    if (!researcher) {
      throw new NotFoundException(`Researcher ${researcherId} not found`);
    }
    const fullName = `${researcher.firstName} ${researcher.lastName}`.trim();

    const publications = await this.publicationRepository
      .createQueryBuilder('pd')
      .innerJoin('pd.authorships', 'targetAuth')
      .innerJoin('targetAuth.profile', 'targetProfile')
      .where('targetProfile.researcher_id = :rid', { rid: researcherId })
      .leftJoinAndSelect('pd.authorships', 'allAuth')
      .leftJoinAndSelect('allAuth.profile', 'allProfile')
      .leftJoinAndSelect('allProfile.researcher', 'allResearcher')
      .getMany();

    const collaboratorsMap = new Map<
      string,
      { researcherId: string; fullName: string; sharedPapers: number }
    >();
    const quartileLost = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, none: 0 };
    const yearlyMap = new Map<number, { publications: number; citations: number }>();
    let exclusive = 0;
    let coAuthored = 0;
    let citationsLost = 0;

    for (const pub of publications) {
      const otherUcnAuthors = new Map<string, { researcherId: string; fullName: string }>();
      for (const a of pub.authorships ?? []) {
        const r = a.profile?.researcher;
        if (!r || r.id === researcherId) continue;
        if (!otherUcnAuthors.has(r.id)) {
          otherUcnAuthors.set(r.id, {
            researcherId: r.id,
            fullName: `${r.firstName} ${r.lastName}`.trim(),
          });
        }
      }

      if (otherUcnAuthors.size === 0) {
        exclusive += 1;
        citationsLost += pub.citedByCount;
        const q = (pub.quartile as 'Q1' | 'Q2' | 'Q3' | 'Q4' | null) ?? null;
        if (q) quartileLost[q] += 1;
        else quartileLost.none += 1;
        const y = yearlyMap.get(pub.year) ?? { publications: 0, citations: 0 };
        y.publications += 1;
        y.citations += pub.citedByCount;
        yearlyMap.set(pub.year, y);
      } else {
        coAuthored += 1;
        for (const co of otherUcnAuthors.values()) {
          const existing = collaboratorsMap.get(co.researcherId);
          if (existing) {
            existing.sharedPapers += 1;
          } else {
            collaboratorsMap.set(co.researcherId, { ...co, sharedPapers: 1 });
          }
        }
      }
    }

    const yearlyImpactLost = Array.from(yearlyMap.entries())
      .map(([year, v]) => ({ year, publications: v.publications, citations: v.citations }))
      .sort((a, b) => a.year - b.year);

    const collaboratorsAffected = Array.from(collaboratorsMap.values())
      .sort((a, b) => b.sharedPapers - a.sharedPapers);

    return {
      researcherId,
      fullName,
      totalPublications: publications.length,
      publicationsExclusiveToHim: exclusive,
      publicationsCoAuthoredWithOtherUcn: coAuthored,
      citationsLost,
      quartileDistributionLost: quartileLost,
      yearlyImpactLost,
      collaboratorsAffected,
    };
  }

  /**
   * Calcula el impacto de remover un GRUPO de investigadores simultáneamente.
   *
   * Un paper se PIERDE si todos sus autores UCN están en el grupo ausente.
   * Un paper SOBREVIVE si al menos un autor UCN NO está en el grupo.
   *
   * Así, con todos los académicos seleccionados → publicationsLost = totalInSystem.
   */
  async getCounterfactualGroup(researcherIds: string[]): Promise<{
    researcherIds: string[];
    totalInSystem: number;
    publicationsLost: number;
    publicationsSurvive: number;
    citationsLost: number;
    quartileDistributionLost: { Q1: number; Q2: number; Q3: number; Q4: number; none: number };
    yearlyImpactLost: Array<{ year: number; publications: number; citations: number }>;
  }> {
    const absentSet = new Set(researcherIds);

    // Traer todos los papers con sus autorías UCN — misma estructura que getCounterfactual
    const publications = await this.publicationRepository
      .createQueryBuilder('pd')
      .leftJoinAndSelect('pd.authorships', 'auth')
      .leftJoinAndSelect('auth.profile', 'profile')
      .leftJoinAndSelect('profile.researcher', 'researcher')
      .getMany();

    const quartileLost = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, none: 0 };
    const yearlyMap = new Map<number, { publications: number; citations: number }>();
    let publicationsLost = 0;
    let citationsLost = 0;
    const totalInSystem = publications.length;

    for (const pub of publications) {
      // Recopilar todos los autores UCN de este paper
      const ucnAuthorIds = new Set<string>();
      for (const a of pub.authorships ?? []) {
        const r = a.profile?.researcher;
        if (r?.id) ucnAuthorIds.add(r.id);
      }

      // El paper se pierde si TODOS sus autores UCN están en el grupo ausente
      // (o si no tiene autores UCN registrados, no se cuenta)
      if (ucnAuthorIds.size === 0) continue;

      const allAbsent = [...ucnAuthorIds].every((id) => absentSet.has(id));

      if (allAbsent) {
        publicationsLost += 1;
        citationsLost += pub.citedByCount ?? 0;

        const q = (pub.quartile as 'Q1' | 'Q2' | 'Q3' | 'Q4' | null) ?? null;
        if (q && q in quartileLost) quartileLost[q] += 1;
        else quartileLost.none += 1;

        if (pub.year) {
          const y = yearlyMap.get(pub.year) ?? { publications: 0, citations: 0 };
          y.publications += 1;
          y.citations += pub.citedByCount ?? 0;
          yearlyMap.set(pub.year, y);
        }
      }
    }

    const publicationsSurvive = totalInSystem - publicationsLost;

    const yearlyImpactLost = Array.from(yearlyMap.entries())
      .map(([year, v]) => ({ year, publications: v.publications, citations: v.citations }))
      .sort((a, b) => a.year - b.year);

    return {
      researcherIds,
      totalInSystem,
      publicationsLost,
      publicationsSurvive,
      citationsLost,
      quartileDistributionLost: quartileLost,
      yearlyImpactLost,
    };
  }
}