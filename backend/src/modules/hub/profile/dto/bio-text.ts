import { registerDecorator, ValidationOptions } from 'class-validator';

export const BIO_MAX_CHARS = 3000;
export const BIO_TOO_LONG_MESSAGE = `Biography must be ${BIO_MAX_CHARS} characters or fewer.`;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

// Visible text of Tiptap HTML = concatenated text nodes (tags dropped,
// entities decoded, block separators not counted). Mirrors the editor's
// doc.textContent, which is what the frontend counter enforces.
export function visibleTextLength(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, ent: string) => {
      if (ent[0] === '#') {
        const cp = ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        return Number.isFinite(cp) && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
      }
      return NAMED_ENTITIES[ent.toLowerCase()] ?? m;
    });
  return text.length;
}

export function MaxVisibleChars(max: number, options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'maxVisibleChars',
      target: object.constructor,
      propertyName,
      options: { message: BIO_TOO_LONG_MESSAGE, ...options },
      constraints: [max],
      validator: {
        validate: (value: unknown) => typeof value === 'string' && visibleTextLength(value) <= max,
      },
    });
}
