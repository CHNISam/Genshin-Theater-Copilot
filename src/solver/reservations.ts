/**
 * 关键角色预留。
 *
 * 目标：固定机制关所需的角色，不能被前置普通关提前耗尽。
 * 预留是从"未来关卡的硬机制 × 当前可提供者的剩余耐力"推导出来的，
 * 求解器中不出现任何具体角色 id 的硬编码。
 */
import type {
  Confidence,
  Element,
  MechanicRequirement,
  ResolvedSeason,
  StageConfig,
} from "../domain/types";
import { CONFIDENCE_RANK } from "../domain/types";
import type { TeamMember } from "./roster";
import { canProvide, describeRequirement } from "./mechanics";

export interface Reservation {
  id: string;
  characterId: string;
  characterName: string;
  /** 触发该预留的最早关卡。 */
  stageId: string;
  stageName: string;
  /** 该角色至少需要为这些关卡保留多少点耐力。 */
  minimumVigorReserved: number;
  requirement: MechanicRequirement;
  reason: string;
  /** 其他能顶替的角色名（为空表示唯一解）。 */
  alternatives: string[];
  confidence: Confidence;
  /**
   * hard：现在消耗就会直接导致未来该机制无人可用；
   * soft：仍有余量，但会压缩容错。
   */
  strictness: "hard" | "soft";
  /** 距离该关卡还有几场。 */
  stagesAway: number;
}

export interface UnmetFutureRequirement {
  stageId: string;
  stageName: string;
  requirement: MechanicRequirement;
  confidence: Confidence;
  message: string;
}

export interface ReservationInput {
  season: ResolvedSeason;
  /** 严格晚于当前关卡、按 order 升序的未来关卡。 */
  futureStages: StageConfig[];
  unlockedMembers: TeamMember[];
  vigor: Record<string, number>;
  /** 用户已主动解除的预留 id。 */
  releasedReservationIds?: string[];
  /** 距离多少场以内必须进入强制保障。默认 2。 */
  enforceWithin?: number;
}

export interface ReservationResult {
  reservations: Reservation[];
  unmetFutureRequirements: UnmetFutureRequirement[];
}

function requirementKey(req: MechanicRequirement): string {
  return JSON.stringify(req);
}

function minConfidence(values: Confidence[]): Confidence {
  return values.reduce<Confidence>(
    (acc, c) => (CONFIDENCE_RANK[c] < CONFIDENCE_RANK[acc] ? c : acc),
    "confirmed",
  );
}

export function computeReservations(input: ReservationInput): ReservationResult {
  const enforceWithin = input.enforceWithin ?? 2;
  const released = new Set(input.releasedReservationIds ?? []);

  interface Group {
    requirement: MechanicRequirement;
    stages: StageConfig[];
  }
  const groups = new Map<string, Group>();
  for (const stage of input.futureStages) {
    for (const req of stage.hardRequirements) {
      const key = requirementKey(req);
      const group = groups.get(key);
      if (group) group.stages.push(stage);
      else groups.set(key, { requirement: req, stages: [stage] });
    }
  }

  const reservations: Reservation[] = [];
  const unmet: UnmetFutureRequirement[] = [];

  for (const group of groups.values()) {
    const { requirement } = group;
    const providers = input.unlockedMembers.filter(
      (m) => (input.vigor[m.base.id] ?? 0) > 0 && canProvide(m, requirement),
    );
    const firstStage = group.stages[0];
    if (!firstStage) continue;
    const confidence = minConfidence(group.stages.map((s) => s.confidence));

    if (providers.length === 0) {
      unmet.push({
        stageId: firstStage.id,
        stageName: firstStage.name,
        requirement,
        confidence,
        message: `${firstStage.name} 需要「${describeRequirement(
          requirement,
        )}」，当前已解锁角色中没有任何人能提供。必须优先通过角色事件补上。`,
      });
      continue;
    }

    const demand = group.stages.length;
    const supply = providers.reduce((sum, m) => sum + (input.vigor[m.base.id] ?? 0), 0);
    // 供给宽裕（提供者多且总耐力远超需求）时不预留，避免把充足的生存位误判成唯一刚需。
    const scarce = providers.length <= 2 || supply <= demand + 1;
    if (!scarce) continue;

    const perProvider = Math.max(1, Math.ceil(demand / providers.length));
    const stagesAway = input.futureStages.indexOf(firstStage) + 1;

    for (const provider of providers) {
      const own = input.vigor[provider.base.id] ?? 0;
      const reserved = Math.min(own, perProvider);
      const alternatives = providers
        .filter((p) => p.base.id !== provider.base.id)
        .map((p) => p.base.name);
      const id = `${provider.base.id}@${firstStage.id}:${requirementKey(requirement).length}`;
      if (released.has(id)) continue;

      const spendingBreaksIt = supply - 1 < demand;
      const strictness: "hard" | "soft" =
        spendingBreaksIt || (providers.length === 1 && stagesAway <= enforceWithin)
          ? "hard"
          : "soft";

      reservations.push({
        id,
        characterId: provider.base.id,
        characterName: provider.base.name,
        stageId: firstStage.id,
        stageName: firstStage.name,
        minimumVigorReserved: reserved,
        requirement,
        alternatives,
        confidence,
        strictness,
        stagesAway,
        reason:
          alternatives.length === 0
            ? `${provider.base.name} 是当前唯一能满足${firstStage.name}「${describeRequirement(
                requirement,
              )}」的角色，至少 ${reserved} 点耐力必须保留。`
            : `${firstStage.name} 需要「${describeRequirement(requirement)}」，可用人选只有 ${
                providers.length
              } 名（${providers.map((p) => p.base.name).join("、")}），${
                provider.base.name
              } 需保留 ${reserved} 点耐力。`,
      });
    }
  }

  return { reservations, unmetFutureRequirements: unmet };
}

