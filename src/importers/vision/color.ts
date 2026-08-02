/**
 * 颜色判定：卡片底色（稀有度）与元素图标。
 *
 * 这些阈值是**数据**，不是策略。识别错了由用户在确认界面一键更正，
 * 并且元素只用来缩小候选列表，不会单独决定匹配结果。
 */
import type { Element } from "../../domain/types";
import type { RgbaImage } from "./image";
import { pixelAt } from "./image";

export interface Hsv {
  h: number; // 0..360
  s: number; // 0..1
  v: number; // 0..1
}

export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export type Rarity = 5 | 4;

/** 5★ 卡片是暖橙底，4★ 是紫底。命中任一即视为"角色卡背景"。 */
export function classifyCardBackground(r: number, g: number, b: number): Rarity | null {
  const { h, s, v } = rgbToHsv(r, g, b);
  if (v < 0.22 || s < 0.28) return null;
  if (h >= 12 && h <= 48) return 5;
  if (h >= 250 && h <= 300) return 4;
  return null;
}

export function isCardBackground(r: number, g: number, b: number): boolean {
  return classifyCardBackground(r, g, b) !== null;
}

/** 卡片底色掩码：1 表示该像素像角色卡背景。 */
export function cardBackgroundMask(image: RgbaImage): Uint8Array {
  const mask = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const [r, g, b, a] = pixelAt(image, x, y);
      if (a > 32 && isCardBackground(r, g, b)) mask[y * image.width + x] = 1;
    }
  }
  return mask;
}

interface ElementHue {
  element: Element;
  hue: number;
  /** 冰与水色相接近，用明度/饱和度再拉开。 */
  minValue?: number;
  maxSaturation?: number;
  minSaturation?: number;
}

const ELEMENT_HUES: ElementHue[] = [
  { element: "pyro", hue: 12 },
  { element: "geo", hue: 42 },
  { element: "dendro", hue: 90 },
  { element: "anemo", hue: 160 },
  { element: "cryo", hue: 186, minValue: 0.72, maxSaturation: 0.55 },
  { element: "hydro", hue: 200, minSaturation: 0.5 },
  { element: "electro", hue: 288 },
];

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function colorDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
  );
}

/** 取矩形边缘像素的中位色，作为卡片底色估计。 */
export function sampleBackgroundColor(
  image: RgbaImage,
  rect: { x: number; y: number; width: number; height: number },
): [number, number, number] {
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  const step = Math.max(1, Math.floor(rect.width / 20));
  for (let x = Math.round(rect.x); x < rect.x + rect.width; x += step) {
    for (const y of [Math.round(rect.y) + 1, Math.round(rect.y + rect.height) - 2]) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      const [r, g, b] = pixelAt(image, x, y);
      reds.push(r);
      greens.push(g);
      blues.push(b);
    }
  }
  const mid = (values: number[]): number => {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((p, q) => p - q);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
  };
  return [mid(reds), mid(greens), mid(blues)];
}

export interface ElementGuess {
  element: Element | null;
  confidence: number;
}

/**
 * 从元素图标区域猜元素：取饱和度最高的一撮像素的平均色相。
 *
 * 必须先排除卡片底色，否则：
 *  - 冰是很淡的青白色，会输给饱和的 5★ 橙色底；
 *  - 雷本身就是紫色，会和 4★ 紫色底混在一起。
 * 冰/水色相接近，落在模糊区时降低可信度，交给用户确认。
 */
export function classifyElementIcon(
  icon: RgbaImage,
  backgroundColor?: [number, number, number],
): ElementGuess {
  const samples: { hsv: Hsv; weight: number }[] = [];
  for (let y = 0; y < icon.height; y += 1) {
    for (let x = 0; x < icon.width; x += 1) {
      const [r, g, b, a] = pixelAt(icon, x, y);
      if (a < 64) continue;
      if (backgroundColor && colorDistance([r, g, b], backgroundColor) < 70) continue;
      const hsv = rgbToHsv(r, g, b);
      if (hsv.s < 0.2 || hsv.v < 0.3) continue;
      samples.push({ hsv, weight: hsv.s * hsv.v });
    }
  }
  if (samples.length < 4) return { element: null, confidence: 0 };

  samples.sort((a, b) => b.weight - a.weight);
  const top = samples.slice(0, Math.max(4, Math.floor(samples.length * 0.3)));

  // 色相是圆形量，用向量平均
  let sx = 0;
  let sy = 0;
  let sat = 0;
  let val = 0;
  for (const s of top) {
    const rad = (s.hsv.h * Math.PI) / 180;
    sx += Math.cos(rad) * s.weight;
    sy += Math.sin(rad) * s.weight;
    sat += s.hsv.s;
    val += s.hsv.v;
  }
  let hue = (Math.atan2(sy, sx) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  sat /= top.length;
  val /= top.length;

  const scored = ELEMENT_HUES.map((candidate) => {
    let distance = hueDistance(hue, candidate.hue);
    if (candidate.minValue !== undefined && val < candidate.minValue) distance += 18;
    if (candidate.maxSaturation !== undefined && sat > candidate.maxSaturation) distance += 18;
    if (candidate.minSaturation !== undefined && sat < candidate.minSaturation) distance += 18;
    return { element: candidate.element, distance };
  }).sort((a, b) => a.distance - b.distance);

  const best = scored[0];
  const second = scored[1];
  if (!best || best.distance > 40) return { element: null, confidence: 0 };

  const margin = second ? second.distance - best.distance : 40;
  const confidence = Math.max(
    0.2,
    Math.min(0.95, (1 - best.distance / 40) * 0.6 + Math.min(margin / 30, 1) * 0.4),
  );
  return { element: best.element, confidence };
}

/** 角标检测：粉红=试用角色，蓝色=助演。 */
export function detectBadgeColor(region: RgbaImage): "trial" | "support" | null {
  let pink = 0;
  let blue = 0;
  let total = 0;
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const [r, g, b, a] = pixelAt(region, x, y);
      if (a < 64) continue;
      total += 1;
      const { h, s, v } = rgbToHsv(r, g, b);
      if (s < 0.4 || v < 0.4) continue;
      if (h >= 320 || h <= 8) pink += 1;
      else if (h >= 200 && h <= 245) blue += 1;
    }
  }
  if (total === 0) return null;
  if (pink / total > 0.18) return "trial";
  if (blue / total > 0.18) return "support";
  return null;
}
