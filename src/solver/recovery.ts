/**
 * 容灾恢复。
 *
 * 前提：用户**不一定**按推荐走。他可能点错、可能凭手感换人、也可能随机没给好脸色。
 * 因此恢复建议只看"当前状态是什么"，不看"他有没有听劝"——
 * 同一个状态永远给同一套结论，这样用户任何时候接上来都不会被指责。
 *
 * 输出必须是**可执行的动作**，而不是一句"已经无解"。报警不给出路等于没有容灾。
 *
 * 确定性纯函数：不联网、不调用大模型、不引用具体角色 id。
 */
import type { ResolvedSeason, RunState, StageConfig } from "../domain/types";
import type { TeamMember } from "./roster";
import { lookahead, type LookaheadResult } from "./lookahead";
import {
  canReleaseReservation,
  type Reservation,
  type UnmetFutureRequirement,
} from "./reservations";
import { describeRequirement } from "./mechanics";
import { stageRequiredByObjective } from "./stages";

export type RecoveryKind =
  | "release-reservation"
  | "drop-tablets"
  | "refresh"
  | "accept-degraded";

export interface RecoveryOption {
  kind: RecoveryKind;
  /** 一句话动作。用户只看这一句就知道该点什么。 */
  title: string;
  /** 为什么这条路成立，以及它的代价。 */
  detail: string;
  /**
   * 这条路是否**确实**能让推演重新有解。
   * 结果依赖随机（例如刷新出什么）时一律为 false —— 不允许给用户虚假承诺。
   */
  restoresFeasibility: boolean;
  /** 代价。没有代价的选项写"无额外代价"。 */
  cost: string;
  /** kind === "release-reservation" 时给出对应预留。 */
  reservationId?: string;
}

export interface RecoveryPlan {
  inTrouble: boolean;
  /** 一句话说明现在卡在哪。没有困境时为空串。 */
  diagnosis: string;
  options: RecoveryOption[];
}

export interface RecoveryInput {
  season: ResolvedSeason;
  state: RunState;
  unlockedMembers: TeamMember[];
  /** 当前关卡及之后所有未完成关卡（已按目标过滤、按 order 升序）。 */
  remainingStages: StageConfig[];
  reservations: Reservation[];
  unmetFutureRequirements: UnmetFutureRequirement[];
  /** 当前状态下推演到底的结果。 */
  fullRun: LookaheadResult;
}

/**
 * 选项排序。按项目求解优先级：先让关卡重新可解，再谈代价。
 * "接受降级"永远垫底——它不解决任何问题，只是承认现实，
 * 排在前面会挤掉真正的解法。
 */
const KIND_ORDER: Record<RecoveryKind, number> = {
  "release-reservation": 0,
  "drop-tablets": 1,
  refresh: 2,
  "accept-degraded": 99,
};

export function planRecovery(input: RecoveryInput): RecoveryPlan {
  const { fullRun, unmetFutureRequirements: unmet, state } = input;
  const inTrouble = !fullRun.feasible || unmet.length > 0;
  if (!inTrouble) return { inTrouble: false, diagnosis: "", options: [] };

  const options: RecoveryOption[] = [];

  /* ---------- 1. 线路已死 → 为该线路做的预留失去意义 ---------- */
  if (!fullRun.feasible) {
    for (const reservation of input.reservations) {
      const decision = canReleaseReservation(reservation, { "no-route-remains": true });
      if (!decision.allowed) continue;
      options.push({
        kind: "release-reservation",
        title: `解除对${reservation.characterName}的预留`,
        detail: `${decision.explanation}原预留是为了${reservation.stageName}的「${describeRequirement(
          reservation.requirement,
        )}」，但那条线路已经走不到了。`,
        // 解除预留只是放开当前的用人限制，能不能救回来取决于后面的选择。
        restoresFeasibility: false,
        cost: reservation.alternatives.length > 0 ? "有替代人选，风险可控。" : "之后该机制将无人可用。",
        reservationId: reservation.id,
      });
    }
  }

  /* ---------- 2. 放弃圣牌：把耐力全部还给主线 ---------- */
  if (state.objective.tablets) {
    const tablets = input.remainingStages.filter((s) => s.type === "tablet");
    if (tablets.length > 0) {
      const mainlineOnly = input.remainingStages.filter((s) =>
        stageRequiredByObjective(s, { ...state.objective, tablets: false }),
      );
      const after = lookahead(
        {
          season: input.season,
          futureStages: mainlineOnly,
          unlockedMembers: input.unlockedMembers,
          vigor: state.vigor,
          buffLevels: state.buffLevels,
        },
        { beamWidth: 4 },
      );
      if (after.feasible) {
        options.push({
          kind: "drop-tablets",
          title: `放弃剩下 ${tablets.length} 场圣牌挑战`,
          detail: `把这 ${tablets.length} 场的耐力全部留给主线后，推演到底重新有 ${after.routeCount} 条可行路线。`,
          restoresFeasibility: true,
          cost: `少拿 ${tablets.length} 枚星章，也拿不到月谕圣牌。`,
        });
      }
    }
  }

  /* ---------- 3. 刷新：唯一能补角色的途径，但结果是随机的 ---------- */
  if (state.refreshesRemaining > 0) {
    const gap = unmet[0];
    options.push({
      kind: "refresh",
      title: `刷新一次（还剩 ${state.refreshesRemaining} 次）`,
      detail: gap
        ? `${gap.stageName}的「${describeRequirement(gap.requirement)}」目前完全无人可用，只能靠新角色补上。刷新出什么是随机的，不保证一定补得上。`
        : "现有候选救不回当前线路，换一批候选是唯一还能改变局面的操作。刷新出什么是随机的。",
      restoresFeasibility: false,
      cost: "消耗一次刷新，之后遇到更关键的缺口就没得换了。",
    });
  }

  /* ---------- 4. 兜底：承认现实，但要说清楚还能拿到什么 ---------- */
  const cleared = state.completedStageIds.length;
  const reachable = fullRun.feasible ? input.remainingStages.length : fullRun.stagesChecked;
  options.push({
    kind: "accept-degraded",
    title: "按现状打下去",
    detail: fullRun.failedStageName
      ? `已通过 ${cleared} 关，按现状还能再稳过 ${reachable} 关，卡在「${fullRun.failedStageName}」。先把能拿的星章拿满，再决定要不要重开。`
      : `已通过 ${cleared} 关。存在无人可用的机制，能打到哪算哪。`,
    restoresFeasibility: false,
    cost: "目标会打折扣。",
  });

  options.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);

  return { inTrouble: true, diagnosis: diagnose(fullRun, unmet), options };
}

function diagnose(fullRun: LookaheadResult, unmet: UnmetFutureRequirement[]): string {
  const first = unmet[0];
  if (first) {
    return `${first.stageName}的「${describeRequirement(first.requirement)}」现在没有任何角色能提供${
      unmet.length > 1 ? `（另有 ${unmet.length - 1} 处同类缺口）` : ""
    }。`;
  }
  return fullRun.failedStageName
    ? `按当前耐力推演，到「${fullRun.failedStageName}」时凑不出可行阵容。`
    : "当前线路已无法走到底。";
}
