import {Column,CreateDateColumn,Entity,Index,JoinColumn,ManyToOne,OneToMany,PrimaryGeneratedColumn,Unique} from 'typeorm';
import { Researcher } from '../../researchers/entities/researcher.entity';
import { Platform } from '../../platforms/entities/platform.entity';
import { Publication } from '../../publications/entities/publication.entity';

@Entity({ name: 'researcher_profiles' })
@Unique('UQ_researcher_platform', ['researcher', 'platform'])
export class ResearcherProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  externalId: string;

  @ManyToOne(() => Researcher, (researcher) => researcher.profiles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'researcher_id' })
  researcher: Researcher;

  @ManyToOne(() => Platform, (platform) => platform.profiles, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;

  @OneToMany(() => Publication, (publication) => publication.profile, {
    cascade: true,
  })
  publications: Publication[];

  @CreateDateColumn()
  createdAt: Date;
}
