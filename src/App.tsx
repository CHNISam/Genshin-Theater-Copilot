import { useEffect, useState } from "react";
import { DIFFICULTY_LABEL, describeObjective } from "./domain/types";
import { useAppStore } from "./state/store";
import { ObjectiveStep } from "./features/setup/ObjectiveStep";
import { RosterStep } from "./features/roster/RosterStep";
import { OpeningPlanPanel } from "./features/opening-plan/OpeningPlanPanel";
import { RunDeck } from "./features/run/RunDeck";
import { SeasonPanel } from "./features/season-review/SeasonPanel";
import { exportStateJson, importStateJson, downloadJson } from "./storage/local";

type StepId = "objective" | "roster" | "opening" | "run" | "season";

const STEPS: { id: StepId; label: string }[] = [
  { id: "objective", label: "目标" },
  { id: "roster", label: "角色" },
  { id: "opening", label: "开局" },
  { id: "run", label: "对局" },
];

export function App(): JSX.Element {
  const store = useAppStore();
  const ready = store.roster.characters.filter((c) => c.tier !== "unused").length >= 4;
  const [step, setStep] = useState<StepId>(() =>
    !store.objective ? "objective" : store.run ? "run" : ready ? "opening" : "roster",
  );

  // 目标是一切结论的前提：没选就必须先选
  useEffect(() => {
    if (!store.objective && step !== "objective") setStep("objective");
  }, [store.objective, step]);

  const unlocked: Record<StepId, boolean> = {
    objective: true,
    roster: Boolean(store.objective),
    opening: Boolean(store.objective) && ready,
    run: Boolean(store.objective) && ready,
    season: true,
  };

  return (
    <div className="shell">
      <header className="topbar">
        <h1 className="brand">
          TheaterPilot
          <small>剧诗领航 · 非官方</small>
        </h1>

        {store.objective && (
          <button className="chip accent" onClick={() => setStep("objective")}>
            {DIFFICULTY_LABEL[store.objective.difficulty]} · {describeObjective(store.objective)}
          </button>
        )}

        <span className="spacer" />

        <button className="btn quiet sm" onClick={() => setStep("season")}>
          本期赛季
        </button>
        <button
          className="btn quiet sm"
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
          导出
        </button>
        <label className="btn quiet sm">
          导入
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
      </header>

      <nav className="steps">
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            className={`step${unlocked[s.id] && step !== s.id ? " done" : ""}`}
            aria-current={step === s.id}
            disabled={!unlocked[s.id]}
            onClick={() => setStep(s.id)}
          >
            <span className="num">{i + 1}</span>
            {s.label}
          </button>
        ))}
      </nav>

      {step === "objective" && (
        <ObjectiveStep
          season={store.season}
          objective={store.objective}
          onChange={store.setObjective}
          onNext={() => setStep("roster")}
        />
      )}

      {step === "roster" && <RosterStep store={store} onNext={() => setStep("opening")} />}

      {step === "opening" && (
        <>
          <OpeningPlanPanel store={store} />
          <div className="row">
            <button
              className="btn primary"
              onClick={() => {
                if (!store.run) store.startRun();
                setStep("run");
              }}
            >
              {store.run ? "回到对局" : "开始对局"}
            </button>
            {store.run && (
              <button
                className="btn quiet"
                onClick={() => {
                  if (confirm("放弃当前对局，重新开始？")) {
                    store.setRun(null);
                    store.startRun();
                  }
                }}
              >
                重开一局
              </button>
            )}
          </div>
        </>
      )}

      {step === "run" && <RunDeck store={store} />}

      {step === "season" && <SeasonPanel store={store} />}
    </div>
  );
}
