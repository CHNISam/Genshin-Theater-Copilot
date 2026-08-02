import { useMemo, useState } from "react";
import type { InvestmentTier, UserCharacter } from "../../domain/types";
import { ELEMENT_LABEL } from "../../domain/types";
import { CHARACTERS, CHARACTER_BY_ID } from "../../data/characters";
import {
  parseRosterText,
  progressiveQuestions,
  type ParsedRosterLine,
} from "../../importers/roster";
import { effectivePower } from "../../solver/roster";
import type { AppStore } from "../../state/store";
import { ScreenshotImport } from "./ScreenshotImport";

const TIERS: { value: InvestmentTier; label: string }[] = [
  { value: "core", label: "核心" },
  { value: "usable", label: "可用" },
  { value: "trinket", label: "挂件" },
  { value: "unused", label: "不带" },
];

export function RosterStep({
  store,
  onNext,
}: {
  store: AppStore;
  onNext: () => void;
}): JSX.Element {
  const roster = store.roster;
  const [text, setText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  /** 没能精确命中的行。只在这里做渐进式披露，绝不静默替用户猜。 */
  const [unresolved, setUnresolved] = useState<ParsedRosterLine[]>([]);

  const ranked = useMemo(
    () =>
      roster.characters
        .map((c) => {
          const base = CHARACTER_BY_ID.get(c.characterId);
          return base
            ? {
                characterId: c.characterId,
                name: base.name,
                element: base.element,
                score: effectivePower(base, c),
                tier: c.tier,
              }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.score - a.score),
    [roster],
  );

  const questions = useMemo(() => progressiveQuestions(ranked), [ranked]);
  const enough = roster.characters.filter((c) => c.tier !== "unused").length >= 4;

  function merge(characters: UserCharacter[]): void {
    const next = [...roster.characters];
    for (const c of characters) {
      const i = next.findIndex((x) => x.characterId === c.characterId);
      if (i >= 0) next[i] = { ...next[i], ...c, tier: next[i]!.tier };
      else next.push(c);
    }
    store.setRoster({ ...roster, characters: next });
  }

  return (
    <section>
      <div className="answer">
        <p className="question">第二步</p>
        <h2 className="headline">你有哪些角色？</h2>
        <p className="because">
          截一张剧诗角色界面丢进来，角色、出战、耐力一次读出。练度只分四档，不用填武器圣遗物。
        </p>
      </div>

      <ScreenshotImport
        onApply={(result) => {
          merge(result.characters);
          setMessage(
            `已导入 ${result.characters.length} 名角色` +
              (result.unlockedIds.length > 0
                ? `，其中 ${result.unlockedIds.length} 名已出战。`
                : "。"),
          );
          if (store.run) {
            store.updateRun({
              unlockedCharacterIds: [
                ...new Set([...store.run.unlockedCharacterIds, ...result.unlockedIds]),
              ],
              vigor: { ...store.run.vigor, ...result.vigor },
            });
          }
        }}
      />

      {message && <div className="note ok">{message}</div>}

      <details className="more">
        <summary>认不出来？手动补几个</summary>
        <div className="body">
          <p className="muted" style={{ marginTop: 0 }}>一行一个角色名。</p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"丝柯克\n菲林斯\n夜兰"}
            aria-label="角色列表"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="btn"
              disabled={!text.trim()}
              onClick={() => {
                const lines = parseRosterText(text, CHARACTERS);
                const ok = lines
                  .map((l) => l.detected.value)
                  .filter((v): v is UserCharacter => !!v);
                merge(ok);
                const pending = lines.filter((l) => l.detected.value === null);
                setUnresolved(pending);
                setMessage(
                  `加入 ${ok.length} 名${pending.length > 0 ? `，${pending.length} 行需要你确认` : ""}。`,
                );
                setText("");
              }}
            >
              加入
            </button>
          </div>

          {unresolved.length > 0 && (
            <div style={{ marginTop: 14 }}>
              {unresolved.map((line, index) => (
                <div key={`${line.raw}-${index}`} className="row" style={{ marginBottom: 6 }}>
                  <span className="chip warn">没找到「{line.raw}」</span>
                  <select
                    defaultValue=""
                    style={{ maxWidth: 200 }}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      merge([{ characterId: e.target.value, tier: "usable" }]);
                      setUnresolved((prev) => prev.filter((_, i) => i !== index));
                    }}
                  >
                    <option value="">
                      {line.match.alternatives.length > 0 ? "是不是这几个？" : "从全部角色里选…"}
                    </option>
                    {line.match.alternatives.map((a) => (
                      <option key={a.characterId} value={a.characterId}>
                        {a.name}
                      </option>
                    ))}
                    {line.match.alternatives.length > 0 && (
                      <option disabled>──── 全部角色 ────</option>
                    )}
                    {CHARACTERS.map((c) => (
                      <option key={`all-${c.id}`} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn quiet sm"
                    onClick={() => setUnresolved((prev) => prev.filter((_, i) => i !== index))}
                  >
                    跳过
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </details>

      {roster.characters.length > 0 && (
        <div className="panel">
          <h2>练度分档（{ranked.length}）</h2>
          <p className="hint">「核心」能带队，「挂件」只凑人数。点一下即可改。</p>
          <div className="scroll-x">
            <table>
              <tbody>
                {ranked.map((c) => (
                  <tr key={c.characterId}>
                    <td style={{ width: 120 }}>{c.name}</td>
                    <td className="muted" style={{ width: 70 }}>
                      {ELEMENT_LABEL[c.element]}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        {TIERS.map((t) => (
                          <button
                            key={t.value}
                            className="btn sm"
                            aria-pressed={c.tier === t.value}
                            style={
                              c.tier === t.value
                                ? { borderColor: "var(--accent)", color: "var(--accent)" }
                                : undefined
                            }
                            onClick={() =>
                              store.setRoster({
                                ...roster,
                                characters: roster.characters.map((x) =>
                                  x.characterId === c.characterId ? { ...x, tier: t.value } : x,
                                ),
                              })
                            }
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="muted" style={{ width: 60 }}>
                      {c.score.toFixed(1)}
                    </td>
                    <td style={{ width: 60 }}>
                      <button
                        className="btn quiet sm"
                        onClick={() =>
                          store.setRoster({
                            ...roster,
                            characters: roster.characters.filter(
                              (x) => x.characterId !== c.characterId,
                            ),
                          })
                        }
                      >
                        移除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {questions.map((q) => (
        <div key={q.characterIds.join("-")} className="note warn">
          {q.question}
        </div>
      ))}

      <div className="panel">
        <h2>助演</h2>
        <p className="hint">填你实际借得到的几个，不是最强的那个。</p>
        <div className="row">
          <div style={{ minWidth: 200, flex: 1 }}>
            <label className="field">实际可借到的候选（逗号分隔）</label>
            <input
              type="text"
              value={(roster.supportGuestCandidates ?? []).join(",")}
              placeholder="例如：sandonie,neuvillette"
              onChange={(e) =>
                store.setRoster({
                  ...roster,
                  supportGuestCandidates: e.target.value
                    .split(/[,，\s]+/)
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          </div>
          <div style={{ minWidth: 160 }}>
            <label className="field">这局实际借了谁</label>
            <select
              value={roster.supportGuestId ?? ""}
              onChange={(e) =>
                store.setRoster({ ...roster, supportGuestId: e.target.value || undefined })
              }
            >
              <option value="">（还没借）</option>
              {CHARACTERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="row">
        <button className="btn primary" disabled={!enough} onClick={onNext}>
          下一步
        </button>
        {!enough && <span className="muted">至少需要 4 名角色</span>}
      </div>
    </section>
  );
}
