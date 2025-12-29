
import React from 'react';

interface DeckHeaderProps {
    matrixMode: 'none' | 'color' | 'type';
    setMatrixMode: (mode: 'none' | 'color' | 'type') => void;
    isSortMenuOpen: boolean;
    setIsSortMenuOpen: (val: boolean) => void;
    handleSortAction: (mode: 'cmc' | 'color' | 'type') => void;
    showLandPicker: boolean;
    setShowLandPicker: (val: boolean) => void;
    landButtonRef: React.RefObject<HTMLButtonElement | null>;
    landPickerRef: React.RefObject<HTMLDivElement | null>;
    getLandCount: (type: string) => number;
    updateLandCount: (type: string, delta: number) => void;
    isStackedView: boolean;
    setIsStackedView: (val: boolean) => void;
    totalMainDeck: number;
    sideboardCount: number;
    onExportClick: () => void;
    onShareClick: () => void;
    onExitClick: () => void;
    sortMenuRef: React.RefObject<HTMLDivElement | null>;
}

const DeckHeader: React.FC<DeckHeaderProps> = ({
    matrixMode,
    setMatrixMode,
    isSortMenuOpen,
    setIsSortMenuOpen,
    handleSortAction,
    showLandPicker,
    setShowLandPicker,
    landButtonRef,
    landPickerRef,
    getLandCount,
    updateLandCount,
    isStackedView,
    setIsStackedView,
    totalMainDeck,
    sideboardCount,
    onExportClick,
    onShareClick,
    onExitClick,
    sortMenuRef
}) => {
    const isMatrixView = matrixMode !== 'none';

    return (
      <div 
        className="flex items-center justify-between p-3 bg-slate-800 border-b border-slate-700 shrink-0 z-20 shadow-md"
        onPointerDown={(e) => e.stopPropagation()}
      >
         <div className="flex items-center gap-2 md:gap-4">
             <h1 className="text-lg font-bold text-white hidden sm:block">Deck Builder</h1>

             <div className="flex items-center bg-slate-900/50 rounded p-0.5 border border-slate-700">
                {/* Mobile View Selector */}
                <div className="md:hidden relative flex items-center bg-slate-700/30 rounded px-2">
                    <select 
                        value={matrixMode} 
                        onChange={(e) => setMatrixMode(e.target.value as any)}
                        className="bg-transparent text-[10px] font-black uppercase text-blue-400 py-1 pr-6 outline-none border-none focus:ring-0 appearance-none cursor-pointer"
                    >
                        <option value="none" className="bg-slate-800 text-white">Pool</option>
                        <option value="color" className="bg-slate-800 text-white">Color</option>
                        <option value="type" className="bg-slate-800 text-white">Type</option>
                    </select>
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </div>
                </div>

                {/* Desktop View Buttons */}
                <div className="hidden md:flex">
                    <button 
                        onClick={() => setMatrixMode('none')}
                        className={`px-3 py-1 rounded text-[10px] font-black uppercase transition-all ${matrixMode === 'none' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Pool
                    </button>
                    <button 
                        onClick={() => setMatrixMode('color')}
                        className={`px-3 py-1 rounded text-[10px] font-black uppercase transition-all ${matrixMode === 'color' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Color
                    </button>
                    <button 
                        onClick={() => setMatrixMode('type')}
                        className={`px-3 py-1 rounded text-[10px] font-black uppercase transition-all ${matrixMode === 'type' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Type
                    </button>
                </div>
             </div>
             
             {!isMatrixView && (
                 <div className="relative" ref={sortMenuRef}>
                     <button onClick={() => setIsSortMenuOpen(!isSortMenuOpen)} className="px-3 py-1 rounded text-xs font-bold border border-slate-600 text-slate-400 hover:text-white flex items-center gap-1 transition-colors min-h-[26px]">
                        <span className="md:hidden"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg></span>
                        <span className="hidden md:flex items-center gap-1">Sort Cards ▾</span>
                     </button>
                     {isSortMenuOpen && (
                        <>
                            <div className="fixed inset-0 bg-black/80 z-[90] md:hidden" onClick={() => setIsSortMenuOpen(false)}></div>
                            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-64 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in md:absolute md:top-full md:left-0 md:translate-x-0 md:translate-y-0 md:w-40 md:mt-1 md:z-50 md:rounded-lg">
                                <div className="flex justify-between items-center p-3 border-b border-slate-700 bg-slate-900/50 md:hidden">
                                    <span className="text-xs font-bold text-slate-400 uppercase">Sort Deck By</span>
                                    <button onClick={() => setIsSortMenuOpen(false)} className="text-slate-400 hover:text-white">✕</button>
                                </div>
                                <button onClick={() => handleSortAction('cmc')} className="text-left px-4 py-3 md:py-2 text-sm md:text-xs hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border-b border-slate-700/50">By CMC</button>
                                <button onClick={() => handleSortAction('color')} className="text-left px-4 py-3 md:py-2 text-sm md:text-xs hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border-b border-slate-700/50">By Color</button>
                                <button onClick={() => handleSortAction('type')} className="text-left px-4 py-3 md:py-2 text-sm md:text-xs hover:bg-slate-700 text-slate-300 hover:text-white transition-colors">By Type</button>
                            </div>
                        </>
                     )}
                 </div>
             )}

             {!isMatrixView && (
                 <div className="relative">
                     <button ref={landButtonRef} onClick={() => setShowLandPicker(!showLandPicker)} className={`px-3 py-1 rounded text-xs font-bold border transition-colors min-h-[26px] ${showLandPicker ? 'bg-slate-700 border-slate-500 text-white' : 'border-slate-600 text-slate-400 hover:text-white'}`}>
                        <span className="md:hidden">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </span>
                        <span className="hidden md:inline">+ Basic Lands</span>
                     </button>
                     {showLandPicker && (
                         <>
                            <div className="fixed inset-0 bg-black/80 z-[90] lg:hidden" onClick={() => setShowLandPicker(false)}></div>
                            <div ref={landPickerRef} className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4 z-[95] animate-fade-in fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] max-w-sm lg:absolute lg:top-full lg:left-0 lg:translate-x-0 lg:translate-y-0 lg:w-64 lg:mt-2">
                                <div className="flex justify-between items-center mb-3"><h4 className="text-xs font-bold text-slate-400 uppercase">Add Lands to Deck</h4><button onClick={() => setShowLandPicker(false)} className="lg:hidden text-slate-400 hover:text-white px-2">✕</button></div>
                                <div className="space-y-2 mb-2">
                                    {(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'] as const).map(type => {
                                        const currentCount = getLandCount(type);
                                        return (
                                            <div key={type} className="flex items-center justify-between">
                                                <span className="text-sm font-medium flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${type === 'Plains' ? 'bg-yellow-100' : type === 'Island' ? 'bg-blue-500' : type === 'Swamp' ? 'bg-purple-900' : type === 'Mountain' ? 'bg-red-500' : 'bg-green-600'}`}></div>{type}</span>
                                                <div className="flex items-center gap-2"><button onClick={() => updateLandCount(type, -1)} className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center">-</button><span className="w-6 text-center text-sm font-mono">{currentCount}</span><button onClick={() => updateLandCount(type, 1)} className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center">+</button></div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                         </>
                     )}
                 </div>
             )}

             {!isMatrixView && (
                 <button 
                    onClick={() => setIsStackedView(!isStackedView)}
                    className="px-3 py-1 rounded text-xs font-bold border border-slate-600 text-slate-400 hover:text-white flex items-center gap-1 transition-colors min-h-[26px]"
                    title={isStackedView ? "Switch to List View" : "Switch to Stacked View"}
                 >
                    <span className="md:hidden">
                        {isStackedView ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                        )}
                    </span>
                    <span className="hidden md:inline">{isStackedView ? "Spread" : "Collapse"}</span>
                 </button>
             )}
             
             <div className="text-xs text-slate-400 font-mono border-l border-slate-700 pl-4 flex flex-col md:flex-row md:items-center gap-0 md:gap-2 leading-none md:leading-normal">
                <span className="whitespace-nowrap">
                    <span className="hidden md:inline">Mainboard</span>
                    <span className="md:hidden">M</span>: <span className="text-white font-bold">{totalMainDeck}</span>
                </span>
                <span className="whitespace-nowrap">
                    <span className="hidden md:inline">Sideboard</span>
                    <span className="md:hidden">S</span>: {sideboardCount}
                </span>
             </div>

         </div>
         <div className="flex items-center gap-2 md:gap-4">
             <button onClick={onShareClick} className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 min-h-[26px]" title="Share Deck via Link">
                <span className="md:hidden"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg></span>
                <span className="hidden md:inline">Share</span>
             </button>
             <button onClick={onExportClick} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 min-h-[26px]">
                <span className="md:hidden"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></span>
                <span className="hidden md:inline">Export .txt</span>
             </button>
             
             {/* Desktop Only Exit Button (Restored to hidden md:flex) */}
             <button onClick={onExitClick} className="hidden md:flex bg-slate-700 hover:bg-red-900/50 text-slate-300 hover:text-red-200 px-3 py-1 rounded text-xs font-bold border border-slate-600 hover:border-red-800 transition-all min-h-[26px] items-center gap-1">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                <span>Exit</span>
             </button>
         </div>
      </div>
    );
};

export default DeckHeader;
