/**
 * 浏览器侧解码：File/Blob → RgbaImage。
 * 只有这一层依赖 DOM；识别算法本身是纯函数，可在 Node 里测试。
 * 图片始终留在本地，不上传。
 */
import type { RgbaImage } from "./image";

export async function fileToImage(file: Blob): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("无法创建 canvas 上下文");
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return { width: data.width, height: data.height, data: data.data };
}

/** 从粘贴事件里取出第一张图片。 */
export function imageFromClipboard(event: ClipboardEvent): Blob | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
