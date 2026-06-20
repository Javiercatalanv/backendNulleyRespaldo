import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalImpact } from './entities/journal-impact.entity';
import { JcrResolverService } from './jcr-resolver.service';

interface RawJcrRow {
  rank?: number;
  journalName?: string;
  publisher?: string;
  issn?: string | null;
  jif?: number | string | null;
  quartile?: string | null;
}

@Injectable()
export class JcrImportService {
  private readonly logger = new Logger(JcrImportService.name);

  constructor(
    @InjectRepository(JournalImpact)
    private readonly journalImpactRepository: Repository<JournalImpact>,
    private readonly jcrResolver: JcrResolverService,
  ) {}

  /**
   * Procesa el JSON del JCR subido:
   *   1. Parsea y valida el contenido.
   *   2. Descarta filas sin ISSN (no sirven para el match por ISSN).
   *   3. Normaliza el ISSN y deduplica (último gana).
   *   4. Reemplaza la tabla journal_impact para ese año.
   *   5. Recarga el índice en memoria del resolver.
   */
  async importFromBuffer(
    buffer: Buffer,
    jcrYear: number,
  ): Promise<{
    jcrYear: number;
    totalInFile: number;
    withIssn: number;
    withoutIssn: number;
    saved: number;
  }> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(buffer.toString('utf-8'));
    } catch {
      throw new BadRequestException('El archivo no es un JSON válido');
    }

    if (!Array.isArray(parsed)) {
      throw new BadRequestException('El JSON debe ser un arreglo de revistas');
    }

    const rows = parsed as RawJcrRow[];
    const totalInFile = rows.length;
    let withoutIssn = 0;

    // Normalizar y deduplicar por ISSN normalizado (último gana)
    const byIssn = new Map<string, JournalImpact>();
    for (const row of rows) {
      if (!row.issn) {
        withoutIssn += 1;
        continue;
      }
      const normalized = this.jcrResolver.normalizeIssn(row.issn);
      if (!normalized) {
        withoutIssn += 1;
        continue;
      }

      byIssn.set(normalized, {
        issn: normalized,
        journalName: row.journalName?.trim() || null,
        publisher: row.publisher?.trim() || null,
        jif: this.normalizeJif(row.jif),
        quartile: this.normalizeQuartile(row.quartile),
        rank: typeof row.rank === 'number' ? row.rank : null,
        jcrYear,
      } as JournalImpact);
    }

    const entries = Array.from(byIssn.values());

    // Reemplazar los datos del año (idempotente al re-subir el mismo archivo)
    await this.journalImpactRepository.delete({ jcrYear });
    // Guardar en lotes para no saturar memoria/consulta
    const BATCH = 1000;
    for (let i = 0; i < entries.length; i += BATCH) {
      await this.journalImpactRepository.save(entries.slice(i, i + BATCH));
    }

    // Refrescar el índice en memoria
    await this.jcrResolver.reload();

    const result = {
      jcrYear,
      totalInFile,
      withIssn: entries.length,
      withoutIssn,
      saved: entries.length,
    };
    this.logger.log(
      `JCR ${jcrYear} importado: ${result.saved} revistas guardadas ` +
        `(${withoutIssn} descartadas sin ISSN de ${totalInFile} totales)`,
    );
    return result;
  }

  /** Guarda el JIF como string preservando "<0.1"; null si no hay dato. */
  private normalizeJif(value: number | string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s === '' || s.toUpperCase() === 'N/A' ? null : s;
  }

  private normalizeQuartile(value: string | null | undefined): string | null {
    if (!value) return null;
    const q = value.trim().toUpperCase();
    return ['Q1', 'Q2', 'Q3', 'Q4'].includes(q) ? q : null;
  }
}
