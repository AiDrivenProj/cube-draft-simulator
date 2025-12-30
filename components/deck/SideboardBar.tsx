
import React from 'react';
import { Card } from '../../types';
import CardImage from '../CardImage';

interface SideboardBarProps {
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  sideboard: Card[];
  sideboardHeight: number;
  startResizingSideboard: (e: React.MouseEvent) => void;
  dragGhostActive: boolean;
  dragGhostCardId?: string;
  setZoomedCard: (card: Card) => void;
  handleDragStart: (e: React.DragEvent, source: 'col' | 'sb', containerId: string, cardId: string) => void;
  handleDragEnd: () => void;
  handleDropOnSideboardCard: (e: React.DragEvent, targetCardId: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDropOnSideboard: (e: React.DragEvent) => void;
  handleDragOverContainer: (e: React.DragEvent, containerId: string) => void;
  handleTouchStart: (e: React.TouchEvent, source: 'col' | 'sb', containerId: string, card: Card) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  onPointerDown: (e: React.PointerEvent, card: Card, source: 'col' | 'sb', containerId: string) => void;
  isDragging?: boolean;
  selectedCardIds?: Set<string>;
  movingCardIds?: string[];
}

const SideboardBar: React.FC<SideboardBarProps> = ({
  scrollRef,
  sideboard,
  sideboardHeight,
  startResizingSideboard,
  dragGhostActive,
  dragGhostCardId,
  setZoomedCard,
  onPointerDown,
  isDragging,
  selectedCardIds,
  movingCardIds
}) => {
  return (
    <div 
        className="absolute bottom-0 left-0 right-0 bg-slate-950/95 border-t-4 border-slate-700 z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col transition-all duration-100 ease-out"
        style={{ height: `${sideboardHeight}px` }}
        data-drop-id="SIDEBOARD"
    >
        <div 
            className="w-full h-3 bg-slate-800 hover:bg-blue-600/50 cursor-ns-resize flex items-center justify-center shrink-0 transition-colors"
            onMouseDown={startResizingSideboard}
        >
            <div className="w-16 h-1 rounded-full bg-slate-600"></div>
        </div>

        <div 
            ref={scrollRef}
            className={`flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-2 items-center mobile-no-scrollbar`}
            style={{ touchAction: isDragging ? 'none' : 'pan-x' }}
        >
             <div className="shrink-0 w-8 h-full flex items-center justify-center border-r border-slate-800 mr-2">
                 <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest -rotate-90 whitespace-nowrap">Sideboard</span>
             </div>
             {sideboard.length === 0 && (
                 <div className="flex-1 flex items-center justify-center text-slate-600 italic text-sm border-2 border-dashed border-slate-800 rounded-lg h-full">
                     Drag cards here to move to sideboard
                 </div>
             )}
             {sideboard.map((card, index) => {
                 const isSelected = selectedCardIds?.has(card.id);
                 const isMoving = dragGhostActive && (
                     dragGhostCardId === card.id || 
                     (movingCardIds && movingCardIds.includes(card.id))
                 );
                 return (
                     <div 
                        key={card.id}
                        data-sb-card-index={index}
                        data-card-id={card.id}
                        onPointerDown={(e) => onPointerDown(e, card, 'sb', 'SIDEBOARD')}
                        onClick={() => setZoomedCard(card)}
                        onContextMenu={(e) => e.preventDefault()}
                        className={`
                            relative h-full aspect-[2.5/3.5] shrink-0 cursor-grab active:cursor-grabbing hover:-translate-y-2 transition-transform shadow-lg rounded-lg 
                            ${isMoving ? 'opacity-0' : 'opacity-100'}
                            ${isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900 z-[40]' : ''}
                        `}
                        style={{ touchAction: 'manipulation' }}
                     >
                         <CardImage name={card.name} hoverEffect={false} className="w-full h-full object-cover rounded-lg pointer-events-none" />
                         {isSelected && <div className="absolute inset-0 bg-blue-500/20 mix-blend-overlay rounded-lg pointer-events-none"></div>}
                     </div>
                 );
             })}
        </div>
    </div>
  );
};

export default SideboardBar;
