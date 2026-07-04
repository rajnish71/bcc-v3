// backend/src/modules/membership/card/membership-card.service.ts
//
// MEM-006 §02.7 Digital Membership Card.
//
// Generates a print-ready PDF at standard business card dimensions
// (85.6mm × 54mm = 243pt × 153pt at 72dpi). pdf-lib is used
// deliberately: pure JS, zero native binaries, fits the 1.9GB RAM budget.
// No puppeteer, no headless Chrome.
//
// QR code encodes the public verification URL:
//   https://v3bcc.bhopal.info/verify/{card_verify_token}
//
// IMPORTANT (fixed from the original draft): the verify URL does NOT use
// membership_number. membership_number is sequential and predictable under
// MEM-007 (BCC+YYYY+MM+00021 style), so embedding it in a public URL would
// let anyone enumerate every member's verification page by incrementing a
// counter. card_verify_token (migration 0029) is a separate, opaque,
// unguessable slug -- 16 random bytes, base64url-encoded -- generated
// lazily the first time a card is requested and never reused/rotated by
// this code path. The URL resolves to a 404 until the public verification
// page is built in Phase 1 frontend -- that part is still intentional and
// forward-compatible.
//
// Card requirements (spec 02.7):
//   - Generated on APPROVED → ACTIVE transition (lifecycle service triggers
//     this endpoint indirectly; the GET is also callable on-demand).
//   - Content: full name, membership_number (permanent), class, validity
//     period, QR code. No renewal on temp numbers (PRECONDITION check).
//   - membership_number shown exactly as assigned -- no reformatting, no
//     masking. MEM-007 MP-001 compliance.
//   - On renewal: new card with updated validity; number unchanged.

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import * as QRCode from 'qrcode';
import { db } from '../../../database/db';

// Card dimensions: 85.6mm × 54mm in PDF points (1pt = 1/72 inch)
const CARD_W = 243;
const CARD_H = 153;

// Design tokens (Aperture, Focus & Light palette)
const BG   = rgb(0.043, 0.043, 0.055);  // #0B0B0E
const GOLD = rgb(0.961, 0.659, 0.165);  // #F5A82A
const WHITE = rgb(1, 1, 1);
const GREY  = rgb(0.667, 0.667, 0.667); // #AAAAAA

// Badge colours per class (spec design system)
const CLASS_BADGE_COLOURS: Record<string, [number, number, number]> = {
  BASIC_MEMBER:          [0.361, 0.345, 0.463], // #5C5876
  STUDENT_MEMBER:        [0.102, 0.616, 0.682], // #1A9DAE
  INDIVIDUAL_MEMBER:     [0.243, 0.353, 0.282], // #3E5A48
  FAMILY_MEMBERSHIP:     [0.851, 0.451, 0.227], // #D9733A
  SENIOR_MEMBER:         [0.435, 0.561, 0.235], // #6F8F3C
  HONORARY_MEMBER:       [0.784, 0.196, 0.478], // #C8327A
  LIFE_MEMBER:           [0.659, 0.518, 0.235], // #A8843C
  PATRON_MEMBER:         [0.541, 0.416, 0.180], // #8A6A2E
  FOUNDING_MEMBER:       [0.541, 0.416, 0.180], // #8A6A2E
  FULL_MEMBER:           [0.659, 0.518, 0.235], // #A8843C
};

const VERIFY_BASE = 'https://v3bcc.bhopal.info/verify';

// Minimal shape returned to the public verification lookup. Deliberately
// excludes anything sensitive -- no email, no phone, no user_id. This is
// the ONLY data a bare QR scan should ever reveal to an unauthenticated
// scanner (e.g. an event volunteer checking a card at the door).
export interface VerifyResult {
  fullName: string;
  membershipNumber: string;
  className: string;
  lifecycleState: string;
  activatedAt: Date | string | null;
  expiresAt: Date | string | null;
}

@Injectable()
export class MembershipCardService {

  // ── Main entry point ──────────────────────────────────────────────────────

  async generateCardPdf(membershipId: number): Promise<Buffer> {
    // 1. Fetch membership + class + user in one query.
    const row = await db
      .selectFrom('memberships as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .leftJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .select([
        'm.id',
        'm.membership_number',
        'm.card_verify_token',
        'm.lifecycle_state',
        'm.activated_at',
        'm.expires_at',
        'm.owner_type',
        'u.full_name',
        'mc.name as class_name',
        'mc.code as class_code',
      ])
      .where('m.id', '=', membershipId)
      .executeTakeFirst();

