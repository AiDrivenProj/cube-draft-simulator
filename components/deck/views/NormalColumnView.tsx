
import React from 'react';
import { Card } from '../../../types';
import CardImage from '../../CardImage';

interface ColumnData {
  id: string;
  title: string;
  cards: Card[];
}

interface NormalColumnViewProps {
  columns: ColumnData[];
  isStackedView: boolean;
  activeDropTarget: string | null;
  dragGhostActive: boolean;
  dragGhostCardId?: string;
  nativeDraggingId: string | null;
  setZoomedCard: (card: Card) => void;
  setActiveDropTarget: (id: string | null) => void;
  handleDragStart: (e: React.DragEvent, source: 'col' | 'sb', containerId: string, cardId: string) => void;
  handleDragEnd: () => void;
  handleDropOnCard: (e: React.DragEvent, targetColId: string, targetCardId: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDropOnColumn: (e: React.DragEvent, targetColId: string) => void;
  handleDragOverContainer: (e: React.DragEvent, containerId: string) => void;
  handleTouchStart: (e: React.TouchEvent, source: 'col' | 'sb', containerId: string, card: Card) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
  onPointerDown: (e: React.PointerEvent, card: Card, source: 'col' | 'sb', containerId: string) => void;
  selectedCardIds?: Set<string>;
  movingCardIds?: string[];
}

const STACK_OFFSET = 35;
const CARD_HEIGHT = 220;

const NormalColumnView: React.FC<NormalColumnViewProps> = ({
  columns,
  isStackedView,
  activeDropTarget,
  dragGhostActive,
  dragGhostCardId,
  setZoomedCard,
  onPointerDown,
  selectedCardIds,
  movingCardIds
}) => {
  return (
    <div className="flex min-h-full gap-4 min-w-max items-stretch">
        {columns.map((col) => (
            <div key={col.id} data-drop-id={col.id} 
               className={`w-[170px] flex flex-col shrink-0 transition-all duration-200 rounded-lg min-h-full ${activeDropTarget === col.id ? 'ring-4 ring-blue-500 bg-blue-500/10' : ''}`}>
                <div className="h-6 mb-2 flex items-center justify-center bg-slate-800 rounded border border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <span className="bg-black/30 px-2 py-0.5 rounded text-white">{col.cards.length}</span>
                </div>
                <div className="relative rounded-lg pb-10 flex-1 min-h-full">
                   <div className={`w-full relative ${!isStackedView ? 'flex flex-col gap-2 p-1' : ''}`} style={{ height: isStackedView ? `${Math.max(200, (col.cards.length * STACK_OFFSET) + CARD_HEIGHT)}px` : 'auto' }}>
                       {col.cards.map((card, index) => {
                           const isDragging = dragGhostActive && (
                               dragGhostCardId === card.id || 
                               (movingCardIds && movingCardIds.includes(card.id))
                           );
                           const isSelected = selectedCardIds?.has(card.id);
                           const isLast = index === col.cards.length - 1;
                           
                           return (
                               <div key={card.id} 
                                   data-col-card-index={index}
                                   data-card-id={card.id}
                                   data-is-last={isLast}
                                   onPointerDown={(e) => onPointerDown(e, card, 'col', col.id)}
                                   onClick={() => setZoomedCard(card)} 
                                   onContextMenu={(e) => e.preventDefault()}
                                   className={`
                                       ${isStackedView ? 'absolute left-1 right-1' : 'relative w-full'} 
                                       cursor-grab active:cursor-grabbing hover:z-[50] transition-all hover:-translate-y-1 shadow-md rounded-lg overflow-hidden 
                                       ${isDragging ? 'opacity-0' : 'opacity-100'}
                                       ${isSelected ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-slate-900 z-[40]' : ''}
                                   `} 
                                   style={{ 
                                       top: isStackedView ? `${index * STACK_OFFSET}px` : 'auto', 
                                       height: `${CARD_HEIGHT}px`, 
                                       zIndex: isStackedView ? index : 'auto',
                                       touchAction: 'manipulation'
                                   }}
                               >
                                   <div className="w-full h-full relative group pointer-events-none">
                                       <CardImage name={card.name} hoverEffect={false} className="w-full h-full object-cover rounded-lg" />
                                       {isSelected && <div className="absolute inset-0 bg-blue-500/20 mix-blend-overlay"></div>}
                                   </div>
                               </div>
                           );
                       })}
                   </div>
                </div>
            </div>
        ))}
    </div>
  );
};

export default NormalColumnView;
