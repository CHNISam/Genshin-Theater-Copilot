/**
 * TheaterPilot 领域模型。
 *
 * 这里只描述"事实结构"，不包含任何策略。策略全部在 src/solver 中，
 * 且必须是纯函数，方便测试与回放。
 */

export const ELEMENTS = [
  "pyro",
  "hydro",
  "electro",
  "cryo",
  "anemo",
  "geo",
  "dendro",
] as const;
export type Element = (typeof ELEMENTS)[number];

export const REACTIONS = [
  "vaporize",
  "melt",
  "electro-charged",
  "frozen",
  "superconduct",
  "overload",
  "bloom",
  "quicken",
  "burning",
  "swirl",
  "crystallize",
  "lunar-charged",
  "lunar-bloom",
] as const;
export type ReactionId = (typeof REACTIONS)[number];

/** 反应所需的两种元素。swirl / crystallize 的第二个元素是通配。 */
export const REACTION_ELEMENTS: Record<ReactionId, [Element, Element | "any"]> = {
  vaporize: ["pyro", "hydro"],
  melt: ["pyro", "cryo"],
  "electro-charged": ["hydro", "electro"],
  frozen: ["hydro", "cryo"],
  superconduct: ["cryo", "electro"],
  overload: ["pyro", "electro"],
  bloom: ["hydro", "dendro"],
  quicken: ["dendro", "electro"],
  burning: ["dendro", "pyro"],
  swirl: ["anemo", "any"],
  crystallize: ["geo", "any"],
  "lunar-charged": ["hydro", "electro"],
  "lunar-bloom": ["hydro", "dendro"],
};

export type Rate = "low" | "medium" | "high";
export const RATE_RANK: Record<Rate, number> = { low: 1, medium: 2, high: 3 };

