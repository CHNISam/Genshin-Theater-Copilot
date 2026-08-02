/**
 * 角色库 = 官方事实层 + 人工机制标注层。
 *
 * - 事实层 official.json：全量角色的名字、元素、稀有度、武器、图标名。
 *   由 `npm run data:characters` 从官方索引生成，新角色上线重跑即可。
 * - 判断层 curated.ts：附着频率、治疗范围、控制强度、输出档位、刚需队友。
 *
 * 没有标注的角色：给一个**保守**的能力集（低频挂本元素、低输出）。
 * 这样它们可以被识别、可以进队填位，但永远无法满足高频附着、治疗、控制之类的
 * 硬机制需求——宁可少推荐，也不能假装我们知道它能做什么。
 */
import type { CharacterBase } from "../../domain/types";
import officialFile from "./official.json";
import { CURATED, type CuratedCharacter } from "./curated";

export interface OfficialCharacter {
  id: string;
  name: string;
  element: CharacterBase["element"];
  rarity: 4 | 5;
  weaponType: string;
  iconName: string;
}

const official = (officialFile as { characters: OfficialCharacter[] }).characters;
const curatedByName = new Map<string, CuratedCharacter>(CURATED.map((c) => [c.name, c]));

/** 未标注角色的保守能力：只提供低频本元素挂载。 */
function fallbackCapabilities(element: CharacterBase["element"]): CharacterBase["capabilities"] {
  return [
    {
      type: "element-application",
      element,
      strength: 2,
      frequency: "low",
      note: "未标注机制，按最保守估计",
    },
  ];
}

function build(): CharacterBase[] {
  const out: CharacterBase[] = [];
  const usedIds = new Set<string>();

  for (const fact of official) {
    const curated = curatedByName.get(fact.name);
    const id = curated?.id ?? fact.id;
    if (usedIds.has(id)) continue;
    usedIds.add(id);

    out.push({
      id,
      name: fact.name,
      element: fact.element,
      weaponType: fact.weaponType,
      rarity: fact.rarity,
      roles: curated?.roles ?? ["sub-dps"],
      baseDamage: curated?.baseDamage ?? (fact.rarity === 5 ? 4 : 2.5),
      capabilities: curated?.capabilities ?? fallbackCapabilities(fact.element),
      ...(curated?.teammateNeeds ? { teammateNeeds: curated.teammateNeeds } : {}),
      tags: [...(curated?.tags ?? []), curated ? "curated" : "uncurated"],
    });
  }

  // 官方索引里还没有的角色（例如刚公布、数据未收录），保留人工条目
  for (const curated of CURATED) {
    if (out.some((c) => c.name === curated.name)) continue;
    out.push({
      id: curated.id,
      name: curated.name,
      element: "cryo",
      weaponType: "unknown",
      rarity: 5,
      roles: curated.roles,
      baseDamage: curated.baseDamage,
      capabilities: curated.capabilities,
      ...(curated.teammateNeeds ? { teammateNeeds: curated.teammateNeeds } : {}),
      tags: [...(curated.tags ?? []), "curated", "not-in-official-index"],
    });
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export const CHARACTERS: CharacterBase[] = build();

export const CHARACTER_BY_ID: ReadonlyMap<string, CharacterBase> = new Map(
  CHARACTERS.map((c) => [c.id, c]),
);

export function getCharacter(id: string): CharacterBase | undefined {
  return CHARACTER_BY_ID.get(id);
}

/** 是否有人工机制标注。没有的角色不会被当作硬机制的解。 */
export function isCurated(character: CharacterBase): boolean {
  return character.tags?.includes("curated") ?? false;
}

export const CURATED_COUNT = CHARACTERS.filter(isCurated).length;

export { CURATED };
