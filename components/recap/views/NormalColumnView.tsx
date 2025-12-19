
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
  // DND Handlers
  handleDragStart: (e: React.DragEvent, source: 'col' | 'sb', containerId: string, cardId: string) => void;
  handleDragEnd: () => void;
  handleDropOnCard: (e: React.DragEvent, targetColId: string, targetCardId: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDropOnColumn: (e: React.DragEvent, targetColId: string) => void;
  handleDragOverContainer: (e: React.DragEvent, containerId: string) => void;
  handleTouchStart: (e: React.TouchEvent, source: 'col' | 'sb', containerId: string, card: Card) => void;
  handleTouchMove: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
}

const STACK_OFFSET = 35;
const CARD_HEIGHT = 220;

const NormalColumnView: React.FC<NormalColumnViewProps> = ({
  columns,
  isStackedView,
  activeDropTarget,
  dragGhostActive,
  dragGhostCardId,
  nativeDraggingId,
  setZoomedCard,
  setActiveDropTarget,
  handleDragStart,
  handleDragEnd,
  handleDropOnCard,
  handleDragOver,
  handleDropOnColumn,
  handleDragOverContainer,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd
}) => {
  return (
    <div className="flex min-h-full gap-4 min-w-max items-stretch">
        {columns.map((col) => (
            <div key={col.id} data-drop-id={col.id} 
               className={`w-[170px] flex flex-col shrink-0 transition-all duration-200 rounded-lg ${activeDropTarget === col.id ? 'ring-2 ring-blue-500 bg-blue-500/10' : ''}`} 
               onDragOver={(e) => handleDragOverContainer(e, col.id)} 
               onDragLeave={() => setActiveDropTarget(null)}
               onDrop={(e) => handleDropOnColumn(e, col.id)}>
                <div className="h-6 mb-2 flex items-center justify-center bg-slate-800 rounded border border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <span className="mr-2 opacity-80">{col.id}</span>
                    <span className="bg-black/30 px-1.5 py-0.5 rounded text-white">{col.cards.length}</span>
                </div>
                <div className="relative rounded-lg transition-colors pb-10 flex-1 min-h-full">
                   <div className={`w-full relative transition-all ${!isStackedView ? 'flex flex-col gap-2 p-1' : ''}`} style={{ height: isStackedView ? `${Math.max(200, (col.cards.length * STACK_OFFSET) + CARD_HEIGHT)}px` : 'auto' }}>
                       {col.cards.map((card, index) => {
                           const isSourceOfDragging = (dragGhostActive && dragGhostCardId === card.id) || (nativeDraggingId === card.id);
                           return (
                               <div key={card.id} 
                                   data-card-id={card.id} 
                                   draggable
                                   onDragStart={(e) => handleDragStart(e, 'col', col.id, card.id)} 
                                   onDragEnd={handleDragEnd} 
                                   onDrop={(e) => handleDropOnCard(e, col.id, card.id)} 
                                   onDragOver={handleDragOver} 
                                   onTouchStart={(e) => handleTouchStart(e, 'col', col.id, card)} 
                                   onTouchMove={handleTouchMove} 
                                   onTouchEnd={handleTouchEnd} 
                                   onClick={() => !dragGhostActive && setZoomedCard(card)} 
                                   className={`
                                       ${isStackedView ? 'absolute left-1 right-1' : 'relative w-full'} 
                                       cursor-grab active:cursor-grabbing hover:z-[50] transition-all hover:-translate-y-1 shadow-md rounded-lg overflow-hidden 
                                       ${dragGhostActive ? 'touch-none' : 'touch-auto'} 
                                       ${isSourceOfDragging ? 'opacity-0 pointer-events-none' : 'opacity-100'}
                                   `} 
                                   style={{ 
                                       top: isStackedView ? `${index * STACK_OFFSET}px` : 'auto', 
                                       height: `${CARD_HEIGHT}px`, 
                                       zIndex: isStackedView ? index : 'auto' 
                                   }}
                               >
                                   <div className="w-full h-full relative group pointer-events-none">
                                       <CardImage name={card.name} hoverEffect={false} className="w-full h-full object-cover rounded-lg" />
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
