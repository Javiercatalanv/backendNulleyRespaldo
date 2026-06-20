import {Injectable,Logger,InternalServerErrorException,ServiceUnavailableException,NotFoundException} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResearcherProfile } from '../researcher-profiles/entities/researcher-profile.entity';
import { PublicationDetailsService } from '../publication-details/publication-details.service';
import { ApiSnapshotsService } from '../api-snapshots/api-snapshots.service';

export interface WosSyncResult {
  profileId: string;
  externalId: string;
  fullName: string;
  fetched: number;
  stored: number;
  errors: string[];
}

@Injectable()
export class WosFetcherService {
  private readonly logger = new Logger(WosFetcherService.name);

  private static readonly API_BASE =
    'https://api.clarivate.com/apis/wos-starter/v1';
  private static readonly PLATFORM_CODE = 'WOS';
  private static readonly REQUEST_DELAY_MS = 1100;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly publicationDetailsService: PublicationDetailsService,
    private readonly apiSnapshotsService: ApiSnapshotsService,
    @InjectRepository(ResearcherProfile)
    private readonly profileRepository: Repository<ResearcherProfile>,
  ) {}

  async syncAllProfiles(): Promise<WosSyncResult[]> {
    this.ensureApiKey();
    const profiles = await this.profileRepository
      .createQueryBuilder('profile')
      .innerJoinAndSelect('profile.platform', 'platform')
      .innerJoinAndSelect('profile.researcher', 'researcher')
      .where('platform.code = :code', { code: WosFetcherService.PLATFORM_CODE })
      .getMany();

    const results: WosSyncResult[] = [];
    for (const profile of profiles) {
      results.push(await this.syncOneProfile(profile.id));
      await this.delay(WosFetcherService.REQUEST_DELAY_MS);
    }
    return results;
  }

  async syncOneProfile(profileId: string): Promise<WosSyncResult> {
    this.ensureApiKey();
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      relations: ['researcher', 'platform'],
    });
    if (!profile) {
      throw new NotFoundException(`Profile ${profileId} not found`);
    }
    if (profile.platform.code !== WosFetcherService.PLATFORM_CODE) {
      throw new NotFoundException(
        `Profile ${profileId} is not a WOS profile (it belongs to ${profile.platform.code})`,
      );
    }
    return this.fetchAndStoreByExternalId(profile);
  }

  async testByExternalId(researcherId: string) {
    this.ensureApiKey();
    let pages: any[];
    try {
      pages = await this.fetchAllPages(researcherId);
    } catch (err) {
      throw new ServiceUnavailableException(
        `Could not reach the Web of Science API: ${(err as Error).message}`,
      );
    }
    const documents = this.flattenHits(pages);
    return {
      externalId: researcherId,
      fetched: documents.length,
      publications: documents.map((doc) => this.normalizeForPreview(doc)),
    };
  }

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
      WosFetcherService.PLATFORM_CODE,
    );

    for (const snapshot of snapshots) {
      if (!snapshot.researcherProfileId) {
        result.errors.push(
          `Snapshot ${snapshot._id} skipped: no researcherProfileId.`,
        );
        continue;
      }
      const documents = this.flattenHits(snapshot.rawResponse);
      for (const doc of documents) {
        try {
          const normalized = this.normalizeDocument(
            doc,
            snapshot.researcherProfileId,
          );
          if (!normalized) continue;
          await this.publicationDetailsService.upsert(normalized);
          result.publicationsUpserted += 1;
        } catch (err) {
          result.errors.push(
            `Snapshot ${snapshot._id}, doc "${doc?.title ?? doc?.uid}": ${(err as Error).message}`,
          );
        }
      }
      result.snapshotsProcessed += 1;
    }

    this.logger.log(
      `WoS reprocess complete: ${result.publicationsUpserted} upserts from ` +
        `${result.snapshotsProcessed} snapshots, ${result.errors.length} errors.`,
    );
    return result;
  }

  private async fetchAndStoreByExternalId(
    profile: ResearcherProfile,
  ): Promise<WosSyncResult> {
    const fullName =
      `${profile.researcher.firstName} ${profile.researcher.lastName}`.trim();
    this.logger.log(
      `Syncing WOS publications for ${fullName} (RID=${profile.externalId})`,
    );

    let pages: any[];
    try {
      pages = await this.fetchAllPages(profile.externalId);
    } catch (err) {
      const message = (err as Error).message;
      await this.apiSnapshotsService.saveError({
        platform: WosFetcherService.PLATFORM_CODE,
        externalId: profile.externalId,
        researcherProfileId: profile.id,
        errorMessage: message,
      });
      throw new ServiceUnavailableException(
        `Could not reach the Web of Science API: ${message}`,
      );
    }

    const documents = this.flattenHits(pages);
    await this.apiSnapshotsService.saveSuccess({
      platform: WosFetcherService.PLATFORM_CODE,
      externalId: profile.externalId,
      researcherProfileId: profile.id,
      rawResponse: pages,
      entryCount: documents.length,
    });

    const result: WosSyncResult = {
      profileId: profile.id,
      externalId: profile.externalId,
      fullName,
      fetched: documents.length,
      stored: 0,
      errors: [],
    };

    for (const doc of documents) {
      try {
        const normalized = this.normalizeDocument(doc, profile.id);
        if (!normalized) continue;
        await this.publicationDetailsService.upsert(normalized);
        result.stored += 1;
      } catch (err) {
        result.errors.push(
          `Doc "${doc?.title ?? doc?.uid ?? 'unknown'}": ${(err as Error).message}`,
        );
      }
    }
    return result;
  }

  private async fetchAllPages(externalId: string): Promise<any[]> {
    const apiKey = this.configService.get<string>('WOS_API_KEY') as string;
    const limit = 50;
    const pages: any[] = [];
    let page = 1;
    while (true) {
      const response = await lastValueFrom(
        this.httpService.get(`${WosFetcherService.API_BASE}/documents`, {
          headers: { 'X-ApiKey': apiKey, Accept: 'application/json' },
          params: { db: 'WOS', q: `AI=${externalId}`, limit, page },
        }),
      );
      const pageData = response.data;
      pages.push(pageData);
      const hits: any[] = pageData?.hits ?? [];
      if (hits.length < limit) break;
      page += 1;
      await this.delay(WosFetcherService.REQUEST_DELAY_MS);
    }
    return pages;
  }

  private flattenHits(pages: any[]): any[] {
    const out: any[] = [];
    for (const page of pages) {
      const hits: any[] = page?.hits ?? [];
      out.push(...hits);
    }
    return out;
  }

  private normalizeDocument(doc: any, profileId: string) {
    const title = doc?.title?.trim?.() ?? doc?.title;
    const year =
      Number(doc?.source?.publishYear) ||
      Number(doc?.source?.publicationYear) ||
      null;
    if (!title || !year) return null;
    return {
      title,
      journal: doc?.source?.sourceTitle ?? doc?.source?.title ?? null,
      issn:
        doc?.identifiers?.issn ??
        doc?.identifiers?.eissn ??
        doc?.source?.issn ??
        null,
      year,
      doi: doc?.identifiers?.doi ?? null,
      citedByCount: Number(doc?.citations?.[0]?.count ?? 0),
      sourcePlatform: WosFetcherService.PLATFORM_CODE,
      externalPublicationId: doc?.uid ?? doc?.id ?? '',
      profileId,
    };
  }

  private normalizeForPreview(doc: any) {
    return {
      title: doc?.title?.trim?.() ?? doc?.title ?? '(no title)',
      journal: doc?.source?.sourceTitle ?? doc?.source?.title ?? null,
      issn:
        doc?.identifiers?.issn ??
        doc?.identifiers?.eissn ??
        doc?.source?.issn ??
        null,
      year:
        Number(doc?.source?.publishYear) ||
        Number(doc?.source?.publicationYear) ||
        null,
      doi: doc?.identifiers?.doi ?? null,
      citedByCount: Number(doc?.citations?.[0]?.count ?? 0),
      uid: doc?.uid ?? doc?.id ?? '',
    };
  }

  private ensureApiKey(): void {
    const apiKey = this.configService.get<string>('WOS_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException(
        'WOS_API_KEY is not configured. Apply for one at https://developer.clarivate.com and add it to your .env file.',
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
