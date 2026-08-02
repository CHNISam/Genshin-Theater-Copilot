/**
 * 截图识别主流程：一张剧诗角色界面截图 → 角色池 / 已解锁 / 剩余耐力。
 *
 * 三条数据来源的优先级（见 README）：
 *   确认出战推导 ＞ 截图识别 ＞ 手动纠正
 * 因此这里产出的一律是 DetectedValue，低可信度必须由用户确认，不静默采信。
 */
import type { CharacterBase, DetectedValue, Element } from "../../domain/types";
import type { RgbaImage } from "./image";
import { cropImage, downscale, pixelAt } from "./image";
import { detectTiles, tileRegions, type DetectedTile } from "./grid";
import {
  classifyElementIcon,
  detectBadgeColor,
  rgbToHsv,
  sampleBackgroundColor,
} from "./color";
import { dHash, hammingDistance } from "./hash";
import { FINGERPRINT_VARIANTS } from "./variants";

export interface FingerprintEntry {
  characterId: string;
  name: string;
  iconName?: string;
  rarity: 4 | 5;
  hashes: Record<string, string>;
}

export interface FingerprintLibrary {
  entries: FingerprintEntry[];
}

export interface TileMatch {
  characterId: string;
  name: string;
  /** 0~64，越小越像。 */
  distance: number;
  variantId: string;
}

export interface RecognizedCharacterTile {
  tile: DetectedTile;
  /** 匹配结果，按相似度排序，用于"猜错了就从这几个里选" */
  candidates: TileMatch[];
  detected: DetectedValue<string | null>;
  element: { value: Element | null; confidence: number };
  rarity: 4 | 5 | null;
  /** 剩余耐力（黄色闪电数量）。null 表示该卡没有显示耐力。 */
  vigor: DetectedValue<number> | null;
  badge: "trial" | "support" | null;
  /** 是否属于"已出战阵容"分区（显示耐力的那一组）。 */
  section: "principal" | "alternate";
}

export interface RecognizeResult {
  tiles: RecognizedCharacterTile[];
  /** 完全没匹配上的卡片数量。 */
  unknownCount: number;
  /** 检测到的卡片总数。 */
  tileCount: number;
  warnings: string[];
}

export interface RecognizeOptions {
  /** 认为匹配可信的最大汉明距离。 */
  acceptDistance?: number;
  /** 处理前缩放到的最长边。 */
  maxSize?: number;
}

/** 统计"黄色闪电"数量作为剩余耐力。 */
export function countVigorPips(image: RgbaImage, tile: DetectedTile): number | null {
  // 耐力图标位于立绘下方约 78%~96% 的横条上
  const strip = cropImage(image, {
    x: tile.x + tile.width * 0.12,
    y: tile.y + tile.height * 0.74,
    width: tile.width * 0.76,
    height: tile.height * 0.24,
  });
  if (strip.width < 6 || strip.height < 4) return null;

  // 逐列统计"亮黄"像素，得到若干竖直色块
  const columnHit: boolean[] = [];
  for (let x = 0; x < strip.width; x += 1) {
    let hits = 0;
    for (let y = 0; y < strip.height; y += 1) {
      const [r, g, b, a] = pixelAt(strip, x, y);
      if (a < 64) continue;
      const { h, s, v } = rgbToHsv(r, g, b);
      if (h >= 38 && h <= 62 && s >= 0.45 && v >= 0.75) hits += 1;
    }
    columnHit.push(hits >= Math.max(2, Math.floor(strip.height * 0.12)));
  }

  let blobs = 0;
  let inBlob = false;
  let blobWidth = 0;
  const minBlobWidth = Math.max(1, Math.floor(strip.width * 0.04));
  for (const hit of columnHit) {
    if (hit) {
      inBlob = true;
      blobWidth += 1;
    } else if (inBlob) {
      if (blobWidth >= minBlobWidth) blobs += 1;
      inBlob = false;
      blobWidth = 0;
    }
  }
  if (inBlob && blobWidth >= minBlobWidth) blobs += 1;

  return blobs > 0 ? blobs : null;
}

