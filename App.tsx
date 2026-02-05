import React, { useState, useRef, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  IconUsers, IconCalendar, IconTrophy, IconBrain, IconDashboard, IconPlus, IconTrash, IconCheck, IconX, IconAlert, IconChevronRight, IconUserPlus, IconEdit, IconClock, IconShield, IconUpload, IconDatabase, IconCloud, IconSettings, IconRefresh
} from './components/Icons';
import { 
  Player, Position, PlayerStatus, TrainingSession, Match, ViewState, AttendanceStatus, MatchSelectionStatus
} from './types';
import { INITIAL_PLAYERS, INITIAL_TRAININGS, INITIAL_MATCHES } from './constants';
import { generateTrainingPlan, generateMatchStrategy } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";
import * as XLSX from 'xlsx';

// --- Helper Components ---
const StatusBadge = ({ status }: { status: PlayerStatus }) => {
  const colors = {
    [PlayerStatus.AVAILABLE]: 'bg-green-100 text-green-800',
    [PlayerStatus.INJURED]: 'bg-red-100 text-red-800',
    [PlayerStatus.UNAVAILABLE]: 'bg-gray-100 text-gray-800',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[status]}`}>
      {status}
    </span>
  );
};

const Card = ({ children, className = '', ...props }: React.ComponentProps<'div'>) => (
  <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-6 ${className || ''}`} {...props}>
    {children}
  </div>
);

const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (saved === null) return fallback;
    return JSON.parse(saved);
  } catch (e) {
    console.error(`Erro ao carregar ${key}:`, e);
    return fallback;
  }
};

