
import React, { useState, useEffect, useMemo } from 'react';
import { StocktakeRecord, ReverseLogisticsItem, Sample, MermaRecord } from '../types';
import { supabase } from '../supabaseClient';
import { 
    Monitor as MonitorIcon, 
    Search, 
    FileSpreadsheet, 
    RefreshCw, 
    Calendar, 
    User, 
    Clock, 
    Box, 
    Camera, 
    XCircle,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Truck,
    Beaker,
    AlertTriangle
} from './Icons';
import { formatDate } from '../utils';

declare var XLSX: any;

const Monitor: React.FC = () => {
    const [currentUser] = useState(() => {
        try {
            const saved = localStorage.getItem('smartwms_user');
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            return null;
        }
    });
    const [activeTab, setActiveTab] = useState<'CONTEOS' | 'RETORNOS' | 'MUESTRAS' | 'RECEPCIONES' | 'MERMAS' | 'ALERTAS'>('CONTEOS');
    const [records, setRecords] = useState<StocktakeRecord[]>([]);
    const [returns, setReturns] = useState<ReverseLogisticsItem[]>([]);
    const [samples, setSamples] = useState<Sample[]>([]);
    const [receptions, setReceptions] = useState<any[]>([]);
    const [mermas, setMermas] = useState<MermaRecord[]>([]);
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedPhotos, setSelectedPhotos] = useState<string[] | null>(null);
    const [maximizedImage, setMaximizedImage] = useState<string | null>(null);
    
    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (activeTab === 'CONTEOS') fetchRecords();
            if (activeTab === 'RETORNOS') fetchReturns();
            if (activeTab === 'MUESTRAS') fetchSamples();
            if (activeTab === 'RECEPCIONES') fetchReceptions();
            if (activeTab === 'MERMAS') fetchMermas();
            if (activeTab === 'ALERTAS') fetchAlerts();
        }, 400);

        return () => clearTimeout(delayDebounceFn);
    }, [activeTab, searchTerm]);

    // Real-time synchronization for all dynamic tables in Monitor
    useEffect(() => {
        const channel = supabase
            .channel('monitor_realtime_updates')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'conteo_inventario' },
                () => { if (activeTab === 'CONTEOS') fetchRecords(); }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'logistica_inversa' },
                () => { if (activeTab === 'RETORNOS') fetchReturns(); }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'muestras' },
                () => { if (activeTab === 'MUESTRAS') fetchSamples(); }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'recepcion_productos' },
                () => { if (activeTab === 'RECEPCIONES') fetchReceptions(); }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'mermas' },
                () => { if (activeTab === 'MERMAS') fetchMermas(); }
            )
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'alertas_recepcion' },
                () => { if (activeTab === 'ALERTAS') fetchAlerts(); }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [activeTab]);

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('alertas_recepcion')
                .select('*');
            
            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            const { data, error } = await query.order('fecha_alerta', { ascending: false });
            
            if (error) throw error;
            setAlerts(data || []);
        } catch (err: any) {
            console.error('Error fetching alerts:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchMermas = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('mermas')
                .select('*');

            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            if (searchTerm.trim()) {
                const term = `%${searchTerm.trim()}%`;
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                const oneYearAgoStr = oneYearAgo.toISOString();

                query = query
                    .gte('fecha_registro', oneYearAgoStr)
                    .or(`codigo.ilike.${term},nombre.ilike.${term},usuario_registro.ilike.${term},procedencia.ilike.${term},defecto.ilike.${term},destino.ilike.${term}`);
            }

            const { data, error } = await query.order('fecha_registro', { ascending: false });
            
            if (error) throw error;
            setMermas(data || []);
        } catch (err: any) {
            console.error('Error fetching mermas for monitor:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchReceptions = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('recepcion_productos')
                .select('*')
                .neq('estado', 'PENDIENTE')
                .neq('estado', 'RECHAZADO');

            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            if (searchTerm.trim()) {
                const term = `%${searchTerm.trim()}%`;
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                const oneYearAgoStr = oneYearAgo.toISOString();

                query = query
                    .gte('fecha_registro', oneYearAgoStr)
                    .or(`codigo.ilike.${term},nombre.ilike.${term},usuario_registro.ilike.${term}`);
            }

            const { data, error } = await query.order('fecha_registro', { ascending: false });
            
            if (error) throw error;
            setReceptions(data || []);
        } catch (err: any) {
            console.error('Error fetching receptions:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchRecords = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('conteo_inventario')
                .select('*');

            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            if (searchTerm.trim()) {
                const term = `%${searchTerm.trim()}%`;
                const oneYearAgo = new Date();
                oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                const oneYearAgoStr = oneYearAgo.toISOString();

                query = query
                    .gte('fecha_registro', oneYearAgoStr)
                    .or(`codigo.ilike.${term},nombre.ilike.${term},usuario_registro.ilike.${term}`);
            }

            const { data, error } = await query.order('fecha_registro', { ascending: false });
            
            if (error) throw error;
            setRecords(data || []);
        } catch (err: any) {
            console.error('Error fetching records for monitor:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchReturns = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('logistica_inversa')
                .select('*');

            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            const { data, error } = await query.order('registrado_at', { ascending: false });
            
            if (error) throw error;
            
            const mapped = (data || []).map(d => ({
                id: d.id,
                plate: d.placa_vehiculo,
                invoice: d.factura_guia,
                returnType: d.tipo_devolucion,
                defect: d.defecto,
                expirationDate: d.fecha_vencimiento_producto,
                fotos: d.fotos || [],
                registeredAt: d.registrado_at,
                productCode: d.codigo_producto,
                productName: d.nombre_producto,
                registeredBy: d.usuario_registro
            }));
            
            setReturns(mapped as any);
        } catch (err: any) {
            console.error('Error fetching returns:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchSamples = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('muestras')
                .select('*');

            const sedeId = currentUser?.sede_id;
            if (sedeId) {
                query = query.eq('sede_id', sedeId);
            }

            const { data, error } = await query.order('fecha_recepcion', { ascending: false });
            
            if (error) throw error;
            
            const mapped = (data || []).map(d => ({
                id: d.id,
                correlativo: d.correlativo,
                internalCode: d.codigo_interno,
                ean: d.ean,
                name: d.nombre_producto,
                provider: d.proveedor,
                unitOfMeasure: d.unidad_medida || 'UND',
                quantity: d.cantidad,
                documentType: d.tipo_documento || 'GUIA',
                documentNumber: d.numero_documento || '',
                expirationDate: d.fecha_vencimiento,
                receptionDate: d.fecha_recepcion,
                receivedBy: d.recibido_por,
                requestedArea: d.area_solicitada || '',
                fotos: d.fotos || [],
                deliveredTo: d.entregado_a || '',
                deliveryDate: d.fecha_entrega,
                status: d.status || 'Recibido'
            }));
            
            setSamples(mapped as any);
        } catch (err: any) {
            console.error('Error fetching samples:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredRecords = useMemo(() => {
        if (activeTab === 'CONTEOS') {
            return records.filter(record => {
                const matchesSearch = 
                    record.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    record.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    record.usuario_registro.toLowerCase().includes(searchTerm.toLowerCase());
                
                let matchesDate = true;
                if (startDate) {
                    const start = new Date(startDate);
                    const itemDate = new Date(record.fecha_registro);
                    matchesDate = matchesDate && itemDate >= start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && new Date(record.fecha_registro) <= end;
                }
                return matchesSearch && matchesDate;
            });
        } else if (activeTab === 'RETORNOS') {
            return returns.filter(item => {
                const matchesSearch = 
                    (item.productName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                    (item.productCode || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                    (item.plate || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (item.invoice || '').toLowerCase().includes(searchTerm.toLowerCase());
                
                let matchesDate = true;
                if (startDate) {
                    const start = new Date(startDate);
                    const itemDate = new Date(item.registeredAt);
                    matchesDate = matchesDate && itemDate >= start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && new Date(item.registeredAt) <= end;
                }
                return matchesSearch && matchesDate;
            });
        } else if (activeTab === 'MUESTRAS') {
            return samples.filter(item => {
                const matchesSearch = 
                    item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    item.ean.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    item.internalCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    item.documentNumber.toLowerCase().includes(searchTerm.toLowerCase());
                
                let matchesDate = true;
                if (startDate) {
                    const start = new Date(startDate);
                    const itemDate = new Date(item.receptionDate);
                    matchesDate = matchesDate && itemDate >= start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && new Date(item.receptionDate) <= end;
                }
                return matchesSearch && matchesDate;
            });
        } else if (activeTab === 'MERMAS') {
            return mermas.filter(item => {
                const matchesSearch = 
                    item.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    item.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    item.usuario_registro.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (item.procedencia || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (item.defecto || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (item.destino || '').toLowerCase().includes(searchTerm.toLowerCase());
                
                let matchesDate = true;
                if (startDate) {
                    const start = new Date(startDate);
                    const itemDate = new Date(item.fecha_registro);
                    matchesDate = matchesDate && itemDate >= start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && new Date(item.fecha_registro) <= end;
                }
                return matchesSearch && matchesDate;
            });
        } else if (activeTab === 'ALERTAS') {
            return alerts.filter(item => {
                const matchesSearch = 
                    item.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    item.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    (item.proveedor || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (item.usuario_registro || '').toLowerCase().includes(searchTerm.toLowerCase());
                
                let matchesDate = true;
                if (startDate) {
                    const start = new Date(startDate);
                    const itemDate = new Date(item.fecha_alerta);
                    matchesDate = matchesDate && itemDate >= start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && new Date(item.fecha_alerta) <= end;
                }
                return matchesSearch && matchesDate;
            });
        } else {
            return receptions.filter(item => {
                const matchesSearch = 
                    item.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    item.codigo.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    item.usuario_registro.toLowerCase().includes(searchTerm.toLowerCase());
                
                let matchesDate = true;
                if (startDate) {
                    const start = new Date(startDate);
                    const itemDate = new Date(item.fecha_registro);
                    matchesDate = matchesDate && itemDate >= start;
                }
                if (endDate) {
                    const end = new Date(endDate);
                    end.setHours(23, 59, 59, 999);
                    matchesDate = matchesDate && new Date(item.fecha_registro) <= end;
                }
                return matchesSearch && matchesDate;
            });
        }
    }, [records, returns, samples, receptions, searchTerm, startDate, endDate, activeTab]);

    const paginatedRecords = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredRecords.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredRecords, currentPage]);

    const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);

    const handleExportExcel = () => {
        if (typeof XLSX === 'undefined') {
            alert('Librería Excel no cargada');
            return;
        }

        if (activeTab === 'RECEPCIONES') {
            handleExportReceptionExcel();
            return;
        }

        let dataToExport: any[] = [];
        let sheetName = "";

        if (activeTab === 'CONTEOS') {
            sheetName = "Inventario Contado";
            dataToExport = filteredRecords.map(r => ({
                'FECHA REGISTRO': new Date((r as StocktakeRecord).fecha_registro).toLocaleDateString(),
                'HORA': new Date((r as StocktakeRecord).fecha_registro).toLocaleTimeString(),
                'ZONA': (r as StocktakeRecord).zona || 'N/A',
                'CÓDIGO': (r as StocktakeRecord).codigo,
                'PRODUCTO': (r as StocktakeRecord).nombre,
                'CANTIDAD': Number((r as StocktakeRecord).cantidad).toFixed(2),
                'VENCIMIENTO': (r as StocktakeRecord).fecha_vencimiento || 'N/A',
                'USUARIO': (r as StocktakeRecord).usuario_registro,
                'ACCIÓN': (r as StocktakeRecord).accion || 'SIN ACCIÓN',
                'CANT. ACCIÓN': Number((r as StocktakeRecord).cantidad_accion || 0).toFixed(2),
                'FECHA ACCIÓN': (r as StocktakeRecord).fecha_accion ? new Date((r as StocktakeRecord).fecha_accion!).toLocaleDateString() : 'N/A'
            }));
        } else if (activeTab === 'RETORNOS') {
            sheetName = "Historial de Retornos";
            dataToExport = filteredRecords.map(r => ({
                'FECHA REGISTRO': new Date((r as any).registeredAt).toLocaleDateString(),
                'HORA': new Date((r as any).registeredAt).toLocaleTimeString(),
                'PLACA': (r as any).plate,
                'FACTURA/GUIA': (r as any).invoice,
                'TIPO': (r as any).returnType,
                'DEFECTO': (r as any).defect,
                'CÓDIGO': (r as any).productCode,
                'PRODUCTO': (r as any).productName,
                'VENCIMIENTO': (r as any).expirationDate,
                'USUARIO': (r as any).registeredBy
            }));
        } else if (activeTab === 'MUESTRAS') {
            sheetName = "Muestras Registradas";
            dataToExport = filteredRecords.map(r => ({
                'FECHA RECEPCION': new Date((r as any).receptionDate).toLocaleDateString(),
                'HORA': new Date((r as any).receptionDate).toLocaleTimeString(),
                'CORRELATIVO': (r as any).correlativo,
                'COD. INTERNO': (r as any).internalCode,
                'EAN': (r as any).ean,
                'PRODUCTO': (r as any).name,
                'PROVEEDOR': (r as any).provider,
                'CANTIDAD': Number((r as any).quantity).toFixed(2),
                'DOCUMENTO': `${(r as any).documentType} ${(r as any).documentNumber}`,
                'AREA SOLICITADA': (r as any).requestedArea,
                'ESTADO': (r as any).status,
                'RECIBIDO POR': (r as any).receivedBy
            }));
        } else if (activeTab === 'MERMAS') {
            sheetName = "Historial de Mermas";
            dataToExport = filteredRecords.map(r => ({
                'FECHA REGISTRO': new Date((r as any).fecha_registro).toLocaleDateString(),
                'HORA': new Date((r as any).fecha_registro).toLocaleTimeString(),
                'CÓDIGO': (r as any).codigo,
                'PRODUCTO': (r as any).nombre,
                'CANTIDAD': Number((r as any).cantidad).toFixed(2),
                'UM': (r as any).unidad_medida || 'UND',
                'VENCIMIENTO': (r as any).fecha_vencimiento || 'N/A',
                'PROCEDENCIA': (r as any).procedencia,
                'DEFECTO': (r as any).defecto,
                'DESTINO': (r as any).destino,
                'USUARIO': (r as any).usuario_registro
            }));
        }

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        
        // Auto-size columns
        const colWidths = Object.keys(dataToExport[0] || {}).map(key => ({ wch: Math.max(key.length, 15) }));
        ws['!cols'] = colWidths;

        XLSX.writeFile(wb, `Monitor_${sheetName.replace(/ /g, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    const handleExportReceptionExcel = () => {
        // @ts-ignore
        const XLSXStyle = window.XLSXStyle || window.XLSX;
        if (!XLSXStyle) return;

        const wb = XLSXStyle.utils.book_new();
        
        // Header rows based on the provided format
        const headerData = [
            ["INSPECCION EN RECEPCION DE PRODUCTO TERMINADO", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
            ["Código: ICO-F-CAL-11", "", "", "Versión: 03", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Fecha: Agosto 2025", "", ""],
            ["Año", "Condiciones del transporte", "", "Personal de transporte", "", "Ubicación en almacén", "", "", "", "Datos del producto", "", "", "", "C. físico químicas", "", "C. organolépticas", "", "", "Envasado", "", "", "Conclusiones", "Responsable"],
            ["Fecha de recepción", "Proveedor", "Nº de guía / nº de factura", "Temperatura (ºC)", "Condición higiénica", "Indumentaria limpia", "Higiene del personal", "Secos", "Cámara 1", "Cámara 2", "Cámara 3", "Producto", "Fecha y lote", "Peso total", "Temperatura del producto", "pH*", "Aspecto físico", "Color", "Olor*", "Hermeticidad", "Libre de impurezas", "Buen estado del envases - datos del rotulado", "", "", ""]
        ];

        const rows = filteredRecords.map(r => [
            new Date(r.fecha_registro).toLocaleDateString(), // Fecha de recepción
            r.proveedor || 'N/A', // Proveedor (placeholder if not in DB)
            r.guia_factura || 'N/A', // Nº de guía
            r.temperatura_transporte || 'N/A', // Temperatura transporte
            r.condicion_higienica || 'C', // Condición higiénica
            r.indumentaria_limpia || 'C', // Indumentaria limpia
            r.higiene_personal || 'C', // Higiene del personal
            r.ubicacion === 'SECO' ? 'X' : '', // Secos
            r.ubicacion === 'CAMARA 1' ? 'X' : '', // Cámara 1
            r.ubicacion === 'CAMARA 2' ? 'X' : '', // Cámara 2
            r.ubicacion === 'CAMARA 3' ? 'X' : '', // Cámara 3
            r.nombre, // Producto
            `${r.fecha_vencimiento} / ${r.lote || 'N/A'}`, // Fecha y lote
            r.cantidad, // Peso total
            r.temperatura || 'N/A', // Temperatura del producto
            r.ph || 'N/A', // pH
            r.aspecto_fisico || 'C', // Aspecto físico
            r.color || 'C', // Color
            r.olor || 'C', // Olor
            r.hermeticidad || 'C', // Hermeticidad
            r.libre_impurezas || 'C', // Libre de impurezas
            r.estado_envase || 'C', // Buen estado del envase
            r.conclusiones || 'ACEPTADO', // Conclusiones
            r.usuario_registro // Responsable
        ]);

        const fullData = [...headerData, ...rows];

        // Footer notes
        fullData.push([]);
        fullData.push(["Nota: (*) El pH y olor se evaluará solo para productos cárnicos y lácteos."]);
        fullData.push(["CRITERIOS DE EVALUACION:"]);
        fullData.push(["C: Cumple", "NC: No cumple", "NA: No aplica"]);

        const ws = XLSXStyle.utils.aoa_to_sheet(fullData);

        // Merges
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 24 } }, // Title
            { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }, // Codigo
            { s: { r: 1, c: 3 }, e: { r: 1, c: 21 } }, // Version
            { s: { r: 1, c: 22 }, e: { r: 1, c: 24 } }, // Fecha
            { s: { r: 2, c: 1 }, e: { r: 2, c: 2 } }, // Condiciones transporte
            { s: { r: 2, c: 3 }, e: { r: 2, c: 4 } }, // Personal transporte
            { s: { r: 2, c: 5 }, e: { r: 2, c: 8 } }, // Ubicacion almacen
            { s: { r: 2, c: 9 }, e: { r: 2, c: 12 } }, // Datos producto
            { s: { r: 2, c: 13 }, e: { r: 2, c: 14 } }, // C. fisico quimicas
            { s: { r: 2, c: 15 }, e: { r: 2, c: 17 } }, // C. organolepticas
            { s: { r: 2, c: 18 }, e: { r: 2, c: 20 } }, // Envasado
        ];

        // Styling
        const headerStyle = {
            font: { bold: true, sz: 10 },
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: {
                top: { style: "thin" },
                bottom: { style: "thin" },
                left: { style: "thin" },
                right: { style: "thin" }
            },
            fill: { fgColor: { rgb: "E0E0E0" } }
        };

        const titleStyle = {
            font: { bold: true, sz: 14 },
            alignment: { horizontal: "center", vertical: "center" },
            fill: { fgColor: { rgb: "CCCCCC" } }
        };

        // Apply styles to headers
        for (let c = 0; c <= 24; c++) {
            const cellRef0 = XLSXStyle.utils.encode_cell({ r: 0, c });
            if (ws[cellRef0]) ws[cellRef0].s = titleStyle;
            
            const cellRef2 = XLSXStyle.utils.encode_cell({ r: 2, c });
            if (ws[cellRef2]) ws[cellRef2].s = headerStyle;

            const cellRef3 = XLSXStyle.utils.encode_cell({ r: 3, c });
            if (ws[cellRef3]) ws[cellRef3].s = headerStyle;
        }

        // Column widths
        ws['!cols'] = [
            { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, 
            { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, 
            { wch: 8 }, { wch: 30 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, 
            { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, 
            { wch: 10 }, { wch: 25 }, { wch: 25 }, { wch: 20 }
        ];

        XLSXStyle.utils.book_append_sheet(wb, ws, "Reporte Recepciones");
        XLSXStyle.writeFile(wb, `Reporte_Inspeccion_Recepcion_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    const getZoneColor = (zone?: string) => {
        switch(zone) {
            case 'SECO': return 'bg-orange-100 text-orange-700 border-orange-200';
            case 'REFRIGERADO': return 'bg-cyan-100 text-cyan-700 border-cyan-200';
            case 'CONGELADO': return 'bg-blue-100 text-blue-700 border-blue-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 overflow-hidden">
            {/* Header Section */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-200">
                            <MonitorIcon className="w-6 h-6 text-white"/>
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-800 tracking-tight uppercase">Monitor de Inventario</h2>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Control y Seguimiento de Conteos</p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => {
                                if (activeTab === 'CONTEOS') fetchRecords();
                                if (activeTab === 'RETORNOS') fetchReturns();
                                if (activeTab === 'MUESTRAS') fetchSamples();
                                if (activeTab === 'RECEPCIONES') fetchReceptions();
                                if (activeTab === 'MERMAS') fetchMermas();
                                if (activeTab === 'ALERTAS') fetchAlerts();
                            }}
                            className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Refrescar"
                        >
                            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}/>
                        </button>
                        <button 
                            onClick={() => {
                                if (activeTab === 'RECEPCIONES') {
                                    handleExportReceptionExcel();
                                } else {
                                    handleExportExcel();
                                }
                            }}
                            className="flex items-center gap-2 bg-[#82BD02] hover:bg-[#74a902] text-white px-4 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-[#82BD02]/20 transition-all transform active:scale-95"
                        >
                            <FileSpreadsheet className="w-5 h-5"/> EXCEL
                        </button>
                    </div>
                </div>

                {/* Sub-Tabs Navigation */}
                <div className="mt-6 flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                    <button 
                        onClick={() => { setActiveTab('CONTEOS'); setCurrentPage(1); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'CONTEOS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <ClipboardList className="w-4 h-4"/>
                        HISTORIAL DE CONTEOS
                    </button>
                    <button 
                        onClick={() => { setActiveTab('RETORNOS'); setCurrentPage(1); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'RETORNOS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Truck className="w-4 h-4"/>
                        HISTORIAL DE RETORNOS
                    </button>
                    <button 
                        onClick={() => { setActiveTab('MUESTRAS'); setCurrentPage(1); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'MUESTRAS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Beaker className="w-4 h-4"/>
                        MUESTRAS REGISTRADAS
                    </button>
                    <button 
                        onClick={() => { setActiveTab('RECEPCIONES'); setCurrentPage(1); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'RECEPCIONES' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Truck className="w-4 h-4"/>
                        HISTORIAL DE RECEPCIONES
                    </button>
                    <button 
                        onClick={() => { setActiveTab('MERMAS'); setCurrentPage(1); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'MERMAS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <XCircle className="w-4 h-4"/>
                        HISTORIAL DE MERMAS
                    </button>
                    <button 
                        onClick={() => { setActiveTab('ALERTAS'); setCurrentPage(1); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'ALERTAS' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <AlertTriangle className="w-4 h-4"/>
                        ALERTAS DE RECEPCION
                    </button>
                </div>

                {/* Filters Row */}
                <div className="mt-4 flex flex-col md:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"/>
                        <input 
                            type="text" 
                            placeholder={
                                activeTab === 'CONTEOS' ? "Buscar por producto, código o usuario..." :
                                activeTab === 'RETORNOS' ? "Buscar por producto, placa o factura..." :
                                "Buscar por producto, EAN o documento..."
                            }
                            className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                            value={searchTerm}
                            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                    
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 p-1.5 rounded-xl">
                        <div className="flex items-center gap-2 px-2">
                            <Calendar className="w-4 h-4 text-gray-400"/>
                            <span className="text-[10px] font-black text-gray-400 uppercase">Rango:</span>
                        </div>
                        <input 
                            type="date" 
                            className="bg-transparent border-none outline-none text-xs font-bold text-gray-700 w-32"
                            value={startDate}
                            onChange={e => { setStartDate(e.target.value); setCurrentPage(1); }}
                        />
                        <span className="text-gray-300">-</span>
                        <input 
                            type="date" 
                            className="bg-transparent border-none outline-none text-xs font-bold text-gray-700 w-32"
                            value={endDate}
                            onChange={e => { setEndDate(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                </div>
            </div>

            {/* Content Section */}
            <div className="flex-1 overflow-hidden flex flex-col p-6">
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden flex flex-col flex-1">
                    <div className="overflow-x-auto flex-1 custom-scrollbar">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-gray-50/50 text-gray-400 font-black uppercase text-[10px] tracking-widest sticky top-0 z-10 backdrop-blur-md border-b">
                                {activeTab === 'CONTEOS' && (
                                    <tr>
                                        <th className="px-6 py-4">Fecha / Hora</th>
                                        <th className="px-6 py-4">Zona</th>
                                        <th className="px-6 py-4">Producto</th>
                                        <th className="px-6 py-4 text-center">Cant.</th>
                                        <th className="px-6 py-4">Vencimiento</th>
                                        <th className="px-6 py-4">Usuario</th>
                                        <th className="px-6 py-4">Acción Realizada</th>
                                        <th className="px-6 py-4 text-center">Evidencia</th>
                                    </tr>
                                )}
                                {activeTab === 'RETORNOS' && (
                                    <tr>
                                        <th className="px-6 py-4">Fecha / Hora</th>
                                        <th className="px-6 py-4">Placa</th>
                                        <th className="px-6 py-4">Factura/Guia</th>
                                        <th className="px-6 py-4">Tipo</th>
                                        <th className="px-6 py-4">Producto</th>
                                        <th className="px-6 py-4">Vencimiento</th>
                                        <th className="px-6 py-4">Defecto</th>
                                        <th className="px-6 py-4">Usuario</th>
                                        <th className="px-6 py-4 text-center">Evidencia</th>
                                    </tr>
                                )}
                                {activeTab === 'MUESTRAS' && (
                                    <tr>
                                        <th className="px-6 py-4">Fecha Recepción</th>
                                        <th className="px-6 py-4">Correlativo</th>
                                        <th className="px-6 py-4">Producto</th>
                                        <th className="px-6 py-4 text-center">Cant.</th>
                                        <th className="px-6 py-4">Documento</th>
                                        <th className="px-6 py-4">Estado</th>
                                        <th className="px-6 py-4">Recibido Por</th>
                                        <th className="px-6 py-4 text-center">Evidencia</th>
                                    </tr>
                                )}
                                {activeTab === 'RECEPCIONES' && (
                                    <tr>
                                        <th className="px-6 py-4">Fecha / Hora</th>
                                        <th className="px-6 py-4">Código</th>
                                        <th className="px-6 py-4">Producto</th>
                                        <th className="px-6 py-4 text-center">Cant.</th>
                                        <th className="px-6 py-4">Vencimiento</th>
                                        <th className="px-6 py-4 text-center">Temp.</th>
                                        <th className="px-6 py-4">Usuario</th>
                                        <th className="px-6 py-4 text-center">Evidencia</th>
                                    </tr>
                                )}
                                {activeTab === 'ALERTAS' && (
                                    <tr>
                                        <th className="px-6 py-4">Fecha / Hora</th>
                                        <th className="px-6 py-4">Producto</th>
                                        <th className="px-6 py-4">Tipo Alerta</th>
                                        <th className="px-6 py-4">Detalle</th>
                                        <th className="px-6 py-4">Proveedor</th>
                                        <th className="px-6 py-4">Autorizado Por</th>
                                        <th className="px-6 py-4 text-center">Estado</th>
                                        <th className="px-6 py-4">Usuario</th>
                                    </tr>
                                )}
                                {activeTab === 'MERMAS' && (
                                    <tr>
                                        <th className="px-6 py-4">Fecha / Hora</th>
                                        <th className="px-6 py-4">Producto</th>
                                        <th className="px-6 py-4 text-center">Cant.</th>
                                        <th className="px-6 py-4">Vencimiento</th>
                                        <th className="px-6 py-4">Defecto</th>
                                        <th className="px-6 py-4">Destino</th>
                                        <th className="px-6 py-4">Usuario</th>
                                        <th className="px-6 py-4 text-center">Evidencia</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {loading ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-3">
                                                <RefreshCw className="w-10 h-10 text-blue-600 animate-spin opacity-20"/>
                                                <span className="text-gray-400 font-bold uppercase tracking-widest text-xs">Sincronizando datos...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : paginatedRecords.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center gap-3 opacity-30">
                                                <Box className="w-12 h-12 text-gray-400"/>
                                                <span className="text-gray-500 font-bold uppercase tracking-widest text-xs">No se encontraron registros</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedRecords.map((record: any) => (
                                        <tr key={record.id} className="hover:bg-blue-50/30 transition-colors group">
                                            {activeTab === 'CONTEOS' && (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-700">{new Date(record.fecha_registro).toLocaleDateString()}</span>
                                                            <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                                                                <Clock className="w-3 h-3"/> {new Date(record.fecha_registro).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black border ${getZoneColor(record.zona)}`}>
                                                            {record.zona || 'N/A'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col min-w-[200px]">
                                                            <span className="font-black text-gray-800 group-hover:text-blue-600 transition-colors break-words text-sm leading-tight">
                                                                {record.nombre}
                                                            </span>
                                                            <span className="text-base font-black text-blue-600 font-mono tracking-tighter mt-1">
                                                                {record.codigo}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="inline-block bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-black text-xs">
                                                            {Number(record.cantidad).toFixed(2)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <Calendar className="w-3 h-3 text-gray-400"/>
                                                            <span className={`font-bold text-xs ${record.fecha_vencimiento ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                                                                {record.fecha_vencimiento ? formatDate(record.fecha_vencimiento) : 'SIN FECHA'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center">
                                                                <User className="w-3 h-3 text-slate-500"/>
                                                            </div>
                                                            <span className="text-xs font-bold text-gray-600">{record.usuario_registro}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {record.accion ? (
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-black text-emerald-600 uppercase">{record.accion}</span>
                                                                <span className="text-[10px] text-gray-400 font-bold">Cant: {Number(record.cantidad_accion).toFixed(2)} • {record.fecha_accion ? new Date(record.fecha_accion).toLocaleDateString() : ''}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest italic">Sin acción</span>
                                                        )}
                                                    </td>
                                                </>
                                            )}

                                            {activeTab === 'RETORNOS' && (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-700">{new Date(record.registeredAt).toLocaleDateString()}</span>
                                                            <span className="text-sm text-blue-600 font-black flex items-center gap-1 mt-1">
                                                                <Clock className="w-4 h-4"/> {new Date(record.registeredAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="px-2 py-1 rounded-lg text-[10px] font-black border bg-slate-100 text-slate-700 border-slate-200">
                                                            {record.plate}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-bold text-gray-600">{record.invoice}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-2 py-1 rounded-lg">
                                                            {record.returnType}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col min-w-[200px]">
                                                            <span className="font-black text-gray-800 break-words text-sm leading-tight">
                                                                {record.productName || 'N/A'}
                                                            </span>
                                                            <span className="text-xs font-bold text-blue-600 font-mono mt-1">
                                                                {record.productCode || 'N/A'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <Calendar className="w-3 h-3 text-gray-400"/>
                                                            <span className={`font-bold text-xs ${record.expirationDate ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                                                                {record.expirationDate ? formatDate(record.expirationDate) : 'SIN FECHA'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-[10px] font-bold text-red-600 uppercase">{record.defect}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center">
                                                                <User className="w-3 h-3 text-slate-500"/>
                                                            </div>
                                                            <span className="text-xs font-bold text-gray-600">{record.registeredBy}</span>
                                                        </div>
                                                    </td>
                                                </>
                                            )}

                                            {activeTab === 'MUESTRAS' && (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-700">{new Date(record.receptionDate).toLocaleDateString()}</span>
                                                            <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                                                                <Clock className="w-3 h-3"/> {new Date(record.receptionDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="font-black text-blue-600">#{record.correlativo}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col min-w-[200px]">
                                                            <span className="font-black text-gray-800 break-words text-sm leading-tight">
                                                                {record.name}
                                                            </span>
                                                            <span className="text-xs font-bold text-gray-400 mt-1">
                                                                {record.internalCode} • {record.ean}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="inline-block bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-black text-xs">
                                                            {Number(record.quantity).toFixed(2)} {record.unitOfMeasure}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-[10px] font-black text-gray-400 uppercase">{record.documentType}</span>
                                                            <span className="text-xs font-bold text-gray-700">{record.documentNumber}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black border ${
                                                            record.status === 'Recibido' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                                            record.status === 'Entregado' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                                                            'bg-rose-50 text-rose-600 border-rose-100'
                                                        }`}>
                                                            {record.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-bold text-gray-600">{record.receivedBy}</span>
                                                    </td>
                                                </>
                                            )}

                                            {activeTab === 'RECEPCIONES' && (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-700">{new Date(record.fecha_registro).toLocaleDateString()}</span>
                                                            <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                                                                <Clock className="w-3 h-3"/> {new Date(record.fecha_registro).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-black text-blue-600 font-mono">
                                                            {record.codigo}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="font-black text-gray-800 text-sm leading-tight">
                                                            {record.nombre}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="inline-block bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-black text-xs">
                                                            {Number(record.cantidad).toFixed(2)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <Calendar className="w-3 h-3 text-gray-400"/>
                                                            <span className="font-bold text-xs text-gray-700">
                                                                {formatDate(record.fecha_vencimiento)}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="text-xs font-bold text-gray-600">
                                                            {record.temperatura ? `${record.temperatura}°C` : '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center">
                                                                <User className="w-3 h-3 text-slate-500"/>
                                                            </div>
                                                            <span className="text-xs font-bold text-gray-600">{record.usuario_registro}</span>
                                                        </div>
                                                    </td>
                                                </>
                                            )}

                                            {activeTab === 'MERMAS' && (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-700">{new Date(record.fecha_registro).toLocaleDateString()}</span>
                                                            <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                                                                <Clock className="w-3 h-3"/> {new Date(record.fecha_registro).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col min-w-[200px]">
                                                            <span className="font-black text-gray-800 break-words text-sm leading-tight">
                                                                {record.nombre}
                                                            </span>
                                                            <span className="text-xs font-bold text-blue-600 font-mono mt-1">
                                                                {record.codigo}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className="inline-block bg-red-50 text-red-700 px-3 py-1 rounded-full font-black text-xs">
                                                            {Number(record.cantidad).toFixed(2)} {record.unidad_medida || 'UND'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <Calendar className="w-3 h-3 text-gray-400"/>
                                                            <span className={`font-bold text-xs ${record.fecha_vencimiento ? 'text-gray-700' : 'text-gray-300 italic'}`}>
                                                                {record.fecha_vencimiento ? formatDate(record.fecha_vencimiento) : 'SIN FECHA'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-[10px] font-black text-orange-600 uppercase bg-orange-50 px-2 py-1 rounded-lg">
                                                            {record.defecto}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-[10px] font-black text-blue-600 uppercase bg-blue-50 px-2 py-1 rounded-lg">
                                                            {record.destino}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center">
                                                                <User className="w-3 h-3 text-slate-500"/>
                                                            </div>
                                                            <span className="text-xs font-bold text-gray-600">{record.usuario_registro}</span>
                                                        </div>
                                                    </td>
                                                </>
                                            )}

                                            {activeTab === 'ALERTAS' && (
                                                <>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-700">{new Date(record.fecha_alerta).toLocaleDateString()}</span>
                                                            <span className="text-[10px] text-gray-400 font-mono flex items-center gap-1">
                                                                <Clock className="w-3 h-3"/> {new Date(record.fecha_alerta).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col min-w-[180px]">
                                                            <span className="font-black text-gray-800 text-sm leading-tight">
                                                                {record.nombre}
                                                            </span>
                                                            <span className="text-xs font-bold text-blue-600 font-mono mt-1">
                                                                {record.codigo}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black border ${
                                                            record.tipo_alerta === 'AMBAS' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                                            record.tipo_alerta === 'ROTACION' ? 'bg-red-100 text-red-700 border-red-200' :
                                                            record.tipo_alerta === 'TVU_OVER_100' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                                            record.tipo_alerta === 'OVERSTOCK' ? 'bg-sky-100 text-sky-700 border-sky-200' :
                                                            'bg-orange-100 text-orange-700 border-orange-200'
                                                        }`}>
                                                            {record.tipo_alerta === 'TVU_OVER_100' ? 'TVU > 100%' : record.tipo_alerta}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-medium text-gray-600">{record.valor_alerta}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-bold text-gray-600">{record.proveedor || '-'}</span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="text-xs font-black text-slate-700 uppercase">{record.autorizado_por || '-'}</span>
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black border ${
                                                            record.recepcionado ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                                                        }`}>
                                                            {record.recepcionado ? 'RECIBIDO' : 'ALERTA ENVIADA'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-6 h-6 bg-slate-200 rounded-full flex items-center justify-center">
                                                                <User className="w-3 h-3 text-slate-500"/>
                                                            </div>
                                                            <span className="text-xs font-bold text-gray-600">{record.usuario_registro}</span>
                                                        </div>
                                                    </td>
                                                </>
                                            )}

                                            <td className="px-6 py-4 text-center">
                                                {(activeTab !== 'ALERTAS' && record.fotos && record.fotos.length > 0) ? (
                                                    <div className="flex justify-center">
                                                        <button 
                                                            onClick={() => setSelectedPhotos(record.fotos || [])}
                                                            className="group/photo relative w-12 h-12 rounded-lg overflow-hidden border-2 border-white shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 ring-1 ring-gray-100"
                                                        >
                                                            <img 
                                                                src={record.fotos[0]} 
                                                                alt="Thumbnail" 
                                                                className="w-full h-full object-cover"
                                                                referrerPolicy="no-referrer"
                                                                loading="lazy"
                                                            />
                                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/photo:opacity-100 flex items-center justify-center transition-opacity duration-200">
                                                                <Camera className="w-4 h-4 text-white drop-shadow-md"/>
                                                            </div>
                                                            {record.fotos.length > 1 && (
                                                                <div className="absolute top-0 right-0 bg-blue-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded-bl-lg shadow-sm">
                                                                    {record.fotos.length}
                                                                </div>
                                                            )}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex justify-center">
                                                        <span className="text-gray-200 text-xs font-bold uppercase tracking-widest">-</span>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Footer */}
                    {!loading && filteredRecords.length > 0 && (
                        <div className="bg-gray-50/50 border-t px-6 py-4 flex items-center justify-between">
                            <div className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                Mostrando <span className="text-gray-700">{paginatedRecords.length}</span> de <span className="text-gray-700">{filteredRecords.length}</span> registros
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button 
                                    disabled={currentPage === 1}
                                    onClick={() => setCurrentPage(p => p - 1)}
                                    className="p-2 rounded-lg border bg-white text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronLeft className="w-5 h-5"/>
                                </button>
                                <div className="flex items-center gap-1">
                                    {[...Array(Math.min(5, totalPages))].map((_, i) => {
                                        let pageNum = currentPage;
                                        if (totalPages > 5) {
                                            if (currentPage <= 3) pageNum = i + 1;
                                            else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                                            else pageNum = currentPage - 2 + i;
                                        } else {
                                            pageNum = i + 1;
                                        }
                                        
                                        return (
                                            <button 
                                                key={pageNum}
                                                onClick={() => setCurrentPage(pageNum)}
                                                className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${currentPage === pageNum ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-white border text-gray-500 hover:border-blue-300'}`}
                                            >
                                                {pageNum}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button 
                                    disabled={currentPage === totalPages}
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    className="p-2 rounded-lg border bg-white text-gray-500 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronRight className="w-5 h-5"/>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Photo Modal */}
            {selectedPhotos && (
                <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex justify-center items-center p-4 animate-fade-in">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <div className="flex items-center gap-2">
                                <Camera className="w-5 h-5 text-blue-600"/>
                                <h3 className="font-bold text-gray-800">Evidencia Fotográfica</h3>
                            </div>
                            <button onClick={() => setSelectedPhotos(null)} className="text-gray-400 hover:text-red-500 transition-colors">
                                <XCircle className="w-6 h-6"/>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <div className="grid grid-cols-2 gap-4">
                                {selectedPhotos.map((photo, idx) => (
                                    <div 
                                        key={idx} 
                                        className="rounded-xl overflow-hidden border border-gray-100 aspect-square shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                                        onClick={() => setMaximizedImage(photo)}
                                    >
                                        <img src={photo} alt={`Evidencia ${idx}`} className="w-full h-full object-cover"/>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 border-t bg-gray-50 text-center">
                            <button 
                                onClick={() => setSelectedPhotos(null)}
                                className="bg-slate-900 text-white px-8 py-3 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg hover:bg-black transition-all w-full"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Maximized Image Overlay */}
            {maximizedImage && (
                <div 
                    className="fixed inset-0 z-[200] bg-black/95 flex justify-center items-center p-4 animate-fade-in cursor-zoom-out"
                    onClick={() => setMaximizedImage(null)}
                >
                    <button 
                        onClick={() => setMaximizedImage(null)}
                        className="absolute top-6 right-6 text-white/50 hover:text-white transition-colors"
                    >
                        <XCircle className="w-10 h-10"/>
                    </button>
                    <img 
                        src={maximizedImage} 
                        alt="Maximizada" 
                        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-scale-in"
                    />
                </div>
            )}
        </div>
    );
};

export default Monitor;
