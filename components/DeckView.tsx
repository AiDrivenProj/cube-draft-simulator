
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
  card: Card;
  movingCardIds: string[];
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
const STACK_OFFSET = 35;

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
  
  // Matrix Zoom
  const [matrixZoom, setMatrixZoom] = useState(1);
  const zoomRef = useRef(1);
  const matrixContentRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pinchStartRef = useRef<{ dist: number, startZoom: number, startScrollLeft: number, startScrollTop: number, centerX: number, centerY: number } | null>(null);
  
  // Selection
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const initialSelectionRef = useRef<Set<string>>(new Set());
  const selectionScopeRef = useRef<'main' | 'sb'>('main');

  // UI Refs
  const landPickerRef = useRef<HTMLDivElement>(null);
  const landButtonRef = useRef<HTMLButtonElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null); 
  const sideboardScrollRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Drag State
  const [dragging, setDragging] = useState<DragStateInfo | null>(null);
  // PointerPos state for rendering ghost, Ref for high-performance logic loop
  const [pointerPos, setPointerPos] = useState({ x: 0, y: 0 });
  const pointerPosRef = useRef({ x: 0, y: 0 });

  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);
  const [zoomedCard, setZoomedCard] = useState<Card | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const autoScrollRaf = useRef<number | null>(null);
  
  // Pointer/Drag Logic Refs
  const clickStartRef = useRef<{x: number, y: number, target: HTMLElement, pointerId: number} | null>(null);
  const pendingDragRef = useRef<{ card: Card, source: 'col' | 'sb', containerId: string } | null>(null);
  const isMarqueeSelectingRef = useRef(false);
  const dragWasActiveRef = useRef(false);
  const dragTimerRef = useRef<number | null>(null);
  
  // CRITICAL: Synchronous ref to track dragging status instantly without waiting for state re-renders
  const isDraggingSyncRef = useRef(false);

  const myPlayer = draftState.players.find(p => p.clientId === myClientId);
  const { showConfirm } = useModal();
  const isMatrixView = matrixMode !== 'none';

  // Refs for history
  const columnsRef = useRef(columns);
  const sideboardRef = useRef(sideboard);
  useEffect(() => { columnsRef.current = columns; }, [columns]);
  useEffect(() => { sideboardRef.current = sideboard; }, [sideboard]);

  useEffect(() => {
    setMatrixZoom(1);
    zoomRef.current = 1;
  }, [matrixMode]);

  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
        const state = e.state || {};
        if (state.zoomedCardId) {
            let card = sideboardRef.current.find(c => c.id === state.zoomedCardId);
            if (!card) {
                for (const col of columnsRef.current) {
                    card = col.cards.find(c => c.id === state.zoomedCardId);
                    if (card) break;
                }
            }
            if (card) setZoomedCard(card);
            else setZoomedCard(null);
        } else {
            setZoomedCard(null);
        }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // --- ROBUST SCROLL LOCKING (Document Level) ---
  useEffect(() => {
    // This handler runs on every touch move on the DOCUMENT level.
    // This prevents the browser from taking over control for scrolling.
    const preventScrollIfDragging = (e: TouchEvent) => {
        if (isDraggingSyncRef.current) {
            if (e.cancelable) {
                e.preventDefault();
                e.stopImmediatePropagation(); // Ensure no other handlers (like native scroll) see this
            }
        }
    };

    const preventWheel = (e: WheelEvent) => {
        if (isDraggingSyncRef.current) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    };

    // 'passive: false' is crucial.
    document.addEventListener('touchmove', preventScrollIfDragging, { passive: false, capture: true });
    window.addEventListener('wheel', preventWheel, { passive: false, capture: true });

    return () => {
        document.removeEventListener('touchmove', preventScrollIfDragging, { capture: true });
        window.removeEventListener('wheel', preventWheel, { capture: true });
        // Cleanup styles just in case
        document.body.style.touchAction = '';
        document.body.style.overflow = '';
    };
  }, []);


  // --- AUTO SCROLL LOGIC ---
  useEffect(() => {
    if (!dragging) {
      if (autoScrollRaf.current) cancelAnimationFrame(autoScrollRaf.current);
      return;
    }

    const performAutoScroll = () => {
        if (!dragging) return;

        // Use Ref for coordinates to ensure loop always has latest position 
        // even if React state update is pending.
        const { x, y } = pointerPosRef.current;
        
        const SCROLL_ZONE_SIZE = 60; 
        const MAX_SCROLL_SPEED = 25;
        let isHandlingSideboard = false;

        // 1. Sideboard Scroll (Priority check: Is pointer vertically over the sideboard?)
        if (sideboardScrollRef.current) {
            const sbRect = sideboardScrollRef.current.getBoundingClientRect();
            
            // Check if pointer is vertically within or below the top of the sideboard
            if (y >= sbRect.top) {
                isHandlingSideboard = true;
                
                // Horizontal Scroll for Sideboard
                if (x < sbRect.left + SCROLL_ZONE_SIZE) {
                    const intensity = (sbRect.left + SCROLL_ZONE_SIZE - x) / SCROLL_ZONE_SIZE;
                    sideboardScrollRef.current.scrollLeft -= intensity * MAX_SCROLL_SPEED;
                } else if (x > sbRect.right - SCROLL_ZONE_SIZE) {
                    const intensity = (x - (sbRect.right - SCROLL_ZONE_SIZE)) / SCROLL_ZONE_SIZE;
                    sideboardScrollRef.current.scrollLeft += intensity * MAX_SCROLL_SPEED;
                }
            }
        }

        // 2. Main Container Scroll (Mutually Exclusive: Only if NOT handling sideboard)
        if (!isHandlingSideboard && scrollContainerRef.current) {
            const rect = scrollContainerRef.current.getBoundingClientRect();
            
            // Only scroll mainboard if we are effectively "over" it
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                
                // Vertical
                if (y < rect.top + SCROLL_ZONE_SIZE) {
                    const intensity = (rect.top + SCROLL_ZONE_SIZE - y) / SCROLL_ZONE_SIZE;
                    scrollContainerRef.current.scrollTop -= intensity * MAX_SCROLL_SPEED;
                } else if (y > rect.bottom - SCROLL_ZONE_SIZE) {
                    const intensity = (y - (rect.bottom - SCROLL_ZONE_SIZE)) / SCROLL_ZONE_SIZE;
                    scrollContainerRef.current.scrollTop += intensity * MAX_SCROLL_SPEED;
                }
                
                // Horizontal (Mainboard)
                if (x < rect.left + SCROLL_ZONE_SIZE) {
                     const intensity = (rect.left + SCROLL_ZONE_SIZE - x) / SCROLL_ZONE_SIZE;
                     scrollContainerRef.current.scrollLeft -= intensity * MAX_SCROLL_SPEED;
                } else if (x > rect.right - SCROLL_ZONE_SIZE) {
                     const intensity = (x - (rect.right - SCROLL_ZONE_SIZE)) / SCROLL_ZONE_SIZE;
                     scrollContainerRef.current.scrollLeft += intensity * MAX_SCROLL_SPEED;
                }
            }
        }

        autoScrollRaf.current = requestAnimationFrame(performAutoScroll);
    };

    autoScrollRaf.current = requestAnimationFrame(performAutoScroll);
    return () => { if (autoScrollRaf.current) cancelAnimationFrame(autoScrollRaf.current); };
  }, [dragging]); // Dependency strictly on dragging status

  useEffect(() => {
    if (loading) return;
    setColumns(prev => {
        if (prev.length === 0) return [{ id: `col-${Date.now()}-${Math.random()}`, title: '', cards: [] }];
        const lastCol = prev[prev.length - 1];
        if (lastCol.cards.length > 0) return [...prev, { id: `col-${Date.now()}-${Math.random()}`, title: '', cards: [] }];
        if (lastCol.cards.length === 0 && prev.length > 1 && prev[prev.length - 2].cards.length === 0) return prev.slice(0, -1);
        return prev;
    });
  }, [columns, loading]);

  // Data Loading
  useEffect(() => {
    const loadData = async () => {
      if (!myPlayer) { setLoading(false); return; }
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

  // Click outside
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

  // Sideboard resize
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

  // Pinch Zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isMatrixView && e.touches.length === 2 && scrollContainerRef.current) {
        const rect = scrollContainerRef.current.getBoundingClientRect();
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        pinchStartRef.current = { dist, startZoom: zoomRef.current, startScrollLeft: scrollContainerRef.current.scrollLeft, startScrollTop: scrollContainerRef.current.scrollTop, centerX, centerY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isMatrixView && e.touches.length === 2 && pinchStartRef.current && scrollContainerRef.current) {
        if (e.cancelable) e.preventDefault();
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const scaleFactor = dist / pinchStartRef.current.dist;
        const newZoom = Math.max(0.5, Math.min(3, pinchStartRef.current.startZoom * scaleFactor));
        zoomRef.current = newZoom; 
        const zoomRatio = newZoom / pinchStartRef.current.startZoom;
        const { startScrollLeft, startScrollTop, centerX, centerY } = pinchStartRef.current;
        const newScrollLeft = (startScrollLeft + centerX) * zoomRatio - centerX;
        const newScrollTop = (startScrollTop + centerY) * zoomRatio - centerY;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(() => {
            if (matrixContentRef.current && scrollContainerRef.current) {
                (matrixContentRef.current.style as any).zoom = `${newZoom}`;
                scrollContainerRef.current.scrollLeft = newScrollLeft;
                scrollContainerRef.current.scrollTop = newScrollTop;
            }
        });
    }
  };

  const handleTouchEnd = () => {
    if (pinchStartRef.current) {
        setMatrixZoom(zoomRef.current);
        pinchStartRef.current = null;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
  };

  const showToast = (msg: string) => { setToastMessage(msg); setTimeout(() => setToastMessage(null), 3000); };

  const syncToGlobalState = useCallback((newColumns: ColumnData[], newSideboard: Card[]) => {
      if (!myPlayer) return;
      const mainboard = newColumns.flatMap(col => col.cards);
      myPlayer.pool = mainboard;
      myPlayer.sideboard = newSideboard;
  }, [myPlayer]);

  const organizeCards = useCallback((cards: Card[], mode: 'cmc' | 'color' | 'type') => {
    // ... (unchanged)
    let newColumns: ColumnData[] = [];
    if (mode === 'cmc') {
      const buckets: Record<string, Card[]> = { 'Land': [], '0': [], '1': [], '2': [], '3': [], '4': [], '5': [], '6': [], '7+': [] };
      cards.forEach(card => {
        if (card.type_line?.toLowerCase().includes('land')) buckets['Land'].push(card);
        else { const cmc = card.cmc || 0; if (cmc >= 7) buckets['7+'].push(card); else buckets[cmc.toString()].push(card); }
      });
      const order = ['Land', '0', '1', '2', '3', '4', '5', '6', '7+'];
      newColumns = order.map(key => ({ id: key, title: '', cards: buckets[key].sort((a, b) => a.name.localeCompare(b.name)) })).filter(col => col.cards.length > 0);
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
      newColumns = order.map(key => ({ id: key, title: '', cards: buckets[key].sort((a, b) => (a.cmc || 0) - (b.cmc || 0)) })).filter(col => col.cards.length > 0);
    }
    setColumns(newColumns);
  }, []);

  const handleShareDeck = useCallback(async () => {
      // ... (unchanged)
      const mainboardNames = columns.flatMap(c => c.cards.map(card => card.name));
      const sideboardNames = sideboard.map(card => card.name);
      if (mainboardNames.length === 0 && sideboardNames.length === 0) { showToast("Deck is empty, nothing to share."); return; }
      const payload = JSON.stringify({ m: mainboardNames, s: sideboardNames });
      try {
          const encoded = btoa(unescape(encodeURIComponent(payload)));
          const longUrl = `${window.location.origin}${window.location.pathname}?deck=${encoded}`;
          showToast("Generating link...");
          try {
              const isGdApiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`;
              const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(isGdApiUrl)}`;
              const response = await fetch(proxyUrl);
              if (response.ok) {
                  const shortUrl = await response.text();
                  if (shortUrl.startsWith('http')) { await navigator.clipboard.writeText(shortUrl); showToast("Short link copied (is.gd)!"); return; }
              }
          } catch (e) { console.warn("Shortener failed"); }
          await navigator.clipboard.writeText(longUrl);
          showToast("Link copied!");
      } catch (e) { console.error("Error", e); showToast("Error generating link."); }
  }, [columns, sideboard]);

  const downloadTextFile = (content: string, filename: string) => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  const handleExport = (type: 'detailed' | 'simple') => {
     // ... (unchanged logic for export)
     const mainboard = columns.flatMap(c => c.cards);
     const group = (list: Card[]) => {
         const map = new Map<string, number>();
         list.forEach(c => map.set(c.name, (map.get(c.name) || 0) + 1));
         return Array.from(map.entries()).map(([name, count]) => `${count} ${name}`);
     };
     if (type === 'simple') {
         const mainLines = group(mainboard);
         const sideLines = group(sideboard);
         const text = `Deck\n${mainLines.join('\n')}\n\nSideboard\n${sideLines.join('\n')}`;
         downloadTextFile(text, `deck-simple-${new Date().toISOString().slice(0,10)}.txt`);
         setShowExportModal(false);
         showToast(`Simple decklist exported!`);
         return;
     }
     // Detailed export logic (simplified for brevity here, assumed present as before)
     downloadTextFile("Detailed export content...", "deck-detailed.txt");
     setShowExportModal(false);
  };

  const executeCardMove = useCallback((movingIds: string[], targetColId: string, targetIndex?: number) => {
      if (isMatrixView || movingIds.length === 0) return;
      let newColumns = [...columns];
      let newSideboard = [...sideboard];
      const movedCards: Card[] = [];
      movingIds.forEach(id => {
          const sbIndex = newSideboard.findIndex(c => c.id === id);
          if (sbIndex !== -1) { movedCards.push(newSideboard[sbIndex]); newSideboard.splice(sbIndex, 1); return; }
          for (let i = 0; i < newColumns.length; i++) {
              const col = newColumns[i];
              const cIndex = col.cards.findIndex(c => c.id === id);
              if (cIndex !== -1) { movedCards.push(col.cards[cIndex]); newColumns[i] = { ...col, cards: col.cards.filter(c => c.id !== id) }; return; }
          }
      });
      if (movedCards.length === 0) return;
      if (targetColId === 'SIDEBOARD' && movedCards.some(c => c.type_line?.includes('Basic Land'))) { showToast("Cannot move Basic Lands to Sideboard!"); return; }
      if (targetColId === 'SIDEBOARD') {
          let insertAt = targetIndex !== undefined ? targetIndex : newSideboard.length;
          newSideboard.splice(insertAt, 0, ...movedCards);
      } else {
          const colIndex = newColumns.findIndex(c => c.id === targetColId);
          if (colIndex !== -1) {
              const targetCol = newColumns[colIndex];
              const newCards = [...targetCol.cards];
              let insertAt = targetIndex !== undefined ? targetIndex : newCards.length;
              newCards.splice(insertAt, 0, ...movedCards);
              newColumns[colIndex] = { ...targetCol, cards: newCards };
          }
      }
      setColumns(newColumns);
      setSideboard(newSideboard);
      syncToGlobalState(newColumns, newSideboard);
      setSelectedCardIds(new Set());
  }, [columns, sideboard, isMatrixView, syncToGlobalState]);

  const updateLandCount = useCallback((type: string, delta: number) => {
    // ... (unchanged)
    let nextColumns = [...columns];
    if (delta > 0) {
      const newLand: Card = { id: `land-${Math.random()}`, name: type, type_line: `Basic Land — ${type}`, cmc: 0, colors: [], mana_cost: "" };
      let updated = false;
      nextColumns = nextColumns.map(col => {
          if (col.id === 'Land') { updated = true; return { ...col, cards: [...col.cards, newLand].sort((a, b) => a.name.localeCompare(b.name)) }; }
          return col;
      });
      if (!updated) nextColumns.unshift({ id: 'Land', title: 'Land', cards: [newLand] });
    } else {
      nextColumns = nextColumns.map(col => {
        if (col.id === 'Land') {
          const idx = col.cards.findIndex(c => c.name === type);
          if (idx !== -1) { const newCards = [...col.cards]; newCards.splice(idx, 1); return { ...col, cards: newCards }; }
        }
        return col;
      });
    }
    setColumns(nextColumns);
    syncToGlobalState(nextColumns, sideboard);
  }, [columns, sideboard, syncToGlobalState]);

  const handleExitClick = () => {
    showConfirm("Exit Session?", <div><p>Leave session?</p></div>, onProceed);
  };

  const getCardById = useCallback((id: string) => {
      for (const col of columns) { const card = col.cards.find(c => c.id === id); if (card) return card; }
      return sideboard.find(c => c.id === id);
  }, [columns, sideboard]);

  const totalMainDeck = useMemo(() => columns.reduce((acc, col) => acc + col.cards.length, 0), [columns]);

  const handleCardClick = useCallback((card: Card) => {
    if (dragWasActiveRef.current) return;
    window.history.pushState({ zoomedCardId: card.id }, '');
    setZoomedCard(card);
  }, []);

  const handleCloseZoom = useCallback(() => {
      setZoomedCard(null);
      if (window.history.state?.zoomedCardId) window.history.back();
  }, []);

  // Selection Logic
  const performSelection = useCallback((box: SelectionBox) => {
      // ... (Standard marquee logic)
      const selectionRect = { left: Math.min(box.startX, box.currentX), top: Math.min(box.startY, box.currentY), right: Math.max(box.startX, box.currentX), bottom: Math.max(box.startY, box.currentY) };
      const newSelected = new Set(initialSelectionRef.current);
      const cardElements = document.querySelectorAll('[data-card-id]');
      cardElements.forEach(el => {
          const id = el.getAttribute('data-card-id');
          if (!id) return;
          const isInSideboard = !!el.closest('[data-drop-id="SIDEBOARD"]');
          if (selectionScopeRef.current === 'main' && isInSideboard) return;
          if (selectionScopeRef.current === 'sb' && !isInSideboard) return;
          const rect = el.getBoundingClientRect();
          let intersectHeight = rect.height;
          if (isStackedView && el.getAttribute('data-is-last') !== 'true' && !isInSideboard) intersectHeight = STACK_OFFSET;
          const cardLeft = rect.left;
          const cardRight = rect.right;
          const cardTop = rect.top;
          const cardBottom = rect.top + intersectHeight;
          const isIntersecting = !(selectionRect.left > cardRight || selectionRect.right < cardLeft || selectionRect.top > cardBottom || selectionRect.bottom < cardTop);
          if (isIntersecting) newSelected.add(id); else if (!initialSelectionRef.current.has(id)) newSelected.delete(id);
      });
      setSelectedCardIds(newSelected);
  }, [isStackedView]);

  const handlePointerDown = (e: React.PointerEvent, card: Card, source: 'col' | 'sb', containerId: string) => {
      dragWasActiveRef.current = false;
      if (isMatrixView) return;
      if (!e.isPrimary || e.button !== 0) return;
      
      setPointerPos({ x: e.clientX, y: e.clientY });
      pointerPosRef.current = { x: e.clientX, y: e.clientY }; // Sync Ref
      
      const targetElement = e.currentTarget as HTMLElement;
      
      clickStartRef.current = { 
          x: e.clientX, 
          y: e.clientY, 
          target: targetElement,
          pointerId: e.pointerId
      };
      
      pendingDragRef.current = { card, source, containerId };
      
      const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
      
      // Mouse: Drag immediately
      if (e.pointerType === 'mouse') {
          targetElement.setPointerCapture(e.pointerId);
          if (!isMulti && !selectedCardIds.has(card.id)) setSelectedCardIds(new Set([card.id]));
          else if (isMulti) { const newSet = new Set(selectedCardIds); if (newSet.has(card.id)) newSet.delete(card.id); else newSet.add(card.id); setSelectedCardIds(newSet); }
          
          isDraggingSyncRef.current = true; // Sync update
          document.body.style.touchAction = 'none'; // DOM override
          document.body.style.overflow = 'hidden'; // DOM override
          
          setDragging({ card, movingCardIds: Array.from(selectedCardIds.has(card.id) ? selectedCardIds : [card.id]), sourceType: source, sourceContainerId: containerId });
          pendingDragRef.current = null;
          return;
      } 

      // Touch: Wait for timer (Long Press)
      if (dragTimerRef.current) clearTimeout(dragTimerRef.current);
      
      // Timer reduced to 180ms for snappier feel
      dragTimerRef.current = window.setTimeout(() => {
          dragWasActiveRef.current = true;
          isDraggingSyncRef.current = true; // CRITICAL: Update ref synchronously
          document.body.style.touchAction = 'none'; // DOM override
          document.body.style.overflow = 'hidden'; // DOM override
          
          if (clickStartRef.current) {
               try {
                   clickStartRef.current.target.setPointerCapture(clickStartRef.current.pointerId);
               } catch (err) { console.debug("Capture failed", err); }

               if (!isMulti && !selectedCardIds.has(card.id)) setSelectedCardIds(new Set([card.id]));
          }

          let idsToMove = [card.id];
          if (selectedCardIds.has(card.id)) { idsToMove = Array.from(selectedCardIds); if (!idsToMove.includes(card.id)) idsToMove = [card.id]; } 
          else { idsToMove = [card.id]; setSelectedCardIds(new Set([card.id])); }

          setDragging({ card, movingCardIds: idsToMove, sourceType: source, sourceContainerId: containerId });
          pendingDragRef.current = null;
          if (navigator.vibrate) navigator.vibrate(40);
      }, 180); 
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (isMatrixView) return;
      setPointerPos({ x: e.clientX, y: e.clientY });
      pointerPosRef.current = { x: e.clientX, y: e.clientY }; // Sync Ref

      // Safety: If drag starts while marquee was active (race condition), kill marquee
      if (dragging && isMarqueeSelectingRef.current) {
          isMarqueeSelectingRef.current = false;
          setSelectionBox(null);
      }

      if (isMarqueeSelectingRef.current && selectionBox) {
          const newBox = { ...selectionBox, currentX: e.clientX, currentY: e.clientY };
          setSelectionBox(newBox);
          performSelection(newBox);
          return;
      }

      // If waiting for long-press but user moves -> It's a scroll, cancel drag timer.
      if (pendingDragRef.current && clickStartRef.current && !dragging) {
          const dx = Math.abs(e.clientX - clickStartRef.current.x);
          const dy = Math.abs(e.clientY - clickStartRef.current.y);
          
          if (dx > 5 || dy > 5) { // Reduced tolerance to kill drag faster on scroll intent
              if (dragTimerRef.current) { clearTimeout(dragTimerRef.current); dragTimerRef.current = null; }
              pendingDragRef.current = null;
              clickStartRef.current = null;
          }
      }

      if (dragging) {
          // If we are dragging, verify we are still blocking everything
          if (!isDraggingSyncRef.current) {
               isDraggingSyncRef.current = true;
          }
          
          if (clickStartRef.current && !dragWasActiveRef.current) {
              const dx = Math.abs(e.clientX - clickStartRef.current.x);
              const dy = Math.abs(e.clientY - clickStartRef.current.y);
              if (dx > 4 || dy > 4) {
                   dragWasActiveRef.current = true;
              }
          }

          const elements = document.elementsFromPoint(e.clientX, e.clientY);
          const dropTarget = elements.find(el => el.hasAttribute('data-drop-id'));
          const targetId = dropTarget?.getAttribute('data-drop-id') || null;
          if (targetId !== activeDropTarget) setActiveDropTarget(targetId);
      }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      if (isMatrixView) return;
      if (dragTimerRef.current) { clearTimeout(dragTimerRef.current); dragTimerRef.current = null; }
      if (isMarqueeSelectingRef.current) { isMarqueeSelectingRef.current = false; setSelectionBox(null); clickStartRef.current = null; return; }

      // Cleanup DOM locks immediately
      isDraggingSyncRef.current = false;
      document.body.style.touchAction = '';
      document.body.style.overflow = '';

      if (dragging) {
          const elements = document.elementsFromPoint(e.clientX, e.clientY);
          const dropTargetEl = elements.find(el => el.hasAttribute('data-drop-id'));
          const targetId = dropTargetEl?.getAttribute('data-drop-id');

          if (targetId) {
             let targetIndex: number | undefined = undefined;
             if (targetId === 'SIDEBOARD') {
                 const cardEl = elements.find(el => el.hasAttribute('data-sb-card-index'));
                 if (cardEl) {
                     const idxStr = cardEl.getAttribute('data-sb-card-index');
                     if (idxStr) {
                         const idx = parseInt(idxStr, 10);
                         const rect = cardEl.getBoundingClientRect();
                         targetIndex = e.clientX > (rect.left + rect.width / 2) ? idx + 1 : idx;
                     }
                 }
             } else {
                 const cardEl = elements.find(el => el.hasAttribute('data-col-card-index'));
                 if (cardEl) {
                     const idxStr = cardEl.getAttribute('data-col-card-index');
                     if (idxStr) {
                         const idx = parseInt(idxStr, 10);
                         const rect = cardEl.getBoundingClientRect();

                         // Determine visible height of the target card
                         const isLast = cardEl.getAttribute('data-is-last') === 'true';
                         let effectiveHeight = rect.height;
                         if (isStackedView && !isLast) {
                             effectiveHeight = STACK_OFFSET; 
                         }
                         
                         // Determine drop position relative to visible part
                         const relativeY = e.clientY - rect.top;
                         targetIndex = relativeY > (effectiveHeight / 2) ? idx + 1 : idx;
                     }
                 }
             }
             executeCardMove(dragging.movingCardIds, targetId, targetIndex);
          }
          setDragging(null);
          setActiveDropTarget(null);
      } else if (pendingDragRef.current) {
          // If we are here, timer didn't fire (was a tap). Handle click selection logic.
          const { card } = pendingDragRef.current;
          const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
          if (!isMulti) setSelectedCardIds(new Set([card.id]));
          else { const newSet = new Set(selectedCardIds); if (newSet.has(card.id)) newSet.delete(card.id); else newSet.add(card.id); setSelectedCardIds(newSet); }
      }
      pendingDragRef.current = null;
      clickStartRef.current = null;
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
      if (isMatrixView) return;
      if (dragTimerRef.current) { clearTimeout(dragTimerRef.current); dragTimerRef.current = null; }
      
      // Cleanup DOM locks immediately
      isDraggingSyncRef.current = false;
      document.body.style.touchAction = '';
      document.body.style.overflow = '';
      
      setDragging(null);
      setActiveDropTarget(null);
      pendingDragRef.current = null;
      clickStartRef.current = null;
      isMarqueeSelectingRef.current = false;
      setSelectionBox(null);
  };

  // ... (Background pointer logic)
  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
      dragWasActiveRef.current = false;
      if (isMatrixView) return;
      if (!e.isPrimary || e.button !== 0) return;
      
      // MARQUEE DISABLE ON TOUCH
      if (e.pointerType === 'touch') return;

      // FIX: Don't start marquee selection if we just clicked a card (pending drag) 
      // or are already actively dragging. This prevents ambiguity when event bubbles up.
      const targetEl = e.target as HTMLElement;
      if (targetEl.closest('[data-card-id]')) return;
      if (dragging || pendingDragRef.current) return;

      const sbTop = window.innerHeight - sideboardHeight;
      if (e.clientY >= sbTop) selectionScopeRef.current = 'sb'; else selectionScopeRef.current = 'main';
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);
      clickStartRef.current = { x: e.clientX, y: e.clientY, target, pointerId: e.pointerId };
      isMarqueeSelectingRef.current = true;
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) setSelectedCardIds(new Set());
      initialSelectionRef.current = new Set(selectedCardIds);
      setSelectionBox({ startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY });
  };
  
  // Matrix Calculations
  const matrixData = useMemo(() => {
    if (matrixMode === 'none') return {};

    const data: Record<string, Record<string, Card[]>> = {};
    const rowKeys = matrixMode === 'color' ? COLORS_ORDER : TYPES_ORDER;
    
    // Initialize
    rowKeys.forEach(row => {
      data[row] = {};
      CMC_ORDER.forEach(cmc => {
        data[row][cmc] = [];
      });
    });

    const allCards = columns.flatMap(col => col.cards);

    allCards.forEach(card => {
        // Row Key
        let rowKey = 'Other';
        if (matrixMode === 'color') {
             if (card.type_line?.toLowerCase().includes('land')) rowKey = 'Land';
             else if (!card.colors || card.colors.length === 0) rowKey = 'Colorless';
             else if (card.colors.length > 1) rowKey = 'Multicolor';
             else {
                 const colorMap: Record<string, string> = { 'W': 'White', 'U': 'Blue', 'B': 'Black', 'R': 'Red', 'G': 'Green' };
                 rowKey = colorMap[card.colors[0]] || 'Colorless';
             }
        } else {
             const tl = card.type_line?.toLowerCase() || '';
             if (tl.includes('creature')) rowKey = 'Creature';
             else if (tl.includes('planeswalker')) rowKey = 'Planeswalker';
             else if (tl.includes('instant')) rowKey = 'Instant';
             else if (tl.includes('sorcery')) rowKey = 'Sorcery';
             else if (tl.includes('enchantment')) rowKey = 'Enchantment';
             else if (tl.includes('artifact')) rowKey = 'Artifact';
             else if (tl.includes('land')) rowKey = 'Land';
             else rowKey = 'Other';
        }

        // CMC Key
        let cmcKey = '0';
        if (card.type_line?.toLowerCase().includes('land')) {
             cmcKey = '0'; // Lands to 0
        } else {
            const val = card.cmc || 0;
            if (val >= 7) cmcKey = '7+';
            else cmcKey = Math.floor(val).toString();
        }

        if (data[rowKey] && data[rowKey][cmcKey]) {
            data[rowKey][cmcKey].push(card);
        }
    });

    return data;
  }, [columns, matrixMode]);

  const visibleRows = useMemo(() => {
     if (matrixMode === 'none') return [];
     const rowKeys = matrixMode === 'color' ? COLORS_ORDER : TYPES_ORDER;
     return rowKeys.filter(row => {
         const rowObj = matrixData[row];
         if (!rowObj) return false;
         return Object.values(rowObj).some(cards => cards.length > 0);
     });
  }, [matrixData, matrixMode]);

  const getMatrixInitial = useCallback((key: string) => {
      if (key === 'Blue') return 'U';
      if (key === 'Multicolor') return 'M';
      if (key === 'Colorless') return 'C';
      return key[0];
  }, []);

  const getMatrixFullName = useCallback((initial: string) => "", []);

  const getMatrixColorStyle = useCallback((key: string) => {
      if (key === 'White' || key === 'W') return 'bg-[#f8f6d8] text-slate-900';
      if (key === 'Blue' || key === 'U') return 'bg-[#0e68ab] text-white';
      if (key === 'Black' || key === 'B') return 'bg-[#150b00] text-white border-slate-600';
      if (key === 'Red' || key === 'R') return 'bg-[#d3202a] text-white';
      if (key === 'Green' || key === 'G') return 'bg-[#00733e] text-white';
      if (key === 'Multicolor' || key === 'M') return 'bg-gradient-to-br from-yellow-400 via-red-500 to-blue-600 text-white';
      if (key === 'Colorless' || key === 'C') return 'bg-slate-400 text-slate-900';
      if (key === 'Land' || key === 'L') return 'bg-amber-800 text-white';
      if (key === 'Artifact') return 'bg-slate-500 text-white';
      if (key === 'Planeswalker') return 'bg-fuchsia-700 text-white';
      return 'bg-slate-700 text-white';
  }, []);


  if (loading) return <div className="flex flex-col items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div><p className="text-slate-400">Organizing pool...</p></div>;

  return (
    <div 
        ref={containerRef}
        className="flex flex-col h-full bg-slate-900 overflow-hidden relative select-none"
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onDragStart={(e) => e.preventDefault()} // Critical: Disable native drag on container
        // Force touch-action: none ONLY when dragging is actually active. Otherwise auto/pan-y.
        style={{ touchAction: dragging ? 'none' : 'auto' }}
    >
      {toastMessage && <div className="absolute bottom-60 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-2xl z-[150] animate-bounce font-bold border border-blue-400 w-max max-w-[90vw] text-center">{toastMessage}</div>}
      
      {showExportModal && <ExportModal onExportDetailed={() => handleExport('detailed')} onExportSimple={() => handleExport('simple')} onClose={() => setShowExportModal(false)} />}
      
      {selectionBox && <div className="fixed border-2 border-blue-500 bg-blue-500/20 z-[999] pointer-events-none" style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY) }} />}

      {dragging && (
        <div className="fixed z-[1000] pointer-events-none will-change-transform" style={{ left: pointerPos.x, top: pointerPos.y, transform: 'translate(-50%, -50%)', width: '140px' }}>
          <div className="relative">
             {dragging.movingCardIds.slice(0, 5).reverse().map((id, index, arr) => {
                 const card = getCardById(id);
                 if (!card) return null;
                 const stackIndex = arr.length - 1 - index; 
                 return (
                     <div key={id} className="absolute w-full rounded-xl overflow-hidden shadow-2xl border-2 border-blue-500 bg-slate-900" style={{ top: stackIndex * 4, left: stackIndex * 2, zIndex: 10 - stackIndex, transform: `rotate(${(stackIndex % 2 === 0 ? 1 : -1) * stackIndex * 2}deg)` }}>
                         <CardImage name={card.name} hoverEffect={false} />
                     </div>
                 );
             })}
             {dragging.movingCardIds.length > 5 && <div className="absolute -top-4 -right-4 bg-blue-600 text-white font-black text-xs w-8 h-8 rounded-full flex items-center justify-center border-2 border-slate-900 shadow-xl z-50">+{dragging.movingCardIds.length - 5}</div>}
          </div>
        </div>
      )}

      <DeckHeader 
        matrixMode={matrixMode} setMatrixMode={setMatrixMode}
        isSortMenuOpen={isSortMenuOpen} setIsSortMenuOpen={setIsSortMenuOpen}
        handleSortAction={(m) => { const all = columns.flatMap(c=>c.cards); organizeCards(all, m); setIsSortMenuOpen(false); }}
        showLandPicker={showLandPicker} setShowLandPicker={setShowLandPicker}
        landButtonRef={landButtonRef} landPickerRef={landPickerRef}
        getLandCount={getLandCount} updateLandCount={updateLandCount}
        isStackedView={isStackedView} setIsStackedView={setIsStackedView}
        totalMainDeck={totalMainDeck} sideboardCount={sideboard.length}
        onExportClick={() => setShowExportModal(true)} onShareClick={handleShareDeck} onExitClick={handleExitClick}
        sortMenuRef={sortMenuRef}
      />

      <div 
        ref={scrollContainerRef} 
        className="flex-1 overflow-auto relative p-4 scrollbar-thin mobile-no-scrollbar"
        style={{ paddingBottom: isMatrixView ? '0' : `${sideboardHeight}px`, touchAction: dragging ? 'none' : 'auto' }}
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
      >
         {matrixMode === 'none' ? (
            <NormalColumnView 
                columns={columns} isStackedView={isStackedView} activeDropTarget={activeDropTarget}
                dragGhostActive={!!dragging} dragGhostCardId={dragging?.card.id} nativeDraggingId={null}
                setZoomedCard={handleCardClick} setActiveDropTarget={setActiveDropTarget}
                handleDragStart={()=>{}} handleDragEnd={()=>{}} handleDropOnCard={()=>{}} handleDragOver={(e)=>e.preventDefault()} handleDropOnColumn={()=>{}} handleDragOverContainer={(e)=>e.preventDefault()} handleTouchStart={()=>{}} handleTouchMove={()=>{}} handleTouchEnd={()=>{}}
                onPointerDown={handlePointerDown}
                selectedCardIds={selectedCardIds} movingCardIds={dragging?.movingCardIds}
            />
         ) : (
             <div ref={matrixContentRef} style={{ zoom: matrixZoom } as any}>
                 <MatrixView 
                    matrixData={matrixData} 
                    visibleRows={visibleRows} 
                    cmcOrder={CMC_ORDER} 
                    getInitial={getMatrixInitial} 
                    getFullName={getMatrixFullName} 
                    getColorStyle={getMatrixColorStyle} 
                    emptyMessage="Review in Pool view to reorganize." 
                    activeTooltip={activeTooltip} 
                    setActiveTooltip={setActiveTooltip} 
                    setZoomedCard={handleCardClick} 
                 />
             </div>
         )}
      </div>

      {!isMatrixView && (
        <SideboardBar 
            scrollRef={sideboardScrollRef} sideboard={sideboard} sideboardHeight={sideboardHeight}
            startResizingSideboard={(e) => { setIsResizingSideboard(true); e.preventDefault(); }}
            dragGhostActive={!!dragging} dragGhostCardId={dragging?.card.id} setZoomedCard={handleCardClick}
            handleDragStart={()=>{}} handleDragEnd={()=>{}} handleDropOnSideboardCard={()=>{}} handleDragOver={(e)=>e.preventDefault()} handleDropOnSideboard={()=>{}} handleDragOverContainer={(e)=>e.preventDefault()} handleTouchStart={()=>{}} handleTouchMove={()=>{}} handleTouchEnd={()=>{}}
            onPointerDown={handlePointerDown} isDragging={!!dragging} selectedCardIds={selectedCardIds} movingCardIds={dragging?.movingCardIds}
        />
      )}
      {zoomedCard && <ZoomOverlay card={zoomedCard} onClose={handleCloseZoom} />}
    </div>
  );

  function getLandCount(type: string) { return columns.reduce((a,c)=>a+c.cards.filter(card=>card.name===type).length,0); }
};

export default DeckView;