function matchTile(
  image: RgbaImage,
  tile: DetectedTile,
  library: FingerprintLibrary,
): TileMatch[] {
  const tileHashes = new Map<string, string>();
  for (const variant of FINGERPRINT_VARIANTS) {
    tileHashes.set(
      variant.id,
      dHash(
        cropImage(image, {
          x: tile.x + tile.width * variant.rect.x,
          y: tile.y + tile.height * variant.rect.y,
          width: tile.width * variant.rect.width,
          height: tile.height * variant.rect.height,
        }),
      ),
    );
  }

  const matches: TileMatch[] = [];
  for (const entry of library.entries) {
    let best: TileMatch | null = null;
    for (const variant of FINGERPRINT_VARIANTS) {
      const reference = entry.hashes[variant.id];
      const observed = tileHashes.get(variant.id);
      if (!reference || !observed) continue;
      // 权重越高的变体，等效距离越小
      const distance = hammingDistance(observed, reference) / variant.weight;
      if (!best || distance < best.distance) {
        best = {
          characterId: entry.characterId,
          name: entry.name,
          distance,
          variantId: variant.id,
        };
      }
    }
    if (best) matches.push(best);
  }
  return matches.sort((a, b) => a.distance - b.distance).slice(0, 6);
}

export function recognizeCastScreen(
  input: RgbaImage,
  library: FingerprintLibrary,
  characters: readonly CharacterBase[],
  options: RecognizeOptions = {},
): RecognizeResult {
  const acceptDistance = options.acceptDistance ?? 14;
  const { image } = downscale(input, options.maxSize ?? 1400);
  const warnings: string[] = [];

  const tiles = detectTiles(image);
  if (tiles.length === 0) {
    return {
      tiles: [],
      tileCount: 0,
      unknownCount: 0,
      warnings: [
        "没有在截图里找到角色卡。请确认截图是剧诗的角色选择/阵容界面，并且没有被裁掉卡片区域。",
      ],
    };
  }

  const byId = new Map(characters.map((c) => [c.id, c]));
  const recognized: RecognizedCharacterTile[] = [];
  let unknownCount = 0;

  for (const tile of tiles) {
    const regions = tileRegions(tile);
    const background = sampleBackgroundColor(image, tile);
    const elementGuess = classifyElementIcon(
      cropImage(image, regions.elementIcon),
      background,
    );
    const badge =
      detectBadgeColor(cropImage(image, regions.topRightBadge)) ??
      detectBadgeColor(cropImage(image, regions.topLeftBadge));

    let candidates = library.entries.length > 0 ? matchTile(image, tile, library) : [];

    // 元素一致的候选优先：元素判定独立于立绘哈希，是一条有效的交叉验证
    if (elementGuess.element && elementGuess.confidence >= 0.5) {
      candidates = [...candidates].sort((a, b) => {
        const ea = byId.get(a.characterId)?.element === elementGuess.element ? 0 : 6;
        const eb = byId.get(b.characterId)?.element === elementGuess.element ? 0 : 6;
        return a.distance + ea - (b.distance + eb);
      });
    }

    const best = candidates[0];
    const second = candidates[1];
    const accepted = best !== undefined && best.distance <= acceptDistance;
    if (!accepted) unknownCount += 1;

    // 与第二名拉开差距才算稳；差距小说明两个角色长得像，交给用户确认
    const margin = best && second ? second.distance - best.distance : 64;
    const confidence = !best
      ? 0
      : Math.max(
          0,
          Math.min(
            0.98,
            (1 - best.distance / 32) * 0.7 + Math.min(margin / 12, 1) * 0.3,
          ),
        );

    const pips = countVigorPips(image, tile);
    recognized.push({
      tile,
      candidates,
      detected: {
        value: accepted && best ? best.characterId : null,
        confidence: accepted ? confidence : 0,
        requiresConfirmation: !accepted || confidence < 0.8,
        sourceRegion: { x: tile.x, y: tile.y, width: tile.width, height: tile.height },
      },
      element: { value: elementGuess.element, confidence: elementGuess.confidence },
      rarity: tile.rarity,
      vigor:
        pips === null
          ? null
          : {
              value: pips,
              confidence: 0.7,
              requiresConfirmation: true,
              sourceRegion: {
                x: tile.x,
                y: tile.y + tile.height * 0.74,
                width: tile.width,
                height: tile.height * 0.24,
              },
            },
      badge,
      section: pips !== null ? "principal" : "alternate",
    });
  }

  if (library.entries.length === 0) {
    warnings.push(
      "还没有角色指纹库（运行 npm run vision:fingerprints 生成）。当前只能靠元素与稀有度缩小范围，需要你手动指认一次。",
    );
  }
  if (unknownCount > 0) {
    warnings.push(`${unknownCount} 张卡片没有可靠匹配，已列出候选，请点选确认（确认一次即可记住）。`);
  }

  return { tiles: recognized, tileCount: tiles.length, unknownCount, warnings };
}
