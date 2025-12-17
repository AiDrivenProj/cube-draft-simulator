import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DraftState, Card } from '../types';
import { enrichCardData } from '../services/cubeService';
import CardImage from './CardImage';

interface RecapViewProps {
  draftState: DraftState;
  onProceed: () => void;
  myClientId: string;
}

interface ColumnData {
  id: string;
  title: string;
  cards: Card[];
}

interface DragGhostState {
  active: boolean;
  x: number;
  y: number;
  card: Card;
  sourceType: 'col' | 'sb';
  containerId: string;
}

const STACK_OFFSET = 35;
const CARD_HEIGHT = 220;

const RecapView: React.FC<RecapViewProps> = ({ draftState, onProceed, myClientId }) => {
  const [viewMode, setViewMode] = useState<'MY_POOL' | 'OPPONENTS'>('MY_POOL');
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [sideboard, setSideboard] = useState<Card[]>([]);
  const [showLandPicker, setShowLandPicker] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sideboardHeight, setSideboardHeight] = useState(200);
  const [isResizingSideboard, setIsResizingSideboard] = useState(false);
  
  const landPickerRef = useRef<HTMLDivElement>(null);
  const landButtonRef = useRef<HTMLButtonElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  
  const [zoomedCard, setZoomedCard] = useState<Card | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhostState | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const touchStartPos = useRef<{x: number, y: number} | null>(null);
  const currentTouchPos = useRef<{x: number, y: number} | null>(null);
  const autoScrollInterval = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null); 
  const myPlayer = draftState.players.find(p => p.clientId === myClientId);
  const humanPlayersCount = draftState.players.filter(p => !p.isBot).length;

  // Initial Data Load
  useEffect(() => {
    const loadData = async () => {
      if (myPlayer && myPlayer.pool.length > 0) {
        setLoading(true);
        try {
            const enrichedPool = await enrichCardData(myPlayer.pool);
            // Default initial sort is CMC, but it's not a persistent state
            organizeCards(enrichedPool, 'cmc');
        } catch (e) {
            console.error("Failed to enrich card data", e);
            organizeCards(myPlayer.pool, 'cmc');
        } finally {
            setLoading(false);
        }
      } else setLoading(false);
    };
    loadData();
  }, [myPlayer?.pool.length]); 

  // Handle Click Outside for Dropdowns (Land Picker & Sort Menu)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close Land Picker
      if (showLandPicker && landPickerRef.current && !landPickerRef.current.contains(event.target as Node) && !landButtonRef.current?.contains(event.target as Node)) {
        setShowLandPicker(false);
      }
      // Close Sort Menu (only if it's in dropdown mode/desktop, checking if click is outside ref)
      if (isSortMenuOpen && sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
         // We only auto-close on desktop clicks outside. Mobile has an overlay.
         // However, the overlay div handles the mobile close, so this is fine.
         setIsSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showLandPicker, isSortMenuOpen]);

  const startResizingSideboard = useCallback((e: React.MouseEvent) => { setIsResizingSideboard(true); e.preventDefault(); }, []);

  useEffect(() => {
    const stopResizing = () => setIsResizingSideboard(false);
    const resize = (e: MouseEvent) => {
        if (isResizingSideboard) {
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight >= 140 && newHeight < window.innerHeight * 0.7) setSideboardHeight(newHeight);
        }
    };
    if (isResizingSideboard) { window.addEventListener('mousemove', resize); window.addEventListener('mouseup', stopResizing); }
    return () => { window.removeEventListener('mousemove', resize); window.removeEventListener('mouseup', stopResizing); }
  }, [isResizingSideboard]);

  useEffect(() => {
      if (dragGhost?.active) {
          autoScrollInterval.current = window.setInterval(() => {
              if (!currentTouchPos.current || !scrollContainerRef.current) return;
              const { x, y } = currentTouchPos.current;
              const container = scrollContainerRef.current;
              const { left, right, top, bottom } = container.getBoundingClientRect();
              
              const threshold = 80; 
              const speed = 20;

              if (x < left + threshold) {
                  container.scrollLeft -= speed;
              } else if (x > right - threshold) {
                  container.scrollLeft += speed;
              }

              if (y < top + threshold) {
                  container.scrollTop -= speed;
              } else if (y > bottom - threshold) {
                  container.scrollTop += speed;
              }
          }, 30); 
      } else if (autoScrollInterval.current) { 
          clearInterval(autoScrollInterval.current); 
          autoScrollInterval.current = null; 
      }
      return () => { if (autoScrollInterval.current) clearInterval(autoScrollInterval.current); };
  }, [dragGhost?.active]);

  const showToast = (msg: string) => { setToastMessage(msg); setTimeout(() => setToastMessage(null), 3000); };

  const organizeCards = (cards: Card[], mode: 'cmc' | 'color') => {
    let newColumns: ColumnData[] = [];
    if (mode === 'cmc') {
      const buckets: Record<string, Card[]> = { 'Land': [], '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '7+': [] };
      cards.forEach(card => {
        if (card.type_line?.toLowerCase().includes('land')) buckets['Land'].push(card);
        else { const cmc = card.cmc || 0; if (cmc >= 7) buckets['7+'].push(card); else buckets[cmc.toString()].push(card); }
      });
      const order = ['Land', '0', '1', '2', '3', '4', '5', '6', '7+'];
      newColumns = order.map(key => ({ id: key, title: '', cards: buckets[key].sort((a, b) => a.name.localeCompare(b.name)) }));
    } else {
      const buckets: Record<string, Card[]> = { 'Land': [], 'White': [], 'Blue': [], 'Black': [], 'Red': [], 'Green': [], 'Multicolor': [], 'Colorless': [] };
      cards.forEach(card => {
        if (card.type_line?.toLowerCase().includes('land')) buckets['Land'].push(card);
        else if (!card.colors || card.colors.length === 0) buckets['Colorless'].push(card);
        else if (card.colors.length > 1) buckets['Multicolor'].push(card);
        else { const colorMap: Record<string, string> = { 'W': 'White', 'U': 'Blue', 'B': 'Black', 'R': 'Red', 'G': 'Green' }; buckets[colorMap[card.colors[0]] || 'Colorless'].push(card); }
      });
      const order = ['Land', 'White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless'];
      newColumns = order.map(key => ({ id: key, title: '', cards: buckets[key].sort((a, b) => (a.cmc || 0) - (b.cmc || 0)) }));
    }
    setColumns(newColumns);
  };

  // One-shot sort action. Re-sorts whatever is currently in the main deck columns.
  const handleSortAction = (mode: 'cmc' | 'color') => { 
      const allMainCards = columns.flatMap(c => c.cards); 
      organizeCards(allMainCards, mode); 
      setIsSortMenuOpen(false);
  };

  const getLandCount = (type: string) => { let count = 0; columns.forEach(col => { col.cards.forEach(c => { if (c.name === type) count++; }); }); return count; };

  const updateLandCount = (type: string, delta: number) => {
      if (delta > 0) {
          const newCard: Card = { id: `basic-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, name: type, type_line: 'Basic Land', cmc: 0, mana_cost: '', colors: [] };
          if (type === 'Plains') newCard.colors = ['W']; if (type === 'Island') newCard.colors = ['U']; if (type === 'Swamp') newCard.colors = ['B']; if (type === 'Mountain') newCard.colors = ['R']; if (type === 'Forest') newCard.colors = ['G'];
          setColumns(prev => {
              const newCols = [...prev];
              const landColIdx = newCols.findIndex(c => c.id === 'Land');
              if (landColIdx !== -1) newCols[landColIdx].cards.push(newCard); else newCols[newCols.length - 1].cards.push(newCard);
              return newCols;
          });
      } else {
          setColumns(prev => {
              const newCols = prev.map(c => ({...c, cards: [...c.cards]}));
              const landColIdx = newCols.findIndex(c => c.id === 'Land');
              if (landColIdx !== -1) { const cardIdx = newCols[landColIdx].cards.findIndex(c => c.name === type); if (cardIdx !== -1) newCols[landColIdx].cards.splice(cardIdx, 1); }
              return newCols;
          });
      }
  };

  const handleExportText = () => {
      let content = "=== MAIN DECK ===\n";
      const allMain = columns.flatMap(c => c.cards).sort((a, b) => a.name.localeCompare(b.name));

      allMain.forEach(c => {
          const cost = c.mana_cost || "";
          const color = c.colors && c.colors.length > 0 ? c.colors.join("") : "C";
          content += `${c.name} \t ${color} \t ${c.type_line || "Unknown"} \t ${cost}\n`;
      });

      if (sideboard.length > 0) {
          content += "\n=== SIDEBOARD ===\n";
          const sortedSb = [...sideboard].sort((a, b) => a.name.localeCompare(b.name));
          sortedSb.forEach(c => {
            const cost = c.mana_cost || "";
            const color = c.colors && c.colors.length > 0 ? c.colors.join("") : "C";
            content += `${c.name} \t ${color} \t ${c.type_line || "Unknown"} \t ${cost}\n`;
          });
      }

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `decklist-${new Date().toISOString().slice(0,10)}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const executeCardMove = (cardId: string, sourceType: string, sourceContainerId: string, targetColId: string, targetCardId: string | null) => {
      let card: Card | undefined;
      if (sourceType === 'sb') { card = sideboard.find(c => c.id === cardId); if (!card) return; } 
      else { const sourceCol = columns.find(c => c.id === sourceContainerId); card = sourceCol?.cards.find(c => c.id === cardId); if (!card) return; }

      if (targetColId === 'SIDEBOARD') { if (card.type_line && card.type_line.includes('Basic Land')) { showToast("Cannot move Basic Lands to Sideboard!"); return; } }

      if (sourceType === 'sb') setSideboard(prev => prev.filter(c => c.id !== cardId));
      else {
          setColumns(prev => {
             const newCols = prev.map(c => ({...c, cards: [...c.cards]}));
             const srcColIdx = newCols.findIndex(c => c.id === sourceContainerId);
             if (srcColIdx !== -1) newCols[srcColIdx].cards = newCols[srcColIdx].cards.filter(c => c.id !== cardId);
             return newCols;
          });
      }

      if (targetColId === 'SIDEBOARD') setSideboard(prev => [...prev, card!]);
      else {
          setColumns(prev => {
              const newCols = prev.map(c => ({...c, cards: [...c.cards]}));
              const targetColIdx = newCols.findIndex(c => c.id === targetColId);
              if (targetColIdx !== -1) {
                  if (targetCardId) {
                      const insertIdx = newCols[targetColIdx].cards.findIndex(c => c.id === targetCardId);
                      if (insertIdx !== -1) newCols[targetColIdx].cards.splice(insertIdx, 0, card!); else newCols[targetColIdx].cards.push(card!);
                  } else newCols[targetColIdx].cards.push(card!);
              }
              return newCols;
          });
      }
  };

  const handleDragStart = (e: React.DragEvent, source: 'col' | 'sb', containerId: string, cardId: string) => {
    e.dataTransfer.setData("sourceType", source); e.dataTransfer.setData("containerId", containerId); e.dataTransfer.setData("cardId", cardId); e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const handleDropOnCard = (e: React.DragEvent, targetColId: string, targetCardId: string) => {
      e.stopPropagation(); e.preventDefault();
      const cardId = e.dataTransfer.getData("cardId"); const sourceType = e.dataTransfer.getData("sourceType"); const sourceContainerId = e.dataTransfer.getData("containerId");
      executeCardMove(cardId, sourceType, sourceContainerId, targetColId, targetCardId);
  };
  const handleDropOnColumn = (e: React.DragEvent, targetColId: string) => {
      e.preventDefault();
      const cardId = e.dataTransfer.getData("cardId"); const sourceType = e.dataTransfer.getData("sourceType"); const sourceContainerId = e.dataTransfer.getData("containerId");
      executeCardMove(cardId, sourceType, sourceContainerId, targetColId, null);
  };
  const handleDropOnSideboard = (e: React.DragEvent) => {
      e.preventDefault();
      const cardId = e.dataTransfer.getData("cardId"); const sourceType = e.dataTransfer.getData("sourceType"); const sourceContainerId = e.dataTransfer.getData("containerId");
      executeCardMove(cardId, sourceType, sourceContainerId, 'SIDEBOARD', null);
  };

  const handleTouchStart = (e: React.TouchEvent, source: 'col' | 'sb', containerId: string, card: Card) => {
      if (e.touches.length > 1) return; 
      const touch = e.touches[0]; touchStartPos.current = { x: touch.clientX, y: touch.clientY }; currentTouchPos.current = { x: touch.clientX, y: touch.clientY };
      longPressTimer.current = window.setTimeout(() => { if (navigator.vibrate) navigator.vibrate(50); setDragGhost({ active: true, x: touch.clientX, y: touch.clientY, card, sourceType: source, containerId }); }, 500);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (e.touches && e.touches.length > 0) currentTouchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      
      if (dragGhost?.active && e.touches && e.touches.length > 0) { 
        if (e.cancelable) e.preventDefault(); 
        setDragGhost(prev => prev ? { ...prev, x: e.touches[0].clientX, y: e.touches[0].clientY } : null); 
      } 
      else if (touchStartPos.current && e.touches && e.touches.length > 0) {
          const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x); const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
          if (dx > 10 || dy > 10) { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } }
      }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      touchStartPos.current = null; currentTouchPos.current = null;
      if (dragGhost?.active && e.changedTouches && e.changedTouches.length > 0) {
          const touch = e.changedTouches[0]; const target = document.elementFromPoint(touch.clientX, touch.clientY);
          if (target) {
              const sbContainer = target.closest('[data-drop-id="SIDEBOARD"]');
              if (sbContainer) executeCardMove(dragGhost.card.id, dragGhost.sourceType, dragGhost.containerId, 'SIDEBOARD', null);
              else {
                  const colContainer = target.closest('[data-drop-id]');
                  if (colContainer) {
                      const targetColId = colContainer.getAttribute('data-drop-id');
                      if (targetColId && targetColId !== 'SIDEBOARD') {
                          const cardTarget = target.closest('[data-card-id]'); const targetCardId = cardTarget ? cardTarget.getAttribute('data-card-id') : null;
                          executeCardMove(dragGhost.card.id, dragGhost.sourceType, dragGhost.containerId, targetColId, targetCardId);
                      }
                  }
              }
          }
          setDragGhost(null);
      }
  };

  const totalMainDeck = columns.reduce((a,c) => a + c.cards.length, 0);

  if (loading) { return <div className="flex flex-col items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div><p className="text-slate-400">Organizing your pool...</p></div>; }

  if (viewMode === 'OPPONENTS') {
     return (
        <div className="flex flex-col h-full bg-slate-900 p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Opponents Recap</h2>
                <button onClick={() => setViewMode('MY_POOL')} className="text-blue-400 hover:text-white underline"> &larr; Back to Deck Builder</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 overflow-y-auto">
                {draftState.players.filter(p => p.clientId !== myClientId).map(p => (
                    <div key={p.id} className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                        <h3 className="font-bold text-white mb-2">{p.name}</h3>
                        <p className="text-sm text-slate-400">{p.pool.length} cards drafted</p>
                        <div className="flex flex-wrap gap-1 mt-2">
                             {p.pool.slice(0, 15).map(c => (
                                 <div key={c.id} className="w-8 h-10 bg-slate-700 rounded overflow-hidden">
                                    <CardImage name={c.name} hoverEffect={false} />
                                 </div>
                             ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
     );
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 overflow-hidden relative">
      {toastMessage && <div className="absolute bottom-60 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-lg shadow-2xl z-[150] animate-bounce font-bold border border-red-400 w-max max-w-[90vw] text-center">{toastMessage}</div>}
      
      {dragGhost?.active && <div className="fixed z-[200] pointer-events-none opacity-80 shadow-2xl scale-110" style={{ left: dragGhost.x, top: dragGhost.y, width: '100px', marginTop: '-70px', marginLeft: '-50px' }}><CardImage name={dragGhost.card.name} hoverEffect={false} className="rounded-lg border-2 border-yellow-400" /></div>}

      <div className="flex items-center justify-between p-3 bg-slate-800 border-b border-slate-700 shrink-0 z-20 shadow-md">
         {/* Updated gap for mobile to be tighter */}
         <div className="flex items-center gap-2 md:gap-4">
             <h1 className="text-lg font-bold text-white hidden sm:block">Deck Builder</h1>
             
             {/* New Dropdown Sort Menu with Mobile Modal logic */}
             <div className="relative" ref={sortMenuRef}>
                 <button onClick={() => setIsSortMenuOpen(!isSortMenuOpen)} className="px-3 py-1 rounded text-xs font-bold border border-slate-600 text-slate-400 hover:text-white flex items-center gap-1 transition-colors min-h-[26px]">
                    <span className="md:hidden"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg></span>
                    <span className="hidden md:flex items-center gap-1">Sort Cards ▾</span>
                 </button>
                 {isSortMenuOpen && (
                    <>
                        {/* Mobile Overlay (Hidden on Desktop) */}
                        <div className="fixed inset-0 bg-black/80 z-[90] md:hidden" onClick={() => setIsSortMenuOpen(false)}></div>
                        
                        {/* Menu Container: Modal on Mobile, Dropdown on Desktop */}
                        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-64 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in md:absolute md:top-full md:left-0 md:translate-x-0 md:translate-y-0 md:w-40 md:mt-1 md:z-50 md:rounded-lg">
                            
                            {/* Mobile Header (Hidden on Desktop) */}
                            <div className="flex justify-between items-center p-3 border-b border-slate-700 bg-slate-900/50 md:hidden">
                                <span className="text-xs font-bold text-slate-400 uppercase">Sort Deck By</span>
                                <button onClick={() => setIsSortMenuOpen(false)} className="text-slate-400 hover:text-white">✕</button>
                            </div>

                            <button onClick={() => handleSortAction('cmc')} className="text-left px-4 py-3 md:py-2 text-sm md:text-xs hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border-b border-slate-700/50">
                                By CMC
                            </button>
                            <button onClick={() => handleSortAction('color')} className="text-left px-4 py-3 md:py-2 text-sm md:text-xs hover:bg-slate-700 text-slate-300 hover:text-white transition-colors">
                                By Color
                            </button>
                        </div>
                    </>
                 )}
             </div>

             <div className="relative">
                 <button ref={landButtonRef} onClick={() => setShowLandPicker(!showLandPicker)} className={`px-3 py-1 rounded text-xs font-bold border transition-colors min-h-[26px] ${showLandPicker ? 'bg-slate-700 border-slate-500 text-white' : 'border-slate-600 text-slate-400 hover:text-white'}`}>
                    <span className="md:hidden">
                        {/* Mountain / Landscape Icon */}
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
             
             <div className="text-xs text-slate-400 font-mono border-l border-slate-700 pl-4 flex items-center gap-2">
                <span className="whitespace-nowrap">
                    <span className="hidden md:inline">Mainboard</span>
                    <span className="md:hidden">M</span>: <span className="text-white font-bold">{totalMainDeck}</span>
                </span>
                <span className="whitespace-nowrap">
                    <span className="hidden md:inline">Sideboard</span>
                    <span className="md:hidden">S</span>: {sideboard.length}
                </span>
             </div>

         </div>
         <div className="flex items-center gap-2 md:gap-4">
             {humanPlayersCount <= 1 && <button onClick={() => setViewMode('OPPONENTS')} className="text-slate-400 hover:text-white text-xs hidden sm:block">View Opps</button>}
             <button onClick={handleExportText} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 min-h-[26px]">
                <span className="md:hidden"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></span>
                <span className="hidden md:inline">Export .txt</span>
             </button>
         </div>
      </div>

      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-4 bg-slate-900/50 relative">
         <div className="flex min-h-full gap-4 min-w-max items-start">
             {columns.map((col) => (
                 <div key={col.id} data-drop-id={col.id} className="w-[170px] flex flex-col shrink-0" onDragOver={handleDragOver} onDrop={(e) => handleDropOnColumn(e, col.id)}>
                     <div className="h-6 mb-2 flex items-center justify-center bg-slate-800/80 rounded border border-slate-700 text-[10px] font-bold text-slate-300 uppercase tracking-wider sticky top-0 z-10 backdrop-blur-sm">{col.title} <span className="ml-1 text-slate-500">({col.cards.length})</span></div>
                     <div className="relative rounded-lg transition-colors pb-10">
                        <div className="absolute inset-0 z-0 h-full min-h-[200px]" />
                        <div className="w-full relative" style={{ height: `${Math.max(200, (col.cards.length * STACK_OFFSET) + CARD_HEIGHT)}px` }}>
                            {col.cards.map((card, index) => (
                                <div key={card.id} data-card-id={card.id} draggable onDragStart={(e) => handleDragStart(e, 'col', col.id, card.id)} onDrop={(e) => handleDropOnCard(e, col.id, card.id)} onDragOver={handleDragOver} onTouchStart={(e) => handleTouchStart(e, 'col', col.id, card)} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onClick={() => !dragGhost && setZoomedCard(card)} className="absolute left-1 right-1 cursor-grab active:cursor-grabbing hover:z-[50] transition-transform hover:-translate-y-1 shadow-md rounded-lg overflow-hidden" style={{ top: `${index * STACK_OFFSET}px`, height: `${CARD_HEIGHT}px`, zIndex: index }}>
                                    <div className="w-full h-full relative group">
                                        <CardImage name={card.name} hoverEffect={false} className="w-full h-full object-cover rounded-lg pointer-events-none" />
                                        <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/90 via-black/50 to-transparent p-1 px-2 pointer-events-none"><p className="text-[10px] font-bold text-white truncate shadow-black drop-shadow-md">{card.name}</p></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                     </div>
                 </div>
             ))}
         </div>
      </div>

      <div data-drop-id="SIDEBOARD" className="bg-slate-950 border-t border-slate-700 flex flex-col shrink-0 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.3)] relative" onDragOver={handleDragOver} onDrop={handleDropOnSideboard} style={{ height: sideboardHeight }}>
          <div className="absolute -top-1 left-0 right-0 h-3 cursor-ns-resize z-30 flex items-center justify-center group" onMouseDown={startResizingSideboard}><div className="w-16 h-1 bg-slate-600 rounded-full group-hover:bg-blue-500 transition-colors"></div></div>
          <div className="px-4 py-1 bg-slate-900 border-b border-slate-800 text-xs font-bold text-slate-400 flex justify-between shrink-0"><span>SIDEBOARD ({sideboard.length}) - Drag cards here to remove from deck</span></div>
          <div className="flex-1 overflow-x-auto p-2 flex gap-2 items-center">
             {sideboard.length === 0 && <div className="w-full text-center text-slate-700 text-sm italic">Drag cards here to exclude them from your deck</div>}
             {sideboard.map(card => (
                 <div key={card.id} draggable onDragStart={(e) => handleDragStart(e, 'sb', 'SIDEBOARD', card.id)} onTouchStart={(e) => handleTouchStart(e, 'sb', 'SIDEBOARD', card)} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onClick={() => !dragGhost && setZoomedCard(card)} className="h-full aspect-[2.5/3.5] shrink-0 cursor-grab active:cursor-grabbing relative group">
                     <CardImage name={card.name} hoverEffect={true} className="h-full rounded-md shadow-lg pointer-events-none" />
                     <div className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] truncate px-1 text-center pointer-events-none">{card.name}</div>
                 </div>
             ))}
          </div>
      </div>

      {zoomedCard && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 animate-fade-in" onClick={() => setZoomedCard(null)}>
           <div className="max-w-md w-full relative">
             <button className="absolute -top-10 right-0 text-white text-3xl hover:text-slate-300" onClick={() => setZoomedCard(null)}>&times;</button>
             <CardImage name={zoomedCard.name} hoverEffect={false} className="rounded-xl shadow-2xl" />
             <div className="text-center mt-4"><span className="text-white font-bold text-xl">{zoomedCard.name}</span>{zoomedCard.cmc !== undefined && <span className="text-slate-400 ml-2">CMC: {zoomedCard.cmc}</span>}</div>
           </div>
        </div>
      )}
    </div>
  );
};

export default RecapView;