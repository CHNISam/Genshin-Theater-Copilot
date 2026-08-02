/**
 * 卡片网格检测。
 *
 * 游戏 UI 是规则的轴对齐网格，因此不用连通域（会被立绘打断），
 * 而是对"卡片底色掩码"做行/列投影，找出成带的区域，取交集作为卡片。
 * 这对立绘遮挡、圆角、角标都不敏感。
 */
import type { RgbaImage, Rect } from "./image";
import { cardBackgroundMask, classifyCardBackground, type Rarity } from "./color";
import { pixelAt } from "./image";

export interface Band {
  start: number;
  end: number;
}

export interface DetectedTile extends Rect {
  row: number;
  column: number;
  rarity: Rarity | null;
}

export interface GridOptions {
  /** 投影超过该比例才算命中，0~1。 */
  projectionThreshold?: number;
  /** 允许的最小卡片边长（相对图片较短边）。 */
  minTileRatio?: number;
  /** 允许的最大卡片边长（相对图片较短边）。 */
  maxTileRatio?: number;
  /** 长宽比容差。 */
  aspectTolerance?: number;
}

function bandsFrom(projection: number[], threshold: number, minLength: number): Band[] {
  const bands: Band[] = [];
  let start = -1;
  for (let i = 0; i < projection.length; i += 1) {
    const hit = (projection[i] ?? 0) >= threshold;
    if (hit && start === -1) start = i;
    if ((!hit || i === projection.length - 1) && start !== -1) {
      const end = hit ? i + 1 : i;
      if (end - start >= minLength) bands.push({ start, end });
      start = -1;
    }
  }
  return bands;
}

/** 取中位数，用于剔除尺寸异常的带。 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

/**
 * 检测角色卡网格。
 * 返回按阅读顺序（先行后列）排序的卡片区域。
 */
export function detectTiles(image: RgbaImage, options: GridOptions = {}): DetectedTile[] {
  const threshold = options.projectionThreshold ?? 0.25;
  const shorter = Math.min(image.width, image.height);
  const minTile = Math.round(shorter * (options.minTileRatio ?? 0.04));
  const maxTile = Math.round(shorter * (options.maxTileRatio ?? 0.3));
  const aspectTolerance = options.aspectTolerance ?? 0.45;

  const mask = cardBackgroundMask(image);

  // 行投影 → 行带
  const rowProjection: number[] = new Array(image.height).fill(0);
  for (let y = 0; y < image.height; y += 1) {
    let count = 0;
    for (let x = 0; x < image.width; x += 1) count += mask[y * image.width + x] ?? 0;
    rowProjection[y] = count / image.width;
  }
  const rowBands = bandsFrom(rowProjection, threshold * 0.35, minTile).filter(
    (b) => b.end - b.start <= maxTile * 1.6,
  );

  const tiles: DetectedTile[] = [];
  let rowIndex = 0;
  for (const rowBand of rowBands) {
    // 在该行带内做列投影
    const colProjection: number[] = new Array(image.width).fill(0);
    const bandHeight = rowBand.end - rowBand.start;
    for (let x = 0; x < image.width; x += 1) {
      let count = 0;
      for (let y = rowBand.start; y < rowBand.end; y += 1) {
        count += mask[y * image.width + x] ?? 0;
      }
      colProjection[x] = count / bandHeight;
    }
    const colBands = bandsFrom(colProjection, threshold, minTile).filter((b) => {
      const w = b.end - b.start;
      return w >= minTile && w <= maxTile;
    });
    if (colBands.length === 0) continue;

    // 用列宽中位数剔除异常带（例如 UI 里其他同色元素）
    const widths = colBands.map((b) => b.end - b.start);
    const medianWidth = median(widths);
    const kept = colBands.filter(
      (b) => Math.abs(b.end - b.start - medianWidth) <= medianWidth * 0.35,
    );
    if (kept.length === 0) continue;

    // 行带高度可能包含等级条，用列宽收紧为近似正方形
    const height = Math.min(bandHeight, Math.round(medianWidth * (1 + aspectTolerance)));
    let columnIndex = 0;
    for (const colBand of kept) {
      const rect: DetectedTile = {
        x: colBand.start,
        y: rowBand.start,
        width: colBand.end - colBand.start,
        height,
        row: rowIndex,
        column: columnIndex,
        rarity: dominantRarity(image, {
          x: colBand.start,
          y: rowBand.start,
          width: colBand.end - colBand.start,
          height,
        }),
      };
      tiles.push(rect);
      columnIndex += 1;
    }
    rowIndex += 1;
  }

  return tiles;
}

/** 卡片底色决定稀有度：取边缘像素的多数派（中间被立绘占据）。 */
export function dominantRarity(image: RgbaImage, rect: Rect): Rarity | null {
  let five = 0;
  let four = 0;
  const step = Math.max(1, Math.floor(rect.width / 24));
  const edges: [number, number][] = [];
  for (let x = rect.x; x < rect.x + rect.width; x += step) {
    edges.push([x, rect.y + 2]);
    edges.push([x, rect.y + rect.height - 3]);
  }
  for (let y = rect.y; y < rect.y + rect.height; y += step) {
    edges.push([rect.x + 2, y]);
    edges.push([rect.x + rect.width - 3, y]);
  }
  for (const [x, y] of edges) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
    const [r, g, b] = pixelAt(image, x, y);
    const rarity = classifyCardBackground(r, g, b);
    if (rarity === 5) five += 1;
    else if (rarity === 4) four += 1;
  }
  if (five === 0 && four === 0) return null;
  return five >= four ? 5 : 4;
}

/** 卡片内部的固定分区：元素图标、角标、立绘。比例来自剧诗角色卡布局。 */
export function tileRegions(tile: Rect): {
  elementIcon: Rect;
  topRightBadge: Rect;
  topLeftBadge: Rect;
  portrait: Rect;
} {
  return {
    elementIcon: {
      x: tile.x + tile.width * 0.02,
      y: tile.y + tile.height * 0.02,
      width: tile.width * 0.22,
      height: tile.height * 0.22,
    },
    topRightBadge: {
      x: tile.x + tile.width * 0.55,
      y: tile.y,
      width: tile.width * 0.45,
      height: tile.height * 0.2,
    },
    topLeftBadge: {
      x: tile.x,
      y: tile.y,
      width: tile.width * 0.9,
      height: tile.height * 0.16,
    },
    // 立绘取中下部：避开元素图标与角标，保留五官与配色这些最有区分度的部分
    portrait: {
      x: tile.x + tile.width * 0.12,
      y: tile.y + tile.height * 0.24,
      width: tile.width * 0.76,
      height: tile.height * 0.7,
    },
  };
}
