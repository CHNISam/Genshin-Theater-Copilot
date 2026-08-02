/**
 * 开局规划。
 *
 * 输出的是**初始资源预算**，不是固定答案：局内随机结果出现后由 assistant 重算。
 */
import type {
  CharacterBase,
  Element,
  RunObjective,
  RunState,
  Roster,
  SeasonConfig,
  StageConfig,
} from "../domain/types";
import { buildRoster, effectivePower, initialVigor, type TeamMember } from "./roster";
import { searchTeams, type TeamContext } from "./team";
import { lookahead, type PathStep } from "./lookahead";
import { canProvide, describeRequirement } from "./mechanics";
import { elementScarcity } from "./reservations";
import { evaluateBuffOptions, planBuffPortfolio, type BuffPortfolio } from "./buffs";
import { stageRequiredByObjective } from "./stages";

export interface SupportGuestEvaluation {
  characterId: string;
  characterName: string;
  score: number;
  /** 解决了哪些固定关卡的硬机制。 */
  mechanicsCovered: { stageName: string; requirement: string }[];
  /** 是否争抢紧缺元素资源。 */
  contendsScarceElements: Element[];
  /** 是否自带生存，能省下一个生存位。 */
  selfSufficient: boolean;
  routeCount: number;
  reasons: string[];
}

export interface CoreModule {
  coreId: string;
  coreName: string;
  teammates: { id: string; name: string; role: string }[];
  /** 该模块适合承担的关卡。 */
  suitableStages: string[];
  /** 该模块占用的紧缺资源。 */
  consumesScarce: string[];
}

export interface DeadlineItem {
  requirement: string;
  stageName: string;
  stageOrder: number;
  /** 最晚应在第几幕前解锁。 */
  latestActOrder: number;
  candidates: string[];
}

export interface OpeningPlan {
  seasonId: string;
  supportGuestRanking: SupportGuestEvaluation[];
  coreModules: CoreModule[];
  scarceElements: { element: Element; level: number }[];
  scarceFunctions: string[];
  earlyExpendable: { id: string; name: string; reason: string }[];
  mustPreserve: { id: string; name: string; reason: string }[];
  deadlines: DeadlineItem[];
  bossPlans: { stageName: string; mechanics: string[]; answers: string[]; fallback: string[] }[];
  tabletPlans: { stageName: string; note: string; answers: string[] }[];
  buffPortfolio: BuffPortfolio;
  riskNodes: string[];
  baselineRoute: PathStep[];
  baselineFeasible: boolean;
  baselineFailedStage?: string;
  notes: string[];
}

export interface OpeningPlanInput {
  season: SeasonConfig;
  roster: Roster;
  characters: ReadonlyMap<string, CharacterBase>;
  /** 助演候选。默认取 roster.supportGuestCandidates。 */
  supportGuestCandidates?: string[];
  /** 本局目标。决定圣牌挑战是否纳入规划。 */
  objective?: RunObjective;
}

function makeBaselineState(season: SeasonConfig, members: TeamMember[]): RunState {
  const stages = [...season.stages].sort((a, b) => a.order - b.order);
  return {
    seasonId: season.id,
    objective: {
      difficulty: season.ruleOverrides.supportedDifficulties[0] ?? "moonlit",
      goal: "clear-with-tablets",
    },
    currentStageId: stages[0]?.id ?? "",
    completedStageIds: [],
    unlockedCharacterIds: members.map((m) => m.base.id),
    standbyCharacterIds: [],
    vigor: initialVigor(members, season),
    blossoms: 0,
    refreshesRemaining: season.ruleOverrides.initialRefreshes,
    buffLevels: {},
    buffBranchChoices: {},
    stageOverrides: {},
    eventCandidates: [],
    releasedReservations: [],
  };
}

