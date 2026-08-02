/**
 * 队伍生成与评分。
 *
 * 评分顺序严格遵循：
 *   关卡硬机制可解 → 生存条件满足 → 队伍体系运转 → 稀缺资源消耗合理 → 祝福收益 → 单场输出
 * 前两项是**过滤器**（不满足直接淘汰），后四项才进入加权评分。
 */
import type { BuffConfig, RunObjective, SeasonConfig, StageConfig } from "../domain/types";
import { RATE_RANK } from "../domain/types";
import type { TeamMember } from "./roster";
import {
  capabilityFactor,
  checkRequirement,
  describeRequirement,
  reactionSupported,
  utilityScale,
  type MechanicCheck,
} from "./mechanics";

export interface TeamScoreBreakdown {
  mechanic: number;
  survival: number;
  coherence: number;
  scarcity: number;
  buff: number;
  damage: number;
  control: number;
}

export interface TeamEvaluation {
  memberIds: string[];
  members: TeamMember[];
  feasible: boolean;
  mechanicChecks: MechanicCheck[];
  /** 淘汰原因。feasible 为 false 时非空。 */
  rejections: string[];
  scores: TeamScoreBreakdown;
  total: number;
  explanation: string[];
}

export interface StageWeights {
  survival: number;
  coherence: number;
  scarcity: number;
  buff: number;
  damage: number;
  control: number;
  mechanic: number;
}

/** 关卡类型决定权重结构：守护关提高控制与生存，降低纯输出。 */
export function weightsForStage(stage: StageConfig): StageWeights {
  const base: StageWeights = {
    mechanic: 40,
    survival: 120,
    coherence: 90,
    scarcity: 70,
    buff: 25,
    damage: 20,
    control: 10,
  };
  switch (stage.type) {
    case "defense":
      return { ...base, control: 55, damage: 8, survival: 140 };
    case "survival":
      return { ...base, control: 30, damage: 6, survival: 160 };
    case "boss":
      return { ...base, damage: 26 };
    case "tablet":
      return { ...base, survival: 140, damage: 14 };
    default:
      return base;
  }
}

export interface TeamContext {
  season: SeasonConfig;
  stage: StageConfig;
  buffLevels: Record<string, number>;
  /** characterId -> 消耗一点耐力的稀缺代价（0~1+）。由 reservations 模块提供。 */
  scarcityCost?: Record<string, number>;
  /** 忽略生存与输出门槛（用于诊断"为什么都不可行"）。 */
  ignoreSoftGates?: boolean;
  /** 本局目标。影响输出要求与是否惩罚过剩。 */
  objective?: RunObjective;
}

/**
 * 追满星章时，每幕的明星挑战通常附带速度或输出条件，
 * 因此提高输出要求、并且不再把"过剩"当成浪费。
 */
export function damageMultiplierFor(objective: RunObjective | undefined): number {
  return objective?.goal === "full-stars" ? 1.3 : 1;
}

export function penalizeOverkill(objective: RunObjective | undefined): boolean {
  return objective?.goal !== "full-stars";
}

/* ------------------------------------------------------------------ */

export function teamSurvivalStrength(team: TeamMember[]): number {
  let shield = 0;
  let partyHeal = 0;
  let singleHeal = 0;
  let mitigation = 0;
  let selfSustain = 0;
  for (const member of team) {
    const scale = utilityScale(member.user.tier);
    for (const cap of member.base.capabilities) {
      const factor = capabilityFactor(team, member, cap);
      if (factor <= 0) continue;
      const v = cap.strength * scale * factor;
      if (cap.type === "shield") shield = Math.max(shield, v);
      else if (cap.type === "healing" && cap.scope === "party-wide") partyHeal += v;
      else if (cap.type === "healing") {
        singleHeal = Math.max(singleHeal, v);
        selfSustain = Math.max(selfSustain, v * 0.8);
      } else if (cap.type === "damage-reduction" || cap.type === "interrupt-resistance") {
        mitigation = Math.max(mitigation, v * 0.6);
      }
    }
  }
  return Math.max(shield, partyHeal, singleHeal * 0.8, selfSustain, mitigation);
}

