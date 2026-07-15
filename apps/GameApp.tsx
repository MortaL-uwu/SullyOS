
import React, { useState, useEffect, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { DB } from '../utils/db';
import { GameSession, GameTheme, CharacterProfile, GameLog, GameActionOption, GameSummary, CharacterSheetEntry } from '../types';
import { ContextBuilder } from '../utils/context';
import { extractContent, extractJson } from '../utils/safeApi';
import { injectMemoryPalace } from '../utils/memoryPalace/pipeline';
import { ChatParser } from '../utils/chatParser';
import { RuleSystemId, DiceConfig, RULE_SYSTEMS, RULE_SYSTEM_LIST, DICE_PRESETS, DEFAULT_DICE_CONFIG, FREEFORM_BASIC_SKILLS, rollDice, rollFlavorFor, toCocPercentile, buildCheckOutcomePreview, formatCharacterSheetsBlock, buildCharacterSheetPrompt, buildFreeformCharacterSheetPrompt, computeCheckTier, findSkillValueByName, CheckTier, CHECK_TIER_LABELS, getCharacterVitals, computeVitalState, computeSanState, VITAL_STATE_LABELS, SAN_STATE_LABELS, VitalState, SanState } from '../utils/trpgRuleSystems';
import Modal from '../components/os/Modal';
import { CharacterGroupFilterBar, filterCharactersByGroup, GROUP_FILTER_ALL } from '../components/character/CharacterGroupFilter';
import { Planet, RocketLaunch, Lightning, LockSimple, DiceFive, Toolbox, FloppyDisk, ArrowsClockwise, DoorOpen, IdentificationCard, Eye, SkullIcon, Trophy, Crown, Fire, Skull as SkullTombstone, ChartBar, Sparkle } from '@phosphor-icons/react';

// --- Themes Configuration (Enhanced) ---
const GAME_THEMES: Record<GameTheme, { bg: string, text: string, accent: string, font: string, border: string, cardBg: string, gradient: string, optionNormal: string, optionChaotic: string, optionEvil: string }> = {
    fantasy: {
        bg: 'bg-[#1a120b]',
        text: 'text-[#e5e5e5]',
        accent: 'text-[#fbbf24]',
        font: 'font-serif',
        border: 'border-[#78350f]',
        cardBg: 'bg-[#2a2018]',
        gradient: 'from-[#451a03] to-[#1a120b]',
        optionNormal: 'bg-[#451a03] border-[#78350f] text-[#fbbf24]',
        optionChaotic: 'bg-[#78350f] border-[#b45309] text-[#fcd34d]',
        optionEvil: 'bg-[#3f0f0f] border-[#7f1d1d] text-[#fca5a5]'
    },
    cyber: {
        bg: 'bg-[#020617]',
        text: 'text-[#94a3b8]',
        accent: 'text-[#22d3ee]',
        font: 'font-mono',
        border: 'border-[#1e293b]',
        cardBg: 'bg-[#0f172a]/80',
        gradient: 'from-[#0f172a] to-[#020617]',
        optionNormal: 'bg-[#0f172a] border-[#1e293b] text-[#22d3ee]',
        optionChaotic: 'bg-[#1e1b4b] border-[#4338ca] text-[#a78bfa]',
        optionEvil: 'bg-[#450a0a] border-[#7f1d1d] text-[#fca5a5]'
    },
    horror: {
        bg: 'bg-[#0f0000]',
        text: 'text-[#d4d4d8]',
        accent: 'text-[#ef4444]',
        font: 'font-serif',
        border: 'border-[#450a0a]',
        cardBg: 'bg-[#2b0e0e]',
        gradient: 'from-[#450a0a] to-[#000000]',
        optionNormal: 'bg-[#2b0e0e] border-[#450a0a] text-[#d4d4d8]',
        optionChaotic: 'bg-[#3f1d1d] border-[#7f1d1d] text-[#fda4af]',
        optionEvil: 'bg-[#450a0a] border-[#991b1b] text-[#ef4444]'
    },
    modern: {
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        accent: 'text-blue-600',
        font: 'font-sans',
        border: 'border-slate-200',
        cardBg: 'bg-white',
        gradient: 'from-slate-100 to-white',
        optionNormal: 'bg-white border-slate-200 text-slate-600',
        optionChaotic: 'bg-yellow-50 border-yellow-200 text-yellow-700',
        optionEvil: 'bg-red-50 border-red-200 text-red-700'
    }
};

// 每累积这么多条「未归档日志」就触发一次自动总结
const AUTO_SUMMARY_THRESHOLD = 20;
// 自动总结后保留最近这么多条日志不折叠，保证阅读与剧情连贯
const KEEP_RECENT_AFTER_SUMMARY = 4;
// AI 世界观生成的可选风格
const WORLD_STYLES = ['高奇幻', '赛博朋克', '克苏鲁恐怖', '武侠江湖', '末世废土', '校园日常', '悬疑推理', '蒸汽朋克', '西部拓荒', '宫廷权谋'];

// DM 风格：开团前选择的"主持人性格"，决定 GM 指令段落里冲突强度/失败代价/氛围基调怎么写。
type DmStyle = 'default' | 'comedy' | 'horror' | 'romance';
const DM_STYLE_META: Record<DmStyle, { label: string; tagline: string; desc: string }> = {
    default: { label: '硬核沉浸', tagline: '真实冒险 · 世界自转', desc: '拒绝修罗场和玩家中心，世界有自己的节奏。严格判定，失败有真实代价，环境描写营造沉浸感。' },
    comedy: { label: '轻松喜剧', tagline: '欢乐跑团 · 笑料优先', desc: '失败不致命，只会出洋相。鼓励队友互相拆台、抖机灵，战斗也可以很滑稽。' },
    horror: { label: '恐怖惊悚', tagline: '未知威胁 · 心理恐惧', desc: '氛围优先于行动，多用暗示与留白。慢节奏营造压抑感，SAN 侵蚀伴随幻觉与偏执。' },
    romance: { label: '浪漫风格', tagline: '双人物语 · 甜蜜冒险', desc: '镜头始终围着你和TA。麻烦来自外部，TA永远站在你这边，失败也能变成拉近关系的契机。' },
};

// 每回合 GM 指令里"去玩家中心"+"风格基调"这两段（对应原文里的第 2、3 条），按 dmStyle 切换。
// 其余段落（全员入戏/生成选项/一致性自检/输出格式）四种风格通用，不在这里分叉。
const buildGmStyleSection = (style: DmStyle): string => {
    switch (style) {
        case 'comedy':
            return `2. **去玩家中心 · 但保持轻松 (关键)**:
   - 队友仍各有各的小心思和吐槽点，不必都围着玩家转，但整体基调轻松愉快。
   - **鼓励互相调侃**：队友之间互相拆台、抖机灵是加分项，但别真的伤感情。
   - 世界照常运转，但麻烦多半是"闹出乱子"，不是真正致命的威胁。

3. **欢乐向 GM 风格**:
   - **失败不致命**：判定失败的代价是尴尬/搞笑/出洋相（摔倒、说错话、道具失灵），不要写成重伤或死亡。
   - **物理喜剧**：战斗和意外可以有滑稽元素（踩到香蕉皮、武器卡壳、掉进水坑但只是弄脏衣服）。
   - **HP/SAN 走轻代价**：即使掉血/掉san，也倾向小幅度、能很快恢复，别把结局写得阴暗。
   - **昏迷/疯狂**: 若真的触发（HP/SAN归零），用带点黑色幽默的方式描写，而不是渲染绝望。
   - **Markdown 排版**: 请在 \`gm_narrative\` 和 \`dialogue\` 中积极使用 Markdown 营造轻快节奏。`;
        case 'horror':
            return `2. **去玩家中心 · 让恐惧自己蔓延 (关键)**:
   - 队友们有各自的恐惧和秘密，可能隐瞒、可能崩溃，不必都围着玩家转找安全感。
   - **各有所图**：每个角色带着自己的目的和情绪行动，危机面前不一定团结一致。
   - 世界（或"它"）有自己的意志，不因玩家的行动而停下。

3. **恐怖惊悚 GM 风格**:
   - **氛围优先**：描写阴森、压抑、窸窣声、若隐若现的影子，多用暗示和留白，不要一次性揭示怪物全貌或真相。
   - **慢节奏 + 突然惊吓**：大部分时间压抑铺垫，关键时刻才给一次真正的惊吓，别每回合都惊悚轰炸。
   - **骰点判定依然严格**：按【本回合判定】的采纳规则裁定成败，骰得差要有真实代价；调查/逃跑往往比正面战斗更合理。
   - **HP/SAN 是逐人的**：不要把队友的伤/惧算到玩家头上；SAN 下降要配心理描写（幻听、幻视、偏执、时间感错乱），不只是扣数字。
   - **昏迷/疯狂**: 已昏迷的角色本回合不能自主行动，只能被搬动/救治；已疯狂的角色仍在场，但言行失控诡异。
   - **Markdown 排版**: 用于强调那些令人不安的关键细节。`;
        case 'romance':
            return `2. **镜头始终围着你和TA (关键)**:
   - 这里**不需要"去玩家中心"**——恰恰相反，要让镜头聚焦在玩家和TA之间的互动上，其他NPC/队友戏份让位。
   - **主动示好**：TA应该主动做出关怀/亲密的小动作（牵手、递水、递外套、扶一把），不必等玩家先开口。
   - **绝不制造两人间的裂痕**：麻烦来自外部环境/事件/NPC，绝不安排TA和玩家之间的猜疑、冷战或矛盾——遇到问题TA永远站在玩家这一边。
   - **世界仍在运转，但服务于氛围**：环境描写为营造浪漫感服务（夕阳、篝火、并肩走的小路），危机是"两人一起克服"的浪漫桥段，而非生死威胁。

3. **浪漫 GM 风格**:
   - **判定代价温柔化**：失败不写重伤/死亡，而是"需要TA扶一把""吓得抓住TA的手""闹了个小乌龙但两人一起笑出来"——把风险转化为拉近关系的契机。
   - **情感浓度**：台词多带撒娇/关心/吃醋/害羞等情绪色彩，鼓励TA主动表达在意，而不是等玩家先说。
   - **留白与安静片段**：允许一起吃饭、看星星这类没有强情节推进的相处时刻，不必每回合都制造事件。
   - **HP/SAN 走轻代价**：即使有战斗/危险场面，也尽量点到为止，重点始终落回两人的互动与情感。
   - **Markdown 排版**: 用于强调温柔的细节和情绪，例如 *轻声说* 这样的动作描写。`;
        default:
            return `2. **去玩家中心 · 让世界自己转 (关键)**:
   - **拒绝修罗场**: 队友们不是来讨好/争抢玩家的 NPC。不要让所有人都把注意力黏在玩家身上、抢着对玩家示好。
   - **各有所图**: 每个角色都带着**自己的目的、立场和情绪**行动，可以分歧、可以自顾自做事、可以暂时忽略玩家。
   - **因地制宜**: 同一个角色在战斗、社交、独处、危机等不同环境下应表现出**不同侧面**，而非一套反应走到底。
   - **剧情自驱**: 世界有自己的节奏——即使玩家什么都不做，也会有事件发生、势力推进、NPC 行动。主动推动主线。

3. **硬核 GM 风格**:
   - **制造冲突**: 不要让旅途一帆风顺。安排陷阱、突发战斗、尴尬的社交场面、或者道德困境。
   - **环境描写**: 描述光影、气味、声音，营造沉浸感。
   - **骰点判定**: 按【本回合判定】里的采纳规则，挑出本回合真正构成检定的行动，在 \`checks\` 里给出成败结果，严格依据对应骰点结果裁定，骰得差就要有真实代价；判定过的事在 \`gm_narrative\` 里要让读者感觉到"这确实是一次有悬念的尝试"，不要写得云淡风轻。
   - **HP/SAN 是逐人的**: 每个人的生命/理智值是独立的，不要把队友的伤算到玩家头上，也不要让所有人的血条永远同步变化——战斗/惊悚场面通常只有直接相关的人掉血/掉san。
   - **昏迷/疯狂**: 已昏迷（HP归零）的角色本回合不能自主行动/发言，只能被队友搬动或救治，请不要在 \`characters\` 里给TA安排新的主动行为；已疯狂（SAN归零）的角色仍在场，但言行应体现失控/诡异，不是消失。
   - **Markdown 排版**: 请在 \`gm_narrative\` 和 \`dialogue\` 中**积极使用 Markdown**。例如：使用 **加粗** 强调重点，使用 *斜体* 描述动作。`;
    }
};

// 开场序章的"任务"三条（剧情描述/角色反应/初始选项），按 dmStyle 切换措辞与侧重点。
const buildPrologueStyleTask = (style: DmStyle): { p1: string; p2: string; p3: string } => {
    switch (style) {
        case 'comedy':
            return {
                p1: '**剧情描述**: 轻松地铺开这个世界正在发生的趣事或小麻烦，基调幽默，不要一上来就阴暗沉重。',
                p2: '**角色反应**: 简要描述队友们的初始状态或第一句台词，可以互相调侃、抖机灵，展现各自搞笑的一面。请**务必**参考【神经链接】中的私聊状态来决定他们的态度。',
                p3: '**初始选项**: 给出三个玩家可以采取的行动选项，风险不必致命，出岔子也该是好笑的',
            };
        case 'horror':
            return {
                p1: '**剧情描述**: 先铺开压抑诡异的氛围和隐约的危机，不要直接揭示恐惧的真相，留白和暗示优先。**先有世界，再有人**——开场不要围着玩家转，而是把不安的舞台铺开。',
                p2: '**角色反应**: 简要描述队友们的初始状态或第一句台词，可以表现出不安、警觉或掩饰的恐惧。请**务必**参考【神经链接】中的私聊状态来决定他们的态度。',
                p3: '**初始选项**: 给出三个玩家可以采取的行动选项，倾向调查/试探而非正面冲突',
            };
        case 'romance':
            return {
                p1: '**剧情描述**: 镜头聚焦在玩家和TA的相处上，世界观作为浪漫氛围的背景铺陈（不必强调"危机逼近"），营造温暖轻松的开场。',
                p2: '**角色反应**: 简要描述TA的初始状态或第一句台词，应体现对玩家的关心或亲近。请**务必**参考【神经链接】中的私聊状态来决定亲密程度，但基调始终温柔，绝不冷淡或疏离。',
                p3: '**初始选项**: 给出三个玩家可以采取的行动选项，风险应轻松、不致命，更像"如何更靠近TA"的选择',
            };
        default:
            return {
                p1: '**剧情描述**: 描述这个世界正在发生什么、小队所处的环境与正在逼近的事件。**先有世界，再有人**——开场不要围着玩家转，而是把舞台和危机铺开。',
                p2: '**角色反应**: 简要描述队友们的初始状态或第一句台词。请**务必**参考【神经链接】中的私聊状态来决定他们的态度；同时让每个角色展现**自己的性格与目的**，而不是一上来就众星捧月地讨好玩家。',
                p3: '**初始选项**: 给出三个玩家可以采取的行动选项',
            };
    }
};

// 鲁棒解析 AI 世界观生成结果。
// 兼容三种情况：① 期望的「标题：xxx === 正文」分隔格式；② 模型不听话仍吐 JSON
// （含被截断的残缺 JSON）；③ 完全无结构的纯文本。任何情况都不把脏标记露给用户。
const parseWorldGen = (raw: string): { title: string; worldSetting: string } => {
    let text = raw.trim();
    // 去掉可能的代码块围栏
    text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim();

    let title = '';
    let worldSetting = '';

    // 情况②：看起来像 JSON（即使被截断）—— 用正则抠字段，不依赖 JSON.parse
    if (/"?worldSetting"?\s*:/.test(text) || /^\s*\{/.test(text)) {
        const tMatch = text.match(/"?title"?\s*:\s*"((?:[^"\\]|\\.)*)"/);
        // worldSetting 可能未闭合（被截断），所以允许匹配到结尾。失败兜底：从 worldSetting": " 之后切到末尾，剥掉可能的尾闭合符号。
        const wMatch = text.match(/"?worldSetting"?\s*:\s*"((?:[^"\\]|\\.)*?)(?:"\s*[},]|"\s*$|$)/);
        if (tMatch) title = tMatch[1];
        if (wMatch) {
            worldSetting = wMatch[1];
        } else {
            // 极端情况（尾部孤反斜杠等导致整段 wMatch 直接 null）：粗暴 slice 把 worldSetting": " 之后的尾巴当原文，杜绝 title 抠到但正文空的回归。
            const tailIdx = text.search(/"?worldSetting"?\s*:\s*"/);
            if (tailIdx >= 0) {
                worldSetting = text.slice(tailIdx).replace(/^"?worldSetting"?\s*:\s*"/, '').replace(/\\?"?\s*\}?\s*$/, '');
            }
        }
        // 还原被转义的字符：单次扫描，避免 `\\n`（被转义的反斜杠 + 字面 n）被先一步替换成 `\` + 换行。\\uXXXX 也顺手解码。
        const unescape = (s: string) => s
            .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
            .replace(/\\(["\\nt])/g, (_, c) => c === 'n' ? '\n' : c === 't' ? '\t' : c);
        title = unescape(title);
        worldSetting = unescape(worldSetting);
        // 只在 worldSetting 真抠到时早退，否则继续落到下面的原文 parser——避免 title 抠到、正文空时返回半截结果。
        if (worldSetting) return { title: title.trim(), worldSetting: worldSetting.trim() };
    }

    // 情况①：分隔符格式
    const titleMatch = text.match(/^\s*(?:标题|title)\s*[:：]\s*(.+)$/im);
    if (titleMatch) {
        title = titleMatch[1].trim().replace(/^[《"']|[》"']$/g, '');
        text = text.replace(titleMatch[0], '').trim();
    }
    // 去掉分隔线与可能的「世界观/正文」标签
    text = text.replace(/^\s*[=\-—]{2,}\s*$/m, '').trim();
    text = text.replace(/^\s*(?:世界观设定|世界观|正文|lore)\s*[:：]?\s*/i, '').trim();

    worldSetting = text;
    return { title: title.trim(), worldSetting: worldSetting.trim() };
};

// 按存档解析当前生效的骰子机制：coc7/dnd5e 用固定机制，freeform 用存档自定义或默认 d20
const resolveDiceConfig = (game: Pick<GameSession, 'ruleSystem' | 'diceConfig'>): DiceConfig => {
    const sys = game.ruleSystem || 'freeform';
    if (sys !== 'freeform') return RULE_SYSTEMS[sys].dice;
    return game.diceConfig || DEFAULT_DICE_CONFIG;
};

// --- Markdown Renderer Component ---
const GameMarkdown: React.FC<{ content: string, theme: any, customStyle?: { fontSize: number, color: string } }> = ({ content, theme, customStyle }) => {
    // Helper: Parse Inline Styles (**bold**, *italic*, `code`)
    const parseInline = (text: string) => {
        const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
        return parts.map((part, i) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={i} className={`font-bold ${theme.accent}`}>{part.slice(2, -2)}</strong>;
            }
            if (part.startsWith('*') && part.endsWith('*')) {
                return <em key={i} className="italic opacity-70 text-[95%] mx-0.5">{part.slice(1, -1)}</em>;
            }
            if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={i} className="bg-black/20 px-1 py-0.5 rounded font-mono text-[0.9em] opacity-90 mx-0.5">{part.slice(1, -1)}</code>;
            }
            return <span key={i}>{part}</span>;
        });
    };

    // Split by newlines to handle blocks
    const lines = content.split('\n');
    
    // Dynamic Style Object
    const styleObj = {
        fontSize: customStyle ? `${customStyle.fontSize}px` : undefined,
        color: customStyle?.color || undefined
    };

    return (
        <div className="space-y-[0.5em] text-justify leading-relaxed" style={styleObj}>
            {lines.map((line, i) => {
                const trimmed = line.trim();
                if (!trimmed) return <div key={i} className="h-[0.5em]"></div>;
                
                // Headers (Relative sizing)
                if (trimmed.startsWith('### ')) return <h3 key={i} className={`text-[1.1em] font-bold uppercase tracking-wider mt-[0.5em] mb-[0.2em] opacity-90 ${theme.accent}`}>{trimmed.slice(4)}</h3>;
                if (trimmed.startsWith('## ')) return <h3 key={i} className="text-[1.25em] font-bold mt-[0.6em] mb-[0.3em] opacity-95">{trimmed.slice(3)}</h3>;
                if (trimmed.startsWith('# ')) return <h3 key={i} className="text-[1.5em] font-black mt-[0.8em] mb-[0.5em] text-center border-b border-current pb-2 opacity-90">{trimmed.slice(2)}</h3>;
                
                // Blockquotes
                if (trimmed.startsWith('> ')) return <div key={i} className="border-l-2 border-current pl-3 py-1 my-2 italic opacity-70 text-[0.9em] bg-black/5 rounded-r">{parseInline(trimmed.slice(2))}</div>;
                
                // Lists
                if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
                    return <div key={i} className="flex gap-2 pl-1"><span className={`opacity-50 ${theme.accent}`}>•</span><span>{parseInline(trimmed.slice(2))}</span></div>;
                }

                // Numbered list
                const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
                if (numMatch) {
                    return <div key={i} className="flex gap-2 pl-1"><span className={`font-mono opacity-60 ${theme.accent}`}>{numMatch[1]}.</span><span>{parseInline(numMatch[2])}</span></div>;
                }

                // Separator
                if (trimmed === '---' || trimmed === '***') {
                    return <div key={i} className="h-px bg-current opacity-20 my-[1em]"></div>;
                }

                // Standard Paragraph
                return <div key={i}>{parseInline(trimmed)}</div>;
            })}
        </div>
    );
};

// 五档检定结果的徽章配色：大成功/大失败突出显示，其余按成功度渐变。
// 没有 tier（骰了但没被 AI 采纳为正式判定）统一用灰色淡化样式，跟"真的判定过"区分开，不能跟着套成功/失败的颜色。
const DICE_TIER_BADGE_STYLE: Record<string, string> = {
    critical_success: 'bg-yellow-500/30 text-yellow-300',
    success: 'bg-emerald-500/20 text-emerald-400',
    partial: 'bg-white/20 text-yellow-500',
    failure: 'bg-orange-500/20 text-orange-400',
    critical_failure: 'bg-red-500/20 text-red-400',
    unadopted: 'bg-white/10 text-white/40',
};
const diceTierBadgeClass = (diceRoll?: GameLog['diceRoll']): string => {
    if (!diceRoll) return '';
    if (diceRoll.tier) return DICE_TIER_BADGE_STYLE[diceRoll.tier];
    return DICE_TIER_BADGE_STYLE.unadopted;
};
// 大成功/大失败徽章出现时"跳"一下，复用现有 pop-in 关键帧（避免改全局 index.html 引入新动画增加合并冲突）
const diceTierBadgeAnim = (diceRoll?: GameLog['diceRoll']): string => {
    if (diceRoll?.tier === 'critical_success' || diceRoll?.tier === 'critical_failure') return 'animate-pop-in';
    return '';
};
// 气泡下方的判定说明小字：判定过的显示"技能·五档标签：代价原因"，没被采纳的骰点显示提示语，
// 没骰点/纯叙事的不显示（调用处已经用 log.diceRoll 判断了）。
const diceOutcomeLine = (diceRoll?: GameLog['diceRoll']): string | null => {
    if (!diceRoll) return null;
    if (diceRoll.tier) {
        const label = CHECK_TIER_LABELS[diceRoll.tier];
        return `${diceRoll.check ? `${diceRoll.check}·` : ''}${label}${diceRoll.outcome ? `：${diceRoll.outcome}` : ''}`;
    }
    return '本回合骰了，但这次行动没有实际风险/冲突，未被采纳为正式判定';
};

// 运势面板：逐人统计本场已采纳的正式判定（tier 存在的骰点），純从 logs 派生，不新增持久化字段。
interface FortuneStat {
    name: string;
    total: number;
    criticalSuccess: number;
    success: number;
    partial: number;
    failure: number;
    criticalFailure: number;
    luckScore: number; // 大成功+2/成功+1/部分成功0/失败-1/大失败-2，按次数归一化，越高越"欧"
}
const computeFortuneStats = (logs: GameLog[]): FortuneStat[] => {
    const map = new Map<string, FortuneStat>();
    for (const log of logs) {
        const tier = log.diceRoll?.tier;
        if (!tier) continue;
        const name = log.speakerName || '玩家';
        if (!map.has(name)) {
            map.set(name, { name, total: 0, criticalSuccess: 0, success: 0, partial: 0, failure: 0, criticalFailure: 0, luckScore: 0 });
        }
        const stat = map.get(name)!;
        stat.total++;
        if (tier === 'critical_success') stat.criticalSuccess++;
        else if (tier === 'success') stat.success++;
        else if (tier === 'partial') stat.partial++;
        else if (tier === 'failure') stat.failure++;
        else if (tier === 'critical_failure') stat.criticalFailure++;
    }
    for (const stat of map.values()) {
        const raw = stat.criticalSuccess * 2 + stat.success - stat.failure - stat.criticalFailure * 2;
        stat.luckScore = stat.total > 0 ? raw / stat.total : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.luckScore - a.luckScore);
};

