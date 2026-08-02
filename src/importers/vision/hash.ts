/**
 * 感知哈希（dHash）。
 *
 * 只保存哈希、不保存图片：64 bit 无法还原美术资源，
 * 因此仓库里不会出现任何官方图片素材，匹配效果却完全一样。
 */
import type { RgbaImage } from "./image";
import { resizeToGray } from "./image";

const HASH_WIDTH = 9;
const HASH_HEIGHT = 8;

/** 返回 16 位十六进制字符串（64 bit）。 */
export function dHash(image: RgbaImage): string {
  const gray = resizeToGray(image, HASH_WIDTH, HASH_HEIGHT);
  let bits = "";
  for (let y = 0; y < HASH_HEIGHT; y += 1) {
    for (let x = 0; x < HASH_WIDTH - 1; x += 1) {
      const left = gray[y * HASH_WIDTH + x] ?? 0;
      const right = gray[y * HASH_WIDTH + x + 1] ?? 0;
      bits += left > right ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

const POPCOUNT: number[] = Array.from({ length: 16 }, (_, i) =>
  i.toString(2).split("").filter((c) => c === "1").length,
);

/** 汉明距离，0~64。输入长度不一致时返回 64。 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = parseInt(a[i] as string, 16) ^ parseInt(b[i] as string, 16);
    distance += POPCOUNT[x] ?? 0;
  }
  return distance;
}

/** 相似度 0~1。 */
export function hashSimilarity(a: string, b: string): number {
  return 1 - hammingDistance(a, b) / 64;
}
