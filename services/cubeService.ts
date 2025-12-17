import { Card } from '../types';

// Helper for UUID generation that works in non-secure contexts (HTTP)
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments where crypto.randomUUID is not available
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export const fetchCubeCobraList = async (cubeId: string): Promise<Card[]> => {
  try {
    // Sanitize ID: Handle full URLs, trailing slashes, query params, etc.
    let cleanId = cubeId.trim();
    // Remove query string and hash
    cleanId = cleanId.split('?')[0].split('#')[0];
    // Remove trailing slash
    if (cleanId.endsWith('/')) {
        cleanId = cleanId.slice(0, -1);
    }
    // Get the last path segment (the ID)
    const parts = cleanId.split('/');
    cleanId = parts[parts.length - 1];

    if (!cleanId) {
        throw new Error("Invalid Cube ID format");
    }

    const response = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${cleanId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch cube: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // CubeCobra API sometimes returns a string message (e.g. "Cube not found") with 200 OK
    if (typeof data === 'string') {
        throw new Error(`CubeCobra API Message: ${data}`);
    }

    // Parse based on Schema provided: data.cards.mainboard
    let rawCards: any[] = [];
    
    // 1. Check Schema Structure: data.cards.mainboard
    if (data.cards && typeof data.cards === 'object' && Array.isArray(data.cards.mainboard)) {
        rawCards = data.cards.mainboard;
    } 
    // 2. Legacy/Alternative: data.cards is the array
    else if (Array.isArray(data.cards)) {
        rawCards = data.cards;
    }
    // 3. Alternative: data.mainboard
    else if (Array.isArray(data.mainboard)) {
        rawCards = data.mainboard;
    }
    
    if (!rawCards || !Array.isArray(rawCards) || rawCards.length === 0) {
      console.error("CubeCobra unexpected response:", data);
      throw new Error("Invalid CubeCobra JSON format: 'cards.mainboard' array missing. The cube might be empty or private.");
    }

    // Map CubeCobra structure to our Card interface
    const cards: Card[] = rawCards.map((entry: any) => {
      const details = entry.details || {};
      const name = details.name || entry.name || "Unknown Card";
      
      return {
        id: generateUUID(), // Internal ID for the draft instance
        name: name,
        // CubeCobra provides these details, so we can pre-fill them
        cmc: details.cmc ?? entry.cmc, 
        colors: details.colors ?? entry.colors ?? [],
        type_line: details.type_line ?? entry.type_line,
        mana_cost: details.mana_cost ?? ""
      };
    });

    return cards;

  } catch (error) {
    console.error("Error fetching from CubeCobra:", error);
    throw error;
  }
};

export const parseCubeList = (text: string): Card[] => {
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const cards: Card[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Ignore empty lines and comments
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue;
    }
    
    // Basic parsing: assumes the whole line is the card name
    cards.push({
      id: generateUUID(),
      name: trimmed
      // Metadata (cmc, colors) will be fetched later by DeckView/enrichCardData
    });
  }

  return cards;
};

export const generatePacks = (cube: Card[], players: number = 8, packCount: number = 3, packSize: number = 15): Card[][][] => {
  const totalCardsNeeded = players * packCount * packSize;
  
  if (cube.length === 0) return [];

  // Shuffle cube
  let shuffled = [...cube];
  
  // If not enough cards, we loop the cube (warn user in console)
  if (shuffled.length < totalCardsNeeded) {
      console.warn(`Not enough cards in cube (${shuffled.length}). Cloning to fill ${totalCardsNeeded} slots.`);
      while (shuffled.length < totalCardsNeeded) {
        // Clone with new IDs to treat them as distinct draft objects
        shuffled = [...shuffled, ...cube.map(c => ({...c, id: generateUUID()}))];
      }
  }
  
  // Fisher-Yates shuffle
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const packs: Card[][][] = []; // [playerIndex][packIndex] -> Cards

  let cardIdx = 0;
  for (let p = 0; p < players; p++) {
    const playerPacks: Card[][] = [];
    for (let r = 0; r < packCount; r++) {
      const pack: Card[] = [];
      for (let c = 0; c < packSize; c++) {
        pack.push(shuffled[cardIdx]);
        cardIdx++;
      }
      playerPacks.push(pack);
    }
    packs.push(playerPacks);
  }

  return packs;
};

// Batch fetch metadata from Scryfall for the deck builder
export const enrichCardData = async (cards: Card[]): Promise<Card[]> => {
  const cardsNeedingUpdate = cards.filter(c => c.cmc === undefined || c.colors === undefined);
  
  if (cardsNeedingUpdate.length === 0) {
      return cards;
  }

  const uniqueNames = [...new Set(cardsNeedingUpdate.map(c => c.name))];
  const BATCH_SIZE = 75; // Scryfall limit is 75 for collection endpoint
  const enrichedMap = new Map<string, any>();

  for (let i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
    const batch = uniqueNames.slice(i, i + BATCH_SIZE);
    const body = {
      identifiers: batch.map(name => ({ name }))
    };

    try {
      const response = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      data.data?.forEach((cardData: any) => {
        enrichedMap.set(cardData.name, cardData);
      });
    } catch (e) {
      console.error("Error fetching metadata batch", e);
    }
  }

  // Map back to card objects
  return cards.map(c => {
    const data = enrichedMap.get(c.name);
    
    if (!data) return c; 

    return {
      ...c,
      cmc: data.cmc,
      colors: data.colors || (data.card_faces ? data.card_faces[0].colors : []),
      type_line: data.type_line,
      mana_cost: data.mana_cost || (data.card_faces ? data.card_faces[0].mana_cost : "")
    };
  });
};