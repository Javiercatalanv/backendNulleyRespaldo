import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Tabla de factores de impacto y cuartiles del JCR (Web of Science).
 * Se puebla 1 vez al año (cada junio) vía POST /upload/jcr.
 *
 * La PK es el ISSN normalizado (sin guiones, mayúsculas) para garantizar
 * lookup O(1) y evitar duplicados al re-subir el archivo.
 */
@Entity({ name: 'journal_impact' })
export class JournalImpact {
  /** ISSN normalizado: sin guiones ni espacios, en mayúsculas. Ej: "00079235" */
  @PrimaryColumn({ type: 'varchar', length: 20 })
  issn: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  journalName: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  publisher: string | null;

  /**
   * Factor de impacto JCR. Se guarda como string para preservar valores
   * especiales como "<0.1" tal cual vienen del documento. null si no hay dato.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  jif: string | null;

  @Index()
  @Column({ type: 'varchar', length: 5, nullable: true })
  quartile: string | null;

  @Column({ type: 'int', nullable: true })
  rank: number | null;

  /** Año de la edición JCR (ej: 2025). Permite saber de qué versión vino el dato. */
  @Index()
  @Column({ type: 'int' })
  jcrYear: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
