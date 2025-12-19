
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
  return (
    <div 
        ref={scrollRef}
        className={`flex-1 overflow-y-auto p-4 transition-all ${draggingCard ? 'overflow-hidden touch-none pointer-events-none' : 'touch-pan-y'} overscroll-y-none relative`}
      >
        {/* Anti-Pull-To-Refresh Spacer: invisible, non-touchable element that ensures vertical scrollability */}
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
  );
};

export default CardPackGrid;
