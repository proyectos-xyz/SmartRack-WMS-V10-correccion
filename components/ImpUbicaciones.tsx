import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import { Printer, Layers, Sliders, Check, FileText, LayoutGrid, Trash2, Info, AlertOctagon, FileDown } from 'lucide-react';

interface ImpUbicacionesProps {
  currentUser?: {
    nombre: string;
    rol: string;
    sede_id?: string;
  } | null;
}

export const ImpUbicaciones: React.FC<ImpUbicacionesProps> = ({ currentUser: _currentUser }) => {
  const [inputText, setInputText] = useState('');
  const [printMode, setPrintMode] = useState<'A4' | 'INDIVIDUAL'>('A4');
  const [fontSize, setFontSize] = useState<number>(8); // optimized lower font size
  const [labelWidthMm, setLabelWidthMm] = useState<number>(7.5);
  const [labelHeightMm, setLabelHeightMm] = useState<number>(7.5);
  const [labelPaddingMm, setLabelPaddingMm] = useState<number>(0.1);
  const [qrSizeInMm, setQrSizeInMm] = useState<number>(6.0); // occupies almost all space
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Auto-adjust QR size when label dimensions change, keeping it safely fitted but as large as possible
  useEffect(() => {
    const minDim = Math.min(labelWidthMm, labelHeightMm);
    const safeQrSize = Math.max(2, parseFloat((minDim * 0.82).toFixed(1)));
    setQrSizeInMm(safeQrSize);
  }, [labelWidthMm, labelHeightMm]);

  // Parse lines of code, split by newline, comma, semicolon or space
  const parsedCodes = inputText
    .split(/[\n,;]/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Group codes into chunks of 9 for A4 printing
  const chunkCodes = (codes: string[], size: number) => {
    const result: string[][] = [];
    for (let i = 0; i < codes.length; i += size) {
      result.push(codes.slice(i, i + size));
    }
    return result;
  };

  const a4Pages = chunkCodes(parsedCodes, 9);

  const handlePrint = () => {
    if (parsedCodes.length === 0) return;
    window.print();
  };

  const handleClear = () => {
    setInputText('');
  };

  const handleLoadSample = () => {
    setInputText(
      'UBC-A01-N1-P1\nUBC-A01-N1-P2\nUBC-A01-N1-P3\n' +
      'UBC-A01-N2-P1\nUBC-A01-N2-P2\nUBC-A01-N2-P3\n' +
      'UBC-B02-N1-P1\nUBC-B02-N1-P2\nUBC-B02-N1-P3'
    );
  };

  const generatePdf = async () => {
    if (parsedCodes.length === 0) return;
    setIsGeneratingPdf(true);

    try {
      if (printMode === 'A4') {
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        for (let pIdx = 0; pIdx < a4Pages.length; pIdx++) {
          if (pIdx > 0) {
            doc.addPage();
          }

          const pageItems = a4Pages[pIdx];

          const marginX = 10;
          const marginY = 10;
          const gapX = 10;
          const gapY = 10;
          const cols = 3;
          const rows = 3;

          const usableWidth = 210 - (marginX * 2);
          const usableHeight = 297 - (marginY * 2);

          const cellW = (usableWidth - (gapX * (cols - 1))) / cols;
          const cellH = (usableHeight - (gapY * (rows - 1))) / rows;

          for (let idx = 0; idx < pageItems.length; idx++) {
            const code = pageItems[idx];
            if (!code) continue;

            const col = idx % cols;
            const row = Math.floor(idx / cols);

            const x = marginX + (col * (cellW + gapX));
            const y = marginY + (row * (cellH + gapY));

            doc.setDrawColor(210, 215, 220);
            doc.rect(x, y, cellW, cellH);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(0, 0, 0);
            doc.text(code, x + (cellW / 2), y + 10, { align: 'center' });

            const canvasId = `qr-canvas-a4-${pIdx}-${idx}`;
            const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
            if (canvas) {
              const imgData = canvas.toDataURL('image/png');
              const qrSize = Math.min(cellW * 0.82, cellH * 0.7);
              const qrX = x + (cellW - qrSize) / 2;
              const qrY = y + 14 + (cellH - 16 - qrSize) / 2;
              doc.addImage(imgData, 'PNG', qrX, qrY, qrSize, qrSize);
            }
          }
        }
        doc.save(`ubicaciones_A4_${new Date().toISOString().slice(0, 10)}.pdf`);
      } else {
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: [labelWidthMm, labelHeightMm]
        });

        for (let idx = 0; idx < parsedCodes.length; idx++) {
          const code = parsedCodes[idx];
          if (idx > 0) {
            doc.addPage([labelWidthMm, labelHeightMm]);
          }

          // Dynamic precise text width fitting inside the physical label width to prevent overflow
          doc.setFont('helvetica', 'bold');
          let printFontSizePt = fontSize * 0.85;
          doc.setFontSize(printFontSizePt);
          
          const maxPrintWidthMm = labelWidthMm - (labelPaddingMm * 2) - 0.4;
          let textWidthMm = doc.getTextWidth(code);
          while (textWidthMm > maxPrintWidthMm && printFontSizePt > 2.2) {
            printFontSizePt -= 0.15;
            doc.setFontSize(printFontSizePt);
            textWidthMm = doc.getTextWidth(code);
          }

          doc.setTextColor(0, 0, 0);

          // Render baseline calculation matching the physical top spacer
          const printFontHeightMm = printFontSizePt * 0.3527;
          const printYTop = labelPaddingMm + 0.3;
          const printYBaseline = printYTop + (printFontHeightMm * 0.72);
          
          doc.text(code, labelWidthMm / 2, printYBaseline, { align: 'center' });

          const canvasId = `qr-canvas-ind-${idx}`;
          const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
          if (canvas) {
            const imgData = canvas.toDataURL('image/png');
            
            // Constrain QR dynamically within remaining vertical space without overlapping text
            const printQrYStart = printYTop + printFontHeightMm + 0.2;
            const availablePrintQrSpace = labelHeightMm - labelPaddingMm - printQrYStart - 0.2;
            const actualPrintQrSizeMm = Math.min(qrSizeInMm, Math.max(2, availablePrintQrSpace), labelWidthMm - (labelPaddingMm * 2) - 0.4);
            
            const qrY = printQrYStart + (Math.max(2, availablePrintQrSpace) - actualPrintQrSizeMm) / 2;
            const qrX = (labelWidthMm - actualPrintQrSizeMm) / 2;
            
            doc.addImage(imgData, 'PNG', qrX, qrY, actualPrintQrSizeMm, actualPrintQrSizeMm);
          }
        }
        doc.save(`etiquetas_individuales_${labelWidthMm}x${labelHeightMm}mm_${new Date().toISOString().slice(0, 10)}.pdf`);
      }
    } catch (err) {
      console.error('Error al generar PDF:', err);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Dynamic physical label scaling calculations for real-time preview (translating mm to screen pixels proportionally)
  const maxLabelDimMm = Math.max(labelWidthMm, labelHeightMm) || 7.5;
  const scaleFactor = 160 / maxLabelDimMm; // 160px represents the maximum layout size on-screen
  const previewWidth = labelWidthMm * scaleFactor;
  const previewHeight = labelHeightMm * scaleFactor;
  const previewPadding = labelPaddingMm * scaleFactor;
  const visualQrSize = qrSizeInMm * scaleFactor;

  // Harmonized spec helper for on-screen simulation and standard browser-based print styles
  const getLabelSpecs = (code: string) => {
    // 1. Browser Print Settings
    let printFontSizePt = fontSize * 0.85;
    const maxPrintWidthMm = labelWidthMm - (labelPaddingMm * 2) - 0.4;
    let printTextWidthMm = code.length * (printFontSizePt * 0.3527) * 0.58;
    while (printTextWidthMm > maxPrintWidthMm && printFontSizePt > 2.2) {
      printFontSizePt -= 0.15;
      printTextWidthMm = code.length * (printFontSizePt * 0.3527) * 0.58;
    }
    const printFontHeightMm = printFontSizePt * 0.3527;
    const printYTop = labelPaddingMm + 0.3;
    const printQrYStart = printYTop + printFontHeightMm + 0.2;
    const availablePrintQrSpace = labelHeightMm - labelPaddingMm - printQrYStart - 0.2;
    const actualPrintQrSizeMm = Math.min(qrSizeInMm, Math.max(2, availablePrintQrSpace), labelWidthMm - (labelPaddingMm * 2) - 0.4);

    // 2. High-Fidelity Interactive Client-Screen Representation
    let previewFontSizePx = fontSize;
    const maxPreviewWidthPx = previewWidth - (previewPadding * 2) - 4;
    let previewTextWidthPx = code.length * previewFontSizePx * 0.58;
    while (previewTextWidthPx > maxPreviewWidthPx && previewFontSizePx > 4) {
      previewFontSizePx -= 0.2;
      previewTextWidthPx = code.length * previewFontSizePx * 0.58;
    }
    const previewTextHeightPx = previewFontSizePx;
    const previewQrSpacerPx = Math.max(2, 0.4 * scaleFactor);
    const availablePreviewQrHeightPx = previewHeight - (previewPadding * 2) - previewTextHeightPx - previewQrSpacerPx;
    const actualPreviewQrSizePx = Math.min(visualQrSize, Math.max(10, availablePreviewQrHeightPx), previewWidth - (previewPadding * 2) - 4);

    return {
      printFontSizePx: printFontSizePt * 1.33,
      actualPrintQrSizeMm,
      previewFontSizePx,
      actualPreviewQrSizePx,
      previewMarginBottomPx: Math.max(1, 0.35 * (scaleFactor / 3.78))
    };
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-slate-50/50 dark:bg-transparent custom-scrollbar">
      <div className="flex flex-col lg:flex-row gap-6 p-6 max-w-7xl mx-auto animate-fade-in text-slate-800 pb-20">
      
      {/* Dynamic Style Injection for Prints depending on selected size */}
      <style>{`
        @media print {
          /* Hide all UI elements */
          body * {
            visibility: hidden;
          }
          /* Show print content */
          .printable-area, .printable-area * {
            visibility: visible;
          }
          .printable-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          
          /* A4 Specific Settings */
          ${printMode === 'A4' ? `
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            .a4-page {
              width: 190mm !important; /* ~210mm minus margins */
              height: 277mm !important; /* ~297mm minus margins */
              page-break-after: always;
              display: grid !important;
              grid-template-columns: repeat(3, 1fr) !important;
              grid-template-rows: repeat(3, 1fr) !important;
              gap: 15mm !important;
              padding: 5mm !important;
              box-sizing: border-box !important;
              background: white !important;
            }
            .a4-qr-card {
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
              border: 1px dashed #d1d5db !important;
              padding: 4mm !important;
              border-radius: 8px !important;
              box-sizing: border-box !important;
              background: white !important;
            }
            .a4-qr-text {
              font-family: inherit !important;
              font-weight: 900 !important;
              font-size: 14pt !important;
              color: black !important;
              margin-bottom: 3mm !important;
              text-align: center !important;
              word-break: break-all !important;
              text-transform: uppercase !important;
            }
          ` : `
            /* INDIVIDUAL Specific Settings - Fully customizable dimensions */
            @page {
              size: ${labelWidthMm}mm ${labelHeightMm}mm;
              margin: 0;
            }
            html, body {
              width: ${labelWidthMm}mm !important;
              height: ${labelHeightMm}mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
            }
            .individual-label-page {
              width: ${labelWidthMm}mm !important;
              height: ${labelHeightMm}mm !important;
              page-break-after: always;
              display: flex !important;
              flex-direction: column !important;
              align-items: center !important;
              justify-content: center !important;
              overflow: hidden !important;
              box-sizing: border-box !important;
              padding: ${labelPaddingMm}mm !important;
              background: white !important;
            }
            .individual-qr-text {
              font-family: inherit !important;
              font-weight: 900 !important;
              font-size: ${fontSize}px !important;
              line-height: 1.1 !important;
              color: black !important;
              margin-bottom: 0.2mm !important;
              white-space: nowrap !important;
              text-align: center !important;
              text-transform: uppercase !important;
              max-width: 100% !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
            }
          `}
        }
      `}</style>

      {/* LEFT: CONFIGURATION & INPUT PANEL */}
      <div className="w-full lg:w-5/12 bg-white rounded-2xl shadow-xl border border-slate-100 p-6 space-y-6 no-print">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Printer className="w-6 h-6" />
            </span>
            IMP UBICACIONES
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Generador masivo de códigos QR para ubicaciones y estanterías en almacén.
          </p>
        </div>

        {/* INPUT TEXTAREA */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs">
            <label className="text-slate-700 font-bold uppercase tracking-wider">
              Códigos Alfanuméricos
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleLoadSample}
                className="text-indigo-600 hover:text-indigo-800 font-bold transition-colors"
              >
                Cargar Demo
              </button>
              {parsedCodes.length > 0 && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-red-500 hover:text-red-700 font-bold transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Limpiar
                </button>
              )}
            </div>
          </div>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Pegue o escriba los códigos aquí...&#10;Ejemplo:&#10;UBC-A01&#10;UBC-A02, UBC-A03"
            rows={8}
            className="w-full p-4 border border-slate-200 rounded-xl shadow-inner focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all text-slate-900 font-mono text-sm leading-relaxed"
          />
          <div className="flex justify-between items-center bg-slate-50 border border-slate-200/50 rounded-xl px-4 py-2 text-xs">
            <span className="text-slate-500 font-semibold">Códigos detectados:</span>
            <span className="font-extrabold text-indigo-600 font-mono text-sm">
              {parsedCodes.length} {parsedCodes.length === 1 ? 'código' : 'códigos'}
            </span>
          </div>
        </div>

        {/* FORMAT SELECTION */}
        <div className="space-y-3">
          <label className="text-xs text-slate-700 font-bold uppercase tracking-wider block">
            Formato de Impresión
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setPrintMode('A4')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                printMode === 'A4'
                  ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950 scale-[1.02] shadow-md'
                  : 'border-slate-200 hover:border-slate-300 text-slate-500 bg-white'
              }`}
            >
              <FileText className={`w-8 h-8 mb-2 ${printMode === 'A4' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span className="font-extrabold text-sm">Formato A4</span>
              <span className="text-[10px] text-slate-400 font-semibold mt-1 text-center">
                3x3 columnas/filas (9 por hoja)
              </span>
            </button>

            <button
              type="button"
              onClick={() => setPrintMode('INDIVIDUAL')}
              className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all ${
                printMode === 'INDIVIDUAL'
                  ? 'border-indigo-600 bg-indigo-50/40 text-indigo-950 scale-[1.02] shadow-md'
                  : 'border-slate-200 hover:border-slate-300 text-slate-500 bg-white'
              }`}
            >
              <LayoutGrid className={`w-8 h-8 mb-2 ${printMode === 'INDIVIDUAL' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span className="font-extrabold text-sm">Individual Adaptable</span>
              <span className="text-[10px] text-slate-400 font-semibold mt-1 text-center">
                Personalizado ({labelWidthMm}mm x {labelHeightMm}mm)
              </span>
            </button>
          </div>
        </div>

        {/* FINE TUNING OPTIONS (Only for Individual/Custom labels since they are dynamic) */}
        {printMode === 'INDIVIDUAL' && (
          <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-4 space-y-4 animate-scale-in">
            <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5 border-b border-slate-200/60 pb-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              Dimensiones de la Etiqueta
            </h4>
            
            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block">Ancho Etiqueta:</label>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="number"
                      min="5"
                      max="150"
                      step="0.5"
                      value={labelWidthMm}
                      onChange={(e) => setLabelWidthMm(Math.max(5, parseFloat(e.target.value) || 5))}
                      className="w-16 p-1 bg-white border border-slate-200 rounded text-center font-bold font-mono text-indigo-600"
                    />
                    <span className="text-slate-400">mm</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block">Alto Etiqueta:</label>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="number"
                      min="5"
                      max="150"
                      step="0.5"
                      value={labelHeightMm}
                      onChange={(e) => setLabelHeightMm(Math.max(5, parseFloat(e.target.value) || 5))}
                      className="w-16 p-1 bg-white border border-slate-200 rounded text-center font-bold font-mono text-indigo-600"
                    />
                    <span className="text-slate-400">mm</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <span className="font-bold text-slate-600 block">Relleno (Margen):</span>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="number"
                      min="0"
                      max="5"
                      step="0.1"
                      value={labelPaddingMm}
                      onChange={(e) => setLabelPaddingMm(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-16 p-1 bg-white border border-slate-200 rounded text-center font-bold font-mono text-indigo-600"
                    />
                    <span className="text-slate-400">mm</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="font-bold text-slate-600 block">Tamaño Texto:</span>
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="number"
                      min="4"
                      max="24"
                      step="0.5"
                      value={fontSize}
                      onChange={(e) => setFontSize(Math.max(4, parseFloat(e.target.value) || 4))}
                      className="w-16 p-1 bg-white border border-slate-200 rounded text-center font-bold font-mono text-indigo-600"
                    />
                    <span className="text-slate-400">px</span>
                  </div>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <div className="flex justify-between font-bold text-slate-600">
                  <span>Tamaño del Código QR:</span>
                  <span className="font-mono text-indigo-600 font-extrabold">{qrSizeInMm}mm</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max={(Math.min(labelWidthMm, labelHeightMm) - 0.2).toFixed(1)}
                  step="0.1"
                  value={qrSizeInMm}
                  onChange={(e) => setQrSizeInMm(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                  <span>Mín: 3mm</span>
                  <span>Máx: {(Math.min(labelWidthMm, labelHeightMm) - 0.2).toFixed(1)}mm</span>
                </div>
              </div>
            </div>
            
            <div className="bg-amber-50 text-amber-800 text-[10px] p-2.5 rounded-lg border border-amber-100 flex gap-2">
              <AlertOctagon className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
              <p className="leading-normal">
                Para que el QR ocupe todo el espacio de marca, asigne el tamaño del QR cerca del valor máximo. Use una calidad de impresión alta (300/600 DPI) para etiquetas compactas.
              </p>
            </div>
          </div>
        )}

        {/* PRINT ACTIONS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            disabled={parsedCodes.length === 0}
            onClick={handlePrint}
            className={`py-3.5 px-4 text-white font-extrabold text-sm rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98] ${
              parsedCodes.length > 0
                ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200/50'
                : 'bg-slate-300 shadow-none cursor-not-allowed'
            }`}
          >
            <Printer className="w-4.5 h-4.5" />
            IMPRIMIR COLA
          </button>

          <button
            type="button"
            disabled={parsedCodes.length === 0 || isGeneratingPdf}
            onClick={generatePdf}
            className={`py-3.5 px-4 text-white font-extrabold text-sm rounded-xl shadow-lg flex justify-center items-center gap-2 transition-all active:scale-[0.98] ${
              parsedCodes.length > 0 && !isGeneratingPdf
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200/50'
                : 'bg-slate-300 shadow-none cursor-not-allowed'
            }`}
          >
            <FileDown className={`w-4.5 h-4.5 ${isGeneratingPdf ? 'animate-spin' : ''}`} />
            {isGeneratingPdf ? 'GENERANDO...' : 'GENERAR PDF'}
          </button>
        </div>

        {/* HOW TO USE GUIDE */}
        <div className="border-t border-slate-100 pt-4 flex gap-3 text-xs leading-normal text-slate-500">
          <Info className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-indigo-950 block">¿Cómo usar?</span>
            <p>1. Pegue sus ubicaciones.</p>
            <p>2. Configure destino y formato (A4 estándar u individual térmica ajustable).</p>
            <p>3. Use <strong>GENERAR PDF</strong> para un archivo vectorial perfecto o use <strong>IMPRIMIR COLA</strong>.</p>
          </div>
        </div>
      </div>

      {/* RIGHT: LIVE INTERACTIVE PREVIEW */}
      <div className="w-full lg:w-7/12 flex flex-col space-y-4 no-print">
        <div className="bg-slate-100 rounded-2xl p-4 border border-slate-200 flex justify-between items-center">
          <span className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
            <Layers className="w-4.5 h-4.5 text-slate-500" />
            VISTA PREVIA INTERACTIVA (EN PANTALLA)
          </span>
          <span className="py-1 px-3 bg-white text-slate-800 text-[10px] font-bold rounded-lg border border-slate-200 uppercase">
            {printMode === 'A4' ? 'A4 (3X3 GRID)' : `Individual (${labelWidthMm}x${labelHeightMm}mm)`}
          </span>
        </div>

        {parsedCodes.length === 0 ? (
          <div className="flex-1 min-h-[350px] bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col justify-center items-center p-6 text-center text-slate-400">
            <Printer className="w-16 h-16 text-slate-300 stroke-[1.5] mb-3 animate-bounce" />
            <h3 className="font-extrabold text-slate-700">Sin códigos cargados</h3>
            <p className="text-xs max-w-xs mt-1">
              Escriba o pegue una lista de códigos en el panel izquierdo para ver la simulación de impresión aquí de inmediato.
            </p>
          </div>
        ) : (
          <div className="flex-1 bg-slate-800 border-2 border-slate-900 rounded-2xl p-6 overflow-auto max-h-[750px] custom-scrollbar flex justify-center items-start">
            
            {/* A4 Screen Preview Simulation */}
            {printMode === 'A4' ? (
              <div className="space-y-6 w-full max-w-[500px]">
                {a4Pages.map((page, pIdx) => (
                  <div key={pIdx} className="bg-white rounded-xl shadow-2xl p-4 border border-slate-700 w-full aspect-[1/1.41] flex flex-col justify-between">
                    <div className="flex justify-between items-center text-[10px] text-slate-400 border-b border-slate-100 pb-2 mb-2 font-mono">
                      <span>Vista Previa A4 - Página {pIdx + 1} de {a4Pages.length}</span>
                      <span>SMART WMS</span>
                    </div>

                    <div className="grid grid-cols-3 grid-rows-3 gap-3 flex-1">
                      {Array.from({ length: 9 }).map((_, idx) => {
                        const code = page[idx];
                        if (!code) {
                          return (
                            <div key={idx} className="border border-dashed border-slate-100 rounded-lg flex items-center justify-center text-[10px] text-slate-300 bg-slate-50/50 select-none">
                              Vacío
                            </div>
                          );
                        }

                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              navigator.clipboard.writeText(code);
                              setCopiedIndex(pIdx * 9 + idx);
                              setTimeout(() => setCopiedIndex(null), 2000);
                            }}
                            className="border border-slate-200 rounded-xl p-2 flex flex-col items-center justify-center hover:bg-slate-50 transition-all cursor-pointer group active:scale-95 text-slate-900 relative"
                            title="Haz clic para copiar"
                          >
                            <span className="font-black text-[11px] truncate max-w-full text-center tracking-tight mb-1 select-text group-hover:text-indigo-600">
                              {code}
                            </span>
                            <div className="p-1 hover:scale-105 transition-transform duration-155">
                              <QRCodeCanvas
                                id={`qr-canvas-a4-${pIdx}-${idx}`}
                                value={code}
                                size={180}
                                style={{ width: '60px', height: '60px' }}
                                level="H"
                                bgColor="#ffffff"
                                fgColor="#000000"
                              />
                            </div>
                            {copiedIndex === pIdx * 9 + idx ? (
                              <span className="absolute inset-0 bg-green-600/95 rounded-xl flex items-center justify-center text-white font-bold text-[10px] gap-1 animate-scale-in">
                                <Check className="w-3.5 h-3.5" /> Copiado
                              </span>
                            ) : (
                              <span className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 text-[8px] bg-slate-900 text-white px-1.5 py-0.5 rounded transition-all">
                                Copiar
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Individual Label Space Preview */
              <div className="w-full flex flex-col items-center gap-4">
                <p className="text-[11px] text-slate-300 max-w-md text-center italic leading-relaxed">
                  Abajo tiene una simulación interactivo en tiempo real con la proporción y forma exactas. Las etiquetas impresas medirán exactamente <strong className="text-indigo-400 font-extrabold">{labelWidthMm}mm x {labelHeightMm}mm</strong> con un QR de <strong className="text-indigo-400 font-extrabold">{qrSizeInMm}mm</strong>.
                </p>
                <div className="flex flex-wrap gap-5 justify-center items-center w-full py-4">
                  {parsedCodes.map((code, idx) => {
                    const specs = getLabelSpecs(code);
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          navigator.clipboard.writeText(code);
                          setCopiedIndex(idx);
                          setTimeout(() => setCopiedIndex(null), 2000);
                        }}
                        style={{
                          width: `${previewWidth}px`,
                          height: `${previewHeight}px`,
                          padding: `${previewPadding}px`,
                        }}
                        className="bg-white border-[1.5px] border-slate-950 shadow-2xl rounded-sm flex flex-col items-center justify-center relative hover:scale-105 hover:border-indigo-600 transition-all duration-150 cursor-pointer active:scale-95 text-slate-950 text-center overflow-hidden animate-fade-in"
                        title="Haz clic para copiar"
                      >
                        <span
                          style={{
                            fontSize: `${specs.previewFontSizePx}px`,
                            marginBottom: `${specs.previewMarginBottomPx}px`,
                          }}
                          className="font-extrabold truncate max-w-full text-center text-black block leading-none select-text uppercase animate-fade-in"
                        >
                          {code}
                        </span>
                        <div className="flex items-center justify-center bg-white">
                          <QRCodeCanvas
                            id={`qr-canvas-ind-${idx}`}
                            value={code}
                            size={180}
                            style={{
                              width: `${specs.actualPreviewQrSizePx}px`,
                              height: `${specs.actualPreviewQrSizePx}px`
                            }}
                            level="H"
                            bgColor="#ffffff"
                            fgColor="#000000"
                          />
                        </div>
                        
                        {copiedIndex === idx ? (
                          <div className="absolute inset-0 bg-emerald-600/95 flex flex-col items-center justify-center text-white font-bold gap-1 animate-scale-in" style={{ fontSize: `${Math.max(7, specs.previewFontSizePx)}px` }}>
                            <Check className="w-4 h-4 text-white animate-bounce" />
                            <span>¡Copiado!</span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* --- HIDDEN PRINT AREA (Only used when printing via browser window.print()) --- */}
      <div className="hidden printable-area">
        {printMode === 'A4' ? (
          // A4 Print Layout Grid Pages 3x3
          a4Pages.map((page, pIdx) => (
            <div key={pIdx} className="a4-page">
              {Array.from({ length: 9 }).map((_, idx) => {
                const code = page[idx];
                if (!code) {
                  return <div key={idx} className="a4-qr-card border-none bg-transparent"></div>;
                }
                return (
                  <div key={idx} className="a4-qr-card">
                    <span className="a4-qr-text">{code}</span>
                    <QRCodeCanvas
                      value={code}
                      size={256} // perfect high-resolution printable QR canvas
                      level="H"
                      bgColor="#ffffff"
                      fgColor="#000000"
                      style={{ width: '130px', height: '130px' }}
                    />
                  </div>
                );
              })}
            </div>
          ))
        ) : (
          // Individual Label Prints: Customizable labels printed with template literals dynamically
          parsedCodes.map((code, idx) => {
            const specs = getLabelSpecs(code);
            return (
              <div key={idx} className="individual-label-page">
                <span className="individual-qr-text" style={{ fontSize: `${specs.printFontSizePx}px`, marginBottom: '0.2mm' }}>
                  {code}
                </span>
                <QRCodeCanvas
                  value={code}
                  size={256} // extremely clear on high-dpi thermal printers
                  level="H"
                  bgColor="#ffffff"
                  fgColor="#000000"
                  style={{
                    width: `${specs.actualPrintQrSizeMm}mm`,
                    height: `${specs.actualPrintQrSizeMm}mm`
                  }}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
    </div>
  );
};
