
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
  
  // Matrix Zoom State
  const [matrixZoom, setMatrixZoom] = useState(1);
  const zoomRef = useRef(1); // Track zoom purely for logic to avoid stale closures in listeners
  const matrixContentRef = useRef<HTMLDivElement>(null); // Direct DOM access for performance
  const rafRef = useRef<number | null>(null); // RequestAnimationFrame ID

  const pinchStartRef = useRef<{ 
    dist: number, 
    startZoom: number,
    startScrollLeft: number,
    startScrollTop: number,
    centerX: number,
    centerY: number
  } | null>(null);
  
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

  // Manual Scroll & Inertia State
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

  // Reset zoom on mode change
  useEffect(() => {
    setMatrixZoom(1);
    zoomRef.current = 1;
  }, [matrixMode]);

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

  // Ensure there is always exactly one free column on the right
  useEffect(() => {
    if (loading) return;
    setColumns(prev => {
        if (prev.length === 0) return [{ id: `col-${Date.now()}-${Math.random()}`, title: '', cards: [] }];
        const lastCol = prev[prev.length - 1];
        if (lastCol.cards.length > 0) return [...prev, { id: `col-${Date.now()}-${Math.random()}`, title: '', cards: [] }];
        if (lastCol.cards.length === 0) {
            if (prev.length > 1) {
                const secondToLast = prev[prev.length - 2];
                if (secondToLast.cards.length === 0) return prev.slice(0, -1);
            }
        }
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

  // --- OPTIMIZED PINCH TO ZOOM HANDLERS ---
  const handleTouchStart = (e: React.TouchEvent) => {
    if (isMatrixView && e.touches.length === 2 && scrollContainerRef.current) {
        const rect = scrollContainerRef.current.getBoundingClientRect();
        
        // Calculate Center of the two touches relative to the container
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;

        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );

        pinchStartRef.current = { 
            dist, 
            startZoom: zoomRef.current, // Use ref, not state, for most current value
            startScrollLeft: scrollContainerRef.current.scrollLeft,
            startScrollTop: scrollContainerRef.current.scrollTop,
            centerX,
            centerY
        };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isMatrixView && e.touches.length === 2 && pinchStartRef.current && scrollContainerRef.current) {
        // Prevent default to avoid browser zooming or native scrolling fighting with our logic
        if (e.cancelable) e.preventDefault();

        const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        
        // Calculate new zoom
        const scaleFactor = dist / pinchStartRef.current.dist;
        const newZoom = Math.max(0.5, Math.min(3, pinchStartRef.current.startZoom * scaleFactor));
        
        zoomRef.current = newZoom; // Update ref immediately

        // Calculate scroll position
        const zoomRatio = newZoom / pinchStartRef.current.startZoom;
        const { startScrollLeft, startScrollTop, centerX, centerY } = pinchStartRef.current;

        const newScrollLeft = (startScrollLeft + centerX) * zoomRatio - centerX;
        const newScrollTop = (startScrollTop + centerY) * zoomRatio - centerY;

        // Use requestAnimationFrame to update DOM directly for 60fps smoothness
        // This avoids React render cycles during the active gesture
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        
        rafRef.current = requestAnimationFrame(() => {
            if (matrixContentRef.current && scrollContainerRef.current) {
                // Update zoom style directly
                (matrixContentRef.current.style as any).zoom = `${newZoom}`;
                // Update scroll positions directly
                scrollContainerRef.current.scrollLeft = newScrollLeft;
                scrollContainerRef.current.scrollTop = newScrollTop;
            }
        });
    }
  };

  const handleTouchEnd = () => {
    // Commit the final zoom state to React when gesture ends
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
        } catch (e) { console.warn("Shortener failed, falling back to long URL"); }
        await navigator.clipboard.writeText(longUrl);
        showToast("Link copied (Shortener unavailable)");
    } catch (e) {
        console.error("Error encoding deck for share:", e);
        showToast("Error generating share link.");
    }
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
      const mainboard = columns.flatMap(c => c.cards);

      // Aggregation Helper (used by both formats logic)
      const group = (list: Card[]) => {
          const map = new Map<string, number>();
          list.forEach(c => map.set(c.name, (map.get(c.name) || 0) + 1));
          return Array.from(map.entries()).map(([name, count]) => `${count} ${name}`);
      };

      if (type === 'simple') {
          // MTGA / MTGO Style
          const mainLines = group(mainboard);
          const sideLines = group(sideboard);
          const text = `Deck\n${mainLines.join('\n')}\n\nSideboard\n${sideLines.join('\n')}`;
          downloadTextFile(text, `deck-simple-${new Date().toISOString().slice(0,10)}.txt`);
          setShowExportModal(false);
          showToast(`Simple decklist exported!`);
          return;
      }

      // Detailed Custom Format: Group by Color then CMC
      const getCat = (card: Card) => {
          if (card.type_line?.toLowerCase().includes('land')) return 'Land';
          if (!card.colors || card.colors.length === 0) return 'Colorless';
          if (card.colors.length > 1) return 'Multicolor';
          const map: Record<string, string> = { 'W': 'White', 'U': 'Blue', 'B': 'Black', 'R': 'Red', 'G': 'Green' };
          return map[card.colors[0]] || 'Colorless';
      };

      const getCMC = (card: Card) => {
          const val = card.cmc || 0;
          if (val >= 7) return '7+';
          return Math.floor(val).toString();
      };

      const generateSection = (cards: Card[], title: string) => {
          const buckets: Record<string, Record<string, string[]>> = {};
          // Initialize structure using existing constants
          COLORS_ORDER.forEach(c => {
              buckets[c] = {};
              CMC_ORDER.forEach(cmc => buckets[c][cmc] = []);
          });

          // Fill buckets
          cards.forEach(card => {
              const cat = getCat(card);
              const cmc = getCMC(card);
              // Safely handle unknown categories if any
              const targetCat = buckets[cat] ? cat : 'Colorless';
              const targetCMC = buckets[targetCat][cmc] ? cmc : '0';
              buckets[targetCat][targetCMC].push(card.name);
          });

          let lines: string[] = [];
          lines.push(`// ==========================================`);
          lines.push(`//               ${title}`);
          lines.push(`// ==========================================`);
          lines.push('');

          let sectionHasCards = false;

          COLORS_ORDER.forEach(color => {
              const byCmc = buckets[color];
              const hasCards = Object.values(byCmc).some(arr => arr.length > 0);
              
              if (hasCards) {
                  sectionHasCards = true;
                  lines.push(`// --- ${color} ---`);
                  CMC_ORDER.forEach(cmc => {
                      const names = byCmc[cmc];
                      if (names.length > 0) {
                          lines.push(`// CMC ${cmc}`);
                          // Aggregate duplicates for cleaner output
                          const counts = new Map<string, number>();
                          names.forEach(n => counts.set(n, (counts.get(n) || 0) + 1));
                          
                          // Sort alphabetically
                          const sortedNames = Array.from(counts.keys()).sort();
                          
                          sortedNames.forEach(name => {
                              lines.push(`${counts.get(name)} ${name}`);
                          });
                      }
                  });
                  lines.push(''); // Spacing after color block
              }
          });
          
          if (!sectionHasCards) lines.push('// Empty');
          
          return lines.join('\n');
      };

      const header = `// Decklist exported from CubeDraft Simulator\n\n`;
      const mainTxt = generateSection(mainboard, 'MAINBOARD');
      const sideTxt = generateSection(sideboard, 'SIDEBOARD');

      const text = header + mainTxt + '\n\n' + sideTxt;
      
      downloadTextFile(text, `deck-detailed-${new Date().toISOString().slice(0,10)}.txt`);
      setShowExportModal(false);
      showToast(`Detailed decklist exported!`);
  };

  const executeCardMove = useCallback((movingIds: string[], targetColId: string, targetIndex?: number) => {
      if (isMatrixView || movingIds.length === 0) return;
      
      let newColumns = [...columns];
      let newSideboard = [...sideboard];
      const movedCards: Card[] = [];

      movingIds.forEach(id => {
          const sbIndex = newSideboard.findIndex(c => c.id === id);
          if (sbIndex !== -1) {
              movedCards.push(newSideboard[sbIndex]);
              newSideboard.splice(sbIndex, 1);
              return; 
          }
          for (let i = 0; i < newColumns.length; i++) {
              const col = newColumns[i];
              const cIndex = col.cards.findIndex(c => c.id === id);
              if (cIndex !== -1) {
                  movedCards.push(col.cards[cIndex]);
                  const newCards = [...col.cards];
                  newCards.splice(cIndex, 1);
                  newColumns[i] = { ...col, cards: newCards };
                  return;
              }
          }
      });

      if (movedCards.length === 0) return;

      const hasBasicLand = movedCards.some(c => c.type_line?.includes('Basic Land'));
      if (targetColId === 'SIDEBOARD' && hasBasicLand) {
          showToast("Cannot move Basic Lands to Sideboard!");
          return;
      }

      if (targetColId === 'SIDEBOARD') {
          let insertAt = targetIndex !== undefined ? targetIndex : newSideboard.length;
          insertAt = Math.max(0, Math.min(insertAt, newSideboard.length));
          newSideboard.splice(insertAt, 0, ...movedCards);
      } else {
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

      setColumns(newColumns);
      setSideboard(newSideboard);
      syncToGlobalState(newColumns, newSideboard);
      setSelectedCardIds(new Set());
  }, [columns, sideboard, isMatrixView, syncToGlobalState]);

  const updateLandCount = useCallback((type: string, delta: number) => {
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
      for (const col of columns) {
          const card = col.cards.find(c => c.id === id);
          if (card) return card;
      }
      return sideboard.find(c => c.id === id);
  }, [columns, sideboard]);

  const totalMainDeck = useMemo(() => columns.reduce((acc, col) => acc + col.cards.length, 0), [columns]);

  const handleCardClick = useCallback((card: Card) => {
    window.history.pushState({ zoomedCardId: card.id }, '');
    setZoomedCard(card);
  }, []);

  const handlePointerDown = (e: React.PointerEvent, card: Card, source: 'col' | 'sb', containerId: string) => {
      // Disable dragging logic in Matrix View to allow clicks to pass through
      if (isMatrixView) return;

      if (!e.isPrimary || e.button !== 0) return;
      e.stopPropagation();
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      clickStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      pendingDragRef.current = { card, source, containerId };
      
      const isMulti = e.shiftKey || e.ctrlKey || e.metaKey;
      if (isMulti) {
        const newSet = new Set(selectedCardIds);
        if (newSet.has(card.id)) newSet.delete(card.id);
        else newSet.add(card.id);
        setSelectedCardIds(newSet);
      }
  };

  const handleBackgroundPointerDown = (e: React.PointerEvent) => {
      // Disable background selection in Matrix View to allow scroll/pinch
      if (isMatrixView) return;

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
      if (isMatrixView) return; // Ignore drag move in Matrix view

      setPointerPos({ x: e.clientX, y: e.clientY });

      if (isMarqueeSelectingRef.current && selectionBox) {
          setSelectionBox(prev => prev ? ({ ...prev, currentX: e.clientX, currentY: e.clientY }) : null);
          return;
      }

      if (pendingDragRef.current && clickStartRef.current && !dragging) {
          const dx = e.clientX - clickStartRef.current.x;
          const dy = e.clientY - clickStartRef.current.y;
          if (dx*dx + dy*dy > 25) { 
              const { card, source, containerId } = pendingDragRef.current;
              let idsToMove = [card.id];
              if (selectedCardIds.has(card.id)) {
                  idsToMove = Array.from(selectedCardIds);
              } else {
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
      if (isMatrixView) return;

      if (isMarqueeSelectingRef.current) {
          isMarqueeSelectingRef.current = false;
          setSelectionBox(null);
          clickStartRef.current = null;
          return;
      }

      if (dragging) {
          // Detect precise index for insertion
          const elements = document.elementsFromPoint(e.clientX, e.clientY);
          const dropTargetEl = elements.find(el => el.hasAttribute('data-drop-id'));
          const targetId = dropTargetEl?.getAttribute('data-drop-id');

          if (targetId) {
             let targetIndex: number | undefined = undefined;

             if (targetId === 'SIDEBOARD') {
                 // Sideboard Horizontal Logic: Check closest card via data-sb-card-index
                 const cardEl = elements.find(el => el.hasAttribute('data-sb-card-index'));
                 if (cardEl) {
                     const idxStr = cardEl.getAttribute('data-sb-card-index');
                     if (idxStr) {
                         const idx = parseInt(idxStr, 10);
                         const rect = cardEl.getBoundingClientRect();
                         // Insert after if on right half
                         const isRightHalf = e.clientX > (rect.left + rect.width / 2);
                         targetIndex = isRightHalf ? idx + 1 : idx;
                     }
                 }
             } else {
                 // Column Vertical Logic: Check closest card via data-col-card-index
                 // Note: NormalColumnView cards have data-col-card-index
                 const cardEl = elements.find(el => el.hasAttribute('data-col-card-index'));
                 if (cardEl) {
                     const idxStr = cardEl.getAttribute('data-col-card-index');
                     if (idxStr) {
                         const idx = parseInt(idxStr, 10);
                         const rect = cardEl.getBoundingClientRect();
                         // Insert after if on bottom half (works for both Stacked and Spread views comfortably)
                         // For stacked view, visible area is small but logic still holds for "inserting before/after this card"
                         const isBottomHalf = e.clientY > (rect.top + rect.height / 2);
                         targetIndex = isBottomHalf ? idx + 1 : idx;
                     }
                 }
             }
             
             executeCardMove(dragging.movingCardIds, targetId, targetIndex);
          }
          
          setDragging(null);
          setActiveDropTarget(null);
      } else if (pendingDragRef.current) {
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
      if (isMatrixView) return;
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
        style={{ touchAction: isMatrixView ? 'auto' : 'none' }}
    >
      {toastMessage && <div className="absolute bottom-60 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-2xl z-[150] animate-bounce font-bold border border-blue-400 w-max max-w-[90vw] text-center">{toastMessage}</div>}
      
      {showExportModal && (
        <ExportModal 
            onExportDetailed={() => handleExport('detailed')} 
            onExportSimple={() => handleExport('simple')} 
            onClose={() => setShowExportModal(false)} 
        />
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
              transform: 'translate(-50%, -50%)',
              width: '140px'
          }}
        >
          <div className="relative">
             {dragging.movingCardIds.slice(0, 5).reverse().map((id, index, arr) => {
                 const card = getCardById(id);
                 if (!card) return null;
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
        // Attach Pinch Handlers directly to the scroll container
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
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
             // Apply Zoom via CSS property for best table performance on mobile
             // Ref attached here to allow direct DOM manipulation for smooth pinch zoom
             <div ref={matrixContentRef} style={{ zoom: matrixZoom } as any}>
                 <MatrixView 
                    matrixData={matrixData}
                    visibleRows={visibleRows} cmcOrder={CMC_ORDER}
                    getInitial={k=>k[0]} 
                    getFullName={() => ''} 
                    getColorStyle={(rowKey) => {
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
             </div>
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
