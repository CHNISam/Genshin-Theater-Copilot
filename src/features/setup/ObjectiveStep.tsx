import type { Difficulty, RunObjective, SeasonConfig } from "../../domain/types";
import { DIFFICULTY_LABEL, describeObjective } from "../../domain/types";

const DIFFICULTY_DETAIL: Record<Difficulty, string> = {
  light: "最低难度。",
  normal: "标准难度。",
  hard: "有压力。",
  visionary: "高难度。",
  moonlit: "10 幕 + 2 场圣牌。",
};

const ALL: Difficulty[] = ["light", "normal", "hard", "visionary", "moonlit"];

export function ObjectiveStep({
  season,
  objective,
  onChange,
  onNext,
}: {
  season: SeasonConfig;
  objective: RunObjective | null;
  onChange: (objective: RunObjective) => void;
  onNext: () => void;
}): JSX.Element {
  const supported = season.ruleOverrides.supportedDifficulties;
  const current: RunObjective = objective ?? {
    difficulty: supported[0] ?? "moonlit",
    tablets: false,
    stars: false,
  };
  const rules = season.ruleOverrides;
  const totalStars = rules.mainActCount + rules.tabletChallengeCount;

  return (
    <section>
      <div className="answer">
        <p className="question">开始之前</p>
        <h2 className="headline">这局打到哪一步？</h2>
        <p className="because">会改变建议：不打圣牌就不为它留人；追星则不再劝你省着用。</p>
      </div>

      <div className="panel">
        <h2>难度</h2>
        <p className="hint">
          本期只有 {supported.map((d) => DIFFICULTY_LABEL[d]).join("、")} 的关卡数据。
        </p>
        <div className="choices">
          {ALL.map((d) => {
            const ok = supported.includes(d);
            return (
              <button
                key={d}
                type="button"
                className="choice"
                aria-pressed={current.difficulty === d}
                disabled={!ok}
                onClick={() => ok && onChange({ ...current, difficulty: d })}
              >
                <div className="t">{DIFFICULTY_LABEL[d]}</div>
                <div className="d">{ok ? DIFFICULTY_DETAIL[d] : "本期无数据"}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <h2>目标</h2>
        <p className="hint">两个开关互相独立，随便组合。</p>
        <div className="choices">
          <button
            type="button"
            className="choice"
            aria-pressed={current.tablets}
            onClick={() => onChange({ ...current, tablets: !current.tablets })}
          >
            <div className="t">打 {rules.tabletChallengeCount} 场圣牌挑战</div>
            <div className="d">
              {current.tablets
                ? "会为圣牌留出治疗和耐力。全部打完可抽月谕圣牌。"
                : "跳过。圣牌不是通关前置，耐力全给主线。"}
            </div>
          </button>

          <button
            type="button"
            className="choice"
            aria-pressed={current.stars}
            onClick={() => onChange({ ...current, stars: !current.stars })}
          >
            <div className="t">追明星挑战星章</div>
            <div className="d">
              {current.stars
                ? "输出要求抬高，不再回避「用强了」。"
                : "不追。优先保证不翻车。"}
            </div>
          </button>
        </div>

        {current.stars && !current.tablets && (
          <div className="note warn" style={{ marginTop: 12 }}>
            满星是 {totalStars} 枚（{rules.mainActCount} 幕 + {rules.tabletChallengeCount}{" "}
            场圣牌）。不打圣牌最多拿 {rules.mainActCount} 枚——只想要这些的话，打低一档难度更省。
          </div>
        )}
      </div>

      <div className="row">
        <button className="btn primary" onClick={() => { onChange(current); onNext(); }}>
          下一步
        </button>
        <span className="muted">当前：{describeObjective(current)}</span>
      </div>
    </section>
  );
}
