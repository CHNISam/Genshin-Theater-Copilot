/**
 * 纯函数图像基元。
 *
 * 刻意不依赖 canvas / DOM：所有算法都在 { width, height, data } 上运行，
 * 这样可以在 Node 里用合成图片直接测试。只有解码那一步需要浏览器（见 decode.ts）。
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA，长度 = width * height * 4。 */
  data: Uint8ClampedArray;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function pixelAt(image: RgbaImage, x: number, y: number): [number, number, number, number] {
  const i = (y * image.width + x) * 4;
  return [image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0, image.data[i + 3] ?? 0];
}

export function cropImage(image: RgbaImage, rect: Rect): RgbaImage {
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const w = Math.min(Math.round(rect.width), image.width - x0);
  const h = Math.min(Math.round(rect.height), image.height - y0);
  const out = new Uint8ClampedArray(Math.max(0, w * h * 4));
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const src = ((y0 + y) * image.width + (x0 + x)) * 4;
      const dst = (y * w + x) * 4;
      out[dst] = image.data[src] ?? 0;
      out[dst + 1] = image.data[src + 1] ?? 0;
      out[dst + 2] = image.data[src + 2] ?? 0;
      out[dst + 3] = image.data[src + 3] ?? 0;
    }
  }
  return { width: Math.max(0, w), height: Math.max(0, h), data: out };
}

/** 盒式采样缩放为灰度矩阵，用于感知哈希。 */
export function resizeToGray(image: RgbaImage, width: number, height: number): number[] {
  const out: number[] = new Array(width * height).fill(0);
  if (image.width === 0 || image.height === 0) return out;
  const sx = image.width / width;
  const sy = image.height / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      const y0 = Math.floor(y * sy);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
      let sum = 0;
      let count = 0;
      for (let yy = y0; yy < Math.min(y1, image.height); yy += 1) {
        for (let xx = x0; xx < Math.min(x1, image.width); xx += 1) {
          const [r, g, b] = pixelAt(image, xx, yy);
          sum += 0.299 * r + 0.587 * g + 0.114 * b;
          count += 1;
        }
      }
      out[y * width + x] = count > 0 ? sum / count : 0;
    }
  }
  return out;
}

/** 等比缩小到最长边不超过 maxSize，降低后续计算量。 */
export function downscale(image: RgbaImage, maxSize: number): { image: RgbaImage; scale: number } {
  const longest = Math.max(image.width, image.height);
  if (longest <= maxSize) return { image, scale: 1 };
  const scale = maxSize / longest;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  const sx = image.width / width;
  const sy = image.height / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixelAt(
        image,
        Math.min(image.width - 1, Math.floor(x * sx)),
        Math.min(image.height - 1, Math.floor(y * sy)),
      );
      const dst = (y * width + x) * 4;
      data[dst] = r;
      data[dst + 1] = g;
      data[dst + 2] = b;
      data[dst + 3] = a;
    }
  }
  return { image: { width, height, data }, scale };
}
