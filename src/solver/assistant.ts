/**
 * 局内助手：当前应该选角色、选祝福、刷新还是开战。
 *
 * 全部是确定性计算。任何结论都必须带理由，并给出被排除项的原因。
 */
import type {
  CharacterBase,
  EventCandidate,
  Roster,
  RunState,
  SeasonConfig,
  StageConfig,
} from "../domain/types";
import { buildRoster, availableMembers, type TeamMember } from "./roster";
import { currentStage, futureStages, remainingStages } from "./stages";
import { searchTeams, type TeamEvaluation, type TeamContext } from "./team";
import {
  computeReservations,
  scarcityCosts,
  wouldConsumeReservedVigor,
  elementScarcity,
  type Reservation,
  type UnmetFutureRequirement,
} from "./reservations";
import { lookahead, routeDiversity, twoStageSafety, type LookaheadResult, type RouteDiversity } from "./lookahead";
import { evaluateBuffOptions, planBuffPortfolio, type BuffEvaluation, type BuffPortfolio } from "./buffs";
import { canProvide, describeRequirement } from "./mechanics";

export interface AssistantInput {
  season: SeasonConfig;
  roster: Roster;
  characters: ReadonlyMap<string, CharacterBase>;
  state: RunState;
}

export interface TeamPlan {
  label: string;
  team: TeamEvaluation;
  reasons: string[];
  warnings: string[];
}

export interface EventRecommendation {
  candidate: EventCandidate;
  label: string;
  score: number;
  reasons: string[];
}

export interface SafetyReport {
  twoStage: LookaheadResult;
  twoStageDiversity: RouteDiversity;
  fullRun: LookaheadResult;
  fullRunDiversity: RouteDiversity;
  /** 未来两场是否仍有解。 */
  safe: boolean;
  message: string;
}

export interface AssistantOutput {
  stage?: StageConfig;
  primaryPlan?: TeamPlan;
  backupPlans: TeamPlan[];
  rejectedTeams: { memberIds: string[]; reasons: string[] }[];
  reservations: Reservation[];
  unmetFutureRequirements: UnmetFutureRequirement[];
  /** 本关不建议消耗的角色及原因。 */
  doNotSpend: { characterId: string; characterName: string; reason: string }[];
  scarcestResources: string[];
  safety: SafetyReport;
  buffOptions: BuffEvaluation[];
  buffPortfolio: BuffPortfolio;
  eventRecommendation?: EventRecommendation;
  rejectedEvents: EventRecommendation[];
  shouldRefresh: { recommended: boolean; reason: string };
  notes: string[];
}

const EMPTY_SAFETY_RESULT: LookaheadResult = {
  feasible: false,
  stagesChecked: 0,
  routeCount: 0,
  bestPath: [],
};

