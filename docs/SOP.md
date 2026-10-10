# 剧诗执行 SOP

本文件是唯一剧诗操作流程；README/QUICKSTART 只是入口，历史路线不是第二套执行规则。项目开发优先级与执行状态只看 [Backlog.md](https://github.com/CHNISam/Genshin-Theater-Copilot/blob/main/Backlog.md)，不在本 SOP 维护待办。

## 0. Agent 原生执行边界

默认产品交付是[凝渡式每期一图流](season-guide.md)：先研究并形成完整逐幕攻略，覆盖阵容、带图怪物选择、开打前/打完选择、Buff路线和好友助战。以下步骤服务于实际执行与动态修订，不要求玩家每幕先来问下一步，也不以存档/guard验收代替攻略内容准确性。只制作公共攻略时不伪造live状态或强制创建游戏局。

主入口是 [AGENT.md](../AGENT.md)：用户打开通用 AI，提供截图/口述并执行游戏操作；AI 负责研究、计划、录入和下一步决策。云端仅保存游戏局状态，不负责推理。工具、完整状态和手机/电脑恢复协议见 [agent-runtime.md](agent-runtime.md)。没有执行/写入工具时须标明降级，不能伪称 guard 已执行或状态已保存。

下文 `sync / check / trial / record / next / prepare / reroute / event / research` 表示工作步骤，**不要求玩家运行命令**。有代码执行能力的 Agent 通过 `src.agent_state.act` 调同一 Harness：trial→authorize、next→next_fight、event→purchase、season→refresh_season；research 由 Agent 联网按 prompts/season-research.md 完成。Windows CLI 是可选适配器。

开局事实未齐可先存 intake；只有真实账号/现场资料齐备才激活机械 run。每次选择或反馈后更新；推荐本身不代表已执行。试战先授权、保存 pending 并读回再执行，反馈记录也必须保存。换设备/Agent 从云端完整状态恢复，保留所有失败、预算和 pending；单会话写入、检测到分叉就停止，不凭聊天记忆续局。

## 1. 本期预检与开局预算

AI 直接按 [赛季研究提示](../prompts/season-research.md) 联网准备公共资料；不要求玩家调用 research。逐项获取来源、发布时间、访问时间、版本/有效区间、机制与 Buff 当前文本。`verified`、`guide_supported`、`unknown`、`conflict` 不能混用。`validate_season` 只验证结构。必须再按 [公共证据协议](season-evidence.md) 执行 `assess`，读取独立清单、全部 public_gaps、证据过期和 decision_blockers；`partial_public`/旧 `partial_verified` 不能算资料交付。Agent 首次/恢复/过期主动研究；当天已尝试仍不可读的源次日重查。语义核对后同季 refresh，新月新存档。不可读图片/未检索的公共分支不是现场动态未知。

账号能力从当前画面/操作事实取得，旧月份角色练度只作为提问线索。只录决策相关 build 和 tags/source：高频附着≠元素标签，全队治疗≠单人回血，治疗到满血≠护盾，普攻驱动≠重击，精通雷神≠直伤雷神。特殊队伍条件由人工检查后再给出能力标签；不要假装程序有完整角色伤害数据库。

默认目标 10 主线＋2 圣牌。先倒排关键机制关，形成主要输出、机制/治疗岗位及实际备选；普通挂件不逐一预订。`checkpoints` 对剩余目标逐个列出 strategic options，每个 consumes 只包含战略稀缺资源。多个队伍争抢同一辅助会由现有回溯求解器检查。空 options 表示没有方案，不能删节点隐藏缺口。

## 2. 当前快照覆盖旧计划

`sync` 导入可复用 JSON 或现场纠正：vigor、已解锁、花、刷新、Buff、相关 build、未来 alternatives。它拒绝覆盖赛季/目标/已完成/尝试历史/contract。新观察作为 audit 留痕，`.bak` 是恢复误操作用，不用于清除失败记录。手动编辑 JSON 是受信的人类输入，不能被工具防篡改。

每次招募、资源消费、恢复/回溯、角色或 Buff 变化后重新 `check`。待命不等于已取得，事件重置不保证角色候选、更不保证目标角色。`event` 仅记录真实已选择的事件、真实 cost 与 outcome：它不会替你点击游戏，不预支奖励。`recruits` 只排序实际候选的 route status 和路线数，路线数不是概率。

招募可提前取得期权，不参战没有耐力持有成本；花费仍有机会成本。关键机制/稀缺岗位提早寻找，而非固定所有角色提前一/两幕。未来缺口优先修复，重复功能低收益；未来资源足够后才比较 Buff 的剩余实际覆盖。不能为了旧“水少”印象忽略当前已足够水位，不因为花多就强迫购买。资金不足会机械拒绝。

## 3. 当前 Fight Contract

`next` 以 `{"fight": ..., "evidence": [...]}` 进入尚未完成的 checkpoint。每关具体敌人/目标覆盖开局预想，保留目标集合和所有历史；上一关未过不能普通 next 跳走。需要回溯/放弃时结束本 run，另存新的真实检查点快照并保留旧 run 供复盘；不要用回溯伪造“本关已过”。

尚未实战的同一关可用 `prepare run.json corrected-package.json` 补正证据、输出/生存说明或指标；它不能改关号，且有过任何尝试以后禁用，必须 reroute。

最小 contract：

| 字段 | 判断责任 |
|---|---|
| encounter_id / team | 当前关与四人；已解锁、耐力>0、无重复由程序检查 |
| mechanic_actions | 针对 season.encounters 的每个事实，capability / providers / execution；必须有当前账号相关 tag/source；实际处理质量人工复核 |
| damage / sustain / rotation / risks | 人工给出输出来源、恢复方案、关键操作和不确定性，不能只说“角色很强” |
| metric | 成功目标的进度百分比、固定 window_seconds；同关同窗口可比较 |
| evidence_ids | 当前季、当前关、同目标 clear-reference 或 live-observation；reviewed 且 comparison 写出与账号/打法的差异 |
| buff_fact_ids（如依赖） | 引用当前文本对应 fact，unknown/conflict 不允许当依据 |

来源可为可靠 URL 或 `local:录像/截图/实战定位`，需能重新找到。人工审核 reference 是否真的已过、账号是否差距过大、是否具备输出/治疗和操作条件。不存在充分依据时先补证据。历史成功只能提示需要核对什么，不能冒充现期 reference。普通关已有当前现场验证也可用 live-observation，避免反复研究无关细节。

`SAFE` 只说明未来战略用量存在一组解；完整四人、输出和所有后续关的实战可靠度由逐关 contract 检查。`CONDITIONAL`＝需待命招募成功，保留警告；`BROKEN`＝未来分配无解。任何当前缺事实/能力/证据、未来 BROKEN 或停磨状态都会阻止 `trial`。

## 4. 授权一次 → 实战 → 记录

`trial` 从本 run 的现时状态运行 guard 并生成一个 pending ticket，绑定完整快照和方案。进入实战；`record` 消耗这张 ticket，一次且仅一次写入实际结果与机制观察。pending 期间不能 sync/event/reroute/next，也不能再授权第二次。

失败理由至少 timeout / death / mechanic / execution / unknown 等具体事实，observation 说明哪个阶段、Boss 余血/目标进度、机制处理、输出窗口/能量/治疗瓶颈。若提前死亡无法在声明窗口测量，用 score null；机制没观察到用 unknown。不能随便填写乐观百分比。

pass 必须为实际成功信号、score100、mechanics yes；四个实际队员各扣1并记 completed。失败/退出不默认扣耐力；特殊变化按真实游戏快照同步。当前 COMPLETE 只允许 next/结束，不允许重复扣耐力。

## 5. 收敛检查与停磨

硬 invariant：**Repeated execution without measurable convergence must not remain a valid next action.**

默认策略在 `policies/convergence.json`，它是保守操作预算，非游戏机制/历史实测：

- 第一次有依据的失败可再授权一次。
- 连续2次失败未出现至少10个百分点的新增最佳进度 → REPEATED_NON_CONVERGENCE。有效改善把连续无进展计数归零；“先变差再回到旧最佳”不能归零。
- 缺指标不能证明收敛；改变观测窗口或度量不可直接比较。
- 机制处理失败/未知立即 MECHANIC_FAILED，不能用更高表面伤害覆盖。
- 总计6次授权后实战记录，或累计900秒 → TRIAL_BUDGET_EXHAUSTED，跨所有方案/reroute计数，结束本关本轮执行。

BLOCKED 时合法下一步是查证和诊断，不是执行重试。程序没有“忽略 stop”开关。若人在游戏内绕过授权仍去打，工具不能阻止游戏操作；须保留该违规观察并重新诊断，不能声称 harness 已保护这次未接入的执行。

## 6. Evidence / Model reroute

检查同关同目标可靠已过案例，比较机制处理、阵容、实际 build、Buff、操作、输出窗口。确认主要限制因素：错机制？反应/驱动不足？抗性阶段？能量？奶量？练度/DPS？缺信息本身也是需要补数据的瓶颈。原先“没查攻略”的归因若与历史不符必须撤回。

`reroute` 包必须带完整新 fight、适用于本季同关的新 evidence、review 中 bottleneck / comparison / hypothesis / reviewed。新证据必须进入新 contract 引用；同来源改 ID 不算新证据。阵容、实际 build、Buff、mechanic_actions 或 rotation 须有实质变更；仅换 plan_id/notes 不通过。真正的变更意义和证据真假是人类审核点，程序不能识别所有文字同义改写。

重新授权有限试战，旧 attempts 和总预算不清空；再次无进展继续 stop。没有新证据/可执行的实质变化，就保持 BLOCKED。总预算耗尽不可 reroute 解锁，应结束执行，补练度、修模型或下次再验证。

## 7. 闭环归档

run 保存全部结果，记录 observed / proposed / unknown。经操作者确认的重大失败写入 fixtures/history 或新的 case；具体战斗观察留 season/run 范围，通用教训写 policy。先写能重现错误的 regression，确认坏 case 拒绝、代表性允许 case 和真实备选仍通过，且试战入口实际调用检查。新规则不要只添一句 README。

B站 watchlist 在 maintenance/watchlist.json；只添加用户推荐的 UID/主页。新内容先 pending（可检查定位、日期、赛季、主张、实战证据、未解决事项），再按上述事实审核进入赛季包/策略；不是自动订阅，也不自动把 UP 主观点升为机制事实。

## 8. 实际使用收口

Agent从AGENT.md唯一入口自动发现存档、初始化和研究，玩家只给现场并执行操作。当前账号审查见 `src.execution_review`：合同明确 damage/sustain/execution 的证据等级；真实clear与guide-proposal严格分开。review绑定当前配置、目标和证据，变更后重新审核；supported需有可定位clear，uncertain只支持有依据的有限probe，insufficient拒绝试战。未来capability_review不替代资源求解器；已知不够的路线被剔除，未审查的路线保持警告。没有成功概率数据库，不报估计百分比。

候选招募排名只是资源杠杆。Agent还须比较真实build、机制适配、当前/后续覆盖、真实cost与失败代价；route数量更多不能覆盖账号能力不足。随机奖励/恢复/属性变动按现场sync，只记录发生后的actual；候选/预计收入不能入账。现有purchase覆盖招募/增益/刷新；其他事件用已有sync记录实际资源并observe来源，不自建事件服务。

当前check.next_action不因无关公共资料欠账退回研究。持有但未依赖的未知增益不纳入论证；一旦作为依据就必须列入buff_fact_ids并核验。首次/恢复研究一次并记实际尝试，无法读取时按范围选择已具备证据的打法；关键依赖不足才暂停，不问玩家整理公开表。默认目标含两张圣牌时，必须先完成它们再进第10幕；check和next均检查。

保存和恢复用session.prepare_save/confirm_save，不把工具成功返回视为保存完成。暂离/切设备先保留pending与最近实际资源，返回只询问未记录结果/现场变化。仅有模拟与connector验证时，不关闭真实手机/电脑验收。

## 一图流制作入口

当前成品：[2026年10月完整攻略图](../guides/output/2026-10-guide.png)。制作合同与离线导出方法见[season-guide.md](../docs/season-guide.md)。新期先取得当期内容及可追溯真实UI素材，更新guides期次JSON再导出；玩家默认直接使用整图，不要求运行命令。