export interface ConsumeCheck {
  blocked: boolean;
  violated: Reservation[];
  warnings: Reservation[];
  message?: string;
}

/**
 * 在当前关卡使用某角色，是否会动用被预留的耐力。
 *
 * 注意：如果当前关卡本身就是该预留指向的关卡，则不算违规。
 */
export function wouldConsumeReservedVigor(
  characterId: string,
  currentStage: StageConfig,
  futureStages: StageConfig[],
  reservations: Reservation[],
  vigor: Record<string, number>,
): ConsumeCheck {
  const futureIds = new Set(futureStages.map((s) => s.id));
  const remaining = vigor[characterId] ?? 0;
  const relevant = reservations.filter(
    (r) =>
      r.characterId === characterId &&
      r.stageId !== currentStage.id &&
      futureIds.has(r.stageId),
  );

  const violated: Reservation[] = [];
  const warnings: Reservation[] = [];
  for (const r of relevant) {
    if (remaining - 1 < r.minimumVigorReserved) {
      if (r.strictness === "hard") violated.push(r);
      else warnings.push(r);
    }
  }

  const first = violated[0] ?? warnings[0];
  return {
    blocked: violated.length > 0,
    violated,
    warnings,
    message: first
      ? `${first.characterName} 当前剩余 ${remaining} 点耐力，其中至少 ${first.minimumVigorReserved} 点已为${first.stageName}的「${describeRequirement(
          first.requirement,
        )}」预留，因此不建议在${currentStage.name}使用。`
      : undefined,
  };
}

export type ReleaseReason =
  | "alternative-acquired"
  | "stage-changed"
  | "user-accepts-risk"
  | "no-route-remains"
  | "evidence-overridden";

export interface ReleaseDecision {
  allowed: boolean;
  reason: ReleaseReason | null;
  explanation: string;
}

/** 预留只能在这五种情况下解除。 */
export function canReleaseReservation(
  reservation: Reservation,
  flags: Partial<Record<ReleaseReason, boolean>>,
): ReleaseDecision {
  const order: ReleaseReason[] = [
    "alternative-acquired",
    "stage-changed",
    "evidence-overridden",
    "no-route-remains",
    "user-accepts-risk",
  ];
  const explanations: Record<ReleaseReason, string> = {
    "alternative-acquired": `已获得可靠替代角色（${reservation.alternatives.join("、") || "新解锁角色"}），预留可以解除。`,
    "stage-changed": `${reservation.stageName} 的实际机制与预期不同，原预留依据不再成立。`,
    "evidence-overridden": "预留依据被新的高可信数据推翻。",
    "no-route-remains": "当前线路已无法继续，解除预留以换取眼前可行解。",
    "user-accepts-risk": "用户主动接受高风险。",
  };
  for (const reason of order) {
    if (flags[reason]) {
      return { allowed: true, reason, explanation: explanations[reason] };
    }
  }
  return {
    allowed: false,
    reason: null,
    explanation: `${reservation.reason} 目前不满足任何解除条件。`,
  };
}

/* ------------------------------------------------------------------ */

/** 元素稀缺度：由"多少角色刚需该元素"与"该元素还剩多少次出场"动态推出。 */
export function elementScarcity(
  members: TeamMember[],
  vigor: Record<string, number>,
): Map<Element, number> {
  const supply = new Map<Element, number>();
  const demand = new Map<Element, number>();

  for (const member of members) {
    const remaining = Math.max(0, vigor[member.base.id] ?? 0);
    for (const cap of member.base.capabilities) {
      if (cap.type !== "element-application" || !cap.element) continue;
      if (cap.frequency === "low") continue;
      supply.set(cap.element, (supply.get(cap.element) ?? 0) + remaining);
    }
    for (const need of member.base.teammateNeeds ?? []) {
      if (need.type !== "requires-element" || !need.element) continue;
      demand.set(need.element, (demand.get(need.element) ?? 0) + remaining);
    }
  }

  const scarcity = new Map<Element, number>();
  for (const [element, need] of demand) {
    const have = supply.get(element) ?? 0;
    if (need <= 0) continue;
    scarcity.set(element, Math.max(0, Math.min(1, 1 - have / (need + 1))));
  }
  return scarcity;
}

export interface ScarcityInput {
  members: TeamMember[];
  vigor: Record<string, number>;
  reservations: Reservation[];
  currentStage: StageConfig;
  futureStages: StageConfig[];
}

/** 每个角色"在本关消耗一点耐力"的稀缺代价，供队伍评分使用。 */
export function scarcityCosts(input: ScarcityInput): Record<string, number> {
  const costs: Record<string, number> = {};
  const scarcity = elementScarcity(input.members, input.vigor);

  for (const member of input.members) {
    let cost = 0;
    const check = wouldConsumeReservedVigor(
      member.base.id,
      input.currentStage,
      input.futureStages,
      input.reservations,
      input.vigor,
    );
    if (check.violated.length > 0) cost += 1.2;
    cost += check.warnings.length * 0.35;

    for (const cap of member.base.capabilities) {
      if (cap.type !== "element-application" || !cap.element) continue;
      if (cap.frequency === "low") continue;
      cost += (scarcity.get(cap.element) ?? 0) * 0.3;
    }

    if (cost > 0) costs[member.base.id] = Math.round(cost * 100) / 100;
  }
  return costs;
}
