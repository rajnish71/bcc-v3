import { IsArray, IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateGearDto {
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) bodies?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) lenses?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) drones?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) other?: string[];
}
