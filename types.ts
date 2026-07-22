
// @google/genai coding standards compliant type definitions

export type ZoneType = 'SECO' | 'REFRIGERADO' | 'CONGELADO';

export interface Product {
  id: string; 
  codigo: string; 
  sku: string | null; 
  nombre: string; 
  categoria: string | null; 
  marca: string | null; 
  unidad_venta: string | null; 
  unidades_por_caja: number; 
  vida_util_dias: number; 
  requiere_pesaje: boolean; 
  zona_predeterminada: ZoneType;
  fecha_creacion?: string;
  extranjero?: string | null;
  nombre_sn?: string | null;
  unidad_medida_sap?: string | null;
  es_seco: boolean;
  es_refrigerado: boolean;
  es_congelado: boolean;
  es_peso: boolean;
  unidad_compra: string | null;
  factor_unidad: number;
  factor_inventario: number;
  nivel_0?: string | null;
  nivel_1?: string | null;
  nivel_2?: string | null;
  nivel_3?: string | null;
  nivel_4?: string | null;
  tiene_detraccion: boolean;
  tvm_dias: number;
  ean_bulto?: string;
  camara_texto?: string | null;
  foto_uno?: string | null;
  foto_dos?: string | null;
  peso_unitario: number; 
  cajas_por_palet: number; 
  usa_control_tara: boolean;
  peso_tara_caja_std: number;
  peso_tara_pallet_std: number;
  venta_media?: number | null;
  tvu_promesa?: number | null;
  ventas_semanal?: number | null;
  multiplo?: number | null;
  costo?: number | null;
}

export interface DespachoEncabezado {
  id: string;
  provincia: string;
  documento?: string;
  cliente?: string;
  fecha_creacion: string;
  fecha_despacho?: string;
  estado: 'PENDIENTE' | 'EN PROCESO' | 'COMPLETADO' | 'CANCELADO';
  total_items: number;
  items_completados?: number;
  tipo_despacho?: 'PROVINCIA' | 'CARRO_TARDE';
  placa_vehiculo?: string;
  rampa_asignada?: number;
  comentario?: string;
  // Métricas avanzadas
  total_qty_pedida?: number;
  total_qty_despachada?: number;
  total_peso_pedido?: number;
  total_peso_cargado?: number;
  secos_pct?: number;
  refrigerados_pct?: number;
  congelados_pct?: number;
  peso_seco?: number;
  peso_refrigerado?: number;
  peso_congelado?: number;
  total_pallets_estimados?: number;
  usuario_registro?: string;
  has_tvu_warning?: boolean;
  motivo_cancelacion?: string;
  usuario_cancelacion?: string;
  fecha_cancelacion?: string;
  sede_id?: string;
}

export interface DespachoItem {
  id: string;
  encabezado_id: string;
  producto_id?: string;
  codigo: string;
  descripcion: string;
  cantidad_pedida: number;
  cantidad_despachada: number;
  peso_total?: number; // Nuevo: Cantidad * Peso unitario
  numero_paleta?: number;
  estado: 'PENDIENTE' | 'COMPLETADO' | 'CANCELADO';
  unidad_medida: string;
  cajas_estimadas: number;
  tipo_camara: string;
  fotos?: string[];
  fecha_vencimiento?: string;
  usuario_preparacion?: string;
  fecha_preparacion?: string;
  peso_bruto?: number;
  nro_cajas_tinas?: number;
  tara_caja_unid?: number;
  tara_pallet?: number;
  peso_neto?: number;
  inspeccion_calidad?: boolean;
  motivo_cancelacion?: string;
  usuario_cancelacion?: string;
  fecha_cancelacion?: string;
  sede_id?: string;
}

export interface StocktakeRecord {
  id: string;
  sede_id?: string;
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  pallets?: number;
  cajas?: number;
  unidades?: number;
  fecha_vencimiento: string;
  usuario_registro: string;
  fecha_registro: string;
  fotos?: string[];
  zona?: string;
  accion?: string;
  cantidad_accion?: number;
  fecha_accion?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'BAJA' | 'MEDIA' | 'ALTA';
  status: 'PENDIENTE' | 'REALIZADO' | 'CANCELADO';
  createdAt: string;
  completedAt?: string;
  photos: string[];
  createdBy: string;
  completedBy?: string;
  scheduledDate?: string;
  alertTime?: string;
  canceledAt?: string;
  canceledBy?: string;
  canceledComment?: string;
  triggeredAlert?: boolean;
  history?: Array<{ action: string; timestamp: string; user: string; comment?: string }>;
}

export interface ReverseLogisticsItem {
  id: string;
  plate?: string;
  invoice?: string;
  returnType?: string;
  defect?: string;
  quantity?: number;
  expirationDate?: string;
  photos: string[];
  registeredAt: string;
  productCode?: string;
  productName?: string;
  registeredBy?: string;
}

export interface MixedItem {
    productId?: string;
    productCode: string;
    productName: string;
    quantity: number;
    pallets?: number;
    cajas?: number;
    unidades?: number;
    expirationDate?: string;
    unitType?: 'UN' | 'CJ';
    inputQuantity?: number;
    unitOfMeasure?: string;
}

export type EstadoLPN = 'PENDIENTE' | 'GENERADO' | 'CROSS' | 'ELIMINADO' | 'UBICADO';

