/**
 * ImageKit URL builder for BCC — endpoint duynda7oq
 * Origin: Cloudflare R2 bucket `bccuploads`
 *
 * Usage:
 *   ikUrl('photos/member123/sunset.jpg', { w: 800, q: 85 })
 *   // → https://ik.imagekit.io/duynda7oq/photos/member123/sunset.jpg?tr=w-800,q-85
 */

const IK_ENDPOINT = 'https://ik.imagekit.io/duynda7oq';

type IkTransform = {
  w?: number;        // width
  h?: number;        // height
  q?: number;        // quality (1–100)
  f?: string;        // format: 'webp' | 'jpg' | 'png' | 'avif'
  ar?: string;       // aspect ratio, e.g. '16-9'
  c?: string;        // crop: 'maintain_ratio' | 'force' | 'at_least' | 'at_max'
  cm?: string;       // crop mode: 'extract' | 'pad_resize'
  fo?: string;       // focus: 'auto' | 'face' | 'center' | 'top' | 'bottom'
  blur?: number;     // blur (1–100)
  dpr?: number;      // device pixel ratio (1–5)
  pr?: boolean;      // progressive rendering
  lo?: boolean;      // lossless compression
  metadata?: boolean; // strip metadata for smaller files
};

/**
 * Build an ImageKit delivery URL.
 *
 * @param path  - Path within the R2 bucket (without leading slash)
 * @param tr    - Optional transformation parameters
 */
export function ikUrl(path: string, tr: IkTransform = {}): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  const trParts: string[] = [];
  if (tr.w)        trParts.push(`w-${tr.w}`);
  if (tr.h)        trParts.push(`h-${tr.h}`);
  if (tr.q)        trParts.push(`q-${tr.q}`);
  if (tr.f)        trParts.push(`f-${tr.f}`);
  if (tr.ar)       trParts.push(`ar-${tr.ar}`);
  if (tr.c)        trParts.push(`c-${tr.c}`);
  if (tr.cm)       trParts.push(`cm-${tr.cm}`);
  if (tr.fo)       trParts.push(`fo-${tr.fo}`);
  if (tr.blur)     trParts.push(`bl-${tr.blur}`);
  if (tr.dpr)      trParts.push(`dpr-${tr.dpr}`);
  if (tr.pr)       trParts.push('pr-true');
  if (tr.lo)       trParts.push('lo-true');
  if (tr.metadata) trParts.push('md-false');

  const trStr = trParts.length > 0 ? `?tr=${trParts.join(',')}` : '';
  return `${IK_ENDPOINT}/${cleanPath}${trStr}`;
}

/**
 * Build a responsive `srcset` string for a given path.
 * Widths default to [400, 800, 1200, 1600].
 */
export function ikSrcset(path: string, widths = [400, 800, 1200, 1600], baseQ = 80): string {
  return widths
    .map((w) => `${ikUrl(path, { w, q: baseQ, f: 'webp' })} ${w}w`)
    .join(', ');
}

/**
 * Blur-up placeholder — tiny 32px thumbnail.
 */
export function ikThumb(path: string): string {
  return ikUrl(path, { w: 32, q: 30, blur: 10, f: 'webp' });
}
