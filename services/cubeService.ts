
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
  let cleanId = cubeId.trim();
  cleanId = cleanId.split('?')[0].split('#')[0];
  if (cleanId.endsWith('/')) {
      cleanId = cleanId.slice(0, -1);
  }
  const parts = cleanId.split('/');
  cleanId = parts[parts.length - 1];

  if (!cleanId) {
      throw new Error("ID_FORMAT_ERROR: Invalid ID format.");
  }

  const targetUrl = `https://cubecobra.com/cube/api/cubeJSON/${cleanId}`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;

  async function tryFetch(url: string) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
          if (response.status === 404) {
              throw new Error(`NOT_FOUND: Cube "${cleanId}" not found or private on CubeCobra.`);
          }
          throw new Error(`SERVER_ERROR: Server responded with error ${response.status}.`);
      }
      return response.json();
    } catch (e: any) {
      if (e.message.includes('NOT_FOUND') || e.message.includes('SERVER_ERROR')) throw e;
      throw new Error("NETWORK_ERROR: Unable to connect to CubeCobra. Check your connection.");
    }
  }

  try {
    let data;
    try {
      // Attempt 1: Direct fetch
      data = await tryFetch(targetUrl);
    } catch (e: any) {
      if (e.message.includes('NOT_FOUND')) throw e;
      console.warn("Direct fetch failed, trying CORS proxy...", e);
      // Attempt 2: CORS Proxy
      data = await tryFetch(proxyUrl);
    }
    
    if (typeof data === 'string') {
        throw new Error(`API_MESSAGE: ${data}`);
    }

    let rawCards: any[] = [];
    if (data.cards && typeof data.cards === 'object' && Array.isArray(data.cards.mainboard)) {
        rawCards = data.cards.mainboard;
    } else if (Array.isArray(data.cards)) {
        rawCards = data.cards;
    } else if (Array.isArray(data.mainboard)) {
        rawCards = data.mainboard;
    }
    
    if (!rawCards || !Array.isArray(rawCards) || rawCards.length === 0) {
      throw new Error("FORMAT_ERROR: The cube appears empty or the data format is incompatible.");
    }

    return rawCards.map((entry: any) => {
      const details = entry.details || {};
      return {
        id: generateUUID(),
        name: details.name || entry.name || "Unknown Card",
        cmc: details.cmc ?? entry.cmc, 
        colors: details.colors ?? entry.colors ?? [],
        type_line: details.type_line ?? entry.type_line,
        mana_cost: details.mana_cost ?? ""
      };
    });

  } catch (error: any) {
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
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const match = trimmed.match(/^(\d+x?\s+)?(.+)$/);
    if (match) {
        cards.push({ id: generateUUID(), name: match[2].trim() });
    }
  }
  return cards;
};

