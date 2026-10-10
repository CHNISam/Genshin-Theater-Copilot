你正在更新 Genshin Theater Copilot 的 {{season}} 赛季包。按 docs/SOP.md 的同一流程工作。

先读 AGENT.md、docs/SOP.md、现有 seasons JSON 与相关历史案例。由你联网检索/核对，用户无需调用 CLI；具有执行工具时直接使用 harness.validate_season。维护者改公共包时读 AGENTS.md 并跑相应回归。保留正确 guard。

1. 从官方公告/游戏内当前文本确定月份、版本、开放区间、模式、元素、开幕/特邀角色。确认实际生效日期，不能只搜“10月”而拿到去年攻略。
2. 查固定 3/6/8/10 幕和两圣牌；普通战的公开敌人池/配置仍须研究；实际选中的敌人/目标才留 live unknown，遇到真实事件再补。逐项记录有效元素/反应、附着频率、治疗范围、机制窗口、替代解。区分硬条件、优势、舒适建议；不得把攻略角色名提升为唯一解。
3. 为每条 Buff 的当前等级/分支/费用/叠层/触发条件获取可检查的当前文本。官网没有时用游戏内截图或可靠数据库交叉验证。旧聊天、旧包和攻略标题不能作验证。取不到保留 public_research_gap，记录搜索/打开/替代途径的实际尝试、原因和次日重试；不要以 unknown 结束维护。通用表放 reference_catalog，不自动提升为本期事实。保持 conflicting 来源及差异，不猜。
4. 每个 fact 填 season_id、status、value、sources；encounter 的 any_of 是已核对的机制路径。verified 需要可检视的充分依据；单一现期攻略最多 guide_supported。facts 与策略意见分离。记录 published/accessed 时间、作者和材料定位。
5. 读取 maintenance/watchlist.json：只跟踪用户已推荐的 UID；新视频/动态收录 pending 记录（URL、发布时间、赛季、主张、观察到的实战、待核对项），去重 URL。不能自动升级为事实，不编造字幕/已观看内容。目前已收录凝渡_Du（优先）与百渊候选账号；核对正文身份/日期，不擅自当作视频已观看。
6. 输出更新的同一 JSON 格式、逐项 diff、仍未知/冲突项；运行 validate_season、season_readiness.assess 全量及当前决策范围、整套 unittest。独立清单必须覆盖24节点与价格/事件/敌人池等；删除或空值仍是缺口。全量 strict 仍失败时只能报告未完成，不以 schema pass 宣布完整。做适用的语义复核后再 season 导入本期存档；新一期 init 新存档。事实更新不清除旧 attempt 或解除停磨。
7. 当前关失败时查同敌人/同目标真实已过案例，对比机制、阵容、练度、Buff、操作和窗口，定位主要瓶颈。提出新事实或实质变更、可测假设、风险和容灾。按 reroute JSON 导入；不建议没有可测进展的重复执行。

不要求用户重新填写公共赛季信息；不伪造出现率/通关概率；不要新建 GUI/数据库/自动 OCR 平台。研究交付是经过来源核对的数据和验证记录，不是新的一份平行攻略。

每次首次接手/恢复/资料过期按 docs/season-evidence.md 触发，无需玩家提醒。每条 public evidence 带 source/locator/season_id/reviewed_at，注册 source 的正文适用期和 accessed_at；不得只续 captured_at。当前选择候选 Buff 与父节点必须按 decision_requirements 审核，不能省略依赖。

## 一图流制作入口

当前成品：[2026年10月完整攻略图](../guides/output/2026-10-guide.png)。制作合同与离线导出方法见[season-guide.md](../docs/season-guide.md)。新期先取得当期内容及可追溯真实UI素材，更新guides期次JSON再导出；玩家默认直接使用整图，不要求运行命令。