export type Confidence = "confirmed" | "high" | "medium" | "low";
export const CONFIDENCE_RANK: Record<Confidence, number> = {
  confirmed: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export type EvidenceType =
  | "official-confirmed"
  | "community-confirmed"
  | "user-observed"
  | "inferred"
  | "unknown";

export interface SourceRecord {
  title: string;
  sourceType: EvidenceType;
  url?: string;
  publishedAt?: string;
  accessedAt: string;
  excerpt?: string;
  confidence: Confidence;
}

export interface UnresolvedQuestion {
  id: string;
  question: string;
  /** 互相冲突的说法，必须原样保留，不得由 Agent 自行消解。 */
  conflictingClaims: { claim: string; source: string; confidence: Confidence }[];
  blocksPublish: boolean;
}

/* ------------------------------------------------------------------ *
 * 角色能力
 * ------------------------------------------------------------------ */

export type MechanicType =
  | "element-application"
  | "reaction-enable"
  | "healing"
  | "shield"
  | "damage-reduction"
  | "interrupt-resistance"
  | "control"
  | "grouping"
  | "energy"
  | "custom";

export type HealScope = "active-character" | "party-wide";

export interface TeamCondition {
  type: "requires-element" | "requires-character" | "requires-role";
  element?: Element;
  characterId?: string;
  role?: CharacterRole;
  /** 缺失该条件时体系还能运转到什么程度：0 完全失效，1 无影响。 */
  degradedTo: number;
  note?: string;
}

/**
 * 一条真实机制能力。注意：元素本身不等于机制能力，
 * 同元素低频挂载与高频挂载必须用 frequency 区分（求解器据此拒绝误判）。
 */
export interface MechanicCapability {
  type: MechanicType;
  element?: Element;
  reactionId?: ReactionId;
  scope?: HealScope;
  mechanicId?: string;
  /** 0~5，能力强度。 */
  strength: number;
  frequency?: Rate;
  /** 该能力生效的前置条件（例如需要队伍中有水系）。 */
  conditions?: TeamCondition[];
  note?: string;
}

export type CharacterRole =
  | "main-dps"
  | "sub-dps"
  | "buffer"
  | "healer"
  | "shielder"
  | "control"
  | "battery";

export interface CharacterBase {
  id: string;
  name: string;
  element: Element;
  weaponType: string;
  rarity: 4 | 5;
  roles: CharacterRole[];
  /** 参考练度下的输出档位，0~10。求解器只把它当作最低优先级的评分项。 */
  baseDamage: number;
  capabilities: MechanicCapability[];
  /** 刚需队友条件，缺失时体系运转分下降。 */
  teammateNeeds?: TeamCondition[];
  tags?: string[];
}

/* ------------------------------------------------------------------ *
 * 用户侧数据（渐进式，默认只需要四档练度）
 * ------------------------------------------------------------------ */

export type InvestmentTier = "core" | "usable" | "trinket" | "unused";

export const TIER_MULTIPLIER: Record<InvestmentTier, number> = {
  core: 1,
  usable: 0.72,
  trinket: 0.35,
  unused: 0,
};

export interface UserCharacter {
  characterId: string;
  tier: InvestmentTier;
  /** 以下均为可选，只有在确实会改变推荐时才向用户追问。 */
  constellation?: number;
  weaponQuality?: "signature" | "good" | "basic";
  talentLevel?: number;
  note?: string;
}

export interface Roster {
  ownerLabel?: string;
  characters: UserCharacter[];
  /** 助演角色（不计入准入数量，但可出战）。 */
  supportGuestId?: string;
  supportGuestCandidates?: string[];
}

/* ------------------------------------------------------------------ *
 * 关卡与机制需求
 * ------------------------------------------------------------------ */

export type StageType = "normal" | "boss" | "defense" | "survival" | "tablet";

export type MechanicRequirement =
  | {
      type: "element";
      acceptedElements: Element[];
      minimumApplicationRate?: Rate;
      note?: string;
    }
  | {
      type: "reaction";
      acceptedReactions: ReactionId[];
      minimumTriggerRate?: Rate;
      note?: string;
    }
  | {
      type: "shield-break";
      shieldElement: Element;
      effectiveElements: Element[];
      minimumEfficiency: number;
      note?: string;
    }
  | {
      type: "healing";
      scope: HealScope;
      minimumStrength: number;
      note?: string;
    }
  | { type: "control"; minimumStrength: number; note?: string }
  | { type: "interrupt-resistance"; minimumStrength: number; note?: string }
  | { type: "custom"; mechanicId: string; minimumStrength?: number; note?: string };

export interface MechanicRecommendation {
  requirement: MechanicRequirement;
  /** 满足时的加分权重，0~1。 */
  weight: number;
  reason: string;
}

export interface StageConfig {
  id: string;
  order: number;
  name: string;
  type: StageType;
  /** 是否为固定关卡（固定首领 / 固定圣牌），随机普通关为 false。 */
  fixed: boolean;
  enemyIds: string[];
  hardRequirements: MechanicRequirement[];
  softRecommendations: MechanicRecommendation[];
  /** 0~5 */
  damagePressure: number;
  survivalPressure: number;
  controlValue: number;
  sourceRecords: SourceRecord[];
  confidence: Confidence;
  note?: string;
}

export interface BossConfig {
  id: string;
  name: string;
  stageId?: string;
  hardMechanics: MechanicRequirement[];
  effectiveElements: Element[];
  effectiveReactions: ReactionId[];
  notRecommended: { approach: string; reason: string }[];
  sourceRecords: SourceRecord[];
  confidence: Confidence;
}

/* ------------------------------------------------------------------ *
 * 辉彩祝福
 * ------------------------------------------------------------------ */

export interface BuffBranch {
  id: string;
  level: number;
  name: string;
  description: string;
  /** 该分支主要提供什么类型的价值。 */
  value: Partial<ReactionValue>;
}

export interface BuffLevelEffect {
  level: 1 | 2 | 3 | 4;
  description: string;
  value: ReactionValue;
  /** 该等级是否是质变点（例如 2 级解锁分支）。 */
  breakpoint?: boolean;
  cost: number;
}

export interface BuffConfig {
  id: string;
  name: string;
  reactionId: ReactionId;
  levels: BuffLevelEffect[];
  branches: BuffBranch[];
  sourceRecords: SourceRecord[];
  confidence: Confidence;
  /** 版本调整说明。 */
  patchNote?: string;
}

/** 一个反应的价值必须分开记账：它可能根本不是为了伤害。 */
export interface ReactionValue {
  mechanicValue: number;
  damageValue: number;
  controlValue: number;
  buffValue: number;
}

/* ------------------------------------------------------------------ *
 * 赛季
 * ------------------------------------------------------------------ */

/** 难度：轻简 / 普通 / 困难 / 卓越 / 月谕。 */
export type Difficulty = "light" | "normal" | "hard" | "visionary" | "moonlit";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  light: "轻简",
  normal: "普通",
  hard: "困难",
  visionary: "卓越",
  moonlit: "月谕",
};

