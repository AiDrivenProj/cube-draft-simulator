
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  
  const player = draftState.players[userSeatIndex];
  const hasPicked = player.hasPicked;
  const { showConfirm } = useModal();
  
  const currentPackIndex = draftState.currentPackIndex[userSeatIndex];
  const currentPack = draftState.packs[userSeatIndex][currentPackIndex] || [];

  const startingTimeForThisPick = useMemo(() => {
    const cardsPickedInThisPack = 15 - currentPack.length;
    const decreasePerPick = BASE_TIMER_LIMIT * TIMER_DECAY_RATIO;
    return Math.floor(Math.max(10, BASE_TIMER_LIMIT - (cardsPickedInThisPack * decreasePerPick)));
  }, [currentPack.length, BASE_TIMER_LIMIT]);

  // Handle Autopick Logic
  useEffect(() => {
    if (isAutopickEnabled && !hasPicked && currentPack.length > 0) {
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
    // CRITICAL: Stop browser scrolling/handling if dragging
    if (draggingCard) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
    }

    const x = e.clientX;
    const y = e.clientY;

    if (!draggingCard) {
      if (potentialCardId) {
        const dx = Math.abs(x - startPos.current.x);
        const dy = Math.abs(y - startPos.current.y);
        
        // If user moves finger > 10px before timer fires, cancel the press
        if (dx > 10 || dy > 10) {
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

    if (draggingCard) {
      if (isInsideDropZone) {
        onPick(draggingCard);
      }
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
            pool={player.pool}
            isPoolViewOpen={isPoolViewOpen}
            setIsPoolViewOpen={setIsPoolViewOpen}
        />
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
        pickNumber={16 - currentPack.length}
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
        poolCount={player.pool.length}
        isInsideDropZone={isInsideDropZone}
        onClick={() => setIsPoolViewOpen(true)}
      />

      {isPoolViewOpen && <PoolOverlay pool={player.pool} onClose={() => setIsPoolViewOpen(false)} />}
    </div>
  );
};

export default DraftView;
