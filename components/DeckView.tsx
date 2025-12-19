
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { DraftState, Card } from '../types';
import { enrichCardData } from '../services/cubeService';
import { useModal } from './ModalSystem';

// Modular Components
import DeckHeader from './deck/DeckHeader';
import SideboardBar from './deck/SideboardBar';
import DragGhost from './deck/DragGhost';
import ZoomOverlay from './deck/ZoomOverlay';
import ExportModal from './deck/ExportModal';
import NormalColumnView from './deck/views/NormalColumnView';
import MatrixView from './deck/views/MatrixView';

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

interface DragGhostState {
  active: boolean;
  x: number;
  y: number;
  card: Card;
  sourceType: 'col' | 'sb';
  containerId: string;
}

type MatrixMode = 'none' | 'color' | 'type';

const COLORS_ORDER = ['White', 'Blue', 'Black', 'Red', 'Green', 'Multicolor', 'Colorless', 'Land'];
const TYPES_ORDER = ['Creature', 'Planeswalker', 'Instant', 'Sorcery', 'Enchantment', 'Artifact', 'Land', 'Other'];
const CMC_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7+'];

const FULL_COLOR_NAMES: Record<string, string> = {
    'W': 'White', 'U': 'Blue', 'B': 'Black', 'R': 'Red', 'G': 'Green', 'M': 'Multicolor', 'C': 'Colorless', 'L': 'Land'
};

const FULL_TYPE_NAMES: Record<string, string> = {
    'CR': 'Creature', 'PW': 'Planeswalker', 'IN': 'Instant', 'SO': 'Sorcery', 'EN': 'Enchantment', 'AR': 'Artifact', 'LA': 'Land', 'OT': 'Other'
};

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

  return (
    <div className={`flex flex-col h-full bg-slate-900 overflow-hidden relative ${dragGhost?.active ? 'dragging-active' : ''}`}>
      {toastMessage && <div className="absolute bottom-60 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-3 rounded-lg shadow-2xl z-[150] animate-bounce font-bold border border-red-400 w-max max-w-[90vw] text-center">{toastMessage}</div>}
      
      {showExportModal && (
        <ExportModal 
            onExportDetailed={handleExportDetailed}
            onExportSimple={handleExportSimple}
            onClose={() => setShowExportModal(false)}
        />
      )}

      {dragGhost?.active && (
        <DragGhost x={dragGhost.x} y={dragGhost.y} card={dragGhost.card} />
      )}

      <DeckHeader 
        matrixMode={matrixMode}
        setMatrixMode={setMatrixMode}
        isSortMenuOpen={isSortMenuOpen}
        setIsSortMenuOpen={setIsSortMenuOpen}
        handleSortAction={handleSortAction}
        showLandPicker={showLandPicker}
        setShowLandPicker={setShowLandPicker}
        landButtonRef={landButtonRef}
        landPickerRef={landPickerRef}
        getLandCount={getLandCount}
        updateLandCount={updateLandCount}
        isStackedView={isStackedView}
        setIsStackedView={setIsStackedView}
        totalMainDeck={totalMainDeck}
        sideboardCount={sideboard.length}
        onExportClick={() => setShowExportModal(true)}
        onExitClick={handleExitClick}
        sortMenuRef={sortMenuRef}
      />

      <div 
        ref={scrollContainerRef} 
        className="flex-1 overflow-auto relative p-4 scrollbar-thin"
        style={{ paddingBottom: isMatrixView ? '0' : `${sideboardHeight}px` }}
      >
         {matrixMode === 'none' ? (
            <NormalColumnView 
                columns={columns}
                isStackedView={isStackedView}
                activeDropTarget={activeDropTarget}
                dragGhostActive={dragGhost?.active ?? false}
                dragGhostCardId={dragGhost?.card.id}
                nativeDraggingId={nativeDraggingId}
                setZoomedCard={setZoomedCard}
                setActiveDropTarget={setActiveDropTarget}
                handleDragStart={handleDragStart}
                handleDragEnd={handleDragEnd}
                handleDropOnCard={handleDropOnCard}
                handleDragOver={handleDragOver}
                handleDropOnColumn={handleDropOnColumn}
                handleDragOverContainer={handleDragOverContainer}
                handleTouchStart={handleTouchStart}
                handleTouchMove={handleTouchMove}
                handleTouchEnd={handleTouchEnd}
            />
         ) : matrixMode === 'color' ? (
             <MatrixView 
                matrixData={colorMatrixData}
                visibleRows={COLORS_ORDER.filter(color => color !== 'Land' && CMC_ORDER.some(cmc => colorMatrixData[color][cmc].length > 0))}
                cmcOrder={CMC_ORDER}
                getInitial={getMTGInitial}
                getFullName={(key) => FULL_COLOR_NAMES[key] || key}
                getColorStyle={getMTGColorStyle}
                emptyMessage="No colored cards found in mainboard."
                activeTooltip={activeTooltip}
                setActiveTooltip={setActiveTooltip}
                setZoomedCard={setZoomedCard}
             />
         ) : (
             <MatrixView 
                matrixData={typeMatrixData}
                visibleRows={TYPES_ORDER.filter(t => t !== 'Land' && CMC_ORDER.some(cmc => typeMatrixData[t][cmc].length > 0))}
                cmcOrder={CMC_ORDER}
                getInitial={getTypeInitial}
                getFullName={(key) => FULL_TYPE_NAMES[key] || key}
                getColorStyle={getTypeColorStyle}
                emptyMessage="No non-land cards found in mainboard."
                activeTooltip={activeTooltip}
                setActiveTooltip={setActiveTooltip}
                setZoomedCard={setZoomedCard}
             />
         )}
      </div>

      {!isMatrixView && (
        <SideboardBar 
            sideboard={sideboard}
            sideboardHeight={sideboardHeight}
            startResizingSideboard={startResizingSideboard}
            dragGhostActive={dragGhost?.active ?? false}
            dragGhostCardId={dragGhost?.card.id}
            setZoomedCard={setZoomedCard}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
            handleDropOnSideboardCard={handleDropOnSideboardCard}
            handleDragOver={handleDragOver}
            handleDropOnSideboard={handleDropOnSideboard}
            handleDragOverContainer={handleDragOverContainer}
            handleTouchStart={handleTouchStart}
            handleTouchMove={handleTouchMove}
            handleTouchEnd={handleTouchEnd}
        />
      )}

      {zoomedCard && (
          <ZoomOverlay card={zoomedCard} onClose={() => setZoomedCard(null)} />
      )}
    </div>
  );
};

export default DeckView;
