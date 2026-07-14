// TRPG 规则系统机制骨架数据。
// 只收录机制事实（骰子/属性/技能基础值等），不含规则书原文的描述性文字。
// - D&D 5e 部分基于官方开放的 SRD (OGL/CC-BY-4.0)。
// - CoC 7e 部分是业界通行的机制骨架（技能名与基础值），非规则书正文摘录。

import type { CharacterSheetEntry } from '../types';

export type RuleSystemId = 'freeform' | 'coc7' | 'dnd5e';

export type SuccessMode = 'high-good' | 'low-good';

export interface DiceConfig {
    count: number;      // 骰子数量
    sides: number;       // 每颗骰子面数
    successMode: SuccessMode; // high-good: 点数越高越好；low-good: 投出的点数需 ≤ 目标值才算成功
    label: string;        // 展示用简称，如 "d20" / "d100" / "2d6"
}

export const DICE_PRESETS: DiceConfig[] = [
    { count: 1, sides: 20, successMode: 'high-good', label: 'd20' },
    { count: 1, sides: 100, successMode: 'low-good', label: 'd100' },
    { count: 1, sides: 6, successMode: 'high-good', label: 'd6' },
    { count: 2, sides: 6, successMode: 'high-good', label: '2d6' },
];

export const DEFAULT_DICE_CONFIG: DiceConfig = DICE_PRESETS[0];

export interface CharacteristicDef {
    key: string;
    label: string;       // 中文名
    formula: string;      // 生成公式说明（展示用）
}

export interface SkillDef {
    key: string;
    label: string;
    base?: number;        // CoC: 基础百分比值；D&D: 不适用
    ability?: string;      // D&D: 关联属性 key
}

export interface RuleSystemDef {
    id: RuleSystemId;
    name: string;
    tagline: string;              // 一句话机制说明，创建页卡片展示
    dice: DiceConfig;
    diceConfigurable: boolean;    // 是否允许用户自定义骰子（目前仅 freeform）
    characteristics?: CharacteristicDef[];
    skills?: SkillDef[];
    derivedNote?: string;         // HP/SAN 等派生属性说明（展示用）
    // 喂给 GM prompt 的规则特定判定补充说明（不重复描述骰点数字本身，那部分由 buildRollInstruction 统一生成）。
    // hasSheet=true 时说明本场已生成逐角色数值表（见 CharacterSheetEntry），GM 应从表中取值判定，而非用统一目标值。
    checkInstruction: (opts?: { target?: number; hasSheet?: boolean }) => string;
}

// --- Call of Cthulhu 7th Edition：机制骨架 ---
const COC7_CHARACTERISTICS: CharacteristicDef[] = [
    { key: 'STR', label: '力量 (STR)', formula: '3D6 × 5' },
    { key: 'CON', label: '体质 (CON)', formula: '3D6 × 5' },
    { key: 'POW', label: '意志 (POW)', formula: '3D6 × 5' },
    { key: 'DEX', label: '敏捷 (DEX)', formula: '3D6 × 5' },
    { key: 'APP', label: '外貌 (APP)', formula: '3D6 × 5' },
    { key: 'SIZ', label: '体型 (SIZ)', formula: '2D6+6 × 5' },
    { key: 'INT', label: '智力 (INT)', formula: '2D6+6 × 5' },
    { key: 'EDU', label: '教育 (EDU)', formula: '2D6+6 × 5' },
];

