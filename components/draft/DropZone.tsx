
import React, { forwardRef } from 'react';

interface DropZoneProps {
  poolCount: number;
  isInsideDropZone: boolean;
  onClick: () => void;
}

const DropZone = forwardRef<HTMLDivElement, DropZoneProps>(({ poolCount, isInsideDropZone, onClick }, ref) => {
  return (
    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm h-48 z-40 flex items-end justify-center pointer-events-none">
    <div className="flex flex-col items-center mb-6 pointer-events-auto">
      <div 
        ref={ref}
        onClick={onClick}
        className={`
          relative w-24 h-24 rounded-full flex items-center justify-center cursor-pointer
          transition-all duration-300 transform shadow-2xl
          ${isInsideDropZone 
              ? 'scale-110 bg-blue-600 ring-[12px] ring-blue-500/20 border-white' 
              : 'bg-slate-800/90 backdrop-blur-2xl border-2 border-slate-600 hover:bg-slate-700'
          }
        `}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-10 w-10 transition-colors ${isInsideDropZone ? 'text-white' : 'text-blue-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <div className={`absolute -top-1 -right-1 bg-blue-500 text-white text-xs font-bold w-7 h-7 rounded-full border-2 border-slate-900 flex items-center justify-center transition-transform ${isInsideDropZone ? 'scale-125' : ''}`}>
          {poolCount}
        </div>
      </div>
      
      {/* Label modificata per maggiore visibilità */}
      <span className={`
          mt-4 px-5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all duration-300 border shadow-xl
          ${isInsideDropZone 
            ? 'bg-blue-600 border-blue-400 text-white translate-y-1 scale-105' 
            : 'bg-slate-800 border-slate-600 text-slate-200'
          }
      `}>
        {isInsideDropZone ? 'Release to Pick' : 'Your Pool'}
      </span>
    </div>
  </div>
  );
});

DropZone.displayName = 'DropZone';

export default DropZone;