export interface Pallet {
  lpn: string; 
  productId?: string;
  productCode: string;
  productName: string;
  quantity: number; 
  pallets?: number;
  cajas?: number;
  unidades?: number;
  unitOfMeasure?: string;
  expirationDate?: string;
  receptionDate: string; 
  receivedBy: string; 
  qrCodeUrl: string;
  photos?: string[]; 
  photoUrl?: string; 
  isMixed?: boolean; 
  mixedItems?: MixedItem[]; 
  generado?: boolean;
  fecha_generado?: string;
  usuario_generado?: string;
  estado_lpn?: EstadoLPN;
  usuario_ultima_ubicacion?: string;
  fecha_ultima_ubicacion?: string;
  motivo_ultima_ubicacion?: string;
  tipo?: 'RECEPCION' | 'GENERADO';
  comentario?: string;
}

export interface Sample {
  id: string;
  correlativo: number;
  internalCode: string;
  ean: string;
  name: string;
  provider: string;
  unitOfMeasure: string;
  quantity: number;
  documentType: 'GUIA' | 'FACTURA';
  documentNumber: string;
  expirationDate: string;
  receptionDate: string;
  receivedBy: string;
  requestedArea: string;
  photos: string[];
  deliveredTo?: string;
  deliveryDate?: string;
  status: 'Recibido' | 'Entregado' | 'Enviado a merma';
}

export interface RackLocation {
  id?: string;
  aisle: string;
  rackId: number;
  level: number;
  position: number;
}

export interface InventoryItem extends Pallet {
  location: RackLocation | null;
  locationId?: string;
}

export interface Slot {
  id: string; 
  dbId?: string; // UUID from ubicaciones table
  location: RackLocation;
  status: 'empty' | 'occupied' | 'blocked';
  isBlocked: boolean; 
  item?: InventoryItem | null;
}

export interface Zone {
  id: string;
  name: string;
  type: ZoneType;
  temperature?: string;
}

export interface Rack {
  id: number;
  dbId?: string;
  zoneId: string; 
  aisle: string;
  levels: number;
  positionsPerLevel: number;
  slots: Slot[]; 
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  RECEPTION = 'RECEPTION',
  RECEPTION_XML = 'RECEPTION_XML',
  RECEPTION_LAIVE = 'RECEPTION_LAIVE',
  RECEPTION_VALIDATE = 'RECEPTION_VALIDATE',
  CORTES = 'CORTES',
  LAYOUT = 'LAYOUT',
  INVENTORY = 'INVENTORY',
  COUNT_HISTORY = 'COUNT_HISTORY',
  DISPATCH = 'DISPATCH',
  CONFIGURATION = 'CONFIGURATION',
  ARTICLE_MASTER = 'ARTICLE_MASTER',
  SAMPLES = 'SAMPLES',
  DISPATCH_PROVINCE = 'DISPATCH_PROVINCE',
  ORCHESTRATOR = 'ORCHESTRATOR',
  REVERSE_LOGISTICS = 'REVERSE_LOGISTICS',
  USER_MANAGEMENT = 'USER_MANAGEMENT',
  BULK_IMPORT = 'BULK_IMPORT',
  MONITOR = 'MONITOR',
  CONCILIATION = 'CONCILIATION',
  DIFFERENCE_HISTORY = 'DIFFERENCE_HISTORY',
  MAINTENANCE = 'MAINTENANCE',
  MERMAS = 'MERMAS',
  METRICS = 'METRICS',
  SELECT_BRANCH = 'SELECT_BRANCH',
  BRANCH_MANAGEMENT = 'BRANCH_MANAGEMENT',
  ROTULADO = 'ROTULADO',
  REPORTE_TVU = 'REPORTE_TVU',
  IMP_UBICACIONES = 'IMP_UBICACIONES',
  CLIENTES = 'CLIENTES',
  PICKING = 'PICKING',
  PICKING_CONTROL = 'PICKING_CONTROL',
  VALIDADOR = 'VALIDADOR',
  CAPTURA_EAN = 'CAPTURA_EAN',
  ALERT_MONITOR = 'ALERT_MONITOR',
  PENDIENTES = 'PENDIENTES',
  EXPIRATIONS = 'EXPIRATIONS'
}

export interface Cliente {
  id: string;
  nombre: string;
  documento?: string;
  telefono?: string;
  direccion?: string;
  fecha_creacion?: string;
  sede_id?: string;
}

export interface SystemStock {
  codigo: string;
  cantidad: number;
  costo: number;
  sede_id?: string;
  movimiento?: number;
}

export interface DifferenceHistory {
  id: string;
  fecha: string;
  codigo: string;
  nombre: string;
  stock_sistema: number;
  conteo_fisico: number;
  diferencia: number;
  procesado_por: string;
  fecha_procesado?: string;
}

export interface Usuario {
  id: string;
  username: string;
  nombre: string;
  password?: string;
  permisos: Record<string, boolean>;
  rol: 'ADMIN' | 'ASISTENTE' | 'OPERADOR' | 'ALERTAS';
  sede_id?: string;
  sede_nombre?: string;
  sede_color?: string;
  alerta_sonora?: boolean;
}

export interface Sede {
  id: string;
  nombre: string;
  direccion?: string;
  codigo?: string;
  color_primario?: string;
  sonido_alerta?: string;
}

export interface MermaRecord {
  id: string;
  sede_id?: string;
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  fecha_vencimiento: string;
  procedencia: string;
  defecto: string;
  destino: string;
  fotos: string[];
  fecha_registro: string;
  usuario_registro: string;
  revisado_calidad: boolean;
  unidad_medida?: string;
  reporte_id?: string | null;
}

export interface MermaReport {
  id: string;
  sede_id?: string;
  numero_reporte?: string;
  fecha_creacion: string;
  usuario_creacion: string;
  foto_firmada?: string | null;
  firma_digital?: string | null;
  responsable_firma?: string | null;
  items_count: number;
  filtros_aplicados?: any;
}