// 常见技能的标准基础值（未受训时的起始百分比）
const COC7_SKILLS: SkillDef[] = [
    { key: 'spot_hidden', label: '侦查 (Spot Hidden)', base: 25 },
    { key: 'listen', label: '聆听 (Listen)', base: 20 },
    { key: 'library_use', label: '图书馆使用 (Library Use)', base: 20 },
    { key: 'psychology', label: '心理学 (Psychology)', base: 10 },
    { key: 'persuade', label: '说服 (Persuade)', base: 10 },
    { key: 'stealth', label: '潜行 (Stealth)', base: 20 },
    { key: 'dodge', label: '闪避 (Dodge)', base: 0 }, // 实际=DEX/2，展示用占位
    { key: 'first_aid', label: '急救 (First Aid)', base: 30 },
    { key: 'firearms_handgun', label: '射击-手枪 (Firearms: Handgun)', base: 20 },
    { key: 'fighting_brawl', label: '格斗-斗殴 (Fighting: Brawl)', base: 25 },
    { key: 'drive_auto', label: '驾驶 (Drive Auto)', base: 20 },
    { key: 'mechanical_repair', label: '机械维修 (Mechanical Repair)', base: 10 },
    { key: 'electrical_repair', label: '电气维修 (Electrical Repair)', base: 10 },
    { key: 'occult', label: '神秘学 (Occult)', base: 5 },
    { key: 'natural_world', label: '自然学 (Natural World)', base: 10 },
    { key: 'medicine', label: '医学 (Medicine)', base: 1 },
    { key: 'law', label: '法律 (Law)', base: 5 },
    { key: 'accounting', label: '会计 (Accounting)', base: 5 },
    { key: 'charm', label: '魅惑 (Charm)', base: 15 },
    { key: 'intimidate', label: '威吓 (Intimidate)', base: 15 },
    { key: 'climb', label: '攀爬 (Climb)', base: 20 },
    { key: 'jump', label: '跳跃 (Jump)', base: 20 },
    { key: 'swim', label: '游泳 (Swim)', base: 20 },
];

// --- D&D 5e：机制骨架（SRD 5.1，OGL/CC-BY-4.0） ---
const DND5E_ABILITIES: CharacteristicDef[] = [
    { key: 'STR', label: '力量 (Strength)', formula: '4D6 取最高3个 或 标准数组 15/14/13/12/10/8' },
    { key: 'DEX', label: '敏捷 (Dexterity)', formula: '同上' },
    { key: 'CON', label: '体质 (Constitution)', formula: '同上' },
    { key: 'INT', label: '智力 (Intelligence)', formula: '同上' },
    { key: 'WIS', label: '感知 (Wisdom)', formula: '同上' },
    { key: 'CHA', label: '魅力 (Charisma)', formula: '同上' },
];

const DND5E_SKILLS: SkillDef[] = [
    { key: 'athletics', label: '运动 (Athletics)', ability: 'STR' },
    { key: 'acrobatics', label: '体操 (Acrobatics)', ability: 'DEX' },
    { key: 'sleight_of_hand', label: '巧手 (Sleight of Hand)', ability: 'DEX' },
    { key: 'stealth', label: '隐匿 (Stealth)', ability: 'DEX' },
    { key: 'arcana', label: '奥秘 (Arcana)', ability: 'INT' },
    { key: 'history', label: '历史 (History)', ability: 'INT' },
    { key: 'investigation', label: '调查 (Investigation)', ability: 'INT' },
    { key: 'nature', label: '自然 (Nature)', ability: 'INT' },
    { key: 'religion', label: '宗教 (Religion)', ability: 'INT' },
    { key: 'animal_handling', label: '驯兽 (Animal Handling)', ability: 'WIS' },
    { key: 'insight', label: '洞悉 (Insight)', ability: 'WIS' },
    { key: 'medicine', label: '医药 (Medicine)', ability: 'WIS' },
    { key: 'perception', label: '察觉 (Perception)', ability: 'WIS' },
    { key: 'survival', label: '生存 (Survival)', ability: 'WIS' },
    { key: 'deception', label: '欺瞒 (Deception)', ability: 'CHA' },
    { key: 'intimidation', label: '威吓 (Intimidation)', ability: 'CHA' },
    { key: 'performance', label: '表演 (Performance)', ability: 'CHA' },
    { key: 'persuasion', label: '说服 (Persuasion)', ability: 'CHA' },
];

// 自由叙事的基础技能：所有世界观通用，固定列表；特殊技能按世界观由 LLM 原创（见 buildFreeformSheetPrompt）
export const FREEFORM_BASIC_SKILLS: SkillDef[] = [
    { key: 'observation', label: '观察 (Observation)', base: 30 },
    { key: 'persuasion', label: '说服 (Persuasion)', base: 25 },
    { key: 'stealth', label: '潜行 (Stealth)', base: 25 },
    { key: 'combat', label: '格斗 (Combat)', base: 30 },
    { key: 'knowledge', label: '常识 (Knowledge)', base: 30 },
    { key: 'athletics', label: '体能 (Athletics)', base: 30 },
];

