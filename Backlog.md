# 项目 Backlog

本文件是**唯一项目执行状态**。目标是让真实玩家复用历史经验、当期事实和实战反馈，稳定完成剧诗，减少重复试错与操作负担。

- [项目表 Genshin-Theater-Copilot-Project](https://docs.google.com/spreadsheets/d/1GCgixxH7XKs3jb68ohrV0SO1ai3Iesd2ZVBBuAk8v40/edit)：Overview / Goals / Ideas / Docs，保存方向、目标、想法与资料，不复制具体任务日志。
- [docs/SOP.md](docs/SOP.md)：剧诗实际执行规则；[QUICKSTART.md](QUICKSTART.md)：现有入口说明。两者不维护项目任务状态。
- 历史 plans / prompts / retrospectives 保存资料与证据。新工作、优先级和完成状态只在这里维护；完成时附证据链接与结论，不复制实战流水。

职责边界：**AI** 研究、分析、生成候选方案；**Harness** 检查路线、状态、预算、证据、停磨并留审计；**玩家** 提供游戏中真实看到的信息、截图/反馈并执行最终操作。内部命令与 JSON 的负担能否由协作流程承接，尚需验证。

## NOW

### B-01｜真实账号端到端 dogfood v1.0.0

**问题：** 已证明代码能运行和发布，还没有证明玩家第一次打开工具后能自然开始、持续得到下一步建议，并且比临场聊天更省事。当前 `init / sync / next / prepare / trial / record / reroute` 暴露了内部概念。

**现状：** 待玩家真实账号与现场反馈；演示、历史通关和 Windows smoke 不算本项证据。先用现有版本，不预先开发新入口。

**完成证据：** 一轮真实账号使用记录，从下载解压/首次启动到本轮结束，说明赛季、版本、目标、实际推进结果及结束原因；保留 run 审计和可定位的截图/观察。遇到失败、停磨或重规划就如实记录，不能为了覆盖分支而强造失败，也不能绕过预算来完成验证。

记录最主要的摩擦：玩家在哪一步不知道提供什么、需要学习命令/编辑 JSON、重复传递信息、等待分析，或无法理解下一步；附具体场景和影响。记录 AI、Harness、玩家实际各承担了什么。结果可为通关或有证据的停止，**完成这次实验不等于证明产品目标已达成**。

复盘放入 [docs/retrospectives.md](docs/retrospectives.md)，详细观察留在对应 season/run；本项只链接证据、结论及由此调整的 NEXT。缺少现场资料时保持未完成。

## NEXT

### B-02｜收敛默认使用入口

**问题：** 玩家不应为了获得下一步建议先掌握 CLI 命令体系。入口形态现在不拍板，也不因已有 CLI 就继续堆命令。

**依赖与完成证据：** 由 B-01 的主要摩擦选择最小改进；真实玩家复测能用“当前局面 → 提供信息 → 下一步 → 实战反馈”持续操作，无需学习命令体系或手工维护内部 JSON。候选方案由 AI 生成，试战仍通过同一 Harness，停磨/未知/条件警告不会被入口隐藏。保留改进前后同类场景的反馈；若复测仍卡住，不算完成。

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
