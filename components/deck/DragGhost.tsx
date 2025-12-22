
import React from 'react';
import { Card } from '../../types';
import CardImage from '../CardImage';

interface DragGhostProps {
  x: number;
  y: number;
  card: Card;
}

const DragGhost: React.FC<DragGhostProps> = ({ x, y, card }) => {
  const isFixed = x !== 0 || y !== 0;
  
  return (
    <div 
        className={`${isFixed ? 'fixed z-[200] opacity-90' : 'w-full'} pointer-events-none shadow-[0_20px_60px_rgba(0,0,0,0.8)]`} 
        style={isFixed ? { 
            left: x, 
            top: y, 
            width: '140px', 
            marginTop: '-90px', 
            marginLeft: '-70px' 
        } : {}}
    >
        <div className="rounded-xl border-4 border-blue-500 overflow-hidden bg-slate-900 shadow-2xl">
            <CardImage name={card.name} hoverEffect={false} />
        </div>
    </div>
  );
};

export default DragGhost;
