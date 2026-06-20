import {Injectable,Logger,InternalServerErrorException,ServiceUnavailableException,NotFoundException} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResearcherProfile } from '../researcher-profiles/entities/researcher-profile.entity';
import { PublicationDetailsService } from '../publication-details/publication-details.service';
import { ApiSnapshotsService } from '../api-snapshots/api-snapshots.service';

export interface ScopusSyncResult {
  profileId: string;
  externalId: string;
  fullName: string;
  fetched: number;
  stored: number;
  errors: string[];
}

/**
 * Client for the Scopus Search API + offline reprocessor.
 */
@Injectable()
export class ScopusFetcherService {
  private readonly logger = new Logger(ScopusFetcherService.name);

  private static readonly API_BASE =
    'https://api.elsevier.com/content/search/scopus';
  private static readonly PLATFORM_CODE = 'SCOPUS';
  private static readonly REQUEST_DELAY_MS = 250;
  private static readonly PAGE_SIZE = 25;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly publicationDetailsService: PublicationDetailsService,
    private readonly apiSnapshotsService: ApiSnapshotsService,
    @InjectRepository(ResearcherProfile)
    private readonly profileRepository: Repository<ResearcherProfile>,
  ) {}

  async syncAllProfiles(): Promise<ScopusSyncResult[]> {
    this.ensureApiKey();
    const profiles = await this.profileRepository
      .createQueryBuilder('profile')
      .innerJoinAndSelect('profile.platform', 'platform')
      .innerJoinAndSelect('profile.researcher', 'researcher')
      .where('platform.code = :code', {
        code: ScopusFetcherService.PLATFORM_CODE,
      })
      .getMany();

    const results: ScopusSyncResult[] = [];
    for (const profile of profiles) {
      results.push(await this.syncOneProfile(profile.id));
      await this.delay(ScopusFetcherService.REQUEST_DELAY_MS);
    }
    return results;
  }

  async syncOneProfile(profileId: string): Promise<ScopusSyncResult> {
    this.ensureApiKey();
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      relations: ['researcher', 'platform'],
    });
    if (!profile) {
      throw new NotFoundException(`Profile ${profileId} not found`);
    }
    if (profile.platform.code !== ScopusFetcherService.PLATFORM_CODE) {
      throw new NotFoundException(
        `Profile ${profileId} is not a SCOPUS profile (it belongs to ${profile.platform.code})`,
      );
    }
    return this.fetchAndStoreByExternalId(profile);
  }

  async testByExternalId(scopusAuthorId: string) {
    this.ensureApiKey();
    let pages: any[];
    try {
      pages = await this.fetchAllPages(scopusAuthorId);
    } catch (err) {
      throw new ServiceUnavailableException(
        `Could not reach the Scopus API: ${(err as Error).message}`,
      );
    }
    const entries = this.flattenEntries(pages);
    return {
      externalId: scopusAuthorId,
      fetched: entries.length,
      publications: entries.map((e) => this.normalizeForPreview(e)),
    };
  }

  /**
   * Used by `POST /publication-details/rebuild-from-snapshots` to
   * repopulate the relational tables after the co-authorship refactor
   */
  async reprocessAllSnapshots(): Promise<{
    snapshotsProcessed: number;
    publicationsUpserted: number;
    errors: string[];
  }> {
    const result = {
      snapshotsProcessed: 0,
      publicationsUpserted: 0,
      errors: [] as string[],
    };

    const snapshots = await this.apiSnapshotsService.findSuccessfulByPlatform(
      ScopusFetcherService.PLATFORM_CODE,
    );

    for (const snapshot of snapshots) {
      if (!snapshot.researcherProfileId) {
        result.errors.push(
          `Snapshot ${snapshot._id} skipped: no researcherProfileId.`,
        );
        continue;
      }
      const entries = this.flattenEntries(snapshot.rawResponse);
      for (const entry of entries) {
        try {
          const normalized = this.normalizeEntry(
            entry,
            snapshot.researcherProfileId,
          );
          if (!normalized) continue;
          await this.publicationDetailsService.upsert(normalized);
          result.publicationsUpserted += 1;
        } catch (err) {
          result.errors.push(
            `Snapshot ${snapshot._id}, entry "${entry?.['dc:title'] ?? entry?.eid}": ${(err as Error).message}`,
          );
        }
      }
      result.snapshotsProcessed += 1;
    }

    this.logger.log(
      `Scopus reprocess complete: ${result.publicationsUpserted} upserts from ` +
        `${result.snapshotsProcessed} snapshots, ${result.errors.length} errors.`,
    );
    return result;
  }

  private async fetchAndStoreByExternalId(
    profile: ResearcherProfile,
  ): Promise<ScopusSyncResult> {
    const fullName =
      `${profile.researcher.firstName} ${profile.researcher.lastName}`.trim();
    this.logger.log(
      `Syncing Scopus publications for ${fullName} (AU-ID=${profile.externalId})`,
    );

    let pages: any[];
    try {
      pages = await this.fetchAllPages(profile.externalId);
    } catch (err) {
      const message = (err as Error).message;
      await this.apiSnapshotsService.saveError({
        platform: ScopusFetcherService.PLATFORM_CODE,
        externalId: profile.externalId,
        researcherProfileId: profile.id,
        errorMessage: message,
      });
      throw new ServiceUnavailableException(
        `Could not reach the Scopus API: ${message}`,
      );
    }

    const entries = this.flattenEntries(pages);
    await this.apiSnapshotsService.saveSuccess({
      platform: ScopusFetcherService.PLATFORM_CODE,
      externalId: profile.externalId,
      researcherProfileId: profile.id,
      rawResponse: pages,
      entryCount: entries.length,
    });

    const result: ScopusSyncResult = {
      profileId: profile.id,
      externalId: profile.externalId,
      fullName,
      fetched: entries.length,
      stored: 0,
      errors: [],
    };

    for (const entry of entries) {
      try {
        const normalized = this.normalizeEntry(entry, profile.id);
        if (!normalized) continue;
        await this.publicationDetailsService.upsert(normalized);
        result.stored += 1;
      } catch (err) {
        result.errors.push(
          `Entry "${entry?.['dc:title'] ?? entry?.eid ?? 'unknown'}": ${(err as Error).message}`,
        );
      }
    }
    return result;
  }

  private async fetchAllPages(externalId: string): Promise<any[]> {
    const apiKey = this.configService.get<string>('SCOPUS_API_KEY') as string;
    const pages: any[] = [];
    let start = 0;
    while (true) {
      const response = await lastValueFrom(
        this.httpService.get(ScopusFetcherService.API_BASE, {
          headers: { 'X-ELS-APIKey': apiKey, Accept: 'application/json' },
          params: {
            query: `AU-ID(${externalId})`,
            count: ScopusFetcherService.PAGE_SIZE,
            start,
            field:
              'dc:title,prism:publicationName,prism:issn,prism:eIssn,prism:coverDate,prism:doi,citedby-count,eid,subtypeDescription',
          },
        }),
      );
      const pageData = response.data;
      pages.push(pageData);
      const entries: any[] = pageData?.['search-results']?.entry ?? [];
      if (entries.length === 1 && entries[0]?.error) break;
      if (entries.length < ScopusFetcherService.PAGE_SIZE) break;
      start += ScopusFetcherService.PAGE_SIZE;
      await this.delay(ScopusFetcherService.REQUEST_DELAY_MS);
    }
    return pages;
  }

  private flattenEntries(pages: any[]): any[] {
    const out: any[] = [];
    for (const page of pages) {
      const entries: any[] = page?.['search-results']?.entry ?? [];
      if (entries.length === 1 && entries[0]?.error) continue;
      out.push(...entries);
    }
    return out;
  }

  private normalizeEntry(entry: any, profileId: string) {
    const title = entry?.['dc:title']?.trim?.();
    const coverDate = entry?.['prism:coverDate'];
    const year = coverDate ? parseInt(String(coverDate).slice(0, 4), 10) : null;
    if (!title || !year) return null;
    return {
      title,
      journal: entry?.['prism:publicationName'] ?? null,
      issn: entry?.['prism:issn'] ?? entry?.['prism:eIssn'] ?? null,
      year,
      doi: entry?.['prism:doi'] ?? null,
      citedByCount: Number(entry?.['citedby-count'] ?? 0),
      sourcePlatform: ScopusFetcherService.PLATFORM_CODE,
      externalPublicationId: entry?.eid ?? '',
      profileId,
    };
  }

  private normalizeForPreview(entry: any) {
    const coverDate = entry?.['prism:coverDate'];
    return {
      title: entry?.['dc:title'] ?? '(no title)',
      journal: entry?.['prism:publicationName'] ?? null,
      issn: entry?.['prism:issn'] ?? entry?.['prism:eIssn'] ?? null,
      year: coverDate ? parseInt(String(coverDate).slice(0, 4), 10) : null,
      doi: entry?.['prism:doi'] ?? null,
      citedByCount: Number(entry?.['citedby-count'] ?? 0),
      eid: entry?.eid ?? '',
    };
  }

  private ensureApiKey(): void {
    const apiKey = this.configService.get<string>('SCOPUS_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'SCOPUS_API_KEY is not configured. Apply for one at https://dev.elsevier.com and add it to your .env file.',
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
