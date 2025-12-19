import React, { useState, useEffect } from 'react';
import { ImageCache } from '../services/imageCache';

interface CardImageProps {
  name: string;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  hoverEffect?: boolean;
}

const CardImage: React.FC<CardImageProps> = ({ name, className = "", onClick, hoverEffect = true }) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;

    const loadImage = async () => {
      try {
        // 1. Try to get from Cache
        const cachedUrl = await ImageCache.get(name);
        if (cachedUrl) {
          if (isMounted) {
            setDisplayUrl(cachedUrl);
            setIsLoading(false);
            objectUrl = cachedUrl;
          }
          return;
        }

        // 2. Not in cache, fetch from Scryfall
        const scryfallUrl = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image`;
        const response = await fetch(scryfallUrl);
        
        if (!response.ok) throw new Error('Failed to fetch from Scryfall');
        
        const blob = await response.blob();
        
        // 3. Save to Cache and get Local URL
        const localUrl = await ImageCache.set(name, blob);
        
        if (isMounted) {
          setDisplayUrl(localUrl);
          setIsLoading(false);
          objectUrl = localUrl;
        }
      } catch (err) {
        console.error(`Error loading image for ${name}:`, err);
        if (isMounted) {
          setHasError(true);
          setIsLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      isMounted = false;
      // Note: We don't revoke immediately because the cache might still need it,
      // but in a real production app we'd manage objectUrl lifecycle more strictly.
    };
  }, [name]);

  return (
    <div 
      className={`relative aspect-[2.5/3.5] bg-slate-800 rounded-lg overflow-hidden shadow-lg transition-transform duration-200 ${hoverEffect ? 'hover:scale-105 cursor-pointer' : ''} ${className}`}
      onClick={onClick}
    >
      {/* Loading Shimmer Placeholder */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center">
            <div className="absolute inset-0 shimmer opacity-50"></div>
            <div className="relative z-20 flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-tighter max-w-[80%] text-center truncate px-2">{name}</span>
            </div>
        </div>
      )}
      
      {!hasError && displayUrl ? (
        <img 
          src={displayUrl} 
          alt={name}
          className={`w-full h-full object-cover transition-all duration-500 ${isLoading ? 'opacity-0 scale-95 blur-sm' : 'opacity-100 scale-100 blur-0'}`}
          loading="lazy"
        />
      ) : hasError ? (
        /* Error / Missing Image Fallback UI */
        <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-slate-900 border-2 border-slate-700/50 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none flex items-center justify-center rotate-12">
              <svg viewBox="0 0 24 24" className="w-24 h-24 text-white" fill="currentColor">
                  <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
              </svg>
          </div>

          <div className="relative z-10 flex flex-col items-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500/40 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Image Missing</h4>
              <span className="text-[9px] font-bold text-slate-500 italic leading-tight break-words max-w-full px-2">{name}</span>
          </div>

          <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center px-1">
              <div className="w-2 h-2 rounded-full bg-slate-800"></div>
              <div className="w-10 h-1 bg-slate-800 rounded-full"></div>
              <div className="w-2 h-2 rounded-full bg-slate-800"></div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CardImage;