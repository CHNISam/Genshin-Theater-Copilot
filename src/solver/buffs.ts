/**
 * 辉彩祝福动态评分。
 *
 * 祝福是随机出现的，不能按理想固定路线写死。每个候选都要按
 * "当前账号 × 剩余关卡"重新计算，并且必须把机制价值与伤害价值分开记账：
 * 某个反应可能根本不是为了伤害，而是某个首领的硬机制。
 */
import type {
  BuffConfig,
  ReactionValue,
  SeasonConfig,
  StageConfig,
} from "../domain/types";
import { REACTION_ELEMENTS } from "../domain/types";
import type { TeamMember } from "./roster";
import { reactionSupported } from "./mechanics";

export interface BuffEvaluation {
  buffId: string;
  buffName: string;
  currentLevel: number;
  targetLevel: number;
  cost: number;
  value: ReactionValue;
  /** 剩余关卡中预计能触发的场次。 */
  coverageStages: number;
  /** 能被覆盖到的核心角色。 */
  coveredCoreCharacters: string[];
  /** 该反应直接对应的关卡硬机制。 */
  mechanicStages: { stageId: string; stageName: string }[];
  /** 下一等级是否形成质变。 */
  breakpoint: boolean;
  total: number;
  explanation: string[];
}

export interface BuffEvaluationInput {
  season: SeasonConfig;
  remainingStages: StageConfig[];
  /** 当前可用（已解锁且有耐力）的角色。 */
  availableMembers: TeamMember[];
  buffLevels: Record<string, number>;
  blossoms: number;
}

/** 池子里是否具备触发该反应的元素结构（用整池近似，而不是逐队枚举）。 */
function poolCanTrigger(members: TeamMember[], buff: BuffConfig): boolean {
  if (members.length === 0) return false;
  return reactionSupported(members, buff.reactionId, "medium").satisfied;
}

function coreCharactersFor(members: TeamMember[], buff: BuffConfig): string[] {
  const pair = REACTION_ELEMENTS[buff.reactionId];
  const elements = new Set([pair[0], ...(pair[1] === "any" ? [] : [pair[1]])]);
  return members
    .filter((m) => m.user.tier === "core" && elements.has(m.base.element))
    .map((m) => m.base.name);
}

export function evaluateBuffOptions(input: BuffEvaluationInput): BuffEvaluation[] {
  const out: BuffEvaluation[] = [];

  for (const buff of input.season.buffs) {
    const currentLevel = input.buffLevels[buff.id] ?? 0;
    const targetLevel = currentLevel + 1;
    const effect = buff.levels.find((l) => l.level === targetLevel);
    if (!effect) continue;

    const triggerable = poolCanTrigger(input.availableMembers, buff);
    const explanation: string[] = [];

    // 机制价值：该反应是否直接对应剩余关卡的硬机制
    const mechanicStages: { stageId: string; stageName: string }[] = [];
    for (const stage of input.remainingStages) {
      for (const req of stage.hardRequirements) {
        if (req.type === "reaction" && req.acceptedReactions.includes(buff.reactionId)) {
          mechanicStages.push({ stageId: stage.id, stageName: stage.name });
        }
      }
    }

    // 覆盖场次：剩余关卡中，元素结构上能稳定触发的场数
    const coverageStages = triggerable ? input.remainingStages.length : 0;
    const coveredCore = coreCharactersFor(input.availableMembers, buff);

    if (!triggerable) {
      explanation.push(
        `当前可用角色无法稳定触发 ${buff.reactionId}，本级收益接近 0（不是伤害不够，而是根本不触发）。`,
      );
    } else {
      explanation.push(`剩余 ${coverageStages} 场中元素结构支持触发 ${buff.reactionId}。`);
    }
    if (coveredCore.length > 0) {
      explanation.push(`覆盖核心角色：${coveredCore.join("、")}。`);
    }
    if (mechanicStages.length > 0) {
      explanation.push(
        `${mechanicStages.map((s) => s.stageName).join("、")} 的硬机制直接需要该反应，属于机制价值而非伤害收益。`,
      );
    }
    if (effect.breakpoint) {
      explanation.push(`${targetLevel} 级是质变点（解锁分支或基础效果强化）。`);
    }

    const value: ReactionValue = {
      mechanicValue: effect.value.mechanicValue + mechanicStages.length * 3,
      damageValue: triggerable ? effect.value.damageValue : 0,
      controlValue: triggerable ? effect.value.controlValue : 0,
      buffValue: triggerable ? effect.value.buffValue : 0,
    };

    const affordable = input.blossoms >= effect.cost;
    if (!affordable) explanation.push(`幻剧之花不足（需要 ${effect.cost}，当前 ${input.blossoms}）。`);

    const total =
      value.mechanicValue * 6 +
      (value.damageValue + value.buffValue) * (coverageStages / Math.max(1, input.remainingStages.length)) * 2.2 +
      value.controlValue * 1.6 +
      coveredCore.length * 1.2 +
      (effect.breakpoint ? 3 : 0) -
      effect.cost * 0.4 -
      (affordable ? 0 : 100);

    out.push({
      buffId: buff.id,
      buffName: buff.name,
      currentLevel,
      targetLevel,
      cost: effect.cost,
      value,
      coverageStages,
      coveredCoreCharacters: coveredCore,
      mechanicStages,
      breakpoint: effect.breakpoint ?? false,
      total: Math.round(total * 100) / 100,
      explanation,
    });
  }

  return out.sort((a, b) => b.total - a.total);
}

export interface BuffPortfolio {
  primary?: BuffEvaluation;
  secondary?: BuffEvaluation;
  insurance?: BuffEvaluation;
  explanation: string[];
}

/**
 * 一条主反应重点投资、一条副反应中度投资、第三条作为低级容灾。
 * 但具体是哪一条，必须由当前账号与剩余关卡推出，而不是写死。
 */
export function planBuffPortfolio(evaluations: BuffEvaluation[]): BuffPortfolio {
  const usable = evaluations.filter((e) => e.coverageStages > 0 || e.mechanicStages.length > 0);
  const [primary, secondary, insurance] = usable;
  const explanation: string[] = [];
  if (primary) {
    explanation.push(
      `主线：${primary.buffName}（覆盖 ${primary.coverageStages} 场，核心角色 ${
        primary.coveredCoreCharacters.length
      } 名），优先升到高级。`,
    );
  }
  if (secondary) {
    explanation.push(`副线：${secondary.buffName}，中度投资，作为主线随机不理想时的替代。`);
  }
  if (insurance) {
    explanation.push(`容灾线：${insurance.buffName}，只拿低级高性价比效果。`);
  }
  if (usable.length === 0) {
    explanation.push("当前角色结构无法稳定触发任何祝福反应，应优先补角色而不是买祝福。");
  }
  return { primary, secondary, insurance, explanation };
}
