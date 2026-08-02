import { describe, expect, it } from "vitest";
import type { CharacterBase, Element } from "../src/domain/types";
import type { RgbaImage, Rect } from "../src/importers/vision/image";
import { cropImage } from "../src/importers/vision/image";
import { detectTiles, tileRegions } from "../src/importers/vision/grid";
import {
  classifyElementIcon,
  rgbToHsv,
  sampleBackgroundColor,
} from "../src/importers/vision/color";
import { dHash, hammingDistance } from "../src/importers/vision/hash";
import { FINGERPRINT_VARIANTS } from "../src/importers/vision/variants";
import {
  countVigorPips,
  recognizeCastScreen,
  type FingerprintEntry,
} from "../src/importers/vision/recognize";
import { mergeLibraries } from "../src/importers/vision/library";
import { char } from "./fixtures";

/* ---------------- 合成截图工具 ---------------- */

function makeImage(width: number, height: number, fill: [number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = fill[0];
    data[i + 1] = fill[1];
    data[i + 2] = fill[2];
    data[i + 3] = 255;
  }
  return { width, height, data };
}

function fillRect(image: RgbaImage, rect: Rect, color: [number, number, number]): void {
  for (let y = Math.round(rect.y); y < Math.round(rect.y + rect.height); y += 1) {
    for (let x = Math.round(rect.x); x < Math.round(rect.x + rect.width); x += 1) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const i = (y * image.width + x) * 4;
      image.data[i] = color[0];
      image.data[i + 1] = color[1];
      image.data[i + 2] = color[2];
      image.data[i + 3] = 255;
    }
  }
}

const RARITY_BG: Record<4 | 5, [number, number, number]> = {
  5: [190, 116, 62],
  4: [122, 92, 164],
};

const ELEMENT_COLOR: Record<Element, [number, number, number]> = {
  pyro: [255, 102, 64],
  hydro: [40, 140, 235],
  electro: [197, 96, 222],
  cryo: [180, 245, 250],
  anemo: [51, 215, 160],
  geo: [240, 180, 40],
  dendro: [147, 226, 75],
};

/** 每个角色画一组独一无二的色块，模拟立绘。 */
function drawPortrait(image: RgbaImage, tile: Rect, seed: number): void {
  const blocks = 5;
  for (let i = 0; i < blocks; i += 1) {
    const t = (seed * 37 + i * 61) % 255;
    const u = (seed * 89 + i * 17) % 255;
    fillRect(
      image,
      {
        x: tile.x + tile.width * (0.16 + ((i * 13 + seed * 7) % 50) / 100),
        y: tile.y + tile.height * (0.28 + ((i * 19 + seed * 11) % 40) / 100),
        width: tile.width * 0.18,
        height: tile.height * 0.2,
      },
      [t, u, (t + u) % 255],
    );
  }
}

interface SyntheticCharacter {
  base: CharacterBase;
  rarity: 4 | 5;
  vigor: number | null;
  seed: number;
}

function buildCastScreen(
  entries: SyntheticCharacter[],
  columns = 4,
  tileSize = 110,
  gap = 18,
): RgbaImage {
  const rows = Math.ceil(entries.length / columns);
  const width = gap + columns * (tileSize + gap);
  // 真实截图里网格外还有大片界面留白，这里保留同样的比例，
  // 否则卡片会大到超过"卡片最大边长占画面比例"的合理上限。
  const height = gap + rows * (tileSize + gap) + 160;
  // 背景用低饱和的米色，模拟剧诗界面的羊皮纸底，不应被误判成卡片
  const image = makeImage(width, height, [238, 233, 224]);

  entries.forEach((entry, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const tile: Rect = {
      x: gap + column * (tileSize + gap),
      y: gap + row * (tileSize + gap),
      width: tileSize,
      height: tileSize,
    };
    fillRect(image, tile, RARITY_BG[entry.rarity]);
    drawPortrait(image, tile, entry.seed);
    // 元素图标（左上角）
    fillRect(
      image,
      {
        x: tile.x + tile.width * 0.04,
        y: tile.y + tile.height * 0.04,
        width: tile.width * 0.16,
        height: tile.height * 0.16,
      },
      ELEMENT_COLOR[entry.base.element],
    );
    // 耐力闪电（下方横条）
    if (entry.vigor !== null) {
      for (let i = 0; i < entry.vigor; i += 1) {
        fillRect(
          image,
          {
            x: tile.x + tile.width * (0.3 + i * 0.16),
            y: tile.y + tile.height * 0.8,
            width: tile.width * 0.08,
            height: tile.height * 0.1,
          },
          [255, 214, 40],
        );
      }
    }
  });

  return image;
}

function fingerprintFor(image: RgbaImage, tile: Rect, base: CharacterBase, rarity: 4 | 5): FingerprintEntry {
  const hashes: Record<string, string> = {};
  for (const variant of FINGERPRINT_VARIANTS) {
    hashes[variant.id] = dHash(
      cropImage(image, {
        x: tile.x + tile.width * variant.rect.x,
        y: tile.y + tile.height * variant.rect.y,
        width: tile.width * variant.rect.width,
        height: tile.height * variant.rect.height,
      }),
    );
  }
  return { characterId: base.id, name: base.name, rarity, hashes };
}

