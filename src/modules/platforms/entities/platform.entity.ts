import {Column,Entity,OneToMany,PrimaryGeneratedColumn,} from 'typeorm';
import { ResearcherProfile } from '../../researcher-profiles/entities/researcher-profile.entity';

@Entity({ name: 'platforms' })
export class Platform {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @OneToMany(() => ResearcherProfile, (profile) => profile.platform)
  profiles: ResearcherProfile[];
}
