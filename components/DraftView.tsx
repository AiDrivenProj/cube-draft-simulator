
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { DraftState, Card } from '../types';
import { useModal } from './ModalSystem';

// Imported modular components
import WaitingScreen from './draft/WaitingScreen';
import DraftTimerBar from './draft/DraftTimerBar';
import DraftHeader from './draft/DraftHeader';
import CardPackGrid from './draft/CardPackGrid';
import DropZone from './draft/DropZone';
import GhostCard from './draft/GhostCard';
import PoolOverlay from './draft/PoolOverlay';

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
  const BASE_TIMER_LIMIT = draftState.baseTimer || 120;
  const TIMER_DECAY_RATIO = 7.5 / 120; 
  const RED_ALERT_THRESHOLD = 20;

  // Timer State
  const [timeLeft, setTimeLeft] = useState<number>(BASE_TIMER_LIMIT);
  const timerIntervalRef = useRef<number | null>(null);

  const dropZoneRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  
  // Reference to hold the card object being interacted with to allow immediate drag start
  const potentialCardObjRef = useRef<Card | null>(null);
  // Sync ref for dragging state to handle event loop race conditions
  const draggingCardRef = useRef<Card | null>(null);
  
  const { showConfirm } = useModal();

  // --- DATA EXTRACTION & SAFETY ---
  const player = draftState.players[userSeatIndex];
  // Safety check: Ensure player exists
  if (!player) {
      return <div className="flex h-full items-center justify-center text-red-400">Error: Invalid Seat Index</div>;
  }

  const hasPicked = player.hasPicked;
  const currentPackIndex = draftState.currentPackIndex[userSeatIndex];
  
  // Safety check: Ensure packs exist for this seat
  const playerPacks = draftState.packs[userSeatIndex];
  const currentPack = playerPacks ? playerPacks[currentPackIndex] : null;

  // Logic for Pick Number: (Total Pack Size - Cards Remaining) + 1
  const packSize = draftState.packSize || 15;
  const pickNumber = currentPack ? (packSize - currentPack.length + 1) : 0;

  const startingTimeForThisPick = useMemo(() => {
    if (!currentPack) return BASE_TIMER_LIMIT;
    const cardsPickedInThisPack = packSize - currentPack.length;
    const decreasePerPick = BASE_TIMER_LIMIT * TIMER_DECAY_RATIO;
    return Math.floor(Math.max(10, BASE_TIMER_LIMIT - (cardsPickedInThisPack * decreasePerPick)));
  }, [currentPack?.length, BASE_TIMER_LIMIT, packSize]);

  // --- HISTORY MANAGEMENT FOR POOL VIEW ---
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
        const state = event.state || {};
        setIsPoolViewOpen(!!state.poolViewOpen);
    };

    window.addEventListener('popstate', handlePopState);
    
    // Check initial state (e.g. reload)
    if (window.history.state?.poolViewOpen) {
        setIsPoolViewOpen(true);
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleOpenPool = useCallback(() => {
      window.history.pushState({ ...window.history.state, poolViewOpen: true }, '');
      setIsPoolViewOpen(true);
  }, []);

  const handleClosePool = useCallback(() => {
      // Go back to remove the poolViewOpen state
      // The popstate listener will update local state to false
      window.history.back();
  }, []);

  // Wrapper for WaitingScreen which expects a setter
  const setPoolViewOpenWrapper = useCallback((isOpen: boolean) => {
      if (isOpen) handleOpenPool();
      else handleClosePool();
  }, [handleOpenPool, handleClosePool]);

  // Handle Autopick Logic
  useEffect(() => {
    if (isAutopickEnabled && !hasPicked && currentPack && currentPack.length > 0) {
      const autopickTimer = setTimeout(() => {
        handleRandomPick();
      }, 800);
      return () => clearTimeout(autopickTimer);
    }
  }, [isAutopickEnabled, hasPicked, currentPack?.length]);

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
  }, [currentPack?.length, hasPicked, startingTimeForThisPick]);

  /**
   * GLOBAL EVENT LOCKING
   * Forcefully prevents default browser behavior when dragging is active.
   */
  useEffect(() => {
    if (draggingCard) {
      const preventAll = (e: Event) => {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      };

      // Add aggressive listeners to the window
      window.addEventListener('touchmove', preventAll, { passive: false, capture: true });
      window.addEventListener('wheel', preventAll, { passive: false, capture: true });
      document.body.style.overflow = 'hidden';

      return () => {
        window.removeEventListener('touchmove', preventAll, { capture: true });
        window.removeEventListener('wheel', preventAll, { capture: true });
        document.body.style.overflow = '';
      };
    }
  }, [draggingCard]);

  const handleAutopickToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.checked;
    if (newVal) {
      if (autopickAcknowledged.current) {
        setIsAutopickEnabled(true);
      } else {
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
      "Exit Session?",
      <div className="space-y-2">
          <p>You are about to leave the active session.</p>
          <p className="text-sm text-slate-400">This will disconnect you from the room and your draft progress may be lost.</p>
      </div>,
      onExit
    );
  };

  const handleRandomPick = () => {
    if (currentPack && currentPack.length > 0) {
      const randomIndex = Math.floor(Math.random() * currentPack.length);
      onPick(currentPack[randomIndex]);
    }
  };

  const handlePointerDown = (e: React.PointerEvent, card: Card) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    
    // Store reference to card object for immediate drag in move handler
    potentialCardObjRef.current = card;

    startPos.current = { x: e.clientX, y: e.clientY };
    setPointerPos({ x: e.clientX, y: e.clientY });
    
    const target = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;

    // IMMEDIATE DRAG FOR MOUSE:
    if (e.pointerType === 'mouse') {
        setDraggingCard(card);
        draggingCardRef.current = card;
        setIsPressing(true);
        try {
            target.setPointerCapture(pointerId);
        } catch (err) {
            console.debug("Pointer capture failed", err);
        }
        return;
    }

    // DELAYED DRAG FOR TOUCH:
    setPotentialCardId(card.id);
    setIsPressing(true);

    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    
    longPressTimer.current = window.setTimeout(() => {
      setDraggingCard(card);
      draggingCardRef.current = card;
      setPotentialCardId(null);
      setIsPressing(false);
      
      if (navigator.vibrate) navigator.vibrate(40);
      
      try {
        target.setPointerCapture(pointerId);
      } catch (err) {
        console.debug("Pointer capture failed", err);
      }
      
      longPressTimer.current = null;
    }, 200);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const x = e.clientX;
    const y = e.clientY;

    // Determine effective drag state (using Ref for immediate updates during event loop)
    let isEffectiveDragging = !!draggingCardRef.current;

    if (!isEffectiveDragging) {
      if (potentialCardId) {
        const dx = Math.abs(x - startPos.current.x);
        const dy = Math.abs(y - startPos.current.y);
        
        // IMMEDIATE DRAG TRIGGER FOR TOUCH SLIDE
        // If moved > 8px while holding, start drag immediately (don't wait for timer)
        if (dx > 8 || dy > 8) {
          if (longPressTimer.current) {
            window.clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
          }
          
          if (potentialCardObjRef.current) {
              setDraggingCard(potentialCardObjRef.current);
              draggingCardRef.current = potentialCardObjRef.current;
              isEffectiveDragging = true;
              if (navigator.vibrate) navigator.vibrate(20);
          }
          
          setPotentialCardId(null);
          setIsPressing(false);
        }
      }
    }
    
    if (isEffectiveDragging) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
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

    const currentDraggingCard = draggingCardRef.current;

    if (currentDraggingCard) {
      // Manual hit testing to ensure robust drop detection even if state update is pending
      let droppedInside = false;
      if (dropZoneRef.current) {
         const rect = dropZoneRef.current.getBoundingClientRect();
         const x = e.clientX;
         const y = e.clientY;
         droppedInside = x >= rect.left - 70 && x <= rect.right + 70 &&
                         y >= rect.top - 70 && y <= rect.bottom + 70;
      }

      if (droppedInside) {
        onPick(currentDraggingCard);
      }
    }

    setDraggingCard(null);
    draggingCardRef.current = null;
    setPotentialCardId(null);
    setIsPressing(false);
    setIsInsideDropZone(false);
    potentialCardObjRef.current = null;
  };

  const handlePointerCancel = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    setDraggingCard(null);
    draggingCardRef.current = null;
    setPotentialCardId(null);
    setIsPressing(false);
    setIsInsideDropZone(false);
    potentialCardObjRef.current = null;
  };

  const getGhostCardStyles = () => {
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

  if (hasPicked) {
      return (
        <WaitingScreen 
            draftState={draftState}
            myClientId={myClientId}
            onExitClick={handleExitClick}
            pool={player.pool || []} // SAFETY: Fallback to empty array
            isPoolViewOpen={isPoolViewOpen}
            setIsPoolViewOpen={setPoolViewOpenWrapper}
        />
      );
  }

  // --- LOADING / ERROR STATE FOR GUESTS ---
  // If the packs haven't arrived yet (but the player exists), show a sync state
  if (!playerPacks || !currentPack) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center animate-pulse">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <h3 className="text-xl font-bold text-white mb-2">Syncing Draft...</h3>
            <p className="text-sm">Receiving pack data from Host.</p>
        </div>
      );
  }

  return (
    <div className={`flex flex-col h-full relative select-none ${draggingCard ? 'dragging-active' : ''}`}>
      <DraftTimerBar 
        timeLeft={timeLeft} 
        baseTimerLimit={BASE_TIMER_LIMIT} 
        redAlertThreshold={RED_ALERT_THRESHOLD} 
      />

      {draggingCard && (
        <GhostCard card={draggingCard} style={getGhostCardStyles()} />
      )}

      <DraftHeader 
        round={draftState.round}
        pickNumber={pickNumber} 
        isAutopickEnabled={isAutopickEnabled}
        onAutopickToggle={handleAutopickToggle}
        onRandomPick={handleRandomPick}
        onExitClick={handleExitClick}
      />

      <CardPackGrid 
        cards={currentPack}
        draggingCard={draggingCard}
        potentialCardId={potentialCardId}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        scrollRef={scrollContainerRef}
      />

      <DropZone 
        ref={dropZoneRef}
        poolCount={(player.pool || []).length} // SAFETY: Fallback
        isInsideDropZone={isInsideDropZone}
        onClick={handleOpenPool}
      />

      {isPoolViewOpen && <PoolOverlay pool={player.pool || []} onClose={handleClosePool} />}
    </div>
  );
};

export default DraftView;
