import { Equals, IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

// Release 1 renewal / reinstatement request. Carries ONLY a fresh renewal
// T&C acceptance -- no identity, profile, plan or class fields (§14).
export class RequestRenewalDto {
  @IsBoolean()
  @Equals(true, { message: 'You must accept the renewal terms and conditions.' })
  acceptTerms: boolean;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  termsVersion: string;
}
