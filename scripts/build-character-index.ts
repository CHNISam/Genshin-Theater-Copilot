/**
 * npm run data:characters
 *
 * 从官方角色索引生成**全量**角色事实表（id / 名字 / 元素 / 稀有度 / 武器）。
 *
 * 边界：这里只生成**客观事实**。角色的机制能力（附着频率、治疗范围、控制强度、
 * 输出档位）属于judgment，无法从索引里推出来，放在 curated.ts 里人工维护。
 * 没有人工标注的角色仍然可以被识别和选入队伍，但不会被当作任何硬机制的解——
 * 这一点必须在界面上明说，不能假装我们懂每个角色。
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Element } from "../src/domain/types";
import { ROOT } from "./lib";

const UA = "TheaterPilot/0.1 (+https://github.com/CHNISam/Imaginarium-Theater-pilot)";
const CHAR_INDEX =
  "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json";
const LOC_INDEX = "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/loc.json";

const ELEMENT_MAP: Record<string, Element> = {
  Fire: "pyro",
  Water: "hydro",
  Electric: "electro",
  Ice: "cryo",
  Wind: "anemo",
  Rock: "geo",
  Grass: "dendro",
};

const WEAPON_MAP: Record<string, string> = {
  WEAPON_SWORD_ONE_HAND: "sword",
  WEAPON_CLAYMORE: "claymore",
  WEAPON_POLE: "polearm",
  WEAPON_BOW: "bow",
  WEAPON_CATALYST: "catalyst",
};

interface EnkaCharacter {
  Element?: string;
  NameTextMapHash: number | string;
  SideIconName: string;
  QualityType?: string;
  WeaponType?: string;
}

export interface OfficialCharacter {
  id: string;
  name: string;
  element: Element;
  rarity: 4 | 5;
  weaponType: string;
  iconName: string;
}

/** UI_AvatarIcon_Side_Ayaka → ayaka；驼峰转短横线，保证 id 稳定可读。 */
export function idFromIconName(sideIconName: string): string {
  const raw = sideIconName.replace("UI_AvatarIcon_Side_", "");
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function main(): Promise<void> {
  console.log("→ 拉取官方角色索引…");
  const [index, loc] = await Promise.all([
    fetchJson<Record<string, EnkaCharacter>>(CHAR_INDEX),
    fetchJson<Record<string, Record<string, string>>>(LOC_INDEX),
  ]);
  const zh = loc["zh-cn"] ?? {};

  const out: OfficialCharacter[] = [];
  const seen = new Set<string>();
  const skipped: string[] = [];

  for (const entry of Object.values(index)) {
    const name = zh[String(entry.NameTextMapHash)];
    const element = entry.Element ? ELEMENT_MAP[entry.Element] : undefined;
    if (!name || !element || !entry.SideIconName) {
      if (entry.SideIconName) skipped.push(entry.SideIconName);
      continue;
    }
    const id = idFromIconName(entry.SideIconName);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      element,
      rarity: entry.QualityType === "QUALITY_PURPLE" ? 4 : 5,
      weaponType: (entry.WeaponType && WEAPON_MAP[entry.WeaponType]) ?? "unknown",
      iconName: entry.SideIconName.replace("_Side", ""),
    });
  }

  out.sort((a, b) => a.id.localeCompare(b.id));

  const file = {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    source: "EnkaNetwork/API-docs 角色索引（官方数据挖掘），只取客观事实",
    note: "机制能力与输出档位不在这里，见 src/data/characters/curated.ts",
    characters: out,
  };

  const path = resolve(ROOT, "src/data/characters/official.json");
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  console.log(`✓ 写出 ${out.length} 名角色：${path}`);
  if (skipped.length > 0) {
    console.log(`  （跳过 ${skipped.length} 条无元素/无名字的条目，多为旅行者分身或占位）`);
  }
}

await main();
