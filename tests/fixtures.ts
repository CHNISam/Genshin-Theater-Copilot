/**
 * 测试夹具。
 *
 * 规则类测试一律使用**合成角色**（generic-a / generic-b …），
 * 以确保求解器不依赖任何具体角色。只有验证真实赛季包的测试才使用真实数据。
 */
import type {
  CharacterBase,
  MechanicCapability,
  RunState,
  Roster,
  SeasonConfig,
  StageConfig,
  UserCharacter,
} from "../src/domain/types";
import type { TeamMember } from "../src/solver/roster";
import { effectivePower } from "../src/solver/roster";

let counter = 0;

export function char(partial: Partial<CharacterBase> & { id?: string }): CharacterBase {
  counter += 1;
  const id = partial.id ?? `generic-${counter}`;
  return {
    id,
    name: partial.name ?? id,
    element: partial.element ?? "cryo",
    weaponType: partial.weaponType ?? "sword",
    rarity: partial.rarity ?? 4,
    roles: partial.roles ?? ["sub-dps"],
    baseDamage: partial.baseDamage ?? 4,
    capabilities: partial.capabilities ?? [],
    ...(partial.teammateNeeds ? { teammateNeeds: partial.teammateNeeds } : {}),
    ...(partial.tags ? { tags: partial.tags } : {}),
  };
}

export function apply(
  element: CharacterBase["element"],
  frequency: MechanicCapability["frequency"],
  strength = 4,
): MechanicCapability {
  return { type: "element-application", element, strength, frequency };
}

export function heal(
  scope: "party-wide" | "active-character",
  strength = 4,
): MechanicCapability {
  return { type: "healing", scope, strength };
}

export function stage(partial: Partial<StageConfig> & { id: string; order: number }): StageConfig {
  return {
    name: partial.name ?? partial.id,
    type: partial.type ?? "normal",
    fixed: partial.fixed ?? false,
    enemyIds: partial.enemyIds ?? [],
    hardRequirements: partial.hardRequirements ?? [],
    softRecommendations: partial.softRecommendations ?? [],
    damagePressure: partial.damagePressure ?? 2,
    survivalPressure: partial.survivalPressure ?? 1,
    controlValue: partial.controlValue ?? 1,
    sourceRecords: partial.sourceRecords ?? [
      {
        title: "测试夹具",
        sourceType: "user-observed",
        accessedAt: "2026-08-02",
        confidence: "medium",
      },
    ],
    confidence: partial.confidence ?? "high",
    ...partial,
  };
}

export function season(
  stages: StageConfig[],
  partial: Partial<SeasonConfig> = {},
): SeasonConfig {
  return {
    id: partial.id ?? "test-season",
    name: partial.name ?? "测试赛季",
    startsAt: partial.startsAt ?? "2026-08-01T00:00:00+08:00",
    endsAt: partial.endsAt ?? "2026-08-31T00:00:00+08:00",
    status: partial.status ?? "published",
    allowedElements: partial.allowedElements ?? ["hydro", "electro", "cryo"],
    openingCharacterIds: partial.openingCharacterIds ?? [],
    specialGuestIds: partial.specialGuestIds ?? [],
    buffs: partial.buffs ?? [],
    stages,
    bosses: partial.bosses ?? [],
    ruleOverrides: {
      defaultVigor: 2,
      supportedDifficulties: ["moonlit"],
      teamSize: 4,
      mainActCount: stages.filter((s) => s.type !== "tablet").length,
      tabletChallengeCount: stages.filter((s) => s.type === "tablet").length,
      bossActOrders: stages.filter((s) => s.type === "boss").map((s) => s.order),
      supportGuestCountsForEntry: false,
      initialRefreshes: 3,
      ...partial.ruleOverrides,
    },
    sourceRecords: partial.sourceRecords ?? [],
    unresolvedQuestions: partial.unresolvedQuestions ?? [],
    dataVersion: partial.dataVersion ?? 1,
    generatedAt: partial.generatedAt ?? "2026-08-01T00:00:00+08:00",
  };
}

export function member(
  base: CharacterBase,
  tier: UserCharacter["tier"] = "core",
): TeamMember {
  const user: UserCharacter = { characterId: base.id, tier };
  return {
    base,
    user,
    power: effectivePower(base, user),
    specialGuest: false,
    supportGuest: false,
  };
}

export function rosterOf(
  bases: CharacterBase[],
  tier: UserCharacter["tier"] = "core",
): Roster {
  return { characters: bases.map((b) => ({ characterId: b.id, tier })) };
}

export function characterMap(bases: CharacterBase[]): ReadonlyMap<string, CharacterBase> {
  return new Map(bases.map((b) => [b.id, b]));
}

export function runState(
  seasonConfig: SeasonConfig,
  bases: CharacterBase[],
  partial: Partial<RunState> = {},
): RunState {
  const vigor: Record<string, number> = {};
  for (const b of bases) vigor[b.id] = seasonConfig.ruleOverrides.defaultVigor;
  const first = [...seasonConfig.stages].sort((a, b) => a.order - b.order)[0];
  return {
    seasonId: seasonConfig.id,
    objective: { difficulty: "moonlit", tablets: true, stars: false },
    currentStageId: first?.id ?? "",
    completedStageIds: [],
    unlockedCharacterIds: bases.map((b) => b.id),
    standbyCharacterIds: [],
    vigor,
    blossoms: 3,
    refreshesRemaining: 3,
    buffLevels: {},
    buffBranchChoices: {},
    stageOverrides: {},
    eventCandidates: [],
    releasedReservations: [],
    ...partial,
    ...(partial.vigor ? { vigor: { ...vigor, ...partial.vigor } } : {}),
  };
}

/** 一批填位用的低价值角色，保证总能凑满 4 人。 */
export function fillers(count: number, element: CharacterBase["element"] = "cryo"): CharacterBase[] {
  return Array.from({ length: count }, (_, i) =>
    char({
      id: `filler-${element}-${i}`,
      name: `挂件${element}${i}`,
      element,
      baseDamage: 1,
      capabilities: [apply(element, "low", 2)],
    }),
  );
}
