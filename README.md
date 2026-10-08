# Genshin Theater Copilot｜原神剧诗领航

基于**通用 AI Agent** 的幻想真境剧诗策略系统。ChatGPT（包括 Work）、Claude、Gemini 等宿主负责推理、研究、规划和交互；本项目提供 SOP、策略知识、赛季资料、完整游戏状态和确定性 guard。各宿主是否能完整执行，取决于本次会话实际工具，不能只凭品牌保证。

**使用：** 在通用 AI 中提供 [AGENT.md](AGENT.md)、截图/当前局面、已有存档链接（新局可省）。Agent 按 [SOP](docs/SOP.md) 研究和建议，用户执行游戏操作；AI 负责记录。恢复同局只需存档链接和局号。无需用户学习 CLI、安装 Python 或运行本地进程。

完整机械路径需要 Agent 能读仓库、执行 Python、读写 Google Sheets；云端只持久化数据，不运行 AI，不需要 Cloud Run、自建后端或专用 App。能力不足必须显式标明“未机械验证”或“未保存”，不是完整支持。

[运行适配/状态协议](docs/agent-runtime.md) · [已验证范围与平台限制](docs/agent-validation.md) · [唯一项目 Backlog](Backlog.md) · [项目表](https://docs.google.com/spreadsheets/d/1GCgixxH7XKs3jb68ohrV0SO1ai3Iesd2ZVBBuAk8v40/edit)

**当前验证：** 本次 ChatGPT Work 的 connector 保存/读取与独立 Python 进程恢复测试；合成局只证明状态链与 guard 仍工作。真实手机→电脑、真实账号整局和 Claude/Gemini 工具闭环仍待实测，不能宣称最终验收完成。

Windows [v1.0.0 Release](https://github.com/CHNISam/Genshin-Theater-Copilot/releases/tag/v1.0.0) 保留为可选本地 Harness；它不是 Agent-first 必需下载，也不包含本次新增适配。源码 Agent 入口直接调用同一核心，不运行玩家 CLI。

## 停磨是可执行机制

默认连续两次失败且未达到有效改善 → `REPEATED_NON_CONVERGENCE`。有效改善需同目标、同观测窗口，比历史最佳至少增加 10 个百分点；未知指标、拖更长时间、回到旧最佳或改方案名称都不算改善。机制没有处理则立即诊断；单关总计 6 次试战或 900 秒后结束本轮试战，重规划不重置这个总预算。

`trial` 在实际授权时运行全部 guard；`record` 只记录已经授权的一次结果。停磨后必须给出新适用证据、瓶颈对比、实质方案变化和可测假设，使用 `reroute` 才能取得有限试战额度。所有旧尝试保留。

## 历史和本期数据

六份共享会话、两份 Google 文档已去重进入 [历史案例与来源](fixtures/history) 及 [复盘](docs/retrospectives.md)，关键错误对应回归。只保存提炼结果、来源与定位，不搬聊天原文。真实观察、未执行建议、合成测试指标各自标明。

10 月共同机制保持 `guide_supported`，补充现期数值片段及24分支参考库存；完整当前文本仍有公共缺口，`partial_public` **不算正式资料完成**。首次/恢复/过期由Agent按 [公共证据协议](docs/season-evidence.md)主动研究，live guard拒绝相关缺失/错季/过期依赖。通用参考表不自动变成本期事实；普通敌人池须研究，实际选项才现场确认。全量严审及实际限制见 [验证记录](docs/season-validation.md)。

每期由 Agent 按 [研究提示](prompts/season-research.md) 直接研究，使用 `harness.validate_season` 校验资料格式；复核来源后替换赛季包即可复用。用户推荐的 B 站 UP 可加入 [watchlist](maintenance/watchlist.json)，新材料先进入待核验记录。当前没有后台监控或订阅。

## 维护与验证

源码用户：Python 3.12+，无第三方依赖。

```bash
python -m unittest discover -s tests -v
python -m src.cli --help
python -m src.cli validate-season seasons/2026-10-v7.1.json
```

Windows 用户可运行 `theater.cmd self-test` 检验随包核心回归。CI 同时验证完整 CLI 测试、官方运行时 SHA-256，以及干净中文/空格目录中解压 ZIP 的原生 Windows smoke；只有全部通过才发布。Release 附 `SHA256SUMS.txt`、`WINDOWS-SMOKE.json` 和源码包。

人工审核边界：来源是否真实可靠、账号操作能否执行、输出/治疗是否足够、哪些条件是硬机制，仍需人根据实战判断。程序检查证据的适用范围与状态，不能自动证明攻略正确。存档是可读 JSON，修改或删除历史等同人为绕开审计；正常命令拒绝静默覆盖和并发写入。
