/**
 * 角色别名。用于低摩擦录入：用户粘贴的名字可能来自攻略、语音输入或社区昵称。
 * 纯数据，求解器不读取。
 */
export const CHARACTER_ALIASES: Record<string, string[]> = {
  sandonie: ["木偶", "桑多涅", "至冬木偶"],
  neuvillette: ["龙王", "那维莱特", "纳维莱特"],
  ayaka: ["神里绫华", "绫华", "神里玲华"],
  skirk: ["丝柯克", "四可克", "斯柯克"],
  flins: ["菲林斯", "菲林思"],
  aino: ["爱诺", "艾诺"],
  furina: ["芙宁娜", "福宁娜", "芙卡洛斯"],
  "kuki-shinobu": ["久岐忍", "小忍"],
  "yae-miko": ["八重神子", "八重"],
  raiden: ["雷电将军", "雷神"],
  kazuha: ["枫原万叶", "万叶"],
  arlecchino: ["阿蕾奇诺", "仆人"],
  chevreuse: ["夏沃蕾", "夏洛蒂"],
  charlotte: ["夏洛蒂", "夏沃蕾"],
  qiqi: ["七七"],
  dori: ["多莉"],
  mika: ["米卡"],
  beidou: ["北斗"],
  diona: ["迪奥娜"],
  layla: ["莱依拉", "莱伊拉"],
  barbara: ["芭芭拉"],
  xingqiu: ["行秋"],
  mona: ["莫娜"],
  yelan: ["夜兰", "夜蘭"],
  olorun: ["欧洛伦"],
  ganyu: ["甘雨"],
  eula: ["优菈", "优拉"],
  keqing: ["刻晴"],
  fischl: ["菲谢尔", "皇女"],
  shenhe: ["申鹤"],
  rosaria: ["罗莎莉亚"],
  kaeya: ["凯亚"],
  candace: ["坎蒂丝"],
  tighnari: ["提纳里"],
  bennett: ["班尼特"],
  zhongli: ["钟离"],
  venti: ["温迪"],
  sucrose: ["砂糖"],
  nahida: ["纳西妲"],
};

/**
 * 注意：「夏沃蕾」与「夏洛蒂」在社区里经常被混用，两者是不同角色。
 * 因此二者互为别名时匹配置信度必须降级，交给用户确认。
 */
export const AMBIGUOUS_ALIASES = new Set(["夏沃蕾", "夏洛蒂"]);
