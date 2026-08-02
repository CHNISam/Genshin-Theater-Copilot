import type { ResolvedRules, RunObjective, SeasonConfig } from "../../domain/types";
import { DIFFICULTIES, DIFFICULTY_LABEL, describeObjective } from "../../domain/types";
import { defaultDifficulty, supportedDifficulties, tryResolveSeason } from "../../season/resolve";

/** 每档难度的一句话定位。结构数字一律从数据读，这里只写"感受"。 */
const DIFFICULTY_TONE: Record<(typeof DIFFICULTIES)[number], string> = {
  light: "最低难度，练手用。",
  normal: "标准难度。",
  hard: "开始有压力。",
  visionary: "高难度，阵容要成型。",
  moonlit: "最高难度，容错很低。",
};

/** 用真实数据描述一档难度的结构，而不是写死文案。 */
function describeStructure(rules: ResolvedRules): string {
  const tablets =
    rules.tabletChallengeCount > 0 ? ` + ${rules.tabletChallengeCount} 场圣牌` : "";
  const entry =
    rules.requiredCharacterCount !== undefined
      ? `｜准入 ${rules.requiredCharacterCount} 人`
      : "";
  return `打到第 ${rules.mainActCount} 幕${tablets}｜${rules.teamSize} 人队｜每人 ${rules.defaultVigor} 耐力${entry}`;
}

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
  const supported = supportedDifficulties(season);
  const current: RunObjective = objective ?? {
    difficulty: defaultDifficulty(season) ?? "moonlit",
    tablets: false,
    stars: false,
  };
  // 通关线与圣牌场次随难度变，所以这些文案必须跟着所选难度走。
  const rules = tryResolveSeason(season, current.difficulty)?.rules;
  const totalStars = rules ? rules.mainActCount + rules.tabletChallengeCount : 0;

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
          {DIFFICULTIES.map((d) => {
            const resolved = tryResolveSeason(season, d);
            return (
              <button
                key={d}
                type="button"
                className="choice"
                aria-pressed={current.difficulty === d}
                disabled={!resolved}
                onClick={() => resolved && onChange({ ...current, difficulty: d })}
              >
                <div className="t">{DIFFICULTY_LABEL[d]}</div>
                <div className="d">
                  {resolved ? describeStructure(resolved.rules) : "本期无数据"}
                </div>
                {resolved && <div className="d muted">{DIFFICULTY_TONE[d]}</div>}
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
            disabled={!rules || rules.tabletChallengeCount === 0}
            onClick={() => onChange({ ...current, tablets: !current.tablets })}
          >
            <div className="t">
              {rules && rules.tabletChallengeCount > 0
                ? `打 ${rules.tabletChallengeCount} 场圣牌挑战`
                : "圣牌挑战"}
            </div>
            <div className="d">
              {!rules || rules.tabletChallengeCount === 0
                ? "本难度没有圣牌挑战。"
                : current.tablets
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

        {rules && rules.tabletChallengeCount > 0 && current.stars && !current.tablets && (
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
