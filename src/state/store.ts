import { useCallback, useEffect, useMemo, useState } from "react";
import type { Roster, RunObjective, RunState, SeasonConfig } from "../domain/types";
import { PUBLISHED_SEASONS, seasonById, seasonForDate } from "../data/seasons";
import { CHARACTER_BY_ID } from "../data/characters";
import { loadState, saveState } from "../storage/local";

export function createRunState(
  season: SeasonConfig,
  roster: Roster,
  objective: RunObjective,
): RunState {
  const stages = [...season.stages].sort((a, b) => a.order - b.order);
  const owned = roster.characters.filter((c) => c.tier !== "unused");
  const vigor: Record<string, number> = {};
  for (const c of owned) vigor[c.characterId] = season.ruleOverrides.defaultVigor;
  if (roster.supportGuestId) vigor[roster.supportGuestId] = season.ruleOverrides.defaultVigor;

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
    refreshesRemaining: season.ruleOverrides.initialRefreshes,
    buffLevels: {},
    buffBranchChoices: {},
    stageOverrides: {},
    eventCandidates: [],
    releasedReservations: [],
  };
}

export interface AppStore {
  season: SeasonConfig;
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
        const ordered = [...season.stages].sort((a, b) => a.order - b.order);
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
