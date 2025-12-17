import React, { useState } from 'react';

interface CardImageProps {
  name: string;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  hoverEffect?: boolean;
}

const CardImage: React.FC<CardImageProps> = ({ name, className = "", onClick, hoverEffect = true }) => {
  const imageUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image`;
  const [hasError, setHasError] = useState(false);

  return (
    <div 
      className={`relative aspect-[2.5/3.5] bg-slate-800 rounded-lg overflow-hidden shadow-lg transition-transform duration-200 ${hoverEffect ? 'hover:scale-105 cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {!hasError ? (
        <img 
          src={imageUrl} 
          alt={name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setHasError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-2 text-center text-xs font-bold text-slate-300 bg-slate-700 border-2 border-slate-600">
          {name}
        </div>
      )}
    </div>
  );
};

export default CardImage;