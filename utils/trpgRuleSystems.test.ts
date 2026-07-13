import { describe, it, expect } from 'vitest';
import {
    computeCheckTier,
    findSkillValueByName,
    computeVitalState,
    computeSanState,
    getCharacterVitals,
    RULE_SYSTEMS,
    CHECK_TIER_LABELS,
    VITAL_STATE_LABELS,
    SAN_STATE_LABELS,
} from './trpgRuleSystems';
import type { CharacterSheetEntry } from '../types';

describe('TRPG 规则系统 - 五档检定机制', () => {
    describe('computeCheckTier - CoC7 / freeform (d100 low-good)', () => {
        const sys = RULE_SYSTEMS.coc7;
        const cfg = sys.dice; // d100

        it('大成功：骰点 ≤ 技能值/5 且 ≤5', () => {
            const result = computeCheckTier(sys, cfg, 5, 50, undefined);
            expect(result.tier).toBe('critical_success');
            expect(result.success).toBe(true);
            expect(result.label).toBe(CHECK_TIER_LABELS.critical_success);
        });

        it('成功：骰点 ≤ 技能值', () => {
            const result = computeCheckTier(sys, cfg, 30, 50, undefined);
            expect(result.tier).toBe('success');
            expect(result.success).toBe(true);
        });

        it('勉强成功：骰点 ≤ 技能值+20', () => {
            const result = computeCheckTier(sys, cfg, 60, 50, undefined);
            expect(result.tier).toBe('partial');
            expect(result.success).toBe(true);
        });

        it('失败：骰点 > 技能值+20', () => {
            const result = computeCheckTier(sys, cfg, 80, 50, undefined);
            expect(result.tier).toBe('failure');
            expect(result.success).toBe(false);
        });

        it('大失败：骰点 ≥96（CoC特殊规则）', () => {
            const result = computeCheckTier(sys, cfg, 96, 50, undefined);
            expect(result.tier).toBe('critical_failure');
            expect(result.success).toBe(false);
        });

        it('技能值缺失时用默认值50兜底', () => {
            const result = computeCheckTier(sys, cfg, 30, undefined, undefined);
            expect(result.tier).toBe('success'); // 30 ≤ 50
            expect(result.success).toBe(true);
        });
    });

    describe('computeCheckTier - D&D5e (d20 high-good)', () => {
        const sys = RULE_SYSTEMS.dnd5e;
        const cfg = sys.dice; // d20

        it('大成功：原始骰点=20（自然20）', () => {
            const result = computeCheckTier(sys, cfg, 20, 5, 25);
            expect(result.tier).toBe('critical_success');
            expect(result.success).toBe(true);
        });

        it('大失败：原始骰点=1（自然1）', () => {
            const result = computeCheckTier(sys, cfg, 1, 5, 10);
            expect(result.tier).toBe('critical_failure');
            expect(result.success).toBe(false);
        });

        it('成功：骰点+加值 ≥ DC 且 margin ≥0', () => {
            const result = computeCheckTier(sys, cfg, 12, 3, 15);
            // 12 + 3 = 15, margin = 0
            expect(result.tier).toBe('success');
            expect(result.success).toBe(true);
        });

        it('大成功：骰点+加值超过DC ≥5', () => {
            const result = computeCheckTier(sys, cfg, 18, 3, 15);
            // 18 + 3 = 21, margin = 6
            expect(result.tier).toBe('critical_success');
            expect(result.success).toBe(true);
        });

        it('勉强成功：margin在-5~0之间', () => {
            const result = computeCheckTier(sys, cfg, 10, 2, 15);
            // 10 + 2 = 12, margin = -3
            expect(result.tier).toBe('partial');
            expect(result.success).toBe(true);
        });

        it('失败：margin < -5', () => {
            const result = computeCheckTier(sys, cfg, 5, 2, 15);
            // 5 + 2 = 7, margin = -8
            expect(result.tier).toBe('failure');
            expect(result.success).toBe(false);
        });

        it('加值缺失时用0兜底，DC缺失用15兜底', () => {
            const result = computeCheckTier(sys, cfg, 16, undefined, undefined);
            // 16 + 0 = 16, DC=15, margin = 1
            expect(result.tier).toBe('success');
            expect(result.success).toBe(true);
        });
    });

    describe('findSkillValueByName - 技能名模糊匹配', () => {
        const sys = RULE_SYSTEMS.coc7;
        const sheet: CharacterSheetEntry = {
            name: '测试角色',
            characteristics: { STR: 60, DEX: 70 },
            skills: { persuade: 45, stealth: 30 },
        };

        it('精确匹配技能中文名', () => {
            const value = findSkillValueByName(sys, sheet, '说服');
            expect(value).toBe(45);
        });

        it('精确匹配属性中文名', () => {
            const value = findSkillValueByName(sys, sheet, '力量');
            expect(value).toBe(60);
        });

        it('匹配技能key（不区分大小写）', () => {
            const value = findSkillValueByName(sys, sheet, 'STEALTH');
            expect(value).toBe(30);
        });

        it('部分匹配：core 包含 query 时匹配（"力量"包含"力"）', () => {
            const value = findSkillValueByName(sys, sheet, '潜');
            expect(value).toBe(30); // "潜行" 包含 "潜"
        });

        it('部分匹配时取第一个命中的（"力"会匹配到数组里第一个包含它的属性）', () => {
            // CoC7 characteristics 数组里 STR(力量) 排在 APP(魅力) 前面，所以"力"会先命中"力量"
            const value = findSkillValueByName(sys, sheet, '力');
            expect(value).toBe(60); // 匹配到"力量"
        });

        it('但"力量"能精确匹配到"力量 (STR)"', () => {
            const value = findSkillValueByName(sys, sheet, '力量');
            expect(value).toBe(60);
        });

        it('带括号的label也能匹配（去掉括号后的核心部分）', () => {
            const sheetWithParen: CharacterSheetEntry = {
                name: '测试',
                characteristics: {},
                skills: { firearms_handgun: 20 },
            };
            const value = findSkillValueByName(sys, sheetWithParen, '射击-手枪');
            expect(value).toBe(20);
        });

        it('匹配不到返回undefined', () => {
            const value = findSkillValueByName(sys, sheet, '不存在的技能');
            expect(value).toBeUndefined();
        });

        it('sheet为undefined返回undefined', () => {
            const value = findSkillValueByName(sys, undefined, '说服');
            expect(value).toBeUndefined();
        });

        it('name为空字符串返回undefined', () => {
            const value = findSkillValueByName(sys, sheet, '');
            expect(value).toBeUndefined();
        });
    });

    describe('computeVitalState / computeSanState - 状态阈值判定', () => {
        it('HP > 50: normal', () => {
            expect(computeVitalState(80, false)).toBe('normal');
        });

        it('HP ≤ 50: wounded', () => {
            expect(computeVitalState(50, false)).toBe('wounded');
            expect(computeVitalState(40, false)).toBe('wounded');
        });

        it('HP ≤ 30: critical', () => {
            expect(computeVitalState(30, false)).toBe('critical');
            expect(computeVitalState(20, false)).toBe('critical');
        });

        it('HP ≤ 0: unconscious（昏迷不是死亡）', () => {
            expect(computeVitalState(0, false)).toBe('unconscious');
            expect(computeVitalState(-10, false)).toBe('unconscious');
        });

        it('isDead=true时无论HP多少都是dead（死亡不可逆）', () => {
            expect(computeVitalState(100, true)).toBe('dead');
            expect(computeVitalState(0, true)).toBe('dead');
        });

        it('SAN > 50: stable', () => {
            expect(computeSanState(80)).toBe('stable');
        });

        it('SAN ≤ 50: unsettled', () => {
            expect(computeSanState(50)).toBe('unsettled');
            expect(computeSanState(40)).toBe('unsettled');
        });

        it('SAN ≤ 30: unstable', () => {
            expect(computeSanState(30)).toBe('unstable');
            expect(computeSanState(20)).toBe('unstable');
        });

        it('SAN ≤ 0: broken（疯狂但不出局）', () => {
            expect(computeSanState(0)).toBe('broken');
            expect(computeSanState(-5)).toBe('broken');
        });

        it('状态标签正确映射', () => {
            expect(VITAL_STATE_LABELS[computeVitalState(80, false)]).toBe('正常');
            expect(VITAL_STATE_LABELS[computeVitalState(50, false)]).toBe('轻伤');
            expect(VITAL_STATE_LABELS[computeVitalState(30, false)]).toBe('重伤');
            expect(VITAL_STATE_LABELS[computeVitalState(0, false)]).toBe('昏迷');
            expect(VITAL_STATE_LABELS[computeVitalState(100, true)]).toBe('死亡');

            expect(SAN_STATE_LABELS[computeSanState(80)]).toBe('稳定');
            expect(SAN_STATE_LABELS[computeSanState(50)]).toBe('不安');
            expect(SAN_STATE_LABELS[computeSanState(30)]).toBe('动摇');
            expect(SAN_STATE_LABELS[computeSanState(0)]).toBe('疯狂');
        });

        it('边界值精确测试：50是wounded不是normal，30是critical不是wounded，0是unconscious不是critical', () => {
            expect(computeVitalState(51, false)).toBe('normal');
            expect(computeVitalState(50, false)).toBe('wounded');
            expect(computeVitalState(31, false)).toBe('wounded');
            expect(computeVitalState(30, false)).toBe('critical');
            expect(computeVitalState(1, false)).toBe('critical');
            expect(computeVitalState(0, false)).toBe('unconscious');
        });
    });

    describe('getCharacterVitals - 旧存档兜底', () => {
        it('有characterVitals字段时读取对应角色的值', () => {
            const vitals = { char1: { health: 80, sanity: 60 } };
            const result = getCharacterVitals('char1', vitals, 100, 100);
            expect(result).toEqual({ health: 80, sanity: 60 });
        });

        it('characterVitals字段缺失时用fallback兜底', () => {
            const result = getCharacterVitals('char1', undefined, 70, 90);
            expect(result).toEqual({ health: 70, sanity: 90 });
        });

        it('字段存在但角色id不在里面时用fallback兜底', () => {
            const vitals = { char1: { health: 80, sanity: 60 } };
            const result = getCharacterVitals('char2', vitals, 100, 100);
            expect(result).toEqual({ health: 100, sanity: 100 });
        });

        it('玩家本人（__player__）也能正常读取', () => {
            const vitals = { __player__: { health: 50, sanity: 70 } };
            const result = getCharacterVitals('__player__', vitals, 100, 100);
            expect(result).toEqual({ health: 50, sanity: 70 });
        });
    });

    describe('边界情况与极端输入', () => {
        it('computeCheckTier - 骰点超出骰子理论范围也不能崩溃', () => {
            const sys = RULE_SYSTEMS.coc7;
            const cfg = sys.dice;
            const result = computeCheckTier(sys, cfg, 101, 50, undefined);
            expect(result.tier).toBe('critical_failure'); // 101 ≥ 96
            expect(result.success).toBe(false);
        });

        it('computeCheckTier - 技能值负数会被clamp成0', () => {
            const sys = RULE_SYSTEMS.coc7;
            const cfg = sys.dice;
            const result = computeCheckTier(sys, cfg, 50, -10, undefined);
            expect(result.tier).toBe('failure');
            expect(result.success).toBe(false);
        });

        it('findSkillValueByName - 技能值是0也算合法匹配（如CoC闪避基础值0）', () => {
            const sys = RULE_SYSTEMS.coc7;
            const sheet: CharacterSheetEntry = {
                name: '测试',
                characteristics: {},
                skills: { dodge: 0 },
            };
            const value = findSkillValueByName(sys, sheet, '闪避');
            expect(value).toBe(0);
        });
    });

    describe('死亡两段式判定逻辑（对应 GameApp.handleAction 里的核心条件）', () => {
        // 这三条直接复刻 apps/GameApp.tsx handleAction 里的判定条件：
        // prev.health <= 0 && sc.hpChange < 0 => 当场死亡
        const shouldDie = (prevHealth: number, hpChange: number) => prevHealth <= 0 && hpChange < 0;

        it('HP归零变昏迷，再挨一次负数hpChange才死亡', () => {
            expect(shouldDie(0, -10)).toBe(true);
        });

        it('HP归零但本回合hpChange=0（没新伤），不触发死亡', () => {
            expect(shouldDie(0, 0)).toBe(false);
        });

        it('HP归零但本回合hpChange>0（被治疗），不触发死亡', () => {
            expect(shouldDie(0, 20)).toBe(false);
        });

        it('HP还有1点，本回合扣到负数：先进昏迷，不是当场死亡（因为prevHealth>0）', () => {
            const prevHealth = 1;
            const hpChange = -20;
            expect(shouldDie(prevHealth, hpChange)).toBe(false);
            const newHealth = Math.max(0, Math.min(100, prevHealth + hpChange));
            expect(computeVitalState(newHealth, false)).toBe('unconscious');
        });
    });
});
