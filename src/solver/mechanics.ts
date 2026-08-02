/**
 * 机制判定。这是整个产品最重要的正确性边界：
 * 关卡硬机制是**过滤条件**，不是加分项。任何伤害评分都不能覆盖未满足的硬机制。
 */
import type {
  Element,
  MechanicCapability,
  MechanicRequirement,
  Rate,
  ReactionId,
  TeamCondition,
} from "../domain/types";
import {
  ELEMENT_LABEL,
  RATE_LABEL,
  RATE_RANK,
  REACTION_ELEMENTS,
  REACTION_LABEL,
  TIER_MULTIPLIER,
} from "../domain/types";
import type { TeamMember } from "./roster";

export interface MechanicCheck {
  satisfied: boolean;
  requirement: MechanicRequirement;
  /** 满足该需求的角色 id。 */
  providers: string[];
  /** 人类可读的判定说明，用于解释系统。 */
  detail: string;
  /** 超出最低要求的余量，>=0 表示满足。用于排序，不用于是否通过。 */
  margin: number;
}

/** 练度对功能性能力的折扣：低练角色的盾、奶、附着强度都会下降，但机制种类不变。 */
export function utilityScale(tier: keyof typeof TIER_MULTIPLIER): number {
  return 0.6 + 0.4 * TIER_MULTIPLIER[tier];
}

function scaledStrength(member: TeamMember, cap: MechanicCapability): number {
  return cap.strength * utilityScale(member.user.tier);
}

function rateOf(cap: MechanicCapability): number {
  return cap.frequency ? RATE_RANK[cap.frequency] : RATE_RANK.low;
}

function conditionMet(team: TeamMember[], self: TeamMember, cond: TeamCondition): boolean {
  switch (cond.type) {
    case "requires-element":
      return team.some(
        (m) =>
          m.base.id !== self.base.id &&
          m.base.capabilities.some(
            (c) => c.type === "element-application" && c.element === cond.element,
          ),
      );
    case "requires-character":
      return team.some((m) => m.base.id === cond.characterId);
    case "requires-role":
      return team.some(
        (m) => m.base.id !== self.base.id && cond.role !== undefined && m.base.roles.includes(cond.role),
      );
    default:
      return true;
  }
}

/**
 * 能力生效系数。条件未满足时按 degradedTo 打折；degradedTo === 0 表示完全失效。
 */
export function capabilityFactor(
  team: TeamMember[],
  member: TeamMember,
  cap: MechanicCapability,
): number {
  if (!cap.conditions || cap.conditions.length === 0) return 1;
  let factor = 1;
  for (const cond of cap.conditions) {
    if (!conditionMet(team, member, cond)) factor = Math.min(factor, cond.degradedTo);
  }
  return factor;
}

function capabilityUsable(
  team: TeamMember[],
  member: TeamMember,
  cap: MechanicCapability,
): boolean {
  return capabilityFactor(team, member, cap) > 0;
}

export interface ElementApplication {
  characterId: string;
  rate: number;
  strength: number;
}

/** 队伍对某元素的附着能力，按频率降序。 */
export function elementApplications(team: TeamMember[], element: Element): ElementApplication[] {
  const out: ElementApplication[] = [];
  for (const member of team) {
    for (const cap of member.base.capabilities) {
      if (cap.type !== "element-application" || cap.element !== element) continue;
      if (!capabilityUsable(team, member, cap)) continue;
      out.push({
        characterId: member.base.id,
        rate: rateOf(cap),
        strength: scaledStrength(member, cap),
      });
    }
  }
  return out.sort((a, b) => b.rate - a.rate || b.strength - a.strength);
}

function bestApplication(
  team: TeamMember[],
  element: Element,
  minRate: number,
): ElementApplication | undefined {
  return elementApplications(team, element).find((a) => a.rate >= minRate);
}

function anyOtherApplication(
  team: TeamMember[],
  exclude: Element,
  minRate: number,
): ElementApplication | undefined {
  for (const member of team) {
    for (const cap of member.base.capabilities) {
      if (cap.type !== "element-application" || !cap.element || cap.element === exclude) continue;
      if (rateOf(cap) < minRate) continue;
      if (!capabilityUsable(team, member, cap)) continue;
      return {
        characterId: member.base.id,
        rate: rateOf(cap),
        strength: scaledStrength(member, cap),
      };
    }
  }
  return undefined;
}

function sumCapability(
  team: TeamMember[],
  predicate: (cap: MechanicCapability, member: TeamMember) => boolean,
): { total: number; best: number; providers: string[] } {
  let total = 0;
  let best = 0;
  const providers: string[] = [];
  for (const member of team) {
    for (const cap of member.base.capabilities) {
      if (!predicate(cap, member)) continue;
      const factor = capabilityFactor(team, member, cap);
      if (factor <= 0) continue;
      const value = scaledStrength(member, cap) * factor;
      total += value;
      if (value > best) best = value;
      if (!providers.includes(member.base.id)) providers.push(member.base.id);
    }
  }
  return { total, best, providers };
}

