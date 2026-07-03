import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AssignReservedNumberDto {
  @IsInt()
  @Min(1)
  @Max(20)
  serial: number;

  @IsIn(['FOUNDING_RESERVED', 'HISTORICAL_RESERVED'])
  assignmentType: 'FOUNDING_RESERVED' | 'HISTORICAL_RESERVED';

  @IsInt()
  @Min(2015)
  @Max(2030)
  joinYear: number;

  @IsInt()
  @Min(1)
  @Max(12)
  joinMonth: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