/** 体系运转程度：刚需队友是否到位。0~1。 */
export function teamCoherence(team: TeamMember[]): { value: number; notes: string[] } {
  const notes: string[] = [];
  let weighted = 0;
  let weightSum = 0;
  for (const member of team) {
    const weight = Math.max(0.3, member.power);
    let factor = 1;
    for (const need of member.base.teammateNeeds ?? []) {
      const met = capabilityFactor(team, member, {
        type: "custom",
        mechanicId: "__need__",
        strength: 1,
        conditions: [need],
      });
      if (met < 1) {
        factor = Math.min(factor, need.degradedTo);
        notes.push(`${member.base.name} 缺少${describeNeed(need)}，体系降级至 ${Math.round(need.degradedTo * 100)}%`);
      }
    }
    weighted += weight * factor;
    weightSum += weight;
  }
  return { value: weightSum === 0 ? 1 : weighted / weightSum, notes };
}

function describeNeed(need: { type: string; element?: string; role?: string; characterId?: string }): string {
  if (need.type === "requires-element") return `${need.element} 系队友`;
  if (need.type === "requires-role") return `${need.role} 定位队友`;
  return `队友 ${need.characterId}`;
}

/** 队伍等效输出。主 C 权重最高，挂件贡献很小。 */
export function teamDamage(team: TeamMember[], coherence: number): number {
  const powers = team.map((m) => m.power).sort((a, b) => b - a);
  const primary = powers[0] ?? 0;
  const secondary = powers[1] ?? 0;
  const rest = powers.slice(2).reduce((s, p) => s + p, 0);
  return (primary + secondary * 0.45 + rest * 0.15) * (0.4 + 0.6 * coherence);
}

export function teamControl(team: TeamMember[]): number {
  let total = 0;
  for (const member of team) {
    const scale = utilityScale(member.user.tier);
    for (const cap of member.base.capabilities) {
      if (cap.type === "control" || cap.type === "grouping") total += cap.strength * scale;
    }
  }
  return total;
}

/** 已投资祝福在本队的实际收益。未触发的反应不计分。 */
export function teamBuffValue(
  team: TeamMember[],
  buffs: BuffConfig[],
  buffLevels: Record<string, number>,
): { value: number; triggered: string[] } {
  let value = 0;
  const triggered: string[] = [];
  for (const buff of buffs) {
    const level = buffLevels[buff.id] ?? 0;
    if (level <= 0) continue;
    const effect = buff.levels.find((l) => l.level === level);
    if (!effect) continue;
    const support = reactionSupported(team, buff.reactionId, "medium");
    if (!support.satisfied) continue;
    triggered.push(`${buff.name} Lv${level}`);
    const guestBonus = team.some((m) => m.specialGuest) ? 1.15 : 1;
    value +=
      (effect.value.damageValue + effect.value.mechanicValue + effect.value.controlValue) *
      guestBonus;
  }
  return { value, triggered };
}

/* ------------------------------------------------------------------ */

