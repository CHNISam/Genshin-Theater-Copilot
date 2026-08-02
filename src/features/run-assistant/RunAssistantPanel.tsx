import { useMemo, useState } from "react";
import type { EventCandidate, RunState } from "../../domain/types";
import { CHARACTERS } from "../../data/characters";
import { runAssistant } from "../../solver/assistant";
import { resolvedStages } from "../../solver/stages";
import { linesFromText, parseRunScreen, pendingConfirmations } from "../../importers/ocr";
import type { AppStore } from "../../state/store";

export function RunAssistantPanel({ store }: { store: AppStore }): JSX.Element {
  const { season, roster, run } = store;
  const [capture, setCapture] = useState("");
  const [captureMessage, setCaptureMessage] = useState<string | null>(null);

  const stages = useMemo(
    () => (run ? resolvedStages(season, run) : []),
    [season, run],
  );

  const output = useMemo(() => {
    if (!run) return null;
    return runAssistant({ season, roster, characters: store.characters, state: run });
  }, [season, roster, run, store.characters]);

  if (!run) {
    return (
      <section className="panel">
        <div className="card">
          <p className="muted">还没有进行中的对局。</p>
          <button
            className="action primary"
            onClick={store.startRun}
            disabled={roster.characters.length < season.ruleOverrides.teamSize}
          >
            开始新对局
          </button>
        </div>
      </section>
    );
  }

  const owned = roster.characters.filter((c) => c.tier !== "unused");

  function patch(next: Partial<RunState>): void {
    store.updateRun(next);
  }

  function toggleUnlocked(id: string): void {
    const unlocked = run!.unlockedCharacterIds.includes(id)
      ? run!.unlockedCharacterIds.filter((x) => x !== id)
      : [...run!.unlockedCharacterIds, id];
    patch({
      unlockedCharacterIds: unlocked,
      standbyCharacterIds: owned
        .map((c) => c.characterId)
        .filter((x) => !unlocked.includes(x)),
    });
  }

  function setVigor(id: string, value: number): void {
    patch({ vigor: { ...run!.vigor, [id]: Math.max(0, value) } });
  }

  function applyCapture(): void {
    const recognized = parseRunScreen(linesFromText(capture, 0.82), CHARACTERS);
    const nextVigor = { ...run!.vigor };
    const unlocked = new Set(run!.unlockedCharacterIds);
    for (const item of recognized.vigor) {
      if (item.requiresConfirmation) continue;
      nextVigor[item.value.characterId] = item.value.remaining;
      unlocked.add(item.value.characterId);
    }
    for (const item of recognized.unlockedCharacters) {
      if (!item.requiresConfirmation) unlocked.add(item.value);
    }
    patch({
      vigor: nextVigor,
      unlockedCharacterIds: [...unlocked],
      ...(recognized.blossoms && !recognized.blossoms.requiresConfirmation
        ? { blossoms: recognized.blossoms.value }
        : {}),
      ...(recognized.refreshesRemaining && !recognized.refreshesRemaining.requiresConfirmation
        ? { refreshesRemaining: recognized.refreshesRemaining.value }
        : {}),
    });
    const pending = pendingConfirmations(recognized);
    setCaptureMessage(
      pending.length === 0
        ? "已全部采信并重算。"
        : `已采信高可信内容；${pending.length} 项需要你确认：${pending
            .map((p) => p.label)
            .join("；")}`,
    );
  }

  function addCandidate(candidate: EventCandidate): void {
    patch({ eventCandidates: [...run!.eventCandidates, candidate] });
  }

  const safetyClass = output?.safety.safe
    ? output.safety.fullRun.feasible
      ? "good"
      : "warn"
    : "bad";

  return (
    <section className="panel">
      <div className="card">
        <div className="row">
          <label className="muted">当前关卡</label>
          <select
            value={run.currentStageId}
            onChange={(e) => patch({ currentStageId: e.target.value })}
            style={{ maxWidth: 220 }}
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="muted">幻剧之花</label>
          <input
            type="number"
            value={run.blossoms}
            onChange={(e) => patch({ blossoms: Number(e.target.value) })}
            style={{ width: 72 }}
          />
          <label className="muted">剩余刷新</label>
          <input
            type="number"
            value={run.refreshesRemaining}
            onChange={(e) => patch({ refreshesRemaining: Number(e.target.value) })}
            style={{ width: 72 }}
          />
          <button
            className="action"
            onClick={() => {
              const idx = stages.findIndex((s) => s.id === run.currentStageId);
              const next = stages[idx + 1];
              if (!next) return;
              patch({
                currentStageId: next.id,
                completedStageIds: [...run.completedStageIds, run.currentStageId],
                eventCandidates: [],
              });
            }}
          >
            完成本关，进入下一关
          </button>
          <button className="action" onClick={() => store.setRun(null)}>
            结束对局
          </button>
        </div>
      </div>

      {output && (
        <>
          <div className={`card`}>
            <h2>安全线</h2>
            <div className={`callout ${safetyClass}`}>{output.safety.message}</div>
            <div className="row">
              <span className="tag">
                未来两场路线数 {output.safety.twoStage.routeCount}
              </span>
              <span className={`tag ${riskTag(output.safety.fullRunDiversity.risk)}`}>
                整体风险 {output.safety.fullRunDiversity.risk}
              </span>
              {output.scarcestResources.map((s) => (
                <span key={s} className="tag warn">
                  {s}
                </span>
              ))}
            </div>
            {output.unmetFutureRequirements.map((u) => (
              <div key={u.stageId + u.message} className="callout bad">
                {u.message}
              </div>
            ))}
          </div>

          <div className="grid-2">
            <div className="card">
              <h2>下一场推荐阵容</h2>
              {output.primaryPlan ? (
                [output.primaryPlan, ...output.backupPlans].map((plan) => (
                  <div key={plan.label} className="plan">
                    <div className="team">
                      <span className={`tag ${plan.label === "主方案" ? "core" : ""}`}>
                        {plan.label}
                      </span>
                      {plan.team.members.map((m) => m.base.name).join(" + ")}
                    </div>
                    <ul className="reasons">
                      {plan.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                    {plan.warnings.map((w, i) => (
                      <div key={i} className="callout warn" style={{ marginTop: 6 }}>
                        {w}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                <p className="muted">当前没有可行阵容。</p>
              )}
              {output.notes.map((n) => (
                <div key={n} className="callout warn">
                  {n}
                </div>
              ))}

              {output.rejectedTeams.length > 0 && (
                <>
                  <h3>为什么不能用这些队</h3>
                  <ul className="reasons">
                    {output.rejectedTeams.map((t, i) => (
                      <li key={i}>
                        {t.memberIds.map((id) => store.characters.get(id)?.name ?? id).join(" + ")}
                        ：{t.reasons.join("；")}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="card">
              <h2>不可消耗 / 当前预留</h2>
              {output.doNotSpend.length === 0 ? (
                <p className="muted">当前没有被硬性预留的角色。</p>
              ) : (
                output.doNotSpend.map((d) => (
                  <div key={d.characterId} className="callout bad">
                    {d.reason}
                  </div>
                ))
              )}

              <h3>全部预留</h3>
              {output.reservations.length === 0 ? (
                <p className="muted">无。</p>
              ) : (
                <div className="scroll-x">
                  <table>
                    <thead>
                      <tr>
                        <th>角色</th>
                        <th>为</th>
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
                            <span className={`tag ${r.strictness === "hard" ? "bad" : "warn"}`}>
                              {r.strictness === "hard" ? "强制" : "建议"}
                            </span>
                          </td>
                          <td className="muted">{r.alternatives.join("、") || "唯一解"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="grid-2">
            <div className="card">
              <h2>事件选择</h2>
              <div className="row" style={{ marginBottom: 8 }}>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    addCandidate({ kind: "character", characterId: e.target.value, cost: 2 });
                    e.target.value = "";
                  }}
                  style={{ maxWidth: 180 }}
                >
                  <option value="">添加角色候选…</option>
                  {CHARACTERS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const buff = season.buffs.find((b) => b.id === e.target.value);
                    if (buff) {
                      const level = (run.buffLevels[buff.id] ?? 0) + 1;
                      const cost = buff.levels.find((l) => l.level === level)?.cost ?? 1;
                      addCandidate({ kind: "buff", buffId: buff.id, targetLevel: level, cost });
                    }
                    e.target.value = "";
                  }}
                  style={{ maxWidth: 180 }}
                >
                  <option value="">添加祝福候选…</option>
                  {season.buffs.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <button
                  className="action"
                  onClick={() => patch({ eventCandidates: [] })}
                  disabled={run.eventCandidates.length === 0}
                >
                  清空候选
                </button>
              </div>

              {output.eventRecommendation ? (
                <>
                  <div className="plan">
                    <div className="team">
                      <span className="tag core">推荐</span>
                      {output.eventRecommendation.label}
                    </div>
                    <ul className="reasons">
                      {output.eventRecommendation.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  {output.rejectedEvents.length > 0 && (
                    <>
                      <h3>其他候选为什么被排除</h3>
                      <ul className="reasons">
                        {output.rejectedEvents.map((e, i) => (
                          <li key={i}>
                            <strong>{e.label}</strong>（{e.score}）：{e.reasons.join("；")}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                <p className="muted">添加当前事件候选后，这里会给出选择建议。</p>
              )}

              <div className={`callout ${output.shouldRefresh.recommended ? "warn" : ""}`}>
                {output.shouldRefresh.recommended ? "建议刷新：" : "不建议刷新："}
                {output.shouldRefresh.reason}
              </div>
            </div>

            <div className="card">
              <h2>祝福评估</h2>
              <ul className="reasons">
                {output.buffPortfolio.explanation.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
              <div className="scroll-x">
                <table>
                  <thead>
                    <tr>
                      <th>祝福</th>
                      <th>目标等级</th>
                      <th>机制价值</th>
                      <th>覆盖场次</th>
                      <th>评分</th>
                    </tr>
                  </thead>
                  <tbody>
                    {output.buffOptions.map((b) => (
                      <tr key={b.buffId}>
                        <td>{b.buffName}</td>
                        <td>
                          Lv{b.targetLevel}
                          {b.breakpoint && <span className="tag good">质变</span>}
                        </td>
                        <td>{b.value.mechanicValue}</td>
                        <td>{b.coverageStages}</td>
                        <td>{b.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="grid-2">
        <div className="card">
          <h2>局内状态快速录入</h2>
          <p className="muted">
            粘贴局内信息（每行一条，例如 <code>菲林斯 2</code>、<code>幻剧之花 7</code>、
            <code>刷新 2</code>）。识别只在本地进行，低可信度的条目不会被自动采信。
          </p>
          <textarea
            value={capture}
            onChange={(e) => setCapture(e.target.value)}
            placeholder={"菲林斯 2\n爱诺 1\n幻剧之花 7\n刷新 2"}
            aria-label="局内状态"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="action primary" onClick={applyCapture} disabled={!capture.trim()}>
              识别并重算
            </button>
          </div>
          {captureMessage && <p className="muted">{captureMessage}</p>}
        </div>

        <div className="card">
          <h2>解锁与耐力</h2>
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
                {owned.map((c) => {
                  const base = store.characters.get(c.characterId);
                  if (!base) return null;
                  return (
                    <tr key={c.characterId}>
                      <td>{base.name}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={run.unlockedCharacterIds.includes(c.characterId)}
                          onChange={() => toggleUnlocked(c.characterId)}
                          aria-label={`${base.name} 已解锁`}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={run.vigor[c.characterId] ?? 0}
                          onChange={(e) => setVigor(c.characterId, Number(e.target.value))}
                          style={{ width: 64 }}
                          aria-label={`${base.name} 剩余耐力`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function riskTag(risk: "low" | "medium" | "high"): string {
  return risk === "low" ? "good" : risk === "medium" ? "warn" : "bad";
}
