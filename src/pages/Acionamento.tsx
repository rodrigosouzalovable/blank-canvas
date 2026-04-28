import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { User, Building2, Mail, MapPin, ImageIcon } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { QrCode, Smartphone, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useAutoSend } from '@/hooks/useAutoSend';
import type { UazapiInstance } from '@/hooks/useAutoSend';
import { Upload, Save, Check, X, Loader2, Trash2, FileSpreadsheet, Play, Square, Settings, Wifi, WifiOff, Send, Plus, Pencil, Target, AlertTriangle, RefreshCw, Bot, MessageCircle, Copy, Calculator, Clock, CalendarClock, Download } from 'lucide-react';
import { exportarParaExcel } from '@/lib/exportExcel';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import ChatbotTemplatesTab from '@/components/ChatbotTemplatesTab';
import ChatHistoryDialog from '@/components/ChatHistoryDialog';
import LembreteMensagensDialog from '@/components/LembreteMensagensDialog';
import * as XLSX from 'xlsx';

interface ClienteData {
  cpf: string;
  nome: string;
  telefone: string;
  atraso: string;
  saldo: number;
}

interface HistoricoItem {
  id: string;
  nomeArquivo: string;
  qtdClientes: number;
  dataImportacao: string;
  clientes: ClienteData[];
}

type SendStatus = 'idle' | 'sending' | 'success' | 'error';

const getKey = (base: string, userId: string) => `${base}_${userId}`;
const MENSAGENS_BASE = 'acionamento_mensagens_salvas';
const HISTORICO_BASE = 'acionamento_historico';
const ACTIVE_BASE = 'acionamento_ativo';
const SEND_STATUS_BASE = 'acionamento_send_status';
const MANUAL_CHECKED_BASE = 'acionamento_manual_checked';
const SEND_TIMESTAMPS_BASE = 'acionamento_send_timestamps';
const AUTO_SENDING_BASE = 'acionamento_auto_sending_state';

const normalizePhoneForWhatsApp = (phone: string): string => {
  const clean = phone.replace(/\D/g, '');
  const full = clean.startsWith('55') ? clean : `55${clean}`;
  // Remove 9th digit for BR mobile: 55 + DDD(2) + 9 + 8 digits → 55 + DDD(2) + 8 digits
  if (full.length === 13 && full[4] === '9') {
    return full.slice(0, 4) + full.slice(5);
  }
  return full;
};

const normalizePairingPhone = (phone: string): string => {
  const clean = phone.replace(/\D/g, '');
  if (!clean) return '';
  return clean.startsWith('55') ? clean : `55${clean}`;
};

interface ConversaInfo {
  etapa: string;
  historico: Array<{ role: string; content: string; ts?: string }>;
}

const isToday = (isoString: string): boolean => {
  const date = new Date(isoString);
  const today = new Date();
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();
};

const formatPrimeiroNome = (nome: string): string => {
  const primeiro = nome.trim().split(/\s+/)[0].toLowerCase();
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1);
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const calcAvista = (saldo: number): string => formatCurrency(saldo * 0.5);

const calcParcelado = (saldo: number): string => {
  const valorComDesconto = saldo * 0.7;
  const opcoes: string[] = [];
  for (let i = 2; i <= 24; i++) {
    const valorParcela = valorComDesconto / i;
    if (valorParcela >= 100) {
      opcoes.push(`- ${i}x de ${formatCurrency(valorParcela)}`);
    }
  }
  return opcoes.join('\n');
};

const calcParceladoDisplay = (saldo: number): string => {
  const valorComDesconto = saldo * 0.7;
  const opcoes: { parcelas: number; valor: number }[] = [];
  for (let i = 2; i <= 24; i++) {
    const valorParcela = valorComDesconto / i;
    if (valorParcela >= 100) {
      opcoes.push({ parcelas: i, valor: valorParcela });
    }
  }
  if (opcoes.length === 0) return '—';
  if (opcoes.length === 1) return `${opcoes[0].parcelas}x de ${formatCurrency(opcoes[0].valor)}`;
  return `${opcoes[0].parcelas}x de ${formatCurrency(opcoes[0].valor)} até ${opcoes[opcoes.length - 1].parcelas}x de ${formatCurrency(opcoes[opcoes.length - 1].valor)}`;
};

const replaceVariables = (template: string, cliente: ClienteData): string =>
  template
    .replace(/\{nome\}/g, cliente.nome)
    .replace(/\{primeiro_nome\}/g, formatPrimeiroNome(cliente.nome))
    .replace(/\{cpf\}/g, cliente.cpf)
    .replace(/\{atraso\}/g, String(cliente.atraso))
    .replace(/\{saldo\}/g, formatCurrency(cliente.saldo))
    .replace(/\{avista\}/g, calcAvista(cliente.saldo))
    .replace(/\{parcelado\}/g, calcParcelado(cliente.saldo));

const variables = [
  { key: '{nome}', label: 'Nome completo' },
  { key: '{primeiro_nome}', label: 'Primeiro nome (capitalizado)' },
  { key: '{cpf}', label: 'CPF' },
  { key: '{atraso}', label: 'Atraso (dias)' },
  { key: '{saldo}', label: 'Saldo (R$)' },
  { key: '{avista}', label: 'Valor à vista (50% desc.)' },
  { key: '{parcelado}', label: 'Opções parceladas (30% desc.)' },
];

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface InstanceFormData {
  id?: string;
  nome: string;
  server_url: string;
  instance_token: string;
  whatsapp_profile_name?: string;
  whatsapp_profile_photo_url?: string;
  whatsapp_profile_description?: string;
  whatsapp_profile_address?: string;
  whatsapp_profile_email?: string;
}

function SortableInstanceCard({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="group/drag relative">
      <button
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 opacity-0 group-hover/drag:opacity-60 hover:!opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1 z-10"
        tabIndex={-1}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      <div className="pl-5">{children}</div>
    </div>
  );
}