/**
 * 本局目标。必须由用户先选择——它会改变求解结论，不能默认。
 *  - clear               只求通关最后一幕；圣牌挑战不是通关前置，可整体跳过
 *  - clear-with-tablets  通关 + 完成两场圣牌挑战（全部完成后可抽月谕圣牌）
 *  - full-stars          追满星章：每幕明星挑战都要达成，对输出与速度要求更高
 */
export type RunGoal = "clear" | "clear-with-tablets" | "full-stars";

export const GOAL_LABEL: Record<RunGoal, string> = {
  clear: "只求通关",
  "clear-with-tablets": "通关 + 圣牌挑战",
  "full-stars": "追满星章",
};

export interface RunObjective {
  difficulty: Difficulty;
  goal: RunGoal;
}

export interface SeasonRuleOverrides {
  defaultVigor: number;
  /** 该赛季包实际录入了哪些难度的结构。未录入的难度不得假装支持。 */
  supportedDifficulties: Difficulty[];
  teamSize: number;
  mainActCount: number;
  tabletChallengeCount: number;
  bossActOrders: number[];
  /** 助演角色是否计入准入数量。 */
  supportGuestCountsForEntry: boolean;
  initialRefreshes: number;
  note?: string;
}

export type SeasonStatus = "draft" | "review" | "published" | "archived";

export interface SeasonConfig {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: SeasonStatus;

  allowedElements: Element[];
  openingCharacterIds: string[];
  specialGuestIds: string[];

  buffs: BuffConfig[];
  stages: StageConfig[];
  bosses: BossConfig[];

  ruleOverrides: SeasonRuleOverrides;
  sourceRecords: SourceRecord[];

  unresolvedQuestions: UnresolvedQuestion[];
  dataVersion: number;
  generatedAt: string;
  reviewedAt?: string;
}

/* ------------------------------------------------------------------ *
 * 局内状态
 * ------------------------------------------------------------------ */

export interface RunState {
  seasonId: string;
  /** 本局目标：难度 + 通关目标。必须显式选择。 */
  objective: RunObjective;
  /** 当前待决策的关卡 id。 */
  currentStageId: string;
  completedStageIds: string[];
  /** 已解锁（可出战）角色。 */
  unlockedCharacterIds: string[];
  /** 待命角色（尚未可出战）。 */
  standbyCharacterIds: string[];
  /** characterId -> 剩余耐力 */
  vigor: Record<string, number>;
  blossoms: number;
  refreshesRemaining: number;
  buffLevels: Record<string, number>;
  buffBranchChoices: Record<string, string[]>;
  /** 局内实际观察到的关卡信息，优先级高于赛季固定配置。 */
  stageOverrides: Record<string, StageOverride>;
  /** 当前事件候选。 */
  eventCandidates: EventCandidate[];
  /** 用户主动接受风险而解除的预留。 */
  releasedReservations: string[];
}

export interface StageOverride {
  stageId: string;
  patch: Partial<
    Pick<
      StageConfig,
      | "type"
      | "enemyIds"
      | "hardRequirements"
      | "softRecommendations"
      | "damagePressure"
      | "survivalPressure"
      | "controlValue"
      | "name"
    >
  >;
  source: "user-confirmed" | "ocr" | "user-observed";
  confidence: Confidence;
}

export type EventCandidate =
  | { kind: "character"; characterId: string; cost: number }
  | { kind: "buff"; buffId: string; targetLevel: number; cost: number; branchId?: string }
  | { kind: "vigor"; characterId: string; amount: number; cost: number }
  | { kind: "blossom"; amount: number; cost: number };

/* ------------------------------------------------------------------ *
 * 导入结果的可信度包装
 * ------------------------------------------------------------------ */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedValue<T> {
  value: T;
  /** 0~1 */
  confidence: number;
  requiresConfirmation: boolean;
  sourceRegion?: BoundingBox;
  rawText?: string;
}
