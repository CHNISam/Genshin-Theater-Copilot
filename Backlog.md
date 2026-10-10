# 项目 Backlog

本文件是**唯一项目执行状态**。目标是让真实玩家复用历史经验、当期事实和实战反馈，稳定完成剧诗，减少重复试错与操作负担。

- [项目表 Genshin-Theater-Copilot-Project](https://docs.google.com/spreadsheets/d/1GCgixxH7XKs3jb68ohrV0SO1ai3Iesd2ZVBBuAk8v40/edit)：Overview / Goals / Ideas / Docs，保存方向、目标、想法与资料，不复制具体任务日志。
- [docs/SOP.md](docs/SOP.md)：剧诗实际执行规则；[QUICKSTART.md](QUICKSTART.md)：现有入口说明。两者不维护项目任务状态。
- 历史 plans / prompts / retrospectives 保存资料与证据。新工作、优先级和完成状态只在这里维护；完成时附证据链接与结论，不复制实战流水。

职责边界：**通用 AI Agent** 研究、推理、规划、动态决策、交互与记录；**Harness** 复用确定性 guard；**独立云端 Run State** 仅保存完整进度/上下文；**玩家** 提供截图/现场反馈并操作游戏。默认入口 [AGENT.md](AGENT.md)，不要求玩家 CLI / JSON / 本地 Python。主产品不开发独立 App、专用聊天界面、自建 AI 后端或 Cloud Run 服务。实际工具能力决定是否能机械执行/云端保存。

## NOW

### B-00｜每期凝渡式一图流攻略（成品与导出器已交付，用户使用验收待测）

**用户确认（2026-10-10）：** 每期要一张可直接照着打的高信息量攻略图，以用户提供的凝渡_Du参考图为格式基线。准确、完整、具体的选择信息优先于美观。逐幕列阵容排布、带真实敌人截图的怪物推荐、开打前选择、打完选择；底部列Buff路线和带角色头像的好友助战推荐。完整交付合同见[一图流标准](docs/season-guide.md)。

**2026-10-10实现证据：** [本期完整PNG](guides/output/2026-10-guide.png)、[离线版](guides/output/2026-10-guide.html)、[底稿](guides/2026-10.json)、[导出器](tools/render_guide.py)。12目标、18项已复核真实游戏UI资产、Buff与七个助战候选齐备；默认冰系助战路线按24个不同槽各2耐力排布，其他助战明确要求重排。独立目标合同、身份/元素/耐力、素材哈希/日期、动态中文排版与绘制边界已实现，并补审查发现的漏圣牌、重复角色、元素冲突、第四Buff漏绘和畸形输入回归。具体方法见[制作说明](docs/season-guide.md)，129项回归与检查范围见[验证记录](docs/guide-validation.md)。

**验收边界：** 本次完成成图、内容底稿、可复用程序及仓库入口；尚无用户实际照图使用反馈或本账号通关证据，不能标最终实战验收。B-04全量公共资料债保持独立未关闭，图内未引用争议精确参数。

**完成证据：** 交付本期、目标难度明确的一张完整可读图及可追溯内容底稿；逐行核对所有目标幕/圣牌、怪物截图身份、阵容与耐力全程分配、前后选择、Buff等级/分支、助战条件和随机备选。关键缺口必须补齐或给出有依据且不依赖缺口的替代，不能用空格/泛泛建议/旧期事实宣告完成。按凝渡往期材料核对稳定格式，最后由用户审阅图中内容并记录实际使用反馈。公开攻略推荐、事实核对和真实通关证据分别标明。后续每期复用格式，重新核实内容。

**优先级影响：** B-01/B-02继续保留未测状态，但先验证完整攻略图能否满足主需求；不得为了原逐步问答体验继续扩建Harness或跨设备机制。仅在实际使用需要时复用既有能力。

### B-01｜真实手机 → 电脑的 Agent-first dogfood

**问题：** 需要证明通用 AI 能按同一 SOP 持续协助真实剧诗并可靠接续，不能用 Windows 下载/CLI 流程定义主体验。

**现状：** Agent 入口、完整共享状态和当前 Work 的合成云端 IO/恢复已交付（D-02）。没有本次真实账号现场、实际手机会话或电脑另开会话的接续证据，保持未完成。原先要求先下载解压 CLI 的实验边界已被用户明确改为 Agent-first。

**完成证据：** 玩家在实际手机的通用 AI 中以截图/描述开始 live 局；AI 研究、给出关键选择、记录真实资源与至少一次试战反馈并云端 readback。随后在实际电脑会话以相同存档 URL/run_id 恢复，核对资源、pending、失败/总预算并继续一个真实步骤。记录两端平台与实际可用工具、代码ref、revision、现场观察及结果/停止原因。新进程恢复、合成案例或能读 SOP 都不算跨设备实测。

摩擦只记录实际发生的场景（重复传信息、不会提供现场、等待、不能读写/执行等）。不要求玩家学命令或手填 JSON。缺工具如实记为平台受限；不能为了验收伪造失败、成功、观察窗口或绕过停磨。真实阈值校准和未知赛季事实仍归 B-03/B-04。

## NEXT

### B-02｜Agent 入口实用复测与兼容性验证

**现状：** 默认入口为AGENT.md通用AI + SOP + 独立共享状态，Windows CLI为次级适配。2026-10-08生产收口补入账号执行证据审查、未来已知不足路线排除、pending优先恢复、末关顺序、按相关依赖研究与存档发现/写前核对/原行重试/读回、显式代码升级。实现及范围见[生产验证](docs/production-validation.md)。真实现场与实际跨设备仍未验证，不能标完整产品验收。

**完成证据：** 随 B-01 复测“当前局面 → 建议 → 实际操作 → 反馈 → 保存 → 新会话恢复”，确认用户无需 CLI/JSON。失败/未知/条件路线不会被简化输出隐藏。ChatGPT Work 手机端须单独实测其实际工具，不能凭当前电脑会话推定支持。Claude/Gemini 仅在其真实工具允许读仓库、执行guard、读写状态且恢复成功后扩展支持声明；未测继续标理论可适配。无工具降级须明确未机械验证/未保存。无真实摩擦证据不开发新前端或服务。

### B-03｜用实战校准停磨阈值与预算

**问题：** 当前 2 次无有效改善、10 个百分点新增最佳进度、6 次/900 秒总预算是保守策略，不是历史实测结论。

**依赖与完成证据：** 使用 B-01 的真实尝试、固定观测窗口、机制观察和停止结果，评估是否过早停或放行了无效硬磨，记录样本局限与保留/调整理由。若改策略，新增相应 regression 并确认已知无收敛案例仍被拒绝、有效改善和真实备选仍允许、reroute 不重置总预算。样本不足就明确保留默认值和未校准状态，不凭感觉放宽。

### B-04｜当期公共资料完整交付（仍未关闭）

**2026-10-08实际进展：** 补充开幕/特邀及期次的可追溯依据、六个固定节点的阶段参数/敌人数量/生存目标、六条现期增益数值或功能片段；24个分支的通用参考库存已经结构化，但没有把旧/通用表升级为本期完整文本。凝渡本期描述已读取并按用户优先级收录；百渊候选 UID520175970 的往期页面可核对，本期条目未取得。公告只取得转载，未伪称官方原始账号。BWIKI“当期”正文仍8月，已排除；第8节点抗性/窗口存在攻略冲突，保留共同机制、隔离争议参数。

**本轮追加研究：** 凝渡简介复核、直接视频BV12Zak6LEMF、三张增益图与原始请求、HomDGCat/HoneyHunter复查仍不可读；替代收藏页搜索结果与正文不符，拒绝采信。新增decision_brief/普通候选部分目录/末关顺序，仍区分proposal与clear，未补造完整分支。

**完整性：** 本次全量严审仍为 PARTIAL_PUBLIC：48个公共交付单元仅12个完整、36个缺失/不完整/冲突；不是12/48字段或实战可靠率。已有数值片段仍可查，但不等于完整分支。图片/视频/数据库读取的实际失败与替代尝试在 season.research；次日再查，不能归为仅现场可知。

**剩余阻塞：** 24分支完整当前触发/持续/叠层/系数、冻结/水风三级确数、四级价格表、累计增益属性、事件和普通敌人池完整目录、固定节点等级/HP/限时，以及第8节点冲突仲裁。公开内容的研究债由Agent承担；实际随机选项/资源/账号才是live未知。无法取得时继续显式保留并主动重试，不要求玩家重新整理公共表。

**验收：** 全量 assess为PUBLIC_READY并有逐项可复核依据及语义审核，相关决策/真实使用验证通过；当前strict返回2，故不宣布完整交付。机制实现与回归见D-03；这不会关闭B-01跨设备实测。

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

**实际证据：** [验证记录](docs/agent-validation.md)、[云端合成链摘要](fixtures/agent-cloud-smoke.json)：当前 ChatGPT Work 的8检查点真实connector保存/readback，每步新Python进程恢复；两次无收敛失败拒绝第三次，有证据重规划允许，合成成功仅一次扣耐力。68项本地回归通过（原52 + 新16）。审查后的恢复修复已包含于源码ref 8677b8b；使用此可获取ref再次完成8步云端链及live/intake准备记录readback。未发布新Windows版本，v1.0.0保留。

**范围：** 这关闭实现与当前工具的合成IO/guard验证；不关闭B-01/B-02真实跨设备/跨Agent/实际策略体验，不关闭B-03阈值校准/B-04资料未知。单写者，无服务器锁；hash不是防篡改或事实真伪证明。

### D-03｜公共资料缺口、时效和决策范围检查

根因是 validate_season只遍历已列facts，check只看当前引用，research只输出提示，空watchlist及没有独立清单/日级重试使公开缺失长期不可见。保留原Harness，新增src/season_readiness.py；live check/authorize接入来源注册、正文期次、定位、复核时效、独立树/分支和关键配置检查。明确PUBLIC研究债与LIVE未知，父节点和已取得canonical增益自动检查；无关分支/争议数值不阻塞共同机制。首次/恢复/到期研究循环在AGENT/SOP与公共证据协议，host联网执行，代码不冒充爬虫或后台服务。

**验证：** tests/test_season_readiness.py的18项重现分支删除、嵌套空值、过期、来源错季、捕获日期伪刷新、重分类逃逸、下一期清单、实际live authorize拒绝/刷新修复；全部86项回归通过（原68保留）。CI增加公共缺口audit artifact与共同机制门槛；strict是完整交付门槛，不能以CI绿代替。本次证据和限制见docs/season-validation.md；未发布/替换v1.0.0。

D-03收尾证据：[PR #2](https://github.com/CHNISam/Genshin-Theater-Copilot/pull/2) 已合入main；[源码a235bd1的CI](https://github.com/CHNISam/Genshin-Theater-Copilot/actions/runs/37727185047)回归/非UTF环境/18项原生Windows烟测通过。完整公共严审仍12/48、退出2，B-04保持未完成。

### D-04｜Agent生产适配的可验证收口（实战验收另列）

已交付并复用原Harness：live账号能力/成功证据/有限probe分层并绑定相关事实、配置和目标；资源SAFE与未来能力路线分开，明确不足剔除，条件招募保留警告；当前公共依赖与全量资料欠账分开，现场未知走观察、pending优先记录；先完成required cards再末关；现有私有Sheet自动发现、literal/header/完整链验证、写前head核对、原行重试与readback确认；显式代码迁移保留全部历史。用户仍只需AGENT入口和最少当前画面，无新增App/服务。

**实际证据：** [PR #3](https://github.com/CHNISam/Genshin-Theater-Copilot/pull/3)，源码bcc6df7的[CI](https://github.com/CHNISam/Genshin-Theater-Copilot/actions/runs/37733105296)全套105/非UTF core102/Windows smoke18通过。当前Work真实connector完成10检查点及重复相同行追加，逐步新进程读回，结果与资源未重复结算；既有live/intake留痕升级r2读回，没有补造账号。独立审查三项问题均重现修复并复核。详见[生产验证](docs/production-validation.md)。

**范围：** 关闭本轮适配缺陷和当前工具技术闭环，不关闭B-01/B-02真实现场/实际跨设备、B-03阈值实战校准、B-04完整公共交付（仍12/48）。源码审查字段不能证明外部事实真伪，云端仍单写者；普通无工具AI/其他Agent没有新增已实测支持声明。
