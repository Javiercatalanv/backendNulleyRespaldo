import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PublicationDetail } from './entities/publication-detail.entity';
import { PublicationAuthorship } from './entities/publication-authorship.entity';
import { JcrResolverService } from '../jcr-resolver/jcr-resolver.service';
import { UpsertPublicationDetailInput } from './dto/upsert-publication-detail.dto';
import { dedupeByPriority } from './dedupe.util';

@Injectable()
export class PublicationDetailsService {
  private readonly logger = new Logger(PublicationDetailsService.name);

  constructor(
    @InjectRepository(PublicationDetail)
    private readonly publicationRepository: Repository<PublicationDetail>,
    @InjectRepository(PublicationAuthorship)
    private readonly authorshipRepository: Repository<PublicationAuthorship>,
    private readonly jcrResolver: JcrResolverService,
    private readonly dataSource: DataSource,
  ) {}

  async upsert(input: UpsertPublicationDetailInput): Promise<PublicationDetail> {
    const publication = await this.findOrCreatePublication(input);
    await this.attachAuthorship(publication.id, input.profileId, input.sourcePlatform);
    return publication;
  }

  /**
   * Resuelve cuartil + JIF + anio JCR unicamente desde el JCR (Web of Science),
   * por match de ISSN. Si no hay match, ambos quedan en null.
   */
  private resolveMetrics(issn: string | null): {
    quartile: string | null;
    jif: string | null;
    jcrYear: number | null;
  } {
    const jcr = this.jcrResolver.resolveByIssn(issn);
    if (jcr) {
      return { quartile: jcr.quartile, jif: jcr.jif, jcrYear: jcr.jcrYear };
    }
    return { quartile: null, jif: null, jcrYear: null };
  }

  private async findOrCreatePublication(
    input: UpsertPublicationDetailInput,
  ): Promise<PublicationDetail> {
    const newSource = {
      platform: input.sourcePlatform,
      externalPublicationId: input.externalPublicationId,
    };

    let existing: PublicationDetail | null = null;
    if (input.doi) {
      existing = await this.publicationRepository.findOne({ where: { doi: input.doi } });
    }
    if (!existing) {
      existing = await this.publicationRepository
        .createQueryBuilder('pd')
        .where('pd.sources @> :src::jsonb', { src: JSON.stringify([newSource]) })
        .getOne();
    }

    if (!existing) {
      const metrics = this.resolveMetrics(input.issn);
      const created = this.publicationRepository.create({
        title: input.title,
        journal: input.journal,
        issn: input.issn,
        year: input.year,
        doi: input.doi,
        citedByCount: input.citedByCount,
        quartile: metrics.quartile,
        jif: metrics.jif,
        jcrYear: metrics.jcrYear,
        // mainCategory ya no se resuelve automaticamente (venia del SJR).
        sources: [newSource],
        url: this.buildUrl(input),
      });
      return this.publicationRepository.save(created);
    }

    let needsSave = false;

    const alreadyHasSource = existing.sources.some(
      (s) =>
        s.platform === newSource.platform &&
        s.externalPublicationId === newSource.externalPublicationId,
    );
    if (!alreadyHasSource) {
      existing.sources = [...existing.sources, newSource];
      needsSave = true;
    }
    if (input.citedByCount > existing.citedByCount) {
      existing.citedByCount = input.citedByCount;
      needsSave = true;
    }
    if (input.doi && !existing.doi) {
      existing.doi = input.doi;
      needsSave = true;
    }
    if (!existing.url) {
      existing.url = this.buildUrl({ ...input, doi: existing.doi ?? input.doi });
      needsSave = true;
    }

    if (needsSave) {
      return this.publicationRepository.save(existing);
    }
    return existing;
  }

  /**
   * Re-aplica cuartil/JIF/anio JCR a TODAS las publicaciones existentes,
   * unicamente desde el JCR por ISSN. Se llama tras subir un JCR nuevo.
   */
  async reapplyMetrics(): Promise<{ scanned: number; updated: number }> {
    const all = await this.publicationRepository.find();
    let updated = 0;

    const BATCH = 500;
    for (let i = 0; i < all.length; i += BATCH) {
      const slice = all.slice(i, i + BATCH);
      const changed: PublicationDetail[] = [];
      for (const pub of slice) {
        const m = this.resolveMetrics(pub.issn);
        if (pub.quartile !== m.quartile || pub.jif !== m.jif || pub.jcrYear !== m.jcrYear) {
          pub.quartile = m.quartile;
          pub.jif = m.jif;
          pub.jcrYear = m.jcrYear;
          changed.push(pub);
          updated += 1;
        }
      }
      if (changed.length) await this.publicationRepository.save(changed);
    }

    this.logger.log(`Reapply metrics: ${updated}/${all.length} publicaciones actualizadas`);
    return { scanned: all.length, updated };
  }

  private async attachAuthorship(
    publicationId: string,
    profileId: string,
    discoveredVia: string,
  ): Promise<void> {
    const existing = await this.authorshipRepository.findOne({
      where: { publication: { id: publicationId }, profile: { id: profileId } },
    });
    if (existing) return;
    const authorship = this.authorshipRepository.create({
      publication: { id: publicationId } as any,
      profile: { id: profileId } as any,
      discoveredVia,
    });
    await this.authorshipRepository.save(authorship);
  }

  private buildUrl(input: {
    doi: string | null;
    sourcePlatform: string;
    externalPublicationId: string;
  }): string | null {
    if (input.doi) return `https://doi.org/${input.doi}`;
    if (input.sourcePlatform === 'SCOPUS' && input.externalPublicationId) {
      return `https://www.scopus.com/record/display.uri?eid=${input.externalPublicationId}&origin=resultslist`;
    }
    if (input.sourcePlatform === 'WOS' && input.externalPublicationId) {
      return `https://www.webofscience.com/wos/woscc/full-record/${input.externalPublicationId}`;
    }
    return null;
  }

  async findByResearcher(researcherId: string): Promise<PublicationDetail[]> {
    const pubs = await this.publicationRepository
      .createQueryBuilder('pd')
      .innerJoin('pd.authorships', 'auth')
      .innerJoin('auth.profile', 'profile')
      .where('profile.researcher_id = :researcherId', { researcherId })
      .leftJoinAndSelect('pd.authorships', 'a2')
      .leftJoinAndSelect('a2.profile', 'p2')
      .leftJoinAndSelect('p2.researcher', 'r2')
      .leftJoinAndSelect('p2.platform', 'plat2')
      .orderBy('pd.year', 'DESC')
      .addOrderBy('pd.title', 'ASC')
      .getMany();
    return dedupeByPriority(pubs);
  }

  async findAll(): Promise<PublicationDetail[]> {
    const pubs = await this.publicationRepository.find({
      relations: [
        'authorships',
        'authorships.profile',
        'authorships.profile.researcher',
        'authorships.profile.platform',
      ],
      order: { year: 'DESC' },
    });
    return dedupeByPriority(pubs);
  }

  async resetAll(): Promise<{ deletedPublications: number; deletedAuthorships: number }> {
    const publicationCount = await this.publicationRepository.count();
    const authorshipCount = await this.authorshipRepository.count();
    await this.dataSource.query(
      'TRUNCATE TABLE publication_authorships, publication_details RESTART IDENTITY CASCADE',
    );
    this.logger.log(
      'Reset publication_details (' + publicationCount + ' rows) and ' +
        'publication_authorships (' + authorshipCount + ' rows).',
    );
    return { deletedPublications: publicationCount, deletedAuthorships: authorshipCount };
  }
}
