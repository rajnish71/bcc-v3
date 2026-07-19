/**
 * Justified layout algorithm — shared engine for all public gallery surfaces.
 * Fills rows from left to right; flushes when the row reaches 88% of container width.
 * Respects natural aspect ratios. No object-fit cropping.
 *
 * Default gap matches --gallery-gap token (2px). Default targetHeight matches
 * --gallery-row-showcase token (240px); portfolio callers pass 220px.
 */
export function buildJustifiedLayout(
  photos: any[],
  containerWidth: number,
  targetHeight = 240,
  gap = 2,
): { rows: Array<{ height: number; photos: any[] }>; leftovers: any[] } {
  const rows: Array<{ height: number; photos: any[] }> = [];
  let row: any[] = [];
  let rowWidth = 0;

  const flush = () => {
    if (!row.length) return;
    const totalGap = gap * (row.length - 1);
    const scale = (containerWidth - totalGap) / rowWidth;
    const height = targetHeight * scale;
    rows.push({ height, photos: row.map(p => ({ ...p, width: p.aspect * height })) });
    row = [];
    rowWidth = 0;
  };

  for (const photo of photos) {
    row.push(photo);
    rowWidth += photo.aspect * targetHeight;
    if (rowWidth + gap * (row.length - 1) >= containerWidth * 0.88) flush();
  }

  return { rows, leftovers: row };
}
