
import React from 'react';
import { Card } from '../../../types';
import CardImage from '../../CardImage';

interface MatrixViewProps {
  matrixData: Record<string, Record<string, Card[]>>;
  visibleRows: string[];
  cmcOrder: string[];
  getInitial: (key: string) => string;
  getFullName: (key: string) => string;
  getColorStyle: (key: string) => string;
  emptyMessage: string;
  activeTooltip: string | null;
  setActiveTooltip: (val: string | null) => void;
  setZoomedCard: (card: Card) => void;
}

const MatrixView: React.FC<MatrixViewProps> = ({
  matrixData,
  visibleRows,
  cmcOrder,
  getInitial,
  getFullName,
  getColorStyle,
  emptyMessage,
  activeTooltip,
  setActiveTooltip,
  setZoomedCard
}) => {

    if (visibleRows.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 p-8">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="font-medium italic">{emptyMessage}</p>
            </div>
        );
    }

    return (
    <div className="min-w-max p-4 overflow-auto scrollbar-thin">
        <div className="grid border-r border-b border-slate-500" style={{ gridTemplateColumns: `80px repeat(${cmcOrder.length}, auto)` }}>
            {/* Header Row */}
            <div className="h-8 border-l border-t border-slate-500 bg-slate-950/80 sticky top-0 left-0 z-30"></div>
            {cmcOrder.map(cmc => (
                <div key={cmc} className="h-8 flex items-center justify-center bg-slate-800 border-l border-t border-slate-500 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 sticky top-0 z-20 shadow-sm">
                    CMC {cmc}
                </div>
            ))}

            {/* Matrix Rows */}
            {visibleRows.map(rowKey => {
                const initial = getInitial(rowKey);
                const fullName = getFullName(initial) || rowKey;
                return (
                <React.Fragment key={rowKey}>
                    <div className="flex items-center justify-center p-2 bg-slate-800 border-l border-t border-slate-500 sticky left-0 z-10 backdrop-blur-md relative">
                        <div 
                            onClick={(e) => { e.stopPropagation(); setActiveTooltip(fullName); }}
                            className={`w-10 h-10 rounded-full shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex items-center justify-center text-[10px] font-black border-2 border-slate-900/40 transition-transform hover:scale-105 cursor-help ${getColorStyle(rowKey)}`}
                        >
                            {initial}
                        </div>
                        {activeTooltip === fullName && (
                            <div className="absolute left-full ml-2 px-3 py-1 bg-blue-600 text-white text-[10px] font-bold uppercase rounded shadow-xl z-50 whitespace-nowrap animate-fade-in pointer-events-none ring-2 ring-white/20">
                                {fullName}
                                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-blue-600 rotate-45"></div>
                            </div>
                        )}
                    </div>
                    {cmcOrder.map(cmc => {
                        const cards = matrixData[rowKey][cmc];
                        return (
                            <div key={`${rowKey}-${cmc}`} className="p-1 bg-slate-900/60 border-l border-t border-slate-500 flex flex-wrap gap-1 content-start items-start transition-colors hover:bg-slate-800/40">
                                {cards.map(card => (
                                    <div 
                                        key={card.id} 
                                        className="w-[50px] md:w-[65px] h-auto aspect-[2.5/3.5] cursor-pointer hover:scale-105 active:scale-95 transition-transform relative group"
                                        onClick={() => setZoomedCard(card)}
                                    >
                                        <CardImage name={card.name} hoverEffect={false} className="rounded shadow-md border border-slate-700/50" />
                                        <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/10 transition-colors pointer-events-none rounded"></div>
                                    </div>
                                ))}
                                {cards.length === 0 && <div className="w-[50px] md:w-[65px] h-auto aspect-[2.5/3.5] invisible"></div>}
                            </div>
                        );
                    })}
                </React.Fragment>
            )})}
        </div>
    </div>
    );
};

export default MatrixView;