export function runAssistant(input: AssistantInput): AssistantOutput {
  const { season, state } = input;
  const members = buildRoster({ season, roster: input.roster, characters: input.characters });
  const unlockedMembers = members.filter((m) => state.unlockedCharacterIds.includes(m.base.id));
  const stage = currentStage(season, state);
  const future = futureStages(season, state);
  const remaining = remainingStages(season, state);
  const notes: string[] = [];

  const { reservations, unmetFutureRequirements } = computeReservations({
    season,
    futureStages: future,
    unlockedMembers,
    vigor: state.vigor,
    releasedReservationIds: state.releasedReservations,
  });

  const available = availableMembers(members, state);

  /* ---------- 安全线 ---------- */
  const lookaheadInput = {
    season,
    futureStages: remaining,
    unlockedMembers,
    vigor: state.vigor,
    buffLevels: state.buffLevels,
  };
  const twoStage = stage ? twoStageSafety(lookaheadInput) : EMPTY_SAFETY_RESULT;
  const fullRun = stage ? lookahead(lookaheadInput, { beamWidth: 4 }) : EMPTY_SAFETY_RESULT;
  const safety: SafetyReport = {
    twoStage,
    twoStageDiversity: routeDiversity(twoStage),
    fullRun,
    fullRunDiversity: routeDiversity(fullRun),
    safe: twoStage.feasible,
    message: twoStage.feasible
      ? fullRun.feasible
        ? `未来两场均有可行阵容；按当前角色池向前推演到底仍有 ${fullRun.routeCount} 条不同路线。`
        : `未来两场安全，但推演到「${fullRun.failedStageName}」时会无解，需要提前补角色或改变消耗顺序。`
      : `未来两场中「${twoStage.failedStageName}」已经找不到可行阵容，必须立即优先补角色。`,
  };

  /* ---------- 本关队伍 ---------- */
  const costs = stage
    ? scarcityCosts({
        members: unlockedMembers,
        vigor: state.vigor,
        reservations,
        currentStage: stage,
        futureStages: future,
      })
    : {};

  let primaryPlan: TeamPlan | undefined;
  const backupPlans: TeamPlan[] = [];
  const rejectedTeams: { memberIds: string[]; reasons: string[] }[] = [];

  if (stage) {
    const ctx: TeamContext = {
      season,
      stage,
      buffLevels: state.buffLevels,
      scarcityCost: costs,
      objective: state.objective,
    };
    let result = searchTeams(available, ctx, { limit: 6 });
    if (result.feasible.length === 0) {
      notes.push(
        "在硬机制与生存门槛下没有任何可行阵容，已放宽生存/输出门槛给出降级方案，请注意风险。",
      );
      result = searchTeams(available, { ...ctx, ignoreSoftGates: true }, { limit: 6 });
    }

    const plans = result.feasible.map((team, index) =>
      buildPlan(team, index, stage, future, reservations, state, lookaheadInput),
    );
    primaryPlan = plans[0];
    backupPlans.push(...plans.slice(1, 3));
    for (const rejected of result.rejected) {
      rejectedTeams.push({ memberIds: rejected.memberIds, reasons: rejected.rejections });
    }
  }

  /* ---------- 不可消耗 ---------- */
  const doNotSpend: AssistantOutput["doNotSpend"] = [];
  if (stage) {
    for (const member of unlockedMembers) {
      const check = wouldConsumeReservedVigor(
        member.base.id,
        stage,
        future,
        reservations,
        state.vigor,
      );
      if (check.blocked && check.message) {
        doNotSpend.push({
          characterId: member.base.id,
          characterName: member.base.name,
          reason: check.message,
        });
      }
    }
  }

  /* ---------- 稀缺资源 ---------- */
  const scarcity = elementScarcity(unlockedMembers, state.vigor);
  const scarcestResources = [...scarcity.entries()]
    .filter(([, v]) => v >= 0.35)
    .sort((a, b) => b[1] - a[1])
    .map(([element, v]) => `${element}（紧缺度 ${(v * 100).toFixed(0)}%）`);
  for (const unmet of unmetFutureRequirements) {
    scarcestResources.unshift(`${unmet.stageName} 的「${describeRequirement(unmet.requirement)}」暂无人可用`);
  }

  /* ---------- 祝福 ---------- */
  const buffOptions = evaluateBuffOptions({
    season,
    remainingStages: remaining,
    availableMembers: available,
    buffLevels: state.buffLevels,
    blossoms: state.blossoms,
  });
  const buffPortfolio = planBuffPortfolio(buffOptions);

  /* ---------- 事件选择 ---------- */
  const events = state.eventCandidates.map((candidate) =>
    scoreEvent(candidate, {
      input,
      members,
      unlockedMembers,
      future,
      remaining,
      unmetFutureRequirements,
      safety,
      buffOptions,
      lookaheadInput,
    }),
  );
  events.sort((a, b) => b.score - a.score);
  const eventRecommendation = events[0];
  const rejectedEvents = events.slice(1);

  /* ---------- 刷新 ---------- */
  const criticalNeed = unmetFutureRequirements.length > 0 || !safety.safe;
  const bestEventHelps = (eventRecommendation?.score ?? 0) >= 60;
  const shouldRefresh = {
    recommended:
      criticalNeed && !bestEventHelps && state.refreshesRemaining > 0 && events.length > 0,
    reason: events.length === 0
      ? criticalNeed
        ? "存在关键缺口，但还没有录入当前事件候选，无法判断刷新是否划算。请先录入候选。"
        : "还没有录入事件候选。当前也没有关键缺口，正常开战即可。"
      : criticalNeed
      ? bestEventHelps
        ? "当前候选中已有能解决关键缺口的选项，不需要刷新。"
        : state.refreshesRemaining > 0
          ? "存在关键缺口（未来关卡机制无人可用或两场安全线失守），且当前候选都不能解决，值得消耗一次刷新。"
          : "存在关键缺口但刷新次数已用尽，只能从现有候选中选择伤害最小的方案。"
      : "角色缺失才会导致无解，祝福不理想通常只是打得慢；当前没有关键缺口，不建议为祝福分支消耗刷新。",
  };

  return {
    stage,
    primaryPlan,
    backupPlans,
    rejectedTeams,
    reservations,
    unmetFutureRequirements,
    doNotSpend,
    scarcestResources,
    safety,
    buffOptions,
    buffPortfolio,
    eventRecommendation,
    rejectedEvents,
    shouldRefresh,
    notes,
  };
}

