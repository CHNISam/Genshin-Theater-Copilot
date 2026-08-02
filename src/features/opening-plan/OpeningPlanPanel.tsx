import { useMemo } from "react";
import { buildOpeningPlan } from "../../solver/opening";
import type { AppStore } from "../../state/store";

export function OpeningPlanPanel({ store }: { store: AppStore }): JSX.Element {
  const plan = useMemo(() => {
    if (store.roster.characters.length < store.season.ruleOverrides.teamSize) return null;
    return buildOpeningPlan({
      season: store.season,
      roster: store.roster,
      characters: store.characters,
    });
  }, [store.season, store.roster, store.characters]);

  if (!plan) {
    return (
      <section className="panel">
        <div className="card">
          <p className="muted">先在「角色池」录入至少 4 名角色。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      {plan.riskNodes.length > 0 && (
        <div className="card">
          <h2>最大风险节点</h2>
          {plan.riskNodes.map((risk) => (
            <div key={risk} className="callout bad">
              {risk}
            </div>
          ))}
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h2>助演推荐</h2>
          {plan.supportGuestRanking.length === 0 ? (
            <p className="muted">在角色池页填写「助演候选」后，这里会比较它们的战略价值。</p>
          ) : (
            plan.supportGuestRanking.map((guest, i) => (
              <div key={guest.characterId} className="plan">
                <div className="team">
                  {i === 0 && <span className="tag core">推荐</span>}
                  {guest.characterName}
                  <span className="muted" style={{ marginLeft: 8 }}>
                    战略评分 {guest.score}
                  </span>
                </div>
                {guest.contendsScarceElements.length > 0 && (
                  <span className="tag warn">
                    争抢 {guest.contendsScarceElements.join("/")} 系资源
                  </span>
                )}
                {guest.selfSufficient && <span className="tag good">自带续航</span>}
                <ul className="reasons">
                  {guest.reasons.map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <h2>稀缺资源</h2>
          {plan.scarceElements.length === 0 && plan.scarceFunctions.length === 0 ? (
            <p className="muted">当前没有明显紧缺的元素或功能位。</p>
          ) : (
            <>
              {plan.scarceElements.map((s) => (
                <div key={s.element} className="callout warn">
                  {s.element} 系紧缺度 {(s.level * 100).toFixed(0)}%：多名主 C 争抢同一批队友。
                </div>
              ))}
              {plan.scarceFunctions.map((f) => (
                <div key={f} className="callout">
                  {f}
                </div>
              ))}
            </>
          )}

          <h3>必须保留</h3>
          {plan.mustPreserve.length === 0 ? (
            <p className="muted">没有角色被判定为固定机制关的稀缺解。</p>
          ) : (
            plan.mustPreserve.map((m) => (
              <div key={m.id} className="callout bad">
                <strong>{m.name}</strong>：{m.reason}
              </div>
            ))
          )}

          <h3>可前期消耗</h3>
          <p className="muted">
            {plan.earlyExpendable.map((e) => e.name).join("、") || "（无）"}
          </p>
        </div>
      </div>

      <div className="card">
        <h2>核心作战模块</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>核心</th>
                <th>基准队友</th>
                <th>可承担关卡</th>
                <th>占用稀缺资源</th>
              </tr>
            </thead>
            <tbody>
              {plan.coreModules.map((m) => (
                <tr key={m.coreId}>
                  <td>
                    <strong>{m.coreName}</strong>
                  </td>
                  <td>{m.teammates.map((t) => t.name).join("、") || "—"}</td>
                  <td className="muted">{m.suitableStages.join("、") || "—"}</td>
                  <td className="muted">{m.consumesScarce.join("、") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2>固定首领预案</h2>
          {plan.bossPlans.map((b) => (
            <div key={b.stageName} className="plan">
              <div className="team">{b.stageName}</div>
              <div className="muted">机制：{b.mechanics.join("；") || "无已确认硬机制"}</div>
              <ul className="reasons">
                {b.answers.map((a, i) => (
                  <li key={i}>{i === 0 ? `主方案：${a}` : `备选：${a}`}</li>
                ))}
                {b.answers.length === 0 && <li>当前角色池找不到可行阵容。</li>}
              </ul>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>圣牌 / 生存关预案</h2>
          {plan.tabletPlans.map((t) => (
            <div key={t.stageName} className="plan">
              <div className="team">{t.stageName}</div>
              <div className="muted">{t.note}</div>
              <ul className="reasons">
                {t.answers.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
                {t.answers.length === 0 && <li>当前角色池找不到可行阵容。</li>}
              </ul>
            </div>
          ))}

          <h3>祝福投资方向</h3>
          <ul className="reasons">
            {plan.buffPortfolio.explanation.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <h2>关键角色获取截止点</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>关卡</th>
                <th>需要的能力</th>
                <th>最晚获取</th>
                <th>可用人选</th>
              </tr>
            </thead>
            <tbody>
              {plan.deadlines.map((d, i) => (
                <tr key={i}>
                  <td>{d.stageName}</td>
                  <td>{d.requirement}</td>
                  <td>第 {d.latestActOrder} 幕前</td>
                  <td className={d.candidates.length === 0 ? "" : "muted"}>
                    {d.candidates.length === 0 ? (
                      <span className="tag bad">无人可用</span>
                    ) : (
                      d.candidates.join("、")
                    )}
                  </td>
                </tr>
              ))}
              {plan.deadlines.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    本期赛季包中没有记录任何固定关卡硬机制。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>基准十二场路线</h2>
        {!plan.baselineFeasible && (
          <div className="callout bad">
            推演在「{plan.baselineFailedStage}」断裂：即使假设角色全部解锁也无解。
          </div>
        )}
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>关卡</th>
                <th>队伍</th>
              </tr>
            </thead>
            <tbody>
              {plan.baselineRoute.map((step) => (
                <tr key={step.stageId}>
                  <td>{step.stageName}</td>
                  <td>
                    {step.memberIds
                      .map((id) => store.characters.get(id)?.name ?? id)
                      .join(" + ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plan.notes.map((n) => (
          <p key={n} className="muted">
            {n}
          </p>
        ))}
      </div>
    </section>
  );
}
