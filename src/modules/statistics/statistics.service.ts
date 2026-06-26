import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Researcher } from '../researchers/entities/researcher.entity';
import { PublicationDetail } from '../publication-details/entities/publication-detail.entity';
import { CounterfactualImpact, ResearcherYearlySeries, YearlyPublicationPoint } from './dto/chart.dto';
import { dedupeByPriority } from '../publication-details/dedupe.util';

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(PublicationDetail)
    private readonly publicationRepository: Repository<PublicationDetail>,
    @InjectRepository(Researcher)
    private readonly researcherRepository: Repository<Researcher>,
  ) {}

  /**
   * CTE reutilizable que deduplica publicaciones por prioridad de fuente.
   * Una fila por paper (mayor prioridad: WOS > SCOPUS > ORCID, desempate por citas).
   */
  private static readonly DEDUPED_CTE = `
    WITH ranked AS (
      SELECT pd.*,
        GREATEST(
          CASE WHEN pd.sources @> '[{"platform":"WOS"}]'    THEN 3 ELSE 0 END,
          CASE WHEN pd.sources @> '[{"platform":"SCOPUS"}]' THEN 2 ELSE 0 END,
          CASE WHEN pd.sources @> '[{"platform":"ORCID"}]'  THEN 1 ELSE 0 END
        ) AS source_rank,
        CASE
          WHEN pd.doi IS NOT NULL AND pd.doi <> ''
            THEN 'doi:' || lower(trim(pd.doi))
          ELSE 'ty:' || regexp_replace(lower(pd.title), '[^a-z0-9]', '', 'g') || '|' || pd.year
        END AS dedupe_key
      FROM publication_details pd
    ),
    deduped AS (
      SELECT DISTINCT ON (dedupe_key) *
      FROM ranked
      ORDER BY dedupe_key, source_rank DESC, cited_by_count DESC
    )
  `;

  async getYearlyPublicationsPerResearcher(): Promise<ResearcherYearlySeries[]> {
    const sql = `
      ${StatisticsService.DEDUPED_CTE}
      SELECT
        researcher.id          AS "researcherId",
        researcher."firstName" AS "firstName",
        researcher."lastName"  AS "lastName",
        d.year                 AS "year",
        COUNT(DISTINCT d.id)   AS "total"
      FROM deduped d
      INNER JOIN publication_authorships auth ON auth.publication_id = d.id
      INNER JOIN researcher_profiles profile ON profile.id = auth.profile_id
      INNER JOIN researchers researcher ON researcher.id = profile.researcher_id
      GROUP BY researcher.id, researcher."firstName", researcher."lastName", d.year
      ORDER BY researcher."lastName" ASC, d.year ASC
    `;
    const rows = (await this.publicationRepository.query(sql)) as Array<{
      researcherId: string; firstName: string; lastName: string; year: string; total: string;
    }>;

    const grouped = new Map<string, ResearcherYearlySeries>();
    for (const r of rows) {
      if (!grouped.has(r.researcherId)) {
        grouped.set(r.researcherId, {
          researcherId: r.researcherId,
          fullName: `${r.firstName} ${r.lastName}`.trim(),
          points: [],
        });
      }
      grouped.get(r.researcherId)!.points.push({ year: Number(r.year), count: Number(r.total) });
    }
    return Array.from(grouped.values());
  }

  async getGlobalYearlyTotals(): Promise<YearlyPublicationPoint[]> {
    const sql = `
      ${StatisticsService.DEDUPED_CTE}
      SELECT d.year AS "year", COUNT(*) AS "total"
      FROM deduped d
      GROUP BY d.year
      ORDER BY d.year ASC
    `;
    const rows = (await this.publicationRepository.query(sql)) as Array<{ year: string; total: string }>;
    return rows.map((r) => ({ year: Number(r.year), count: Number(r.total) }));
  }

  async getCounterfactual(researcherId: string): Promise<CounterfactualImpact> {
    const researcher = await this.researcherRepository.findOne({ where: { id: researcherId } });
    if (!researcher) {
      throw new NotFoundException(`Researcher ${researcherId} not found`);
    }
    const fullName = `${researcher.firstName} ${researcher.lastName}`.trim();

    const raw = await this.publicationRepository
      .createQueryBuilder('pd')
      .innerJoin('pd.authorships', 'targetAuth')
      .innerJoin('targetAuth.profile', 'targetProfile')
      .where('targetProfile.researcher_id = :rid', { rid: researcherId })
      .leftJoinAndSelect('pd.authorships', 'allAuth')
      .leftJoinAndSelect('allAuth.profile', 'allProfile')
      .leftJoinAndSelect('allProfile.researcher', 'allResearcher')
      .getMany();

    const publications = dedupeByPriority(raw);

    const collaboratorsMap = new Map<string, { researcherId: string; fullName: string; sharedPapers: number }>();
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
          otherUcnAuthors.set(r.id, { researcherId: r.id, fullName: `${r.firstName} ${r.lastName}`.trim() });
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
          if (existing) existing.sharedPapers += 1;
          else collaboratorsMap.set(co.researcherId, { ...co, sharedPapers: 1 });
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

    const raw = await this.publicationRepository
      .createQueryBuilder('pd')
      .leftJoinAndSelect('pd.authorships', 'auth')
      .leftJoinAndSelect('auth.profile', 'profile')
      .leftJoinAndSelect('profile.researcher', 'researcher')
      .getMany();

    const publications = dedupeByPriority(raw);

    const quartileLost = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, none: 0 };
    const yearlyMap = new Map<number, { publications: number; citations: number }>();
    let publicationsLost = 0;
    let citationsLost = 0;
    const totalInSystem = publications.length;

    for (const pub of publications) {
      const ucnAuthorIds = new Set<string>();
      for (const a of pub.authorships ?? []) {
        const r = a.profile?.researcher;
        if (r?.id) ucnAuthorIds.add(r.id);
      }
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
