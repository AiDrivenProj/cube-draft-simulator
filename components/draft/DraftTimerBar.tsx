
import React from 'react';

interface DraftTimerBarProps {
  timeLeft: number;
  baseTimerLimit: number;
  redAlertThreshold: number;
}

const DraftTimerBar: React.FC<DraftTimerBarProps> = ({ timeLeft, baseTimerLimit, redAlertThreshold }) => {
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getTimerColorClass = () => {
    if (timeLeft <= redAlertThreshold) return 'bg-red-500 animate-pulse';
    if (timeLeft <= 45) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  return (
    <div className={`absolute top-0 left-0 w-full h-8 bg-slate-950/80 backdrop-blur-sm border-b z-50 flex items-center px-4 transition-colors duration-300 ${timeLeft <= redAlertThreshold ? 'border-red-500/50' : 'border-slate-800'}`}>
        <div className="relative z-10 flex items-center gap-1.5">
        <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 ${timeLeft <= redAlertThreshold ? 'text-red-500 animate-pulse' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className={`text-[12px] font-mono font-black transition-colors duration-300 ml-1 mr-4 ${timeLeft <= redAlertThreshold ? 'text-red-500' : 'text-slate-300'}`}>
            {formatTime(timeLeft)}
        </span>
        </div>
        <div className="absolute bottom-0 left-0 w-full h-[3px] bg-slate-900/50">
            <div 
            className={`h-full transition-all duration-1000 ease-linear ${getTimerColorClass()}`}
            style={{ width: `${(timeLeft / baseTimerLimit) * 100}%` }}
            ></div>
        </div>
    </div>
  );
};

export default DraftTimerBar;