export function reactionSupported(
  team: TeamMember[],
  reaction: ReactionId,
  minRate: Rate = "low",
): { satisfied: boolean; providers: string[]; detail: string } {
  const minRank = RATE_RANK[minRate];

  // 1) 角色自带的"直接触发该反应"能力（例如专属机制角色）。
  for (const member of team) {
    for (const cap of member.base.capabilities) {
      if (cap.type !== "reaction-enable" || cap.reactionId !== reaction) continue;
      if (rateOf(cap) < minRank) continue;
      const conditionsOk =
        !cap.conditions ||
        cap.conditions.every((cond) => conditionMet(team, member, cond));
      if (conditionsOk) {
        return {
          satisfied: true,
          providers: [member.base.id],
          detail: `${member.base.name}直接提供${REACTION_LABEL[reaction]}触发能力`,
        };
      }
    }
  }

  // 2) 由两种元素的附着组合而成。
  const pair = REACTION_ELEMENTS[reaction];
  const first = bestApplication(team, pair[0], minRank);
  if (!first) {
    return {
      satisfied: false,
      providers: [],
      detail: `缺少${RATE_LABEL[minRate]}以上的${ELEMENT_LABEL[pair[0]]}附着`,
    };
  }
  if (pair[1] === "any") {
    const other = anyOtherApplication(team, pair[0], minRank);
    return other
      ? {
          satisfied: true,
          providers: [first.characterId, other.characterId],
          detail: `${REACTION_LABEL[reaction]}：${first.characterId} + ${other.characterId}`,
        }
      : {
          satisfied: false,
          providers: [first.characterId],
          detail: `缺少可与${ELEMENT_LABEL[pair[0]]}反应的第二元素`,
        };
  }
  const second = bestApplication(team, pair[1], minRank);
  if (!second) {
    return {
      satisfied: false,
      providers: [first.characterId],
      detail: `缺少${RATE_LABEL[minRate]}以上的${ELEMENT_LABEL[pair[1]]}附着`,
    };
  }
  return {
    satisfied: true,
    providers: [first.characterId, second.characterId],
    detail: `${REACTION_LABEL[reaction]}：${first.characterId} + ${second.characterId}`,
  };
}

/** 破盾效率：强度 × 频率系数。低频角色即使元素正确也破不动盾。 */
const FREQ_FACTOR: Record<number, number> = { 1: 0.4, 2: 0.75, 3: 1 };

