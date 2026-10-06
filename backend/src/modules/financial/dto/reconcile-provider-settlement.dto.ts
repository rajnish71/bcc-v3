import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

// Admin provider-verified settlement reconciliation. Amount, currency and the
// provider order are deliberately absent: they are read from the Contribution
// and verified against the provider server-side, and the global
// ValidationPipe (forbidNonWhitelisted) rejects any client-supplied extra.
export class ReconcileProviderSettlementDto {
  // Razorpay payment ids are 'pay_' + 14 alphanumerics; anything else is
  // rejected before the provider is ever contacted.
  @IsString()
  @Matches(/^pay_[A-Za-z0-9]{14}$/, { message: 'providerPaymentReference must be a Razorpay payment id (pay_ + 14 characters).' })
  providerPaymentReference: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