/* ------------------------------------------------------------------ */

function buildPlan(
  team: TeamEvaluation,
  index: number,
  stage: StageConfig,
  future: StageConfig[],
  reservations: Reservation[],
  state: RunState,
  lookaheadInput: Parameters<typeof lookahead>[0],
): TeamPlan {
  const reasons = [...team.explanation];
  const warnings: string[] = [];

  for (const id of team.memberIds) {
    const check = wouldConsumeReservedVigor(id, stage, future, reservations, state.vigor);
    if (check.message) warnings.push(check.message);
  }

  // 用这套队伍之后，未来两场是否仍有解
  const vigorAfter = { ...state.vigor };
  for (const id of team.memberIds) vigorAfter[id] = (vigorAfter[id] ?? 0) - 1;
  const after = lookahead(
    { ...lookaheadInput, futureStages: future, vigor: vigorAfter },
    { depth: 2, beamWidth: 3, candidatesPerStage: 3 },
  );
  reasons.push(
    after.feasible
      ? `使用该队后，未来两场仍有 ${after.routeCount} 条可行路线。`
      : `⚠ 使用该队后，「${after.failedStageName}」将无可行阵容。`,
  );
  if (!after.feasible) warnings.push(`该方案会导致「${after.failedStageName}」无解。`);

  return {
    label: index === 0 ? "主方案" : `备用方案 ${index}`,
    team,
    reasons,
    warnings,
  };
}

interface EventScoreContext {
  input: AssistantInput;
  members: TeamMember[];
  unlockedMembers: TeamMember[];
  future: StageConfig[];
  remaining: StageConfig[];
  unmetFutureRequirements: UnmetFutureRequirement[];
  safety: SafetyReport;
  buffOptions: BuffEvaluation[];
  lookaheadInput: Parameters<typeof lookahead>[0];
}

