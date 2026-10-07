# Genshin Theater Copilot｜原神剧诗领航

轻量的幻想真境剧诗 Harness / SOP：保护后续角色耐力，也检查当前战斗的依据；重复失败不收敛时，实际试战入口会停止放行。

**Windows 下载：[GitHub Releases](https://github.com/CHNISam/Genshin-Theater-Copilot/releases/latest)** → `Genshin-Theater-Copilot-v1.0.0-win-x64.zip`。解压，双击 `theater.cmd`。自带官方 Python 精简运行时，无需安装 Python、clone 或联网运行。适用 Windows 10/11 x64。

第一次先选“演示”，或在解压目录 PowerShell 中运行：

```powershell
.\theater.cmd init demo.json --demo
.\theater.cmd check demo.json
.\theater.cmd trial demo.json
.\theater.cmd record demo.json --result fail --score 40 --seconds 90 --mechanics yes --reason timeout --observation "90秒窗口完成40%"
```

演示是合成数据，不能当成真实赛季攻略。实际开局用 `init my-run.json`，交给 AI/操作者补入本期账号快照、剩余节点替代方案和当前 fight contract；已有 JSON 可以直接导入复用，不必逐个填写完整面板。具体步骤见 [QUICKSTART.md](QUICKSTART.md)，唯一执行流程见 [docs/SOP.md](docs/SOP.md)。

| 当前状态 | 允许的下一步 |
|---|---|
| READY | 有明确机制、输出/生存/操作依据；允许一次有上限的试战，不承诺必过 |
| WARN | 可试战，但必须看清当前攻略依据或后续招募的条件；不能称作保证 |
| BLOCKED | 不能授权试战；按原因补数据、核实事实或诊断重规划 |
| COMPLETE | 本关已过，推进下一关或结束；不能重复花耐力 |

`SAFE / CONDITIONAL / BROKEN` 单独描述**后续战略资源**。SAFE 不代表当前队伍打得过，也不证明未来每关输出足够。未招募角色仍是 CONDITIONAL，替代方案照常搜索。

## 停磨是可执行机制

默认连续两次失败且未达到有效改善 → `REPEATED_NON_CONVERGENCE`。有效改善需同目标、同观测窗口，比历史最佳至少增加 10 个百分点；未知指标、拖更长时间、回到旧最佳或改方案名称都不算改善。机制没有处理则立即诊断；单关总计 6 次试战或 900 秒后结束本轮试战，重规划不重置这个总预算。

`trial` 在实际授权时运行全部 guard；`record` 只记录已经授权的一次结果。停磨后必须给出新适用证据、瓶颈对比、实质方案变化和可测假设，使用 `reroute` 才能取得有限试战额度。所有旧尝试保留。

## 历史和本期数据

六份共享会话、两份 Google 文档已去重进入 [历史案例与来源](fixtures/history) 及 [复盘](docs/retrospectives.md)，关键错误对应回归。只保存提炼结果、来源与定位，不搬聊天原文。真实观察、未执行建议、合成测试指标各自标明。

10 月现期固定关机制由有日期的现期攻略支持，保留 `guide_supported`；**精确祝福分支/数值尚未重新取得充分可检视的现期证据，标为 unknown**。依赖这些数值的 contract 会阻塞。普通随机战需现场确认。本工具不读取游戏、不推算自动伤害，不提供虚构概率。

每期用 `research --season 2026-11` 生成研究任务，`validate-season` 校验资料格式；复核来源后替换赛季包即可复用。用户推荐的 B 站 UP 可加入 [watchlist](maintenance/watchlist.json)，新材料先进入待核验记录。当前没有后台监控或订阅。

## 维护与验证

源码用户：Python 3.12+，无第三方依赖。

```bash
python -m unittest discover -s tests -v
python -m src.cli --help
python -m src.cli validate-season seasons/2026-10-v7.1.json
```

Windows 用户可运行 `theater.cmd self-test` 检验随包核心回归。CI 同时验证完整 CLI 测试、官方运行时 SHA-256，以及干净中文/空格目录中解压 ZIP 的原生 Windows smoke；只有全部通过才发布。Release 附 `SHA256SUMS.txt`、`WINDOWS-SMOKE.json` 和源码包。

人工审核边界：来源是否真实可靠、账号操作能否执行、输出/治疗是否足够、哪些条件是硬机制，仍需人根据实战判断。程序检查证据的适用范围与状态，不能自动证明攻略正确。存档是可读 JSON，修改或删除历史等同人为绕开审计；正常命令拒绝静默覆盖和并发写入。
