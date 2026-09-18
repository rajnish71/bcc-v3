import { IsInt, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class GrantComplimentaryMembershipDto {
  @IsInt()
  @Min(1)
  @Max(24)
  months: number;

  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}
