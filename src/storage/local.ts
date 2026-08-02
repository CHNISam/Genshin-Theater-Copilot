/**
 * 本地持久化 + JSON 导入导出。
 * 全部存在浏览器本地，不上传任何数据，也不涉及账号凭证。
 */
import type { Roster, RunObjective, RunState } from "../domain/types";

export interface PersistedState {
  version: 1;
  seasonId: string;
  roster: Roster;
  run: RunState | null;
  objective: RunObjective | null;
  updatedAt: string;
}

const KEY = "theater-pilot/state/v1";

export function loadState(): PersistedState | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: Omit<PersistedState, "version" | "updatedAt">): void {
  if (typeof localStorage === "undefined") return;
  const payload: PersistedState = {
    version: 1,
    updatedAt: new Date().toISOString(),
    ...state,
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function clearState(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(KEY);
}

export function exportStateJson(state: Omit<PersistedState, "version" | "updatedAt">): string {
  return JSON.stringify(
    { version: 1, updatedAt: new Date().toISOString(), ...state },
    null,
    2,
  );
}

export function importStateJson(text: string): PersistedState {
  const parsed = JSON.parse(text) as PersistedState;
  if (parsed.version !== 1 || typeof parsed.seasonId !== "string" || !parsed.roster) {
    throw new Error("不是有效的 TheaterPilot 存档");
  }
  return parsed;
}

export function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
