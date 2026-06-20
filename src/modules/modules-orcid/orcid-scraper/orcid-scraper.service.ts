import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

export interface OrcidPublication {
  title: string;
  type: string;
  year: string;
  journal: string;
  url: string | null;
}

@Injectable()
export class OrcidScraperService {
  private readonly logger = new Logger(OrcidScraperService.name);
  private readonly ORCID_API_URL = 'https://pub.orcid.org/v3.0';

  constructor(private readonly httpService: HttpService) {}

  async getAcademicByName(academicName: string) {
    this.logger.log(`Searching ORCID by name: ${academicName}`);

    try {
      const searchUrl = `${this.ORCID_API_URL}/expanded-search/?q=${encodeURIComponent(academicName)}`;
      const searchResponse = await lastValueFrom(
        this.httpService.get(searchUrl, {
          headers: { Accept: 'application/json' },
        }),
      );

      const results = searchResponse.data['expanded-result'];
      if (!results || results.length === 0) {
        return {
          message: `No profile found in ORCID for: ${academicName}`,
        };
      }

      const academicProfile = results[0];
      const orcidId = academicProfile['orcid-id'];
      this.logger.log(
        `ORCID iD resolved: ${orcidId} — fetching works...`,
      );

      const publications = await this.fetchWorks(orcidId);

      return {
        academic: `${academicProfile['given-names']} ${academicProfile['family-names']}`,
        orcidId,
        institutionInfo: academicProfile['institution-name'] || [],
        totalPublications: publications.length,
        publications,
      };
    } catch (error: unknown) {
      this.handleError(`name=${academicName}`, error);
    }
  }

  async getAcademicByOrcidId(orcidId: string) {
    this.logger.log(`Fetching ORCID profile: ${orcidId}`);

    try {
      const personUrl = `${this.ORCID_API_URL}/${orcidId}/person`;
      const personResponse = await lastValueFrom(
        this.httpService.get(personUrl, {
          headers: { Accept: 'application/json' },
        }),
      );
      const givenName =
        personResponse.data?.name?.['given-names']?.value ?? '';
      const familyName =
        personResponse.data?.name?.['family-name']?.value ?? '';

      const publications = await this.fetchWorks(orcidId);

      return {
        academic: `${givenName} ${familyName}`.trim() || orcidId,
        orcidId,
        totalPublications: publications.length,
        publications,
      };
    } catch (error: unknown) {
      this.handleError(`orcidId=${orcidId}`, error);
    }
  }

  private async fetchWorks(orcidId: string): Promise<OrcidPublication[]> {
    const worksUrl = `${this.ORCID_API_URL}/${orcidId}/works`;
    const worksResponse = await lastValueFrom(
      this.httpService.get(worksUrl, {
        headers: { Accept: 'application/json' },
      }),
    );

    const worksGroup = worksResponse.data.group || [];

    return worksGroup.map((group: any) => {
      const summary = group['work-summary'][0];
      return {
        title: summary.title?.title?.value || 'Untitled',
        type: summary.type || 'N/A',
        year: summary['publication-date']?.year?.value || 'N/A',
        journal: summary['journal-title']?.value || 'N/A',
        url: summary.url?.value || null,
      };
    });
  }

  private handleError(context: string, error: unknown): never {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`ORCID API error (${context}): ${message}`);
    throw new HttpException(
      'Error communicating with the ORCID API',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
