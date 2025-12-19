// components/RecapView.tsx

// Adding React import to resolve namespace errors for FC, MouseEvent, DragEvent, and TouchEvent
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DraftState, Card } from '../types';
import { enrichCardData } from '../services/cubeService';
import CardImage from './CardImage';
import { useModal } from './ModalSystem';

interface RecapViewProps {
  draftState: DraftState;
  onProceed: () => void;
  myClientId: string;
}

interface ColumnData {
  id: string;
  title: string;
  cards: Card[];
}

interface DragGhostState {
  active: boolean;
  x: number;
  y: number;
  card: Card;
  sourceType: 'col' | 'sb';
  containerId: string;
}

type MatrixMode = 'none' | 'color' | 'type';

const STACK_OFFSET = 35;
const CARD_HEIGHT = 220;

const COLORS_ORDER = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless', 'Land'];
const TYPES_ORDER = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Other'];
const CMC_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7+'];

const FULL_COLOR_NAMES: Record<string, string> = {
    'W': 'White', 'U': 'Blue', 'B': 'Black', 'R': 'Red', 'G': 'Green', 'M': 'Multicolor', 'C': 'Colorless', 'L': 'Land'
};

const FULL_TYPE_NAMES: Record<string, string> = {
    'CR': 'Creature', 'PW': 'Planeswalker', 'IN': 'Instant', 'SO': 'Sorcery', 'EN': 'Enchantment', 'AR': 'Artifact', 'LA': 'Land', 'OT': 'Other'
};