// 高光时刻：所有大成功/大失败的判定，按时间倒序（最新的在最上面）。
interface HighlightMoment {
    id: string;
    speakerName: string;
    tier: CheckTier;
    check?: string;
    outcome?: string;
    content: string;
    timestamp: number;
}
const computeHighlightMoments = (logs: GameLog[]): HighlightMoment[] => {
    return logs
        .filter(l => l.diceRoll?.tier === 'critical_success' || l.diceRoll?.tier === 'critical_failure')
        .map(l => ({
            id: l.id,
            speakerName: l.speakerName || '玩家',
            tier: l.diceRoll!.tier as CheckTier,
            check: l.diceRoll!.check,
            outcome: l.diceRoll!.outcome,
            content: l.content,
            timestamp: l.timestamp,
        }))
        .reverse();
};

// 给聊天室 OOC prompt 用的一段纯文字总结（谁骰了多少次、大致战绩、本场最欧/最非酋是谁），
// 让角色吐槽时能引用"整场"的运势趋势，而不只是最近 8 条判定的片段视角。
const buildFortuneSummaryText = (logs: GameLog[]): string => {
    const stats = computeFortuneStats(logs);
    if (stats.length === 0) return '（本场还没有正式判定，运势未知）';
    const lines = stats.map(s => {
        const parts: string[] = [];
        if (s.criticalSuccess) parts.push(`大成功×${s.criticalSuccess}`);
        if (s.success) parts.push(`成功×${s.success}`);
        if (s.partial) parts.push(`部分成功×${s.partial}`);
        if (s.failure) parts.push(`失败×${s.failure}`);
        if (s.criticalFailure) parts.push(`大失败×${s.criticalFailure}`);
        return `${s.name}：共${s.total}次判定（${parts.join('、') || '暂无细分'}）`;
    });
    let ranking = '';
    if (stats.length > 1 && stats[0].luckScore !== stats[stats.length - 1].luckScore) {
        ranking = `\n本场目前最欧的是${stats[0].name}，最非酋的是${stats[stats.length - 1].name}。`;
    }
    return lines.join('\n') + ranking;
};

