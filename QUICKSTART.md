# 5 分钟上手

Windows 10/11 x64：下载 Release 的 `*-win-x64.zip`，解压后双击 `theater.cmd`。不要在 ZIP 预览里直接运行。双击菜单支持初始化、检查、授权、录入和打开说明；其他操作在解压目录 PowerShell 中调用同一个入口。

## 先跑演示

```powershell
.\theater.cmd init demo.json --demo
.\theater.cmd check demo.json
.\theater.cmd trial demo.json
.\theater.cmd record demo.json --result fail --score 40 --seconds 90 --mechanics yes --reason timeout --observation "同一90秒窗口完成40%"
.\theater.cmd trial demo.json
.\theater.cmd record demo.json --result fail --score 42 --seconds 90 --mechanics yes --reason timeout --observation "同一窗口仅改善2个百分点"
.\theater.cmd trial demo.json
```

最后一条必须 BLOCKED，原因 `REPEATED_NON_CONVERGENCE`。即使 future SAFE 也停。示例百分比是合成指标。真实计时击杀可以定义“90秒时目标损血比例”；守护/生存需另定义与成功条件一致的完成度，不能拿计时 DPS 战中的存活时间代替进度。提前死亡或没有在固定窗口观察到进度，省略 `--score`。

## 实际开局

```powershell
.\theater.cmd init my-run.json
.\theater.cmd sync my-run.json snapshot.json
.\theater.cmd next my-run.json fight-package.json
.\theater.cmd check my-run.json
.\theater.cmd trial my-run.json
```

`init` 从随包现期资料创建 10 幕＋2 圣牌存档；账号、花、刷新和 future options 初始留空/待确认，因此开始会阻塞。把 `my-run.json`、当前截图/观察和本目录交给 AI，按 [SOP](docs/SOP.md) 生成两个 JSON。已有账号 JSON 下期复用，只更新实际变化。无需手填武器圣遗物全表。

- `snapshot.json` 只含需要更新的 `vigor / unlocked / flowers / rerolls / buffs / capabilities / checkpoints`。角色 IDs 一致，vigor 按当前画面，capabilities 仅填决策相关能力和 build/source。
- `fight-package.json` 是 `{"fight": {...}, "evidence": [...]}`。结构参考 [templates/demo-run.json](templates/demo-run.json) 的同名字段，替换所有合成资料；不能把 demo 改名当真实数据。未来 checkpoint 保留主解和实际可用的替代解。
- 尚未试战的当前合同需要补正字段/证据时，用 `prepare my-run.json corrected-fight-package.json`；已经尝试过则走 reroute，不能清除失败。
- 普通随机战的事实先以现场来源补到同月份赛季 JSON，再 `season my-run.json updated-season.json`。`unknown/conflict` 决策依据不能放行。

成功录入：

```powershell
.\theater.cmd record my-run.json --result pass --score 100 --seconds 90 --mechanics yes --reason clear --observation "游戏已显示目标完成"
.\theater.cmd next my-run.json next-fight-package.json
```

只有成功才扣四名实际队员耐力；失败不会默认扣耐力。若游戏实际出现恢复、回溯、退出后扣除等特殊变化，用 `sync` 记录真实画面。pending 试战必须先 `record`，无法改变状态；退出/取消也用 `--result aborted` 如实录入。

## 停磨后

按 SOP 查同关同目标已通关案例，对比机制、输出窗口、阵容、练度、Buff 和操作。生成 `reroute-package.json`：

```json
{
  "fight": {"encounter_id": "与当前相同，其他字段为完整新contract"},
  "evidence": [{"id": "新ID", "kind": "clear-reference", "season_id": "本期ID", "encounter_id": "同关", "objective": "同关", "source": "可检查的新URL或local证据定位", "reviewed": true, "comparison": "实际对比结果"}],
  "review": {"evidence_id": "新ID", "reviewed": true, "bottleneck": "主要瓶颈", "comparison": "案例与当前差异", "hypothesis": "变更后在固定窗口达到什么可测结果"}
}
```

这是字段说明，不能原样运行；完整可运行结构见模板。`fight.evidence_ids` 必须引用新证据；变更阵容、实际 build、机制处理、rotation 或已观察 Buff。改标签、评论和方案名不解除阻塞。

```powershell
.\theater.cmd reroute my-run.json reroute-package.json
.\theater.cmd trial my-run.json
```

总预算耗尽就结束本轮执行，诊断、补练度或放弃该目标；不能借 reroute 接着磨。历史不会删除。

其他命令：`recruits my-run.json id1 id2` 比较实际候选对未来路线的影响；`event my-run.json event.json` 记录实际已选择事件（kind recruit/buff/refresh、cost、id/value），不保证刷新结果；`status` 查看阻塞原因；`policy` 查看默认阈值；`self-test` 运行随包核心测试；`research --season 2026-11` 生成下一期研究任务。

退出码：0＝命令完成（WARN 也为 0）；2＝BLOCKED 或输入错误。`record` 失败后触发停磨时返回 2，但本次观察已经保存。文件自动保留最近的 `.bak`；不要把旧备份覆盖到正在进行的 run 来清除失败历史。所有操作使用同一存档和同一 guard。