export function buildOpeningPlan(input: OpeningPlanInput): OpeningPlan {
  const { season } = input;
  const objective: RunObjective = input.objective ?? {
    difficulty: season.ruleOverrides.supportedDifficulties[0] ?? "moonlit",
    goal: "clear-with-tablets",
  };
  const stages = [...season.stages]
    .sort((a, b) => a.order - b.order)
    .filter((s) => stageRequiredByObjective(s, objective));
  const members = buildRoster({ season, roster: input.roster, characters: input.characters });
  const notes: string[] = [];

  /* ---------- 基准路线（假设角色都已解锁，作为资源预算） ---------- */
  const baselineState = makeBaselineState(season, members);
  const baseline = lookahead(
    {
      season,
      futureStages: stages,
      unlockedMembers: members,
      vigor: baselineState.vigor,
      buffLevels: {},
    },
    { beamWidth: 5, candidatesPerStage: 4 },
  );
  if (!baseline.feasible) {
    notes.push(
      `即使假设所有角色都已解锁，推演到「${baseline.failedStageName}」仍然无解。需要补角色或降低目标。`,
    );
  }
  notes.push("基准路线只是初始资源预算，局内随机结果出现后必须重算。");

  /* ---------- 稀缺资源 ---------- */
  const scarcity = elementScarcity(members, baselineState.vigor);
  const scarceElements = [...scarcity.entries()]
    .filter(([, v]) => v > 0.2)
    .sort((a, b) => b[1] - a[1])
    .map(([element, level]) => ({ element, level: Math.round(level * 100) / 100 }));

  const scarceFunctions: string[] = [];
  const functionSupply = countFunctions(members, baselineState.vigor);
  for (const [fn, supply] of functionSupply) {
    if (supply <= stages.length * 0.5) {
      scarceFunctions.push(`${fn}（剩余出场额度约 ${supply}）`);
    }
  }

  /* ---------- 助演评估 ---------- */
  const candidates = input.supportGuestCandidates ?? input.roster.supportGuestCandidates ?? [];
  const supportGuestRanking = candidates
    .map((id) => evaluateSupportGuest(id, input, members, stages, scarcity))
    .filter((x): x is SupportGuestEvaluation => x !== undefined)
    .sort((a, b) => b.score - a.score);

  /* ---------- 核心模块 ---------- */
  const coreModules = buildCoreModules(members, stages, season, scarcity);

  /* ---------- 预留与截止点 ---------- */
  const deadlines: DeadlineItem[] = [];
  const mustPreserve: OpeningPlan["mustPreserve"] = [];
  const fixedStages = stages.filter((s) => s.fixed && s.hardRequirements.length > 0);
  for (const stage of fixedStages) {
    for (const req of stage.hardRequirements) {
      const providers = members.filter((m) => canProvide(m, req));
      deadlines.push({
        requirement: describeRequirement(req),
        stageName: stage.name,
        stageOrder: stage.order,
        latestActOrder: Math.max(1, stage.order - 2),
        candidates: providers.map((p) => p.base.name),
      });
      if (providers.length > 0 && providers.length <= 2) {
        for (const provider of providers) {
          if (mustPreserve.some((m) => m.id === provider.base.id)) continue;
          mustPreserve.push({
            id: provider.base.id,
            name: provider.base.name,
            reason: `${stage.name} 需要「${describeRequirement(req)}」，可用人选仅 ${providers
              .map((p) => p.base.name)
              .join("、")}。`,
          });
        }
      }
    }
  }

  /* ---------- 可前期消耗 ---------- */
  const preserveIds = new Set(mustPreserve.map((m) => m.id));
  const earlyExpendable = members
    .filter((m) => !preserveIds.has(m.base.id))
    .filter((m) => {
      // 不是任何固定关卡的稀缺机制提供者，且不是最高档输出
      const isTopDamage = m.power >= 7 && m.base.roles.includes("main-dps");
      return !isTopDamage;
    })
    .slice(0, 12)
    .map((m) => ({
      id: m.base.id,
      name: m.base.name,
      reason: m.base.roles.includes("main-dps")
        ? "次级主 C，适合承担前两幕并完整消耗两点耐力。"
        : "不占用固定关卡机制，也不争抢紧缺元素，适合作为前期挂件。",
    }));

  /* ---------- Boss / 圣牌预案 ---------- */
  const bossPlans = stages
    .filter((s) => s.type === "boss")
    .map((stage) => {
      const ctx: TeamContext = { season, stage, buffLevels: {}, objective };
      const result = searchTeams(members, ctx, { limit: 3 });
      return {
        stageName: stage.name,
        mechanics: stage.hardRequirements.map(describeRequirement),
        answers: result.feasible.map((t) =>
          t.members.map((m) => m.base.name).join(" + "),
        ),
        fallback: result.feasible.slice(1).map((t) => t.members.map((m) => m.base.name).join(" + ")),
      };
    });

  const tabletPlans = stages
    .filter((s) => s.type === "tablet" || s.type === "survival")
    .map((stage) => {
      const ctx: TeamContext = { season, stage, buffLevels: {}, objective };
      const result = searchTeams(members, ctx, { limit: 2 });
      return {
        stageName: stage.name,
        note:
          stage.survivalPressure >= 3
            ? "生存压力高于输出压力，优先带全队治疗与抗打断，不必投入最强输出。"
            : "常规处理即可。",
        answers: result.feasible.map((t) => t.members.map((m) => m.base.name).join(" + ")),
      };
    });

  /* ---------- 祝福方向 ---------- */
  const buffPortfolio = planBuffPortfolio(
    evaluateBuffOptions({
      season,
      remainingStages: stages,
      availableMembers: members,
      buffLevels: {},
      blossoms: 999,
    }),
  );

  /* ---------- 风险节点 ---------- */
  const riskNodes: string[] = [];
  for (const deadline of deadlines) {
    if (deadline.candidates.length === 0) {
      riskNodes.push(
        `${deadline.stageName} 需要「${deadline.requirement}」，当前角色池中没有任何人能提供，这是最大风险。`,
      );
    } else if (deadline.candidates.length === 1) {
      riskNodes.push(
        `${deadline.stageName} 的「${deadline.requirement}」只有 ${deadline.candidates[0]} 一个解，必须为其保留耐力。`,
      );
    }
  }
  for (const { element, level } of scarceElements) {
    if (level >= 0.5) {
      riskNodes.push(`${element} 系出场额度紧张（紧缺度 ${(level * 100).toFixed(0)}%），容易被前期随意消耗掉。`);
    }
  }
  if (!baseline.feasible && baseline.failedStageName) {
    riskNodes.push(`基准推演在「${baseline.failedStageName}」断裂。`);
  }

  return {
    seasonId: season.id,
    supportGuestRanking,
    coreModules,
    scarceElements,
    scarceFunctions,
    earlyExpendable,
    mustPreserve,
    deadlines,
    bossPlans,
    tabletPlans,
    buffPortfolio,
    riskNodes,
    baselineRoute: baseline.bestPath,
    baselineFeasible: baseline.feasible,
    baselineFailedStage: baseline.failedStageName,
    notes,
  };
}

