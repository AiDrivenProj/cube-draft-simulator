
import React from 'react';
import { Card } from '../../types';
import CardImage from '../CardImage';

interface ZoomOverlayProps {
  card: Card;
  onClose: () => void;
}

const ZoomOverlay: React.FC<ZoomOverlayProps> = ({ card, onClose }) => {
  return (
    <div 
        className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in cursor-pointer" 
        onClick={(e) => {
            if (e.target === e.currentTarget) {
                onClose();
            }
        }}
        onPointerDown={(e) => e.stopPropagation()}
    >
        <div 
            className="relative max-w-sm w-full aspect-[2.5/3.5] shadow-2xl rounded-xl transform scale-105 transition-transform cursor-default" 
            onClick={(e) => e.stopPropagation()}
        >
            <button 
                onClick={onClose}
                className="absolute -top-4 -right-4 w-10 h-10 bg-slate-800 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-slate-600 z-50 hover:bg-slate-700 active:scale-95 transition-all"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
            <div className="rounded-xl overflow-hidden w-full h-full">
                <CardImage name={card.name} hoverEffect={false} className="w-full h-full" />
            </div>
        </div>
    </div>
  );
};

export default ZoomOverlay;