const saveState = <T,>(key: string, data: T) => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Erro ao guardar ${key}:`, e);
  }
};

// --- Modals ---

const SettingsModal = ({ onClose }: { onClose: () => void }) => {
    const [manualApiKey, setManualApiKey] = useState(localStorage.getItem('rugby_manager_api_key') || '');
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        if (!manualApiKey.trim()) {
            localStorage.removeItem('rugby_manager_api_key');
        } else {
            localStorage.setItem('rugby_manager_api_key', manualApiKey.trim());
        }
        setSaved(true);
        setTimeout(() => {
            setSaved(false);
            window.location.reload(); // Recarregar para aplicar a nova chave em todo o lado
        }, 1000);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <IconSettings className="w-6 h-6 text-slate-500" />
                        Definições Globais
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><IconX className="w-5 h-5 text-slate-400" /></button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Google Gemini API Key</label>
                        <input 
                            type="password" 
                            value={manualApiKey}
                            onChange={(e) => setManualApiKey(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Deixe vazio para usar a chave do sistema"
                        />
                        <p className="text-xs text-slate-500 mt-2">
                            Esta chave será usada para o <strong>AI Coach</strong>, <strong>Planos de Treino</strong> e <strong>Estratégias de Jogo</strong>.
                            <br/>
                            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">Obter chave gratuita no Google AI Studio</a>
                        </p>
                    </div>

                    {saved && (
                        <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm flex items-center gap-2">
                            <IconCheck className="w-4 h-4" /> Configuração guardada! A recarregar...
                        </div>
                    )}

                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                        <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg font-medium">Cancelar</button>
                        <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg font-medium shadow-sm">Guardar Alterações</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const PlayerDetailsModal = ({ 
  player, 
  trainings,
  matches,
  onClose, 
  onSave 
}: { 
  player: Player, 
  trainings: TrainingSession[],
  matches: Match[],
  onClose: () => void, 
  onSave: (p: Player) => void 
}) => {
  const [formData, setFormData] = useState<Player>({ ...player });
  const [activeTab, setActiveTab] = useState<'details' | 'stats'>('details');

  // --- Statistics Calculation ---
  
  // Training Stats
  const playerTrainings = trainings.filter(t => t.attendance[player.id]);
  const totalTrainings = playerTrainings.length;
  const presentCount = playerTrainings.filter(t => t.attendance[player.id] === AttendanceStatus.PRESENT).length;
  const attendanceRate = totalTrainings > 0 ? Math.round((presentCount / totalTrainings) * 100) : 0;
  
  const trainingDistribution = [
    { name: 'Presente', value: presentCount, color: '#10b981' }, // Emerald
    { name: 'Lesionado', value: playerTrainings.filter(t => t.attendance[player.id] === AttendanceStatus.INJURED).length, color: '#ef4444' }, // Red
    { name: 'Trabalho/Esc', value: playerTrainings.filter(t => t.attendance[player.id] === AttendanceStatus.WORK_SCHOOL).length, color: '#3b82f6' }, // Blue
    { name: 'Indisp.', value: playerTrainings.filter(t => t.attendance[player.id] === AttendanceStatus.UNAVAILABLE).length, color: '#f59e0b' }, // Amber
    { name: 'Falta', value: playerTrainings.filter(t => t.attendance[player.id] === AttendanceStatus.ABSENT).length, color: '#64748b' }, // Slate
  ].filter(d => d.value > 0);

  // Match Stats
  const totalMatches = matches.length;
  const selectedMatches = matches.filter(m => m.playerStatus[player.id] === MatchSelectionStatus.SELECTED);
  const starts = matches.filter(m => m.startingXV.includes(player.id)).length;
  const subApps = matches.filter(m => m.subs.includes(player.id)).length;
  const totalMinutes = matches.reduce((acc, m) => acc + (m.playingTime[player.id] || 0), 0);
  
  const notSelectedReasons = matches
    .filter(m => m.playerStatus[player.id] !== MatchSelectionStatus.SELECTED)
    .reduce((acc, m) => {
        const status = m.playerStatus[player.id] || MatchSelectionStatus.TECHNICAL;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'weight' || name === 'height' || name === 'caps' ? Number(value) : value
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-slate-900 p-6 flex justify-between items-center text-white shrink-0">
          <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <IconUsers className="w-5 h-5" />
                {player.name}
              </h2>
              <p className="text-slate-400 text-sm">{player.position} | {player.caps} Caps Históricas</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
            <IconX className="w-6 h-6" />
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex border-b border-slate-200 shrink-0">
            <button 
                onClick={() => setActiveTab('details')}
                className={`flex-1 py-3 font-medium text-sm transition-colors ${activeTab === 'details' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Dados Pessoais
            </button>
            <button 
                onClick={() => setActiveTab('stats')}
                className={`flex-1 py-3 font-medium text-sm transition-colors ${activeTab === 'stats' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 hover:text-slate-700'}`}
            >
                Estatísticas & Performance
            </button>
        </div>
        
        <div className="overflow-y-auto p-6">
        {activeTab === 'details' ? (
            <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Nome Completo</label>
                <input 
                    name="name" 
                    value={formData.name} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    required
                />
                </div>

                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Posição</label>
                <select 
                    name="position" 
                    value={formData.position} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                    {(Object.values(Position) as string[]).map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                </div>

                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                <select 
                    name="status" 
                    value={formData.status} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                    {(Object.values(PlayerStatus) as string[]).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                </div>

                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Data de Nascimento</label>
                <input 
                    type="date"
                    name="birthDate" 
                    value={formData.birthDate || ''} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                </div>

                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Localidade</label>
                <input 
                    type="text"
                    name="locality" 
                    value={formData.locality || ''} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Ex: Lisboa"
                />
                </div>

                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Altura (cm)</label>
                <input 
                    type="number"
                    name="height" 
                    value={formData.height || ''} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Ex: 185"
                />
                </div>

                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Peso (kg)</label>
                <input 
                    type="number"
                    name="weight" 
                    value={formData.weight || ''} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Ex: 95"
                />
                </div>

                <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Internacionalizações (Caps)</label>
                <input 
                    type="number"
                    name="caps" 
                    value={formData.caps} 
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                </div>
            </div>
            
            <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                <button type="button" onClick={onClose} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-lg transition-colors">
                Cancelar
                </button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                Guardar Alterações
                </button>
            </div>
            </form>
        ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
                {/* Highlights */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                        <p className="text-emerald-800 text-sm font-medium flex items-center gap-2"><IconCheck className="w-4 h-4"/> Assiduidade</p>
                        <p className="text-3xl font-bold text-emerald-700 mt-1">{attendanceRate}%</p>
                        <p className="text-xs text-emerald-600 mt-1">{presentCount} em {totalTrainings} treinos</p>
                    </div>
                     <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                        <p className="text-indigo-800 text-sm font-medium flex items-center gap-2"><IconClock className="w-4 h-4"/> Minutos (Época)</p>
                        <p className="text-3xl font-bold text-indigo-700 mt-1">{totalMinutes}'</p>
                        <p className="text-xs text-indigo-600 mt-1">{starts} Titular / {subApps} Suplente</p>
                    </div>
                     <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                        <p className="text-orange-800 text-sm font-medium flex items-center gap-2"><IconTrophy className="w-4 h-4"/> Convocatórias</p>
                        <p className="text-3xl font-bold text-orange-700 mt-1">{selectedMatches.length}</p>
                        <p className="text-xs text-orange-600 mt-1">em {totalMatches} jogos registados</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                        <p className="text-slate-800 text-sm font-medium flex items-center gap-2"><IconShield className="w-4 h-4"/> Posição Principal</p>
                        <p className="text-lg font-bold text-slate-700 mt-2 truncate">{player.position}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Training Chart */}
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 mb-4">Análise de Treinos</h3>
                         <div className="h-64 border border-slate-100 rounded-xl bg-slate-50/50 p-4">
                            {totalTrainings > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                        data={trainingDistribution}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        >
                                        {trainingDistribution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400 text-sm">Sem registos de treino</div>
                            )}
                        </div>
                    </div>

                    {/* Selection Breakdown */}
                    <div>
                         <h3 className="text-lg font-bold text-slate-800 mb-4">Análise de Não Convocatória</h3>
                         <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                                <span className="text-slate-600 font-medium">Lesão</span>
                                <span className="font-bold text-red-600">{notSelectedReasons[MatchSelectionStatus.INJURED] || 0} Jogos</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                                <span className="text-slate-600 font-medium">Opção Técnica</span>
                                <span className="font-bold text-slate-800">{notSelectedReasons[MatchSelectionStatus.TECHNICAL] || 0} Jogos</span>
                            </div>
                            <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg">
                                <span className="text-slate-600 font-medium">Indisponível</span>
                                <span className="font-bold text-amber-600">{notSelectedReasons[MatchSelectionStatus.UNAVAILABLE] || 0} Jogos</span>
                            </div>
                            <div className="mt-6 p-4 bg-blue-50 rounded-xl text-xs text-blue-800">
                                <p><strong>Nota do Treinador AI:</strong> {attendanceRate > 80 ? 'Excelente assiduidade. Jogador comprometido.' : 'Assiduidade abaixo do ideal, verificar motivos.'}</p>
                            </div>
                         </div>
                    </div>
                </div>
            </div>
        )}
        </div>
      </div>
    </div>
  );
};

const TrainingDetailsModal = ({ 
    training, 
    players, 
    onClose, 
    onSave 
}: { 
    training: TrainingSession, 
    players: Player[], 
    onClose: () => void, 
    onSave: (t: TrainingSession) => void 
}) => {
    const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>(training.attendance || {});
    const [activeTab, setActiveTab] = useState<'attendance' | 'plan'>('attendance');

    useEffect(() => {
        const newAttendance = { ...attendance };
        let changed = false;
        players.forEach(p => {
            if (!newAttendance[p.id]) {
                newAttendance[p.id] = AttendanceStatus.PRESENT;
                changed = true;
            }
        });
        if (changed) setAttendance(newAttendance);
    }, [players]);

    const handleStatusChange = (playerId: string, status: AttendanceStatus) => {
        setAttendance(prev => ({ ...prev, [playerId]: status }));
    };

    const handleSave = () => {
        onSave({ ...training, attendance });
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
             <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                 <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl">
                     <div>
                         <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                            <IconCalendar className="w-5 h-5 text-indigo-600" />
                            Detalhes do Treino
                         </h3>
                         <p className="text-slate-500 text-sm mt-1">{new Date(training.date).toLocaleDateString('pt-PT')} • {training.focus}</p>
                     </div>
                     <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors"><IconX className="w-6 h-6 text-slate-400 hover:text-slate-600" /></button>
                 </div>

                 {/* Tabs */}
                 <div className="flex border-b border-slate-200 shrink-0 bg-slate-50/50">
                    <button 
                        onClick={() => setActiveTab('attendance')} 
                        className={`flex-1 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'attendance' ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Presenças
                    </button>
                    <button 
                        onClick={() => setActiveTab('plan')} 
                        className={`flex-1 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'plan' ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Plano de Treino AI {training.aiPlan && <IconCheck className="w-3 h-3 inline ml-1 text-green-500"/>}
                    </button>
                 </div>
                 
                 <div className="p-0 overflow-y-auto flex-1">
                     {activeTab === 'attendance' ? (
                         <table className="w-full text-left border-collapse">
                             <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                                 <tr>
                                     <th className="px-6 py-3 text-xs font-bold uppercase text-slate-500 tracking-wider">Jogador</th>
                                     <th className="px-6 py-3 text-xs font-bold uppercase text-slate-500 tracking-wider">Posição</th>
                                     <th className="px-6 py-3 text-xs font-bold uppercase text-slate-500 tracking-wider">Presença</th>
                                 </tr>
                             </thead>
                             <tbody className="divide-y divide-slate-100">
                                 {players.map(p => (
                                     <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                         <td className="px-6 py-4 text-slate-800 font-medium">{p.name}</td>
                                         <td className="px-6 py-4 text-slate-500 text-sm">{p.position}</td>
                                         <td className="px-6 py-4">
                                             <select 
                                                value={attendance[p.id] || AttendanceStatus.PRESENT} 
                                                onChange={(e) => handleStatusChange(p.id, e.target.value as AttendanceStatus)}
                                                className={`px-3 py-1.5 rounded-lg border text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-colors
                                                    ${attendance[p.id] === AttendanceStatus.PRESENT ? 'bg-green-50 border-green-200 text-green-700' : ''}
                                                    ${attendance[p.id] === AttendanceStatus.ABSENT ? 'bg-slate-50 border-slate-200 text-slate-600' : ''}
                                                    ${attendance[p.id] === AttendanceStatus.INJURED ? 'bg-red-50 border-red-200 text-red-700' : ''}
                                                    ${attendance[p.id] === AttendanceStatus.UNAVAILABLE ? 'bg-amber-50 border-amber-200 text-amber-700' : ''}
                                                    ${attendance[p.id] === AttendanceStatus.WORK_SCHOOL ? 'bg-blue-50 border-blue-200 text-blue-700' : ''}
                                                `}
                                             >
                                                 {(Object.values(AttendanceStatus) as string[]).map(s => (
                                                     <option key={s} value={s}>{s}</option>
                                                 ))}
                                             </select>
                                         </td>
                                     </tr>
                                 ))}
                             </tbody>
                         </table>
                     ) : (
                         <div className="p-8">
                             {training.aiPlan ? (
                                <div className="prose prose-slate max-w-none prose-headings:text-indigo-800 prose-a:text-indigo-600">
                                    <ReactMarkdown>{training.aiPlan}</ReactMarkdown>
                                </div>
                             ) : (
                                <div className="text-center py-10 text-slate-400">
                                    <IconBrain className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                    <h4 className="text-lg font-medium text-slate-700 mb-2">Sem Plano Gerado</h4>
                                    <p className="text-sm max-w-xs mx-auto">Gere um plano de treino automático na lista de treinos para ver as sugestões aqui.</p>
                                </div>
                             )}
                         </div>
                     )}
                 </div>
                 
                 <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 rounded-b-xl">
                     <button onClick={onClose} className="px-5 py-2.5 text-slate-600 font-medium hover:bg-white border border-transparent hover:border-slate-200 rounded-lg transition-all">Cancelar</button>
                     <button onClick={handleSave} className="px-5 py-2.5 bg-indigo-600 text-white font-medium hover:bg-indigo-700 rounded-lg shadow-sm transition-all flex items-center gap-2">
                        <IconCheck className="w-4 h-4" />
                        Guardar Presenças
                     </button>
                 </div>
             </div>
        </div>
    );
};

const MatchDetailsModal = ({ match, players, onClose, onSave }: { match: Match, players: Player[], onClose: () => void, onSave: (m: Match) => void }) => {
    const [activeTab, setActiveTab] = useState<'selection' | 'lineup' | 'strategy'>('selection');
    const [localMatch, setLocalMatch] = useState<Match>(match);
    const [loadingStrategy, setLoadingStrategy] = useState(false);

    const updateMatch = (updates: Partial<Match>) => {
        setLocalMatch(prev => ({ ...prev, ...updates }));
    };

    const handleSelectionChange = (playerId: string, status: MatchSelectionStatus) => {
        const newStatus = { ...(localMatch.playerStatus || {}), [playerId]: status };
        let newXV = [...(localMatch.startingXV || [])];
        let newSubs = [...(localMatch.subs || [])];
        
        if (status !== MatchSelectionStatus.SELECTED) {
            newXV = newXV.map(id => id === playerId ? '' : id);
            newSubs = newSubs.filter(id => id !== playerId);
        }
        updateMatch({ playerStatus: newStatus, startingXV: newXV, subs: newSubs });
    };

    const handleLineupChange = (index: number, playerId: string, isSub: boolean = false) => {
        if (isSub) {
             const newSubs = [...(localMatch.subs || [])];
             const existingIdx = newSubs.indexOf(playerId);
             if (existingIdx !== -1) newSubs.splice(existingIdx, 1);
             while(newSubs.length < 8) newSubs.push('');
             const xvIdx = (localMatch.startingXV || []).indexOf(playerId);
             if (xvIdx !== -1) {
                  const newXV = [...(localMatch.startingXV || [])];
                  newXV[xvIdx] = '';
                  updateMatch({ startingXV: newXV });
             }
             newSubs[index] = playerId;
             updateMatch({ subs: newSubs });
        } else {
            const newXV = [...(localMatch.startingXV || [])];
            while(newXV.length < 15) newXV.push('');
            const existingXVIdx = newXV.indexOf(playerId);
            if (existingXVIdx !== -1 && existingXVIdx !== index) newXV[existingXVIdx] = '';
            let newSubs = [...(localMatch.subs || [])];
            if (newSubs.includes(playerId)) {
                newSubs = newSubs.filter(id => id !== playerId);
            }
            newXV[index] = playerId;
            updateMatch({ startingXV: newXV, subs: newSubs });
        }
    };

    const handleGenerateStrategy = async () => {
        setLoadingStrategy(true);
        const selectedPlayers = players.filter(p => localMatch.playerStatus[p.id] === MatchSelectionStatus.SELECTED);
        const strategy = await generateMatchStrategy(localMatch.opponent, selectedPlayers, localMatch.location);
        updateMatch({ strategy });
        setLoadingStrategy(false);
    };

    const POSITIONS_1_15 = [
        "1. Pilier Esq", "2. Talonador", "3. Pilier Drt", "4. 2ª Linha", "5. 2ª Linha",
        "6. Asa Cego", "7. Asa Aberto", "8. Nº 8", "9. Médio Formação", "10. Abertura",
        "11. Ponta Esq", "12. 1º Centro", "13. 2º Centro", "14. Ponta Drt", "15. Arreio"
    ];

    const selectedPool = players.filter(p => localMatch.playerStatus[p.id] === MatchSelectionStatus.SELECTED);

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
                <div className="bg-slate-900 p-6 flex justify-between items-center text-white shrink-0">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <IconTrophy className="w-5 h-5 text-yellow-500" />
                            {localMatch.opponent} <span className="text-slate-400 text-sm font-normal">({localMatch.location === 'Home' ? 'Casa' : 'Fora'})</span>
                        </h2>
                        <p className="text-slate-400 text-sm">{new Date(localMatch.date).toLocaleDateString('pt-PT')}</p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => onSave(localMatch)} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                            <IconCheck className="w-4 h-4"/> Guardar
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><IconX className="w-6 h-6" /></button>
                    </div>
                </div>

                <div className="flex border-b border-slate-200 shrink-0 bg-slate-50">
                    <button onClick={() => setActiveTab('selection')} className={`flex-1 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'selection' ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Convocatória</button>
                    <button onClick={() => setActiveTab('lineup')} className={`flex-1 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'lineup' ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Alinhamento (XV)</button>
                    <button onClick={() => setActiveTab('strategy')} className={`flex-1 py-3 font-medium text-sm transition-colors border-b-2 ${activeTab === 'strategy' ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>Estratégia AI</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                    {activeTab === 'selection' && (
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-3 text-xs font-bold uppercase text-slate-500">Jogador</th>
                                        <th className="px-6 py-3 text-xs font-bold uppercase text-slate-500">Posição</th>
                                        <th className="px-6 py-3 text-xs font-bold uppercase text-slate-500">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {players.map(p => (
                                        <tr key={p.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-3 font-medium text-slate-800">{p.name}</td>
                                            <td className="px-6 py-3 text-slate-500 text-sm">{p.position}</td>
                                            <td className="px-6 py-3">
                                                <select 
                                                    value={localMatch.playerStatus?.[p.id] || MatchSelectionStatus.TECHNICAL}
                                                    onChange={(e) => handleSelectionChange(p.id, e.target.value as MatchSelectionStatus)}
                                                    className={`px-3 py-1.5 rounded-md text-sm font-medium border focus:ring-2 focus:ring-indigo-500 outline-none
                                                        ${localMatch.playerStatus?.[p.id] === MatchSelectionStatus.SELECTED ? 'bg-green-50 border-green-200 text-green-700' : ''}
                                                        ${localMatch.playerStatus?.[p.id] === MatchSelectionStatus.INJURED ? 'bg-red-50 border-red-200 text-red-700' : ''}
                                                        ${localMatch.playerStatus?.[p.id] === MatchSelectionStatus.UNAVAILABLE ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-600'}
                                                    `}
                                                >
                                                    {(Object.values(MatchSelectionStatus) as string[]).map(s => <option key={s} value={s}>{s}</option>)}
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'lineup' && (
                        <div className="flex flex-col lg:flex-row gap-6">
                            <div className="flex-1 space-y-4">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><IconShield className="w-5 h-5"/> XV Inicial</h3>
                                {POSITIONS_1_15.map((label, idx) => (
                                    <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                        <span className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 font-bold rounded-full text-xs shrink-0">{idx + 1}</span>
                                        <div className="flex-1">
                                            <p className="text-xs text-slate-400 font-medium uppercase">{label.split('. ')[1]}</p>
                                            <select 
                                                className="w-full mt-1 p-1 bg-transparent font-medium text-slate-800 outline-none"
                                                value={localMatch.startingXV?.[idx] || ''}
                                                onChange={(e) => handleLineupChange(idx, e.target.value)}
                                            >
                                                <option value="">-- Selecionar --</option>
                                                {selectedPool.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name} ({p.position})</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="lg:w-1/3 space-y-4">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><IconUsers className="w-5 h-5"/> Suplentes</h3>
                                {Array.from({length: 8}).map((_, idx) => (
                                    <div key={idx} className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                        <span className="w-8 h-8 flex items-center justify-center bg-slate-100 text-slate-600 font-bold rounded-full text-xs shrink-0">{16 + idx}</span>
                                        <select 
                                            className="w-full bg-transparent font-medium text-slate-800 outline-none"
                                            value={localMatch.subs?.[idx] || ''}
                                            onChange={(e) => handleLineupChange(idx, e.target.value, true)}
                                        >
                                            <option value="">-- Suplente --</option>
                                            {selectedPool.map(p => (
                                                <option key={p.id} value={p.id}>{p.name} ({p.position})</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                                <div className="mt-8 p-4 bg-blue-50 rounded-xl text-sm text-blue-800">
                                    <p className="font-bold mb-1">Resumo da Seleção</p>
                                    <p>Convocados: {selectedPool.length}</p>
                                    <p>XV Inicial: {(localMatch.startingXV || []).filter(Boolean).length}/15</p>
                                    <p>Banco: {(localMatch.subs || []).filter(Boolean).length}/8</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'strategy' && (
                        <div className="h-full flex flex-col">
                            {!localMatch.strategy ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
                                    <IconBrain className="w-16 h-16 text-slate-300 mb-4" />
                                    <h3 className="text-lg font-medium text-slate-700">Sem estratégia gerada</h3>
                                    <p className="text-slate-500 mb-6 max-w-md">A Inteligência Artificial pode analisar o teu plantel convocado e o adversário para sugerir pontos chave.</p>
                                    <button 
                                        onClick={handleGenerateStrategy}
                                        disabled={loadingStrategy}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {loadingStrategy ? <IconClock className="animate-spin w-5 h-5"/> : <IconBrain className="w-5 h-5"/>}
                                        {loadingStrategy ? 'A analisar...' : 'Gerar Estratégia de Jogo'}
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm prose prose-slate max-w-none overflow-y-auto">
                                    <div className="flex justify-between items-start mb-6 not-prose">
                                        <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                                            <IconBrain className="w-6 h-6"/> Plano de Jogo
                                        </h3>
                                        <button onClick={handleGenerateStrategy} disabled={loadingStrategy} className="text-sm text-indigo-600 hover:underline">
                                            {loadingStrategy ? 'A regenerar...' : 'Regenerar'}
                                        </button>
                                    </div>
                                    <ReactMarkdown>{localMatch.strategy}</ReactMarkdown>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Database View (Firebase) ---
const DatabaseView = ({ 
    config, 
    setConfig, 
    syncStatus, 
    errorMessage 
}: { 
    config: { apiKey: string, projectId: string },
    setConfig: (c: { apiKey: string, projectId: string }) => void,
    syncStatus: string,
    errorMessage: string
}) => {
    
    const saveConfig = () => {
        localStorage.setItem('firebase_api_key', config.apiKey);
        localStorage.setItem('firebase_project_id', config.projectId);
        window.location.reload(); // Reload to re-init firebase
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-800">Base de Dados Google Firebase</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <IconSettings className="w-5 h-5 text-slate-500" /> Configuração de Ligação
                    </h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Project ID</label>
                            <input 
                                type="text" 
                                value={config.projectId} 
                                onChange={e => setConfig({...config, projectId: e.target.value})}
                                className="w-full px-3 py-2 border rounded-md text-sm" 
                                placeholder="ex: rugby-manager-123"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Web API Key (Firebase)</label>
                            <input 
                                type="password" 
                                value={config.apiKey} 
                                onChange={e => setConfig({...config, apiKey: e.target.value})}
                                className="w-full px-3 py-2 border rounded-md text-sm" 
                                placeholder="AIzaSy..."
                            />
                        </div>
                        <button onClick={saveConfig} className="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 w-full font-medium transition-colors">
                            Guardar e Conectar
                        </button>
                        <p className="text-xs text-slate-500 mt-2">Nota: Recarregue a página após alterar as chaves.</p>
                    </div>
                </Card>

                <Card>
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <IconCloud className="w-5 h-5 text-blue-500" /> Estado da Sincronização
                    </h3>
                    <div className="space-y-4">
                        <div className={`flex flex-col items-center justify-center p-6 rounded-lg border-2 border-dashed ${syncStatus === 'synced' ? 'border-green-200 bg-green-50' : syncStatus === 'error' ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-slate-50'}`}>
                            {syncStatus === 'synced' && <IconCheck className="w-12 h-12 text-green-500 mb-2" />}
                            {syncStatus === 'saving' && <IconRefresh className="w-12 h-12 text-blue-500 mb-2 animate-spin" />}
                            {syncStatus === 'error' && <IconAlert className="w-12 h-12 text-red-500 mb-2" />}
                            {(syncStatus === 'offline' || syncStatus === 'idle') && <IconCloud className="w-12 h-12 text-slate-400 mb-2" />}
                            
                            <p className="font-bold text-lg text-slate-700">
                                {syncStatus === 'synced' && 'Sincronizado'}
                                {syncStatus === 'saving' && 'A Sincronizar...'}
                                {syncStatus === 'error' && 'Erro na Ligação'}
                                {syncStatus === 'offline' && 'Desligado (Offline)'}
                                {syncStatus === 'idle' && 'A aguardar ligação...'}
                            </p>
                            {errorMessage && <p className="text-xs text-red-600 mt-2 text-center">{errorMessage}</p>}
                        </div>
                        
                        <p className="text-sm text-slate-600">
                            A sincronização é <strong>automática</strong>. 
                            Qualquer alteração feita neste dispositivo é enviada para a nuvem. 
                            Alterações feitas noutros dispositivos aparecem aqui em tempo real.
                        </p>
                    </div>
                </Card>
            </div>
        </div>
    );
};

// --- Sub-View Components ---

const DashboardView = ({ players, trainings, matches }: { players: Player[], trainings: TrainingSession[], matches: Match[] }) => {
    const totalPlayers = players.length;
    const availablePlayers = players.filter(p => p.status === PlayerStatus.AVAILABLE).length;
    const injuredPlayers = players.filter(p => p.status === PlayerStatus.INJURED).length;
    const nextMatch = matches.length > 0 
      ? matches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] 
      : null;

    const attendanceData = trainings.slice(0, 5).reverse().map(t => ({
      name: new Date(t.date).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }),
      jogadores: Object.values(t.attendance).filter(status => status === AttendanceStatus.PRESENT).length
    }));

    const statusData = [
      { name: 'Disponíveis', value: availablePlayers, color: '#22c55e' },
      { name: 'Lesionados', value: injuredPlayers, color: '#ef4444' },
      { name: 'Outros', value: totalPlayers - availablePlayers - injuredPlayers, color: '#94a3b8' },
    ];

    return (
      <div className="space-y-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-slate-800">Painel de Controlo</h2>
        
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Plantel Total</p>
                <p className="text-3xl font-bold text-slate-800">{totalPlayers}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-full text-blue-600">
                <IconUsers className="w-6 h-6" />
              </div>
            </div>
          </Card>
          <Card className="border-l-4 border-green-500">
             <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Disponíveis</p>
                <p className="text-3xl font-bold text-slate-800">{availablePlayers}</p>
              </div>
              <div className="bg-green-100 p-3 rounded-full text-green-600">
                <IconCheck className="w-6 h-6" />
              </div>
            </div>
          </Card>
          <Card className="border-l-4 border-amber-500">
             <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Próximo Jogo</p>
                <p className="text-lg font-bold text-slate-800 truncate">{nextMatch?.opponent || 'Nenhum'}</p>
                <p className="text-xs text-slate-400">
                  {nextMatch ? new Date(nextMatch.date).toLocaleDateString('pt-PT') : '-'}
                </p>
              </div>
              <div className="bg-amber-100 p-3 rounded-full text-amber-600">
                <IconTrophy className="w-6 h-6" />
              </div>
            </div>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-lg font-semibold mb-4 text-slate-700">Presenças Recentes</h3>
            {trainings.length > 0 ? (
                <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={attendanceData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b'}} />
                    <Tooltip 
                        cursor={{fill: '#f1f5f9'}}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="jogadores" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                </ResponsiveContainer>
                </div>
            ) : (
                <div className="h-64 flex items-center justify-center text-slate-400">
                    <p>Sem dados de treino.</p>
                </div>
            )}
          </Card>

          <Card>
             <h3 className="text-lg font-semibold mb-4 text-slate-700">Status do Plantel</h3>
             {totalPlayers > 0 ? (
                 <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                        data={statusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        >
                        {statusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                        </Pie>
                        <Tooltip />
                    </PieChart>
                    </ResponsiveContainer>
                </div>
             ) : (
                 <div className="h-64 flex items-center justify-center text-slate-400">
                     <p>Sem jogadores.</p>
                 </div>
             )}
          </Card>
        </div>
      </div>
    );
};

const RosterView = ({ players, trainings, matches, addPlayer, removePlayer, updatePlayer }: { players: Player[], trainings: TrainingSession[], matches: Match[], addPlayer: (p: Player) => void, removePlayer: (id: string) => void, updatePlayer: (p: Player) => void }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [newPlayerPos, setNewPlayerPos] = useState<Position>(Position.WING);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleAdd = (e: React.FormEvent) => {
      e.preventDefault();
      if (!newPlayerName) return;
      addPlayer({
        id: Date.now().toString(),
        name: newPlayerName,
        position: newPlayerPos,
        status: PlayerStatus.AVAILABLE,
        caps: 0
      });
      setNewPlayerName('');
      setIsAdding(false);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                // Obter dados como array de arrays para facilitar processamento
                const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
                processData(rows);
            } catch (error) {
                console.error("Erro ao processar ficheiro:", error);
                alert("Erro ao ler o ficheiro. Certifique-se que não está corrompido.");
            } finally {
                // Limpar o input para permitir carregar o mesmo ficheiro novamente se necessário
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    const processData = (rows: any[][]) => {
        if (!rows || rows.length < 3) {
            alert("O ficheiro parece não ter linhas suficientes (cabeçalho esperado na linha 3).");
            return;
        }

        // Especificação do utilizador: Cabeçalho na linha 3 (index 2)
        const HEADER_ROW_INDEX = 2;
        // Dados começam na linha 4 (index 3)
        const DATA_START_INDEX = 3; 

        // Safe header processing
        const headerRow = rows[HEADER_ROW_INDEX];
        if (!headerRow) {
             alert("Linha de cabeçalho (linha 3) não encontrada.");
             return;
        }

        const headers: string[] = [];
        // Use loop to handle sparse arrays correctly
        for (let i = 0; i < headerRow.length; i++) {
            const val = headerRow[i];
            headers.push(val ? String(val).toLowerCase().trim() : '');
        }
        
        // Colunas essenciais
        // Especificação do utilizador: Nome na coluna 3 (index 2 - considerando A=0, B=1, C=2)
        const nameIdx = 2;
        
        // Helper para encontrar colunas ignorando 2024 e preferindo 2025
        const findCol = (terms: string[]) => {
            // 1. Tentar encontrar com termo E "2025"
            let idx = headers.findIndex(h => terms.some(t => h.includes(t)) && h.includes('2025'));
            if (idx !== -1) return idx;
            
            // 2. Tentar encontrar com termo MAS SEM "2024"
            idx = headers.findIndex(h => terms.some(t => h.includes(t)) && !h.includes('2024'));
            return idx;
        };

        // Mapeamento opcional
        const birthDateIdx = findCol(['nascimento', 'data', 'birth']);
        const heightIdx = findCol(['altura', 'height']);
        const weightIdx = findCol(['peso', 'weight']);
        const posIdx = findCol(['posi', 'role']);
        const capsIdx = findCol(['caps', 'internacional']);

        let addedCount = 0;
        
        // Loop a começar na linha especificada
        for (let i = DATA_START_INDEX; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            
            // Validar se existe nome na coluna especificada (coluna 3 -> index 2)
            const name = String(row[nameIdx] || '').trim();
            if (!name) continue;

            // Date Parsing
            let birthDate = undefined;
            if (birthDateIdx !== -1) {
                const rawDate = row[birthDateIdx];
                // SheetJS por vezes retorna números para datas (Excel serial date)
                if (typeof rawDate === 'string') {
                    // Tentar formatos comuns DD/MM/YYYY ou YYYY-MM-DD
                    if (rawDate.includes('/')) {
                        const parts = rawDate.trim().split('/');
                        if (parts.length === 3) birthDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                    } else if (rawDate.includes('-')) {
                        birthDate = rawDate;
                    }
                }
            }

            // Stats Parsing
            let finalHeight = undefined;
            if (heightIdx !== -1) {
                const rawHeight = row[heightIdx];
                if (rawHeight) {
                    const h = parseFloat(String(rawHeight).replace(',', '.'));
                    if (!isNaN(h)) finalHeight = h < 3 ? h * 100 : h; // Converter metros para cm
                }
            }

            let finalWeight = undefined;
            if (weightIdx !== -1) {
                const rawWeight = row[weightIdx];
                if (rawWeight) {
                    const w = parseFloat(String(rawWeight).replace(',', '.'));
                    if (!isNaN(w)) finalWeight = w;
                }
            }

            // Position Inference
            let position = Position.WING; 
            const posRaw = posIdx !== -1 ? (String(row[posIdx] || '')).toUpperCase() : '';
            
            if (posRaw) {
                 if (posRaw.includes('PIL') || posRaw.includes('PROP')) position = Position.PROP;
                 else if (posRaw.includes('TAL') || posRaw.includes('HOOK')) position = Position.HOOKER;
                 else if (posRaw.includes('2') || posRaw.includes('LOCK')) position = Position.LOCK;
                 else if (posRaw.includes('ASA') || posRaw.includes('FLANK')) position = Position.FLANKER;
                 else if (posRaw.includes('8') || posRaw.includes('NO8')) position = Position.NO8;
                 else if (posRaw.includes('MEDIO') || posRaw.includes('SCRUM') || posRaw.includes('ABERTURA')) {
                     position = posRaw.includes('ABERTURA') || posRaw.includes('FLY') ? Position.FLY_HALF : Position.SCRUM_HALF;
                 }
                 else if (posRaw.includes('CENTRO') || posRaw.includes('CENTER')) position = Position.CENTRE;
                 else if (posRaw.includes('PONTA') || posRaw.includes('WING')) position = Position.WING;
                 else if (posRaw.includes('ARREIO') || posRaw.includes('FULL')) position = Position.FULLBACK;
            } else {
                 // Heurística básica se não houver posição
                 const w = finalWeight || 75;
                 const h = finalHeight || 175;
                 if (w > 100) position = Position.PROP;
                 else if (h > 185) position = Position.LOCK;
                 else if (w > 85) position = Position.FLANKER;
                 else position = Position.WING;
            }

            const caps = capsIdx !== -1 ? (parseInt(String(row[capsIdx] || '0')) || 0) : 0;

            addPlayer({
                id: `import-${Date.now()}-${i}`,
                name: name,
                position: position,
                status: PlayerStatus.AVAILABLE,
                caps: caps,
                birthDate: birthDate,
                height: finalHeight ? Math.round(finalHeight) : undefined,
                weight: finalWeight || undefined
            });
            addedCount++;
        }

        if (addedCount > 0) {
            alert(`${addedCount} jogadores importados com sucesso!`);
        } else {
            alert("Nenhum jogador encontrado. Verifique se o ficheiro tem dados nas linhas seguintes ao cabeçalho.");
        }
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-slate-800">Plantel ({players.length})</h2>
          <div className="flex gap-2">
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".csv, .xlsx, .xls" 
                className="hidden" 
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-lg transition-colors shadow-sm"
                title="Suporta Excel (.xlsx, .xls) e CSV"
            >
                <IconUpload className="w-4 h-4" />
                <span>Importar Excel/CSV</span>
            </button>
            <button 
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
            >
                <IconUserPlus className="w-4 h-4" />
                <span>Adicionar Jogador</span>
            </button>
          </div>
        </div>

        {editingPlayer && (
          <PlayerDetailsModal 
            player={editingPlayer} 
            trainings={trainings}
            matches={matches}
            onClose={() => setEditingPlayer(null)} 
            onSave={(updated) => { updatePlayer(updated); setEditingPlayer(null); }} 
          />
        )}

        {isAdding && (
          <Card className="bg-blue-50 border-blue-100 animate-in fade-in slide-in-from-top-4">
            <form onSubmit={handleAdd} className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 w-full">
                <label className="block text-sm font-medium text-blue-900 mb-1">Nome</label>
                <input 
                  type="text" 
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  className="w-full px-3 py-2 border border-blue-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ex: João Silva"
                />
              </div>
              <div className="w-full md:w-64">
                <label className="block text-sm font-medium text-blue-900 mb-1">Posição</label>
                <select 
                  value={newPlayerPos}
                  onChange={(e) => setNewPlayerPos(e.target.value as Position)}
                  className="w-full px-3 py-2 border border-blue-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(Object.values(Position) as string[]).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                 <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-blue-600 hover:bg-blue-100 rounded-md">Cancelar</button>
                 <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Guardar</button>
              </div>
            </form>
          </Card>
        )}

        {players.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                    <th className="px-6 py-4 font-semibold text-slate-600">Nome</th>
                    <th className="px-6 py-4 font-semibold text-slate-600">Posição</th>
                    <th className="px-6 py-4 font-semibold text-slate-600">Caps</th>
                    <th className="px-6 py-4 font-semibold text-slate-600">Status</th>
                    <th className="px-6 py-4 font-semibold text-slate-600 text-right">Ações</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                {players.map(player => (
                    <tr key={player.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-800">{player.name}</td>
                    <td className="px-6 py-4 text-slate-600">{player.position}</td>
                    <td className="px-6 py-4 text-slate-600">{player.caps}</td>
                    <td className="px-6 py-4">
                        <StatusBadge status={player.status} />
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                        <button 
                        onClick={() => setEditingPlayer(player)}
                        className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                        title="Editar Ficha de Jogador"
                        >
                        <IconEdit className="w-4 h-4" />
                        </button>
                        <button 
                        onClick={() => removePlayer(player.id)}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                        title="Remover Jogador"
                        >
                        <IconTrash className="w-4 h-4" />
                        </button>
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        ) : (
            <div className="text-center py-20 bg-white border border-dashed border-slate-300 rounded-xl">
                <IconUsers className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-700">Sem jogadores</h3>
                <p className="text-slate-500 mb-6">Adicione manualmente ou importe um CSV/Excel.</p>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="text-blue-600 font-medium hover:underline"
                >
                    Importar do Excel (CSV)
                </button>
            </div>
        )}
      </div>
    );
};

const TrainingView = ({ trainings, players, addTraining, updateTraining }: { trainings: TrainingSession[], players: Player[], addTraining: (t: TrainingSession) => void, updateTraining: (t: TrainingSession) => void }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newFocus, setNewFocus] = useState('');
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [selectedTraining, setSelectedTraining] = useState<TrainingSession | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate || !newFocus) return;

    // Initialize attendance for all players
    const attendance: Record<string, AttendanceStatus> = {};
    players.forEach(p => attendance[p.id] = AttendanceStatus.PRESENT);

    const newTraining: TrainingSession = {
      id: Date.now().toString(),
      date: newDate,
      focus: newFocus,
      attendance: attendance
    };

    addTraining(newTraining);
    setIsAdding(false);
    setNewDate('');
    setNewFocus('');
  };

  const handleGeneratePlan = async (training: TrainingSession) => {
    setLoadingPlanId(training.id);
    const plan = await generateTrainingPlan(
      Object.values(training.attendance).filter(s => s === AttendanceStatus.PRESENT).length,
      training.focus,
      players.map(p => p.position)
    );
    
    updateTraining({
        ...training,
        aiPlan: plan
    });
    setLoadingPlanId(null);
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Treinos</h2>
        <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          <IconPlus className="w-4 h-4" /> Novo Treino
        </button>
      </div>

      {isAdding && (
         <Card className="bg-blue-50 border-blue-100 animate-in fade-in">
           <form onSubmit={handleAdd} className="flex gap-4 items-end">
             <div className="flex-1">
               <label className="block text-sm font-medium text-blue-900 mb-1">Data</label>
               <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="w-full px-3 py-2 rounded-md border border-blue-200" required />
             </div>
             <div className="flex-[2]">
               <label className="block text-sm font-medium text-blue-900 mb-1">Foco do Treino</label>
               <input type="text" value={newFocus} onChange={e => setNewFocus(e.target.value)} className="w-full px-3 py-2 rounded-md border border-blue-200" placeholder="Ex: Defesa em linha" required />
             </div>
             <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Guardar</button>
             <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-blue-600 hover:bg-blue-100 rounded-md">Cancelar</button>
           </form>
         </Card>
      )}

      {selectedTraining && (
          <TrainingDetailsModal 
            training={selectedTraining}
            players={players}
            onClose={() => setSelectedTraining(null)}
            onSave={(updated) => {
                updateTraining(updated);
                setSelectedTraining(null);
            }}
          />
      )}

      <div className="grid gap-4">
        {trainings.slice().reverse().map(t => (
          <Card key={t.id} className="hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group" onClick={() => setSelectedTraining(t)}>
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-slate-800 group-hover:text-blue-600 transition-colors">{new Date(t.date).toLocaleDateString('pt-PT')}</h3>
                <p className="text-slate-600">{t.focus}</p>
              </div>
              <div className="flex items-center gap-4">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleGeneratePlan(t); }}
                  className={`text-sm font-medium px-3 py-1 rounded-lg transition-colors z-10 flex items-center gap-2
                    ${t.aiPlan 
                        ? 'text-green-700 bg-green-50 hover:bg-green-100 border border-green-200' 
                        : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'
                    }`}
                  disabled={loadingPlanId === t.id}
                >
                  {loadingPlanId === t.id ? (
                      <><IconRefresh className="w-4 h-4 animate-spin"/> A gerar...</>
                  ) : t.aiPlan ? (
                      <><IconCheck className="w-4 h-4"/> Regenerar Plano AI</>
                  ) : (
                      'Gerar Plano AI'
                  )}
                </button>
                <div className="text-right">
                    <div className="text-2xl font-bold text-blue-600">
                    {Object.values(t.attendance).filter(s => s === AttendanceStatus.PRESENT).length}
                    </div>
                    <div className="text-xs text-slate-400">Presentes</div>
                </div>
                <IconChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500" />
              </div>
            </div>
          </Card>
        ))}
        {trainings.length === 0 && (
            <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                <IconCalendar className="w-12 h-12 mx-auto mb-2 opacity-20" />
                Nenhum treino registado.
            </div>
        )}
      </div>
    </div>
  );
};

const MatchesView = ({ matches, players, addMatch, updateMatch }: { matches: Match[], players: Player[], addMatch: (m: Match) => void, updateMatch: (m: Match) => void }) => {
    const [isAdding, setIsAdding] = useState(false);
    const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
    const [newMatchData, setNewMatchData] = useState({ opponent: '', date: '', location: 'Home' as 'Home' | 'Away' });

    const handleAdd = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMatchData.opponent || !newMatchData.date) return;
        
        const newMatch: Match = {
            id: Date.now().toString(),
            opponent: newMatchData.opponent,
            date: newMatchData.date,
            location: newMatchData.location,
            playerStatus: {}, 
            startingXV: Array(15).fill(''),
            subs: [],
            playingTime: {}
        };
        addMatch(newMatch);
        setIsAdding(false);
        setNewMatchData({ opponent: '', date: '', location: 'Home' });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-slate-800">Gestão de Jogos</h2>
                <button onClick={() => setIsAdding(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                    <IconPlus className="w-4 h-4" /> Novo Jogo
                </button>
            </div>

            {isAdding && (
                 <Card className="bg-blue-50 border-blue-100 animate-in fade-in">
                   <form onSubmit={handleAdd} className="flex gap-4 items-end">
                     <div className="flex-[2]">
                       <label className="block text-sm font-medium text-blue-900 mb-1">Adversário</label>
                       <input 
                            type="text" 
                            value={newMatchData.opponent} 
                            onChange={e => setNewMatchData({...newMatchData, opponent: e.target.value})} 
                            className="w-full px-3 py-2 rounded-md border border-blue-200" 
                            placeholder="Ex: CDUL" 
                            required 
                        />
                     </div>
                     <div className="flex-1">
                       <label className="block text-sm font-medium text-blue-900 mb-1">Data</label>
                       <input 
                            type="date" 
                            value={newMatchData.date} 
                            onChange={e => setNewMatchData({...newMatchData, date: e.target.value})} 
                            className="w-full px-3 py-2 rounded-md border border-blue-200" 
                            required 
                        />
                     </div>
                     <div className="flex-1">
                        <label className="block text-sm font-medium text-blue-900 mb-1">Local</label>
                        <select 
                            value={newMatchData.location}
                            onChange={e => setNewMatchData({...newMatchData, location: e.target.value as 'Home'|'Away'})}
                            className="w-full px-3 py-2 rounded-md border border-blue-200"
                        >
                            <option value="Home">Casa</option>
                            <option value="Away">Fora</option>
                        </select>
                     </div>
                     <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">Guardar</button>
                     <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-blue-600 hover:bg-blue-100 rounded-md">Cancelar</button>
                   </form>
                 </Card>
            )}

            {selectedMatch && (
                <MatchDetailsModal 
                    match={selectedMatch}
                    players={players}
                    onClose={() => setSelectedMatch(null)}
                    onSave={(updated) => { updateMatch(updated); setSelectedMatch(null); }}
                />
            )}

            <div className="grid gap-4">
                {matches.slice().sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(m => (
                    <Card key={m.id} className="hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group" onClick={() => setSelectedMatch(m)}>
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-full ${m.location === 'Home' ? 'bg-indigo-100 text-indigo-600' : 'bg-orange-100 text-orange-600'}`}>
                                    <IconTrophy className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800 group-hover:text-blue-600 transition-colors">{m.opponent}</h3>
                                    <p className="text-slate-600 text-sm flex items-center gap-2">
                                        {new Date(m.date).toLocaleDateString('pt-PT')}
                                        <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                        {m.location === 'Home' ? 'Em Casa' : 'Fora'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                <div className="text-right">
                                    <p className="text-2xl font-bold text-slate-700">
                                        {Object.values(m.playerStatus).filter(s => s === MatchSelectionStatus.SELECTED).length}
                                    </p>
                                    <p className="text-xs text-slate-400">Convocados</p>
                                </div>
                                <div className="h-8 w-[1px] bg-slate-200"></div>
                                <div className="text-right">
                                     <p className="text-2xl font-bold text-slate-700">
                                        {(m.startingXV || []).filter(Boolean).length}
                                    </p>
                                    <p className="text-xs text-slate-400">XV Inicial</p>
                                </div>
                                <IconChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 ml-4" />
                            </div>
                        </div>
                    </Card>
                ))}
                {matches.length === 0 && (
                     <div className="text-center py-10 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                        <IconTrophy className="w-12 h-12 mx-auto mb-2 opacity-20" />
                        Nenhum jogo agendado.
                    </div>
                )}
            </div>
        </div>
    );
};

const AICoachView = ({ onOpenSettings }: { onOpenSettings: () => void }) => {
    const [messages, setMessages] = useState<{role: 'user' | 'model', text: string}[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [apiKeyError, setApiKeyError] = useState(false);
    const chatRef = useRef<any>(null);

    // Initial load
    useEffect(() => {
        initChat();
    }, []);

    const initChat = () => {
        setApiKeyError(false);
        // Prioridade: LocalStorage > process.env > window.GEMINI_API_KEY > fallback hardcoded
        let apiKey = localStorage.getItem('rugby_manager_api_key') || '';
        
        if (!apiKey && typeof window !== 'undefined') {
             // Tentar obter da variável global injetada
             apiKey = (window as any).GEMINI_API_KEY || (window as any).process?.env?.API_KEY;
        }

        if (!apiKey) apiKey = "AIzaSyAePgf-58mq8VvqQVM9lNGXod12ZPKByjI";

        try {
            const ai = new GoogleGenAI({ apiKey });
            chatRef.current = ai.chats.create({ 
                model: 'gemini-3-flash-preview', 
                config: { systemInstruction: 'És um treinador de rugby experiente. Ajuda com táticas, exercícios e gestão de equipa.' } 
            });
        } catch (e) {
            console.error("Erro ao iniciar chat", e);
            setMessages(p => [...p, { role: 'model', text: '⚠️ Erro ao inicializar a IA. Verifique a consola.' }]);
        }
    };

    const send = async () => {
        if(!input.trim()) return;
        const msg = input;
        setInput('');
        setMessages(p => [...p, { role: 'user', text: msg }]);
        setLoading(true);
        setApiKeyError(false);
        
        if (!chatRef.current) initChat();

        try {
            const res = await chatRef.current.sendMessage({ message: msg });
            setMessages(p => [...p, { role: 'model', text: res.text }]);
        } catch(e: any) {
            console.error("Chat Error:", e);
            let errorMsg = 'Desculpe, não consigo responder neste momento.';
            if (e.message?.includes('API key') || e.status === 403) {
                errorMsg += ' (Chave API inválida)';
                setApiKeyError(true);
            }
            else if (e.message?.includes('fetch')) errorMsg += ' (Erro de Ligação)';
            setMessages(p => [...p, { role: 'model', text: errorMsg }]);
        }
        setLoading(false);
    };

    return (
        <Card className="h-[calc(100vh-8rem)] flex flex-col p-0 overflow-hidden relative">
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                    <IconBrain className="w-5 h-5 text-indigo-600" />
                    Assistente Técnico AI
                </h3>
                <button onClick={onOpenSettings} className="text-sm text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                    <IconSettings className="w-4 h-4"/> Configurar Chave
                </button>
            </div>

            {apiKeyError && (
                <div className="bg-red-50 p-3 border-b border-red-100 flex justify-between items-center animate-in slide-in-from-top-2">
                    <div className="flex items-center gap-2 text-red-700 text-sm">
                        <IconAlert className="w-4 h-4" />
                        <span>A chave de API expirou ou é inválida.</span>
                    </div>
                    <button onClick={onOpenSettings} className="text-xs bg-white border border-red-200 text-red-700 px-3 py-1.5 rounded-md hover:bg-red-50 font-medium shadow-sm">
                        Corrigir Agora
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-4 p-4">
                {messages.length === 0 && (
                    <div className="text-center text-slate-400 mt-10">
                        <IconBrain className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Olá! Sou o teu adjunto virtual. <br/>Pergunta-me sobre exercícios de placagem, táticas de alinhamento ou gestão de fadiga.</p>
                    </div>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-3 rounded-2xl ${m.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none'} ${m.text.includes('Erro') ? 'border-2 border-red-100 bg-red-50 text-red-800' : ''}`}>
                            <div className="prose prose-sm max-w-none">
                                <ReactMarkdown>{m.text}</ReactMarkdown>
                            </div>
                        </div>
                    </div>
                ))}
                {loading && <div className="flex justify-start"><div className="bg-slate-100 px-4 py-2 rounded-2xl rounded-tl-none text-slate-500 text-sm animate-pulse">A pensar...</div></div>}
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-2 bg-white">
                <input 
                    value={input} 
                    onChange={e => setInput(e.target.value)} 
                    onKeyDown={e => e.key === 'Enter' && send()}
                    className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Escreve uma mensagem..."
                    disabled={apiKeyError}
                />
                <button onClick={send} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50" disabled={loading || apiKeyError}>
                    Enviar
                </button>
            </div>
        </Card>
    );
};

const Sidebar = ({ view, setView, syncStatus, onOpenSettings }: { view: ViewState, setView: (v: ViewState) => void, syncStatus: string, onOpenSettings: () => void }) => {
  const menuItems: { id: ViewState, label: string, icon: React.FC<any> }[] = [
    { id: 'DASHBOARD', label: 'Dashboard', icon: IconDashboard },
    { id: 'ROSTER', label: 'Plantel', icon: IconUsers },
    { id: 'TRAINING', label: 'Treinos', icon: IconCalendar },
    { id: 'MATCHES', label: 'Jogos', icon: IconTrophy },
    { id: 'AI_COACH', label: 'Assistente AI', icon: IconBrain },
    { id: 'DATA', label: 'Base de Dados', icon: IconDatabase },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col h-full shrink-0 transition-all hidden md:flex">
      <div className="p-6">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <IconTrophy className="w-6 h-6 text-yellow-500" />
          Rugby Manager
        </h1>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {menuItems.map(item => (
          <button
            key={item.id}
            onClick={() => setView(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${view === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 hover:text-white'}`}
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-6 border-t border-slate-800 space-y-4">
        <button onClick={onOpenSettings} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm">
            <IconSettings className="w-5 h-5 text-slate-400" />
            <span>Definições Globais</span>
        </button>
        <div className="flex items-center gap-2 text-xs font-medium">
             {syncStatus === 'synced' && <><span className="w-2 h-2 rounded-full bg-green-500"></span> Online</>}
             {syncStatus === 'saving' && <><span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span> A Gravar...</>}
             {syncStatus === 'offline' && <><span className="w-2 h-2 rounded-full bg-slate-500"></span> Offline</>}
             {syncStatus === 'error' && <><span className="w-2 h-2 rounded-full bg-red-500"></span> Erro Ligação</>}
        </div>
      </div>
    </aside>
  );
};

const App = () => {
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [showSettings, setShowSettings] = useState(false);
  
  // --- STATE INITIALIZATION ---
  const [players, setPlayers] = useState<Player[]>(() => loadState('rugby_manager_players', INITIAL_PLAYERS));
  const [trainings, setTrainings] = useState<TrainingSession[]>(() => loadState('rugby_manager_trainings', INITIAL_TRAININGS));
  const [matches, setMatches] = useState<Match[]>(() => loadState('rugby_manager_matches', INITIAL_MATCHES));
  
  // --- SYNC CONFIG ---
  const [firebaseConfig, setFirebaseConfig] = useState({ 
    apiKey: localStorage.getItem('firebase_api_key') || 'AIzaSyBMBM1TYgs3YrFmffEExDZ2gB3JWK2H90o', 
    projectId: localStorage.getItem('firebase_project_id') || 'rugbymanager-7cdf6' 
  });
  const [syncStatus, setSyncStatus] = useState<string>('offline');
  const [syncError, setSyncError] = useState<string>('');
  const isRemoteUpdate = useRef(false);

  // --- LOCAL PERSISTENCE ---
  useEffect(() => { saveState('rugby_manager_players', players); }, [players]);
  useEffect(() => { saveState('rugby_manager_trainings', trainings); }, [trainings]);
  useEffect(() => { saveState('rugby_manager_matches', matches); }, [matches]);

  // --- FIREBASE SYNC: LISTENER (READ) ---
  useEffect(() => {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        setSyncStatus('idle');
        return;
    }

    let unsub: any;
    try {
        const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
        const db = getFirestore(app);
        
        // Listen to document updates
        unsub = onSnapshot(
            doc(db, "backups", "rugby_manager_data"), 
            (docSnapshot) => {
                const source = docSnapshot.metadata.hasPendingWrites ? "Local" : "Server";
                if (source === "Server" && docSnapshot.exists()) {
                    const data = docSnapshot.data();
                    isRemoteUpdate.current = true; // Flag to prevent echoing back
                    if(data.players) setPlayers(data.players);
                    if(data.trainings) setTrainings(data.trainings);
                    if(data.matches) setMatches(data.matches);
                    setSyncStatus('synced');
                }
            },
            (error) => {
                console.error("Erro no listener:", error);
                setSyncStatus('error');
                setSyncError(error.message);
            }
        );
        setSyncStatus('synced');
    } catch (e: any) {
        console.error("Erro ao iniciar sync:", e);
        setSyncStatus('error');
        setSyncError(e.message);
    }

    return () => {
        if (unsub) unsub();
    };
  }, [firebaseConfig]);

  // --- FIREBASE SYNC: AUTOSAVE (WRITE) ---
  useEffect(() => {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) return;
    if (isRemoteUpdate.current) {
        isRemoteUpdate.current = false;
        return;
    }

    setSyncStatus('saving');

    const handler = setTimeout(async () => {
        try {
            const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
            const db = getFirestore(app);
            await setDoc(doc(db, "backups", "rugby_manager_data"), {
                players,
                trainings,
                matches,
                last_updated: new Date().toISOString()
            });
            setSyncStatus('synced');
        } catch (e: any) {
            console.error("Erro no autosave:", e);
            setSyncStatus('error');
        }
    }, 2000); // 2 seconds debounce

    return () => clearTimeout(handler);
  }, [players, trainings, matches, firebaseConfig]);

  // --- ACTIONS ---
  const addPlayer = (p: Player) => setPlayers(prev => [...prev, p]);
  const removePlayer = (id: string) => setPlayers(prev => prev.filter(p => p.id !== id));
  const updatePlayer = (p: Player) => setPlayers(prev => prev.map(current => current.id === p.id ? p : current));

  const addTraining = (t: TrainingSession) => setTrainings(prev => [...prev, t]);
  const updateTraining = (t: TrainingSession) => setTrainings(prev => prev.map(curr => curr.id === t.id ? t : curr));

  const addMatch = (m: Match) => setMatches(prev => [...prev, m]);
  const updateMatch = (m: Match) => setMatches(prev => prev.map(curr => curr.id === m.id ? m : curr));

  return (
    <div className="flex h-screen bg-slate-100 font-sans text-slate-900 overflow-hidden">
      <Sidebar view={view} setView={setView} syncStatus={syncStatus} onOpenSettings={() => setShowSettings(true)} />
      
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto min-h-full">
            {/* Mobile Header */}
            <div className="md:hidden mb-4 flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
                 <h1 className="font-bold text-slate-800">Rugby Manager</h1>
                 <button onClick={() => setShowSettings(true)} className="p-2 text-slate-500"><IconSettings className="w-5 h-5"/></button>
            </div>
            
            {/* Mobile View Selector */}
            <div className="md:hidden mb-4 bg-white p-2 rounded-lg shadow-sm">
                 <select 
                    value={view} 
                    onChange={(e) => setView(e.target.value as ViewState)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md px-3 py-2 text-sm"
                 >
                     <option value="DASHBOARD">Dashboard</option>
                     <option value="ROSTER">Plantel</option>
                     <option value="TRAINING">Treinos</option>
                     <option value="MATCHES">Jogos</option>
                     <option value="AI_COACH">AI Coach</option>
                     <option value="DATA">Base de Dados</option>
                 </select>
            </div>

          {view === 'DASHBOARD' && <DashboardView players={players} trainings={trainings} matches={matches} />}
          {view === 'ROSTER' && <RosterView players={players} trainings={trainings} matches={matches} addPlayer={addPlayer} removePlayer={removePlayer} updatePlayer={updatePlayer} />}
          {view === 'TRAINING' && <TrainingView trainings={trainings} players={players} addTraining={addTraining} updateTraining={updateTraining} />}
          {view === 'MATCHES' && <MatchesView matches={matches} players={players} addMatch={addMatch} updateMatch={updateMatch} />}
          {view === 'AI_COACH' && <AICoachView onOpenSettings={() => setShowSettings(true)} />}
          {view === 'DATA' && <DatabaseView config={firebaseConfig} setConfig={setFirebaseConfig} syncStatus={syncStatus} errorMessage={syncError} />}
        </div>
      </main>
    </div>
  );
};

export default App;