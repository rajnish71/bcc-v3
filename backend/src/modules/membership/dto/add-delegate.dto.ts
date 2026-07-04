import { IsInt, IsPositive } from 'class-validator';

export class AddDelegateDto {
  @IsInt()
  @IsPositive()
  userId: number;
}
