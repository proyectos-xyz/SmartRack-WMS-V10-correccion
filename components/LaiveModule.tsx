
import React, { useState } from 'react';
import XmlReception from './XmlReception';
import LaiveDashboard from './LaiveDashboard';
import { Product, Usuario } from '../types';
import { FileText, Monitor } from './Icons';

interface LaiveModuleProps {
    catalog: Product[];
    currentUser: Usuario | null;
    onSelectProductForReception: (product: Product, data: any) => void;
}

const LaiveModule: React.FC<LaiveModuleProps> = ({ catalog, currentUser, onSelectProductForReception }) => {
    const [activeTab, setActiveTab] = useState<'XML' | 'MONITOR'>('XML');

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Custom Tab Selector */}
            <div className="bg-white px-6 pt-4 border-b border-gray-200 shrink-0 z-30">
                <div className="flex items-center gap-6">
                    <button 
                        onClick={() => setActiveTab('XML')}
                        className={`flex items-center gap-3 pb-3 text-xs font-black uppercase tracking-[0.1em] transition-all border-b-4 ${activeTab === 'XML' ? 'border-[#009ED6] text-[#009ED6]' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                        <FileText className="w-4 h-4" />
                        CARGA DE XML
                    </button>
                    <button 
                        onClick={() => setActiveTab('MONITOR')}
                        className={`flex items-center gap-3 pb-3 text-xs font-black uppercase tracking-[0.1em] transition-all border-b-4 ${activeTab === 'MONITOR' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                    >
                        <Monitor className="w-4 h-4" />
                        MONITOREO LAIVE
                    </button>
                    
                    <div className="ml-auto hidden md:flex items-center gap-2 mb-3 bg-slate-50 px-4 py-1.5 rounded-full border border-slate-100">
                        <img 
                            src="https://i.ibb.co/dJQtnxPT/Anotaci-n-2u.png" 
                            alt="Laive" 
                            className="w-4 h-4 object-contain"
                        />
                        <span className="text-[10px] font-black text-slate-400 italic">MÓDULO EXCLUSIVO LAIVE</span>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden">
                {activeTab === 'XML' ? (
                    <XmlReception 
                        catalog={catalog} 
                        currentUser={currentUser} 
                        onSelectProductForReception={onSelectProductForReception} 
                    />
                ) : (
                    <LaiveDashboard catalog={catalog} />
                )}
            </div>
        </div>
    );
};

export default LaiveModule;
