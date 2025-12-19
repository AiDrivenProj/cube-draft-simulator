
import React from 'react';
import { Card } from '../../types';
import CardImage from '../CardImage';

interface GhostCardProps {
  card: Card;
  style: React.CSSProperties;
}

const GhostCard: React.FC<GhostCardProps> = ({ card, style }) => {
  return (
    <div 
        className="fixed pointer-events-none z-[100] w-36 shadow-2xl"
        style={style}
    >
        <CardImage name={card.name} hoverEffect={false} className="rounded-lg border-2 border-blue-500/50" />
    </div>
  );
};

export default GhostCard;
