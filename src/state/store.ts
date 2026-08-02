import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Difficulty,
  ResolvedSeason,
  Roster,
  RunObjective,
  RunState,
  SeasonConfig,
} from "../domain/types";
import { PUBLISHED_SEASONS, seasonById, seasonForDate } from "../data/seasons";
import {
  isDifficultySupported,
  resolveSeason,
  supportedDifficulties,
  tryResolveSeason,
} from "../season/resolve";
import { CHARACTER_BY_ID } from "../data/characters";
import { loadState, saveState } from "../storage/local";

export function createRunState(
  season: SeasonConfig,
  roster: Roster,
  objective: RunObjective,
): RunState {
  // 关卡结构、耐力、刷新次数全部来自所选难度，不能用赛季顶层的"某一套"。
  const resolved = resolveSeason(season, objective.difficulty);
  const stages = [...resolved.stages].sort((a, b) => a.order - b.order);
  const owned = roster.characters.filter((c) => c.tier !== "unused");
  const vigor: Record<string, number> = {};
  for (const c of owned) vigor[c.characterId] = resolved.rules.defaultVigor;
  if (roster.supportGuestId) vigor[roster.supportGuestId] = resolved.rules.defaultVigor;

  const openingOwned = owned
    .map((c) => c.characterId)
    .filter((id) => season.openingCharacterIds.includes(id));

  return {
    seasonId: season.id,
    objective,
    currentStageId: stages[0]?.id ?? "",
    completedStageIds: [],
    unlockedCharacterIds: [
      ...openingOwned,
      ...(roster.supportGuestId ? [roster.supportGuestId] : []),
    ],
    standbyCharacterIds: owned
      .map((c) => c.characterId)
      .filter((id) => !openingOwned.includes(id)),
    vigor,
    blossoms: 0,
    refreshesRemaining: resolved.rules.initialRefreshes,
    buffLevels: {},
    buffBranchChoices: {},
    stageOverrides: {},
    eventCandidates: [],
    releasedReservations: [],
  };
}

export interface AppStore {
  season: SeasonConfig;
  /**
   * 当前难度解析出的赛季视图。目标未选定、或所选难度在本赛季包中未录入时为 null。
   * 求解器与展示关卡结构的界面都必须用它，而不是直接读 `season`。
   */
  resolvedSeason: ResolvedSeason | null;
  /** 本赛季包实际录入了哪些难度（派生自数据，不可声明）。 */
  supportedDifficulties: Difficulty[];
  /** 本局目标。必须先选择，未选择时为 null。 */
  objective: RunObjective | null;
  setObjective: (objective: RunObjective) => void;
  seasons: SeasonConfig[];
  setSeasonId: (id: string) => void;
  roster: Roster;
  setRoster: (roster: Roster) => void;
  run: RunState | null;
  setRun: (run: RunState | null) => void;
  updateRun: (patch: Partial<RunState>) => void;
  startRun: () => void;
  /**
   * 记录"这一关我实际上用了这四个人"。
   * 耐力由此推导，用户不需要手填；也不要求这四个人就是我们推荐的那四个。
   */
  confirmTeam: (memberIds: string[]) => void;
  /** 撤销上一次确认出战（点错了、或者想改主意）。 */
  undo: () => void;
  canUndo: boolean;
  characters: typeof CHARACTER_BY_ID;
}

export function useAppStore(): AppStore {
  const seasons = useMemo(() => PUBLISHED_SEASONS(), []);
  const persisted = useMemo(() => loadState(), []);
  const fallback = seasonForDate(new Date(), seasons) ?? seasons[0];

  const [seasonId, setSeasonId] = useState<string>(
    persisted?.seasonId ?? fallback?.id ?? "",
  );
  const [roster, setRoster] = useState<Roster>(persisted?.roster ?? { characters: [] });
  const [run, setRun] = useState<RunState | null>(persisted?.run ?? null);
  const [history, setHistory] = useState<RunState[]>([]);
  const [objective, setObjective] = useState<RunObjective | null>(
    persisted?.objective ?? persisted?.run?.objective ?? null,
  );

  const season = useMemo(
    () => seasonById(seasonId, seasons) ?? fallback ?? seasons[0]!,
    [seasonId, seasons, fallback],
  );

  const supported = useMemo(() => supportedDifficulties(season), [season]);

  /*
   * 换赛季后，上一个赛季选定的难度可能在新赛季包里根本没录入。
   * 此时必须清空目标让用户重选，而不是回退到某个"有数据的"难度——
   * 那会让用户以为自己还在打原来那档。
   */
  useEffect(() => {
    if (objective && !isDifficultySupported(season, objective.difficulty)) {
      setObjective(null);
      setRun(null);
      setHistory([]);
    }
  }, [season, objective]);

  const resolvedSeason = useMemo(
    () => (objective ? tryResolveSeason(season, objective.difficulty) ?? null : null),
    [season, objective],
  );

  useEffect(() => {
    saveState({ seasonId: season.id, roster, run, objective });
  }, [season.id, roster, run, objective]);

  const updateRun = useCallback((patch: Partial<RunState>) => {
    setRun((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const startRun = useCallback(() => {
    if (!objective) return;
    setHistory([]);
    setRun(createRunState(season, roster, objective));
  }, [season, roster, objective]);

  const confirmTeam = useCallback(
    (memberIds: string[]) => {
      setRun((prev) => {
        if (!prev) return prev;
        setHistory((h) => [...h.slice(-19), prev]);
        const vigor = { ...prev.vigor };
        for (const id of memberIds) {
          vigor[id] = Math.max(0, (vigor[id] ?? 0) - 1);
        }
        // 推进关卡必须走本局难度的关卡表。
        const ordered = [...resolveSeason(season, prev.objective.difficulty).stages].sort(
          (a, b) => a.order - b.order,
        );
        const index = ordered.findIndex((s) => s.id === prev.currentStageId);
        const next = ordered[index + 1];
        return {
          ...prev,
          vigor,
          completedStageIds: [...prev.completedStageIds, prev.currentStageId],
          currentStageId: next?.id ?? prev.currentStageId,
          eventCandidates: [],
        };
      });
    },
    [season],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      const previous = h[h.length - 1];
      if (previous) setRun(previous);
      return h.slice(0, -1);
    });
  }, []);

  return {
    season,
    resolvedSeason,
    supportedDifficulties: supported,
    objective,
    setObjective,
    seasons,
    setSeasonId,
    roster,
    setRoster,
    run,
    setRun,
    updateRun,
    startRun,
    confirmTeam,
    undo,
    canUndo: history.length > 0,
    characters: CHARACTER_BY_ID,
  };
}
