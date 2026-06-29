
import React, { useState, useRef } from 'react';
import { Product, ZoneType } from '../types';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Download, AlertTriangle, ListChecks, Database } from './Icons';
import { supabase } from '../supabaseClient';

declare var XLSX: any;

interface BulkImportProps {
  onUpdateCatalog: (newProducts: Product[]) => void;
}

const BulkImport: React.FC<BulkImportProps> = ({ onUpdateCatalog }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const findVal = (row: any, searchTerms: string[]) => {
    const keys = Object.keys(row);
    
    // Normalizar términos de búsqueda una vez
    const normalizedSearchTerms = searchTerms.map(t => 
      t.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")
    );

    // 1. Intento de coincidencia exacta (normalizada)
    for (let i = 0; i < searchTerms.length; i++) {
      const term = normalizedSearchTerms[i];
      const foundKey = keys.find(k => {
        const normalizedK = k.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        return normalizedK === term;
      });
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== '') return row[foundKey];
    }

    // 2. Intento de coincidencia parcial
    for (let i = 0; i < searchTerms.length; i++) {
      const term = normalizedSearchTerms[i];
      if (term.length < 3) continue; // Evitar coincidencias parciales con términos muy cortos
      const foundKey = keys.find(k => {
        const normalizedK = k.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        return normalizedK.includes(term) || term.includes(normalizedK);
      });
      if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && row[foundKey] !== '') return row[foundKey];
    }
    
    return '';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (typeof XLSX === 'undefined') {
      alert("Error: La librería de Excel no se ha cargado.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) return;
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonData: any[] = XLSX.utils.sheet_to_json(ws);

        if (jsonData.length === 0) {
          alert("El archivo está vacío.");
          return;
        }

        const mapped = jsonData.map((row) => {
          const codigo = String(findVal(row, ['codigo_ic', 'codigo_ico', 'codigo', 'cod', 'sku', 'ean', 'item', 'referencia']) || '').trim();
          const nombre = String(findVal(row, ['descripcion', 'descripci', 'nombre', 'articulo', 'descrip']) || '').trim();
          
          if (!codigo || !nombre) return null;

          const camaraStr = String(findVal(row, ['camara', 'zona', 'temp']) || 'SECO').toUpperCase();
          let zona: ZoneType = 'SECO';
          if (camaraStr.includes('REFRIG')) zona = 'REFRIGERADO';
          if (camaraStr.includes('CONGEL')) zona = 'CONGELADO';

          const yToBool = (val: any) => {
            const s = String(val || '').toUpperCase();
            return s === 'Y' || s === 'SI' || s === 'TRUE' || s === 'S' || s === '1';
          };

          const parseNum = (val: any, def: number) => {
            if (val === undefined || val === null || val === '') return def;
            const n = parseFloat(String(val).replace(',', '.'));
            return isNaN(n) ? def : n;
          };

          return {
            codigo,
            sku: String(findVal(row, ['barras', 'sku', 'ean', 'codigo de barras']) || codigo).trim(),
            nombre,
            categoria: String(findVal(row, ['nivel 1', 'categoria', 'nivel 0', 'nivel we']) || 'GENERAL').trim(),
            marca: String(findVal(row, ['marca']) || 'S/M').trim(),
            unidad_venta: String(findVal(row, ['unidad de medida de ventas', 'unidad de medida', 'unidad d', 'unidad venta', 'um venta', 'um']) || 'UND').trim(),
            unidades_por_caja: Math.round(parseNum(findVal(row, ['articulo p', 'articulo por unidad compra', 'articulo por unidad de compra', 'unidades por caja', 'uxc', 'factor']), 1)),
            vida_util_dias: Math.round(parseNum(findVal(row, ['vida util', 'dias vida', 'tvm']), 0)),
            requiere_pesaje: yToBool(findVal(row, ['pesaje', 'balanza', 'requiere pesaje'])),
            zona_predeterminada: zona,
            extranjero: String(findVal(row, ['nombre extranjero', 'extranjero', 'nombre extra']) || '').trim(),
            nombre_sn: String(findVal(row, ['nombre sn', 'nombre s']) || '').trim(),
            unidad_medida_sap: String(findVal(row, ['unidad medida sap', 'um sap']) || '').trim(),
            es_seco: yToBool(findVal(row, ['secos', 'es seco'])),
            es_refrigerado: yToBool(findVal(row, ['refrigerados', 'refrigera', 'es refrigerado'])),
            es_congelado: yToBool(findVal(row, ['congelados', 'congelad', 'es congelado'])),
            es_peso: yToBool(findVal(row, ['peso', 'es peso'])),
            unidad_compra: String(findVal(row, ['unidad compra', 'unidad c', 'um compra']) || 'BX').trim(),
            factor_unidad: parseNum(findVal(row, ['articulo p', 'articulo por unidad compra', 'articulo por unidad de compra', 'factor unidad', 'articulo por unidad']), 1),
            factor_inventario: parseNum(findVal(row, ['peso inventario', 'peso inve', 'factor inventario']), 1),
            nivel_0: String(findVal(row, ['nivel 0']) || '').trim(),
            nivel_1: String(findVal(row, ['nivel 1']) || '').trim(),
            nivel_2: String(findVal(row, ['nivel 2']) || '').trim(),
            nivel_3: String(findVal(row, ['nivel 3']) || '').trim(),
            nivel_4: String(findVal(row, ['nivel 4']) || '').trim(),
            tiene_detraccion: yToBool(findVal(row, ['detraccion', 'tiene detraccion'])),
            tvm_dias: Math.round(parseNum(findVal(row, ['tvm']), 0)),
            camara_texto: camaraStr,
            peso_unitario: parseNum(findVal(row, ['peso inventario', 'peso unitario', 'peso']), 0),
            cajas_por_palet: Math.round(parseNum(findVal(row, ['cajas por palet', 'cajas palet', 'cajas_por_palet', 'palet']), 0)),
            usa_control_tara: yToBool(findVal(row, ['control_tara', 'control tara', 'usa control tara', 'una control tara'])),
            peso_tara_caja_std: parseNum(findVal(row, ['tara_caja_std', 'tara caja std', 'peso tara caja']), 0),
            peso_tara_pallet_std: parseNum(findVal(row, ['tara_pallet_std', 'tara pallet std', 'peso tara pallet']), 0),
            tvu_promesa: findVal(row, ['tvu_promesa', 'tvu promesa', 'promesa tvu', 'promesa_tvu', 'tvu contractual']) !== '' ? Math.round(parseNum(findVal(row, ['tvu_promesa', 'tvu promesa', 'promesa tvu', 'promesa_tvu', 'tvu contractual']), 0)) : null,
            ventas_semanal: findVal(row, ['ventas_semanal', 'ventas semanal', 'venta semanal', 'rotacion semanal', 'rotacion_semanal']) !== '' ? Math.round(parseNum(findVal(row, ['ventas_semanal', 'ventas semanal', 'venta semanal', 'rotacion semanal', 'rotacion_semanal']), 0)) : null,
            venta_media: findVal(row, ['venta media', 'venta_media', 'rotacion_media']) !== '' ? parseNum(findVal(row, ['venta media', 'venta_media', 'rotacion_media']), 0) : null,
            multiplo: findVal(row, ['multiplo', 'multiplo_alerta', 'multiplo_sobrestock', 'multiplo sobrestock']) !== '' ? parseNum(findVal(row, ['multiplo', 'multiplo_alerta', 'multiplo_sobrestock', 'multiplo sobrestock']), 0) || null : null,
            ean_bulto: String(findVal(row, ['ean_bulto', 'ean bulto', 'ean_caja']) || '').trim(),
            foto_uno: String(findVal(row, ['foto_uno', 'foto 1']) || '').trim(),
            foto_dos: String(findVal(row, ['foto_dos', 'foto 2']) || '').trim()
          };
        }).filter(p => p !== null);

        // Deduplicar por código
        const unique = Array.from(new Map(mapped.map(p => [p!.codigo, p])).values());
        setPreviewData(unique);
        setImportStatus(null);
      } catch (err) {
        console.error(err);
        alert("Error al procesar el archivo.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const processImport = async () => {
    if (!previewData || previewData.length === 0) return;

    try {
      setIsProcessing(true);
      setUploadProgress(5);
      setImportStatus(null);

      // 1. Obtener IDs actuales para borrar en bloques (evita timeouts de PostgREST en tablas grandes)
      const { data: currentIds, error: fetchError } = await supabase.from('productos').select('id');
      if (fetchError) throw fetchError;

      if (currentIds && currentIds.length > 0) {
        const delChunkSize = 100;
        const totalDelChunks = Math.ceil(currentIds.length / delChunkSize);
        
        for (let i = 0; i < totalDelChunks; i++) {
          const chunk = currentIds.slice(i * delChunkSize, (i + 1) * delChunkSize).map(item => item.id);
          const { error: delError } = await supabase.from('productos').delete().in('id', chunk);
          
          if (delError) {
            if (delError.message.includes('foreign key constraint')) {
              throw new Error("No se pueden borrar los productos porque hay registros (paletas, despachos, etc.) que dependen de ellos. Limpie el inventario y despachos primero.");
            }
            throw delError;
          }
          
          // Progreso de 5% a 25% para la limpieza
          setUploadProgress(Math.round(5 + ((i + 1) / totalDelChunks) * 20));
        }
      } else {
        setUploadProgress(25);
      }

      // 2. Insertar nuevos productos por bloques
      const chunkSize = 100;
      const totalChunks = Math.ceil(previewData.length / chunkSize);
      const inserted: Product[] = [];

      for (let i = 0; i < totalChunks; i++) {
        const chunk = previewData.slice(i * chunkSize, (i + 1) * chunkSize);
        const { data, error } = await supabase.from('productos').insert(chunk).select();
        if (error) throw error;
        if (data) inserted.push(...(data as Product[]));
        
        // Progreso de 25% a 100% para la inserción
        setUploadProgress(Math.round(25 + ((i + 1) / totalChunks) * 75));
      }

      onUpdateCatalog(inserted);
      setImportStatus({ msg: `¡Éxito! Se cargaron ${inserted.length} artículos correctamente.`, type: 'success' });
      setPreviewData(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error("Error en importación:", err);
      setImportStatus({ msg: err.message || 'Error en la carga masiva.', type: 'error' });
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-[#0f172a] p-4 md:p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-6xl mx-auto w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl md:text-5xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Carga Maestro de Artículos</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">Gestión rápida y masiva del catálogo de productos</p>
        </div>

        {importStatus && (
          <div className={`p-6 rounded-[2rem] text-xs md:text-sm font-black uppercase flex items-center gap-4 animate-fade-in shadow-xl border-2 ${importStatus.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
            {importStatus.type === 'success' ? <CheckCircle className="w-8 h-8 shrink-0"/> : <XCircle className="w-8 h-8 shrink-0"/>}
            {importStatus.msg}
          </div>
        )}

        {!previewData && !isProcessing && (
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white dark:bg-[#1e293b] p-8 rounded-[3rem] shadow-2xl border border-zinc-100 dark:border-slate-700 flex flex-col items-center text-center space-y-6">
              <div className="bg-emerald-100 w-20 h-20 rounded-[2rem] flex items-center justify-center text-emerald-600">
                <Download className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase">1. Descargar Formato</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Usa nuestra plantilla oficial para evitar errores de carga.</p>
              </div>
              <button 
                onClick={handleDownloadTemplate}
                className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-emerald-700 transition-all active:scale-95"
              >
                Descargar Plantilla
              </button>
            </div>

            <div className="bg-white dark:bg-[#1e293b] p-8 rounded-[3rem] shadow-2xl border border-zinc-100 dark:border-slate-700 flex flex-col items-center text-center space-y-6">
              <div className="bg-[#009ED6]/10 w-20 h-20 rounded-[2rem] flex items-center justify-center text-[#009ED6]">
                <Upload className="w-10 h-10" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase">2. Subir Excel</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Carga tu archivo con los datos de tus productos.</p>
              </div>
              <label className="w-full py-4 bg-[#009ED6] text-white rounded-2xl font-black uppercase tracking-widest shadow-lg hover:bg-[#0088b9] transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                Seleccionar Archivo
                <input ref={fileInputRef} type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
        )}

        {previewData && !isProcessing && (
          <div className="bg-white dark:bg-[#1e293b] rounded-[3rem] shadow-2xl border border-zinc-100 dark:border-slate-700 overflow-hidden animate-fade-in flex flex-col">
            <div className="p-8 border-b border-zinc-100 dark:border-slate-700 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-amber-100 p-3 rounded-2xl text-amber-600">
                  <ListChecks className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">Vista Previa de Carga</h3>
                  <p className="text-xs text-slate-400 font-bold uppercase">{previewData.length} productos detectados</p>
                </div>
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                <button 
                  onClick={() => setPreviewData(null)}
                  className="flex-1 md:flex-none px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={processImport}
                  className="flex-1 md:flex-none px-8 py-3 bg-[#82BD02] text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg hover:bg-[#74a902] transition-all flex items-center justify-center gap-2"
                >
                  <Database className="w-4 h-4" />
                  Confirmar e Importar
                </button>
              </div>
            </div>
            
            <div className="overflow-x-auto max-h-[400px] custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-zinc-100 dark:border-slate-700">Código</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-zinc-100 dark:border-slate-700">Descripción</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-zinc-100 dark:border-slate-700">Marca</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-zinc-100 dark:border-slate-700">Zona</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-zinc-100 dark:border-slate-700 text-center">U.Venta</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-zinc-100 dark:border-slate-700 text-center">UXC</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-zinc-100 dark:border-slate-700 text-center">CXP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-slate-700">
                  {previewData.slice(0, 50).map((p, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 text-xs font-black text-[#009ED6]">{p.codigo}</td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600 dark:text-slate-300 truncate max-w-[300px]">{p.nombre}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-500">{p.marca}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                          p.zona_predeterminada === 'REFRIGERADO' ? 'bg-blue-50 text-blue-600' :
                          p.zona_predeterminada === 'CONGELADO' ? 'bg-indigo-50 text-indigo-600' :
                          'bg-amber-50 text-amber-600'
                        }`}>
                          {p.zona_predeterminada}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-400 text-center">{p.unidad_venta}</td>
                      <td className="px-6 py-4 text-xs font-black text-blue-600 text-center">{p.unidades_por_caja}</td>
                      <td className="px-6 py-4 text-xs font-black text-emerald-600 text-center">{p.cajas_por_palet || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previewData.length > 50 && (
                <div className="p-4 text-center text-[10px] font-bold text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/50">
                  Mostrando los primeros 50 de {previewData.length} productos...
                </div>
              )}
            </div>
          </div>
        )}

        {isProcessing && (
          <div className="bg-white dark:bg-[#1e293b] p-10 rounded-[3rem] shadow-2xl border border-zinc-100 dark:border-slate-700 space-y-8 animate-fade-in">
            <div className="flex justify-between items-end">
              <div className="space-y-1">
                <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter">Procesando Carga...</h3>
                <p className="text-xs text-slate-400 font-bold uppercase">Sincronizando con base de datos en tiempo real</p>
              </div>
              <span className="text-3xl font-black text-[#009ED6]">{uploadProgress}%</span>
            </div>
            
            <div className="relative h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border-4 border-white dark:border-slate-700 shadow-inner">
              <div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#009ED6] to-[#82BD02] transition-all duration-500 ease-out"
                style={{ width: `${uploadProgress}%` }}
              >
                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:40px_40px] animate-[progress_2s_linear_infinite]"></div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-amber-50 dark:bg-amber-900/20 p-6 rounded-[2rem] border border-amber-100 dark:border-amber-800/30 flex gap-4">
          <div className="bg-amber-100 dark:bg-amber-800/40 p-3 rounded-2xl text-amber-600 h-fit">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-black text-amber-800 dark:text-amber-400 uppercase">Aviso Importante</h4>
            <p className="text-xs text-amber-700 dark:text-amber-500/80 font-medium leading-relaxed">
              La carga masiva reemplazará todos los artículos existentes. Asegúrate de que los códigos de producto sean únicos. Si el sistema tiene movimientos activos, deberás vaciarlos antes de realizar una nueva carga masiva.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes progress {
          0% { background-position: 0 0; }
          100% { background-position: 40px 0; }
        }
      `}</style>
    </div>
  );
};

export default BulkImport;