export const RULE_SYSTEMS: Record<RuleSystemId, RuleSystemDef> = {
    freeform: {
        id: 'freeform',
        name: '自由叙事',
        tagline: '无固定规则书，骰子机制可自定义，适合纯讲故事的轻量跑团',
        dice: DEFAULT_DICE_CONFIG,
        diceConfigurable: true,
        skills: FREEFORM_BASIC_SKILLS,
        derivedNote: '角色数值表为可选项：基础技能固定通用，特殊技能由 AI 按本场世界观原创',
        checkInstruction: () => {
            // 没有 DC，成败本质是"骰点换算成的等效百分位 vs 技能数值"这道确定的算术题，代码已经把
            // 每个人每项技能对应的判定结果提前算好（见"本回合判定结果预览"），AI 只需要挑一项语义上
            // 贴切的技能/属性抄结果，不要（也不需要）自己重新计算成败。
            return `本场用的是数值判定制，没有难度等级(DC)。下方"本回合判定"里已经给出这个人**每一项技能/属性对应的确定判定结果**（大成功/成功/勉强成功/失败/大失败）——请直接从中挑一项语义上跟本次行动最贴切的技能，把对应的结果原样抄进 outcome/success，不要自己比较骰点和数值、不要更改这个结果。`;
        },
    },
    coc7: {
        id: 'coc7',
        name: '克苏鲁的呼唤 第七版',
        tagline: 'd100 判定：投出点数需 ≤ 目标值才算成功，越低越好',
        dice: { count: 1, sides: 100, successMode: 'low-good', label: 'd100' },
        diceConfigurable: false,
        characteristics: COC7_CHARACTERISTICS,
        skills: COC7_SKILLS,
        derivedNote: 'HP=(SIZ+CON)/10，SAN 初始=POW，理智损失见 SAN 值变化',
        checkInstruction: () => {
            // 同 freeform：CoC 本身就是 d100 数值判定制，没有 DC，成败是确定的算术题，代码已提前算好
            // 每项技能的结果，AI 只需要挑技能抄结果。
            return `这是 CoC 规则下的 d100 检定，没有难度等级(DC)。下方"本回合判定"里已经给出这个人**每一项技能/属性对应的确定判定结果**（大成功/成功/勉强成功/失败/大失败）——请直接从中挑一项语义上跟本次行动最贴切的技能/属性，把对应的结果原样抄进 outcome/success，不要自己比较骰点和数值、不要更改这个结果。`;
        },
    },
    dnd5e: {
        id: 'dnd5e',
        name: '龙与地下城 第五版',
        tagline: 'd20 判定：点数越高越好，含属性检定与豁免',
        dice: { count: 1, sides: 20, successMode: 'high-good', label: 'd20' },
        diceConfigurable: false,
        characteristics: DND5E_ABILITIES,
        skills: DND5E_SKILLS,
        derivedNote: 'HP 按职业生命骰+体质调整值累加，熟练加值随等级提升',
        checkInstruction: (opts) => {
            const dc = opts?.target ? `，本次检定难度等级(DC)约为 ${opts.target}` : '';
            if (opts?.hasSheet) {
                return `这是 D&D 5e 规则下的 d20 检定，点数越高越好：20 为出乎意料的大成功，1 为灾难性大失败${dc}。请从下方【角色数值表】里找到与本次行动最贴切的技能加值（或属性调整值），加到骰点结果上再与难度比较裁定成败；没有直接对应的技能就近用相关属性代替。请先根据当前情境的危险程度/难度给出一个合理的 DC（通常 5~30，简单事情低、生死攸关或高难度动作高），再据此裁定成败。`;
            }
            return `这是 D&D 5e 规则下的 d20 检定，点数越高越好：20 为出乎意料的大成功，1 为灾难性大失败${dc}。请先给出一个合理的 DC（通常 5~30），再据此裁定行动的成败与代价，让结果自然融入叙事，不要直接复述数字。`;
        },
    },
};

export const RULE_SYSTEM_LIST: RuleSystemDef[] = [RULE_SYSTEMS.freeform, RULE_SYSTEMS.coc7, RULE_SYSTEMS.dnd5e];

// 通用骰子投掷：按 DiceConfig 投出总点数
export const rollDice = (cfg: DiceConfig): number => {
    let total = 0;
    for (let i = 0; i < cfg.count; i++) total += Math.floor(Math.random() * cfg.sides) + 1;
    return total;
};

