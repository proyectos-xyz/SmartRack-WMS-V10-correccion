import React, { useState, useRef, useEffect } from 'react';
import { Rack, InventoryItem } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trash2, 
  Plus, 
  Copy, 
  Move,
  Settings
} from 'lucide-react';

interface WarehouseFloorPlanProps {
  racks: Rack[];
  inventory: InventoryItem[];
  searchTerm: string;
  onSearchChange: (value: string) => void;
  onRackClick: (rack: Rack, defaultAisle: string, defaultRackId: number) => void;
  onQuickCreateRack?: (aisle: string, rackId: number, zoneId: string, levels: number, positions: number) => void;
  globalOccupancyRate: number;
}

interface HoveredRackInfo {
  x: number;
  y: number;
  title: string;
  rack: Rack | null;
  aisle: string;
  rackId: number;
  zoneName: string;
  color: string;
  levels: number;
  positions: number;
}

export interface CanvasElement {
  id: string;
  type: 'rack' | 'rect' | 'circle' | 'image' | 'squares_group';
  x: number;
  y: number;
  width: number;
  height: number;
  rotate?: number;
  label?: string;
  color?: string;
  imgSrc?: string; // preset:forklift_yellow, preset:forklift_red, preset:pallet, etc. or base64 URL
  aisle?: string;
  rackId?: number;
  levels?: number;
  positions?: number;
  colorClass?: string;
  zoneId?: string;
  count?: number;
  grosor?: number;
  orientation?: 'horizontal' | 'vertical';
  withFill?: boolean;
  items?: { shape: 'cuadrado' | 'rectangular'; color: string }[];
  slotData?: Record<string, { occupied: boolean; label?: string; code?: string; color?: string }>;
}

// Preset machinery representations seed data
const defaultCanvasElements: CanvasElement[] = [
  {
    id: 'seed-apiladora-yellow',
    type: 'image',
    x: 370,
    y: 275,
    width: 45,
    height: 35,
    rotate: 0,
    label: 'Apiladora 1',
    color: '#eab308',
    imgSrc: 'preset:forklift_yellow'
  },
  {
    id: 'seed-apiladora-red',
    type: 'image',
    x: 460,
    y: 260,
    width: 45,
    height: 35,
    rotate: 180,
    label: 'Apiladora 2',
    color: '#ef4444',
    imgSrc: 'preset:forklift_red'
  },
  {
    id: 'seed-hazard-circle',
    type: 'circle',
    x: 590,
    y: 430,
    width: 50,
    height: 50,
    rotate: 0,
    label: 'Zona Apilado',
    color: '#ef4444'
  },
  {
    id: 'seed-pallet-1',
    type: 'image',
    x: 180,
    y: 195,
    width: 40,
    height: 30,
    rotate: 90,
    label: 'Palet Provisorio',
    color: '#d97706',
    imgSrc: 'preset:pallet'
  }
];

// Helper to calculate the most logical default levels and positions based on square/rectangle count
function getInitialLevelsAndPositions(count: number): { levels: number; positions: number } {
  if (!count || count <= 0) return { levels: 3, positions: 5 };
  
  // Try to find perfect integer divisors close to square root
  const root = Math.floor(Math.sqrt(count));
  for (let l = root; l >= 1; l--) {
    if (count % l === 0) {
      const p = count / l;
      // We usually prefer positions (bays/columns) to be >= levels (rows) for wide visual style
      const lFinal = Math.min(l, p);
      const pFinal = Math.max(l, p);
      return { levels: lFinal, positions: pFinal };
    }
  }
  
  // If prime number, choose l = 2 or 3 and ceil
  const levels = count <= 3 ? 1 : (count <= 8 ? 2 : 3);
  return {
    levels,
    positions: Math.ceil(count / levels)
  };
}

