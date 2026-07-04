import { IsIn, IsInt, IsOptional, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateGroupDto {
  @IsIn(['FAMILY', 'CORPORATE', 'INSTITUTIONAL'])
  type: 'FAMILY' | 'CORPORATE' | 'INSTITUTIONAL';

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  // Staff-only: create a group with someone else as primary contact.
  // Self-service creators are always their own primary contact -- the
  // controller ignores/rejects this field without the staff permission.
  @IsOptional()
  @IsInt()
  @IsPositive()
  primaryContactUserId?: number;
}