export function checkRequirement(
  team: TeamMember[],
  req: MechanicRequirement,
): MechanicCheck {
  switch (req.type) {
    case "element": {
      const minRate = req.minimumApplicationRate ?? "low";
      const minRank = RATE_RANK[minRate];
      const providers: string[] = [];
      let bestRank = 0;
      for (const element of req.acceptedElements) {
        for (const app of elementApplications(team, element)) {
          bestRank = Math.max(bestRank, app.rate);
          if (app.rate >= minRank) providers.push(app.characterId);
        }
      }
      const satisfied = providers.length > 0;
      return {
        satisfied,
        requirement: req,
        providers,
        margin: bestRank - minRank,
        detail: satisfied
          ? `已有${RATE_LABEL[minRate]}以上的${req.acceptedElements
              .map((e) => ELEMENT_LABEL[e])
              .join("/")}附着：${providers.join("、")}`
          : `需要${RATE_LABEL[minRate]}以上的${req.acceptedElements
              .map((e) => ELEMENT_LABEL[e])
              .join("/")}附着，当前队伍最高只有${
              bestRank === 0 ? "无" : ["", "低", "中", "高"][bestRank]
            }频`,
      };
    }

    case "reaction": {
      const minRate = req.minimumTriggerRate ?? "low";
      for (const reaction of req.acceptedReactions) {
        const result = reactionSupported(team, reaction, minRate);
        if (result.satisfied) {
          return {
            satisfied: true,
            requirement: req,
            providers: result.providers,
            margin: 0,
            detail: result.detail,
          };
        }
      }
      const first = req.acceptedReactions[0];
      const failure = first ? reactionSupported(team, first, minRate) : undefined;
      return {
        satisfied: false,
        requirement: req,
        providers: [],
        margin: -1,
        detail: `无法稳定触发${req.acceptedReactions.map((r) => REACTION_LABEL[r]).join("/")}${
          failure ? `（${failure.detail}）` : ""
        }`,
      };
    }

    case "shield-break": {
      let best = 0;
      const providers: string[] = [];
      for (const element of req.effectiveElements) {
        for (const app of elementApplications(team, element)) {
          const efficiency = app.strength * (FREQ_FACTOR[app.rate] ?? 0.4);
          if (efficiency > best) best = efficiency;
          if (efficiency >= req.minimumEfficiency) providers.push(app.characterId);
        }
      }
      const satisfied = providers.length > 0;
      return {
        satisfied,
        requirement: req,
        providers,
        margin: best - req.minimumEfficiency,
        detail: satisfied
          ? `可破${ELEMENT_LABEL[req.shieldElement]}盾：${providers.join("、")}`
          : `破${ELEMENT_LABEL[req.shieldElement]}盾需要${req.effectiveElements
              .map((e) => ELEMENT_LABEL[e])
              .join("/")}效率 ≥ ${req.minimumEfficiency}，当前最高 ${best.toFixed(1)}`,
      };
    }

    case "healing": {
      const { total, best, providers } = sumCapability(team, (cap) => {
        if (cap.type !== "healing") return false;
        if (req.scope === "party-wide") return cap.scope === "party-wide";
        return true;
      });
      const value = Math.max(best, total * 0.7);
      const satisfied = value >= req.minimumStrength && providers.length > 0;
      const scopeLabel = req.scope === "party-wide" ? "全队治疗" : "治疗";
      return {
        satisfied,
        requirement: req,
        providers,
        margin: value - req.minimumStrength,
        detail: satisfied
          ? `${scopeLabel}充足：${providers.join("、")}`
          : `需要${scopeLabel}强度 ≥ ${req.minimumStrength}，当前 ${value.toFixed(1)}${
              req.scope === "party-wide" ? "（单体治疗不计入）" : ""
            }`,
      };
    }

    case "control": {
      const { total, providers } = sumCapability(
        team,
        (cap) => cap.type === "control" || cap.type === "grouping",
      );
      const satisfied = total >= req.minimumStrength;
      return {
        satisfied,
        requirement: req,
        providers,
        margin: total - req.minimumStrength,
        detail: satisfied
          ? `控制/聚怪充足：${providers.join("、")}`
          : `需要控制强度 ≥ ${req.minimumStrength}，当前 ${total.toFixed(1)}`,
      };
    }

    case "interrupt-resistance": {
      const { best, total, providers } = sumCapability(
        team,
        (cap) =>
          cap.type === "interrupt-resistance" ||
          cap.type === "shield" ||
          cap.type === "damage-reduction",
      );
      const value = Math.max(best, total * 0.6);
      const satisfied = value >= req.minimumStrength;
      return {
        satisfied,
        requirement: req,
        providers,
        margin: value - req.minimumStrength,
        detail: satisfied
          ? `抗打断充足：${providers.join("、")}`
          : `需要抗打断强度 ≥ ${req.minimumStrength}，当前 ${value.toFixed(1)}`,
      };
    }

    case "custom": {
      const min = req.minimumStrength ?? 0.01;
      const { best, providers } = sumCapability(
        team,
        (cap) => cap.type === "custom" && cap.mechanicId === req.mechanicId,
      );
      const satisfied = providers.length > 0 && best >= min;
      return {
        satisfied,
        requirement: req,
        providers,
        margin: best - min,
        detail: satisfied
          ? `具备专项机制 ${req.mechanicId}：${providers.join("、")}`
          : `缺少专项机制 ${req.mechanicId}`,
      };
    }
  }
}

/** 单个角色是否可能成为某需求的提供者（用于稀缺度与预留分析）。 */
export function canProvide(member: TeamMember, req: MechanicRequirement): boolean {
  return checkRequirement([member], req).satisfied;
}

export function describeRequirement(req: MechanicRequirement): string {
  switch (req.type) {
    case "element":
      return `${req.acceptedElements.map((e) => ELEMENT_LABEL[e]).join("/")}附着（${
        RATE_LABEL[req.minimumApplicationRate ?? "low"]
      }以上）`;
    case "reaction":
      return `${req.acceptedReactions.map((r) => REACTION_LABEL[r]).join("/")}（${
        RATE_LABEL[req.minimumTriggerRate ?? "low"]
      }以上）`;
    case "shield-break":
      return `破${ELEMENT_LABEL[req.shieldElement]}盾（用${req.effectiveElements
        .map((e) => ELEMENT_LABEL[e])
        .join("/")}，效率≥${req.minimumEfficiency}）`;
    case "healing":
      return `${req.scope === "party-wide" ? "全队治疗" : "治疗"}≥${req.minimumStrength}`;
    case "control":
      return `控制/聚怪≥${req.minimumStrength}`;
    case "interrupt-resistance":
      return `抗打断≥${req.minimumStrength}`;
    case "custom":
      return `专项机制 ${req.mechanicId}`;
  }
}
