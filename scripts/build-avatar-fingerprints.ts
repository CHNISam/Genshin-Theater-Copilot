/**
 * npm run vision:fingerprints
 *
 * 下载官方角色图标 → 计算感知哈希 → 只把哈希写进仓库。
 *
 * 重要边界：**仓库里不保存任何官方图片素材**。
 * 每个角色只落地 3 个 64 bit 哈希（共 24 字节），无法还原美术资源，
 * 但足以在用户自己的截图上做匹配。图标只在构建时临时下载，用完即弃。
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { CHARACTERS } from "../src/data/characters";
import { dHash } from "../src/importers/vision/hash";
import { cropImage, type RgbaImage } from "../src/importers/vision/image";
import { FINGERPRINT_VARIANTS } from "../src/importers/vision/variants";
import { ROOT, parseArgs } from "./lib";

const UA = "TheaterPilot/0.1 (+https://github.com/CHNISam/Imaginarium-Theater-pilot)";
const CHAR_INDEX = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json";
const LOC_INDEX = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/loc.json";
const ICON_BASE = "https://enka.network/ui/";

/** 稀有度底色近似值：游戏内卡片会把图标叠在这个底色上。 */
const RARITY_BG: Record<4 | 5, [number, number, number]> = {
  5: [190, 116, 62],
  4: [122, 92, 164],
};

interface EnkaCharacter {
  NameTextMapHash: number | string;
  SideIconName: string;
  QualityType?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

function decodePng(buffer: Buffer): RgbaImage {
  const png = PNG.sync.read(buffer);
  return {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data),
  };
}

/** 把透明底图标合成到稀有度底色上，使其接近游戏内卡片。 */
function compositeOnRarity(image: RgbaImage, rarity: 4 | 5): RgbaImage {
  const bg = RARITY_BG[rarity];
  const data = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < image.data.length; i += 4) {
    const a = (image.data[i + 3] ?? 0) / 255;
    for (let c = 0; c < 3; c += 1) {
      data[i + c] = Math.round((image.data[i + c] ?? 0) * a + (bg[c] as number) * (1 - a));
    }
    data[i + 3] = 255;
  }
  return { width: image.width, height: image.height, data };
}

export interface FingerprintEntry {
  characterId: string;
  name: string;
  iconName: string;
  rarity: 4 | 5;
  /** variantId -> 64bit dHash（十六进制）。 */
  hashes: Record<string, string>;
}

export interface FingerprintFile {
  version: 1;
  generatedAt: string;
  source: string;
  note: string;
  entries: FingerprintEntry[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const only = typeof args.only === "string" ? new Set(args.only.split(",")) : undefined;

  console.log("→ 拉取角色索引…");
  const [index, loc] = await Promise.all([
    fetchJson<Record<string, EnkaCharacter>>(CHAR_INDEX),
    fetchJson<Record<string, Record<string, string>>>(LOC_INDEX),
  ]);
  const zh = loc["zh-cn"] ?? {};

  const byName = new Map<string, EnkaCharacter>();
  for (const entry of Object.values(index)) {
    const name = zh[String(entry.NameTextMapHash)];
    if (name) byName.set(name, entry);
  }

  const entries: FingerprintEntry[] = [];
  const missing: string[] = [];

  for (const character of CHARACTERS) {
    if (only && !only.has(character.id)) continue;
    const meta = byName.get(character.name);
    if (!meta) {
      missing.push(character.name);
      continue;
    }
    const iconName = meta.SideIconName.replace("_Side", "");
    const url = `${ICON_BASE}${iconName}.png`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) {
        missing.push(`${character.name}（${iconName} HTTP ${res.status}）`);
        continue;
      }
      const raw = decodePng(Buffer.from(await res.arrayBuffer()));
      const composed = compositeOnRarity(raw, character.rarity);
      const hashes: Record<string, string> = {};
      for (const variant of FINGERPRINT_VARIANTS) {
        hashes[variant.id] = dHash(
          cropImage(composed, {
            x: composed.width * variant.rect.x,
            y: composed.height * variant.rect.y,
            width: composed.width * variant.rect.width,
            height: composed.height * variant.rect.height,
          }),
        );
      }
      entries.push({
        characterId: character.id,
        name: character.name,
        iconName,
        rarity: character.rarity,
        hashes,
      });
      process.stdout.write(".");
    } catch (error) {
      missing.push(`${character.name}（${(error as Error).message}）`);
    }
  }
  process.stdout.write("\n");

  const file: FingerprintFile = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "enka.network UI assets + EnkaNetwork/API-docs 角色索引",
    note:
      "只保存 64bit 感知哈希，不保存任何官方图片素材。重新生成：npm run vision:fingerprints",
    entries: entries.sort((a, b) => a.characterId.localeCompare(b.characterId)),
  };

  const out = resolve(ROOT, "src/data/characters/fingerprints.json");
  writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`✓ 写出 ${entries.length} 个角色指纹：${out}`);
  if (missing.length > 0) {
    console.warn(`! 以下角色没有取到官方图标，将退回用户手动标注一次：`);
    for (const m of missing) console.warn(`   - ${m}`);
  }
}

await main();