export default function Acionamento() {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [clientes, setClientes] = useState<ClienteData[]>([]);
  const [mensagem, setMensagem] = useState('');
  const [mensagensSalvas, setMensagensSalvas] = useState<string[]>([]);
  const [lastUsedMsgIndex, setLastUsedMsgIndex] = useState<number | null>(null);
  const [sendStatus, setSendStatus] = useState<Record<number, SendStatus>>({});
  const [manualChecked, setManualChecked] = useState<Set<number>>(new Set());
  const [sendTimestamps, setSendTimestamps] = useState<Record<number, string>>({});
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [activeHistoricoId, setActiveHistoricoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pendentes' | 'enviados' | 'ia'>('pendentes');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [lembreteMensagensOpen, setLembreteMensagensOpen] = useState(false);
  
  // Relatório diário config
  const [relatorioInstanciaId, setRelatorioInstanciaId] = useState<string>('');
  const [relatorioTelefone, setRelatorioTelefone] = useState<string>('');
  const [relatorioAtivo, setRelatorioAtivo] = useState(true);
  const [salvandoRelatorio, setSalvandoRelatorio] = useState(false);
  
  // Multi-instance UAZAPI state
  const [instances, setInstances] = useState<Array<{ id: string; nome: string; server_url: string; instance_token: string; ativo: boolean; apenas_lembretes: boolean; robo: boolean; ia_responde: boolean; whatsapp_profile_name?: string; whatsapp_profile_photo_url?: string; whatsapp_profile_description?: string; whatsapp_profile_address?: string; whatsapp_profile_email?: string }>>([]);
  const [editingInstance, setEditingInstance] = useState<InstanceFormData | null>(null);
  const [savingInstance, setSavingInstance] = useState(false);
  const [testingInstanceId, setTestingInstanceId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'connected' | 'disconnected' | 'checking'>>({});
  const [checkingConnections, setCheckingConnections] = useState(false);

  // WhatsApp profile editing state
  const [profileName, setProfileName] = useState('');
  const [currentProfilePhotoUrl, setCurrentProfilePhotoUrl] = useState('');
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('');
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const [profileDescription, setProfileDescription] = useState('');
  const [profileAddress, setProfileAddress] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfileName, setSavingProfileName] = useState(false);
  const [savingProfilePhoto, setSavingProfilePhoto] = useState(false);
  const [savingProfileBusiness, setSavingProfileBusiness] = useState(false);

  // Bulk profile update state
  const [bulkUpdateConfirmOpen, setBulkUpdateConfirmOpen] = useState(false);
  const [bulkUpdateApplyName, setBulkUpdateApplyName] = useState(true);
  const [bulkUpdateApplyPhoto, setBulkUpdateApplyPhoto] = useState(true);
  const [bulkUpdateRunning, setBulkUpdateRunning] = useState(false);
  const [bulkUpdateProgress, setBulkUpdateProgress] = useState<{ current: number; total: number } | null>(null);
  const [bulkUpdateLog, setBulkUpdateLog] = useState<Array<{ id: string; nome: string; status: 'pending' | 'running' | 'success' | 'error'; message?: string }>>([]);
  const bulkCancelRef = useRef(false);
  const editFormRef = useRef<HTMLDivElement>(null);
  const editScrolledRef = useRef<string | null>(null);

  // Scroll to edit form only once when editing instance changes
  useEffect(() => {
    if (editingInstance?.id && editFormRef.current && editScrolledRef.current !== editingInstance.id) {
      editScrolledRef.current = editingInstance.id;
      editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (!editingInstance?.id) {
      editScrolledRef.current = null;
    }
  }, [editingInstance?.id]);

  // QR Code connection state
  const [qrLoading, setQrLoading] = useState(false);
  const [webhookAllLoading, setWebhookAllLoading] = useState(false);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [qrPolling, setQrPolling] = useState(false);
  const [qrStep, setQrStep] = useState<'idle' | 'qr' | 'manual'>('idle');
  const [qrCountdown, setQrCountdown] = useState(60);
  const [createdInstanceId, setCreatedInstanceId] = useState<string | null>(null);
  const [reconnectingInstanceId, setReconnectingInstanceId] = useState<string | null>(null);
  const [connectMethod, setConnectMethod] = useState<'qr' | 'code'>('qr');
  const [pairingPhone, setPairingPhone] = useState('');
  const qrPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [autoMinSec, setAutoMinSec] = useState(10);
  const [autoMaxSec, setAutoMaxSec] = useState(30);

  // WhatsApp number verification state
  const [verificandoWhatsApp, setVerificandoWhatsApp] = useState(false);
  const [verificacaoProgresso, setVerificacaoProgresso] = useState<{ checked: number; total: number } | null>(null);
  const [numerosInvalidos, setNumerosInvalidos] = useState<ClienteData[]>([]);
  const [mostrarInvalidos, setMostrarInvalidos] = useState(false);
  const [verificacaoConcluida, setVerificacaoConcluida] = useState(false);
  
  // Scheduling state
  const [agendamentos, setAgendamentos] = useState<Array<{ id: string; agendado_para: string; status: string; total_enviados: number; total_erros: number; historico_data: any }>>([]);
  const [agendandoEnvio, setAgendandoEnvio] = useState(false);
  const [agendamentoData, setAgendamentoData] = useState('');
  const [agendamentoHora, setAgendamentoHora] = useState('08:00');
  
  // Conversation tracking state
  const [conversasMap, setConversasMap] = useState<Record<string, ConversaInfo>>({});
  const [chatDialogOpen, setChatDialogOpen] = useState(false);
  const [selectedConversa, setSelectedConversa] = useState<{ etapa: string; historico: Array<{ role: string; content: string; ts?: string }>; telefone: string; clienteNome: string } | null>(null);
  
  const activeHistoricoIdRef = useRef<string | null>(null);
  const { autoSending, autoProgress, sendStatus: contextSendStatus, sendTimestamps: contextSendTimestamps, startAutoSend, stopAutoSend } = useAutoSend();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uid = user?.id || '';
  const MENSAGENS_KEY = getKey(MENSAGENS_BASE, uid);
  const HISTORICO_KEY = getKey(HISTORICO_BASE, uid);
  const ACTIVE_KEY = getKey(ACTIVE_BASE, uid);
  const SEND_STATUS_KEY = getKey(SEND_STATUS_BASE, uid);
  const MANUAL_CHECKED_KEY = getKey(MANUAL_CHECKED_BASE, uid);
  const SEND_TIMESTAMPS_KEY = getKey(SEND_TIMESTAMPS_BASE, uid);
  const AUTO_SENDING_KEY = getKey(AUTO_SENDING_BASE, uid);

  useEffect(() => {
    activeHistoricoIdRef.current = activeHistoricoId;
  }, [activeHistoricoId]);

  // Load saved data
  useEffect(() => {
    if (!user) return;
    const savedMsgs = localStorage.getItem(MENSAGENS_KEY);
    if (savedMsgs) {
      try { setMensagensSalvas(JSON.parse(savedMsgs)); } catch {}
    }
    const savedHist = localStorage.getItem(HISTORICO_KEY);
    let parsedHist: HistoricoItem[] = [];
    if (savedHist) {
      try { parsedHist = JSON.parse(savedHist); setHistorico(parsedHist); } catch {}
    }
    const savedActiveId = localStorage.getItem(ACTIVE_KEY);
    if (savedActiveId && parsedHist.length > 0) {
      const activeItem = parsedHist.find(h => h.id === savedActiveId);
      if (activeItem) {
        setClientes(activeItem.clientes);
        setActiveHistoricoId(savedActiveId);
        const savedStatus = localStorage.getItem(`${SEND_STATUS_KEY}_${savedActiveId}`);
        if (savedStatus) {
          try { setSendStatus(JSON.parse(savedStatus)); } catch {}
        }
        const savedManual = localStorage.getItem(`${MANUAL_CHECKED_KEY}_${savedActiveId}`);
        if (savedManual) {
          try { setManualChecked(new Set(JSON.parse(savedManual))); } catch {}
        }
        const savedTs = localStorage.getItem(`${SEND_TIMESTAMPS_KEY}_${savedActiveId}`);
        if (savedTs) {
          try { setSendTimestamps(JSON.parse(savedTs)); } catch {}
        }
      }
    }
    localStorage.removeItem(AUTO_SENDING_KEY);
  }, [user]);

  // Fetch UAZAPI instances from database
  useEffect(() => {
    if (!user) return;
    const fetchInstances = async () => {
      const { data } = await supabase
        .from('user_whatsapp_instances' as any)
        .select('id, nome, server_url, instance_token, ativo, apenas_lembretes, robo, ia_responde, whatsapp_profile_name, whatsapp_profile_photo_url, whatsapp_profile_description, whatsapp_profile_address, whatsapp_profile_email')
        .eq('user_id', user.id)
        .order('ordem' as any, { ascending: true })
        .order('criado_em', { ascending: false });
      if (data) {
        setInstances(data as any);
      }
    };
    fetchInstances();
  }, [user]);


  // Load relatório diário config
  useEffect(() => {
    if (!user || !isAdmin) return;
    const loadRelatorioConfig = async () => {
      const { data } = await supabase
        .from('relatorio_diario_config' as any)
        .select('*')
        .limit(1)
        .maybeSingle();
      if (data) {
        setRelatorioInstanciaId((data as any).instancia_id || '');
        setRelatorioTelefone((data as any).telefone_destino || '');
        setRelatorioAtivo((data as any).ativo ?? true);
      }
    };
    loadRelatorioConfig();
  }, [user, isAdmin]);

  const handleSalvarRelatorio = async () => {
    if (!relatorioInstanciaId || !relatorioTelefone) {
      toast.error('Selecione uma instância e informe o telefone destino');
      return;
    }
    setSalvandoRelatorio(true);
    try {
      const { data: existing } = await supabase
        .from('relatorio_diario_config' as any)
        .select('id')
        .limit(1)
        .maybeSingle();
      
      if (existing) {
        await supabase
          .from('relatorio_diario_config' as any)
          .update({
            instancia_id: relatorioInstanciaId,
            telefone_destino: relatorioTelefone,
            ativo: relatorioAtivo,
            atualizado_em: new Date().toISOString(),
          } as any)
          .eq('id', (existing as any).id);
      } else {
        await supabase
          .from('relatorio_diario_config' as any)
          .insert({
            instancia_id: relatorioInstanciaId,
            telefone_destino: relatorioTelefone,
            ativo: relatorioAtivo,
          } as any);
      }
      toast.success('Configuração do relatório salva!');
    } catch (err) {
      toast.error('Erro ao salvar configuração');
    } finally {
      setSalvandoRelatorio(false);
    }
  };

  const exportClientes = (lista: ClienteData[], prefixo: string) => {
    if (lista.length === 0) {
      toast.info('Nenhum contato para exportar');
      return;
    }
    const hoje = new Date().toISOString().slice(0, 10);
    exportarParaExcel<ClienteData>(
      lista,
      [
        { chave: 'cpf', titulo: 'CPF' },
        { chave: 'nome', titulo: 'Nome' },
        { chave: 'telefone', titulo: 'Telefone' },
        { chave: 'atraso', titulo: 'Atraso' },
        { chave: 'saldo', titulo: 'Saldo' },
      ],
      `${prefixo}-${hoje}`
    );
    toast.success(`Planilha "${prefixo}" baixada com ${lista.length} contato(s)`);
  };

  const handleDownloadComWhatsApp = () => exportClientes(clientes, 'contatos-com-whatsapp');
  const handleDownloadSemWhatsApp = () => exportClientes(numerosInvalidos, 'contatos-sem-whatsapp');

  const checkInstanceConnections = useCallback(async (instancesToCheck: typeof instances) => {
    const activeOnes = instancesToCheck.filter(i => i.ativo);
    if (activeOnes.length === 0) return;

    setCheckingConnections(true);
    const initialStatus: Record<string, 'connected' | 'disconnected' | 'checking'> = {};
    activeOnes.forEach(i => { initialStatus[i.id] = 'checking'; });
    setConnectionStatus(prev => ({ ...prev, ...initialStatus }));

    const results = await Promise.all(activeOnes.map(async (inst) => {
      try {
        const { data, error } = await supabase.functions.invoke('test-uazapi-connection', {
          body: { server_url: inst.server_url, instance_token: inst.instance_token }
        });
        if (error) throw error;
        const isConnected = data?.ok && data?.data?.status?.connected === true;
        setConnectionStatus(prev => ({ ...prev, [inst.id]: isConnected ? 'connected' : 'disconnected' }));
        return { id: inst.id, connected: isConnected };
      } catch {
        setConnectionStatus(prev => ({ ...prev, [inst.id]: 'disconnected' }));
        return { id: inst.id, connected: false };
      }
    }));

    // Sync ativo flag in database based on real connection status
    for (const result of results) {
      const inst = activeOnes.find(i => i.id === result.id);
      if (!inst) continue;
      if (!result.connected && inst.ativo) {
        await supabase.from('user_whatsapp_instances' as any).update({ ativo: false } as any).eq('id', result.id);
      }
    }
    // Also re-activate instances that were marked inactive but are now connected
    const inactiveOnes = instancesToCheck.filter(i => !i.ativo);
    for (const inst of inactiveOnes) {
      try {
        const { data } = await supabase.functions.invoke('test-uazapi-connection', {
          body: { server_url: inst.server_url, instance_token: inst.instance_token }
        });
        if (data?.ok && data?.data?.status?.connected === true) {
          await supabase.from('user_whatsapp_instances' as any).update({ ativo: true } as any).eq('id', inst.id);
          setConnectionStatus(prev => ({ ...prev, [inst.id]: 'connected' }));
        }
      } catch {}
    }
    setCheckingConnections(false);
  }, []);

  // Check connections when instances are loaded
  useEffect(() => {
    if (instances.length > 0) {
      checkInstanceConnections(instances);
    }
  }, [instances, checkInstanceConnections]);

  const disconnectedInstances = useMemo(() => 
    instances.filter(i => i.ativo && connectionStatus[i.id] === 'disconnected'),
    [instances, connectionStatus]
  );

  const connectedCount = useMemo(() => 
    instances.filter(i => connectionStatus[i.id] === 'connected').length,
    [instances, connectionStatus]
  );

  const activeInstances = useMemo(() => 
    instances.filter(i => i.ativo && connectionStatus[i.id] === 'connected' && !i.apenas_lembretes && i.robo), 
    [instances, connectionStatus]
  );

  const saveManualChecked = (checked: Set<number>) => {
    setManualChecked(checked);
    if (activeHistoricoId) {
      localStorage.setItem(`${MANUAL_CHECKED_KEY}_${activeHistoricoId}`, JSON.stringify([...checked]));
    }
  };

  const saveSendTimestamps = (timestamps: Record<number, string>) => {
    setSendTimestamps(timestamps);
    if (activeHistoricoId) {
      localStorage.setItem(`${SEND_TIMESTAMPS_KEY}_${activeHistoricoId}`, JSON.stringify(timestamps));
    }
  };

  const saveHistorico = (items: HistoricoItem[]) => {
    setHistorico(items);
    localStorage.setItem(HISTORICO_KEY, JSON.stringify(items));
  };

  const saveMensagens = (msgs: string[]) => {
    setMensagensSalvas(msgs);
    localStorage.setItem(MENSAGENS_KEY, JSON.stringify(msgs));
  };

  const handleSaveMessage = () => {
    if (!mensagem.trim()) {
      toast.error('Digite uma mensagem antes de salvar');
      return;
    }
    saveMensagens([...mensagensSalvas, mensagem.trim()]);
    setMensagem('');
    toast.success('Mensagem salva!');
  };

  const handleDeleteMessage = (index: number) => {
    const updated = mensagensSalvas.filter((_, i) => i !== index);
    saveMensagens(updated);
    if (lastUsedMsgIndex !== null) {
      if (index === lastUsedMsgIndex) setLastUsedMsgIndex(null);
      else if (index < lastUsedMsgIndex) setLastUsedMsgIndex(lastUsedMsgIndex - 1);
    }
    toast.success('Mensagem removida');
  };

  const insertVariable = (variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = mensagem.slice(0, start) + variable + mensagem.slice(end);
    setMensagem(newValue);
    setTimeout(() => {
      textarea.focus();
      const pos = start + variable.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const parsed: ClienteData[] = [];

      // Detect layout: if first data row has only 2 columns or header matches Nome/Telefone
      const headerRow = rows[0] ?? [];
      const firstDataRow = rows[1] ?? [];
      const isSimpleLayout = (
        (headerRow.length === 2) ||
        (firstDataRow.length >= 2 && firstDataRow.length < 5) ||
        (String(headerRow[0] ?? '').toLowerCase().includes('nome') && String(headerRow[1] ?? '').toLowerCase().includes('tel'))
      );

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length < 2) continue;

        if (isSimpleLayout) {
          const rawTelefone = String(row[1] ?? '').replace(/\D/g, '');
          if (!rawTelefone) continue;
          const telefone = rawTelefone.startsWith('55') ? rawTelefone : `55${rawTelefone}`;
          parsed.push({
            cpf: '',
            nome: String(row[0] ?? ''),
            telefone,
            atraso: '',
            saldo: 0,
          });
        } else {
          if (row.length < 5) continue;
          const rawTelefone = String(row[2] ?? '').replace(/\D/g, '');
          if (!rawTelefone) continue;
          const telefone = rawTelefone.startsWith('55') ? rawTelefone : `55${rawTelefone}`;
          parsed.push({
            cpf: String(row[0] ?? ''),
            nome: String(row[1] ?? ''),
            telefone,
            atraso: String(row[3] ?? ''),
            saldo: Number(row[4]) || 0,
          });
        }
      }

      setClientes(parsed);
      setSendStatus({});
      setManualChecked(new Set());
      setSendTimestamps({});

      const newItem: HistoricoItem = {
        id: crypto.randomUUID(),
        nomeArquivo: fileName,
        qtdClientes: parsed.length,
        dataImportacao: new Date().toISOString(),
        clientes: parsed,
      };
      setActiveHistoricoId(newItem.id);
      localStorage.setItem(ACTIVE_KEY, newItem.id);
      localStorage.removeItem(`${SEND_STATUS_KEY}_${newItem.id}`);
      localStorage.removeItem(`${MANUAL_CHECKED_KEY}_${newItem.id}`);
      localStorage.removeItem(`${SEND_TIMESTAMPS_KEY}_${newItem.id}`);
      saveHistorico([newItem, ...historico]);
      toast.success(`${parsed.length} clientes importados`);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleLoadHistorico = (item: HistoricoItem) => {
    setClientes(item.clientes);
    setActiveHistoricoId(item.id);
    localStorage.setItem(ACTIVE_KEY, item.id);
    const savedStatus = localStorage.getItem(`${SEND_STATUS_KEY}_${item.id}`);
    if (savedStatus) {
      try { setSendStatus(JSON.parse(savedStatus)); } catch { setSendStatus({}); }
    } else {
      setSendStatus({});
    }
    const savedManual = localStorage.getItem(`${MANUAL_CHECKED_KEY}_${item.id}`);
    if (savedManual) {
      try { setManualChecked(new Set(JSON.parse(savedManual))); } catch { setManualChecked(new Set()); }
    } else {
      setManualChecked(new Set());
    }
    const savedTs = localStorage.getItem(`${SEND_TIMESTAMPS_KEY}_${item.id}`);
    if (savedTs) {
      try { setSendTimestamps(JSON.parse(savedTs)); } catch { setSendTimestamps({}); }
    } else {
      setSendTimestamps({});
    }
    toast.success(`Planilha "${item.nomeArquivo}" carregada`);
  };

  const handleDeleteHistorico = (id: string) => {
    const updated = historico.filter((h) => h.id !== id);
    saveHistorico(updated);
    localStorage.removeItem(`${SEND_STATUS_KEY}_${id}`);
    localStorage.removeItem(`${MANUAL_CHECKED_KEY}_${id}`);
    localStorage.removeItem(`${SEND_TIMESTAMPS_KEY}_${id}`);
    if (activeHistoricoId === id) {
      setClientes([]);
      setSendStatus({});
      setManualChecked(new Set());
      setSendTimestamps({});
      setActiveHistoricoId(null);
      localStorage.removeItem(ACTIVE_KEY);
    }
    toast.success('Planilha removida do histórico');
  };

  const handleVerificarWhatsApp = async () => {
    if (clientes.length === 0) return;
    const connectedInstance = instances.find(i => i.ativo && connectionStatus[i.id] === 'connected');
    if (!connectedInstance) {
      toast.error('Nenhuma instância WhatsApp conectada para verificar os números');
      return;
    }

    setVerificandoWhatsApp(true);
    setVerificacaoProgresso({ checked: 0, total: clientes.length });
    setNumerosInvalidos([]);
    setVerificacaoConcluida(false);

    try {
      const telefones = clientes.map(c => c.telefone);
      const { data, error } = await supabase.functions.invoke('check-whatsapp-numbers', {
        body: {
          numbers: telefones,
          server_url: connectedInstance.server_url,
          instance_token: connectedInstance.instance_token,
        },
      });

      if (error) throw error;

      if (data?.invalid && Array.isArray(data.invalid)) {
        const invalidSet = new Set(data.invalid.map((n: string) => n.replace(/\D/g, '')));
        const removidos: ClienteData[] = [];
        const mantidos: ClienteData[] = [];

        clientes.forEach(c => {
          const cleanPhone = c.telefone.replace(/\D/g, '');
          const fullPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
          if (invalidSet.has(cleanPhone) || invalidSet.has(fullPhone)) {
            removidos.push(c);
          } else {
            mantidos.push(c);
          }
        });

        setNumerosInvalidos(removidos);
        setClientes(mantidos);
        setSendStatus({});
        setManualChecked(new Set());
        setSendTimestamps({});

        // Update historico
        if (activeHistoricoId) {
          const updated = historico.map(h =>
            h.id === activeHistoricoId ? { ...h, clientes: mantidos, qtdClientes: mantidos.length } : h
          );
          saveHistorico(updated);
        }

        setVerificacaoConcluida(true);
        toast.success(`Verificação concluída: ${mantidos.length} válidos, ${removidos.length} sem WhatsApp removidos`);
      } else {
        toast.info('Verificação concluída — todos os números parecem válidos');
        setVerificacaoConcluida(true);
      }
    } catch (err: any) {
      toast.error(`Erro na verificação: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setVerificandoWhatsApp(false);
      setVerificacaoProgresso(null);
    }
  };

  const handleManualCheck = (originalIndex: number, checked: boolean) => {
    const next = new Set(manualChecked);
    if (checked) {
      next.add(originalIndex);
      const nextTs = { ...sendTimestamps, [originalIndex]: new Date().toISOString() };
      saveSendTimestamps(nextTs);
    } else {
      next.delete(originalIndex);
    }
    saveManualChecked(next);
  };

  const getRotatedMessage = (): string | null => {
    if (mensagensSalvas.length === 0) return null;
    if (mensagensSalvas.length === 1) { setLastUsedMsgIndex(0); return mensagensSalvas[0]; }
    let newIndex: number;
    do {
      newIndex = Math.floor(Math.random() * mensagensSalvas.length);
    } while (newIndex === lastUsedMsgIndex);
    setLastUsedMsgIndex(newIndex);
    return mensagensSalvas[newIndex];
  };

  const getFirstActiveConfig = (): UazapiInstance | null => {
    if (activeInstances.length > 0) {
      return { id: activeInstances[0].id, server_url: activeInstances[0].server_url, instance_token: activeInstances[0].instance_token, nome: activeInstances[0].nome };
    }
    return null;
  };

  const handleSend = async (index: number) => {
    const template = getRotatedMessage();
    if (!template) {
      toast.error('Salve pelo menos uma mensagem antes de enviar');
      return;
    }
    if (activeInstances.length === 0) {
      toast.error('Nenhuma instância WhatsApp do tipo Robô está conectada. Conecte uma instância antes de enviar.');
      return;
    }

    const cliente = clientes[index];
    setSendStatus((prev) => ({ ...prev, [index]: 'sending' }));

    try {
      const msg = replaceVariables(template, cliente);
      const body: any = { telefone: cliente.telefone, mensagem: msg };
      const config = getFirstActiveConfig();
      if (config) {
        body.uazapi_server_url = config.server_url;
        body.uazapi_instance_token = config.instance_token;
        if (config.id) body.instancia_id = config.id;
      }
      const { data, error } = await supabase.functions.invoke('send-whatsapp', { body });

      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Erro');
      setSendStatus((prev) => {
        const next = { ...prev, [index]: 'success' as SendStatus };
        const hId = activeHistoricoIdRef.current;
        if (hId) localStorage.setItem(`${SEND_STATUS_KEY}_${hId}`, JSON.stringify(next));
        return next;
      });
      setSendTimestamps((prev) => {
        const next = { ...prev, [index]: new Date().toISOString() };
        const hId = activeHistoricoIdRef.current;
        if (hId) localStorage.setItem(`${SEND_TIMESTAMPS_KEY}_${hId}`, JSON.stringify(next));
        return next;
      });
      toast.success(`Mensagem enviada para ${formatPrimeiroNome(cliente.nome)}`);
    } catch (err: any) {
      setSendStatus((prev) => {
        const next = { ...prev, [index]: 'error' as SendStatus };
        const hId = activeHistoricoIdRef.current;
        if (hId) localStorage.setItem(`${SEND_STATUS_KEY}_${hId}`, JSON.stringify(next));
        return next;
      });
      toast.error(`Falha ao enviar para ${formatPrimeiroNome(cliente.nome)}: ${err.message}`);
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  // Sync context sendStatus/sendTimestamps into local state when auto-sending
  useEffect(() => {
    if (autoSending) {
      setSendStatus(contextSendStatus);
    }
  }, [autoSending, contextSendStatus]);

  useEffect(() => {
    if (autoSending) {
      setSendTimestamps(contextSendTimestamps);
    }
  }, [autoSending, contextSendTimestamps]);

  // When auto-send finishes, switch to enviados tab
  const prevAutoSending = useRef(autoSending);
  useEffect(() => {
    if (prevAutoSending.current && !autoSending) {
      setActiveTab('enviados');
    }
    prevAutoSending.current = autoSending;
  }, [autoSending]);

  const handleAutoSend = () => {
    if (mensagensSalvas.length === 0) {
      toast.error('Salve pelo menos uma mensagem antes de iniciar');
      return;
    }
    if (autoMinSec < 1) {
      toast.error('O tempo mínimo deve ser pelo menos 1 segundo');
      return;
    }
    if (autoMaxSec <= autoMinSec) {
      toast.error('O tempo máximo deve ser maior que o mínimo');
      return;
    }
    if (activeInstances.length === 0) {
      toast.error('Nenhuma instância WhatsApp do tipo Robô está conectada. Conecte uma instância antes de enviar.');
      return;
    }

    // Build configs array from active instances
    const configs: UazapiInstance[] = activeInstances.map(i => ({
      id: i.id,
      server_url: i.server_url,
      instance_token: i.instance_token,
      nome: i.nome,
    }));

    startAutoSend({
      clientes,
      mensagensSalvas,
      uazapiConfigs: configs,
      minSec: autoMinSec,
      maxSec: autoMaxSec,
      historicoId: activeHistoricoId,
      userId: uid,
      existingStatus: sendStatus,
      existingChecked: manualChecked,
    });
  };

  const handleStopAutoSend = () => {
    stopAutoSend();
  };

  const handleCalcInterval = () => {
    const numRobos = activeInstances.length;
    if (numRobos === 0) {
      toast.error('Nenhuma instância Robô conectada para calcular');
      return;
    }
    const intervaloMedio = 36000 / (30 * numRobos);
    const min = Math.max(1, Math.floor(intervaloMedio * 0.8));
    const max = Math.ceil(intervaloMedio * 1.2);
    setAutoMinSec(min);
    setAutoMaxSec(max);
    toast.success(`Intervalo calculado: ${min}s a ${max}s (~30 msgs/número/dia, 8h-18h)`);
  };

  // Fetch agendamentos
  const fetchAgendamentos = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('acionamento_agendamentos')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pendente', 'executando'])
      .order('agendado_para', { ascending: true });
    if (data) setAgendamentos(data as any);
  }, [user]);

  useEffect(() => {
    fetchAgendamentos();
  }, [fetchAgendamentos]);

  const handleAgendar = async () => {
    if (!user || !agendamentoData || !agendamentoHora) {
      toast.error('Selecione data e hora para agendar');
      return;
    }
    if (mensagensSalvas.length === 0) {
      toast.error('Salve pelo menos uma mensagem antes de agendar');
      return;
    }
    if (clientes.length === 0) {
      toast.error('Importe uma planilha de clientes antes de agendar');
      return;
    }

    setAgendandoEnvio(true);
    try {
      const agendadoPara = new Date(`${agendamentoData}T${agendamentoHora}:00`).toISOString();
      
      // Filter only pending clients
      const pendingClientes = clientes.filter((_, i) => 
        sendStatus[i] !== 'success' && sendStatus[i] !== 'error' && !manualChecked.has(i)
      );

      if (pendingClientes.length === 0) {
        toast.error('Não há clientes pendentes para agendar');
        return;
      }

      const { error } = await supabase
        .from('acionamento_agendamentos')
        .insert({
          user_id: user.id,
          historico_data: { clientes: pendingClientes, mensagens: mensagensSalvas },
          agendado_para: agendadoPara,
          min_sec: autoMinSec,
          max_sec: autoMaxSec,
        } as any);

      if (error) throw error;
      toast.success(`Envio agendado para ${agendamentoData} às ${agendamentoHora}`);
      setAgendamentoData('');
      setAgendamentoHora('08:00');
      fetchAgendamentos();
    } catch (err: any) {
      toast.error(`Erro ao agendar: ${err.message}`);
    } finally {
      setAgendandoEnvio(false);
    }
  };

  const handleCancelAgendamento = async (agendamentoId: string) => {
    const { error } = await supabase
      .from('acionamento_agendamentos')
      .update({ status: 'cancelado' } as any)
      .eq('id', agendamentoId);
    if (error) {
      toast.error('Erro ao cancelar');
    } else {
      toast.success('Agendamento cancelado');
      fetchAgendamentos();
    }
  };

  const clientesComIndex = useMemo(
    () => clientes.map((c, i) => ({ ...c, originalIndex: i })),
    [clientes]
  );

  const pendentes = useMemo(
    () => clientesComIndex.filter(c => sendStatus[c.originalIndex] !== 'success' && sendStatus[c.originalIndex] !== 'error' && !manualChecked.has(c.originalIndex)),
    [clientesComIndex, sendStatus, manualChecked]
  );

  const enviados = useMemo(
    () => clientesComIndex.filter(c => sendStatus[c.originalIndex] === 'success' || sendStatus[c.originalIndex] === 'error' || manualChecked.has(c.originalIndex)),
    [clientesComIndex, sendStatus, manualChecked]
  );

  const enviadosHoje = useMemo(
    () => enviados.filter(c => {
      const ts = sendTimestamps[c.originalIndex];
      return ts && isToday(ts);
    }).length,
    [enviados, sendTimestamps]
  );

  // Fetch conversation states for enviados phones (polling every 30s)
  const fetchConversas = useCallback(async () => {
    if (enviados.length === 0) return;
    const phones = enviados.map(c => normalizePhoneForWhatsApp(c.telefone));
    const uniquePhones = [...new Set(phones)];
    if (uniquePhones.length === 0) return;

    const { data, error } = await supabase
      .from('chatbot_conversas')
      .select('telefone, etapa, dados')
      .in('telefone', uniquePhones);

    if (error || !data) return;

    const map: Record<string, ConversaInfo> = {};
    for (const row of data) {
      const dados = row.dados as any;
      const historico = Array.isArray(dados?.mensagens_historico) ? dados.mensagens_historico : [];
      map[row.telefone] = { etapa: row.etapa, historico };
    }
    setConversasMap(map);
  }, [enviados]);

  useEffect(() => {
    if (activeTab !== 'enviados' || enviados.length === 0) return;
    fetchConversas();
    const interval = setInterval(fetchConversas, 30000);
    return () => clearInterval(interval);
  }, [activeTab, fetchConversas, enviados.length]);

  const getConversaStatus = (telefone: string) => {
    const normalized = normalizePhoneForWhatsApp(telefone);
    const conversa = conversasMap[normalized];
    if (!conversa) return null;
    
    const hasClientMsg = conversa.historico.some(m => m.role === 'cliente' || m.role === 'user');
    if (conversa.etapa === 'acordo_finalizado') return 'acordo';
    if (conversa.etapa === 'aguardando_humano') return 'aguardando';
    if (hasClientMsg) return 'negociando';
    return null;
  };

  const handleOpenChat = (cliente: { nome: string; telefone: string }) => {
    const normalized = normalizePhoneForWhatsApp(cliente.telefone);
    const conversa = conversasMap[normalized];
    if (!conversa) return;
    setSelectedConversa({
      etapa: conversa.etapa,
      historico: conversa.historico,
      telefone: cliente.telefone,
      clienteNome: cliente.nome,
    });
    setChatDialogOpen(true);
  };

  // WhatsApp profile management
  const loadWhatsAppProfile = useCallback(async (serverUrl: string, token: string) => {
    setLoadingProfile(true);
    // Don't clear fields — keep cached values from DB
    try {
      const cleanUrl = serverUrl.replace(/\/+$/, '');
      // Fetch business profile
      const res = await fetch(`${cleanUrl}/business/get/profile`, {
        method: 'POST',
        headers: { 'token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jid: '' }),
      });
      if (res.ok) {
        const data = await res.json();
        console.log('[WhatsApp Profile] /business/get/profile response:', JSON.stringify(data));
        const profile = data?.data || data?.profile || data;
        if (profile?.description) setProfileDescription(profile.description);
        if (profile?.address) setProfileAddress(profile.address);
        if (profile?.email) setProfileEmail(profile.email);
        if (profile?.name || profile?.pushName) setProfileName(profile.name || profile.pushName);
        // Try multiple photo fields
        const photoFromProfile = profile?.profilePictureUrl || profile?.imgUrl || profile?.picture || profile?.photo || profile?.profilePicUrl || '';
        if (photoFromProfile) setCurrentProfilePhotoUrl(photoFromProfile);
      }

      // Try /contacts/getProfilePicture with own number
      try {
        const picRes = await fetch(`${cleanUrl}/contacts/getProfilePicture`, {
          method: 'POST',
          headers: { 'token': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (picRes.ok) {
          const picData = await picRes.json();
          console.log('[WhatsApp Profile] /contacts/getProfilePicture response:', JSON.stringify(picData));
          const picUrl = picData?.data?.profilePictureUrl || picData?.data?.imgUrl || picData?.profilePictureUrl || picData?.imgUrl || picData?.url || picData?.data?.url || picData?.data?.picture || '';
          if (picUrl) setCurrentProfilePhotoUrl(picUrl);
        }
      } catch (e) {
        console.log('[WhatsApp Profile] /contacts/getProfilePicture error:', e);
      }

      // Try /instance/info as fallback
      try {
        const infoRes = await fetch(`${cleanUrl}/instance/info`, {
          method: 'GET',
          headers: { 'token': token },
        });
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          console.log('[WhatsApp Profile] /instance/info response:', JSON.stringify(infoData));
          const info = infoData?.data || infoData;
          const infoPhoto = info?.profilePictureUrl || info?.imgUrl || info?.picture || info?.photo || info?.profilePicUrl || '';
          if (infoPhoto) setCurrentProfilePhotoUrl(infoPhoto);
          setProfileName(prev => prev || info?.pushName || info?.name || info?.profileName || '');
        }
      } catch (e) {
        console.log('[WhatsApp Profile] /instance/info error:', e);
      }
    } catch (e) {
      console.log('[WhatsApp Profile] main error:', e);
    }
    setLoadingProfile(false);
  }, []);

  // Load WhatsApp profile when editing a connected instance
  useEffect(() => {
    if (editingInstance?.id && connectionStatus[editingInstance.id] === 'connected') {
      loadWhatsAppProfile(editingInstance.server_url, editingInstance.instance_token);
    }
  }, [editingInstance?.id, connectionStatus, loadWhatsAppProfile]);

  const handleSaveProfileName = async () => {
    if (!editingInstance) return;
    setSavingProfileName(true);
    try {
      const cleanUrl = editingInstance.server_url.replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/profile/name`, {
        method: 'POST',
        headers: { 'token': editingInstance.instance_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileName }),
      });
      if (!res.ok) throw new Error('Falha ao alterar nome');
      // Persist to DB cache
      if (editingInstance.id) {
        await supabase.from('user_whatsapp_instances' as any).update({ whatsapp_profile_name: profileName } as any).eq('id', editingInstance.id);
        setInstances(prev => prev.map(i => i.id === editingInstance.id ? { ...i, whatsapp_profile_name: profileName } : i));
      }
      toast.success('Nome do perfil atualizado!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar nome');
    } finally {
      setSavingProfileName(false);
    }
  };

  const handleProfilePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfilePhotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfilePhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfilePhoto = async (remove = false) => {
    if (!editingInstance) return;
    setSavingProfilePhoto(true);
    try {
      const cleanUrl = editingInstance.server_url.replace(/\/+$/, '');
      let body: any;
      if (remove) {
        body = { image: '' };
      } else if (profilePhotoPreview) {
        // Strip data URI prefix — UAZAPI expects raw base64
        let rawBase64 = profilePhotoPreview;
        if (rawBase64.includes(',') && rawBase64.startsWith('data:')) {
          rawBase64 = rawBase64.split(',')[1];
        }
        rawBase64 = rawBase64.replace(/\s/g, '');
        body = { image: rawBase64 };
      } else {
        toast.error('Selecione uma imagem primeiro');
        setSavingProfilePhoto(false);
        return;
      }
      const res = await fetch(`${cleanUrl}/profile/image`, {
        method: 'POST',
        headers: { 'token': editingInstance.instance_token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const resData = await res.json().catch(() => null);
      console.log('[UAZAPI] profile/image response:', res.status, resData);
      if (!res.ok) throw new Error(resData?.error || 'Falha ao alterar foto');
      toast.success(remove ? 'Foto removida!' : 'Foto do perfil atualizada!');
      const newPhotoUrl = remove ? '' : profilePhotoPreview;
      // Persist to DB cache
      if (editingInstance.id) {
        await supabase.from('user_whatsapp_instances' as any).update({ whatsapp_profile_photo_url: newPhotoUrl } as any).eq('id', editingInstance.id);
        setInstances(prev => prev.map(i => i.id === editingInstance.id ? { ...i, whatsapp_profile_photo_url: newPhotoUrl } : i));
      }
      setCurrentProfilePhotoUrl(newPhotoUrl);
      setProfilePhotoFile(null);
      setProfilePhotoPreview('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar foto');
    } finally {
      setSavingProfilePhoto(false);
    }
  };

  const handleSaveProfileBusiness = async () => {
    if (!editingInstance) return;
    setSavingProfileBusiness(true);
    try {
      const cleanUrl = editingInstance.server_url.replace(/\/+$/, '');
      const res = await fetch(`${cleanUrl}/business/update/profile`, {
        method: 'POST',
        headers: { 'token': editingInstance.instance_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: profileDescription, address: profileAddress, email: profileEmail }),
      });
      if (!res.ok) throw new Error('Falha ao atualizar dados comerciais');
      // Persist to DB cache
      if (editingInstance.id) {
        await supabase.from('user_whatsapp_instances' as any).update({
          whatsapp_profile_description: profileDescription,
          whatsapp_profile_address: profileAddress,
          whatsapp_profile_email: profileEmail,
        } as any).eq('id', editingInstance.id);
        setInstances(prev => prev.map(i => i.id === editingInstance.id ? { ...i, whatsapp_profile_description: profileDescription, whatsapp_profile_address: profileAddress, whatsapp_profile_email: profileEmail } : i));
      }
      toast.success('Dados comerciais atualizados!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar dados comerciais');
    } finally {
      setSavingProfileBusiness(false);
    }
  };

  // Bulk profile update — gradual with anti-ban delays
  const handleBulkProfileUpdate = async () => {
    setBulkUpdateConfirmOpen(false);
    bulkCancelRef.current = false;

    // Get connected instances excluding the current one
    const connectedOthers = instances.filter(
      i => i.id !== editingInstance?.id && i.ativo && connectionStatus[i.id] === 'connected'
    );

    if (connectedOthers.length === 0) {
      toast.error('Nenhuma outra instância conectada encontrada');
      return;
    }

    // Shuffle for randomized order
    const shuffled = [...connectedOthers].sort(() => Math.random() - 0.5);

    const log = shuffled.map(i => ({ id: i.id, nome: i.nome || 'Sem nome', status: 'pending' as const }));
    setBulkUpdateLog(log);
    setBulkUpdateRunning(true);
    setBulkUpdateProgress({ current: 0, total: shuffled.length });

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    const randomDelay = (min: number, max: number) => {
      const base = min + Math.random() * (max - min);
      const jitter = base * (0.7 + Math.random() * 0.6); // ±30%
      return Math.round(jitter);
    };

    for (let idx = 0; idx < shuffled.length; idx++) {
      if (bulkCancelRef.current) break;

      const inst = shuffled[idx];
      setBulkUpdateLog(prev => prev.map(l => l.id === inst.id ? { ...l, status: 'running' } : l));
      setBulkUpdateProgress({ current: idx + 1, total: shuffled.length });

      try {
        const cleanUrl = inst.server_url.replace(/\/+$/, '');

        // Update name
        if (bulkUpdateApplyName && profileName.trim()) {
          const nameRes = await fetch(`${cleanUrl}/profile/name`, {
            method: 'POST',
            headers: { 'token': inst.instance_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: profileName }),
          });
          if (!nameRes.ok) throw new Error('Falha ao alterar nome');
          // Cache in DB
          await supabase.from('user_whatsapp_instances' as any).update({ whatsapp_profile_name: profileName } as any).eq('id', inst.id);
          setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, whatsapp_profile_name: profileName } : i));
        }

        // Pause between name and photo
        if (bulkUpdateApplyName && bulkUpdateApplyPhoto && profileName.trim()) {
          await sleep(randomDelay(10000, 20000));
          if (bulkCancelRef.current) break;
        }

        // Update photo
        if (bulkUpdateApplyPhoto && currentProfilePhotoUrl) {
          // Need to get photo as base64 — use the cached preview or fetch from URL
          let base64Image = '';
          if (profilePhotoPreview) {
            base64Image = profilePhotoPreview.includes(',') ? profilePhotoPreview.split(',')[1] : profilePhotoPreview;
          } else if (currentProfilePhotoUrl.startsWith('data:')) {
            base64Image = currentProfilePhotoUrl.split(',')[1];
          } else {
            // Fetch the URL and convert to base64
            try {
              const imgRes = await fetch(currentProfilePhotoUrl);
              const blob = await imgRes.blob();
              const reader = new FileReader();
              base64Image = await new Promise<string>((resolve) => {
                reader.onloadend = () => {
                  const result = reader.result as string;
                  resolve(result.includes(',') ? result.split(',')[1] : result);
                };
                reader.readAsDataURL(blob);
              });
            } catch {
              throw new Error('Não foi possível obter a imagem para enviar');
            }
          }
          base64Image = base64Image.replace(/\s/g, '');

          const photoRes = await fetch(`${cleanUrl}/profile/image`, {
            method: 'POST',
            headers: { 'token': inst.instance_token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64Image }),
          });
          if (!photoRes.ok) throw new Error('Falha ao alterar foto');
          // Cache in DB
          await supabase.from('user_whatsapp_instances' as any).update({ whatsapp_profile_photo_url: currentProfilePhotoUrl } as any).eq('id', inst.id);
          setInstances(prev => prev.map(i => i.id === inst.id ? { ...i, whatsapp_profile_photo_url: currentProfilePhotoUrl } : i));
        }

        setBulkUpdateLog(prev => prev.map(l => l.id === inst.id ? { ...l, status: 'success' } : l));
      } catch (err: any) {
        setBulkUpdateLog(prev => prev.map(l => l.id === inst.id ? { ...l, status: 'error', message: err.message } : l));
        // Pause 5 min on error
        if (idx < shuffled.length - 1 && !bulkCancelRef.current) {
          await sleep(300000);
        }
        continue;
      }

      // Delay before next instance (60-180s)
      if (idx < shuffled.length - 1 && !bulkCancelRef.current) {
        await sleep(randomDelay(20000, 40000));
      }
    }

    setBulkUpdateRunning(false);
    if (bulkCancelRef.current) {
      toast.info('Atualização em massa cancelada');
    } else {
      const successCount = bulkUpdateLog.filter(l => l.status === 'success').length;
      toast.success(`Perfil atualizado em ${successCount} instância(s)`);
    }
  };


  const handleSaveInstance = async () => {
    if (!user || !editingInstance) return;
    if (!editingInstance.server_url.trim() || !editingInstance.instance_token.trim()) {
      toast.error('Preencha Server URL e Instance Token');
      return;
    }
    setSavingInstance(true);
    try {
      if (editingInstance.id) {
        // Update
        const { error } = await supabase
          .from('user_whatsapp_instances' as any)
          .update({
            nome: editingInstance.nome.trim() || null,
            server_url: editingInstance.server_url.trim(),
            instance_token: editingInstance.instance_token.trim(),
          } as any)
          .eq('id', editingInstance.id);
        if (error) throw error;
        setInstances(prev => prev.map(i => i.id === editingInstance.id ? { ...i, nome: editingInstance.nome.trim(), server_url: editingInstance.server_url.trim(), instance_token: editingInstance.instance_token.trim() } : i));
        toast.success('Instância atualizada!');
      } else {
        // Insert
        const { data, error } = await supabase
          .from('user_whatsapp_instances' as any)
          .insert({
            user_id: user.id,
            nome: editingInstance.nome.trim() || null,
            server_url: editingInstance.server_url.trim(),
            instance_token: editingInstance.instance_token.trim(),
          } as any)
          .select()
          .single();
        if (error) throw error;
        setInstances(prev => [data as any, ...prev]);
        toast.success('WhatsApp adicionado!');
      }
      setEditingInstance(null);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSavingInstance(false);
    }
  };

  const handleInstanceDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = instances.findIndex(i => i.id === active.id);
    const newIndex = instances.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(instances, oldIndex, newIndex);
    setInstances(reordered);
    // Persist order
    for (let i = 0; i < reordered.length; i++) {
      await supabase
        .from('user_whatsapp_instances' as any)
        .update({ ordem: i } as any)
        .eq('id', reordered[i].id);
    }
  };

  // QR Code connection handlers
  const stopQrPolling = useCallback(() => {
    if (qrPollingRef.current) clearInterval(qrPollingRef.current);
    if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
    setQrPolling(false);
    qrPollingRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      if (qrPollingRef.current) clearInterval(qrPollingRef.current);
      if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
    };
  }, []);

  const startQrCountdown = () => {
    if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
    setQrCountdown(60);
    qrCountdownRef.current = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          if (qrCountdownRef.current) clearInterval(qrCountdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const startQrPolling = useCallback((instanceId: string) => {
    if (qrPollingRef.current) clearInterval(qrPollingRef.current);
    setQrPolling(true);

    qrPollingRef.current = setInterval(async () => {
      try {
        const { data } = await supabase.functions.invoke('whatsapp-qr', {
          body: { action: 'status', userId: user?.id, instanceId },
        });

        if (data?.connected) {
          stopQrPolling();
          // Auto-configure webhook
          await supabase.functions.invoke('whatsapp-qr', {
            body: { action: 'setup-webhook', userId: user?.id, instanceId },
          });
          // Refresh instances list
          const { data: refreshed } = await supabase
            .from('user_whatsapp_instances' as any)
            .select('id, nome, server_url, instance_token, ativo, apenas_lembretes, robo, ia_responde')
            .eq('user_id', user?.id)
            .order('ordem' as any, { ascending: true })
            .order('criado_em', { ascending: false });
          if (refreshed) setInstances(refreshed as any);
          setQrStep('idle');
          setQrImage(null);
          setPairingCode(null);
          setCreatedInstanceId(null);
          setEditingInstance(null);
          toast.success('WhatsApp conectado com sucesso! Webhook configurado automaticamente.');
          checkInstanceConnections(refreshed as any || []);
        }
      } catch (_) {}
    }, 3000);
  }, [user?.id, stopQrPolling, checkInstanceConnections]);

  const handleConnectQr = async () => {
    if (!user) return;
    setQrLoading(true);
    setQrImage(null);
    setPairingCode(null);

    try {
      // Step 1: Create instance
      const { data: createData, error: createError } = await supabase.functions.invoke('whatsapp-qr', {
        body: { action: 'create-instance', userId: user.id },
      });

      if (createError) throw createError;
      if (!createData?.ok) throw new Error(createData?.error || 'Falha ao criar instância');

      const instanceId = createData.instanceId;
      setCreatedInstanceId(instanceId);

      // Step 2: Fetch QR code or pairing code
      const usePhone = connectMethod === 'code' ? normalizePairingPhone(pairingPhone) : '';
      const { data: qrData, error: qrError } = await supabase.functions.invoke('whatsapp-qr', {
        body: { action: 'qr', userId: user.id, instanceId, phone: usePhone || undefined },
      });

      if (qrError) throw qrError;

      if (qrData?.alreadyConnected) {
        const { data: refreshed } = await supabase
          .from('user_whatsapp_instances' as any)
          .select('id, nome, server_url, instance_token, ativo, apenas_lembretes, robo, ia_responde')
          .eq('user_id', user.id)
          .order('criado_em', { ascending: true });
        if (refreshed) setInstances(refreshed as any);
        setQrStep('idle');
        toast.success('WhatsApp já está conectado!');
      } else if (qrData?.ok && (qrData.qr || qrData.pairingCode)) {
        if (qrData.qr) {
          const qr = qrData.qr.startsWith('data:') ? qrData.qr : `data:image/png;base64,${qrData.qr}`;
          setQrImage(qr);
        } else {
          setQrImage(null);
        }
        setPairingCode(qrData.pairingCode || null);
        setQrStep('qr');
        startQrPolling(instanceId);
        startQrCountdown();
      } else {
        toast.error(qrData?.error || 'Não foi possível obter o QR Code');
      }
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
    setQrLoading(false);
  };

  const handleRefreshQr = async () => {
    if (!createdInstanceId || !user) return;
    stopQrPolling();
    setQrLoading(true);
    try {
      const usePhone = connectMethod === 'code' ? normalizePairingPhone(pairingPhone) : '';
      const { data, error } = await supabase.functions.invoke('whatsapp-qr', {
        body: { action: 'qr', userId: user.id, instanceId: createdInstanceId, phone: usePhone || undefined },
      });
      if (error) throw error;
      if (data?.ok && (data.qr || data.pairingCode)) {
        if (data.qr) {
          const qr = data.qr.startsWith('data:') ? data.qr : `data:image/png;base64,${data.qr}`;
          setQrImage(qr);
        } else {
          setQrImage(null);
        }
        setPairingCode(data.pairingCode || null);
        startQrPolling(createdInstanceId);
        startQrCountdown();
      } else {
        toast.error(data?.error || 'Não foi possível obter o QR Code');
      }
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
    setQrLoading(false);
  };

  const handleCancelQr = () => {
    stopQrPolling();
    setQrStep('idle');
    setQrImage(null);
    setPairingCode(null);
    setPairingPhone('');
    setConnectMethod('qr');
    setCreatedInstanceId(null);
    // If instance was created but not connected, delete it
    if (createdInstanceId) {
      supabase.functions.invoke('whatsapp-qr', {
        body: { action: 'disconnect', userId: user?.id, instanceId: createdInstanceId },
      }).then(() => {
        setInstances(prev => prev.filter(i => i.id !== createdInstanceId));
      });
    }
  };

  const handleReconnectQr = async () => {
    if (!user || !editingInstance?.id) return;
    const instanceId = editingInstance.id;
    setReconnectingInstanceId(instanceId);
    setQrLoading(true);
    setQrImage(null);
    setPairingCode(null);

    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-qr', {
        body: { action: 'qr', userId: user.id, instanceId },
      });
      if (error) throw error;

      if (data?.alreadyConnected) {
        setReconnectingInstanceId(null);
        setConnectionStatus(prev => ({ ...prev, [instanceId]: 'connected' }));
        toast.success('WhatsApp já está conectado!');
      } else if (data?.ok && data.qr) {
        const qr = data.qr.startsWith('data:') ? data.qr : `data:image/png;base64,${data.qr}`;
        setQrImage(qr);
        setPairingCode(data.pairingCode || null);
        startQrPolling(instanceId);
        startQrCountdown();
      } else {
        toast.error(data?.error || 'Não foi possível obter o QR Code');
        setReconnectingInstanceId(null);
      }
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
      setReconnectingInstanceId(null);
    }
    setQrLoading(false);
  };

  const handleReconnectRefreshQr = async () => {
    if (!reconnectingInstanceId || !user) return;
    stopQrPolling();
    setQrLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-qr', {
        body: { action: 'qr', userId: user.id, instanceId: reconnectingInstanceId },
      });
      if (error) throw error;
      if (data?.ok && data.qr) {
        const qr = data.qr.startsWith('data:') ? data.qr : `data:image/png;base64,${data.qr}`;
        setQrImage(qr);
        setPairingCode(data.pairingCode || null);
        startQrPolling(reconnectingInstanceId);
        startQrCountdown();
      } else {
        toast.error(data?.error || 'Não foi possível obter o QR Code');
      }
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
    setQrLoading(false);
  };

  const handleCancelReconnect = () => {
    stopQrPolling();
    setQrImage(null);
    setPairingCode(null);
    setReconnectingInstanceId(null);
  };

  const handleDeleteInstance = async (id: string) => {
    const { error } = await supabase
      .from('user_whatsapp_instances' as any)
      .delete()
      .eq('id', id);
    if (error) {
      toast.error(`Erro ao remover: ${error.message}`);
      return;
    }
    setInstances(prev => prev.filter(i => i.id !== id));
    toast.success('Instância removida');
  };

  const handleToggleInstance = async (id: string, ativo: boolean) => {
    const { error } = await supabase
      .from('user_whatsapp_instances' as any)
      .update({ ativo } as any)
      .eq('id', id);
    if (error) {
      toast.error(`Erro: ${error.message}`);
      return;
    }
    setInstances(prev => prev.map(i => i.id === id ? { ...i, ativo } : i));
  };

  const handleToggleApenasLembretes = async (id: string, apenas_lembretes: boolean) => {
    const updateData: any = { apenas_lembretes };
    if (apenas_lembretes) { updateData.robo = false; updateData.ia_responde = false; }
    const { error } = await supabase
      .from('user_whatsapp_instances' as any)
      .update(updateData)
      .eq('id', id);
    if (error) {
      toast.error(`Erro: ${error.message}`);
      return;
    }

    // Ao marcar como "Apenas Lembretes", atualizar o perfil para usar esta instância como principal para lembretes
    if (apenas_lembretes && user) {
      const inst = instances.find(i => i.id === id);
      if (inst) {
        await supabase
          .from('profiles')
          .update({
            whatsapp_lembrete_server_url: inst.server_url,
            whatsapp_lembrete_instance_token: inst.instance_token,
          })
          .eq('id', user.id);
        toast.success('Instância marcada como dedicada para lembretes e sincronizada com seu perfil');
      }
    }

    setInstances(prev => prev.map(i => i.id === id ? { ...i, apenas_lembretes, ...(apenas_lembretes ? { robo: false, ia_responde: false } : {}) } : i));
    if (!apenas_lembretes) toast.success('Restrição removida');
  };

  const handleToggleRobo = async (id: string, robo: boolean) => {
    const updateData: any = { robo };
    if (robo) updateData.apenas_lembretes = false;
    const { error } = await supabase
      .from('user_whatsapp_instances' as any)
      .update(updateData)
      .eq('id', id);
    if (error) {
      toast.error(`Erro: ${error.message}`);
      return;
    }
    setInstances(prev => prev.map(i => i.id === id ? { ...i, robo, ...(robo ? { apenas_lembretes: false } : {}) } : i));
    toast.success(robo ? 'Instância habilitada para o robô de acionamento' : 'Robô desativado nesta instância');
  };

  const handleToggleIaResponde = async (id: string, ia_responde: boolean) => {
    const updateData: any = { ia_responde };
    if (ia_responde) updateData.apenas_lembretes = false;
    const { error } = await supabase
      .from('user_whatsapp_instances' as any)
      .update(updateData)
      .eq('id', id);
    if (error) {
      toast.error(`Erro: ${error.message}`);
      return;
    }
    setInstances(prev => prev.map(i => i.id === id ? { ...i, ia_responde, ...(ia_responde ? { apenas_lembretes: false } : {}) } : i));
    toast.success(ia_responde ? 'IA habilitada para responder nesta instância' : 'IA desativada nesta instância');
  };

  const handleTestInstance = async (instance: { id: string; server_url: string; instance_token: string }) => {
    setTestingInstanceId(instance.id);
    try {
      const { data, error } = await supabase.functions.invoke('test-uazapi-connection', {
        body: { server_url: instance.server_url, instance_token: instance.instance_token }
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`Conexão bem-sucedida! (${data.endpoint})`);
      } else {
        const detail = data?.data?.message || data?.data?.error || data?.error || JSON.stringify(data?.data);
        toast.error(`Erro (status ${data?.status}): ${detail}`);
      }
    } catch (error: any) {
      toast.error(`Não foi possível conectar: ${error.message}`);
    } finally {
      setTestingInstanceId(null);
    }
  };

  const handleTestSend = async (msgOverride?: string) => {
    if (!testPhone.trim()) {
      toast.error('Digite um número de telefone para teste');
      return;
    }
    const msgToSend = msgOverride || mensagem;
    if (!msgToSend.trim()) {
      toast.error('Digite uma mensagem antes de testar');
      return;
    }
    setSendingTest(true);
    try {
      const body: any = { telefone: testPhone.trim(), mensagem: msgToSend.trim() };
      const config = getFirstActiveConfig();
      if (config) {
        body.uazapi_server_url = config.server_url;
        body.uazapi_instance_token = config.instance_token;
        if (config.id) body.instancia_id = config.id;
      }
      const { data, error } = await supabase.functions.invoke('send-whatsapp', { body });
      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Erro ao enviar');
      toast.success('Mensagem de teste enviada com sucesso!');
    } catch (err: any) {
      toast.error(`Erro ao enviar teste: ${err.message}`);
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Acionamento</h1>
          {instances.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => checkInstanceConnections(instances)}
              disabled={checkingConnections}
              className="text-muted-foreground"
            >
              {checkingConnections ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-1 text-xs">Verificar conexões</span>
            </Button>
          )}
        </div>

        {/* Alert banner for disconnected instances */}
        {disconnectedInstances.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>WhatsApp desconectado</AlertTitle>
            <AlertDescription>
              {disconnectedInstances.map(i => i.nome || 'Sem nome').join(', ')} — Reconecte os aparelhos no painel UAZAPI.
            </AlertDescription>
          </Alert>
        )}

        {/* Upload + Histórico */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Importar Planilha</CardTitle>
            <div className="flex items-center gap-2">
              {!isAdmin && activeInstances.length > 0 && (
                <Badge variant="secondary">
                  {activeInstances.length} WhatsApp{activeInstances.length > 1 ? 's' : ''} ativo{activeInstances.length > 1 ? 's' : ''}
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLembreteMensagensOpen(true)}
                className="text-muted-foreground gap-1"
              >
                <MessageCircle className="h-4 w-4" />
                <span className="text-xs">Mensagens de Lembrete</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setConfigDialogOpen(true)}
                className="text-muted-foreground"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> Selecionar arquivo Excel
              </Button>
              {clientes.length > 0 && (
                <Badge variant="secondary">
                  {clientes.length} clientes importados
                </Badge>
              )}
              {clientes.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleVerificarWhatsApp}
                  disabled={verificandoWhatsApp}
                  className="gap-1"
                >
                  {verificandoWhatsApp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {verificandoWhatsApp ? 'Verificando...' : 'Verificar WhatsApp'}
                </Button>
              )}
            </div>

            {/* Resultado da verificação */}
            {verificacaoConcluida && numerosInvalidos.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>{numerosInvalidos.length} número(s) sem WhatsApp removidos</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p className="text-sm">Apenas {clientes.length} contatos válidos permanecem na lista.</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleDownloadComWhatsApp}
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Download className="h-4 w-4" />
                      Baixar com WhatsApp ({clientes.length})
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleDownloadSemWhatsApp}
                      className="gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <Download className="h-4 w-4" />
                      Baixar sem WhatsApp ({numerosInvalidos.length})
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMostrarInvalidos(!mostrarInvalidos)}
                      className="text-xs"
                    >
                      {mostrarInvalidos ? 'Ocultar removidos' : 'Ver números removidos'}
                    </Button>
                  </div>
                  {mostrarInvalidos && (
                    <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1">
                      {numerosInvalidos.map((c, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          {c.nome} — {c.telefone}
                        </p>
                      ))}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {verificacaoConcluida && numerosInvalidos.length === 0 && (
              <Alert>
                <Check className="h-4 w-4" />
                <AlertTitle>Todos os números possuem WhatsApp ✓</AlertTitle>
                <AlertDescription>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleDownloadComWhatsApp}
                    className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white mt-2"
                  >
                    <Download className="h-4 w-4" />
                    Baixar planilha ({clientes.length})
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <p className="text-xs text-muted-foreground">
              Formato esperado: <strong>Coluna A</strong> = CPF, <strong>Coluna B</strong> = Nome, <strong>Coluna C</strong> = Telefone, <strong>Coluna D</strong> = Atraso, <strong>Coluna E</strong> = Saldo
            </p>

            {historico.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Histórico de importações</p>
                <div className="space-y-1">
                  {historico.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between rounded-md border p-2 cursor-pointer hover:bg-accent/50 transition-colors ${activeHistoricoId === item.id ? 'border-primary bg-accent/30' : ''}`}
                      onClick={() => handleLoadHistorico(item)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileSpreadsheet className="h-4 w-4 shrink-0 text-green-600" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item.nomeArquivo}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.qtdClientes} clientes · {formatDate(item.dataImportacao)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteHistorico(item.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mensagem */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mensagens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {variables.map((v) => (
                <Button
                  key={v.key}
                  variant="secondary"
                  size="sm"
                  onClick={() => insertVariable(v.key)}
                >
                  {v.key} <span className="ml-1 text-xs opacity-70">({v.label})</span>
                </Button>
              ))}
            </div>
            <Textarea
              ref={textareaRef}
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              placeholder="Digite a mensagem usando as variáveis acima..."
              rows={6}
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleSaveMessage}>
                <Save className="h-4 w-4 mr-2" /> Salvar mensagem
              </Button>
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Número para teste (ex: 62999999999)"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-64"
                />
                <Button
                  variant="outline"
                  onClick={() => handleTestSend()}
                  disabled={sendingTest || !testPhone.trim() || !mensagem.trim()}
                >
                  {sendingTest ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                  Testar envio
                </Button>
              </div>
            </div>

            {mensagensSalvas.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Mensagens salvas ({mensagensSalvas.length})</p>
                <div className="space-y-1">
                  {mensagensSalvas.map((msg, i) => (
                    <div key={i} className="flex items-start justify-between gap-2 rounded-md border p-3">
                      <p className="text-sm whitespace-pre-wrap break-words min-w-0 flex-1">{msg}</p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteMessage(i)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lista de clientes com abas */}
        {clientes.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant={activeTab === 'pendentes' ? 'default' : 'outline'}
                  onClick={() => setActiveTab('pendentes')}
                >
                  A ENVIAR ({pendentes.length})
                </Button>
                <Button
                  variant={activeTab === 'enviados' ? 'default' : 'outline'}
                  onClick={() => setActiveTab('enviados')}
                >
                  ENVIADOS ({enviadosHoje} hoje)
                </Button>
                {isAdmin && (
                  <Button
                    variant={activeTab === 'ia' ? 'default' : 'outline'}
                    onClick={() => setActiveTab('ia')}
                  >
                    <Bot className="h-4 w-4 mr-1" />
                    IA
                  </Button>
                )}
                <Badge variant={activeInstances.length > 0 ? 'secondary' : 'destructive'} className="ml-auto flex items-center gap-1">
                  <Smartphone className="h-3 w-3" />
                  {activeInstances.length} robô{activeInstances.length !== 1 ? 's' : ''} ativo{activeInstances.length !== 1 ? 's' : ''}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeTab === 'pendentes' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 bg-muted/30">
                    <span className="text-sm font-medium">Envio automático:</span>
                    <Input
                      type="number"
                      min={1}
                      value={autoMinSec}
                      onChange={(e) => setAutoMinSec(Number(e.target.value))}
                      className="w-20 h-9"
                      disabled={autoSending}
                    />
                    <span className="text-sm">a</span>
                    <Input
                      type="number"
                      min={2}
                      value={autoMaxSec}
                      onChange={(e) => setAutoMaxSec(Number(e.target.value))}
                      className="w-20 h-9"
                      disabled={autoSending}
                    />
                    <span className="text-sm">segundos</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCalcInterval}
                            disabled={autoSending || activeInstances.length === 0}
                          >
                            <Calculator className="h-4 w-4 mr-1" /> Calcular
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Calcula o intervalo ideal para ~30 msgs/número/dia (8h-18h)</p>
                          <p className="text-xs text-muted-foreground">{activeInstances.length} número(s) robô ativo(s)</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    {!autoSending ? (
                      <Button
                        size="sm"
                        onClick={handleAutoSend}
                        disabled={mensagensSalvas.length === 0 || pendentes.length === 0}
                        className="bg-green-600 hover:bg-green-700 text-primary-foreground"
                      >
                        <Play className="h-4 w-4 mr-1" /> Iniciar
                      </Button>
                    ) : (
                      <>
                        {autoProgress && (
                          <span className="text-sm font-medium text-muted-foreground">
                            Enviando {autoProgress.current}/{autoProgress.total}...
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={handleStopAutoSend}
                        >
                          <Square className="h-4 w-4 mr-1" /> Parar
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Agendamento de envio */}
                  <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 bg-muted/30">
                    <CalendarClock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Agendar envio:</span>
                    <Input
                      type="date"
                      value={agendamentoData}
                      onChange={(e) => setAgendamentoData(e.target.value)}
                      className="w-40 h-9"
                      min={new Date().toISOString().split('T')[0]}
                    />
                    <Input
                      type="time"
                      value={agendamentoHora}
                      onChange={(e) => setAgendamentoHora(e.target.value)}
                      className="w-28 h-9"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleAgendar}
                      disabled={agendandoEnvio || !agendamentoData || mensagensSalvas.length === 0 || pendentes.length === 0}
                    >
                      {agendandoEnvio ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Clock className="h-4 w-4 mr-1" />}
                      Agendar
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Usa o intervalo min/max acima • {pendentes.length} pendentes
                    </span>
                  </div>

                  {/* Agendamentos ativos */}
                  {agendamentos.length > 0 && (
                    <div className="space-y-1">
                      {agendamentos.map(ag => (
                        <div key={ag.id} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-accent/50">
                          <CalendarClock className="h-3.5 w-3.5" />
                          <span>
                            {new Date(ag.agendado_para).toLocaleDateString('pt-BR')} às{' '}
                            {new Date(ag.agendado_para).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <Badge variant={ag.status === 'executando' ? 'default' : 'secondary'}>
                            {ag.status === 'executando' ? `Enviando (${ag.total_enviados})` : 'Pendente'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {(ag.historico_data as any)?.clientes?.length || 0} clientes
                          </span>
                          {ag.status === 'pendente' && (
                            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => handleCancelAgendamento(ag.id)}>
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {activeTab === 'pendentes' && (
                <>
                  {pendentes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum cliente pendente</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Saldo</TableHead>
                          <TableHead>À Vista</TableHead>
                          <TableHead>Parcelado</TableHead>
                          <TableHead className="w-24 text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendentes.map((c) => (
                          <TableRow key={c.originalIndex}>
                            <TableCell className="font-medium">{c.nome}</TableCell>
                            <TableCell>{c.telefone}</TableCell>
                            <TableCell>{formatCurrency(c.saldo)}</TableCell>
                            <TableCell className="text-green-600 font-medium">{calcAvista(c.saldo)}</TableCell>
                            <TableCell className="text-xs max-w-[200px]">{calcParceladoDisplay(c.saldo)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Checkbox
                                  checked={false}
                                  onCheckedChange={(checked) => handleManualCheck(c.originalIndex, !!checked)}
                                  disabled={autoSending}
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled={sendStatus[c.originalIndex] === 'sending' || autoSending}
                                  onClick={() => handleSend(c.originalIndex)}
                                  className={
                                    sendStatus[c.originalIndex] === 'error'
                                      ? 'text-destructive'
                                      : 'text-green-600 hover:text-green-700'
                                  }
                                >
                                  {sendStatus[c.originalIndex] === 'sending' ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                  ) : sendStatus[c.originalIndex] === 'error' ? (
                                    <X className="h-5 w-5" />
                                  ) : (
                                    <WhatsAppIcon />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}

              {activeTab === 'enviados' && (
                <>
                  {enviados.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma mensagem enviada ainda</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nome</TableHead>
                          <TableHead>Telefone</TableHead>
                          <TableHead>Saldo</TableHead>
                          <TableHead>À Vista</TableHead>
                          <TableHead>Parcelado</TableHead>
                          <TableHead>Enviado em</TableHead>
                          <TableHead className="w-24 text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {enviados.map((c) => {
                          const wasSent = sendStatus[c.originalIndex] === 'success';
                          const wasError = sendStatus[c.originalIndex] === 'error';
                          const wasManual = manualChecked.has(c.originalIndex);
                          const timestamp = sendTimestamps[c.originalIndex];
                          const formattedTimestamp = timestamp
                            ? new Date(timestamp).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            : '—';
                          const conversaStatus = getConversaStatus(c.telefone);
                          return (
                            <TableRow key={c.originalIndex}>
                              <TableCell className="font-medium">{c.nome}</TableCell>
                              <TableCell>{c.telefone}</TableCell>
                              <TableCell>{formatCurrency(c.saldo)}</TableCell>
                              <TableCell className="text-green-600 font-medium">{calcAvista(c.saldo)}</TableCell>
                              <TableCell className="text-xs max-w-[200px]">{calcParceladoDisplay(c.saldo)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{formattedTimestamp}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {conversaStatus === 'negociando' && (
                                    <Badge
                                      variant="outline"
                                      className="cursor-pointer bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30"
                                      onClick={() => handleOpenChat(c)}
                                    >
                                      <MessageCircle className="h-3 w-3 mr-1" /> Em negociação
                                    </Badge>
                                  )}
                                  {conversaStatus === 'aguardando' && (
                                    <Badge
                                      variant="outline"
                                      className="cursor-pointer bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30"
                                      onClick={() => handleOpenChat(c)}
                                    >
                                      <MessageCircle className="h-3 w-3 mr-1" /> Aguardando
                                    </Badge>
                                  )}
                                  {conversaStatus === 'acordo' && (
                                    <Badge
                                      variant="outline"
                                      className="cursor-pointer bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30"
                                      onClick={() => handleOpenChat(c)}
                                    >
                                      <Check className="h-3 w-3 mr-1" /> Acordo
                                    </Badge>
                                  )}
                                  {!conversaStatus && wasSent && (
                                    <Badge variant="default" className="bg-green-600 hover:bg-green-600">
                                      <Check className="h-3 w-3 mr-1" /> Enviado
                                    </Badge>
                                  )}
                                  {!conversaStatus && wasError && (
                                    <Badge variant="destructive">
                                      <X className="h-3 w-3 mr-1" /> Erro
                                    </Badge>
                                  )}
                                  {!conversaStatus && wasManual && !wasSent && !wasError && (
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary">Manual</Badge>
                                      <Checkbox
                                        checked={true}
                                        onCheckedChange={(checked) => handleManualCheck(c.originalIndex, !!checked)}
                                      />
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}

              {activeTab === 'ia' && isAdmin && (
                <ChatbotTemplatesTab />
              )}
            </CardContent>
          </Card>
        )}

        {/* Config Dialog */}
        <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
          <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden">
            <DialogHeader>
              <DialogTitle>Configurações WhatsApp</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">

              <div className="space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold">Instâncias UAZAPI</h3>
                      {instances.length > 0 && (
                        <Badge variant={connectedCount > 0 ? 'default' : 'secondary'} className="text-xs">
                          {connectedCount}/{instances.length} conectado{connectedCount !== 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Cadastre múltiplos WhatsApps para rotação automática dos envios.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:shrink-0">
                    <Button
                      size="sm"
                      onClick={() => { setConnectMethod('qr'); handleConnectQr(); }}
                      disabled={qrLoading || qrStep === 'qr'}
                    >
                      {qrLoading && connectMethod === 'qr' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <QrCode className="h-4 w-4 mr-1" />}
                      Conectar via QR Code
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => { setConnectMethod('code'); setQrStep('qr'); }}
                      disabled={qrLoading || qrStep === 'qr'}
                    >
                      <Smartphone className="h-4 w-4 mr-1" />
                      Conectar via Código
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setQrStep('manual');
                        setEditingInstance({ nome: '', server_url: 'https://certificadoracnpj.uazapi.com', instance_token: '' });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" /> Manual
                    </Button>
                  </div>
                </div>

                  {/* QR Code / Pairing Code connection flow */}
                  {qrStep === 'qr' && (
                    <div className="rounded-md border p-6 space-y-4 bg-muted/20">
                      {/* Phone input step (only for code method, before generation) */}
                      {connectMethod === 'code' && !qrImage && !pairingCode && (
                        <div className="flex flex-col items-center gap-3 max-w-sm mx-auto">
                          <Smartphone className="h-8 w-8 text-primary" />
                          <p className="text-sm font-medium text-center">
                            Digite o número do WhatsApp (com DDD)
                          </p>
                          <Input
                            placeholder="62 99999-9999"
                            value={pairingPhone}
                            onChange={(e) => setPairingPhone(e.target.value)}
                            className="text-center text-lg"
                            autoFocus
                          />
                          <p className="text-xs text-muted-foreground text-center">
                            Será adicionado o DDI 55 (Brasil) automaticamente
                          </p>
                          <div className="flex gap-2 w-full">
                            <Button
                              className="flex-1"
                              onClick={() => {
                                const normalizedPhone = normalizePairingPhone(pairingPhone);
                                if (normalizedPhone.length < 12) {
                                  toast.error('Digite um número válido com DDD');
                                  return;
                                }
                                setPairingPhone(normalizedPhone);
                                handleConnectQr();
                              }}
                              disabled={qrLoading}
                            >
                              {qrLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                              {qrLoading ? 'Aguardando WhatsApp… (pode levar até 1 min)' : 'Gerar Código'}
                            </Button>
                            <Button variant="ghost" onClick={handleCancelQr}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* QR / Pairing Code display */}
                      {(qrImage || pairingCode) && (
                        <div className="flex flex-col items-center gap-4">
                          <Smartphone className="h-8 w-8 text-primary" />
                          <p className="text-sm font-medium text-center">
                            {connectMethod === 'code'
                              ? 'Use o código abaixo no WhatsApp'
                              : 'Escaneie o QR Code com o WhatsApp'}
                          </p>

                          {connectMethod === 'qr' && qrImage && (
                            <div className="bg-background p-3 rounded-lg border shadow-sm">
                              <img src={qrImage} alt="QR Code WhatsApp" className="w-64 h-64 object-contain" />
                            </div>
                          )}

                          {pairingCode && (
                            <div className="text-center space-y-2">
                              {connectMethod === 'code' && (
                                <p className="text-xs text-muted-foreground">Seu código de pareamento:</p>
                              )}
                              {connectMethod === 'qr' && (
                                <p className="text-xs text-muted-foreground">Ou use o código de pareamento:</p>
                              )}
                              <p className={connectMethod === 'code'
                                ? "text-4xl font-mono font-bold tracking-widest text-primary"
                                : "text-2xl font-mono font-bold tracking-widest text-primary"}>
                                {(() => {
                                  const clean = pairingCode.replace(/[^A-Z0-9]/gi, '').toUpperCase();
                                  return clean.length >= 8
                                    ? `${clean.slice(0, 4)}-${clean.slice(4)}`
                                    : clean;
                                })()}
                              </p>
                              {connectMethod === 'code' && (
                                <div className="text-xs text-muted-foreground text-left max-w-xs mx-auto pt-2 space-y-1">
                                  <p>1. Abra o WhatsApp no celular</p>
                                  <p>2. Toque em <strong>Aparelhos conectados</strong> → <strong>Conectar com número de telefone</strong></p>
                                  <p>3. Digite o código mostrado acima</p>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {qrPolling && <Loader2 className="h-4 w-4 animate-spin" />}
                            <span>
                              {qrCountdown > 0 ? `Aguardando conexão... (${qrCountdown}s)` : 'Código expirado'}
                            </span>
                          </div>

                          <div className="flex gap-2 justify-center">
                            <Button variant="outline" size="sm" onClick={handleRefreshQr} disabled={qrLoading}>
                              {qrLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                              {connectMethod === 'code' ? 'Gerar Novo Código' : 'Atualizar QR Code'}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleCancelQr}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                   {/* Manual instance form (add/edit) */}
                  {(qrStep === 'manual' || (editingInstance && editingInstance.id)) && editingInstance && (
                    <div className="rounded-md border p-4 space-y-3 bg-muted/20" ref={editFormRef}>
                      <h4 className="text-sm font-semibold">{editingInstance.id ? 'Editar instância' : 'Nova instância (manual)'}</h4>
                      <div className="space-y-2">
                        <Label>Nome (opcional)</Label>
                        <Input
                          placeholder="Ex: 62981810202"
                          value={editingInstance.nome}
                          onChange={(e) => setEditingInstance({ ...editingInstance, nome: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Server URL</Label>
                        <Input
                          placeholder="https://certificadoracnpj.uazapi.com"
                          value={editingInstance.server_url}
                          onChange={(e) => !editingInstance.id && setEditingInstance({ ...editingInstance, server_url: e.target.value })}
                          readOnly={!!editingInstance.id}
                          className={editingInstance.id ? 'bg-muted cursor-not-allowed opacity-60' : ''}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Instance Token</Label>
                        <Input
                          placeholder="c01095d6-64d4-4b33-9c1f-86a09948dc7c"
                          value={editingInstance.instance_token}
                          onChange={(e) => !editingInstance.id && setEditingInstance({ ...editingInstance, instance_token: e.target.value })}
                          readOnly={!!editingInstance.id}
                          className={editingInstance.id ? 'bg-muted cursor-not-allowed opacity-60' : ''}
                        />
                      </div>

                      {/* Reconnect via QR button - only for existing disconnected instances */}
                      {editingInstance.id && connectionStatus[editingInstance.id] === 'disconnected' && !reconnectingInstanceId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full border-orange-500/50 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                          onClick={handleReconnectQr}
                          disabled={qrLoading}
                        >
                          {qrLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <QrCode className="h-4 w-4 mr-1" />}
                          Reconectar via QR Code
                        </Button>
                      )}

                      {/* Inline QR for reconnection */}
                      {editingInstance.id && reconnectingInstanceId === editingInstance.id && qrImage && (
                        <div className="flex flex-col items-center gap-3 p-3 rounded-md border bg-background">
                          <p className="text-sm font-medium text-foreground">Escaneie o QR Code para reconectar</p>
                          <img src={qrImage} alt="QR Code" className="w-48 h-48 rounded" />
                          {pairingCode && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Código:</span>
                              <code className="text-sm font-mono font-bold tracking-widest bg-muted px-2 py-1 rounded">{pairingCode}</code>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Aguardando conexão... ({qrCountdown}s)
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={handleReconnectRefreshQr} disabled={qrLoading}>
                              <RefreshCw className="h-3 w-3 mr-1" /> Atualizar QR
                            </Button>
                            <Button size="sm" variant="ghost" onClick={handleCancelReconnect}>
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      )}

                      {/* Reconnecting loading state */}
                      {editingInstance.id && reconnectingInstanceId === editingInstance.id && !qrImage && qrLoading && (
                        <div className="flex items-center justify-center gap-2 p-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">Obtendo QR Code...</span>
                        </div>
                      )}

                      {/* WhatsApp Profile Editing - only for existing connected instances */}
                      {editingInstance.id && connectionStatus[editingInstance.id] === 'connected' && (
                        <div className="space-y-3 rounded-md border p-3 bg-background">
                          <div className="flex items-center justify-between">
                            <h5 className="text-sm font-semibold flex items-center gap-1.5">
                              <User className="h-4 w-4" />
                              Perfil WhatsApp
                            </h5>
                            {loadingProfile && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                          </div>

                          {/* Profile Photo */}
                          <div className="space-y-2">
                            <Label className="text-xs flex items-center gap-1">
                              <ImageIcon className="h-3 w-3" /> Foto do perfil
                            </Label>
                            <div className="flex items-center gap-4">
                              {/* Current photo or preview */}
                              <div className="h-16 w-16 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 border">
                                {(profilePhotoPreview || currentProfilePhotoUrl) ? (
                                  <img
                                    src={profilePhotoPreview || currentProfilePhotoUrl}
                                    alt="Foto do perfil"
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <User className="h-6 w-6 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <input
                                  ref={profilePhotoInputRef}
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={handleProfilePhotoSelect}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs"
                                    onClick={() => profilePhotoInputRef.current?.click()}
                                    disabled={savingProfilePhoto}
                                  >
                                    <Upload className="h-3 w-3 mr-1" /> Escolher imagem
                                  </Button>
                                  {profilePhotoPreview && (
                                    <Button
                                      size="sm"
                                      className="h-8 text-xs"
                                      onClick={() => handleSaveProfilePhoto(false)}
                                      disabled={savingProfilePhoto}
                                    >
                                      {savingProfilePhoto ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Aplicar'}
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs"
                                    onClick={() => handleSaveProfilePhoto(true)}
                                    disabled={savingProfilePhoto}
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" /> Remover
                                  </Button>
                                </div>
                                {profilePhotoFile && (
                                  <span className="text-xs text-muted-foreground truncate max-w-[200px]">{profilePhotoFile.name}</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Profile Name */}
                          <div className="space-y-1.5">
                            <Label className="text-xs flex items-center gap-1">
                              <User className="h-3 w-3" /> Nome do perfil
                            </Label>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Nome exibido no WhatsApp"
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value)}
                                className="text-xs h-8"
                              />
                              <Button
                                size="sm"
                                className="h-8 text-xs"
                                onClick={handleSaveProfileName}
                                disabled={savingProfileName || !profileName.trim()}
                              >
                                {savingProfileName ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                              </Button>
                            </div>
                          </div>

                          <Separator />

                          {/* Business Info */}
                          <div className="space-y-2">
                            <p className="text-xs font-medium flex items-center gap-1">
                              <Building2 className="h-3 w-3" /> Dados Comerciais
                            </p>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Descrição</Label>
                              <Textarea
                                placeholder="Descrição do negócio..."
                                value={profileDescription}
                                onChange={(e) => setProfileDescription(e.target.value)}
                                className="text-xs min-h-[60px]"
                                rows={2}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs flex items-center gap-1">
                                <MapPin className="h-3 w-3" /> Endereço
                              </Label>
                              <Input
                                placeholder="Endereço comercial"
                                value={profileAddress}
                                onChange={(e) => setProfileAddress(e.target.value)}
                                className="text-xs h-8"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs flex items-center gap-1">
                                <Mail className="h-3 w-3" /> Email
                              </Label>
                              <Input
                                placeholder="email@empresa.com"
                                value={profileEmail}
                                onChange={(e) => setProfileEmail(e.target.value)}
                                className="text-xs h-8"
                                type="email"
                              />
                            </div>
                            <Button
                              size="sm"
                              className="h-8 text-xs w-full"
                              onClick={handleSaveProfileBusiness}
                              disabled={savingProfileBusiness}
                            >
                              {savingProfileBusiness ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                              Salvar dados comerciais
                            </Button>
                          </div>

                          {/* Bulk update button */}
                          <Separator />
                          <div className="space-y-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs w-full"
                              onClick={() => setBulkUpdateConfirmOpen(true)}
                              disabled={bulkUpdateRunning || (!profileName.trim() && !currentProfilePhotoUrl)}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              Aplicar perfil em todas as instâncias
                            </Button>
                            <p className="text-[10px] text-muted-foreground text-center">
                              Atualiza nome e/ou foto gradativamente, uma instância por vez (Atualiza nome e/ou foto gradativamente, uma instância por vez (20-40s entre cada))
                            </p>
                          </div>

                          {/* Bulk update confirmation dialog */}
                          <Dialog open={bulkUpdateConfirmOpen} onOpenChange={setBulkUpdateConfirmOpen}>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle>Aplicar perfil em massa</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4">
                                <p className="text-sm text-muted-foreground">
                                  O perfil será aplicado gradualmente em {instances.filter(i => i.id !== editingInstance?.id && i.ativo && connectionStatus[i.id] === 'connected').length} instância(s) conectada(s), com intervalos aleatórios para segurança.
                                </p>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      id="bulk-name"
                                      checked={bulkUpdateApplyName}
                                      onCheckedChange={(c) => setBulkUpdateApplyName(!!c)}
                                    />
                                    <Label htmlFor="bulk-name" className="text-sm">Aplicar nome: <strong>{profileName || '(vazio)'}</strong></Label>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      id="bulk-photo"
                                      checked={bulkUpdateApplyPhoto}
                                      onCheckedChange={(c) => setBulkUpdateApplyPhoto(!!c)}
                                    />
                                    <Label htmlFor="bulk-photo" className="text-sm">Aplicar foto</Label>
                                  </div>
                                </div>
                                {(() => {
                                  const count = instances.filter(i => i.id !== editingInstance?.id && i.ativo && connectionStatus[i.id] === 'connected').length;
                                  const minMin = Math.ceil(count * 1);
                                  const maxMin = Math.ceil(count * 3);
                                  return (
                                    <p className="text-xs text-muted-foreground">
                                      ⏱ Tempo estimado: ~{minMin} a {maxMin} minutos
                                    </p>
                                  );
                                })()}
                                <div className="flex gap-2 justify-end">
                                  <Button variant="outline" size="sm" onClick={() => setBulkUpdateConfirmOpen(false)}>Cancelar</Button>
                                  <Button
                                    size="sm"
                                    onClick={handleBulkProfileUpdate}
                                    disabled={!bulkUpdateApplyName && !bulkUpdateApplyPhoto}
                                  >
                                    <Play className="h-3 w-3 mr-1" /> Iniciar
                                  </Button>
                                </div>
                              </div>
                            </DialogContent>
                          </Dialog>

                          {/* Bulk update progress */}
                          {bulkUpdateRunning && (
                            <div className="space-y-2 rounded-md border p-3 bg-accent/30">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold">Atualizando perfis... ({bulkUpdateProgress?.current}/{bulkUpdateProgress?.total})</p>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-6 text-[10px] px-2"
                                  onClick={() => { bulkCancelRef.current = true; }}
                                >
                                  <Square className="h-3 w-3 mr-1" /> Cancelar
                                </Button>
                              </div>
                              <div className="space-y-1 max-h-40 overflow-y-auto">
                                {bulkUpdateLog.map(l => (
                                  <div key={l.id} className="flex items-center gap-2 text-[11px]">
                                    {l.status === 'pending' && <span className="text-muted-foreground">⏳</span>}
                                    {l.status === 'running' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                                    {l.status === 'success' && <span className="text-green-600">✓</span>}
                                    {l.status === 'error' && <span className="text-destructive">✗</span>}
                                    <span className={l.status === 'error' ? 'text-destructive' : ''}>{l.nome}</span>
                                    {l.message && <span className="text-muted-foreground">— {l.message}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Bulk update results (after completion) */}
                          {!bulkUpdateRunning && bulkUpdateLog.length > 0 && (
                            <div className="space-y-2 rounded-md border p-3 bg-accent/20">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold">
                                  Resultado: {bulkUpdateLog.filter(l => l.status === 'success').length} sucesso, {bulkUpdateLog.filter(l => l.status === 'error').length} erro(s)
                                </p>
                                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-2" onClick={() => setBulkUpdateLog([])}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {bulkUpdateLog.map(l => (
                                  <div key={l.id} className="flex items-center gap-2 text-[11px]">
                                    {l.status === 'success' && <span className="text-green-600">✓</span>}
                                    {l.status === 'error' && <span className="text-destructive">✗</span>}
                                    {l.status === 'pending' && <span className="text-muted-foreground">—</span>}
                                    <span>{l.nome}</span>
                                    {l.message && <span className="text-muted-foreground">— {l.message}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button onClick={handleSaveInstance} disabled={savingInstance} size="sm">
                          {savingInstance ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                          Salvar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setEditingInstance(null); setQrStep('idle'); handleCancelReconnect(); }}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Instances list */}
                  {instances.length === 0 && !editingInstance && (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma instância cadastrada</p>
                  )}
                  <DndContext collisionDetection={closestCenter} onDragEnd={handleInstanceDragEnd}>
                    <SortableContext items={instances.map(i => i.id)} strategy={verticalListSortingStrategy}>
                      {instances.map((inst) => {
                        const status = connectionStatus[inst.id];
                        return (
                          <SortableInstanceCard key={inst.id} id={inst.id}>
                            <div className={`flex items-center gap-3 rounded-md border px-3 py-2 ${inst.ativo ? '' : 'opacity-50'}`}>
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {inst.whatsapp_profile_photo_url ? (
                                  <div className="h-8 w-8 rounded-full overflow-hidden shrink-0 border">
                                    <img src={inst.whatsapp_profile_photo_url} alt="" className="h-full w-full object-cover" />
                                  </div>
                                ) : (
                                  <WhatsAppIcon />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-sm truncate">{inst.nome || 'Sem nome'}</span>
                                    <Badge variant={inst.ativo ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 shrink-0">
                                      {inst.ativo ? 'Ativo' : 'Inativo'}
                                    </Badge>
                                    {inst.ativo && status === 'connected' && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-green-500 text-green-600">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1" />
                                        Conectado
                                      </Badge>
                                    )}
                                    {inst.ativo && status === 'disconnected' && (
                                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 shrink-0">
                                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive-foreground mr-1" />
                                        Desconectado
                                      </Badge>
                                    )}
                                    {inst.ativo && status === 'checking' && (
                                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                    )}
                                    {inst.apenas_lembretes && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-amber-500 text-amber-600">
                                        Só Lembretes
                                      </Badge>
                                    )}
                                    {inst.robo && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-blue-500 text-blue-600">
                                        Robô
                                      </Badge>
                                    )}
                                    {inst.ia_responde && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-green-500 text-green-600">
                                        IA Responde
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground truncate">{inst.server_url}</p>
                                </div>
                              </div>
                              <div className="flex flex-col gap-1 shrink-0">
                                <div className="flex items-center gap-1">
                                  <Switch
                                    checked={inst.ativo}
                                    onCheckedChange={(checked) => handleToggleInstance(inst.id, checked)}
                                    className="scale-90"
                                    title="Ativar/Desativar"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleTestInstance(inst)}
                                    disabled={testingInstanceId === inst.id}
                                    title="Testar conexão"
                                  >
                                    {testingInstanceId === inst.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      const cached = inst as any;
                                      setEditingInstance({ id: inst.id, nome: inst.nome, server_url: inst.server_url, instance_token: inst.instance_token, whatsapp_profile_name: cached.whatsapp_profile_name, whatsapp_profile_photo_url: cached.whatsapp_profile_photo_url, whatsapp_profile_description: cached.whatsapp_profile_description, whatsapp_profile_address: cached.whatsapp_profile_address, whatsapp_profile_email: cached.whatsapp_profile_email });
                                      // Rehydrate profile fields from cache
                                      setProfileName(cached.whatsapp_profile_name || '');
                                      setCurrentProfilePhotoUrl(cached.whatsapp_profile_photo_url || '');
                                      setProfilePhotoFile(null);
                                      setProfilePhotoPreview('');
                                      setProfileDescription(cached.whatsapp_profile_description || '');
                                      setProfileAddress(cached.whatsapp_profile_address || '');
                                      setProfileEmail(cached.whatsapp_profile_email || '');
                                    }}
                                    title="Editar"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteInstance(inst.id)}
                                    title="Remover"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                {inst.ativo && (
                                  <div className="flex flex-col gap-1 items-end">
                                    <div className="flex items-center gap-1.5">
                                      <Label className="text-[10px] text-muted-foreground cursor-pointer" htmlFor={`lembretes-only-${inst.id}`}>
                                        Apenas Lembretes
                                      </Label>
                                      <Checkbox
                                        id={`lembretes-only-${inst.id}`}
                                        checked={inst.apenas_lembretes}
                                        onCheckedChange={(checked) => handleToggleApenasLembretes(inst.id, !!checked)}
                                        className="h-3.5 w-3.5"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Label className="text-[10px] text-muted-foreground cursor-pointer" htmlFor={`robo-${inst.id}`}>
                                        Robô
                                      </Label>
                                      <Checkbox
                                        id={`robo-${inst.id}`}
                                        checked={inst.robo}
                                        onCheckedChange={(checked) => handleToggleRobo(inst.id, !!checked)}
                                        className="h-3.5 w-3.5"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <Label className="text-[10px] text-muted-foreground cursor-pointer" htmlFor={`ia-responde-${inst.id}`}>
                                        IA Responde
                                      </Label>
                                      <Checkbox
                                        id={`ia-responde-${inst.id}`}
                                        checked={inst.ia_responde}
                                        onCheckedChange={(checked) => handleToggleIaResponde(inst.id, !!checked)}
                                        className="h-3.5 w-3.5"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </SortableInstanceCard>
                        );
                      })}
                    </SortableContext>
                  </DndContext>
                </div>



              {isAdmin && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold">📊 Relatório Diário WhatsApp</h3>
                    <p className="text-sm text-muted-foreground">
                      Selecione qual instância será responsável por enviar o relatório diário e para qual número.
                    </p>
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label>Instância responsável</Label>
                        <Select value={relatorioInstanciaId} onValueChange={setRelatorioInstanciaId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione uma instância" />
                          </SelectTrigger>
                          <SelectContent>
                            {instances.map((inst) => (
                              <SelectItem key={inst.id} value={inst.id}>
                                {inst.nome || inst.server_url} {!inst.ativo ? '(Inativo)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Telefone destino (com DDD)</Label>
                        <Input
                          placeholder="5562991672674"
                          value={relatorioTelefone}
                          onChange={(e) => setRelatorioTelefone(e.target.value.replace(/\D/g, ''))}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={relatorioAtivo} onCheckedChange={setRelatorioAtivo} />
                        <Label className="text-sm">Envio ativo</Label>
                      </div>
                      <Button onClick={handleSalvarRelatorio} disabled={salvandoRelatorio} size="sm">
                        {salvandoRelatorio ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                        Salvar configuração
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {user?.email === 'rodrigo.rs2013@gmail.com' && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold">🔄 Reconfigurar Webhooks</h3>
                    <p className="text-sm text-muted-foreground">
                      Reconfigura o webhook em todas as instâncias ativas para garantir que as mensagens recebidas apareçam no Inbox.
                    </p>
                    <Button
                      variant="outline"
                      className="w-full"
                      disabled={webhookAllLoading}
                      onClick={async () => {
                        setWebhookAllLoading(true);
                        try {
                          const { data, error } = await supabase.functions.invoke('whatsapp-qr', {
                            body: { action: 'setup-webhook-all', userId: user?.id },
                          });
                          if (error) throw error;
                          if (data?.ok) {
                            toast.success(`Webhooks reconfigurados: ${data.success}/${data.total} com sucesso${data.failed > 0 ? `, ${data.failed} falharam` : ''}`);
                          } else {
                            toast.error(data?.error || 'Erro ao reconfigurar webhooks');
                          }
                        } catch (err: any) {
                          toast.error('Erro: ' + (err.message || 'Falha na reconfiguração'));
                        } finally {
                          setWebhookAllLoading(false);
                        }
                      }}
                    >
                      {webhookAllLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                      Reconfigurar Webhooks de Todas as Instâncias
                    </Button>
                  </div>

                  <Separator />
                  <div className="space-y-3">
                    <h3 className="text-base font-semibold">🔗 Webhook do Chatbot IA</h3>
                    <p className="text-sm text-muted-foreground">
                      Configure este webhook em cada instância UAZAPI para que a IA responda automaticamente.
                    </p>
                    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
                      <Label className="text-xs text-muted-foreground">URL do Webhook</Label>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-background rounded px-2 py-1.5 border break-all select-all">
                          {`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/whatsapp-chatbot`}
                        </code>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() => {
                            navigator.clipboard.writeText(`https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/whatsapp-chatbot`);
                            toast.success('URL copiada!');
                          }}
                          title="Copiar URL"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="rounded-md border p-3 space-y-2">
                      <p className="text-sm font-semibold">Passo a passo:</p>
                      <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                        <li>Acesse o painel da UAZAPI da instância desejada</li>
                        <li>Vá em <strong>Configurações</strong> → <strong>Webhook</strong></li>
                        <li>Cole a URL acima no campo de webhook</li>
                        <li>Ative o evento <strong>onMessage</strong> (mensagens recebidas)</li>
                        <li>Salve as configurações</li>
                        <li>Repita para cada instância que deseja usar com a IA</li>
                      </ol>
                    </div>
                  </div>
                </>
              )}

            </div>
          </DialogContent>
        </Dialog>

        {/* Dialog Mensagens de Lembrete */}
        <LembreteMensagensDialog
          open={lembreteMensagensOpen}
          onOpenChange={setLembreteMensagensOpen}
        />

        {/* Chat History Dialog */}
        <ChatHistoryDialog
          open={chatDialogOpen}
          onOpenChange={setChatDialogOpen}
          conversa={selectedConversa}
        />
      </div>
    </AppLayout>
  );
}