/* ------------------------------------------------------------------ */

function countFunctions(members: TeamMember[], vigor: Record<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  const add = (key: string, amount: number) => out.set(key, (out.get(key) ?? 0) + amount);
  for (const member of members) {
    const remaining = vigor[member.base.id] ?? 0;
    for (const cap of member.base.capabilities) {
      if (cap.type === "healing" && cap.scope === "party-wide") add("全队治疗", remaining);
      if (cap.type === "shield") add("护盾", remaining);
      if (cap.type === "grouping") add("聚怪", remaining);
      if (cap.type === "interrupt-resistance") add("抗打断", remaining);
    }
  }
  return out;
}

function evaluateSupportGuest(
  characterId: string,
  input: OpeningPlanInput,
  members: TeamMember[],
  stages: StageConfig[],
  scarcity: Map<Element, number>,
): SupportGuestEvaluation | undefined {
  const base = input.characters.get(characterId);
  if (!base) return undefined;

  const guest: TeamMember = {
    base,
    user: input.roster.characters.find((c) => c.characterId === characterId) ?? {
      characterId,
      tier: "core",
    },
    power: 0,
    specialGuest: input.season.specialGuestIds.includes(characterId),
    supportGuest: true,
  };
  guest.power = effectivePower(base, guest.user);

  const withGuest = members.some((m) => m.base.id === characterId)
    ? members
    : [...members, guest];
  const vigor = initialVigor(withGuest, input.season);

  const result = lookahead(
    {
      season: input.season,
      futureStages: stages,
      unlockedMembers: withGuest,
      vigor,
      buffLevels: {},
    },
    { beamWidth: 5, candidatesPerStage: 4 },
  );

  const reasons: string[] = [];
  let score = 0;

  const mechanicsCovered: SupportGuestEvaluation["mechanicsCovered"] = [];
  for (const stage of stages) {
    for (const req of stage.hardRequirements) {
      if (!canProvide(guest, req)) continue;
      const others = members.filter((m) => canProvide(m, req));
      mechanicsCovered.push({ stageName: stage.name, requirement: describeRequirement(req) });
      score += others.length === 0 ? 120 : others.length <= 2 ? 45 : 12;
      reasons.push(
        others.length === 0
          ? `独立解决${stage.name}的「${describeRequirement(req)}」，而自有角色中无人可解。`
          : `可作为${stage.name}「${describeRequirement(req)}」的第 ${others.length + 1} 个解。`,
      );
    }
  }

  const contends: Element[] = [];
  for (const need of base.teammateNeeds ?? []) {
    if (need.type !== "requires-element" || !need.element) continue;
    const level = scarcity.get(need.element) ?? 0;
    if (level >= 0.3) {
      contends.push(need.element);
      score -= level * 60;
      reasons.push(
        `会争抢已经紧张的 ${need.element} 系队友（紧缺度 ${(level * 100).toFixed(0)}%），这会削弱其他主 C。`,
      );
    }
  }

  const selfSufficient = base.capabilities.some(
    (c) => c.type === "healing" && c.scope === "active-character" && c.strength >= 2,
  );
  if (selfSufficient) {
    score += 18;
    reasons.push("自带续航，可以省下一个生存位。");
  }

  score += guest.power * 3;
  score += result.routeCount * 8;
  if (result.feasible) reasons.push(`带上后基准推演仍有 ${result.routeCount} 条可行路线。`);
  else reasons.push(`带上后基准推演在「${result.failedStageName}」断裂。`);

  return {
    characterId,
    characterName: base.name,
    score: Math.round(score * 100) / 100,
    mechanicsCovered,
    contendsScarceElements: contends,
    selfSufficient,
    routeCount: result.routeCount,
    reasons,
  };
}