    if (!row) {
      throw new NotFoundException(`Membership ${membershipId} not found`);
    }
    if (row.owner_type === 'GROUP') {
      throw new ConflictException('Membership cards are issued to individual members only');
    }
    if (row.lifecycle_state !== 'ACTIVE') {
      throw new ConflictException(
        `Membership card requires ACTIVE state; current state is ${row.lifecycle_state}`,
      );
    }
    if (!row.membership_number || row.membership_number.startsWith('BCCTemp')) {
      throw new ConflictException(
        'Membership card requires a permanent membership number. ' +
        'Temp identifiers are not accepted (MEM-007 MP-001).',
      );
    }

    // 2. Resolve (or lazily mint) the opaque verify token, then build the QR.
    const verifyToken = await this.getOrCreateVerifyToken(membershipId, row.card_verify_token);
    const verifyUrl = `${VERIFY_BASE}/${verifyToken}`;
    const qrBuffer: Buffer = await QRCode.toBuffer(verifyUrl, {
      type: 'png',
      width: 80,
      margin: 0,
      color: { dark: '#FFFFFF', light: '#00000000' }, // white on transparent
    });

    // 3. Generate PDF
    const pdfBytes = await this.buildCard({
      fullName: row.full_name,
      membershipNumber: row.membership_number,
      className: row.class_name ?? 'Member',
      classCode: row.class_code ?? '',
      activatedAt: row.activated_at,
      expiresAt: row.expires_at,
      qrPngBuffer: qrBuffer,
    });

