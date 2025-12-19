
import React from 'react';
import { Card } from '../../types';
import CardImage from '../CardImage';

interface DragGhostProps {
  x: number;
  y: number;
  card: Card;
}

const DragGhost: React.FC<DragGhostProps> = ({ x, y, card }) => {
  return (
    <div 
        className="fixed z-[200] pointer-events-none opacity-90 shadow-[0_20px_60px_rgba(0,0,0,0.8)] scale-110" 
        style={{ 
            left: x, 
            top: y, 
            width: '140px', 
            marginTop: '-90px', 
            marginLeft: '-70px' 
        }}
    >
        <CardImage name={card.name} hoverEffect={false} className="rounded-xl border-4 border-blue-500 shadow-2xl" />
    </div>
  );
};

export default DragGhost;
