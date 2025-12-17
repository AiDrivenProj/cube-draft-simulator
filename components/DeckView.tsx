import React from 'react';
import { Card } from '../types';
import CardImage from './CardImage';

interface DeckViewProps {
  pool: Card[];
  onBack: () => void;
}

const DeckView: React.FC<DeckViewProps> = ({ pool, onBack }) => {
  return (
    <div className="flex flex-col h-full bg-slate-900 p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-white">Deck Construction</h2>
        <button onClick={onBack} className="text-blue-400 hover:text-white">Back</button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {pool.map(card => (
            <div key={card.id}>
               <CardImage name={card.name} hoverEffect={false} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DeckView;