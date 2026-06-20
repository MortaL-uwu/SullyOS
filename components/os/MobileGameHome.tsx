import React, { useEffect, useMemo, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { Icons, INSTALLED_APPS } from '../../constants';
import { AppID, CharacterProfile } from '../../types';
import { DB } from '../../utils/db';
import AppIcon from './AppIcon';
import { isDevDebugAvailable, subscribeDevDebugAvailability } from '../../utils/devDebug';

// ===== 手游主题（mobilegame skin）=====
// 二次元手游首页风格的桌面：顶部角色卡 + 等级经验条 + 货币栏、大时钟、公告卡、
// 快捷入口、网格 App 卡、底部 dock。整页自渲染，不复用 default/动森 的启动器布局。
// 设计参考：紫粉赛博 + 玻璃拟态。所有等级 / 经验 / 货币为装饰性数值（按角色 id 稳定派生）。

// 稳定的字符串哈希 —— 让同一个角色每次都显示一致的「等级 / 货币」装饰数值。
const hashStr = (s: string): number => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
};

// 顶部快捷入口（圆形图标）
const QUICK_ENTRIES: { id: AppID; cn: string }[] = [
    { id: AppID.Character, cn: '神经链接' },
    { id: AppID.MemoryPalace, cn: '记忆宫殿' },
    { id: AppID.Call, cn: '电话' },
    { id: AppID.Room, cn: '小小窝' },
];

// 主网格大卡（中文名 + 英文副标）
const GRID_CARDS: { id: AppID; cn: string; en: string }[] = [
    { id: AppID.CheckPhone, cn: '查手机', en: 'PHONE' },
    { id: AppID.Date, cn: '见面', en: 'CONTACTS' },
    { id: AppID.User, cn: '档案', en: 'ARCHIVES' },
    { id: AppID.Bank, cn: '存钱罐', en: 'PIGGYBANK' },
    { id: AppID.Schedule, cn: '日程', en: 'SCHEDULE' },
    { id: AppID.Settings, cn: '设置', en: 'SETTINGS' },
];

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const renderGlyph = (iconKey: string, className: string) => {
    const Comp = Icons[iconKey] || Icons.Settings;
    return <Comp className={className} />;
};

