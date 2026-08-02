/**
 * 难度解析：把「按难度分套的赛季包」投影成「某一难度的扁平视图」。
 *
 * 这是纯投影，不含任何策略判断——求解优先级、机制取舍一律不在这里发生。
 * 求解器与 UI 都只应该拿到 `ResolvedSeason`，从而不可能误用别的难度的关卡结构。
 */
import type {
  BossConfig,
  Difficulty,
  ResolvedSeason,
  SeasonConfig,
  StageConfig,
} from "../domain/types";
import { DIFFICULTIES, DIFFICULTY_LABEL } from "../domain/types";

/**
 * 该赛季包**实际录入**了哪些难度，按固定难度顺序返回。
 * 这是从数据派生的，不是声明出来的——没有数据就不会出现在这里。
 */
export function supportedDifficulties(season: SeasonConfig): Difficulty[] {
  return DIFFICULTIES.filter((d) => season.difficulties[d] !== undefined);
}

export function isDifficultySupported(season: SeasonConfig, difficulty: Difficulty): boolean {
  return season.difficulties[difficulty] !== undefined;
}

/**
 * 缺省难度：优先取最高的已录入难度。
 * 用于「用户还没选」的场景，任何会改变结论的地方仍必须让用户显式选择。
 */
export function defaultDifficulty(season: SeasonConfig): Difficulty | undefined {
  const supported = supportedDifficulties(season);
  return supported[supported.length - 1];
}

export class UnsupportedDifficultyError extends Error {
  constructor(
    readonly seasonId: string,
    readonly difficulty: Difficulty,
    readonly supported: Difficulty[],
  ) {
    super(
      `赛季 ${seasonId} 未录入「${DIFFICULTY_LABEL[difficulty]}」难度的关卡结构` +
        `（已录入：${supported.map((d) => DIFFICULTY_LABEL[d]).join("、") || "无"}）`,
    );
    this.name = "UnsupportedDifficultyError";
  }
}

/**
 * 解析出指定难度的扁平视图。难度未录入时抛错——绝不静默回退到别的难度，
 * 那会让用户拿到一份看起来正常、实际上属于另一个难度的攻略。
 */
export function resolveSeason(season: SeasonConfig, difficulty: Difficulty): ResolvedSeason {
  const pack = season.difficulties[difficulty];
  if (!pack) {
    throw new UnsupportedDifficultyError(season.id, difficulty, supportedDifficulties(season));
  }
  return {
    id: season.id,
    name: season.name,
    startsAt: season.startsAt,
    endsAt: season.endsAt,
    status: season.status,

    allowedElements: season.allowedElements,
    openingCharacterIds: season.openingCharacterIds,
    specialGuestIds: season.specialGuestIds,
    buffs: season.buffs,

    difficulty,
    rules: pack.rules,
    stages: pack.stages,
    bosses: pack.bosses,

    sourceRecords: season.sourceRecords,
    unresolvedQuestions: season.unresolvedQuestions,
    dataVersion: season.dataVersion,
    generatedAt: season.generatedAt,
    reviewedAt: season.reviewedAt,
  };
}

/**
 * 全难度关卡的扁平列表，仅供跨版本 diff 一类的全局巡检使用。
 * 关卡 id 全季唯一，所以拍平不会丢信息。**求解器不得使用**——它必须按难度取数据。
 */
export function allStages(season: SeasonConfig): StageConfig[] {
  return supportedDifficulties(season).flatMap((d) => season.difficulties[d]!.stages);
}

/** 同上，全难度首领的扁平列表。 */
export function allBosses(season: SeasonConfig): BossConfig[] {
  return supportedDifficulties(season).flatMap((d) => season.difficulties[d]!.bosses);
}

/** 解析失败时返回 undefined 的版本，供 UI 在「难度不可选」时使用。 */
export function tryResolveSeason(
  season: SeasonConfig,
  difficulty: Difficulty,
): ResolvedSeason | undefined {
  return season.difficulties[difficulty] ? resolveSeason(season, difficulty) : undefined;
}
