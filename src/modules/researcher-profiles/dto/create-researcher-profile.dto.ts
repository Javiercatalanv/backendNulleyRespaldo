import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateResearcherProfileDto {
  @IsUUID()
  researcherId: string;

  @IsUUID()
  platformId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  externalId: string;
}
