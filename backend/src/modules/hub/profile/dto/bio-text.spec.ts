import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UpdateProfileDto } from './update-profile.dto';
import { BIO_TOO_LONG_MESSAGE, visibleTextLength } from './bio-text';

const check = async (bio: string) => {
  const errs = await validate(plainToInstance(UpdateProfileDto, { bio }));
  return errs.flatMap((e) => Object.values(e.constraints ?? {}));
};

describe('UpdateProfileDto.bio visible-text limit', () => {
  it.each([[2999, true], [3000, true], [3001, false]])('plain %i chars → accepted=%s', async (n, ok) => {
    const msgs = await check('a'.repeat(n));
    expect(msgs.length === 0).toBe(ok);
    if (!ok) expect(msgs).toContain('Biography must be 3000 characters or fewer.');
  });

  it('markup does not consume the allowance: 3000 visible chars in <p>', async () => {
    const html = `<p>${'a'.repeat(3000)}</p>`;
    expect(html.length).toBeGreaterThan(3000);
    expect(await check(html)).toEqual([]);
  });

  it('3001 visible chars in <p> is rejected with the clear message', async () => {
    expect(await check(`<p>${'a'.repeat(3001)}</p>`)).toContain(BIO_TOO_LONG_MESSAGE);
  });

  it('mixed formatting: paragraphs, bold, italic, bullet list', async () => {
    const html = '<p><strong>' + 'b'.repeat(1000) + '</strong> <em>' + 'i'.repeat(1000) + '</em></p>'
      + '<ul><li><p>' + 'x'.repeat(500) + '</p></li><li><p>' + 'y'.repeat(498) + '</p></li></ul><p>z</p>';
    expect(visibleTextLength(html)).toBe(1000 + 1 + 1000 + 500 + 498 + 1);
    expect(await check(html)).toEqual([]);
    expect(await check(html + '<p>' + 'q'.repeat(1000) + '</p>')).toContain(BIO_TOO_LONG_MESSAGE);
  });

  it('decodes entities (&amp; counts as one char)', () => {
    expect(visibleTextLength('<p>a &amp; b &lt;c&gt; &#39;</p>')).toBe('a & b <c> \''.length);
  });
});
