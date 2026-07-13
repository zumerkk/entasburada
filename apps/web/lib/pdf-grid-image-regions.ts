export interface PdfWordBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GridProductIdentity {
  key: string;
  sku: string;
  manufacturerCode: string;
  name: string;
}

export interface EmbeddedGridImageRegion {
  index: number;
  region: GridImageRegion;
}

export function deriveGridProductImageRegions(
  products: GridProductIdentity[],
  words: PdfWordBox[],
  embeddedImages: EmbeddedGridImageRegion[] = []
): Map<string, GridImageRegion> {
  const anchors = products
    .map((product) => ({ product, word: bestAnchorWord(product, words) }))
    .filter((row): row is { product: GridProductIdentity; word: PdfWordBox } => Boolean(row.word));
  if (anchors.length < 6) return new Map();

  const columns = clusterColumns(anchors);
  const stableColumns = columns.filter((column) => column.length >= 3);
  if (stableColumns.length < 2) return new Map();

  const columnPositions = stableColumns.map((column) => median(column.map((row) => row.word.x))).sort((a, b) => a - b);
  const columnPitch = median(differences(columnPositions).filter((value) => value >= 180));
  if (!Number.isFinite(columnPitch) || columnPitch < 180) return new Map();

  const verticalGaps = stableColumns
    .flatMap((column) => differences(column.map((row) => row.word.y).sort((a, b) => a - b)))
    .filter((value) => value >= 120);
  const rowPitch = median(verticalGaps);
  if (!Number.isFinite(rowPitch) || rowPitch < 120) return new Map();
  const comparableGaps = verticalGaps.filter((gap) => gap >= rowPitch * 0.65 && gap <= rowPitch * 1.35);
  if (comparableGaps.length < stableColumns.length * 2) return new Map();

  const embeddedMatches = matchGridAnchorsToEmbeddedImages(anchors, embeddedImages, columnPitch, rowPitch);
  if (embeddedMatches.size >= Math.max(6, Math.ceil(anchors.length * 0.75))) return embeddedMatches;

  const result = new Map<string, GridImageRegion>();
  for (const column of stableColumns) {
    for (const { product, word } of column) {
      const left = clamp(word.x - columnPitch * 0.07, 0, 999);
      const bottom = clamp(word.y - rowPitch * 0.06, 1, 1000);
      const top = clamp(bottom - rowPitch * 0.78, 0, 999);
      result.set(product.key, {
        x: left,
        y: top,
        width: clamp(columnPitch * 0.94, 20, 1000 - left),
        height: clamp(bottom - top, 20, 1000 - top)
      });
    }
  }
  return result;
}

function matchGridAnchorsToEmbeddedImages(
  anchors: Array<{ product: GridProductIdentity; word: PdfWordBox }>,
  embeddedImages: EmbeddedGridImageRegion[],
  columnPitch: number,
  rowPitch: number
): Map<string, GridImageRegion> {
  const usefulImages = embeddedImages.filter(({ region }) => {
    const area = region.width * region.height;
    const ratio = region.width / region.height;
    return area >= 1_500 && area <= 180_000 && region.width >= 35 && region.height >= 30 && ratio >= 0.2 && ratio <= 4.5;
  });
  const result = new Map<string, GridImageRegion>();
  for (const { product, word } of anchors) {
    const best = usefulImages
      .map((image) => {
        const centerX = image.region.x + image.region.width / 2;
        const centerY = image.region.y + image.region.height / 2;
        const dx = Math.abs(centerX - word.x);
        const dy = Math.abs(centerY - word.y);
        return { image, dx, dy, score: dy * 1.2 + dx * 0.35 };
      })
      .filter(({ image, dx, dy }) =>
        dx <= columnPitch * 0.55 && dy <= rowPitch * 0.62 + image.region.height / 2
      )
      .sort((a, b) => a.score - b.score)[0];
    if (best) result.set(product.key, best.image.region);
  }
  return result;
}

function bestAnchorWord(product: GridProductIdentity, words: PdfWordBox[]): PdfWordBox | null {
  const identity = normalize(`${product.sku} ${product.manufacturerCode}`);
  const name = normalize(product.name);
  return (
    words
      .map((word) => {
        const token = normalize(word.text);
        if (token.length < 4 || !/\d/.test(token)) return { word, score: 0 };
        const identityMatch = identity.includes(token);
        const nameMatch = name.includes(token);
        if (!identityMatch && !nameMatch) return { word, score: 0 };
        const packagingOrMeasure = /^(?:\d+(?:PCS|ADET|PAKET|MM|CM|AMP|W|V)|\d+X\d+MM)$/.test(token);
        return {
          word,
          score: (identityMatch ? 1_000 : 100) + token.length - (packagingOrMeasure ? 40 : 0)
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.word ?? null
  );
}

function clusterColumns<T extends { word: PdfWordBox }>(rows: T[]): T[][] {
  const columns: T[][] = [];
  for (const row of [...rows].sort((a, b) => a.word.x - b.word.x)) {
    const existing = columns.find((column) => Math.abs(median(column.map((entry) => entry.word.x)) - row.word.x) <= 120);
    if (existing) existing.push(row);
    else columns.push([row]);
  }
  return columns;
}

function differences(values: number[]): number[] {
  return values.slice(1).map((value, index) => value - values[index]!);
}

function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function normalize(value: string): string {
  return value
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9]+/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
