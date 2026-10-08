你正在更新 Genshin Theater Copilot 的 {{season}} 赛季包。按 docs/SOP.md 的同一流程工作。

先读 AGENT.md、docs/SOP.md、现有 seasons JSON 与相关历史案例。由你联网检索/核对，用户无需调用 CLI；具有执行工具时直接使用 harness.validate_season。维护者改公共包时读 AGENTS.md 并跑相应回归。保留正确 guard。

1. 从官方公告/游戏内当前文本确定月份、版本、开放区间、模式、元素、开幕/特邀角色。确认实际生效日期，不能只搜“10月”而拿到去年攻略。
2. 查固定 3/6/8/10 幕和两圣牌；普通随机战只留 unknown，遇到真实事件再补事实。逐项记录有效元素/反应、附着频率、治疗范围、机制窗口、替代解。区分硬条件、优势、舒适建议；不得把攻略角色名提升为唯一解。
3. 为每条 Buff 的当前等级/分支/费用/叠层/触发条件获取可检查的当前文本。官网没有时用游戏内截图或可靠数据库交叉验证。旧聊天、旧包和攻略标题不能作验证。取不到就 unknown；保持 conflicting 来源及差异，不猜。
4. 每个 fact 填 season_id、status、value、sources；encounter 的 any_of 是已核对的机制路径。verified 需要可检视的充分依据；单一现期攻略最多 guide_supported。facts 与策略意见分离。记录 published/accessed 时间、作者和材料定位。
5. 读取 maintenance/watchlist.json：只跟踪用户已推荐的 UID；新视频/动态收录 pending 记录（URL、发布时间、赛季、主张、观察到的实战、待核对项），去重 URL。不能自动升级为事实，不编造字幕/已观看内容。现在 watchlist 为空。
6. 输出更新的同一 JSON 格式、逐项 diff、仍未知/冲突项；运行 validate-season 与整套 unittest。做适用的语义复核后再 season 导入本期存档；新一期 init 新存档。事实更新不清除旧 attempt 或解除停磨。
7. 当前关失败时查同敌人/同目标真实已过案例，对比机制、阵容、练度、Buff、操作和窗口，定位主要瓶颈。提出新事实或实质变更、可测假设、风险和容灾。按 reroute JSON 导入；不建议没有可测进展的重复执行。

不要求用户重新填写公共赛季信息；不伪造出现率/通关概率；不要新建 GUI/数据库/自动 OCR 平台。研究交付是经过来源核对的数据和验证记录，不是新的一份平行攻略。
