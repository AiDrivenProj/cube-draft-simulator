import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DraftState, Card } from '../types';
import CardImage from './CardImage';
import { useModal } from './ModalSystem';

interface DraftViewProps {
  draftState: DraftState;
  onPick: (card: Card) => void;
  userSeatIndex: number;
  onExit: () => void;
  myClientId: string;
}

const DraftView: React.FC<DraftViewProps> = ({ draftState, onPick, userSeatIndex, onExit, myClientId }) => {
  const [isPoolViewOpen, setIsPoolViewOpen] = useState(false);
  const [draggingCard, setDraggingCard] = useState<Card | null>(null);
  const [potentialCardId, setPotentialCardId] = useState<string | null>(null);
  const [isPressing, setIsPressing] = useState(false);
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [isInsideDropZone, setIsInsideDropZone] = useState(false);
  const [isAutopickEnabled, setIsAutopickEnabled] = useState(false);
  
  // Track if the warning has already been acknowledged during this draft session
  const autopickAcknowledged = useRef(false);
  
  // Timer Constants
  // Use config from state, fallback to 120 if missing
  const BASE_TIMER_LIMIT = draftState.baseTimer || 120;
  
  // Calculate the ratio: 7.5 seconds drop per pick for a 120s timer = 0.0625 ratio (1/16)
  const TIMER_DECAY_RATIO = 7.5 / 120; 

  const RED_ALERT_THRESHOLD = 20;

  // Timer State
  const [timeLeft, setTimeLeft] = useState<number>(BASE_TIMER_LIMIT);
  const timerIntervalRef = useRef<number | null>(null);

  const dropZoneRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  
  const player = draftState.players[userSeatIndex];
  const hasPicked = player.hasPicked;
  const { showConfirm } = useModal();
  
  const currentPackIndex = draftState.currentPackIndex[userSeatIndex];
  const currentPack = draftState.packs[userSeatIndex][currentPackIndex] || [];

  // Calculate dynamic starting time for this specific pick
  const startingTimeForThisPick = useMemo(() => {
    const cardsPickedInThisPack = 15 - currentPack.length;
    // Calculate decrease based on the ratio so it scales with custom times (45s to 300s)
    const decreasePerPick = BASE_TIMER_LIMIT * TIMER_DECAY_RATIO;
    return Math.floor(Math.max(10, BASE_TIMER_LIMIT - (cardsPickedInThisPack * decreasePerPick)));
  }, [currentPack.length, BASE_TIMER_LIMIT]);

  // Handle Autopick Logic
  useEffect(() => {
    if (isAutopickEnabled && !hasPicked && currentPack.length > 0) {
      // Short delay for better UX so user can see the cards briefly
      const autopickTimer = setTimeout(() => {
        handleRandomPick();
      }, 800);
      return () => clearTimeout(autopickTimer);
    }
  }, [isAutopickEnabled, hasPicked, currentPack.length]);

  // Handle Timer Logic
  useEffect(() => {
    if (hasPicked) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      return;
    }

    setTimeLeft(startingTimeForThisPick);

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    
    timerIntervalRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          handleRandomPick();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [currentPack.length, hasPicked, startingTimeForThisPick]);

  /**
   * CORE SCROLL-LOCK LOGIC
   */
  useEffect(() => {
    if (draggingCard || isPressing) {
      const handleTouchMove = (e: TouchEvent) => {
        if (draggingCard) {
          if (e.cancelable) e.preventDefault();
          return;
        }

        if (isPressing) {
          const touch = e.touches[0];
          const dx = Math.abs(touch.clientX - startPos.current.x);
          const dy = Math.abs(touch.clientY - startPos.current.y);

          if (dx < 20 && dy < 20) {
            if (e.cancelable) e.preventDefault();
          } else {
            setIsPressing(false);
            setPotentialCardId(null);
            if (longPressTimer.current) {
              window.clearTimeout(longPressTimer.current);
              longPressTimer.current = null;
            }
          }
        }
      };

      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      
      const originalOverflow = document.body.style.overflow;
      if (draggingCard) {
        document.body.style.overflow = 'hidden';
      }

      return () => {
        window.removeEventListener('touchmove', handleTouchMove);
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [draggingCard, isPressing]);

  const handleAutopickToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.checked;
    
    if (newVal) {
      if (autopickAcknowledged.current) {
        // If already acknowledged once, just enable it
        setIsAutopickEnabled(true);
      } else {
        // First time in this draft, show the modal
        showConfirm(
          "Enable Autopick?",
          "If enabled, the computer will automatically pick the first available card for you as soon as a new pack arrives. This is useful for fast drafts or if you need to step away briefly.",
          () => {
            autopickAcknowledged.current = true;
            setIsAutopickEnabled(true);
          }
        );
      }
    } else {
      setIsAutopickEnabled(false);
    }
  };

  const handleExitClick = () => {
    showConfirm(
      "Exit Game?",
      "Are you sure you want to leave? A bot will take over your spot for the rest of the draft.",
      () => onExit()
    );
  };

  const handleRandomPick = () => {
    if (currentPack.length > 0) {
      const randomIndex = Math.floor(Math.random() * currentPack.length);
      onPick(currentPack[randomIndex]);
    }
  };

  const handlePointerDown = (e: React.PointerEvent, card: Card) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    
    startPos.current = { x: e.clientX, y: e.clientY };
    setPointerPos({ x: e.clientX, y: e.clientY });
    
    setPotentialCardId(card.id);
    setIsPressing(true);

    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    
    const target = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;

    longPressTimer.current = window.setTimeout(() => {
      setDraggingCard(card);
      setPotentialCardId(null);
      setIsPressing(false);
      
      if (navigator.vibrate) navigator.vibrate(40);
      
      try {
        target.setPointerCapture(pointerId);
      } catch (err) {
        console.debug("Pointer capture failed", err);
      }
      
      longPressTimer.current = null;
    }, 250);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const x = e.clientX;
    const y = e.clientY;

    if (!draggingCard) {
      if (potentialCardId) {
        const dx = Math.abs(x - startPos.current.x);
        const dy = Math.abs(y - startPos.current.y);
        
        if (dx > 25 || dy > 25) {
          if (longPressTimer.current) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          setPotentialCardId(null);
          setIsPressing(false);
        }
      }
      return;
    }
    
    setPointerPos({ x, y });

    if (dropZoneRef.current) {
      const rect = dropZoneRef.current.getBoundingClientRect();
      const inside = x >= rect.left - 70 && x <= rect.right + 70 &&
                     y >= rect.top - 70 && y <= rect.bottom + 70;
      
      if (inside !== isInsideDropZone) {
        setIsInsideDropZone(inside);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (draggingCard && isInsideDropZone) {
      onPick(draggingCard);
    }

    setDraggingCard(null);
    setPotentialCardId(null);
    setIsPressing(false);
    setIsInsideDropZone(false);
  };

  const handlePointerCancel = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setDraggingCard(null);
    setPotentialCardId(null);
    setIsPressing(false);
    setIsInsideDropZone(false);
  };

  const getProximityStyles = () => {
    if (!draggingCard || !dropZoneRef.current) return {};
    
    const rect = dropZoneRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const dist = Math.sqrt(Math.pow(pointerPos.x - centerX, 2) + Math.pow(pointerPos.y - centerY, 2));
    const maxDist = 300;
    const proximity = Math.max(0, Math.min(1, (maxDist - dist) / maxDist));
    
    const scale = 1 - (proximity * 0.4);
    const opacity = 1 - (proximity * 0.5);
    
    return {
      left: pointerPos.x,
      top: pointerPos.y,
      transform: `translate(-50%, -50%) scale(${scale})`,
      opacity: opacity,
    };
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getTimerColorClass = () => {
    if (timeLeft <= RED_ALERT_THRESHOLD) return 'bg-red-500 animate-pulse';
    if (timeLeft <= 45) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  if (hasPicked) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-white animate-fade-in relative p-6">
            <div className="absolute top-4 right-4 z-50">
              <button 
                type="button" 
                onClick={handleExitClick} 
                className="bg-slate-700 hover:bg-red-900/50 text-slate-300 hover:text-red-200 px-3 py-1 rounded text-xs font-bold border border-slate-600 hover:border-red-800 transition-all flex items-center gap-1 min-h-[26px]"
              >
                <span className="md:hidden">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                </span>
                <span className="hidden md:inline">Exit Game</span>
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
            <button onClick={() => setIsPoolViewOpen(true)} className="mt-8 text-blue-400 hover:text-white text-sm font-medium underline underline-offset-4">Review your pool ({player.pool.length} cards)</button>
            {isPoolViewOpen && <PoolOverlay pool={player.pool} onClose={() => setIsPoolViewOpen(false)} />}
        </div>
      );
  }

  return (
    <div className={`flex flex-col h-full relative select-none ${draggingCard ? 'dragging-active' : ''}`}>
      {/* Immersive Timer Bar */}
      <div className={`absolute top-0 left-0 w-full h-8 bg-slate-950/80 backdrop-blur-sm border-b z-50 flex items-center px-4 transition-colors duration-300 ${timeLeft <= RED_ALERT_THRESHOLD ? 'border-red-500/50' : 'border-slate-800'}`}>
          <div className="relative z-10 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 ${timeLeft <= RED_ALERT_THRESHOLD ? 'text-red-500 animate-pulse' : 'text-slate-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className={`text-[12px] font-mono font-black transition-colors duration-300 ml-1 mr-4 ${timeLeft <= RED_ALERT_THRESHOLD ? 'text-red-500' : 'text-slate-300'}`}>
                {formatTime(timeLeft)}
            </span>
          </div>
          <div className="absolute bottom-0 left-0 w-full h-[3px] bg-slate-900/50">
              <div 
                className={`h-full transition-all duration-1000 ease-linear ${getTimerColorClass()}`}
                style={{ width: `${(timeLeft / BASE_TIMER_LIMIT) * 100}%` }}
              ></div>
          </div>
      </div>

      {/* Ghost Card Overlay */}
      {draggingCard && (
        <div 
          className="fixed pointer-events-none z-[100] w-36 shadow-2xl"
          style={getProximityStyles()}
        >
          <CardImage name={draggingCard.name} hoverEffect={false} className="rounded-lg border-2 border-blue-500/50" />
        </div>
      )}

      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/40 backdrop-blur-sm border-b border-slate-700/50 z-10 shrink-0 mt-8">
        <div className="flex items-center gap-4">
            <div className="bg-blue-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-white flex items-center h-6">
                <span className="hidden sm:inline">Pack </span>{draftState.round}
            </div>
            <div className="flex items-center h-6">
               <span className="text-[10px] sm:text-xs text-slate-400 font-bold uppercase tracking-tight whitespace-nowrap">
                  Pick {16 - currentPack.length} of 15
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
                 onChange={handleAutopickToggle} 
                 className="sr-only peer" 
               />
               <div className="w-8 h-4 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-blue-600"></div>
             </div>
          </label>

          <button 
            onClick={handleRandomPick}
            className="flex items-center justify-center bg-slate-700 hover:bg-slate-600 text-slate-200 w-8 h-8 sm:w-auto sm:px-3 sm:py-1 rounded border border-slate-600 transition-colors"
            title="Pick a random card"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="hidden sm:inline ml-1.5 text-[10px] font-bold uppercase tracking-tight">Random</span>
          </button>
          
          <button 
            onClick={handleExitClick} 
            className="bg-slate-700 hover:bg-red-900/50 text-slate-300 hover:text-red-200 w-8 h-8 sm:w-auto sm:px-3 sm:py-1 rounded border border-slate-600 hover:border-red-800 transition-all flex items-center justify-center"
            title="Exit Draft"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="hidden sm:inline ml-1.5 text-[10px] font-bold uppercase tracking-tight">Exit</span>
          </button>
        </div>
      </div>

      <div 
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto p-4 transition-all ${draggingCard ? 'overflow-hidden touch-none pointer-events-none' : 'touch-pan-y'} overscroll-y-none relative`}
      >
        {/* Anti-Pull-To-Refresh Spacer: invisible, non-touchable element that ensures vertical scrollability */}
        <div className="absolute inset-0 h-[101%] pointer-events-none z-[-1]" aria-hidden="true"></div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 max-w-6xl mx-auto pb-48">
          {currentPack.map((card) => (
            <div 
              key={card.id} 
              onPointerDown={(e) => handlePointerDown(e, card)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              className={`
                relative group cursor-grab active:cursor-grabbing transform transition-all 
                ${draggingCard?.id === card.id ? 'opacity-0 scale-90' : 'hover:scale-[1.02]'} 
                ${potentialCardId === card.id ? 'scale-[0.97]' : ''}
              `}
              style={{ touchAction: 'auto' }}
            >
              <CardImage 
                name={card.name} 
                className="rounded-lg shadow-xl pointer-events-none"
                hoverEffect={false}
              />
              <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white opacity-0 group-hover:opacity-100 transition-opacity font-mono">+</div>
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm h-48 z-40 flex items-end justify-center pointer-events-none">
        <div className="flex flex-col items-center mb-8 pointer-events-auto">
          <div 
            ref={dropZoneRef}
            onClick={() => setIsPoolViewOpen(true)}
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
              {player.pool.length}
            </div>
          </div>
          <span className={`mt-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 ${isInsideDropZone ? 'text-blue-400 translate-y-1' : 'text-slate-500'}`}>
            {isInsideDropZone ? 'Release to Pick' : 'Your Pool'}
          </span>
        </div>
      </div>

      {isPoolViewOpen && <PoolOverlay pool={player.pool} onClose={() => setIsPoolViewOpen(false)} />}
    </div>
  );
};

const PoolOverlay: React.FC<{ pool: Card[], onClose: () => void }> = ({ pool, onClose }) => {
    const [activeType, setActiveType] = useState<string | null>(null);
    const [activeColor, setActiveColor] = useState<string | null>(null);

    const stats = useMemo(() => {
        const counts = {
            creatures: 0,
            lands: 0,
            instants: 0,
            sorceries: 0,
            artifacts: 0,
            enchantments: 0,
            planeswalkers: 0,
            others: 0
        };
        pool.forEach(c => {
            const t = (c.type_line || '').toLowerCase();
            if (t.includes('creature')) counts.creatures++;
            else if (t.includes('land')) counts.lands++;
            else if (t.includes('planeswalker')) counts.planeswalkers++;
            else if (t.includes('instant')) counts.instants++;
            else if (t.includes('sorcery')) counts.sorceries++;
            else if (t.includes('artifact')) counts.artifacts++;
            else if (t.includes('enchantment')) counts.enchantments++;
            else counts.others++;
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

            // Filter by Type
            if (activeType) {
                const t = (c.type_line || '').toLowerCase();
                const typeMap: Record<string, boolean> = {
                    'Creatures': t.includes('creature'),
                    'Lands': t.includes('land'),
                    'Planeswalkers': t.includes('planeswalker'),
                    'Instants': t.includes('instant'),
                    'Sorceries': t.includes('sorcery'),
                    'Artifacts': t.includes('artifact'),
                    'Enchantments': t.includes('enchantment'),
                    'Others': !t.includes('creature') && !t.includes('land') && !t.includes('planeswalker') && !t.includes('instant') && !t.includes('sorcery') && !t.includes('artifact') && !t.includes('enchantment')
                };
                if (!typeMap[activeType]) return false;
            }
            return true;
        });
    }, [pool, activeType, activeColor]);

    const renderStatBadge = (count: number, label: string, colorClass: string) => {
        if (count === 0) return null;
        const isActive = activeType === label;
        return (
            <button 
                onClick={() => setActiveType(isActive ? null : label)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide text-white transition-all shadow-sm border ${colorClass} ${isActive ? 'ring-2 ring-white scale-105 shadow-md border-transparent' : 'border-white/10 opacity-80 hover:opacity-100'}`}
            >
                <span>{label}</span>
                <span className="bg-black/30 px-1.5 rounded text-[9px] min-w-[16px] text-center">{count}</span>
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
                    {renderStatBadge(stats.creatures, "Creatures", "bg-orange-700")}
                    {renderStatBadge(stats.instants, "Instants", "bg-sky-600")}
                    {renderStatBadge(stats.sorceries, "Sorceries", "bg-rose-600")}
                    {renderStatBadge(stats.artifacts, "Artifacts", "bg-slate-600")}
                    {renderStatBadge(stats.enchantments, "Enchantments", "bg-teal-600")}
                    {renderStatBadge(stats.planeswalkers, "Planeswalkers", "bg-fuchsia-700")}
                    {renderStatBadge(stats.lands, "Lands", "bg-amber-800")}
                    {renderStatBadge(stats.others, "Others", "bg-slate-700")}
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

export default DraftView;