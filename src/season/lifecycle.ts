/**
 * 赛季发布流程：draft → validate → review → published → archived。
 * 研究结果不得未经校验直接进入生产配置。
 */
import type { SeasonConfig, SeasonStatus } from "../domain/types";
import { validateSeason, type ValidateOptions, type ValidationResult } from "./validate";

export interface SeasonDiff {
  addedCharacters: string[];
  removedCharacters: string[];
  addedBuffs: string[];
  removedBuffs: string[];
  changedBuffs: { id: string; changes: string[] }[];
  addedStages: string[];
  removedStages: string[];
  changedStages: { id: string; changes: string[] }[];
  bossChanges: string[];
  lowConfidenceItems: string[];
  /** 可能影响求解器结论的重大变化。 */
  solverImpacting: string[];
}

function reqKey(r: unknown): string {
  return JSON.stringify(r);
}

export function diffSeasons(prev: SeasonConfig | undefined, next: SeasonConfig): SeasonDiff {
  const diff: SeasonDiff = {
    addedCharacters: [],
    removedCharacters: [],
    addedBuffs: [],
    removedBuffs: [],
    changedBuffs: [],
    addedStages: [],
    removedStages: [],
    changedStages: [],
    bossChanges: [],
    lowConfidenceItems: [],
    solverImpacting: [],
  };

  const nextChars = [...next.openingCharacterIds, ...next.specialGuestIds];
  const prevChars = prev ? [...prev.openingCharacterIds, ...prev.specialGuestIds] : [];
  diff.addedCharacters = nextChars.filter((c) => !prevChars.includes(c));
  diff.removedCharacters = prevChars.filter((c) => !nextChars.includes(c));

  const prevBuffs = new Map((prev?.buffs ?? []).map((b) => [b.id, b]));
  for (const buff of next.buffs) {
    const before = prevBuffs.get(buff.id);
    if (!before) {
      diff.addedBuffs.push(buff.id);
      continue;
    }
    const changes: string[] = [];
    if (before.reactionId !== buff.reactionId) {
      changes.push(`反应类别 ${before.reactionId} → ${buff.reactionId}`);
    }
    for (const level of buff.levels) {
      const prevLevel = before.levels.find((l) => l.level === level.level);
      if (!prevLevel) {
        changes.push(`新增 ${level.level} 级效果`);
      } else if (JSON.stringify(prevLevel.value) !== JSON.stringify(level.value)) {
        changes.push(`${level.level} 级效果数值变化`);
      } else if (prevLevel.cost !== level.cost) {
        changes.push(`${level.level} 级费用 ${prevLevel.cost} → ${level.cost}`);
      }
    }
    if (changes.length > 0) diff.changedBuffs.push({ id: buff.id, changes });
    prevBuffs.delete(buff.id);
  }
  diff.removedBuffs = [...prevBuffs.keys()];

  const prevStages = new Map((prev?.stages ?? []).map((s) => [s.id, s]));
  for (const stage of next.stages) {
    const before = prevStages.get(stage.id);
    if (!before) {
      diff.addedStages.push(stage.id);
      if (stage.hardRequirements.length > 0) {
        diff.solverImpacting.push(`新增带硬机制的关卡 ${stage.name}`);
      }
    } else {
      const changes: string[] = [];
      if (before.type !== stage.type) changes.push(`类型 ${before.type} → ${stage.type}`);
      const beforeReqs = before.hardRequirements.map(reqKey).sort();
      const nextReqs = stage.hardRequirements.map(reqKey).sort();
      if (JSON.stringify(beforeReqs) !== JSON.stringify(nextReqs)) {
        changes.push("硬机制变化");
        diff.solverImpacting.push(`${stage.name} 的硬机制发生变化，会改变角色预留结论`);
      }
      if (before.survivalPressure !== stage.survivalPressure) {
        changes.push(`生存压力 ${before.survivalPressure} → ${stage.survivalPressure}`);
      }
      if (before.damagePressure !== stage.damagePressure) {
        changes.push(`伤害压力 ${before.damagePressure} → ${stage.damagePressure}`);
      }
      if (changes.length > 0) diff.changedStages.push({ id: stage.id, changes });
      prevStages.delete(stage.id);
    }
    if (stage.confidence === "low" || stage.confidence === "medium") {
      if (stage.hardRequirements.length > 0) {
        diff.lowConfidenceItems.push(`${stage.name} 的硬机制可信度为 ${stage.confidence}`);
      }
    }
  }
  diff.removedStages = [...prevStages.keys()];

  const prevBosses = new Map((prev?.bosses ?? []).map((b) => [b.id, b]));
  for (const boss of next.bosses) {
    const before = prevBosses.get(boss.id);
    if (!before) {
      diff.bossChanges.push(`新增首领 ${boss.name}`);
      continue;
    }
    if (
      JSON.stringify(before.hardMechanics.map(reqKey).sort()) !==
      JSON.stringify(boss.hardMechanics.map(reqKey).sort())
    ) {
      diff.bossChanges.push(`首领 ${boss.name} 的硬机制发生变化`);
      diff.solverImpacting.push(`首领 ${boss.name} 机制变化`);
    }
    prevBosses.delete(boss.id);
  }
  for (const removed of prevBosses.values()) diff.bossChanges.push(`移除首领 ${removed.name}`);

  for (const buff of next.buffs) {
    if (buff.confidence === "low") {
      diff.lowConfidenceItems.push(`祝福 ${buff.name} 可信度为 low`);
    }
  }

  return diff;
}

export interface TransitionResult {
  ok: boolean;
  season?: SeasonConfig;
  reason?: string;
  validation?: ValidationResult;
}

const ALLOWED: Record<SeasonStatus, SeasonStatus[]> = {
  draft: ["review"],
  review: ["published", "draft"],
  published: ["archived"],
  archived: [],
};

/** 状态迁移。进入 published 前强制重新校验。 */
export function transitionSeason(
  season: SeasonConfig,
  target: SeasonStatus,
  options: ValidateOptions = {},
): TransitionResult {
  if (!ALLOWED[season.status].includes(target)) {
    return {
      ok: false,
      reason: `不允许的状态迁移：${season.status} → ${target}`,
    };
  }

  if (target === "published") {
    const validation = validateSeason(season, options);
    if (!validation.canPublish) {
      return {
        ok: false,
        reason: validation.ok
          ? "存在阻塞发布的未解决问题，必须先人工审核"
          : "赛季数据未通过校验",
        validation,
      };
    }
    return {
      ok: true,
      season: { ...season, status: "published", reviewedAt: new Date().toISOString() },
      validation,
    };
  }

  return { ok: true, season: { ...season, status: target } };
}