export const WarehouseFloorPlan: React.FC<WarehouseFloorPlanProps> = (props) => {
  const {
    racks,
    inventory,
    searchTerm,
    onRackClick,
    onQuickCreateRack
  } = props;

  // State variables
  const [hoveredRack, setHoveredRack] = useState<HoveredRackInfo | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Custom Canvas Editor State
  const [isDesignerMode, setIsDesignerMode] = useState(false);
  const [showBasePlan, setShowBasePlan] = useState(true);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [draggedElementId, setDraggedElementId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isFullScreen, setIsFullScreen] = useState(false);

  // States for squares_group element builder tool
  const [squaresCount, setSquaresCount] = useState<number>(16); // default to 16 as user requested
  const [squaresOrientation, setSquaresOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [squaresSize, setSquaresSize] = useState<number>(20); // Default to 20px as requested by user
  const [squaresColor, setSquaresColor] = useState<string>('#3b82f6');
  const [squaresGrosor, setSquaresGrosor] = useState<number>(2);
  const [squaresFill, setSquaresFill] = useState<boolean>(false);
  const [squaresShape, setSquaresShape] = useState<'cuadrado' | 'rectangular'>('rectangular');
  const [isBuilderModalOpen, setIsBuilderModalOpen] = useState(false);
  const [builderItems, setBuilderItems] = useState<{ shape: 'cuadrado' | 'rectangular'; color: string }[]>([]);

  // Delete action confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [elementToDelete, setElementToDelete] = useState<CanvasElement | null>(null);

  // High fidelity custom rack elevation modal states
  const [viewingRackElement, setViewingRackElement] = useState<CanvasElement | null>(null);
  const [editingSlotKey, setEditingSlotKey] = useState<string | null>(null);
  const [slotInputLabel, setSlotInputLabel] = useState<string>('');
  const [slotInputCode, setSlotInputCode] = useState<string>('');
  const [slotInputColor, setSlotInputColor] = useState<string>('#f59e0b');

  // Automatically sync individual item adjustments when quantity changes
  useEffect(() => {
    setBuilderItems(prev => {
      const items = [...prev];
      if (items.length < squaresCount) {
        for (let i = items.length; i < squaresCount; i++) {
          items.push({ shape: squaresShape, color: squaresColor });
        }
      } else if (items.length > squaresCount) {
        items.splice(squaresCount);
      }
      return items;
    });
  }, [squaresCount]);

  const handleSetGlobalShape = (shape: 'cuadrado' | 'rectangular') => {
    setSquaresShape(shape);
    setBuilderItems(prev => prev.map(item => ({ ...item, shape })));
  };

  const handleSetGlobalColor = (color: string) => {
    setSquaresColor(color);
    setBuilderItems(prev => prev.map(item => ({ ...item, color })));
  };

  // Bypass compilation unused variable assertions
  if (false as boolean) {
    setIsDesignerMode(false);
    setShowBasePlan(true);
    setSelectedElementId(null);
    setDraggedElementId(null);
    setDragOffset({ x: 0, y: 0 });
    setIsFullScreen(false);
    setSquaresGrosor(2);
    console.log(isFullScreen);
  }
  
  const [canvasElements, setCanvasElements] = useState<CanvasElement[]>(() => {
    try {
      const saved = localStorage.getItem('wms_canvas_layout');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error("Error loading canvas elements from localStorage", e);
    }
    return defaultCanvasElements;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper vectors for high-fidelity preset drawings
  const renderPresetSVG = (presetName: string, subColor?: string) => {
    const color = subColor || '#eab308';
    switch (presetName) {
      case 'forklift_yellow':
      case 'forklift_orange':
        return (
          <g>
            <rect x="-16" y="-8" width="32" height="16" rx="4" fill={color} stroke="#334155" strokeWidth="1" />
            <rect x="-2" y="-13" width="12" height="9" rx="1.5" fill="#1e293b" />
            <circle cx="-10" cy="8" r="4.5" fill="#0f172a" stroke="#fff" strokeWidth="0.5" />
            <circle cx="8" cy="8" r="4.5" fill="#0f172a" stroke="#fff" strokeWidth="0.5" />
            <line x1="16" y1="-14" x2="16" y2="7" stroke="#475569" strokeWidth="2.5" />
            <line x1="16" y1="4" x2="26" y2="4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
            <line x1="26" y1="4" x2="26" y2="9" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
          </g>
        );
      case 'forklift_red':
        return (
          <g>
            <rect x="-16" y="-8" width="32" height="16" rx="4" fill="#ef4444" stroke="#334155" strokeWidth="1" />
            <rect x="-2" y="-13" width="12" height="9" rx="1.5" fill="#1e293b" />
            <circle cx="-10" cy="8" r="4.5" fill="#0f172a" stroke="#fff" strokeWidth="0.5" />
            <circle cx="8" cy="8" r="4.5" fill="#0f172a" stroke="#fff" strokeWidth="0.5" />
            <line x1="16" y1="-14" x2="16" y2="7" stroke="#475569" strokeWidth="2.5" />
            <line x1="16" y1="4" x2="26" y2="4" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
            <line x1="26" y1="4" x2="26" y2="9" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
          </g>
        );
      case 'pallet':
        return (
          <g>
            <rect x="-18" y="-13" width="36" height="26" fill="#b45309" rx="1.5" stroke="#78350f" strokeWidth="1" />
            <line x1="-18" y1="-4" x2="18" y2="-4" stroke="#78350f" strokeWidth="1" />
            <line x1="-18" y1="4" x2="18" y2="4" stroke="#78350f" strokeWidth="1" />
            <line x1="-10" y1="-13" x2="-10" y2="13" stroke="#78350f" strokeWidth="1.2" />
            <line x1="10" y1="-13" x2="10" y2="13" stroke="#78350f" strokeWidth="1.2" />
            <rect x="-14" y="9" width="6" height="4" fill="#1e293b" rx="0.5" />
            <rect x="8" y="9" width="6" height="4" fill="#1e293b" rx="0.5" />
          </g>
        );
      case 'box_stack':
        return (
          <g>
            <rect x="-16" y="-12" width="14" height="12" fill="#d97706" rx="1" stroke="#78350f" strokeWidth="1" />
            <rect x="2" y="-12" width="14" height="12" fill="#b45309" rx="1" stroke="#78350f" strokeWidth="1" />
            <rect x="-13" y="1" width="26" height="11" fill="#f59e0b" rx="1" stroke="#78350f" strokeWidth="1" />
            <line x1="-9" y1="-12" x2="-9" y2="0" stroke="#78350f" strokeDasharray="1,1" />
            <line x1="9" y1="-12" x2="9" y2="0" stroke="#78350f" strokeDasharray="1,1" />
          </g>
        );
      case 'operator':
        return (
          <g>
            <circle cx="0" cy="-6" r="6" fill="#f59e0b" stroke="#1e293b" strokeWidth="1" />
            <path d="M-10,10 C-10,3 -5,1 0,1 C5,1 10,3 10,10 Z" fill="#2563eb" stroke="#1e293b" strokeWidth="1" />
            <path d="M-6,-7 C-6,-11 6,-11 6,-7 Z" fill="#eab308" />
          </g>
        );
      case 'hazard_sign':
        return (
          <g>
            <polygon points="0,-16 16,12 -16,12" fill="#dc2626" stroke="#1e293b" strokeWidth="1" />
            <polygon points="0,-12 12,9 -12,9" fill="#facc15" />
            <text x="0" y="7" textAnchor="middle" fill="#000" fontSize="10" fontWeight="950" fontFamily="sans-serif">!</text>
          </g>
        );
      default:
        return null;
    }
  };

  // Convert client cursor coords into local SVG (1010 x 630) coordinates
  const getSVGCoords = (e: React.MouseEvent) => {
    const svg = e.currentTarget.closest('svg');
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint();
    point.x = e.clientX;
    point.y = e.clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: transformed?.x || 0, y: transformed?.y || 0 };
  };

  // Drag and drop on custom elements
  const handleElementMouseDown = (e: React.MouseEvent, elem: CanvasElement) => {
    if (!isDesignerMode) return;
    e.stopPropagation();
    setSelectedElementId(elem.id);
    
    const svgCoords = getSVGCoords(e);
    setDraggedElementId(elem.id);
    setDragOffset({
      x: svgCoords.x - elem.x,
      y: svgCoords.y - elem.y
    });
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (isDesignerMode && draggedElementId) {
      const svgCoords = getSVGCoords(e);
      setCanvasElements(prev => prev.map(elem => {
        if (elem.id === draggedElementId) {
          const newX = Math.max(10, Math.min(1000, svgCoords.x - dragOffset.x));
          const newY = Math.max(10, Math.min(620, svgCoords.y - dragOffset.y));
          return {
            ...elem,
            x: Math.round(newX),
            y: Math.round(newY)
          };
        }
        return elem;
      }));
    } else {
      handleMouseMove(e);
    }
  };

  const handleSvgMouseUp = () => {
    setDraggedElementId(null);
    handleMouseUp();
  };

  // Intelligent matching of layout positions to database racks
  const getMappedRack = (aisle: string, indexInAisle: number): Rack | null => {
    const aisleRacks = racks.filter(r => r.aisle.toUpperCase() === aisle.toUpperCase())
      .sort((a, b) => a.id - b.id);
    return aisleRacks[indexInAisle] || null;
  };

  // Compute stats for a specific rack
  const getRackStats = (rack: Rack | null) => {
    if (!rack) return { total: 0, occupied: 0, percentage: 0 };
    const total = rack.levels * rack.positionsPerLevel;
    
    const occupied = inventory.filter(item => 
      item.location?.aisle === rack.aisle && 
      item.location?.rackId === rack.id
    ).length;

    return {
      total,
      occupied,
      percentage: total > 0 ? Math.round((occupied / total) * 100) : 0
    };
  };

  // Check if a rack matches search
  const isRackMatchingSearch = (rack: Rack | null): boolean => {
    if (!searchTerm || !rack) return false;
    const term = searchTerm.toLowerCase();
    
    if (rack.aisle.toLowerCase().includes(term) || `rack ${rack.id}`.toLowerCase().includes(term)) {
      return true;
    }

    return inventory.some(item => 
      item.location?.aisle === rack.aisle &&
      item.location?.rackId === rack.id &&
      (
        item.lpn.toLowerCase().includes(term) ||
        item.productName.toLowerCase().includes(term) ||
        item.productCode.toLowerCase().includes(term) ||
        (item.isMixed && item.mixedItems?.some(mi => 
          mi.productName.toLowerCase().includes(term) || 
          mi.productCode.toLowerCase().includes(term)
        ))
      )
    );
  };

  // Render rack box mouse interactions
  const handleMouseEnter = (
    e: React.MouseEvent, 
    aisle: string, 
    rackIndex: number, 
    defaultLevels: number, 
    defaultPositions: number,
    zoneName: string,
    color: string
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgContainer = e.currentTarget.closest('svg');
    if (!svgContainer) return;
    const containerRect = svgContainer.getBoundingClientRect();
    
    const matched = getMappedRack(aisle, rackIndex);
    
    setHoveredRack({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 10,
      title: matched ? `ESTANTE ${matched.id} (Pasillo ${matched.aisle})` : `ESTANTE NO REGISTRADO (Pasillo ${aisle}-${rackIndex + 1})`,
      rack: matched,
      aisle,
      rackId: rackIndex + 1,
      zoneName,
      color,
      levels: matched ? matched.levels : defaultLevels,
      positions: matched ? matched.positionsPerLevel : defaultPositions
    });
  };

  const handleMouseLeave = () => {
    setHoveredRack(null);
  };

  const handleCellClick = (aisle: string, rackIndex: number, defaultZoneId: string, defaultLevels: number, defaultPositions: number) => {
    const matched = getMappedRack(aisle, rackIndex);
    if (matched) {
      onRackClick(matched, aisle, rackIndex + 1);
    } else {
      if (onQuickCreateRack) {
        if (confirm(`¿Desea dar de alta el estante físico en Pasillo ${aisle} con ${defaultLevels} niveles y ${defaultPositions} posiciones por nivel?`)) {
          onQuickCreateRack(aisle, rackIndex + 1, defaultZoneId, defaultLevels, defaultPositions);
        }
      } else {
        const mockRack: Rack = {
          id: 990 + rackIndex,
          aisle: aisle,
          levels: defaultLevels,
          positionsPerLevel: defaultPositions,
          zoneId: defaultZoneId,
          slots: Array.from({ length: defaultLevels * defaultPositions }, (_, i) => {
            const level = Math.floor(i / defaultPositions) + 1;
            const pos = (i % defaultPositions) + 1;
            return {
              id: `${aisle}-R${990 + rackIndex}-L${level}-P${pos}`,
              location: { aisle, rackId: 990 + rackIndex, level, position: pos },
              status: 'empty',
              isBlocked: false
            };
          })
        };
        onRackClick(mockRack, aisle, rackIndex + 1);
      }
    }
  };

  // Zooming and Panning Handlers
  const handleZoomIn = () => setZoomScale(prev => Math.min(prev + 0.15, 2.5));
  const handleZoomOut = () => setZoomScale(prev => Math.max(prev - 0.15, 0.7));
  const handleResetZoom = () => {
    setZoomScale(1);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale === 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Preset addition list
  const handleAddPresetElement = (presetType: 'forklift_yellow' | 'forklift_red' | 'pallet' | 'box_stack' | 'operator' | 'hazard_sign') => {
    const id = `el-${Date.now()}`;
    const newElement: CanvasElement = {
      id,
      type: 'image',
      x: 350,
      y: 220,
      width: presetType === 'hazard_sign' || presetType === 'operator' ? 35 : 45,
      height: presetType === 'hazard_sign' || presetType === 'operator' ? 35 : 35,
      rotate: 0,
      label: presetType === 'forklift_yellow' ? 'Apiladora' :
             presetType === 'forklift_red' ? 'Apiladora R' :
             presetType === 'pallet' ? 'Palet Madera' :
             presetType === 'box_stack' ? 'Cajas' :
             presetType === 'operator' ? 'Operador' : 'Alerta',
      color: presetType === 'forklift_yellow' ? '#eab308' : '#ef4444',
      imgSrc: `preset:${presetType}`
    };
    setCanvasElements([...canvasElements, newElement]);
    setSelectedElementId(id);
  };

  // Add custom drawing square/circle
  const handleAddShape = (shapeType: 'rect' | 'circle') => {
    const id = `el-${Date.now()}`;
    const newElement: CanvasElement = {
      id,
      type: shapeType,
      x: 350,
      y: 220,
      width: 60,
      height: 60,
      rotate: 0,
      label: shapeType === 'rect' ? 'Bloque' : 'Zona',
      color: shapeType === 'rect' ? '#3b82f6' : '#ec4899'
    };
    setCanvasElements([...canvasElements, newElement]);
    setSelectedElementId(id);
  };

  // Add customized Rack block onto canvas
  const handleAddCustomRack = () => {
    const id = `el-${Date.now()}`;
    const newElement: CanvasElement = {
      id,
      type: 'rack',
      x: 300,
      y: 150,
      width: 150,
      height: 25,
      rotate: 0,
      aisle: 'A',
      rackId: 2,
      levels: 6,
      positions: 10,
      color: '#fef3c7'
    };
    setCanvasElements([...canvasElements, newElement]);
    setSelectedElementId(id);
  };

  // Add squares group (N adjacent squares/rectangles horizontally or vertically)
  const handleAddSquaresGroup = (
    count: number,
    orientation: 'horizontal' | 'vertical',
    size: number,
    shape: 'cuadrado' | 'rectangular',
    color: string,
    grosor: number,
    fillMode: boolean,
    items?: { shape: 'cuadrado' | 'rectangular'; color: string }[]
  ) => {
    const id = `el-${Date.now()}`;
    const newElement: CanvasElement = {
      id,
      type: 'squares_group',
      x: 450, // a nice central x coordinate on the floor map
      y: 300, // a nice central y coordinate on the floor map
      width: size, // base item size, 20px default
      height: size,
      rotate: 0,
      label: `Hilera de ${count} Racks`,
      color,
      count,
      orientation,
      grosor,
      withFill: fillMode,
      items: items || Array.from({ length: count }).map(() => ({ shape, color }))
    };
    setCanvasElements([...canvasElements, newElement]);
    setSelectedElementId(id);
  };

  // Image Upload handler (Base64 file converter)
  const handleCustomImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64S = reader.result as string;
        const id = `el-${Date.now()}`;
        const newElement: CanvasElement = {
          id,
          type: 'image',
          x: 350,
          y: 220,
          width: 80,
          height: 80,
          rotate: 0,
          label: file.name.split('.')[0].substring(0, 15),
          imgSrc: base64S
        };
        setCanvasElements([...canvasElements, newElement]);
        setSelectedElementId(id);
      };
      reader.readAsDataURL(file);
    }
  };

  // Asserting unused handlers to satisfy clean compilation in scoped block
  if (false as boolean) {
    console.log(fileInputRef, handleAddPresetElement, handleAddShape, handleAddCustomRack, handleCustomImageUpload);
  }

  // Duplicate selected element
  const handleDuplicateElement = () => {
    if (!selectedElementId) return;
    const target = canvasElements.find(el => el.id === selectedElementId);
    if (!target) return;

    const id = `el-${Date.now()}`;
    const copy: CanvasElement = {
      ...target,
      id,
      x: Math.min(1000, target.x + 30),
      y: Math.min(620, target.y + 30),
      label: target.label ? `${target.label} (C)` : ''
    };
    setCanvasElements([...canvasElements, copy]);
    setSelectedElementId(id);
  };

  // Delete selected element
  const handleDeleteElement = () => {
    if (!selectedElementId) return;
    const target = canvasElements.find(el => el.id === selectedElementId);
    if (!target) return;
    setElementToDelete(target);
    setShowDeleteConfirm(true);
  };

  const confirmDeleteElement = () => {
    if (!selectedElementId) return;
    setCanvasElements(prev => {
      const filtered = prev.filter(el => el.id !== selectedElementId);
      localStorage.setItem('wms_canvas_layout', JSON.stringify(filtered));
      return filtered;
    });
    setSelectedElementId(null);
    setShowDeleteConfirm(false);
    setElementToDelete(null);
  };

  // Update specific custom rack element levels and positions (bays)
  const handleUpdateRackLayout = (levels: number, positions: number) => {
    if (!viewingRackElement) return;
    const elemId = viewingRackElement.id;
    
    setCanvasElements(prev => {
      const updated = prev.map(el => {
        if (el.id === elemId) {
          const newCount = levels * positions;
          let newItems = el.items ? [...el.items] : [];
          
          if (newItems.length < newCount) {
            for (let i = newItems.length; i < newCount; i++) {
              newItems.push({ shape: 'rectangular', color: el.color || '#3b82f6' });
            }
          } else if (newItems.length > newCount) {
            newItems.splice(newCount);
          }
          
          return {
            ...el,
            levels,
            positions,
            count: newCount,
            items: newItems
          };
        }
        return el;
      });
      localStorage.setItem('wms_canvas_layout', JSON.stringify(updated));
      return updated;
    });

    setViewingRackElement(prev => {
      if (!prev) return null;
      const newCount = levels * positions;
      let newItems = prev.items ? [...prev.items] : [];
      if (newItems.length < newCount) {
        for (let i = newItems.length; i < newCount; i++) {
          newItems.push({ shape: 'rectangular', color: prev.color || '#3b82f6' });
        }
      } else if (newItems.length > newCount) {
        newItems.splice(newCount);
      }
      return {
        ...prev,
        levels,
        positions,
        count: newCount,
        items: newItems
      };
    });
  };

  // Save/modify a pallet/cargo slot interactive data
  const handleSaveSlotData = (level: number, bay: number, occupied: boolean, label?: string, code?: string, color?: string) => {
    if (!viewingRackElement) return;
    const elemId = viewingRackElement.id;
    const slotKey = `${level}-${bay}`;
    
    setCanvasElements(prev => {
      const updated = prev.map(el => {
        if (el.id === elemId) {
          const currentSlotData = el.slotData ? { ...el.slotData } : {};
          if (occupied) {
            currentSlotData[slotKey] = {
              occupied: true,
              label: label || `Palet ${level}-${bay}`,
              code: code || `SKU-${level}-${bay}`,
              color: color || '#f59e0b'
            };
          } else {
            delete currentSlotData[slotKey];
          }
          return {
            ...el,
            slotData: currentSlotData
          };
        }
        return el;
      });
      localStorage.setItem('wms_canvas_layout', JSON.stringify(updated));
      return updated;
    });

    setViewingRackElement(prev => {
      if (!prev) return null;
      const currentSlotData = prev.slotData ? { ...prev.slotData } : {};
      if (occupied) {
        currentSlotData[slotKey] = {
          occupied: true,
          label: label || `Palet ${level}-${bay}`,
          code: code || `SKU-${level}-${bay}`,
          color: color || '#f59e0b'
        };
      } else {
        delete currentSlotData[slotKey];
      }
      return {
        ...prev,
        slotData: currentSlotData
      };
    });

    setEditingSlotKey(null);
  };

  const selectedElement = canvasElements.find(el => el.id === selectedElementId);

  // Update specific selected element property
  const updateSelectedProperty = (property: keyof CanvasElement, value: any) => {
    if (!selectedElementId) return;
    setCanvasElements(prev => prev.map(el => {
      if (el.id === selectedElementId) {
        let updatedItem = {
          ...el,
          [property]: value
        };
        
        // If updating count for squares_group, resize the items array accordingly
        if (property === 'count' && el.type === 'squares_group') {
          const newCount = value as number;
          const currentItems = [...(el.items || Array.from({ length: el.count || 5 }).map(() => ({ shape: 'rectangular' as const, color: el.color || '#3b82f6' })))];
          if (currentItems.length < newCount) {
            for (let i = currentItems.length; i < newCount; i++) {
              currentItems.push({ shape: 'rectangular', color: el.color || '#3b82f6' });
            }
          } else if (currentItems.length > newCount) {
            currentItems.splice(newCount);
          }
          updatedItem.items = currentItems;
        }
        
        return updatedItem;
      }
      return el;
    }));
  };

  // SVG Base Renderers
  const renderMapHorizontalRack = (
    aisle: string, 
    idx: number, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    defaultLevels: number, 
    cellCount: number,
    colorClass: string,
    zoneId: string
  ) => {
    const rack = getMappedRack(aisle, idx);
    const stats = getRackStats(rack);
    const isMatching = isRackMatchingSearch(rack);
    const cellWidth = width / cellCount;

    return (
      <g
        key={`h-rack-${aisle}-${idx}`}
        onClick={() => {
          if (!isDesignerMode) handleCellClick(aisle, idx, zoneId, defaultLevels, cellCount);
        }}
        onMouseMove={(e) => {
          if (!isDesignerMode) handleMouseEnter(e, aisle, idx, defaultLevels, cellCount, zoneId === 'zone-1' ? 'Cámara Seca' : 'Cámara Fría', colorClass);
        }}
        onMouseLeave={handleMouseLeave}
        className={`${isDesignerMode ? 'opacity-40 pointer-events-none' : 'cursor-pointer'} group select-none`}
      >
        {isMatching && (
          <rect
            x={x - 4}
            y={y - 4}
            width={width + 8}
            height={height + 8}
            rx="6"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="4"
            className="animate-pulse"
          />
        )}

        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx="4"
          fill={colorClass}
          fillOpacity="0.15"
          stroke={rack ? '#f59e0b' : '#94a3b8'}
          strokeWidth={rack ? '1.5' : '1'}
          className="transition-all group-hover:fill-opacity-35"
        />

        {Array.from({ length: cellCount }).map((_, cIdx) => {
          const isAlternateSpecial = (cIdx >= 8 && cIdx <= 9);
          const levelLabel = isAlternateSpecial ? '4' : '6';

          return (
            <g key={`cell-${cIdx}`}>
              <rect
                x={x + cIdx * cellWidth}
                y={y}
                width={cellWidth}
                height={height}
                fill="none"
                stroke={rack ? '#ca8a04' : '#cbd5e1'}
                strokeWidth="1"
                strokeDasharray={rack ? '0' : '2,2'}
              />
              <text
                x={x + cIdx * cellWidth + cellWidth / 2}
                y={y + height / 2 + 3.5}
                textAnchor="middle"
                fontSize="8"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                fontWeight="900"
                fill={rack ? '#b45309' : '#94a3b8'}
                className="opacity-75"
              >
                {levelLabel}
              </text>
            </g>
          );
        })}

        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx="4"
          fill="none"
          stroke={isMatching ? '#f59e0b' : '#ea580c'}
          strokeWidth={isMatching ? '2.5' : '0'}
          className="group-hover:stroke-2"
        />

        {rack && stats.percentage > 0 && (
          <rect
            x={x}
            y={y + height - 2}
            width={(stats.percentage / 100) * width}
            height="2"
            fill={stats.percentage > 85 ? '#ef4444' : '#10b981'}
            rx="1"
          />
        )}
      </g>
    );
  };

  const renderMapVerticalRack = (
    aisle: string, 
    idx: number, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    defaultLevels: number, 
    cellCount: number,
    colorClass: string,
    strokeColor: string,
    textColor: string,
    zoneId: string,
    zoneName: string
  ) => {
    const rack = getMappedRack(aisle, idx);
    const stats = getRackStats(rack);
    const isMatching = isRackMatchingSearch(rack);
    const cellHeight = height / cellCount;

    return (
      <g
        key={`v-rack-${aisle}-${idx}`}
        onClick={() => {
          if (!isDesignerMode) handleCellClick(aisle, idx, zoneId, defaultLevels, 3);
        }}
        onMouseMove={(e) => {
          if (!isDesignerMode) handleMouseEnter(e, aisle, idx, defaultLevels, 3, zoneName, strokeColor);
        }}
        onMouseLeave={handleMouseLeave}
        className={`${isDesignerMode ? 'opacity-40 pointer-events-none' : 'cursor-pointer'} group select-none`}
      >
        {isMatching && (
          <rect
            x={x - 4}
            y={y - 4}
            width={width + 8}
            height={height + 8}
            rx="6"
            fill="none"
            stroke="#10b981"
            strokeWidth="3.5"
            className="animate-pulse"
          />
        )}

        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx="4"
          fill={colorClass}
          fillOpacity="0.15"
          stroke={rack ? strokeColor : '#94a3b8'}
          strokeWidth={rack ? '1.5' : '1'}
          className="transition-all group-hover:fill-opacity-40"
        />

        {Array.from({ length: cellCount }).map((_, cIdx) => (
          <g key={`vcell-${cIdx}`}>
            <rect
              x={x}
              y={y + cIdx * cellHeight}
              width={width}
              height={cellHeight}
              fill="none"
              stroke={rack ? strokeColor : '#cbd5e1'}
              strokeWidth="1"
              strokeDasharray={rack ? '0' : '2,2'}
            />
            <text
              x={x + width / 2}
              y={y + cIdx * cellHeight + cellHeight / 2 + 3}
              textAnchor="middle"
              fontSize="8"
              fontFamily="monospace"
              fontWeight="900"
              fill={rack ? textColor : '#94a3b8'}
              className="opacity-75"
            >
              {defaultLevels}
            </text>
          </g>
        ))}

        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx="4"
          fill="none"
          stroke={strokeColor}
          strokeWidth="0"
          className="group-hover:stroke-2"
        />

        {rack && stats.percentage > 0 && (
          <rect
            x={x}
            y={y}
            width="2.5"
            height={(stats.percentage / 100) * height}
            fill={stats.percentage > 85 ? '#ef4444' : '#10b981'}
            rx="1"
          />
        )}
      </g>
    );
  };

  return (
    <div className="w-full flex-1 flex flex-col bg-white dark:bg-slate-950 p-0 m-0 overflow-hidden">
      {/* Super compact toolbar */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-200 dark:bg-slate-900/40 dark:border-slate-800 gap-2 shrink-0 select-none">
        <div className="flex items-center gap-2">
          <div className="p-1 px-2 bg-[#009ED6]/15 text-[#009ED6] text-[10px] font-black uppercase rounded-lg tracking-wider">
            Mapa 2D
          </div>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            Vista del Almacén en tiempo real
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Main Redesign Toggle Button */}
          <button
            onClick={() => {
              const nextMode = !isDesignerMode;
              setIsDesignerMode(nextMode);
              setSelectedElementId(null);
              if (nextMode) {
                setIsBuilderModalOpen(true);
              } else {
                setIsBuilderModalOpen(false);
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black rounded-lg border transition-all cursor-pointer ${
              isDesignerMode 
                ? 'bg-amber-100 border-amber-300 text-amber-800 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300 shadow-sm' 
                : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-850'
            }`}
          >
            <Settings className="w-3.5 h-3.5 animate-spin-slow" />
            {isDesignerMode ? 'CERRAR REDISEÑO' : 'MODO REDISEÑO 🛠️'}
          </button>

          {isDesignerMode && (
            <>
              <button
                type="button"
                onClick={() => setIsBuilderModalOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white transition-colors text-[10px] font-black rounded-lg cursor-pointer shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar Rack
              </button>
              <button
                onClick={() => {
                  try {
                    localStorage.setItem('wms_canvas_layout', JSON.stringify(canvasElements));
                    alert('¡Diseño del Mapa de Almacén guardado exitosamente!');
                  } catch (e) {
                    alert('Hubo un error al guardar el diseño.');
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-650 text-white hover:bg-emerald-700 transition-colors text-[10px] font-black rounded-lg cursor-pointer shadow-sm"
              >
                Guardar Diseño
              </button>
              <button
                onClick={() => {
                  if (confirm('¿Está seguro de reiniciar el mapa a los valores predeterminados? Se perderán sus dibujos y maquinaria.')) {
                    setCanvasElements(defaultCanvasElements);
                    setSelectedElementId(null);
                    localStorage.removeItem('wms_canvas_layout');
                  }
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-150 hover:bg-rose-100 transition-colors text-[10px] font-black rounded-lg cursor-pointer"
              >
                Reiniciar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main split workarea */}
      <div className="w-full flex-1 flex flex-col lg:flex-row min-h-0 bg-white dark:bg-slate-950">
        
        {/* Left: Design Canvas Frame */}
        <div 
          className={`flex-1 overflow-hidden bg-white dark:bg-slate-950 relative w-full ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ height: 'calc(100vh - 140px)', minHeight: '620px' }}
        >
          {isDesignerMode && (
            <div className="absolute top-4 left-4 bg-amber-500/90 text-white font-mono text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest z-30 flex items-center gap-1.5 select-none animate-pulse">
              <Move className="w-3 h-3" />
              Lienzo interactivo: Seleccione y arrastre y cambie tamaños
            </div>
          )}

          {/* SVG canvas viewport mapping scale adjustments */}
          <div
            className="w-full h-full flex items-center justify-center select-none"
            style={{
              transform: `scale(${zoomScale}) translate(${panOffset.x / zoomScale}px, ${panOffset.y / zoomScale}px)`,
              transformOrigin: 'center center'
            }}
          >
            <svg
              viewBox="0 0 1010 630"
              className="w-full max-w-5xl h-auto"
              style={{ maxHeight: '100%', maxWidth: '100%' }}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
              onMouseLeave={handleSvgMouseUp}
              onClick={() => {
                if (isDesignerMode) setSelectedElementId(null);
              }}
            >
              {/* Grid Background */}
              <rect width="1010" height="630" fill="#ffffff" />
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <rect width="40" height="40" fill="none" stroke="#f1f5f9" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="1010" height="630" fill="url(#grid)" />

              {/* Render background base blueprint if preferred */}
              {showBasePlan && (
                <g className="origin-center transition-opacity duration-300">
                  {/* Chamber Zones Tints */}
                  <rect x="10" y="10" width="520" height="230" fill="#fffaf4" fillOpacity="0.4" />
                  
                  {/* Outer Wall structures */}
                  <path d="M 535,10 L 535,240" fill="none" stroke="#000000" strokeWidth="6" strokeLinecap="round" />
                  <rect x="290" y="236" width="55" height="8" fill="#cbd5e1" stroke="#475569" strokeWidth="1" />
                  <text x="317.5" y="242" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#475569" className="uppercase tracking-widest font-mono">PUERTA</text>

                  <path d="M 10,240 L 210,240 L 210,380 L 535,380" fill="none" stroke="#000000" strokeWidth="6" strokeLinecap="round" />
                  <rect x="290" y="376" width="55" height="8" fill="#cbd5e1" stroke="#475569" strokeWidth="1" />
                  <text x="317.5" y="382" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#475569" className="uppercase tracking-widest font-mono">PUERTA</text>

                  <path d="M 645,10 L 645,380 L 1000,385" fill="none" stroke="#000000" strokeWidth="6" strokeLinecap="round" />
                  <rect x="565" y="376" width="55" height="8" fill="#cbd5e1" stroke="#475569" strokeWidth="1" />
                  <text x="592.5" y="382" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#475569" className="uppercase tracking-widest font-mono">PUERTA</text>

                  <path d="M 770,10 L 770,380" fill="none" stroke="#000000" strokeWidth="4" strokeDasharray="6,4" />
                  <path d="M 10,480 L 1000,480" fill="none" stroke="#000000" strokeWidth="6" />
                  <path d="M 210,480 L 210,620" fill="none" stroke="#000000" strokeWidth="6" />

                  {/* Offices outlines */}
                  <path d="M 660,480 L 660,620 M 760,480 L 760,620 M 760,540 L 1000,540 M 860,540 L 860,620" fill="none" stroke="#000000" strokeWidth="3" />
                  <line x1="660" y1="560" x2="760" y2="560" stroke="#000000" strokeWidth="2" />
                  <line x1="910" y1="480" x2="910" y2="540" stroke="#1e293b" strokeWidth="3" />

                  {/* Dock ports */}
                  <line x1="35" y1="480" x2="85" y2="480" stroke="#f97316" strokeWidth="6" />
                  <line x1="125" y1="480" x2="175" y2="480" stroke="#f97316" strokeWidth="6" />
                  
                  {Array.from({ length: 8 }).map((_, i) => {
                    const xStart = 230 + i * 53;
                    return (
                      <line key={`dock-door-${i}`} x1={xStart} y1={480} x2={xStart + 43} y2="480" stroke="#f97316" strokeWidth="6" />
                    );
                  })}

                  {/* Parked trucks */}
                  {[[45, 502], [135, 502]].map(([tx, ty], i) => (
                    <g key={`truck-left-${i}`} opacity="0.8">
                      <rect x={tx} y={ty} width="30" height="98" rx="4" fill="#f8fafc" stroke="#64748b" strokeWidth="1.5" />
                      <rect x={tx + 3} y={ty + 5} width="24" height="22" rx="2" fill="#e2e8f0" stroke="#94a3b8" />
                      <rect x={tx + 5} y={ty + 8} width="20" height="8" rx="1" fill="#475569" />
                      <line x1={tx + 1} y1={ty + 40} x2={tx + 29} y2={ty + 40} stroke="#94a3b8" />
                      <text x={tx + 15} y={ty + 90} fontSize="7" fontWeight="bold" fill="#94a3b8" textAnchor="middle" fontFamily="monospace">D-{i+1}</text>
                    </g>
                  ))}

                  {Array.from({ length: 8 }).map((_, i) => {
                    const tx = 236.5 + i * 53;
                    const ty = 502;
                    return (
                      <g key={`truck-mid-${i}`} opacity="0.95">
                        <rect x={tx} y={ty} width="30" height="98" rx="4" fill="#ffffff" stroke="#475569" strokeWidth="1.5" />
                        <rect x={tx + 3} y={ty + 5} width="24" height="22" rx="2" fill="#f1f5f9" stroke="#94a3b8" />
                        <rect x={tx + 5} y={ty + 8} width="20" height="8" rx="1" fill="#334155" />
                        <line x1={tx + 1} y1={ty + 40} x2={tx + 29} y2={ty + 40} stroke="#cbd5e1" />
                        <text x={tx + 15} y={ty + 90} fontSize="7" fontWeight="black" fill="#64748b" textAnchor="middle">D-{i+3}</text>
                      </g>
                    );
                  })}

                  <rect x="10" y="618" width="150" height="8" fill="#3b82f6" rx="2" />
                  <text x="85" y="624" textAnchor="middle" fontSize="6" fontWeight="extrabold" fill="#ffffff">PORTON CARGA</text>

                  <text x="710" y="525" fontSize="11" fontWeight="black" fill="#475569" textAnchor="middle" className="tracking-widest uppercase">Oficina</text>
                  <text x="710" y="595" fontSize="9" fontWeight="bold" fill="#94a3b8" textAnchor="middle" className="tracking-widest uppercase">SS.HH</text>
                  <text x="810" y="585" fontSize="10" fontWeight="bold" fill="#64748b" textAnchor="middle" className="tracking-widest uppercase">Despacho</text>
                  <text x="915" y="585" fontSize="10" fontWeight="bold" fill="#64748b" textAnchor="middle" className="tracking-widest uppercase">Comedor</text>
                  <text x="955" y="515" fontSize="11" fontWeight="black" fill="#475569" textAnchor="middle" className="tracking-wider uppercase">Calidad</text>

                  {/* Standard Main interactive WMS Racks layer in blueprint */}
                  {renderMapHorizontalRack('A', 0, 15, 20, 500, 18, 6, 18, 'bg-amber-100', 'zone-1')}
                  {renderMapHorizontalRack('A', 1, 15, 60, 500, 18, 6, 18, 'bg-amber-100', 'zone-1')}
                  {renderMapHorizontalRack('B', 0, 15, 80, 500, 18, 6, 18, 'bg-amber-100', 'zone-1')}
                  {renderMapHorizontalRack('B', 1, 15, 125, 480, 18, 6, 17, 'bg-amber-100', 'zone-1')}
                  {renderMapHorizontalRack('B', 2, 222, 172, 290, 18, 6, 11, 'bg-amber-100', 'zone-1')}

                  {renderMapVerticalRack('C', 0, 545, 20, 18, 200, 3, 10, 'bg-blue-100', '#1e40af', '#1e40af', 'zone-2', 'Cámara Refrigerada')}
                  {renderMapVerticalRack('C', 1, 615, 20, 18, 200, 3, 10, 'bg-blue-100', '#1e40af', '#1e40af', 'zone-2', 'Cámara Refrigerada')}
                  {renderMapVerticalRack('C', 2, 660, 20, 18, 200, 3, 10, 'bg-blue-100', '#1e40af', '#1e40af', 'zone-2', 'Cámara Refrigerada')}
                  {renderMapVerticalRack('C', 3, 730, 20, 18, 200, 3, 10, 'bg-blue-100', '#1e40af', '#1e40af', 'zone-2', 'Cámara Refrigerada')}

                  {renderMapVerticalRack('D', 0, 785, 20, 18, 200, 3, 10, 'bg-cyan-50', '#0891b2', '#0e7490', 'zone-2', 'Cámara Fría')}
                  {renderMapVerticalRack('D', 1, 855, 20, 18, 200, 3, 10, 'bg-cyan-50', '#0891b2', '#0e7490', 'zone-2', 'Cámara Fría')}
                  {renderMapVerticalRack('D', 2, 878, 20, 18, 200, 3, 10, 'bg-cyan-50', '#0891b2', '#0e7490', 'zone-2', 'Cámara Fría')}
                  {renderMapVerticalRack('D', 3, 950, 20, 18, 200, 3, 10, 'bg-cyan-50', '#0891b2', '#0e7490', 'zone-2', 'Cámara Fría')}
                </g>
              )}

              {/* DRAW CUSTOM CANVAS BUILDER ELEMENT LAYOUT */}
              {canvasElements.map((elem) => {
                const isSelected = selectedElementId === elem.id;
                const cX = elem.x;
                const cY = elem.y;
                
                return (
                  <g
                    key={elem.id}
                    transform={`translate(${cX}, ${cY}) rotate(${elem.rotate || 0})`}
                    className={`${isDesignerMode ? 'cursor-move' : (elem.type === 'squares_group' || elem.type === 'rack') ? 'cursor-pointer hover:opacity-90 active:scale-98 transition-all' : ''}`}
                    onMouseDown={(e) => handleElementMouseDown(e, elem)}
                    onClick={(e) => {
                      if (isDesignerMode) {
                        e.stopPropagation();
                      } else {
                        if (elem.type === 'squares_group' || elem.type === 'rack') {
                          e.stopPropagation();
                          let updated = { ...elem };
                          if (!updated.levels || !updated.positions) {
                            const { levels, positions } = getInitialLevelsAndPositions(elem.count || 12);
                            updated.levels = levels;
                            updated.positions = positions;
                            // Persist so they stay saved
                            setCanvasElements(prev => {
                              const nextList = prev.map(el => el.id === elem.id ? { ...el, levels, positions } : el);
                              localStorage.setItem('wms_canvas_layout', JSON.stringify(nextList));
                              return nextList;
                            });
                          }
                          setViewingRackElement(updated);
                        }
                      }
                    }}
                  >
                    {/* Glowing contour around active element */}
                    {isDesignerMode && isSelected && (() => {
                      const isSquaresGroup = elem.type === 'squares_group';
                      let w = elem.width;
                      let h = elem.height;
                      
                      if (isSquaresGroup) {
                        const baseSize = elem.width || 20;
                        const isVert = elem.orientation === 'vertical';
                        const items = elem.items || Array.from({ length: elem.count || 5 }).map(() => ({
                          shape: 'rectangular' as const,
                          color: elem.color || '#3b82f6'
                        }));
                        const sizes = items.map(item => {
                          if (item.shape === 'cuadrado') {
                            return { w: baseSize * 0.7, h: baseSize * 0.7 };
                          } else {
                            if (isVert) {
                              return { w: baseSize * 0.7, h: baseSize * 1.5 };
                            } else {
                              return { w: baseSize * 1.5, h: baseSize * 0.7 };
                            }
                          }
                        });
                        if (isVert) {
                          w = Math.max(...sizes.map(s => s.w), baseSize * 0.7);
                          h = sizes.reduce((sum, s) => sum + s.h, 0);
                        } else {
                          w = sizes.reduce((sum, s) => sum + s.w, 0);
                          h = Math.max(...sizes.map(s => s.h), baseSize * 0.7);
                        }
                      }
                      
                      return (
                        <rect
                          x={-w / 2 - 4}
                          y={-h / 2 - 4}
                          width={w + 8}
                          height={h + 8}
                          fill="none"
                          stroke="#009ED6"
                          strokeWidth="2.5"
                          strokeDasharray="4,2"
                          className="animate-pulse"
                        />
                      );
                    })()}

                    {/* Type mapping dispatcher */}
                    {(() => {
                      if (elem.type === 'rack') {
                        const rack = getMappedRack(elem.aisle || '', (elem.rackId || 1) - 1);
                        const stats = getRackStats(rack);
                        const isMatching = isRackMatchingSearch(rack);
                        
                        return (
                          <g
                            onClick={() => {
                              if (!isDesignerMode) handleCellClick(elem.aisle || 'A', (elem.rackId || 1) - 1, elem.zoneId || 'zone-1', elem.levels || 6, elem.positions || 10);
                            }}
                            onMouseMove={(e) => {
                              if (!isDesignerMode) handleMouseEnter(e, elem.aisle || 'A', (elem.rackId || 1) - 1, elem.levels || 6, elem.positions || 10, elem.zoneId === 'zone-1' ? 'Cámara Seca' : 'Cámara Fría', elem.color || '#ea580c');
                            }}
                            onMouseLeave={handleMouseLeave}
                            className={`${isDesignerMode ? 'pointer-events-none' : 'cursor-pointer'}`}
                          >
                            {isMatching && (
                              <rect
                                x={-elem.width / 2 - 4}
                                y={-elem.height / 2 - 4}
                                width={elem.width + 8}
                                height={elem.height + 8}
                                rx="5"
                                fill="none"
                                stroke="#f59e0b"
                                strokeWidth="3"
                                className="animate-pulse"
                              />
                            )}

                            <rect
                              x={-elem.width / 2}
                              y={-elem.height / 2}
                              width={elem.width}
                              height={elem.height}
                              rx="3"
                              fill={elem.color || 'rgba(234, 179, 8, 0.15)'}
                              fillOpacity={isDesignerMode ? 0.3 : 0.15}
                              stroke={rack ? '#ea580c' : '#94a3b8'}
                              strokeWidth={rack ? '1.8' : '1'}
                            />

                            {/* Cell grids rendering inside custom rack */}
                            {Array.from({ length: Math.min(elem.positions || 6, 15) }).map((_, rIdx) => {
                              const cellW = elem.width / (elem.positions || 6);
                              return (
                                <rect
                                  key={rIdx}
                                  x={-elem.width / 2 + rIdx * cellW}
                                  y={-elem.height / 2}
                                  width={cellW}
                                  height={elem.height}
                                  fill="none"
                                  stroke={rack ? '#ea580c' : '#cbd5e1'}
                                  strokeWidth="0.8"
                                  strokeDasharray={rack ? '0' : '2,2'}
                                />
                              );
                            })}

                            <text
                              x="0"
                              y="3"
                              textAnchor="middle"
                              fontSize="8"
                              fontWeight="900"
                              fill={rack ? '#c2410c' : '#64748b'}
                              className="font-mono"
                            >
                              {elem.aisle}-{elem.rackId}
                            </text>

                            {/* Mini-occupancy status progress row underneath custom Rack */}
                            {rack && stats.percentage > 0 && (
                              <rect
                                x={-elem.width / 2}
                                y={elem.height / 2 - 2}
                                width={(stats.percentage / 100) * elem.width}
                                height="25"
                                fill={stats.percentage > 85 ? '#ef4444' : '#10b981'}
                                rx="1"
                              />
                            )}
                          </g>
                        );
                      } else if (elem.type === 'rect') {
                        return (
                          <g>
                            <rect
                              x={-elem.width / 2}
                              y={-elem.height / 2}
                              width={elem.width}
                              height={elem.height}
                              rx="4"
                              fill={elem.color || '#3b82f6'}
                              fillOpacity="0.8"
                              stroke="#ffffff"
                              strokeWidth="1.5"
                            />
                            {elem.label && (
                              <text
                                x="0"
                                y="3"
                                textAnchor="middle"
                                fontSize="9"
                                fontWeight="black"
                                fill="#ffffff"
                                className="font-sans select-none tracking-tight uppercase"
                              >
                                {elem.label}
                              </text>
                            )}
                          </g>
                        );
                      } else if (elem.type === 'squares_group') {
                        const baseSize = elem.width || 20;
                        const isVert = elem.orientation === 'vertical';
                        const items = elem.items || Array.from({ length: elem.count || 5 }).map(() => ({
                          shape: 'rectangular' as const,
                          color: elem.color || '#3b82f6'
                        }));
                        
                        const sizes = items.map(item => {
                          if (item.shape === 'cuadrado') {
                            return { w: baseSize * 0.7, h: baseSize * 0.7 };
                          } else {
                            if (isVert) {
                              return { w: baseSize * 0.7, h: baseSize * 1.5 };
                            } else {
                              return { w: baseSize * 1.5, h: baseSize * 0.7 };
                            }
                          }
                        });

                        const strokeW = elem.grosor || 2;

                        let totalWidth = 0;
                        let totalHeight = 0;
                        if (isVert) {
                          totalWidth = Math.max(...sizes.map(s => s.w), baseSize * 0.7);
                          totalHeight = sizes.reduce((sum, s) => sum + s.h, 0);
                        } else {
                          totalWidth = sizes.reduce((sum, s) => sum + s.w, 0);
                          totalHeight = Math.max(...sizes.map(s => s.h), baseSize * 0.7);
                        }

                        let accumulated = 0;
                        return (
                          <g>
                            {items.map((item, i) => {
                              const s = sizes[i];
                              const color = item.color || elem.color || '#3b82f6';
                              const fillVal = elem.withFill ? `${color}40` : 'transparent';
                              
                              let rectX = 0;
                              let rectY = 0;
                              
                              if (isVert) {
                                rectX = -s.w / 2;
                                rectY = -totalHeight / 2 + accumulated;
                                accumulated += s.h;
                              } else {
                                rectX = -totalWidth / 2 + accumulated;
                                rectY = -s.h / 2;
                                accumulated += s.w;
                              }
                              
                              return (
                                <rect
                                  key={i}
                                  x={rectX}
                                  y={rectY}
                                  width={s.w}
                                  height={s.h}
                                  fill={fillVal}
                                  stroke={color}
                                  strokeWidth={strokeW}
                                  rx={2}
                                  pointerEvents="all"
                                />
                              );
                            })}
                            {elem.label && (
                              <text
                                x="0"
                                y={totalHeight / 2 + 12}
                                textAnchor="middle"
                                fontSize="8"
                                fontWeight="black"
                                fill="#475569"
                                className="font-sans select-none tracking-tight"
                              >
                                {elem.label}
                              </text>
                            )}
                          </g>
                        );
                      } else if (elem.type === 'circle') {
                        const r = elem.width / 2;
                        return (
                          <g>
                            <circle
                              cx="0"
                              cy="0"
                              r={r}
                              fill={elem.color || '#ec4899'}
                              fillOpacity="0.85"
                              stroke="#ffffff"
                              strokeWidth="1.5"
                            />
                            {elem.label && (
                              <text
                                x="0"
                                y="3"
                                textAnchor="middle"
                                fontSize="9"
                                fontWeight="black"
                                fill="#ffffff"
                                className="font-sans select-none tracking-tight uppercase"
                              >
                                {elem.label}
                              </text>
                            )}
                          </g>
                        );
                      } else if (elem.type === 'image') {
                        if (elem.imgSrc?.startsWith('preset:')) {
                          const presetKey = elem.imgSrc.replace('preset:', '');
                          return (
                            <g>
                              {renderPresetSVG(presetKey, elem.color)}
                              {elem.label && (
                                <text
                                  x="0"
                                  y={elem.height / 2 + 10}
                                  textAnchor="middle"
                                  fontSize="8"
                                  fontWeight="black"
                                  fill="#cbd5e1"
                                  className="font-sans select-none tracking-tight"
                                >
                                  {elem.label}
                                </text>
                              )}
                            </g>
                          );
                        } else {
                          // Uploaded Custom base64 image representation
                          return (
                            <g>
                              <image
                                href={elem.imgSrc}
                                x={-elem.width / 2}
                                y={-elem.height / 2}
                                width={elem.width}
                                height={elem.height}
                                preserveAspectRatio="xMidYMid meet"
                              />
                              {elem.label && (
                                <text
                                  x="0"
                                  y={elem.height / 2 + 10}
                                  textAnchor="middle"
                                  fontSize="8"
                                  fontWeight="black"
                                  fill="#cbd5e1"
                                  className="font-sans select-none tracking-tight animate-fade-in"
                                >
                                  {elem.label}
                                </text>
                              )}
                            </g>
                          );
                        }
                      }
                      return null;
                    })()}

                  </g>
                );
              })}

              <rect x="15" y="582" width="140" height="20" rx="10" fill="#020617" fillOpacity="0.85" />
              <text x="85" y="595" fontSize="8" fontWeight="black" fill="#38bdf8" textAnchor="middle" className="tracking-widest uppercase font-mono">LIMA HEADQUARTERS</text>

            </svg>
          </div>

          {/* Floater Hover label tooltip */}
          <AnimatePresence>
            {hoveredRack && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 5 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'absolute',
                  left: `${hoveredRack.x}px`,
                  top: `${hoveredRack.y - 120}px`,
                  transform: 'translateX(-50%)',
                  pointerEvents: 'none',
                  zIndex: 40
                }}
                className="bg-slate-900 border border-slate-700 p-4 rounded-2xl shadow-xl space-y-2 w-56 text-white text-xs select-none"
              >
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900"></div>
                
                <div className="flex justify-between items-center pb-2 border-b border-slate-800">
                  <span className="font-black tracking-tight">{hoveredRack.title}</span>
                  <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded">
                    {hoveredRack.zoneName}
                  </span>
                </div>

                {hoveredRack.rack ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 py-1">
                      <div>
                        <div className="text-[8px] font-black text-slate-400 uppercase">Capacidad</div>
                        <div className="text-sm font-black font-mono">
                          {hoveredRack.levels * hoveredRack.positions} <span className="text-[10px] text-slate-500 font-bold">SLOTS</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[8px] font-black text-slate-400 uppercase font-sans">Ocupación</div>
                        <div className={`text-sm font-black font-mono ${getRackStats(hoveredRack.rack).percentage > 85 ? 'text-red-500' : 'text-emerald-400'}`}>
                          {getRackStats(hoveredRack.rack).percentage}%
                        </div>
                      </div>
                    </div>
                    <div className="bg-slate-950 p-2 rounded-xl text-[10px] space-y-1">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-bold uppercase">Asignados:</span>
                        <span className="font-extrabold font-mono text-emerald-400">{getRackStats(hoveredRack.rack).occupied} LPNs</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-bold uppercase">Vacíos:</span>
                        <span className="font-extrabold font-mono text-slate-300">{(hoveredRack.levels * hoveredRack.positions) - getRackStats(hoveredRack.rack).occupied}</span>
                      </div>
                    </div>
                    <div className="text-[8px] italic text-[#38bdf8] text-center uppercase font-black tracking-widest pt-1">
                      ⚡ CLICK PARA REVISAR DETALLES ⚡
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      Este estante físico aún no ha sido dado de alta en la base de datos Supabase.
                    </p>
                    <div className="text-[8px] text-amber-400 text-center uppercase font-black tracking-widest pt-1">
                      👉 CLICK PARA CREAR 👈
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Floating Zoom controls HUD */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-white/90 backdrop-blur border border-slate-200 p-1.5 rounded-xl shadow-md z-30 select-none">
            <button
              onClick={handleZoomOut}
              disabled={zoomScale <= 0.7}
              className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded text-slate-700 disabled:opacity-40 text-sm font-bold cursor-pointer"
              title="Disminuir Zoom"
            >
              -
            </button>
            <span className="text-[10px] font-mono font-black text-slate-500 w-10 text-center">
              {Math.round(zoomScale * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              disabled={zoomScale >= 2.5}
              className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded text-slate-700 disabled:opacity-40 text-sm font-bold cursor-pointer"
              title="Aumentar Zoom"
            >
              +
            </button>
            {zoomScale !== 1 && (
              <button
                onClick={handleResetZoom}
                className="px-2 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg text-[9px] font-bold"
                title="Restaurar zoom"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Right Sidebar: Designer Tools Options Panels */}
        {isDesignerMode && (
          <div className="w-full lg:w-80 bg-white border border-slate-200 p-4 rounded-[2rem] shadow-sm flex flex-col gap-4 shrink-0 animate-fade-in animate-duration-300">
            
            {/* Header */}
            <div>
              <h4 className="text-xs font-black text-slate-850 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-indigo-600 animate-spin-slow" />
                Herramientas de Rediseño
              </h4>
              <p className="text-[10px] text-gray-400 font-bold uppercase">Ajuste y configure su almacén en 2D</p>
            </div>

            {/* Clean action to open the Builder Modal - NO CONFOUNDING OPTIONS */}
            <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-col gap-2">
              <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider">Editor de Estanterías</span>
              <p className="text-[10px] text-slate-500 leading-normal font-sans font-medium">Use nuestro asistente visual para crear hileras de racks configurando cantidad, dimensiones y orientación desde una vista de pájaro.</p>
              <button
                type="button"
                onClick={() => setIsBuilderModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 transition-all text-white text-[11px] font-black uppercase tracking-wider rounded-xl cursor-pointer shadow-sm hover:shadow-md"
              >
                <Plus className="w-4 h-4" />
                🛠️ CREAR RACKS (ASISTENTE)
              </button>
            </div>

            {/* Sub-Plan visibility Switch */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-gray-150 rounded-xl">
              <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">Ver Plano Original</span>
              <button
                type="button"
                onClick={() => setShowBasePlan(!showBasePlan)}
                className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                  showBasePlan ? 'bg-indigo-500' : 'bg-slate-300'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform duration-200 ${showBasePlan ? 'translate-x-5' : ''}`}></div>
              </button>
            </div>

            {/* Selected Element Fine-tuning Controls */}
            <div className="flex-1 border-t border-gray-150 pt-3 flex flex-col gap-3 min-h-0 overflow-y-auto no-scrollbar">
              <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest block">Propiedades del Elemento</span>
              
              {selectedElement ? (
                <div className="space-y-3">
                  
                  {/* Element label */}
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">Etiqueta / Nombre</label>
                    <input 
                      type="text"
                      value={selectedElement.label || ''}
                      onChange={(e) => updateSelectedProperty('label', e.target.value)}
                      className="w-full py-1.5 px-2.5 bg-slate-50 border border-gray-200 rounded-lg text-xs font-bold focus:ring-1 focus:ring-blue-400 outline-none"
                    />
                  </div>

                  {/* Positioning slider */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">X (Cords)</label>
                      <input 
                        type="number"
                        value={selectedElement.x}
                        onChange={(e) => updateSelectedProperty('x', Number(e.target.value))}
                        className="w-full py-1 px-2 bg-slate-50 border border-gray-200 rounded-lg text-xs font-bold font-mono outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-0.5">Y (Cords)</label>
                      <input 
                        type="number"
                        value={selectedElement.y}
                        onChange={(e) => updateSelectedProperty('y', Number(e.target.value))}
                        className="w-full py-1 px-2 bg-slate-50 border border-gray-200 rounded-lg text-xs font-bold font-mono outline-none"
                      />
                    </div>
                  </div>

                  {/* Size resizing inputs - Slider */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Tamaño / Ancho (px)</label>
                      <input 
                        type="number"
                        min="15"
                        max="350"
                        value={selectedElement.width}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 15;
                          updateSelectedProperty('width', val);
                          if (selectedElement.type === 'circle' || selectedElement.type === 'rect') {
                            updateSelectedProperty('height', val); // Maintain aspect ratios
                          }
                        }}
                        className="w-16 text-center py-0.5 bg-slate-50 dark:bg-slate-900 border border-gray-250 rounded text-[10px] font-bold font-mono outline-none"
                      />
                    </div>
                    <input 
                      type="range"
                      min="15"
                      max="350"
                      value={selectedElement.width}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        updateSelectedProperty('width', val);
                        if (selectedElement.type === 'circle' || selectedElement.type === 'rect') {
                          updateSelectedProperty('height', val); // Maintain aspect ratios
                        }
                      }}
                      className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-100 rounded-md"
                    />
                  </div>

                  {selectedElement.type !== 'circle' && selectedElement.type !== 'image' && selectedElement.type !== 'squares_group' && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Alto (px)</label>
                        <input 
                          type="number"
                          min="10"
                          max="250"
                          value={selectedElement.height}
                          onChange={(e) => updateSelectedProperty('height', Number(e.target.value) || 10)}
                          className="w-16 text-center py-0.5 bg-slate-50 dark:bg-slate-900 border border-gray-250 rounded text-[10px] font-bold font-mono outline-none"
                        />
                      </div>
                      <input 
                        type="range"
                        min="10"
                        max="250"
                        value={selectedElement.height}
                        onChange={(e) => updateSelectedProperty('height', Number(e.target.value))}
                        className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-100 rounded-md"
                      />
                    </div>
                  )}

                  {/* Rotation controller slider */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Rotación (°)</label>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number"
                          min="0"
                          max="360"
                          value={selectedElement.rotate || 0}
                          onChange={(e) => {
                            let val = Number(e.target.value);
                            if (val < 0) val = 0;
                            if (val > 360) val = 360;
                            updateSelectedProperty('rotate', val);
                          }}
                          className="w-16 text-center py-0.5 bg-slate-50 dark:bg-slate-900 border border-gray-250 rounded text-[10px] font-bold font-mono outline-none"
                        />
                        <span className="text-[9px] text-slate-400 font-bold">°</span>
                      </div>
                    </div>
                    <input 
                      type="range"
                      min="0"
                      max="360"
                      value={selectedElement.rotate || 0}
                      onChange={(e) => updateSelectedProperty('rotate', Number(e.target.value))}
                      className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-100 rounded-md"
                    />
                  </div>

                  {/* Color chooser */}
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">Color de Relleno</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#d97706', '#64748b'].map(c => (
                        <button
                          key={c}
                          onClick={() => updateSelectedProperty('color', c)}
                          style={{ backgroundColor: c }}
                          className={`w-5 h-5 rounded-md border transition-transform cursor-pointer ${
                            selectedElement.color === c ? 'scale-115 border-slate-700 font-bold text-white text-[8px]' : 'border-gray-200'
                          }`}
                        >
                          {selectedElement.color === c ? '✓' : ''}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Exclusive custom sliders for Squares Group */}
                  {selectedElement.type === 'squares_group' && (
                    <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-xl space-y-2.5">
                      <span className="text-[9px] font-black text-[#009ED6] uppercase tracking-wider block">Distribución de Grupos</span>
                      
                      {/* Count of squares */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[8.5px] font-black text-slate-500 uppercase font-bold">Cantidad de Racks (N)</label>
                        </div>
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-lg p-0.5">
                          <button 
                            type="button"
                            onClick={() => {
                              const newCount = Math.max(1, (selectedElement.count || 5) - 1);
                              updateSelectedProperty('count', newCount);
                            }}
                            className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 flex items-center justify-center font-black text-slate-705 cursor-pointer text-xs transition-all"
                          >
                            -
                          </button>
                          <input 
                            type="number"
                            min="1"
                            max="50"
                            value={selectedElement.count || 5}
                            onChange={(e) => {
                              const val = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                              updateSelectedProperty('count', val);
                            }}
                            className="flex-1 text-center bg-transparent border-0 text-xs font-black text-slate-800 dark:text-slate-100 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button 
                            type="button"
                            onClick={() => {
                              const newCount = Math.min(50, (selectedElement.count || 5) + 1);
                              updateSelectedProperty('count', newCount);
                            }}
                            className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 flex items-center justify-center font-black text-slate-705 cursor-pointer text-xs transition-all"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Orientation */}
                      <div>
                        <label className="text-[8.5px] font-black text-slate-500 uppercase block mb-1">Orientación</label>
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() => updateSelectedProperty('orientation', 'horizontal')}
                            className={`py-1 px-1.5 text-[9px] font-black rounded border transition-colors ${
                              selectedElement.orientation === 'horizontal'
                                ? 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300'
                                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-850 dark:text-slate-400'
                            }`}
                          >
                            Horizontal
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSelectedProperty('orientation', 'vertical')}
                            className={`py-1 px-1.5 text-[9px] font-black rounded border transition-colors ${
                              selectedElement.orientation === 'vertical'
                                ? 'bg-indigo-100 border-indigo-300 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-800 dark:text-indigo-300'
                                : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-850 dark:text-slate-400'
                            }`}
                          >
                            Vertical
                          </button>
                        </div>
                      </div>

                      {/* Line thickness (Grosor) */}
                      <div>
                        <div className="flex justify-between items-center mb-0.5">
                          <label className="text-[8.5px] font-black text-slate-500 uppercase font-bold">Grosor de Línea: {selectedElement.grosor || 2}px</label>
                        </div>
                        <input 
                          type="range"
                          min="1"
                          max="12"
                          value={selectedElement.grosor || 2}
                          onChange={(e) => updateSelectedProperty('grosor', Number(e.target.value))}
                          className="w-full accent-cyan-500 h-1 bg-gray-200 rounded cursor-pointer"
                        />
                      </div>

                      {/* Relleno slider */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[8.5px] font-black text-slate-500 uppercase">Con Relleno</span>
                        <button
                          type="button"
                          onClick={() => updateSelectedProperty('withFill', !selectedElement.withFill)}
                          className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                            selectedElement.withFill ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                        >
                          <div className={`w-3 h-3 rounded-full bg-white transition-transform duration-200 ${selectedElement.withFill ? 'translate-x-4' : ''}`}></div>
                        </button>
                      </div>

                      {/* Configuración de cuerpos individuales */}
                      <div className="space-y-1.5 pt-2 border-t border-slate-200/50">
                        <span className="text-[9px] font-black text-indigo-600 uppercase tracking-wider block">🔬 Configurar Cuerpos</span>
                        <p className="text-[8px] text-slate-400 font-sans uppercase font-medium leading-normal">Cambia la forma o color de cada rack individualmente</p>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 border border-slate-100 rounded-lg p-1.5 bg-white custom-scrollbar">
                          {(selectedElement.items || Array.from({ length: selectedElement.count || 5 }).map(() => ({ shape: 'rectangular' as const, color: selectedElement.color || '#3b82f6' }))).map((item, idx) => (
                            <div key={idx} className="flex flex-col gap-1.5 p-1.5 bg-slate-50 rounded-md border border-slate-150">
                              <div className="flex items-center justify-between">
                                <span className="text-[8.5px] font-black text-slate-650">CUERPO #{idx + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const currentItems = [...(selectedElement.items || Array.from({ length: selectedElement.count || 5 }).map(() => ({ shape: 'rectangular' as const, color: selectedElement.color || '#3b82f6' })))];
                                    currentItems[idx] = {
                                      ...currentItems[idx],
                                      shape: currentItems[idx].shape === 'cuadrado' ? 'rectangular' : 'cuadrado'
                                    };
                                    updateSelectedProperty('items', currentItems);
                                  }}
                                  className={`text-[8.5px] font-black px-1.5 py-0.5 rounded border cursor-pointer ${
                                    item.shape === 'cuadrado' ? 'bg-amber-100 border-amber-300 text-amber-850' : 'bg-indigo-100 border-indigo-300 text-indigo-855'
                                  }`}
                                >
                                  {item.shape === 'cuadrado' ? 'Cuadrado' : 'Rectángulo'}
                                </button>
                              </div>
                              <div className="flex gap-1 flex-wrap justify-center">
                                {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'].map(c => (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => {
                                      const currentItems = [...(selectedElement.items || Array.from({ length: selectedElement.count || 5 }).map(() => ({ shape: 'rectangular' as const, color: selectedElement.color || '#3b82f6' })))];
                                      currentItems[idx] = {
                                        ...currentItems[idx],
                                        color: c
                                      };
                                      updateSelectedProperty('items', currentItems);
                                    }}
                                    className={`w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer ${
                                      item.color === c ? 'scale-120 border-slate-800' : 'border-slate-205'
                                    }`}
                                    style={{ backgroundColor: c }}
                                  />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Database pairing if Type is Rack */}
                  {selectedElement.type === 'rack' && (
                    <div className="bg-amber-50/50 p-2.5 border border-amber-200 rounded-xl space-y-2">
                      <span className="text-[9px] font-black text-amber-700 uppercase tracking-wider block">Estructura & Base de Datos</span>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[8px] font-black text-slate-500 uppercase block mb-0.5">Pasillo</label>
                          <select
                            value={selectedElement.aisle || 'A'}
                            onChange={(e) => updateSelectedProperty('aisle', e.target.value)}
                            className="w-full text-xs bg-white border border-gray-200 rounded p-1 font-black outline-none"
                          >
                            {['A', 'B', 'C', 'D', 'E', 'F'].map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[8px] font-black text-slate-500 uppercase block mb-0.5">Módulo ID</label>
                          <select
                            value={selectedElement.rackId || 1}
                            onChange={(e) => updateSelectedProperty('rackId', Number(e.target.value))}
                            className="w-full text-xs bg-white border border-gray-200 rounded p-1 font-black outline-none"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(rid => <option key={rid} value={rid}>{rid}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="text-[8px] font-black text-slate-500 uppercase block mb-0.5">Niveles ({selectedElement.levels || 6})</label>
                          <input 
                            type="range"
                            min="1"
                            max="8"
                            value={selectedElement.levels || 6}
                            onChange={(e) => updateSelectedProperty('levels', Number(e.target.value))}
                            className="w-full accent-[#ea580c] h-1 bg-gray-200 rounded"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] font-black text-slate-500 uppercase block mb-0.5">Slots/Nivel ({selectedElement.positions || 6})</label>
                          <input 
                            type="range"
                            min="1"
                            max="20"
                            value={selectedElement.positions || 6}
                            onChange={(e) => updateSelectedProperty('positions', Number(e.target.value))}
                            className="w-full accent-[#ea580c] h-1 bg-gray-200 rounded"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Duplicate & Remove elements */}
                  <div className="flex gap-2 pt-2 border-t border-gray-100">
                    <button
                      onClick={handleDuplicateElement}
                      className="flex-1 flex items-center justify-center gap-1 py-2 bg-indigo-50 border border-indigo-150 hover:bg-indigo-100 text-indigo-700 rounded-xl text-[10px] font-extrabold uppercase tracking-wide cursor-pointer transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Duplicar
                    </button>
                    <button
                      onClick={handleDeleteElement}
                      className="flex-1 flex items-center justify-center gap-1 py-2 bg-rose-50 border border-rose-150 hover:bg-rose-100 text-rose-700 rounded-xl text-[10px] font-extrabold uppercase tracking-wide cursor-pointer transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  </div>

                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 p-4 border border-dashed border-gray-200 rounded-2xl bg-slate-50">
                  <Move className="w-8 h-8 mb-2 text-gray-300 animate-bounce" />
                  <p className="text-[10px] font-bold uppercase tracking-wide">Ningún elemento seleccionado</p>
                  <p className="text-[9px] text-gray-400 mt-1 leading-normal">Haga click en cualquier elemento dibujado o presets en el lienzo para ajustar sus propiedades.</p>
                </div>
              )}

            </div>

          </div>
        )}

      </div>

      {/* 2D Rack Builder Full-Screen Modal */}
      {isBuilderModalOpen && (
        <div className="fixed inset-0 z-[999] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 lg:p-10 select-none animate-fade-in-fast">
          <div className="bg-white dark:bg-slate-900 w-full max-w-5xl h-full max-h-[92vh] md:max-h-[85vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
                  <span className="p-1 px-2 bg-indigo-100 dark:bg-indigo-950/50 text-indigo-600 rounded-lg text-[10px] font-black">2D ARRIBA</span>
                  Diseñador de Hilera de Racks
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Construya la distribución de sus estanterías de almacenamiento</p>
              </div>
              <button 
                onClick={() => {
                  setIsBuilderModalOpen(false);
                  if (canvasElements.length === 0) {
                    setIsDesignerMode(false);
                  }
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-lg font-black p-2 rounded-full cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {/* Split Panel */}
            <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-y-auto md:overflow-hidden">
              
              {/* Left Side: Living 2D Preview Container */}
              <div className="flex-1 bg-slate-50 dark:bg-slate-950 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-slate-100 dark:border-slate-800 shrink-0 md:shrink">
                <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">VISTA PREVIA DESDE ARRIBA (2D)</span>
                
                {/* Simulated grid area */}
                <div className="w-full max-w-sm aspect-square bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl relative overflow-hidden flex items-center justify-center shadow-inner">
                  {/* Dotted Grid lines */}
                  <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] dark:bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:16px_16px] opacity-70"></div>
                  
                  {/* Living SVG rendering */}
                  <svg className="w-full h-full p-8" viewBox="0 0 300 300">
                    <g transform="translate(150, 150)">
                      {(() => {
                        const count = squaresCount;
                        const isVert = squaresOrientation === 'vertical';
                        const baseSize = squaresSize;
                        
                        const sizes = builderItems.map(item => {
                          if (item.shape === 'cuadrado') {
                            return { w: baseSize * 0.7, h: baseSize * 0.7 };
                          } else {
                            if (isVert) {
                              return { w: baseSize * 0.7, h: baseSize * 1.5 };
                            } else {
                              return { w: baseSize * 1.5, h: baseSize * 0.7 };
                            }
                          }
                        });

                        const strokeW = squaresGrosor;

                        let totalWidth = 0;
                        let totalHeight = 0;
                        if (isVert) {
                          totalWidth = Math.max(...sizes.map(s => s.w), baseSize * 0.7);
                          totalHeight = sizes.reduce((sum, s) => sum + s.h, 0);
                        } else {
                          totalWidth = sizes.reduce((sum, s) => sum + s.w, 0);
                          totalHeight = Math.max(...sizes.map(s => s.h), baseSize * 0.7);
                        }

                        // Ensure fitting inside 220px bounds for viewport scaling
                        const maxBound = Math.max(totalWidth, totalHeight);
                        const scaleFactor = maxBound > 220 ? 220 / maxBound : 1;

                        let accumulated = 0;
                        return (
                          <g transform={`scale(${scaleFactor})`}>
                            {builderItems.map((item, i) => {
                              const s = sizes[i];
                              const color = item.color;
                              const fillHex = squaresFill ? `${color}30` : 'transparent';
                              
                              let rectX = 0;
                              let rectY = 0;
                              
                              if (isVert) {
                                rectX = -s.w / 2;
                                rectY = -totalHeight / 2 + accumulated;
                                accumulated += s.h;
                              } else {
                                rectX = -totalWidth / 2 + accumulated;
                                rectY = -s.h / 2;
                                accumulated += s.w;
                              }

                              return (
                                <rect
                                  key={i}
                                  x={rectX}
                                  y={rectY}
                                  width={s.w}
                                  height={s.h}
                                  fill={fillHex}
                                  stroke={color}
                                  strokeWidth={strokeW}
                                  rx={2}
                                />
                              );
                            })}
                            
                            {/* Visual dimension lines */}
                            <text
                              x="0"
                              y={totalHeight / 2 + 16}
                              textAnchor="middle"
                              fontSize="9"
                              fontWeight="black"
                              fill="#64748b"
                              className="font-mono tracking-tighter"
                            >
                              {count} CUERPOS (DISEÑO COMBINADO)
                            </text>
                          </g>
                        );
                      })()}
                    </g>
                  </svg>
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-center">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">
                    💡 TIP: Al insertar, puedes arrastrar la hilera en cualquier dirección con el mouse.
                  </span>
                </div>
              </div>

              {/* Right Side: Setup Controls */}
              <div className="w-full md:w-80 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between overflow-y-auto no-scrollbar border-t md:border-t-0 border-slate-100 dark:border-slate-800">
                <div className="space-y-4">
                  <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 tracking-wider uppercase block border-b border-slate-105 dark:border-slate-800 pb-2">
                    Herramientas de Diseño
                  </span>

                  {/* 1. Agregar Rack (N Racks count) - Spinner INCREMENTER ONLY, NO SLIDER BAR */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-black text-slate-650 dark:text-slate-450 uppercase">
                      <span>Cantidad de Racks (N)</span>
                      <span className="text-indigo-600 dark:text-indigo-400 font-black text-xs">{squaresCount} Racks</span>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-805 rounded-xl p-1">
                      <button 
                        type="button"
                        onClick={() => setSquaresCount(Math.max(1, squaresCount - 1))}
                        className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-black text-slate-705 cursor-pointer text-sm transition-all"
                      >
                        -
                      </button>
                      <input 
                        type="number"
                        min="1"
                        max="50"
                        value={squaresCount}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(50, Number(e.target.value) || 1));
                          setSquaresCount(val);
                        }}
                        className="flex-1 text-center bg-transparent border-0 text-xs font-black text-slate-800 dark:text-slate-100 outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button 
                        type="button"
                        onClick={() => setSquaresCount(Math.min(50, squaresCount + 1))}
                        className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-black text-slate-705 cursor-pointer text-sm transition-all"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* 2. Orientación (Horizontal o Vertical) */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-black text-slate-500 uppercase block">Orientación</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSquaresOrientation('horizontal')}
                        className={`py-2 px-3 text-[10px] font-black uppercase rounded-xl border transition-all cursor-pointer ${
                          squaresOrientation === 'horizontal'
                            ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Horizontal
                      </button>
                      <button
                        type="button"
                        onClick={() => setSquaresOrientation('vertical')}
                        className={`py-2 px-3 text-[10px] font-black uppercase rounded-xl border transition-all cursor-pointer ${
                          squaresOrientation === 'vertical'
                            ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Vertical
                      </button>
                    </div>
                  </div>

                  {/* 3. Tamaño */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase block">
                      <span>Tamaño Base</span>
                      <span className="text-slate-800 dark:text-slate-200 font-extrabold font-mono text-xs">{squaresSize}px</span>
                    </div>
                    <input 
                      type="range"
                      min="12"
                      max="60"
                      value={squaresSize}
                      onChange={(e) => setSquaresSize(Number(e.target.value))}
                      className="w-full accent-indigo-600 h-1.5 cursor-pointer bg-slate-200 dark:bg-slate-700 rounded-lg"
                    />
                  </div>

                  {/* 4. Cuadrado o Rectangular (Global) */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-black text-slate-500 uppercase block">
                      <span>Geometría Global</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetGlobalShape('cuadrado')}
                        className={`py-2 px-3 text-[10px] font-black uppercase rounded-xl border transition-all cursor-pointer ${
                          squaresShape === 'cuadrado'
                            ? 'bg-indigo-605 bg-indigo-600 border-indigo-700 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Todo Cuadrado
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetGlobalShape('rectangular')}
                        className={`py-2 px-3 text-[10px] font-black uppercase rounded-xl border transition-all cursor-pointer ${
                          squaresShape === 'rectangular'
                            ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-755 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        Todo Rectang.
                      </button>
                    </div>
                  </div>

                  {/* 5. Color Principal (Global) */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase block">Color Global</span>
                    <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                      {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'].map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleSetGlobalColor(c)}
                          className={`w-6 h-6 rounded-full border transition-transform cursor-pointer flex items-center justify-center ${
                            squaresColor === c ? 'scale-120 border-slate-700 dark:border-slate-400' : 'border-slate-200 dark:border-slate-800'
                          }`}
                          style={{ backgroundColor: c }}
                        >
                          {squaresColor === c && <span className="text-white text-[9px] font-black">✓</span>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* CON Relleno slider/checkbox */}
                  <div className="flex items-center justify-between p-2 mt-1 bg-slate-50 dark:bg-slate-950/40 rounded-xl">
                    <span className="text-[9px] font-black text-slate-605 dark:text-slate-450 uppercase">Con Relleno translúcido</span>
                    <button
                      type="button"
                      onClick={() => setSquaresFill(!squaresFill)}
                      className={`w-8 h-4 rounded-full p-0.5 transition-colors duration-200 focus:outline-none ${
                        squaresFill ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-800'
                      }`}
                    >
                      <div className={`w-3 h-3 rounded-full bg-white transition-transform duration-200 ${squaresFill ? 'translate-x-4' : ''}`}></div>
                    </button>
                  </div>

                  {/* Configuración Individual de Racks (COMBINED SEQUENCE BUILDER) */}
                  <div className="space-y-1.5 border-t border-slate-105 dark:border-slate-110 pt-3">
                    <span className="text-[10px] font-black text-indigo-605 dark:text-indigo-400 tracking-wider uppercase block">
                      🔬 Configuración Combinada
                    </span>
                    <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1 border border-slate-100 dark:border-slate-800 rounded-xl p-2 bg-slate-50 dark:bg-slate-950/30 custom-scrollbar">
                      {builderItems.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 rounded-lg shadow-2xs border border-slate-100 dark:border-slate-800">
                          <span className="text-[9px] font-black text-slate-500">RACK #{idx + 1}</span>
                          <div className="flex items-center gap-1.5">
                            {/* Individual geometry drop-down button */}
                            <button
                              type="button"
                              onClick={() => {
                                const copy = [...builderItems];
                                copy[idx] = { ...copy[idx], shape: copy[idx].shape === 'cuadrado' ? 'rectangular' : 'cuadrado' };
                                setBuilderItems(copy);
                              }}
                              className={`py-0.5 px-1.5 text-[8px] font-black uppercase rounded border cursor-pointer ${
                                item.shape === 'cuadrado'
                                  ? 'bg-amber-50 border-amber-250 text-amber-700'
                                  : 'bg-indigo-50 border-indigo-250 text-indigo-700'
                              }`}
                            >
                              {item.shape === 'cuadrado' ? 'Cuadrado' : 'Rectang.'}
                            </button>

                            {/* Individual color bulbs */}
                            <div className="flex gap-0.5">
                              {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'].map(c => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => {
                                    const copy = [...builderItems];
                                    copy[idx] = { ...copy[idx], color: c };
                                    setBuilderItems(copy);
                                  }}
                                  className={`w-3.5 h-3.5 rounded-full border transition-transform cursor-pointer ${
                                    item.color === c ? 'scale-115 border-slate-800' : 'border-slate-200'
                                  }`}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Confirm / Cancel Actions */}
                <div className="pt-4 mt-2 space-y-1.5 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      handleAddSquaresGroup(
                        squaresCount,
                        squaresOrientation,
                        squaresSize,
                        squaresShape,
                        squaresColor,
                        squaresGrosor,
                        squaresFill,
                        builderItems
                      );
                      setIsBuilderModalOpen(false);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10.5px] uppercase tracking-wider rounded-xl cursor-pointer shadow-md transition-all active:scale-95"
                  >
                    Aceptar (Insertar en el Mapa)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsBuilderModalOpen(false);
                      if (canvasElements.length === 0) {
                        setIsDesignerMode(false);
                      }
                    }}
                    className="w-full py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-500 dark:text-slate-300 text-center font-black text-[10px] uppercase tracking-wider rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && elementToDelete && (
        <div className="fixed inset-0 z-[1000] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in-fast select-none">
          <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center animate-scale-in">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">¿Confirmar Eliminación?</h4>
            <p className="text-[11px] text-slate-400 dark:text-slate-400 mt-2 font-semibold">
              ¿Está seguro de que desea eliminar permanentemente este elemento {elementToDelete.label ? `"${elementToDelete.label}"` : 'seleccionado'} del plano de distribución?
            </p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setElementToDelete(null);
                }}
                className="py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 hover:scale-102 active:scale-98 text-slate-600 dark:text-slate-300 rounded-xl text-[10px] font-extrabold uppercase tracking-widest cursor-pointer transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteElement}
                className="py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-extrabold uppercase tracking-widest cursor-pointer hover:scale-102 active:scale-98 transition-all shadow-md shadow-rose-600/10"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* High Fidelity Elevation Design Modal */}
      {viewingRackElement && (
        <div className="fixed inset-0 z-[999] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 lg:p-10 select-none animate-fade-in-fast">
          <div className="bg-white dark:bg-slate-900 w-full max-w-7xl h-full max-h-[92vh] md:max-h-[85vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            
            {/* Header with Title & Live Occupancy Meter */}
            <div className="px-6 py-5 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-150 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setViewingRackElement(null);
                    setEditingSlotKey(null);
                  }}
                  className="px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-250 dark:border-slate-700 text-slate-700 dark:text-slate-100 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                >
                  ← Volver al plano
                </button>
                <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-800 hidden md:block"></div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                    <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest flex items-center gap-2">
                      <input
                        type="text"
                        value={viewingRackElement.label || 'Rack Inteligente'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setViewingRackElement(prev => prev ? { ...prev, label: val } : null);
                          setCanvasElements(prev => prev.map(el => el.id === viewingRackElement.id ? { ...el, label: val } : el));
                        }}
                        className="bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-500 font-black text-slate-800 dark:text-slate-100 focus:outline-none focus:border-indigo-500 min-w-[140px] px-1 py-0.5"
                      />
                      <span className="text-slate-300">•</span>
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400">PASILLO</span>
                      <input
                        type="text"
                        value={viewingRackElement.aisle || 'B'}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setViewingRackElement(prev => prev ? { ...prev, aisle: val } : null);
                          setCanvasElements(prev => prev.map(el => el.id === viewingRackElement.id ? { ...el, aisle: val } : el));
                        }}
                        className="bg-transparent border-b border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-500 font-bold text-slate-700 dark:text-slate-100 focus:outline-none focus:border-indigo-500 w-10 text-center uppercase py-0.5"
                      />
                    </h3>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-wider">
                    Vista de Elevación Lateral (Horizontal) • {viewingRackElement.levels || 3} niveles x {viewingRackElement.positions || 12} posiciones • {Object.values(viewingRackElement.slotData || {}).filter(s => s?.occupied).length} pallets ocupados
                  </p>
                </div>
              </div>
              
              {/* Dynamic Progress Indicator */}
              <div className="flex items-center gap-4 bg-white dark:bg-slate-950/20 px-4 py-2 border border-slate-150 dark:border-slate-800/60 rounded-2xl shadow-sm shrink-0">
                <div className="text-right">
                  <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Ocupación del Estante</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-24 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200 dark:border-slate-950">
                      {(() => {
                        const sData = viewingRackElement.slotData || {};
                        const lvls = viewingRackElement.levels || 3;
                        const poss = viewingRackElement.positions || 12;
                        const tot = lvls * poss;
                        const occ = Object.values(sData).filter(s => s?.occupied).length;
                        const rate = tot > 0 ? Math.min(100, Math.round((occ / tot) * 100)) : 0;
                        return (
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              rate > 80 ? 'bg-amber-600' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${rate}%` }}
                          />
                        );
                      })()}
                    </div>
                    <span className="text-xs font-black text-slate-700 dark:text-slate-200 font-mono">
                      {(() => {
                        const sData = viewingRackElement.slotData || {};
                        const lvls = viewingRackElement.levels || 3;
                        const poss = viewingRackElement.positions || 12;
                        const tot = lvls * poss;
                        const occ = Object.values(sData).filter(s => s?.occupied).length;
                        return tot > 0 ? Math.round((occ / tot) * 100) : 0;
                      })()}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Editing Dimensions bar "altura y largo", todo editable */}
            <div className="px-6 py-4 bg-indigo-50/40 dark:bg-slate-950/20 border-b border-indigo-100/30 dark:border-slate-800 flex flex-wrap items-center gap-6 text-xs font-bold text-slate-700 dark:text-slate-300">
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Dimensiones del Rack</span>
              
              {/* Altura (Niveles) */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-500">Altura (Niveles):</span>
                <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      const newL = Math.max(1, (viewingRackElement.levels || 3) - 1);
                      handleUpdateRackLayout(newL, viewingRackElement.positions || 12);
                    }}
                    className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-705 flex items-center justify-center font-black cursor-pointer text-slate-600 dark:text-slate-300 transition-all text-sm border border-slate-100 dark:border-slate-700"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={viewingRackElement.levels || 3}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(10, Number(e.target.value) || 1));
                      handleUpdateRackLayout(val, viewingRackElement.positions || 12);
                    }}
                    className="w-10 text-center font-black text-slate-800 dark:text-slate-200 focus:outline-none bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newL = Math.min(10, (viewingRackElement.levels || 3) + 1);
                      handleUpdateRackLayout(newL, viewingRackElement.positions || 12);
                    }}
                    className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-705 flex items-center justify-center font-black cursor-pointer text-slate-600 dark:text-slate-300 transition-all text-sm border border-slate-100 dark:border-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Largo (Bayas) */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-500">Largo (Bayas):</span>
                <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => {
                      const newP = Math.max(1, (viewingRackElement.positions || 12) - 1);
                      handleUpdateRackLayout(viewingRackElement.levels || 3, newP);
                    }}
                    className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 flex items-center justify-center font-black cursor-pointer text-slate-600 dark:text-slate-300 transition-all text-sm border border-slate-100 dark:border-slate-700"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={viewingRackElement.positions || 12}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(24, Number(e.target.value) || 1));
                      handleUpdateRackLayout(viewingRackElement.levels || 3, val);
                    }}
                    className="w-12 text-center font-black text-slate-800 dark:text-slate-200 focus:outline-none bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newP = Math.min(24, (viewingRackElement.positions || 12) + 1);
                      handleUpdateRackLayout(viewingRackElement.levels || 3, newP);
                    }}
                    className="w-7 h-7 rounded-lg bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 flex items-center justify-center font-black cursor-pointer text-slate-600 dark:text-slate-300 transition-all text-sm border border-slate-100 dark:border-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>
              
              <div className="text-[9px] uppercase tracking-wider text-amber-600 dark:text-amber-550 font-black flex items-center gap-1 bg-amber-50 dark:bg-amber-950/20 px-3 py-1.5 rounded-lg border border-amber-200/50">
                <span>⚠ Al modificar las bayas, la cantidad de estanterías en la distribución 2D se sincronizará automáticamente a {(viewingRackElement.levels || 3) * (viewingRackElement.positions || 12)} cuadrados.</span>
              </div>
            </div>

            {/* Custom high contrast dark background rack visualization layout */}
            <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-6 flex flex-col justify-center min-h-0 overflow-y-auto">
              <div className="bg-[#0b1020] border-4 border-slate-800 dark:border-slate-900 rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-2xl relative overflow-x-auto select-none min-w-full">
                
                {/* Levels rendering (highest row top, level 1 bottom) */}
                {Array.from({ length: viewingRackElement.levels || 3 }).map((_, rIdx) => {
                  const currentLvl = (viewingRackElement.levels || 3) - rIdx;
                  
                  return (
                    <div key={`lvl-row-${currentLvl}`} className="flex items-center gap-5 min-w-max pb-3 border-b border-slate-900 last:border-b-0">
                      
                      {/* Level Tag Label on the left - styled like "Nivel 3" */}
                      <div className="w-20 shrink-0 flex flex-col justify-center select-none text-left">
                        <span className="text-[9px] font-mono tracking-widest text-slate-550 uppercase font-black">ESTANTE</span>
                        <span className="text-xs font-black italic tracking-wide text-slate-300">Nivel {currentLvl}</span>
                      </div>
                      
                      {/* Grid storage slots */}
                      <div 
                        className="flex-1 grid gap-4 shrink-0"
                        style={{ 
                          gridTemplateColumns: `repeat(${viewingRackElement.positions || 12}, minmax(130px, 1fr))` 
                        }}
                      >
                        {Array.from({ length: viewingRackElement.positions || 12 }).map((_, cIdx) => {
                          const currentBay = cIdx + 1;
                          const slotKey = `${currentLvl}-${currentBay}`;
                          const isEditing = editingSlotKey === slotKey;
                          const slot = (viewingRackElement.slotData || {})[slotKey];
                          
                          if (isEditing) {
                            {/* Inline slot editing overlay card */}
                            return (
                              <div key={slotKey} className="bg-slate-900 border-2 border-indigo-500 rounded-2xl p-2.5 flex flex-col justify-between gap-2 min-h-[145px] shadow-lg animate-scale-in text-slate-100">
                                <div className="text-left">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-[9.5px] font-mono p-0.5 px-1.5 bg-indigo-950 text-indigo-400 rounded-md font-bold uppercase">Ubicac. P-{currentBay}</span>
                                    <button 
                                      type="button" 
                                      onClick={() => setEditingSlotKey(null)}
                                      className="text-slate-400 hover:text-slate-250 font-extrabold cursor-pointer"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                  
                                  <input
                                    type="text"
                                    placeholder="Nombre Carga/Palet"
                                    value={slotInputLabel}
                                    onChange={(e) => setSlotInputLabel(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[11px] font-bold outline-none focus:border-indigo-500 text-slate-100 mb-1"
                                    autoFocus
                                  />
                                  <input
                                    type="text"
                                    placeholder="Cod. SKU"
                                    value={slotInputCode}
                                    onChange={(e) => setSlotInputCode(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] font-mono outline-none focus:border-indigo-500 text-slate-400"
                                  />
                                </div>
                                
                                <div className="space-y-1.5">
                                  <div className="flex gap-1 items-center justify-center">
                                    {['#ea580c', '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#6366f1'].map(colorHex => (
                                      <button
                                        key={colorHex}
                                        type="button"
                                        onClick={() => setSlotInputColor(colorHex)}
                                        className={`w-4.5 h-4.5 rounded-full cursor-pointer border ${slotInputColor === colorHex ? 'scale-115 border-white' : 'border-transparent'}`}
                                        style={{ backgroundColor: colorHex }}
                                      />
                                    ))}
                                  </div>
                                  
                                  <button
                                    type="button"
                                    onClick={() => handleSaveSlotData(currentLvl, currentBay, true, slotInputLabel, slotInputCode, slotInputColor)}
                                    className="w-full text-center py-1 bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98] text-white text-[9px] font-black uppercase tracking-wider rounded-lg transition-all shadow-md mt-1 cursor-pointer"
                                  >
                                    Ubicar Palet
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          
                          if (slot && slot.occupied) {
                            {/* Occupied Pallet Card Design */}
                            return (
                              <div 
                                key={slotKey} 
                                className="border rounded-2xl p-3 flex flex-col justify-between min-h-[145px] shadow relative animate-fade-in-fast"
                                style={{ 
                                  backgroundColor: `${slot.color || '#f59e0b'}15`,
                                  borderColor: `${slot.color || '#f59e0b'}40` 
                                }}
                              >
                                <div className="flex justify-between items-start">
                                  <span className="text-[9.5px] font-black text-rose-300 bg-rose-950/40 border border-rose-500/10 px-1.5 py-0.5 rounded-lg leading-none">
                                    P-{currentBay}
                                  </span>
                                  <span className="text-[8px] font-mono font-black text-slate-400 select-none px-1.5 py-0.5 rounded uppercase tracking-widest bg-slate-900/60 leading-none">OCUPADO</span>
                                </div>
                                
                                <div className="my-1.5 text-left">
                                  <p 
                                    className="text-xs font-black truncate leading-tight"
                                    style={{ color: slot.color || '#f59e0b' }}
                                  >
                                    {slot.label || `Palet ${currentLvl}-${currentBay}`}
                                  </p>
                                  <p className="text-[10px] font-mono text-slate-400 font-extrabold mt-0.5 truncate uppercase">
                                    {slot.code || `SKU-POS-${currentBay}`}
                                  </p>
                                </div>
                                
                                <div className="flex gap-1 border-t border-slate-900/40 pt-2 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingSlotKey(slotKey);
                                      setSlotInputLabel(slot.label || '');
                                      setSlotInputCode(slot.code || '');
                                      setSlotInputColor(slot.color || '#f59e0b');
                                    }}
                                    className="flex-1 text-[8px] font-black uppercase tracking-widest text-slate-300 hover:text-white bg-slate-900/85 hover:bg-slate-800 border border-slate-800 rounded-lg py-1.5 text-center cursor-pointer transition-colors"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (confirm(`¿Vaciar de carga la posición P-${currentBay}?`)) {
                                        handleSaveSlotData(currentLvl, currentBay, false);
                                      }
                                    }}
                                    className="flex-1 text-[8px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 border border-rose-500/10 hover:border-rose-500/20 rounded-lg py-1.5 text-center cursor-pointer transition-all"
                                  >
                                    Liberar
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          
                          {/* Ideal custom illustration layout with white cards & centered locator plus triggers */}
                          return (
                            <div 
                              key={slotKey} 
                              onClick={() => {
                                setEditingSlotKey(slotKey);
                                setSlotInputLabel(`Palet ${currentLvl}-${currentBay}`);
                                setSlotInputCode(`SKU-POS-${currentBay}`);
                                setSlotInputColor('#f59e0b');
                              }}
                              className="bg-white hover:bg-slate-100 transition-all rounded-2xl p-3 flex flex-col justify-between items-center min-h-[145px] shadow relative cursor-pointer border border-slate-200 group active:scale-[0.98]"
                            >
                              <div className="absolute top-2 left-2">
                                <span className="text-[9.5px] font-mono font-black text-slate-550 text-slate-500 bg-slate-100/90 px-1.5 py-0.5 rounded-lg leading-none border border-slate-200">
                                  P-{currentBay}
                                </span>
                              </div>
                              
                              <div className="flex-1 flex flex-col items-center justify-center pt-3 gap-2 text-center">
                                <div className="w-8 h-8 rounded-full bg-sky-50 border border-sky-150 flex items-center justify-center text-sky-600 transition-all group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 shadow-sm shrink-0">
                                  <Plus className="w-4.5 h-4.5 text-inherit stroke-[3px]" />
                                </div>
                                <span className="text-[10px] font-black uppercase text-sky-600 tracking-wider">UBICAR</span>
                              </div>
                              
                              <div className="text-center w-full select-none select-none">
                                <span className="text-[8px] font-mono tracking-widest text-rose-550 text-rose-600 bg-rose-50 border border-rose-100 p-0.5 px-2 rounded-lg font-black">DISPONIBLE</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                    </div>
                  );
                })}

                {/* Bottom bay marking designations */}
                <div className="flex items-center gap-5 min-w-max pt-6">
                  <div className="w-20 shrink-0"></div>
                  <div 
                    className="flex-1 grid gap-4 shrink-0"
                    style={{ 
                      gridTemplateColumns: `repeat(${viewingRackElement.positions || 12}, minmax(130px, 1fr))` 
                    }}
                  >
                    {Array.from({ length: viewingRackElement.positions || 12 }).map((_, cIdx) => (
                      <div key={`bay-lbl-${cIdx}`} className="text-center">
                        <span className="text-[9px] font-mono font-black tracking-widest text-slate-400 dark:text-slate-500 uppercase block select-none">BAYA {cIdx + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
