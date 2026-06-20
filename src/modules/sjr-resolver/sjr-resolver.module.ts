import { Module } from '@nestjs/common';
import { SjrResolverService } from './sjr-resolver.service';

@Module({
  providers: [SjrResolverService],
  exports: [SjrResolverService],
})
export class SjrResolverModule {}
