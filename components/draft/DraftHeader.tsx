
import React from 'react';

interface DraftHeaderProps {
  round: number;
  pickNumber: number;
  isAutopickEnabled: boolean;
  onAutopickToggle: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRandomPick: () => void;
  onExitClick: () => void;
}

const DraftHeader: React.FC<DraftHeaderProps> = ({ 
  round, 
  pickNumber, 
  isAutopickEnabled, 
  onAutopickToggle, 
  onRandomPick, 
  onExitClick 
}) => {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-slate-800/40 backdrop-blur-sm border-b border-slate-700/50 z-10 shrink-0 mt-8">
    <div className="flex items-center gap-4">
        <div className="bg-blue-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white flex items-center h-6">
            <span className="hidden sm:inline">Pack </span>{round}
        </div>
        <div className="flex items-center h-6">
            <span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-tight whitespace-nowrap">
                Pick {pickNumber} of 15
            </span>
        </div>
    </div>
    
    <div className="flex items-center gap-2 sm:gap-4">
        {/* Autopick Switch */}
        <label className="flex items-center gap-1.5 cursor-pointer group px-1">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-tight text-slate-500 sm:text-slate-400 group-hover:text-slate-200 transition-colors">Auto</span>
            <div className="relative inline-flex items-center cursor-pointer scale-90 sm:scale-100">
            <input 
                type="checkbox" 
                checked={isAutopickEnabled} 
                onChange={onAutopickToggle} 
                className="sr-only peer" 
            />
            <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
            </div>
        </label>

        <button 
        onClick={onRandomPick}
        className="flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-200 w-8 h-8 sm:w-auto sm:px-3 sm:py-1 rounded border border-slate-600 transition-colors"
        title="Pick a random card"
        >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span className="hidden sm:inline ml-1.5 text-[10px] font-bold uppercase tracking-tight">Random</span>
        </button>
        
        {/* Desktop Only Exit Button (Hidden on Mobile) */}
        <button 
        onClick={onExitClick} 
        className="hidden md:flex bg-slate-700 hover:bg-red-900/50 text-slate-300 hover:text-red-200 px-3 py-1 rounded border border-slate-600 hover:border-red-800 transition-all items-center justify-center"
        title="Exit Draft"
        >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        <span className="ml-1.5 text-[10px] font-bold uppercase tracking-tight">Exit</span>
        </button>
    </div>
    </div>
  );
};

export default DraftHeader;
