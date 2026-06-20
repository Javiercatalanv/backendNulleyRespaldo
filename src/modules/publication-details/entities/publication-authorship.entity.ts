import {Column,CreateDateColumn,Entity,JoinColumn,ManyToOne,PrimaryGeneratedColumn,Unique,} from 'typeorm';
import { PublicationDetail } from './publication-detail.entity';
import { ResearcherProfile } from '../../researcher-profiles/entities/researcher-profile.entity';

@Entity({ name: 'publication_authorships' })
@Unique('UQ_publication_profile', ['publication', 'profile'])
export class PublicationAuthorship {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PublicationDetail, (pub) => pub.authorships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'publication_id' })
  publication: PublicationDetail;

  @ManyToOne(() => ResearcherProfile, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'profile_id' })
  profile: ResearcherProfile;

  @Column({ type: 'varchar', length: 50 })
  discoveredVia: string;

  @CreateDateColumn()
  createdAt: Date;
}
