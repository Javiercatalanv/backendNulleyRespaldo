import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JournalImpact } from './entities/journal-impact.entity';
import { JcrResolverService } from './jcr-resolver.service';
import { JcrImportService } from './jcr-import.service';

@Module({
  imports: [TypeOrmModule.forFeature([JournalImpact])],
  providers: [JcrResolverService, JcrImportService],
  exports: [JcrResolverService, JcrImportService],
})
export class JcrResolverModule {}
