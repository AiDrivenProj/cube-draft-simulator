import { useState, useEffect, useRef, useCallback } from 'react';
import { GamePhase, DraftState, Player, Card, NetworkMessage } from '../types';
import { generatePacks } from '../services/cubeService';

export const useDraftGame = () => {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.SETUP);
  const [fetchedCards, setFetchedCards] = useState<Card[]>([]);
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  
  const [isHost, setIsHost] = useState(false);
  const [myClientId] = useState(() => Math.random().toString(36).substring(2));
  const [connectedPlayers, setConnectedPlayers] = useState<Player[]>([]);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);

  const [notification, setNotification] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const connectionTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (draftState?.isFinished && phase === GamePhase.DRAFT) setPhase(GamePhase.RECAP);
  }, [draftState, phase]);

  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const connectedPlayersRef = useRef(connectedPlayers);
  useEffect(() => { connectedPlayersRef.current = connectedPlayers; }, [connectedPlayers]);

  const maxPlayersRef = useRef(maxPlayers);
  useEffect(() => { maxPlayersRef.current = maxPlayers; }, [maxPlayers]);

  const isHostRef = useRef(isHost);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  useEffect(() => {
    const handleUnload = () => {
        if (phaseRef.current === GamePhase.DRAFT || phaseRef.current === GamePhase.LOBBY) {
            channelRef.current?.postMessage({ type: 'LEAVE', clientId: myClientId });
        }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
        window.removeEventListener('beforeunload', handleUnload);
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        if (channelRef.current) {
            channelRef.current.close();
            channelRef.current = null;
        }
    };
  }, [myClientId]);

  const executeBotPicks = (state: DraftState) => {
    state.players.forEach((player, seatIndex) => {
      if (!player.isBot) return;
      if (player.hasPicked) return;
      
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

  const processTurn = (state: DraftState) => {
      const humans = state.players.filter(p => !p.isBot);
      const allPicked = humans.every(p => p.hasPicked);
      
      if (!allPicked) { 
          channelRef.current?.postMessage({ type: 'STATE_UPDATE', state }); 
          return state; 
      }
      
      let newState = executeBotPicks(state);
      newState.players.forEach(p => p.hasPicked = false);
      
      const hostSeat = 0;
      const currentRoundPackIndex = newState.currentPackIndex[hostSeat];
      const isCurrentPackEmpty = newState.packs[hostSeat][currentRoundPackIndex].length === 0;
      
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
              let sourceSeatIndex;
              if (newState.direction === 'left') {
                  sourceSeatIndex = (i - 1 + totalPlayers) % totalPlayers; 
              } else {
                  sourceSeatIndex = (i + 1) % totalPlayers;
              }
              newState.packs[i][newState.currentPackIndex[i]] = currentPacksRefs[sourceSeatIndex];
          }
      }
      
      channelRef.current?.postMessage({ type: 'STATE_UPDATE', state: newState });
      return newState;
  };

  const handlePlayerDisconnect = (clientId: string) => {
      const isLobby = phaseRef.current === GamePhase.LOBBY;
      const currentPlayers = connectedPlayersRef.current;
      
      let simulatedPlayers: Player[] = [];
      if (isLobby) {
         simulatedPlayers = currentPlayers.filter(p => p.clientId !== clientId);
      } else {
         simulatedPlayers = currentPlayers.map(p => { 
             if (p.clientId === clientId) return { ...p, isBot: true, name: `${p.name} (Bot)` }; 
             return p; 
         });
      }
      
      let willBeHost = isHostRef.current;
      if (!willBeHost) {
          const remainingHumans = simulatedPlayers.filter(p => !p.isBot);
          if (remainingHumans.length > 0 && remainingHumans[0].clientId === myClientId) {
              willBeHost = true;
          }
      }

      setConnectedPlayers(simulatedPlayers);
      
      if (willBeHost && !isHostRef.current) {
          setIsHost(true);
      }
      
      if (willBeHost) {
          if (isLobby) {
             channelRef.current?.postMessage({ type: 'LOBBY_UPDATE', players: simulatedPlayers, hostId: myClientId, maxPlayers: maxPlayersRef.current });
          } else {
              setDraftState(prevState => {
                  if (!prevState) return null;
                  const newState = JSON.parse(JSON.stringify(prevState));

                  const playerIndex = newState.players.findIndex((p: Player) => p.clientId === clientId);
                  if (playerIndex === -1) return prevState;
                  
                  const player = newState.players[playerIndex];
                  channelRef.current?.postMessage({ type: 'PLAYER_LEFT', name: player.name });
                  
                  newState.players[playerIndex] = { 
                      ...player, 
                      isBot: true, 
                      name: `${player.name} (Bot)`,
                  };
                  return processTurn(newState);
              });
          }
      }
  };

  const handleRemotePick = (clientId: string, cardId: string) => {
      setDraftState(prevState => {
          if (!prevState) return null;
          const newState = JSON.parse(JSON.stringify(prevState));
          
          const playerIdx = newState.players.findIndex((p: Player) => p.clientId === clientId);
          if (playerIdx === -1) return prevState;
          if (newState.players[playerIdx].hasPicked) return prevState;
          
          const packIdx = newState.currentPackIndex[playerIdx];
          const pack = newState.packs[playerIdx][packIdx];
          const card = pack.find((c: Card) => c.id === cardId);
          
          if (card) {
              newState.packs[playerIdx][packIdx] = pack.filter((c: Card) => c.id !== cardId);
              newState.players[playerIdx].pool.push(card);
              newState.players[playerIdx].hasPicked = true;
          }
          return processTurn(newState);
      });
  };

  const handleHostNetworkMessage = useCallback((msg: NetworkMessage, currentPlayers: Player[], limit: number) => {
    if (msg.type === 'JOIN') {
      if (!currentPlayers.find(p => p.clientId === msg.clientId)) {
          if (currentPlayers.length < limit) {
            const newPlayer: Player = { id: currentPlayers.length, name: msg.name, isBot: false, pool: [], clientId: msg.clientId };
            const newList = [...currentPlayers, newPlayer];
            setConnectedPlayers(newList);
            channelRef.current?.postMessage({ type: 'LOBBY_UPDATE', players: newList, hostId: myClientId, maxPlayers: limit });
          }
      } else channelRef.current?.postMessage({ type: 'LOBBY_UPDATE', players: currentPlayers, hostId: myClientId, maxPlayers: limit });
    } else if (msg.type === 'PICK_CARD') handleRemotePick(msg.clientId, msg.cardId);
    else if (msg.type === 'LEAVE') handlePlayerDisconnect(msg.clientId);
  }, [myClientId]);

  const handleNetworkMessage = useCallback((msg: NetworkMessage) => {
      if (['LOBBY_UPDATE', 'START_GAME'].includes(msg.type)) {
          if (connectionTimeoutRef.current) { clearTimeout(connectionTimeoutRef.current); connectionTimeoutRef.current = null; }
          setConnectionError(false);
      }
      
      if (msg.type === 'LOBBY_UPDATE') {
          setConnectedPlayers(msg.players);
          if (msg.maxPlayers) setMaxPlayers(msg.maxPlayers);
      } else if (msg.type === 'START_GAME') {
          setDraftState(msg.state);
          setPhase(GamePhase.DRAFT);
      } else if (msg.type === 'STATE_UPDATE') {
          setDraftState(msg.state);
      } else if (msg.type === 'PLAYER_LEFT') {
          setNotification(`${msg.name} left the game and was replaced by a Bot.`);
      } else if (msg.type === 'LEAVE') {
          handlePlayerDisconnect(msg.clientId);
      }
  }, []);

  useEffect(() => {
     if (isHost && channelRef.current && phase !== GamePhase.SETUP) {
         channelRef.current.onmessage = (event) => {
             const msg = event.data as NetworkMessage;
             handleHostNetworkMessage(msg, connectedPlayersRef.current, maxPlayersRef.current);
         };
     }
  }, [isHost, phase, handleHostNetworkMessage]);

  const joinRoom = useCallback((id: string) => {
    if (channelRef.current) channelRef.current.close();
    setRoomId(id); setIsHost(false); setPhase(GamePhase.LOBBY);
    const channel = new BroadcastChannel(`draft_room_${id}`);
    channelRef.current = channel;
    setConnectionError(false);
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = window.setTimeout(() => { setConnectionError(true); }, 3000);
    channel.onmessage = (event) => { const msg = event.data as NetworkMessage; handleNetworkMessage(msg); };
    setTimeout(() => { channel.postMessage({ type: 'JOIN', clientId: myClientId, name: `Guest ${Math.floor(Math.random() * 1000)}` }); }, 500);
  }, [myClientId, handleNetworkMessage]);

  const createRoom = useCallback(async (cards: Card[]) => {
    setLoading(true); setLoadingMessage('Initializing Room...');
    setFetchedCards(cards);
    const calculatedMax = Math.floor(cards.length / 45);
    const limit = Math.min(16, Math.max(1, calculatedMax));
    setMaxPlayers(limit);
    const id = Math.random().toString(36).substring(7);
    setRoomId(id);
    setInviteLink(`${window.location.origin}/#room=${id}`);
    setIsHost(true);
    setConnectionError(false);
    const hostPlayer: Player = { id: 0, name: "Host (You)", isBot: false, pool: [], clientId: myClientId };
    setConnectedPlayers([hostPlayer]);
    if (channelRef.current) channelRef.current.close();
    const channel = new BroadcastChannel(`draft_room_${id}`);
    channelRef.current = channel;
    channel.onmessage = (event) => { const msg = event.data as NetworkMessage; handleHostNetworkMessage(msg, connectedPlayersRef.current, maxPlayersRef.current); };
    setLoading(false); setLoadingMessage(''); setPhase(GamePhase.LOBBY);
  }, [myClientId, handleHostNetworkMessage]);

  const resetToSetup = useCallback(() => {
      window.history.replaceState(null, '', window.location.pathname);
      if (channelRef.current) { channelRef.current.close(); channelRef.current = null; }
      setRoomId(null); setConnectionError(false); setPhase(GamePhase.SETUP); setFetchedCards([]); setConnectedPlayers([]); setDraftState(null); setIsHost(false);
  }, []);

  const leaveGame = useCallback(() => { 
      channelRef.current?.postMessage({ type: 'LEAVE', clientId: myClientId }); 
      resetToSetup(); 
  }, [myClientId, resetToSetup]);

  const handleExit = useCallback(() => {
      leaveGame();
  }, [leaveGame]);

  const addBot = useCallback(() => {
      if (connectedPlayers.length >= maxPlayers) {
        setNotification("Max players reached based on cube size!");
        return;
      }
      const botNumber = connectedPlayers.length + 1;
      const botPlayer: Player = { id: connectedPlayers.length, name: `Bot ${botNumber}`, isBot: true, pool: [], clientId: `bot-${Date.now()}-${Math.random().toString(36).substr(2, 5)}` };
      const newList = [...connectedPlayers, botPlayer];
      setConnectedPlayers(newList);
      channelRef.current?.postMessage({ type: 'LOBBY_UPDATE', players: newList, hostId: myClientId, maxPlayers: maxPlayers });
  }, [connectedPlayers, maxPlayers, myClientId]);

  const startDraft = useCallback(() => {
    if (connectedPlayers.length < 2) {
        setNotification("At least 2 players are required to start!");
        return;
    }
    
    setLoading(true); 
    setLoadingMessage('Generating packs...');

    setTimeout(() => {
        try {
            const requiredCards = connectedPlayers.length * 3 * 15;
            if (fetchedCards.length < requiredCards) console.warn(`Cube too small! Found ${fetchedCards.length} cards.`);

            const packs = generatePacks(fetchedCards, connectedPlayers.length, 3, 15);
            const playersWithIds = connectedPlayers.map((p, idx) => ({ ...p, id: idx }));
            
            const initialState: DraftState = { 
                isActive: true, 
                round: 1, 
                packSize: 15, 
                players: playersWithIds, 
                packs, 
                currentPackIndex: Array(connectedPlayers.length).fill(0), 
                direction: 'left', 
                isFinished: false, 
                waitingForPlayers: false 
            };

            setDraftState(initialState);
            channelRef.current?.postMessage({ type: 'START_GAME', state: initialState });
            setPhase(GamePhase.DRAFT);
        } catch (e: any) {
            console.error("Error starting draft:", e);
            setNotification("Failed to start draft: " + e.message);
        } finally {
            setLoading(false); 
            setLoadingMessage('');
        }
    }, 50);

  }, [connectedPlayers, fetchedCards]);

  const handleLocalPick = (card: Card) => {
      if (!draftState) return;
      if (!isHost) {
          const newState = { ...draftState };
          const myPlayer = newState.players.find(p => p.clientId === myClientId);
          if (myPlayer) myPlayer.hasPicked = true;
          setDraftState(newState);
          channelRef.current?.postMessage({ type: 'PICK_CARD', clientId: myClientId, cardId: card.id });
          return;
      }
      setDraftState(prevState => {
          if (!prevState) return null;
          const newState = JSON.parse(JSON.stringify(prevState));
          
          const hostPlayerIdx = 0;
          const packIdx = newState.currentPackIndex[0];
          
          if (!newState.packs[0][packIdx]) return prevState;
          
          const pack = newState.packs[0][packIdx];
          if (!pack.find((c: Card) => c.id === card.id)) return prevState;
          
          newState.packs[0][packIdx] = pack.filter((c: Card) => c.id !== card.id);
          newState.players[hostPlayerIdx].pool.push(card);
          newState.players[hostPlayerIdx].hasPicked = true;
          
          return processTurn(newState);
      });
  };

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#room=')) joinRoom(hash.split('=')[1]);
  }, [joinRoom]);

  useEffect(() => {
      if (notification) { const timer = setTimeout(() => { setNotification(null); }, 5000); return () => clearTimeout(timer); }
  }, [notification, setNotification]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { if (phase !== GamePhase.SETUP) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [phase]);

  return {
      phase,
      draftState,
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
      resetToSetup
  };
};