import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Usuario, MermaRecord, MermaReport } from '../types';
import { 
    Filter, 
    FileText, 
    FileSpreadsheet, 
    Calendar, 
    CheckCircle, 
    Camera, 
    ArrowLeft,
    Check,
    User,
    Search,
    Eye,
    X,
    Pencil
} from './Icons';
import { supabase } from '../supabaseClient';
import { compressImage, generateStorageFileName } from '../utils';
import * as XLSX from 'xlsx-js-style';
import ExcelJS from 'exceljs';
import SignatureCanvas from 'react-signature-canvas';

interface MermaReportsProps {
    currentUser: Usuario | null;
    onBack: () => void;
}

const MermaReports: React.FC<MermaReportsProps> = ({ currentUser, onBack }) => {
    const [mermas, setMermas] = useState<MermaRecord[]>([]);
    const [allMermas, setAllMermas] = useState<(MermaRecord & { mermas_reportes?: { numero_reporte: string } })[]>([]);
    const [reports, setReports] = useState<MermaReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [view, setView] = useState<'PENDING' | 'REPORTS' | 'ALL_ITEMS'>('PENDING');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPagePending, setCurrentPagePending] = useState(1);
    const [currentPageAllItems, setCurrentPageAllItems] = useState(1);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const itemsPerPage = 10;

    // Modals
    const [isItemsModalOpen, setIsItemsModalOpen] = useState(false);
    const [selectedReportItems, setSelectedReportItems] = useState<MermaRecord[]>([]);
    const [selectedReportNumber, setSelectedReportNumber] = useState('');
    const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
    const [currentReportId, setCurrentReportId] = useState<string | null>(null);
    const [responsable, setResponsable] = useState('');
    const signatureRef = useRef<SignatureCanvas>(null);

    // Filters
    const [filterDateStart, setFilterDateStart] = useState('');
    const [filterDateEnd, setFilterDateEnd] = useState('');
    const [filterProcedencia, setFilterProcedencia] = useState('');
    const [filterDefecto, setFilterDefecto] = useState('');
    const [filterDestino, setFilterDestino] = useState('');

    const PROCEDENCIA_OPTIONS = ['DISTRIBUCION', 'ALMACEN', 'VENTA', 'DEVOLUCION', 'CAMBIO MANO A MANO', 'CORTE'];
    const DEFECTO_OPTIONS = ['ROTO', 'MAL ESTADO', 'REVENTADO', 'GOLPEADO', 'VENCIDO', 'CALIDAD'];
    const DESTINO_OPTIONS = ['VENTA PERSONAL', 'REMAR', 'DESECHAR', 'DESTRUCCION', 'RECLAMO'];

    useEffect(() => {
        fetchData();
    }, [view]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (view === 'PENDING') {
                let query = supabase
                    .from('mermas')
                    .select('*')
                    .eq('revisado_calidad', false);

                if (currentUser?.sede_id) {
                    query = query.eq('sede_id', currentUser.sede_id);
                }

                const { data: mermasData, error: mermasError } = await query
                    .order('fecha_registro', { ascending: false });

                if (mermasError) throw mermasError;
                setMermas(mermasData || []);
            } else if (view === 'REPORTS') {
                let query = supabase
                    .from('mermas_reportes')
                    .select('*');

                if (currentUser?.sede_id) {
                    query = query.eq('sede_id', currentUser.sede_id);
                }

                const { data: reportsData, error: reportsError } = await query
                    .order('fecha_creacion', { ascending: false });

                if (reportsError) throw reportsError;
                setReports(reportsData || []);
            } else if (view === 'ALL_ITEMS') {
                let query = supabase
                    .from('mermas')
                    .select('*, mermas_reportes(numero_reporte)');

                if (currentUser?.sede_id) {
                    query = query.eq('sede_id', currentUser.sede_id);
                }

                const { data: allData, error: allError } = await query
                    .order('fecha_registro', { ascending: false });

                if (allError) throw allError;
                setAllMermas(allData || []);
            }
        } catch (err) {
            console.error("Error fetching data:", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredMermas = useMemo(() => {
        return mermas.filter(m => {
            const date = m.fecha_registro.split('T')[0];
            const matchDate = (!filterDateStart || date >= filterDateStart) && 
                             (!filterDateEnd || date <= filterDateEnd);
            const matchProcedencia = !filterProcedencia || m.procedencia === filterProcedencia;
            const matchDefecto = !filterDefecto || m.defecto === filterDefecto;
            const matchDestino = !filterDestino || m.destino === filterDestino;
            const matchSearch = !searchTerm || 
                                m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                m.codigo.toLowerCase().includes(searchTerm.toLowerCase());
            return matchDate && matchProcedencia && matchDefecto && matchDestino && matchSearch;
        });
    }, [mermas, filterDateStart, filterDateEnd, filterProcedencia, filterDefecto, filterDestino, searchTerm]);

    const paginatedPendingMermas = useMemo(() => {
        const start = (currentPagePending - 1) * itemsPerPage;
        return filteredMermas.slice(start, start + itemsPerPage);
    }, [filteredMermas, currentPagePending]);

    const filteredAllItems = useMemo(() => {
        return allMermas.filter(m => {
            const searchMatch = !searchTerm || 
                                m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                m.codigo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                m.mermas_reportes?.numero_reporte?.toLowerCase().includes(searchTerm.toLowerCase());
            return searchMatch;
        });
    }, [allMermas, searchTerm]);

    const paginatedAllItems = useMemo(() => {
        const start = (currentPageAllItems - 1) * itemsPerPage;
        return filteredAllItems.slice(start, start + itemsPerPage);
    }, [filteredAllItems, currentPageAllItems]);

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredMermas.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredMermas.map(m => m.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const newSelected = new Set(selectedIds);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedIds(newSelected);
    };

    const handleExportExcelOnly = () => {
        if (selectedIds.size === 0) {
            alert("Seleccione al menos una merma para exportar");
            return;
        }

        const selectedItems = mermas.filter(m => selectedIds.has(m.id));
        const fileName = `PREVIEW-MERMAS-${Date.now()}.xlsx`;

        const worksheet = XLSX.utils.json_to_sheet(selectedItems.map(m => ({
            Código: m.codigo,
            Producto: m.nombre,
            Cantidad: m.cantidad,
            UM: m.unidad_medida || 'UND',
            Procedencia: m.procedencia,
            Defecto: m.defecto,
            Destino: m.destino,
            Vencimiento: m.fecha_vencimiento,
            'Fecha Registro': new Date(m.fecha_registro).toLocaleString(),
            RegistradoPor: m.usuario_registro
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Mermas");
        XLSX.writeFile(workbook, fileName);
    };

    const handleProcessMermas = async () => {
        if (selectedIds.size === 0) {
            alert("Seleccione al menos una merma para procesar");
            return;
        }

        if (!confirm("¿Está seguro de procesar estas mermas? Se generará un reporte y se marcarán como revisadas.")) {
            return;
        }

        const selectedItems = mermas.filter(m => selectedIds.has(m.id));
        const reportNumber = `REP-MER-${Date.now()}`;
        
        try {
            // 1. Create report record
            const { data: reportData, error: reportError } = await supabase
                .from('mermas_reportes')
                .insert([{
                    numero_reporte: reportNumber,
                    usuario_creacion: currentUser?.nombre || 'Desconocido',
                    items_count: selectedItems.length,
                    filtros_aplicados: {
                        start: filterDateStart,
                        end: filterDateEnd,
                        procedencia: filterProcedencia,
                        defecto: filterDefecto,
                        destino: filterDestino
                    },
                    sede_id: currentUser?.sede_id
                }])
                .select()
                .single();

            if (reportError) throw reportError;

            // 2. Update mermas
            const { error: updateError } = await supabase
                .from('mermas')
                .update({ 
                    revisado_calidad: true, 
                    reporte_id: reportData.id 
                })
                .in('id', Array.from(selectedIds));

            if (updateError) throw updateError;

            // 3. Generate file (Excel)
            const worksheet = XLSX.utils.json_to_sheet(selectedItems.map(m => ({
                Código: m.codigo,
                Producto: m.nombre,
                Cantidad: m.cantidad,
                UM: m.unidad_medida || 'UND',
                Procedencia: m.procedencia,
                Defecto: m.defecto,
                Destino: m.destino,
                Vencimiento: m.fecha_vencimiento,
                'Fecha Registro': new Date(m.fecha_registro).toLocaleString(),
                RegistradoPor: m.usuario_registro
            })));
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Mermas");
            XLSX.writeFile(workbook, `${reportNumber}.xlsx`);

            // 4. Refresh
            setSelectedIds(new Set());
            fetchData();
            alert("Mermas procesadas y reporte generado correctamente");
        } catch (err) {
            console.error("Error processing mermas:", err);
            alert("Error al procesar las mermas");
        }
    };

    const handleUploadSignedReport = async (reportId: string, file: File) => {
        try {
            const fileName = generateStorageFileName();
            const filePath = `ReportesFirmados/${fileName}`;

            try {
                const compressedBlob = await compressImage(file, 1024, 0.6);
                const { error: uploadError } = await supabase.storage
                    .from('evidencias')
                    .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('evidencias')
                    .getPublicUrl(filePath);

                const { error: updateError } = await supabase
                    .from('mermas_reportes')
                    .update({ foto_firmada: publicUrl })
                    .eq('id', reportId);

                if (updateError) throw updateError;

                fetchData();
                alert("Reporte firmado subido correctamente");
            } catch (compressErr) {
                console.error("Error compressing signed report:", compressErr);
                // Fallback to original
                const { error: uploadError } = await supabase.storage
                    .from('evidencias')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('evidencias')
                    .getPublicUrl(filePath);

                const { error: updateError } = await supabase
                    .from('mermas_reportes')
                    .update({ foto_firmada: publicUrl })
                    .eq('id', reportId);

                if (updateError) throw updateError;

                fetchData();
                alert("Reporte firmado subido correctamente");
            }
        } catch (err) {
            console.error("Error uploading signed report:", err);
            alert("Error al subir el reporte firmado");
        }
    };

    const handleViewReportItems = async (reportId: string, reportNumber: string) => {
        try {
            const { data, error } = await supabase
                .from('mermas')
                .select('*')
                .eq('reporte_id', reportId);
            
            if (error) throw error;
            setSelectedReportItems(data || []);
            setSelectedReportNumber(reportNumber);
            setIsItemsModalOpen(true);
        } catch (err) {
            console.error("Error fetching report items:", err);
        }
    };

    const handleDownloadReportExcel = async (reportId: string, reportNumber: string) => {
        try {
            const { data, error } = await supabase
                .from('mermas')
                .select('*')
                .eq('reporte_id', reportId)
                .order('fecha_registro', { ascending: true });
            
            if (error) throw error;
            if (!data || data.length === 0) {
                alert("No hay items en este reporte");
                return;
            }

            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Registro de Merma');

            // 1. Add Logo
            try {
                const response = await fetch('https://iili.io/fsmAapV.png');
                const blob = await response.blob();
                const arrayBuffer = await blob.arrayBuffer();
                const imageId = workbook.addImage({
                    buffer: arrayBuffer,
                    extension: 'png',
                });
                worksheet.addImage(imageId, {
                    tl: { col: 0, row: 0 },
                    ext: { width: 100, height: 60 }
                });
            } catch (imgErr) {
                console.error("Error loading logo for Excel:", imgErr);
            }

            // 2. Title
            worksheet.mergeCells('A1:M2');
            const titleCell = worksheet.getCell('A1');
            titleCell.value = 'REGISTRO Y CONTROL DE MERMA - ICO- LIMA';
            titleCell.font = { bold: true, size: 16, color: { argb: 'FF1E293B' } };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

            // 3. Headers
            const headers = [
                'ITEM', 
                'FECHA Y HORA DE REGISTRO', 
                'CODIGO', 
                'DESCRIPCION', 
                'CANT', 
                'UM', 
                'FECHA DE VENCIMIENTO', 
                'PROCEDENCIA', 
                'DEFECTO',
                'REGISTRADO POR', 
                'DESTINO', 
                'FECHA DE REVISIÓN', 
                'VB° CALIDAD'
            ];
            
            const headerRow = worksheet.getRow(4);
            headerRow.values = headers;
            headerRow.height = 30;
            headerRow.eachCell((cell) => {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF1F5F9' }
                };
                cell.font = { bold: true, size: 10 };
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });

            // 4. Data
            const today = new Date().toLocaleDateString();
            data.forEach((m, index) => {
                const row = worksheet.addRow([
                    index + 1,
                    new Date(m.fecha_registro).toLocaleString(),
                    m.codigo,
                    m.nombre,
                    m.cantidad,
                    m.unidad_medida || 'UND',
                    m.fecha_vencimiento || '',
                    m.procedencia || '',
                    m.defecto || '',
                    m.usuario_registro || '',
                    m.destino || '',
                    today,
                    ''
                ]);
                row.eachCell((cell, colNumber) => {
                    cell.font = { size: 9 };
                    cell.alignment = { 
                        horizontal: colNumber === 4 ? 'left' : 'center', 
                        vertical: 'middle' 
                    };
                    cell.border = {
                        top: { style: 'thin' },
                        left: { style: 'thin' },
                        bottom: { style: 'thin' },
                        right: { style: 'thin' }
                    };
                });
            });

            // 5. Footer
            const lastRowNumber = worksheet.lastRow ? worksheet.lastRow.number : 4;
            const footerStartRow = lastRowNumber + 2;
            
            const now = new Date().toLocaleString();
            const userName = currentUser?.nombre || 'Usuario';

            const footerRows = [
                [`Código de Reporte: ${reportNumber || 'N/A'}`],
                [`Impreso por: ${userName}`],
                [`Fecha y hora impresa: ${now}`],
                ['Firma del responsable de calidad: ___________________________'],
                ['Observaciones o comentarios: ________________________________________________________________']
            ];

            footerRows.forEach((fr, i) => {
                const row = worksheet.getRow(footerStartRow + i);
                row.values = fr;
                const cell = row.getCell(1);
                cell.font = { size: 10, italic: i > 1 };
                cell.alignment = { horizontal: 'left' };
            });

            // 6. Column Widths
            worksheet.columns = [
                { width: 8 },  // ITEM
                { width: 25 }, // FECHA Y HORA
                { width: 15 }, // CODIGO
                { width: 50 }, // DESCRIPCION
                { width: 10 }, // CANT
                { width: 8 },  // UM
                { width: 20 }, // VENCIMIENTO
                { width: 20 }, // PROCEDENCIA
                { width: 20 }, // DEFECTO
                { width: 20 }, // REGISTRADO POR
                { width: 15 }, // DESTINO
                { width: 15 }, // REVISION
                { width: 15 }  // VB CALIDAD
            ];

            // 7. Write and Download
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = `${reportNumber || 'Reporte_Merma'}.xlsx`;
            anchor.click();
            window.URL.revokeObjectURL(url);

        } catch (err) {
            console.error("Error downloading report excel:", err);
            alert("Error al descargar el Excel");
        }
    };

    const handleOpenSignatureModal = (reportId: string) => {
        setCurrentReportId(reportId);
        setResponsable('');
        setIsSignatureModalOpen(true);
    };

    const handleSaveSignature = async () => {
        if (!signatureRef.current || signatureRef.current.isEmpty()) {
            alert('Por favor, firme antes de guardar');
            return;
        }
        if (!responsable) {
            alert('Por favor, seleccione un responsable');
            return;
        }

        try {
            const signatureDataUrl = signatureRef.current.toDataURL();
            
            // Convert base64 to Blob for upload
            const res = await fetch(signatureDataUrl);
            const blob = await res.blob();
            const file = new File([blob], `signature_${currentReportId}.png`, { type: "image/png" });

            const fileName = generateStorageFileName();
            const filePath = `firmas_digitales/${fileName}`;

            // 1. Upload to Storage with compression
            try {
                const compressedBlob = await compressImage(file, 800, 0.6);
                const { error: uploadError } = await supabase.storage
                    .from('evidencias')
                    .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });

                if (uploadError) throw uploadError;

                // 2. Get Public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('evidencias')
                    .getPublicUrl(filePath);
                
                // 3. Save URL to Database
                const { error } = await supabase
                    .from('mermas_reportes')
                    .update({ 
                        firma_digital: publicUrl,
                        responsable_firma: responsable
                    })
                    .eq('id', currentReportId);

                if (error) throw error;
            } catch (compressErr) {
                console.error("Error compressing signature:", compressErr);
                // Fallback to original
                const { error: uploadError } = await supabase.storage
                    .from('evidencias')
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                // 2. Get Public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('evidencias')
                    .getPublicUrl(filePath);
                
                // 3. Save URL to Database
                const { error } = await supabase
                    .from('mermas_reportes')
                    .update({ 
                        firma_digital: publicUrl,
                        responsable_firma: responsable
                    })
                    .eq('id', currentReportId);

                if (error) throw error;
            }

            setIsSignatureModalOpen(false);
            fetchData();
            alert('Firma guardada con éxito en la nube');
        } catch (err) {
            console.error('Error saving signature:', err);
            alert('Error al procesar la firma');
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-sm">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className="bg-blue-100 p-2 rounded-lg">
                        <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <h1 className="text-lg font-black text-gray-800 uppercase tracking-tight">Reportes de Mermas</h1>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button 
                        onClick={() => setView('PENDING')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${view === 'PENDING' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        PENDIENTES
                    </button>
                    <button 
                        onClick={() => setView('REPORTS')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${view === 'REPORTS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        HISTORIAL
                    </button>
                    <button 
                        onClick={() => setView('ALL_ITEMS')}
                        className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${view === 'ALL_ITEMS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        TODOS LOS ITEMS
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 custom-scrollbar">
                {view === 'PENDING' && (
                    <div className="max-w-6xl mx-auto space-y-6">
                        {/* Filters */}
                        <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                            <div className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest">
                                <Filter className="w-4 h-4" /> Filtros de Búsqueda
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400">Desde</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-2 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                                        value={filterDateStart}
                                        onChange={e => setFilterDateStart(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400">Hasta</label>
                                    <input 
                                        type="date" 
                                        className="w-full p-2 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                                        value={filterDateEnd}
                                        onChange={e => setFilterDateEnd(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400">Procedencia</label>
                                    <select 
                                        className="w-full p-2 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                                        value={filterProcedencia}
                                        onChange={e => setFilterProcedencia(e.target.value)}
                                    >
                                        <option value="">TODAS</option>
                                        {PROCEDENCIA_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400">Defecto</label>
                                    <select 
                                        className="w-full p-2 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                                        value={filterDefecto}
                                        onChange={e => setFilterDefecto(e.target.value)}
                                    >
                                        <option value="">TODOS</option>
                                        {DEFECTO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400">Destino</label>
                                    <select 
                                        className="w-full p-2 bg-gray-50 border border-gray-100 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                                        value={filterDestino}
                                        onChange={e => setFilterDestino(e.target.value)}
                                    >
                                        <option value="">TODOS</option>
                                        {DESTINO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={toggleSelectAll}
                                    className="text-xs font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest flex items-center gap-2"
                                >
                                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${selectedIds.size === filteredMermas.length && filteredMermas.length > 0 ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                                        {selectedIds.size === filteredMermas.length && filteredMermas.length > 0 && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    Seleccionar Todo ({selectedIds.size})
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <button 
                                    onClick={handleExportExcelOnly}
                                    disabled={selectedIds.size === 0}
                                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-green-600/20"
                                >
                                    <FileSpreadsheet className="w-4 h-4" /> EXCEL
                                </button>
                                <button 
                                    onClick={handleProcessMermas}
                                    disabled={selectedIds.size === 0}
                                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-blue-600/20"
                                >
                                    <CheckCircle className="w-4 h-4" /> PROCESAR
                                </button>
                            </div>
                        </div>

                        {/* List */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="p-4 w-10"></th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Foto</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Cant.</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Vencimiento</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Categoría</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Registro</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} className="p-12 text-center">
                                                <div className="w-8 h-8 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
                                                <p className="text-sm font-bold text-gray-400">Cargando mermas...</p>
                                            </td>
                                        </tr>
                                    ) : paginatedPendingMermas.length > 0 ? paginatedPendingMermas.map(m => (
                                        <tr 
                                            key={m.id} 
                                            className={`border-b border-gray-50 hover:bg-blue-50/50 transition-colors cursor-pointer ${selectedIds.has(m.id) ? 'bg-blue-50' : ''}`}
                                            onClick={() => toggleSelect(m.id)}
                                        >
                                            <td className="p-4">
                                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${selectedIds.has(m.id) ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                                                    {selectedIds.has(m.id) && <Check className="w-3.5 h-3.5 text-white" />}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                {m.fotos && m.fotos.length > 0 ? (
                                                    <div 
                                                        className="w-12 h-12 rounded-lg overflow-hidden border border-gray-100 cursor-zoom-in hover:opacity-80 transition-opacity"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedImage(m.fotos[0]);
                                                        }}
                                                    >
                                                        <img src={m.fotos[0]} alt="Merma" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                    </div>
                                                ) : (
                                                    <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100">
                                                        <Camera className="w-5 h-5 text-gray-300" />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <div className="font-black text-gray-800 text-sm">{m.nombre}</div>
                                                <div className="text-[10px] font-mono text-gray-400">{m.codigo}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className="bg-red-100 text-red-700 px-2 py-1 rounded-lg text-xs font-black">
                                                    {m.cantidad} <span className="text-[9px] opacity-60 ml-0.5">{m.unidad_medida || 'UND'}</span>
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-xs font-black text-red-600 bg-red-50 px-2 py-1 rounded-lg inline-block">
                                                    {m.fecha_vencimiento ? new Date(m.fecha_vencimiento).toLocaleDateString() : 'N/A'}
                                                </div>
                                            </td>
                                            <td className="p-4 space-y-1">
                                                <div className="flex gap-1 flex-wrap">
                                                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase">{m.procedencia}</span>
                                                    <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">{m.defecto}</span>
                                                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] font-black uppercase">{m.destino}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-xs font-bold text-gray-500">{new Date(m.fecha_registro).toLocaleDateString()}</div>
                                                <div className="text-[10px] text-gray-400">{m.usuario_registro}</div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={7} className="p-12 text-center text-gray-400 italic text-sm">
                                                No hay mermas pendientes con los filtros aplicados
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Pending */}
                        {filteredMermas.length > itemsPerPage && (
                            <div className="flex items-center justify-center gap-2 mt-4">
                                <button 
                                    disabled={currentPagePending === 1}
                                    onClick={() => setCurrentPagePending(prev => prev - 1)}
                                    className="p-2 rounded-lg bg-white border border-gray-200 disabled:opacity-50"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs font-black text-gray-500">PÁGINA {currentPagePending} DE {Math.ceil(filteredMermas.length / itemsPerPage)}</span>
                                <button 
                                    disabled={currentPagePending === Math.ceil(filteredMermas.length / itemsPerPage)}
                                    onClick={() => setCurrentPagePending(prev => prev + 1)}
                                    className="p-2 rounded-lg bg-white border border-gray-200 disabled:opacity-50"
                                >
                                    <ArrowLeft className="w-4 h-4 rotate-180" />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {view === 'REPORTS' && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        {/* Reports History */}
                        <div className="grid grid-cols-1 gap-4">
                            {loading ? (
                                <div className="p-12 text-center">
                                    <div className="w-8 h-8 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
                                    <p className="text-sm font-bold text-gray-400">Cargando historial...</p>
                                </div>
                            ) : reports.length > 0 ? reports.map(report => (
                                <div key={report.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 group hover:border-blue-200 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className="bg-blue-50 p-3 rounded-xl">
                                            <FileText className="w-6 h-6 text-blue-600" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-black text-gray-800 uppercase tracking-tight">{report.numero_reporte || `Reporte #${report.id.substring(0, 8)}`}</h3>
                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${report.foto_firmada ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {report.items_count} ITEMS
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-xs font-bold text-gray-400">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {new Date(report.fecha_creacion).toLocaleString()}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <User className="w-3.5 h-3.5" />
                                                    {report.usuario_creacion}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-wrap items-center gap-3">
                                        <button 
                                            onClick={() => handleViewReportItems(report.id, report.numero_reporte || '')}
                                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all"
                                        >
                                            <Eye className="w-4 h-4" /> Ver Items
                                        </button>

                                        <button 
                                            onClick={() => handleDownloadReportExcel(report.id, report.numero_reporte || '')}
                                            className="bg-green-100 hover:bg-green-200 text-green-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all border border-green-200"
                                        >
                                            <FileSpreadsheet className="w-4 h-4" /> Excel
                                        </button>

                                        {report.foto_firmada ? (
                                            <a 
                                                href={report.foto_firmada} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className="bg-green-50 text-green-700 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 border border-green-100 hover:bg-green-100 transition-all"
                                            >
                                                <CheckCircle className="w-4 h-4" /> Ver Firmado
                                            </a>
                                        ) : (
                                            <label className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 cursor-pointer transition-all shadow-lg shadow-blue-600/20">
                                                <Camera className="w-4 h-4" /> Subir Firmado
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    capture="environment"
                                                    className="hidden" 
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (file) handleUploadSignedReport(report.id, file);
                                                    }}
                                                />
                                            </label>
                                        )}

                                        {!report.firma_digital ? (
                                            <button 
                                                onClick={() => handleOpenSignatureModal(report.id)}
                                                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-purple-600/20"
                                            >
                                                <Pencil className="w-4 h-4" /> Firmar
                                            </button>
                                        ) : (
                                            <div className="flex flex-col items-center p-2 bg-purple-50 rounded-xl border border-purple-100">
                                                <span className="text-[8px] font-black text-purple-600 uppercase mb-1">Firmado por: {report.responsable_firma}</span>
                                                <img src={report.firma_digital} alt="Firma" className="h-8" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )) : (
                                <div className="p-12 text-center text-gray-400 italic text-sm">
                                    No se han generado reportes aún
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {view === 'ALL_ITEMS' && (
                    <div className="max-w-6xl mx-auto space-y-6">
                        {/* Search & Actions */}
                        <div className="flex flex-col md:flex-row gap-4 items-center">
                            <div className="relative flex-1">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                <input 
                                    type="text"
                                    placeholder="Buscar por item, producto o número de reporte..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm font-bold text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            <button 
                                onClick={() => {
                                    const worksheet = XLSX.utils.json_to_sheet(filteredAllItems.map(m => ({
                                        'Reporte #': m.mermas_reportes?.numero_reporte || 'SIN REPORTE',
                                        Código: m.codigo,
                                        Producto: m.nombre,
                                        Cantidad: m.cantidad,
                                        UM: m.unidad_medida || 'UND',
                                        Procedencia: m.procedencia,
                                        Defecto: m.defecto,
                                        Destino: m.destino,
                                        Vencimiento: m.fecha_vencimiento,
                                        'Fecha Registro': new Date(m.fecha_registro).toLocaleString(),
                                        RegistradoPor: m.usuario_registro,
                                        Estado: m.revisado_calidad ? 'REVISADO' : 'PENDIENTE'
                                    })));
                                    const workbook = XLSX.utils.book_new();
                                    XLSX.utils.book_append_sheet(workbook, worksheet, "Todos los Items");
                                    XLSX.writeFile(workbook, `Mermas_Todos_los_Items_${new Date().toISOString().split('T')[0]}.xlsx`);
                                }}
                                className="bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-green-600/20 whitespace-nowrap"
                            >
                                <FileSpreadsheet className="w-5 h-5" /> Exportar Excel
                            </button>
                        </div>

                        {/* List */}
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Reporte #</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Foto</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Cant.</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Vencimiento</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Defecto/Destino</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Estado</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Registro</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan={8} className="p-12 text-center">
                                                <div className="w-8 h-8 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
                                            </td>
                                        </tr>
                                    ) : paginatedAllItems.length > 0 ? paginatedAllItems.map(m => (
                                        <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                            <td className="p-4">
                                                <span className="font-black text-blue-600 text-xs uppercase">
                                                    {m.mermas_reportes?.numero_reporte || 'SIN REPORTE'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                {m.fotos && m.fotos.length > 0 ? (
                                                    <div 
                                                        className="w-10 h-10 rounded-lg overflow-hidden border border-gray-100 cursor-zoom-in hover:opacity-80 transition-opacity"
                                                        onClick={() => setSelectedImage(m.fotos[0])}
                                                    >
                                                        <img src={m.fotos[0]} alt="Merma" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                    </div>
                                                ) : (
                                                    <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100">
                                                        <Camera className="w-4 h-4 text-gray-300" />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <div className="font-black text-gray-800 text-sm">{m.nombre}</div>
                                                <div className="text-[10px] font-mono text-gray-400">{m.codigo}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded-lg text-xs font-black">
                                                    {m.cantidad} <span className="text-[9px] opacity-60 ml-0.5">{m.unidad_medida || 'UND'}</span>
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-xs font-black text-red-600">
                                                    {m.fecha_vencimiento ? new Date(m.fecha_vencimiento).toLocaleDateString() : 'N/A'}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-col gap-1">
                                                    <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-[9px] font-black uppercase text-center">{m.defecto}</span>
                                                    <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[9px] font-black uppercase text-center">{m.destino}</span>
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${m.revisado_calidad ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                                    {m.revisado_calidad ? 'REVISADO' : 'PENDIENTE'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-xs font-bold text-gray-500">{new Date(m.fecha_registro).toLocaleDateString()}</div>
                                                <div className="text-[10px] text-gray-400">{m.usuario_registro}</div>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={8} className="p-12 text-center text-gray-400 italic text-sm">
                                                No se encontraron resultados
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination All Items */}
                        {filteredAllItems.length > itemsPerPage && (
                            <div className="flex items-center justify-center gap-2 mt-4">
                                <button 
                                    disabled={currentPageAllItems === 1}
                                    onClick={() => setCurrentPageAllItems(prev => prev - 1)}
                                    className="p-2 rounded-lg bg-white border border-gray-200 disabled:opacity-50"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs font-black text-gray-500">PÁGINA {currentPageAllItems} DE {Math.ceil(filteredAllItems.length / itemsPerPage)}</span>
                                <button 
                                    disabled={currentPageAllItems === Math.ceil(filteredAllItems.length / itemsPerPage)}
                                    onClick={() => setCurrentPageAllItems(prev => prev + 1)}
                                    className="p-2 rounded-lg bg-white border border-gray-200 disabled:opacity-50"
                                >
                                    <ArrowLeft className="w-4 h-4 rotate-180" />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Items Modal */}
            {isItemsModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-100 p-2 rounded-xl">
                                    <FileText className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Items del Reporte</h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{selectedReportNumber}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => {
                                        const worksheet = XLSX.utils.json_to_sheet(selectedReportItems.map(m => ({
                                            Código: m.codigo,
                                            Producto: m.nombre,
                                            Cantidad: m.cantidad,
                                            UM: m.unidad_medida || 'UND',
                                            Procedencia: m.procedencia,
                                            Defecto: m.defecto,
                                            Destino: m.destino,
                                            Vencimiento: m.fecha_vencimiento,
                                            'Fecha Registro': new Date(m.fecha_registro).toLocaleString(),
                                            RegistradoPor: m.usuario_registro
                                        })));
                                        const workbook = XLSX.utils.book_new();
                                        XLSX.utils.book_append_sheet(workbook, worksheet, "Mermas");
                                        XLSX.writeFile(workbook, `${selectedReportNumber || 'Reporte'}.xlsx`);
                                    }}
                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg shadow-green-600/20"
                                >
                                    <FileSpreadsheet className="w-4 h-4" /> Descargar Excel
                                </button>
                                <button onClick={() => setIsItemsModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                    <X className="w-6 h-6 text-gray-400" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100">
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Foto</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Producto</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Cant.</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Vencimiento</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Procedencia</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Defecto</th>
                                        <th className="p-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Destino</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {selectedReportItems.map(m => (
                                        <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4">
                                                {m.fotos && m.fotos.length > 0 ? (
                                                    <div 
                                                        className="w-12 h-12 rounded-lg overflow-hidden border border-gray-100 cursor-zoom-in hover:opacity-80 transition-opacity"
                                                        onClick={() => setSelectedImage(m.fotos[0])}
                                                    >
                                                        <img src={m.fotos[0]} alt="Merma" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                                    </div>
                                                ) : (
                                                    <div className="w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center border border-gray-100">
                                                        <Camera className="w-5 h-5 text-gray-300" />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <div className="font-black text-gray-800 text-sm">{m.nombre}</div>
                                                <div className="text-[10px] font-mono text-gray-400">{m.codigo}</div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="font-black text-gray-900">{m.cantidad} <span className="text-[9px] text-gray-400 ml-0.5">{m.unidad_medida || 'UND'}</span></span>
                                            </td>
                                            <td className="p-4">
                                                <div className="text-xs font-black text-red-600 bg-red-50 px-2 py-1 rounded-lg inline-block">
                                                    {m.fecha_vencimiento ? new Date(m.fecha_vencimiento).toLocaleDateString() : 'N/A'}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-[10px] font-bold uppercase">{m.procedencia}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-[10px] font-black uppercase">{m.defecto}</span>
                                            </td>
                                            <td className="p-4">
                                                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-black uppercase">{m.destino}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Signature Modal */}
            {isSignatureModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                            <div className="flex items-center gap-3">
                                <div className="bg-purple-100 p-2 rounded-xl">
                                    <Pencil className="w-5 h-5 text-purple-600" />
                                </div>
                                <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Firma Digital</h3>
                            </div>
                            <button onClick={() => setIsSignatureModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="w-6 h-6 text-gray-400" />
                            </button>
                        </div>
                        <div className="p-8 space-y-8">
                            <div className="space-y-3">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Responsable de Firma</label>
                                <select 
                                    value={responsable}
                                    onChange={e => setResponsable(e.target.value)}
                                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-sm outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                                >
                                    <option value="">SELECCIONE RESPONSABLE</option>
                                    <option value="YAMMER">YAMMER</option>
                                    <option value="LUCY">LUCY</option>
                                    <option value="SAORI">SAORI</option>
                                    <option value="CALIDAD">CALIDAD</option>
                                </select>
                            </div>

                            <div className="space-y-3">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Firma Aquí</label>
                                <div className="border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 overflow-hidden">
                                    <SignatureCanvas 
                                        ref={signatureRef}
                                        penColor="black"
                                        canvasProps={{
                                            className: "w-full h-48 cursor-crosshair"
                                        }}
                                    />
                                </div>
                                <button 
                                    onClick={() => signatureRef.current?.clear()}
                                    className="text-[10px] font-black text-red-600 uppercase tracking-widest hover:underline"
                                >
                                    Limpiar Firma
                                </button>
                            </div>

                            <button
                                onClick={handleSaveSignature}
                                className="w-full py-5 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-purple-600/20 hover:bg-purple-700 transition-all active:scale-95"
                            >
                                GUARDAR FIRMA
                            </button>
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
                            <X className="w-8 h-8" />
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

export default MermaReports;
