
import React from 'react';
import { Card } from '../../types';
import CardImage from '../CardImage';

interface CardPackGridProps {
  cards: Card[];
  draggingCard: Card | null;
  potentialCardId: string | null;
  onPointerDown: (e: React.PointerEvent, card: Card) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

const CardPackGrid: React.FC<CardPackGridProps> = ({ 
  cards, 
  draggingCard, 
  potentialCardId, 
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  scrollRef
}) => {
  // SAFETY CHECK: Ensure cards is an array before trying to map
  if (!Array.isArray(cards)) {
      return null;
  }

  return (
    <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 transition-all overscroll-y-none relative no-scrollbar"
        style={{
            // Forcefully lock scroll when dragging
            overflowY: draggingCard ? 'hidden' : 'auto',
            touchAction: draggingCard ? 'none' : 'pan-y',
            userSelect: 'none',
            WebkitUserSelect: 'none'
        }}
      >
        {/* Anti-Pull-To-Refresh Spacer */}
        <div className="absolute inset-0 h-[101%] pointer-events-none z-[-1]" aria-hidden="true"></div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4 max-w-6xl mx-auto pb-48">
          {cards.map((card) => (
            <div 
              key={card.id} 
              onPointerDown={(e) => onPointerDown(e, card)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              className={`
                relative group cursor-grab active:cursor-grabbing transform transition-all 
                ${draggingCard?.id === card.id ? 'opacity-0 scale-90' : 'hover:scale-[1.02]'} 
                ${potentialCardId === card.id ? 'scale-[0.97]' : ''}
              `}
              // Allow browser to handle pan gestures normally until we lock it via pointer capture/global event
              style={{ touchAction: 'pan-y' }}
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
  );
};

export default CardPackGrid;
