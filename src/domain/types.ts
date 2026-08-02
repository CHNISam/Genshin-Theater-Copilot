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

/** 中文标签。界面与求解器的解释文本都用它，避免给中文用户看到 cryo/hydro。 */
export const ELEMENT_LABEL: Record<Element, string> = {
  pyro: "火",
  hydro: "水",
  electro: "雷",
  cryo: "冰",
  anemo: "风",
  geo: "岩",
  dendro: "草",
};

export const REACTION_LABEL: Record<ReactionId, string> = {
  vaporize: "蒸发",
  melt: "融化",
  "electro-charged": "感电",
  frozen: "冻结",
  superconduct: "超导",
  overload: "超载",
  bloom: "绽放",
  quicken: "原激化",
  burning: "燃烧",
  swirl: "扩散",
  crystallize: "结晶",
  "lunar-charged": "月感电",
  "lunar-bloom": "月绽放",
};

export const ROLE_LABEL: Record<CharacterRole, string> = {
  "main-dps": "主输出",
  "sub-dps": "副输出",
  buffer: "增益",
  healer: "治疗",
  shielder: "护盾",
  control: "控制",
  battery: "充能",
};

export const RATE_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "低频",
  medium: "中频",
  high: "高频",
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

/** 由低到高。顺序有意义：UI 排序与「缺省取最高难度」都依赖它。 */
export const DIFFICULTIES = ["light", "normal", "hard", "visionary", "moonlit"] as const;

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  light: "轻简",
  normal: "普通",
  hard: "困难",
  visionary: "卓越",
  moonlit: "月谕",
};

/**
 * 本局目标。必须由用户先选择——它会改变求解结论，不能默认。
 *
 * 圣牌与星章是**两个正交的开关**，不能揉成一条线：
 *  - tablets：打不打两场圣牌挑战。圣牌不是通关前置，不打就整体跳过，耐力全给主线。
 *  - stars：追不追每幕明星挑战的星章。追星对输出与速度有要求，此时不再回避"用强了"。
 * 二者可以任意组合（例如只打主线但追星）。
 */
export interface RunObjective {
  difficulty: Difficulty;
  tablets: boolean;
  stars: boolean;
}

export function describeObjective(objective: RunObjective): string {
  if (objective.tablets && objective.stars) return "满星（含圣牌）";
  if (objective.tablets) return "通关 + 圣牌";
  if (objective.stars) return "通关 + 追星";
  return "只求通关";
}

/**
 * 单个难度的规则。
 *
 * 关键事实：五个难度**共用同一套 10 幕**，区别只在打到第几幕、敌人多强、准入门槛多高。
 * 轻简的第 3 幕就是月谕的第 3 幕，所以关卡本身绝不能按难度复制五份——
 * 那会让同一个机制事实存五个副本，改一处就得改五处。
 */
export interface DifficultyRules {
  /** 通关需要完成到第几幕。已核实：轻简 3 / 普通 6 / 困难 8 / 卓越 10 / 月谕 10。 */
  clearAtAct: number;
  /** 本难度是否包含圣牌挑战关卡。已核实：仅月谕包含。 */
  includesTablets: boolean;

  teamSize: number;
  defaultVigor: number;
  initialRefreshes: number;
  /** 助演角色是否计入准入数量。 */
  supportGuestCountsForEntry: boolean;

  /* 以下三项尚未全部核实。未核实的难度必须留空，不得填推测值。 */
  /** 准入所需的符合元素与等级要求的备选角色数量。 */
  requiredCharacterCount?: number;
  /** 准入所需的角色最低等级。 */
  minimumCharacterLevel?: number;
  /** 本难度的敌人等级。 */
  enemyLevel?: number;

  note?: string;
}

/**
 * 某一难度解析出来的规则视图：难度自身的参数 + 由共享关卡表推导出的结构数字。
 * 下游只读这个，不需要知道"幕数是算出来的"。
 */
export interface ResolvedRules extends DifficultyRules {
  /** 本难度实际要打的主线幕数（= clearAtAct）。 */
  mainActCount: number;
  /** 本难度实际包含的圣牌挑战场次。 */
  tabletChallengeCount: number;
  /** 本难度范围内的首领幕位。 */
  bossActOrders: number[];
}

export type SeasonStatus = "draft" | "review" | "published" | "archived";

export interface SeasonConfig {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: SeasonStatus;

  /* 以下三项与难度无关，全赛季共享。 */
  allowedElements: Element[];
  openingCharacterIds: string[];
  specialGuestIds: string[];
  buffs: BuffConfig[];

  /** 全难度共享的关卡表：10 幕主线 + 圣牌挑战。难度只决定打到哪一幕、含不含圣牌。 */
  stages: StageConfig[];
  bosses: BossConfig[];

  /**
   * 各难度的规则。未录入的难度必须直接缺席这张表——
   * "支持哪些难度"由本表的键派生，不允许单独声明，否则会出现"声明支持但没有数据"的假支持。
   */
  difficulties: Partial<Record<Difficulty, DifficultyRules>>;

  sourceRecords: SourceRecord[];

  unresolvedQuestions: UnresolvedQuestion[];
  dataVersion: number;
  generatedAt: string;
  reviewedAt?: string;
}

/**
 * 赛季 + 已选难度解析出的扁平视图。
 *
 * 求解器只吃这个，不吃 `SeasonConfig`——这样"忘了按难度取数据"在类型层面就编译不过。
 */
export interface ResolvedSeason {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: SeasonStatus;

  allowedElements: Element[];
  openingCharacterIds: string[];
  specialGuestIds: string[];
  buffs: BuffConfig[];

  /** 本视图对应的难度。 */
  difficulty: Difficulty;
  rules: ResolvedRules;
  /** 已按通关线与圣牌开关裁剪过的关卡：本难度真正要打的那些。 */
  stages: StageConfig[];
  bosses: BossConfig[];

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
