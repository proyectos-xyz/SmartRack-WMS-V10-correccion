
import React, { useState, useMemo } from 'react';
import { Product, ZoneType } from '../types';
import { Upload, Database, Search, FileSpreadsheet, CheckCircle, XCircle, AlertTriangle, Clock, Camera, Download, ChevronLeft, ChevronRight, Plus, Trash, Scale } from './Icons';
import { supabase } from '../supabaseClient';
import { compressImage, generateStorageFileName } from '../utils';

declare var XLSX: any;

interface ArticleMasterProps {
  catalog: Product[];
  onUpdateCatalog: (newProducts: Product[]) => void;
  userRole?: string;
  maintenanceMode?: boolean;
}

const ArticleMaster: React.FC<ArticleMasterProps> = ({ catalog, onUpdateCatalog, userRole, maintenanceMode = false }) => {
  const [activeTab, setActiveTab] = useState<'LIST' | 'IMPORT'>('LIST');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [importStatus, setImportStatus] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSingleDeleteConfirm, setShowSingleDeleteConfirm] = useState(false);
  const [productToDelete, setProductToDelete] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importMode, setImportMode] = useState<'REPLACE' | 'APPEND'>('APPEND');
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  
  // Modal de edición
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    codigo: '',
    nombre: '',
    sku: '',
    categoria: 'GENERAL',
    marca: 'S/M',
    unidad_venta: 'UND',
    unidades_por_caja: 1,
    cajas_por_palet: 0,
    vida_util_dias: 0,
    tvm_dias: 0,
    venta_media: 0,
    zona_predeterminada: 'SECO',
    requiere_pesaje: false,
    es_seco: true,
    es_refrigerado: false,
    es_congelado: false,
    es_peso: false,
    peso_unitario: 0,
    unidad_compra: 'BX',
    factor_unidad: 1,
    factor_inventario: 1,
    usa_control_tara: false,
    peso_tara_caja_std: 0,
    peso_tara_pallet_std: 0,
    ean_bulto: '',
    camara_texto: 'SECO',
    nivel_0: '',
    nivel_1: '',
    nivel_2: '',
    nivel_3: '',
    nivel_4: '',
    tvu_promesa: null,
    ventas_semanal: null,
    multiplo: null
  });

  const [eanFilter, setEanFilter] = useState<'ALL' | 'WITHOUT_EAN_PROD' | 'WITHOUT_EAN_BULTO'>('ALL');

  const sinEanProductoCount = useMemo(() => {
    return catalog.filter(p => !p.sku || p.sku.trim() === '').length;
  }, [catalog]);

  const sinEanBultoCount = useMemo(() => {
    return catalog.filter(p => !p.ean_bulto || p.ean_bulto.trim() === '').length;
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    let result = catalog;

    if (eanFilter === 'WITHOUT_EAN_PROD') {
        result = result.filter(p => !p.sku || p.sku.trim() === '');
    } else if (eanFilter === 'WITHOUT_EAN_BULTO') {
        result = result.filter(p => !p.ean_bulto || p.ean_bulto.trim() === '');
    }

    const term = debouncedSearchTerm.toLowerCase().trim();
    if (!term) return result;
    
    return result.filter(p => {
        const nombre = (p.nombre || '').toLowerCase();
        const codigo = (p.codigo || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const ean_bulto = (p.ean_bulto || '').toLowerCase();
        
        return nombre.includes(term) || codigo.includes(term) || sku.includes(term) || ean_bulto.includes(term);
    });
  }, [catalog, debouncedSearchTerm, eanFilter]);

  const totalPages = Math.ceil(filteredCatalog.length / itemsPerPage);
  const paginatedCatalog = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredCatalog.slice(start, start + itemsPerPage);
  }, [filteredCatalog, currentPage]);

  // Debounce search term
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Reset page when search or filter changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm, eanFilter]);

  const guardarCambiosEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    
    setIsProcessing(true);
    const productToSave = { 
      ...editingProduct,
      es_seco: editingProduct.zona_predeterminada === 'SECO',
      es_refrigerado: editingProduct.zona_predeterminada === 'REFRIGERADO',
      es_congelado: editingProduct.zona_predeterminada === 'CONGELADO',
      es_peso: editingProduct.requiere_pesaje,
    } as Product;

    try {
        let { error } = await supabase
            .from('productos')
            .update(productToSave)
            .eq('id', productToSave.id);

        if (error) {
            // Si la columna 'multiplo' o cualquier otra no existe en la BD o cache de Supabase, intentamos omitirla
            if (error.code === 'PGRST204') {
                console.warn("Columna no encontrada en cache de Supabase (PGRST204). Reintentando sin la columna conflictiva...");
                const match = error.message.match(/column '([^']+)' of/i) || error.message.match(/column "([^"]+)" of/i);
                const missingColumn = match ? match[1] : 'multiplo'; // Fallback a multiplo si no se parsea
                
                if (missingColumn && missingColumn in productToSave) {
                    const cleanedProduct = { ...productToSave };
                    delete (cleanedProduct as any)[missingColumn];
                    
                    const retryResult = await supabase
                        .from('productos')
                        .update(cleanedProduct)
                        .eq('id', cleanedProduct.id);
                        
                    if (!retryResult.error) {
                        onUpdateCatalog(catalog.map(p => p.id === productToSave.id ? productToSave : p));
                        setEditingProduct(null);
                        setImportStatus({ 
                            msg: `Producto actualizado (Se omitió temporalmente '${missingColumn}' en BD por falta de columna o cache).`, 
                            type: 'success' 
                        });
                        setTimeout(() => setImportStatus(null), 5000);
                        return;
                    } else {
                        throw retryResult.error;
                    }
                }
            }
            throw error;
        }

        // Actualizar catálogo local inmediatamente
        onUpdateCatalog(catalog.map(p => p.id === productToSave.id ? productToSave : p));
        setEditingProduct(null);
        setImportStatus({ msg: 'Producto actualizado correctamente.', type: 'success' });
        setTimeout(() => setImportStatus(null), 3000);
    } catch (err: any) {
        console.error("Error updating product:", err);
        setImportStatus({ msg: `Error al actualizar producto: ${err.message}`, type: 'error' });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleSaveNewProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.codigo || !newProduct.nombre) {
        alert("Código y Nombre son obligatorios.");
        return;
    }

    setIsProcessing(true);
    try {
        const productToSave = {
            ...newProduct,
            id: crypto.randomUUID(),
            es_seco: newProduct.zona_predeterminada === 'SECO',
            es_refrigerado: newProduct.zona_predeterminada === 'REFRIGERADO',
            es_congelado: newProduct.zona_predeterminada === 'CONGELADO',
        } as Product;

        let insertResult = await supabase
            .from('productos')
            .insert([productToSave])
            .select();

        if (insertResult.error && insertResult.error.code === 'PGRST204') {
            console.warn("Columna no encontrada al insertar (PGRST204). Reintentando sin la columna conflictiva...");
            const match = insertResult.error.message.match(/column '([^']+)' of/i) || insertResult.error.message.match(/column "([^"]+)" of/i);
            const missingColumn = match ? match[1] : 'multiplo';
            
            if (missingColumn && missingColumn in productToSave) {
                const cleanedProduct = { ...productToSave };
                delete (cleanedProduct as any)[missingColumn];
                
                insertResult = await supabase
                    .from('productos')
                    .insert([cleanedProduct])
                    .select();
            }
        }

        if (insertResult.error) throw insertResult.error;

        const data = insertResult.data;
        if (data) {
            onUpdateCatalog([data[0], ...catalog]);
            setShowAddModal(false);
            setNewProduct({
                codigo: '',
                nombre: '',
                sku: '',
                categoria: 'GENERAL',
                marca: 'S/M',
                unidad_venta: 'UND',
                unidades_por_caja: 1,
                cajas_por_palet: 0,
                vida_util_dias: 0,
                tvm_dias: 0,
                venta_media: 0,
                zona_predeterminada: 'SECO',
                requiere_pesaje: false,
                es_seco: true,
                es_refrigerado: false,
                es_congelado: false,
                es_peso: false,
                unidad_compra: 'BX',
                factor_unidad: 1,
                factor_inventario: 1,
                ean_bulto: '',
                camara_texto: 'SECO',
                nivel_0: '',
                nivel_1: '',
                nivel_2: '',
                nivel_3: '',
                nivel_4: '',
                tvu_promesa: null,
                ventas_semanal: null,
                multiplo: null
            });
            setImportStatus({ msg: 'Producto agregado correctamente.', type: 'success' });
            setTimeout(() => setImportStatus(null), 3000);
        }
    } catch (err: any) {
        console.error("Error adding product:", err);
        alert("Error al agregar producto: " + err.message);
    } finally {
        setIsProcessing(false);
    }
  };

    const handleDeleteProduct = async () => {
        if (!productToDelete) return;
        
        try {
            setIsProcessing(true);
            const { error } = await supabase
                .from('productos')
                .delete()
                .eq('id', productToDelete);

            if (error) throw error;
            
            onUpdateCatalog(catalog.filter(p => p.id !== productToDelete));
            setImportStatus({ msg: 'Producto eliminado correctamente.', type: 'success' });
            setTimeout(() => setImportStatus(null), 3000);
            setShowSingleDeleteConfirm(false);
            setProductToDelete(null);
        } catch (err: any) {
            setImportStatus({ msg: `Error al eliminar: ${err.message}`, type: 'error' });
        } finally {
            setIsProcessing(false);
        }
    };

  const manejarFotoEdicion = async (e: React.ChangeEvent<HTMLInputElement>, campo: 'foto_uno' | 'foto_dos') => {
      const file = e.target.files?.[0];
      if (file && editingProduct) {
          setIsProcessing(true);
          try {
              const fileName = generateStorageFileName();
              const filePath = `productos/${fileName}`;

              // Compresión de imagen
              const compressedBlob = await compressImage(file, 800, 0.6);

              const { error: uploadError } = await supabase.storage
                  .from('evidencias')
                  .upload(filePath, compressedBlob, { contentType: 'image/jpeg', upsert: true });

              if (uploadError) {
                  if (uploadError.message.includes('Bucket not found')) {
                      throw new Error('El bucket "evidencias" no existe en Supabase Storage. Por favor, créalo.');
                  }
                  throw uploadError;
              }

              const { data: { publicUrl } } = supabase.storage
                  .from('evidencias')
                  .getPublicUrl(filePath);

              setEditingProduct({ ...editingProduct, [campo]: publicUrl });
          } catch (err: any) {
              console.error("Error compressing/uploading image:", err);
              // Fallback
              try {
                  const fileName = generateStorageFileName();
                  const filePath = `productos/${fileName}`;
                  const { error: uploadError } = await supabase.storage
                      .from('evidencias')
                      .upload(filePath, file!, { contentType: 'image/jpeg', upsert: true });
                  if (uploadError) throw uploadError;
                  const { data: { publicUrl } } = supabase.storage.from('evidencias').getPublicUrl(filePath);
                  setEditingProduct({ ...editingProduct, [campo]: publicUrl });
              } catch (fallbackErr: any) {
                  alert("Error al subir imagen: " + fallbackErr.message);
              }
          } finally {
              setIsProcessing(false);
          }
      }
  };

  const manejarExportarSQL = () => {
    if (catalog.length === 0) return alert("No hay artículos para exportar");

    let sql = `-- SCRIPT COMPLETO DE CARGA (TABLA productos)\n`;
    sql += `-- Generado: ${new Date().toLocaleString()}\n\n`;

    catalog.forEach(p => {
        const id = p.id || crypto.randomUUID();
        const escp = (val: any) => val ? `'${String(val).replace(/'/g, "''")}'` : 'NULL';
        
        sql += `INSERT INTO public.productos (
            id, codigo, sku, nombre, categoria, marca, unidad_venta, 
            unidades_por_caja, vida_util_dias, requiere_pesaje, zona_predeterminada,
            extranjero, nombre_sn, unidad_medida_sap, es_seco, es_refrigerado, 
            es_congelado, es_peso, unidad_compra, factor_unidad, factor_inventario,
            nivel_0, nivel_1, nivel_2, nivel_3, nivel_4, tiene_detraccion, tvm_dias, camara_texto,
            foto_uno, foto_dos, usa_control_tara, peso_tara_caja_std, peso_tara_pallet_std, ean_bulto, venta_media
        ) VALUES (
            '${id}', '${p.codigo}', ${escp(p.sku)}, ${escp(p.nombre)}, ${escp(p.categoria)}, ${escp(p.marca)}, ${escp(p.unidad_venta)},
            ${p.unidades_por_caja}, ${p.vida_util_dias}, ${p.requiere_pesaje}, '${p.zona_predeterminada}',
            ${escp(p.extranjero)}, ${escp(p.nombre_sn)}, ${escp(p.unidad_medida_sap)}, ${p.es_seco}, ${p.es_refrigerado},
            ${p.es_congelado}, ${p.es_peso}, ${escp(p.unidad_compra)}, ${p.factor_unidad}, ${p.factor_inventario},
            ${escp(p.nivel_0)}, ${escp(p.nivel_1)}, ${escp(p.nivel_2)}, ${escp(p.nivel_3)}, ${escp(p.nivel_4)}, 
            ${p.tiene_detraccion}, ${p.tvm_dias}, ${escp(p.camara_texto)}, ${escp(p.foto_uno)}, ${escp(p.foto_dos)},
            ${p.usa_control_tara || false}, ${p.peso_tara_caja_std || 0}, ${p.peso_tara_pallet_std || 0}, ${escp(p.ean_bulto)}, ${p.venta_media || 0}
        );\n\n`;
    });

    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `script_completo_productos_${new Date().getTime()}.sql`;
    link.click();
  };

  const confirmarVaciarTabla = async () => {
      try {
          setIsProcessing(true);
          // Orden de borrado para respetar FKs
          await supabase.from('despachos_item').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('despacho_encabezado').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('ordenes_despacho').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('logistica_inversa').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('muestras').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await supabase.from('paletas_lpn').delete().neq('lpn', 'EMPTY');
          
          const { error } = await supabase.from('productos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) throw error;
          
          onUpdateCatalog([]);
          setShowDeleteConfirm(false);
          alert("Sistema reiniciado correctamente.");
          window.location.reload(); 
      } catch (err: any) {
          setImportStatus({ msg: `Error al vaciar: ${err.message}`, type: 'error' });
      } finally {
          setIsProcessing(false);
      }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'codigo_ico', 'Descripción del artículo', 'Unidad de medida de ventas', 
      'Código de barras', 'Nombre extranjero', 'Nombre SN', 'Secos', 
      'Refrigerados', 'Congelados', 'Peso', 'Unidad Compra', 
      'Articulo por Unidad Compra', 'Peso Inventario', 'Marca', 
      'Nivel 0', 'Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4', 
      'Nivel WEB', 'TVM', 'CAMARA', 'pesaje', 'cajas_por_palet', 'control_tara', 'tara_caja_std', 'tara_pallet_std',
      'ean_bulto', 'unidades_por_caja', 'vida_util_dias', 'unidad_medida_sap', 'tiene_detraccion', 'camara_texto', 
      'peso_unitario', 'foto_uno', 'foto_dos', 'factor_unidad', 'tvu_promesa', 'ventas_semanal', 'venta_media', 'multiplo'
    ];

    const sampleData = [
      ['PRF002', 'AGUA MIN CON GAS EVIAN SPARKLING BT VIDRIO X 330ML CJ X 20 UND', 'BX', '1238560', '', 'PERUFARMA S.A', 'Y', 'N', 'N', 'N', 'BX', '1', '11.6', 'EVIAN', 'ALIADAS', 'BEBIDAS', 'EVIAN', 'BEBIDAS', 'BEBIDAS NO ALCOHOLICAS', 'BEBIDAS', '720', 'SECOS', 'Y', '0', 'N', '0', '0', '20', '20', '720', 'UND', 'N', 'SECOS', '0.33', '', '', '1', '360', '50', '2.5', '6'],
      ['AJB004', 'SOPA INSTANTANEA AJI-NO-MEN SABOR POLLO VASO 50GR', 'NIU', 'AJ0114', '', '(AJI)AJINOMOTO', 'Y', 'N', 'N', 'N', 'BX', '12', '0.05', 'AJINOMOTO', 'ALIADAS', 'ABARROTES', 'AJINOMOTO', 'SOPAS', 'SOPAS SUSTANCIAS', 'ABARROTES', '360', 'SECOS', 'Y', '0', 'N', '0', '0', '12', '12', '360', 'UND', 'N', 'SECOS', '0.05', '', '', '12', '180', '100', '1.2', ''],
      ['LAH013', 'FRANKFURTER XL SUIZA PAQUETE 1KG', 'NIU', '50000401', '', '(LAI)LAIVE S.A.', 'N', 'Y', 'N', 'N', 'BX', '8', '1', 'LAIVE', 'LAIVE S.A.', 'LAIVE', 'SALCHICHERIA', 'CARNICOS', 'HOT DOG', 'EMBUTIDOS', '45', 'REFRIGERADOS', 'N', '78', 'Y', '0.05', '1.2', '8', '8', '45', 'UND', 'N', 'REFRIGERADO', '1.0', '', '', '8', '30', '120', '4.0', '8']
    ];
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla");
    
    XLSX.writeFile(wb, "Plantilla_Maestro_Articulos.xlsx");
  };

  const handleDownloadDatabase = async () => {
    setIsProcessing(true);
    try {
        const { data: dbProducts, error } = await supabase
            .from('productos')
            .select('*');

        if (error) throw error;
        if (!dbProducts || dbProducts.length === 0) {
            alert("No hay artículos en la base de datos para descargar");
            return;
        }

        // Collect all distinct keys (columns) dynamically from the database objects to ensure any newly added column is exported
        const allKeys = new Set<string>();
        
        // Define a base list of preferred column orders to keep it user-friendly, although all exist in the Excel sheet
        const preferredOrder = [
          'id', 'codigo', 'nombre', 'sku', 'extranjero', 'nombre_sn', 
          'es_seco', 'es_refrigerado', 'es_congelado', 'es_peso', 'unidad_compra', 
          'factor_unidad', 'factor_inventario', 'marca', 'nivel_0', 'nivel_1', 'nivel_2', 
          'nivel_3', 'nivel_4', 'categoria', 'tvm_dias', 'zona_predeterminada', 'requiere_pesaje', 
          'cajas_por_palet', 'usa_control_tara', 'peso_tara_caja_std', 'peso_tara_pallet_std', 
          'ean_bulto', 'unidades_por_caja', 'vida_util_dias', 'unidad_medida_sap', 'tiene_detraccion', 
          'camara_texto', 'peso_unitario', 'foto_uno', 'foto_dos', 'multiplo'
        ];

        // Gather all existing columns from the data rows
        dbProducts.forEach(row => {
            Object.keys(row).forEach(key => {
                allKeys.add(key);
            });
        });

        // Sort headers: Put preferred order first, then any other dynamically found column
        const headers = preferredOrder.filter(k => allKeys.has(k));
        allKeys.forEach(k => {
            if (!headers.includes(k)) {
                headers.push(k);
            }
        });

        // Construct the row data dynamically from headers
        const data = dbProducts.map(row => {
            return headers.map(header => {
                const val = row[header];
                if (val === null || val === undefined) return '';
                if (typeof val === 'boolean') return val ? 'Y' : 'N';
                return val;
            });
        });

        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Maestro_Articulos");
        
        XLSX.writeFile(wb, `Maestro_Articulos_Full_${new Date().getTime()}.xlsx`);
    } catch (err: any) {
        alert("Error al descargar la base de datos completa: " + err.message);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      console.log("Archivo seleccionado:", e.target.files?.[0]);
      const file = e.target.files?.[0];
      if (!file) return;

      if (typeof XLSX === 'undefined') {
          alert("Error: La librería de Excel (SheetJS) no se ha cargado correctamente. Por favor, recargue la página.");
          return;
      }

      const reader = new FileReader();
      reader.onload = async (evt) => {
          try {
              console.log("FileReader: onload disparado");
              setIsProcessing(true);
              const data = evt.target?.result;
              if (!data) throw new Error("No se pudieron leer los datos del archivo.");

              const wb = XLSX.read(data, { type: 'array' });
              console.log("Libro de Excel leído:", wb.SheetNames);
              const ws = wb.Sheets[wb.SheetNames[0]];
              const jsonData: any[] = XLSX.utils.sheet_to_json(ws);
              console.log("Datos JSON extraídos:", jsonData.length, "filas");
              
              const findVal = (row: any, searchTerms: string[]) => {
                  const keys = Object.keys(row);
                  const normalizedSearchTerms = searchTerms.map(t => t.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""));
                  
                  // Priority 1: Exact matches
                  for (const k of keys) {
                      const normalizedK = k.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
                      if (normalizedSearchTerms.includes(normalizedK)) {
                          if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
                      }
                  }

                  // Priority 2: Fuzzy matches (only for terms longer than 3 chars to avoid false positives)
                  for (const k of keys) {
                      const normalizedK = k.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
                      for (const nt of normalizedSearchTerms) {
                          if (nt.length > 3) {
                              if (normalizedK.includes(nt) || nt.includes(normalizedK)) {
                                  if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
                              }
                          }
                      }
                  }
                  return undefined;
              };

              console.log("Columnas detectadas en el archivo:", Object.keys(jsonData[0]));

              if (jsonData.length === 0) {
                  setIsProcessing(false);
                  alert("El archivo Excel parece estar vacío o no tiene el formato correcto.");
                  return;
              }

              console.log("Iniciando mapeo de productos...");

              const newProducts: any[] = jsonData.map((row) => {
                  try {
                      const codigo = String(findVal(row, ['codigo_ico', 'codigo', 'cod', 'sku', 'ico']) || '').trim();
                      if (!codigo) return null;

                      const isNew = importMode === 'REPLACE' || !catalog.some(p => p.codigo === codigo);
                      const p: any = { codigo };

                      const yToBool = (val: any) => {
                          if (val === undefined || val === null || String(val).trim() === '') return undefined;
                          const s = String(val).toUpperCase().trim();
                          return s === 'Y' || s === 'SI' || s === 'TRUE' || s === 'S' || s === '1';
                      };

                      const parseNum = (val: any) => {
                          if (val === undefined || val === null || String(val).trim() === '') return undefined;
                          const n = parseFloat(String(val).replace(',', '.'));
                          return isNaN(n) ? undefined : n;
                      };

                      const setIf = (terms: string[], field: string, transform?: (v: any) => any) => {
                          const raw = findVal(row, terms);
                          if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
                              const transformed = transform ? transform(raw) : raw;
                              if (transformed !== undefined) {
                                  p[field] = transformed;
                              }
                          }
                      };

                      setIf(['barras', 'sku', 'ean', 'codigo de barras'], 'sku', v => String(v).trim());
                      setIf(['descripcion', 'nombre', 'articulo', 'descrip'], 'nombre', v => String(v).trim());
                      setIf(['nivel 1', 'categoria', 'nivel 0'], 'categoria', v => String(v).trim());
                      setIf(['marca'], 'marca', v => String(v).trim());
                      setIf(['unidad de medida de ventas', 'unidad venta', 'um venta', 'um'], 'unidad_venta', v => String(v).trim());
                      setIf(['articulo por unidad compra', 'unidades por caja', 'cajas'], 'unidades_por_caja', v => { const n = parseNum(v); return n !== undefined ? Math.round(n) : undefined; });
                      setIf(['cajas por palet', 'cajas palet', 'palet'], 'cajas_por_palet', v => { const n = parseNum(v); return n !== undefined ? Math.round(n) : undefined; });
                      setIf(['vida util', 'dias vida', 'vutil'], 'vida_util_dias', v => { const n = parseNum(v); return n !== undefined ? Math.round(n) : undefined; });
                      setIf(['pesaje', 'balanza', 'requiere pesaje'], 'requiere_pesaje', v => yToBool(v));
                      
                      const camVal = findVal(row, ['camara', 'zona', 'temp']);
                      if (camVal !== undefined && String(camVal).trim() !== '') {
                          const c = String(camVal).toUpperCase();
                          let zona: ZoneType = 'SECO';
                          if (c.includes('REFRIG')) zona = 'REFRIGERADO';
                          if (c.includes('CONGEL')) zona = 'CONGELADO';
                          p.zona_predeterminada = zona;
                          p.camara_texto = c;
                      }

                      setIf(['nombre extranjero', 'extranjero'], 'extranjero', v => String(v).trim());
                      setIf(['nombre sn'], 'nombre_sn', v => String(v).trim());
                      setIf(['unidad medida sap', 'um sap'], 'unidad_medida_sap', v => String(v).trim());
                      setIf(['secos', 'es seco'], 'es_seco', v => yToBool(v));
                      setIf(['refrigerados', 'es refrigerado'], 'es_refrigerado', v => yToBool(v));
                      setIf(['congelados', 'es congelado'], 'es_congelado', v => yToBool(v));
                      setIf(['peso', 'es peso'], 'es_peso', v => yToBool(v));
                      setIf(['unidad compra', 'um compra'], 'unidad_compra', v => String(v).trim());
                      setIf(['factor unidad', 'factor_unidad'], 'factor_unidad', v => parseNum(v));
                      setIf(['peso inventario', 'factor inventario'], 'factor_inventario', v => parseNum(v));
                      setIf(['nivel 0'], 'nivel_0', v => String(v).trim());
                      setIf(['nivel 1'], 'nivel_1', v => String(v).trim());
                      setIf(['nivel 2'], 'nivel_2', v => String(v).trim());
                      setIf(['nivel 3'], 'nivel_3', v => String(v).trim());
                      setIf(['nivel 4'], 'nivel_4', v => String(v).trim());
                      setIf(['detraccion', 'tiene detraccion'], 'tiene_detraccion', v => yToBool(v));
                      setIf(['tvm', 'tvu', 'vencimiento'], 'tvm_dias', v => { const n = parseNum(v); return n !== undefined ? Math.round(n) : undefined; });
                      setIf(['tvu_promesa', 'tvu promesa', 'promesa tvu', 'promesa_tvu', 'tvu contractual'], 'tvu_promesa', v => { const n = parseNum(v); return n !== undefined ? Math.round(n) : null; });
                      setIf(['ventas_semanal', 'ventas semanal', 'venta semanal', 'rotacion semanal', 'rotacion_semanal'], 'ventas_semanal', v => { const n = parseNum(v); return n !== undefined ? Math.round(n) : null; });
                      setIf(['venta media', 'venta_media', 'rotacion_media'], 'venta_media', v => parseNum(v));
                      setIf(['multiplo', 'multiplo_alerta', 'multiplo_sobrestock', 'multiplo sobrestock'], 'multiplo', v => parseNum(v));
                      setIf(['peso unitario', 'peso_unitario'], 'peso_unitario', v => parseNum(v));
                      setIf(['control_tara', 'control tara', 'usa control tara'], 'usa_control_tara', v => yToBool(v));
                      setIf(['tara_caja_std', 'tara caja std', 'peso tara caja'], 'peso_tara_caja_std', v => parseNum(v));
                      setIf(['tara_pallet_std', 'tara pallet std', 'peso tara pallet'], 'peso_tara_pallet_std', v => parseNum(v));
                      setIf(['ean_bulto', 'ean bulto', 'ean_caja'], 'ean_bulto', v => String(v).trim());
                      setIf(['foto_uno', 'foto 1'], 'foto_uno', v => String(v).trim());
                      setIf(['foto_dos', 'foto 2'], 'foto_dos', v => String(v).trim());

                      if (isNew) {
                          if (!p.sku) p.sku = p.codigo;
                          if (!p.nombre) p.nombre = 'NUEVO PRODUCTO';
                          if (!p.categoria) p.categoria = 'GENERAL';
                          if (!p.marca) p.marca = 'S/M';
                          if (!p.unidad_venta) p.unidad_venta = 'UND';
                          if (p.unidades_por_caja === undefined) p.unidades_por_caja = 1;
                          if (p.cajas_por_palet === undefined) p.cajas_por_palet = 0;
                          if (p.zona_predeterminada === undefined) p.zona_predeterminada = 'SECO';
                      }

                      return p;
                  } catch (e) {
                      return null;
                  }
              }).filter(p => p !== null);

              // Deduplicar por código
              const uniqueCodes = new Set();
              const validProducts = [];
              for (const p of newProducts) {
                  if (!uniqueCodes.has(p.codigo)) {
                      uniqueCodes.add(p.codigo);
                      validProducts.push(p);
                  }
              }

              console.log("Productos procesados listos para insertar:", validProducts.length);
              if (validProducts.length > 0) {
                  console.log("Muestra del primer producto:", validProducts[0]);
              }

              if (validProducts.length === 0) {
                  setIsProcessing(false);
                  alert("No se encontraron productos válidos en el archivo (verifique que tengan código y nombre).");
                  return;
              }

              setUploadProgress(1);
              
              if (importMode === 'REPLACE') {
                console.log("Iniciando eliminación de productos antiguos...");
                const { error: delError } = await supabase.from('productos').delete().not('id', 'is', null);
                
                if (delError) {
                    console.error("Error al eliminar productos:", delError);
                    if (delError.message.includes('foreign key constraint')) {
                        throw new Error("No se puede reemplazar el maestro porque hay registros dependientes activos (despachos, inventario, etc.). Por favor, vacíe el sistema primero.");
                    }
                    throw delError;
                }
                console.log("Eliminación completada.");
              }

              console.log("Iniciando inserción/actualización de productos...");
              setUploadProgress(10);

              // Insertar en bloques de 50
              const chunkSize = 50;
              const totalChunks = Math.ceil(validProducts.length / chunkSize);
              const insertedProducts: Product[] = [];

              for (let i = 0; i < totalChunks; i++) {
                  const chunk = validProducts.slice(i * chunkSize, (i + 1) * chunkSize);
                  console.log(`Procesando bloque ${i + 1} de ${totalChunks}...`);
                  
                  // Si es APPEND, para no sobreescribir con valores default los campos que no vienen en el Excel,
                  // primero traemos los registros actuales de este bloque y los mergeamos.
                  let finalChunk = chunk;
                  if (importMode === 'APPEND') {
                      const codigos = chunk.map(p => p.codigo);
                      const { data: existingRecords, error: fetchError } = await supabase
                          .from('productos')
                          .select('*')
                          .in('codigo', codigos);
                      
                      if (!fetchError && existingRecords) {
                          finalChunk = chunk.map(p => {
                              const existing = existingRecords.find(er => er.codigo === p.codigo);
                              if (existing) {
                                  // El objeto 'p' tiene prioridad, pero completamos con 'existing' lo que falte en 'p'
                                  // Esto asegura que si una celda estaba vacía en Excel, se mantenga el valor de la DB.
                                  return { ...existing, ...p };
                              }
                              return p;
                          });
                      }
                  }

                  const { data: dbData, error } = await supabase
                    .from('productos')
                    .upsert(finalChunk, { onConflict: 'codigo' })
                    .select();
                  
                  if (error) {
                      console.error(`Error en bloque ${i + 1}:`, error);
                      throw error;
                  }
                  
                  if (dbData) insertedProducts.push(...(dbData as Product[]));
                  
                  const progress = Math.round(10 + ((i + 1) / totalChunks) * 90);
                  setUploadProgress(progress);
              }
              
              if (importMode === 'REPLACE') {
                onUpdateCatalog(insertedProducts);
              } else {
                // Para APPEND, necesitamos combinar con el catálogo actual
                const updatedCatalog = [...catalog];
                insertedProducts.forEach(newP => {
                  const idx = updatedCatalog.findIndex(p => p.codigo === newP.codigo);
                  if (idx !== -1) {
                    updatedCatalog[idx] = newP;
                  } else {
                    updatedCatalog.push(newP);
                  }
                });
                onUpdateCatalog(updatedCatalog);
              }
              setImportStatus({ msg: `Sincronización exitosa. ${insertedProducts.length} artículos cargados.`, type: 'success' });
              setActiveTab('LIST');
          } catch (err: any) {
              console.error("Error en handleFileUpload (onload):", err);
              setImportStatus({ msg: err.message || 'Error al importar.', type: 'error' });
          } finally {
              setIsProcessing(false);
              setUploadProgress(0);
              if (e.target) e.target.value = '';
          }
      };
      reader.onerror = (err) => {
          console.error("FileReader: onerror disparado", err);
          alert("Error crítico al leer el archivo físico.");
      };
      console.log("FileReader: Iniciando readAsArrayBuffer");
      reader.readAsArrayBuffer(file);
  };


  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-[#0f172a]">
        <div className="bg-white dark:bg-[#1e293b] border-b border-zinc-200 dark:border-slate-700 px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm gap-4">
            <h1 className="text-xl font-black text-slate-800 dark:text-white uppercase italic">
                Maestro de <span className="text-[#009ED6] not-italic font-medium">Artículos</span>
            </h1>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">
                Rol: {userRole || 'N/A'}
            </div>
        </div>
        <div className="bg-white dark:bg-[#1e293b] border-b border-zinc-200 dark:border-slate-700 px-6 pt-6 flex flex-col md:flex-row justify-between items-center sticky top-16 z-20 shadow-sm gap-4">
            <div className="flex gap-8 w-full md:w-auto">
                <button onClick={() => setActiveTab('LIST')} className={`pb-4 px-2 text-sm font-black uppercase tracking-tighter border-b-4 transition-all ${activeTab === 'LIST' ? 'border-[#009ED6] text-[#009ED6]' : 'border-transparent text-zinc-400'}`}>
                    Maestro Supabase ({catalog.length})
                </button>
                {!maintenanceMode && (
                    <button onClick={() => setActiveTab('IMPORT')} className={`pb-4 px-2 text-sm font-black uppercase tracking-tighter border-b-4 transition-all flex items-center gap-2 ${activeTab === 'IMPORT' ? 'border-[#009ED6] text-[#009ED6]' : 'border-transparent text-zinc-400'}`}>
                        <Upload className="w-5 h-5"/> Importar a DB
                    </button>
                )}
            </div>
            {activeTab === 'LIST' && userRole === 'ADMIN' && !maintenanceMode && (
                <div className="flex gap-2 mb-4 w-full md:w-auto justify-end">
                    <button 
                        onClick={() => setShowAddModal(true)} 
                        className="bg-indigo-600 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase shadow-lg flex items-center gap-2 active:scale-95 transition-all hover:bg-indigo-700"
                    >
                        <Plus className="w-4 h-4" /> AGREGAR ITEM
                    </button>
                    <button onClick={handleDownloadDatabase} className="bg-emerald-600 text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase shadow-lg flex items-center gap-2 active:scale-95 transition-all hover:bg-emerald-700">
                        <Download className="w-4 h-4" /> DESCARGAR DB
                    </button>
                    <button onClick={manejarExportarSQL} className="bg-[#009ED6] text-white px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase shadow-lg flex items-center gap-2 active:scale-95 transition-all hover:bg-[#0088b9]"><Database className="w-4 h-4" /> EXPORTAR SCRIPT</button>
                </div>
            )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
            {importStatus && (
                <div className={`p-4 mb-6 rounded-2xl text-[10px] font-black uppercase flex items-center gap-3 animate-fade-in max-w-2xl mx-auto shadow-sm border ${importStatus.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                    {importStatus.type === 'success' ? <CheckCircle className="w-5 h-5"/> : <XCircle className="w-5 h-5"/>}
                    {importStatus.msg}
                </div>
            )}

            {isProcessing && (
                <div className="fixed inset-0 z-[200] bg-white/50 backdrop-blur-sm flex items-center justify-center">
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 border border-zinc-100 animate-fade-in w-full max-w-sm">
                        {uploadProgress > 0 ? (
                            <div className="w-full space-y-4">
                                <div className="flex justify-between items-center">
                                    <p className="font-black uppercase tracking-widest text-[10px]">Sincronizando...</p>
                                    <p className="font-black text-[10px] text-[#009ED6]">{uploadProgress}%</p>
                                </div>
                                <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-[#009ED6] transition-all duration-300" 
                                        style={{ width: `${uploadProgress}%` }}
                                    ></div>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="w-12 h-12 border-4 border-[#009ED6] border-t-transparent rounded-full animate-spin"></div>
                                <p className="font-black uppercase tracking-widest text-[10px]">Actualizando Supabase...</p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'LIST' && (
                <div className="max-w-full mx-auto space-y-6 animate-fade-in">
                    {/* CONTENEDOR DE INDICADORES EN EL HEADER PARA FILTRADO DIRECTO */}
                    <div className="grid grid-cols-3 gap-2 sm:gap-4">
                        <button 
                            onClick={() => setEanFilter('ALL')}
                            className={`p-3 sm:p-4 rounded-2xl border text-left flex items-center justify-between transition-all duration-200 active:scale-[0.98] ${
                                eanFilter === 'ALL'
                                    ? 'bg-[#009ED6]/10 border-[#009ED6] text-[#009ED6] font-black'
                                    : 'bg-white dark:bg-[#1e293b] border-zinc-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-zinc-300 shadow-sm'
                            }`}
                        >
                            <div className="space-y-0.5">
                                <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 line-clamp-1">Total Artículos</p>
                                <p className="text-base sm:text-xl md:text-2xl font-black leading-none">{catalog.length}</p>
                            </div>
                            <div className={`p-1.5 sm:p-2.5 rounded-xl shrink-0 hidden xs:flex ${eanFilter === 'ALL' ? 'bg-[#009ED6] text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'}`}>
                                <Database className="w-4 h-4 sm:w-5 sm:h-5"/>
                            </div>
                        </button>

                        <button 
                            onClick={() => setEanFilter('WITHOUT_EAN_PROD')}
                            className={`p-3 sm:p-4 rounded-2xl border text-left flex items-center justify-between transition-all duration-200 active:scale-[0.98] ${
                                eanFilter === 'WITHOUT_EAN_PROD'
                                    ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-400 font-black'
                                    : 'bg-white dark:bg-[#1e293b] border-zinc-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-zinc-300 shadow-sm'
                            }`}
                        >
                            <div className="space-y-0.5">
                                <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 line-clamp-1">Sin EAN Prod.</p>
                                <p className="text-base sm:text-xl md:text-2xl font-black text-amber-600 dark:text-amber-400 leading-none">{sinEanProductoCount}</p>
                            </div>
                            <div className={`p-1.5 sm:p-2.5 rounded-xl shrink-0 hidden xs:flex ${eanFilter === 'WITHOUT_EAN_PROD' ? 'bg-amber-500 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'}`}>
                                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5"/>
                            </div>
                        </button>

                        <button 
                            onClick={() => setEanFilter('WITHOUT_EAN_BULTO')}
                            className={`p-3 sm:p-4 rounded-2xl border text-left flex items-center justify-between transition-all duration-200 active:scale-[0.98] ${
                                eanFilter === 'WITHOUT_EAN_BULTO'
                                    ? 'bg-rose-500/10 border-rose-500 text-rose-700 dark:text-rose-400 font-black'
                                    : 'bg-white dark:bg-[#1e293b] border-zinc-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-zinc-300 shadow-sm'
                            }`}
                        >
                            <div className="space-y-0.5">
                                <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 line-clamp-1">Sin EAN Bulto</p>
                                <p className="text-base sm:text-xl md:text-2xl font-black text-rose-600 dark:text-rose-400 leading-none">{sinEanBultoCount}</p>
                            </div>
                            <div className={`p-1.5 sm:p-2.5 rounded-xl shrink-0 hidden xs:flex ${eanFilter === 'WITHOUT_EAN_BULTO' ? 'bg-rose-500 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'}`}>
                                <XCircle className="w-4 h-4 sm:w-5 sm:h-5"/>
                            </div>
                        </button>
                    </div>

                    <div className="bg-white dark:bg-[#1e293b] p-4 rounded-3xl shadow-sm border border-zinc-100 dark:border-slate-700 relative">
                        <input type="text" placeholder="Buscar por Código o Nombre..." className="w-full pl-12 pr-4 py-4 bg-zinc-50 dark:bg-slate-800 border-none rounded-2xl shadow-inner outline-none font-bold dark:text-white" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-zinc-400 w-6 h-6"/>
                    </div>

                    <div className="bg-white dark:bg-[#1e293b] shadow-2xl rounded-[2.5rem] overflow-hidden border border-zinc-100 dark:border-slate-700">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-zinc-50 dark:bg-slate-800 text-zinc-500 dark:text-slate-400 font-black uppercase text-[9px] tracking-widest border-b border-zinc-100 dark:border-slate-700">
                                    <tr>
                                        <th className="px-6 py-5">Fotos / Código</th>
                                        <th className="px-6 py-5">Nombre del Producto</th>
                                        <th className="px-6 py-5">Categoría</th>
                                        <th className="px-6 py-5">Unidad Venta</th>
                                        <th className="px-6 py-5">Unidades x Caja</th>
                                        <th className="px-6 py-5">Cajas x Palet</th>
                                        <th className="px-6 py-5">TVM (Días)</th>
                                        <th className="px-6 py-5">TVU Promesa</th>
                                        <th className="px-6 py-5">Venta Media</th>
                                        <th className="px-6 py-5">Venta Semanal</th>
                                        <th className="px-6 py-5">Cámara</th>
                                        <th className="px-6 py-5 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-50 dark:divide-slate-700">
                                    {paginatedCatalog.map((prod, idx) => (
                                        <tr key={idx} className="hover:bg-indigo-50/30 dark:hover:bg-slate-800/50 transition-colors">
                                            <td className="px-6 py-6">
                                                <div className="flex gap-1 mb-2">
                                                    {prod.foto_uno ? (
                                                        <img 
                                                            src={prod.foto_uno} 
                                                            className="w-10 h-10 rounded-lg object-cover border cursor-zoom-in hover:opacity-80 transition-opacity" 
                                                            onClick={() => setSelectedImage(prod.foto_uno || null)}
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300">
                                                            <Camera className="w-4 h-4"/>
                                                        </div>
                                                    )}
                                                    {prod.foto_dos ? (
                                                        <img 
                                                            src={prod.foto_dos} 
                                                            className="w-10 h-10 rounded-lg object-cover border cursor-zoom-in hover:opacity-80 transition-opacity" 
                                                            onClick={() => setSelectedImage(prod.foto_dos || null)}
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-300">
                                                            <Camera className="w-4 h-4"/>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-[#009ED6] font-mono font-black">{prod.codigo}</div>
                                            </td>
                                            <td className="px-6 py-6">
                                                <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">{prod.nombre}</div>
                                                <div className="text-[9px] text-zinc-400 font-bold uppercase">{prod.sku}</div>
                                            </td>
                                            <td className="px-6 py-6 font-black text-[10px] text-indigo-500 uppercase">{prod.categoria}</td>
                                            <td className="px-6 py-6 font-bold text-slate-600 dark:text-slate-400">{prod.unidad_venta}</td>
                                            <td className="px-6 py-6 font-black text-[10px] text-amber-600 uppercase">{prod.unidades_por_caja}</td>
                                            <td className="px-6 py-6 font-black text-[10px] text-emerald-600 uppercase">{prod.cajas_por_palet || 0}</td>
                                            <td className="px-6 py-6 font-black text-[10px] text-blue-600">
                                                {prod.tvu_promesa !== null && prod.tvu_promesa !== undefined ? `${prod.tvu_promesa}%` : '80% (Def.)'}
                                            </td>
                                            <td className="px-6 py-6">
                                                <div className="flex items-center gap-2 font-black text-slate-800 dark:text-white">
                                                    <Clock className="w-3 h-3 text-slate-400" />
                                                    {prod.tvm_dias}
                                                </div>
                                            </td>
                                            <td className="px-6 py-6 font-bold text-slate-800 dark:text-slate-200 text-center">
                                                {prod.venta_media !== null && prod.venta_media !== undefined ? prod.venta_media : 0}
                                            </td>
                                            <td className="px-6 py-6 font-bold text-slate-800 dark:text-slate-200 text-center">
                                                {prod.ventas_semanal !== null && prod.ventas_semanal !== undefined ? prod.ventas_semanal : 0}
                                            </td>
                                            <td className="px-6 py-6">
                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${prod.zona_predeterminada === 'SECO' ? 'bg-amber-100 text-amber-700' : 'bg-cyan-100 text-cyan-700'}`}>{prod.zona_predeterminada}</span>
                                            </td>
                                            <td className="px-6 py-6 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button onClick={() => setEditingProduct(prod)} className="bg-slate-100 hover:bg-[#009ED6] hover:text-white text-slate-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95">Editar</button>
                                                    {userRole === 'ADMIN' && !maintenanceMode && (
                                                        <button 
                                                            onClick={() => {
                                                                setProductToDelete(prod.id);
                                                                setShowSingleDeleteConfirm(true);
                                                            }} 
                                                            className="bg-rose-50 hover:bg-rose-600 hover:text-white text-rose-500 p-2 rounded-xl transition-all active:scale-95 border border-rose-100"
                                                            title="Eliminar Producto"
                                                        >
                                                            <Trash className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* PAGINACIÓN */}
                    {totalPages > 1 && (
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white dark:bg-[#1e293b] p-6 rounded-[2rem] shadow-sm border border-zinc-100 dark:border-slate-700">
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                Mostrando {Math.min(filteredCatalog.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(filteredCatalog.length, currentPage * itemsPerPage)} de {filteredCatalog.length} artículos
                            </p>
                            <div className="flex items-center gap-2">
                                <button 
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 disabled:opacity-30 hover:bg-slate-100 transition-all"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                
                                <div className="flex items-center gap-1">
                                    {[...Array(Math.min(5, totalPages))].map((_, i) => {
                                        let pageNum = currentPage;
                                        if (currentPage <= 3) pageNum = i + 1;
                                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                        else pageNum = currentPage - 2 + i;

                                        if (pageNum <= 0 || pageNum > totalPages) return null;

                                        return (
                                            <button
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={`w-10 h-10 rounded-xl text-[10px] font-black transition-all ${currentPage === pageNum ? 'bg-[#009ED6] text-white shadow-lg shadow-[#009ED6]/20' : 'bg-slate-50 dark:bg-slate-800 text-slate-400 hover:bg-slate-100'}`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>

                                <button 
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-400 disabled:opacity-30 hover:bg-slate-100 transition-all"
                                >
                                    <ChevronRight className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'IMPORT' && (
                <div className="max-w-3xl mx-auto space-y-6 pt-2 animate-fade-in">
                    <div className="bg-white dark:bg-[#1e293b] p-10 rounded-[3rem] shadow-2xl border border-zinc-100 dark:border-slate-700 text-center">
                        <div className="bg-[#009ED6]/10 w-20 h-20 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-[#009ED6]"><Upload className="w-10 h-10" /></div>
                        <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Sincronizar Maestro</h2>
                        
                        <div className="flex justify-center mt-4">
                            <button 
                                onClick={handleDownloadTemplate}
                                className="flex items-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-600 rounded-2xl font-black text-[10px] uppercase border border-emerald-100 hover:bg-emerald-100 transition-all"
                            >
                                <Download className="w-4 h-4" />
                                Descargar Plantilla Excel
                            </button>
                        </div>

                        <div className="flex flex-col items-center gap-4 mt-6">
                            <div className="flex bg-zinc-100 dark:bg-slate-800 p-1 rounded-2xl w-full max-w-xs">
                                <button 
                                    onClick={() => setImportMode('APPEND')}
                                    className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase transition-all bg-white dark:bg-slate-700 text-[#009ED6] shadow-sm"
                                >
                                    Añadir / Actualizar
                                </button>
                            </div>
                            <p className="text-[9px] font-bold text-zinc-400 uppercase">
                                Se añadirán nuevos productos y se actualizarán los existentes (por código)
                            </p>
                        </div>

                        <label className="flex flex-col items-center justify-center w-full h-56 border-4 border-dashed border-zinc-100 dark:border-slate-700 rounded-[3rem] cursor-pointer hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all group mt-4">
                            <FileSpreadsheet className="w-12 h-12 text-zinc-200 group-hover:text-[#009ED6] mb-3 transition-colors"/>
                            <p className="text-[11px] text-zinc-400 font-black uppercase tracking-widest">Seleccionar o Soltar Excel de Artículos</p>
                            <p className="text-[9px] text-zinc-300 font-bold uppercase mt-1">Soporta .xlsx, .xls y .csv</p>
                            <input type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleFileUpload} />
                        </label>
                    </div>
                </div>
            )}
        </div>

        {/* MODAL DE AGREGAR ITEM */}
        {showAddModal && (
            <div className="fixed inset-0 z-[300] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white dark:bg-[#1e293b] w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                    <div className="bg-indigo-600 p-8 text-white shrink-0">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-black uppercase leading-none">Nuevo Artículo</h2>
                                <p className="text-[10px] font-black opacity-70 mt-1 uppercase tracking-widest">Crear registro manual en Supabase</p>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors"><XCircle className="w-8 h-8"/></button>
                        </div>
                    </div>

                    <form onSubmit={handleSaveNewProduct} className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                        <div className="grid grid-cols-1 gap-6">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Código Maestro *</label>
                                <input required className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-mono text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.codigo} onChange={e => setNewProduct({...newProduct, codigo: e.target.value})} placeholder="Ej: PRD001" />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nombre Completo del Producto *</label>
                            <input required className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black uppercase text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.nombre} onChange={e => setNewProduct({...newProduct, nombre: e.target.value})} placeholder="Descripción del artículo" />
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Categoría</label>
                                <input className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-bold uppercase text-xs border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.categoria || ''} onChange={e => setNewProduct({...newProduct, categoria: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Marca</label>
                                <input className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-bold uppercase text-xs border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.marca || ''} onChange={e => setNewProduct({...newProduct, marca: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">U. Venta</label>
                                <input className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black uppercase text-xs border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.unidad_venta || ''} onChange={e => setNewProduct({...newProduct, unidad_venta: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Unidades x Caja</label>
                                <input type="number" className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.unidades_por_caja} onChange={e => setNewProduct({...newProduct, unidades_por_caja: parseInt(e.target.value) || 1})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cajas x Palet</label>
                                <input type="number" className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.cajas_por_palet} onChange={e => setNewProduct({...newProduct, cajas_por_palet: parseInt(e.target.value) || 0})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Peso Unitario (KG)</label>
                                <input type="number" step="0.001" className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.peso_unitario} onChange={e => setNewProduct({...newProduct, peso_unitario: parseFloat(e.target.value) || 0})} />
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Factor Inventario</label>
                                <input type="number" step="0.001" className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.factor_inventario} onChange={e => setNewProduct({...newProduct, factor_inventario: parseFloat(e.target.value) || 1})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">U. Compra</label>
                                <input className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black uppercase text-xs border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.unidad_compra || ''} onChange={e => setNewProduct({...newProduct, unidad_compra: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Factor Unidad</label>
                                <input type="number" step="0.001" className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.factor_unidad} onChange={e => setNewProduct({...newProduct, factor_unidad: parseFloat(e.target.value) || 1})} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nombre Extranjero</label>
                                <input className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-bold uppercase text-xs border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.extranjero || ''} onChange={e => setNewProduct({...newProduct, extranjero: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nombre SN</label>
                                <input className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-bold uppercase text-xs border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.nombre_sn || ''} onChange={e => setNewProduct({...newProduct, nombre_sn: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">U.M. SAP</label>
                                <input className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-bold uppercase text-xs border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.unidad_medida_sap || ''} onChange={e => setNewProduct({...newProduct, unidad_medida_sap: e.target.value})} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                                <span className="text-[10px] font-black text-slate-400 uppercase">Es Peso / Granel</span>
                                <button type="button" onClick={() => setNewProduct({...newProduct, es_peso: !newProduct.es_peso})} className={`w-10 h-5 rounded-full transition-all relative ${newProduct.es_peso ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${newProduct.es_peso ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                                <span className="text-[10px] font-black text-slate-400 uppercase">Tiene Detracción</span>
                                <button type="button" onClick={() => setNewProduct({...newProduct, tiene_detraccion: !newProduct.tiene_detraccion})} className={`w-10 h-5 rounded-full transition-all relative ${newProduct.tiene_detraccion ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${newProduct.tiene_detraccion ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                                <span className="text-[10px] font-black text-slate-400 uppercase">Requiere Pesaje</span>
                                <button type="button" onClick={() => setNewProduct({...newProduct, requiere_pesaje: !newProduct.requiere_pesaje})} className={`w-10 h-5 rounded-full transition-all relative ${newProduct.requiere_pesaje ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${newProduct.requiere_pesaje ? 'left-6' : 'left-1'}`} />
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-7 gap-6">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">TVM (Días)</label>
                                <input type="number" className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.tvm_dias} onChange={e => setNewProduct({...newProduct, tvm_dias: parseInt(e.target.value) || 0})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Vida Útil</label>
                                <input type="number" className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.vida_util_dias} onChange={e => setNewProduct({...newProduct, vida_util_dias: parseInt(e.target.value) || 0})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Venta Media</label>
                                <input type="number" className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.venta_media ?? 0} onChange={e => setNewProduct({...newProduct, venta_media: parseFloat(e.target.value) || 0})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cámara</label>
                                <select className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-black uppercase text-xs border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.zona_predeterminada} onChange={e => setNewProduct({...newProduct, zona_predeterminada: e.target.value as any})}>
                                    <option value="SECO">SECO</option>
                                    <option value="REFRIGERADO">REFRIGERADO</option>
                                    <option value="CONGELADO">CONGELADO</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase ml-1">Promesa TVU (%)</label>
                                <input 
                                    type="text" 
                                    className="w-full p-4 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-850/80 rounded-2xl font-black text-sm text-sky-900 dark:text-sky-100 outline-none focus:ring-2 focus:ring-sky-500 placeholder-sky-300" 
                                    value={newProduct.tvu_promesa !== null && newProduct.tvu_promesa !== undefined ? `${newProduct.tvu_promesa}%` : ''} 
                                    onChange={e => {
                                        const raw = e.target.value.replace(/[^0-9]/g, '');
                                        const num = raw ? parseInt(raw) : null;
                                        setNewProduct({...newProduct, tvu_promesa: num});
                                    }}
                                    onBlur={() => {
                                        if (newProduct.tvu_promesa !== null && newProduct.tvu_promesa !== undefined) {
                                            const clamped = Math.min(100, Math.max(0, newProduct.tvu_promesa));
                                            setNewProduct({...newProduct, tvu_promesa: clamped});
                                        }
                                    }}
                                    placeholder="Ej: 80%" 
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase ml-1">Ventas Semanal</label>
                                <input 
                                    type="number" 
                                    className="w-full p-4 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-850/80 rounded-2xl font-black text-sm text-sky-900 dark:text-sky-100 outline-none focus:ring-2 focus:ring-sky-500 placeholder-sky-300" 
                                    value={newProduct.ventas_semanal ?? ''} 
                                    onChange={e => setNewProduct({...newProduct, ventas_semanal: parseInt(e.target.value) || null})} 
                                    placeholder="Ej: 50" 
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-sky-600 dark:text-sky-400 uppercase ml-1">Múltiplo Alerta</label>
                                <input 
                                    type="number" 
                                    className="w-full p-4 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-850/80 rounded-2xl font-black text-sm text-sky-900 dark:text-sky-100 outline-none focus:ring-2 focus:ring-sky-500 placeholder-sky-300" 
                                    value={newProduct.multiplo ?? ''} 
                                    onChange={e => setNewProduct({...newProduct, multiplo: parseFloat(e.target.value) || null})} 
                                    placeholder="Ej: 6 o 8" 
                                />
                            </div>
                        </div>

                        {/* CONTROL DE TARA */}
                        <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-[2rem] space-y-6 border border-slate-100 dark:border-slate-800">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-[#009ED6]/10 rounded-xl text-[#009ED6]"><Scale className="w-5 h-5" /></div>
                                    <div>
                                        <h3 className="text-xs font-black uppercase text-slate-700 dark:text-slate-200">Control de Tara</h3>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase">Activar para productos despachados por peso neto</p>
                                    </div>
                                </div>
                                <button type="button" onClick={() => setNewProduct({...newProduct, usa_control_tara: !newProduct.usa_control_tara})} className={`w-12 h-6 rounded-full transition-all relative ${newProduct.usa_control_tara ? 'bg-[#82BD02]' : 'bg-slate-300'}`}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${newProduct.usa_control_tara ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>

                            {newProduct.usa_control_tara && (
                                <div className="grid grid-cols-2 gap-4 animate-fade-in">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tara Caja/Tina Std (KG)</label>
                                        <input type="number" step="0.001" className="w-full p-4 bg-white dark:bg-slate-800 dark:text-white rounded-2xl font-black text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.peso_tara_caja_std} onChange={e => setNewProduct({...newProduct, peso_tara_caja_std: parseFloat(e.target.value) || 0})} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Tara Pallet Std (KG)</label>
                                        <input type="number" step="0.001" className="w-full p-4 bg-white dark:bg-slate-800 dark:text-white rounded-2xl font-black text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.peso_tara_pallet_std} onChange={e => setNewProduct({...newProduct, peso_tara_pallet_std: parseFloat(e.target.value) || 0})} />
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">EAN producto</label>
                                <input className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-mono text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.sku || ''} onChange={e => setNewProduct({...newProduct, sku: e.target.value})} placeholder="Código de barras" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">EAN Bulto/Caja</label>
                                <input className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-mono text-sm border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.ean_bulto || ''} onChange={e => setNewProduct({...newProduct, ean_bulto: e.target.value})} placeholder="EAN13 o similar" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cámara Texto</label>
                                <input className="w-full p-4 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-2xl font-bold uppercase text-xs border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.camara_texto || ''} onChange={e => setNewProduct({...newProduct, camara_texto: e.target.value})} placeholder="Ej: SECO, REFRIGERA..." />
                            </div>
                        </div>

                        <div className="grid grid-cols-5 gap-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nivel 0</label>
                                <input className="w-full p-3 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl text-[10px] border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.nivel_0 || ''} onChange={e => setNewProduct({...newProduct, nivel_0: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nivel 1</label>
                                <input className="w-full p-3 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl text-[10px] border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.nivel_1 || ''} onChange={e => setNewProduct({...newProduct, nivel_1: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nivel 2</label>
                                <input className="w-full p-3 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl text-[10px] border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.nivel_2 || ''} onChange={e => setNewProduct({...newProduct, nivel_2: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nivel 3</label>
                                <input className="w-full p-3 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl text-[10px] border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.nivel_3 || ''} onChange={e => setNewProduct({...newProduct, nivel_3: e.target.value})} />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nivel 4</label>
                                <input className="w-full p-3 bg-slate-50 dark:bg-slate-800 dark:text-white rounded-xl text-[10px] border-none outline-none focus:ring-2 focus:ring-indigo-500" value={newProduct.nivel_4 || ''} onChange={e => setNewProduct({...newProduct, nivel_4: e.target.value})} />
                            </div>
                        </div>

                        <div className="flex gap-4 pt-6 shrink-0">
                            <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-3xl text-[10px] uppercase tracking-widest hover:bg-slate-200">Cancelar</button>
                            <button type="submit" className="flex-[2] py-4 bg-indigo-600 text-white font-black rounded-3xl text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all">Crear Artículo</button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* MODAL DE EDICIÓN COMPLETA */}
        {editingProduct && (
            <div className="fixed inset-0 z-[300] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white dark:bg-[#1e293b] w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
                    {/* Header Compacto con el color de la sucursal */}
                    <div className="bg-[#009ED6] px-5 py-3.5 text-white shrink-0 flex justify-between items-center">
                        <div>
                            <h2 className="text-base font-black uppercase leading-tight tracking-wider">Editar Artículo</h2>
                            <p className="text-[9px] font-bold opacity-80 uppercase tracking-widest mt-0.5">Sincronización en tiempo real con Supabase</p>
                        </div>
                        <button type="button" onClick={() => setEditingProduct(null)} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                            <XCircle className="w-6 h-6"/>
                        </button>
                    </div>

                    <form onSubmit={guardarCambiosEdicion} className="flex-1 overflow-y-auto p-4 space-y-3.5 custom-scrollbar text-slate-700 dark:text-slate-300">
                        
                        {/* SECCIÓN 1: DATOS PRINCIPALES DE IDENTIFICACIÓN */}
                        <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/80 p-3 rounded-xl space-y-2.5">
                            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">Identificación Básica</h3>
                            
                            <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Nombre Completo del Producto</label>
                                <input 
                                    required 
                                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-bold uppercase text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                    value={editingProduct.nombre} 
                                    onChange={e => setEditingProduct({...editingProduct, nombre: e.target.value})} 
                                />
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Código Maestro</label>
                                    <input 
                                        readOnly 
                                        className="w-full px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 dark:text-slate-500 rounded-lg font-mono text-xs border border-transparent cursor-not-allowed" 
                                        value={editingProduct.codigo} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Categoría / Rubro</label>
                                    <input 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-bold uppercase text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.categoria || ''} 
                                        onChange={e => setEditingProduct({...editingProduct, categoria: e.target.value})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Marca</label>
                                    <input 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-bold uppercase text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.marca || ''} 
                                        onChange={e => setEditingProduct({...editingProduct, marca: e.target.value})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">EAN producto</label>
                                    <input 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.sku || ''} 
                                        onChange={e => setEditingProduct({...editingProduct, sku: e.target.value})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">EAN Bulto/Caja</label>
                                    <input 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-mono text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.ean_bulto || ''} 
                                        onChange={e => setEditingProduct({...editingProduct, ean_bulto: e.target.value})} 
                                        placeholder="EAN13 o similar" 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* SECCIÓN 2: CONTROL LOGÍSTICO, EQUIVALENCIAS Y EMBLAJE */}
                        <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/80 p-3 rounded-xl space-y-2.5">
                            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">Unidades, Embalaje y Factor</h3>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Unidad Venta</label>
                                    <input 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black uppercase text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.unidad_venta || ''} 
                                        onChange={e => setEditingProduct({...editingProduct, unidad_venta: e.target.value})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Unidades x Caja (RTU)</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.unidades_por_caja} 
                                        onChange={e => setEditingProduct({...editingProduct, unidades_por_caja: parseInt(e.target.value) || 1})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Cajas x Palet</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.cajas_por_palet} 
                                        onChange={e => setEditingProduct({...editingProduct, cajas_por_palet: parseInt(e.target.value) || 0})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Peso Unitario (KG)</label>
                                    <input 
                                        type="number" 
                                        step="0.001" 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.peso_unitario} 
                                        onChange={e => setEditingProduct({...editingProduct, peso_unitario: parseFloat(e.target.value) || 0})} 
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Factor Inventario</label>
                                    <input 
                                        type="number" 
                                        step="0.001" 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.factor_inventario} 
                                        onChange={e => setEditingProduct({...editingProduct, factor_inventario: parseFloat(e.target.value) || 1})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">U. Compra</label>
                                    <input 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black uppercase text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.unidad_compra || ''} 
                                        onChange={e => setEditingProduct({...editingProduct, unidad_compra: e.target.value})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Factor Unidad</label>
                                    <input 
                                        type="number" 
                                        step="0.001" 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.factor_unidad} 
                                        onChange={e => setEditingProduct({...editingProduct, factor_unidad: parseFloat(e.target.value) || 1})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">U.M. SAP</label>
                                    <input 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-bold uppercase text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.unidad_medida_sap || ''} 
                                        onChange={e => setEditingProduct({...editingProduct, unidad_medida_sap: e.target.value})} 
                                    />
                                </div>
                            </div>
                        </div>

                        {/* SECCIÓN 3: ATRIBUTOS DE COMPORTAMIENTO Y FECHAS */}
                        <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/80 p-3 rounded-xl space-y-2.5">
                            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">Parametría de Control & Cámara</h3>
                            
                            {/* Toggles Compactos */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-1">
                                <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-lg">
                                    <span className="text-[10px] font-black text-slate-500 uppercase">Es Peso / Granel</span>
                                    <button type="button" onClick={() => setEditingProduct({...editingProduct, es_peso: !editingProduct.es_peso})} className={`w-8 h-4 rounded-full transition-all relative ${editingProduct.es_peso ? 'bg-[#009ED6]' : 'bg-slate-300'}`}>
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${editingProduct.es_peso ? 'left-[18px]' : 'left-0.5'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-lg">
                                    <span className="text-[10px] font-black text-slate-500 uppercase">Tiene Detracción</span>
                                    <button type="button" onClick={() => setEditingProduct({...editingProduct, tiene_detraccion: !editingProduct.tiene_detraccion})} className={`w-8 h-4 rounded-full transition-all relative ${editingProduct.tiene_detraccion ? 'bg-[#009ED6]' : 'bg-slate-300'}`}>
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${editingProduct.tiene_detraccion ? 'left-[18px]' : 'left-0.5'}`} />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-2 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 rounded-lg">
                                    <span className="text-[10px] font-black text-slate-500 uppercase">Requiere Pesaje</span>
                                    <button type="button" onClick={() => setEditingProduct({...editingProduct, requiere_pesaje: !editingProduct.requiere_pesaje})} className={`w-8 h-4 rounded-full transition-all relative ${editingProduct.requiere_pesaje ? 'bg-[#009ED6]' : 'bg-slate-300'}`}>
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${editingProduct.requiere_pesaje ? 'left-[18px]' : 'left-0.5'}`} />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-9 gap-2.5">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">TVM (Días)</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.tvm_dias} 
                                        onChange={e => setEditingProduct({...editingProduct, tvm_dias: parseInt(e.target.value) || 0})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Vida Útil</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.vida_util_dias} 
                                        onChange={e => setEditingProduct({...editingProduct, vida_util_dias: parseInt(e.target.value) || 0})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Venta Media</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.venta_media ?? 0} 
                                        onChange={e => setEditingProduct({...editingProduct, venta_media: parseFloat(e.target.value) || 0})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Cámara Texto</label>
                                    <input 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-bold uppercase text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.camara_texto || ''} 
                                        onChange={e => setEditingProduct({...editingProduct, camara_texto: e.target.value})} 
                                        placeholder="Ej: SECO" 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-sky-600 dark:text-sky-400 uppercase ml-0.5">Promesa TVU (%)</label>
                                    <input 
                                        type="text" 
                                        className="w-full px-2.5 py-1.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800/80 rounded-lg font-black text-xs text-sky-900 dark:text-sky-100 outline-none focus:ring-1 focus:ring-[#009ED6] placeholder-sky-300" 
                                        value={editingProduct.tvu_promesa !== null && editingProduct.tvu_promesa !== undefined ? `${editingProduct.tvu_promesa}%` : ''} 
                                        onChange={e => {
                                            const raw = e.target.value.replace(/[^0-9]/g, '');
                                            const num = raw ? parseInt(raw) : null;
                                            setEditingProduct({...editingProduct, tvu_promesa: num});
                                        }}
                                        onBlur={() => {
                                            if (editingProduct.tvu_promesa !== null && editingProduct.tvu_promesa !== undefined) {
                                                const clamped = Math.min(100, Math.max(0, editingProduct.tvu_promesa));
                                                setEditingProduct({...editingProduct, tvu_promesa: clamped});
                                            }
                                        }}
                                        placeholder="Ej: 80%"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-sky-600 dark:text-sky-400 uppercase ml-0.5">Ventas Semanal</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-2.5 py-1.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800/80 rounded-lg font-black text-xs text-sky-900 dark:text-sky-100 outline-none focus:ring-1 focus:ring-[#009ED6] placeholder-sky-300" 
                                        value={editingProduct.ventas_semanal ?? ''} 
                                        onChange={e => setEditingProduct({...editingProduct, ventas_semanal: parseInt(e.target.value) || null})} 
                                        placeholder="Ej: 50"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-sky-600 dark:text-sky-400 uppercase ml-0.5">Múltiplo Alerta</label>
                                    <input 
                                        type="number" 
                                        className="w-full px-2.5 py-1.5 bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800/80 rounded-lg font-black text-xs text-sky-900 dark:text-sky-100 outline-none focus:ring-1 focus:ring-[#009ED6] placeholder-sky-300" 
                                        value={editingProduct.multiplo ?? ''} 
                                        onChange={e => setEditingProduct({...editingProduct, multiplo: parseFloat(e.target.value) || null})} 
                                        placeholder="Ej: 6 o 8"
                                    />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Cámara Destino</label>
                                    <select 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black uppercase text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.zona_predeterminada} 
                                        onChange={e => setEditingProduct({...editingProduct, zona_predeterminada: e.target.value as any})}
                                    >
                                        <option value="SECO">SECO (TEMPERATURA AMBIENTE)</option>
                                        <option value="REFRIGERADO">REFRIGERADO (CAMARA REFRIG.)</option>
                                        <option value="CONGELADO">CONGELADO (CAMARA FRÍO)</option>
                                    </select>
                                </div>
                            </div>

                            {/* CONTROL DE TARA COMPACTO */}
                            <div className="p-2.5 bg-slate-100/80 dark:bg-slate-800/40 rounded-xl space-y-2 border border-slate-200/50 dark:border-slate-700/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1 px-1.5 bg-[#009ED6]/10 rounded text-[#009ED6]"><Scale className="w-3.5 h-3.5" /></div>
                                        <div>
                                            <h4 className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-200">Control de Tara Especial</h4>
                                            <p className="text-[8px] font-bold text-slate-400 uppercase">Usar para el despacho por peso neto</p>
                                        </div>
                                    </div>
                                    <button type="button" onClick={() => setEditingProduct({...editingProduct, usa_control_tara: !editingProduct.usa_control_tara})} className={`w-8 h-4 rounded-full transition-all relative ${editingProduct.usa_control_tara ? 'bg-[#82BD02]' : 'bg-slate-300'}`}>
                                        <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${editingProduct.usa_control_tara ? 'left-[18px]' : 'left-0.5'}`} />
                                    </button>
                                </div>

                                {editingProduct.usa_control_tara && (
                                    <div className="grid grid-cols-2 gap-2.5 animate-fade-in pt-1">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Tara Caja/Tina Std (KG)</label>
                                            <input 
                                                type="number" 
                                                step="0.001" 
                                                className="w-full px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                                value={editingProduct.peso_tara_caja_std} 
                                                onChange={e => setEditingProduct({...editingProduct, peso_tara_caja_std: parseFloat(e.target.value) || 0})} 
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Tara Pallet Std (KG)</label>
                                            <input 
                                                type="number" 
                                                step="0.001" 
                                                className="w-full px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-black text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                                value={editingProduct.peso_tara_pallet_std} 
                                                onChange={e => setEditingProduct({...editingProduct, peso_tara_pallet_std: parseFloat(e.target.value) || 0})} 
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* SECCIÓN 4: JERARQUÍA SAP Y NOMBRES COMERCIALES */}
                        <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/80 p-3 rounded-xl space-y-2.5">
                            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1">Jerarquías e Idioma</h3>

                            <div className="grid grid-cols-2 gap-2.5">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Nombre Extranjero</label>
                                    <input 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-bold uppercase text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.extranjero || ''} 
                                        onChange={e => setEditingProduct({...editingProduct, extranjero: e.target.value})} 
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Nombre SN (Socio de Negocios)</label>
                                    <input 
                                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg font-bold uppercase text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" 
                                        value={editingProduct.nombre_sn || ''} 
                                        onChange={e => setEditingProduct({...editingProduct, nombre_sn: e.target.value})} 
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-5 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Nivel 0</label>
                                    <input className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" value={editingProduct.nivel_0 || ''} onChange={e => setEditingProduct({...editingProduct, nivel_0: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Nivel 1</label>
                                    <input className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" value={editingProduct.nivel_1 || ''} onChange={e => setEditingProduct({...editingProduct, nivel_1: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Nivel 2</label>
                                    <input className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" value={editingProduct.nivel_2 || ''} onChange={e => setEditingProduct({...editingProduct, nivel_2: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Nivel 3</label>
                                    <input className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" value={editingProduct.nivel_3 || ''} onChange={e => setEditingProduct({...editingProduct, nivel_3: e.target.value})} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase ml-0.5">Nivel 4</label>
                                    <input className="w-full p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs outline-none focus:ring-1 focus:ring-[#009ED6]" value={editingProduct.nivel_4 || ''} onChange={e => setEditingProduct({...editingProduct, nivel_4: e.target.value})} />
                                </div>
                            </div>
                        </div>

                        {/* SECCIÓN 5: FOTOGRAFÍAS */}
                        <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/80 p-3 rounded-xl">
                            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1 mb-2.5">Galería Fotográfica</h3>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5 flex flex-col items-center">
                                    <div className="w-full max-w-xs h-24 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden relative group">
                                        {editingProduct.foto_uno ? (
                                            <img 
                                                src={editingProduct.foto_uno} 
                                                className="w-full h-full object-cover cursor-zoom-in hover:opacity-80 transition-opacity" 
                                                onClick={() => setSelectedImage(editingProduct.foto_uno || null)}
                                            />
                                        ) : (
                                            <Camera className="w-7 h-7 text-slate-200" />
                                        )}
                                        <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                            <Upload className="w-5 h-5 text-white animate-bounce-short" />
                                            <input type="file" accept="image/*" capture className="hidden" onChange={e => manejarFotoEdicion(e, 'foto_uno')} />
                                        </label>
                                    </div>
                                    <p className="text-[8px] text-center font-black uppercase text-slate-400">Foto Frontal</p>
                                </div>
                                <div className="space-y-1.5 flex flex-col items-center">
                                    <div className="w-full max-w-xs h-24 bg-white dark:bg-slate-900 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden relative group">
                                        {editingProduct.foto_dos ? (
                                            <img 
                                                src={editingProduct.foto_dos} 
                                                className="w-full h-full object-cover cursor-zoom-in hover:opacity-80 transition-opacity" 
                                                onClick={() => setSelectedImage(editingProduct.foto_dos || null)}
                                            />
                                        ) : (
                                            <Camera className="w-7 h-7 text-slate-200" />
                                        )}
                                        <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                            <Upload className="w-5 h-5 text-white animate-bounce-short" />
                                            <input type="file" accept="image/*" capture className="hidden" onChange={e => manejarFotoEdicion(e, 'foto_dos')} />
                                        </label>
                                    </div>
                                    <p className="text-[8px] text-center font-black uppercase text-slate-400">Foto Código Barra</p>
                                </div>
                            </div>
                        </div>

                        {/* Botones de acción compactos */}
                        <div className="flex gap-2.5 pt-3.5 border-t border-slate-100 dark:border-slate-800/80 shrink-0">
                            <button 
                                type="button" 
                                onClick={() => setEditingProduct(null)} 
                                className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-extrabold rounded-lg text-[10px] uppercase tracking-wider hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button 
                                type="submit" 
                                className="flex-[2] py-2.5 bg-[#82BD02] text-white font-extrabold rounded-lg text-[10px] uppercase tracking-wider shadow-lg shadow-[#82BD02]/10 hover:bg-[#72A602] active:scale-98 transition-all"
                            >
                                Guardar Cambios
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {showDeleteConfirm && (
            <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4">
                <div className="bg-white dark:bg-[#1e293b] w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 text-center space-y-6">
                    <div className="bg-rose-100 text-rose-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto"><AlertTriangle className="w-10 h-10" /></div>
                    <h2 className="text-2xl font-black text-slate-800 dark:text-white uppercase">¿Resetear Sistema?</h2>
                    <p className="text-center text-slate-500 dark:text-slate-400 text-sm font-bold">
                        ¿Estas seguro que desea eliminar? esta accion no se puede revertir.
                    </p>
                    <div className="flex gap-4 pt-4">
                        <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-4 bg-zinc-100 text-zinc-500 font-black rounded-2xl text-[10px] uppercase">No</button>
                        <button onClick={confirmarVaciarTabla} className="flex-1 py-4 bg-rose-600 text-white font-black rounded-2xl text-[10px] uppercase">Sí, Borrar Todo</button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN INDIVIDUAL */}
        {showSingleDeleteConfirm && (
            <div className="fixed inset-0 z-[400] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                <div className="bg-white dark:bg-[#1e293b] w-full max-w-sm rounded-[3rem] shadow-2xl overflow-hidden">
                    <div className="bg-rose-600 p-8 text-white text-center">
                        <AlertTriangle className="w-16 h-16 mx-auto mb-4 opacity-50" />
                        <h2 className="text-2xl font-black uppercase leading-none">¿Eliminar Producto?</h2>
                    </div>
                    <div className="p-8 space-y-6">
                        <p className="text-center text-slate-500 dark:text-slate-400 text-sm font-bold">
                            ¿Estas seguro que desea eliminar? esta accion no se puede revertir.
                        </p>
                        <div className="flex gap-4">
                            <button onClick={() => setShowSingleDeleteConfirm(false)} className="flex-1 py-4 bg-slate-100 text-slate-500 font-black rounded-2xl text-[10px] uppercase">Cancelar</button>
                            <button onClick={handleDeleteProduct} className="flex-1 py-4 bg-rose-600 text-white font-black rounded-2xl text-[10px] uppercase">Sí, Eliminar</button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {/* Image Viewer Modal */}
        {selectedImage && (
            <div 
                className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-200 cursor-zoom-out"
                onClick={() => setSelectedImage(null)}
            >
                <div className="relative max-w-5xl max-h-full flex items-center justify-center">
                    <button 
                        className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300 transition-colors"
                        onClick={() => setSelectedImage(null)}
                    >
                        <XCircle className="w-8 h-8" />
                    </button>
                    <img 
                        src={selectedImage} 
                        alt="Maximized" 
                        className="max-w-full max-h-[90vh] rounded-xl shadow-2xl object-contain animate-in zoom-in-95 duration-200"
                        referrerPolicy="no-referrer"
                    />
                </div>
            </div>
        )}
    </div>
  );
};

export default ArticleMaster;
