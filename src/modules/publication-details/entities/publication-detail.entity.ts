import {Column,CreateDateColumn,Entity,Index,OneToMany,PrimaryGeneratedColumn,UpdateDateColumn,} from 'typeorm';
import { PublicationAuthorship } from './publication-authorship.entity';

@Entity({ name: 'publication_details' })
export class PublicationDetail {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  journal: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, nullable: true })
  issn: string | null;

  @Index()
  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'varchar', length: 5, nullable: true })
  quartile: string | null;

  // --- NUEVO: factor de impacto JCR (Web of Science) ---
  // Se guarda como string para preservar valores como "<0.1" tal cual.
  @Column({ type: 'varchar', length: 20, nullable: true })
  jif: string | null;

  // Año de la edición JCR de la que provienen jif/quartile (cuando vienen de JCR).
  @Column({ type: 'int', nullable: true })
  jcrYear: number | null;
  // -----------------------------------------------------

  @Column({ type: 'varchar', length: 200, nullable: true })
  mainCategory: string | null;

  @Index('UQ_publication_doi', { unique: true, where: '"doi" IS NOT NULL' })
  @Column({ type: 'varchar', length: 200, nullable: true })
  doi: string | null;

  @Column({ type: 'int', default: 0 })
  citedByCount: number;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  sources: Array<{ platform: string; externalPublicationId: string }>;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @OneToMany(() => PublicationAuthorship, (a) => a.publication, {
    cascade: true,
  })
  authorships: PublicationAuthorship[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