const GameApp: React.FC = () => {
    const { closeApp, characters, userProfile, apiConfig, addToast, updateCharacter, characterGroups } = useOS();
    const [view, setView] = useState<'lobby' | 'create' | 'play'>('lobby');
    const [games, setGames] = useState<GameSession[]>([]);
    const [activeGame, setActiveGame] = useState<GameSession | null>(null);
    const [lobbyPage, setLobbyPage] = useState(0); // 存档大厅分页（每页 5 条）
    
    // Creation State
    const [newTitle, setNewTitle] = useState('');
    const [newWorld, setNewWorld] = useState('');
    const [newTheme, setNewTheme] = useState<GameTheme>('fantasy');
    const [newDmStyle, setNewDmStyle] = useState<DmStyle>('default'); // GM 指令风格：默认/喜剧/恐怖/浪漫
    const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
    const [playerGroupId, setPlayerGroupId] = useState(GROUP_FILTER_ALL); // 邀请队友的分组筛选
    const [isCreating, setIsCreating] = useState(false);
    // 世界观 AI 辅助生成
    const [worldStyle, setWorldStyle] = useState<string>('高奇幻');
    const [worldIdea, setWorldIdea] = useState('');        // 用户额外给的灵感/想法（可选）
    const [worldPacing, setWorldPacing] = useState<'crisis' | 'open'>('crisis'); // 叙事节奏：危机驱动 / 开放式冒险
    const [isGeneratingWorld, setIsGeneratingWorld] = useState(false);
    // 新游戏玩法设置
    const [newDiceDisabled, setNewDiceDisabled] = useState(false);            // 关闭骰子（默认每次直接成功）
    const [newArchiveMode, setNewArchiveMode] = useState<'auto' | 'manual'>('auto');
    const [showArchiveHelp, setShowArchiveHelp] = useState(false);            // 归档模式问号说明
    const [showSheetsInMenu, setShowSheetsInMenu] = useState(false);          // 系统菜单里展开/收起角色数值表
    const [showSheetModal, setShowSheetModal] = useState(false);             // 局内头部「数值表」入口（更显眼）
    // 规则系统选择
    const [newRuleSystem, setNewRuleSystem] = useState<RuleSystemId>('freeform');
    const [newDiceConfig, setNewDiceConfig] = useState<DiceConfig>(DEFAULT_DICE_CONFIG); // 仅 freeform 下可自定义
    const [showCustomDice, setShowCustomDice] = useState(false);
    const [customDiceCount, setCustomDiceCount] = useState(1);
    const [customDiceSides, setCustomDiceSides] = useState(20);
    const [customDiceMode, setCustomDiceMode] = useState<'high-good' | 'low-good'>('high-good');
    // 三种规则系统统一：按本场剧本单独生成的逐角色数值表（AI 生成 + 手动微调），key 为 charId / '__player__'
    const [newCharacterSheets, setNewCharacterSheets] = useState<Record<string, CharacterSheetEntry>>({});
    const [isGeneratingSheets, setIsGeneratingSheets] = useState(false);
    // 自由叙事专属：AI 按本场世界观原创的特殊技能（基础技能固定通用，见 FREEFORM_BASIC_SKILLS）
    const [newFreeformSpecialSkills, setNewFreeformSpecialSkills] = useState<Array<{ key: string; label: string }>>([]);

    // Play State
    const [userInput, setUserInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false); // 自动总结全屏反馈
    const [showArchived, setShowArchived] = useState(false);    // 已归档剧情折叠展开
    const [expandedSummaries, setExpandedSummaries] = useState<Set<string>>(new Set()); // 每段总结对应原文的展开状态
    // 长按多选 → 转发到聊天
    const [selectMode, setSelectMode] = useState(false);
    const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
    const [isForwarding, setIsForwarding] = useState(false);
    const [lastRoll, setLastRoll] = useState<number | null>(null); // 最近一次自动骰点结果（瞬时展示）
    // 本回合骰点已经落库渲染，但 GM 还没推算出是否被采纳为正式检定——这段时间里 diceRoll.tier 是"未知"而非"未采纳"，
    // 用这个 id 让下面两处气泡渲染暂时不显示徽章/判定说明，避免闪一下灰色"未被采纳"再被结果覆盖掉。
    const [pendingRollLogId, setPendingRollLogId] = useState<string | null>(null);
    const [lastTokenUsage, setLastTokenUsage] = useState<{prompt?: number, completion?: number, total: number} | null>(null);
    const [totalTokensUsed, setTotalTokensUsed] = useState(0);
    
    // [FIX] Use Container Ref instead of Element Ref for safer scrolling
    const logsContainerRef = useRef<HTMLDivElement>(null);

    // 长按删除存档卡片
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressFired = useRef(false);
    // 长按日志进入多选
    const logPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // UI Toggles
    const [showSystemMenu, setShowSystemMenu] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [isArchiving, setIsArchiving] = useState(false);
    const [showTools, setShowTools] = useState(false); // Default hidden
    const [showParty, setShowParty] = useState(true);  // Default visible
    const [selectedStatusCharId, setSelectedStatusCharId] = useState<string>('__player__'); // Stats HUD 当前显示谁的状态，点头像切换
    const [playSubView, setPlaySubView] = useState<'game' | 'chatroom'>('game'); // 局内全屏切换：剧情 vs 聊天室（皮下吐槽），不是弹窗
    const [oocInput, setOocInput] = useState('');
    const [isOocLoading, setIsOocLoading] = useState(false);
    const [selectedOocId, setSelectedOocId] = useState<string | null>(null);
    const [oocModalType, setOocModalType] = useState<'none' | 'options' | 'edit'>('none');
    const [editOocContent, setEditOocContent] = useState('');
    const oocPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [oocSelectMode, setOocSelectMode] = useState(false);          // 聊天室长按多选 → 批量删除/转发到聊天
    const [selectedOocIds, setSelectedOocIds] = useState<Set<string>>(new Set());
    const [isOocForwarding, setIsOocForwarding] = useState(false);
    const [oocReplyingTo, setOocReplyingTo] = useState<{ id: string; content: string; name: string } | null>(null); // 玩家引用回复某条 OOC 消息
    const [uiSettings, setUiSettings] = useState<{fontSize: number, color: string}>({ fontSize: 14, color: '' });
    const [showStatsModal, setShowStatsModal] = useState(false);        // 运势面板/高光时刻 Modal
    const [statsTab, setStatsTab] = useState<'fortune' | 'highlights'>('fortune'); // 运势面板内 tab

    // SAN Lock: Sync from activeGame on load
    const [sanityLocked, setSanityLocked] = useState(false);
    useEffect(() => {
        if (activeGame) setSanityLocked(!!activeGame.sanityLocked);
    }, [activeGame?.id]);

    useEffect(() => {
        loadGames();
    }, []);

    // 删除/新增存档后，把页码钳制在有效范围内
    const LOBBY_PAGE_SIZE = 5;
    useEffect(() => {
        const maxPage = Math.max(0, Math.ceil(games.length / LOBBY_PAGE_SIZE) - 1);
        if (lobbyPage > maxPage) setLobbyPage(maxPage);
    }, [games.length, lobbyPage]);

    // [FIX] Updated Auto-scroll logic: Use scrollTop on container
    useEffect(() => {
        if (view === 'play' && logsContainerRef.current) {
            // Use setTimeout to ensure render is complete, allowing smooth scroll to new bottom
            setTimeout(() => {
                if (logsContainerRef.current) {
                    logsContainerRef.current.scrollTo({
                        top: logsContainerRef.current.scrollHeight,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }
    }, [activeGame?.logs, view, isTyping]);

    const loadGames = async () => {
        const list = await DB.getAllGames();
        setGames(list.sort((a,b) => b.lastPlayedAt - a.lastPlayedAt));
    };

    // --- Helper: Robust API Call ---
    const fetchGameAPI = async (prompt: string, maxTokens: number = 8000) => {
        const response = await fetch(`${apiConfig.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.apiKey}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.9, 
                max_tokens: maxTokens,
                stream: false
            })
        });

        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);

        const text = await response.text();
        let json: any;
        try {
            json = JSON.parse(text);
        } catch {
            // Try stripping "data: " prefix (common in proxy misconfigurations)
            const cleaned = text.replace(/^data: /, '').trim();
            try {
                json = JSON.parse(cleaned);
            } catch {
                // Detect HTML responses
                if (text.trimStart().startsWith('<')) {
                    throw new Error('API返回了HTML而非JSON，请检查API地址是否正确');
                }
                throw new Error(`API返回了无法解析的格式: ${text.slice(0, 100)}`);
            }
        }

        if (json.usage?.total_tokens) {
            const usage = {
                prompt: json.usage.prompt_tokens || undefined,
                completion: json.usage.completion_tokens || undefined,
                total: json.usage.total_tokens
            };
            setLastTokenUsage(usage);
            setTotalTokensUsed(prev => prev + json.usage.total_tokens);
        }

        return json;
    };

    // --- Helper: Build Synchronized Context (Neural Link) ---
    const buildSyncContext = async (players: CharacterProfile[]) => {
        let fullContext = "";

        // [优化] 多人同场时，把"用户档案 / 共有世界观 / 被多名角色挂载的世界书"提取到顶部
        // 只铺一次，避免每个角色块里重复贴同一份世界书（去重，省 token 也防串台）。
        const sharedScene = ContextBuilder.buildGroupSharedScene(players, userProfile);
        if (sharedScene.text) {
            fullContext += `${sharedScene.text}\n`;
        }

        for (const p of players) {
            // 1. Base Context (Identity & Worldview)
            // [优化] 记忆读取：跑团多人同场，不再倾倒每个角色逐日的详细日记（极易让 LLM 把
            //   A 的记忆安到 B 头上 = 串台）。改为 includeDetailedMemories=false（仅长期核心记忆）
            //   + 下方按需注入的记忆宫殿向量召回（只取与当前情境相关的片段）。
            //   同时跳过共享场景里已铺过的用户档案 / 世界书 / 世界观，彻底去重。
            await injectMemoryPalace(p);
            const core = ContextBuilder.buildCoreContext(p, userProfile, false, undefined, {
                skipUserProfile: true,
                skipWorldview: sharedScene.worldviewIsShared,
                skipWorldbookIds: sharedScene.sharedWorldbookIds,
            });
            fullContext += `\n<<< 角色档案: ${p.name} (ID: ${p.id}) >>>\n${core}\n`;

            // 记忆宫殿召回（includeDetailedMemories=false 时 buildCoreContext 不会自动带，这里按需补回）
            // [防串台] 召回文本自带的标题是泛指的"你脑海中浮现…"，多角色同场时"你"会混淆。
            //   这里用显式归属把它锁死到当前角色名下，并提醒 LLM 严禁挪用给别人。
            if (p.memoryPalaceEnabled && p.memoryPalaceInjection && p.memoryPalaceInjection.trim()) {
                fullContext += `\n【注意：以下记忆宫殿召回【仅属于 ${p.name}】，是 TA 一个人的私人记忆，绝不可当成其他角色的经历或挪用给别人】\n`;
                fullContext += `${p.memoryPalaceInjection}\n`;
                fullContext += `【${p.name} 的私人记忆结束】\n`;
            }

            // 2. Neural Link: Private Chat Sync
            try {
                const msgs = await DB.getMessagesByCharId(p.id, true);
                const privateMsgs = msgs.filter(m => !m.groupId); // Only private chats (Neural Link needs full history)
                
                const lastMsg = privateMsgs[privateMsgs.length - 1];
                const now = Date.now();
                let status = "普通";
                let gapDesc = "未知";
                
                if (lastMsg) {
                    const diffMins = (now - lastMsg.timestamp) / 1000 / 60;
                    if (diffMins < 60) {
                        gapDesc = `刚刚 (${Math.floor(diffMins)}分钟前)`;
                        status = "热恋/熟络 (Hot)";
                    } else if (diffMins < 24 * 60) {
                        gapDesc = `今天 (${Math.floor(diffMins/60)}小时前)`;
                        status = "正常 (Normal)";
                    } else {
                        const days = Math.floor(diffMins / (24 * 60));
                        gapDesc = `${days}天前`;
                        status = "疏远 (Cold)";
                    }
                    
                    // Get last 8 messages for context
                    const recentLog = privateMsgs.slice(-8).map(m => 
                        `[${m.role === 'user' ? 'Me' : p.name}]: ${m.content.substring(0, 40).replace(/\n/g, ' ')}`
                    ).join('\n');
                    
                    fullContext += `
=== 神经链接 (Neural Link): 私聊记忆同步 ===
该角色与玩家的【私聊状态】：${gapDesc}
关系温度: ${status}
最近私聊话题 (作为后台记忆，不要直接复述，但要影响你的态度):
${recentLog}

【GM强制指令 (Meta Instruction)】: 
1. **打破第四面墙**: 允许角色表现出“正在和用户一起玩游戏”的意识。
2. **关系继承**: 
   - 如果状态是"Hot"，跑团时要更有默契，可以吐槽“刚才私聊时你不是这么说的”。
   - 如果状态是"Cold"，跑团时可以表现得生疏、傲娇或抱怨“好久不见怎么突然拉我来冒险”。
   - **绝对禁止**像陌生人一样对待玩家。你们是老相识。
=====================================\n`;
                } else {
                    fullContext += `[神经链接: 无私聊记录] (视为初次见面)\n`;
                }
            } catch (e) {
                console.error("Sync failed for", p.name, e);
            }
            fullContext += `<<< 档案结束 >>>\n`;
        }
        return fullContext;
    };

    // --- AI 世界观生成 (帮想不出剧本的用户起一个设定) ---
    const handleGenerateWorld = async () => {
        if (!apiConfig.apiKey) {
            addToast('请先配置 API Key', 'error');
            return;
        }
        setIsGeneratingWorld(true);
        try {
            // [鲁棒性] 改用带分隔符的纯文本格式而非 JSON——即使被截断也能干净解析；
            // 不再限制字数，给足 token 防止半路砍断。
            const pacingTask = worldPacing === 'open'
                ? '<世界观正文。请写充分、生动，篇幅自由不设上限，包含：时代/地点背景与基调氛围、这个世界日常的运转方式与生活质感、登场角色（不预设人数与关系）的处境与动机、一两个可长期探索的悬念或势力。这是开放式冒险，不需要设置紧迫的核心危机，重点是让世界耐逛、经得起慢慢晃悠，不要写死结局。>'
                : '<世界观正文。请写充分、生动，篇幅自由不设上限，包含：时代/地点背景与基调氛围、当前世界的核心矛盾或危机、登场角色（不预设人数与关系）的处境与初始目标钩子、一两个可探索的悬念或势力。留足玩家发挥空间，不要写死结局。>';
            const prompt = `你是一位资深的 TRPG（桌面跑团）剧本设计师。请按照指定风格，原创一个适合开团的世界观设定。
**风格基调**: ${worldStyle}
**叙事节奏**: ${worldPacing === 'open' ? '开放式冒险——不强求紧迫的核心危机，重点是世界本身好逛、细节扎实，节奏可以松散、生活化' : '危机驱动——世界当下有明确的核心矛盾或危机，作为冒险的主线张力'}
${worldIdea.trim() ? `**玩家的灵感/想法（请务必围绕它发挥）**: ${worldIdea.trim()}` : ''}

请严格按下面的纯文本格式输出，**不要用 JSON，不要代码块，不要额外说明**：

标题：<一个有吸引力的剧本标题>
===
${pacingTask}`;

            const data = await fetchGameAPI(prompt, 6000);
            const raw = (extractContent(data) || '').trim();
            if (!raw) throw new Error('AI 返回了空响应');

            const parsed = parseWorldGen(raw);
            if (parsed.worldSetting) setNewWorld(parsed.worldSetting);
            if (parsed.title && !newTitle.trim()) setNewTitle(parsed.title);
            addToast('世界观已生成，可继续编辑', 'success');
        } catch (e: any) {
            addToast(`生成失败: ${e.message}`, 'error');
        } finally {
            setIsGeneratingWorld(false);
        }
    };

    // --- AI 生成逐角色数值表（三种规则系统统一；方案B）---
    // 按本场剧本单独生成：让 LLM 参考角色的性格设定+长期记忆分配数值，而非固定模板，
    // 这样"设定上弱气的角色"力量数值自然会偏低，符合真实跑团里"角色卡贴人设"的体验。
    // 自由叙事没有固定技能表，额外让 LLM 按世界观原创 3~5 个"特殊技能"（基础技能固定通用）。
    const handleGenerateCharacterSheets = async () => {
        if (!apiConfig.apiKey) {
            addToast('请先配置 API Key', 'error');
            return;
        }
        if (!newWorld.trim()) {
            addToast('请先填写或生成世界观设定', 'error');
            return;
        }
        if (selectedPlayers.size === 0) {
            addToast('请先选择队友', 'error');
            return;
        }
        setIsGeneratingSheets(true);
        try {
            const players = characters.filter(c => selectedPlayers.has(c.id));
            const subjects = [
                { id: '__player__', name: userProfile.name, profileText: `[玩家本人]\n${userProfile.bio || '无补充设定'}` },
                ...players.map(p => ({
                    id: p.id,
                    name: p.name,
                    profileText: ContextBuilder.buildRoleSettingsContext(p, { skipMemories: false }),
                })),
            ];
            const bySubjectId = new Map(subjects.map(s => [s.id, s.name]));

            if (newRuleSystem === 'freeform') {
                const prompt = buildFreeformCharacterSheetPrompt(newWorld, subjects, newFreeformSpecialSkills);
                const data = await fetchGameAPI(prompt, 4000);
                const rawContent = extractContent(data);
                if (!rawContent) throw new Error('AI 返回了空响应');
                const res = extractJson(rawContent);
                if (!res || !Array.isArray(res.sheets)) throw new Error('未能解析出数值表');

                const specialSkills: Array<{ key: string; label: string }> = Array.isArray(res.specialSkills)
                    ? res.specialSkills.filter((s: any) => s?.key && s?.label).slice(0, 5)
                    : [];
                const validSkillKeys = new Set([...FREEFORM_BASIC_SKILLS.map(s => s.key), ...specialSkills.map(s => s.key)]);
                const nextSheets: Record<string, CharacterSheetEntry> = {};
                for (const sheet of res.sheets) {
                    const name = bySubjectId.get(sheet.id);
                    if (!name) continue;
                    const skills: Record<string, number> = {};
                    for (const [k, v] of Object.entries(sheet.skills || {})) {
                        if (validSkillKeys.has(k)) skills[k] = v as number;
                    }
                    nextSheets[sheet.id] = { name, characteristics: {}, skills, note: sheet.note || undefined };
                }
                if (Object.keys(nextSheets).length === 0) throw new Error('未能解析出有效的角色数值');
                setNewFreeformSpecialSkills(specialSkills);
                setNewCharacterSheets(nextSheets);
                addToast('角色数值表已生成，可手动微调', 'success');
            } else {
                const sys = RULE_SYSTEMS[newRuleSystem];
                const prompt = buildCharacterSheetPrompt(sys, newWorld, subjects);
                const data = await fetchGameAPI(prompt, 4000);
                const rawContent = extractContent(data);
                if (!rawContent) throw new Error('AI 返回了空响应');
                const res = extractJson(rawContent);
                if (!res || !Array.isArray(res.sheets)) throw new Error('未能解析出数值表');

                const validCharKeys = new Set((sys.characteristics || []).map(c => c.key));
                const validSkillKeys = new Set((sys.skills || []).map(s => s.key));
                const pickValid = (obj: Record<string, number> | undefined, valid: Set<string>) => {
                    const out: Record<string, number> = {};
                    for (const [k, v] of Object.entries(obj || {})) {
                        if (valid.has(k)) out[k] = v;
                    }
                    return out;
                };
                const nextSheets: Record<string, CharacterSheetEntry> = {};
                for (const sheet of res.sheets) {
                    const name = bySubjectId.get(sheet.id);
                    if (!name) continue; // 忽略 LLM 编出来的不存在 id，防止脏数据
                    nextSheets[sheet.id] = {
                        name,
                        // 只保留当前规则系统本身的属性/技能 key，防止别的规则系统数据混进来
                        characteristics: pickValid(sheet.characteristics, validCharKeys),
                        skills: pickValid(sheet.skills, validSkillKeys),
                        note: sheet.note || undefined,
                    };
                }
                if (Object.keys(nextSheets).length === 0) throw new Error('未能解析出有效的角色数值');
                setNewCharacterSheets(nextSheets);
                addToast('角色数值表已生成，可手动微调', 'success');
            }
        } catch (e: any) {
            addToast(`生成失败: ${e.message}`, 'error');
        } finally {
            setIsGeneratingSheets(false);
        }
    };

    // 手动微调某个角色某一项属性/技能的数值
    const updateSheetValue = (subjectId: string, kind: 'characteristics' | 'skills', key: string, value: number) => {
        setNewCharacterSheets(prev => {
            const entry = prev[subjectId];
            if (!entry) return prev;
            return { ...prev, [subjectId]: { ...entry, [kind]: { ...entry[kind], [key]: value } } };
        });
    };

    // --- Creation Logic ---
    const handleCreateGame = async () => {
        if (!newTitle.trim() || !newWorld.trim() || selectedPlayers.size === 0) {
            addToast('请填写完整信息并选择至少一名角色', 'error');
            return;
        }
        
        if (!apiConfig.apiKey) {
            addToast('请先配置 API Key 以生成序章', 'error');
            return;
        }

        setIsCreating(true);

        try {
            const tempId = `game-${Date.now()}`;
            const players = characters.filter(c => selectedPlayers.has(c.id));
            
            // Build Context with Sync
            const playerContext = await buildSyncContext(players);

            // Generate Prologue Prompt
            const activeDice = newRuleSystem === 'freeform' ? newDiceConfig : RULE_SYSTEMS[newRuleSystem].dice;
            // 自由叙事的"规则系统定义"是固定基础技能 + 本场原创的特殊技能拼在一起，用于渲染数值表文本
            const ruleSystemDef = newRuleSystem === 'freeform'
                ? { ...RULE_SYSTEMS.freeform, skills: [...FREEFORM_BASIC_SKILLS, ...newFreeformSpecialSkills] }
                : RULE_SYSTEMS[newRuleSystem];
            const hasSheets = Object.keys(newCharacterSheets).length > 0;
            const ruleSystemBlock = `**规则系统**: ${ruleSystemDef.name}（${ruleSystemDef.tagline}）${hasSheets ? formatCharacterSheetsBlock(ruleSystemDef, newCharacterSheets) : ''}`;
            const prologueTask = buildPrologueStyleTask(newDmStyle);
            const prompt = `### TRPG 序章生成 (Game Start)
**剧本标题**: ${newTitle}
**世界观设定**: ${newWorld}
${ruleSystemBlock}
**玩家**: ${userProfile.name}
**队友**: ${players.map(p => p.name).join(', ')}

### 角色数据 (包含私聊记忆)
${playerContext}

### 任务
你现在是 **Game Master (GM)**，本场的 DM 风格是「${DM_STYLE_META[newDmStyle].label}」：${DM_STYLE_META[newDmStyle].desc}
请按这个风格为这个冒险故事生成一个**精彩的开场 (Prologue)**。
1. ${prologueTask.p1}
2. ${prologueTask.p2}
3. ${prologueTask.p3}${newDiceDisabled ? '（本场未启用骰子，玩家行动默认顺利成功，选项可以是各种有趣的方向）' : `（每个选项玩家执行时都会自动骰 ${activeDice.label} 判定，因此选项应是"有成败风险的尝试"而非必然成功的动作）`}。

### 一致性自检 (Consistency Check)
输出前，请在心里核对：每个角色的台词/行为是否**只**来自 TA 自己的"角色档案"（性格、记忆、印象）？严禁把某个角色的记忆、口癖或人设安到另一个角色身上（防止"串台"）。

### 输出格式 (Strict JSON)
{
  "gm_narrative": "序章剧情描述...",
  "characters": [
    { "charId": "角色ID", "action": "初始动作", "dialogue": "第一句台词" }
  ],
  "startLocation": "起始地点名称",
  "suggested_actions": [
    { "label": "选项1 (中立/正直/推进剧情)", "type": "neutral" },
    { "label": "选项2 (乐子人/搞怪/出其不意)", "type": "chaotic" },
    { "label": "选项3 (邪恶/激进/贪婪)", "type": "evil" }
  ]
}`;

            const data = await fetchGameAPI(prompt);
            const rawContent = extractContent(data);
            if (!rawContent) throw new Error('AI 返回了空响应');

            // Robust JSON extraction: handles code fences, trailing commas, extra prose
            const res = extractJson(rawContent);

            const initialLogs: GameLog[] = [];

            if (res) {
                // Structured response - use parsed JSON
                initialLogs.push({
                    id: 'init-gm',
                    role: 'gm',
                    content: `### 序章 · ${newTitle}\n\n${res.gm_narrative || '冒险开始了...'}`,
                    timestamp: Date.now()
                });

                if (Array.isArray(res.characters)) {
                    for (const charAct of res.characters) {
                        // 优先用 id 精确匹配，name 匹配仅兜底
                        const char = players.find(p => p.id === charAct.charId) || players.find(p => p.name === charAct.charId);
                        if (char) {
                            initialLogs.push({
                                id: `init-char-${char.id}`,
                                role: 'character',
                                speakerName: char.name,
                                content: `*${charAct.action || ''}* \n"${charAct.dialogue || ''}"`,
                                timestamp: Date.now()
                            });
                        }
                    }
                }
            } else {
                // JSON parse completely failed - use raw text as GM narrative anyway
                console.warn('[GameApp] JSON extraction failed, using raw text as narrative');
                initialLogs.push({
                    id: 'init-gm',
                    role: 'gm',
                    content: `### 序章 · ${newTitle}\n\n${rawContent}`,
                    timestamp: Date.now()
                });
            }

            const newGame: GameSession = {
                id: tempId,
                title: newTitle,
                theme: newTheme,
                worldSetting: newWorld,
                playerCharIds: Array.from(selectedPlayers),
                logs: initialLogs,
                status: {
                    location: res?.startLocation || 'Unknown',
                    health: 100,
                    sanity: 100,
                    gold: 0,
                    inventory: []
                },
                // 逐人 HP/SAN：每个人各自 100 起步，玩家本人也算一份（__player__）
                characterVitals: {
                    __player__: { health: 100, sanity: 100 },
                    ...Object.fromEntries(Array.from(selectedPlayers).map(id => [id, { health: 100, sanity: 100 }])),
                },
                suggestedActions: res?.suggested_actions || [],
                diceDisabled: newDiceDisabled,
                archiveMode: newArchiveMode,
                dmStyle: newDmStyle,
                worldPacing,
                ruleSystem: newRuleSystem,
                diceConfig: newRuleSystem === 'freeform' ? newDiceConfig : undefined,
                freeformSpecialSkills: newRuleSystem === 'freeform' && newFreeformSpecialSkills.length > 0 ? newFreeformSpecialSkills : undefined,
                characterSheets: hasSheets ? newCharacterSheets : undefined,
                createdAt: Date.now(),
                lastPlayedAt: Date.now()
            };

            await DB.saveGame(newGame);
            setGames(prev => [newGame, ...prev]);
            setActiveGame(newGame);
            setView('play');

            // Reset form
            setNewTitle('');
            setNewWorld('');
            setWorldIdea('');
            setNewDiceDisabled(false);
            setNewArchiveMode('auto');
            setNewDmStyle('default');
            setSelectedPlayers(new Set());
            setNewRuleSystem('freeform');
            setNewDiceConfig(DEFAULT_DICE_CONFIG);
            setShowCustomDice(false);
            setNewFreeformSpecialSkills([]);
            setNewCharacterSheets({});

        } catch (e: any) {
            addToast(`创建失败: ${e.message}`, 'error');
        } finally {
            setIsCreating(false);
        }
    };

    // --- SAN Lock Toggle ---
    const toggleSanityLock = async () => {
        const newVal = !sanityLocked;
        setSanityLocked(newVal);
        if (activeGame) {
            const updated = { ...activeGame, sanityLocked: newVal };
            setActiveGame(updated);
            await DB.saveGame(updated);
            addToast(newVal ? 'SAN 值已锁定' : 'SAN 值已解锁', 'info');
        }
    };

    // --- Dice Toggle (关闭后行动不再自动骰 D20) ---
    const toggleDice = async () => {
        if (!activeGame) return;
        const newDisabled = !activeGame.diceDisabled;
        const updated = { ...activeGame, diceDisabled: newDisabled };
        setActiveGame(updated);
        await DB.saveGame(updated);
        addToast(newDisabled ? '已关闭骰子，行动不再骰点' : '已开启骰子', 'info');
    };

    const toggleOoc = async () => {
        if (!activeGame) return;
        const newEnabled = !activeGame.oocEnabled;
        const updated = { ...activeGame, oocEnabled: newEnabled };
        setActiveGame(updated);
        await DB.saveGame(updated);
        addToast(newEnabled ? '已开启皮下吐槽（每回合结束会给每个角色各自单独调一次 LLM，不进主线）' : '已关闭皮下吐槽', 'info');
    };

    const toggleOocCallMode = async () => {
        if (!activeGame) return;
        const newMode: 'individual' | 'batch' = (activeGame.oocCallMode || 'individual') === 'individual' ? 'batch' : 'individual';
        const updated = { ...activeGame, oocCallMode: newMode };
        setActiveGame(updated);
        await DB.saveGame(updated);
        addToast(newMode === 'batch' ? '聊天室已切换为「一次性生成」（省调用次数，速度更快）' : '聊天室已切换为「逐角色独立生成」（防串记忆，更准确）', 'info');
    };

    // 聊天室（皮下吐槽）：主线回合结束后异步、独立生成一批场外吐槽。完全不进主线 prompt/context，
    // 死亡/昏迷角色也能"场外发言"。失败静默即可，绝不能拖累或打断主线剧情。
    // 提供两种生成模式（oocCallMode）：
    //   - 'individual'（默认）：每个角色单独调用一次 LLM（Promise.all 并发），复用 buildSyncContext([c])
    //     拿到该角色自己完整的人设+私聊神经链接+记忆宫殿召回，互不可见对方细节，天然防串记忆；
    //     代价是调用次数多，这一批内角色互相看不到"对方这一轮刚说的话"（只能看到上一轮及之前的 oocLogs）。
    //   - 'batch'：一次调用生成所有人发言（省调用次数，速度更快），prompt 里明确列出每个角色的完整人设/私聊/记忆，
    //     并用限定语严格要求不得把A的记忆/人设安到B头上；靠 LLM 自律隔离，天然弱一些，但仍好过老版本不注入人设的混乱。
    // 玩家不进入这个生成循环——AI 不代替真人发言，玩家只能通过 handleOocSend 手动发言。
    const runOocIfNeeded = async (game: GameSession) => {
        if (!game.oocEnabled) return;
        const allChars = characters.filter(c => game.playerCharIds.includes(c.id));
        if (allChars.length === 0) return;
        const callMode = game.oocCallMode || 'individual';
        // 引用标签匹配/清理，跟私聊 applyAssistantPostProcessing.ts 同一套写法，只是候选池换成 oocLogs。
        const QUOTE_RE_DOUBLE = /\[\[(?:QU[OA]TE|引用)[：:]\s*([\s\S]*?)\]\]/;
        const QUOTE_RE_SINGLE = /\[(?:QU[OA]TE|引用)[：:]\s*([^\]]*)\]/;
        const QUOTE_CLEAN_DOUBLE = /\[\[(?:QU[OA]TE|引用)[：:][\s\S]*?\]\]/g;
        const QUOTE_CLEAN_SINGLE = /\[(?:QU[OA]TE|引用)[：:][^\]]*\]/g;
        // 把模型引用标签里的原文片段，匹配回聊天室已有记录里的那条消息（内容匹配，不是模型直接给ID）；
        // 匹配不到就兜底到最近一条记录，避免引用标签解析失败导致整条丢弹或者引用悬空。
        const resolveOocQuoteTarget = (
            quotedTextRaw: string,
            priorLogs: NonNullable<GameSession['oocLogs']>
        ): { id: string; content: string; name: string } | undefined => {
            const raw = (quotedTextRaw || '').trim().replace(/(?:[…⋯]+|\.{3,})$/, '').trim();
            if (!raw || priorLogs.length === 0) return undefined;
            const reversed = priorLogs.slice().reverse();
            const target = reversed.find(o => o.content.includes(raw))
                || (raw.length > 10 ? reversed.find(o => o.content.includes(raw.slice(0, 10))) : undefined)
                || priorLogs[priorLogs.length - 1];
            const truncated = target.content.length > 10 ? target.content.slice(0, 10) + '...' : target.content;
            return { id: target.id, content: truncated, name: target.speakerName };
        };
        try {
            setIsOocLoading(true);
            const deadSet = new Set(game.deadCharIds || []);
            const recentRolls = game.logs.slice(-8)
                .filter(l => l.diceRoll?.tier)
                .map(l => `${l.speakerName || '玩家'}: ${l.diceRoll!.check || '判定'} → ${CHECK_TIER_LABELS[l.diceRoll!.tier!]}${l.diceRoll!.outcome ? `（${l.diceRoll!.outcome}）` : ''}`)
                .join('\n') || '（这几回合没有正式判定）';
            const recentNarrative = game.logs.slice(-6).map(l => `[${l.role}]${l.speakerName ? l.speakerName + ': ' : ''}${l.content}`).join('\n') || '（暂无剧情）';
            const recentOoc = (game.oocLogs || []).slice(-10).map(o => `${o.speakerName}: ${o.content}`).join('\n') || '（还没有人吐槽过）';
            const fortuneSummary = buildFortuneSummaryText(game.logs); // 本场整体运势战绩（区别于上面 recentRolls 只看最近8条）

            let newOocLogs: Array<{ charId: string; speakerName: string; content: string }> = [];

            if (callMode === 'batch') {
                // 一次性生成所有人：明确列出每个角色完整人设/私聊/记忆，prompt 末尾严格限定不可串记忆
                try {
                    const charContexts = await Promise.all(allChars.map(async (c) => {
                        const ctx = await buildSyncContext([c]);
                        const isDead = deadSet.has(c.id);
                        return { id: c.id, name: c.name, context: ctx, isDead };
                    }));
                    const charListSection = charContexts.map(({ name, context, isDead }) =>
                        `## ${name}${isDead ? '（已死亡/昏迷）' : ''}\n${context}`
                    ).join('\n\n');

                    const prompt = `### 聊天室（皮下吐槽）— 一次性生成所有角色发言
你现在不是在扮演这些角色——你要同时为下面列出的每个角色生成他们自己本色的吐槽发言（不是演戏台词，是真实聊天室发消息的语气）。

刚才那一局 TRPG，他们是全情投入、切身在玩（类似戴着 VR 沉浸式玩游戏的状态），不是背台词演戏。现在这一局暂停/告一段落，他们退出了游戏时的专注状态，用各自一直以来说话的语气和口癖，跟一起玩的人随口聊两句刚才那局的事。

**重要（概念纠正，务必遵守）**：
- 他们完全清楚这只是一局游戏，可以正常提"骰点""这局""剧情""TRPG"这些词，没有任何忌讳。
- 但绝对不要说"我刚才扮演的角色""我演的那个人""游戏里的那个我"之类的话——这种说法暗示"主线里的你是另一个被你操控的人格"，这是错的。从头到尾，主线里体验这一切的就是他们自己，没有"演"这一层。
- 语气必须是各自一直以来的性格、口癖、说话方式——这里比主线更放松、更随意，是各自最本色的状态，不是另一套人格。

**严格隔离原则（防串记忆/人设）**：
下面每个角色的人设/记忆/私聊是独立的，**绝对不可以把 A 的记忆、口癖、私聊内容、情感经历安到 B 头上**。
每个人只能基于自己的人设和记忆来吐槽，不能突然表现出只有另一个角色才知道的细节或语气。

### 每个角色的完整人设/记忆/私聊状态（注意隔离，不要串台！）
${charListSection}

### 最近的判定结果（谁骰了什么、多离谱）
${recentRolls}

### 本场整体运势战绩（从头到现在的统计，谁最欧谁最非酋）
${fortuneSummary}

### 刚发生的剧情（仅供吐槽参考，不要续写剧情）
${recentNarrative}

### 聊天室里已经有的记录（避免重复别人说过的话，可以接话）
${recentOoc}

### 写作要求
1. 如果某角色自己骰出的极端结果（大成功/大失败），可以狂喜/难以置信/得意/破防/绝望/自嘲；提到别人的骰点结果，按该角色性格来——可能羡慕、嘲笑、看热闹、安慰，或者"意料之中"地调侃。也可以偶尔提一嘴整场下来自己/别人是欧是非酋。
2. 如果剧情走向让某角色觉得离谱/好笑/尴尬，可以吐槽，也可以玩梗。
3. 可以偶尔把这局的经历和该角色私聊里聊过的事、或该角色自己最近现实里发生的事类比起来吐槽（不用每次都提，想到了才提，别硬凑）。
4. 不是每个人都要开口——如果这几回合对某角色而言很平淡，没什么好说的，可以选择不说话。
5. 一两句话就够，像真实聊天室发消息，不要写成剧情叙述，不要有旁白/星号动作。
6. **【极其重要】如果某个角色想连续发好几条短消息（比真实聊天里常见的那种"一句话没说完又追加一句"），在 content 字符串里插入 JSON 转义换行 "\\n"（反斜杠加n这两个字符，不是真的敲一个回车），每个 "\\n" 会变成一个独立的消息气泡。绝对不要用空格代替换行——空格不会产生新气泡。也绝对不要直接敲真正的换行/回车，那样会破坏 JSON 格式导致整条解析失败。正常句子里的标点不用来分割气泡，请自然使用。
7. 如果想专门接一句"聊天室里已经有的记录"中某人说的具体某句话（而不是泛泛接话），可以在该角色 content 开头加上 [[QUOTE: 被引用的那句话原文]]，这会在UI上显示成对那条消息的引用框。不是每次说话都要引用，只有确实想针对某句话回应时才用；[[QUOTE:...]] 只能出现在 content 最开头。

请仅输出 JSON 数组（不要包含 Markdown 代码块，content 字段内部必须是合法 JSON 字符串，换行只能用 \\n 转义），每个元素格式：
{ "charId": "角色id", "speak": true, "content": "该角色要说的话（speak 为 false 时可以留空）" }

示例：[{"charId":"c1","speak":true,"content":"哈哈我这次居然大成功了！"},{"charId":"c2","speak":false,"content":""}]`;

                    const data = await fetchGameAPI(prompt, 800);
                    const rawContent = extractContent(data);
                    if (!rawContent) return;
                    const res = extractJson(rawContent);
                    if (!Array.isArray(res)) return;
                    newOocLogs = res
                        .filter((item: any) => item.speak === true && typeof item.content === 'string' && item.content.trim() && typeof item.charId === 'string')
                        .map((item: any) => {
                            const char = allChars.find(c => c.id === item.charId);
                            if (!char) return null;
                            return { charId: char.id, speakerName: char.name, content: item.content.trim() };
                        })
                        .filter((r): r is { charId: string; speakerName: string; content: string } => !!r);
                } catch (e: any) {
                    console.warn('[GameApp] batch OOC 生成失败（不影响主线）', e);
                    addToast(`聊天室吐槽生成失败: ${e?.message || '未知错误'}`, 'error');
                    return;
                }
            } else {
                // individual 模式：现有逻辑不变
                const failedNames: string[] = [];
                const results = await Promise.all(allChars.map(async (c) => {
                    try {
                        const charContext = await buildSyncContext([c]);
                        const isDead = deadSet.has(c.id);
                        const prompt = `### 聊天室（皮下吐槽）
你现在不是"在扮演${c.name}"——你就是${c.name}本人，从头到尾没有换过人格。刚才那一局 TRPG，你是全情投入、切身在玩（类似戴着 VR 沉浸式玩游戏的状态），不是背台词演戏。现在这一局暂停/告一段落，你退出了游戏时的专注状态，用你自己一直以来说话的语气和口癖，跟一起玩的人随口聊两句刚才那局的事。

**重要（概念纠正，务必遵守）**：
- 你完全清楚这只是一局游戏，可以正常提"骰点""这局""剧情""TRPG"这些词，没有任何忌讳。
- 但绝对不要说"我刚才扮演的角色""我演的那个人""游戏里的那个我"之类的话——这种说法暗示"主线里的你是另一个被你操控的人格"，这是错的。从头到尾，主线里体验这一切的就是你自己，没有"演"这一层。
- 语气必须是你自己一直以来的性格、口癖、说话方式——这里比主线更放松、更随意，是你最本色的状态，不是另一套人格。

### 你的完整人设/记忆/私聊状态
${charContext}

${isDead ? `### 特殊状态\n你在这局里已经死亡/昏迷了，可以带点"看戏"或"倒霉"的自嘲语气来吐槽。\n\n` : ''}### 最近的判定结果（谁骰了什么、多离谱——包括你自己的）
${recentRolls}

### 本场整体运势战绩（从头到现在的统计，谁最欧谁最非酋）
${fortuneSummary}

### 刚发生的剧情（仅供吐槽参考，不要续写剧情）
${recentNarrative}

### 聊天室里已经有的记录（避免重复别人说过的话，可以接话）
${recentOoc}

### 写作要求
1. 如果是你自己骰出的极端结果（大成功/大失败），可以狂喜/难以置信/得意/破防/绝望/自嘲；提到别人的骰点结果，按你的性格来——可能羡慕、嘲笑、看热闹、安慰，或者"意料之中"地调侃。
2. 如果剧情走向让你觉得离谱/好笑/尴尬，可以吐槽，也可以玩梗。
3. 可以偶尔把这局的经历和你私聊里聊过的事、或你自己最近现实里发生的事类比起来吐槽（不用每次都提，想到了才提，别硬凑）。
4. 不是每次都要开口——如果这几回合很平淡，没什么好说的，可以选择不说话。
5. 一两句话就够，像真实聊天室发消息，不要写成剧情叙述，不要有旁白/星号动作。
6. **【极其重要】如果你想连续发好几条短消息（比真实聊天里常见的那种"一句话没说完又追加一句"），在 content 字符串里插入 JSON 转义换行 "\\n"（反斜杠加n这两个字符，不是真的敲一个回车），每个 "\\n" 会变成一个独立的消息气泡。绝对不要用空格代替换行——空格不会产生新气泡。也绝对不要直接敲真正的换行/回车，那样会破坏 JSON 格式导致整条解析失败。正常句子里的标点不用来分割气泡，请自然使用。
7. 如果想专门接一句"聊天室里已经有的记录"中某人说的具体某句话（而不是泛泛接话），可以在 content 开头加上 [[QUOTE: 被引用的那句话原文]]，这会在UI上显示成对那条消息的引用框。不是每次说话都要引用，只有确实想针对某句话回应时才用；[[QUOTE:...]] 只能出现在 content 最开头。

请仅输出 JSON，不要包含 Markdown 代码块，content 字段内部必须是合法 JSON 字符串（换行只能用 \\n 转义）：
{ "speak": true, "content": "你要说的话（speak 为 false 时可以留空）" }`;

                        const data = await fetchGameAPI(prompt, 400);
                        const rawContent = extractContent(data);
                        if (!rawContent) return null;
                        const res = extractJson(rawContent);
                        if (!res || res.speak === false || typeof res.content !== 'string' || !res.content.trim()) return null;
                        return { charId: c.id, speakerName: c.name, content: res.content.trim() };
                    } catch (e: any) {
                        console.warn(`[GameApp] ${c.name} 皮下吐槽生成失败（不影响主线）`, e);
                        failedNames.push(`${c.name}(${e?.message || '未知错误'})`);
                        return null;
                    }
                }));
                newOocLogs = results.filter((r): r is { charId: string; speakerName: string; content: string } => !!r);
                if (failedNames.length > 0) {
                    addToast(`聊天室吐槽生成失败: ${failedNames.join('、')}`, 'error');
                }
            }

            if (newOocLogs.length === 0) return;

            // 按正常聊天的分段逻辑（ChatParser.chunkText，主线聊天也用它）把每个角色的一整段吐槽
            // 拆成几条自然的短消息，并复用同款「按长度算延迟」逐条落库，让聊天室也有逐条蹦出来的节奏，
            // 不再是一次性甩一大段。角色之间、角色自己的多条之间都按顺序依次出现。
            // allLogsSoFar 随本轮逐条追加，供引用标签解析——这样后发言的角色能引用本轮更早已"说出"的话，
            // 不用等整轮存完才能互相引用。
            const allLogsSoFar: NonNullable<GameSession['oocLogs']> = [...(game.oocLogs || [])];
            for (const r of newOocLogs) {
                // 跟私聊同一套 [[QUOTE: ...]] 标签：解析出引用目标（按内容匹配回聊天室历史），再从正文里剥掉标签。
                let contentForChunk = r.content;
                let replyTarget: { id: string; content: string; name: string } | undefined;
                const quoteMatch = contentForChunk.match(QUOTE_RE_DOUBLE) || contentForChunk.match(QUOTE_RE_SINGLE);
                if (quoteMatch) {
                    replyTarget = resolveOocQuoteTarget(quoteMatch[1], allLogsSoFar);
                    contentForChunk = contentForChunk.replace(QUOTE_CLEAN_DOUBLE, '').replace(QUOTE_CLEAN_SINGLE, '').trim();
                }
                const chunks = ChatParser.chunkText(contentForChunk).filter(c => ChatParser.hasDisplayContent(c));
                const segments = chunks.length > 0 ? chunks : [contentForChunk];
                let pendingReplyTarget = replyTarget; // 只挂到这段话的第一条气泡上，避免每条 chunk 都顶一个引用框
                for (const seg of segments) {
                    const delay = Math.min(Math.max(seg.length * 50, 500), 2000);
                    await new Promise(res => setTimeout(res, delay));
                    const entry = {
                        id: `ooc-${Date.now()}-${Math.random()}`,
                        charId: r.charId,
                        speakerName: r.speakerName,
                        content: seg,
                        timestamp: Date.now(),
                        replyTo: pendingReplyTarget,
                    };
                    pendingReplyTarget = undefined;
                    allLogsSoFar.push(entry);
                    setActiveGame(prev => {
                        if (!prev || prev.id !== game.id) return prev;
                        const updated = { ...prev, oocLogs: [...(prev.oocLogs || []), entry] };
                        DB.saveGame(updated);
                        return updated;
                    });
                }
            }
        } finally {
            setIsOocLoading(false);
        }
    };

    const handleOocSend = async () => {
        if (!activeGame || !oocInput.trim()) return;
        const newLog = {
            id: `ooc-${Date.now()}`,
            charId: '__player__',
            speakerName: userProfile.name,
            content: oocInput.trim(),
            timestamp: Date.now(),
            replyTo: oocReplyingTo || undefined,
        };
        const updated = { ...activeGame, oocLogs: [...(activeGame.oocLogs || []), newLog] };
        setActiveGame(updated);
        setOocInput('');
        setOocReplyingTo(null);
        await DB.saveGame(updated);
    };

    // 长按消息 → "引用" → 把该条摘要存进 oocReplyingTo，下一条发送时带上，跟私聊长按引用交互一致。
    const handleOocQuoteStart = () => {
        if (!activeGame || !selectedOocId) return;
        const target = (activeGame.oocLogs || []).find(o => o.id === selectedOocId);
        if (!target) return;
        const truncated = target.content.length > 10 ? target.content.slice(0, 10) + '...' : target.content;
        setOocReplyingTo({ id: target.id, content: truncated, name: target.speakerName });
        setOocModalType('none');
        setSelectedOocId(null);
    };

    // 聊天室消息长按菜单：跟主线私聊（编辑内容/删除消息）对齐的编辑/删除，直接改 oocLogs 数组落库
    // （聊天室没有独立的消息表，一整局的吐槽记录就是 GameSession.oocLogs 这一个字段）。
    const startOocPress = (id: string) => {
        if (oocSelectMode) return;
        cancelOocPress();
        oocPressTimer.current = setTimeout(() => {
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
            setSelectedOocId(id);
            setOocModalType('options');
        }, 500);
    };
    const cancelOocPress = () => {
        if (oocPressTimer.current) { clearTimeout(oocPressTimer.current); oocPressTimer.current = null; }
    };
    const handleOocEnterSelectionMode = () => {
        if (selectedOocId) {
            setSelectedOocIds(new Set([selectedOocId]));
            setOocSelectMode(true);
            setOocModalType('none');
            setSelectedOocId(null);
        }
    };
    const toggleSelectOoc = (id: string) => {
        setSelectedOocIds(prev => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    };
    const exitOocSelectMode = () => {
        setOocSelectMode(false);
        setSelectedOocIds(new Set());
    };
    const handleOocEditStart = () => {
        if (!activeGame || !selectedOocId) return;
        const target = (activeGame.oocLogs || []).find(o => o.id === selectedOocId);
        if (!target) return;
        setEditOocContent(target.content);
        setOocModalType('edit');
    };
    const confirmOocEdit = async () => {
        if (!activeGame || !selectedOocId) return;
        const updated = {
            ...activeGame,
            oocLogs: (activeGame.oocLogs || []).map(o => o.id === selectedOocId ? { ...o, content: editOocContent } : o),
        };
        setActiveGame(updated);
        await DB.saveGame(updated);
        setOocModalType('none');
        setSelectedOocId(null);
        addToast('消息已修改', 'success');
    };
    const handleOocDelete = async () => {
        if (!activeGame || !selectedOocId) return;
        const updated = { ...activeGame, oocLogs: (activeGame.oocLogs || []).filter(o => o.id !== selectedOocId) };
        setActiveGame(updated);
        await DB.saveGame(updated);
        setOocModalType('none');
        setSelectedOocId(null);
        addToast('消息已删除', 'success');
    };

    // 批量删除选中的聊天室消息
    const handleOocBatchDelete = async () => {
        if (!activeGame || selectedOocIds.size === 0) return;
        const updated = { ...activeGame, oocLogs: (activeGame.oocLogs || []).filter(o => !selectedOocIds.has(o.id)) };
        setActiveGame(updated);
        await DB.saveGame(updated);
        addToast(`已删除 ${selectedOocIds.size} 条`, 'success');
        exitOocSelectMode();
    };

    // 把选中的聊天室消息打包成 trpg_card 转发到聊天，跟剧情视图 handleForwardToChat 同一套卡片格式，
    // 只是 excerpt 里 role 统一标成 'player'（聊天室发言没有 GM/角色区分，都当作"发言"展示）。
    const handleOocForwardToChat = async () => {
        if (!activeGame || selectedOocIds.size === 0) return;
        setIsOocForwarding(true);
        try {
            const players = characters.filter(c => activeGame.playerCharIds.includes(c.id));
            const selected = (activeGame.oocLogs || []).filter(o => selectedOocIds.has(o.id));
            const excerpt = selected.map(o => ({
                role: 'player',
                speaker: o.speakerName,
                text: o.content,
            }));
            const trpg = {
                gameTitle: `${activeGame.title}·聊天室`,
                theme: activeGame.theme,
                userName: userProfile.name,
                partyNames: players.map(p => p.name),
                excerpt,
                count: excerpt.length,
            };
            for (const p of players) {
                await DB.saveMessage({
                    charId: p.id,
                    role: 'user',
                    type: 'trpg_card',
                    content: `[TRPG游戏片段]《${activeGame.title}》聊天室`,
                    metadata: { trpg },
                });
            }
            addToast(`已转发到 ${players.length} 位角色的聊天`, 'success');
            exitOocSelectMode();
        } catch (e: any) {
            addToast(`转发失败: ${e.message}`, 'error');
        } finally {
            setIsOocForwarding(false);
        }
    };

    // 把聊天室（皮下吐槽）里尚未推送过的原文，直接（不经过 LLM）塞进参与角色的记忆 + 一条聊天系统消息。
    // 明确标注"这是跑团聊天室里发生的"，跟私聊上下文区分开——角色知道这不是在私聊窗口里对自己说的话。
    // 返回推送后的 oocPushedCount，供调用方合并进要落库的 GameSession。
    const pushOocToMemory = async (game: GameSession): Promise<number> => {
        const oocLogs = game.oocLogs || [];
        const pushedCount = game.oocPushedCount || 0;
        const unpushed = oocLogs.slice(pushedCount);
        if (unpushed.length === 0) return pushedCount;

        const players = characters.filter(c => game.playerCharIds.includes(c.id));
        const transcript = unpushed.map(o => `${o.speakerName}: ${o.content}`).join('\n');
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        for (const p of players) {
            const mem = {
                id: `mem-${Date.now()}-${Math.random()}`,
                date: dateStr,
                summary: `[跑团聊天室记录: 《${game.title}》] ${transcript}`,
                mood: 'fun',
            };
            updateCharacter(p.id, { memories: [...(p.memories || []), mem] });
            await DB.saveMessage({
                charId: p.id,
                role: 'system',
                type: 'text',
                content: `[跑团聊天室记录: 《${game.title}》]\n${transcript}`,
            });
        }
        return oocLogs.length;
    };

    // --- Gameplay Logic ---
    const handleAction = async (actionText: string, isReroll: boolean = false) => {
        if (!activeGame || !apiConfig.apiKey || isTyping) return;
        // 立即同步置位，堵住"点击后 setIsTyping(true) 真正生效前"那个窗口——
        // 否则连续快速点击（比如双击发送）可能在按钮变灰之前就发出第二次调用。
        setIsTyping(true);
        const gameId = activeGame.id;

        let contextLogs = activeGame.logs;
        let updatedGame = activeGame;
        let currentRoll: number | null = null;
        let userLogId: string | null = null;
        // 每回合全员（用户+所有队友）各自先投一个骰子，不管本回合是否真的用得上——
        // 是否采纳/对应哪个技能，交给下面同一次 LLM 调用去判断（省掉一次单独的"是否需要判定"预调用）。
        let partyRolls: Array<{ id: string; name: string; roll: number }> = [];

        const diceCfg = resolveDiceConfig(activeGame);
        // 死亡是永久状态：死人直接从"冒险小队"名单、骰点、prompt 里整体消失，不再登场。
        // 昏迷（HP 归零但没死）不在这里过滤——TA 仍在名单里，只是不参与骰点/自主行动（见下方 partyRolls 过滤 + prompt 里的昏迷提示）。
        const deadCharIds = new Set(activeGame.deadCharIds || []);
        const getVitals = (id: string) => getCharacterVitals(id, activeGame.characterVitals, activeGame.status.health, activeGame.status.sanity);
        const players = characters.filter(c => activeGame.playerCharIds.includes(c.id) && !deadCharIds.has(c.id));

        if (!isReroll) {
            const isSystemAction = actionText.startsWith('[System');
            // [优化] 每个玩家行动默认自动骰一次（不再需要主动点骰子），骰子机制按存档的规则系统决定。
            // 系统消息不骰点；用户在设置里关闭骰子时也不骰点；昏迷的队友没法自主行动，也不参与骰点。
            if (!isSystemAction && actionText.trim() && !activeGame.diceDisabled) {
                currentRoll = rollDice(diceCfg);
                setLastRoll(currentRoll);
                partyRolls = players.filter(p => getVitals(p.id).health > 0).map(p => ({ id: p.id, name: p.name, roll: rollDice(diceCfg) }));
                const rollSummary = [`${userProfile.name}:${currentRoll}`, ...partyRolls.map(r => `${r.name}:${r.roll}`)].join(' / ');
                addToast(`全员已骰点 → ${rollSummary}`, 'info');
            }

            // Standard Action: Append user log
            const userLog: GameLog = {
                id: `log-${Date.now()}`,
                role: isSystemAction ? 'system' : 'player',
                speakerName: userProfile.name,
                content: actionText,
                timestamp: Date.now(),
                diceRoll: currentRoll ? { result: currentRoll, max: diceCfg.count * diceCfg.sides } : undefined
            };
            userLogId = userLog.id;
            if (currentRoll !== null) setPendingRollLogId(userLogId);

            const updatedLogs = [...activeGame.logs, userLog];
            // 队友骰点跟玩家动作同一时刻落库（pendingPartyRolls），这样 reroll 才能原样复用同一批数字，
            // 不用"每次重roll队友都换新点数"这种奇怪的体验——玩家自己的骰点已经存在 userLog.diceRoll 里了。
            updatedGame = { ...activeGame, logs: updatedLogs, lastPlayedAt: Date.now(), suggestedActions: [], pendingPartyRolls: currentRoll !== null ? partyRolls : undefined };
            // 函数式更新防止竞态（快速连点时 activeGame 可能已过期）
            setActiveGame(prev => (prev?.id === gameId ? updatedGame : prev));
            await DB.saveGame(updatedGame);
            contextLogs = updatedLogs;
        } else {
            // 重新推演：玩家和队友本回合的骰点都必须原样保留（不能悄悄换一批新数字再判一次）——
            // 玩家的从上一条 player/system log 的 diceRoll 里找回来，队友的从存档的 pendingPartyRolls 里找回来。
            // 兜底：老存档没有 pendingPartyRolls 字段时才重投一次，避免直接崩掉。
            const lastActionLog = [...contextLogs].reverse().find(l => l.role === 'player' || l.role === 'system');
            if (lastActionLog) {
                userLogId = lastActionLog.id;
                if (lastActionLog.diceRoll) {
                    currentRoll = lastActionLog.diceRoll.result;
                    setPendingRollLogId(userLogId);
                    if (!activeGame.diceDisabled) {
                        partyRolls = activeGame.pendingPartyRolls
                            ?? players.filter(p => getVitals(p.id).health > 0).map(p => ({ id: p.id, name: p.name, roll: rollDice(diceCfg) }));
                    }
                }
            }
        }

        setUserInput('');
        addToast('GM 正在推演...', 'info');

        try {
            // 2. Build Context WITH RELATIONSHIP SYNC
            const playerContext = await buildSyncContext(players);

            // 3. Build Status Warning：逐人检查 HP/SAN，而不是只看队伍共享的那一份
            const allRoster: Array<{ id: string; name: string }> = [{ id: '__player__', name: userProfile.name }, ...players.map(p => ({ id: p.id, name: p.name }))];
            let statusWarning = "";
            const unconsciousNames: string[] = [];
            const brokenNames: string[] = [];
            for (const person of allRoster) {
                const v = getVitals(person.id);
                if (v.health <= 0) unconsciousNames.push(person.name);
                else if (v.health <= 30) statusWarning += `\n[WARNING: LOW HP] ${person.name} 濒临倒下，请描述极度的虚弱、伤痛或视野模糊。\n`;
                if (v.sanity <= 0) brokenNames.push(person.name);
                else if (v.sanity <= 30) statusWarning += `\n[WARNING: LOW SAN] ${person.name} 理智动摇中，请描述疯狂、幻听、幻视或不可名状的恐惧。\n`;
            }
            if (unconsciousNames.length > 0) statusWarning += `\n[UNCONSCIOUS] ${unconsciousNames.join('、')} 已昏迷（HP归零，未死亡），本回合不能自主行动/发言/被骰点，只能被其他人搬动或救治；若再受到一次伤害将当场死亡，请让叙事体现这份凶险。\n`;
            if (brokenNames.length > 0) statusWarning += `\n[BROKEN SAN] ${brokenNames.join('、')} 理智已经归零、陷入疯狂：不代表出局，TA仍在场，但请描写TA出现失控、诡异或不可理喻的言行（不是死亡，是"人还在但不太对"）。\n`;

            let gameOverTrigger = "";
            if (deadCharIds.has('__player__')) {
                gameOverTrigger = "\n[GAME OVER TRIGGER] 玩家已经死亡。请生成一个悲惨或疯狂的结局 (Bad Ending)，结束本次冒险。\n";
            }

            // [优化] 历史记录：已归档的旧剧情用「前情提要」总结代替，未归档日志保留原文，
            //   并把每条玩家行动的骰点结果一并喂给 GM 用于判定（之前 GM 根本看不到骰点）。
            const serializeLog = (l: GameLog) => {
                const who = l.role === 'gm' ? 'GM' : (l.speakerName || 'System');
                // 只有真正被采纳为正式检定的骰点（带 check 字段）才回显判定信息，避免把"没用上的骰点"也当成判定塞回去误导 GM
                const dice = l.diceRoll?.check ? ` 〔判定:${l.diceRoll.check}=${l.diceRoll.result}/${l.diceRoll.outcome || (l.diceRoll.success === false ? '失败' : '成功')}〕` : '';
                return `[${who}]${dice}: ${l.content}`;
            };
            const summaries = activeGame.summaries || [];
            const recapBlock = summaries.length > 0
                ? `### 前情提要 (Story So Far)\n${summaries.map((s, i) => `【第${i + 1}段】${s.content}`).join('\n\n')}\n\n`
                : '';
            const activeLogText = contextLogs.filter(l => !l.archived).map(serializeLog).join('\n');

            // 当前这步行动的判定提示：按存档规则系统的机制说明裁定；关了骰子默认直接成功
            // 自由叙事的技能表 = 固定基础技能 + 本场存档里 AI 原创的特殊技能
            const ruleSystemDef = activeGame.ruleSystem === 'freeform'
                ? { ...RULE_SYSTEMS.freeform, skills: [...FREEFORM_BASIC_SKILLS, ...(activeGame.freeformSpecialSkills || [])] }
                : RULE_SYSTEMS[activeGame.ruleSystem || 'freeform'];
            const hasSheet = !!(activeGame.characterSheets && Object.keys(activeGame.characterSheets).length > 0);
            const characterSheetsBlock = hasSheet ? formatCharacterSheetsBlock(ruleSystemDef, activeGame.characterSheets!) : '';
            const ruleSystemHeader = `\n### 规则系统: ${ruleSystemDef.name}\n${ruleSystemDef.tagline}\n${characterSheetsBlock}`;
            const dmStyle: DmStyle = activeGame.dmStyle || 'default';
            // [新] 全员先骰后判：本回合每个人（玩家+全体队友）都已经先投好了骰子，具体哪些点数真正构成一次检定、
            // 用哪个技能裁定，交给这同一次生成来决定——省掉一次单独"是否需要判定"的预调用。
            const isDnd = (activeGame.ruleSystem || 'freeform') === 'dnd5e';
            // dnd5e 用原始骰子点数（点数越高越好，跟属性加值直接相加比 DC，DC 必须由 AI 判断，没法穷举）；
            // freeform/coc7 没有 DC，成败是确定的算术题——直接把这个人每项技能对应的判定结果都提前算好
            // 摆出来（buildCheckOutcomePreview），AI 只需要挑技能抄结果，不再自己比较骰点和数值。
            const describeRoll = (id: string, name: string, roll: number) => isDnd
                ? `${name}: ${roll}（${rollFlavorFor(diceCfg, roll)}）`
                : `${name}: ${buildCheckOutcomePreview(ruleSystemDef, diceCfg, roll, activeGame.characterSheets?.[id])}`;
            const partyRollLines = [
                describeRoll('__player__', userProfile.name, currentRoll ?? 0),
                ...partyRolls.map(r => describeRoll(r.id, r.name, r.roll))
            ].join('\n- ');
            const rollInstruction = currentRoll
                ? `\n### 本回合判定\n本回合所有人都先投好了一次 ${diceCfg.label}（不代表都要用，是否采纳由你判断）：\n- ${partyRollLines}\n\n${ruleSystemDef.checkInstruction({ hasSheet })}\n**判定采纳规则（重要）**：不是每个人的骰点都要用——只有当某个角色本回合的行动/发言构成一次**有实际风险或冲突的尝试**（如说服、潜行、战斗、体能挑战、关键社交博弈）时，才把 TA 对应的骰点当作一次正式检定来裁定成败；纯叙事性动作（走路、闲聊、观察无风险场景）不需要判定，直接顺其自然描写，对应骰点忽略不用即可。如果本回合出现明显的冲突/对抗事件，请优先针对冲突双方或关键行动方进行判定。请把你实际采纳为检定的每一项，按输出格式里的 \`checks\` 数组给出：说明用的是谁的骰点、判定用了哪个技能/属性${isDnd ? '、这次检定的难度等级(DC)' : ''}、是否成功、以及简短的结果代价；没被采纳为检定的人不需要出现在 \`checks\` 里。\n`
                : (activeGame.diceDisabled
                    ? `\n### 判定模式\n本场冒险未启用骰子，玩家的行动默认视为顺利成功（除非剧情逻辑上明显不可能）。请直接推进正向结果，不要用随机失败打断节奏。\n`
                    : '');

            const vitalsLines = allRoster.map(person => {
                const v = getVitals(person.id);
                return `- ${person.name}: HP ${v.health}% / SAN ${v.sanity}%`;
            }).join('\n');
            const prompt = `### TRPG 跑团模式: ${activeGame.title}
**当前剧本**: ${activeGame.worldSetting}
**当前场景**: ${activeGame.status.location}
**队伍共享资源**: GOLD ${activeGame.status.gold || 0} / 物品: ${activeGame.status.inventory.join(', ') || '空'}
**每人生命/理智值（HP归零=昏迷，SAN归零=疯狂但不出局，均不是死亡）**:
${vitalsLines}
${ruleSystemHeader}
${statusWarning}
${gameOverTrigger}

### 冒险小队 (The Party)
1. **${userProfile.name}** (ID: __player__) (玩家/User)
${players.map(p => `2. **${p.name}** (ID: ${p.id}) - 你的队友`).join('\n')}

### 角色档案 & 神经链接 (Character Sheets & Neural Links)
${playerContext}

${recapBlock}### 冒险记录 (Recent Log)
${activeLogText}
${rollInstruction}
### GM 指令 (Game Master Instructions)
你现在是这场跑团游戏的 **主持人 (GM)**，本场的 DM 风格是「${DM_STYLE_META[dmStyle].label}」：${DM_STYLE_META[dmStyle].desc}
**现在的状态**：这是一群真实的朋友（基于神经链接中的私聊关系）在一起玩跑团游戏。

**请遵循以下法则**：
1. **全员「入戏」 (Roleplay First)**:
   - 队友们是活生生的冒险者，但同时也带着私聊时的记忆和情感。
   - **拒绝机械感**: 他们应该主动观察环境、吐槽现状、互相开玩笑。
   - **私聊影响 (关键)**: 请根据【神经链接】中的“关系温度”和“最近话题”来调整每个角色的反应。
   - **队内互动**: 队友之间也可以有互动（比如A吐槽B的计划）。

${buildGmStyleSection(dmStyle)}

4. **生成选项 (Action Options)**:
   - 请根据当前局势，为玩家提供 3 个可选的行动建议（玩家选择后都会自动骰 ${diceCfg.label} 判定，因此选项应是有成败风险的尝试）。

### 一致性自检 (Consistency Check)
输出前请最后核对一遍：每个角色的台词、记忆、口癖、性格是否**严格来自 TA 各自的"角色档案"**？绝不能把一个角色的记忆/人设/经历安到另一个角色身上（防止"串台"）。如发现串台，请改正后再输出。

### 输出格式 (Strict JSON)
请仅输出 JSON，不要包含 Markdown 代码块。
{
  "gm_narrative": "GM的剧情描述 (支持Markdown)...",
  "characters": [
    {
      "charId": "角色ID (必须对应上方列表)",
      "action": "动作描述",
      "dialogue": "台词"
    }
  ],
  "checks": [
    { "charId": "本次判定用了谁的骰点，__player__ 代表玩家本人", "skill": "用来判定的技能/属性名（中文即可）"${isDnd ? ', "target": 15' : ''}, "success": true, "outcome": "一句话说明判定结果与代价" }
  ],
  "newLocation": "新地点 (可选)",
  "statusChanges": [
    { "charId": "__player__ 或角色ID", "hpChange": 0, "sanityChange": 0 }
  ],
  "goldChange": 0,
  "newItem": "获得物品 (可选)",
  "suggested_actions": [
    { "label": "选项1文本", "type": "neutral" },
    { "label": "选项2文本", "type": "chaotic" },
    { "label": "选项3文本", "type": "evil" }
  ]
}
"checks" 只列出本回合真正被采纳为正式检定的人（可能一个都没有，也可能好几个），不要为每个人都硬凑一条。"statusChanges" 只列出本回合 HP 或 SAN 真的发生变化的人（没受伤/没受惊的人不用出现），goldChange/物品仍是队伍共享。`;

            const data = await fetchGameAPI(prompt);
            const rawContent = extractContent(data);
            if (!rawContent) throw new Error('AI 返回了空响应');

            // Robust JSON extraction
            const res = extractJson(rawContent);

            const newLogs: GameLog[] = [];
            const newStatus = { ...updatedGame.status };
            // 逐人 HP/SAN：从当前值起算，按 res.statusChanges 逐条应用。
            // 死亡判定（代码机械算，不问 AI）：已昏迷（health<=0）的人再挨一次 hpChange<0，就当场死亡；
            // 死亡不可逆，一旦发生本局后续所有回合都不再让 TA 登场/骰点。
            const newVitals: Record<string, { health: number; sanity: number }> = {};
            for (const person of allRoster) newVitals[person.id] = getVitals(person.id);
            const newlyDeadIds: string[] = [];
            if (Array.isArray(res?.statusChanges)) {
                for (const sc of res.statusChanges) {
                    // 优先用 id 精确匹配，name 匹配仅兜底（防止角色改名后 AI 还用旧名导致匹配不到）
                    const matched = sc.charId === '__player__'
                        ? '__player__'
                        : (players.find(p => p.id === sc.charId)?.id || players.find(p => p.name === sc.charId)?.id);
                    if (!matched) {
                        console.warn(`[GameApp] statusChanges 里的 charId="${sc.charId}" 匹配不到任何队友，已跳过`);
                        continue;
                    }
                    const prev = newVitals[matched];
                    let health = prev.health;
                    if (typeof sc.hpChange === 'number' && sc.hpChange) {
                        if (prev.health <= 0 && sc.hpChange < 0) newlyDeadIds.push(matched);
                        health = Math.max(0, Math.min(100, prev.health + sc.hpChange));
                    }
                    let sanity = prev.sanity;
                    if (typeof sc.sanityChange === 'number' && sc.sanityChange && !sanityLocked) {
                        sanity = Math.max(0, Math.min(100, prev.sanity + sc.sanityChange));
                    }
                    newVitals[matched] = { health, sanity };
                }
            }
            const newDeadCharIds = newlyDeadIds.length > 0 ? Array.from(new Set([...deadCharIds, ...newlyDeadIds])) : (activeGame.deadCharIds || []);
            // 把这回合先骰好的点数按 charId 建个索引，等 LLM 挑出"这回合谁的骰点被采纳为正式检定"后（res.checks），
            // 拼回对应的 log，让判定结果（技能/成败/代价）在界面上看得到，而不只是骰个数字摆着。
            const rollByCharId: Record<string, number> = { __player__: currentRoll ?? -1 };
            for (const r of partyRolls) rollByCharId[r.id] = r.roll;
            // AI 在写剧情的同时也顺手把成败算了一遍（它手上有骰点+数值，这一步只是算术）。
            // 但存档/UI 展示的判定结果不采信 AI 自报的成败——用同样的骰点+角色数值+（DnD的）DC 机械重算一遍作为权威结果。
            // coc7/freeform 没有 DC，本回合判定结果已经在 prompt 里以预览表的形式提前算好给 AI 抄了，
            // 这里直接采信机械重算结果即可，不再跟 AI 自报的成败比对/报错——比对只在 dnd5e 上保留，
            // 因为 DC 是 AI 现场判断的，没法穷举预演，算错了还是要让用户点重roll。
            const checkByCharId: Record<string, { skill?: string; success?: boolean; outcome?: string; tier?: CheckTier }> = {};
            if (Array.isArray(res?.checks)) {
                for (const c of res.checks) {
                    // 优先用 id 精确匹配，name 匹配仅兜底（防止角色改名后 AI 还用旧名导致匹配不到）
                    const matched = c.charId === '__player__'
                        ? '__player__'
                        : (players.find(p => p.id === c.charId)?.id || players.find(p => p.name === c.charId)?.id);
                    if (!matched) {
                        console.warn(`[GameApp] checks 里的 charId="${c.charId}" 匹配不到任何队友，已跳过`);
                        continue;
                    }
                    const roll = rollByCharId[matched];
                    if (roll === undefined || roll < 0) continue; // 没骰过的人不该出现在 checks 里，脏数据直接丢弃

                    const sheet = activeGame.characterSheets?.[matched];
                    const skillValue = findSkillValueByName(ruleSystemDef, sheet, c.skill);
                    const mechanical = computeCheckTier(ruleSystemDef, diceCfg, roll, skillValue, c.target);
                    if (isDnd) {
                        const aiSuccess = c.success !== false;
                        if (aiSuccess !== mechanical.success) {
                            throw new Error(`AI 判定结果与骰点/数值不符（${c.skill || '未知判定'}），点击右下角 🔄 按钮重新生成`);
                        }
                    }
                    checkByCharId[matched] = { skill: c.skill, success: mechanical.success, outcome: c.outcome || mechanical.label, tier: mechanical.tier };
                }
            }

            // 队友死亡通知（玩家死亡已经在下方 playerCanAct 那块有专门的 UI 旁观提示，不需要重复 toast）
            if (newlyDeadIds.length > 0) {
                const deadNames = newlyDeadIds
                    .filter(id => id !== '__player__')
                    .map(id => players.find(p => p.id === id)?.name || '队友')
                    .filter(Boolean);
                if (deadNames.length > 0) {
                    addToast(`${deadNames.join('、')} 已死亡，永久离队`, 'error');
                }
            }

            if (res) {
                // Structured response - use parsed JSON
                if (res.gm_narrative) {
                    newLogs.push({
                        id: `gm-${Date.now()}`,
                        role: 'gm',
                        content: res.gm_narrative,
                        timestamp: Date.now()
                    });
                }

                const narratedCharIds = new Set<string>();
                if (Array.isArray(res.characters)) {
                    for (const charAct of res.characters) {
                        // 优先用 id 精确匹配，name 匹配仅兜底
                        const char = players.find(p => p.id === charAct.charId) || players.find(p => p.name === charAct.charId);
                        if (char) {
                            narratedCharIds.add(char.id);
                            const combinedContent = `*${charAct.action || ''}* \n"${charAct.dialogue || ''}"`;
                            const check = checkByCharId[char.id];
                            const roll = rollByCharId[char.id];
                            newLogs.push({
                                id: `char-${Date.now()}-${Math.random()}`,
                                role: 'character',
                                speakerName: char.name,
                                content: combinedContent,
                                timestamp: Date.now(),
                                diceRoll: roll !== undefined
                                    ? (check
                                        ? { result: roll, max: diceCfg.count * diceCfg.sides, check: check.skill, success: check.success, outcome: check.outcome, tier: check.tier }
                                        : { result: roll, max: diceCfg.count * diceCfg.sides })
                                    : undefined
                            });
                        }
                    }
                }
                // 兜底：AI 有时会把某个队友的骰点判定塞进 checks[]，却忘了把 TA 也放进 characters[] 里叙述——
                // 这种情况下判定结果原本无处安放，直接消失。这里给漏掉的人补一条"沉默判定"记录，至少骰点+徽章还在。
                for (const charId of Object.keys(checkByCharId)) {
                    if (charId === '__player__' || narratedCharIds.has(charId)) continue;
                    const char = players.find(p => p.id === charId);
                    if (!char) continue;
                    const check = checkByCharId[charId];
                    const roll = rollByCharId[charId];
                    if (roll === undefined) continue;
                    newLogs.push({
                        id: `char-${Date.now()}-${Math.random()}`,
                        role: 'character',
                        speakerName: char.name,
                        content: `*沉默地完成了这次判定*`,
                        timestamp: Date.now(),
                        diceRoll: { result: roll, max: diceCfg.count * diceCfg.sides, check: check.skill, success: check.success, outcome: check.outcome, tier: check.tier }
                    });
                }

                // 玩家本人这回合如果被采纳为一次正式检定，把技能/成败信息补回刚才已经落库的那条 player log
                if (checkByCharId.__player__ && userLogId) {
                    const check = checkByCharId.__player__;
                    contextLogs = contextLogs.map(l => l.id === userLogId
                        ? { ...l, diceRoll: l.diceRoll ? { ...l.diceRoll, check: check.skill, success: check.success, outcome: check.outcome, tier: check.tier } : l.diceRoll }
                        : l);
                }

                // Update State (队伍共享部分：地点/金币/物品；HP/SAN 已在上面按人处理进 newVitals)
                if (res.newLocation) newStatus.location = res.newLocation;
                if (res.goldChange) newStatus.gold = Math.max(0, (newStatus.gold || 0) + res.goldChange);
                if (res.newItem) newStatus.inventory = [...newStatus.inventory, res.newItem];
                // 队伍面板展示的 health/sanity 沿用玩家本人的数值，保持旧字段向后兼容（旧存档/UI 兜底读的还是它）
                newStatus.health = newVitals.__player__.health;
                newStatus.sanity = newVitals.__player__.sanity;
            } else {
                // JSON parse completely failed - still show the raw text as GM narrative
                console.warn('[GameApp] JSON extraction failed, using raw text as narrative');
                newLogs.push({
                    id: `gm-${Date.now()}`,
                    role: 'gm',
                    content: rawContent,
                    timestamp: Date.now()
                });
            }

            const finalGame = {
                ...updatedGame,
                logs: [...contextLogs, ...newLogs],
                status: newStatus,
                characterVitals: newVitals,
                deadCharIds: newDeadCharIds,
                suggestedActions: res?.suggested_actions || [],
                pendingPartyRolls: undefined // 本回合已经成功推进，缓存的队友骰点用完即清，下一回合重新投
            };

            setActiveGame(prev => (prev?.id === gameId ? finalGame : prev));
            await DB.saveGame(finalGame);

            // 回合结束后检查是否需要自动总结归档前文
            setIsTyping(false);
            await runAutoSummaryIfNeeded(finalGame);
            // 皮下吐槽：异步触发，不 await——不阻塞主线，失败也不影响本回合结果
            runOocIfNeeded(finalGame);

        } catch (e: any) {
            addToast(`GM 掉线了: ${e.message}`, 'error');
        } finally {
            setIsTyping(false);
            setPendingRollLogId(null);
        }
    };

    // --- 自动总结 (每累积 AUTO_SUMMARY_THRESHOLD 条未归档日志触发一次) ---
    // 把旧剧情压缩成小说式「前情提要」，归档折叠原文（不删除），并把总结小卡片
    // 发送到参与角色的记忆与聊天上下文里。
    const runAutoSummaryIfNeeded = async (game: GameSession) => {
        const nonArchived = game.logs.filter(l => !l.archived);
        if (nonArchived.length < AUTO_SUMMARY_THRESHOLD) return;

        // 保留最近 KEEP_RECENT_AFTER_SUMMARY 条不折叠，保证连贯
        const toArchive = nonArchived.slice(0, nonArchived.length - KEEP_RECENT_AFTER_SUMMARY);
        if (toArchive.length < 6) return; // 太少不值得总结

        setIsSummarizing(true);
        try {
            const players = characters.filter(c => game.playerCharIds.includes(c.id));
            const playerNames = players.map(p => p.name).join('、');
            const prevRecap = (game.summaries || []).map((s, i) => `【第${i + 1}段】${s.content}`).join('\n');

            const logText = toArchive.map(l => {
                const who = l.role === 'gm' ? 'GM' : (l.speakerName || 'System');
                return `[${who}]: ${l.content}`;
            }).join('\n');

            const prompt = `你是一位擅长写小说的记录者。请把下面这段 TRPG 跑团剧情，总结成一段**连贯、生动、像小说梗概一样**的前情提要。
${prevRecap ? `\n【已有前情（仅供衔接，不要重复）】\n${prevRecap}\n` : ''}
【本段需要总结的剧情记录】
${logText}

要求：
1. 用第三人称叙述，包含【起因 → 经过 → 结果】的来龙去脉。
2. 重点写清楚**人物之间的关系变化与各自的处境/情绪**（谁和谁更近了/起了冲突/暴露了什么）。
3. 控制在 200~350 字，文笔流畅，不要分点罗列，不要写"总结如下"之类的开场白。

直接输出总结正文：`;

            const data = await fetchGameAPI(prompt, 1500);
            let summaryText = (extractContent(data) || '').trim();
            if (!summaryText) summaryText = '（这段冒险继续推进了剧情）';

            const newSummary: GameSummary = {
                id: `sum-${Date.now()}`,
                content: summaryText,
                logCount: toArchive.length,
                logIds: toArchive.map(l => l.id),
                createdAt: Date.now(),
            };

            // 折叠归档原文（标记 archived，不删除）
            const archiveIds = new Set(toArchive.map(l => l.id));
            const archivedLogs = game.logs.map(l => archiveIds.has(l.id) ? { ...l, archived: true } : l);

            const updated: GameSession = {
                ...game,
                logs: archivedLogs,
                summaries: [...(game.summaries || []), newSummary],
            };
            setActiveGame(updated);
            await DB.saveGame(updated);

            // 归档模式决定是否把总结推送到角色 chatapp。
            // 'auto' 推送；'manual'（含旧存档无此字段者）不推送，仅手动归档时才送。
            if (game.archiveMode === 'auto') {
                const now = new Date();
                const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const cardLine = `和【${playerNames}】一起玩《${game.title}》TRPG，${summaryText}`;
                for (const p of players) {
                    const mem = {
                        id: `mem-${Date.now()}-${Math.random()}`,
                        date: dateStr,
                        summary: cardLine,
                        mood: 'fun'
                    };
                    updateCharacter(p.id, { memories: [...(p.memories || []), mem] });
                    await DB.saveMessage({
                        charId: p.id,
                        role: 'system',
                        type: 'text',
                        content: `[TRPG 进度卡: 你正和${playerNames}玩《${game.title}》。${summaryText}]`
                    });
                }
                // 聊天室（皮下吐槽）原文跟主线总结一起顺带推送：不经过 LLM，直接把未推送过的原文塞进角色记忆/聊天
                const pushedCount = await pushOocToMemory(updated);
                if (pushedCount !== (updated.oocPushedCount || 0)) {
                    const withOocPushed = { ...updated, oocPushedCount: pushedCount };
                    setActiveGame(withOocPushed);
                    await DB.saveGame(withOocPushed);
                }
                addToast('已自动总结并归档（已同步到角色聊天）', 'success');
            } else {
                addToast('已自动总结并归档前文', 'success');
            }
        } catch (e) {
            console.error('[GameApp] auto summary failed', e);
            // 总结失败不阻塞游戏，静默跳过
        } finally {
            setIsSummarizing(false);
        }
    };

    const handleReroll = async () => {
        if (!activeGame || isTyping) return;
        
        // Find index of last user/system action
        const logs = activeGame.logs;
        let lastUserIndex = -1;
        for (let i = logs.length - 1; i >= 0; i--) {
            if (logs[i].role === 'player' || logs[i].role === 'system') {
                lastUserIndex = i;
                break;
            }
        }

        if (lastUserIndex === -1) {
            addToast('没有可以重新推演的内容。', 'info');
            return;
        }

        // Keep logs up to and including the last user input
        const contextLogs = logs.slice(0, lastUserIndex + 1);
        
        // Optimistic Update
        const rolledBackGame = { ...activeGame, logs: contextLogs };
        setActiveGame(rolledBackGame);
        
        await handleAction("", true); // isReroll = true
        addToast('正在重新推演命运...', 'info');
    };

    const handleRollbackLog = async (index: number) => {
        if (!activeGame) return;
        if (!confirm("回退到此条记录？\n(注意：此操作将删除该条记录之后的所有内容，但不会自动重置HP/物品状态，请手动调整)")) return;
        
        const newLogs = activeGame.logs.slice(0, index + 1);
        const updated = { ...activeGame, logs: newLogs };
        await DB.saveGame(updated);
        setActiveGame(updated);
        addToast('时间回溯成功', 'success');
    };

    const handleRestart = async () => {
        if (!activeGame) return;
        if (!confirm('确定要重置当前游戏吗？所有进度将丢失。')) return;

        const initialLog: GameLog = {
            id: 'init',
            role: 'gm',
            content: `欢迎来到 "${activeGame.title}"。\n世界观载入中...\n${activeGame.worldSetting}`,
            timestamp: Date.now()
        };

        const resetGame: GameSession = {
            ...activeGame,
            logs: [initialLog],
            // 漏清 summaries 会让旧前情提要继续显示在「已归档剧情」并被注入下一轮 GM prompt → 串档。一并清掉 UI 展开状态。
            summaries: [],
            status: {
                location: 'Start Point',
                health: 100,
                sanity: 100,
                gold: 0,
                inventory: []
            },
            // 重置也要清逐人状态/死亡名单/皮下吐槽记录，否则"重开一局"还带着上一局的死人
            characterVitals: {
                __player__: { health: 100, sanity: 100 },
                ...Object.fromEntries(activeGame.playerCharIds.map(id => [id, { health: 100, sanity: 100 }])),
            },
            deadCharIds: [],
            oocLogs: [],
            oocPushedCount: 0,
            suggestedActions: [],
            lastPlayedAt: Date.now()
        };

        await DB.saveGame(resetGame);
        setActiveGame(resetGame);
        setShowArchived(false);
        setExpandedSummaries(new Set());
        setShowSystemMenu(false);
        addToast('游戏已重置', 'success');
    };

    // "Leave" just goes back to lobby (Auto-save is handled by DB calls in handleAction)
    const handleLeave = () => {
        setActiveGame(null);
        setView('lobby');
        setShowSystemMenu(false);
    };

    const handleArchiveAndQuit = async () => {
        if (!activeGame) return;
        setIsArchiving(true);
        setShowSystemMenu(false);

        try {
            const game = activeGame;
            const players = characters.filter(c => game.playerCharIds.includes(c.id));
            const playerNames = players.map(p => p.name).join('、');
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            // 把还没被自动总结覆盖的尾部日志，用跟自动总结完全一样的「小说式总结」提示词补总结一段——
            // 这里之前用的是另一套"总结成一句话"的提示词，格式对不上段落总结，长度也差一大截，是这个函数一句话
            // 总结的根源。
            const nonArchived = game.logs.filter(l => !l.archived);
            let finalChunkSummary = '';
            let updatedGame = game;
            if (nonArchived.length > 0) {
                const prevRecap = (game.summaries || []).map((s, i) => `【第${i + 1}段】${s.content}`).join('\n');
                const logText = nonArchived.map(l => {
                    const who = l.role === 'gm' ? 'GM' : (l.speakerName || 'System');
                    return `[${who}]: ${l.content}`;
                }).join('\n');

                const prompt = `你是一位擅长写小说的记录者。请把下面这段 TRPG 跑团剧情，总结成一段**连贯、生动、像小说梗概一样**的前情提要。
${prevRecap ? `\n【已有前情（仅供衔接，不要重复）】\n${prevRecap}\n` : ''}
【本段需要总结的剧情记录（这是最后一段，游戏即将归档退出）】
${logText}

要求：
1. 用第三人称叙述，包含【起因 → 经过 → 结果】的来龙去脉。
2. 重点写清楚**人物之间的关系变化与各自的处境/情绪**（谁和谁更近了/起了冲突/暴露了什么）。
3. 控制在 200~350 字，文笔流畅，不要分点罗列，不要写"总结如下"之类的开场白。

直接输出总结正文：`;

                const data = await fetchGameAPI(prompt, 1500);
                finalChunkSummary = (extractContent(data) || '').trim();
                if (!finalChunkSummary) finalChunkSummary = '（这段冒险继续推进了剧情）';

                const newSummary: GameSummary = {
                    id: `sum-${Date.now()}`,
                    content: finalChunkSummary,
                    logCount: nonArchived.length,
                    logIds: nonArchived.map(l => l.id),
                    createdAt: Date.now(),
                };
                const archiveIds = new Set(nonArchived.map(l => l.id));
                updatedGame = {
                    ...game,
                    logs: game.logs.map(l => archiveIds.has(l.id) ? { ...l, archived: true } : l),
                    summaries: [...(game.summaries || []), newSummary],
                };
            }

            // 拼出要写入角色记忆/聊天的完整叙事：
            // - auto 模式：之前每段总结在生成当时就已经推送过聊天了，这里只需要补最后这段尾巴。
            // - manual 模式：所有总结段落此前都没推送过（只有点「归档并退出」才真正发到聊天）——这里要把
            //   全部历史段落 + 最后这段一起拼成完整叙事发出去，否则前面大半场经历会凭空消失，只剩最后一小段。
            const segments = game.archiveMode === 'auto'
                ? [finalChunkSummary].filter(Boolean)
                : [...(game.summaries || []).map(s => s.content), finalChunkSummary].filter(Boolean);
            const fullNarrative = segments.join('\n\n');

            if (fullNarrative) {
                const cardLine = `和【${playerNames}】一起玩《${game.title}》TRPG，${fullNarrative}`;
                for (const p of players) {
                    const mem = {
                        id: `mem-${Date.now()}-${Math.random()}`,
                        date: dateStr,
                        summary: cardLine,
                        mood: 'fun'
                    };
                    updateCharacter(p.id, { memories: [...(p.memories || []), mem] });
                    await DB.saveMessage({
                        charId: p.id,
                        role: 'system',
                        type: 'text',
                        content: `[TRPG 归档提醒: 刚刚你们一起玩了《${game.title}》。${fullNarrative}]`
                    });
                }
            }

            // 聊天室（皮下吐槽）原文没跟随自动总结推送过的，这里跟主线归档一起补送（同样不经过 LLM）
            const pushedCount = await pushOocToMemory(updatedGame);
            updatedGame = { ...updatedGame, oocPushedCount: pushedCount };
            await DB.saveGame(updatedGame);

            addToast('记忆传递完成 (Chat & Memory)', 'success');
        } catch (e) {
            console.error(e);
            addToast('归档失败', 'error');
        } finally {
            setIsArchiving(false);
            setView('lobby');
            setActiveGame(null);
        }
    };

    // --- 长按多选日志 → 转发到聊天 ---
    const startLogPress = (logId: string) => {
        if (selectMode) return;
        cancelLogPress();
        logPressTimer.current = setTimeout(() => {
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
            setSelectMode(true);
            setSelectedLogIds(new Set([logId]));
        }, 500);
    };
    const cancelLogPress = () => {
        if (logPressTimer.current) { clearTimeout(logPressTimer.current); logPressTimer.current = null; }
    };
    const toggleSelectLog = (logId: string) => {
        setSelectedLogIds(prev => {
            const n = new Set(prev);
            n.has(logId) ? n.delete(logId) : n.add(logId);
            return n;
        });
    };
    const exitSelectMode = () => {
        setSelectMode(false);
        setSelectedLogIds(new Set());
    };

    // 把选中的剧情打包成 trpg_card，转发进每个参与角色的聊天上下文
    const handleForwardToChat = async () => {
        if (!activeGame || selectedLogIds.size === 0) return;
        setIsForwarding(true);
        try {
            const players = characters.filter(c => activeGame.playerCharIds.includes(c.id));
            // 按剧情原顺序取选中的日志（排除纯系统占位）
            const selected = activeGame.logs.filter(l => selectedLogIds.has(l.id) && l.role !== 'system');
            const excerpt = selected.map(l => ({
                role: l.role,
                speaker: l.role === 'gm' ? 'GM' : (l.speakerName || (l.role === 'player' ? userProfile.name : '')),
                text: l.content,
            }));
            const trpg = {
                gameTitle: activeGame.title,
                theme: activeGame.theme,
                userName: userProfile.name,
                partyNames: players.map(p => p.name),
                excerpt,
                count: excerpt.length,
            };
            for (const p of players) {
                await DB.saveMessage({
                    charId: p.id,
                    role: 'user',
                    type: 'trpg_card',
                    content: `[TRPG游戏片段]《${activeGame.title}》`,
                    metadata: { trpg },
                });
            }
            addToast(`已转发到 ${players.length} 位角色的聊天`, 'success');
            exitSelectMode();
        } catch (e: any) {
            addToast(`转发失败: ${e.message}`, 'error');
        } finally {
            setIsForwarding(false);
        }
    };

    const handleDeleteGame = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setDeleteConfirmId(id);
    };

    // 长按卡片删除：按住约 550ms 触发删除确认，并抑制随后的点击进入
    const startLongPress = (id: string) => {
        longPressFired.current = false;
        cancelLongPress();
        longPressTimer.current = setTimeout(() => {
            longPressFired.current = true;
            if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);
            setDeleteConfirmId(id);
        }, 550);
    };
    const cancelLongPress = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };
    const handleCardOpen = (g: GameSession) => {
        if (longPressFired.current) { longPressFired.current = false; return; } // 长按已触发删除，忽略点击
        setActiveGame(g);
        setPlaySubView('game');
        setView('play');
    };

    const confirmDeleteGame = async () => {
        if (!deleteConfirmId) return;
        await DB.deleteGame(deleteConfirmId);
        setGames(prev => prev.filter(g => g.id !== deleteConfirmId));
        setDeleteConfirmId(null);
        addToast('存档已删除', 'success');
    };

    // --- Renderers ---

    // 1. Lobby View (Redesigned)
    if (view === 'lobby') {
        return (
            <div className="h-full w-full bg-[#0a0a0a] flex flex-col font-sans relative overflow-hidden">
                {/* Ambient Background */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-900/50 to-black z-0"></div>
                <div className="absolute inset-0 z-0 opacity-20" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/stardust.png")' }}></div>

                {/* Header */}
                <div className="shrink-0 z-10" style={{ paddingTop: 'var(--safe-top)' }}>
                    <div className="flex items-center justify-between px-6 py-3">
                        <button onClick={closeApp} className="p-2 -ml-2 hover:bg-white/10 rounded-full text-white/70 transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                        </button>
                        <span className="font-black tracking-[0.2em] text-xl text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">TRPG ADVENTURE</span>
                        <button onClick={() => setView('create')} className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/10 shadow-lg active:scale-95 transition-all hover:bg-white/20">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                        </button>
                    </div>
                </div>

                {/* Games Grid */}
                <div className="px-6 pt-6 pb-2 flex-1 overflow-y-auto no-scrollbar z-10 space-y-4">
                    {games.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-4">
                            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center border border-white/5 animate-pulse"><Planet size={48} className="text-indigo-400" /></div>
                            <p className="text-xs tracking-widest uppercase">No Active Adventures</p>
                        </div>
                    )}
                    {games.length > 0 && (
                        <p className="text-[10px] text-white/30 tracking-widest uppercase text-center -mt-2">长按卡片可删除</p>
                    )}
                    {games.slice(lobbyPage * LOBBY_PAGE_SIZE, lobbyPage * LOBBY_PAGE_SIZE + LOBBY_PAGE_SIZE).map(g => {
                        const themeStyle = GAME_THEMES[g.theme] || GAME_THEMES.fantasy;
                        return (
                            <div
                                key={g.id}
                                onClick={() => handleCardOpen(g)}
                                onPointerDown={() => startLongPress(g.id)}
                                onPointerUp={cancelLongPress}
                                onPointerLeave={cancelLongPress}
                                onPointerCancel={cancelLongPress}
                                onContextMenu={(e) => e.preventDefault()}
                                className={`relative overflow-hidden rounded-2xl p-5 cursor-pointer group active:scale-[0.98] transition-all border border-white/5 hover:border-white/20 shadow-lg select-none`}
                            >
                                {/* Card Background */}
                                <div className={`absolute inset-0 bg-gradient-to-br ${themeStyle.gradient} opacity-80 group-hover:opacity-100 transition-opacity`}></div>
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                                
                                <div className="relative z-10 flex flex-col gap-2">
                                    <div className="flex justify-between items-start">
                                        <h3 className={`font-bold text-lg text-white leading-tight drop-shadow-md font-serif`}>{g.title}</h3>
                                        <span className={`text-[10px] px-2 py-0.5 rounded border border-white/20 text-white/80 uppercase font-mono tracking-wider bg-black/20`}>{g.theme}</span>
                                    </div>
                                    
                                    <p className="text-xs text-white/60 line-clamp-2 leading-relaxed italic font-serif border-l-2 border-white/20 pl-2">
                                        "{g.worldSetting}"
                                    </p>
                                    
                                    <div className="flex justify-between items-end mt-2 pt-2 border-t border-white/10">
                                        <div className="flex -space-x-2">
                                            {characters.filter(c => g.playerCharIds.includes(c.id)).map(c => (
                                                <img key={c.id} src={c.avatar} className="w-8 h-8 rounded-full border-2 border-black/50 object-cover shadow-sm" />
                                            ))}
                                        </div>
                                        <div className="text-[10px] text-white/40 font-mono">
                                            {new Date(g.lastPlayedAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>

                                {/* Delete Button */}
                                <button onClick={(e) => handleDeleteGame(e, g.id)} className="absolute top-2 right-2 p-2 text-white/20 hover:text-red-400 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" /></svg>
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Pager (每页 5 条) */}
                {games.length > LOBBY_PAGE_SIZE && (() => {
                    const totalPages = Math.ceil(games.length / LOBBY_PAGE_SIZE);
                    return (
                        <div className="flex items-center justify-center gap-4 px-6 pb-[calc(1rem+var(--safe-bottom,0px))] pt-2 shrink-0 z-10">
                            <button
                                onClick={() => setLobbyPage(p => Math.max(0, p - 1))}
                                disabled={lobbyPage === 0}
                                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-all disabled:opacity-25 hover:bg-white/10"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                            </button>
                            <div className="flex items-center gap-1.5">
                                {Array.from({ length: totalPages }).map((_, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setLobbyPage(i)}
                                        className={`rounded-full transition-all ${i === lobbyPage ? 'w-5 h-1.5 bg-purple-400' : 'w-1.5 h-1.5 bg-white/25 hover:bg-white/40'}`}
                                    />
                                ))}
                            </div>
                            <button
                                onClick={() => setLobbyPage(p => Math.min(totalPages - 1, p + 1))}
                                disabled={lobbyPage >= totalPages - 1}
                                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 active:scale-95 transition-all disabled:opacity-25 hover:bg-white/10"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" /></svg>
                            </button>
                        </div>
                    );
                })()}

                {/* Delete Save Confirm Modal (lobby) */}
                <Modal isOpen={!!deleteConfirmId} title="删除存档" onClose={() => setDeleteConfirmId(null)} footer={
                    <div className="flex gap-3 w-full">
                        <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">取消</button>
                        <button onClick={confirmDeleteGame} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-200">删除</button>
                    </div>
                }>
                    <p className="text-sm text-slate-600 text-center py-4">确定要删除这个存档吗？<br/><span className="text-xs text-red-400 mt-1 block">此操作不可恢复。</span></p>
                </Modal>
            </div>
        );
    }

    // 2. Create View
    if (view === 'create') {
        const THEME_META: Record<GameTheme, { label: string; en: string; gradient: string }> = {
            fantasy: { label: '奇幻', en: 'FANTASY', gradient: 'from-amber-700 to-orange-900' },
            cyber: { label: '赛博', en: 'CYBER', gradient: 'from-cyan-600 to-indigo-900' },
            horror: { label: '恐怖', en: 'HORROR', gradient: 'from-red-800 to-black' },
            modern: { label: '现代', en: 'MODERN', gradient: 'from-sky-500 to-slate-700' },
        };
        const canStart = newTitle.trim() && newWorld.trim() && selectedPlayers.size > 0;
        const playerChars = filterCharactersByGroup(characters, characterGroups, playerGroupId); // 邀请队友：按分组筛选后的候选
        return (
            <div className="h-full w-full bg-[#0a0a0a] text-white flex flex-col font-sans relative overflow-hidden">
                {/* Ambient Background */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/30 via-slate-900/40 to-black z-0"></div>
                <div className="absolute inset-0 z-0 opacity-20" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/stardust.png")' }}></div>

                {/* Header */}
                <div className="shrink-0 z-10" style={{ paddingTop: 'var(--safe-top)' }}>
                    <div className="flex items-center px-5 py-3">
                        <button onClick={() => setView('lobby')} className="p-2 -ml-2 rounded-full text-white/70 hover:bg-white/10 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg></button>
                        <span className="font-black tracking-[0.15em] text-base ml-1 mb-1 text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-500">创建新世界</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-5 z-10 no-scrollbar">
                    {/* 剧本标题 */}
                    <div>
                        <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider block mb-2">剧本标题</label>
                        <input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-sm text-white placeholder-white/25 focus:border-purple-400/60 focus:bg-white/10 outline-none transition-all" placeholder="例如：勇者斗恶龙" />
                    </div>

                    {/* 世界观设定 */}
                    <div>
                        <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider block mb-2">世界观设定 (Lore)</label>
                        <textarea value={newWorld} onChange={e => setNewWorld(e.target.value)} className="w-full h-36 bg-white/5 border border-white/10 rounded-2xl px-4 py-3.5 text-sm leading-relaxed text-white placeholder-white/25 focus:border-purple-400/60 focus:bg-white/10 outline-none resize-none transition-all" placeholder="描述你的世界... 没思路的话，用下方 AI 帮你生成" />

                        {/* AI 世界观生成面板 */}
                        <div className="mt-3 rounded-2xl p-4 bg-gradient-to-br from-purple-500/10 to-pink-500/5 border border-purple-400/20 backdrop-blur-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="w-1 h-3.5 rounded-full bg-gradient-to-b from-purple-400 to-pink-400"></span>
                                <span className="text-xs font-bold text-purple-200">没思路？让 AI 帮你写</span>
                            </div>

                            {/* 风格选择 */}
                            <div className="grid grid-cols-5 gap-1.5 mb-3">
                                {WORLD_STYLES.map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setWorldStyle(s)}
                                        className={`px-1 py-1.5 rounded-lg text-[10px] font-medium border transition-all active:scale-95 ${worldStyle === s ? 'bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/30' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                                    >{s}</button>
                                ))}
                            </div>

                            {/* 叙事节奏：危机驱动 / 开放式冒险 */}
                            <div className="grid grid-cols-2 gap-1.5 mb-3">
                                <button
                                    onClick={() => setWorldPacing('crisis')}
                                    className={`px-2 py-1.5 rounded-lg text-[10px] font-medium border transition-all active:scale-95 ${worldPacing === 'crisis' ? 'bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/30' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                                >危机驱动</button>
                                <button
                                    onClick={() => setWorldPacing('open')}
                                    className={`px-2 py-1.5 rounded-lg text-[10px] font-medium border transition-all active:scale-95 ${worldPacing === 'open' ? 'bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/30' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}
                                >开放式冒险</button>
                            </div>

                            {/* 额外灵感输入 (可选，开放式冒险下更需要具体设定) */}
                            <input
                                value={worldIdea}
                                onChange={e => setWorldIdea(e.target.value)}
                                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/25 focus:border-purple-400/60 outline-none transition-all mb-3"
                                placeholder={worldPacing === 'open' ? '开放式冒险建议写明具体设定，如：异世界日常、田园治愈生活' : '再补充点想法？(可选，如：主角是失忆的赏金猎人)'}
                            />

                            <button
                                onClick={handleGenerateWorld}
                                disabled={isGeneratingWorld}
                                className="w-full text-xs font-bold py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60 shadow-lg shadow-purple-500/20"
                            >
                                {isGeneratingWorld ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 正在生成「{worldStyle}」世界...</> : <>生成世界观</>}
                            </button>
                        </div>
                    </div>

                    {/* 规则系统 */}
                    <div>
                        <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider block mb-2">规则系统</label>
                        <div className="space-y-2">
                            {RULE_SYSTEM_LIST.map(rs => {
                                const active = newRuleSystem === rs.id;
                                return (
                                    <button
                                        key={rs.id}
                                        onClick={() => { setNewRuleSystem(rs.id); setNewCharacterSheets({}); setNewFreeformSpecialSkills([]); }}
                                        className={`w-full text-left rounded-xl p-3 border transition-all active:scale-[0.99] ${active ? 'border-purple-400 bg-purple-500/15' : 'border-white/10 bg-white/5'}`}
                                    >
                                        <div className="text-sm font-bold text-white/90">{rs.name}</div>
                                        <div className="text-[10px] text-white/40 mt-0.5 leading-snug">{rs.tagline}</div>
                                    </button>
                                );
                            })}
                        </div>

                        {RULE_SYSTEMS[newRuleSystem].derivedNote && (
                            <div className="mt-2.5 text-[10px] text-white/50 leading-relaxed bg-black/30 rounded-xl p-3 border border-white/10">
                                {RULE_SYSTEMS[newRuleSystem].derivedNote}
                            </div>
                        )}

                        {/* 角色数值表：三种规则系统统一，按本场剧本单独生成，AI 参考人设+长期记忆分配数值，可手动微调。
                            自由叙事没有固定技能表，AI 会先按世界观原创 3~5 个特殊技能，再叠加固定的基础技能一起分配数值。 */}
                        <div className="mt-2.5 rounded-xl border border-white/10 bg-white/5 p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-white/70">角色数值表（可选）</span>
                                <button
                                    onClick={handleGenerateCharacterSheets}
                                    disabled={isGeneratingSheets || selectedPlayers.size === 0 || !newWorld.trim()}
                                    className="text-[10px] text-purple-300 disabled:opacity-40"
                                >
                                    {isGeneratingSheets ? '生成中...' : (Object.keys(newCharacterSheets).length > 0 ? 'AI 重新生成' : 'AI 生成')}
                                </button>
                            </div>
                            {Object.keys(newCharacterSheets).length === 0 ? (
                                <p className="text-[10px] text-white/30 leading-relaxed">
                                    先填好世界观、选好队友，再点「AI 生成」——会参考每个角色的性格设定与长期记忆分配数值（比如设定偏弱气的角色，力量/格斗数值也会偏低）。
                                    {newRuleSystem === 'freeform' && '自由叙事没有固定技能表，AI 会先按世界观原创几个特殊技能，再一起分配数值。'}
                                </p>
                            ) : (
                                <div className="space-y-2.5">
                                    {newRuleSystem === 'freeform' && newFreeformSpecialSkills.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {newFreeformSpecialSkills.map(s => (
                                                <span key={s.key} className="px-2 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-[10px] text-cyan-200">{s.label}</span>
                                            ))}
                                        </div>
                                    )}
                                    {Object.entries(newCharacterSheets).map(([subjectId, entry]) => (
                                        <div key={subjectId} className="rounded-lg bg-black/30 border border-white/10 p-2.5">
                                            <div className="text-xs font-bold text-white/80 mb-1.5">{entry.name}</div>
                                            {entry.note && <div className="text-[9px] text-white/40 mb-2 leading-snug">{entry.note}</div>}
                                            {(RULE_SYSTEMS[newRuleSystem].characteristics || []).length > 0 && (
                                                <div className="grid grid-cols-4 gap-1.5 mb-1.5">
                                                    {(RULE_SYSTEMS[newRuleSystem].characteristics || []).map(c => (
                                                        <div key={c.key} className="flex flex-col items-center">
                                                            <span className="text-[8px] text-white/40 truncate w-full text-center" title={c.label}>{c.label.split(' ')[0]}</span>
                                                            <input
                                                                type="number"
                                                                value={entry.characteristics[c.key] ?? ''}
                                                                onChange={e => updateSheetValue(subjectId, 'characteristics', c.key, parseInt(e.target.value) || 0)}
                                                                className="w-full bg-white/5 border border-white/10 rounded px-1 py-1 text-[10px] text-white text-center"
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="grid grid-cols-4 gap-1.5">
                                                {(newRuleSystem === 'freeform' ? [...FREEFORM_BASIC_SKILLS, ...newFreeformSpecialSkills] : (RULE_SYSTEMS[newRuleSystem].skills || [])).map(s => (
                                                    <div key={s.key} className="flex flex-col items-center">
                                                        <span className="text-[8px] text-white/40 truncate w-full text-center" title={s.label}>{s.label.split(' ')[0]}</span>
                                                        <input
                                                            type="number"
                                                            value={entry.skills[s.key] ?? ''}
                                                            onChange={e => updateSheetValue(subjectId, 'skills', s.key, parseInt(e.target.value) || 0)}
                                                            className="w-full bg-white/5 border border-white/10 rounded px-1 py-1 text-[10px] text-white text-center"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {newRuleSystem === 'freeform' && (
                            <div className="mt-2.5 space-y-3">
                                {/* 自定义骰子机制 */}
                                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-medium text-white/70">骰子机制</span>
                                        <button onClick={() => setShowCustomDice(v => !v)} className="text-[10px] text-purple-300">{showCustomDice ? '收起自定义' : '自定义'}</button>
                                    </div>
                                    <div className="grid grid-cols-4 gap-1.5">
                                        {DICE_PRESETS.map(d => {
                                            const active = newDiceConfig.label === d.label;
                                            return (
                                                <button
                                                    key={d.label}
                                                    onClick={() => { setNewDiceConfig(d); setShowCustomDice(false); }}
                                                    className={`px-1 py-1.5 rounded-lg text-[10px] font-mono border transition-all active:scale-95 ${active ? 'bg-purple-500 text-white border-purple-400' : 'bg-white/5 text-white/50 border-white/10'}`}
                                                >{d.label}</button>
                                            );
                                        })}
                                    </div>
                                    {showCustomDice && (
                                        <div className="mt-2.5 flex items-center gap-2">
                                            <input type="number" min={1} max={10} value={customDiceCount} onChange={e => setCustomDiceCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} className="w-14 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-center" />
                                            <span className="text-white/40 text-xs">D</span>
                                            <input type="number" min={2} max={100} value={customDiceSides} onChange={e => setCustomDiceSides(Math.max(2, Math.min(100, parseInt(e.target.value) || 20)))} className="w-14 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white text-center" />
                                            <select value={customDiceMode} onChange={e => setCustomDiceMode(e.target.value as any)} className="flex-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white">
                                                <option value="high-good">越高越好</option>
                                                <option value="low-good">越低越好</option>
                                            </select>
                                            <button
                                                onClick={() => setNewDiceConfig({ count: customDiceCount, sides: customDiceSides, successMode: customDiceMode, label: `${customDiceCount}D${customDiceSides}` })}
                                                className="px-3 py-1.5 rounded-lg bg-purple-500 text-white text-[10px] font-bold"
                                            >应用</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 画风主题 */}
                    <div>
                        <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider block mb-2">画风主题</label>
                        <div className="grid grid-cols-4 gap-2">
                            {(['fantasy', 'cyber', 'horror', 'modern'] as GameTheme[]).map(t => {
                                const meta = THEME_META[t];
                                const active = newTheme === t;
                                return (
                                    <button key={t} onClick={() => setNewTheme(t)} className={`relative overflow-hidden rounded-xl py-4 flex flex-col items-center gap-0.5 border transition-all active:scale-95 ${active ? 'border-white/60 ring-1 ring-white/40' : 'border-white/10'}`}>
                                        <div className={`absolute inset-0 bg-gradient-to-br ${meta.gradient} ${active ? 'opacity-90' : 'opacity-40'} transition-opacity`}></div>
                                        <span className="relative text-sm font-bold tracking-wide">{meta.label}</span>
                                        <span className="relative text-[8px] font-mono tracking-[0.2em] opacity-70">{meta.en}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* DM 风格 */}
                    <div>
                        <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider block mb-2">DM 风格</label>
                        <div className="grid grid-cols-2 gap-2.5">
                            {(['default', 'comedy', 'horror', 'romance'] as DmStyle[]).map(s => {
                                const meta = DM_STYLE_META[s];
                                const active = newDmStyle === s;
                                return (
                                    <button key={s} onClick={() => setNewDmStyle(s)} className={`text-left p-3 rounded-xl border transition-all active:scale-95 ${active ? 'border-purple-400 bg-purple-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                                        <div className={`text-xs font-bold mb-0.5 ${active ? 'text-purple-200' : 'text-white/80'}`}>{meta.label}</div>
                                        <div className={`text-[9px] mb-1.5 ${active ? 'text-purple-300/80' : 'text-white/50'}`}>{meta.tagline}</div>
                                        <div className={`text-[9px] leading-relaxed ${active ? 'text-white/60' : 'text-white/40'}`}>{meta.desc}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 玩法设置 */}
                    <div>
                        <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider block mb-2">玩法设置</label>
                        <div className="rounded-2xl border border-white/10 bg-white/5 divide-y divide-white/10">
                            {/* 骰子开关 */}
                            <div className="flex items-center justify-between p-4">
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium flex items-center gap-1.5"><DiceFive size={16} weight="fill" /> 骰子判定 ({newRuleSystem === 'freeform' ? newDiceConfig.label : RULE_SYSTEMS[newRuleSystem].dice.label})</span>
                                    <span className="text-[10px] text-white/40 mt-0.5">{newDiceDisabled ? '已关闭：行动默认直接成功' : '开启：每次行动自动骰点定成败'}</span>
                                </div>
                                <button
                                    onClick={() => setNewDiceDisabled(v => !v)}
                                    role="switch"
                                    aria-checked={!newDiceDisabled}
                                    className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${newDiceDisabled ? 'bg-white/15' : 'bg-emerald-500'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${newDiceDisabled ? '' : 'translate-x-6'}`}></span>
                                </button>
                            </div>

                            {/* 归档模式 */}
                            <div className="p-4">
                                <div className="flex items-center gap-1.5 mb-2.5">
                                    <span className="text-sm font-medium">归档模式</span>
                                    <button onClick={() => setShowArchiveHelp(v => !v)} className="w-4 h-4 rounded-full border border-white/30 text-white/50 text-[10px] leading-none flex items-center justify-center hover:bg-white/10 transition-colors">?</button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setNewArchiveMode('auto')}
                                        className={`rounded-xl p-2.5 text-left border transition-all active:scale-95 ${newArchiveMode === 'auto' ? 'border-purple-400 bg-purple-500/15' : 'border-white/10 bg-white/5'}`}
                                    >
                                        <div className="text-xs font-bold">自动归档</div>
                                        <div className="text-[9px] text-white/40 mt-0.5 leading-snug">满20条总结，并同步进角色聊天</div>
                                    </button>
                                    <button
                                        onClick={() => setNewArchiveMode('manual')}
                                        className={`rounded-xl p-2.5 text-left border transition-all active:scale-95 ${newArchiveMode === 'manual' ? 'border-purple-400 bg-purple-500/15' : 'border-white/10 bg-white/5'}`}
                                    >
                                        <div className="text-xs font-bold">手动归档</div>
                                        <div className="text-[9px] text-white/40 mt-0.5 leading-snug">满20条总结，但不进角色聊天</div>
                                    </button>
                                </div>
                                {showArchiveHelp && (
                                    <div className="mt-2.5 text-[10px] text-white/50 leading-relaxed bg-black/30 rounded-xl p-3 space-y-1.5 border border-white/10">
                                        <p>两种模式都会<b className="text-white/70">每满 20 条剧情自动总结一次</b>，总结会一直保留在游戏的前情提要里，GM 也会一直记得。区别只在于：</p>
                                        <p><b className="text-purple-300">自动归档</b>：每次总结会<b className="text-white/70">立即同步到参与角色的聊天 App</b>（角色会"记得"和你跑过团）。</p>
                                        <p><b className="text-purple-300">手动归档</b>：自动总结<b className="text-white/70">不会</b>打扰角色的聊天，只有你在菜单里点「归档记忆并退出」时，才把整段经历送进角色聊天。</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 邀请玩家 */}
                    <div>
                        <label className="text-[11px] font-bold text-white/40 uppercase tracking-wider block mb-2 flex items-center justify-between">
                            <span>邀请队友</span>
                            {selectedPlayers.size > 0 && <span className="text-purple-300 normal-case font-mono">已选 {selectedPlayers.size} 人</span>}
                        </label>
                        {characters.length === 0 ? (
                            <p className="text-xs text-white/30 py-4 text-center bg-white/5 rounded-xl border border-white/10">还没有角色，先去创建角色吧</p>
                        ) : (
                            <>
                            {/* 分组筛选（没建分组时不渲染）：只影响可选项的显示，不影响已勾选队友 */}
                            <CharacterGroupFilterBar characters={characters} groups={characterGroups} dark value={playerGroupId} onChange={setPlayerGroupId} className="mb-2.5" />
                            {playerChars.length === 0 ? (
                                <p className="text-xs text-white/30 py-4 text-center bg-white/5 rounded-xl border border-white/10">该分组下没有角色</p>
                            ) : (
                            <div className="grid grid-cols-4 gap-3">
                                {playerChars.map(c => {
                                    const sel = selectedPlayers.has(c.id);
                                    return (
                                        <div key={c.id} onClick={() => { const s = new Set(selectedPlayers); if(s.has(c.id)) s.delete(c.id); else s.add(c.id); setSelectedPlayers(s); }} className={`flex flex-col items-center p-2 rounded-2xl border cursor-pointer transition-all active:scale-95 ${sel ? 'border-purple-400 bg-purple-500/15' : 'border-white/5 hover:bg-white/5'}`}>
                                            <div className="relative">
                                                <img src={c.avatar} className={`w-12 h-12 rounded-full object-cover transition-all ${sel ? 'ring-2 ring-purple-400 ring-offset-2 ring-offset-[#0a0a0a]' : 'opacity-80'}`} />
                                                {sel && <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center border-2 border-[#0a0a0a]"><svg viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5 text-white"><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" /></svg></div>}
                                            </div>
                                            <span className={`text-[9px] mt-2 truncate w-full text-center font-medium ${sel ? 'text-purple-200' : 'text-white/50'}`}>{c.name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            )}
                            </>
                        )}
                    </div>
                </div>

                {/* 底部开始按钮 */}
                <div className="p-4 pb-[calc(1rem+var(--safe-bottom,0px))] border-t border-white/5 bg-black/40 backdrop-blur-md z-10 space-y-2.5">
                    <button
                        onClick={handleGenerateCharacterSheets}
                        disabled={isGeneratingSheets || selectedPlayers.size === 0 || !newWorld.trim()}
                        className="w-full py-3.5 font-bold rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-cyan-500/30 disabled:opacity-40 disabled:grayscale"
                    >
                        {isGeneratingSheets
                            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 生成中...</>
                            : <><IdentificationCard size={18} /> {Object.keys(newCharacterSheets).length > 0 ? '重新生成角色数值表（可选）' : '生成角色数值表（可选）'}</>}
                    </button>
                    <button
                        onClick={handleCreateGame}
                        disabled={isCreating || !canStart}
                        className={`w-full py-3.5 font-bold rounded-2xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${canStart ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-purple-500/30' : 'bg-white/10 text-white/30'}`}
                    >
                        {isCreating ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 生成序章...</> : <><RocketLaunch size={18} /> 开始冒险</>}
                    </button>
                </div>
            </div>
        );
    }

    // 3. Play View
    if (!activeGame) return null;
    const theme = GAME_THEMES[activeGame.theme];
    const activePlayers = characters.filter(c => activeGame.playerCharIds.includes(c.id));
    // 自由叙事的技能表 = 固定基础技能 + 本场存档里 AI 原创的特殊技能，展示用（避免技能名回退成原始 key）
    const playRuleSystemDef = activeGame.ruleSystem === 'freeform'
        ? { ...RULE_SYSTEMS.freeform, skills: [...FREEFORM_BASIC_SKILLS, ...(activeGame.freeformSpecialSkills || [])] }
        : RULE_SYSTEMS[activeGame.ruleSystem || 'freeform'];
    const playerDeadCharIds = new Set(activeGame.deadCharIds || []);
    const playerVitals = getCharacterVitals('__player__', activeGame.characterVitals, activeGame.status.health, activeGame.status.sanity);
    const playerIsDead = playerDeadCharIds.has('__player__');
    const playerIsUnconscious = !playerIsDead && playerVitals.health <= 0;
    // 玩家死亡/昏迷时不能再正常行动，只能旁观（发言走皮下吐槽面板，不进主线）
    const playerCanAct = !playerIsDead && !playerIsUnconscious;

    // Stats HUD 当前显示的是谁：点 Party HUD 头像切换，不再弹悬浮窗
    const selectedStatusChar = selectedStatusCharId === '__player__' ? null : activePlayers.find(p => p.id === selectedStatusCharId);
    const selectedStatusName = selectedStatusCharId === '__player__' ? userProfile.name : (selectedStatusChar?.name || userProfile.name);
    const selectedStatusVitals = getCharacterVitals(selectedStatusCharId, activeGame.characterVitals, activeGame.status.health, activeGame.status.sanity);
    const selectedStatusIsDead = playerDeadCharIds.has(selectedStatusCharId);

    // Party HUD 头像角标：颜色随 HP 状态变化，死亡显示骷髅图标而不是色点
    const vitalStatusDot = (health: number, isDead: boolean) => {
        const state = computeVitalState(health, isDead);
        if (state === 'dead') {
            return (
                <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-black rounded-full border-2 border-black/50 shadow-sm flex items-center justify-center">
                    <SkullIcon size={9} weight="fill" className="text-white/80" />
                </div>
            );
        }
        const dotColor = state === 'unconscious' ? 'bg-slate-400' : state === 'critical' ? 'bg-red-500' : state === 'wounded' ? 'bg-orange-400' : 'bg-green-500';
        const pulse = state === 'critical' || state === 'unconscious' ? 'animate-pulse' : '';
        return <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 ${dotColor} rounded-full border-2 border-black/50 shadow-sm ${pulse}`}></div>;
    };

    // 顶栏：主剧情视图和聊天室视图共用同一份（标题/Token统计/角色数值表/Party HUD开关/剧情-聊天室胶囊/设置菜单），
    // 聊天室不是"退出游戏的小窗"，是跟主线并列的同级视图，因此顶栏结构必须完全一致，只是胶囊高亮的那一侧不同
    const renderTopBar = () => (
        <div className={`border-b ${theme.border} shrink-0 bg-opacity-90 backdrop-blur z-20 relative`} style={{ paddingTop: 'var(--safe-top)' }}>
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                    <button onClick={handleLeave} className={`p-2 -ml-2 rounded hover:bg-white/10 active:scale-95 transition-transform`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
                    </button>
                    <div className="flex flex-col mb-0.5">
                        <span className="font-bold text-sm tracking-wide line-clamp-1 max-w-[150px]">{activeGame.title}</span>
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] opacity-60 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                {activeGame.status.location}
                            </span>
                            {lastTokenUsage && <span className="text-[8px] opacity-40 font-mono inline-flex items-center gap-0.5" title={`Prompt: ${lastTokenUsage.prompt || '?'} | Completion: ${lastTokenUsage.completion || '?'} | Total session: ${totalTokensUsed}`}><Lightning size={10} weight="fill" />{lastTokenUsage.prompt || '?'}/{lastTokenUsage.completion || '?'} (∑{totalTokensUsed})</span>}
                        </div>
                    </div>
                </div>

                <div className="flex gap-1 mb-1">
                    {/* 角色数值表入口：只有生成过数值表才显示，局内一目可见 */}
                    {activeGame.characterSheets && Object.keys(activeGame.characterSheets).length > 0 && (
                        <button onClick={() => setShowSheetModal(true)} className={`p-2 rounded hover:bg-white/10 active:scale-95 transition-transform ${theme.accent}`} title="查看角色数值表">
                            <IdentificationCard size={22} weight="fill" />
                        </button>
                    )}
                    {/* 运势面板/高光时刻：纯从 logs 派生，剧情/聊天室视图都能打开 */}
                    <button onClick={() => setShowStatsModal(true)} className={`p-2 rounded hover:bg-white/10 active:scale-95 transition-transform ${theme.accent}`} title="本场运势 / 高光时刻">
                        <Trophy size={22} weight="fill" />
                    </button>
                    {/* Toggle Party HUD：聊天室里没有 Party HUD 面板，这个按钮在聊天室视图置灰不可用 */}
                    <button
                        onClick={() => setShowParty(!showParty)}
                        disabled={playSubView === 'chatroom'}
                        className={`p-2 rounded hover:bg-white/10 active:scale-95 transition-transform ${playSubView === 'chatroom' ? 'opacity-30 cursor-not-allowed' : (showParty ? theme.accent : 'opacity-50')}`}
                        title={playSubView === 'chatroom' ? '聊天室无队伍面板' : '显示/隐藏队伍面板'}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" /></svg>
                    </button>
                    {/* 剧情/聊天室切换：常驻显示，纯粹是视图切换，不碰 oocEnabled——
                        是否开启"自动生成吐槽"这个功能开关，收在聊天室视图里自己管，点这个胶囊不会顺手帮用户改功能开关状态
                        （否则"点开关掉、点剧情又自动开回来"这种隔壁按钮打架的体验会很怪，而且看历史记录时也不该被迫重新开启）。 */}
                    <div className={`flex items-center rounded-full border ${theme.border} bg-black/20 p-0.5 text-[10px] font-bold mr-1`}>
                        <button onClick={() => setPlaySubView('game')} className={`px-3 py-1.5 rounded-full transition-all active:scale-95 ${playSubView === 'game' ? `bg-white/10 ${theme.accent}` : 'opacity-60 hover:opacity-90'}`}>剧情</button>
                        <button onClick={() => setPlaySubView('chatroom')} className={`relative px-3 py-1.5 rounded-full transition-all active:scale-95 flex items-center gap-1 ${playSubView === 'chatroom' ? `bg-white/10 ${theme.accent}` : 'opacity-60 hover:opacity-90'}`} title="聊天室（皮下吐槽）">
                            聊天室
                            {isOocLoading && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>}
                        </button>
                    </div>
                    <button onClick={() => setShowSystemMenu(true)} className={`p-2 -mr-2 rounded hover:bg-white/10 active:scale-95 transition-transform`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
                    </button>
                </div>
            </div>
        </div>
    );

    // 系统菜单/数值表/删除确认三个 Modal 及归档/总结全屏遮罩：剧情视图和聊天室视图都要能弹出，
    // 提出来公用一份，避免之前聊天室视图 return 分支里完全没挂这些 Modal，点顶栏按钮没反应的问题。
    const renderSharedModalsAndOverlays = () => (
        <>
            {/* System Menu Modal */}
            <Modal isOpen={showSystemMenu} title="系统菜单" onClose={() => setShowSystemMenu(false)}>
                <div className="space-y-4">
                    {/* UI Settings */}
                    <div className="bg-slate-100 p-3 rounded-xl">
                        <label className="text-xs text-slate-500 font-bold mb-3 block border-b border-slate-200 pb-1">阅读设置 (Display)</label>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400 w-8">字号</span>
                                <input
                                    type="range"
                                    min="12"
                                    max="24"
                                    step="1"
                                    value={uiSettings.fontSize}
                                    onChange={e => setUiSettings({...uiSettings, fontSize: parseInt(e.target.value)})}
                                    className="flex-1 h-1.5 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                />
                                <span className="text-xs font-mono text-slate-600 w-6 text-right">{uiSettings.fontSize}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-slate-400 w-8">颜色</span>
                                <input
                                    type="color"
                                    value={uiSettings.color || '#e5e5e5'}
                                    onChange={e => setUiSettings({...uiSettings, color: e.target.value})}
                                    className="w-full h-8 rounded cursor-pointer bg-white border border-slate-200 p-0.5"
                                />
                            </div>
                            <button onClick={() => setUiSettings({ fontSize: 14, color: '' })} className="w-full py-1.5 bg-white border border-slate-200 text-slate-500 text-xs rounded-lg active:scale-95 transition-transform">恢复默认</button>
                        </div>
                    </div>

                    {/* 玩法设置 */}
                    <div className="bg-slate-100 p-3 rounded-xl">
                        <label className="text-xs text-slate-500 font-bold mb-3 block border-b border-slate-200 pb-1">玩法设置 (Gameplay)</label>
                        <div className="text-[10px] text-slate-400 mb-2 flex items-center justify-between">
                            <span>规则系统：{playRuleSystemDef.name}</span>
                            {activeGame.characterSheets && Object.keys(activeGame.characterSheets).length > 0 && (
                                <button onClick={() => setShowSheetsInMenu(v => !v)} className="text-slate-500 underline">{showSheetsInMenu ? '收起数值表' : '查看数值表'}</button>
                            )}
                        </div>
                        <div className="text-[10px] text-slate-400 mb-2">DM 风格：{DM_STYLE_META[activeGame.dmStyle || 'default'].label}（开团后不可更改）</div>
                        <div className="text-[10px] text-slate-400 mb-2">叙事节奏：{(activeGame.worldPacing || 'crisis') === 'open' ? '开放式冒险' : '危机驱动'}（开团后不可更改）</div>
                        {showSheetsInMenu && activeGame.characterSheets && (
                            <div className="mb-3 space-y-1.5">
                                {Object.values(activeGame.characterSheets).map(entry => (
                                    <div key={entry.name} className="bg-white rounded-lg p-2 text-[10px] text-slate-600 leading-snug">
                                        <span className="font-bold text-slate-700">{entry.name}</span>
                                        {' '}{Object.entries(entry.characteristics).map(([k, v]) => `${(playRuleSystemDef.characteristics || []).find(c => c.key === k)?.label.split(' ')[0] || k}${v}`).join(' ')}
                                        <br />{Object.entries(entry.skills).map(([k, v]) => `${(playRuleSystemDef.skills || []).find(s => s.key === k)?.label.split(' ')[0] || k}${v}`).join('、')}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-sm text-slate-700 font-medium flex items-center gap-1.5"><DiceFive size={16} weight="fill" /> 骰子判定 ({resolveDiceConfig(activeGame).label})</span>
                                <span className="text-[10px] text-slate-400 mt-0.5">关闭后，每次行动不再自动骰点</span>
                            </div>
                            <button
                                onClick={toggleDice}
                                role="switch"
                                aria-checked={!activeGame.diceDisabled}
                                className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${activeGame.diceDisabled ? 'bg-slate-300' : 'bg-emerald-500'}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${activeGame.diceDisabled ? '' : 'translate-x-6'}`}></span>
                            </button>
                        </div>
                    </div>
                    {/* 聊天室（皮下吐槽）的开关+生成方式已经整个搬进聊天室视图本身管理，这里不再重复放一份，
                        免得两处状态各显示一套、改了一处另一处没同步的错觉 */}

                    <button onClick={handleArchiveAndQuit} className="w-full py-3 bg-emerald-500 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2">
                        <FloppyDisk size={18} /> 归档记忆并退出
                    </button>
                    <button onClick={handleRestart} className="w-full py-3 bg-orange-500 text-white font-bold rounded-2xl shadow-lg flex items-center justify-center gap-2">
                        <ArrowsClockwise size={18} /> 重置当前游戏
                    </button>
                    <button onClick={handleLeave} className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl flex items-center justify-center gap-2">
                        <DoorOpen size={18} /> 暂时离开 (不归档)
                    </button>
                </div>
            </Modal>

            {/* 角色数值表 Modal：局内一键可见，不用再钻进系统菜单里找 */}
            <Modal isOpen={showSheetModal} title={`角色数值表 · ${playRuleSystemDef.name}`} onClose={() => setShowSheetModal(false)}>
                <div className="space-y-2.5">
                    {activeGame.characterSheets && Object.values(activeGame.characterSheets).map(entry => (
                        <div key={entry.name} className="bg-slate-100 rounded-xl p-3">
                            <div className="text-sm font-bold text-slate-700 mb-1.5">{entry.name}</div>
                            {entry.note && <div className="text-[10px] text-slate-400 mb-2 leading-snug">{entry.note}</div>}
                            <div className="grid grid-cols-4 gap-1.5 mb-1.5">
                                {(playRuleSystemDef.characteristics || []).map(c => (
                                    <div key={c.key} className="flex flex-col items-center bg-white rounded-lg p-1.5 border border-slate-200">
                                        <span className="text-[8px] text-slate-400 truncate w-full text-center" title={c.label}>{c.label.split(' ')[0]}</span>
                                        <span className="text-xs font-mono font-bold text-slate-700">{entry.characteristics[c.key] ?? '-'}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                                {(playRuleSystemDef.skills || []).map(s => (
                                    <div key={s.key} className="flex flex-col items-center bg-white rounded-lg p-1.5 border border-slate-200">
                                        <span className="text-[8px] text-slate-400 truncate w-full text-center" title={s.label}>{s.label.split(' ')[0]}</span>
                                        <span className="text-xs font-mono font-bold text-slate-700">{entry.skills[s.key] ?? '-'}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </Modal>

            {/* 运势面板 / 高光时刻 Modal：纯从 logs 派生，两个 tab 切换。
                样式参考常见 TRPG 骰点统计/抽卡记录类 App 的排行榜（podium 名次徽章 + 堆叠条形图）与 timeline 卡片feed，
                去掉了初版的 emoji + 5 列格子平铺，改用跟 Party HUD 一致的头像 + 图标语言，视觉上跟局内其它面板统一。 */}
            <Modal isOpen={showStatsModal} title="本场战绩" onClose={() => setShowStatsModal(false)}>
                <div className="flex items-center rounded-full bg-slate-100 p-1 text-xs font-bold mb-4">
                    <button onClick={() => setStatsTab('fortune')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-full transition-all ${statsTab === 'fortune' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-400'}`}>
                        <ChartBar size={14} weight="bold" /> 运势面板
                    </button>
                    <button onClick={() => setStatsTab('highlights')} className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-full transition-all ${statsTab === 'highlights' ? 'bg-white shadow-sm text-purple-600' : 'text-slate-400'}`}>
                        <Sparkle size={14} weight="bold" /> 高光时刻
                    </button>
                </div>
                {statsTab === 'fortune' && (() => {
                    const stats = computeFortuneStats(activeGame.logs);
                    if (stats.length === 0) return <p className="text-sm text-slate-400 text-center py-10">还没有正式判定，运势未知</p>;
                    const avatarForName = (name: string): string | undefined =>
                        name === userProfile.name ? userProfile.avatar : activePlayers.find(p => p.name === name)?.avatar;
                    const hasSpread = stats.length > 1 && stats[0].luckScore !== stats[stats.length - 1].luckScore;
                    const rankBadge = (idx: number) => {
                        if (idx === 0) return <span className="w-6 h-6 rounded-full bg-yellow-400 text-white flex items-center justify-center shrink-0"><Crown size={12} weight="fill" /></span>;
                        if (idx === 1) return <span className="w-6 h-6 rounded-full bg-slate-300 text-white text-[11px] font-bold flex items-center justify-center shrink-0">2</span>;
                        if (idx === 2) return <span className="w-6 h-6 rounded-full bg-orange-300 text-white text-[11px] font-bold flex items-center justify-center shrink-0">3</span>;
                        return <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 text-[11px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>;
                    };
                    return (
                        <div className="space-y-2.5">
                            {stats.map((s, idx) => {
                                const avatar = avatarForName(s.name);
                                const segments = [
                                    { count: s.criticalSuccess, color: 'bg-yellow-400' },
                                    { count: s.success, color: 'bg-emerald-400' },
                                    { count: s.partial, color: 'bg-slate-300' },
                                    { count: s.failure, color: 'bg-orange-400' },
                                    { count: s.criticalFailure, color: 'bg-red-400' },
                                ].filter(seg => seg.count > 0);
                                return (
                                    <div key={s.name} className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm">
                                        <div className="flex items-center gap-2 mb-2.5">
                                            {rankBadge(idx)}
                                            {avatar ? (
                                                <img src={avatar} className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0" />
                                            ) : (
                                                <span className="w-7 h-7 rounded-full bg-slate-100 shrink-0" />
                                            )}
                                            <span className="font-bold text-sm text-slate-700 truncate">{s.name}</span>
                                            {hasSpread && idx === 0 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-bold shrink-0">本场最欧</span>}
                                            {hasSpread && idx === stats.length - 1 && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-500 font-bold shrink-0">本场最非</span>}
                                            <span className="text-[10px] text-slate-400 font-mono ml-auto shrink-0">{s.total} 次</span>
                                        </div>
                                        <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 mb-2">
                                            {segments.map((seg, i) => (
                                                <div key={i} className={seg.color} style={{ width: `${(seg.count / s.total) * 100}%` }} />
                                            ))}
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-slate-400">
                                                大成功{s.criticalSuccess} · 成功{s.success} · 部分{s.partial} · 失败{s.failure} · 大失败{s.criticalFailure}
                                            </span>
                                            <span className={`text-[10px] font-mono font-bold shrink-0 ${s.luckScore > 0.5 ? 'text-yellow-600' : s.luckScore < -0.5 ? 'text-red-500' : 'text-slate-400'}`}>
                                                {s.luckScore > 0 ? '+' : ''}{s.luckScore.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
                {statsTab === 'highlights' && (() => {
                    const moments = computeHighlightMoments(activeGame.logs);
                    if (moments.length === 0) return <p className="text-sm text-slate-400 text-center py-10">还没有大成功/大失败，平平无奇</p>;
                    return (
                        <div className="space-y-2.5">
                            {moments.map(m => {
                                const isCrit = m.tier === 'critical_success';
                                return (
                                    <div key={m.id} className={`rounded-2xl p-3.5 border ${isCrit ? 'bg-yellow-50/60 border-yellow-200' : 'bg-red-50/60 border-red-200'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isCrit ? 'bg-yellow-400 text-white' : 'bg-red-400 text-white'}`}>
                                                {isCrit ? <Fire size={14} weight="fill" /> : <SkullTombstone size={14} weight="fill" />}
                                            </span>
                                            <span className="font-bold text-sm text-slate-700 truncate">{m.speakerName}</span>
                                            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${isCrit ? 'bg-yellow-400 text-white' : 'bg-red-400 text-white'}`}>
                                                {CHECK_TIER_LABELS[m.tier]}
                                            </span>
                                        </div>
                                        {(m.check || m.outcome) && (
                                            <div className="text-[10px] text-slate-400 mb-1.5">
                                                {m.check && <>判定：{m.check}</>}{m.check && m.outcome && ' · '}{m.outcome}
                                            </div>
                                        )}
                                        {/* 之前用 line-clamp-3 会把长文本硬截断，改成不截断 + 允许换行，完整展示 */}
                                        <div className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap break-words">{m.content}</div>
                                    </div>
                                );
                            })}
                        </div>
                    );
                })()}
            </Modal>

            {/* Delete Save Confirm Modal */}
            <Modal isOpen={!!deleteConfirmId} title="删除存档" onClose={() => setDeleteConfirmId(null)} footer={
                <div className="flex gap-3 w-full">
                    <button onClick={() => setDeleteConfirmId(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl">取消</button>
                    <button onClick={confirmDeleteGame} className="flex-1 py-3 bg-red-500 text-white font-bold rounded-2xl shadow-lg shadow-red-200">删除</button>
                </div>
            }>
                <p className="text-sm text-slate-600 text-center py-4">确定要删除这个存档吗？<br/><span className="text-xs text-red-400 mt-1 block">此操作不可恢复。</span></p>
            </Modal>

            {/* Archive Overlay */}
            {isArchiving && (
                <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center text-white flex-col gap-4 animate-fade-in">
                    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs tracking-widest font-mono">正在传递记忆...</span>
                </div>
            )}

            {/* Auto-Summary Overlay (每 20 条自动总结的全屏反馈) */}
            {isSummarizing && (
                <div className="absolute inset-0 bg-black/85 z-50 flex items-center justify-center text-white flex-col gap-5 animate-fade-in px-8 text-center">
                    <div className="w-10 h-10 border-4 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-sm tracking-widest font-bold">正在总结前文内容…</span>
                    <span className="text-[11px] opacity-50 font-mono leading-relaxed">归档剧情 · 提炼起因经过结果 · 记录人物关系变化</span>
                </div>
            )}
        </>
    );

    // 3b. 聊天室（皮下吐槽）全屏视图：跟主线剧情并列的独立视图，不是弹窗。风格跟随当前跑团主题
    if (playSubView === 'chatroom') {
        return (
            <div className={`h-full w-full relative flex flex-col ${theme.bg} ${theme.text} ${theme.font} transition-colors duration-500 overflow-hidden`}>
                {renderTopBar()}

                {/* 聊天室顶部：功能说明 + 启用开关 + 生成模式选择，这三项原本埋在系统菜单里，现在整体搬到这里在聊天室视图内集中管理 */}
                <div className={`px-4 py-3 border-b ${theme.border} bg-black/10 backdrop-blur-sm z-10 shrink-0 space-y-2`}>
                    <div className="text-[10px] opacity-60 text-center">
                        皮下吐槽 · 大家退出游戏状态后的真实闲聊，不进主线剧情
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className={`${activeGame.oocEnabled ? 'opacity-80' : 'opacity-50'}`}>
                            {activeGame.oocEnabled ? '每回合结束自动生成吐槽' : '当前已关闭自动生成'}
                        </span>
                        <button
                            onClick={toggleOoc}
                            role="switch"
                            aria-checked={!!activeGame.oocEnabled}
                            className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${activeGame.oocEnabled ? 'bg-emerald-500' : 'bg-white/20'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${activeGame.oocEnabled ? 'translate-x-5' : ''}`}></span>
                        </button>
                    </div>
                    {activeGame.oocEnabled && (
                        <div className="flex items-center justify-between gap-2 text-[10px] pt-1 border-t border-white/10">
                            <span className="opacity-60">
                                生成方式：{(activeGame.oocCallMode || 'individual') === 'batch' ? '一次性生成所有人（省调用，快）' : '逐角色独立（防串记忆，准）'}
                            </span>
                            <button
                                onClick={toggleOocCallMode}
                                className="px-2 py-1 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 transition-all shrink-0 opacity-80"
                            >
                                切换
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {(!activeGame.oocLogs || activeGame.oocLogs.length === 0) && (
                        <p className="text-xs opacity-40 text-center py-10">还没有人吐槽过，回合结束后可能会有人开口，你也可以先发一条。</p>
                    )}
                    {(activeGame.oocLogs || []).map(o => {
                        const isPlayerMsg = o.charId === '__player__';
                        const isDeadSpeaker = playerDeadCharIds.has(o.charId);
                        const isSelected = selectedOocIds.has(o.id);
                        return (
                            <div
                                key={o.id}
                                onClick={() => { if (oocSelectMode) toggleSelectOoc(o.id); }}
                                className={`flex gap-2 ${isPlayerMsg ? 'flex-row-reverse' : ''} ${oocSelectMode ? `cursor-pointer rounded-xl px-1 transition-all ${isSelected ? 'ring-2 ring-purple-400 bg-purple-500/10' : 'hover:bg-white/[0.03]'}` : ''}`}
                            >
                                {oocSelectMode && (
                                    <div className={`shrink-0 self-center w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'bg-purple-500 border-purple-400' : 'border-white/40 bg-black/40'}`}>
                                        {isSelected && <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z" clipRule="evenodd"/></svg>}
                                    </div>
                                )}
                                <div className={`max-w-[75%] ${oocSelectMode ? 'pointer-events-none select-none' : ''}`}>
                                    <div className={`text-[10px] opacity-50 mb-1 ${isPlayerMsg ? 'text-right' : ''}`}>
                                        {o.speakerName}{isDeadSpeaker && ' 💀'}
                                    </div>
                                    <div
                                        onPointerDown={() => startOocPress(o.id)}
                                        onPointerUp={cancelOocPress}
                                        onPointerLeave={cancelOocPress}
                                        onPointerCancel={cancelOocPress}
                                        className={`text-xs px-3 py-2 rounded-2xl border select-none ${theme.border} ${isPlayerMsg ? `bg-white/10 ${theme.accent} font-medium` : `${theme.cardBg} ${theme.text}`}`}
                                    >
                                        {o.replyTo && (
                                            <div className="mb-1 text-[10px] bg-black/10 p-1.5 rounded-md border-l-2 border-current opacity-60 flex flex-col gap-0.5 max-w-full overflow-hidden">
                                                <span className="font-bold opacity-90 truncate">{o.replyTo.name}</span>
                                                <span className="truncate italic">"{o.replyTo.content}"</span>
                                            </div>
                                        )}
                                        {o.content}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {isOocLoading && <p className="text-[10px] opacity-40 text-center animate-pulse">有人在场外吐槽中...</p>}
                </div>

                {/* 多选批量操作栏，跟剧情视图的转发操作栏同一套交互，多了个批量删除 */}
                {oocSelectMode ? (
                    <div className={`p-4 pb-[calc(1rem+var(--safe-bottom,0px))] border-t ${theme.border} bg-black/50 backdrop-blur shrink-0 z-20 flex items-center gap-2 animate-slide-down`}>
                        <button onClick={exitOocSelectMode} className="px-4 h-11 rounded-xl border border-white/15 text-sm font-bold text-white/70 active:scale-95 transition-transform">取消</button>
                        <span className="text-xs text-white/50 flex-1 text-center">已选 {selectedOocIds.size} 条</span>
                        <button
                            onClick={handleOocBatchDelete}
                            disabled={selectedOocIds.size === 0}
                            className="px-4 h-11 rounded-xl bg-red-500/90 text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-40"
                        >
                            删除
                        </button>
                        <button
                            onClick={handleOocForwardToChat}
                            disabled={selectedOocIds.size === 0 || isOocForwarding}
                            className="px-5 h-11 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-purple-500/20"
                        >
                            {isOocForwarding ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 转发中...</> : '转发到聊天'}
                        </button>
                    </div>
                ) : (
                    <div className={`border-t ${theme.border} bg-opacity-90 backdrop-blur shrink-0 z-20`}>
                        {oocReplyingTo && (
                            <div className="flex items-center gap-2 px-4 pt-2 text-[10px] opacity-70">
                                <div className="flex-1 flex flex-col gap-0.5 bg-black/20 border-l-2 border-current rounded-md px-2 py-1 overflow-hidden">
                                    <span className="font-bold truncate">回复 {oocReplyingTo.name}</span>
                                    <span className="truncate italic">"{oocReplyingTo.content}"</span>
                                </div>
                                <button onClick={() => setOocReplyingTo(null)} className="shrink-0 px-2 py-1 opacity-60 hover:opacity-100">取消</button>
                            </div>
                        )}
                        <div className="p-4 pb-[calc(1rem+var(--safe-bottom,0px))] flex gap-2">
                            <input
                                value={oocInput}
                                onChange={e => setOocInput(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleOocSend(); }}
                                placeholder="场外吐槽两句..."
                                className={`flex-1 bg-black/20 border ${theme.border} rounded-xl px-3 py-3 outline-none text-sm placeholder-opacity-30 placeholder-current focus:bg-black/40 transition-colors`}
                            />
                            <button onClick={handleOocSend} className={`${theme.accent} font-bold text-sm px-4 h-12 bg-white/10 rounded-xl hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center`}>
                                发送
                            </button>
                        </div>
                    </div>
                )}

                {/* 聊天室消息长按菜单：引用 / 编辑内容 / 删除消息 / 进入多选，跟主线私聊的交互对齐 */}
                <Modal isOpen={oocModalType === 'options'} title="消息操作" onClose={() => setOocModalType('none')}>
                    <div className="space-y-3">
                        <button onClick={handleOocQuoteStart} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors">
                            引用
                        </button>
                        <button onClick={handleOocEnterSelectionMode} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors">
                            多选 / 批量删除
                        </button>
                        <button onClick={handleOocEditStart} className="w-full py-3 bg-slate-50 text-slate-700 font-medium rounded-2xl active:bg-slate-100 transition-colors">
                            编辑内容
                        </button>
                        <button onClick={handleOocDelete} className="w-full py-3 bg-red-50 text-red-500 font-medium rounded-2xl active:bg-red-100 transition-colors">
                            删除消息
                        </button>
                    </div>
                </Modal>

                <Modal
                    isOpen={oocModalType === 'edit'} title="编辑内容" onClose={() => setOocModalType('none')}
                    footer={<><button onClick={() => setOocModalType('none')} className="flex-1 py-3 bg-slate-100 rounded-2xl">取消</button><button onClick={confirmOocEdit} className="flex-1 py-3 bg-purple-500 text-white font-bold rounded-2xl">保存</button></>}
                >
                    <textarea
                        value={editOocContent}
                        onChange={e => setEditOocContent(e.target.value)}
                        className="w-full h-32 bg-slate-50 border border-slate-200 rounded-2xl p-3 text-sm text-slate-800 outline-none resize-none"
                    />
                </Modal>

                {renderSharedModalsAndOverlays()}
            </div>
        );
    }

    // [FIX] Changed from absolute inset-0 to h-full relative to fix overscroll and height layout issues
    return (
        <div className={`h-full w-full relative flex flex-col ${theme.bg} ${theme.text} ${theme.font} transition-colors duration-500 overflow-hidden`}>

            {renderTopBar()}

            {/* --- NEW: Party HUD (Collapsible) --- */}
            {showParty && (
                <div className={`flex gap-4 p-3 overflow-x-auto no-scrollbar border-b ${theme.border} bg-black/20 backdrop-blur-sm z-10 shrink-0 animate-slide-down`}>
                    {/* User Avatar */}
                    <div
                        className="relative group shrink-0 cursor-pointer active:scale-95 transition-transform"
                        onClick={() => setSelectedStatusCharId('__player__')}
                    >
                        <img src={userProfile.avatar} className={`w-10 h-10 rounded-full border-2 object-cover shadow-sm ${playerIsDead ? 'grayscale opacity-50' : (selectedStatusCharId === '__player__' ? theme.border : 'border-white/20')} ${selectedStatusCharId === '__player__' ? 'ring-2 ring-white/60' : ''}`} />
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-black/60 text-white text-[8px] px-1.5 rounded-full backdrop-blur-sm whitespace-nowrap">YOU</div>
                        {vitalStatusDot(playerVitals.health, playerIsDead)}
                    </div>
                    {/* Teammates */}
                    {activePlayers.map(p => {
                        const vitals = getCharacterVitals(p.id, activeGame.characterVitals, activeGame.status.health, activeGame.status.sanity);
                        const isDead = playerDeadCharIds.has(p.id);
                        const isSelected = selectedStatusCharId === p.id;
                        return (
                            <div
                                key={p.id}
                                className="relative group shrink-0 cursor-pointer active:scale-95 transition-transform"
                                onClick={() => setSelectedStatusCharId(p.id)}
                            >
                                <img src={p.avatar} className={`w-10 h-10 rounded-full border-2 object-cover shadow-sm transition-colors ${isDead ? 'grayscale opacity-50' : 'border-white/20'} ${isSelected ? 'ring-2 ring-white/60' : 'group-hover:border-white/50'}`} />
                                {!isSelected && <div className="absolute inset-0 rounded-full ring-2 ring-transparent group-hover:ring-green-400/50 transition-all"></div>}
                                {vitalStatusDot(vitals.health, isDead)}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Stats HUD */}
            <div className={`px-4 py-2 border-b ${theme.border} bg-black/10 backdrop-blur-sm z-10 shrink-0`}>
                {selectedStatusCharId !== '__player__' && (
                    <div className="text-[10px] text-white/50 mb-1 text-center">{selectedStatusName} 的状态{selectedStatusIsDead ? ' · 已死亡' : (selectedStatusVitals.health <= 0 ? ' · 昏迷中' : '')}</div>
                )}
                <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col items-center bg-red-500/20 rounded p-1 border border-red-500/30">
                        <span className="text-[8px] text-red-300 font-bold uppercase">HP (生命) · {VITAL_STATE_LABELS[computeVitalState(selectedStatusVitals.health, selectedStatusIsDead)]}</span>
                        <span className="text-xs font-mono font-bold text-red-100">{selectedStatusVitals.health}</span>
                    </div>
                    <div
                        onClick={toggleSanityLock}
                        className={`flex flex-col items-center bg-blue-500/20 rounded p-1 border cursor-pointer active:scale-95 transition-all ${sanityLocked ? 'border-blue-400 ring-1 ring-blue-400/50' : 'border-blue-500/30'}`}
                    >
                        <span className="text-[8px] text-blue-300 font-bold uppercase flex items-center gap-1">
                            SAN (理智) · {SAN_STATE_LABELS[computeSanState(selectedStatusVitals.sanity)]} {sanityLocked && <LockSimple size={10} weight="fill" className="text-blue-400 inline" />}
                        </span>
                        <span className="text-xs font-mono font-bold text-blue-100">{selectedStatusVitals.sanity}</span>
                    </div>
                    <div className="flex flex-col items-center bg-yellow-500/20 rounded p-1 border border-yellow-500/30">
                        <span className="text-[8px] text-yellow-300 font-bold uppercase">GOLD (金币)</span>
                        <span className="text-xs font-mono font-bold text-yellow-100">{activeGame.status.gold || 0}</span>
                    </div>
                </div>
                {/* Token Statistics */}
                {lastTokenUsage && (
                    <div className="mt-1.5 flex items-center justify-between bg-white/5 rounded px-2 py-1 border border-white/10">
                        <span className="text-[8px] text-white/40 font-mono inline-flex items-center gap-0.5"><Lightning size={10} weight="fill" /> 上下文: {lastTokenUsage.prompt ?? '?'} | 回复: {lastTokenUsage.completion ?? '?'} | 本次: {lastTokenUsage.total}</span>
                        <span className="text-[8px] text-white/40 font-mono">∑ {totalTokensUsed}</span>
                    </div>
                )}
            </div>

            {/* Stage / Log Area */}
            <div 
                ref={logsContainerRef} // [FIX] Attach Ref to scrollable container
                className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar relative animate-fade-in"
            >
                {/* 已归档剧情 (自动总结后折叠灰显，不删除) */}
                {(activeGame.logs.some(l => l.archived) || (activeGame.summaries && activeGame.summaries.length > 0)) && (() => {
                    const archivedLogs = activeGame.logs.filter(l => l.archived);
                    const summaries = activeGame.summaries || [];
                    // 把每段总结与它覆盖的原文对应起来：优先用 logIds，旧总结回退为按 logCount 顺序切分
                    let cursor = 0;
                    const groups = summaries.map((s, si) => {
                        let logs: GameLog[];
                        if (s.logIds && s.logIds.length) {
                            const idset = new Set(s.logIds);
                            logs = archivedLogs.filter(l => idset.has(l.id));
                        } else {
                            logs = archivedLogs.slice(cursor, cursor + s.logCount);
                        }
                        cursor += logs.length;
                        return { summary: s, logs, index: si };
                    });
                    const covered = new Set(groups.flatMap(g => g.logs.map(l => l.id)));
                    const orphanLogs = archivedLogs.filter(l => !covered.has(l.id));

                    const renderLogs = (logs: GameLog[]) => (
                        <div className={`pl-3 border-l-2 ${theme.border} space-y-1.5 mt-2`}>
                            {logs.map((log, li) => (
                                <div key={log.id || li} className="text-[11px] leading-snug">
                                    <span className="font-bold opacity-70">{log.role === 'gm' ? 'GM' : (log.speakerName || 'System')}: </span>
                                    <span className="opacity-70">{log.content.replace(/\n+/g, ' ').slice(0, 140)}{log.content.length > 140 ? '…' : ''}</span>
                                </div>
                            ))}
                        </div>
                    );

                    return (
                        <div className="my-2">
                            <button
                                onClick={() => setShowArchived(v => !v)}
                                className={`w-full text-[11px] py-2 px-3 rounded-lg border border-dashed ${theme.border} opacity-60 hover:opacity-100 transition-opacity flex items-center justify-center gap-2 font-mono`}
                            >
                                已归档 {archivedLogs.length} 条剧情 · {summaries.length} 段前情提要 {showArchived ? '（点击折叠）' : '（点击展开）'}
                            </button>
                            {showArchived && (
                                <div className="mt-3 space-y-4">
                                    {groups.map(g => {
                                        const open = expandedSummaries.has(g.summary.id);
                                        return (
                                            <div key={g.summary.id} className="space-y-2">
                                                {/* 该段原文（默认折叠，可展开） */}
                                                <button
                                                    onClick={() => setExpandedSummaries(prev => { const n = new Set(prev); n.has(g.summary.id) ? n.delete(g.summary.id) : n.add(g.summary.id); return n; })}
                                                    className={`w-full text-left text-[10px] font-mono opacity-50 hover:opacity-90 transition-opacity flex items-center gap-1.5`}
                                                >
                                                    <span>{open ? '▾' : '▸'}</span>
                                                    <span>第 {g.index + 1} 段 · 原文 {g.logs.length} 条 {open ? '' : '(点击查看)'}</span>
                                                </button>
                                                {open && <div className="opacity-50">{renderLogs(g.logs)}</div>}
                                                {/* 原文下面就是这段的总结 */}
                                                <div className={`p-4 rounded-lg border ${theme.border} ${theme.cardBg} text-xs italic leading-relaxed opacity-80`}>
                                                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1 not-italic opacity-70">前情提要 · 第 {g.index + 1} 段</div>
                                                    <GameMarkdown content={g.summary.content} theme={theme} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {/* 尚未被总结覆盖的归档原文（极少见，做个兜底） */}
                                    {orphanLogs.length > 0 && (
                                        <div className="opacity-50">{renderLogs(orphanLogs)}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {activeGame.logs.map((log, i) => {
                    if (log.archived) return null; // 归档日志在上方折叠区块渲染
                    const isGM = log.role === 'gm';
                    const isSystem = log.role === 'system';
                    const isCharacter = log.role === 'character';
                    const charInfo = isCharacter ? activePlayers.find(p => p.name === log.speakerName) : null;

                    let inner: React.ReactNode;
                    if (isSystem) {
                        inner = (
                            <div className="flex flex-col items-center my-4 animate-fade-in gap-1 group">
                                <span className="text-[10px] opacity-50 border-b border-dashed border-current pb-0.5 font-mono">{log.content}</span>
                                <button onClick={() => handleRollbackLog(i)} className="text-[9px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:underline">回退到此处</button>
                            </div>
                        );
                    } else if (isGM) {
                        inner = (
                            <div className="animate-fade-in my-4 group relative">
                                <div className={`p-5 rounded-lg border-2 ${theme.border} ${theme.cardBg} shadow-sm relative mx-auto w-full text-sm`}>
                                    <div className="absolute -top-3 left-4 bg-inherit px-2 text-[10px] font-bold uppercase tracking-widest opacity-80 border border-inherit rounded">Game Master</div>
                                    <GameMarkdown content={log.content} theme={theme} customStyle={uiSettings} />
                                </div>
                                <button onClick={() => handleRollbackLog(i)} className="absolute top-2 right-2 text-[9px] bg-red-900/50 text-red-200 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-800">Rollback</button>
                            </div>
                        );
                    } else if (isCharacter && charInfo) {
                        inner = (
                            <div className="flex gap-3 animate-slide-up group relative">
                                <img src={charInfo.avatar} className={`w-10 h-10 rounded-full object-cover border ${theme.border} shrink-0 mt-1`} />
                                <div className="flex flex-col max-w-[85%]">
                                    <span className="text-[10px] font-bold opacity-60 mb-1 ml-1 flex items-center gap-1.5">
                                        {charInfo.name}
                                        {log.diceRoll && (
                                            <span className={`px-1.5 rounded font-mono ${diceTierBadgeClass(log.diceRoll)} ${diceTierBadgeAnim(log.diceRoll)}`}>
                                                <DiceFive size={10} weight="fill" className="inline" /> {log.diceRoll.result}{log.diceRoll.check ? ` ${log.diceRoll.check}` : ''}
                                            </span>
                                        )}
                                    </span>
                                    <div className={`px-4 py-2 rounded-2xl rounded-tl-none text-sm ${theme.cardBg} border ${theme.border} shadow-sm relative`}>
                                        <GameMarkdown content={log.content} theme={theme} customStyle={uiSettings} />
                                    </div>
                                    {diceOutcomeLine(log.diceRoll) && (
                                        <span className="mt-1 ml-1 text-[10px] opacity-50">→ {diceOutcomeLine(log.diceRoll)}</span>
                                    )}
                                    <button onClick={() => handleRollbackLog(i)} className="self-start mt-1 text-[9px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:underline">回退</button>
                                </div>
                            </div>
                        );
                    } else {
                        // Player (User) Log
                        inner = (
                            <div className="flex flex-col items-end animate-slide-up group relative">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`text-[10px] font-bold opacity-60`}>{log.speakerName}</span>
                                    {log.diceRoll && log.id !== pendingRollLogId && (
                                        <span className={`text-[10px] px-1.5 rounded font-mono ${diceTierBadgeClass(log.diceRoll)} ${diceTierBadgeAnim(log.diceRoll)}`}>
                                            <DiceFive size={12} weight="fill" className="inline" /> {log.diceRoll.result}{log.diceRoll.check ? ` ${log.diceRoll.check}` : ''}
                                        </span>
                                    )}
                                </div>
                                <div className={`px-4 py-2 rounded-2xl rounded-tr-none text-sm bg-orange-600 text-white shadow-md max-w-[85%]`}>
                                    {log.content}
                                </div>
                                {log.id !== pendingRollLogId && diceOutcomeLine(log.diceRoll) && (
                                    <span className="mt-1 text-[10px] opacity-50">→ {diceOutcomeLine(log.diceRoll)}</span>
                                )}
                                <button onClick={() => handleRollbackLog(i)} className="mt-1 text-[9px] text-red-400 opacity-0 group-hover:opacity-100 transition-opacity hover:underline">回退</button>
                            </div>
                        );
                    }

                    const selected = selectedLogIds.has(log.id);
                    return (
                        <div
                            key={log.id || i}
                            onPointerDown={() => startLogPress(log.id)}
                            onPointerUp={cancelLogPress}
                            onPointerLeave={cancelLogPress}
                            onPointerCancel={cancelLogPress}
                            onClick={() => { if (selectMode) toggleSelectLog(log.id); }}
                            onContextMenu={(e) => { if (selectMode) e.preventDefault(); }}
                            className={`relative ${selectMode ? `cursor-pointer rounded-xl px-1 transition-all ${selected ? 'ring-2 ring-purple-400 bg-purple-500/10' : 'hover:bg-white/[0.03]'}` : ''}`}
                        >
                            {selectMode && (
                                <div className={`absolute left-0 top-1/2 -translate-y-1/2 z-30 w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'bg-purple-500 border-purple-400' : 'border-white/40 bg-black/40'}`}>
                                    {selected && <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white"><path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.79 6.8-6.79a1 1 0 0 1 1.4 0Z" clipRule="evenodd"/></svg>}
                                </div>
                            )}
                            <div className={selectMode ? 'pointer-events-none select-none pl-5' : ''}>
                                {inner}
                            </div>
                        </div>
                    );
                })}
                {isTyping && <div className="text-xs opacity-50 animate-pulse pl-2 font-mono">GM 正在计算结果...</div>}
                
                {/* [FIX] Removed logsEndRef usage */}
            </div>

            {/* 多选转发操作栏 */}
            {selectMode && (
                <div className={`p-4 pb-[calc(1rem+var(--safe-bottom,0px))] border-t ${theme.border} bg-black/50 backdrop-blur shrink-0 z-20 flex items-center gap-3 animate-slide-down`}>
                    <button onClick={exitSelectMode} className="px-4 h-11 rounded-xl border border-white/15 text-sm font-bold text-white/70 active:scale-95 transition-transform">取消</button>
                    <span className="text-xs text-white/50 flex-1 text-center">已选 {selectedLogIds.size} 条 · 长按可多选剧情</span>
                    <button
                        onClick={handleForwardToChat}
                        disabled={selectedLogIds.size === 0 || isForwarding}
                        className="px-5 h-11 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold active:scale-95 transition-transform disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-purple-500/20"
                    >
                        {isForwarding ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> 转发中...</> : '转发到聊天'}
                    </button>
                </div>
            )}

            {/* Controls */}
            {/* 底部 pb-[calc(1rem+var(--safe-bottom,0px))] 让内容避开 home 条（--safe-bottom 见 index.html，iOS PWA 下有 JS probe 兜底）*/}
            <div className={`p-4 pb-[calc(1rem+var(--safe-bottom,0px))] border-t ${theme.border} bg-opacity-90 backdrop-blur shrink-0 z-20 transition-colors duration-500 ${selectMode ? 'hidden' : ''}`}>
                
                {/* AI Suggested Options Area */}
                {activeGame.suggestedActions && activeGame.suggestedActions.length > 0 && !isTyping && (
                    <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1">
                        {activeGame.suggestedActions.map((opt, idx) => {
                            let styleClass = theme.optionNormal;
                            if (opt.type === 'chaotic') styleClass = theme.optionChaotic;
                            if (opt.type === 'evil') styleClass = theme.optionEvil;
                            
                            return (
                                <button 
                                    key={idx} 
                                    onClick={() => handleAction(opt.label)}
                                    className={`flex-1 min-w-[100px] text-[10px] p-2 rounded-lg border ${styleClass} hover:opacity-80 active:scale-95 transition-all text-left leading-tight shadow-sm`}
                                >
                                    <span className="block font-bold opacity-70 uppercase text-[8px] mb-0.5 tracking-wider">{opt.type}</span>
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {!playerCanAct ? (
                    /* 玩家已死亡/昏迷：不能再正常行动，只能旁观（如开了皮下吐槽，可以在那边继续吐槽剧情） */
                    <div className={`flex items-center justify-center gap-2 h-12 rounded-xl border ${theme.border} bg-black/20 text-xs opacity-60`}>
                        <Eye size={16} />
                        {playerIsDead ? '你已经死亡，只能旁观接下来的剧情了' : '你已昏迷，暂时无法行动——等待队友救援或伤势好转'}
                    </div>
                ) : (
                <>
                {/* Collapsible Action Toolbar — 快捷动作 (执行时自动骰 D20) */}
                {showTools && (
                    <div className="flex gap-2 mb-3 animate-fade-in items-center">
                        <span className={`text-[10px] opacity-50 flex items-center gap-1 shrink-0 ${activeGame.diceDisabled ? 'opacity-30 line-through' : theme.accent}`}>
                            <DiceFive size={16} weight="fill" /> {activeGame.diceDisabled ? '骰子已关' : '自动骰点'}
                            {!activeGame.diceDisabled && lastRoll !== null && <span className="font-mono font-bold no-underline">上次 {lastRoll}</span>}
                        </span>
                        {['调查', '攻击', '交涉', '潜行', '逃跑'].map(action => (
                            <button key={action} disabled={isTyping} onClick={() => handleAction(action)} className={`flex-1 px-3 py-2 rounded border ${theme.border} hover:bg-white/10 text-xs font-bold transition-colors active:scale-95 disabled:opacity-40`}>{action}</button>
                        ))}
                    </div>
                )}

                <div className="flex gap-2 items-end">
                    {/* Toggle Tools Button */}
                    <button
                        onClick={() => setShowTools(!showTools)}
                        className={`p-3 h-12 rounded-xl border ${theme.border} hover:bg-white/10 active:scale-95 transition-transform flex items-center justify-center ${showTools ? 'bg-white/20' : ''}`}
                    >
                        <Toolbox size={22} />
                    </button>

                    {/* Reroll Button (Context Sensitive) */}
                    {!isTyping && activeGame.logs.length > 0 && (
                        <button
                            onClick={handleReroll}
                            className={`p-3 h-12 rounded-xl border ${theme.border} hover:bg-white/10 active:scale-95 transition-transform flex items-center justify-center`}
                            title="重新生成上一轮"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        </button>
                    )}

                    <textarea
                        value={userInput}
                        onChange={e => setUserInput(e.target.value)}
                        // Removed onKeyDown Enter submission
                        placeholder="你打算做什么..."
                        className={`flex-1 bg-black/20 border ${theme.border} rounded-xl px-3 py-3 outline-none text-sm placeholder-opacity-30 placeholder-current resize-none h-12 leading-tight focus:bg-black/40 transition-colors`}
                    />
                    <button disabled={isTyping || !userInput.trim()} onClick={() => handleAction(userInput)} className={`${theme.accent} font-bold text-sm px-4 h-12 bg-white/10 rounded-xl hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center disabled:opacity-40`}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" /></svg>
                    </button>
                </div>
                </>
                )}
            </div>

            {renderSharedModalsAndOverlays()}
        </div>
    );
};

export default GameApp;
