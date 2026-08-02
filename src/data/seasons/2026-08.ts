/**
 * 2026-08 期赛季包（示例 / 首个真实赛季）。
 *
 * 来源分级严格区分：
 *   official-confirmed  官方版本更新说明（限制元素、开幕、特邀）
 *   community-confirmed 长期维护的资料页（月谕结构、固定首领幕、耐力规则、祝福等级机制）
 *   user-observed       本期实战观察（守护关位置、第八幕水盾、圣牌掉血）
 *
 * 实战观察一律标 medium 及以下，并且必须能通过配置修改，不得写死进求解器。
 */
import type { SeasonConfig, SourceRecord } from "../../domain/types";

const OFFICIAL: SourceRecord = {
  title: "原神官方版本更新说明：幻想真境剧诗本期限制元素与开幕/特邀角色",
  sourceType: "official-confirmed",
  url: "https://genshin.hoyoverse.com/zh-tw/news/detail/165076",
  accessedAt: "2026-08-01",
  confidence: "confirmed",
};

const WIKI: SourceRecord = {
  title: "幻想真境剧诗 · 资料页（月谕模式结构、耐力、祝福等级与分支）",
  sourceType: "community-confirmed",
  url: "https://wiki.biligame.com/ys/%E5%B9%BB%E6%83%B3%E7%9C%9F%E5%A2%83%E5%89%A7%E8%AF%97",
  accessedAt: "2026-08-01",
  confidence: "high",
};

const USER_RUN: SourceRecord = {
  title: "用户本期实战记录（2026-08 月谕通关）",
  sourceType: "user-observed",
  accessedAt: "2026-08-02",
  excerpt:
    "第4幕附近为守护关；第8幕首领会出水元素护盾；两场圣牌挑战存在全队持续掉血的舞台效果。",
  confidence: "medium",
};

