import type { SeasonConfig } from "../../domain/types";
import { SEASON_2026_08 } from "./2026-08";

export const SEASONS: SeasonConfig[] = [SEASON_2026_08];

export const PUBLISHED_SEASONS = (): SeasonConfig[] =>
  SEASONS.filter((s) => s.status === "published");

/** 按当前日期自动匹配赛季；无匹配时退回最近一期已发布赛季。 */
export function seasonForDate(date: Date = new Date(), pool: SeasonConfig[] = SEASONS): SeasonConfig | undefined {
  const t = date.getTime();
  const published = pool.filter((s) => s.status === "published");
  const active = published.find(
    (s) => Date.parse(s.startsAt) <= t && t <= Date.parse(s.endsAt),
  );
  if (active) return active;
  return [...published].sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0];
}

export function seasonById(id: string, pool: SeasonConfig[] = SEASONS): SeasonConfig | undefined {
  return pool.find((s) => s.id === id);
}

export { SEASON_2026_08 };
