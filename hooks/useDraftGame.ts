import { useState, useEffect, useRef, useCallback } from 'react';
import { GamePhase, DraftState, Player, Card, NetworkMessage, CubeSource } from '../types';
import { generatePacks } from '../services/cubeService';

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
  const [baseTimer, setBaseTimer] = useState(120); // Default 120s

  const channelRef = useRef<BroadcastChannel | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);

  const [notification, setNotification] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const connectionTimeoutRef = useRef<number | null>(null);

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
          channelRef.current?.postMessage({ type: 'STATE_UPDATE', state }); 
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
      
      channelRef.current?.postMessage({ type: 'STATE_UPDATE', state: newState });
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
          if (channelRef.current) { channelRef.current.close(); channelRef.current = null; }
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
              channelRef.current?.postMessage({ 
                type: 'LOBBY_UPDATE', 
                players: updatedPlayers, 
                hostId: myClientId, 
                maxPlayers: maxPlayers,
                cubeSource: cubeSourceRef.current,
                baseTimer: baseTimer // Sync timer
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
          window.history.replaceState(null, '', window.location.pathname);
          if (channelRef.current) { 
              channelRef.current.onmessage = null; 
              channelRef.current.close(); 
              channelRef.current = null; 
          }
          setRoomId(null); 
          setConnectionError(false); 
          setFetchedCards([]); 
          setCubeSource(null);
          setConnectedPlayers([]); 
          setDraftState(null); 
          setIsHost(false);
          setLoading(false);
          setBaseTimer(120); // Reset timer default
          if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
      } catch (err) { console.error("Error during resetToSetup:", err); setPhase(GamePhase.SETUP); }
  }, []);

  const handleExit = useCallback(() => {
      try { if (channelRef.current) channelRef.current.postMessage({ type: 'LEAVE', clientId: myClientId }); }
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

  useEffect(() => {
     if (channelRef.current) {
         channelRef.current.onmessage = (event) => {
             const msg = event.data as NetworkMessage;
             const activeHost = isHostRef.current;
             if (activeHost && phaseRef.current !== GamePhase.SETUP) {
                 if (msg.type === 'PICK_CARD') handleRemotePick(msg.clientId, msg.cardId);
                 else if (msg.type === 'JOIN') {
                     const currentPlayers = connectedPlayersRef.current;
                     if (!currentPlayers.find(p => p.clientId === msg.clientId) && currentPlayers.length < maxPlayers) {
                         const newList = [...currentPlayers, { id: currentPlayers.length, name: msg.name, isBot: false, pool: [], clientId: msg.clientId }];
                         setConnectedPlayers(newList);
                         channelRef.current?.postMessage({ 
                            type: 'LOBBY_UPDATE', 
                            players: newList, 
                            hostId: myClientId, 
                            maxPlayers, 
                            cubeSource: cubeSourceRef.current,
                            baseTimer // Send current timer to new player
                         });
                     } else {
                         channelRef.current?.postMessage({ 
                            type: 'LOBBY_UPDATE', 
                            players: currentPlayers, 
                            hostId: myClientId, 
                            maxPlayers, 
                            cubeSource: cubeSourceRef.current,
                            baseTimer
                         });
                     }
                 } else if (msg.type === 'LEAVE') handlePlayerDisconnect(msg.clientId);
             } else { handleNetworkMessage(msg); }
         };
     }
  }, [isHost, phase, handleNetworkMessage, handleRemotePick, handlePlayerDisconnect, myClientId, maxPlayers, baseTimer]);

  const createRoom = useCallback(async (cards: Card[], source: CubeSource) => {
    setLoading(true); setLoadingMessage('Initializing Room...');
    setFetchedCards(cards);
    setCubeSource(source);
    const limit = Math.min(16, Math.max(1, Math.floor(cards.length / 45)));
    setMaxPlayers(limit);
    setBaseTimer(120); // Reset timer on create
    const id = Math.random().toString(36).substring(7);
    setRoomId(id);
    setInviteLink(`${window.location.origin}/#room=${id}`);
    setIsHost(true);
    setConnectedPlayers([{ id: 0, name: "Host", isBot: false, pool: [], clientId: myClientId }]);
    if (channelRef.current) channelRef.current.close();
    channelRef.current = new BroadcastChannel(`draft_room_${id}`);
    setLoading(false); setPhase(GamePhase.LOBBY);
  }, [myClientId]);

  const joinRoom = useCallback((id: string) => {
    if (channelRef.current) channelRef.current.close();
    setRoomId(id); setIsHost(false); setPhase(GamePhase.LOBBY);
    const channel = new BroadcastChannel(`draft_room_${id}`);
    channelRef.current = channel;
    connectionTimeoutRef.current = window.setTimeout(() => { setConnectionError(true); }, 3000);
    setTimeout(() => { channel.postMessage({ type: 'JOIN', clientId: myClientId, name: `Guest ${Math.floor(Math.random() * 1000)}` }); }, 500);
  }, [myClientId]);

  const updateBaseTimer = useCallback((newTimer: number) => {
    const clamped = Math.max(45, Math.min(300, newTimer));
    setBaseTimer(clamped);
    if (isHost && channelRef.current) {
        channelRef.current.postMessage({
            type: 'LOBBY_UPDATE',
            players: connectedPlayers,
            hostId: myClientId,
            maxPlayers,
            cubeSource,
            baseTimer: clamped
        });
    }
  }, [isHost, connectedPlayers, myClientId, maxPlayers, cubeSource]);

  const addBot = useCallback(() => {
      const currentPlayers = connectedPlayersRef.current;
      if (currentPlayers.length >= maxPlayers) return;
      const newList = [...currentPlayers, { id: currentPlayers.length, name: `Bot ${currentPlayers.length + 1}`, isBot: true, pool: [], clientId: `bot-${Date.now()}` }];
      setConnectedPlayers(newList);
      channelRef.current?.postMessage({ 
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
                baseTimer: baseTimer // Inject configured timer
            };
            setDraftState(initialState);
            channelRef.current?.postMessage({ type: 'START_GAME', state: initialState });
            setPhase(GamePhase.DRAFT);
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
          channelRef.current?.postMessage({ type: 'PICK_CARD', clientId: myClientId, cardId: card.id });
          return;
      }
      
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

  /**
   * Imports a saved deck and jumps directly to RecapView (Deck Building mode).
   * Now handles both mainboard and sideboard.
   */
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
                  name: "My Saved Deck", 
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

  useEffect(() => {
    const handleHash = () => { if (window.location.hash.startsWith('#room=')) joinRoom(window.location.hash.split('=')[1]); };
    window.addEventListener('hashchange', handleHash);
    handleHash();
    return () => window.removeEventListener('hashchange', handleHash);
  }, [joinRoom]);

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
    handleLocalPick, 
    resetToSetup, 
    importDeck,
    baseTimer,
    updateBaseTimer
  };
};