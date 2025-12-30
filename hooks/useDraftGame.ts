
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GamePhase, DraftState, Player, Card, NetworkMessage, CubeSource } from '../types';
import { generatePacks } from '../services/cubeService';
import { IMultiplayerService, MultiplayerFactory } from '../services/multiplayerService';
import { useModal } from '../components/ModalSystem';

// Helper to sanitize Firebase data which turns Arrays into Objects.
// IMPORTANT: We must sort by keys to preserve the order (Player order).
const ensureArray = (data: any): any[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    // If it's an object, sort by numeric keys to restore array order
    return Object.keys(data)
        .sort((a, b) => Number(a) - Number(b))
        .map(key => data[key]);
};

// Helper specifically for Packs to preserve index positions (Round 1 -> Index 0, Round 3 -> Index 2)
// Firebase deletes empty arrays (previous rounds), creating sparse objects like {"2": [...]}.
// Standard ensureArray would flatten this to index 0, causing the client to read the wrong pack or undefined.
const ensurePackArray = (data: any): any[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    
    const keys = Object.keys(data).map(Number);
    if (keys.length === 0) return [];
    
    const maxKey = Math.max(...keys);
    // Create array up to maxKey (e.g. index 2 needs length 3), filled with empty arrays for gaps
    const arr = new Array(maxKey + 1).fill(null);
    
    keys.forEach(k => {
        arr[k] = data[k];
    });
    
    // Replace nulls/undefineds with empty arrays to prevent crashes
    return arr.map(item => item || []);
};

// Deeply sanitizes the state coming from the network to prevent "undefined" crashes
const sanitizeIncomingState = (state: any): DraftState => {
    if (!state) return state;
    
    // 1. Sanitize Players AND their internal arrays (pool/sideboard)
    // Firebase removes keys for empty arrays, so we must force them back to []
    const rawPlayers = ensureArray(state.players);
    const safePlayers = rawPlayers.map((p: any) => ({
        ...p,
        pool: ensureArray(p.pool),
        sideboard: ensureArray(p.sideboard)
    }));
    
    // 2. Sanitize Packs (3D Array: Players -> Packs -> Cards)
    const rawPacks = ensureArray(state.packs);
    const safePacks = rawPacks.map((playerPacks: any) => {
        // CRITICAL FIX: Use ensurePackArray for the packs list to handle sparse Firebase data
        const pPacks = ensurePackArray(playerPacks);
        return pPacks.map((pack: any) => ensureArray(pack));
    });

    // 3. Sanitize Current Pack Indices
    const safePackIndices = ensureArray(state.currentPackIndex);

    return {
        ...state,
        players: safePlayers,
        packs: safePacks,
        currentPackIndex: safePackIndices
    };
};

