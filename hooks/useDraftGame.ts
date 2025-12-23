
import { useState, useEffect, useRef, useCallback } from 'react';
import { GamePhase, DraftState, Player, Card, NetworkMessage, CubeSource } from '../types';
import { generatePacks } from '../services/cubeService';
import { IMultiplayerService, MultiplayerFactory } from '../services/multiplayerService';

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
  
  // Track the selected network mode ('local' or 'online')
  const [networkMode, setNetworkMode] = useState<'local' | 'online'>('local');

  // Use the service abstraction
  const multiplayerRef = useRef<IMultiplayerService | null>(null);

  const [roomId, setRoomId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const connectionTimeoutRef = useRef<number | null>(null);

  // Refs for callbacks to access latest state without re-binding
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const connectedPlayersRef = useRef(connectedPlayers);
  useEffect(() => { connectedPlayersRef.current = connectedPlayers; }, [connectedPlayers]);
  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  const cubeSourceRef = useRef(cubeSource);
  useEffect(() => { cubeSourceRef.current = cubeSource; }, [cubeSource]);
  const draftStateRef = useRef(draftState);
  useEffect(() => { draftStateRef.current = draftState; }, [draftState]);

  useEffect(() => {
    if (draftState?.isFinished && phase === GamePhase.DRAFT) setPhase(GamePhase.RECAP);
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

  const resetToSetup = useCallback(() => {
      try {
          setPhase(GamePhase.SETUP);
          
          // CRITICAL FIX: Only attempt history replacement if we are not in a blob environment
          // and the origin permits it.
          if (window.location.protocol !== 'blob:' && window.history && window.history.replaceState) {
              // Removes query params/hashes cleanly
              window.history.replaceState(null, '', window.location.pathname);
          }
          
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
          if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
      } catch (err) { 
          // Log error but proceed to ensure UI resets
          console.warn("Minor error during reset:", err); 
          setPhase(GamePhase.SETUP); 
      }
  }, []);

  const handleExit = useCallback(() => {
      try { multiplayerRef.current?.send({ type: 'LEAVE', clientId: myClientId }); }
      catch (err) { console.error("Failed to post LEAVE message:", err); }
      finally { resetToSetup(); }
  }, [myClientId, resetToSetup]);

  const handleNetworkMessage = useCallback((msg: NetworkMessage) => {
      if (['LOBBY_UPDATE', 'START_GAME'].includes(msg.type)) {
          if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
          setConnectionError(false);
      }
      switch (msg.type) {
          case 'LOBBY_UPDATE': 
              setConnectedPlayers(msg.players); 
              if (msg.maxPlayers) setMaxPlayers(msg.maxPlayers); 
              if (msg.cubeSource) setCubeSource(msg.cubeSource);
              if (msg.baseTimer) setBaseTimer(msg.baseTimer);
              break;
          case 'START_GAME': setDraftState(msg.state); setPhase(GamePhase.DRAFT); break;
          case 'STATE_UPDATE': setDraftState(msg.state); break;
          case 'PLAYER_LEFT': setNotification(`${msg.name} left and was replaced by a Bot.`); break;
          case 'LEAVE': handlePlayerDisconnect(msg.clientId); break;
      }
  }, [handlePlayerDisconnect]);

  const handleRemotePick = useCallback((clientId: string, cardId: string) => {
    setDraftState(prevState => {
        if (!prevState) return null;
        const newState = JSON.parse(JSON.stringify(prevState));
        const pIdx = newState.players.findIndex((p: Player) => p.clientId === clientId);
        if (pIdx === -1 || newState.players[pIdx].hasPicked) return prevState;
        const packIdx = newState.currentPackIndex[pIdx];
        const pack = newState.packs[pIdx][packIdx];
        const card = pack.find((c: Card) => c.id === cardId);
        if (card) {
            newState.packs[pIdx][packIdx] = pack.filter((c: Card) => c.id !== cardId);
            newState.players[pIdx].pool.push(card);
            newState.players[pIdx].hasPicked = true;
        }
        return processTurn(newState);
    });
  }, [processTurn]);

  // Handle incoming messages
  const onMessageReceived = useCallback((msg: NetworkMessage) => {
     const activeHost = isHostRef.current;
     if (activeHost && phaseRef.current !== GamePhase.SETUP) {
         if (msg.type === 'PICK_CARD') handleRemotePick(msg.clientId, msg.cardId);
         else if (msg.type === 'JOIN') {
             const currentPlayers = connectedPlayersRef.current;
             // Check if already connected
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
                 // Resend state to existing/rejoining player
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
    
    // Generate Room ID
    const id = Math.random().toString(36).substring(7);
    setRoomId(id);
    
    // Set Link with Mode param
    const baseUrl = window.location.origin + window.location.pathname;
    setInviteLink(`${baseUrl}#room=${id}&mode=${mode}`);
    
    setIsHost(true);
    setConnectedPlayers([{ id: 0, name: "Host", isBot: false, pool: [], clientId: myClientId }]);
    
    // Initialize Service
    multiplayerRef.current?.disconnect();
    multiplayerRef.current = MultiplayerFactory.getService(mode);
    await multiplayerRef.current.connect(id, onMessageReceived);

    setLoading(false); 
    setPhase(GamePhase.LOBBY);
  }, [myClientId, onMessageReceived]);

  const joinRoom = useCallback(async (id: string, mode: 'local' | 'online') => {
    setRoomId(id); 
    setIsHost(false); 
    setNetworkMode(mode);
    setPhase(GamePhase.LOBBY);
    
    multiplayerRef.current?.disconnect();
    multiplayerRef.current = MultiplayerFactory.getService(mode);
    
    // Set timeout for connection failure
    connectionTimeoutRef.current = window.setTimeout(() => { setConnectionError(true); }, 5000);
    
    await multiplayerRef.current.connect(id, onMessageReceived);
    
    // Send Join Message
    setTimeout(() => { 
        multiplayerRef.current?.send({ type: 'JOIN', clientId: myClientId, name: `Guest ${Math.floor(Math.random() * 1000)}` }); 
    }, 500);
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
      // Reconnect using the same Room ID but on the Local Service
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
            multiplayerRef.current?.send({ type: 'START_GAME', state: initialState });
            setPhase(GamePhase.DRAFT);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    }, 100);
  }, [connectedPlayers, fetchedCards, baseTimer]);

  const handleLocalPick = (card: Card) => {
      if (!draftState) return;
      const mySeatIndex = draftState.players.findIndex(p => p.clientId === myClientId);
      if (mySeatIndex === -1) return;

      if (!isHost) {
          // Client: Optimistic update then send
          const newState = { ...draftState };
          const p = newState.players[mySeatIndex];
          if (p) p.hasPicked = true;
          setDraftState(newState);
          multiplayerRef.current?.send({ type: 'PICK_CARD', clientId: myClientId, cardId: card.id });
          return;
      }
      
      // Host: Process turn immediately
      setDraftState(prevState => {
          if (!prevState) return null;
          const newState = JSON.parse(JSON.stringify(prevState));
          const packIdx = newState.currentPackIndex[mySeatIndex];
          const pack = newState.packs[mySeatIndex][packIdx];
          if (!pack.find((c: Card) => c.id === card.id)) return prevState;
          newState.packs[mySeatIndex][packIdx] = pack.filter((c: Card) => c.id !== card.id);
          newState.players[mySeatIndex].pool.push(card);
          newState.players[mySeatIndex].hasPicked = true;
          return processTurn(newState);
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
          setPhase(GamePhase.RECAP);
          setLoading(false);
      }, 500);
  }, [myClientId]);

  // Handle URL Hash for Joining and Query Params for Sharing
  useEffect(() => {
    // 1. Check Hash for Room Joining
    const handleHash = () => { 
        if (window.location.hash.startsWith('#room=')) {
            const params = new URLSearchParams(window.location.hash.replace('#', '?'));
            const room = params.get('room');
            const mode = (params.get('mode') as 'local' | 'online') || 'local';
            if (room) joinRoom(room, mode);
        }
    };
    
    // 2. Check Search Params for Shared Decks
    const handleDeckShare = () => {
        const params = new URLSearchParams(window.location.search);
        const deckData = params.get('deck');
        if (deckData) {
            try {
                // Decode: Base64 -> URI encoded -> JSON string
                const json = decodeURIComponent(escape(atob(deckData)));
                const parsed = JSON.parse(json);
                
                // Reconstruct Card objects from simple name arrays
                // Enriched later by DeckView
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
                    // Clean URL to prevent re-import on refresh if desired, 
                    // though leaving it allows sharing the current URL easily.
                    // window.history.replaceState({}, '', window.location.pathname);
                }
            } catch (e) {
                console.error("Failed to parse shared deck:", e);
                setNotification("Invalid shared deck link.");
            }
        }
    };

    window.addEventListener('hashchange', handleHash);
    
    // Execute checks on mount
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