export function evaluateTeam(team: TeamMember[], ctx: TeamContext): TeamEvaluation {
  const { stage } = ctx;
  const weights = weightsForStage(stage);
  const rejections: string[] = [];
  const explanation: string[] = [];

  /* 1) 硬机制：不满足直接淘汰 */
  const mechanicChecks = stage.hardRequirements.map((req) => checkRequirement(team, req));
  for (const check of mechanicChecks) {
    if (!check.satisfied) {
      rejections.push(`未满足硬机制「${describeRequirement(check.requirement)}」：${check.detail}`);
    } else {
      explanation.push(`满足硬机制「${describeRequirement(check.requirement)}」：${check.detail}`);
    }
  }

  /* 2) 生存条件 */
  const survival = teamSurvivalStrength(team);
  const survivalNeed = stage.survivalPressure;
  if (!ctx.ignoreSoftGates && survivalNeed >= 3 && survival < survivalNeed - 1.5) {
    rejections.push(
      `生存不足：本关生存压力 ${survivalNeed}，队伍生存能力仅 ${survival.toFixed(1)}`,
    );
  }

  /* 3) 体系运转 */
  const coherence = teamCoherence(team);
  explanation.push(...coherence.notes);

  /* 4) 输出 */
  const damage = teamDamage(team, coherence.value);
  const damageNeed = stage.damagePressure * 2.2 * damageMultiplierFor(ctx.objective);
  if (!ctx.ignoreSoftGates && damageNeed > 0 && damage < damageNeed * 0.4) {
    rejections.push(
      `输出严重不足：本关伤害压力 ${stage.damagePressure}，队伍等效输出仅 ${damage.toFixed(1)}`,
    );
  }

  /* 5) 软性推荐 */
  let softScore = 0;
  for (const rec of stage.softRecommendations) {
    const check = checkRequirement(team, rec.requirement);
    if (check.satisfied) {
      softScore += rec.weight;
      explanation.push(`加分：${rec.reason}`);
    }
  }
  const mechanicMargin = mechanicChecks.reduce(
    (sum, c) => sum + Math.max(0, Math.min(2, c.margin)) * 0.25,
    0,
  );

  /* 6) 稀缺代价 */
  const scarcity = team.reduce(
    (sum, m) => sum + (ctx.scarcityCost?.[m.base.id] ?? 0),
    0,
  );

  /* 7) 祝福 */
  const buff = teamBuffValue(team, ctx.season.buffs, ctx.buffLevels);
  if (buff.triggered.length > 0) explanation.push(`可触发已投资祝福：${buff.triggered.join("、")}`);

  const control = teamControl(team);

  /*
   * 8) 过剩惩罚。
   * "普通幕能用一个核心带三个挂件解决，就不要使用两个核心。"
   * 输出与生存都只需要满足本关要求；超出部分不产生额外价值，
   * 却会把本可以留给后面的资产消耗掉。因此对明显的过剩扣分。
   */
  const damageRatio = damageNeed === 0 ? 1 : damage / damageNeed;
  const overkillEnabled = penalizeOverkill(ctx.objective);
  const damageOverkill = overkillEnabled ? Math.max(0, damageRatio - 1.2) : 0;
  const survivalOverkill =
    !overkillEnabled || survivalNeed === 0
      ? 0
      : Math.max(0, survival / Math.max(1, survivalNeed) - 1.5);
  if (damageOverkill > 0.3) {
    explanation.push(
      `本关伤害压力仅 ${stage.damagePressure}，该队等效输出 ${damage.toFixed(
        1,
      )} 已明显过剩，多余的强度会白白消耗后面还要用的角色。`,
    );
  }

  const scores: TeamScoreBreakdown = {
    mechanic: softScore + mechanicMargin,
    survival: Math.min(1, survivalNeed === 0 ? 1 : survival / Math.max(1, survivalNeed)),
    coherence: coherence.value,
    scarcity: scarcity + damageOverkill * 0.5 + survivalOverkill * 0.15,
    buff: buff.value / 10,
    damage:
      damageNeed === 0
        ? Math.min(1, damage / 12)
        : Math.min(overkillEnabled ? 1.2 : 2, damageRatio),
    control: Math.min(1.5, control / 6),
  };

  const total =
    scores.mechanic * weights.mechanic +
    scores.survival * weights.survival +
    scores.coherence * weights.coherence +
    scores.buff * weights.buff +
    scores.damage * weights.damage +
    scores.control * weights.control * (stage.controlValue / 3 || 0.3) -
    scores.scarcity * weights.scarcity;

  return {
    memberIds: team.map((m) => m.base.id),
    members: team,
    feasible: rejections.length === 0,
    mechanicChecks,
    rejections,
    scores,
    total: Math.round(total * 100) / 100,
    explanation,
  };
}

/* ------------------------------------------------------------------ */

