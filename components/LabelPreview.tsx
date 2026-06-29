
import React from 'react';
import { Pallet } from '../types';
import { formatDate } from '../utils';
import { User, Clock, Printer, XCircle } from './Icons';

interface LabelPreviewProps {
  pallet: Pallet;
  onClose: () => void;
}

const LabelPreview: React.FC<LabelPreviewProps> = ({ pallet, onClose }) => {
  const handlePrint = () => {
    window.print();
  };

  const formattedDateTime = new Date(pallet.receptionDate).toLocaleString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  return (
    <div className="flex flex-col h-full bg-white md:rounded-lg overflow-hidden">
        {/* HEADER */}
        <div className="flex-none px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">LPN Generado</h2>
            <button onClick={onClose} className="md:hidden text-gray-500">
                <XCircle className="w-6 h-6"/>
            </button>
        </div>

        {/* SCROLLABLE CONTENT (PREVIEW) */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-100 flex justify-center items-start">
            
            {/* LABEL VISUAL PREVIEW */}
            <div className="w-full max-w-[350px] bg-white border-2 border-gray-800 p-4 shadow-xl relative animate-fade-in text-gray-900">
                {/* Header Label */}
                <div className="text-center border-b-2 border-black pb-2 mb-3">
                    <h1 className="text-2xl font-black uppercase tracking-wider">LPN</h1>
                    <p className="text-[10px] text-gray-500">SMART WMS ALIMENTOS</p>
                </div>

                {/* Body Label */}
                <div className="space-y-3">
                    <div>
                        <p className="text-[10px] uppercase font-bold text-gray-500">Producto</p>
                        <h2 className="text-lg font-bold leading-tight">{pallet.productName}</h2>
                        {pallet.isMixed && <span className="text-[10px] bg-blue-100 text-blue-800 px-1 rounded font-bold">MIXTO</span>}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <p className="text-[10px] uppercase font-bold text-gray-500">SKU / Código</p>
                            <p className="text-sm font-mono font-bold">{pallet.productCode}</p>
                        </div>
                        <div>
                            <p className="text-[10px] uppercase font-bold text-gray-500">Vencimiento</p>
                            <p className="text-sm font-bold">{pallet.expirationDate ? formatDate(pallet.expirationDate) : 'N/A'}</p>
                        </div>
                    </div>

                    <div className="text-center py-2 bg-gray-50 border border-gray-200 rounded">
                        <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">LPN (License Plate)</p>
                        <p className="text-xl font-mono font-black tracking-widest">{pallet.lpn}</p>
                    </div>

                    <div className="flex gap-4 items-center justify-center">
                        <img 
                            src={pallet.qrCodeUrl} 
                            alt="QR Code" 
                            className="w-24 h-24 object-contain border border-gray-200 p-1"
                        />
                         <div className="text-[9px] text-gray-500 space-y-1 text-left">
                            <div className="flex items-center gap-1">
                                <User className="w-3 h-3"/> {pallet.receivedBy || 'Operador'}
                            </div>
                            <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3"/> {formattedDateTime}
                            </div>
                            <p className="italic mt-1">Escanee para ubicar</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* FOOTER ACTIONS (Mobile Friendly) */}
        <div className="flex-none p-4 border-t border-gray-200 bg-white flex flex-col-reverse md:flex-row gap-3">
            <button
              onClick={onClose}
              className="w-full md:w-auto px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold shadow-sm transition-colors flex justify-center items-center gap-2"
            >
              <XCircle className="w-5 h-5"/> Cerrar
            </button>
            <button
              onClick={handlePrint}
              className="w-full md:w-auto md:ml-auto px-6 py-3 bg-blue-800 text-white rounded-lg hover:bg-blue-900 font-bold shadow-lg transition-colors flex justify-center items-center gap-2"
            >
              <Printer className="w-5 h-5"/> Imprimir LPN
            </button>
        </div>

      {/* --- HIDDEN PRINT TEMPLATE (A4 / Sticker) --- */}
      <div className="hidden print-only fixed inset-0 bg-white z-[100] flex items-center justify-center p-0 m-0">
         <div className="w-full h-full flex flex-col items-center justify-center">
                {/* Sticker Simulation sized for Print */}
                <div className="w-[100mm] h-[150mm] border-4 border-black p-6 flex flex-col justify-between mx-auto mt-4 box-border">
                        <div className="text-center border-b-4 border-black pb-4 mb-4">
                        <h1 className="text-4xl font-black uppercase tracking-wider mb-1">LPN</h1>
                        <h2 className="text-xl font-bold text-gray-600">SMART WMS</h2>
                    </div>

                    <div className="space-y-6 flex-1">
                            <div>
                            <p className="text-lg uppercase text-gray-500 font-bold mb-1">Producto</p>
                            <h2 className="text-3xl font-bold leading-tight">{pallet.productName}</h2>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-lg uppercase text-gray-500 font-bold mb-1">SKU</p>
                                <p className="text-2xl font-mono font-bold">{pallet.productCode}</p>
                            </div>
                            <div>
                                <p className="text-lg uppercase text-gray-500 font-bold mb-1">Vence</p>
                                <p className="text-2xl font-bold">{pallet.expirationDate ? formatDate(pallet.expirationDate) : 'SIN FECHA'}</p>
                            </div>
                        </div>

                            <div className="text-center py-4 bg-gray-50 border-y-4 border-gray-200">
                            <p className="text-xl uppercase text-gray-500 font-bold mb-2">LPN ID</p>
                            <p className="text-5xl font-mono font-black tracking-widest">{pallet.lpn}</p>
                        </div>

                            <div className="flex justify-between items-end">
                            <img 
                                src={pallet.qrCodeUrl} 
                                alt="QR Code" 
                                className="w-32 h-32 object-contain"
                            />
                            <div className="text-right text-sm text-gray-600">
                                <p><strong>Recibido por:</strong> {pallet.receivedBy}</p>
                                <p><strong>Fecha:</strong> {formattedDateTime}</p>
                            </div>
                        </div>
                    </div>
                </div>
         </div>
      </div>
    </div>
  );
};

export default LabelPreview;
