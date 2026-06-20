import {Column,Entity,JoinColumn,ManyToOne,PrimaryGeneratedColumn,Unique} from 'typeorm';
import { ResearcherProfile } from '../../researcher-profiles/entities/researcher-profile.entity';

@Entity({ name: 'publications' })
@Unique('UQ_profile_year', ['profile', 'year'])
export class Publication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  year: number;

  @Column({ type: 'int', default: 0 })
  count: number;

  @ManyToOne(() => ResearcherProfile, (profile) => profile.publications, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profile_id' })
  profile: ResearcherProfile;
}
