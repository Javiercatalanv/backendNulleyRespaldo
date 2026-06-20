import {Column,CreateDateColumn,Entity,OneToMany,PrimaryGeneratedColumn,UpdateDateColumn} from 'typeorm';
import { ResearcherProfile } from '../../researcher-profiles/entities/researcher-profile.entity';

@Entity({ name: 'researchers' })
export class Researcher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  firstName: string;

  @Column({ type: 'varchar', length: 120 })
  lastName: string;

  @OneToMany(() => ResearcherProfile, (profile) => profile.researcher, {
    cascade: true,
  })
  profiles: ResearcherProfile[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
