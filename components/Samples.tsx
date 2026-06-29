
import React, { useState, useEffect } from 'react';
import { Sample, Usuario } from '../types';
import { PlusCircle, Search, Camera, Beaker, CheckCircle, XCircle, Download, FileSpreadsheet, FileText, RefreshCw, Trash, AlertTriangle, Pencil, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from './Icons';
import { supabase } from '../supabaseClient';
import { compressImage, generateStorageFileName } from '../utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface SamplesProps {
  currentUser: Usuario | null;
}

const Samples: React.FC<SamplesProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'LIST' | 'FORM'>('FORM');
  const [searchTerm, setSearchTerm] = useState('');
  const [samples, setSamples] = useState<Sample[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [unitOfMeasure, setUnitOfMeasure] = useState('UND');
  const [quantity, setQuantity] = useState<string>('');
  const [documentType, setDocumentType] = useState<'GUIA' | 'FACTURA'>('GUIA');
  const [documentNumber, setDocumentNumber] = useState('');
  const [requestedArea, setRequestedArea] = useState('COMPRAS');
  const [deliveredTo, setDeliveredTo] = useState('');
  const [status, setStatus] = useState<'Recibido' | 'Entregado' | 'Enviado a merma'>('Recibido');
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState(false);

  // Download State
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Action State
  const [showActionModal, setShowActionModal] = useState(false);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [sampleToDelete, setSampleToDelete] = useState<string | null>(null);
  const [selectedSample, setSelectedSample] = useState<Sample | null>(null);
  const [actionDeliveredTo, setActionDeliveredTo] = useState('');
  const [actionStatus, setActionStatus] = useState<'Entregado' | 'Enviado a merma'>('Entregado');
  const [isUpdatingAction, setIsUpdatingAction] = useState(false);

  // Edit State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSample, setEditingSample] = useState<Sample | null>(null);
  const [editName, setEditName] = useState('');
  const [editProvider, setEditProvider] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnit, setEditUnit] = useState('UND');
  const [editStatus, setEditStatus] = useState('');
  const [editDeliveredTo, setEditDeliveredTo] = useState('');
  const [editRequestedArea, setEditRequestedArea] = useState('');
  const [editDocType, setEditDocType] = useState<'GUIA' | 'FACTURA'>('GUIA');
  const [editDocNumber, setEditDocNumber] = useState('');
  const [editExpDate, setEditExpDate] = useState('');
  const [editPhotos, setEditPhotos] = useState<File[]>([]);
  const [editPhotoPreviews, setEditPhotoPreviews] = useState<string[]>([]);

  const [hasExpirationDate, setHasExpirationDate] = useState(true);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Sorting and Pagination State
  const [sortField, setSortField] = useState<keyof Sample | 'receptionDate'>('receptionDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Date Selector State (Vencimiento)
  const [selDay, setSelDay] = useState('');
  const [selMonth, setSelMonth] = useState('');
  const [selYear, setSelYear] = useState('');

  const months = [
    { v: '01', l: 'ENE' }, { v: '02', l: 'FEB' }, { v: '03', l: 'MAR' },
    { v: '04', l: 'ABR' }, { v: '05', l: 'MAY' }, { v: '06', l: 'JUN' },
    { v: '07', l: 'JUL' }, { v: '08', l: 'AGO' }, { v: '09', l: 'SET' },
    { v: '10', l: 'OCT' }, { v: '11', l: 'NOV' }, { v: '12', l: 'DIC' }
  ];

  const years = Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() + i).toString());

  const filteredSamples = samples
    .filter(s => 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.provider.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.ean.includes(searchTerm) ||
      s.correlativo?.toString().includes(searchTerm)
    )
    .sort((a, b) => {
      // 1. "Entregado" always at the end
      if (a.status === 'Entregado' && b.status !== 'Entregado') return 1;
      if (a.status !== 'Entregado' && b.status === 'Entregado') return -1;

      // 2. Dynamic sorting
      const valA = a[sortField as keyof Sample];
      const valB = b[sortField as keyof Sample];

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

  // Pagination logic
  const totalPages = Math.ceil(filteredSamples.length / itemsPerPage);
  const paginatedSamples = filteredSamples.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSort = (field: keyof Sample | 'receptionDate') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1); // Reset to first page on sort
  };

  useEffect(() => {
    console.log("Samples component mounted. Current User:", currentUser);
    fetchSamples();
  }, [currentUser]);

  const fetchSamples = async () => {
    setIsProcessing(true);
    try {
      let query = supabase
        .from('muestras')
        .select('*')
        .neq('status', 'ELIMINADO');
      
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
        photos: d.fotos || [],
        deliveredTo: d.entregado_a || '',
        deliveryDate: d.fecha_entrega,
        status: d.status || 'Recibido'
      }));
      
      setSamples(mapped as any);
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && photos.length < 2) {
      setPhotos(prev => [...prev, file]);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (hasExpirationDate && (!selDay || !selMonth || !selYear)) {
      alert("Por favor complete la fecha de vencimiento o desmarque la opción.");
      return;
    }

    // Capture state for background processing
    const dataToSave = {
      name,
      provider,
      unitOfMeasure,
      quantity: parseInt(quantity) || 0,
      documentType,
      documentNumber,
      expirationDate: hasExpirationDate ? `${selYear}-${selMonth}-${selDay}` : null,
      receivedBy: currentUser?.nombre || 'SISTEMA',
      requestedArea,
      deliveredTo,
      status,
      // Automatic delivery date if status is 'Entregado'
      fechaEntrega: status === 'Entregado' ? new Date().toISOString() : null
    };
    const photosToSave = [...photos];

    // Reset form immediately
    resetForm();
    setSuccessMsg(true);
    setTimeout(() => setSuccessMsg(false), 3000);

    // Background processing
    (async () => {
      try {
        // Get next internal code (numeric correlative)
        const { data: lastSampleData } = await supabase
          .from('muestras')
          .select('codigo_interno')
          .order('id', { ascending: false })
          .limit(1);
        
        let nextCode = "1";
        if (lastSampleData && lastSampleData.length > 0) {
          const lastCode = parseInt(lastSampleData[0].codigo_interno);
          if (!isNaN(lastCode)) {
            nextCode = (lastCode + 1).toString();
          }
        }

        const photoUrls: string[] = [];
        for (let i = 0; i < photosToSave.length; i++) {
          const file = photosToSave[i];
          const fileName = generateStorageFileName();
          const filePath = `muestras/${fileName}`;

          try {
            const compressedBlob = await compressImage(file, 1024, 0.6);
            const { error: uploadError } = await supabase.storage
              .from('evidencias')
              .upload(filePath, compressedBlob, { contentType: 'image/jpeg' });

            if (uploadError) {
              console.error("Error uploading sample photo in background:", uploadError);
              continue;
            }

            const { data: { publicUrl } } = supabase.storage
              .from('evidencias')
              .getPublicUrl(filePath);

            photoUrls.push(publicUrl);
          } catch (compressErr) {
            console.error("Error compressing image:", compressErr);
            // Fallback to original
            const { error: uploadError } = await supabase.storage
              .from('evidencias')
              .upload(filePath, file, { contentType: 'image/jpeg' });

            if (uploadError) {
              console.error("Error uploading sample photo in background:", uploadError);
              continue;
            }

            const { data: { publicUrl } } = supabase.storage
              .from('evidencias')
              .getPublicUrl(filePath);

            photoUrls.push(publicUrl);
          }
        }

        const { error } = await supabase.from('muestras').insert([{
          codigo_interno: nextCode,
          ean: '-',
          nombre_producto: dataToSave.name,
          proveedor: dataToSave.provider,
          unidad_medida: dataToSave.unitOfMeasure,
          cantidad: dataToSave.quantity,
          tipo_documento: dataToSave.documentType,
          numero_documento: dataToSave.documentNumber,
          fecha_vencimiento: dataToSave.expirationDate,
          recibido_por: currentUser?.nombre || dataToSave.receivedBy,
          area_solicitada: dataToSave.requestedArea,
          entregado_a: dataToSave.deliveredTo,
          fecha_entrega: dataToSave.fechaEntrega,
          status: dataToSave.status,
          fotos: photoUrls,
          sede_id: currentUser?.sede_id
        }]);

        if (error) throw error;
        
        // Refresh list in background
        fetchSamples();
      } catch (err: any) {
        console.error("Error in background sample save:", err);
      }
    })();
  };

  const resetForm = () => {
    setName('');
    setProvider('');
    setUnitOfMeasure('UND');
    setQuantity('');
    setDocumentType('GUIA');
    setDocumentNumber('');
    setRequestedArea('');
    setDeliveredTo('');
    setStatus('Recibido');
    setHasExpirationDate(false);
    setPhotos([]);
    setPhotoPreviews([]);
  };

  const handleUpdateAction = async () => {
    if (!selectedSample || !actionDeliveredTo) {
      alert("Por favor ingrese a quién se entrega.");
      return;
    }

    setIsUpdatingAction(true);
    try {
      const { error } = await supabase
        .from('muestras')
        .update({
          entregado_a: actionDeliveredTo,
          fecha_entrega: new Date().toISOString(),
          status: actionStatus
        })
        .eq('id', selectedSample.id);

      if (error) throw error;

      setShowActionModal(false);
      setSelectedSample(null);
      setActionDeliveredTo('');
      setActionStatus('Entregado');
      fetchSamples();
    } catch (err: any) {
      alert("Error al actualizar: " + err.message);
    } finally {
      setIsUpdatingAction(false);
    }
  };

  const handleDeleteSample = async () => {
    if (!sampleToDelete) return;
    
    console.log("Attempting to delete sample with ID:", sampleToDelete);
    
    try {
      setIsProcessing(true);
      console.log("Sending delete request to Supabase...");
      // Logical delete by setting status to 'ELIMINADO'
      const { error } = await supabase
        .from('muestras')
        .update({ status: 'ELIMINADO' })
        .eq('id', sampleToDelete);

      if (error) {
        console.error("Supabase delete error:", error);
        throw error;
      }
      
      console.log("Delete successful. Refreshing samples...");
      fetchSamples();
      setShowDeleteConfirmModal(false);
      setSampleToDelete(null);
    } catch (err: any) {
      console.error("Error in handleDeleteSample:", err);
      alert("Error al eliminar: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEditClick = (sample: Sample) => {
    setEditingSample(sample);
    setEditName(sample.name);
    setEditProvider(sample.provider);
    setEditQuantity(sample.quantity.toString());
    setEditUnit(sample.unitOfMeasure);
    setEditStatus(sample.status);
    setEditDeliveredTo(sample.deliveredTo || '');
    setEditRequestedArea(sample.requestedArea);
    setEditDocType(sample.documentType as any);
    setEditDocNumber(sample.documentNumber);
    setEditExpDate(sample.expirationDate);
    setEditPhotos([]);
    setEditPhotoPreviews(sample.photos || []);
    setShowEditModal(true);
  };

  const handleEditPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setEditPhotos(prev => [...prev, ...files]);
      const newPreviews = files.map(file => URL.createObjectURL(file));
      setEditPhotoPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeEditPhoto = (index: number) => {
    const previewToRemove = editPhotoPreviews[index];
    const oldPhotosCount = (editingSample?.photos || []).length;
    
    if (previewToRemove.startsWith('blob:')) {
      const fileIndex = index - oldPhotosCount;
      setEditPhotos(prev => prev.filter((_, i) => i !== fileIndex));
    }
    
    setEditPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateSample = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSample) return;

    setIsProcessing(true);
    try {
      let finalPhotoUrls = editPhotoPreviews.filter(p => !p.startsWith('blob:'));
      
      if (editPhotos.length > 0) {
        for (let i = 0; i < editPhotos.length; i++) {
          const file = editPhotos[i];
          const fileName = generateStorageFileName();
          const filePath = `muestras/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('evidencias')
            .upload(filePath, file, { contentType: 'image/jpeg' });

          if (uploadError) {
            console.error("Error uploading edit photo:", uploadError);
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('evidencias')
            .getPublicUrl(filePath);
          
          finalPhotoUrls.push(publicUrl);
        }
      }

      const { error } = await supabase
        .from('muestras')
        .update({
          nombre_producto: editName,
          proveedor: editProvider,
          cantidad: editQuantity,
          unidad_medida: editUnit,
          status: editStatus,
          entregado_a: editDeliveredTo,
          area_solicitada: editRequestedArea,
          tipo_documento: editDocType,
          numero_documento: editDocNumber,
          fecha_vencimiento: editExpDate || null,
          fotos: finalPhotoUrls
        })
        .eq('id', editingSample.id);

      if (error) throw error;

      setShowEditModal(false);
      fetchSamples();
    } catch (err: any) {
      alert("Error al actualizar: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getBase64Image = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.setAttribute('crossOrigin', 'anonymous');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = url;
    });
  };

  const handleDownloadPDF = async () => {
    setIsDownloading(true);
    try {
      // Filter only 'Recibido' and sort by expiration date (nearest first)
      const dataToPrint = samples
        .filter(s => s.status === 'Recibido')
        .sort((a, b) => {
          // 1. Samples with date first
          if (a.expirationDate && !b.expirationDate) return -1;
          if (!a.expirationDate && b.expirationDate) return 1;
          if (!a.expirationDate && !b.expirationDate) return 0;
          
          // 2. Ascending date (soonest first)
          const dateA = new Date(a.expirationDate).getTime();
          const dateB = new Date(b.expirationDate).getTime();
          return dateA - dateB;
        });

      if (dataToPrint.length === 0) {
        alert("No hay muestras en estado 'RECIBIDO' para exportar.");
        return;
      }

      const doc = new jsPDF('l', 'mm', 'a4');
      const today = new Date().toLocaleString();

      doc.setFontSize(18);
      doc.text('REPORTE DE MUESTRAS - ALMACEN LIMA', 14, 15);

      const tableData = dataToPrint.map(s => [
        s.name,
        s.provider,
        `${s.quantity} ${s.unitOfMeasure}`,
        `${s.documentType}: ${s.documentNumber}`,
        s.expirationDate ? s.expirationDate.split('-').reverse().join('/') : 'SIN FECHA',
        s.requestedArea,
        s.status,
        s.deliveredTo || '-',
        '', // Placeholder for photo
        s.receivedBy
      ]);

      // Pre-load images
      const imageMap = new Map();
      for (const sample of dataToPrint) {
        if (sample.photos && sample.photos.length > 0) {
          try {
            const base64 = await getBase64Image(sample.photos[0]);
            imageMap.set(sample.id, base64);
          } catch (e) {
            console.error("Error loading image for PDF", e);
          }
        }
      }

      autoTable(doc, {
        startY: 30,
        head: [['PRODUCTO', 'PROVEEDOR', 'CANT', 'DOC', 'VENC.', 'AREA', 'ESTADO', 'ENTREGADO A', 'FOTO', 'RECIBIDO POR']],
        body: tableData,
        theme: 'grid',
        styles: { fontSize: 7, valign: 'middle' },
        columnStyles: {
          8: { cellWidth: 20, minCellHeight: 20 }
        },
        didDrawPage: (data) => {
          doc.setFontSize(8);
          doc.setTextColor(150);
          const pageSize = doc.internal.pageSize;
          const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
          doc.text(`Generado el: ${today}`, data.settings.margin.left, pageHeight - 10);
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) { // VENC. column
            const sample = dataToPrint[data.row.index];
            if (sample && sample.expirationDate) {
              const expDate = new Date(sample.expirationDate);
              const todayDate = new Date();
              const diffTime = expDate.getTime() - todayDate.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              if (diffDays < 30) {
                data.cell.styles.textColor = [255, 0, 0]; // Red text
                data.cell.styles.fontStyle = 'bold';
              }
            }
          }
        },
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === 8) {
            const sample = dataToPrint[data.row.index];
            if (sample) {
              const base64 = imageMap.get(sample.id);
              if (base64) {
                const x = data.cell.x + 2;
                const y = data.cell.y + 2;
                const w = data.cell.width - 4;
                const h = data.cell.height - 4;
                doc.addImage(base64, 'JPEG', x, y, w, h);
              }
            }
          }
        }
      });

      doc.save(`reporte_muestras_lima_${new Date().toISOString().split('T')[0]}.pdf`);
      setShowDownloadModal(false);
    } catch (err: any) {
      alert("Error al generar PDF: " + err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadExcel = () => {
    try {
      const dataToPrint = [...filteredSamples];
      if (dataToPrint.length === 0) {
        alert("No hay muestras para exportar.");
        return;
      }

      const data = dataToPrint.map(s => ({
        'ID': s.correlativo,
        'CODIGO INTERNO': s.internalCode,
        'EAN': s.ean,
        'PRODUCTO': s.name,
        'PROVEEDOR': s.provider,
        'UNIDAD MEDIDA': s.unitOfMeasure,
        'CANTIDAD': s.quantity,
        'TIPO DOCUMENTO': s.documentType,
        'NUMERO DOCUMENTO': s.documentNumber,
        'FECHA VENCIMIENTO': s.expirationDate ? s.expirationDate.split('-').reverse().join('/') : 'SIN FECHA',
        'FECHA RECEPCION': new Date(s.receptionDate).toLocaleString(),
        'RECIBIDO POR': s.receivedBy,
        'AREA SOLICITADA': s.requestedArea,
        'ESTADO': s.status,
        'ENTREGADO A': s.deliveredTo || '-',
        'FECHA ENTREGA': s.deliveryDate ? new Date(s.deliveryDate).toLocaleString() : '-',
        'FOTOS (URL)': s.photos.join(' ; ')
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Muestras");
      XLSX.writeFile(wb, `muestras_${new Date().toISOString().split('T')[0]}.xlsx`);
      setShowDownloadModal(false);
    } catch (err: any) {
      alert("Error al generar Excel: " + err.message);
    }
  };

  // filteredSamples moved to top

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header with Debug Info */}
      <div className="bg-white p-4 border-b border-gray-200 flex justify-between items-center shrink-0">
        <h1 className="text-xl font-black text-slate-800 uppercase italic">
          Gestión de <span className="text-[#009ED6] not-italic font-medium">Muestras</span>
        </h1>
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
          Usuario: {currentUser?.nombre || '---'} | Rol: {currentUser?.rol || 'N/A'}
        </div>
      </div>

      {/* Mobile Tabs */}
      <div className="flex bg-white border-b border-gray-200 shrink-0">
        <button 
          onClick={() => setActiveTab('FORM')}
          className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'FORM' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500'}`}
        >
          Nueva Muestra
        </button>
        <button 
          onClick={() => setActiveTab('LIST')}
          className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'LIST' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-500'}`}
        >
          Ver Muestras ({samples.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 md:p-6 custom-scrollbar">
        {activeTab === 'FORM' ? (
          <div className="max-w-xl mx-auto bg-white rounded-xl shadow-md border border-gray-200 p-6 relative">
            {isProcessing && (
                <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex items-center justify-center rounded-xl">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Beaker className="w-6 h-6 text-blue-600"/>
              Registro de Muestra
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Nombre del Producto</label>
                <input required type="text" className="w-full p-2 border rounded-lg outline-none focus:border-blue-500" value={name} onChange={e => setName(e.target.value)} />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Proveedor</label>
                <input required type="text" className="w-full p-2 border rounded-lg outline-none focus:border-blue-500" value={provider} onChange={e => setProvider(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">U. Medida</label>
                  <select required className="w-full p-2 border rounded-lg outline-none focus:border-blue-500 bg-white" value={unitOfMeasure} onChange={e => setUnitOfMeasure(e.target.value)}>
                    <option value="UND">UND</option>
                    <option value="CAJA">CAJA</option>
                    <option value="BOLSA">BOLSA</option>
                    <option value="KG">KG</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Cantidad</label>
                  <input required type="number" className="w-full p-2 border rounded-lg outline-none focus:border-blue-500 font-bold" value={quantity} onChange={e => setQuantity(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Tipo Documento</label>
                  <select required className="w-full p-2 border rounded-lg outline-none focus:border-blue-500 bg-white" value={documentType} onChange={e => setDocumentType(e.target.value as any)}>
                    <option value="GUIA">GUÍA</option>
                    <option value="FACTURA">FACTURA</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">N° Documento</label>
                  <input required type="text" className="w-full p-2 border rounded-lg outline-none focus:border-blue-500" value={documentNumber} onChange={e => setDocumentNumber(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Vencimiento</label>
                    <div className="flex items-center gap-1">
                      <input 
                        type="checkbox" 
                        id="hasExp" 
                        checked={hasExpirationDate} 
                        onChange={e => setHasExpirationDate(e.target.checked)}
                        className="w-3 h-3"
                      />
                      <label htmlFor="hasExp" className="text-[9px] font-bold text-blue-600 uppercase cursor-pointer">¿Tiene fecha?</label>
                    </div>
                  </div>
                  {hasExpirationDate ? (
                    <>
                      <div className="flex gap-2">
                        <select 
                          value={selDay} 
                          onChange={e => setSelDay(e.target.value)}
                          className="flex-1 p-2 border rounded-lg outline-none focus:border-blue-500 bg-white text-sm font-bold"
                        >
                          <option value="">DÍA</option>
                          {Array.from({length: 31}, (_, i) => (i + 1).toString().padStart(2, '0')).map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        <select 
                          value={selMonth} 
                          onChange={e => setSelMonth(e.target.value)}
                          className="flex-[2] p-2 border rounded-lg outline-none focus:border-blue-500 bg-white text-sm font-bold"
                        >
                          <option value="">MES</option>
                          {months.map(m => (
                            <option key={m.v} value={m.v}>{m.l}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {years.map(y => (
                          <button
                            key={y}
                            type="button"
                            onClick={() => setSelYear(y)}
                            className={`flex-1 py-1.5 px-1 rounded text-[11px] font-black border transition-all ${selYear === y ? 'bg-blue-600 text-white border-blue-600 shadow-md scale-105' : 'bg-gray-100 text-gray-600 border-gray-300'}`}
                          >
                            {y}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="p-3 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-center">
                      <span className="text-[10px] font-black text-gray-400 uppercase italic">Sin fecha de vencimiento</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Área Solicitada</label>
                  <select 
                    required 
                    className="w-full p-2 border rounded-lg outline-none focus:border-blue-500 bg-white text-sm font-bold" 
                    value={requestedArea} 
                    onChange={e => setRequestedArea(e.target.value)}
                  >
                    <option value="COMPRAS">COMPRAS</option>
                    <option value="COMERCIAL">COMERCIAL</option>
                    <option value="GERENCIA">GERENCIA</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Status</label>
                  <select 
                    value={status} 
                    onChange={e => setStatus(e.target.value as any)}
                    className="w-full p-2 border rounded-lg outline-none focus:border-blue-500 bg-white text-sm font-bold"
                  >
                    <option value="Recibido">Recibido</option>
                    <option value="Entregado">Entregado</option>
                    <option value="Enviado a merma">Enviado a merma</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Entregado a</label>
                  <input type="text" className="w-full p-2 border rounded-lg outline-none focus:border-blue-500" value={deliveredTo} onChange={e => setDeliveredTo(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Fotos de la Muestra ({photos.length}/2)</label>
                <div className="flex gap-4">
                  {photoPreviews.map((p, i) => (
                    <div key={i} className="relative w-20 h-20 border rounded-lg overflow-hidden group">
                      <img src={p} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removePhoto(i)} className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-0.5"><XCircle className="w-4 h-4"/></button>
                    </div>
                  ))}
                  {photoPreviews.length < 2 && (
                    <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50">
                      <Camera className="w-6 h-6 text-gray-400"/>
                      <span className="text-[9px] text-gray-500 font-bold mt-1">Cámara</span>
                      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                    </label>
                  )}
                </div>
              </div>

              {successMsg && (
                <div className="bg-green-100 text-green-700 p-3 rounded-lg flex items-center gap-2 font-bold text-sm animate-fade-in">
                  <CheckCircle className="w-5 h-5"/> ¡Muestra registrada con éxito!
                </div>
              )}

              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg transition-all flex justify-center items-center gap-2">
                <PlusCircle className="w-5 h-5"/> REGISTRAR MUESTRA
              </button>
            </form>
          </div>
        ) : (
          <div className="w-full space-y-4">
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <input 
                  type="text" 
                  placeholder="Buscar por ID, producto o proveedor..." 
                  className="w-full p-3 pl-10 border rounded-xl shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              </div>
              <button 
                onClick={() => setShowDownloadModal(true)}
                className="bg-green-600 text-white px-4 rounded-xl shadow-md hover:bg-green-700 transition-all flex items-center gap-2 font-bold"
              >
                <Download className="w-5 h-5" />
                <span className="hidden md:inline">Descargar</span>
              </button>
            </div>

            {filteredSamples.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <Beaker className="w-12 h-12 mx-auto mb-2 opacity-20"/>
                <p>No se encontraron registros de muestras.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-100 border-b border-gray-200">
                        <th 
                          className="p-3 text-[10px] font-black uppercase text-slate-500 tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                          onClick={() => handleSort('correlativo')}
                        >
                          <div className="flex items-center gap-1">
                            ID {sortField === 'correlativo' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </div>
                        </th>
                        <th className="p-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">Foto</th>
                        <th 
                          className="p-3 text-[10px] font-black uppercase text-slate-500 tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                          onClick={() => handleSort('name')}
                        >
                          <div className="flex items-center gap-1">
                            Producto {sortField === 'name' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </div>
                        </th>
                        <th 
                          className="p-3 text-[10px] font-black uppercase text-slate-500 tracking-wider cursor-pointer hover:bg-slate-200 transition-colors hidden lg:table-cell"
                          onClick={() => handleSort('provider')}
                        >
                          <div className="flex items-center gap-1">
                            Proveedor {sortField === 'provider' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </div>
                        </th>
                        <th className="p-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">Cant.</th>
                        <th 
                          className="p-3 text-[10px] font-black uppercase text-slate-500 tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                          onClick={() => handleSort('expirationDate')}
                        >
                          <div className="flex items-center gap-1">
                            Vencimiento {sortField === 'expirationDate' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </div>
                        </th>
                        <th className="p-3 text-[10px] font-black uppercase text-slate-500 tracking-wider hidden xl:table-cell">Área</th>
                        <th 
                          className="p-3 text-[10px] font-black uppercase text-slate-500 tracking-wider cursor-pointer hover:bg-slate-200 transition-colors hidden md:table-cell"
                          onClick={() => handleSort('receivedBy')}
                        >
                          <div className="flex items-center gap-1">
                            Registrado por {sortField === 'receivedBy' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </div>
                        </th>
                        <th 
                          className="p-3 text-[10px] font-black uppercase text-slate-500 tracking-wider cursor-pointer hover:bg-slate-200 transition-colors hidden sm:table-cell"
                          onClick={() => handleSort('receptionDate')}
                        >
                          <div className="flex items-center gap-1">
                            Fecha Registro {sortField === 'receptionDate' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </div>
                        </th>
                        <th 
                          className="p-3 text-[10px] font-black uppercase text-slate-500 tracking-wider cursor-pointer hover:bg-slate-200 transition-colors"
                          onClick={() => handleSort('status')}
                        >
                          <div className="flex items-center gap-1">
                            Estado {sortField === 'status' && (sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                          </div>
                        </th>
                        <th className="p-3 text-[10px] font-black uppercase text-slate-500 tracking-wider text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginatedSamples.map(sample => {
                        const isExpiredSoon = sample.expirationDate && (new Date(sample.expirationDate).getTime() - new Date().getTime()) < (30 * 24 * 60 * 60 * 1000);
                        
                        return (
                          <tr key={sample.id} className="hover:bg-slate-50 transition-colors group">
                            <td className="p-3 text-[10px] font-black text-blue-600">#{sample.correlativo || '---'}</td>
                            <td className="p-3">
                              {sample.photos.length > 0 ? (
                                <img 
                                  src={sample.photos[0]} 
                                  className="w-10 h-10 object-cover rounded border cursor-zoom-in hover:scale-110 transition-transform" 
                                  onClick={() => setSelectedImage(sample.photos[0])}
                                />
                              ) : (
                                <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center"><Beaker className="w-4 h-4 text-gray-300"/></div>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex flex-col">
                                <span className="font-bold text-gray-900 text-xs">{sample.name}</span>
                                <span className="text-[9px] text-gray-400 font-mono">{sample.internalCode}</span>
                              </div>
                            </td>
                            <td className="p-3 text-xs font-medium text-gray-600 hidden lg:table-cell">{sample.provider}</td>
                            <td className="p-3 text-xs font-bold text-gray-800 whitespace-nowrap">{sample.quantity} {sample.unitOfMeasure}</td>
                            <td className={`p-3 text-xs font-bold ${isExpiredSoon ? 'text-red-600' : 'text-gray-600'}`}>
                              {sample.expirationDate ? sample.expirationDate.split('-').reverse().join('/') : '---'}
                            </td>
                            <td className="p-3 text-[10px] font-bold text-slate-500 uppercase hidden xl:table-cell">{sample.requestedArea}</td>
                            <td className="p-3 text-[10px] font-bold text-slate-600 uppercase hidden md:table-cell">{sample.receivedBy}</td>
                            <td className="p-3 text-[10px] font-bold text-slate-500 hidden sm:table-cell">
                              {new Date(sample.receptionDate).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-3">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap ${
                                sample.status === 'Entregado' ? 'bg-green-100 text-green-700 border-green-200' :
                                sample.status === 'Enviado a merma' ? 'bg-red-100 text-red-700 border-red-200' :
                                'bg-blue-100 text-blue-700 border-blue-200'
                              }`}>
                                {sample.status}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-1">
                                <button 
                                  onClick={() => {
                                    setSelectedSample(sample);
                                    setActionDeliveredTo(sample.deliveredTo || '');
                                    setShowActionModal(true);
                                  }}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                  title="Acción"
                                >
                                  <RefreshCw className="w-4 h-4" />
                                </button>
                                {currentUser?.rol === 'ADMIN' && (
                                  <>
                                    <button 
                                      onClick={() => handleEditClick(sample)}
                                      className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                      title="Editar"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setSampleToDelete(sample.id);
                                        setShowDeleteConfirmModal(true);
                                      }}
                                      className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      title="Eliminar"
                                    >
                                      <Trash className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="bg-slate-50 p-3 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-[10px] font-bold text-gray-500 uppercase">
                    Mostrando {Math.min(filteredSamples.length, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(filteredSamples.length, currentPage * itemsPerPage)} de {filteredSamples.length} registros
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="p-1 rounded bg-white border border-gray-200 text-gray-400 disabled:opacity-50 hover:bg-gray-50 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum = currentPage;
                        if (totalPages <= 5) pageNum = i + 1;
                        else if (currentPage <= 3) pageNum = i + 1;
                        else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                        else pageNum = currentPage - 2 + i;

                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-6 h-6 rounded text-[10px] font-bold transition-all ${currentPage === pageNum ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button 
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1 rounded bg-white border border-gray-200 text-gray-400 disabled:opacity-50 hover:bg-gray-50 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Download Modal */}
      {showDownloadModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
            <div className="bg-blue-600 p-6 text-white flex justify-between items-center">
              <h3 className="text-xl font-bold">Descargar Reporte</h3>
              <button onClick={() => setShowDownloadModal(false)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-4">
              <p className="text-gray-500 text-center mb-6">Seleccione el formato de descarga para los registros filtrados.</p>
              <button 
                onClick={handleDownloadPDF}
                disabled={isDownloading}
                className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-100 hover:border-red-500 hover:bg-red-50 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-red-100 p-3 rounded-lg text-red-600 group-hover:bg-red-600 group-hover:text-white transition-colors">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-gray-800">Formato PDF</div>
                    <div className="text-xs text-gray-400">Incluye fotos visibles</div>
                  </div>
                </div>
                {isDownloading && <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin"></div>}
              </button>

              <button 
                onClick={handleDownloadExcel}
                className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-100 hover:border-green-500 hover:bg-green-50 transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-green-100 p-3 rounded-lg text-green-600 group-hover:bg-green-600 group-hover:text-white transition-colors">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div className="text-left">
                    <div className="font-bold text-gray-800">Formato Excel</div>
                    <div className="text-xs text-gray-400">Incluye URLs de fotos</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {showActionModal && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-scale-in">
            <div className="bg-blue-600 p-6 text-white flex justify-between items-center">
              <h3 className="text-xl font-bold">Registrar Entrega</h3>
              <button onClick={() => setShowActionModal(false)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 uppercase">Tipo de Acción:</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      setActionStatus('Entregado');
                      if (actionDeliveredTo === 'ENVIADO A MERMA') setActionDeliveredTo('');
                    }}
                    className={`flex-1 py-2 rounded-lg font-bold border-2 transition-all ${actionStatus === 'Entregado' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-100'}`}
                  >
                    Entrega
                  </button>
                  <button 
                    onClick={() => {
                      setActionStatus('Enviado a merma');
                      setActionDeliveredTo('ENVIADO A MERMA');
                    }}
                    className={`flex-1 py-2 rounded-lg font-bold border-2 transition-all ${actionStatus === 'Enviado a merma' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-500 border-gray-100'}`}
                  >
                    Merma
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700 uppercase">
                  {actionStatus === 'Entregado' ? 'Entregado a:' : 'Destino:'}
                </label>
                <input 
                  type="text" 
                  className="w-full p-3 border-2 border-gray-100 rounded-xl outline-none focus:border-blue-500 transition-all"
                  placeholder={actionStatus === 'Entregado' ? "Nombre de la persona que recibe" : "Ej: MERMA"}
                  value={actionDeliveredTo}
                  onChange={e => setActionDeliveredTo(e.target.value)}
                  autoFocus
                />
              </div>
              
              <div className="flex gap-4 pt-4">
                <button 
                  onClick={() => setShowActionModal(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleUpdateAction}
                  disabled={isUpdatingAction}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                >
                  {isUpdatingAction ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Confirmar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Sample Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-in max-h-[90vh] flex flex-col">
            <div className="bg-amber-600 p-6 text-white flex justify-between items-center shrink-0">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Pencil className="w-6 h-6" />
                Editar Muestra
              </h3>
              <button onClick={() => setShowEditModal(false)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateSample} className="p-8 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Nombre del Producto</label>
                  <input required type="text" className="w-full p-2 border rounded-lg outline-none focus:border-amber-500" value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Proveedor</label>
                  <input required type="text" className="w-full p-2 border rounded-lg outline-none focus:border-amber-500" value={editProvider} onChange={e => setEditProvider(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Unidad</label>
                  <select className="w-full p-2 border rounded-lg outline-none focus:border-amber-500 bg-white" value={editUnit} onChange={e => setEditUnit(e.target.value)}>
                    <option value="UND">UND</option>
                    <option value="CAJA">CAJA</option>
                    <option value="BOLSA">BOLSA</option>
                    <option value="KG">KG</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Cantidad</label>
                  <input required type="number" className="w-full p-2 border rounded-lg outline-none focus:border-amber-500" value={editQuantity} onChange={e => setEditQuantity(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Tipo Documento</label>
                  <select className="w-full p-2 border rounded-lg outline-none focus:border-amber-500 bg-white" value={editDocType} onChange={e => setEditDocType(e.target.value as any)}>
                    <option value="GUIA">GUÍA</option>
                    <option value="FACTURA">FACTURA</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">N° Documento</label>
                  <input required type="text" className="w-full p-2 border rounded-lg outline-none focus:border-amber-500" value={editDocNumber} onChange={e => setEditDocNumber(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Vencimiento</label>
                  <input type="date" className="w-full p-2 border rounded-lg outline-none focus:border-amber-500" value={editExpDate} onChange={e => setEditExpDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Área Solicitada</label>
                  <select 
                    required 
                    className="w-full p-2 border rounded-lg outline-none focus:border-amber-500 bg-white text-sm font-bold" 
                    value={editRequestedArea} 
                    onChange={e => setEditRequestedArea(e.target.value)}
                  >
                    <option value="COMPRAS">COMPRAS</option>
                    <option value="COMERCIAL">COMERCIAL</option>
                    <option value="GERENCIA">GERENCIA</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Status</label>
                  <select className="w-full p-2 border rounded-lg outline-none focus:border-amber-500 bg-white" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                    <option value="Recibido">Recibido</option>
                    <option value="Entregado">Entregado</option>
                    <option value="Enviado a merma">Enviado a merma</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Entregado a</label>
                  <input type="text" className="w-full p-2 border rounded-lg outline-none focus:border-amber-500" value={editDeliveredTo} onChange={e => setEditDeliveredTo(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-[10px] font-bold text-gray-500 uppercase">Fotografías</label>
                <div className="grid grid-cols-4 gap-2">
                  {editPhotoPreviews.map((preview, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg overflow-hidden border group">
                      <img src={preview} className="w-full h-full object-cover" />
                      <button 
                        type="button"
                        onClick={() => removeEditPhoto(idx)}
                        className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XCircle className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label className="aspect-square rounded-lg border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-amber-500 hover:bg-amber-50 transition-all">
                    <Camera className="w-6 h-6 text-gray-300" />
                    <span className="text-[8px] font-bold text-gray-400 mt-1 uppercase">Añadir</span>
                    <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={handleEditPhotoChange} />
                  </label>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isProcessing}
                  className="flex-1 bg-amber-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-amber-700 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Guardar Cambios
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-in">
            <div className="bg-red-600 p-6 text-white flex justify-between items-center">
              <h3 className="text-xl font-bold">Confirmar Eliminación</h3>
              <button onClick={() => setShowDeleteConfirmModal(false)} className="hover:bg-white/20 rounded-full p-1 transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div className="flex flex-col items-center text-center gap-4">
                <div className="bg-red-100 p-4 rounded-full text-red-600">
                  <AlertTriangle className="w-12 h-12" />
                </div>
                <p className="text-gray-600 font-medium">¿Estas seguro que desea eliminar? esta accion no se puede revertir.</p>
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setShowDeleteConfirmModal(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteSample}
                  disabled={isProcessing}
                  className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <Trash className="w-5 h-5" />
                      Eliminar
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Modal */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center">
            <img 
              src={selectedImage} 
              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl animate-scale-in" 
              alt="Zoom"
            />
            <button 
              className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
              onClick={() => setSelectedImage(null)}
            >
              <XCircle className="w-8 h-8" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Samples;
