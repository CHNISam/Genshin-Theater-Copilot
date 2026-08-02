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
    setRun(createRunState(season, roster, objective));
  }, [season, roster, objective]);

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
    characters: CHARACTER_BY_ID,
  };
}
