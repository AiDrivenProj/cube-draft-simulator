
import React from 'react';
import { Card } from '../../types';
import CardImage from '../CardImage';

interface ZoomOverlayProps {
  card: Card;
  onClose: () => void;
}

const ZoomOverlay: React.FC<ZoomOverlayProps> = ({ card, onClose }) => {
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in" onClick={onClose}>
        <div className="relative max-w-sm w-full aspect-[2.5/3.5] shadow-2xl rounded-xl overflow-hidden transform scale-105 transition-transform">
            <CardImage name={card.name} hoverEffect={false} className="w-full h-full" />
        </div>
    </div>
  );
};

export default ZoomOverlay;
