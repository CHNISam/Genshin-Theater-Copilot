/**
 * 角色机制标注（人工维护）。
 *
 * 事实层（名字/元素/稀有度/武器）来自官方索引 official.json，全量 110+ 名角色。
 * 这里只补**判断层**：附着频率、治疗范围、控制强度、输出档位、刚需队友。
 * 没有标注的角色仍然可以被识别、可以进队填位，但**永远不会被当作任何硬机制的解**，
 * 因为我们并不真的知道它的机制能力——这一点在界面上必须明说。
 *
 * 想补一个角色？在下面按同样的格式加一条，name 必须与官方中文名一致。
 */
import type { CharacterRole, MechanicCapability, TeamCondition } from "../../domain/types";

export interface CuratedCharacter {
  /** 稳定 id，供赛季包与测试引用。 */
  id: string;
  /** 必须与官方中文名完全一致，用于和 official.json 对齐。 */
  name: string;
  roles: CharacterRole[];
  baseDamage: number;
  capabilities: MechanicCapability[];
  teammateNeeds?: TeamCondition[];
  tags?: string[];
}

export const CURATED: CuratedCharacter[] = [
  /* ---------------- 本期开幕角色 ---------------- */
  {
    id: "yelan",
    name: "夜兰",
    roles: ["sub-dps"],
    baseDamage: 7,
    capabilities: [
      { type: "element-application", element: "hydro", strength: 4, frequency: "high", note: "后台持续挂水" },
    ],
    tags: ["off-field", "scarce-hydro"],
  },
  {
    id: "aino",
    name: "爱诺",
    roles: ["buffer", "battery"],
    baseDamage: 2,
    capabilities: [
      { type: "element-application", element: "hydro", strength: 4, frequency: "high" },
      { type: "energy", strength: 4 },
    ],
    tags: ["off-field", "scarce-hydro", "system-component"],
  },
  {
    id: "flins",
    name: "菲林斯",
    roles: ["main-dps"],
    baseDamage: 9,
    capabilities: [
      { type: "element-application", element: "electro", strength: 4, frequency: "high" },
      {
        type: "reaction-enable",
        reactionId: "lunar-charged",
        strength: 5,
        frequency: "high",
        conditions: [{ type: "requires-element", element: "hydro", degradedTo: 0 }],
      },
      { type: "control", strength: 2, note: "聚拢小怪" },
    ],
    teammateNeeds: [
      { type: "requires-element", element: "hydro", degradedTo: 0.5, note: "无水系时感电体系失效" },
    ],
    tags: ["needs-hydro"],
  },
  {
    id: "olorun",
    name: "欧洛伦",
    roles: ["sub-dps", "buffer"],
    baseDamage: 6,
    capabilities: [
      { type: "element-application", element: "electro", strength: 4, frequency: "high" },
    ],
    tags: ["off-field"],
  },
  {
    id: "skirk",
    name: "丝柯克",
    roles: ["main-dps"],
    baseDamage: 10,
    capabilities: [
      { type: "element-application", element: "cryo", strength: 4, frequency: "high" },
    ],
    teammateNeeds: [
      { type: "requires-element", element: "hydro", degradedTo: 0.55, note: "依赖水系队友维持体系" },
    ],
    tags: ["needs-hydro"],
  },
  {
    id: "layla",
    name: "莱依拉",
    roles: ["shielder", "sub-dps"],
    baseDamage: 3,
    capabilities: [
      { type: "shield", strength: 3 },
      { type: "interrupt-resistance", strength: 3 },
      { type: "element-application", element: "cryo", strength: 2, frequency: "medium" },
    ],
  },

  /* ---------------- 本期特邀角色 ---------------- */
  {
    id: "arlecchino",
    name: "阿蕾奇诺",
    roles: ["main-dps"],
    baseDamage: 9,
    capabilities: [
      { type: "element-application", element: "pyro", strength: 4, frequency: "high" },
      { type: "healing", scope: "active-character", strength: 2, note: "自回血" },
    ],
  },
  {
    id: "chevreuse",
    name: "夏沃蕾",
    roles: ["healer", "buffer"],
    baseDamage: 2,
    capabilities: [
      { type: "healing", scope: "party-wide", strength: 3 },
      { type: "reaction-enable", reactionId: "overload", strength: 4, frequency: "medium" },
    ],
  },
  {
    id: "kazuha",
    name: "枫原万叶",
    roles: ["control", "buffer"],
    baseDamage: 3,
    capabilities: [
      { type: "grouping", strength: 5 },
      { type: "control", strength: 5 },
      { type: "element-application", element: "anemo", strength: 3, frequency: "medium" },
      { type: "reaction-enable", reactionId: "swirl", strength: 5, frequency: "high" },
    ],
    tags: ["universal-support"],
  },
  {
    id: "tighnari",
    name: "提纳里",
    roles: ["main-dps"],
    baseDamage: 7,
    capabilities: [
      { type: "element-application", element: "dendro", strength: 4, frequency: "medium" },
    ],
  },

  /* ---------------- 主要输出 ---------------- */
  {
    id: "sandonie",
    name: "桑多涅",
    roles: ["main-dps"],
    baseDamage: 9,
    capabilities: [
      { type: "element-application", element: "cryo", strength: 5, frequency: "high", note: "高频冰附着，可用于破水盾" },
      { type: "interrupt-resistance", strength: 2 },
    ],
    tags: ["self-sufficient"],
  },
  {
    id: "neuvillette",
    name: "那维莱特",
    roles: ["main-dps"],
    baseDamage: 9,
    capabilities: [
      { type: "element-application", element: "hydro", strength: 4, frequency: "high" },
      { type: "healing", scope: "active-character", strength: 3, note: "自回血，可省下生存位" },
      { type: "interrupt-resistance", strength: 2 },
    ],
    tags: ["self-sufficient", "scarce-hydro"],
  },
  {
    id: "ayaka",
    name: "神里绫华",
    roles: ["main-dps"],
    baseDamage: 9,
    capabilities: [
      { type: "element-application", element: "cryo", strength: 4, frequency: "high" },
    ],
    teammateNeeds: [
      { type: "requires-role", role: "buffer", degradedTo: 0.75, note: "有增伤辅助时体系更完整" },
    ],
  },
  {
    id: "ganyu",
    name: "甘雨",
    roles: ["main-dps"],
    baseDamage: 8,
    capabilities: [
      { type: "element-application", element: "cryo", strength: 4, frequency: "medium" },
    ],
    teammateNeeds: [
      { type: "requires-role", role: "shielder", degradedTo: 0.6, note: "长蓄力需要抗打断" },
    ],
  },
  {
    id: "eula",
    name: "优菈",
    roles: ["main-dps"],
    baseDamage: 8,
    capabilities: [
      { type: "element-application", element: "cryo", strength: 3, frequency: "medium" },
    ],
  },
  {
    id: "raiden",
    name: "雷电将军",
    roles: ["main-dps", "battery"],
    baseDamage: 7,
    capabilities: [
      { type: "element-application", element: "electro", strength: 3, frequency: "medium" },
      { type: "energy", strength: 5 },
      { type: "interrupt-resistance", strength: 2 },
    ],
    tags: ["self-sufficient"],
  },
  {
    id: "keqing",
    name: "刻晴",
    roles: ["main-dps"],
    baseDamage: 7,
    capabilities: [
      { type: "element-application", element: "electro", strength: 3, frequency: "medium" },
    ],
  },
  {
    id: "yae-miko",
    name: "八重神子",
    roles: ["sub-dps"],
    baseDamage: 7,
    capabilities: [
      { type: "element-application", element: "electro", strength: 3, frequency: "medium" },
    ],
    tags: ["off-field"],
  },

  /* ---------------- 水系资源 ---------------- */
  {
    id: "xingqiu",
    name: "行秋",
    roles: ["sub-dps"],
    baseDamage: 5,
    capabilities: [
      { type: "element-application", element: "hydro", strength: 4, frequency: "high" },
      { type: "damage-reduction", strength: 2 },
      { type: "interrupt-resistance", strength: 2 },
    ],
    tags: ["off-field", "scarce-hydro", "flex"],
  },
  {
    id: "mona",
    name: "莫娜",
    roles: ["buffer", "sub-dps"],
    baseDamage: 4,
    capabilities: [
      { type: "element-application", element: "hydro", strength: 3, frequency: "medium" },
      { type: "control", strength: 2 },
    ],
    tags: ["scarce-hydro", "short-window"],
  },
  {
    id: "furina",
    name: "芙宁娜",
    roles: ["sub-dps", "buffer"],
    baseDamage: 7,
    capabilities: [
      { type: "element-application", element: "hydro", strength: 4, frequency: "high" },
    ],
    teammateNeeds: [
      {
        type: "requires-role",
        role: "healer",
        degradedTo: 0.5,
        note: "需要血量频繁变动才能叠层，缺治疗时收益腰斩",
      },
    ],
    tags: ["off-field", "scarce-hydro"],
  },
  {
    id: "barbara",
    name: "芭芭拉",
    roles: ["healer"],
    baseDamage: 1,
    capabilities: [
      { type: "healing", scope: "party-wide", strength: 4 },
      { type: "element-application", element: "hydro", strength: 3, frequency: "medium" },
      { type: "custom", mechanicId: "revive", strength: 3, note: "满命复活" },
    ],
    tags: ["scarce-hydro"],
  },

  /* ---------------- 生存资源 ---------------- */
  {
    id: "diona",
    name: "迪奥娜",
    roles: ["shielder", "healer"],
    baseDamage: 2,
    capabilities: [
      { type: "shield", strength: 3 },
      { type: "healing", scope: "party-wide", strength: 2 },
      { type: "element-application", element: "cryo", strength: 2, frequency: "medium" },
      { type: "interrupt-resistance", strength: 3 },
    ],
  },
  {
    id: "beidou",
    name: "北斗",
    roles: ["sub-dps"],
    baseDamage: 4,
    capabilities: [
      { type: "interrupt-resistance", strength: 4 },
      { type: "damage-reduction", strength: 3 },
      { type: "element-application", element: "electro", strength: 2, frequency: "medium" },
    ],
  },
  {
    id: "mika",
    name: "米卡",
    roles: ["healer", "buffer"],
    baseDamage: 1,
    capabilities: [
      { type: "healing", scope: "party-wide", strength: 3 },
      { type: "element-application", element: "cryo", strength: 2, frequency: "low" },
    ],
  },
  {
    id: "charlotte",
    name: "夏洛蒂",
    roles: ["healer"],
    baseDamage: 2,
    capabilities: [
      { type: "healing", scope: "party-wide", strength: 4 },
      { type: "element-application", element: "cryo", strength: 3, frequency: "high" },
    ],
  },
  {
    id: "qiqi",
    name: "七七",
    roles: ["healer"],
    baseDamage: 2,
    capabilities: [
      { type: "healing", scope: "party-wide", strength: 4 },
      { type: "element-application", element: "cryo", strength: 3, frequency: "medium" },
      { type: "energy", strength: 2 },
    ],
  },
  {
    id: "dori",
    name: "多莉",
    roles: ["healer", "battery"],
    baseDamage: 1,
    capabilities: [
      { type: "healing", scope: "party-wide", strength: 2 },
      { type: "energy", strength: 5 },
      { type: "element-application", element: "electro", strength: 2, frequency: "low" },
    ],
  },
  {
    id: "kuki-shinobu",
    name: "久岐忍",
    roles: ["healer", "sub-dps"],
    baseDamage: 3,
    capabilities: [
      { type: "healing", scope: "active-character", strength: 3, note: "只回当前出战角色" },
      { type: "element-application", element: "electro", strength: 3, frequency: "high" },
    ],
  },
  {
    id: "fischl",
    name: "菲谢尔",
    roles: ["sub-dps"],
    baseDamage: 5,
    capabilities: [
      { type: "element-application", element: "electro", strength: 3, frequency: "medium" },
    ],
    tags: ["off-field"],
  },
  {
    id: "kaeya",
    name: "凯亚",
    roles: ["sub-dps"],
    baseDamage: 4,
    capabilities: [
      { type: "element-application", element: "cryo", strength: 3, frequency: "medium" },
    ],
  },
  {
    id: "rosaria",
    name: "罗莎莉亚",
    roles: ["sub-dps", "buffer"],
    baseDamage: 5,
    capabilities: [
      { type: "element-application", element: "cryo", strength: 3, frequency: "medium" },
    ],
  },
  {
    id: "shenhe",
    name: "申鹤",
    roles: ["buffer"],
    baseDamage: 2,
    capabilities: [
      { type: "element-application", element: "cryo", strength: 2, frequency: "low" },
    ],
  },
  {
    id: "candace",
    name: "坎蒂丝",
    roles: ["buffer", "shielder"],
    baseDamage: 2,
    capabilities: [
      { type: "shield", strength: 2 },
      { type: "element-application", element: "hydro", strength: 2, frequency: "low" },
      { type: "interrupt-resistance", strength: 2 },
    ],
    tags: ["scarce-hydro"],
  },

  /* ---------------- 其他元素（供其他赛季使用） ---------------- */
  {
    id: "bennett",
    name: "班尼特",
    roles: ["healer", "buffer"],
    baseDamage: 2,
    capabilities: [
      { type: "healing", scope: "party-wide", strength: 4 },
      { type: "element-application", element: "pyro", strength: 2, frequency: "low" },
    ],
  },
  {
    id: "zhongli",
    name: "钟离",
    roles: ["shielder"],
    baseDamage: 3,
    capabilities: [
      { type: "shield", strength: 5 },
      { type: "interrupt-resistance", strength: 5 },
      { type: "control", strength: 3 },
    ],
  },
  {
    id: "venti",
    name: "温迪",
    roles: ["control"],
    baseDamage: 3,
    capabilities: [
      { type: "grouping", strength: 5 },
      { type: "control", strength: 5 },
      { type: "element-application", element: "anemo", strength: 3, frequency: "medium" },
    ],
  },
  {
    id: "sucrose",
    name: "砂糖",
    roles: ["control", "buffer"],
    baseDamage: 2,
    capabilities: [
      { type: "grouping", strength: 4 },
      { type: "control", strength: 3 },
      { type: "element-application", element: "anemo", strength: 3, frequency: "medium" },
    ],
  },
  {
    id: "nahida",
    name: "纳西妲",
    roles: ["sub-dps", "buffer"],
    baseDamage: 6,
    capabilities: [
      { type: "element-application", element: "dendro", strength: 4, frequency: "high" },
    ],
  },
];
