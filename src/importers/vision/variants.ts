/**
 * 指纹裁剪变体。
 *
 * 构建脚本（官方图标）与运行时（用户截图里的卡片）必须使用**同一套相对裁剪**，
 * 匹配才有意义。多留几个变体是为了容忍游戏内卡片与图标资源的取景差异。
 */
export interface FingerprintVariant {
  id: string;
  /** 相对矩形，0~1。 */
  rect: { x: number; y: number; width: number; height: number };
  /** 匹配时的权重（越可靠越高）。 */
  weight: number;
}

export const FINGERPRINT_VARIANTS: FingerprintVariant[] = [
  // 立绘主体：避开左上角元素图标与顶部角标
  { id: "portrait", rect: { x: 0.12, y: 0.24, width: 0.76, height: 0.7 }, weight: 1 },
  // 整张卡
  { id: "full", rect: { x: 0, y: 0, width: 1, height: 1 }, weight: 0.9 },
  // 中心区域：对边缘裁切差异最不敏感
  { id: "center", rect: { x: 0.15, y: 0.15, width: 0.7, height: 0.7 }, weight: 0.95 },
];
