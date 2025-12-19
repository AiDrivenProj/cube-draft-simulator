export interface Card {
  id: string; // Unique ID for the draft instance
  name: string;
  cmc?: number;
  colors?: string[]; // ['W', 'U', 'B', 'R', 'G']
  type_line?: string;
  mana_cost?: string; // "{3}{U}{U}"
}

export interface Player {
  id: number;
  name: string;
  isBot: boolean;
  pool: Card[];
  sideboard?: Card[]; // Added to store sideboard state, especially for imports
  clientId?: string; // ID for network communication
  hasPicked?: boolean; // Track if they picked in current step
}

export interface DraftState {
  isActive: boolean;
  round: number; // 1, 2, 3
  packSize: number;
  players: Player[];
  packs: Card[][][]; // [playerIndex][packIndex] -> List of cards
  currentPackIndex: number[]; // Track which pack a player is currently holding
  direction: 'left' | 'right';
  isFinished: boolean;
  waitingForPlayers: boolean; // Local state to show spinner
  baseTimer?: number; // The maximum time for the first pick of a pack (in seconds)
}

export enum GamePhase {
  SETUP = 'SETUP',
  LOBBY = 'LOBBY',
  DRAFT = 'DRAFT',
  RECAP = 'RECAP',
  DECKBUILD = 'DECKBUILD'
}

export type CubeSource = 
  | { type: 'cubecobra'; id: string }
  | { type: 'manual'; text: string }
  | null;

export type NetworkMessage = 
  | { type: 'JOIN'; clientId: string; name: string }
  | { type: 'LOBBY_UPDATE'; players: Player[]; hostId: string; maxPlayers: number; cubeSource?: CubeSource; baseTimer?: number }
  | { type: 'START_GAME'; state: DraftState }
  | { type: 'PICK_CARD'; clientId: string; cardId: string }
  | { type: 'STATE_UPDATE'; state: DraftState }
  | { type: 'LEAVE'; clientId: string }
  | { type: 'PLAYER_LEFT'; name: string };