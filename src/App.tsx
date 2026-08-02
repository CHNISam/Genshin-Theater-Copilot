import { useState } from "react";
import { useAppStore } from "./state/store";
import { RosterPanel } from "./features/roster/RosterPanel";
import { OpeningPlanPanel } from "./features/opening-plan/OpeningPlanPanel";
import { RunAssistantPanel } from "./features/run-assistant/RunAssistantPanel";
import { SeasonPanel } from "./features/season-review/SeasonPanel";
import { exportStateJson, importStateJson, downloadJson } from "./storage/local";

const TABS = [
  { id: "roster", label: "角色池" },
  { id: "opening", label: "开局规划" },
  { id: "run", label: "局内助手" },
  { id: "season", label: "赛季数据" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function App(): JSX.Element {
  const store = useAppStore();
  const [tab, setTab] = useState<TabId>("roster");

  return (
    <div className="app">
      <header className="masthead">
        <h1>TheaterPilot · 剧诗领航</h1>
        <span className="sub">
          幻想真境剧诗动态规划工具（非官方）· 当前赛季 {store.season.name}
        </span>
        <div className="row" style={{ marginLeft: "auto" }}>
          <select
            value={store.season.id}
            onChange={(e) => store.setSeasonId(e.target.value)}
            style={{ width: "auto" }}
            aria-label="切换赛季"
          >
            {store.seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
          <button
            className="action"
            onClick={() =>
              downloadJson(
                `theater-pilot-${store.season.id}.json`,
                exportStateJson({
                  seasonId: store.season.id,
                  roster: store.roster,
                  run: store.run,
                  objective: store.objective,
                }),
              )
            }
          >
            导出存档
          </button>
          <label className="action">
            导入存档
            <input
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const state = importStateJson(await file.text());
                  store.setSeasonId(state.seasonId);
                  store.setRoster(state.roster);
                  store.setRun(state.run);
                  if (state.objective) store.setObjective(state.objective);
                } catch (error) {
                  alert(`导入失败：${(error as Error).message}`);
                }
              }}
            />
          </label>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "roster" && <RosterPanel store={store} />}
      {tab === "opening" && <OpeningPlanPanel store={store} />}
      {tab === "run" && <RunAssistantPanel store={store} />}
      {tab === "season" && <SeasonPanel store={store} />}
    </div>
  );
}
