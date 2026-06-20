import {Injectable,Logger,OnModuleInit} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse } from 'csv-parse/sync';

export interface SjrEntry {
  journalTitle: string;
  sjr: number | null;
  bestQuartile: string | null;
  mainCategory: string | null;
  mainQuartile: string | null;
  allCategories: Array<{ category: string; quartile: string | null }>;
}

/**
 * Loads the Scimago Journal Rank CSV into memory at boot and exposes an
 * O(1) lookup by ISSN.
 *
 * Scimago publishes the CSV with European conventions (semicolon as
 * column separator, comma as decimal separator, fields wrapped in
 * double quotes). Some editions ship with a handful of rows that have
 * malformed quotes — `csv-parse` aborts the whole file on the first
 * such row by default. We configure it to **skip and log** offending
 * rows instead, so the resolver still loads ~32k valid entries even
 * if 1-2 are corrupt.
 */
@Injectable()
export class SjrResolverService implements OnModuleInit {
  private readonly logger = new Logger(SjrResolverService.name);
  private readonly issnIndex = new Map<string, SjrEntry>();
  private isReady = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const csvPath = this.resolveCsvPath();
    if (!existsSync(csvPath)) {
      this.logger.warn(
        `Scimago CSV not found at ${csvPath}. Quartile resolution disabled. ` +
          `Download the latest CSV from https://www.scimagojr.com/journalrank.php ` +
          `and save it as data/scimago_journal_rank.csv`,
      );
      return;
    }

    try {
      const loaded = this.loadCsv(csvPath);
      this.isReady = true;
      this.logger.log(
        `SJR Resolver ready — ${this.issnIndex.size} ISSN entries indexed ` +
          `(from ${loaded.parsed} rows parsed, ${loaded.skipped} skipped due to malformed CSV)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to load Scimago CSV: ${(err as Error).message}`,
      );
    }
  }

  resolveByIssn(issn: string | null | undefined): SjrEntry | null {
    if (!this.isReady || !issn) return null;
    const normalized = this.normalizeIssn(issn);
    return this.issnIndex.get(normalized) ?? null;
  }

  private resolveCsvPath(): string {
    const fromEnv = this.configService.get<string>('SCIMAGO_CSV_PATH');
    if (fromEnv) return fromEnv;
    return join(process.cwd(), 'data', 'scimago_journal_rank.csv');
  }


  private loadCsv(path: string): { parsed: number; skipped: number } {
    const content = readFileSync(path, 'utf-8');

    const totalDataLines =
      content.split('\n').filter((line) => line.trim().length > 0).length - 1;

    const rows: Array<Record<string, string>> = parse(content, {
      delimiter: ';',
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_records_with_error: true,
      on_record: (record, { lines }) => {
        return record;
      },
    });

    for (const row of rows) {
      const journalTitle = row['Title'];
      if (!journalTitle) continue;

      const issnField = row['Issn'] ?? '';
      const sjr = this.parseEuropeanNumber(row['SJR']);
      const bestQuartile = row['SJR Best Quartile'] || null;
      const { allCategories, mainCategory, mainQuartile } =
        this.parseCategories(row['Categories'] ?? '');

      const entry: SjrEntry = {
        journalTitle,
        sjr,
        bestQuartile,
        mainCategory,
        mainQuartile,
        allCategories,
      };

      const issns = issnField.split(',').map((s) => this.normalizeIssn(s));
      for (const issn of issns) {
        if (issn) this.issnIndex.set(issn, entry);
      }
    }

    return {
      parsed: rows.length,
      skipped: Math.max(0, totalDataLines - rows.length),
    };
  }

  private normalizeIssn(raw: string): string {
    return raw.replace(/[\s-]/g, '').toUpperCase();
  }


  private parseEuropeanNumber(value: string | undefined): number | null {
    if (!value) return null;
    const normalized = value.replace(',', '.').trim();
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private parseCategories(raw: string): {
    allCategories: Array<{ category: string; quartile: string | null }>;
    mainCategory: string | null;
    mainQuartile: string | null;
  } {
    if (!raw.trim()) {
      return { allCategories: [], mainCategory: null, mainQuartile: null };
    }

    const items = raw.split(';').map((s) => s.trim()).filter(Boolean);
    const parsed = items.map((item) => {
      const match = item.match(/^(.+?)\s*\((Q[1-4])\)\s*$/);
      if (match) {
        return { category: match[1].trim(), quartile: match[2] };
      }
      return { category: item, quartile: null };
    });

    const main = parsed[0] ?? { category: null, quartile: null };
    return {
      allCategories: parsed,
      mainCategory: main.category,
      mainQuartile: main.quartile,
    };
  }
}