export interface GenerateOptions {
  /** 队伍人数，默认取赛季规则。 */
  teamSize?: number;
  /** 参与枚举的候选池上限，避免组合爆炸。 */
  poolLimit?: number;
  /** 返回的可行队伍数量上限。 */
  limit?: number;
  /**
   * 必须出现在每支候选队伍中的角色。
   * 用于回答"以某个核心为前提，最好的一队是什么"，
   * 而不是"这一关全局最好的一队是什么"——后者会因为过剩惩罚把强核心排除掉。
   */
  require?: string[];
}

/** 与本关相关度：用于裁剪候选池，但硬机制提供者永远保留。 */
function stageRelevance(member: TeamMember, stage: StageConfig): number {
  let score = member.power;
  for (const req of stage.hardRequirements) {
    if (checkRequirement([member], req).satisfied) score += 100;
  }
  for (const rec of stage.softRecommendations) {
    if (checkRequirement([member], rec.requirement).satisfied) score += rec.weight * 6;
  }
  if (stage.survivalPressure >= 3) score += teamSurvivalStrength([member]) * 3;
  if (stage.type === "defense" || stage.type === "survival") {
    score += teamControl([member]) * 2;
  }
  return score;
}

function* combinations<T>(items: T[], size: number): Generator<T[]> {
  const n = items.length;
  if (size > n) return;
  const idx = Array.from({ length: size }, (_, i) => i);
  for (;;) {
    yield idx.map((i) => items[i] as T);
    let i = size - 1;
    while (i >= 0 && (idx[i] as number) === n - size + i) i -= 1;
    if (i < 0) return;
    idx[i] = (idx[i] as number) + 1;
    for (let j = i + 1; j < size; j += 1) idx[j] = (idx[j - 1] as number) + 1;
  }
}

export interface TeamSearchResult {
  feasible: TeamEvaluation[];
  /** 最接近可行的被淘汰队伍，用于解释"为什么不能用某队"。 */
  rejected: TeamEvaluation[];
}

export function searchTeams(
  pool: TeamMember[],
  ctx: TeamContext,
  options: GenerateOptions = {},
): TeamSearchResult {
  const teamSize = options.teamSize ?? ctx.season.ruleOverrides.teamSize;
  const poolLimit = options.poolLimit ?? 13;
  const limit = options.limit ?? 8;

  const requiredIds = new Set(options.require ?? []);
  const required = pool.filter((m) => requiredIds.has(m.base.id));
  if (required.length < requiredIds.size || required.length > teamSize) {
    return { feasible: [], rejected: [] };
  }

  const ranked = [...pool]
    .filter((m) => !requiredIds.has(m.base.id))
    .sort((a, b) => stageRelevance(b, ctx.stage) - stageRelevance(a, ctx.stage));
  const slots = teamSize - required.length;
  const trimmed = ranked.slice(0, Math.max(poolLimit, slots));

  const feasible: TeamEvaluation[] = [];
  const rejected: TeamEvaluation[] = [];
  for (const rest of combinations(trimmed, slots)) {
    const combo = [...required, ...rest];
    const evaluation = evaluateTeam(combo, ctx);
    if (evaluation.feasible) feasible.push(evaluation);
    else if (rejected.length < 400) rejected.push(evaluation);
  }
  feasible.sort((a, b) => b.total - a.total);
  rejected.sort((a, b) => a.rejections.length - b.rejections.length || b.total - a.total);
  return { feasible: feasible.slice(0, limit), rejected: rejected.slice(0, 5) };
}

/** 是否存在任何可行队伍。用于死路检测（比 searchTeams 便宜）。 */
export function hasFeasibleTeam(pool: TeamMember[], ctx: TeamContext): boolean {
  return searchTeams(pool, ctx, { limit: 1, poolLimit: 11 }).feasible.length > 0;
}

/** 队伍是否能稳定触发某反应（供祝福规划使用）。 */
export function canTriggerReaction(
  team: TeamMember[],
  reaction: BuffConfig["reactionId"],
  minRate: keyof typeof RATE_RANK = "medium",
): boolean {
  return reactionSupported(team, reaction, minRate).satisfied;
}
