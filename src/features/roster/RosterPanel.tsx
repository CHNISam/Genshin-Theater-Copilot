import { useMemo, useState } from "react";
import type { InvestmentTier, Roster, UserCharacter } from "../../domain/types";
import { CHARACTERS, CHARACTER_BY_ID } from "../../data/characters";
import {
  exportRoster,
  importRosterJson,
  parseRosterText,
  progressiveQuestions,
  type ParsedRosterLine,
} from "../../importers/roster";
import { effectivePower } from "../../solver/roster";
import type { AppStore } from "../../state/store";

const TIERS: { value: InvestmentTier; label: string; hint: string }[] = [
  { value: "core", label: "核心", hint: "真正高练、能带队" },
  { value: "usable", label: "可用", hint: "能打，但不是最强" },
  { value: "trinket", label: "挂件", hint: "只用来凑人数、挂元素" },
  { value: "unused", label: "不使用", hint: "不带进本期" },
];

const SAMPLE = `丝柯克 核心
菲林斯 核心
神里绫华 核心
甘雨 核心
夜兰
爱诺
行秋 满命
芙宁娜
芭芭拉 满命
莱依拉
迪奥娜 满命
夏洛蒂
七七
北斗 挂件
菲谢尔 挂件
米卡 挂件
多莉 挂件`;

