/**
 * 用户角色池 → 求解器可用的条目。
 * 只做客观换算，不做任何策略判断。
 */
import type {
  CharacterBase,
  Roster,
  RunState,
  SeasonConfig,
  UserCharacter,
} from "../domain/types";
import { TIER_MULTIPLIER } from "../domain/types";

export interface TeamMember {
  base: CharacterBase;
  user: UserCharacter;
  /** 参考练度换算后的输出档位，0~10+。 */
  power: number;
  /** 是否为本期特邀角色（祝福等级属性增益翻倍）。 */
  specialGuest: boolean;
  /** 是否为助演角色。 */
  supportGuest: boolean;
}

const WEAPON_BONUS = { signature: 1.12, good: 1.0, basic: 0.88 } as const;

export function effectivePower(base: CharacterBase, user: UserCharacter): number {
  let power = base.baseDamage * TIER_MULTIPLIER[user.tier];
  if (user.weaponQuality) power *= WEAPON_BONUS[user.weaponQuality];
  if (user.constellation !== undefined) {
    power *= 1 + Math.min(user.constellation, 6) * 0.05;
  }
  return Math.round(power * 100) / 100;
}

export interface BuildRosterOptions {
  season: SeasonConfig;
  roster: Roster;
  characters: ReadonlyMap<string, CharacterBase>;
  /** 是否按赛季限制元素过滤。默认 true。 */
  filterByElement?: boolean;
}

/** 构建本期可用的角色条目（已按限制元素过滤，含助演与特邀）。 */
export function buildRoster(options: BuildRosterOptions): TeamMember[] {
  const { season, roster, characters } = options;
  const filterByElement = options.filterByElement ?? true;
  const allowed = new Set(season.allowedElements);
  const specialGuests = new Set(season.specialGuestIds);

  const out: TeamMember[] = [];
  for (const user of roster.characters) {
    if (user.tier === "unused") continue;
    const base = characters.get(user.characterId);
    if (!base) continue;
    const isSpecialGuest = specialGuests.has(base.id);
    const isSupportGuest = roster.supportGuestId === base.id;
    if (filterByElement && !allowed.has(base.element) && !isSpecialGuest) continue;
    out.push({
      base,
      user,
      power: effectivePower(base, user),
      specialGuest: isSpecialGuest,
      supportGuest: isSupportGuest,
    });
  }
  return out.sort((a, b) => b.power - a.power);
}

/** 当前可出战：已解锁且仍有耐力。 */
export function availableMembers(members: TeamMember[], state: RunState): TeamMember[] {
  const unlocked = new Set(state.unlockedCharacterIds);
  return members.filter(
    (m) => unlocked.has(m.base.id) && (state.vigor[m.base.id] ?? 0) > 0,
  );
}

/** 初始化耐力表。 */
export function initialVigor(
  members: TeamMember[],
  season: SeasonConfig,
  overrides: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of members) {
    out[m.base.id] = overrides[m.base.id] ?? season.ruleOverrides.defaultVigor;
  }
  return out;
}

export function totalRemainingVigor(
  members: TeamMember[],
  state: RunState,
): number {
  const unlocked = new Set(state.unlockedCharacterIds);
  return members
    .filter((m) => unlocked.has(m.base.id))
    .reduce((sum, m) => sum + Math.max(0, state.vigor[m.base.id] ?? 0), 0);
}
