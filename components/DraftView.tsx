import React, { useState, useEffect, useCallback } from 'react';
import { DraftState, Card } from '../types';
import CardImage from './CardImage';
import { useModal } from './ModalSystem';

interface DraftViewProps {
  draftState: DraftState;
  onPick: (card: Card) => void;
  userSeatIndex: number;
  onExit: () => void;
}

const DraftView: React.FC<DraftViewProps> = ({ draftState, onPick, userSeatIndex, onExit }) => {
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const player = draftState.players[userSeatIndex];
  const hasPicked = player.hasPicked;
  const { showConfirm } = useModal();
  
  const currentPackIndex = draftState.currentPackIndex[userSeatIndex];
  const currentPack = draftState.packs[userSeatIndex][currentPackIndex] || [];

  // Resizable Pool Logic
  const [poolHeight, setPoolHeight] = useState(160);
  const [isResizing, setIsResizing] = useState(false);
  const [isPoolCollapsed, setIsPoolCollapsed] = useState(false);

  const startResizing = useCallback((e: React.MouseEvent) => { setIsResizing(true); e.preventDefault(); }, []);
  const togglePool = (e: React.MouseEvent | React.TouchEvent) => { if (isResizing) return; e.stopPropagation(); setIsPoolCollapsed(!isPoolCollapsed); };

  useEffect(() => {
      const stopResizing = () => setIsResizing(false);
      const resize = (e: MouseEvent) => {
          if (isResizing) {
              const newHeight = window.innerHeight - e.clientY;
              if (newHeight >= 150) { setPoolHeight(newHeight); if (isPoolCollapsed) setIsPoolCollapsed(false); }
          }
      };
      if (isResizing) { window.addEventListener('mousemove', resize); window.addEventListener('mouseup', stopResizing); }
      return () => { window.removeEventListener('mousemove', resize); window.removeEventListener('mouseup', stopResizing); }
  }, [isResizing, isPoolCollapsed]);

  const handleExitClick = () => {
    showConfirm(
      "Exit Game?",
      "Are you sure you want to leave? A bot will take over your spot for the rest of the draft.",
      () => onExit()
    );
  };

  if (hasPicked) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white animate-fade-in relative">
             <button type="button" onClick={handleExitClick} className="absolute top-0 right-4 bg-red-900/50 hover:bg-red-700 text-red-200 px-3 py-1 rounded text-xs border border-red-800 z-50">Exit Game</button>
            <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-2xl text-center max-w-md">
                <div className="mb-4"><div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div></div>
                <h2 className="text-2xl font-bold mb-2">Pick Submitted</h2>
                <p className="text-slate-400">Waiting for other players...</p>
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                    {draftState.players.filter(p => !p.isBot).map(p => (
                        <div key={p.id} className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border ${p.hasPicked ? 'bg-green-900/30 border-green-500 text-green-400' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
                            {p.name} {p.hasPicked ? '✓' : '...'}
                        </div>
                    ))}
                </div>
            </div>
        </div>
      );
  }

  if (!currentPack.length) return <div className="flex flex-col items-center justify-center h-full text-white">Pack Empty</div>;

  return (
    <div className="flex flex-col h-full gap-2 md:gap-4 relative">
      <div className="flex justify-between items-center bg-slate-800 p-2 md:p-4 rounded-lg shadow-md border border-slate-700 shrink-0">
        <div className="flex items-center gap-3 md:block">
          <h2 className="text-sm md:text-xl font-bold text-blue-400 whitespace-nowrap">Pack {draftState.round} <span className="text-slate-500">/ 3</span></h2>
          <div className="h-4 w-px bg-slate-600 md:hidden"></div>
          <p className="text-slate-400 text-xs md:text-sm font-mono">Pick {15 - currentPack.length + 1}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right flex items-center gap-2 md:block">
            <p className="font-semibold text-xs md:text-base text-emerald-400 uppercase flex items-center gap-1">{draftState.direction === 'left' ? '← Left' : 'Right →'}</p>
          </div>
          <button type="button" onClick={handleExitClick} className="bg-red-900/50 hover:bg-red-700 text-red-200 px-3 py-1 rounded text-xs border border-red-800 ml-2">Exit</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-[100px] pb-4 px-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
          {currentPack.map((card) => (
            <div key={card.id} className="relative group">
              <CardImage name={card.name} onClick={() => onPick(card)} />
              <div className="hidden md:flex absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center rounded-lg pointer-events-none">
                <span className="text-white font-bold tracking-wider border-2 border-white px-4 py-1 rounded-full">PICK</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border-t border-slate-700 rounded-t-xl shadow-[0_-5px_15px_rgba(0,0,0,0.5)] relative shrink-0 transition-all duration-300 ease-in-out" style={{ height: isPoolCollapsed ? 40 : poolHeight }}>
        <div className="absolute -top-3 left-0 right-0 h-8 z-20 flex items-center justify-center group cursor-pointer" onMouseDown={startResizing} onClick={togglePool}>
            <div className="w-16 h-4 bg-slate-700 rounded-t-lg flex items-center justify-center shadow-lg border-t border-x border-slate-600">
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-slate-300 transition-transform duration-300 ${isPoolCollapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
        </div>
        <div className="h-full flex flex-col p-2 overflow-hidden">
             <div className="flex items-center justify-between mb-2 shrink-0 px-1" onClick={togglePool}>
                 <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Your Pool <span className="text-white">({player.pool.length})</span></h3>
             </div>
            <div className={`flex-1 overflow-y-auto overflow-x-hidden transition-opacity duration-200 ${isPoolCollapsed ? 'opacity-0' : 'opacity-100'}`}>
                <div className="flex flex-wrap gap-2 content-start pb-4">
                  {player.pool.slice().reverse().map((card) => (
                    <div key={card.id} className="w-16 md:w-20 shrink-0">
                       <CardImage name={card.name} hoverEffect={false} className="rounded-md cursor-zoom-in shadow-sm" onClick={(e) => { e.stopPropagation(); setSelectedCard(card); }} />
                    </div>
                  ))}
                </div>
            </div>
        </div>
      </div>

      {selectedCard && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedCard(null)}>
           <div className="max-w-sm w-full relative">
             <button className="absolute -top-10 right-0 text-white text-3xl hover:text-slate-300" onClick={() => setSelectedCard(null)}>&times;</button>
             <CardImage name={selectedCard.name} hoverEffect={false} className="rounded-xl shadow-2xl" />
             <div className="text-center mt-4"><span className="text-white font-bold text-xl">{selectedCard.name}</span>{selectedCard.cmc !== undefined && <span className="text-slate-400 ml-2">CMC: {selectedCard.cmc}</span>}</div>
           </div>
        </div>
      )}
    </div>
  );
};

export default DraftView;