# 公共资料证据协议

通用 Agent 联网研究；`src/season_readiness.py` 检查独立清单、缺值、来源定位、适用期和维护时效。它不抓网页、不运行模型、不认证网页真假。`partial_public` 是未交付完整公共资料的状态，不能被解释为“通过”。

## 固定检查范围

政策独立于 JSON 的 facts 列表：本期身份、开幕/特邀、增益树清单/升级结构/开幕属性、普通敌人池、事件目录、累计增益属性；六个固定节点的机制和配置；按限定元素导出的三棵树，每树原态、两个二阶、进阶、四个末阶（24节点），以及每树价格表。删除节点、将公开缺口改成 live、改 status 为 verified 都不能消除缺口。新增反应/模式先审核政策；未知元素组合明确阻塞，不能假称覆盖未来所有模式。

Buff 当前可用记录必须有 trigger / effects / limits，嵌套 null 同样不算完整。配置必须保留等级、HP、窗口等应查字段；动态实际出现的敌人、选项、价格修正、账号信息单独 classified live。敌人池、基础价格、全部可查增益属于 public，不能以“随机”转嫁给玩家。

每条 public fact 记录 knowledge_class、season_id、status、value、sources 和 evidence。evidence 包含 source URL、精确 locator、season_id、reviewed_at；URL 必须注册于 sources，源正文 content_season 必须相同，访问/复核日期不能在未来。最后复核超过7天需重查，这是维护政策。更新 captured_at 不会续期证据。不同来源只建立不同证据，不能把转载当独立官方一手核验。

`reference_catalog` 收集可追溯的通用表供研究定位，绝不自动进入运行依据。一个攻略推荐某分支只能确认其推荐意见/存在；不能顺带验证触发、系数、持续时间。文本相冲突时拆出共同机制与争议参数，共同机制可用，争议参数继续 conflict。

## Agent 主动循环

首次接手（包括 intake）、恢复、换期及每次涉及公共事实的选择，调用 `agent_state.research_status(snapshot, pack)` 或 `assess(pack)`，读实际 `public_gaps`，不能只读取 pack.status。第一次接手必须研究，不受 retry_after 跳过；已有当天研究可复用其证据和未解决记录。

Agent 按 prompts/season-research.md：官方/现期可检视原始文本 → 用户指定创作者 → 可追溯数据库及交叉核对。搜索不仅匹配标题，也核对正文年份/月份/版本/模式。用真实可用工具尝试替代页面/图片/字幕；未取得不得说已观看。公共缺口记录检索日期、方式、目标、结果；失败仍是公共研究债。

同一天完整研究已尝试而源不可读时，记录 research.reviewed_at 和次日 retry_after，避免每次选择重做全部失败搜索；不能推迟超过次日。7天过期证据、换期或当前决策缺依据立即重查。Agent 主动维护，不需要玩家再提醒。没有联网能力就明确平台阻塞；确定性代码不会凭空联网或保证任意 AI 遵循 SOP。

更新同一公共包 → validate_season → assess → 对应语义复核/回归 → refresh_season 同季存档 → check → 保存/readback。refresh 不清 attempts、pending 或总预算；pending 先记录反馈，再更新事实。更换月份创建新局，旧数据不提升为现期事实。云端完整快照保留 research/evidence，恢复后重新按当天审核。

## 按范围决策

`harness.check` 在 live 路径必调 assess：身份/名单/增益清单，加当前 encounter 的机制，加显式 buff_fact_ids 及其父节点。实际取得的 canonical buff ID 也自动检查，避免遗漏合同引用。缺相关公共事实拒绝 authorize；普通关当前未知仍要求现场观察。未依赖的争议窗口/无关末阶不阻塞已具备依据的共同机制决策。

比较增益、评估数值或规划价格前，由 Agent 对候选节点、父节点、价格表调用 `decision_requirements` / `assess(required=...)`。不得用“战斗可授权”作为整个购买/策略研究已完成证明；自然语言是否漏报依赖仍需 Agent 语义审核，程序无法识别所有隐含引用。现场直接可检视的当前文本可补对应事实，不要求玩家为整个公共目录截图。

`research_required` 是持续公共债；`research_due` 是日级重试是否到期；`decision_ready` 只回答给定范围。无 required 的默认审核回答整体完整性。全量交付必须 `assess(...).status == PUBLIC_READY`，并通过语义复核，不能以覆盖比例代替关键项。

维护者命令（玩家无需运行）：

```sh
python -m src.season_readiness seasons/2026-10-v7.1.json --strict
```

有任何公共缺口返回2。普通 CI 保留可见的全量审核 artifact，同时六个共同机制必需通过；CI通过不表示公共资料已完整交付。不得为让 CI 绿而把严审改成完整成功。

## 已有固定代码版本的存档

旧存档code_ref仍须保留以便审计复现；旧版本不会因为公共JSON更新就自动拥有新guard。接手旧存档时，Agent另加载当前仓库的season_readiness进行资料预检，并明确标注历史执行版本。不能只执行旧check后声称新门槛已验证，也不能静默修改journal的code_ref。实际继续执行前需有可审计的代码升级/状态迁移，完整保留attempts、pending与预算；本次未实现迁移，若旧版本无法执行新检查须保持该项阻塞。这不影响新局使用本次版本。