export const SEASON_2026_08: SeasonConfig = {
  id: "2026-08",
  name: "幻想真境剧诗 2026 年 8 月期",
  startsAt: "2026-08-01T04:00:00+08:00",
  endsAt: "2026-08-31T03:59:59+08:00",
  status: "published",

  allowedElements: ["hydro", "electro", "cryo"],
  openingCharacterIds: ["yelan", "aino", "flins", "olorun", "skirk", "layla"],
  specialGuestIds: ["arlecchino", "chevreuse", "kazuha", "tighnari"],

  ruleOverrides: {
    defaultVigor: 2,
    supportedDifficulties: ["moonlit"],
    teamSize: 4,
    mainActCount: 10,
    tabletChallengeCount: 2,
    bossActOrders: [3, 6, 8, 10],
    supportGuestCountsForEntry: false,
    initialRefreshes: 3,
    note:
      "本赛季包只录入了月谕难度结构：10 幕主线 + 2 场圣牌挑战；每名角色初始 2 点耐力，参战一次消耗 1 点。" +
      "轻简/普通/困难/卓越的关卡结构尚未录入，不得假装支持。",
  },

  buffs: [
    {
      id: "superconduct",
      name: "超导",
      reactionId: "superconduct",
      confidence: "high",
      sourceRecords: [WIKI],
      levels: [
        {
          level: 1,
          description: "获得超导反应基础增益。",
          value: { mechanicValue: 0, damageValue: 3, controlValue: 0, buffValue: 1 },
          cost: 1,
        },
        {
          level: 2,
          description: "选择第一分支。",
          value: { mechanicValue: 0, damageValue: 4.5, controlValue: 0, buffValue: 1.5 },
          breakpoint: true,
          cost: 2,
        },
        {
          level: 3,
          description: "强化基础效果。",
          value: { mechanicValue: 0, damageValue: 6, controlValue: 0, buffValue: 2 },
          cost: 3,
        },
        {
          level: 4,
          description: "选择终极分支。",
          value: { mechanicValue: 0, damageValue: 8, controlValue: 0, buffValue: 2.5 },
          breakpoint: true,
          cost: 4,
        },
      ],
      branches: [
        {
          id: "low-resistance-chain",
          level: 2,
          name: "低阻连锁",
          description: "随层数提高冰、雷伤害，不限于物理队。",
          value: { damageValue: 2 },
        },
        {
          id: "limit-frostback",
          level: 4,
          name: "极限返寒",
          description: "终极分支，进一步强化冰雷伤害。",
          value: { damageValue: 3 },
        },
      ],
    },
    {
      id: "frozen",
      name: "冻结",
      reactionId: "frozen",
      confidence: "high",
      sourceRecords: [WIKI],
      levels: [
        {
          level: 1,
          description: "提高水冰角色暴击伤害。",
          value: { mechanicValue: 0, damageValue: 2.5, controlValue: 3, buffValue: 1 },
          cost: 1,
        },
        {
          level: 2,
          description: "选择第一分支。",
          value: { mechanicValue: 0, damageValue: 4, controlValue: 3.5, buffValue: 1.5 },
          breakpoint: true,
          cost: 2,
        },
        {
          level: 3,
          description: "强化基础效果。",
          value: { mechanicValue: 0, damageValue: 5.5, controlValue: 4, buffValue: 2 },
          cost: 3,
        },
        {
          level: 4,
          description: "选择终极分支。",
          value: { mechanicValue: 0, damageValue: 7, controlValue: 4.5, buffValue: 2.5 },
          breakpoint: true,
          cost: 4,
        },
      ],
      branches: [
        {
          id: "ice-rift",
          level: 2,
          name: "冰裂之势",
          description: "削减水冰抗性。",
          value: { damageValue: 1.5 },
        },
        {
          id: "limit-ice-rift",
          level: 4,
          name: "极限冰裂",
          description: "重点强化冰伤。",
          value: { damageValue: 2.5 },
        },
      ],
    },
    {
      id: "electro-charged",
      name: "感电",
      reactionId: "electro-charged",
      confidence: "high",
      sourceRecords: [WIKI],
      levels: [
        {
          level: 1,
          description: "强化感电与月感电。",
          value: { mechanicValue: 0, damageValue: 3.5, controlValue: 0.5, buffValue: 1 },
          cost: 1,
        },
        {
          level: 2,
          description: "选择第一分支。",
          value: { mechanicValue: 0, damageValue: 4.5, controlValue: 0.5, buffValue: 2 },
          breakpoint: true,
          cost: 2,
        },
        {
          level: 3,
          description: "强化基础效果。",
          value: { mechanicValue: 0, damageValue: 6, controlValue: 0.5, buffValue: 2.5 },
          cost: 3,
        },
        {
          level: 4,
          description: "选择终极分支。",
          value: { mechanicValue: 0, damageValue: 7.5, controlValue: 1, buffValue: 3 },
          breakpoint: true,
          cost: 4,
        },
      ],
      branches: [
        {
          id: "thundercloud",
          level: 2,
          name: "雳云",
          description: "随机提供能量或治疗，偏容灾而非极限伤害。",
          value: { buffValue: 2, mechanicValue: 0.5 },
        },
      ],
    },
  ],

  stages: [
    {
      id: "act-1",
      order: 1,
      name: "第1幕",
      type: "normal",
      fixed: false,
      enemyIds: [],
      hardRequirements: [],
      softRecommendations: [],
      damagePressure: 2,
      survivalPressure: 1,
      controlValue: 1,
      confidence: "high",
      sourceRecords: [WIKI],
      note: "普通幕，随机战斗事件。适合消耗次级主 C 的第一点耐力。",
    },
    {
      id: "act-2",
      order: 2,
      name: "第2幕",
      type: "normal",
      fixed: false,
      enemyIds: [],
      hardRequirements: [],
      softRecommendations: [],
      damagePressure: 2.5,
      survivalPressure: 1,
      controlValue: 1,
      confidence: "high",
      sourceRecords: [WIKI],
    },
    {
      id: "act-3",
      order: 3,
      name: "第3幕（固定首领）",
      type: "boss",
      fixed: true,
      enemyIds: ["boss-act3"],
      hardRequirements: [],
      softRecommendations: [
        {
          requirement: { type: "interrupt-resistance", minimumStrength: 2 },
          weight: 0.4,
          reason: "首领打断频率高，带抗打断更稳。",
        },
      ],
      damagePressure: 3.5,
      survivalPressure: 2,
      controlValue: 1,
      confidence: "high",
      sourceRecords: [WIKI],
      note: "固定首领幕。用中级资产解决，不动最终保险牌。",
    },
    {
      id: "act-4",
      order: 4,
      name: "第4幕（守护）",
      type: "defense",
      fixed: false,
      enemyIds: [],
      hardRequirements: [],
      softRecommendations: [
        {
          requirement: { type: "control", minimumStrength: 4 },
          weight: 1,
          reason: "守护关的核心是持续控住敌人，而不是击杀速度。",
        },
        {
          requirement: { type: "interrupt-resistance", minimumStrength: 2 },
          weight: 0.5,
          reason: "拖时间需要抗打断。",
        },
      ],
      damagePressure: 1.5,
      survivalPressure: 3,
      controlValue: 4,
      confidence: "medium",
      sourceRecords: [USER_RUN],
      note: "本期实战观察：守护目标不被摧毁即可，不必消耗强力主 C。等价于多出一次输出容错。",
    },
    {
      id: "act-5",
      order: 5,
      name: "第5幕",
      type: "normal",
      fixed: false,
      enemyIds: [],
      hardRequirements: [],
      softRecommendations: [],
      damagePressure: 3,
      survivalPressure: 1.5,
      controlValue: 1,
      confidence: "high",
      sourceRecords: [WIKI],
    },
    {
      id: "act-6",
      order: 6,
      name: "第6幕（固定首领）",
      type: "boss",
      fixed: true,
      enemyIds: ["boss-act6"],
      hardRequirements: [],
      softRecommendations: [],
      damagePressure: 4,
      survivalPressure: 2.5,
      controlValue: 1,
      confidence: "high",
      sourceRecords: [WIKI],
    },
    {
      id: "act-7",
      order: 7,
      name: "第7幕",
      type: "normal",
      fixed: false,
      enemyIds: [],
      hardRequirements: [],
      softRecommendations: [],
      damagePressure: 3.5,
      survivalPressure: 2,
      controlValue: 1,
      confidence: "high",
      sourceRecords: [WIKI],
    },
    {
      id: "act-8",
      order: 8,
      name: "第8幕（固定首领 · 水盾）",
      type: "boss",
      fixed: true,
      enemyIds: ["boss-act8"],
      hardRequirements: [
        {
          type: "shield-break",
          shieldElement: "hydro",
          effectiveElements: ["cryo"],
          minimumEfficiency: 2.5,
          note: "首领会展开水元素护盾，需要高频冰附着才能稳定破除。",
        },
      ],
      softRecommendations: [
        {
          requirement: { type: "healing", scope: "active-character", minimumStrength: 2 },
          weight: 0.4,
          reason: "破盾阶段承伤较高。",
        },
      ],
      damagePressure: 4.5,
      survivalPressure: 2.5,
      controlValue: 1,
      confidence: "medium",
      sourceRecords: [USER_RUN],
      note: "水盾机制为本期实战观察，可信度 medium，需要下一次实战复核破盾效率阈值。",
    },
    {
      id: "act-9",
      order: 9,
      name: "第9幕",
      type: "normal",
      fixed: false,
      enemyIds: [],
      hardRequirements: [],
      softRecommendations: [],
      damagePressure: 4,
      survivalPressure: 2,
      controlValue: 1,
      confidence: "high",
      sourceRecords: [WIKI],
    },
    {
      id: "act-10",
      order: 10,
      name: "第10幕（终局首领）",
      type: "boss",
      fixed: true,
      enemyIds: ["boss-act10"],
      hardRequirements: [],
      softRecommendations: [
        {
          requirement: { type: "healing", scope: "party-wide", minimumStrength: 2 },
          weight: 0.5,
          reason: "终局首领持续压力高。",
        },
      ],
      damagePressure: 5,
      survivalPressure: 3,
      controlValue: 1,
      confidence: "high",
      sourceRecords: [WIKI],
    },
    {
      id: "tablet-1",
      order: 11,
      name: "圣牌挑战一",
      type: "tablet",
      fixed: true,
      enemyIds: [],
      hardRequirements: [
        {
          type: "healing",
          scope: "party-wide",
          minimumStrength: 2.5,
          note: "舞台效果持续扣除全队生命值，单体治疗无法覆盖。",
        },
      ],
      softRecommendations: [
        {
          requirement: { type: "control", minimumStrength: 2 },
          weight: 0.4,
          reason: "减少同时承压的敌人数量。",
        },
      ],
      damagePressure: 2.5,
      survivalPressure: 4,
      controlValue: 2,
      confidence: "medium",
      sourceRecords: [USER_RUN, WIKI],
      note:
        "生存压力显著高于输出压力，目标是拖过时间而不是极限输出。" +
        "圣牌挑战不是通关第十幕的前置条件：月谕难度下角色累计消耗一定耐力后出现，最多同时存在 2 个，" +
        "未完成会一直保留；全部完成后可在第十幕通关后抽取「月谕圣牌」。",
    },
    {
      id: "tablet-2",
      order: 12,
      name: "圣牌挑战二",
      type: "tablet",
      fixed: true,
      enemyIds: [],
      hardRequirements: [
        {
          type: "healing",
          scope: "party-wide",
          minimumStrength: 2.5,
          note: "同圣牌挑战一。",
        },
      ],
      softRecommendations: [],
      damagePressure: 2.5,
      survivalPressure: 4,
      controlValue: 2,
      confidence: "medium",
      sourceRecords: [USER_RUN],
    },
  ],

  bosses: [
    {
      id: "boss-act3",
      name: "第3幕首领",
      stageId: "act-3",
      hardMechanics: [],
      effectiveElements: ["cryo", "electro", "hydro"],
      effectiveReactions: ["superconduct", "frozen"],
      notRecommended: [],
      sourceRecords: [WIKI],
      confidence: "medium",
    },
    {
      id: "boss-act6",
      name: "第6幕首领",
      stageId: "act-6",
      hardMechanics: [],
      effectiveElements: ["cryo", "electro", "hydro"],
      effectiveReactions: ["superconduct", "frozen", "electro-charged"],
      notRecommended: [],
      sourceRecords: [WIKI],
      confidence: "medium",
    },
    {
      id: "boss-act8",
      name: "第8幕首领（水盾）",
      stageId: "act-8",
      hardMechanics: [
        {
          type: "shield-break",
          shieldElement: "hydro",
          effectiveElements: ["cryo"],
          minimumEfficiency: 2.5,
        },
      ],
      effectiveElements: ["cryo"],
      effectiveReactions: ["frozen", "superconduct"],
      notRecommended: [
        {
          approach: "纯雷系高伤队",
          reason: "无法有效破除水元素护盾，破盾阶段会被拖到超时。",
        },
      ],
      sourceRecords: [USER_RUN],
      confidence: "medium",
    },
    {
      id: "boss-act10",
      name: "第10幕终局首领",
      stageId: "act-10",
      hardMechanics: [],
      effectiveElements: ["cryo", "electro", "hydro"],
      effectiveReactions: ["frozen", "superconduct", "electro-charged"],
      notRecommended: [],
      sourceRecords: [WIKI],
      confidence: "medium",
    },
  ],

  sourceRecords: [OFFICIAL, WIKI, USER_RUN],

  unresolvedQuestions: [
    {
      id: "act8-shield-threshold",
      question: "第8幕水盾所需的冰附着效率阈值具体是多少？",
      conflictingClaims: [
        {
          claim: "高频冰附着角色（夏洛蒂/桑多涅一类）可稳定破盾。",
          source: "用户实战记录",
          confidence: "medium",
        },
      ],
      blocksPublish: false,
    },
  ],

  dataVersion: 1,
  generatedAt: "2026-08-02T00:00:00+08:00",
  reviewedAt: "2026-08-02T00:00:00+08:00",
};
