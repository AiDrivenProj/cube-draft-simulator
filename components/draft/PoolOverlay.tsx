
import React, { useState, useMemo } from 'react';
import { Card } from '../../types';
import CardImage from '../CardImage';

interface PoolOverlayProps {
    pool: Card[];
    onClose: () => void;
}

type CardCategory = 'Creatures' | 'Planeswalkers' | 'Instants' | 'Sorceries' | 'Enchantments' | 'Artifacts' | 'Lands' | 'Others';

const PoolOverlay: React.FC<PoolOverlayProps> = ({ pool, onClose }) => {
    const [activeType, setActiveType] = useState<CardCategory | null>(null);
    const [activeColor, setActiveColor] = useState<string | null>(null);

    // Centralized logic to determine card category, matching DeckView priority order
    const getCardCategory = (card: Card): CardCategory => {
        const t = (card.type_line || '').toLowerCase();
        if (t.includes('creature')) return 'Creatures';
        if (t.includes('planeswalker')) return 'Planeswalkers';
        if (t.includes('instant')) return 'Instants';
        if (t.includes('sorcery')) return 'Sorceries';
        if (t.includes('enchantment')) return 'Enchantments';
        if (t.includes('artifact')) return 'Artifacts';
        if (t.includes('land')) return 'Lands';
        return 'Others';
    };

    const stats = useMemo(() => {
        const counts: Record<CardCategory, number> = {
            Creatures: 0,
            Planeswalkers: 0,
            Instants: 0,
            Sorceries: 0,
            Enchantments: 0,
            Artifacts: 0,
            Lands: 0,
            Others: 0
        };
        
        pool.forEach(c => {
            const category = getCardCategory(c);
            counts[category]++;
        });
        return counts;
    }, [pool]);

    const filteredPool = useMemo(() => {
        return pool.filter(c => {
            // Filter by Color
            if (activeColor) {
                if (activeColor === 'C') {
                    // Colorless
                    if (c.colors && c.colors.length > 0) return false;
                } else if (activeColor === 'M') {
                    // Multicolor
                    if (!c.colors || c.colors.length < 2) return false;
                } else {
                    // Specific Color
                    if (!c.colors?.includes(activeColor)) return false;
                }
            }

            // Filter by Type (Strict category match)
            if (activeType) {
                const category = getCardCategory(c);
                if (category !== activeType) return false;
            }
            return true;
        });
    }, [pool, activeType, activeColor]);

    const renderStatBadge = (count: number, label: CardCategory, activeColorClass: string) => {
        if (count === 0) return null;
        const isActive = activeType === label;
        // If inactive, use generic slate style. If active, use activeColorClass.
        const colorStyle = isActive ? activeColorClass + ' text-white ring-2 ring-white border-transparent' : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600 hover:text-white';
        const badgeStyle = isActive ? 'bg-black/30' : 'bg-slate-800 text-slate-300';

        return (
            <button 
                onClick={() => setActiveType(isActive ? null : label)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide transition-all shadow-sm border ${colorStyle} ${isActive ? 'scale-105 shadow-md' : ''}`}
            >
                <span>{label}</span>
                <span className={`px-1.5 rounded text-[9px] min-w-[16px] text-center ${badgeStyle}`}>{count}</span>
            </button>
        );
    };

    const renderColorButton = (code: string, label: string, bgClass: string) => {
        const isActive = activeColor === code;
        return (
            <button
                onClick={() => setActiveColor(isActive ? null : code)}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shadow-md transition-all border-2 ${bgClass} ${isActive ? 'scale-110 ring-2 ring-white border-transparent z-10' : 'border-slate-800 opacity-80 hover:opacity-100 hover:scale-105'}`}
                title={label}
            >
                {code}
            </button>
        );
    }

    const clearFilters = () => {
        setActiveType(null);
        setActiveColor(null);
    };

    const hasFilters = activeType !== null || activeColor !== null;

    return (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-lg animate-fade-in flex flex-col p-4">
            <div className="flex flex-col gap-3 mb-4 shrink-0 border-b border-slate-800/50 pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-white leading-none">Draft Pool</h2>
                        <p className="text-xs text-slate-400 font-bold mt-1">
                            {filteredPool.length !== pool.length ? <span className="text-blue-400">{filteredPool.length} of </span> : ''}
                            {pool.length} Cards Total
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {hasFilters && (
                            <button onClick={clearFilters} className="text-[10px] font-bold uppercase text-slate-400 hover:text-white bg-slate-800 px-2 py-1 rounded border border-slate-700 hover:border-slate-500 transition-colors">
                                Clear
                            </button>
                        )}
                        <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-white hover:bg-slate-700 transition-colors border border-slate-700">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>
                
                {/* Color Filters */}
                <div className="flex items-center gap-2">
                    {renderColorButton('W', 'White', 'bg-[#f8f6d8] text-slate-900')}
                    {renderColorButton('U', 'Blue', 'bg-[#0e68ab] text-white')}
                    {renderColorButton('B', 'Black', 'bg-[#150b00] text-white')}
                    {renderColorButton('R', 'Red', 'bg-[#d3202a] text-white')}
                    {renderColorButton('G', 'Green', 'bg-[#00733e] text-white')}
                    <div className="w-px h-4 bg-slate-700 mx-0.5"></div>
                    {renderColorButton('C', 'Colorless', 'bg-slate-400 text-slate-900')}
                    {renderColorButton('M', 'Multicolor', 'bg-gradient-to-br from-yellow-400 via-red-500 to-blue-600 text-white')}
                </div>

                {/* Type Stats / Filters */}
                <div className="flex flex-wrap gap-2">
                    {renderStatBadge(stats.Creatures, "Creatures", "bg-orange-700")}
                    {renderStatBadge(stats.Planeswalkers, "Planeswalkers", "bg-fuchsia-700")}
                    {renderStatBadge(stats.Instants, "Instants", "bg-sky-600")}
                    {renderStatBadge(stats.Sorceries, "Sorceries", "bg-rose-600")}
                    {renderStatBadge(stats.Enchantments, "Enchantments", "bg-teal-600")}
                    {renderStatBadge(stats.Artifacts, "Artifacts", "bg-slate-600")}
                    {renderStatBadge(stats.Lands, "Lands", "bg-amber-800")}
                    {renderStatBadge(stats.Others, "Others", "bg-slate-700")}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto touch-pan-y scrollbar-thin">
                {filteredPool.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        <p className="font-medium italic">No cards match filters.</p>
                        {hasFilters && <button onClick={clearFilters} className="text-blue-400 hover:text-white underline text-sm">Clear Filters</button>}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 pb-12">
                        {filteredPool.map((card, i) => (
                            <div key={`${card.id}-${i}`} className="animate-fade-in" style={{ animationDelay: `${i * 0.01}s` }}>
                                <CardImage name={card.name} hoverEffect={true} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="mt-2 text-center pt-2 border-t border-slate-800/50">
                <button onClick={onClose} className="bg-blue-600 hover:bg-blue-500 text-white w-full max-w-md py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95 text-sm uppercase tracking-wider">Back to Draft</button>
            </div>
        </div>
    );
};

export default PoolOverlay;
