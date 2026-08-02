import { useMemo } from "react";
import { validateSeason } from "../../season/validate";
import { describeRequirement } from "../../solver/mechanics";
import { CHARACTER_BY_ID } from "../../data/characters";
import type { AppStore } from "../../state/store";

export function SeasonPanel({ store }: { store: AppStore }): JSX.Element {
  const season = store.season;
  const validation = useMemo(
    () => validateSeason(season, { knownCharacterIds: new Set(CHARACTER_BY_ID.keys()) }),
    [season],
  );

  const name = (id: string): string => CHARACTER_BY_ID.get(id)?.name ?? id;

  return (
    <section className="panel">
      <div className="panel">
        <h2>本期赛季（公共信息，无需用户录入）</h2>
        <div className="row">
          <span className="chip">{season.id}</span>
          <span className={`chip ${season.status === "published" ? "good" : "warn"}`}>
            {season.status}
          </span>
          <span className="chip">数据版本 v{season.dataVersion}</span>
          <span className="muted">
            {season.startsAt.slice(0, 10)} → {season.endsAt.slice(0, 10)}
          </span>
        </div>
        <table style={{ marginTop: 10 }}>
          <tbody>
            <tr>
              <th>限制元素</th>
              <td>{season.allowedElements.join(" / ")}</td>
            </tr>
            <tr>
              <th>开幕角色</th>
              <td>{season.openingCharacterIds.map(name).join("、")}</td>
            </tr>
            <tr>
              <th>特邀角色</th>
              <td>{season.specialGuestIds.map(name).join("、")}</td>
            </tr>
            <tr>
              <th>结构</th>
              <td>
                {season.ruleOverrides.mainActCount} 幕主线 +{" "}
                {season.ruleOverrides.tabletChallengeCount} 场圣牌；固定首领第{" "}
                {season.ruleOverrides.bossActOrders.join("、")} 幕；每角色初始{" "}
                {season.ruleOverrides.defaultVigor} 点耐力
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>关卡与机制</h2>
        <div className="scroll-x">
          <table>
            <thead>
              <tr>
                <th>关卡</th>
                <th>类型</th>
                <th>硬机制</th>
                <th>伤害/生存/控制</th>
                <th>可信度</th>
              </tr>
            </thead>
            <tbody>
              {[...season.stages]
                .sort((a, b) => a.order - b.order)
                .map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td className="muted">{s.type}</td>
                    <td>
                      {s.hardRequirements.length === 0 ? (
                        <span className="muted">—</span>
                      ) : (
                        s.hardRequirements.map((r, i) => (
                          <div key={i}>{describeRequirement(r)}</div>
                        ))
                      )}
                    </td>
                    <td className="muted">
                      {s.damagePressure} / {s.survivalPressure} / {s.controlValue}
                    </td>
                    <td>
                      <span
                        className={`chip ${
                          s.confidence === "confirmed" || s.confidence === "high"
                            ? "good"
                            : s.confidence === "medium"
                              ? "warn"
                              : "bad"
                        }`}
                      >
                        {s.confidence}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <h2>校验结果</h2>
          <div className={`note ${validation.canPublish ? "ok" : "warn"}`}>
            ok={String(validation.ok)}，canPublish={String(validation.canPublish)}
          </div>
          {validation.issues.length === 0 ? (
            <p className="muted">没有问题。</p>
          ) : (
            <ul className="reasons">
              {validation.issues.map((issue, i) => (
                <li key={i}>
                  <span className={`chip ${issue.severity === "error" ? "bad" : "warn"}`}>
                    {issue.code}
                  </span>
                  {issue.path}：{issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <h2>未解决的来源冲突</h2>
          {season.unresolvedQuestions.length === 0 ? (
            <p className="muted">无。</p>
          ) : (
            season.unresolvedQuestions.map((q) => (
              <div key={q.id} className="slot">
                <div className="who">{q.question}</div>
                {q.blocksPublish && <span className="chip bad">阻塞发布</span>}
                <ul className="reasons">
                  {q.conflictingClaims.map((c, i) => (
                    <li key={i}>
                      {c.claim}
                      <span className="muted">（{c.source} · {c.confidence}）</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          <h3>数据来源</h3>
          <ul className="reasons">
            {season.sourceRecords.map((s, i) => (
              <li key={i}>
                <span className="chip">{s.sourceType}</span>
                {s.title}
                <span className="muted"> · {s.confidence}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="panel">
        <h2>如何更新到下一期</h2>
        <ol className="reasons">
          <li>
            <code>npm run season:research -- --season=2026-09</code> 生成研究任务与完整 Prompt。
          </li>
          <li>把 Prompt 交给具备联网能力的 Agent，得到结构化 JSON。</li>
          <li>
            <code>npm run season:import -- --season=2026-09 --file=out.json</code> 导入并查看差异摘要。
          </li>
          <li>
            <code>npm run season:validate</code> / <code>npm run season:publish</code>：只有通过校验且没有阻塞性冲突的草稿才能发布。
          </li>
        </ol>
        <p className="muted">
          运行时不联网、不调用大模型；求解器只消费已发布的赛季包。
        </p>
      </div>
    </section>
  );
}
