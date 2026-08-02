import { useMemo, useState } from "react";
import type { EventCandidate } from "../../domain/types";
import { CHARACTERS } from "../../data/characters";
import { runAssistant } from "../../solver/assistant";
import { resolvedStages } from "../../solver/stages";
import type { AppStore } from "../../state/store";

/**
 * 局内一屏：一个主问题、一个主答案、一句理由。
 * 数据全部退到折叠区，只有在用户问"为什么"时才出现。
 */
export function RunDeck({ store }: { store: AppStore }): JSX.Element {
  const { resolvedSeason: season, roster, run } = store;
  const [lineup, setLineup] = useState<string[] | null>(null);

  const stages = useMemo(
    () => (run && season ? resolvedStages(season, run) : []),
    [season, run],
  );
  const output = useMemo(
    () =>
      run && season
        ? runAssistant({ season, roster, characters: store.characters, state: run })
        : null,
    [season, roster, run, store.characters],
  );

  if (!season) {
    return (
      <div className="answer">
        <p className="question">对局</p>
        <h2 className="headline">先选难度</h2>
        <p className="because">本赛季包里没有这一档难度的关卡结构，给不出可信结论。</p>
      </div>
    );
  }

  if (!run || !output) {
    return (
      <div className="answer">
        <p className="question">对局</p>
        <h2 className="headline">还没有进行中的对局</h2>
        <p className="because">录入角色并选好目标后开始。</p>
        <button className="btn primary" onClick={store.startRun}>
          开始新对局
        </button>
      </div>
    );
  }

  const stage = output.stage;
  const owned = roster.characters.filter((c) => c.tier !== "unused");
  const name = (id: string): string => store.characters.get(id)?.name ?? id;

  const recommended = output.primaryPlan?.team.memberIds ?? [];
  const currentLineup = lineup ?? recommended;
  const lineupReady =
    currentLineup.length === season.rules.teamSize &&
    new Set(currentLineup).size === currentLineup.length;

  const hasEvent = run.eventCandidates.length > 0;
  const safety = output.safety;
  const safetyTone = safety.safe ? (safety.fullRun.feasible ? "ok" : "warn") : "bad";

  const done = run.completedStageIds.length;

  return (
    <section>
      <div className="statusline">
        <span className={`dot ${safetyTone}`} />
        <strong style={{ color: "var(--text)" }}>
          {stage?.name ?? "全部完成"}
        </strong>
        <span className="muted">
          进度 {done}/{stages.length}
        </span>
        <span className="chip">幻剧之花 {run.blossoms}</span>
        <span className="chip">刷新 {run.refreshesRemaining}</span>
        <div style={{ flex: 1 }} />
        {store.canUndo && (
          <button className="btn quiet sm" onClick={store.undo}>
            撤销上一关
          </button>
        )}
      </div>

      {/* 主答案：有事件先决事件，否则决阵容 */}
      {hasEvent ? (
        <div className="answer">
          <p className="question">现在这一步</p>
          <h2 className="headline">
            {output.eventRecommendation?.label ?? "从候选里选一个"}
          </h2>
          <p className="because">
            {output.eventRecommendation?.reasons[0] ?? "候选都不影响关键缺口，选哪个差别不大。"}
          </p>
          <div className="cta">
            <button
              className="btn primary"
              onClick={() => {
                const chosen = output.eventRecommendation?.candidate;
                if (chosen) applyEvent(store, chosen);
              }}
              disabled={!output.eventRecommendation}
            >
              就选这个
            </button>
            <button
              className="btn"
              onClick={() => store.updateRun({ eventCandidates: [] })}
            >
              跳过 / 我选了别的
            </button>
            {output.shouldRefresh.recommended && (
              <span className="chip warn">建议先刷新</span>
            )}
          </div>
        </div>
      ) : (
        <div className="answer">
          <p className="question">现在这一关</p>
          <h2 className="headline">
            {recommended.length > 0 ? currentLineup.map(name).join(" · ") : "没有可行阵容"}
          </h2>
          <p className="because">
            {output.primaryPlan?.summary ??
              "已解锁角色里凑不出这一关要的四人。展开「为什么」看缺什么。"}
          </p>

          <div className="lineup">
            {Array.from({ length: season.rules.teamSize }, (_, i) => {
              const id = currentLineup[i];
              const remaining = id ? run.vigor[id] ?? 0 : 0;
              return (
                <div className="slot" key={i}>
                  <select
                    value={id ?? ""}
                    onChange={(e) => {
                      const next = [...currentLineup];
                      next[i] = e.target.value;
                      setLineup(next);
                    }}
                    style={{ marginBottom: 6 }}
                  >
                    <option value="">空位</option>
                    {owned.map((c) => (
                      <option key={c.characterId} value={c.characterId}>
                        {name(c.characterId)}（{run.vigor[c.characterId] ?? 0}）
                      </option>
                    ))}
                  </select>
                  <div className="pips">
                    {Array.from({ length: season.rules.defaultVigor }, (_, p) => (
                      <span key={p} className={`pip ${p < remaining ? "on" : "spent"}`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="cta">
            <button
              className="btn primary"
              disabled={!lineupReady}
              onClick={() => {
                store.confirmTeam(currentLineup);
                setLineup(null);
              }}
            >
              就用这四个
            </button>
            {lineup && (
              <button className="btn quiet" onClick={() => setLineup(null)}>
                恢复推荐阵容
              </button>
            )}
            {!lineupReady && <span className="muted">四个位置都要有人且不重复</span>}
          </div>
        </div>
      )}

      {/* 需要立刻知道的风险 */}
      {!safety.safe && <div className="note bad">{safety.message}</div>}
      {safety.safe && !safety.fullRun.feasible && (
        <div className="note warn">{safety.message}</div>
      )}
      {output.unmetFutureRequirements.map((u) => (
        <div key={u.stageId + u.message} className="note bad">
          {u.message}
        </div>
      ))}
      {output.doNotSpend.slice(0, 3).map((d) => (
        <div key={d.characterId} className="note warn">
          {d.reason}
        </div>
      ))}
      {output.notes.map((n) => (
        <div key={n} className="note warn">
          {n}
        </div>
      ))}

      {/* 以下全部默认折叠 */}
      <details className="more">
        <summary>为什么是这套，不是别的</summary>
        <div className="body">
          <ul className="reasons">
            {(output.primaryPlan?.reasons ?? []).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          {output.backupPlans.length > 0 && (
            <>
              <p className="muted" style={{ marginTop: 12, marginBottom: 4 }}>
                备用方案
              </p>
              <ul className="reasons">
                {output.backupPlans.map((p) => (
                  <li key={p.label}>
                    <button
                      className="btn sm"
                      onClick={() => setLineup(p.team.memberIds)}
                      style={{ marginRight: 8 }}
                    >
                      改用
                    </button>
                    {p.team.members.map((m) => m.base.name).join(" · ")}
                  </li>
                ))}
              </ul>
            </>
          )}
          {output.rejectedTeams.length > 0 && (
            <>
              <p className="muted" style={{ marginTop: 12, marginBottom: 4 }}>
                被淘汰的组合
              </p>
              <ul className="reasons">
                {output.rejectedTeams.slice(0, 4).map((t, i) => (
                  <li key={i}>
                    {t.memberIds.map(name).join(" · ")}：{t.reasons.join("；")}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </details>

      {output.reservations.length > 0 && (
        <details className="more">
          <summary>谁必须留着（{output.reservations.length}）</summary>
          <div className="body scroll-x">
            <table>
              <thead>
                <tr>
                  <th>角色</th>
                  <th>留给</th>
                  <th>保留</th>
                  <th>强度</th>
                  <th>替代</th>
                </tr>
              </thead>
              <tbody>
                {output.reservations.map((r) => (
                  <tr key={r.id}>
                    <td>{r.characterName}</td>
                    <td>{r.stageName}</td>
                    <td>{r.minimumVigorReserved} 点</td>
                    <td>
                      <span className={`chip ${r.strictness === "hard" ? "bad" : "warn"}`}>
                        {r.strictness === "hard" ? "强制" : "建议"}
                      </span>
                    </td>
                    <td className="muted">{r.alternatives.join("、") || "唯一解"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <details className="more">
        <summary>祝福该点哪条</summary>
        <div className="body">
          <ul className="reasons">
            {output.buffPortfolio.explanation.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 10 }}>
            <select
              defaultValue=""
              onChange={(e) => {
                const buff = season.buffs.find((b) => b.id === e.target.value);
                if (!buff) return;
                const level = (run.buffLevels[buff.id] ?? 0) + 1;
                store.updateRun({
                  buffLevels: { ...run.buffLevels, [buff.id]: level },
                });
                e.target.value = "";
              }}
              style={{ maxWidth: 220 }}
            >
              <option value="">我买了…</option>
              {season.buffs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} → Lv{(run.buffLevels[b.id] ?? 0) + 1}
                </option>
              ))}
            </select>
            <span className="muted">
              当前：
              {season.buffs
                .map((b) => `${b.name} Lv${run.buffLevels[b.id] ?? 0}`)
                .join("　")}
            </span>
          </div>
        </div>
      </details>

      <details className="more">
        <summary>录入这一步出现的事件候选</summary>
        <div className="body">
          <p className="muted" style={{ marginTop: 0 }}>加进来后，上面直接告诉你选哪个。</p>
          <div className="row">
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                addCandidate(store, { kind: "character", characterId: e.target.value, cost: 2 });
                e.target.value = "";
              }}
              style={{ maxWidth: 190 }}
            >
              <option value="">候选角色…</option>
              {CHARACTERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              defaultValue=""
              onChange={(e) => {
                const buff = season.buffs.find((b) => b.id === e.target.value);
                if (!buff) return;
                const level = (run.buffLevels[buff.id] ?? 0) + 1;
                const cost = buff.levels.find((l) => l.level === level)?.cost ?? 1;
                addCandidate(store, {
                  kind: "buff",
                  buffId: buff.id,
                  targetLevel: level,
                  cost,
                });
                e.target.value = "";
              }}
              style={{ maxWidth: 190 }}
            >
              <option value="">候选祝福…</option>
              {season.buffs.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {hasEvent && (
              <button
                className="btn sm"
                onClick={() => store.updateRun({ eventCandidates: [] })}
              >
                清空
              </button>
            )}
          </div>
          {output.rejectedEvents.length > 0 && (
            <>
              <p className="muted" style={{ marginTop: 12, marginBottom: 4 }}>
                其他候选为什么被排除
              </p>
              <ul className="reasons">
                {output.rejectedEvents.map((e, i) => (
                  <li key={i}>
                    <strong>{e.label}</strong>：{e.reasons.join("；")}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className={`note ${output.shouldRefresh.recommended ? "warn" : ""}`}>
            {output.shouldRefresh.recommended ? "建议刷新：" : "不建议刷新："}
            {output.shouldRefresh.reason}
          </div>
        </div>
      </details>

      <details className="more">
        <summary>耐力与解锁总览</summary>
        <div className="body">
          <p className="muted" style={{ marginTop: 0 }}>耐力自动推导，这里只用于纠错。</p>
          <div className="scroll-x">
            <table>
              <thead>
                <tr>
                  <th>角色</th>
                  <th>已解锁</th>
                  <th>剩余耐力</th>
                </tr>
              </thead>
              <tbody>
                {owned.map((c) => (
                  <tr key={c.characterId}>
                    <td>{name(c.characterId)}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={run.unlockedCharacterIds.includes(c.characterId)}
                        aria-label={`${name(c.characterId)} 已解锁`}
                        onChange={() => {
                          const unlocked = run.unlockedCharacterIds.includes(c.characterId)
                            ? run.unlockedCharacterIds.filter((x) => x !== c.characterId)
                            : [...run.unlockedCharacterIds, c.characterId];
                          store.updateRun({ unlockedCharacterIds: unlocked });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={run.vigor[c.characterId] ?? 0}
                        aria-label={`${name(c.characterId)} 剩余耐力`}
                        style={{ width: 70 }}
                        onChange={(e) =>
                          store.updateRun({
                            vigor: {
                              ...run.vigor,
                              [c.characterId]: Math.max(0, Number(e.target.value)),
                            },
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </section>
  );
}

function addCandidate(store: AppStore, candidate: EventCandidate): void {
  if (!store.run) return;
  store.updateRun({ eventCandidates: [...store.run.eventCandidates, candidate] });
}

/** 把选中的事件结果写进状态：解锁角色 / 升祝福 / 加花。 */
function applyEvent(store: AppStore, candidate: EventCandidate): void {
  const run = store.run;
  if (!run) return;
  switch (candidate.kind) {
    case "character":
      store.updateRun({
        unlockedCharacterIds: [...new Set([...run.unlockedCharacterIds, candidate.characterId])],
        vigor: {
          ...run.vigor,
          [candidate.characterId]:
            run.vigor[candidate.characterId] ?? store.resolvedSeason?.rules.defaultVigor ?? 0,
        },
        blossoms: Math.max(0, run.blossoms - candidate.cost),
        eventCandidates: [],
      });
      break;
    case "buff":
      store.updateRun({
        buffLevels: { ...run.buffLevels, [candidate.buffId]: candidate.targetLevel },
        blossoms: Math.max(0, run.blossoms - candidate.cost),
        eventCandidates: [],
      });
      break;
    case "vigor":
      store.updateRun({
        vigor: {
          ...run.vigor,
          [candidate.characterId]: (run.vigor[candidate.characterId] ?? 0) + candidate.amount,
        },
        blossoms: Math.max(0, run.blossoms - candidate.cost),
        eventCandidates: [],
      });
      break;
    case "blossom":
      store.updateRun({
        blossoms: run.blossoms + candidate.amount,
        eventCandidates: [],
      });
      break;
  }
}