export function RosterPanel({ store }: { store: AppStore }): JSX.Element {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedRosterLine[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const roster = store.roster;

  const ranked = useMemo(
    () =>
      roster.characters
        .map((c) => {
          const base = CHARACTER_BY_ID.get(c.characterId);
          return base
            ? { characterId: c.characterId, name: base.name, score: effectivePower(base, c), tier: c.tier }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.score - a.score),
    [roster],
  );

  const questions = useMemo(() => progressiveQuestions(ranked), [ranked]);

  function applyParsed(lines: ParsedRosterLine[]): void {
    const next: UserCharacter[] = [...roster.characters];
    for (const line of lines) {
      const value = line.detected.value;
      if (!value) continue;
      const existing = next.findIndex((c) => c.characterId === value.characterId);
      if (existing >= 0) next[existing] = value;
      else next.push(value);
    }
    store.setRoster({ ...roster, characters: next });
    setMessage(`已录入 ${lines.filter((l) => l.detected.value).length} 名角色。`);
  }

  function setTier(characterId: string, tier: InvestmentTier): void {
    store.setRoster({
      ...roster,
      characters: roster.characters.map((c) =>
        c.characterId === characterId ? { ...c, tier } : c,
      ),
    });
  }

  function remove(characterId: string): void {
    store.setRoster({
      ...roster,
      characters: roster.characters.filter((c) => c.characterId !== characterId),
    });
  }

  const needsConfirmation = (parsed ?? []).filter((p) => p.detected.requiresConfirmation);

  return (
    <section className="panel">
      <div className="grid-2">
        <div className="card">
          <h2>1 · 粘贴角色列表（最低摩擦）</h2>
          <p className="muted">
            一行一个角色，支持社区昵称与常见错字。可选在名字后写「核心 / 可用 / 挂件」与「满命 / 3命」。
            不需要填写武器、圣遗物或面板——只有当两名角色评分接近、确实会改变推荐时才会追问。
          </p>
          <textarea
            value={text}
            placeholder={SAMPLE}
            onChange={(e) => setText(e.target.value)}
            aria-label="角色列表"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="action primary"
              onClick={() => {
                const lines = parseRosterText(text, CHARACTERS);
                setParsed(lines);
                applyParsed(lines);
              }}
              disabled={text.trim().length === 0}
            >
              识别并录入
            </button>
            <button className="action" onClick={() => setText(SAMPLE)}>
              填入示例
            </button>
            <label className="action" style={{ display: "inline-block" }}>
              导入 JSON
              <input
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const result = importRosterJson(JSON.parse(await file.text()), CHARACTERS);
                    store.setRoster({ ...roster, characters: result.roster.characters });
                    setParsed(result.needsConfirmation);
                    setMessage(
                      [`已导入 ${result.roster.characters.length} 名角色。`, ...result.warnings].join(" "),
                    );
                  } catch (error) {
                    setMessage(`导入失败：${(error as Error).message}`);
                  }
                }}
              />
            </label>
            <button
              className="action"
              onClick={() => {
                const json = JSON.stringify(exportRoster(roster), null, 2);
                void navigator.clipboard?.writeText(json);
                setMessage("角色池 JSON 已复制到剪贴板。");
              }}
              disabled={roster.characters.length === 0}
            >
              导出 JSON
            </button>
          </div>
          {message && <p className="muted" style={{ marginTop: 8 }}>{message}</p>}
        </div>

        <div className="card">
          <h2>2 · 快速确认</h2>
          {needsConfirmation.length === 0 ? (
            <p className="muted">没有需要确认的识别结果。低可信度的匹配会出现在这里，不会被静默采信。</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>原文</th>
                  <th>识别为</th>
                  <th>可信度</th>
                  <th>更正</th>
                </tr>
              </thead>
              <tbody>
                {needsConfirmation.map((line, i) => (
                  <tr key={`${line.raw}-${i}`}>
                    <td>{line.raw}</td>
                    <td>{line.match.matchedName ?? "未识别"}</td>
                    <td>
                      <span className={`tag ${line.detected.confidence >= 0.7 ? "warn" : "bad"}`}>
                        {(line.detected.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td>
                      <select
                        value={line.detected.value?.characterId ?? ""}
                        onChange={(e) => {
                          const id = e.target.value;
                          if (!id) return;
                          const next = [...roster.characters.filter((c) => c.characterId !== id)];
                          next.push({ characterId: id, tier: line.detected.value?.tier ?? "usable" });
                          store.setRoster({ ...roster, characters: next });
                          setParsed((prev) => (prev ?? []).filter((p) => p !== line));
                        }}
                      >
                        <option value="">选择角色…</option>
                        {CHARACTERS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {questions.length > 0 && (
            <>
              <h3>需要补充的信息</h3>
              {questions.map((q) => (
                <div key={q.characterIds.join("-")} className="callout warn">
                  {q.question}
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2>3 · 角色池（{roster.characters.length}）</h2>
        <div className="row" style={{ marginBottom: 10 }}>
          <label className="muted">助演角色</label>
          <select
            value={roster.supportGuestId ?? ""}
            onChange={(e) =>
              store.setRoster({
                ...roster,
                supportGuestId: e.target.value || undefined,
              })
            }
            style={{ maxWidth: 200 }}
          >
            <option value="">（未选择）</option>
            {CHARACTERS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="muted">助演候选（用于开局比较）</label>
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
            style={{ maxWidth: 260 }}
          />
        </div>

        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>角色</th>
                <th>元素</th>
                <th>练度</th>
                <th>等效输出</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roster.characters.map((c) => {
                const base = CHARACTER_BY_ID.get(c.characterId);
                if (!base) return null;
                return (
                  <tr key={c.characterId}>
                    <td>{base.name}</td>
                    <td className="muted">{base.element}</td>
                    <td>
                      <div className="row">
                        {TIERS.map((t) => (
                          <button
                            key={t.value}
                            className="action"
                            title={t.hint}
                            style={{
                              padding: "2px 8px",
                              borderColor: c.tier === t.value ? "var(--accent)" : undefined,
                              color: c.tier === t.value ? "var(--accent)" : undefined,
                            }}
                            onClick={() => setTier(c.characterId, t.value)}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td>{effectivePower(base, c).toFixed(1)}</td>
                    <td>
                      <button className="action" onClick={() => remove(c.characterId)}>
                        移除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {roster.characters.length === 0 && (
          <p className="muted">还没有角色。粘贴一份名字列表即可开始。</p>
        )}
      </div>
    </section>
  );
}

export type { Roster };
