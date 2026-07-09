// backend/src/modules/contact/contact.dto.ts
//
// DTO for POST /api/v1/contact
// class-validator enforces these at the global ValidationPipe level.

import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ContactDto {
  @IsString()
  @IsNotEmpty({ message: 'Name is required.' })
  @MinLength(2, { message: 'Name must be at least 2 characters.' })
  @MaxLength(120, { message: 'Name must not exceed 120 characters.' })
  name: string;

  @IsEmail({}, { message: 'A valid email address is required.' })
  @MaxLength(254)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Phone must not exceed 20 characters.' })
  phone?: string;

  @IsString()
  @IsNotEmpty({ message: 'Subject is required.' })
  @MaxLength(200, { message: 'Subject must not exceed 200 characters.' })
  subject: string;

  @IsString()
  @IsNotEmpty({ message: 'Message is required.' })
  @MinLength(20, { message: 'Message must be at least 20 characters.' })
  @MaxLength(4000, { message: 'Message must not exceed 4,000 characters.' })
  message: string;

  @IsOptional()
  @IsString()
  website?: string;
}