const MobileGameHome: React.FC = () => {
    const { openApp, characters, activeCharacterId, virtualTime, unreadMessages, isDataLoaded, lastMsgTimestamp } = useOS();

    const [widgetChar, setWidgetChar] = useState<CharacterProfile | null>(null);
    const [lastMessage, setLastMessage] = useState<string>('');
    const [drawerOpen, setDrawerOpen] = useState(false);

    const [devDebugVisible, setDevDebugVisible] = useState(() => isDevDebugAvailable());
    useEffect(() => subscribeDevDebugAvailability(setDevDebugVisible), []);

    // 载入当前角色 + 最近一条消息（公告卡 / 角色卡用）
    useEffect(() => {
        if (!isDataLoaded) return;
        if (!characters || characters.length === 0) {
            setWidgetChar(null);
            setLastMessage('');
            return;
        }
        const target = characters.find(c => c.id === activeCharacterId) || characters[0];
        setWidgetChar(target);
        DB.getMessagesByCharId(target.id).then(msgs => {
            const visible = msgs.filter(m => m.role !== 'system');
            if (visible.length > 0) {
                const last = visible[visible.length - 1];
                const clean = last.content.replace(/\[.*?\]/g, '').trim();
                setLastMessage(clean || (last.type === 'image' ? '[图片]' : '[消息]'));
            } else {
                setLastMessage(target.description || '');
            }
        }).catch(() => {});
    }, [activeCharacterId, lastMsgTimestamp, isDataLoaded, characters]);

    const totalUnread = useMemo(
        () => Object.values(unreadMessages).reduce((a, b) => a + b, 0),
        [unreadMessages]
    );

    // 装饰性等级 / 经验 / 货币 —— 按角色 id 稳定派生
    const stats = useMemo(() => {
        const seed = hashStr(widgetChar?.id || 'sullyos');
        const level = 1 + (seed % 60);
        const expMax = 1200 + level * 200;
        const exp = 800 + ((seed >> 3) % (expMax - 800));
        const gems = 500 + ((seed >> 5) % 9000);
        const stars = 20 + ((seed >> 7) % 480);
        return { level, exp, expMax, gems, stars };
    }, [widgetChar?.id]);

    const greeting = virtualTime.hours < 5 ? 'Good Night'
        : virtualTime.hours < 12 ? 'Good Morning'
        : virtualTime.hours < 18 ? 'Good Afternoon'
        : 'Good Evening';
    const hh = virtualTime.hours.toString().padStart(2, '0');
    const mm = virtualTime.minutes.toString().padStart(2, '0');
    const now = new Date();
    const dayName = DAYS[now.getDay()];
    const monthName = MONTHS[now.getMonth()];
    const dateNum = now.getDate();

    const charName = widgetChar?.name || 'SullyOS';
    const tagline = (widgetChar?.description || '「彼方 · 娱乐室」的舞台，永不落幕。').slice(0, 40);
    const announcement = lastMessage || widgetChar?.description || '一切如常，等待新的故事发生。';

    const expPct = Math.min(100, Math.round((stats.exp / stats.expMax) * 100));

    const drawerApps = useMemo(
        () => INSTALLED_APPS.filter(a => a.id !== AppID.CharCreatorDev || devDebugVisible),
        [devDebugVisible]
    );

    // ---- 视觉常量 ----
    const cardBg = 'linear-gradient(150deg, rgba(72,46,120,0.42), rgba(120,52,110,0.30))';
    const cardBorder = '1px solid rgba(214,188,255,0.30)';
    const cardShadow = '0 8px 28px rgba(40,12,70,0.35), inset 0 1px 0 rgba(255,255,255,0.12)';

    const Pill: React.FC<{ icon: React.ReactNode; value: string }> = ({ icon, value }) => (
        <div className="flex items-center gap-1 pl-1.5 pr-1 py-[3px] rounded-full w-[90px]"
            style={{ background: 'rgba(30,16,54,0.55)', border: '1px solid rgba(214,188,255,0.32)', boxShadow: '0 2px 8px rgba(20,6,46,0.3)' }}>
            {icon}
            <span className="flex-1 text-right text-[12px] font-extrabold tabular-nums text-white drop-shadow">{value}</span>
            <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[12px] font-bold leading-none text-white shrink-0"
                style={{ background: 'rgba(255,255,255,0.2)' }}>+</span>
        </div>
    );

    return (
        <div
            className="h-full w-full relative z-10 overflow-hidden select-none"
            style={{ color: '#ffffff', fontFamily: `'Nunito','Noto Sans SC',sans-serif` }}
        >
            {/* 压暗 / 染色层：保证文字在任意壁纸上可读，并统一紫粉氛围 */}
            <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(180deg, rgba(28,12,52,0.55) 0%, rgba(36,14,58,0.25) 35%, rgba(26,10,48,0.6) 100%)' }} />
            <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(244,114,182,0.25), transparent 70%)' }} />
            <div className="absolute top-1/3 -left-20 w-72 h-72 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(129,140,248,0.22), transparent 70%)' }} />

            <div
                className="relative h-full overflow-y-auto no-scrollbar px-5"
                style={{ paddingTop: 'calc(var(--safe-top, 0px) + 1rem)', paddingBottom: '7.5rem' }}
            >
                {/* ===== 顶部：角色卡（左） + 货币竖列（右）===== */}
                <div className="flex items-start gap-3 animate-fade-in">
                    {/* 头像 + 等级绶带 */}
                    <div className="relative shrink-0 mt-0.5" onClick={() => openApp(AppID.Character)}>
                        <div className="w-[72px] h-[72px] rounded-full p-[2.5px] cursor-pointer active:scale-95 transition-transform"
                            style={{ background: 'linear-gradient(135deg, #f0abfc, #818cf8, #67e8f9)', boxShadow: '0 0 18px rgba(192,132,252,0.6)' }}>
                            <div className="w-full h-full rounded-full overflow-hidden bg-[#2a1840] border-2 border-[#1c0f33]">
                                {widgetChar?.avatar
                                    ? <img src={widgetChar.avatar} className="w-full h-full object-cover" alt="char" loading="lazy" />
                                    : <div className="w-full h-full flex items-center justify-center text-2xl">✦</div>}
                            </div>
                        </div>
                        <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-2.5 py-[2px] rounded-md text-[10px] font-black tracking-wide whitespace-nowrap"
                            style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', color: '#3a1d00', boxShadow: '0 2px 8px rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.45)' }}>
                            Lv.{stats.level}
                        </div>
                    </div>

                    {/* 名字 + 标语 + 经验条 */}
                    <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2">
                            <h2 className="text-[19px] font-black truncate drop-shadow-md">{charName}</h2>
                            <span className="flex items-center gap-1 px-1.5 py-px rounded-full text-[8px] font-bold tracking-[0.12em] shrink-0"
                                style={{ background: 'rgba(74,222,128,0.2)', border: '1px solid rgba(74,222,128,0.4)' }}>
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" style={{ boxShadow: '0 0 6px #4ade80' }} />
                                ONLINE
                            </span>
                        </div>
                        <p className="text-[11px] leading-snug mt-1 line-clamp-2 opacity-80">{tagline}</p>
                        {/* EXP */}
                        <div className="flex items-center gap-2 mt-2">
                            <span className="text-[9px] font-black tracking-widest opacity-70">EXP</span>
                            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(20,10,38,0.6)', border: '1px solid rgba(214,188,255,0.25)' }}>
                                <div className="h-full rounded-full" style={{ width: `${expPct}%`, background: 'linear-gradient(90deg,#f472b6,#a78bfa,#67e8f9)', boxShadow: '0 0 8px rgba(167,139,250,0.7)' }} />
                            </div>
                            <span className="text-[9px] font-bold tabular-nums opacity-75 whitespace-nowrap">{stats.exp} / {stats.expMax}</span>
                        </div>
                    </div>

                    {/* 货币竖列 + 菜单 */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <Pill
                            icon={<svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0"><path d="M6 3h12l3 5-9 13L3 8z" fill="#67e8f9" stroke="#22d3ee" strokeWidth="1" strokeLinejoin="round" /></svg>}
                            value={stats.gems.toLocaleString()}
                        />
                        <Pill
                            icon={<svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0"><path d="M12 2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.8 5.9 20.4l1.5-6.8L2.2 9l6.9-.7z" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.8" strokeLinejoin="round" /></svg>}
                            value={stats.stars.toString()}
                        />
                        <button onClick={() => openApp(AppID.Appearance)} aria-label="菜单"
                            className="w-9 h-9 rounded-full flex flex-col items-center justify-center gap-[3px] active:scale-90 transition-transform mt-0.5"
                            style={{ background: 'rgba(30,16,54,0.5)', border: '1px solid rgba(214,188,255,0.3)' }}>
                            <span className="w-4 h-[2px] rounded-full bg-white/85" />
                            <span className="w-4 h-[2px] rounded-full bg-white/85" />
                            <span className="w-4 h-[2px] rounded-full bg-white/85" />
                        </button>
                    </div>
                </div>

                {/* ===== 左栏：时钟 + 公告 + 快捷入口（约占 2/3 宽，右侧留白给壁纸立绘）===== */}
                <div className="w-[66%] min-w-[228px] mt-5">
                    {/* 时钟 */}
                    <div className="flex items-start gap-2 animate-fade-in">
                        <div className="min-w-0">
                            <div className="text-[3.9rem] leading-[0.85] font-normal drop-shadow-2xl"
                                style={{ fontFamily: `'DM Serif Display',serif`, fontFeatureSettings: '"tnum"' }}>
                                {hh}<span className="opacity-45 animate-pulse mx-0.5" style={{ color: '#f0abfc' }}>:</span>{mm}
                            </div>
                            <div className="text-[1.7rem] -mt-1 leading-none"
                                style={{ fontFamily: `'Caveat',cursive`, fontWeight: 700, color: '#f0abfc', textShadow: '0 0 14px rgba(240,171,252,0.55)' }}>
                                {greeting}
                            </div>
                        </div>
                        <div className="text-right pt-1 shrink-0">
                            <div className="text-[10px] font-bold tracking-[0.18em] opacity-85">{dayName}</div>
                            <div className="text-[2.1rem] leading-none font-normal" style={{ fontFamily: `'DM Serif Display',serif` }}>{dateNum}</div>
                            <div className="text-[10px] font-bold tracking-[0.2em] opacity-70">{monthName}</div>
                        </div>
                    </div>

                    {/* 最新公告 */}
                    <button onClick={() => openApp(AppID.HotNews)}
                        className="w-full text-left mt-4 rounded-2xl p-3.5 flex items-center gap-2.5 active:scale-[0.99] transition-transform animate-fade-in"
                        style={{ background: cardBg, border: cardBorder, boxShadow: cardShadow, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="text-[#67e8f9] text-xs">✦</span>
                                <span className="text-[12.5px]" style={{ fontWeight: 900 }}>最新公告</span>
                                <span className="px-1.5 py-px rounded text-[8px] font-black tracking-wider"
                                    style={{ background: 'linear-gradient(135deg,#f472b6,#fb7185)', color: '#fff' }}>NEW</span>
                            </div>
                            <p className="text-[10.5px] leading-relaxed opacity-80 line-clamp-2">{announcement}</p>
                        </div>
                        {/* 公告缩略图（角色立绘）*/}
                        <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden"
                            style={{ border: '1px solid rgba(214,188,255,0.35)', boxShadow: '0 3px 10px rgba(20,6,46,0.35)' }}>
                            {widgetChar?.avatar
                                ? <img src={widgetChar.avatar} className="w-full h-full object-cover" alt="" loading="lazy" />
                                : <div className="w-full h-full flex items-center justify-center text-base" style={{ background: 'rgba(255,255,255,0.08)' }}>✦</div>}
                        </div>
                        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 opacity-60" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                    </button>

                    {/* 快捷入口 */}
                    <div className="mt-3 rounded-2xl p-3.5 animate-fade-in"
                        style={{ background: cardBg, border: cardBorder, boxShadow: cardShadow, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                        <div className="flex items-center gap-1.5 mb-3">
                            <span className="text-[#f0abfc] text-xs">✦</span>
                            <span className="text-[12.5px]" style={{ fontWeight: 900 }}>快捷入口</span>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                            {QUICK_ENTRIES.map(e => (
                                <button key={e.id} onClick={() => openApp(e.id)}
                                    className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform">
                                    <div className="w-11 h-11 rounded-full flex items-center justify-center"
                                        style={{ background: 'radial-gradient(circle at 30% 25%, rgba(192,132,252,0.6), rgba(76,40,120,0.55))', border: '1px solid rgba(214,188,255,0.4)', boxShadow: '0 4px 14px rgba(60,20,100,0.4), inset 0 1px 1px rgba(255,255,255,0.2)' }}>
                                        <div className="w-[22px] h-[22px]" style={{ color: '#f3e8ff' }}>{renderGlyph(INSTALLED_APPS.find(a => a.id === e.id)?.icon || 'Settings', 'w-full h-full')}</div>
                                    </div>
                                    <span className="text-[9.5px] font-bold opacity-90">{e.cn}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ===== App 网格卡（全宽 2 列）===== */}
                <div className="grid grid-cols-2 gap-3 mt-5">
                    {GRID_CARDS.map(card => (
                        <button key={card.id} onClick={() => openApp(card.id)}
                            className="relative h-[6.5rem] rounded-2xl p-4 flex flex-col justify-center text-left overflow-hidden active:scale-[0.97] transition-transform animate-fade-in"
                            style={{ background: cardBg, border: cardBorder, boxShadow: cardShadow, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
                            {/* 角落星标装饰（克制）*/}
                            <span className="absolute top-2 left-2.5 text-[9px] leading-none text-[#67e8f9] opacity-50">✦</span>
                            <span className="absolute top-2 right-2.5 text-[9px] leading-none text-[#f0abfc] opacity-50">✦</span>
                            {/* 应用图标：正立、上色、带光晕，右侧居中 */}
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-[3.75rem] h-[3.75rem] pointer-events-none"
                                style={{ color: '#e9d5ff', opacity: 0.92, filter: 'drop-shadow(0 0 10px rgba(192,132,252,0.55))' }}>
                                {renderGlyph(INSTALLED_APPS.find(a => a.id === card.id)?.icon || 'Settings', 'w-full h-full')}
                            </div>
                            {/* 文字 */}
                            <div className="relative">
                                <div className="text-[19px] leading-tight drop-shadow" style={{ fontWeight: 900 }}>{card.cn}</div>
                                <div className="text-[9px] font-bold tracking-[0.25em] opacity-55 mt-1">{card.en}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* ===== 底部 Dock ===== */}
            <div className="absolute bottom-0 left-0 w-full px-4 z-30 pointer-events-none"
                style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 0.75rem)' }}>
                <div className="relative pointer-events-auto rounded-[1.75rem] px-3 py-2.5 flex items-end justify-between"
                    style={{ background: 'linear-gradient(180deg, rgba(48,24,82,0.6), rgba(30,14,54,0.75))', border: '1px solid rgba(214,188,255,0.3)', boxShadow: '0 -4px 30px rgba(20,6,46,0.5), inset 0 1px 0 rgba(255,255,255,0.1)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
                    <DockItem id={AppID.Chat} cn="消息" badge={totalUnread} onClick={() => openApp(AppID.Chat)} />
                    <DockItem id={AppID.Character} cn="好友" badge={characters?.length || 0} badgeColor="#a78bfa" onClick={() => openApp(AppID.Character)} />
                    {/* 中央罗盘 —— 打开「全部应用」抽屉 */}
                    <button onClick={() => setDrawerOpen(true)} aria-label="全部应用"
                        className="-mt-7 w-16 h-16 rounded-full flex items-center justify-center active:scale-95 transition-transform shrink-0"
                        style={{ background: 'linear-gradient(135deg,#f0abfc,#818cf8,#67e8f9)', boxShadow: '0 6px 22px rgba(129,140,248,0.6), inset 0 2px 6px rgba(255,255,255,0.4)' }}>
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'rgba(28,12,52,0.5)' }}>
                            <svg viewBox="0 0 24 24" className="w-7 h-7">
                                {/* 四角指南星（罗盘）*/}
                                <path d="M12 1.5 L13.7 10.3 L22.5 12 L13.7 13.7 L12 22.5 L10.3 13.7 L1.5 12 L10.3 10.3 Z" fill="#fff" />
                                <path d="M12 6 L12.9 11.1 L18 12 L12.9 12.9 L12 18 L11.1 12.9 L6 12 L11.1 11.1 Z" fill="#67e8f9" />
                            </svg>
                        </div>
                    </button>
                    <DockItem id={AppID.Social} cn="动态" onClick={() => openApp(AppID.Social)} />
                    <DockItem id={AppID.ThemeMaker} cn="商城" onClick={() => openApp(AppID.ThemeMaker)} />
                </div>
            </div>

            {/* ===== 全部应用抽屉 ===== */}
            {drawerOpen && (
                <div className="absolute inset-0 z-40 flex flex-col animate-fade-in"
                    style={{ background: 'rgba(18,8,36,0.82)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
                    onClick={() => setDrawerOpen(false)}>
                    <div className="flex items-center justify-between px-6"
                        style={{ paddingTop: 'calc(var(--safe-top, 0px) + 1.25rem)', paddingBottom: '0.5rem' }}>
                        <h2 className="text-base font-black tracking-wide">全部应用</h2>
                        <button onClick={(e) => { e.stopPropagation(); setDrawerOpen(false); }} aria-label="关闭"
                            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}>
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="#fff" strokeWidth="2.5"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-8" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-4 gap-y-5 gap-x-2 place-items-center">
                            {drawerApps.map(app => (
                                <AppIcon key={app.id} app={app} size="md" onClick={() => { setDrawerOpen(false); openApp(app.id); }} />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// 底部 dock 单项
const DockItem: React.FC<{ id: AppID; cn: string; badge?: number; badgeColor?: string; onClick: () => void }> = ({ id, cn, badge = 0, badgeColor = '#fb7185', onClick }) => {
    const iconKey = INSTALLED_APPS.find(a => a.id === id)?.icon || 'Settings';
    return (
        <button onClick={onClick} className="relative flex flex-col items-center gap-1 w-14 active:scale-90 transition-transform">
            <div className="relative w-7 h-7 text-white/90">
                {renderGlyph(iconKey, 'w-full h-full')}
                {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-bold text-white border border-white/30"
                        style={{ background: badgeColor }}>
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </div>
            <span className="text-[10px] font-bold opacity-85">{cn}</span>
        </button>
    );
};

export default MobileGameHome;
