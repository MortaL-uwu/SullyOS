import React, { useEffect, useState } from 'react';
import type { PlateEntry, PlateRoom, RoomPlate } from '../../utils/memoryPalace/types';
import { PLATE_ROOMS, PLATE_TITLES, PLATE_ENTRY_CAPS, PLATE_ENTRY_HARD_MAX_CHARS } from '../../utils/memoryPalace/types';
import { RoomPlateDB } from '../../utils/memoryPalace/db';

/**
 * 房间门牌面板（神经链接 · 底色认知）
 *
 * 展示四块门牌的常驻条目。门牌由封盒/消化自动蒸馏维护，这里只提供
 * 审计入口：查看、改写、删除——蒸错的事实一旦常驻会被自信地重复很久，
 * 必须有人工纠错的口子。
 */

const ROOM_ACCENT: Record<PlateRoom, { dot: string; label: string }> = {
    user_room: { dot: 'bg-sky-400',    label: 'text-sky-500' },
    self_room: { dot: 'bg-violet-400', label: 'text-violet-500' },
    bedroom:   { dot: 'bg-rose-400',   label: 'text-rose-500' },
    study:     { dot: 'bg-emerald-400', label: 'text-emerald-500' },
};

const ROOM_HINT: Record<PlateRoom, string> = {
    user_room: '关于TA的稳定事实：家庭、居住、重要他人、雷区',
    self_room: '角色对自己的稳定认知',
    bedroom:   '关系的质地——只有现象，没有定义',
    study:     '会什么、在学什么',
};

interface RoomPlatePanelProps {
    charId: string;
    userName?: string;
}

const RoomPlatePanel: React.FC<RoomPlatePanelProps> = ({ charId, userName }) => {
    const [plates, setPlates] = useState<Map<PlateRoom, RoomPlate>>(new Map());
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<{ room: PlateRoom; entryId: string; draft: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const loaded = await RoomPlateDB.getByCharId(charId);
                if (!cancelled) {
                    setPlates(new Map(loaded.map(p => [p.room, p])));
                }
            } catch (e) {
                console.warn('[RoomPlatePanel] 加载门牌失败', e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [charId]);

    const savePlate = async (plate: RoomPlate) => {
        await RoomPlateDB.save(plate);
        setPlates(prev => new Map(prev).set(plate.room, plate));
    };

    const removeEntry = (room: PlateRoom, entryId: string) => {
        const plate = plates.get(room);
        if (!plate) return;
        savePlate({ ...plate, entries: plate.entries.filter(e => e.id !== entryId), updatedAt: Date.now() });
    };

    const commitEdit = () => {
        if (!editing) return;
        const plate = plates.get(editing.room);
        const text = editing.draft.replace(/\s+/g, ' ').trim().slice(0, PLATE_ENTRY_HARD_MAX_CHARS);
        setEditing(null);
        if (!plate || !text) return;
        const entries = plate.entries.map(e =>
            e.id === editing.entryId && e.text !== text ? { ...e, text, updatedAt: Date.now() } : e
        );
        savePlate({ ...plate, entries, updatedAt: Date.now() });
    };

    const fmtDate = (ts: number) => new Date(ts).toLocaleDateString();

    if (loading) {
        return (
            <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-4 border-slate-100 border-t-indigo-400 rounded-full animate-spin"></div>
            </div>
        );
    }

    const totalEntries = PLATE_ROOMS.reduce((s, r) => s + (plates.get(r)?.entries.length || 0), 0);

    return (
        <div className="space-y-5 animate-fade-in pb-10">
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Resident Knowledge</div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    门牌是角色从相处中自己蒸馏出的常驻认知——事件盒封存、认知消化时自动整理，每轮对话都在场。
                    蒸错的条目可以在这里改写或删除。
                </p>
            </div>

            {totalEntries === 0 && (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-sm text-slate-400">门牌还是空的</p>
                    <p className="text-xs text-slate-300 mt-2 max-w-xs mx-auto leading-relaxed">
                        继续相处：事件盒被压缩/封存、或触发一次认知消化后，角色会自己把沉淀下来的认知写上门牌。
                    </p>
                </div>
            )}

            {PLATE_ROOMS.map(room => {
                const plate = plates.get(room);
                const entries = plate?.entries || [];
                if (entries.length === 0 && totalEntries === 0) return null;
                const accent = ROOM_ACCENT[room];
                const title = room === 'user_room' && userName ? `关于${userName}` : PLATE_TITLES[room];
                return (
                    <div key={room} className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                        <div className="flex items-baseline justify-between mb-1">
                            <h3 className={`text-sm font-bold text-slate-700 flex items-center gap-2`}>
                                <span className={`w-2 h-2 rounded-full ${accent.dot}`}></span>
                                {title}
                            </h3>
                            <span className="text-[10px] text-slate-300 font-bold">{entries.length}/{PLATE_ENTRY_CAPS[room]}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mb-3">{ROOM_HINT[room]}</p>

                        {entries.length === 0 ? (
                            <p className="text-xs text-slate-300 italic">暂无条目</p>
                        ) : (
                            <ul className="space-y-2">
                                {entries.map((e: PlateEntry) => (
                                    <li key={e.id} className="group bg-slate-50 rounded-xl px-3 py-2.5">
                                        {editing?.room === room && editing.entryId === e.id ? (
                                            <div>
                                                <textarea
                                                    value={editing.draft}
                                                    onChange={ev => setEditing({ ...editing, draft: ev.target.value })}
                                                    autoFocus
                                                    rows={2}
                                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 resize-none focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                                                />
                                                <div className="flex justify-end gap-2 mt-1.5">
                                                    <button onClick={() => setEditing(null)} className="text-[10px] font-bold text-slate-400 px-2 py-1 rounded bg-white border border-slate-100">取消</button>
                                                    <button onClick={commitEdit} className="text-[10px] font-bold text-white px-3 py-1 rounded bg-indigo-500">保存</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p
                                                        className="text-sm text-slate-700 leading-relaxed cursor-pointer"
                                                        onClick={() => setEditing({ room, entryId: e.id, draft: e.text })}
                                                        title="点击改写"
                                                    >
                                                        {e.text}
                                                    </p>
                                                    <p className="text-[10px] text-slate-300 mt-1">
                                                        {fmtDate(e.firstLearnedAt)} 得知{e.sourceCount > 1 ? ` · 印证 ${e.sourceCount} 次` : ''}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => removeEntry(room, e.id)}
                                                    className="shrink-0 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1"
                                                    title="删除这条认知"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default RoomPlatePanel;
