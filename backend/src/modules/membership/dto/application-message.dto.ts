import { IsInt, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

// Used for clarification requests and internal notes alike -- both are just
// a body; the endpoint determines the message type.
export class ApplicationMessageDto {
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  body: string;
}

export class RespondToClarificationDto extends ApplicationMessageDto {
  @IsInt()
  @IsPositive()
  clarificationMessageId: number;
}