function scoreEvent(candidate: EventCandidate, ctx: EventScoreContext): EventRecommendation {
  const reasons: string[] = [];
  let score = 0;
  let label = "";

  switch (candidate.kind) {
    case "character": {
      const base = ctx.input.characters.get(candidate.characterId);
      const member =
        ctx.members.find((m) => m.base.id === candidate.characterId) ??
        (base
          ? {
              base,
              user: { characterId: base.id, tier: "usable" as const },
              power: base.baseDamage * 0.72,
              specialGuest: false,
              supportGuest: false,
            }
          : undefined);
      label = `抽取角色：${base?.name ?? candidate.characterId}`;
      if (!member) {
        return { candidate, label, score: -100, reasons: ["角色数据缺失，无法评估"] };
      }

      // 1) 是否补上了未来关卡完全无人可用的硬机制
      for (const unmet of ctx.unmetFutureRequirements) {
        if (canProvide(member, unmet.requirement)) {
          score += 120;
          reasons.push(
            `补上了${unmet.stageName}「${describeRequirement(unmet.requirement)}」这个当前完全无人可用的机制。`,
          );
        }
      }

      // 2) 是否提升路线可行性 / 多样性
      const vigor = {
        ...ctx.input.state.vigor,
        [member.base.id]:
          ctx.input.state.vigor[member.base.id] ?? ctx.input.season.ruleOverrides.defaultVigor,
      };
      const withMember = ctx.unlockedMembers.some((m) => m.base.id === member.base.id)
        ? ctx.unlockedMembers
        : [...ctx.unlockedMembers, member];
      const after = lookahead(
        { ...ctx.lookaheadInput, unlockedMembers: withMember, vigor },
        { beamWidth: 4 },
      );
      const before = ctx.safety.fullRun;
      if (!before.feasible && after.feasible) {
        score += 90;
        reasons.push("该角色把当前的死路变成了可行路线。");
      } else if (after.routeCount > before.routeCount) {
        score += (after.routeCount - before.routeCount) * 12;
        reasons.push(`可行路线数量由 ${before.routeCount} 增加到 ${after.routeCount}。`);
      }

      // 3) 稀缺元素补充
      const scarcity = elementScarcity(ctx.unlockedMembers, ctx.input.state.vigor);
      for (const cap of member.base.capabilities) {
        if (cap.type !== "element-application" || !cap.element || cap.frequency === "low") continue;
        const level = scarcity.get(cap.element) ?? 0;
        if (level >= 0.35) {
          score += level * 30;
          reasons.push(`补充当前紧缺的 ${cap.element} 系出场额度。`);
        }
      }

      // 4) 单纯强度（最低优先级）
      score += member.power * 1.2;
      if (!ctx.safety.safe) {
        score += 20;
        reasons.push("未来两场安全线未达成时，角色事件优先于普通祝福。");
      }
      score -= candidate.cost * 0.5;
      break;
    }

    case "buff": {
      const evaluation = ctx.buffOptions.find(
        (b) => b.buffId === candidate.buffId && b.targetLevel === candidate.targetLevel,
      );
      label = `购买祝福：${evaluation?.buffName ?? candidate.buffId} → Lv${candidate.targetLevel}`;
      if (!evaluation) {
        return { candidate, label, score: -50, reasons: ["该祝福等级不在当前赛季配置中"] };
      }
      score += evaluation.total * 2;
      reasons.push(...evaluation.explanation);
      if (ctx.unmetFutureRequirements.length > 0 && evaluation.mechanicStages.length === 0) {
        score -= 80;
        reasons.push("仍有未来关卡机制无人可用，此时买普通祝福会挤占角色预算。");
      }
      if (!ctx.safety.safe && evaluation.mechanicStages.length === 0) {
        score -= 60;
        reasons.push("两场安全线未达成，祝福让位给角色。");
      }
      score -= candidate.cost * 0.5;
      break;
    }

    case "vigor": {
      const base = ctx.input.characters.get(candidate.characterId);
      label = `恢复耐力：${base?.name ?? candidate.characterId} +${candidate.amount}`;
      const isReserved = ctx.unmetFutureRequirements.length === 0;
      score += candidate.amount * 18 + (isReserved ? 0 : 25);
      reasons.push("额外耐力等价于多一次核心角色出场，价值随核心角色强度上升。");
      score -= candidate.cost * 0.5;
      break;
    }

    case "blossom": {
      label = `获得幻剧之花 +${candidate.amount}`;
      score += candidate.amount * 4;
      reasons.push("花是控制随机性的货币，本身不解决机制缺口。");
      break;
    }
  }

  return { candidate, label, score: Math.round(score * 100) / 100, reasons };
}