const RecapView: React.FC<RecapViewProps> = ({ draftState, onProceed, myClientId }) => {
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
  const [activeDropTarget, setActiveDropTarget] = useState<string | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  
  const landPickerRef = useRef<HTMLDivElement>(null);
  const landButtonRef = useRef<HTMLButtonElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  
  const [zoomedCard, setZoomedCard] = useState<Card | null>(null);
  const [dragGhost, setDragGhost] = useState<DragGhostState | null>(null);
  const [nativeDraggingId, setNativeDraggingId] = useState<string | null>(null); 
  
  const longPressTimer = useRef<number | null>(null);
  const touchStartPos = useRef<{x: number, y: number} | null>(null);
  const currentTouchPos = useRef<{x: number, y: number} | null>(null);
  const autoScrollInterval = useRef<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null); 
  const myPlayer = draftState.players.find(p => p.clientId === myClientId);

  const { showConfirm } = useModal();

  const isMatrixView = matrixMode !== 'none';

  useEffect(() => {
    const loadData = async () => {
      if (!myPlayer) {
        setLoading(false);
        return;
      }
      
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
            console.error("Failed to enrich card data", e);
            if (hasMain) organizeCards(myPlayer.pool, 'cmc');
            if (hasSide) setSideboard(myPlayer.sideboard!);
        } finally {
            setLoading(false);
        }
      } else setLoading(false);
    };
    loadData();
  }, [myPlayer?.clientId]); 

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showLandPicker && landPickerRef.current && !landPickerRef.current.contains(event.target as Node) && !landButtonRef.current?.contains(event.target as Node)) {
        setShowLandPicker(false);
      }
      if (isSortMenuOpen && sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
         setIsSortMenuOpen(false);
      }
      if (activeTooltip) {
          setActiveTooltip(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showLandPicker, isSortMenuOpen, activeTooltip]);

  const startResizingSideboard = useCallback((e: React.MouseEvent) => { setIsResizingSideboard(true); e.preventDefault(); }, []);

  useEffect(() => {
    const stopResizing = () => setIsResizingSideboard(false);
    const resize = (e: MouseEvent) => {
        if (isResizingSideboard) {
            const newHeight = window.innerHeight - e.clientY;
            if (newHeight >= 140 && newHeight < window.innerHeight * 0.7) setSideboardHeight(newHeight);
        }
    };
    if (isResizingSideboard) { window.addEventListener('mousemove', resize); window.addEventListener('mouseup', stopResizing); }
    return () => { window.removeEventListener('mousemove', resize); window.removeEventListener('mouseup', stopResizing); }
  }, [isResizingSideboard]);

  useEffect(() => {
      if (dragGhost?.active) {
          autoScrollInterval.current = window.setInterval(() => {
              if (!currentTouchPos.current || !scrollContainerRef.current) return;
              const { x, y } = currentTouchPos.current;
              const container = scrollContainerRef.current;
              const { left, right, top, bottom } = container.getBoundingClientRect();
              
              const threshold = 80; 
              const speed = 20;

              if (x < left + threshold) {
                  container.scrollLeft -= speed;
              } else if (x > right - threshold) {
                  container.scrollLeft += speed;
              }

              if (y < top + threshold) {
                  container.scrollTop -= speed;
              } else if (y > bottom - threshold) {
                  container.scrollTop += speed;
              }
          }, 30); 
      } else if (autoScrollInterval.current) { 
          clearInterval(autoScrollInterval.current); 
          autoScrollInterval.current = null; 
      }
      return () => { if (autoScrollInterval.current) clearInterval(autoScrollInterval.current); };
  }, [dragGhost?.active]);

  const showToast = (msg: string) => { setToastMessage(msg); setTimeout(() => setToastMessage(null), 3000); };

  const organizeCards = (cards: Card[], mode: 'cmc' | 'color' | 'type') => {
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
      const buckets: Record<string, Card[]> = {
          'Creature': [], 'Planeswalker': [], 'Instant': [], 'Sorcery': [],
          'Enchantment': [], 'Artifact': [], 'Land': [], 'Other': []
      };

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

      // Sort inside buckets by CMC then Name
      Object.keys(buckets).forEach(key => {
          buckets[key].sort((a, b) => {
              if ((a.cmc || 0) !== (b.cmc || 0)) return (a.cmc || 0) - (b.cmc || 0);
              return a.name.localeCompare(b.name);
          });
      });

      newColumns = TYPES_ORDER
        .map(key => ({ id: key, title: '', cards: buckets[key] }))
        .filter(col => col.cards.length > 0);
        
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
  };

  const handleSortAction = (mode: 'cmc' | 'color' | 'type') => { 
      const allMainCards = columns.flatMap(c => c.cards); 
      organizeCards(allMainCards, mode); 
      setIsSortMenuOpen(false);
  };

  const colorMatrixData = useMemo(() => {
      const allCards = columns.flatMap(c => c.cards);
      const matrix: Record<string, Record<string, Card[]>> = {};
      
      COLORS_ORDER.forEach(color => {
          matrix[color] = {};
          CMC_ORDER.forEach(cmc => {
              matrix[color][cmc] = [];
          });
      });

      allCards.forEach(card => {
          let row = 'Colorless';
          if (card.type_line?.toLowerCase().includes('land')) row = 'Land';
          else if (!card.colors || card.colors.length === 0) row = 'Colorless';
          else if (card.colors.length > 1) row = 'Multicolor';
          else {
              const colorMap: Record<string, string> = { 'W': 'White', 'U': 'Blue', 'B': 'Black', 'R': 'Red', 'G': 'Green' };
              row = colorMap[card.colors[0]] || 'Colorless';
          }

          let col = '0';
          const cmc = card.cmc || 0;
          if (cmc >= 7) col = '7+';
          else col = cmc.toString();

          if (matrix[row] && matrix[row][col]) {
              matrix[row][col].push(card);
          }
      });

      return matrix;
  }, [columns]);

  const typeMatrixData = useMemo(() => {
    const allCards = columns.flatMap(c => c.cards);
    const matrix: Record<string, Record<string, Card[]>> = {};
    
    TYPES_ORDER.forEach(type => {
        matrix[type] = {};
        CMC_ORDER.forEach(cmc => {
            matrix[type][cmc] = [];
        });
    });

    const getCardType = (card: Card): string => {
        const tl = card.type_line?.toLowerCase() || '';
        if (tl.includes('creature')) return 'Creature';
        if (tl.includes('planeswalker')) return 'Planeswalker';
        if (tl.includes('instant')) return 'Instant';
        if (tl.includes('sorcery')) return 'Sorcery';
        if (tl.includes('enchantment')) return 'Enchantment';
        if (tl.includes('artifact')) return 'Artifact';
        if (tl.includes('land')) return 'Land';
        return 'Other';
    };

    allCards.forEach(card => {
        const row = getCardType(card);
        let col = '0';
        const cmc = card.cmc || 0;
        if (cmc >= 7) col = '7+';
        else col = cmc.toString();

        if (matrix[row] && matrix[row][col]) {
            matrix[row][col].push(card);
        }
    });

    return matrix;
  }, [columns]);

  const getLandCount = (type: string) => { let count = 0; columns.forEach(col => { col.cards.forEach(c => { if (c.name === type) count++; }); }); return count; };

  const updateLandCount = (type: string, delta: number) => {
      if (delta > 0) {
          const newCard: Card = { id: `basic-${type}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, name: type, type_line: 'Basic Land', cmc: 0, mana_cost: '', colors: [] };
          if (type === 'Plains' ) newCard.colors = ['W']; if (type === 'Island') newCard.colors = ['U']; if (type === 'Swamp') newCard.colors = ['B']; if (type === 'Mountain') newCard.colors = ['R']; if (type === 'Forest') newCard.colors = ['G'];
          setColumns(prev => {
              const newCols = [...prev];
              const landColIdx = newCols.findIndex(c => c.id === 'Land');
              if (landColIdx !== -1) newCols[landColIdx].cards.push(newCard); else newCols[newCols.length - 1].cards.push(newCard);
              return newCols;
          });
      } else {
          setColumns(prev => {
              const newCols = prev.map(c => ({...c, cards: [...c.cards]}));
              const landColIdx = newCols.findIndex(c => c.id === 'Land');
              if (landColIdx !== -1) { const cardIdx = newCols[landColIdx].cards.findIndex(c => c.name === type); if (cardIdx !== -1) newCols[landColIdx].cards.splice(cardIdx, 1); }
              return newCols;
          });
      }
  };

  const getSimpleList = (cards: Card[]) => {
      const counts: Record<string, number> = {};
      cards.forEach(c => { counts[c.name] = (counts[c.name] || 0) + 1; });
      return Object.entries(counts).sort((a,b) => a[0].localeCompare(b[0])).map(([name, count]) => `${count} ${name}`).join('\n');
  };

  const downloadFile = (content: string, prefix: string) => {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${prefix}-${new Date().toISOString().slice(0,10)}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleExportDetailed = () => {
      const allMain = columns.flatMap(c => c.cards);
      
      const formatGroupedList = (cards: Card[]) => {
          const buckets: Record<string, Card[]> = {
            'White': [], 'Blue': [], 'Black': [], 'Red': [], 'Green': [],
            'Multicolor': [], 'Colorless': [], 'Land': []
          };

          cards.forEach(card => {
            const isLand = card.type_line?.toLowerCase().includes('land');
            if (isLand) {
              buckets['Land'].push(card);
            } else if (!card.colors || card.colors.length === 0) {
              buckets['Colorless'].push(card);
            } else if (card.colors.length > 1) {
              buckets['Multicolor'].push(card);
            } else {
              const color = card.colors[0];
              if (color === 'W') buckets['White'].push(card);
              else if (color === 'U') buckets['Blue'].push(card);
              else if (color === 'B') buckets['Black'].push(card);
              else if (color === 'R') buckets['Red'].push(card);
              else if (color === 'G') buckets['Green'].push(card);
              else buckets['Colorless'].push(card);
            }
          });

          let sectionContent = "";
          const order = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless', 'Land'];
          
          order.forEach(colorName => {
            const bucketCards = buckets[colorName];
            if (bucketCards.length > 0) {
              bucketCards.sort((a, b) => {
                const cmcA = a.cmc ?? 0;
                const cmcB = b.cmc ?? 0;
                if (cmcA !== cmcB) return cmcA - cmcB;
                return a.name.localeCompare(b.name);
              });

              sectionContent += `// --- ${colorName} ---\n`;
              let lastCMC: number | null = null;
              bucketCards.forEach(c => {
                const currentCMC = c.cmc ?? 0;
                if (currentCMC !== lastCMC && !c.type_line?.toLowerCase().includes('land')) {
                  sectionContent += `// CMC ${currentCMC}\n`;
                  lastCMC = currentCMC;
                }
                sectionContent += `1 ${c.name}\n`;
              });
              sectionContent += "\n";
            }
          });
          return sectionContent;
      };

      let finalContent = "// Decklist exported from CubeDraft Simulator\n\n";
      finalContent += "// ==========================================\n";
      finalContent += "//               MAINBOARD\n";
      finalContent += "// ==========================================\n\n";
      finalContent += formatGroupedList(allMain);
      
      if (sideboard.length > 0) {
          finalContent += "\n// ==========================================\n";
          finalContent += "//               SIDEBOARD\n";
          finalContent += "// ==========================================\n\n";
          finalContent += formatGroupedList(sideboard);
      }

      downloadFile(finalContent, "decklist-detailed");
      setShowExportModal(false);
  };

  const handleExportSimple = () => {
      const allMain = columns.flatMap(c => c.cards);
      let content = getSimpleList(allMain);
      
      if (sideboard.length > 0) {
          content += "\n\n" + getSimpleList(sideboard);
      }

      downloadFile(content, "decklist-simple");
      setShowExportModal(false);
  };

  const handleExitClick = () => {
    showConfirm(
      "Start New Draft?",
      "Are you sure you want to leave this deck? Unsaved changes will be lost. Make sure to export your list first if you want to keep it.",
      () => onProceed()
    );
  };

  const executeCardMove = (cardId: string, sourceType: string, sourceContainerId: string, targetColId: string, targetCardId: string | null) => {
      if (isMatrixView) return; // Prevent move during Matrix view
      if (cardId === targetCardId) return;

      let card: Card | undefined;
      if (sourceType === 'sb') { card = sideboard.find(c => c.id === cardId); if (!card) return; } 
      else { const sourceCol = columns.find(c => c.id === sourceContainerId); card = sourceCol?.cards.find(c => c.id === cardId); if (!card) return; }

      if (targetColId === 'SIDEBOARD') { if (card.type_line && card.type_line.includes('Basic Land')) { showToast("Cannot move Basic Lands to Sideboard!"); return; } }

      if (sourceType === 'sb') setSideboard(prev => prev.filter(c => c.id !== cardId));
      else {
          setColumns(prev => {
             const newCols = prev.map(c => ({...c, cards: [...c.cards]}));
             const srcColIdx = newCols.findIndex(c => c.id === sourceContainerId);
             if (srcColIdx !== -1) newCols[srcColIdx].cards = newCols[srcColIdx].cards.filter(c => c.id !== cardId);
             return newCols;
          });
      }

      if (targetColId === 'SIDEBOARD') {
          setSideboard(prev => {
              const newSb = [...prev];
              if (targetCardId) {
                  const idx = newSb.findIndex(c => c.id === targetCardId);
                  if (idx !== -1) newSb.splice(idx, 0, card!);
                  else newSb.push(card!);
              } else {
                  newSb.push(card!);
              }
              return newSb;
          });
      }
      else {
          setColumns(prev => {
              const newCols = prev.map(c => ({...c, cards: [...c.cards]}));
              const targetColIdx = newCols.findIndex(c => c.id === targetColId);
              if (targetColIdx !== -1) {
                  if (targetCardId) {
                      const insertIdx = newCols[targetColIdx].cards.findIndex(c => c.id === targetCardId);
                      if (insertIdx !== -1) newCols[targetColIdx].cards.splice(insertIdx, 0, card!); else newCols[targetColIdx].cards.push(card!);
                  } else newCols[targetColIdx].cards.push(card!);
              }
              return newCols;
          });
      }
  };

  const handleDragStart = (e: React.DragEvent, source: 'col' | 'sb', containerId: string, cardId: string) => {
    if (isMatrixView) {
        e.preventDefault();
        return;
    }
    e.dataTransfer.setData("sourceType", source); 
    e.dataTransfer.setData("containerId", containerId); 
    e.dataTransfer.setData("cardId", cardId); 
    e.dataTransfer.effectAllowed = "move";
    
    // Crucial: use a small timeout to allow the browser to capture the ghost image before we hide the source
    setTimeout(() => {
        setNativeDraggingId(cardId);
    }, 0);
  };

  const handleDragEnd = () => {
    setNativeDraggingId(null);
  };
  
  const handleDragOverContainer = (e: React.DragEvent, containerId: string) => {
      if (isMatrixView) return;
      e.preventDefault(); 
      if (activeDropTarget !== containerId) {
          setActiveDropTarget(containerId);
      }
  };

  const handleDragOver = (e: React.DragEvent) => { 
      if (!isMatrixView) e.preventDefault(); 
  };
  
  const handleDropOnCard = (e: React.DragEvent, targetColId: string, targetCardId: string) => {
      if (isMatrixView) return;
      e.stopPropagation(); e.preventDefault();
      setActiveDropTarget(null);
      setNativeDraggingId(null);
      const cardId = e.dataTransfer.getData("cardId"); const sourceType = e.dataTransfer.getData("sourceType"); const sourceContainerId = e.dataTransfer.getData("containerId");
      executeCardMove(cardId, sourceType, sourceContainerId, targetColId, targetCardId);
  };

  const handleDropOnSideboardCard = (e: React.DragEvent, targetCardId: string) => {
      if (isMatrixView) return;
      e.stopPropagation(); e.preventDefault();
      setActiveDropTarget(null);
      setNativeDraggingId(null);
      const cardId = e.dataTransfer.getData("cardId"); const sourceType = e.dataTransfer.getData("sourceType"); const sourceContainerId = e.dataTransfer.getData("containerId");
      executeCardMove(cardId, sourceType, sourceContainerId, 'SIDEBOARD', targetCardId);
  };

  const handleDropOnColumn = (e: React.DragEvent, targetColId: string) => {
      if (isMatrixView) return;
      e.preventDefault();
      setActiveDropTarget(null);
      setNativeDraggingId(null);
      const cardId = e.dataTransfer.getData("cardId"); const sourceType = e.dataTransfer.getData("sourceType"); const sourceContainerId = e.dataTransfer.getData("containerId");
      executeCardMove(cardId, sourceType, sourceContainerId, targetColId, null);
  };
  const handleDropOnSideboard = (e: React.DragEvent) => {
      if (isMatrixView) return;
      e.preventDefault();
      setActiveDropTarget(null);
      setNativeDraggingId(null);
      const cardId = e.dataTransfer.getData("cardId"); const sourceType = e.dataTransfer.getData("sourceType"); const sourceContainerId = e.dataTransfer.getData("containerId");
      executeCardMove(cardId, sourceType, sourceContainerId, 'SIDEBOARD', null);
  };

  const handleTouchStart = (e: React.TouchEvent, source: 'col' | 'sb', containerId: string, card: Card) => {
      if (isMatrixView || e.touches.length > 1) return; 
      const touch = e.touches[0]; 
      touchStartPos.current = { x: touch.clientX, y: touch.clientY }; 
      currentTouchPos.current = { x: touch.clientX, y: touch.clientY };
      
      if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
      
      longPressTimer.current = window.setTimeout(() => { 
          if (navigator.vibrate) navigator.vibrate(40); 
          setDragGhost({ active: true, x: touch.clientX, y: touch.clientY, card, sourceType: source, containerId }); 
      }, 400); // 400ms for long-press
  };

  const handleTouchMove = (e: React.TouchEvent) => {
      if (isMatrixView) return;
      if (e.touches && e.touches.length > 0) currentTouchPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      
      if (dragGhost?.active && e.touches && e.touches.length > 0) { 
        if (e.cancelable) e.preventDefault(); 
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        setDragGhost(prev => prev ? { ...prev, x: touchX, y: touchY } : null); 

        const target = document.elementFromPoint(touchX, touchY);
        if (target) {
            const dropContainer = target.closest('[data-drop-id]');
            if (dropContainer) {
                const dropId = dropContainer.getAttribute('data-drop-id');
                if (dropId && activeDropTarget !== dropId) setActiveDropTarget(dropId);
            } else if (activeDropTarget !== null) {
                setActiveDropTarget(null);
            }
        }
      } 
      else if (touchStartPos.current && e.touches && e.touches.length > 0) {
          const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x); 
          const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
          if (dx > 10 || dy > 10) { 
              if (longPressTimer.current) { 
                  window.clearTimeout(longPressTimer.current); 
                  longPressTimer.current = null; 
              } 
          }
      }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (isMatrixView) return;
      if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      touchStartPos.current = null; currentTouchPos.current = null;
      setActiveDropTarget(null);
      if (dragGhost?.active && e.changedTouches && e.changedTouches.length > 0) {
          const touch = e.changedTouches[0]; const target = document.elementFromPoint(touch.clientX, touch.clientY);
          if (target) {
              const sbContainer = target.closest('[data-drop-id="SIDEBOARD"]');
              if (sbContainer) {
                   const cardTarget = target.closest('[data-card-id-sb]'); 
                   const targetCardId = cardTarget ? cardTarget.getAttribute('data-card-id-sb') : null;
                   executeCardMove(dragGhost.card.id, dragGhost.sourceType, dragGhost.containerId, 'SIDEBOARD', targetCardId);
              }
              else {
                  const colContainer = target.closest('[data-drop-id]');
                  if (colContainer) {
                      const targetColId = colContainer.getAttribute('data-drop-id');
                      if (targetColId && targetColId !== 'SIDEBOARD') {
                          const cardTarget = target.closest('[data-card-id]'); const targetCardId = cardTarget ? cardTarget.getAttribute('data-card-id') : null;
                          executeCardMove(dragGhost.card.id, dragGhost.sourceType, dragGhost.containerId, targetColId, targetCardId);
                      }
                  }
              }
          }
          setDragGhost(null);
      }
  };

  const totalMainDeck = columns.reduce((a,c) => a + c.cards.length, 0);

  // Sideboard row calculation
  const sbHeaderHeight = 36;
  const sbPadding = 16;
  const sbContentHeight = sideboardHeight - sbHeaderHeight - sbPadding;
  const minCardHeight = 120; // Increased to ensure cards aren't too small when switching to 2 rows
  // STRICTLY LIMIT TO 2 ROWS MAX
  const sbRows = Math.max(1, Math.min(2, Math.floor(sbContentHeight / minCardHeight)));

  if (loading) { return <div className="flex flex-col items-center justify-center h-full"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div><p className="text-slate-400">Organizing your pool...</p></div>; }

  const getMTGInitial = (color: string) => {
    switch(color) {
        case 'White': return 'W';
        case 'Blue': return 'U';
        case 'Black': return 'B';
        case 'Red': return 'R';
        case 'Green': return 'G';
        case 'Multicolor': return 'M';
        case 'Colorless': return 'C';
        case 'Land': return 'L';
        default: return color.charAt(0);
    }
  };

  const getMTGColorStyle = (color: string) => {
    switch(color) {
        case 'White': return 'bg-[#f8f6d8] text-[#1a1a1a]';
        case 'Blue': return 'bg-[#0e68ab] text-white';
        case 'Black': return 'bg-[#150b00] text-white';
        case 'Red': return 'bg-[#d3202a] text-white';
        case 'Green': return 'bg-[#00733e] text-white';
        case 'Multicolor': return 'bg-gradient-to-br from-yellow-400 via-red-500 to-blue-600 text-white';
        case 'Colorless': return 'bg-[#90adbb] text-slate-900';
        default: return 'bg-slate-500 text-white';
    }
  };

  const getTypeInitial = (type: string) => {
    switch(type) {
        case 'Creature': return 'CR';
        case 'Planeswalker': return 'PW';
        case 'Instant': return 'IN';
        case 'Sorcery': return 'SO';
        case 'Enchantment': return 'EN';
        case 'Artifact': return 'AR';
        case 'Land': return 'LA';
        default: return 'OT';
    }
  };

  const getTypeColorStyle = (type: string) => {
    switch(type) {
        case 'Creature': return 'bg-orange-700 text-white';
        case 'Planeswalker': return 'bg-fuchsia-700 text-white';
        case 'Instant': return 'bg-sky-600 text-white';
        case 'Sorcery': return 'bg-rose-600 text-white';
        case 'Enchantment': return 'bg-teal-600 text-white';
        case 'Artifact': return 'bg-slate-500 text-white';
        case 'Land': return 'bg-amber-800 text-white';
        default: return 'bg-slate-700 text-slate-300';
    }
  };

  const renderNormalView = () => (
    <div className="flex min-h-full gap-4 min-w-max items-stretch">
        {columns.map((col) => (
            <div key={col.id} data-drop-id={col.id} 
               className={`w-[170px] flex flex-col shrink-0 transition-all duration-200 rounded-lg ${activeDropTarget === col.id ? 'ring-2 ring-blue-500 bg-blue-500/10' : ''}`} 
               onDragOver={(e) => handleDragOverContainer(e, col.id)} 
               onDragLeave={() => setActiveDropTarget(null)}
               onDrop={(e) => handleDropOnColumn(e, col.id)}>
                <div className="h-6 mb-2 flex items-center justify-center bg-slate-800/80 rounded border border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky top-0 z-10 backdrop-blur-sm pointer-events-none">{col.cards.length}</div>
                <div className="relative rounded-lg transition-colors pb-10 flex-1 min-h-full">
                   <div className={`w-full relative transition-all ${!isStackedView ? 'flex flex-col gap-2 p-1' : ''}`} style={{ height: isStackedView ? `${Math.max(200, (col.cards.length * STACK_OFFSET) + CARD_HEIGHT)}px` : 'auto' }}>
                       {col.cards.map((card, index) => {
                           const isSourceOfDragging = (dragGhost?.active && dragGhost.card.id === card.id) || (nativeDraggingId === card.id);
                           return (
                               <div key={card.id} 
                                   data-card-id={card.id} 
                                   draggable={!isMatrixView} 
                                   onDragStart={(e) => handleDragStart(e, 'col', col.id, card.id)} 
                                   onDragEnd={handleDragEnd} 
                                   onDrop={(e) => handleDropOnCard(e, col.id, card.id)} 
                                   onDragOver={handleDragOver} 
                                   onTouchStart={(e) => handleTouchStart(e, 'col', col.id, card)} 
                                   onTouchMove={handleTouchMove} 
                                   onTouchEnd={handleTouchEnd} 
                                   onClick={() => !dragGhost && setZoomedCard(card)} 
                                   className={`
                                       ${isStackedView ? 'absolute left-1 right-1' : 'relative w-full'} 
                                       cursor-grab active:cursor-grabbing hover:z-[50] transition-all hover:-translate-y-1 shadow-md rounded-lg overflow-hidden 
                                       ${dragGhost ? 'touch-none' : 'touch-auto'} 
                                       ${isSourceOfDragging ? 'opacity-0 pointer-events-none' : 'opacity-100'}
                                   `} 
                                   style={{ 
                                       top: isStackedView ? `${index * STACK_OFFSET}px` : 'auto', 
                                       height: `${CARD_HEIGHT}px`, 
                                       zIndex: isStackedView ? index : 'auto' 
                                   }}
                               >
                                   <div className="w-full h-full relative group pointer-events-none">
                                       <CardImage name={card.name} hoverEffect={false} className="w-full h-full object-cover rounded-lg" />
                                   </div>
                               </div>
                           );
                       })}
                   </div>
                </div>
            </div>
        ))}
    </div>
  );

  const renderColorMatrixView = () => {
    const visibleColors = COLORS_ORDER.filter(color => 
        color !== 'Land' && 
        CMC_ORDER.some(cmc => colorMatrixData[color][cmc].length > 0)
    );

    if (visibleColors.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 p-8">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="font-medium italic">No colored cards found in mainboard.</p>
            </div>
        );
    }

    return (
    <div className="min-w-max p-4 overflow-auto scrollbar-thin">
        <div className="grid border-r border-b border-slate-500" style={{ gridTemplateColumns: `80px repeat(${CMC_ORDER.length}, auto)` }}>
            {/* Header Row */}
            <div className="h-8 border-l border-t border-slate-500 bg-slate-950/80"></div>
            {CMC_ORDER.map(cmc => (
                <div key={cmc} className="h-8 flex items-center justify-center bg-slate-800 border-l border-t border-slate-500 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">
                    CMC {cmc}
                </div>
            ))}

            {/* Matrix Rows */}
            {visibleColors.map(color => {
                const initial = getMTGInitial(color);
                const fullName = FULL_COLOR_NAMES[initial] || color;
                return (
                <React.Fragment key={color}>
                    <div className="flex items-center justify-center p-2 bg-slate-800 border-l border-t border-slate-500 sticky left-0 z-10 backdrop-blur-md relative">
                        <div 
                            onClick={(e) => { e.stopPropagation(); setActiveTooltip(fullName); }}
                            className={`w-10 h-10 rounded-full shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex items-center justify-center text-sm font-black border-2 border-slate-900/40 transition-transform hover:scale-105 cursor-help ${getMTGColorStyle(color)}`}
                        >
                            {initial}
                        </div>
                        {activeTooltip === fullName && (
                            <div className="absolute left-full ml-2 px-3 py-1 bg-blue-600 text-white text-[10px] font-bold uppercase rounded shadow-xl z-50 whitespace-nowrap animate-fade-in pointer-events-none ring-2 ring-white/20">
                                {fullName}
                                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-blue-600 rotate-45"></div>
                            </div>
                        )}
                    </div>
                    {CMC_ORDER.map(cmc => {
                        const cards = colorMatrixData[color][cmc];
                        return (
                            <div key={`${color}-${cmc}`} className="p-1 bg-slate-900/60 border-l border-t border-slate-500 flex flex-wrap gap-1 content-start items-start transition-colors hover:bg-slate-800/40">
                                {cards.map(card => (
                                    <div 
                                        key={card.id} 
                                        className="w-[50px] md:w-[65px] h-auto aspect-[2.5/3.5] cursor-pointer hover:scale-105 active:scale-95 transition-transform relative group"
                                        onClick={() => setZoomedCard(card)}
                                    >
                                        <CardImage name={card.name} hoverEffect={false} className="rounded shadow-md border border-slate-700/50" />
                                        <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/10 transition-colors pointer-events-none rounded"></div>
                                    </div>
                                ))}
                                {cards.length === 0 && <div className="w-[50px] md:w-[65px] h-auto aspect-[2.5/3.5] invisible"></div>}
                            </div>
                        );
                    })}
                </React.Fragment>
            )})}
        </div>
    </div>
    );
  };

  const renderTypeMatrixView = () => {
    const visibleTypes = TYPES_ORDER.filter(t => 
        t !== 'Land' && 
        CMC_ORDER.some(cmc => typeMatrixData[t][cmc].length > 0)
    );

    if (visibleTypes.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 p-8">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <p className="font-medium italic">No non-land cards found in mainboard.</p>
            </div>
        );
    }

    return (
    <div className="min-w-max p-4 overflow-auto scrollbar-thin">
        <div className="grid border-r border-b border-slate-500" style={{ gridTemplateColumns: `80px repeat(${CMC_ORDER.length}, auto)` }}>
            {/* Header Row */}
            <div className="h-8 border-l border-t border-slate-500 bg-slate-950/80"></div>
            {CMC_ORDER.map(cmc => (
                <div key={cmc} className="h-8 flex items-center justify-center bg-slate-800 border-l border-t border-slate-500 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">
                    CMC {cmc}
                </div>
            ))}

            {/* Matrix Rows */}
            {visibleTypes.map(type => {
                const initial = getTypeInitial(type);
                const fullName = FULL_TYPE_NAMES[initial] || type;
                return (
                <React.Fragment key={type}>
                    <div className="flex items-center justify-center p-2 bg-slate-800 border-l border-t border-slate-500 sticky left-0 z-10 backdrop-blur-md relative">
                        <div 
                            onClick={(e) => { e.stopPropagation(); setActiveTooltip(fullName); }}
                            className={`w-10 h-10 rounded-full shrink-0 shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex items-center justify-center text-[10px] font-black border-2 border-slate-900/40 transition-transform hover:scale-105 cursor-help ${getTypeColorStyle(type)}`}
                        >
                            {initial}
                        </div>
                        {activeTooltip === fullName && (
                            <div className="absolute left-full ml-2 px-3 py-1 bg-blue-600 text-white text-[10px] font-bold uppercase rounded shadow-xl z-50 whitespace-nowrap animate-fade-in pointer-events-none ring-2 ring-white/20">
                                {fullName}
                                <div className="absolute top-1/2 -left-1 -translate-y-1/2 w-2 h-2 bg-blue-600 rotate-45"></div>
                            </div>
                        )}
                    </div>
                    {CMC_ORDER.map(cmc => {
                        const cards = typeMatrixData[type][cmc];
                        return (
                            <div key={`${type}-${cmc}`} className="p-1 bg-slate-900/60 border-l border-t border-slate-500 flex flex-wrap gap-1 content-start items-start transition-colors hover:bg-slate-800/40">
                                {cards.map(card => (
                                    <div 
                                        key={card.id} 
                                        className="w-[50px] md:w-[65px] h-auto aspect-[2.5/3.5] cursor-pointer hover:scale-105 active:scale-95 transition-transform relative group"
                                        onClick={() => setZoomedCard(card)}
                                    >
                                        <CardImage name={card.name} hoverEffect={false} className="rounded shadow-md border border-slate-700/50" />
                                        <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/10 transition-colors pointer-events-none rounded"></div>
                                    </div>
                                ))}
                                {cards.length === 0 && <div className="w-[50px] md:w-[65px] h-auto aspect-[2.5/3.5] invisible"></div>}
                            </div>
                        );
                    })}
                </React.Fragment>
            )})}
        </div>
    </div>
    );
  };

  return (
    <div className={`flex flex-col h-full bg-slate-900 overflow-hidden relative ${dragGhost?.active ? 'dragging-active' : ''}`}>
      {toastMessage && <div className="absolute bottom-60 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-lg shadow-2xl z-[150] animate-bounce font-bold border border-red-400 w-max max-w-[90vw] text-center">{toastMessage}</div>}
      
      {/* Export Format Modal */}
      {showExportModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden p-6 text-center">
                  <h3 className="text-xl font-bold text-white mb-2">Export Decklist</h3>
                  <p className="text-slate-400 text-sm mb-6">Choose the format you prefer.</p>
                  <div className="flex flex-col gap-3">
                      <button 
                        onClick={handleExportDetailed} 
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                          <span>Detailed Format</span>
                          <span className="text-[10px] bg-blue-800 px-1.5 py-0.5 rounded text-blue-200">Cockatrice / App</span>
                      </button>
                      <button 
                        onClick={handleExportSimple} 
                        className="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                          <span>Simple Format</span>
                          <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-400">MTGO / Arena</span>
                      </button>
                  </div>
                  <button onClick={() => setShowExportModal(false)} className="mt-4 text-slate-500 hover:text-white text-sm">Cancel</button>
              </div>
          </div>
      )}

      {/* Ghost Card for TOUCH mode */}
      {dragGhost?.active && (
        <div 
            className="fixed z-[200] pointer-events-none opacity-90 shadow-[0_20px_60px_rgba(0,0,0,0.8)] scale-110" 
            style={{ 
                left: dragGhost.x, 
                top: dragGhost.y, 
                width: '140px', 
                marginTop: '-90px', 
                marginLeft: '-70px' 
            }}
        >
            <CardImage name={dragGhost.card.name} hoverEffect={false} className="rounded-xl border-4 border-blue-500 shadow-2xl" />
        </div>
      )}

      <div className="flex items-center justify-between p-3 bg-slate-800 border-b border-slate-700 shrink-0 z-20 shadow-md">
         <div className="flex items-center gap-2 md:gap-4">
             <h1 className="text-lg font-bold text-white hidden sm:block">Deck Builder</h1>

             <div className="flex items-center bg-slate-900/50 rounded p-0.5 border border-slate-700">
                {/* Mobile View Selector */}
                <div className="md:hidden relative flex items-center bg-slate-700/30 rounded px-2">
                    <select 
                        value={matrixMode} 
                        onChange={(e) => setMatrixMode(e.target.value as MatrixMode)}
                        className="bg-transparent text-[10px] font-black uppercase text-blue-400 py-1 pr-6 outline-none border-none focus:ring-0 appearance-none cursor-pointer"
                    >
                        <option value="none" className="bg-slate-800 text-white">Pool</option>
                        <option value="color" className="bg-slate-800 text-white">Color</option>
                        <option value="type" className="bg-slate-800 text-white">Type</option>
                    </select>
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                        <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </div>
                </div>

                {/* Desktop View Buttons */}
                <div className="hidden md:flex">
                    <button 
                        onClick={() => setMatrixMode('none')}
                        className={`px-3 py-1 rounded text-[10px] font-black uppercase transition-all ${matrixMode === 'none' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Pool
                    </button>
                    <button 
                        onClick={() => setMatrixMode('color')}
                        className={`px-3 py-1 rounded text-[10px] font-black uppercase transition-all ${matrixMode === 'color' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Color
                    </button>
                    <button 
                        onClick={() => setMatrixMode('type')}
                        className={`px-3 py-1 rounded text-[10px] font-black uppercase transition-all ${matrixMode === 'type' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Type
                    </button>
                </div>
             </div>
             
             {!isMatrixView && (
                 <div className="relative" ref={sortMenuRef}>
                     <button onClick={() => setIsSortMenuOpen(!isSortMenuOpen)} className="px-3 py-1 rounded text-xs font-bold border border-slate-600 text-slate-400 hover:text-white flex items-center gap-1 transition-colors min-h-[26px]">
                        <span className="md:hidden"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg></span>
                        <span className="hidden md:flex items-center gap-1">Sort Cards ▾</span>
                     </button>
                     {isSortMenuOpen && (
                        <>
                            <div className="fixed inset-0 bg-black/80 z-[90] md:hidden" onClick={() => setIsSortMenuOpen(false)}></div>
                            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-64 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-fade-in md:absolute md:top-full md:left-0 md:translate-x-0 md:translate-y-0 md:w-40 md:mt-1 md:z-50 md:rounded-lg">
                                <div className="flex justify-between items-center p-3 border-b border-slate-700 bg-slate-900/50 md:hidden">
                                    <span className="text-xs font-bold text-slate-400 uppercase">Sort Deck By</span>
                                    <button onClick={() => setIsSortMenuOpen(false)} className="text-slate-400 hover:text-white">✕</button>
                                </div>
                                <button onClick={() => handleSortAction('cmc')} className="text-left px-4 py-3 md:py-2 text-sm md:text-xs hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border-b border-slate-700/50">By CMC</button>
                                <button onClick={() => handleSortAction('color')} className="text-left px-4 py-3 md:py-2 text-sm md:text-xs hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border-b border-slate-700/50">By Color</button>
                                <button onClick={() => handleSortAction('type')} className="text-left px-4 py-3 md:py-2 text-sm md:text-xs hover:bg-slate-700 text-slate-300 hover:text-white transition-colors">By Type</button>
                            </div>
                        </>
                     )}
                 </div>
             )}

             {!isMatrixView && (
                 <div className="relative">
                     <button ref={landButtonRef} onClick={() => setShowLandPicker(!showLandPicker)} className={`px-3 py-1 rounded text-xs font-bold border transition-colors min-h-[26px] ${showLandPicker ? 'bg-slate-700 border-slate-500 text-white' : 'border-slate-600 text-slate-400 hover:text-white'}`}>
                        <span className="md:hidden">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </span>
                        <span className="hidden md:inline">+ Basic Lands</span>
                     </button>
                     {showLandPicker && (
                         <>
                            <div className="fixed inset-0 bg-black/80 z-[90] lg:hidden" onClick={() => setShowLandPicker(false)}></div>
                            <div ref={landPickerRef} className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4 z-[95] animate-fade-in fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] max-w-sm lg:absolute lg:top-full lg:left-0 lg:translate-x-0 lg:translate-y-0 lg:w-64 lg:mt-2">
                                <div className="flex justify-between items-center mb-3"><h4 className="text-xs font-bold text-slate-400 uppercase">Add Lands to Deck</h4><button onClick={() => setShowLandPicker(false)} className="lg:hidden text-slate-400 hover:text-white px-2">✕</button></div>
                                <div className="space-y-2 mb-2">
                                    {(['Plains', 'Island', 'Swamp', 'Mountain', 'Forest'] as const).map(type => {
                                        const currentCount = getLandCount(type);
                                        return (
                                            <div key={type} className="flex items-center justify-between">
                                                <span className="text-sm font-medium flex items-center gap-2"><div className={`w-3 h-3 rounded-full ${type === 'Plains' ? 'bg-yellow-100' : type === 'Island' ? 'bg-blue-500' : type === 'Swamp' ? 'bg-purple-900' : type === 'Mountain' ? 'bg-red-500' : 'bg-green-600'}`}></div>{type}</span>
                                                <div className="flex items-center gap-2"><button onClick={() => updateLandCount(type, -1)} className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center">-</button><span className="w-6 text-center text-sm font-mono">{currentCount}</span><button onClick={() => updateLandCount(type, 1)} className="w-6 h-6 rounded bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center">+</button></div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                         </>
                     )}
                 </div>
             )}

             {!isMatrixView && (
                 <button 
                    onClick={() => setIsStackedView(!isStackedView)}
                    className="px-3 py-1 rounded text-xs font-bold border border-slate-600 text-slate-400 hover:text-white flex items-center gap-1 transition-colors min-h-[26px]"
                    title={isStackedView ? "Switch to List View" : "Switch to Stacked View"}
                 >
                    <span className="md:hidden">
                        {isStackedView ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                        )}
                    </span>
                    <span className="hidden md:inline">{isStackedView ? "Spread" : "Collapse"}</span>
                 </button>
             )}
             
             <div className="text-xs text-slate-400 font-mono border-l border-slate-700 pl-4 flex flex-col md:flex-row md:items-center gap-0 md:gap-2 leading-none md:leading-normal">
                <span className="whitespace-nowrap">
                    <span className="hidden md:inline">Mainboard</span>
                    <span className="md:hidden">M</span>: <span className="text-white font-bold">{totalMainDeck}</span>
                </span>
                <span className="whitespace-nowrap">
                    <span className="hidden md:inline">Sideboard</span>
                    <span className="md:hidden">S</span>: {sideboard.length}
                </span>
             </div>

         </div>
         <div className="flex items-center gap-2 md:gap-4">
             <button onClick={() => setShowExportModal(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded text-xs font-bold flex items-center gap-1 min-h-[26px]">
                <span className="md:hidden"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></span>
                <span className="hidden md:inline">Export .txt</span>
             </button>
             <button onClick={handleExitClick} className="bg-slate-700 hover:bg-red-900/50 text-slate-300 hover:text-red-200 px-3 py-1 rounded text-xs font-bold border border-slate-600 hover:border-red-800 transition-all min-h-[26px]">
                <span className="md:hidden">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                </span>
                <span className="hidden md:inline">Exit</span>
             </button>
         </div>
      </div>

      <div 
        ref={scrollContainerRef} 
        className="flex-1 overflow-auto relative p-4 scrollbar-thin"
        style={{ paddingBottom: isMatrixView ? '0' : `${sideboardHeight}px` }}
      >
         {matrixMode === 'none' ? renderNormalView() : matrixMode === 'color' ? renderColorMatrixView() : renderTypeMatrixView()}
      </div>

      {!isMatrixView && (
        <div 
            className="absolute bottom-0 left-0 right-0 bg-slate-950/95 border-t-4 border-slate-700 z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] flex flex-col transition-all duration-100 ease-out"
            style={{ height: `${sideboardHeight}px` }}
            data-drop-id="SIDEBOARD"
            onDragOver={handleDragOverContainer ? (e) => handleDragOverContainer(e, 'SIDEBOARD') : undefined}
            onDragLeave={() => setActiveDropTarget(null)}
            onDrop={handleDropOnSideboard}
        >
            <div 
                className="w-full h-3 bg-slate-800 hover:bg-blue-600/50 cursor-ns-resize flex items-center justify-center shrink-0 transition-colors"
                onMouseDown={startResizingSideboard}
            >
                <div className="w-16 h-1 rounded-full bg-slate-600"></div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 flex gap-2 items-center">
                 <div className="shrink-0 w-8 h-full flex items-center justify-center border-r border-slate-800 mr-2">
                     <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest -rotate-90 whitespace-nowrap">Sideboard</span>
                 </div>
                 {sideboard.length === 0 && (
                     <div className="flex-1 flex items-center justify-center text-slate-600 italic text-sm border-2 border-dashed border-slate-800 rounded-lg h-full">
                         Drag cards here to move to sideboard
                     </div>
                 )}
                 {sideboard.map((card) => (
                     <div 
                        key={card.id}
                        data-card-id-sb={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, 'sb', 'SIDEBOARD', card.id)}
                        onDragEnd={handleDragEnd}
                        onDrop={(e) => handleDropOnSideboardCard(e, card.id)}
                        onDragOver={handleDragOver}
                        onTouchStart={(e) => handleTouchStart(e, 'sb', 'SIDEBOARD', card)}
                        onTouchMove={handleTouchMove} 
                        onTouchEnd={handleTouchEnd}
                        onClick={() => !dragGhost && setZoomedCard(card)}
                        className={`relative h-full aspect-[2.5/3.5] shrink-0 cursor-grab active:cursor-grabbing hover:-translate-y-2 transition-transform shadow-lg rounded-lg ${dragGhost?.active && dragGhost.card.id === card.id ? 'opacity-0' : 'opacity-100'}`}
                     >
                         <CardImage name={card.name} hoverEffect={false} className="w-full h-full object-cover rounded-lg" />
                     </div>
                 ))}
            </div>
        </div>
      )}

      {zoomedCard && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-8 animate-fade-in" onClick={() => setZoomedCard(null)}>
              <div className="relative max-w-sm w-full aspect-[2.5/3.5] shadow-2xl rounded-xl overflow-hidden transform scale-105 transition-transform">
                  <CardImage name={zoomedCard.name} hoverEffect={false} className="w-full h-full" />
              </div>
          </div>
      )}
    </div>
  );
};

export default RecapView;