// 把骰点结果翻译成成功度描述，供 GM 判定。适配 high-good / low-good 两种模式。
export const rollFlavorFor = (cfg: DiceConfig, n: number, target?: number): string => {
    const max = cfg.count * cfg.sides;
    if (cfg.successMode === 'low-good') {
        const t = target ?? Math.floor(max / 2);
        if (n <= Math.floor(t / 5) && n <= 5) return '大成功(Critical Success)';
        if (n >= 96 && max === 100) return '大失败(Critical Failure)';
        if (n <= t) return '成功(Success)';
        if (n <= t + 20) return '勉强(Partial)';
        return '失败(Failure)';
    }
    // high-good（如 d20/d6/2d6）
    if (cfg.count === 1 && cfg.sides === 20) {
        if (n === 20) return '大成功(Critical Success)';
        if (n === 1) return '大失败(Critical Failure)';
        if (n >= 15) return '成功(Success)';
        if (n >= 8) return '勉强(Partial)';
        return '失败(Failure)';
    }
    // 通用 high-good：按占最大值的比例分档
    const ratio = n / max;
    if (ratio >= 0.95) return '大成功(Critical Success)';
    if (ratio <= 0.1) return '大失败(Critical Failure)';
    if (ratio >= 0.7) return '成功(Success)';
    if (ratio >= 0.35) return '勉强(Partial)';
    return '失败(Failure)';
};

// --- 检定五档结果：机械计算，不再交给 LLM 判断成败 ---
// 大成功/成功/勉强成功(有代价的成功)/失败/大失败，对应 GameLog.diceRoll.tier
export type CheckTier = 'critical_success' | 'success' | 'partial' | 'failure' | 'critical_failure';

export const CHECK_TIER_LABELS: Record<CheckTier, string> = {
    critical_success: '大成功',
    success: '成功',
    partial: '勉强成功',
    failure: '失败',
    critical_failure: '大失败',
};

// 把任意骰子配置下的一次投骰，换算成"d100 低位好"等效百分位（1-100，越低越好）。
// low-good（如 d100 本身）直接按比例映射；high-good（如 d20）先取反再映射。
// 对真正的 d100 low-good 输入，这个换算是恒等的（roll=50 -> 50），所以 CoC7 的行为和换算前完全一致。
export const toCocPercentile = (cfg: DiceConfig, roll: number): number => {
    const max = cfg.count * cfg.sides;
    const min = cfg.count;
    if (max <= min) return 50;
    const frac = cfg.successMode === 'low-good' ? (roll - min) / (max - min) : (max - roll) / (max - min);
    return Math.round(frac * 99) + 1;
};

// CoC 风格的五档判定：百分位 n（1-100，越低越好）对比技能/属性数值 v（0-100）
const cocTierFromPercentile = (n: number, v: number): CheckTier => {
    const t = Math.max(0, Math.min(100, v));
    if (n <= Math.floor(t / 5) && n <= 5) return 'critical_success';
    if (n >= 96) return 'critical_failure';
    if (n <= t) return 'success';
    if (n <= t + 20) return 'partial';
    return 'failure';
};

// D&D 5e 风格的五档判定：raw 为原始 d20 点数（未加调整值），modifier 为技能加值，dc 为难度等级
const dndTierFromRoll = (raw: number, modifier: number, dc: number): CheckTier => {
    if (raw === 20) return 'critical_success';
    if (raw === 1) return 'critical_failure';
    const margin = (raw + modifier) - dc;
    if (margin >= 5) return 'critical_success';
    if (margin >= 0) return 'success';
    if (margin >= -5) return 'partial';
    return 'failure';
};

// 统一入口：根据规则系统机械计算一次检定的五档结果。
// - coc7 / freeform：用技能数值(0-100)作为目标值，骰点换算成等效百分位后比较（freeform 骰子可能不是 d100，靠 toCocPercentile 归一化）。
// - dnd5e：技能数值是加值，target 是 AI 给出的 DC（缺省兜底 15），按 5e 的 nat20/nat1 + margin 分档。
export const computeCheckTier = (
    sys: RuleSystemDef,
    cfg: DiceConfig,
    roll: number,
    skillValue: number | undefined,
    target?: number,
): { tier: CheckTier; label: string; success: boolean } => {
    let tier: CheckTier;
    if (sys.id === 'dnd5e') {
        tier = dndTierFromRoll(roll, skillValue ?? 0, target ?? 15);
    } else {
        const percentile = toCocPercentile(cfg, roll);
        tier = cocTierFromPercentile(percentile, skillValue ?? 50);
    }
    const success = tier !== 'failure' && tier !== 'critical_failure';
    return { tier, label: CHECK_TIER_LABELS[tier], success };
};

