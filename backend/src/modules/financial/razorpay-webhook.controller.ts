// backend/src/modules/financial/razorpay-webhook.controller.ts
//
// PAY-001 Step 19 — Razorpay webhook HTTP surface.
//
// Unauthenticated (no AccessTokenGuard): Razorpay, not a member, calls this
// route. Trust is established entirely by RazorpayWebhookService's signature
// verification, not by a bearer token.
//
// Route prefix: api/v1/financial (no global prefix -- CLAUDE.md §4.1).
//
// This controller does nothing but extract the raw body + headers and hand
// them to RazorpayWebhookService -- it never reads/writes financial_
// contributions, financial_transactions, or receipts directly, and it never
// imports anything from the Membership module (PAY-001 §ABSOLUTE
// ARCHITECTURAL RULE).
//
// Raw body (PAY-001 Step 19 Part 3): NestFactory.create() in main.ts is
// started with `{ rawBody: true }`, which makes Fastify additionally expose
// the exact, unparsed request bytes as req.rawBody (via @RawBody()) --
// alongside, not instead of, normal JSON body parsing. This is the smallest
// mechanism available: no second HTTP framework, no global parsing change,
// no other route affected.

import { BadRequestException, Controller, HttpCode, Post, RawBody, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { RazorpayWebhookService } from './razorpay-webhook.service';

function headerString(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

@Controller('api/v1/financial')
export class RazorpayWebhookController {
  constructor(private readonly webhookService: RazorpayWebhookService) {}

  @Post('webhooks/razorpay')
  @HttpCode(200)
  async handleRazorpayWebhook(@RawBody() rawBody: Buffer | undefined, @Req() req: FastifyRequest) {
    if (!rawBody) {
      throw new BadRequestException('Missing request body.');
    }

    await this.webhookService.handle({
      rawBody,
      signature: headerString(req.headers['x-razorpay-signature']),
      eventId: headerString(req.headers['x-razorpay-event-id']),
    });

    // Never internal financial detail (contribution/transaction ids, DB
    // errors) in the response -- PAY-001 Step 19 Part 20.
    return { received: true };
  }
}
