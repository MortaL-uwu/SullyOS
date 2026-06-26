
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { CharacterProfile, ScheduleSlot, TheaterLine } from '../../types';

interface TheaterPlayerProps {
    character: CharacterProfile | null;
    slot: ScheduleSlot | null;
    lines: TheaterLine[] | null;   // null / 空 = 还在生成
    isGenerating: boolean;
    onReplay: () => void;          // 重演（重新生成）
    onClose: () => void;
}

const TYPE_SPEED_MS = 38;       // 每个字的打字间隔
const LINE_GAP_MS = 520;        // 一行打完到下一行开始的停顿

/** 台词行（含「」或引号）渲染成对白气泡，其余作旁白/动作。 */
const isDialogue = (text: string): boolean => /[「」“”"]/.test(text);

const TheaterPlayer: React.FC<TheaterPlayerProps> = ({
    character, slot, lines, isGenerating, onReplay, onClose,
}) => {
    const hue = character?.themeColor ?? 260;
    const accent = `hsl(${hue}, 70%, 66%)`;
    const charName = character?.name || '角色';

    // 已完整显示的行数；当前正在打字的行 = visibleLines（索引）
    const [shownCount, setShownCount] = useState(0);     // 已完成打字的行数
    const [typed, setTyped] = useState('');              // 当前行已打出的文本
    const [finished, setFinished] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<number | null>(null);

    const total = lines?.length ?? 0;
    const currentLine = lines && shownCount < total ? lines[shownCount] : null;

    const clearTimer = () => {
        if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    };

    // 重置播放进度（lines 变化 = 新一段演出 / 重演）
    useEffect(() => {
        clearTimer();
        setShownCount(0);
        setTyped('');
        setFinished(false);
    }, [lines]);

    // 打字机：逐字推进当前行，打完停顿后进入下一行
    useEffect(() => {
        if (!lines || shownCount >= total) {
            if (lines && total > 0 && shownCount >= total) setFinished(true);
            return;
        }
        const full = currentLine?.text ?? '';
        if (typed.length < full.length) {
            timerRef.current = window.setTimeout(() => {
                setTyped(full.slice(0, typed.length + 1));
            }, TYPE_SPEED_MS);
        } else {
            // 当前行打完，停顿后进入下一行
            timerRef.current = window.setTimeout(() => {
                setShownCount(c => c + 1);
                setTyped('');
            }, LINE_GAP_MS);
        }
        return clearTimer;
    }, [lines, shownCount, typed, total, currentLine]);

    // 自动滚到底
    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, [shownCount, typed]);

    // 点击：当前行没打完 → 立刻补全；已打完 → 直接跳到结尾全显
    const handleAdvance = useCallback(() => {
        if (!lines || finished) return;
        const full = currentLine?.text ?? '';
        if (typed.length < full.length) {
            clearTimer();
            setTyped(full);
        } else {
            // 跳过全部剩余
            clearTimer();
            setShownCount(total);
            setTyped('');
            setFinished(true);
        }
    }, [lines, finished, currentLine, typed, total]);

    const completedLines = lines ? lines.slice(0, shownCount) : [];

    return (
        <div
            className="fixed inset-0 z-[120] flex flex-col"
            style={{ background: `radial-gradient(120% 100% at 50% 0%, hsl(${hue},38%,14%), hsl(${hue},45%,6%) 70%, #04060a)` }}
        >
            {/* 顶部：角色 + 时间点 + 关闭 */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-3 flex-shrink-0">
                {character?.avatar ? (
                    <img src={character.avatar} alt="" className="w-10 h-10 rounded-full object-cover border-2" style={{ borderColor: accent }} />
                ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black" style={{ background: accent, color: '#06080c' }}>
                        {charName.slice(0, 1)}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-40 text-white">Theater</span>
                        <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full" style={{ background: `hsl(${hue},50%,22%)`, color: accent }}>
                            {slot?.startTime}
                        </span>
                    </div>
                    <p className="text-sm font-bold text-white/90 truncate mt-0.5">
                        {slot?.emoji ? `${slot.emoji} ` : ''}{slot?.activity}
                        <span className="text-white/40 font-normal"> · 窥视 {charName}</span>
                    </p>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                    aria-label="关闭"
                >
                    ✕
                </button>
            </div>

            {/* 正文：逐行演出 */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
                onClick={handleAdvance}
            >
                {(isGenerating || !lines) ? (
                    <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
                        <div className="relative w-12 h-12">
                            <div className="absolute inset-0 rounded-full border-2 border-white/10"></div>
                            <div className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: accent, borderTopColor: 'transparent' }}></div>
                        </div>
                        <div>
                            <p className="text-sm text-white/70 font-bold">正在窥视 {charName}…</p>
                            <p className="text-[11px] text-white/35 mt-1">{slot?.startTime} · {slot?.activity}</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {completedLines.map((ln, i) => (
                            <TheaterBeat key={i} line={ln} accent={accent} hue={hue} />
                        ))}
                        {currentLine && !finished && (
                            <TheaterBeat
                                line={{ emotion: currentLine.emotion, text: typed }}
                                accent={accent}
                                hue={hue}
                                typing
                            />
                        )}
                        {finished && (
                            <div className="pt-4 pb-2 text-center">
                                <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/25">— 完 —</span>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* 底部控制 */}
            <div className="flex items-center justify-center gap-3 px-5 pt-2 pb-6 flex-shrink-0">
                {!isGenerating && lines && (
                    <>
                        {!finished ? (
                            <button
                                onClick={handleAdvance}
                                className="px-5 py-2.5 rounded-full text-xs font-bold text-white/80 bg-white/8 hover:bg-white/15 transition-colors active:scale-95"
                            >
                                {currentLine && typed.length < (currentLine.text?.length ?? 0) ? '▸ 跳过本行' : '▸▸ 跳到结尾'}
                            </button>
                        ) : (
                            <button
                                onClick={onReplay}
                                className="px-6 py-2.5 rounded-full text-xs font-bold transition-all active:scale-95"
                                style={{ background: accent, color: '#06080c' }}
                            >
                                ↻ 换一段重演
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

const TheaterBeat: React.FC<{ line: TheaterLine; accent: string; hue: number; typing?: boolean }> = ({ line, accent, hue, typing }) => {
    const dialogue = isDialogue(line.text);
    return (
        <div className="flex items-start gap-2.5 animate-fade-in">
            {line.emotion ? (
                <span
                    className="flex-shrink-0 mt-0.5 text-sm leading-none px-1.5 py-1 rounded-lg"
                    style={{ background: `hsl(${hue},45%,18%)` }}
                >
                    {line.emotion}
                </span>
            ) : (
                <span className="flex-shrink-0 w-1 mt-2 self-stretch rounded-full" style={{ background: `${accent}` }}></span>
            )}
            <p
                className={`flex-1 min-w-0 leading-relaxed ${
                    dialogue
                        ? 'text-[15px] font-medium text-white'
                        : 'text-[14px] text-white/70'
                }`}
                style={dialogue ? { textShadow: `0 0 18px hsl(${hue},60%,40%,0.35)` } : undefined}
            >
                {line.text}
                {typing && <span className="inline-block w-[2px] h-[1em] align-text-bottom ml-0.5 animate-pulse" style={{ background: accent }} />}
            </p>
        </div>
    );
};

export default TheaterPlayer;
