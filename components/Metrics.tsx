
import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, AlertTriangle, UserCheck, ShieldAlert, Download } from './Icons';

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4'];

const Metrics: React.FC = () => {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAlertData();
    }, []);

    const fetchAlertData = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('alertas_recepcion')
            .select('*');
        if (!error && data) {
            setAlerts(data);
        }
        setLoading(false);
    };

    // Calculate Metrics
    const alertsByProvider = alerts.reduce((acc: any, curr) => {
        const prov = curr.proveedor || 'Sin Proveedor';
        acc[prov] = (acc[prov] || 0) + 1;
        return acc;
    }, {});

    const providerData = Object.entries(alertsByProvider)
        .map(([name, value]) => ({ name: name.substring(0, 15), value }))
        .sort((a, b) => (b.value as number) - (a.value as number))
        .slice(0, 8);

    const alertsByType = alerts.reduce((acc: any, curr) => {
        const type = curr.tipo_alerta || 'OTRO';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});

    const typeData = Object.entries(alertsByType).map(([name, value]) => ({ name, value }));

    const alertsByAuthorized = alerts.reduce((acc: any, curr) => {
        const auth = curr.autorizado_por || 'Sin Autorización';
        acc[auth] = (acc[auth] || 0) + 1;
        return acc;
    }, {});

    const authorizedData = Object.entries(alertsByAuthorized)
        .map(([name, value]) => ({ name, value }))
        .sort((a: any, b: any) => b.value - a.value);

    const receivedVsAlerted = alerts.reduce((acc: any, curr) => {
        const status = curr.recepcionado ? 'RECEPCIONADO' : 'SOLO ALERTA';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {});

    const statusData = Object.entries(receivedVsAlerted).map(([name, value]) => ({ name, value }));

    // SQL Script for user
    const sqlScript = `-- SCRIPT PARA CREAR TABLA DE ALERTAS (COPIAR Y PEGAR EN SQL EDITOR)
CREATE TABLE IF NOT EXISTS public.alertas_recepcion (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    producto_id uuid REFERENCES public.productos(id),
    codigo text NOT NULL,
    nombre text NOT NULL,
    tipo_alerta text NOT NULL, -- 'ROTACION', 'TVM', 'AMBAS'
    valor_alerta text,
    fecha_alerta timestamp with time zone DEFAULT now(),
    usuario_registro text NOT NULL,
    autorizado_por text,
    proveedor text,
    guia_factura text,
    recepcionado boolean DEFAULT false,
    fecha_vencimiento_llegada date
);

ALTER TABLE public.alertas_recepcion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated users on alertas_recepcion" 
ON public.alertas_recepcion FOR ALL TO authenticated USING (true);`;

    return (
        <div className="p-4 md:p-8 space-y-8 bg-slate-50 min-h-screen overflow-y-auto pb-24">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter uppercase italic flex items-center gap-3">
                        <TrendingUp className="w-8 h-8 text-indigo-600" />
                        Métricas de Control y Alertas
                    </h2>
                    <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest leading-none">Análisis de Calidad y Cumplimiento en Recepción</p>
                </div>
                
                <button 
                  onClick={() => {
                    const blob = new Blob([sqlScript], { type: 'text/plain' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'script_alertas.sql';
                    a.click();
                  }}
                  className="bg-slate-900 text-white px-6 py-3 rounded-2xl font-black text-[10px] uppercase flex items-center gap-2 hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
                >
                    <Download className="w-4 h-4" /> DESCARGAR SCRIPT SQL
                </button>
            </div>

            {loading ? (
                <div className="h-64 flex flex-col items-center justify-center text-slate-400 animate-pulse">
                    <ShieldAlert className="w-12 h-12 mb-2" />
                    <span className="font-black uppercase tracking-widest text-xs">Cargando métricas...</span>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Top Stats Cards */}
                    <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-indigo-100 border border-slate-100 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center text-rose-600 mb-4 shadow-inner">
                            <AlertTriangle className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Alertas Generadas</span>
                        <h4 className="text-4xl font-black text-slate-900 mt-1">{alerts.length}</h4>
                    </div>

                    <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-emerald-100 border border-slate-100 flex flex-col items-center text-center">
                        <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mb-4 shadow-inner">
                            <TrendingUp className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alertas Recepcionadas</span>
                        <h4 className="text-4xl font-black text-slate-900 mt-1">{alerts.filter(a => a.recepcionado).length}</h4>
                    </div>

                    <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-blue-100 border border-slate-100 flex flex-col items-center text-center font-bold">
                        <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 mb-4 shadow-inner">
                            <UserCheck className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest underline decoration-wavy decoration-blue-500">Alertas Detenidas</span>
                        <h4 className="text-4xl font-black text-slate-900 mt-1">{alerts.filter(a => !a.recepcionado).length}</h4>
                    </div>

                    <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-amber-100 border border-slate-100 flex flex-col items-center text-center italic">
                        <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600 mb-4 shadow-inner">
                            <ShieldAlert className="w-6 h-6" />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tasa de Excepción</span>
                        <h4 className="text-4xl font-black text-slate-900 mt-1">
                            {alerts.length > 0 ? ((alerts.filter(a => a.recepcionado).length / alerts.length) * 100).toFixed(1) : '0'}%
                        </h4>
                    </div>

                    {/* Chart: Top Providers with Alerts */}
                    <div className="md:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-50 flex flex-col h-[400px]">
                        <h5 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-8 flex items-center gap-2">
                           <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse"></div>
                           Proveedores con más incidencias
                        </h5>
                        <div className="flex-1 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={providerData} layout="vertical" margin={{ left: 0, right: 30 }}>
                                    <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="#f1f5f9" />
                                    <XAxis type="number" hide />
                                    <YAxis 
                                      dataKey="name" 
                                      type="category" 
                                      axisLine={false} 
                                      tickLine={false} 
                                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 'bold' }} 
                                    />
                                    <Tooltip 
                                      cursor={{ fill: '#f8fafc' }}
                                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                                        {providerData.map((_entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Chart: Alerts by Type */}
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-50 flex flex-col h-[400px]">
                        <h5 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-8">Alertas por Naturaleza</h5>
                        <div className="flex-1 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={typeData}
                                        cx="50%"
                                        cy="55%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={10}
                                        dataKey="value"
                                    >
                                        {typeData.map((_entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                    <Legend verticalAlign="bottom" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Chart: Received vs Only Alerted */}
                    <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-50 flex flex-col h-[400px]">
                        <h5 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-8">Estado Final de Alertas</h5>
                        <div className="flex-1 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={statusData}
                                        cx="50%"
                                        cy="55%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={10}
                                        dataKey="value"
                                    >
                                        <Cell fill="#10b981" />
                                        <Cell fill="#3b82f6" />
                                    </Pie>
                                    <Tooltip />
                                    <Legend verticalAlign="bottom" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Chart: Top Authorizers */}
                    <div className="md:col-span-2 bg-white p-8 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-50 flex flex-col h-[400px]">
                        <h5 className="text-sm font-black text-slate-800 uppercase tracking-tight mb-8 flex items-center gap-2">
                           <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                           Personal que más autoriza excepciones
                        </h5>
                        <div className="flex-1 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={authorizedData.slice(0, 5)} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '16px', border: 'none' }} />
                                    <Bar dataKey="value" fill="#8b5cf6" radius={[10, 10, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Metrics;
