import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateResearcherDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  lastName: string;
}