export const useDraftGame = () => {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.SETUP);
  const [fetchedCards, setFetchedCards] = useState<Card[]>([]);
  const [cubeSource, setCubeSource] = useState<CubeSource>(null);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  
  const [isHost, setIsHost] = useState(false);
  const [myClientId] = useState(() => Math.random().toString(36).substring(2));
  const [connectedPlayers, setConnectedPlayers] = useState<Player[]>([]);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [baseTimer, setBaseTimer] = useState(120);
  
  const [networkMode, setNetworkMode] = useState<'local' | 'online'>('local');
  const multiplayerRef = useRef<IMultiplayerService | null>(null);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const connectionTimeoutRef = useRef<number | null>(null);
  const joinRetryIntervalRef = useRef<number | null>(null);
  
  const hasJoinedViaHash = useRef(false);
  const { showConfirm } = useModal();

  // Refs for callbacks to access latest state without re-binding
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const connectedPlayersRef = useRef(connectedPlayers);
  useEffect(() => { connectedPlayersRef.current = connectedPlayers; }, [connectedPlayers]);
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  const cubeSourceRef = useRef(cubeSource);
  useEffect(() => { cubeSourceRef.current = cubeSource; }, [cubeSource]);
  
  const cleanupInternalState = useCallback(() => {
      try {
          if (joinRetryIntervalRef.current) { clearTimeout(joinRetryIntervalRef.current); joinRetryIntervalRef.current = null; }
          if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
          
          multiplayerRef.current?.disconnect();
          multiplayerRef.current = null;

          setRoomId(null); 
          setConnectionError(false); 
          setFetchedCards([]); 
          setCubeSource(null);
          setConnectedPlayers([]); 
          setDraftState(null); 
          setIsHost(false);
          setLoading(false);
          setBaseTimer(120);
          hasJoinedViaHash.current = false;
      } catch (err) { 
          console.warn("Minor error during cleanup:", err); 
      }
  }, []);

  const resetToSetup = useCallback(() => {
      cleanupInternalState();
      setPhase(GamePhase.SETUP);
      if (window.location.protocol !== 'blob:' && window.history && window.history.pushState) {
          window.history.pushState({ phase: GamePhase.SETUP }, '', window.location.pathname);
      }
  }, [cleanupInternalState]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        if (phaseRef.current !== GamePhase.SETUP) {
            e.preventDefault();
            e.returnValue = 'Are you sure you want to leave the active session?';
            return 'Are you sure you want to leave the active session?';
        }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    if (!window.history.state) {
        window.history.replaceState({ phase: GamePhase.SETUP }, '');
    }

    const handlePopState = (event: PopStateEvent) => {
        const currentPhase = phaseRef.current;
        const newPhase = event.state?.phase;
        const isGameActive = currentPhase === GamePhase.LOBBY || currentPhase === GamePhase.DRAFT || currentPhase === GamePhase.RECAP;
        const isPhaseChange = newPhase !== currentPhase;

        if (isGameActive && isPhaseChange) {
            window.history.pushState({ phase: currentPhase }, '');
            showConfirm(
                "Exit Session?",
                React.createElement('div', { className: 'space-y-2' },
                    React.createElement('p', null, "You are about to leave the active session."),
                    React.createElement('p', { className: 'text-sm text-slate-400' }, "This will disconnect you from the room and your draft progress may be lost.")
                ),
                () => resetToSetup()
            );
            return;
        }

        if (newPhase) {
            if (newPhase === GamePhase.SETUP) cleanupInternalState();
            setPhase(newPhase);
        } else {
            cleanupInternalState();
            setPhase(GamePhase.SETUP);
        }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [cleanupInternalState, showConfirm, resetToSetup]);

  const transitionToPhase = (newPhase: GamePhase) => {
      window.history.pushState({ phase: newPhase }, '');
      setPhase(newPhase);
  };

  useEffect(() => {
    if (draftState?.isFinished && phase === GamePhase.DRAFT) {
        transitionToPhase(GamePhase.RECAP);
    }
  }, [draftState, phase]);

  const executeBotPicks = (state: DraftState) => {
    state.players.forEach((player, seatIndex) => {
      if (!player.isBot || player.hasPicked) return;
      
      const packIndex = state.currentPackIndex[seatIndex];
      if (!state.packs[seatIndex] || !state.packs[seatIndex][packIndex]) return;
      
      const currentPack = state.packs[seatIndex][packIndex];
      if (currentPack.length > 0) {
        const pickIndex = Math.floor(Math.random() * currentPack.length);
        const pickedCard = currentPack[pickIndex];
        player.pool.push(pickedCard);
        player.hasPicked = true;
        state.packs[seatIndex][packIndex] = currentPack.filter(c => c.id !== pickedCard.id);
      }
    });
    return state;
  };

  const processTurn = useCallback((state: DraftState) => {
      const humans = state.players.filter(p => !p.isBot);
      const allPicked = humans.every(p => p.hasPicked);
      
      if (!allPicked) { 
          multiplayerRef.current?.send({ type: 'STATE_UPDATE', state }); 
          return state; 
      }
      
      let newState = executeBotPicks(state);
      newState.players.forEach(p => p.hasPicked = false);
      
      const currentRoundPackIndex = newState.currentPackIndex[0];
      const isCurrentPackEmpty = newState.packs[0][currentRoundPackIndex].length === 0;
      
      if (isCurrentPackEmpty) {
          if (newState.round === 3) { 
              newState.isFinished = true; 
              newState.isActive = false; 
          } else {
              newState.round += 1;
              newState.direction = newState.round % 2 === 0 ? 'right' : 'left';
              newState.currentPackIndex = newState.players.map(() => newState.round - 1);
          }
      } else {
          const totalPlayers = newState.players.length;
          const currentPacksRefs = newState.players.map((_, i) => newState.packs[i][newState.currentPackIndex[i]]);
          
          for (let i = 0; i < totalPlayers; i++) {
              let sourceSeatIndex = newState.direction === 'left' 
                ? (i - 1 + totalPlayers) % totalPlayers 
                : (i + 1) % totalPlayers;
              newState.packs[i][newState.currentPackIndex[i]] = currentPacksRefs[sourceSeatIndex];
          }
      }
      
      multiplayerRef.current?.send({ type: 'STATE_UPDATE', state: newState });
      return newState;
  }, []);

  const handlePlayerDisconnect = useCallback((clientId: string) => {
      const currentPlayers = connectedPlayersRef.current;
      const isLobby = phaseRef.current === GamePhase.LOBBY;
      
      let updatedPlayers: Player[] = [];
      if (isLobby) {
          updatedPlayers = currentPlayers.filter(p => p.clientId !== clientId);
      } else {
          updatedPlayers = currentPlayers.map(p => 
            p.clientId === clientId ? { ...p, isBot: true, name: `${p.name.replace(' (You)', '')} (Bot)` } : p
          );
      }
      
      const remainingHumans = updatedPlayers.filter(p => !p.isBot);
      if (remainingHumans.length === 0) {
          multiplayerRef.current?.disconnect();
          return;
      }

      let amINewHost = false;
      if (!isHostRef.current && remainingHumans[0].clientId === myClientId) {
          amINewHost = true;
          setIsHost(true);
          setNotification("The Host has left. You are now the Host.");
          updatedPlayers = updatedPlayers.map(p => 
            p.clientId === myClientId ? { ...p, name: `${p.name.replace(' (You)', '').replace(' (Host)', '')} (Host)` } : p
          );
      }

      setConnectedPlayers(updatedPlayers);
      const activeHost = isHostRef.current || amINewHost;

      if (activeHost) {
          if (isLobby) {
              multiplayerRef.current?.send({ 
                type: 'LOBBY_UPDATE', 
                players: updatedPlayers, 
                hostId: myClientId, 
                maxPlayers: maxPlayers,
                cubeSource: cubeSourceRef.current,
                baseTimer: baseTimer
              });
          } else {
              setDraftState(prevState => {
                  if (!prevState) return null;
                  let newState = JSON.parse(JSON.stringify(prevState));
                  newState.players = updatedPlayers;
                  return processTurn(newState);
              });
          }
      }
  }, [myClientId, maxPlayers, processTurn, baseTimer]);

  const handleExit = useCallback(() => {
      try { multiplayerRef.current?.send({ type: 'LEAVE', clientId: myClientId }); }
      catch (err) { console.error("Failed to post LEAVE message:", err); }
      finally { resetToSetup(); }
  }, [myClientId, resetToSetup]);

  const handleNetworkMessage = useCallback((msg: NetworkMessage) => {
      if (['LOBBY_UPDATE', 'START_GAME'].includes(msg.type)) {
          if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
          if (joinRetryIntervalRef.current) { clearTimeout(joinRetryIntervalRef.current); joinRetryIntervalRef.current = null; }
          setConnectionError(false);
      }
      switch (msg.type) {
          case 'LOBBY_UPDATE': 
              setConnectedPlayers(ensureArray(msg.players)); 
              if (msg.maxPlayers) setMaxPlayers(msg.maxPlayers); 
              if (msg.cubeSource) setCubeSource(msg.cubeSource);
              if (msg.baseTimer) setBaseTimer(msg.baseTimer);
              break;
          case 'START_GAME': 
              const sanitizedStartState = sanitizeIncomingState(msg.state);
              setDraftState(sanitizedStartState); 
              if (phaseRef.current !== GamePhase.DRAFT) {
                  window.history.pushState({ phase: GamePhase.DRAFT }, '');
                  setPhase(GamePhase.DRAFT); 
              }
              break;
          case 'STATE_UPDATE': 
              setDraftState(sanitizeIncomingState(msg.state)); 
              break;
          case 'PLAYER_LEFT': setNotification(`${msg.name} left and was replaced by a Bot.`); break;
          case 'LEAVE': handlePlayerDisconnect(msg.clientId); break;
      }
  }, [handlePlayerDisconnect]);

  const handleRemotePick = useCallback((clientId: string, cardId: string) => {
    setDraftState(prevState => {
        if (!prevState) return null;
        const newState = JSON.parse(JSON.stringify(prevState));
        // Deep sanitize before logic
        const safeState = sanitizeIncomingState(newState);

        const pIdx = safeState.players.findIndex((p: Player) => p.clientId === clientId);
        if (pIdx === -1 || safeState.players[pIdx].hasPicked) return prevState;
        
        const packIdx = safeState.currentPackIndex[pIdx];
        const pack = safeState.packs[pIdx][packIdx];
        
        if (!Array.isArray(pack)) return prevState;

        const card = pack.find((c: Card) => c.id === cardId);
        if (card) {
            safeState.packs[pIdx][packIdx] = pack.filter((c: Card) => c.id !== cardId);
            safeState.players[pIdx].pool.push(card);
            safeState.players[pIdx].hasPicked = true;
        }
        return processTurn(safeState);
    });
  }, [processTurn]);

  const onMessageReceived = useCallback((msg: NetworkMessage) => {
     const activeHost = isHostRef.current;
     if (activeHost && phaseRef.current !== GamePhase.SETUP) {
         if (msg.type === 'PICK_CARD') handleRemotePick(msg.clientId, msg.cardId);
         else if (msg.type === 'JOIN') {
             const currentPlayers = connectedPlayersRef.current;
             if (!currentPlayers.find(p => p.clientId === msg.clientId) && currentPlayers.length < maxPlayers) {
                 const newList = [...currentPlayers, { id: currentPlayers.length, name: msg.name, isBot: false, pool: [], clientId: msg.clientId }];
                 setConnectedPlayers(newList);
                 multiplayerRef.current?.send({ 
                    type: 'LOBBY_UPDATE', 
                    players: newList, 
                    hostId: myClientId, 
                    maxPlayers, 
                    cubeSource: cubeSourceRef.current,
                    baseTimer 
                 });
             } else {
                 multiplayerRef.current?.send({ 
                    type: 'LOBBY_UPDATE', 
                    players: currentPlayers, 
                    hostId: myClientId, 
                    maxPlayers, 
                    cubeSource: cubeSourceRef.current,
                    baseTimer
                 });
             }
         } else if (msg.type === 'LEAVE') handlePlayerDisconnect(msg.clientId);
     } else { 
         handleNetworkMessage(msg); 
     }
  }, [phase, handleNetworkMessage, handleRemotePick, handlePlayerDisconnect, myClientId, maxPlayers, baseTimer]);

  const createRoom = useCallback(async (cards: Card[], source: CubeSource, mode: 'local' | 'online' = 'local') => {
    setLoading(true); setLoadingMessage('Initializing Room...');
    setFetchedCards(cards);
    setCubeSource(source);
    setNetworkMode(mode);
    
    const limit = Math.min(16, Math.max(1, Math.floor(cards.length / 45)));
    setMaxPlayers(limit);
    setBaseTimer(120);
    
    const id = Math.random().toString(36).substring(7);
    setRoomId(id);
    
    const baseUrl = window.location.origin + window.location.pathname;
    setInviteLink(`${baseUrl}#room=${id}&mode=${mode}`);
    
    setIsHost(true);
    setConnectedPlayers([{ id: 0, name: "Host", isBot: false, pool: [], clientId: myClientId }]);
    
    multiplayerRef.current?.disconnect();
    multiplayerRef.current = MultiplayerFactory.getService(mode);
    await multiplayerRef.current.connect(id, onMessageReceived);

    setLoading(false); 
    transitionToPhase(GamePhase.LOBBY);
  }, [myClientId, onMessageReceived]);

  const joinRoom = useCallback(async (id: string, mode: 'local' | 'online') => {
    setRoomId(id); 
    setIsHost(false); 
    setNetworkMode(mode);
    transitionToPhase(GamePhase.LOBBY);
    
    if (joinRetryIntervalRef.current) clearInterval(joinRetryIntervalRef.current);
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);

    multiplayerRef.current?.disconnect();
    multiplayerRef.current = MultiplayerFactory.getService(mode);
    
    connectionTimeoutRef.current = window.setTimeout(() => { 
        setConnectionError(true); 
        if (joinRetryIntervalRef.current) clearInterval(joinRetryIntervalRef.current);
    }, 15000); 
    
    await multiplayerRef.current.connect(id, onMessageReceived);
    
    const attemptJoin = () => {
        multiplayerRef.current?.send({ 
            type: 'JOIN', 
            clientId: myClientId, 
            name: `Guest ${Math.floor(Math.random() * 1000)}` 
        });
    };
    attemptJoin();
    joinRetryIntervalRef.current = window.setInterval(attemptJoin, 2000);

  }, [myClientId, onMessageReceived]);

  const updateBaseTimer = useCallback((newTimer: number) => {
    const clamped = Math.max(45, Math.min(300, newTimer));
    setBaseTimer(clamped);
    if (isHost && multiplayerRef.current) {
        multiplayerRef.current.send({
            type: 'LOBBY_UPDATE',
            players: connectedPlayers,
            hostId: myClientId,
            maxPlayers,
            cubeSource,
            baseTimer: clamped
        });
    }
  }, [isHost, connectedPlayers, myClientId, maxPlayers, cubeSource]);

  const switchToLocalMode = useCallback(async () => {
      setNetworkMode('local');
      multiplayerRef.current?.disconnect();
      multiplayerRef.current = MultiplayerFactory.getService('local');
      if (roomId) {
          await multiplayerRef.current.connect(roomId, onMessageReceived);
      }
  }, [roomId, onMessageReceived]);

  const addBot = useCallback(() => {
      const currentPlayers = connectedPlayersRef.current;
      if (currentPlayers.length >= maxPlayers) return;
      const newList = [...currentPlayers, { id: currentPlayers.length, name: `Bot ${currentPlayers.length + 1}`, isBot: true, pool: [], clientId: `bot-${Date.now()}` }];
      setConnectedPlayers(newList);
      multiplayerRef.current?.send({ 
        type: 'LOBBY_UPDATE', 
        players: newList, 
        hostId: myClientId, 
        maxPlayers, 
        cubeSource: cubeSourceRef.current,
        baseTimer
      });
  }, [maxPlayers, myClientId, baseTimer]);

  const removePlayer = useCallback((clientId: string) => {
      const currentPlayers = connectedPlayersRef.current;
      const newList = currentPlayers.filter(p => p.clientId !== clientId);
      setConnectedPlayers(newList);
      multiplayerRef.current?.send({ 
        type: 'LOBBY_UPDATE', 
        players: newList, 
        hostId: myClientId, 
        maxPlayers, 
        cubeSource: cubeSourceRef.current,
        baseTimer
      });
  }, [maxPlayers, myClientId, baseTimer]);

  const startDraft = useCallback(() => {
    setLoading(true); setLoadingMessage('Generating packs...');
    setTimeout(() => {
        try {
            const packs = generatePacks(fetchedCards, connectedPlayers.length, 3, 15);
            const initialState: DraftState = { 
                isActive: true, 
                round: 1, 
                packSize: 15, 
                players: connectedPlayers, 
                packs, 
                currentPackIndex: Array(connectedPlayers.length).fill(0), 
                direction: 'left', 
                isFinished: false, 
                waitingForPlayers: false,
                baseTimer: baseTimer
            };
            setDraftState(initialState);
            
            // Send deep cloned and sanitized state
            const networkState = JSON.parse(JSON.stringify(initialState));
            multiplayerRef.current?.send({ type: 'START_GAME', state: networkState });
            
            transitionToPhase(GamePhase.DRAFT);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, 100);
  }, [connectedPlayers, fetchedCards, baseTimer]);

  const handleLocalPick = (card: Card) => {
      if (!draftState) return;
      const mySeatIndex = draftState.players.findIndex(p => p.clientId === myClientId);
      if (mySeatIndex === -1) return;

      if (!isHost) {
          const newState = { ...draftState };
          const p = newState.players[mySeatIndex];
          if (p) p.hasPicked = true;
          setDraftState(newState);
          multiplayerRef.current?.send({ type: 'PICK_CARD', clientId: myClientId, cardId: card.id });
          return;
      }
      
      setDraftState(prevState => {
          if (!prevState) return null;
          const newState = JSON.parse(JSON.stringify(prevState));
          const safeState = sanitizeIncomingState(newState);

          const packIdx = safeState.currentPackIndex[mySeatIndex];
          const pack = safeState.packs[mySeatIndex][packIdx];
          
          if (!Array.isArray(pack) || !pack.find((c: Card) => c.id === card.id)) return prevState;
          
          safeState.packs[mySeatIndex][packIdx] = pack.filter((c: Card) => c.id !== card.id);
          safeState.players[mySeatIndex].pool.push(card);
          safeState.players[mySeatIndex].hasPicked = true;
          return processTurn(safeState);
      });
  };

  const importDeck = useCallback((data: { mainboard: Card[], sideboard: Card[] }) => {
      setLoading(true);
      setLoadingMessage('Loading saved deck...');
      setTimeout(() => {
          const initialState: DraftState = { 
              isActive: false, 
              round: 3, 
              packSize: 15, 
              players: [{ 
                  id: 0, 
                  name: "Shared Deck", 
                  isBot: false, 
                  pool: data.mainboard,
                  sideboard: data.sideboard,
                  clientId: myClientId 
              }], 
              packs: [], 
              currentPackIndex: [], 
              direction: 'left', 
              isFinished: true, 
              waitingForPlayers: false,
              baseTimer: 120
          };
          setDraftState(initialState);
          transitionToPhase(GamePhase.RECAP);
          setLoading(false);
      }, 500);
  }, [myClientId]);

  useEffect(() => {
    const handleHash = () => {
        if (hasJoinedViaHash.current) return;
        
        const hash = window.location.hash;
        if (hash.includes('room=')) {
            const cleanHash = hash.replace(/^#\/?/, ''); 
            const params = new URLSearchParams(cleanHash.replace(/&amp;/g, '&'));
            
            const room = params.get('room');
            const mode = (params.get('mode') as 'local' | 'online') || 'local';
            
            if (room) {
                hasJoinedViaHash.current = true;
                joinRoom(room, mode);
            }
        }
    };
    
    const handleDeckShare = () => {
        const params = new URLSearchParams(window.location.search);
        const deckData = params.get('deck');
        if (deckData) {
            try {
                const json = decodeURIComponent(escape(atob(deckData)));
                const parsed = JSON.parse(json);
                const main = (parsed.m || []).map((name: string) => ({ 
                    id: `shared-${Math.random().toString(36).substr(2, 9)}`, 
                    name 
                }));
                const side = (parsed.s || []).map((name: string) => ({ 
                    id: `shared-sb-${Math.random().toString(36).substr(2, 9)}`, 
                    name 
                }));

                if (main.length > 0 || side.length > 0) {
                    importDeck({ mainboard: main, sideboard: side });
                }
            } catch (e) {
                console.error("Failed to parse shared deck:", e);
                setNotification("Invalid shared deck link.");
            }
        }
    };

    window.addEventListener('hashchange', handleHash);
    handleHash();
    handleDeckShare();

    return () => window.removeEventListener('hashchange', handleHash);
  }, [joinRoom, importDeck]);

  useEffect(() => { if (notification) { const t = setTimeout(() => setNotification(null), 5000); return () => clearTimeout(t); } }, [notification]);

  return { 
    phase, 
    draftState, 
    cubeSource, 
    loading, 
    loadingMessage, 
    inviteLink, 
    isHost, 
    connectedPlayers, 
    maxPlayers, 
    myClientId, 
    notification, 
    setNotification, 
    connectionError, 
    createRoom, 
    handleExit, 
    startDraft, 
    addBot, 
    removePlayer,
    handleLocalPick, 
    resetToSetup, 
    importDeck,
    baseTimer,
    updateBaseTimer,
    networkMode,
    switchToLocalMode
  };
};
