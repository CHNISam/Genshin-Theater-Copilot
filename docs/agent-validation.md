# Agent-first 验证记录 — 2026-10-08

## 实际观察到的范围

| 能力/场景 | 结果 | 证据范围 |
|---|---|---|
| 本次 ChatGPT Work 读仓库、执行 Python、Google Sheets 读写 | 已实测 | 当前会话可用工具；不自动推广到普通 ChatGPT/手机 |
| 同一云端局追加保存、重新读取、新 Python 进程恢复并继续 guard | 已实测 | 合成 demo，8个完整检查点；每次 readback 后核验 head hash |
| pending、两次无进展停磨、有证据的 reroute、成功一次扣耐力 | 已实测 | 云端合成链 + 回归；不是游戏实战或 AI 策略质量证明 |
| 现有 Harness 与新增恢复规则 | 68项回归通过 | Python 3.12/Linux；52项原基线 + 16项新增 |
| 私有运行表、表头、冻结行、摘要/隐藏JSON列 | API读回已核验 | shared=false，只有 owner；未核验原生手机视觉排版 |
| 图像→实际账号状态→真实赛季研究→逐关建议→真实反馈 | 未实测 | 本次没有新的游戏截图/账号与战斗反馈；B-01 保持开放 |
| 实际手机发起，再由实际电脑会话恢复同一 live 局 | 未实测 | 新 Python 进程不是手机/电脑设备切换证据 |
| Claude/Gemini 完整闭环 | 理论可适配，未验证 | 通用 SOP / JSON / Python / Sheets协议，不等于这些平台已有所需工具 |
| 无执行工具的普通通用 AI | 可阅读规则；完整机械路径受限 | 只能明确标为人工式协助，不能声称 guard 已运行 |
| 同局多 Agent 并发写入 | 不支持可靠并发执行 | fork检测，非服务端 CAS/锁；采用单写者交接 |

## 云端合成链

源码适配版本 `8677b8b14899f5be0ab64e9c2ef5de24dc5adc32`，当前 Work 会话的 Google Drive connector；每步由新 Python 进程处理刚读回的云端值，不取之前进程内 run。日期：2026-10-08；run_id=`cloud-smoke-published-2026-10-08`，mode=`demo`。

| revision | 动作/结果 |
|---|---|
| 1 | 保存完整合成初始状态 |
| 2 | 授权，pending保留 |
| 3 | 合成失败40%/90秒，attempts=1 |
| 4 | 再次授权，历史保留 |
| 5 | 同窗失败40%，REPEATED_NON_CONVERGENCE；第三次authorize实际拒绝 |
| 6 | 新合成同关证据 + 换fallback，reroute允许；两次历史失败保留 |
| 7 | 有限试战授权 |
| 8 | 合成成功，attempts=3、reroutes=1、completed=[act-8]、core vigor=1、pending=null |

最终完整 readback SHA-256：`e2f8dc0bc061137e52d386e29bc389560e72fabdf4b85c0291b890bbe73d8500`。详细摘要见 [fixtures/agent-cloud-smoke.json](../fixtures/agent-cloud-smoke.json)。这是当前 connector 的真实 IO + 合成游戏输入，不能叫真实通关/跨设备验收。私有云端表链接只交给用户，不把游戏存档位置/真实账号数据写进公共仓库。

代码审查发现：如果先按局号列筛选，损坏的最新行可能被跳过，从而丢失 pending。在本地审查提交 c5d04bf 修复（已包含于上述远端源码ref）：先校验每行内嵌 JSON 与元数据，再选局号。新增坏例回归先失败、修复后通过；修复版重读同一云端 r1–r8 完整链通过；随后使用可从 GitHub 取得的已发布ref再次完成上述8步云端链。另建 live/intake 准备记录并读回，没有补造游戏事实，仍不算真实游戏或跨设备验收。

## 尚需真实验收

玩家在实际手机会话提供现场，记录该端实际工具；至少一次真实选择/试战反馈存到 live 局。电脑另开会话从相同 URL/run_id 读回完整状态，核对资源/pending/失败预算并继续一个真实步骤。缺任何一段就保留“未验证/平台受限”，不能靠模拟或聊天同步替代。最终主产品验收与下一步只在 [Backlog](../Backlog.md) 跟踪。

v1.0.0 发布与原生 Windows smoke 是既有证据，不因这次 Linux/connector测试自动升级为新Windows发布验证；VERSION保留，无覆盖旧release。远端本次CI结果以PR current-head workflow为准。

## 本轮生产适配验证

新增账号审查、研究范围与Sheets适配的实际证据见[production-validation.md](production-validation.md)和[脱敏connector摘要](../fixtures/production-cloud-smoke.json)。105项回归/102项非UTF core/18项Windows smoke通过；既有准备live/intake已经留痕升级并r2读回，账号仍未知。10检查点新connector链与重复append实际通过，状态/战斗输入均合成，不替代上表的真实现场、手机→电脑或其他Agent验收。