    return Buffer.from(pdfBytes);
  }

  // ── Public verification lookup (no auth -- this is what the QR resolves to) ─

  async verifyToken(token: string): Promise<VerifyResult> {
    const row = await db
      .selectFrom('memberships as m')
      .innerJoin('users as u', 'u.id', 'm.user_id')
      .leftJoin('membership_classes as mc', 'mc.id', 'm.membership_class_id')
      .select([
        'm.membership_number',
        'm.lifecycle_state',
        'm.activated_at',
        'm.expires_at',
        'u.full_name',
        'mc.name as class_name',
      ])
      .where('m.card_verify_token', '=', token)
      .executeTakeFirst();

    if (!row || !row.membership_number) {
      throw new NotFoundException('No membership matches this verification code');
    }

    return {
      fullName: row.full_name,
      membershipNumber: row.membership_number,
      className: row.class_name ?? 'Member',
      lifecycleState: row.lifecycle_state,
      activatedAt: row.activated_at,
      expiresAt: row.expires_at,
    };
  }

  // ── Verify token issuance ─────────────────────────────────────────────────

  // Idempotent "claim" pattern: only ever writes the token when the column
  // is still NULL, and re-reads afterwards in case of a race (two concurrent
  // first-time card requests). Never overwrites an existing token -- this is
  // what "immutable once set" means for this column (see migration 0029;
  // it's an operational security token, not a MEM-007 constitutional
  // identifier, so there's no DB trigger enforcing this -- just this
  // write-once code path).
  private async getOrCreateVerifyToken(
    membershipId: number,
    existingToken: string | null,
  ): Promise<string> {
    if (existingToken) return existingToken;

    const candidate = randomBytes(16).toString('base64url'); // 22 chars, ~128 bits

    await db
      .updateTable('memberships')
      .set({ card_verify_token: candidate })
      .where('id', '=', membershipId)
      .where('card_verify_token', 'is', null)
      .execute();

    const row = await db
      .selectFrom('memberships')
      .select('card_verify_token')
      .where('id', '=', membershipId)
      .executeTakeFirstOrThrow();

    // If a concurrent request won the race, row.card_verify_token will be
    // that request's token, not `candidate` -- return whatever actually
    // landed rather than trusting our own write.
    return row.card_verify_token as string;
  }

  // ── PDF builder ───────────────────────────────────────────────────────────

  private async buildCard(data: {
    fullName: string;
    membershipNumber: string;
    className: string;
    classCode: string;
    activatedAt: Date | string | null;
    expiresAt: Date | string | null;
    qrPngBuffer: Buffer;
  }): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();

    // Embed standard fonts (no external font files needed)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Add a page exactly at business card size
    const page = pdfDoc.addPage([CARD_W, CARD_H]);

    // ── Background ──────────────────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: 0, width: CARD_W, height: CARD_H, color: BG });

    // ── Amber top stripe (8pt) ──────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: CARD_H - 8, width: CARD_W, height: 8, color: GOLD });

    // ── Left accent bar (3pt) ───────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: 0, width: 3, height: CARD_H - 8, color: GOLD });

    // ── Club name header ────────────────────────────────────────────────────
    this.drawText(page, 'BHOPAL CAMERA CLUB', fontBold, 7, 12, CARD_H - 19, GOLD);
    this.drawText(page, 'FIP CM 1098', fontReg, 6, 12, CARD_H - 27, GREY);

    // ── QR code (top right) ─────────────────────────────────────────────────
    const qrImg = await pdfDoc.embedPng(data.qrPngBuffer);
    const qrSize = 64;
    page.drawImage(qrImg, {
      x: CARD_W - qrSize - 10,
      y: CARD_H - qrSize - 14,
      width: qrSize,
      height: qrSize,
    });

    // ── Member name ─────────────────────────────────────────────────────────
    const nameY = 74;
    this.drawText(page, this.truncate(data.fullName, 28), fontBold, 11, 12, nameY, WHITE);

    // ── Membership number ───────────────────────────────────────────────────
    this.drawText(page, data.membershipNumber, fontBold, 9, 12, nameY - 15, GOLD);

    // ── Class badge ─────────────────────────────────────────────────────────
    // NOTE: pdf-lib's drawRectangle has no `borderRadius` option (this was
    // the original build break -- PDFPageDrawRectangleOptions doesn't
    // support it). Rounded corners are drawn manually below via an SVG
    // path, which pdf-lib does support, so the badge still reads as a pill
    // rather than a hard-cornered box.
    const badgeRgb = CLASS_BADGE_COLOURS[data.classCode] ?? [0.36, 0.34, 0.46];
    const badgeColor = rgb(badgeRgb[0], badgeRgb[1], badgeRgb[2]);
    const badgeLabel = this.truncate(data.className, 22);
    const badgeLabelW = fontReg.widthOfTextAtSize(badgeLabel, 7) + 8;
    const badgeX = 12;
    const badgeY = nameY - 32;
    const badgeH = 11;
    this.drawRoundedRect(page, {
      x: badgeX,
      y: badgeY,
      width: badgeLabelW,
      height: badgeH,
      radius: 3,
      color: badgeColor,
    });
    this.drawText(page, badgeLabel, fontReg, 7, badgeX + 4, badgeY + 2, WHITE);

    // ── Validity ─────────────────────────────────────────────────────────────
    const validLine = this.formatValidity(data.activatedAt, data.expiresAt);
    this.drawText(page, validLine, fontReg, 7, 12, nameY - 46, GREY);

    // ── Bottom amber bar ─────────────────────────────────────────────────────
    page.drawRectangle({ x: 3, y: 0, width: CARD_W - 3, height: 16, color: GOLD });
    this.drawText(page, 'v3bcc.bhopal.info', fontBold, 6.5, 12, 4.5, BG);

    // ── Verify hint (bottom right) ───────────────────────────────────────────
    const hint = 'Scan to verify';
    this.drawText(page, hint, fontReg, 5.5, CARD_W - 60, CARD_H - 10 - qrSize - 3, GREY);

    return pdfDoc.save();
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private drawText(
    page: PDFPage,
    text: string,
    font: PDFFont,
    size: number,
    x: number,
    y: number,
    color: ReturnType<typeof rgb>,
  ) {
    page.drawText(text, { x, y, size, font, color });
  }

  // Draws a filled rounded rectangle using an SVG path, since pdf-lib's
  // drawRectangle() has no borderRadius support. (x, y) is the BOTTOM-LEFT
  // corner in PDF page coordinates, matching drawRectangle()'s convention,
  // so this is a drop-in replacement at call sites.
  private drawRoundedRect(
    page: PDFPage,
    opts: { x: number; y: number; width: number; height: number; radius: number; color: ReturnType<typeof rgb> },
  ) {
    const { x, y, width: w, height: h, radius: r, color } = opts;
    const path =
      `M ${r},0 L ${w - r},0 Q ${w},0 ${w},${r} ` +
      `L ${w},${h - r} Q ${w},${h} ${w - r},${h} ` +
      `L ${r},${h} Q 0,${h} 0,${h - r} ` +
      `L 0,${r} Q 0,0 ${r},0 Z`;
    // drawSvgPath anchors the path's own (0,0) at (x, y) and the path's
    // y-axis increases downward from there, so the anchor must be the
    // TOP-left of the shape in page space, i.e. y + height.
    page.drawSvgPath(path, { x, y: y + h, color });
  }

  private truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max - 1) + '\u2026' : s;
  }

  private formatValidity(
    activatedAt: Date | string | null,
    expiresAt: Date | string | null,
  ): string {
    const fmt = (d: Date | string | null) => {
      if (!d) return 'N/A';
      const dt = typeof d === 'string' ? new Date(d) : d;
      return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    };
    if (!expiresAt) return `Valid from: ${fmt(activatedAt)} (Lifetime)`;
    return `Valid: ${fmt(activatedAt)} \u2013 ${fmt(expiresAt)}`;
  }
}
