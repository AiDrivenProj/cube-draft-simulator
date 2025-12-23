
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
  sourceType: 'col' | 'sb';
  sourceContainerId: string;
}

type MatrixMode = 'none' | 'color' | 'type';

const COLORS_ORDER = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless', 'Land'];
const TYPES_ORDER = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Other'];
const CMC_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7+'];

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
  
  // UI Refs
  const landPickerRef = useRef<HTMLDivElement>(null);
  const landButtonRef = useRef<HTMLButtonElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null); 
  const sideboardScrollRef = useRef<HTMLDivElement>(null);
  
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
      newColumns = order.map(key => ({ id: key, title: '', cards: buckets[key].sort((a, b) => (a.cmc || 0) - (b.cmc || 0)) }));
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
            // shorturl.com requires API Key, shorturl.at prevents API access.
            // is.gd is the standard fallback for client-side shortening.
            const isGdApiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}&shorturl=cubendeck`;
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

  const executeCardMove = useCallback((cardId: string, sourceType: string, sourceContainerId: string, targetColId: string, targetIndex?: number) => {
      if (isMatrixView) return;
      let cardToMove: Card | undefined;
      
      // 1. Identify the card
      if (sourceType === 'sb') {
          cardToMove = sideboard.find(c => c.id === cardId);
      } else {
          const sourceCol = columns.find(c => c.id === sourceContainerId);
          cardToMove = sourceCol?.cards.find(c => c.id === cardId);
      }
      if (!cardToMove) return;

      // 2. Validate move
      if (targetColId === 'SIDEBOARD' && cardToMove.type_line?.includes('Basic Land')) {
          showToast("Cannot move Basic Lands to Sideboard!");
          return;
      }
      
      // 3. Handle Sideboard -> Sideboard (Reorder)
      if (sourceType === 'sb' && targetColId === 'SIDEBOARD') {
          setSideboard(prev => {
              const copy = [...prev];
              const fromIndex = copy.findIndex(c => c.id === cardId);
              if (fromIndex === -1) return prev;
              copy.splice(fromIndex, 1);
              let insertAt = targetIndex !== undefined ? targetIndex : copy.length;
              if (fromIndex < insertAt) insertAt = Math.max(0, insertAt - 1);
              copy.splice(insertAt, 0, cardToMove!);
              return copy;
          });
          return;
      }

      // 4. Handle Column -> Same Column (Reorder)
      if (sourceType === 'col' && targetColId === sourceContainerId) {
          setColumns(prev => prev.map(col => {
              if (col.id === sourceContainerId) {
                  const copy = [...col.cards];
                  const fromIndex = copy.findIndex(c => c.id === cardId);
                  if (fromIndex === -1) return col;
                  copy.splice(fromIndex, 1);
                  let insertAt = targetIndex !== undefined ? targetIndex : copy.length;
                  if (fromIndex < insertAt) insertAt = Math.max(0, insertAt - 1);
                  copy.splice(insertAt, 0, cardToMove!);
                  return { ...col, cards: copy };
              }
              return col;
          }));
          return;
      }

      // 5. Handle Cross-Container Moves
      
      // Remove from Source
      if (sourceType === 'sb') {
          setSideboard(prev => prev.filter(c => c.id !== cardId));
      } else {
          setColumns(prev => prev.map(col => col.id === sourceContainerId ? { ...col, cards: col.cards.filter(c => c.id !== cardId) } : col));
      }

      // Add to Target
      if (targetColId === 'SIDEBOARD') {
          setSideboard(prev => {
              const copy = [...prev];
              const insertAt = targetIndex !== undefined ? targetIndex : copy.length;
              copy.splice(insertAt, 0, cardToMove!);
              return copy;
          });
      } else {
          setColumns(prev => prev.map(col => {
              if (col.id === targetColId) {
                  const copy = [...col.cards];
                  const insertAt = targetIndex !== undefined ? targetIndex : copy.length;
                  copy.splice(insertAt, 0, cardToMove!);
                  return { ...col, cards: copy };
              }
              return col;
          }));
      }
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
      setZoomedCard(card);
  };

  // UNIFIED POINTER DND LOGIC
  const handlePointerDown = (e: React.PointerEvent, card: Card, source: 'col' | 'sb', containerId: string) => {
    if (isMatrixView || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    
    // Stop any active inertia
    if (inertiaRafRef.current) {
        cancelAnimationFrame(inertiaRafRef.current);
        inertiaRafRef.current = null;
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

    // Check Pointer Type: Mouse = Instant Drag; Touch = Long Press
    if (e.pointerType === 'mouse') {
        setDragging({ card, sourceType: source, sourceContainerId: containerId });
    } else {
        longPressTimer.current = window.setTimeout(() => {
            if (!isScrollingRef.current) {
                setDragging({ card, sourceType: source, sourceContainerId: containerId });
                if (navigator.vibrate) navigator.vibrate(40);
            }
            longPressTimer.current = null;
        }, 250); 
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const x = e.clientX;
    const y = e.clientY;
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
                    dragging.card.id, 
                    dragging.sourceType, 
                    dragging.sourceContainerId, 
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

  if (loading) return <div className="flex flex-col items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div><p className="text-slate-400">Organizing pool...</p></div>;

  return (
    <div 
        className="flex flex-col h-full bg-slate-900 overflow-hidden relative"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
    >
      {toastMessage && <div className="absolute bottom-60 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-2xl z-[150] animate-bounce font-bold border border-blue-400 w-max max-w-[90vw] text-center">{toastMessage}</div>}
      
      {showExportModal && (
        <ExportModal onExportDetailed={() => {}} onExportSimple={() => {}} onClose={() => setShowExportModal(false)} />
      )}

      {/* Ghost Card hardware-accelerated */}
      {dragging && (
        <div 
          className="fixed z-[1000] pointer-events-none will-change-transform"
          style={{ 
              left: pointerPos.x, 
              top: pointerPos.y, 
              transform: 'translate(-50%, -50%) scale(1.05)',
              width: '140px'
          }}
        >
          <div className="rounded-xl overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] border-2 border-blue-500 bg-slate-900">
             <CardImage name={dragging.card.name} hoverEffect={false} />
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