/* ---------------- 测试 ---------------- */

const CAST: SyntheticCharacter[] = [
  { base: char({ id: "v-a", name: "甲", element: "cryo" }), rarity: 5, vigor: 2, seed: 3 },
  { base: char({ id: "v-b", name: "乙", element: "electro" }), rarity: 5, vigor: 1, seed: 11 },
  { base: char({ id: "v-c", name: "丙", element: "hydro" }), rarity: 4, vigor: null, seed: 23 },
  { base: char({ id: "v-d", name: "丁", element: "pyro" }), rarity: 4, vigor: null, seed: 41 },
  { base: char({ id: "v-e", name: "戊", element: "anemo" }), rarity: 5, vigor: null, seed: 59 },
  { base: char({ id: "v-f", name: "己", element: "geo" }), rarity: 4, vigor: null, seed: 71 },
];

describe("截图识别", () => {
  const screen = buildCastScreen(CAST);
  const tiles = detectTiles(screen);

  it("能在截图里定位到全部角色卡，并按阅读顺序排列", () => {
    expect(tiles.length).toBe(CAST.length);
    expect(tiles[0]!.row).toBe(0);
    expect(tiles[0]!.column).toBe(0);
    expect(tiles[4]!.row).toBe(1);
    // 米色背景不能被当成卡片
    expect(tiles.every((t) => t.rarity !== null)).toBe(true);
  });

  it("能区分 5★ 与 4★ 卡片底色", () => {
    expect(tiles[0]!.rarity).toBe(5);
    expect(tiles[2]!.rarity).toBe(4);
  });

  it("能从左上角图标判断元素", () => {
    const guesses = tiles.map((tile) =>
      classifyElementIcon(
        cropImage(screen, tileRegions(tile).elementIcon),
        sampleBackgroundColor(screen, tile),
      ),
    );
    expect(guesses[0]!.element).toBe("cryo");
    expect(guesses[1]!.element).toBe("electro");
    expect(guesses[2]!.element).toBe("hydro");
    expect(guesses[3]!.element).toBe("pyro");
  });

  it("能数出剩余耐力（黄色闪电数量），没有闪电的卡返回 null", () => {
    expect(countVigorPips(screen, tiles[0]!)).toBe(2);
    expect(countVigorPips(screen, tiles[1]!)).toBe(1);
    expect(countVigorPips(screen, tiles[2]!)).toBeNull();
  });

  it("指纹库命中时能自动识别角色，且区分出已出战/待命分区", () => {
    const library = mergeLibraries(
      CAST.map((c, i) => fingerprintFor(screen, tiles[i]!, c.base, c.rarity)),
      [],
    );
    const result = recognizeCastScreen(
      screen,
      library,
      CAST.map((c) => c.base),
    );

    expect(result.tileCount).toBe(CAST.length);
    expect(result.unknownCount).toBe(0);
    expect(result.tiles.map((t) => t.detected.value)).toEqual(CAST.map((c) => c.base.id));
    expect(result.tiles[0]!.section).toBe("principal");
    expect(result.tiles[2]!.section).toBe("alternate");
    expect(result.tiles[0]!.vigor?.value).toBe(2);
  });

  it("指纹库里没有的角色不会被硬猜，而是要求确认并给出候选", () => {
    // 故意只把前 3 个角色放进指纹库
    const library = mergeLibraries(
      CAST.slice(0, 3).map((c, i) => fingerprintFor(screen, tiles[i]!, c.base, c.rarity)),
      [],
    );
    const result = recognizeCastScreen(
      screen,
      library,
      CAST.map((c) => c.base),
    );

    const unknown = result.tiles[5]!;
    expect(unknown.detected.value).toBeNull();
    expect(unknown.detected.requiresConfirmation).toBe(true);
    expect(result.warnings.join()).toContain("确认");
    // 元素仍然能给出来，用于缩小候选范围
    expect(unknown.element.value).toBe("geo");
  });

  it("用户指认一次后，本地指纹会覆盖内置库", () => {
    const builtin = [fingerprintFor(screen, tiles[0]!, CAST[0]!.base, 5)];
    const local = [
      { ...fingerprintFor(screen, tiles[1]!, CAST[1]!.base, 5), learnedAt: "2026-08-02" },
    ];
    const merged = mergeLibraries(builtin, local);
    expect(merged.entries.map((e) => e.characterId).sort()).toEqual(["v-a", "v-b"]);
  });

  it("dHash 对同一张图稳定，对不同图有明显距离", () => {
    const a = cropImage(screen, tiles[0]!);
    const b = cropImage(screen, tiles[1]!);
    expect(hammingDistance(dHash(a), dHash(a))).toBe(0);
    expect(hammingDistance(dHash(a), dHash(b))).toBeGreaterThan(8);
  });

  it("rgbToHsv 基本正确", () => {
    expect(rgbToHsv(255, 0, 0).h).toBeCloseTo(0, 5);
    expect(rgbToHsv(0, 255, 0).h).toBeCloseTo(120, 5);
    expect(rgbToHsv(0, 0, 255).h).toBeCloseTo(240, 5);
  });
});