function buildCoreModules(
  members: TeamMember[],
  stages: StageConfig[],
  season: SeasonConfig,
  scarcity: Map<Element, number>,
): CoreModule[] {
  const cores = members
    .filter((m) => m.base.roles.includes("main-dps") && m.user.tier !== "trinket")
    .sort((a, b) => b.power - a.power)
    .slice(0, 6);

  const modules: CoreModule[] = [];
  for (const core of cores) {
    const bossStage =
      stages.find((s) => s.type === "boss") ?? stages[stages.length - 1] ?? stages[0];
    if (!bossStage) break;
    const ctx: TeamContext = { season, stage: bossStage, buffLevels: {} };
    // 以该核心为前提求最优队伍；不能用全局最优再过滤，否则过剩惩罚会把强核心整个排除。
    const best = searchTeams(members, ctx, { limit: 4, require: [core.base.id] }).feasible[0];
    const teammates = (best?.members ?? [])
      .filter((m) => m.base.id !== core.base.id)
      .map((m) => ({
        id: m.base.id,
        name: m.base.name,
        role: m.base.roles[0] ?? "flex",
      }));

    const consumesScarce: string[] = [];
    for (const need of core.base.teammateNeeds ?? []) {
      if (need.type === "requires-element" && need.element) {
        const level = scarcity.get(need.element) ?? 0;
        if (level > 0.2) consumesScarce.push(`${need.element} 系队友`);
      }
    }

    modules.push({
      coreId: core.base.id,
      coreName: core.base.name,
      teammates,
      suitableStages: stages
        .filter(
          (s) =>
            searchTeams(members, { season, stage: s, buffLevels: {} }, {
              limit: 1,
              require: [core.base.id],
            }).feasible.length > 0,
        )
        .map((s) => s.name),
      consumesScarce,
    });
  }
  return modules;
}