// 消除"AI 算错成败"这类风险的关键函数：coc7/freeform 没有 DC，判定结果本质是"骰点(换算成等效
// 百分位) vs 技能数值"这道确定的算术题，代码本来就会算（见 computeCheckTier）。既然如此，没必要
// 等 AI 自己算完再拿代码复核——直接把这个人数值表里**每一项**技能/属性对应的判定结果都提前算好，
// 整理成一行文本喂给 AI，AI 只需要挑一项语义上贴切的技能抄结果，不再需要（也不被允许）自己计算。
// 仅适用于 coc7/freeform：dnd5e 的 DC 必须由 AI 按情境判断，没法穷举，DC 相关的算术风险保留现有
// 复核机制（见 apps/GameApp.tsx handleAction 里 isDnd 分支）。
export const buildCheckOutcomePreview = (
    sys: RuleSystemDef,
    cfg: DiceConfig,
    roll: number,
    sheet: CharacterSheetEntry | undefined,
): string => {
    const stripParen = (s: string) => s.split('(')[0].split('（')[0].trim();
    const pools: Array<{ key: string; label: string; kind: 'skill' | 'char' }> = [
        ...(sys.skills || []).map(s => ({ key: s.key, label: s.label, kind: 'skill' as const })),
        ...(sys.characteristics || []).map(c => ({ key: c.key, label: c.label, kind: 'char' as const })),
    ];
    if (!sheet || pools.length === 0) {
        // 没有角色数值表：所有技能共享同一个固定目标值(50)，这个人本回合的判定结果因此是唯一确定的，
        // 用哪个技能裁定都不影响结果。
        const { label } = computeCheckTier(sys, cfg, roll, 50, undefined);
        return `本回合判定结果已确定：${label}（无论选用哪个技能/属性，结果都是这个，不需要自己计算）`;
    }
    const lines: string[] = [];
    for (const p of pools) {
        const src = p.kind === 'skill' ? sheet.skills : sheet.characteristics;
        const v = src?.[p.key];
        if (v === undefined) continue;
        const { label } = computeCheckTier(sys, cfg, roll, v, undefined);
        lines.push(`${stripParen(p.label)}=${label}`);
    }
    if (lines.length === 0) {
        const { label } = computeCheckTier(sys, cfg, roll, 50, undefined);
        return `本回合判定结果已确定：${label}（无论选用哪个技能/属性，结果都是这个，不需要自己计算）`;
    }
    return lines.join('、');
};

// 把 AI 给的自由文本技能/属性名（如"说服"、"力量"）模糊匹配回角色数值表里的实际数值。
// 匹配不上就返回 undefined，交给 computeCheckTier 用兜底默认值。
export const findSkillValueByName = (
    sys: RuleSystemDef,
    sheet: CharacterSheetEntry | undefined,
    name: string | undefined,
): number | undefined => {
    if (!sheet || !name) return undefined;
    const query = name.trim();
    if (!query) return undefined;
    const stripParen = (s: string) => s.split('(')[0].split('（')[0].trim();
    const pools: Array<{ key: string; label: string; kind: 'skill' | 'char' }> = [
        ...(sys.skills || []).map(s => ({ key: s.key, label: s.label, kind: 'skill' as const })),
        ...(sys.characteristics || []).map(c => ({ key: c.key, label: c.label, kind: 'char' as const })),
    ];
    // 先精确匹配（去掉括号后的核心部分完全相等，或 key 完全相等）
    for (const p of pools) {
        const core = stripParen(p.label);
        if (core === query || p.key.toLowerCase() === query.toLowerCase()) {
            const src = p.kind === 'skill' ? sheet.skills : sheet.characteristics;
            const v = src?.[p.key];
            if (v !== undefined) return v;
        }
    }
    // 再部分匹配（只允许 query 是 core 的子串，不允许反向 core.includes(query)，防止"力"同时命中"力量"和"魅力"）
    for (const p of pools) {
        const core = stripParen(p.label);
        if (core.includes(query)) {
            const src = p.kind === 'skill' ? sheet.skills : sheet.characteristics;
            const v = src?.[p.key];
            if (v !== undefined) return v;
        }
    }
    return undefined;
};

