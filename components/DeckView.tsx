
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DraftState, Card } from '../types';
import { enrichCardData } from '../services/cubeService';
import { useModal } from './ModalSystem';

// Modular Components
import DeckHeader from './deck/DeckHeader';
import SideboardBar from './deck/SideboardBar';
import ZoomOverlay from './deck/ZoomOverlay';
import ExportModal from './deck/ExportModal';
import NormalColumnView from './deck/views/NormalColumnView';
import MatrixView from './deck/views/MatrixView';
import CardImage from './CardImage';

interface DeckViewProps {
  draftState: DraftState;
  onProceed: () => void;
  myClientId: string;
}

interface ColumnData {
  id: string;
  title: string;
  cards: Card[];
}

interface DragStateInfo {
  card: Card; // The primary card being dragged (under cursor)
  movingCardIds: string[]; // List of all IDs being moved (primary + selected)
  sourceType: 'col' | 'sb';
  sourceContainerId: string;
}

interface SelectionBox {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
}

type MatrixMode = 'none' | 'color' | 'type';

const COLORS_ORDER = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless', 'Land'];
const TYPES_ORDER = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Other'];
const CMC_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7+'];
const STACK_OFFSET = 35; // Must match the offset in NormalColumnView

const DeckView: React.FC<DeckViewProps> = ({ draftState, onProceed, myClientId }) => {
  const [isStackedView, setIsStackedView] = useState(true); 
  const [matrixMode, setMatrixMode] = useState<MatrixMode>('none');
  const [loading, setLoading] = useState(true);
  const [columns, setColumns] = useState<ColumnData[]>([]);
  const [sideboard, setSideboard] = useState<Card[]>([]);
  const [showLandPicker, setShowLandPicker] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sideboardHeight, setSideboardHeight] = useState(200);
  const [isResizingSideboard, setIsResizingSideboard] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  
  // Selection State
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const initialSelectionRef = useRef<Set<string>>(new Set()); // For Shift/Ctrl appending logic
  const selectionScopeRef = useRef<'main' | 'sb'>('main'); // Tracks where the marquee started

  // UI Refs
  const landPickerRef = useRef<HTMLDivElement>(null);
  const landButtonRef = useRef<HTMLButtonElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null); 
  const sideboardScrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null); // Main container for selection coordinates
  
  // Drag and Drop state (Pointer based)
  const [dragging, setDragging] = useState<DragStateInfo | null>(null);
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);
  const [zoomedCard, setZoomedCard] = useState<Card | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const longPressTimer = useRef<number | null>(null);
  const startPos = useRef({ x: 0, y: 0 });
  
  // Manual Scroll & Inertia State
  const activeScrollRef = useRef<HTMLElement | null>(null); // Tracks WHICH container is being scrolled
  const startScrollPos = useRef({ x: 0, y: 0 });
  const isScrollingRef = useRef(false);
  
  // Physics / Inertia Refs
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastMoveTimeRef = useRef(0);
  const lastMovePosRef = useRef({ x: 0, y: 0 });
  const inertiaRafRef = useRef<number | null>(null);
  
  // Click Blocking Ref (prevents zoom after drag)
  const ignoreClickRef = useRef(false);

  // Auto-scroll animation frame (for dragging near edges)
  const autoScrollRaf = useRef<number | null>(null);
  
  // Logic Refs for Drag/Select
  const clickStartRef = useRef<{x: number, y: number, time: number} | null>(null);
  const pendingDragRef = useRef<{ card: Card, source: 'col' | 'sb', containerId: string } | null>(null);
  const isMarqueeSelectingRef = useRef(false);

  const myPlayer = draftState.players.find(p => p.clientId === myClientId);
  const { showConfirm } = useModal();
  const isMatrixView = matrixMode !== 'none';

  // Refs for history management
  const columnsRef = useRef(columns);
  const sideboardRef = useRef(sideboard);
  useEffect(() => { columnsRef.current = columns; }, [columns]);
  useEffect(() => { sideboardRef.current = sideboard; }, [sideboard]);

  // --- HISTORY MANAGEMENT FOR ZOOM ---
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
        const state = e.state || {};
        if (state.zoomedCardId) {
            // Restore zoom from history state
            let card: Card | undefined = undefined;
            // Search in Sideboard
            card = sideboardRef.current.find(c => c.id === state.zoomedCardId);
            if (!card) {
                // Search in Columns
                for (const col of columnsRef.current) {
                    card = col.cards.find(c => c.id === state.zoomedCardId);
                    if (card) break;
                }
            }
            if (card) setZoomedCard(card);
            else setZoomedCard(null); // Invalid ID or removed
        } else {
            // No zoom in state, ensure closed
            setZoomedCard(null);
        }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // --- AUTO SCROLL LOGIC (Only when Dragging) ---
  useEffect(() => {
    if (!dragging) {
      if (autoScrollRaf.current) cancelAnimationFrame(autoScrollRaf.current);
      return;
    }

    const performAutoScroll = () => {
        if (!dragging) return;

        const SCROLL_THRESHOLD = 80; // Distance from edge to start scrolling
        const MAX_SPEED = 15; // Max scroll speed per frame

        // 1. Scroll Main Container (Vertical & Horizontal)
        if (scrollContainerRef.current) {
            const rect = scrollContainerRef.current.getBoundingClientRect();
            
            // Vertical Scroll
            if (pointerPos.y < rect.top + SCROLL_THRESHOLD) {
                // Scroll Up
                const intensity = (rect.top + SCROLL_THRESHOLD - pointerPos.y) / SCROLL_THRESHOLD;
                scrollContainerRef.current.scrollTop -= intensity * MAX_SPEED;
            } else if (pointerPos.y > rect.bottom - SCROLL_THRESHOLD) {
                // Scroll Down
                const intensity = (pointerPos.y - (rect.bottom - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
                scrollContainerRef.current.scrollTop += intensity * MAX_SPEED;
            }

            // Horizontal Scroll (if main container scrolls horizontally)
            if (pointerPos.x < rect.left + SCROLL_THRESHOLD) {
                 const intensity = (rect.left + SCROLL_THRESHOLD - pointerPos.x) / SCROLL_THRESHOLD;
                 scrollContainerRef.current.scrollLeft -= intensity * MAX_SPEED;
            } else if (pointerPos.x > rect.right - SCROLL_THRESHOLD) {
                 const intensity = (pointerPos.x - (rect.right - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
                 scrollContainerRef.current.scrollLeft += intensity * MAX_SPEED;
            }
        }

        // 2. Scroll Sideboard (Horizontal)
        if (sideboardScrollRef.current) {
            const sbRect = sideboardScrollRef.current.getBoundingClientRect();
            // Only scroll sideboard if pointer is vertically within the sideboard area
            if (pointerPos.y >= sbRect.top && pointerPos.y <= sbRect.bottom) {
                if (pointerPos.x < sbRect.left + SCROLL_THRESHOLD) {
                    const intensity = (sbRect.left + SCROLL_THRESHOLD - pointerPos.x) / SCROLL_THRESHOLD;
                    sideboardScrollRef.current.scrollLeft -= intensity * MAX_SPEED;
                } else if (pointerPos.x > sbRect.right - SCROLL_THRESHOLD) {
                    const intensity = (pointerPos.x - (sbRect.right - SCROLL_THRESHOLD)) / SCROLL_THRESHOLD;
                    sideboardScrollRef.current.scrollLeft += intensity * MAX_SPEED;
                }
            }
        }

        autoScrollRaf.current = requestAnimationFrame(performAutoScroll);
    };

    autoScrollRaf.current = requestAnimationFrame(performAutoScroll);

    return () => {
        if (autoScrollRaf.current) cancelAnimationFrame(autoScrollRaf.current);
    };
  }, [dragging, pointerPos]);

  // Clean up inertia RAF on unmount
  useEffect(() => {
    return () => {
        if (inertiaRafRef.current) cancelAnimationFrame(inertiaRafRef.current);
    };
  }, []);

  // Ensure there is always exactly one free column on the right
  useEffect(() => {
    if (loading) return;
    
    setColumns(prev => {
        // 1. If empty, initialize
        if (prev.length === 0) {
            return [{ id: `col-${Date.now()}-${Math.random()}`, title: '', cards: [] }];
        }

        const lastCol = prev[prev.length - 1];
        
        // 2. If last column has data, append new empty column
        if (lastCol.cards.length > 0) {
            return [...prev, { id: `col-${Date.now()}-${Math.random()}`, title: '', cards: [] }];
        }

        // 3. If last column is empty, check if we have excess empty columns
        if (lastCol.cards.length === 0) {
            // Need at least 2 columns to determine if we have "excess" empty ones at the end
            if (prev.length > 1) {
                const secondToLast = prev[prev.length - 2];
                // If the one before the last is ALSO empty, remove the last one.
                // This will run recursively on subsequent renders until only 1 empty remains.
                if (secondToLast.cards.length === 0) {
                    return prev.slice(0, -1);
                }
            }
        }
        
        return prev;
    });
  }, [columns, loading]);

  // Data Loading
  useEffect(() => {
    const loadData = async () => {
      if (!myPlayer) { setLoading(false); return; }
      
      // Use what is currently in the global state to initialize
      const currentMain = myPlayer.pool || [];
      const currentSide = myPlayer.sideboard || [];
      
      const hasMain = currentMain.length > 0;
      const hasSide = currentSide.length > 0;

      if (hasMain || hasSide) {
        setLoading(true);
        try {
            if (hasMain) {
              const enrichedPool = await enrichCardData(currentMain);
              organizeCards(enrichedPool, 'cmc');
            }
            if (hasSide) {
              const enrichedSideboard = await enrichCardData(currentSide);
              setSideboard(enrichedSideboard);
            }
        } catch (e) {
            if (hasMain) organizeCards(currentMain, 'cmc');
            if (hasSide) setSideboard(currentSide);
        } finally { setLoading(false); }
      } else setLoading(false);
    };
    loadData();
  }, [myPlayer?.clientId]);

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as Node;
        
        if (showLandPicker && landPickerRef.current && !landPickerRef.current.contains(target) && 
            landButtonRef.current && !landButtonRef.current.contains(target)) {
            setShowLandPicker(false);
        }
        if (isSortMenuOpen && sortMenuRef.current && !sortMenuRef.current.contains(target)) {
            setIsSortMenuOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showLandPicker, isSortMenuOpen]);

  // Sideboard resizing logic
  useEffect(() => {
    if (!isResizingSideboard) return;
    const handleMove = (e: PointerEvent) => {
        const newHeight = window.innerHeight - e.clientY;
        setSideboardHeight(Math.max(120, Math.min(window.innerHeight * 0.7, newHeight)));
    };
    const handleUp = () => setIsResizingSideboard(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
    };
  }, [isResizingSideboard]);

  const showToast = (msg: string) => { setToastMessage(msg); setTimeout(() => setToastMessage(null), 3000); };

  const syncToGlobalState = useCallback((newColumns: ColumnData[], newSideboard: Card[]) => {
      if (!myPlayer) return;
      
      // Flatten columns to get mainboard
      const mainboard = newColumns.flatMap(col => col.cards);
      
      // Update the reference in global state directly
      // This ensures that if the component re-renders or re-mounts, it has the latest data
      myPlayer.pool = mainboard;
      myPlayer.sideboard = newSideboard;
  }, [myPlayer]);

  const organizeCards = useCallback((cards: Card[], mode: 'cmc' | 'color' | 'type') => {
    let newColumns: ColumnData[] = [];
    if (mode === 'cmc') {
      const buckets: Record<string, Card[]> = { 'Land': [], '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '7+': [] };
      cards.forEach(card => {
        if (card.type_line?.toLowerCase().includes('land')) buckets['Land'].push(card);
        else { const cmc = card.cmc || 0; if (cmc >= 7) buckets['7+'].push(card); else buckets[cmc.toString()].push(card); }
      });
      const order = ['Land', '0', '1', '2', '3', '4', '5', '6', '7+'];
      newColumns = order.map(key => ({ id: key, title: '', cards: buckets[key].sort((a, b) => a.name.localeCompare(b.name)) }));
    } else if (mode === 'type') {
      const buckets: Record<string, Card[]> = { 'Creature': [], 'Planeswalker': [], 'Instant': [], 'Sorcery': [], 'Enchantment': [], 'Artifact': [], 'Land': [], 'Other': [] };
      cards.forEach(card => {
        const tl = card.type_line?.toLowerCase() || '';
        if (tl.includes('creature')) buckets['Creature'].push(card);
        else if (tl.includes('planeswalker')) buckets['Planeswalker'].push(card);
        else if (tl.includes('instant')) buckets['Instant'].push(card);
        else if (tl.includes('sorcery')) buckets['Sorcery'].push(card);
        else if (tl.includes('enchantment')) buckets['Enchantment'].push(card);
        else if (tl.includes('artifact')) buckets['Artifact'].push(card);
        else if (tl.includes('land')) buckets['Land'].push(card);
        else buckets['Other'].push(card);
      });
      newColumns = TYPES_ORDER.map(key => ({ id: key, title: '', cards: buckets[key] })).filter(col => col.cards.length > 0);
    } else {
      const buckets: Record<string, Card[]> = { 'Land': [], 'White': [], 'Blue': [], 'Black': [], 'Red': [], 'Green': [], 'Multicolor': [], 'Colorless': [] };
      cards.forEach(card => {
        if (card.type_line?.toLowerCase().includes('land')) buckets['Land'].push(card);
        else if (!card.colors || card.colors.length === 0) buckets['Colorless'].push(card);
        else if (card.colors.length > 1) buckets['Multicolor'].push(card);
        else { const colorMap: Record<string, string> = { 'W': 'White', 'U': 'Blue', 'B': 'Black', 'R': 'Red', 'G': 'Green' }; buckets[colorMap[card.colors[0]] || 'Colorless'].push(card); }
      });
      const order = ['Land', 'White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless'];
      // Filter out empty columns when organizing by color
      newColumns = order.map(key => ({ id: key, title: '', cards: buckets[key].sort((a, b) => (a.cmc || 0) - (b.cmc || 0)) })).filter(col => col.cards.length > 0);
    }
    setColumns(newColumns);
  }, []);

  const handleShareDeck = useCallback(async () => {
    const mainboardNames = columns.flatMap(c => c.cards.map(card => card.name));
    const sideboardNames = sideboard.map(card => card.name);

    if (mainboardNames.length === 0 && sideboardNames.length === 0) {
        showToast("Deck is empty, nothing to share.");
        return;
    }

    const payload = JSON.stringify({ m: mainboardNames, s: sideboardNames });
    
    try {
        const encoded = btoa(unescape(encodeURIComponent(payload)));
        const longUrl = `${window.location.origin}${window.location.pathname}?deck=${encoded}`;
        
        showToast("Generating link...");

        try {
            // Using is.gd via AllOrigins proxy to ensure reliable CORS support
            const isGdApiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`;
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(isGdApiUrl)}`;
            
            const response = await fetch(proxyUrl);
            if (response.ok) {
                const shortUrl = await response.text();
                if (shortUrl.startsWith('http')) {
                    await navigator.clipboard.writeText(shortUrl);
                    showToast("Short link copied (is.gd)!");
                    return;
                }
            }
        } catch (e) {
            console.warn("Shortener failed, falling back to long URL");
        }

        // Fallback to Long URL
        await navigator.clipboard.writeText(longUrl);
        showToast("Link copied (Shortener unavailable)");

    } catch (e) {
        console.error("Error encoding deck for share:", e);
        showToast("Error generating share link.");
    }
  }, [columns, sideboard]);

  const executeCardMove = useCallback((movingIds: string[], targetColId: string, targetIndex?: number) => {
      if (isMatrixView || movingIds.length === 0) return;
      
      // Batch state update helpers
      let newColumns = [...columns];
      let newSideboard = [...sideboard];
      const movedCards: Card[] = [];

      // 1. Gather all card objects and remove them from their source
      movingIds.forEach(id => {
          // Check Sideboard
          const sbIndex = newSideboard.findIndex(c => c.id === id);
          if (sbIndex !== -1) {
              movedCards.push(newSideboard[sbIndex]);
              newSideboard.splice(sbIndex, 1);
              return; // Found in sideboard, next ID
          }

          // Check Columns
          for (let i = 0; i < newColumns.length; i++) {
              const col = newColumns[i];
              const cIndex = col.cards.findIndex(c => c.id === id);
              if (cIndex !== -1) {
                  movedCards.push(col.cards[cIndex]);
                  // Need to clone the column cards array to avoid mutation issues if we modify it multiple times
                  const newCards = [...col.cards];
                  newCards.splice(cIndex, 1);
                  newColumns[i] = { ...col, cards: newCards };
                  return; // Found in this column, next ID
              }
          }
      });

      if (movedCards.length === 0) return;

      // 2. Validate Move (e.g. Basic Lands to Sideboard)
      const hasBasicLand = movedCards.some(c => c.type_line?.includes('Basic Land'));
      if (targetColId === 'SIDEBOARD' && hasBasicLand) {
          showToast("Cannot move Basic Lands to Sideboard!");
          return;
      }

      // 3. Insert into Target
      if (targetColId === 'SIDEBOARD') {
          let insertAt = targetIndex !== undefined ? targetIndex : newSideboard.length;
          // Clamp index
          insertAt = Math.max(0, Math.min(insertAt, newSideboard.length));
          newSideboard.splice(insertAt, 0, ...movedCards);
      } else {
          // Find target column
          const colIndex = newColumns.findIndex(c => c.id === targetColId);
          if (colIndex !== -1) {
              const targetCol = newColumns[colIndex];
              const newCards = [...targetCol.cards];
              let insertAt = targetIndex !== undefined ? targetIndex : newCards.length;
              insertAt = Math.max(0, Math.min(insertAt, newCards.length));
              newCards.splice(insertAt, 0, ...movedCards);
              newColumns[colIndex] = { ...targetCol, cards: newCards };
          }
      }

      // 4. Commit Updates & Sync to Global State
      setColumns(newColumns);
      setSideboard(newSideboard);
      syncToGlobalState(newColumns, newSideboard);
      
      // Clear selection after move
      setSelectedCardIds(new Set());

  }, [columns, sideboard, isMatrixView, syncToGlobalState]);

  const updateLandCount = useCallback((type: string, delta: number) => {
    // We need to access the LATEST state to perform the update correctly
    let nextColumns = [...columns];
    
    if (delta > 0) {
      const newLand: Card = {
        id: `land-${Math.random().toString(36).substring(2)}-${Date.now()}`,
        name: type,
        type_line: `Basic Land — ${type}`,
        cmc: 0,
        colors: [],
        mana_cost: ""
      };
      
      let updated = false;
      nextColumns = nextColumns.map(col => {
          if (col.id === 'Land') {
              updated = true;
              return { ...col, cards: [...col.cards, newLand].sort((a, b) => a.name.localeCompare(b.name)) };
          }
          return col;
      });
      if (!updated) nextColumns.unshift({ id: 'Land', title: 'Land', cards: [newLand] });
      
    } else {
      nextColumns = nextColumns.map(col => {
        if (col.id === 'Land') {
          const idx = col.cards.findIndex(c => c.name === type);
          if (idx !== -1) {
            const newCards = [...col.cards];
            newCards.splice(idx, 1);
            return { ...col, cards: newCards };
          }
        }
        return col;
      });
    }
    
    setColumns(nextColumns);
    syncToGlobalState(nextColumns, sideboard);
    
  }, [columns, sideboard, syncToGlobalState]);

  const handleExitClick = () => {
    showConfirm(
      "Exit Session?",
      <div className="space-y-2">
          <p>You are about to leave the active session.</p>
          <p className="text-sm text-slate-400">This will disconnect you from the room and your draft progress may be lost.</p>
      </div>,
      onProceed
    );
  };

  const getCardById = useCallback((id: string) => {
      // Check Columns
      for (const col of columns) {
          const card = col.cards.find(c => c.id === id);
          if (card) return card;
      }
      // Check Sideboard
      return sideboard.find(c => c.id === id);
  }, [columns, sideboard]);

  const totalMainDeck = useMemo(() => columns.reduce((acc, col) => acc + col.cards.length, 0), [columns]);

  const handleCardClick = useCallback((card: Card) => {
    // Push state for history back button support
    window.history.pushState({ zoomedCardId: card.id }, '');
    setZoomedCard(card);
  }, []);

  const handlePointerDown = (e: React.PointerEvent, card: Card, source: 'col' | 'sb', containerId: string) => {
      if (!e.isPrimary || e.button !== 0) return;
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      clickStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      pendingDragRef.current = { card, source, containerId };
      
      const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
      if (isMulti) {
        // Toggle selection immediately for multi-select
        const newSet = new Set(selectedCardIds);
        if (newSet.has(card.id)) newSet.delete(card.id);
        else newSet.add(card.id);
        setSelectedCardIds(newSet);
      } else if (!selectedCardIds.has(card.id)) {
        // If clicking on an unselected card without modifiers, select it (but defer clearing others until move/up)
        // For simple UX, let's select it now visually
        // setSelectedCardIds(new Set([card.id])); // Deferred to UP or DRAG to allow marquee deselect logic if needed?
        // Actually standard behavior is select on down.
        // But if we are dragging a group, we shouldn't deselect others on down.
      }
  };

  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
      if (!e.isPrimary || e.button !== 0) return;
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      
      clickStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      isMarqueeSelectingRef.current = true;
      
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
          setSelectedCardIds(new Set());
      }
      initialSelectionRef.current = new Set(selectedCardIds);
      
      setSelectionBox({ 
          startX: e.clientX, 
          startY: e.clientY, 
          currentX: e.clientX, 
          currentY: e.clientY 
      });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      setPointerPos({ x: e.clientX, y: e.clientY });

      // Handle Marquee
      if (isMarqueeSelectingRef.current && selectionBox) {
          setSelectionBox(prev => prev ? ({ ...prev, currentX: e.clientX, currentY: e.clientY }) : null);
          return;
      }

      // Handle Drag Start
      if (pendingDragRef.current && clickStartRef.current && !dragging) {
          const dx = e.clientX - clickStartRef.current.x;
          const dy = e.clientY - clickStartRef.current.y;
          if (dx*dx + dy*dy > 25) { // 5px threshold
              // Start Dragging
              const { card, source, containerId } = pendingDragRef.current;
              
              let idsToMove = [card.id];
              // If dragging a selected card, move all selected
              if (selectedCardIds.has(card.id)) {
                  idsToMove = Array.from(selectedCardIds);
              } else {
                  // If dragging unselected, clear selection and select this one
                  setSelectedCardIds(new Set([card.id]));
              }

              setDragging({
                  card,
                  movingCardIds: idsToMove,
                  sourceType: source,
                  sourceContainerId: containerId
              });
              pendingDragRef.current = null;
          }
      }

      // Handle Active Dragging
      if (dragging) {
          const elements = document.elementsFromPoint(e.clientX, e.clientY);
          const dropTarget = elements.find(el => el.hasAttribute('data-drop-id'));
          const targetId = dropTarget?.getAttribute('data-drop-id') || null;
          if (targetId !== activeDropTarget) {
              setActiveDropTarget(targetId);
          }
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      // Marquee End
      if (isMarqueeSelectingRef.current) {
          isMarqueeSelectingRef.current = false;
          setSelectionBox(null);
          clickStartRef.current = null;
          return;
      }

      // Drag End
      if (dragging) {
          if (activeDropTarget) {
              // Simple append for now
              executeCardMove(dragging.movingCardIds, activeDropTarget);
          }
          setDragging(null);
          setActiveDropTarget(null);
      } else if (pendingDragRef.current) {
          // Click on Card (no drag)
          const { card } = pendingDragRef.current;
          const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
          if (!isMulti) {
             setSelectedCardIds(new Set([card.id]));
          }
      }

      pendingDragRef.current = null;
      clickStartRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
      setDragging(null);
      setActiveDropTarget(null);
      pendingDragRef.current = null;
      clickStartRef.current = null;
      isMarqueeSelectingRef.current = false;
      setSelectionBox(null);
  };
  
  const matrixData = useMemo(() => {
        const rows: Record<string, Record<string, Card[]>> = {};
        const rowKeys = matrixMode === 'color' ? COLORS_ORDER : TYPES_ORDER;
        
        rowKeys.forEach(key => {
            rows[key] = {};
            CMC_ORDER.forEach(cmc => rows[key][cmc] = []);
        });

        const allCards = columns.flatMap(c => c.cards);

        allCards.forEach(card => {
             // Determine Row
             let rowKey = 'Other';
             if (matrixMode === 'color') {
                 if (card.type_line?.toLowerCase().includes('land')) rowKey = 'Land';
                 else if (!card.colors || card.colors.length === 0) rowKey = 'Colorless';
                 else if (card.colors.length > 1) rowKey = 'Multicolor';
                 else {
                     const map: Record<string, string> = { 'W': 'White', 'U': 'Blue', 'B': 'Black', 'R': 'Red', 'G': 'Green' };
                     rowKey = map[card.colors[0]] || 'Colorless';
                 }
             } else {
                 const t = (card.type_line || '').toLowerCase();
                 if (t.includes('creature')) rowKey = 'Creature';
                 else if (t.includes('planeswalker')) rowKey = 'Planeswalker';
                 else if (t.includes('instant')) rowKey = 'Instant';
                 else if (t.includes('sorcery')) rowKey = 'Sorcery';
                 else if (t.includes('artifact')) rowKey = 'Artifact';
                 else if (t.includes('enchantment')) rowKey = 'Enchantment';
                 else if (t.includes('land')) rowKey = 'Land';
             }

             // Determine Col (CMC)
             let cmcKey = '0';
             const cost = card.cmc || 0;
             if (cost >= 7) cmcKey = '7+';
             else cmcKey = Math.floor(cost).toString();
             
             if (rows[rowKey] && rows[rowKey][cmcKey]) {
                 rows[rowKey][cmcKey].push(card);
             }
        });
        return rows;
    }, [columns, matrixMode]);

    const visibleRows = useMemo(() => {
        const keys = matrixMode === 'color' ? COLORS_ORDER : TYPES_ORDER;
        return keys.filter(key => {
            return CMC_ORDER.some(cmc => matrixData[key]?.[cmc]?.length > 0);
        });
    }, [matrixData, matrixMode]);

  if (loading) return <div className="flex flex-col items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div><p className="text-slate-400">Organizing pool...</p></div>;

  return (
    <div 
        ref={containerRef}
        className="flex flex-col h-full bg-slate-900 overflow-hidden relative select-none"
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        // Prevent default browser drag behaviors
        style={{ touchAction: 'none' }}
    >
      {toastMessage && <div className="absolute bottom-60 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-2xl z-[150] animate-bounce font-bold border border-blue-400 w-max max-w-[90vw] text-center">{toastMessage}</div>}
      
      {showExportModal && (
        <ExportModal onExportDetailed={() => {}} onExportSimple={() => {}} onClose={() => setShowExportModal(false)} />
      )}

      {/* Marquee Selection Box */}
      {selectionBox && (
          <div 
            className="fixed border-2 border-blue-500 bg-blue-500/20 z-[999] pointer-events-none"
            style={{
                left: Math.min(selectionBox.startX, selectionBox.currentX),
                top: Math.min(selectionBox.startY, selectionBox.currentY),
                width: Math.abs(selectionBox.currentX - selectionBox.startX),
                height: Math.abs(selectionBox.currentY - selectionBox.startY),
            }}
          />
      )}

      {/* Ghost Cards Stack - Hardware Accelerated */}
      {dragging && (
        <div 
          className="fixed z-[1000] pointer-events-none will-change-transform"
          style={{ 
              left: pointerPos.x, 
              top: pointerPos.y, 
              // Center the stack under cursor
              transform: 'translate(-50%, -50%)',
              width: '140px'
          }}
        >
          <div className="relative">
             {/* Render stack of moving cards (Limit to 5 for performance) */}
             {dragging.movingCardIds.slice(0, 5).reverse().map((id, index, arr) => {
                 const card = getCardById(id);
                 if (!card) return null;
                 // Calculate reverse index to stack correctly (first item on top)
                 const stackIndex = arr.length - 1 - index; 
                 return (
                     <div 
                        key={id} 
                        className="absolute w-full rounded-xl overflow-hidden shadow-2xl border-2 border-blue-500 bg-slate-900"
                        style={{
                            top: stackIndex * 4,
                            left: stackIndex * 2,
                            zIndex: 10 - stackIndex,
                            transform: `rotate(${(stackIndex % 2 === 0 ? 1 : -1) * stackIndex * 2}deg)`
                        }}
                     >
                         <CardImage name={card.name} hoverEffect={false} />
                     </div>
                 );
             })}
             
             {/* Counter badge if more than visible stack */}
             {dragging.movingCardIds.length > 5 && (
                  <div className="absolute -top-4 -right-4 bg-blue-600 text-white font-black text-xs w-8 h-8 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-xl z-50">
                      +{dragging.movingCardIds.length - 5}
                  </div>
              )}
          </div>
        </div>
      )}

      <DeckHeader 
        matrixMode={matrixMode} setMatrixMode={setMatrixMode}
        isSortMenuOpen={isSortMenuOpen} setIsSortMenuOpen={setIsSortMenuOpen}
        handleSortAction={(m) => { const all = columns.flatMap(c=>c.cards); organizeCards(all, m); setIsSortMenuOpen(false); }}
        showLandPicker={showLandPicker} setShowLandPicker={setShowLandPicker}
        landButtonRef={landButtonRef} landPickerRef={landPickerRef}
        getLandCount={getLandCount}
        updateLandCount={updateLandCount}
        isStackedView={isStackedView} setIsStackedView={setIsStackedView}
        totalMainDeck={totalMainDeck} sideboardCount={sideboard.length}
        onExportClick={() => setShowExportModal(true)} 
        onShareClick={handleShareDeck}
        onExitClick={handleExitClick}
        sortMenuRef={sortMenuRef}
      />

      <div 
        ref={scrollContainerRef} 
        className={`flex-1 overflow-auto relative p-4 scrollbar-thin ${dragging ? 'touch-none' : ''}`}
        style={{ paddingBottom: isMatrixView ? '0' : `${sideboardHeight}px` }}
      >
         {matrixMode === 'none' ? (
            <NormalColumnView 
                columns={columns} isStackedView={isStackedView}
                activeDropTarget={activeDropTarget}
                dragGhostActive={!!dragging}
                dragGhostCardId={dragging?.card.id}
                nativeDraggingId={null}
                setZoomedCard={handleCardClick} setActiveDropTarget={setActiveDropTarget}
                handleDragStart={()=>{}} handleDragEnd={()=>{}}
                handleDropOnCard={()=>{}} handleDragOver={(e)=>e.preventDefault()}
                handleDropOnColumn={()=>{}} handleDragOverContainer={(e)=>e.preventDefault()}
                handleTouchStart={()=>{}} handleTouchMove={()=>{}} handleTouchEnd={()=>{}}
                onPointerDown={handlePointerDown}
                selectedCardIds={selectedCardIds}
                movingCardIds={dragging?.movingCardIds}
            />
         ) : (
             <MatrixView 
                matrixData={matrixData}
                visibleRows={visibleRows} cmcOrder={CMC_ORDER}
                getInitial={k=>k[0]} getFullName={k=>k} getColorStyle={(rowKey) => {
                    if (rowKey === 'White') return 'bg-[#f8f6d8] text-slate-900';
                    if (rowKey === 'Blue') return 'bg-[#0e68ab] text-white';
                    if (rowKey === 'Black') return 'bg-[#150b00] text-white';
                    if (rowKey === 'Red') return 'bg-[#d3202a] text-white';
                    if (rowKey === 'Green') return 'bg-[#00733e] text-white';
                    if (rowKey === 'Land') return 'bg-amber-800 text-white';
                    if (rowKey === 'Multicolor') return 'bg-gradient-to-br from-yellow-400 via-red-500 to-blue-600 text-white';
                    return 'bg-slate-400 text-slate-900';
                }}
                emptyMessage="Review in Pool view to reorganize."
                activeTooltip={activeTooltip} setActiveTooltip={setActiveTooltip}
                setZoomedCard={handleCardClick}
             />
         )}
      </div>

      {!isMatrixView && (
        <SideboardBar 
            scrollRef={sideboardScrollRef}
            sideboard={sideboard} sideboardHeight={sideboardHeight}
            startResizingSideboard={(e) => { setIsResizingSideboard(true); e.preventDefault(); }}
            dragGhostActive={!!dragging} dragGhostCardId={dragging?.card.id}
            setZoomedCard={handleCardClick}
            handleDragStart={()=>{}} handleDragEnd={()=>{}}
            handleDropOnSideboardCard={()=>{}} handleDragOver={(e)=>e.preventDefault()}
            handleDropOnSideboard={()=>{}} handleDragOverContainer={(e)=>e.preventDefault()}
            handleTouchStart={()=>{}} handleTouchMove={()=>{}} handleTouchEnd={()=>{}}
            onPointerDown={handlePointerDown}
            isDragging={!!dragging}
            selectedCardIds={selectedCardIds}
            movingCardIds={dragging?.movingCardIds}
        />
      )}

      {zoomedCard && <ZoomOverlay card={zoomedCard} onClose={() => window.history.back()} />}
    </div>
  );

  function getLandCount(type: string) {
      return columns.reduce((a,c)=>a+c.cards.filter(card=>card.name===type).length,0);
  }
};

export default DeckView;
