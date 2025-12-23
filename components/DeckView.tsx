
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
  
  const myPlayer = draftState.players.find(p => p.clientId === myClientId);
  const { showConfirm } = useModal();
  const isMatrixView = matrixMode !== 'none';

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
      const hasMain = myPlayer.pool.length > 0;
      const hasSide = (myPlayer.sideboard || []).length > 0;
      if (hasMain || hasSide) {
        setLoading(true);
        try {
            if (hasMain) {
              const enrichedPool = await enrichCardData(myPlayer.pool);
              organizeCards(enrichedPool, 'cmc');
            }
            if (hasSide) {
              const enrichedSideboard = await enrichCardData(myPlayer.sideboard!);
              setSideboard(enrichedSideboard);
            }
        } catch (e) {
            if (hasMain) organizeCards(myPlayer.pool, 'cmc');
            if (hasSide) setSideboard(myPlayer.sideboard!);
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
          // Since we already mutated local 'newColumns'/'newSideboard', just returning here would desync.
          // In React, since we haven't called setColumns/setSideboard, simply returning aborts the update.
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

      // 4. Commit Updates
      setColumns(newColumns);
      setSideboard(newSideboard);
      
      // Clear selection after move
      setSelectedCardIds(new Set());

  }, [columns, sideboard, isMatrixView]);

  const updateLandCount = useCallback((type: string, delta: number) => {
    if (delta > 0) {
      const newLand: Card = {
        id: `land-${Math.random().toString(36).substring(2)}-${Date.now()}`,
        name: type,
        type_line: `Basic Land — ${type}`,
        cmc: 0,
        colors: [],
        mana_cost: ""
      };
      setColumns(prev => {
          let updated = false;
          const res = prev.map(col => {
              if (col.id === 'Land') {
                  updated = true;
                  return { ...col, cards: [...col.cards, newLand].sort((a, b) => a.name.localeCompare(b.name)) };
              }
              return col;
          });
          if (!updated) res.unshift({ id: 'Land', title: 'Land', cards: [newLand] });
          return res;
      });
    } else {
      setColumns(prev => prev.map(col => {
        if (col.id === 'Land') {
          const idx = col.cards.findIndex(c => c.name === type);
          if (idx !== -1) {
            const newCards = [...col.cards];
            newCards.splice(idx, 1);
            return { ...col, cards: newCards };
          }
        }
        return col;
      }));
    }
  }, []);

  const matrixData = useMemo(() => {
    if (matrixMode === 'none') return {} as Record<string, Record<string, Card[]>>;
    const data: Record<string, Record<string, Card[]>> = {};
    const rows = matrixMode === 'color' ? COLORS_ORDER : TYPES_ORDER;
    rows.forEach(r => { data[r] = {}; CMC_ORDER.forEach(cmc => { data[r][cmc] = []; }); });

    const allCards = columns.flatMap(c => c.cards);
    allCards.forEach(card => {
        let row = 'Other';
        if (matrixMode === 'color') {
            if (card.type_line?.toLowerCase().includes('land')) row = 'Land';
            else if (!card.colors || card.colors.length === 0) row = 'Colorless';
            else if (card.colors.length > 1) row = 'Multicolor';
            else { const colorMap: Record<string, string> = { 'W': 'White', 'U': 'Blue', 'B': 'Black', 'R': 'Red', 'G': 'Green' }; row = colorMap[card.colors?.[0] || ''] || 'Colorless'; }
        } else {
            const tl = card.type_line?.toLowerCase() || '';
            if (tl.includes('creature')) row = 'Creature';
            else if (tl.includes('planeswalker')) row = 'Planeswalker';
            else if (tl.includes('instant')) row = 'Instant';
            else if (tl.includes('sorcery')) row = 'Sorcery';
            else if (tl.includes('enchantment')) row = 'Enchantment';
            else if (tl.includes('artifact')) row = 'Artifact';
            else if (tl.includes('land')) row = 'Land';
        }
        let cmc = '0';
        if (card.type_line?.toLowerCase().includes('land')) cmc = '0';
        else { const val = card.cmc || 0; if (val >= 7) cmc = '7+'; else cmc = Math.floor(val).toString(); }
        if (data[row] && data[row][cmc]) data[row][cmc].push(card);
    });
    return data;
  }, [columns, matrixMode]);

  const visibleRows = useMemo(() => {
    if (matrixMode === 'none') return [];
    const rows = matrixMode === 'color' ? COLORS_ORDER : TYPES_ORDER;
    return rows.filter(r => {
        if (!matrixData[r]) return false;
        return Object.values(matrixData[r]).some(arr => (arr as Card[]).length > 0);
    });
  }, [matrixData, matrixMode]);

  // Handle Zoom Trigger safely
  const handleCardClick = (card: Card) => {
      if (ignoreClickRef.current) return;
      // In Multi-select mode, plain click zooms, but we also ensure standard interaction.
      // If user wants to select, they used Ctrl or are dragging.
      setZoomedCard(card);
  };

  // BACKGROUND SELECTION (MARQUEE) HANDLER
  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
    // Only handle if clicking directly on the background (not cards or buttons)
    if (dragging || isSortMenuOpen || showLandPicker) return;
    if (e.pointerType !== 'mouse' || e.button !== 0) return;

    // Check if clicked element is actually a background element (approximated by not having specific data attributes)
    const target = e.target as HTMLElement;
    if (target.closest('[data-card-id]') || target.closest('button')) return;

    // DETECT SCOPE: Is start point inside sideboard?
    const isSideboard = !!target.closest('[data-drop-id="SIDEBOARD"]');
    selectionScopeRef.current = isSideboard ? 'sb' : 'main';

    // If not holding shift/ctrl, clear selection, but prepare to add if dragging starts
    if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        initialSelectionRef.current = new Set();
        // We delay clearing selectedCardIds until PointerUp if it was just a click, 
        // OR we clear it immediately if we want fresh selection.
        // Let's clear immediately for intuitive behavior on click-to-deselect.
        setSelectedCardIds(new Set());
    } else {
        // Keep existing selection as base
        initialSelectionRef.current = new Set(selectedCardIds);
    }

    setSelectionBox({
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY
    });
    
    // Capture pointer to track outside window
    target.setPointerCapture(e.pointerId);
    e.preventDefault();
  };


  // UNIFIED POINTER DND LOGIC
  const handlePointerDown = (e: React.PointerEvent, card: Card, source: 'col' | 'sb', containerId: string) => {
    if (isMatrixView || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    
    // Stop any active inertia
    if (inertiaRafRef.current) {
        cancelAnimationFrame(inertiaRafRef.current);
        inertiaRafRef.current = null;
    }

    // Stop selection if one is active
    if (selectionBox) setSelectionBox(null);

    // MULTI-SELECT LOGIC
    // Check if Ctrl/Cmd or Shift key is pressed for multi-selection
    const isMultiSelectModifier = e.ctrlKey || e.metaKey || e.shiftKey;
    
    if (isMultiSelectModifier) {
        e.preventDefault(); // Prevent text selection
        // Toggle selection
        const newSet = new Set(selectedCardIds);
        if (newSet.has(card.id)) {
            newSet.delete(card.id);
        } else {
            newSet.add(card.id);
        }
        setSelectedCardIds(newSet);
        return; // Return early, do not start drag if just selecting
    }

    // Prepare Dragging Payload
    let movingCardIds: string[] = [];
    
    if (selectedCardIds.has(card.id)) {
        // We are dragging a card that is part of the selection -> Drag the whole group
        movingCardIds = Array.from(selectedCardIds);
    } else {
        // We are dragging an unselected card -> Clear selection, drag just this one
        if (selectedCardIds.size > 0) {
             setSelectedCardIds(new Set());
        }
        movingCardIds = [card.id];
    }

    // Initialize state
    startPos.current = { x: e.clientX, y: e.clientY };
    setPointerPos({ x: e.clientX, y: e.clientY });
    
    // Reset Physics Trackers
    lastMoveTimeRef.current = Date.now();
    lastMovePosRef.current = { x: e.clientX, y: e.clientY };
    velocityRef.current = { x: 0, y: 0 };

    // Determine which container is being touched for programmatic scrolling
    if (sideboardScrollRef.current && sideboardScrollRef.current.contains(e.target as Node)) {
        activeScrollRef.current = sideboardScrollRef.current;
        startScrollPos.current = {
            x: sideboardScrollRef.current.scrollLeft,
            y: 0 // Sideboard is horizontal only
        };
    } else if (scrollContainerRef.current) {
        activeScrollRef.current = scrollContainerRef.current;
        startScrollPos.current = {
            x: scrollContainerRef.current.scrollLeft,
            y: scrollContainerRef.current.scrollTop
        };
    } else {
        activeScrollRef.current = null;
    }
    
    isScrollingRef.current = false;

    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);

    const target = e.currentTarget as HTMLElement;
    const pointerId = e.pointerId;

    try { target.setPointerCapture(pointerId); } catch (err) {}

    const dragState: DragStateInfo = { 
        card, 
        movingCardIds,
        sourceType: source, 
        sourceContainerId: containerId 
    };

    // Check Pointer Type: Mouse = Instant Drag; Touch = Long Press
    if (e.pointerType === 'mouse') {
        setDragging(dragState);
    } else {
        longPressTimer.current = window.setTimeout(() => {
            if (!isScrollingRef.current) {
                setDragging(dragState);
                if (navigator.vibrate) navigator.vibrate(40);
            }
            longPressTimer.current = null;
        }, 250); 
    }
  };

  const updateSelection = (box: SelectionBox) => {
      // Calculate rect for selection box
      const left = Math.min(box.startX, box.currentX);
      const top = Math.min(box.startY, box.currentY);
      const right = Math.max(box.startX, box.currentX);
      const bottom = Math.max(box.startY, box.currentY);

      // Simple optimization: don't query if box is tiny
      if (right - left < 5 && bottom - top < 5) return;

      const newSelection = new Set(initialSelectionRef.current);
      
      // Get all card elements
      const cardElements = document.querySelectorAll('[data-card-id]');
      
      cardElements.forEach((el) => {
          // SCOPE CHECK: Filter cards based on where selection started
          const isInSideboard = !!el.closest('[data-drop-id="SIDEBOARD"]');
          if (selectionScopeRef.current === 'main' && isInSideboard) return;
          if (selectionScopeRef.current === 'sb' && !isInSideboard) return;

          const rect = el.getBoundingClientRect();
          
          let effectiveBottom = rect.bottom;
          
          // If in stacked view and this is a mainboard column card
          // we need to check if it's covered by another card
          if (isStackedView) {
              const isColumnCard = el.closest('[data-drop-id]') && !el.closest('[data-drop-id="SIDEBOARD"]');
              if (isColumnCard) {
                  // In NormalColumnView, subsequent cards are DOM siblings rendered later
                  const nextSibling = el.nextElementSibling;
                  // If there is a next sibling with a card-id, this card is partially covered
                  if (nextSibling && nextSibling.hasAttribute('data-card-id')) {
                      effectiveBottom = rect.top + STACK_OFFSET;
                  }
              }
          }

          // Check Intersection with effective area
          // Box overlaps Rect if:
          // Box.Left < Rect.Right && Box.Right > Rect.Left && Box.Top < Rect.Bottom && Box.Bottom > Rect.Top
          const intersect = !(
              rect.right < left || 
              rect.left > right || 
              effectiveBottom < top || 
              rect.top > bottom
          );
          
          if (intersect) {
              const id = el.getAttribute('data-card-id');
              if (id) newSelection.add(id);
          }
      });
      
      setSelectedCardIds(newSelection);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const x = e.clientX;
    const y = e.clientY;
    
    // --- MARQUEE SELECTION LOGIC ---
    if (selectionBox) {
        setSelectionBox(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
        updateSelection({
            ...selectionBox,
            currentX: x,
            currentY: y
        });
        return;
    }

    const now = Date.now();

    if (!dragging) {
        // Track Velocity (Smoothing)
        const dt = now - lastMoveTimeRef.current;
        if (dt > 0) {
            const dxV = x - lastMovePosRef.current.x;
            const dyV = y - lastMovePosRef.current.y;
            // Simple Exponential Moving Average for smoothing
            const newVx = dxV / dt; 
            const newVy = dyV / dt;
            velocityRef.current = {
                x: 0.8 * velocityRef.current.x + 0.2 * newVx,
                y: 0.8 * velocityRef.current.y + 0.2 * newVy
            };
            lastMoveTimeRef.current = now;
            lastMovePosRef.current = { x, y };
        }

        // If not dragging, we check if user wants to scroll or if we are waiting for long press
        if (longPressTimer.current || isScrollingRef.current) {
            const dx = x - startPos.current.x;
            const dy = y - startPos.current.y;
            
            // Check if movement exceeds threshold to start scrolling
            if (!isScrollingRef.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
                // User moved enough, cancel drag timer and start scrolling
                if (longPressTimer.current) {
                    window.clearTimeout(longPressTimer.current);
                    longPressTimer.current = null;
                }
                isScrollingRef.current = true;
            }

            if (isScrollingRef.current && activeScrollRef.current) {
                // Programmatic Scroll (Stick to finger)
                // Use scrollLeft for both, scrollTop only if active is main container (assuming sideboard is horizontal)
                activeScrollRef.current.scrollLeft = startScrollPos.current.x - dx;
                
                // Only Apply Y scrolling if it's the main container (or if sideboard becomes vertical later)
                // Currently SideboardBar is overflow-x-auto overflow-y-hidden
                if (activeScrollRef.current === scrollContainerRef.current) {
                    activeScrollRef.current.scrollTop = startScrollPos.current.y - dy;
                }
            }
        }
        return;
    }

    // --- DRAGGING LOGIC ---
    if (e.cancelable) e.preventDefault();
    setPointerPos({ x, y });

    // Use elementFromPoint to get the visual element directly under the cursor
    const element = document.elementFromPoint(x, y);
    const dropTarget = element?.closest('[data-drop-id]');
    const found = dropTarget?.getAttribute('data-drop-id') || null;

    if (found !== activeDropTarget) setActiveDropTarget(found);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    // End Marquee Selection
    if (selectionBox) {
        setSelectionBox(null);
        return;
    }

    if (longPressTimer.current) {
        window.clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
    }

    // Trigger Inertia if we were scrolling
    if (isScrollingRef.current) {
        startInertia();
    }
    isScrollingRef.current = false;

    if (dragging) {
        // Calculate movement distance to distinguish click from drag
        const dx = Math.abs(e.clientX - startPos.current.x);
        const dy = Math.abs(e.clientY - startPos.current.y);
        const hasMoved = dx > 5 || dy > 5;

        if (hasMoved) {
            // Set flag to ignore the immediate subsequent click event that fires after pointer up
            ignoreClickRef.current = true;
            setTimeout(() => { ignoreClickRef.current = false; }, 50);

            if (activeDropTarget) {
                let dropIndex: number | undefined = undefined;

                // If dropping in Sideboard (Horizontal Scan)
                if (activeDropTarget === 'SIDEBOARD' && sideboardScrollRef.current) {
                    const sbContainer = sideboardScrollRef.current;
                    const cardElements = Array.from(sbContainer.querySelectorAll('[data-sb-card-index]'));
                    const pointerX = e.clientX;
                    
                    let foundIndex = -1;
                    for (let i = 0; i < cardElements.length; i++) {
                        const el = cardElements[i] as HTMLElement;
                        const rect = el.getBoundingClientRect();
                        const centerY = rect.top + (rect.height / 2);
                        const centerX = rect.left + (rect.width / 2);
                        if (pointerX < centerX) {
                            foundIndex = parseInt(el.getAttribute('data-sb-card-index') || '0', 10);
                            break;
                        }
                    }
                    dropIndex = foundIndex !== -1 ? foundIndex : sideboard.length;
                }
                // If dropping in a Main Column (Vertical Scan)
                else if (activeDropTarget !== 'SIDEBOARD') {
                    const colContainer = document.querySelector(`[data-drop-id="${activeDropTarget}"]`);
                    if (colContainer) {
                        const cardElements = Array.from(colContainer.querySelectorAll('[data-col-card-index]'));
                        const pointerY = e.clientY;

                        let foundIndex = -1;
                        for (let i = 0; i < cardElements.length; i++) {
                            const el = cardElements[i] as HTMLElement;
                            const rect = el.getBoundingClientRect();
                            const centerY = rect.top + (rect.height / 2);
                            // For vertical lists, if pointer is above center, insert here
                            if (pointerY < centerY) {
                                foundIndex = parseInt(el.getAttribute('data-col-card-index') || '0', 10);
                                break;
                            }
                        }
                        // If no card was found "below" the pointer, we append to the end.
                        // If we found an index, use it.
                        // Fallback to max length if dropping at very bottom.
                        const targetCol = columns.find(c => c.id === activeDropTarget);
                        dropIndex = foundIndex !== -1 ? foundIndex : (targetCol ? targetCol.cards.length : 0);
                    }
                }

                executeCardMove(
                    dragging.movingCardIds, 
                    activeDropTarget,
                    dropIndex
                );
            }
        }
        setDragging(null);
        setActiveDropTarget(null);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
      setSelectionBox(null);
      if (longPressTimer.current) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
      }
      isScrollingRef.current = false;
      setDragging(null);
      setActiveDropTarget(null);
  };

  const startInertia = () => {
      const friction = 0.95;
      const step = () => {
          if (!activeScrollRef.current) return;

          // Apply Friction
          velocityRef.current.x *= friction;
          velocityRef.current.y *= friction;

          // Stop if velocity is negligible
          if (Math.abs(velocityRef.current.x) < 0.05 && Math.abs(velocityRef.current.y) < 0.05) {
              inertiaRafRef.current = null;
              activeScrollRef.current = null; // Clean up active ref
              return;
          }

          // Apply Velocity (Multiply by ~16ms for per-frame pixel movement)
          activeScrollRef.current.scrollLeft -= velocityRef.current.x * 16;
          
          if (activeScrollRef.current === scrollContainerRef.current) {
              activeScrollRef.current.scrollTop -= velocityRef.current.y * 16;
          }

          inertiaRafRef.current = requestAnimationFrame(step);
      };
      
      // Only start inertia if velocity is significant enough
      if (Math.abs(velocityRef.current.x) > 0.1 || Math.abs(velocityRef.current.y) > 0.1) {
        step();
      } else {
        activeScrollRef.current = null;
      }
  };

  const totalMainDeck = columns.reduce((a,c) => a + c.cards.length, 0);

  // Helper to find card data for ghost rendering
  const getCardById = (id: string) => {
      let c = sideboard.find(x => x.id === id);
      if (c) return c;
      for (const col of columns) {
          c = col.cards.find(x => x.id === id);
          if (c) return c;
      }
      return null;
  };

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
        onExitClick={() => showConfirm("Exit?", "Really leave?", onProceed)}
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

      {zoomedCard && <ZoomOverlay card={zoomedCard} onClose={() => setZoomedCard(null)} />}
    </div>
  );

  function getLandCount(type: string) {
      return columns.reduce((a,c)=>a+c.cards.filter(card=>card.name===type).length,0);
  }
};

export default DeckView;