// --- 逐人生命/理智状态（昏迷/死亡/疯狂）：纯代码阈值判定，不问 AI ---
// hpChange/sanityChange 的数值本身是 AI 给的，但"到了这个数算什么状态"是确定性 bucketing，
// 不存在"AI 算错了"需要复核这一步（不同于 checks[] 的成败判定，那个才需要机械复核）。

export type VitalState = 'normal' | 'wounded' | 'critical' | 'unconscious' | 'dead';
export type SanState = 'stable' | 'unsettled' | 'unstable' | 'broken';

export const VITAL_STATE_LABELS: Record<VitalState, string> = {
    normal: '正常',
    wounded: '轻伤',
    critical: '重伤',
    unconscious: '昏迷',
    dead: '死亡',
};

export const SAN_STATE_LABELS: Record<SanState, string> = {
    stable: '稳定',
    unsettled: '不安',
    unstable: '动摇',
    broken: '疯狂',
};

// isDead: 由调用方传入——是否已经被标记为死亡（GameSession.deadCharIds），死亡是永久状态，
// 不能仅凭 health 数值反推（角色可能后来被治疗回满，但死亡不可逆）。
export const computeVitalState = (health: number, isDead: boolean): VitalState => {
    if (isDead) return 'dead';
    if (health <= 0) return 'unconscious';
    if (health <= 30) return 'critical';
    if (health <= 50) return 'wounded';
    return 'normal';
};

export const computeSanState = (sanity: number): SanState => {
    if (sanity <= 0) return 'broken';
    if (sanity <= 30) return 'unstable';
    if (sanity <= 50) return 'unsettled';
    return 'stable';
};

// 旧存档兜底：没有 characterVitals 字段时，用全局 status.health/sanity 给每个人现算一份初始值，
// 保证老存档打开时不会因为缺字段而崩，且数值上等价于"迁移前的行为"（大家共享同一份血条）。
export const getCharacterVitals = (
    charId: string,
    characterVitals: Record<string, { health: number; sanity: number }> | undefined,
    fallbackHealth: number,
    fallbackSanity: number,
): { health: number; sanity: number } => {
    return characterVitals?.[charId] ?? { health: fallbackHealth, sanity: fallbackSanity };
};

// --- 角色数值表（方案B）：按本场剧本单独生成，交给 LLM 参考角色设定+长期记忆安排 ---
// CharacterSheetEntry 定义见 types.ts（GameSession.characterSheets 用的是同一个类型）

// 把某条角色数值表渲染成一段可读文本，用于喂给 GM prompt / 展示给用户
export const formatCharacterSheet = (sys: RuleSystemDef, entry: CharacterSheetEntry): string => {
    const charLine = (sys.characteristics || [])
        .map(c => `${c.label.split(' ')[0]}${entry.characteristics[c.key] ?? '-'}`)
        .join(' / ');
    const skillLine = (sys.skills || [])
        .map(s => `${s.label.split(' ')[0]}${entry.skills[s.key] ?? '-'}`)
        .filter(s => !s.endsWith('undefined') && !s.endsWith('-'))
        .join('、');
    let block = `**${entry.name}**`;
    if (charLine) block += `\n属性: ${charLine}`;
    if (skillLine) block += `\n技能: ${skillLine}`;
    if (entry.note) block += `\n（${entry.note}）`;
    return block;
};

// 把一整场存档的角色数值表渲染成注入 GM prompt 的整块文本
export const formatCharacterSheetsBlock = (sys: RuleSystemDef, sheets: Record<string, CharacterSheetEntry>): string => {
    const entries = Object.values(sheets);
    if (entries.length === 0) return '';
    return `\n### 角色数值表 (Character Sheets · ${sys.name})\n${entries.map(e => formatCharacterSheet(sys, e)).join('\n\n')}\n`;
};