export const parseExportedDecklist = (text: string): { mainboard: Card[], sideboard: Card[] } => {
    if (!text) return { mainboard: [], sideboard: [] };
    const lines = text.split(/\r?\n/);
    const mainboard: Card[] = [];
    const sideboard: Card[] = [];

    // Flexible header detection regex
    // Matches: "Sideboard", "Sideboard:", "// Sideboard", "//      Sideboard", "Mainboard", etc.
    // This allows identifying the "Detailed" format which uses "// ... MAINBOARD" as comments
    const headerRegex = /^(?:\/\/|#)?\s*(MAINBOARD|SIDEBOARD):?\s*$/i;

    const hasExplicitHeaders = lines.some(line => headerRegex.test(line.trim()));

    if (hasExplicitHeaders) {
        let currentSection: 'main' | 'side' = 'main';
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const matchHeader = trimmed.match(headerRegex);
            if (matchHeader) {
                const sectionName = matchHeader[1].toUpperCase();
                if (sectionName === 'SIDEBOARD') {
                    currentSection = 'side';
                    continue;
                } else if (sectionName === 'MAINBOARD') {
                    currentSection = 'main';
                    continue;
                }
            }
            
            if (trimmed.startsWith('//') || trimmed.startsWith('#')) continue;
            
            const match = trimmed.match(/^(\d+x?)\s+(.+)$/);
            if (match) {
                let quantity = parseInt(match[1].replace('x', ''));
                if (isNaN(quantity)) quantity = 1;
                const cardName = match[2].trim();
                for (let i = 0; i < quantity; i++) {
                    const card = { id: generateUUID(), name: cardName };
                    if (currentSection === 'main') mainboard.push(card);
                    else sideboard.push(card);
                }
            }
        }
    } else {
        // Implicit mode: Mainboard cards -> Empty Line -> Sideboard cards
        // This is for formats like MTGA/MTGO simple text export where explicit headers are missing
        let parsingSideboard = false;
        let foundMainCards = false;

        for (const line of lines) {
            const trimmed = line.trim();
            
            if (!trimmed) {
                // If we encounter an empty line AND we have already seen cards, switch to sideboard
                if (foundMainCards) {
                    parsingSideboard = true;
                }
                continue;
            }

            if (trimmed.startsWith('//') || trimmed.startsWith('#')) continue;

            const match = trimmed.match(/^(\d+x?)\s+(.+)$/);
            if (match) {
                let quantity = parseInt(match[1].replace('x', ''));
                if (isNaN(quantity)) quantity = 1;
                const cardName = match[2].trim();

                const target = parsingSideboard ? sideboard : mainboard;
                if (!parsingSideboard) foundMainCards = true;

                for (let i = 0; i < quantity; i++) {
                    target.push({ id: generateUUID(), name: cardName });
                }
            }
        }
    }
    
    return { mainboard, sideboard };
};

export const generatePacks = (cube: Card[], players: number = 8, packCount: number = 3, packSize: number = 15): Card[][][] => {
  const totalCardsNeeded = players * packCount * packSize;
  if (cube.length === 0) return [];
  let shuffled = [...cube];
  if (shuffled.length < totalCardsNeeded) {
      while (shuffled.length < totalCardsNeeded) {
        shuffled = [...shuffled, ...cube.map(c => ({...c, id: generateUUID()}))];
      }
  }
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const packs: Card[][][] = [];
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

export const enrichCardData = async (cards: Card[]): Promise<Card[]> => {
  // CRITICAL FIX: Also check for !c.type_line. 
  // Often CubeCobra returns CMC and Colors but omits Type info in the lightweight list.
  const cardsNeedingUpdate = cards.filter(c => c.cmc === undefined || c.colors === undefined || !c.type_line);
  
  if (cardsNeedingUpdate.length === 0) return cards;
  const uniqueNames = [...new Set(cardsNeedingUpdate.map(c => c.name))];
  const BATCH_SIZE = 75;
  const enrichedMap = new Map<string, any>();
  for (let i = 0; i < uniqueNames.length; i += BATCH_SIZE) {
    const batch = uniqueNames.slice(i, i + BATCH_SIZE);
    const body = { identifiers: batch.map(name => ({ name })) };
    try {
      const response = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await response.json();
      data.data?.forEach((cardData: any) => { enrichedMap.set(cardData.name, cardData); });
    } catch (e) {
      console.error("Error fetching metadata batch", e);
    }
  }
  return cards.map(c => {
    const data = enrichedMap.get(c.name);
    if (!data) return c; 
    return {
      ...c,
      cmc: data.cmc,
      colors: data.colors || (data.card_faces ? data.card_faces[0].colors : []),
      // Improve type_line extraction to fallback to faces if top-level missing (for MDFCs/Transforms)
      type_line: data.type_line || (data.card_faces ? data.card_faces[0].type_line : ""),
      mana_cost: data.mana_cost || (data.card_faces ? data.card_faces[0].mana_cost : "")
    };
  });
};
