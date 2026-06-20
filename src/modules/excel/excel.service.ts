import { Injectable, BadRequestException } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';
import { ResearchersService } from '../researchers/researchers.service';
import { PlatformsService } from '../platforms/platforms.service';
import { ResearcherProfilesService } from '../researcher-profiles/researcher-profiles.service';
import { PublicationsService } from '../publications/publications.service';
import { ImportsService } from '../imports/imports.service';

interface ParsedRow {
  fullName: string;
  platforms: Array<{
    platformCode: string;
    externalId: string;
    publications: Array<{ year: number; count: number }>;
  }>;
}

@Injectable()
export class ExcelService {
  private static readonly YEARS_COLUMN_ORDER = [
    2025, 2024, 2023, 2022, 2021, 2020,
  ];

  private static readonly LAYOUT = {
    nameCol: 1,
    platforms: [
      { code: 'WOS', idCol: 2, yearStartCol: 3 },
      { code: 'SCOPUS', idCol: 10, yearStartCol: 11 },
    ],
  };

  constructor(
    private readonly researchersService: ResearchersService,
    private readonly platformsService: PlatformsService,
    private readonly profilesService: ResearcherProfilesService,
    private readonly publicationsService: PublicationsService,
    private readonly importsService: ImportsService,
  ) {}

  async importFromBuffer(
    buffer: Buffer,
    originalFileName: string,
  ): Promise<{
    importId: string;
    summary: {
      researchersCreated: number;
      researchersUpdated: number;
      profilesCreated: number;
      publicationsUpserted: number;
    };
    errors: string[];
  }> {
    const workbook = new Workbook();
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
    await workbook.xlsx.load(arrayBuffer as ArrayBuffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('The uploaded file has no worksheets');
    }

    const parsedRows = this.parseSheet(worksheet);
    const summary = {
      researchersCreated: 0,
      researchersUpdated: 0,
      profilesCreated: 0,
      publicationsUpserted: 0,
    };
    const errors: string[] = [];

    for (const row of parsedRows) {
      try {
        await this.persistRow(row, summary);
      } catch (err) {
        errors.push(
          `Row "${row.fullName}": ${(err as Error).message ?? 'unknown error'}`,
        );
      }
    }

    const status: 'success' | 'partial' | 'failed' =
      errors.length === 0
        ? 'success'
        : errors.length < parsedRows.length
          ? 'partial'
          : 'failed';

    const auditRecord = await this.importsService.create({
      originalFileName,
      sheetName: worksheet.name,
      rawRows: parsedRows as unknown as Record<string, unknown>[],
      summary,
      status,
      errorMessages: errors,
    });

    return {
      importId: auditRecord._id.toString(),
      summary,
      errors,
    };
  }

  private parseSheet(worksheet: Worksheet): ParsedRow[] {
    const rows: ParsedRow[] = [];

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const nameCell = row.getCell(ExcelService.LAYOUT.nameCol).value;
      if (!nameCell || String(nameCell).trim().toLowerCase() === 'total') {
        return;
      }

      rows.push(this.parseRow(row));
    });

    return rows;
  }

  private parseRow(row: any): ParsedRow {
    const fullName = String(
      row.getCell(ExcelService.LAYOUT.nameCol).value,
    ).trim();

    const platforms = ExcelService.LAYOUT.platforms.map((platform) => {
      const externalId = String(row.getCell(platform.idCol).value ?? '').trim();
      const publications = ExcelService.YEARS_COLUMN_ORDER.map(
        (year, offset) => ({
          year,
          count: this.toInt(row.getCell(platform.yearStartCol + offset).value),
        }),
      );
      return {
        platformCode: platform.code,
        externalId,
        publications,
      };
    });

    return { fullName, platforms };
  }

  private async persistRow(
    row: ParsedRow,
    summary: {
      researchersCreated: number;
      researchersUpdated: number;
      profilesCreated: number;
      publicationsUpserted: number;
    },
  ): Promise<void> {
    const { firstName, lastName } = this.splitFullName(row.fullName);

    let researcher = await this.researchersService.findByFullName(
      firstName,
      lastName,
    );
    if (!researcher) {
      researcher = await this.researchersService.create({ firstName, lastName });
      summary.researchersCreated += 1;
    } else {
      summary.researchersUpdated += 1;
    }

    for (const p of row.platforms) {
      if (!p.externalId) continue;

      const platform = await this.platformsService.findByCode(p.platformCode);
      const profile = await this.profilesService.findOrCreate({
        researcherId: researcher.id,
        platformId: platform.id,
        externalId: p.externalId,
      });
      summary.profilesCreated += 1;

      await this.publicationsService.upsertManyForProfile(
        profile.id,
        p.publications,
      );
      summary.publicationsUpserted += p.publications.length;
    }
  }

  private splitFullName(fullName: string): {
    firstName: string;
    lastName: string;
  } {
    const tokens = fullName.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      throw new BadRequestException('Empty researcher name in row');
    }
    if (tokens.length === 1) {
      return { firstName: tokens[0], lastName: '' };
    }
    return {
      firstName: tokens[0],
      lastName: tokens.slice(1).join(' '),
    };
  }
  private toInt(value: unknown): number {
    if (value == null) return 0;
    if (typeof value === 'number') return Math.max(0, Math.trunc(value));
    if (typeof value === 'object' && 'result' in (value as any)) {
      return this.toInt((value as any).result);
    }
    const parsed = parseInt(String(value), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }
}