// 生成"逐角色数值表"的 LLM 提示词：让 LLM 参考角色设定/长期记忆，为每个角色按本场规则系统分配合理的属性与技能值。
// isPlayer 用于告知 LLM 这一条是玩家本人（只有 bio，没有 systemPrompt/memories）。
export const buildCharacterSheetPrompt = (
    sys: RuleSystemDef,
    worldSetting: string,
    subjects: Array<{ id: string; name: string; profileText: string }>,
): string => {
    const charList = (sys.characteristics || []).map(c => `${c.key}(${c.label}, 公式参考: ${c.formula})`).join('、');
    const skillList = (sys.skills || []).map(s => s.base !== undefined ? `${s.key}(${s.label}, 基础值${s.base})` : `${s.key}(${s.label}, 关联属性${s.ability})`).join('、');

    return `你是一位经验丰富的 TRPG 主持人，正在为一场跑团冒险准备【${sys.name}】规则下的角色数值表。

### 本场剧本世界观
${worldSetting}

### 规则系统机制
- 属性项: ${charList}
- 技能项: ${skillList}
${sys.derivedNote ? `- 派生说明: ${sys.derivedNote}` : ''}

### 任务
请参考每个角色的**性格设定、背景故事与长期记忆**，为其分配**符合人设逻辑**的属性与技能数值——比如设定上体弱害怕冲突的角色，力量/格斗类数值就应明显偏低；博学冷静的角色，智力/图书馆使用类数值就应明显偏高。数值要有合理的高低起伏，不要所有人都是均值附近的平庄数字。

### 待生成角色
${subjects.map((s, i) => `${i + 1}. ${s.name} (id: ${s.id})\n${s.profileText}`).join('\n\n')}

### 输出格式 (Strict JSON，不要代码块)
{
  "sheets": [
    {
      "id": "角色id（必须严格对应上方 id，玩家本人用 __player__）",
      "characteristics": { "属性key": 数值, ... },
      "skills": { "技能key": 数值, ... },
      "note": "一句话简短理由，说明为什么这样分配（如：设定体弱多病，力量与体质偏低；但博览群书，图书馆使用极高）"
    }
  ]
}
只输出 JSON，为上面列出的**每一个**角色和技能项都给出数值，不要遗漏。`;
};

// 自由叙事专属：一次 LLM 调用同时完成"按世界观原创特殊技能"+"逐角色分配数值"（基础技能固定通用，特殊技能按本场世界观现编）。
// 与 coc7/dnd5e 的 buildCharacterSheetPrompt 分开写，因为自由叙事没有固定技能表，技能本身也要现场生成。
export const buildFreeformCharacterSheetPrompt = (
    worldSetting: string,
    subjects: Array<{ id: string; name: string; profileText: string }>,
    existingSpecialSkills: Array<{ key: string; label: string }> = [],
): string => {
    const basicList = FREEFORM_BASIC_SKILLS.map(s => `${s.key}(${s.label}, 参考基础值${s.base})`).join('、');
    const existingBlock = existingSpecialSkills.length > 0
        ? `\n**已有特殊技能（可保留/替换，不要简单重复）**: ${existingSpecialSkills.map(s => s.label).join('、')}`
        : '';

    return `你是一位经验丰富的 TRPG 主持人，正在为一场【自由叙事】跑团冒险准备角色数值表。

### 本场剧本世界观
${worldSetting}

### 基础技能（所有世界观通用，固定）
${basicList}
${existingBlock}

### 任务
1. 根据本场世界观，原创 3~5 个「特殊技能」——只在这个世界观下才有意义的能力（例如赛博世界的"黑客入侵"、克苏鲁风的"禁忌知识"、武侠世界的"轻功"），给出简短的中文技能名。
2. 参考每个角色的**性格设定、背景故事与长期记忆**，为其分配**符合人设逻辑**的技能数值(0-100，需覆盖全部基础技能与你原创的特殊技能)——比如设定上体弱害怕冲突的角色，格斗类数值就应明显偏低；博学冷静的角色，常识类数值就应明显偏高。数值要有合理的高低起伏，不要所有人都是均值附近的平庄数字。

### 待生成角色
${subjects.map((s, i) => `${i + 1}. ${s.name} (id: ${s.id})\n${s.profileText}`).join('\n\n')}

### 输出格式 (Strict JSON，不要代码块)
{
  "specialSkills": [ { "key": "英文或拼音短key，如 hacking", "label": "中文技能名" } ],
  "sheets": [
    {
      "id": "角色id（必须严格对应上方 id，玩家本人用 __player__）",
      "skills": { "技能key": 数值, ... 覆盖全部基础技能 + 你原创的特殊技能 },
      "note": "一句话简短理由，说明为什么这样分配"
    }
  ]
}
只输出 JSON，specialSkills 恰好给 3~5 个，为上面列出的**每一个**角色和技能项（基础+特殊）都给出数值，不要遗漏。`;
};
