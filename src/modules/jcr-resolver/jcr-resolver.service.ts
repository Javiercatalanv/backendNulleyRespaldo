import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalImpact } from './entities/journal-impact.entity';

export interface JcrEntry {
  issn: string;
  journalName: string | null;
  jif: string | null;
  quartile: string | null;
  rank: number | null;
  jcrYear: number;
}

/**
 * Resuelve el factor de impacto y cuartil JCR (Web of Science) por ISSN.
 *
 * Patrón gemelo de SjrResolverService, pero la fuente es la tabla
 * `journal_impact` (poblada vía upload manual del JSON anual), no un CSV.
 * Cachea todo en memoria al arrancar para lookup O(1), y se refresca
 * automáticamente cada vez que se sube un JCR nuevo (reload()).
 */
@Injectable()
export class JcrResolverService implements OnModuleInit {
  private readonly logger = new Logger(JcrResolverService.name);
  private readonly issnIndex = new Map<string, JcrEntry>();
  private isReady = false;

  constructor(
    @InjectRepository(JournalImpact)
    private readonly journalImpactRepository: Repository<JournalImpact>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
  }

  /** Recarga el índice en memoria desde la base. Llamar tras un upload. */
  async reload(): Promise<void> {
    this.issnIndex.clear();
    const rows = await this.journalImpactRepository.find();
    for (const row of rows) {
      this.issnIndex.set(row.issn, {
        issn: row.issn,
        journalName: row.journalName,
        jif: row.jif,
        quartile: row.quartile,
        rank: row.rank,
        jcrYear: row.jcrYear,
      });
    }
    this.isReady = true;
    this.logger.log(`JCR Resolver ready — ${this.issnIndex.size} ISSN entries indexed`);
  }

  resolveByIssn(issn: string | null | undefined): JcrEntry | null {
    if (!this.isReady || !issn) return null;
    return this.issnIndex.get(this.normalizeIssn(issn)) ?? null;
  }

  /** Misma normalización que SjrResolverService: sin guiones/espacios, mayúsculas. */
  normalizeIssn(raw: string): string {
    return raw.replace(/[\s-]/g, '').toUpperCase();
  }
}
