
import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { FileText, Download, PlusCircle, RefreshCw, Box, CheckCircle, AlertTriangle, XCircle, Check, Upload, ChevronLeft, ChevronRight, Search } from './Icons';
import { Product, Usuario } from '../types';
import { supabase } from '../supabaseClient';

interface XmlReceptionProps {
  catalog: Product[];
  currentUser: Usuario | null;
  onSelectProductForReception: (product: Product, data: any) => void;
}

const XmlReception: React.FC<XmlReceptionProps> = ({ catalog, currentUser, onSelectProductForReception }) => {
  const [xmlItems, setXmlItems] = useState<any[]>([]);
  const [isParsingXml, setIsParsingXml] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [historicalExpirations, setHistoricalExpirations] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch historical expiration dates to check rotation
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const { data, error } = await supabase
          .from('recepcion_productos')
          .select('codigo, fecha_vencimiento')
          .order('fecha_vencimiento', { ascending: false });

        if (error) throw error;

        const history: Record<string, string> = {};
        data?.forEach(row => {
          if (!history[row.codigo] || row.fecha_vencimiento > history[row.codigo]) {
            history[row.codigo] = row.fecha_vencimiento;
          }
        });
        setHistoricalExpirations(history);
      } catch (err) {
        console.error("Error fetching historical expirations:", err);
      }
    };

    fetchHistory();
  }, []);

  const calculateTVU = (expirationDate: string, vidaUtilDias: number) => {
    if (!expirationDate || !vidaUtilDias) return null;
    const exp = new Date(expirationDate);
    const today = new Date();
    const diffTime = exp.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    const tvu = (diffDays / vidaUtilDias) * 100;
    return {
      days: diffDays,
      percentage: Math.max(0, Math.round(tvu))
    };
  };

  const handleXmlUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingXml(true);
    setCurrentPage(1);
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      
      const isInvoice = xmlDoc.documentElement.localName === 'Invoice';
      const isDespatch = xmlDoc.documentElement.localName === 'DespatchAdvice';

      // UBL 2.1 Namespaces
      const ns = {
        cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
        cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
      };

      let lines: HTMLCollectionOf<Element>;
      if (isInvoice) {
        lines = xmlDoc.getElementsByTagNameNS(ns.cac, "InvoiceLine");
      } else if (isDespatch) {
        lines = xmlDoc.getElementsByTagNameNS(ns.cac, "DespatchLine");
      } else {
        alert("Formato XML no reconocido. Debe ser Factura o Guía de Remisión UBL.");
        setIsParsingXml(false);
        return;
      }

      const parsedItems: any[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const id = line.getElementsByTagNameNS(ns.cbc, "ID")[0]?.textContent;
        
        const qtyNode = isInvoice 
          ? line.getElementsByTagNameNS(ns.cbc, "InvoicedQuantity")[0]
          : line.getElementsByTagNameNS(ns.cbc, "DeliveredQuantity")[0];
          
        const qty = parseFloat(qtyNode?.textContent || "0");
        const unitCode = qtyNode?.getAttribute("unitCode");
        
        const item = line.getElementsByTagNameNS(ns.cac, "Item")[0];
        const description = item?.getElementsByTagNameNS(ns.cbc, "Description")[0]?.textContent;
        const sellersId = item?.getElementsByTagNameNS(ns.cac, "SellersItemIdentification")[0];
        const providerCode = sellersId?.getElementsByTagNameNS(ns.cbc, "ID")[0]?.textContent?.trim();

        // Match with catalog using 'extranjero' field
        const matchedProduct = catalog.find(p => 
          p.extranjero?.trim().toLowerCase() === providerCode?.toLowerCase()
        );

        // Extract expiration date if DespatchAdvice
        let extractedExpDate = '';
        if (isDespatch && description) {
          // Format: [DESCRIPTION @#@ U.M.;;DD.MM.YYYY;...]
          const match = description.match(/;;(\d{2})\.(\d{2})\.(\d{4})/);
          if (match) {
            extractedExpDate = `${match[3]}-${match[2]}-${match[1]}`;
          }
        }

        parsedItems.push({
          id: id || `item-${i}-${Date.now()}`,
          providerCode: providerCode || 'N/A',
          code: matchedProduct?.codigo || providerCode || 'N/A',
          description: description || 'N/A',
          quantity: qty,
          unitCode: unitCode || 'NIU',
          product: matchedProduct,
          expirationDate: extractedExpDate,
          lote: ''
        });
      }

      setXmlItems(parsedItems);
      // Select all by default
      setSelectedItemIds(new Set(parsedItems.map(item => item.id)));
    } catch (err) {
      console.error("Error parsing XML:", err);
      alert("Error al procesar el archivo XML. Asegúrese que sea un formato UBL válido.");
    } finally {
      setIsParsingXml(false);
    }
  };

  const handleDownloadXmlExcel = () => {
    if (xmlItems.length === 0) return;

    const data = xmlItems.map(item => {
      const tvu = item.product ? calculateTVU(item.expirationDate, item.product.vida_util_dias) : null;
      const lastExp = item.product ? historicalExpirations[item.product.codigo] : null;
      const rotationWarning = lastExp && item.expirationDate && item.expirationDate < lastExp;

      return {
        'CÓDIGO PROVEEDOR': item.providerCode,
        'CÓDIGO INTERNO': item.code,
        'DESCRIPCIÓN': item.description,
        'CANTIDAD': item.quantity,
        'U.M.': item.unitCode,
        'VENCIMIENTO': item.expirationDate,
        'TVU %': tvu ? `${tvu.percentage}%` : 'N/A',
        'ROTACIÓN': rotationWarning ? 'MALA' : 'OK',
        'ESTADO CATÁLOGO': item.product ? 'EXISTE' : 'NO EXISTE'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Items XML");
    XLSX.writeFile(wb, `Items_XML_${new Date().getTime()}.xlsx`);
  };

  const handleRejectItem = (id: string) => {
    setXmlItems(prev => prev.filter(item => item.id !== id));
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItemIds.size === xmlItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(xmlItems.map(item => item.id)));
    }
  };

  const handleProcessSelected = async () => {
    const itemsToProcess = xmlItems.filter(item => selectedItemIds.has(item.id));
    if (itemsToProcess.length === 0) {
      alert("Seleccione al menos un ítem para procesar.");
      return;
    }

    const invalidItems = itemsToProcess.filter(item => !item.product || !item.expirationDate);
    if (invalidItems.length > 0) {
      alert("Algunos ítems seleccionados no tienen producto asociado o fecha de vencimiento. Por favor corríjalos o desmárquelos.");
      return;
    }

    setIsProcessing(true);
    try {
      const entries = itemsToProcess.map(item => ({
        producto_id: item.product.id,
        codigo: item.product.codigo,
        nombre: item.product.nombre,
        cantidad: item.quantity,
        fecha_vencimiento: item.expirationDate,
        usuario_registro: currentUser?.username || 'SISTEMA_XML',
        fecha_registro: new Date().toISOString(),
        proveedor: 'CARGA_XML',
        guia_factura: 'XML_IMPORT',
        estado: 'PENDIENTE_LAIVE'
      }));

      const { error } = await supabase.from('recepcion_productos').insert(entries);
      if (error) throw error;

      alert(`${itemsToProcess.length} ítems procesados correctamente.`);
      // Remove processed items from list
      setXmlItems(prev => prev.filter(item => !selectedItemIds.has(item.id)));
      setSelectedItemIds(new Set());
    } catch (err) {
      console.error("Error processing items:", err);
      alert("Error al procesar los ítems en la base de datos.");
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredItems = xmlItems.filter(item => 
    item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedItems = [...filteredItems].sort((a, b) => {
    const tvuA = a.product ? calculateTVU(a.expirationDate, a.product.vida_util_dias)?.percentage ?? 999 : 999;
    const tvuB = b.product ? calculateTVU(b.expirationDate, b.product.vida_util_dias)?.percentage ?? 999 : 999;
    return tvuA - tvuB;
  });

  const totalPages = Math.ceil(sortedItems.length / itemsPerPage);
  const paginatedItems = sortedItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef}
        accept=".xml"
        onChange={handleXmlUpload}
        className="hidden"
      />

      {/* Header Section */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm z-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600 rounded-xl shadow-lg shadow-emerald-200">
              <FileText className="w-6 h-6 text-white"/>
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-800 tracking-tight uppercase">Carga de XML</h2>
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Facturas y Guías de Remisión</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-emerald-200 transition-all transform active:scale-95"
            >
              <Upload className="w-5 h-5"/> EXAMINAR XML
            </button>

            <button 
              onClick={() => {
                setXmlItems([]);
                setCurrentPage(1);
              }}
              className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              title="Limpiar Lista"
            >
              <RefreshCw className="w-5 h-5"/>
            </button>
            {xmlItems.length > 0 && (
              <>
                <button 
                  onClick={handleProcessSelected}
                  disabled={isProcessing || selectedItemIds.size === 0}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-blue-200 transition-all transform active:scale-95"
                >
                  {isProcessing ? <RefreshCw className="w-5 h-5 animate-spin"/> : <CheckCircle className="w-5 h-5"/>}
                  PROCESAR ({selectedItemIds.size})
                </button>
                <button 
                  onClick={handleDownloadXmlExcel}
                  className="flex items-center gap-2 bg-[#82BD02] hover:bg-[#74a902] text-white px-4 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-[#82BD02]/20 transition-all transform active:scale-95"
                >
                  <Download className="w-5 h-5"/> EXCEL
                </button>
              </>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/>
          <input 
            type="text" 
            placeholder="Filtrar por código o descripción..."
            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all"
            value={searchTerm}
            onChange={e => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 overflow-hidden flex flex-col p-4 md:p-6">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
          <div className="overflow-auto flex-1 custom-scrollbar">
            <table className="w-full text-sm text-left border-collapse min-w-[1000px]">
              <thead className="bg-gray-50/80 text-gray-400 font-black uppercase text-[10px] tracking-widest sticky top-0 z-10 backdrop-blur-md border-b">
                <tr>
                  <th className="px-4 py-4 text-center w-12">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      checked={xmlItems.length > 0 && selectedItemIds.size === xmlItems.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-4">Código</th>
                  <th className="px-6 py-4">Descripción</th>
                  <th className="px-6 py-4 text-center">Cant.</th>
                  <th className="px-6 py-4 text-center">U.M.</th>
                  <th className="px-6 py-4 text-center">Vencimiento</th>
                  <th className="px-6 py-4 text-center">Alertas</th>
                  <th className="px-6 py-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isParsingXml ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin opacity-20"/>
                        <span className="text-gray-400 font-bold uppercase tracking-widest text-xs">Procesando XML...</span>
                      </div>
                    </td>
                  </tr>
                ) : xmlItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-3 opacity-30">
                        <Box className="w-12 h-12 text-gray-400"/>
                        <span className="text-gray-500 font-bold uppercase tracking-widest text-xs">No se han cargado archivos</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item) => {
                    const tvu = item.product ? calculateTVU(item.expirationDate, item.product.vida_util_dias) : null;
                    const lastExp = item.product ? historicalExpirations[item.product.codigo] : null;
                    const rotationWarning = lastExp && item.expirationDate && item.expirationDate < lastExp;

                    return (
                      <tr key={item.id} className={`hover:bg-emerald-50/30 transition-colors group ${selectedItemIds.has(item.id) ? 'bg-emerald-50/20' : ''}`}>
                        <td className="px-4 py-4 text-center">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            checked={selectedItemIds.has(item.id)}
                            onChange={() => toggleSelectItem(item.id)}
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-base font-black text-emerald-600 font-mono tracking-tighter">
                              {item.code}
                            </span>
                            <span className="text-[9px] font-bold text-gray-400 uppercase">Prov: {item.providerCode}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col min-w-[200px]">
                            <span className="font-black text-gray-800 group-hover:text-emerald-600 transition-colors break-words text-sm leading-tight">
                              {item.description}
                            </span>
                            {!item.product && (
                              <span className="text-[10px] font-bold text-red-500 uppercase mt-1">No encontrado en catálogo</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="inline-block bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full font-black text-xs">
                            {item.quantity}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-xs font-bold text-gray-500 uppercase">{item.unitCode}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <input 
                            type="date" 
                            className="p-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-700 outline-none focus:border-emerald-500 transition-all"
                            value={item.expirationDate}
                            onChange={(e) => {
                              const newItems = [...xmlItems];
                              const targetIdx = newItems.findIndex(ni => ni.id === item.id);
                              if (targetIdx !== -1) {
                                newItems[targetIdx].expirationDate = e.target.value;
                                setXmlItems(newItems);
                              }
                            }}
                          />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex flex-col gap-1 items-center">
                            {tvu && (
                              <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${tvu.percentage < 33 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                <AlertTriangle className="w-3 h-3"/> TVU: {tvu.percentage}%
                              </div>
                            )}
                            {rotationWarning && (
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[9px] font-black uppercase animate-pulse">
                                <RefreshCw className="w-3 h-3"/> ROTACIÓN MALA
                              </div>
                            )}
                            {!rotationWarning && lastExp && (
                              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase">
                                <Check className="w-3 h-3"/> ROTACIÓN OK
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => onSelectProductForReception(item.product, item)}
                              disabled={!item.product}
                              className={`p-2 rounded-xl transition-all transform active:scale-95 ${
                                item.product 
                                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700' 
                                : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                              }`}
                              title={item.product ? "Cargar para Recepción" : "Producto no encontrado"}
                            >
                              <PlusCircle className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => handleRejectItem(item.id)}
                              className="p-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all transform active:scale-95 shadow-sm"
                              title="Rechazar Ítem"
                            >
                              <XCircle className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex items-center justify-between">
              <div className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                Mostrando {paginatedItems.length} de {sortedItems.length} ítems
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg hover:bg-white disabled:opacity-30 transition-all border border-transparent hover:border-gray-200"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600"/>
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                        currentPage === page 
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100' 
                        : 'text-gray-500 hover:bg-white hover:text-emerald-600'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg hover:bg-white disabled:opacity-30 transition-all border border-transparent hover:border-gray-200"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600"/>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default XmlReception;
