# 项目 Backlog

本文件是**唯一项目执行状态**。目标是让真实玩家复用历史经验、当期事实和实战反馈，稳定完成剧诗，减少重复试错与操作负担。

- [项目表 Genshin-Theater-Copilot-Project](https://docs.google.com/spreadsheets/d/1GCgixxH7XKs3jb68ohrV0SO1ai3Iesd2ZVBBuAk8v40/edit)：Overview / Goals / Ideas / Docs，保存方向、目标、想法与资料，不复制具体任务日志。
- [docs/SOP.md](docs/SOP.md)：剧诗实际执行规则；[QUICKSTART.md](QUICKSTART.md)：现有入口说明。两者不维护项目任务状态。
- 历史 plans / prompts / retrospectives 保存资料与证据。新工作、优先级和完成状态只在这里维护；完成时附证据链接与结论，不复制实战流水。

职责边界：**通用 AI Agent** 研究、推理、规划、动态决策、交互与记录；**Harness** 复用确定性 guard；**独立云端 Run State** 仅保存完整进度/上下文；**玩家** 提供截图/现场反馈并操作游戏。默认入口 [AGENT.md](AGENT.md)，不要求玩家 CLI / JSON / 本地 Python。主产品不开发独立 App、专用聊天界面、自建 AI 后端或 Cloud Run 服务。实际工具能力决定是否能机械执行/云端保存。

## NOW

### B-01｜真实手机 → 电脑的 Agent-first dogfood

**问题：** 需要证明通用 AI 能按同一 SOP 持续协助真实剧诗并可靠接续，不能用 Windows 下载/CLI 流程定义主体验。

**现状：** Agent 入口、完整共享状态和当前 Work 的合成云端 IO/恢复已交付（D-02）。没有本次真实账号现场、实际手机会话或电脑另开会话的接续证据，保持未完成。原先要求先下载解压 CLI 的实验边界已被用户明确改为 Agent-first。

**完成证据：** 玩家在实际手机的通用 AI 中以截图/描述开始 live 局；AI 研究、给出关键选择、记录真实资源与至少一次试战反馈并云端 readback。随后在实际电脑会话以相同存档 URL/run_id 恢复，核对资源、pending、失败/总预算并继续一个真实步骤。记录两端平台与实际可用工具、代码ref、revision、现场观察及结果/停止原因。新进程恢复、合成案例或能读 SOP 都不算跨设备实测。

摩擦只记录实际发生的场景（重复传信息、不会提供现场、等待、不能读写/执行等）。不要求玩家学命令或手填 JSON。缺工具如实记为平台受限；不能为了验收伪造失败、成功、观察窗口或绕过停磨。真实阈值校准和未知赛季事实仍归 B-03/B-04。

## NEXT

### B-02｜Agent 入口实用复测与兼容性验证

**现状：** 默认入口已经确定为通用 AI + SOP + 独立共享状态，Windows CLI 降为次级适配。实现及当前会话可用范围见 D-02 / [验证记录](docs/agent-validation.md)。

**完成证据：** 随 B-01 复测“当前局面 → 建议 → 实际操作 → 反馈 → 保存 → 新会话恢复”，确认用户无需 CLI/JSON。失败/未知/条件路线不会被简化输出隐藏。ChatGPT Work 手机端须单独实测其实际工具，不能凭当前电脑会话推定支持。Claude/Gemini 仅在其真实工具允许读仓库、执行guard、读写状态且恢复成功后扩展支持声明；未测继续标理论可适配。无工具降级须明确未机械验证/未保存。无真实摩擦证据不开发新前端或服务。

### B-03｜用实战校准停磨阈值与预算

**问题：** 当前 2 次无有效改善、10 个百分点新增最佳进度、6 次/900 秒总预算是保守策略，不是历史实测结论。

**依赖与完成证据：** 使用 B-01 的真实尝试、固定观测窗口、机制观察和停止结果，评估是否过早停或放行了无效硬磨，记录样本局限与保留/调整理由。若改策略，新增相应 regression 并确认已知无收敛案例仍被拒绝、有效改善和真实备选仍允许、reroute 不重置总预算。样本不足就明确保留默认值和未校准状态，不凭感觉放宽。

### B-04｜补齐当期精确 Buff 分支证据

**问题：** `seasons/2026-10-v7.1.json` 仍为 `partial_verified`，精确祝福分支/等级/数值/触发/叠层/费用尚未充分核验；历史偏好不能代替当期文本。

**完成证据：** 相关 fact 具有可重新检查的当期游戏文本或可靠原始资料定位、日期和适用范围，逐项解释状态变更并通过 season validation；未核验或冲突项继续显式标记，不升级为保证。若 B-01 的当前决策依赖某未知 Buff，先补该事实；不要求把全部无关分支研究完才开局。换期后按实际赛季更新范围，不把 10 月事实当长期通用规则。

## PARKED

### B-05｜更重的交互或自动化形态

GUI / OCR / 自动读取游戏 / Web App / 后台监控暂不开发。只有 B-01/B-02 复测证明反复出现的重要摩擦无法用轻量协作解决，才讨论提升优先级。

**提升所需证据：** 具体真实场景、发生频率与影响、轻量方案的不足，以及预期改善与维护成本；不能以“已有 CLI”或技术可做作为理由。

### B-06｜历史缺失材料（unresolved）

缺失图片、被删内容、无法定位的敌人/逐次指标仍按 [sources.json](fixtures/history/sources.json)、[cases.json](fixtures/history/cases.json) 和 [复盘](docs/retrospectives.md) 保留 unresolved。可访问文本的去重与 regression 已完成，不重开整批历史吸收。

**恢复条件与完成证据：** 获得能复核、且影响实际决策的原始材料后，仅补对应缺口和来源定位；必要时补 regression。材料未取得就保持 unresolved，不编造数值、根因或已验证通关。

## DONE

### D-01｜v1.0.0 可发布的 portable Harness 基线

已完成：Windows portable CLI/Harness；future-route guard、SAFE / CONDITIONAL / BROKEN、动态招募与机制优先；当前战斗合同、试战授权/实战记录、重复失败不收敛停磨、总预算与 evidence-based reroute；八份历史资料去重和 regression；单一剧诗 SOP。

**已验证证据：** [v1.0.0 Release](https://github.com/CHNISam/Genshin-Theater-Copilot/releases/tag/v1.0.0)、[发布提交 8230bde](https://github.com/CHNISam/Genshin-Theater-Copilot/commit/8230bde53dade5cacb225a23fd3c63436d29e206)、[原生 Windows CI](https://github.com/CHNISam/Genshin-Theater-Copilot/actions/runs/37617362063)：52 项测试通过；`WINDOWS-SMOKE.json` 为 PASS（18 项检查）；正式 ZIP 与 `SHA256SUMS.txt`、smoke 中 SHA-256 一致。Windows 包无需安装 Python 或 clone。

这些不再排入当前开发。真实体验（B-01/B-02）、阈值校准（B-03）、剩余资料缺口（B-04/B-06）仍独立未关闭；发布成功不替它们作证明。

### D-02｜Agent 原生入口与共享 Run State 技术闭环

已交付：[AGENT.md](AGENT.md)、同一 [SOP](docs/SOP.md) 的原生步骤、[工具/存档协议](docs/agent-runtime.md)、`src/agent_state.py` 直接复用现有 Harness；intake 支持资料不齐先存；完整快照保留 pending/attempts/reroutes/预算与实际资源；追加式journal、元数据/hash校验、重复提交幂等、分叉拒绝和只允许同季资料更新。独立私有 Google Sheet 不复制项目任务，原项目表保持原样。

**实际证据：** [验证记录](docs/agent-validation.md)、[云端合成链摘要](fixtures/agent-cloud-smoke.json)：当前 ChatGPT Work 的8检查点真实connector保存/readback，每步新Python进程恢复；两次无收敛失败拒绝第三次，有证据重规划允许，合成成功仅一次扣耐力。68项本地回归通过（原52 + 新16）。审查后的恢复修复见 `c5d04bf`，同一云端链重读通过。未发布新Windows版本，v1.0.0保留。

**范围：** 这关闭实现与当前工具的合成IO/guard验证；不关闭B-01/B-02真实跨设备/跨Agent/实际策略体验，不关闭B-03阈值校准/B-04资料未知。单写者，无服务器锁；hash不是防篡改或事实真伪证明。
