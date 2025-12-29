
import React from 'react';
import { DraftState, Player } from '../../types';
import PoolOverlay from './PoolOverlay';

interface WaitingScreenProps {
  draftState: DraftState;
  myClientId: string;
  onExitClick: () => void;
  pool: Player['pool'];
  isPoolViewOpen: boolean;
  setIsPoolViewOpen: (val: boolean) => void;
}

const WaitingScreen: React.FC<WaitingScreenProps> = ({ 
  draftState, 
  myClientId, 
  onExitClick, 
  pool,
  isPoolViewOpen,
  setIsPoolViewOpen
}) => {
  return (
    <div className="flex flex-col items-center justify-center h-full text-white animate-fade-in relative p-6">
        {/* Desktop Only Exit Button */}
        <div className="absolute top-4 right-4 z-50 hidden md:block">
          <button 
            type="button" 
            onClick={onExitClick} 
            className="bg-slate-700 hover:bg-red-900/50 text-slate-300 hover:text-red-200 px-3 py-1 rounded text-xs font-bold border border-slate-600 hover:border-red-800 transition-all flex items-center gap-1 min-h-[26px]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Exit Game</span>
          </button>
        </div>
        <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 shadow-2xl text-center max-w-md w-full">
            <div className="mb-6"><div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div></div>
            <h2 className="text-2xl font-bold mb-2">Pick Submitted</h2>
            <p className="text-slate-400">Waiting for other players...</p>
            <div className="mt-8">
                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-4">Draft Order Status</p>
                <div className="flex flex-wrap justify-center gap-3">
                    {draftState.players.map(p => (
                        <div key={p.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border transition-all duration-300 ${p.hasPicked ? 'bg-emerald-900/30 border-emerald-500/50 text-emerald-400' : 'bg-slate-700/50 border-slate-600 text-slate-400 opacity-60'}`}>
                            <div className={`w-2 h-2 rounded-full ${p.hasPicked ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></div>
                            {p.name} {p.clientId === myClientId && "(You)"}
                            {p.isBot && <span className="text-[9px] bg-slate-900 px-1 rounded ml-1">BOT</span>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
        <button onClick={() => setIsPoolViewOpen(true)} className="mt-8 text-blue-400 hover:text-white text-sm font-medium underline underline-offset-4">Review your pool ({pool.length} cards)</button>
        {isPoolViewOpen && <PoolOverlay pool={pool} onClose={() => setIsPoolViewOpen(false)} />}
    </div>
  );
};

export default WaitingScreen;
