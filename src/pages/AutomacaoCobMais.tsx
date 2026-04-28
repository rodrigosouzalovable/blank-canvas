import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Bot, Settings, Play, Square, RefreshCw, Send, Loader2, Wifi, WifiOff, Terminal, List, Clock, MessageCircle, Monitor, Brain, Zap, GraduationCap, Trash2, Eye, Upload, Video, FileVideo, ImagePlus, X, Phone, CheckSquare, MessageSquare } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { RoboStreamViewer } from '@/components/RoboStreamViewer';
import { Checkbox } from '@/components/ui/checkbox';
import { RoboCodeViewer } from '@/components/RoboCodeViewer';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ACOES_DISPONIVEIS = [
  { value: 'gerar_boleto', label: '🎫 Gerar Boleto CobMais', params: ['cpf', 'valor_final', 'tipo_pagamento', 'parcelas'] },
  { value: 'buscar_cliente', label: 'Buscar Cliente', params: ['cpf'] },
  { value: 'criar_cobranca', label: 'Criar Cobrança', params: ['cpf', 'valor'] },
  { value: 'registrar_acordo', label: 'Registrar Acordo', params: ['cpf', 'valor', 'parcelas'] },
  { value: 'extrair_info', label: 'Extrair Informações', params: ['cpf'] },
  { value: 'login', label: 'Login no CobMais', params: [] },
  { value: 'status_navegador', label: 'Status do Navegador', params: [] },
];

export default function AutomacaoCobMais() {
  const [serverUrl, setServerUrl] = useState('');
  const [cobmaisEmail, setCobmaisEmail] = useState('');
  const [cobmaisSenha, setCobmaisSenha] = useState('');
  const [roboStatus, setRoboStatus] = useState<'online' | 'offline' | 'checking'>('offline');
  const [savingConfig, setSavingConfig] = useState(false);
  const [selectedAcao, setSelectedAcao] = useState('');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [executing, setExecuting] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [comandos, setComandos] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [chatbotAtivo, setChatbotAtivo] = useState(true);
  const [togglingChatbot, setTogglingChatbot] = useState(false);

  // Agent mode state
  const [modoAgente, setModoAgente] = useState(false);
  const [agentObjective, setAgentObjective] = useState('');
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentResult, setAgentResult] = useState<any>(null);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSessionId, setRecordingSessionId] = useState<string | null>(null);
  const [recordingName, setRecordingName] = useState('');
  const [showRecordDialog, setShowRecordDialog] = useState(false);
  const [sessoes, setSessoes] = useState<any[]>([]);
  const [selectedSessaoKnowledge, setSelectedSessaoKnowledge] = useState<any[]>([]);
  const [viewingSessaoId, setViewingSessaoId] = useState<string | null>(null);

  // Video upload state
  const [showVideoUpload, setShowVideoUpload] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoFlowName, setVideoFlowName] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoProgressLabel, setVideoProgressLabel] = useState('');

  // Pós Atendimento state
  type ClientePosAtendimento = { nome: string; primeiro_nome: string; telefone: string; cpf: string; hora: string; mensagem: string; selecionado: boolean; enviando: boolean; enviado: boolean; erro: string | null };
  const [posAtendimentoClientes, setPosAtendimentoClientes] = useState<ClientePosAtendimento[]>([]);
  const [posAtendimentoTemplate, setPosAtendimentoTemplate] = useState('Olá {nome}, tudo bem? Você tem 50% de desconto aprovado na loja Novo Mundo para renegociar todas as parcelas. Posso te passar o valor?');
  const [posAtendimentoLoading, setPosAtendimentoLoading] = useState(false);
  const [posAtendimentoEnviando, setPosAtendimentoEnviando] = useState(false);

  // Chat with AI state
  type ChatMsg = { role: 'user' | 'assistant'; content: string | any[]; image?: string };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatImage, setChatImage] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef<HTMLDivElement>(null);

  // Load persisted chat messages on mount
  useEffect(() => {
    const loadChat = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setChatLoaded(true); return; }
      const { data } = await supabase
        .from('chat_ia_mensagens')
        .select('role, content, image, criado_em')
        .eq('user_id', user.id)
        .order('criado_em', { ascending: true })
        .limit(100);
      if (data && data.length > 0) {
        setChatMessages(data.map(m => {
          let content: string | any[] = m.content;
          try { const parsed = JSON.parse(m.content); if (Array.isArray(parsed)) content = parsed; } catch {}
          return { role: m.role as 'user' | 'assistant', content, image: m.image || undefined };
        }));
      }
      setChatLoaded(true);
    };
    loadChat();
  }, []);

  // Persist chat messages when they change (after initial load)
  const prevMsgCountRef = useRef(0);
  useEffect(() => {
    if (!chatLoaded || isChatLoading || chatMessages.length === 0) return;
    const newCount = chatMessages.length;
    const prevCount = prevMsgCountRef.current;
    if (newCount <= prevCount) return;
    const newMsgs = chatMessages.slice(prevCount);
    prevMsgCountRef.current = newCount;
    const saveNew = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const rows = newMsgs
        .filter(m => typeof m.content === 'string' ? m.content.trim() : true)
        .map(m => ({
          user_id: user.id,
          role: m.role,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          image: m.image || null,
        }));
      if (rows.length > 0) {
        await supabase.from('chat_ia_mensagens').insert(rows as any);
      }
    };
    saveNew();
  }, [chatMessages, chatLoaded, isChatLoading]);
  const chatAbortRef = useRef<AbortController | null>(null);
  const chatImageInputRef = useRef<HTMLInputElement>(null);

  const handleChatImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Imagem muito grande. Máximo: 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setChatImage(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const invokeFunction = useCallback(async (body: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Não autenticado');
    
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${supabaseUrl}/functions/v1/automacao-cobmais`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });
    return res.json();
  }, []);

  const loadConfig = useCallback(async () => {
    const result = await invokeFunction({ action: 'get_config' });
    if (result?.config) {
      setServerUrl(result.config.server_url || '');
      setCobmaisEmail(result.config.cobmais_email || '');
      setCobmaisSenha(result.config.cobmais_senha || '');
    }
  }, [invokeFunction]);

  const checkStatus = useCallback(async () => {
    try {
      const result = await invokeFunction({ action: 'status' });
      setRoboStatus(result?.status === 'online' ? 'online' : 'offline');
    } catch {
      setRoboStatus('offline');
    }
  }, [invokeFunction]);

  const loadComandos = useCallback(async () => {
    const { data } = await supabase
      .from('automacao_comandos')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(50);
    if (data) setComandos(data);
  }, []);

  const loadLogs = useCallback(async () => {
    const { data } = await supabase
      .from('automacao_logs')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(100);
    if (data) setLogs(data);
  }, []);

  const loadChatbotConfig = useCallback(async () => {
    const { data } = await supabase
      .from('chatbot_config')
      .select('ativo')
      .limit(1)
      .single();
    if (data) setChatbotAtivo(data.ativo);
  }, []);

  const loadSessoes = useCallback(async () => {
    const result = await invokeFunction({ action: 'get_sessions' });
    if (result?.sessoes) setSessoes(result.sessoes);
  }, [invokeFunction]);

  const toggleChatbot = async (checked: boolean) => {
    setTogglingChatbot(true);
    try {
      const { error } = await supabase
        .from('chatbot_config')
        .update({ ativo: checked, atualizado_em: new Date().toISOString() } as any)
        .not('id', 'is', null);
      if (error) throw error;
      setChatbotAtivo(checked);
      toast.success(checked ? 'Chatbot WhatsApp ativado' : 'Chatbot WhatsApp desativado');
    } catch {
      toast.error('Erro ao alterar status do chatbot');
    } finally {
      setTogglingChatbot(false);
    }
  };

  useEffect(() => {
    loadConfig();
    loadComandos();
    loadLogs();
    loadChatbotConfig();
    loadSessoes();
  }, [loadConfig, loadComandos, loadLogs, loadChatbotConfig, loadSessoes]);

  useEffect(() => {
    if (!serverUrl) return;
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [serverUrl, checkStatus]);

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await invokeFunction({ action: 'save_config', server_url: serverUrl, cobmais_email: cobmaisEmail, cobmais_senha: cobmaisSenha });
      toast.success('Configuração salva');
    } catch {
      toast.error('Erro ao salvar configuração');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleStopAutomation = async () => {
    try {
      const result = await invokeFunction({ action: 'stop' });
      if (result.success) {
        toast.success('🛑 Robô interrompido com sucesso. Pode dar um novo comando.');
      } else {
        toast.error(result.error || 'Erro ao parar robô');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao parar robô');
    }
  };

  const handleExecute = async () => {
    if (!selectedAcao) return toast.error('Selecione uma ação');
    setExecuting(true);
    setLastResult(null);
    try {
      const result = await invokeFunction({ action: 'execute', acao: selectedAcao, parametros: paramValues });
      setLastResult(result);
      if (result.success) {
        toast.success(`Ação "${selectedAcao}" executada com sucesso`);
      } else {
        toast.error(result.error || 'Erro na execução');
      }
      loadComandos();
      loadLogs();
    } catch {
      toast.error('Erro ao executar comando');
    } finally {
      setExecuting(false);
    }
  };

  const handleAgentExecute = async () => {
    if (!agentObjective.trim()) return toast.error('Descreva o que o robô deve fazer');
    setAgentRunning(true);
    setAgentResult(null);
    try {
      const result = await invokeFunction({ action: 'agent_execute', objetivo: agentObjective, parametros: paramValues });
      setAgentResult(result);
      if (result.success) {
        toast.success('Agente concluiu a tarefa com sucesso!');
      } else {
        toast.error(result.error || result.resultado?.error || 'Erro na execução do agente');
      }
      loadComandos();
      loadLogs();
    } catch {
      toast.error('Erro ao executar agente');
    } finally {
      setAgentRunning(false);
    }
  };

  // Recording handlers
  const handleStartRecording = async () => {
    if (!recordingName.trim()) return toast.error('Dê um nome para o fluxo');
    setShowRecordDialog(false);
    try {
      const result = await invokeFunction({ action: 'record_start', nome: recordingName.trim() });
      if (result.success) {
        setIsRecording(true);
        setRecordingSessionId(result.sessao_id);
        toast.success(`🎓 Gravação iniciada: "${recordingName}"`);
        if (result.warning) {
          toast.warning(result.warning);
        }
      } else {
        toast.error(result.error || 'Erro ao iniciar gravação');
      }
    } catch {
      toast.error('Erro ao iniciar gravação');
    }
  };

  const handleStopRecording = async () => {
    if (!recordingSessionId) return;
    try {
      const result = await invokeFunction({ action: 'record_stop', sessao_id: recordingSessionId });
      if (result.success) {
        toast.success(`🎓 Gravação finalizada com ${result.total_passos} passos!`);
        setIsRecording(false);
        setRecordingSessionId(null);
        setRecordingName('');
        loadSessoes();
      } else {
        toast.error(result.error || 'Erro ao parar gravação');
      }
    } catch {
      toast.error('Erro ao parar gravação');
    }
  };

  const handleViewKnowledge = async (sessaoId: string) => {
    const result = await invokeFunction({ action: 'get_knowledge', sessao_id: sessaoId });
    if (result?.conhecimento) {
      setSelectedSessaoKnowledge(result.conhecimento);
      setViewingSessaoId(sessaoId);
    }
  };

  // Video upload handler
  const handleVideoUpload = async () => {
    if (!videoFile || !videoFlowName.trim()) return;
    if (videoFile.size > 20 * 1024 * 1024) {
      toast.error('Vídeo muito grande. Máximo: 20MB');
      return;
    }

    setUploadingVideo(true);
    setVideoProgress(10);
    setVideoProgressLabel('Enviando vídeo...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const ext = videoFile.name.split('.').pop() || 'webm';
      const filePath = `${session.user.id}/${Date.now()}.${ext}`;

      setVideoProgress(20);
      const { error: uploadError } = await supabase.storage
        .from('cobmais-videos')
        .upload(filePath, videoFile);

      if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`);

      setVideoProgress(50);
      setVideoProgressLabel('Processando com IA... (pode levar até 2 min)');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/process-cobmais-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ video_path: filePath, nome_fluxo: videoFlowName.trim() }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Erro ao processar vídeo');
      }

      setVideoProgress(100);
      setVideoProgressLabel('Concluído!');
      toast.success(`🎓 Vídeo processado! ${result.total_passos} passos extraídos.`);
      if (result.resumo) {
        toast.info(result.resumo, { duration: 8000 });
      }

      // Cleanup
      setVideoFile(null);
      setVideoFlowName('');
      setShowVideoUpload(false);
      loadSessoes();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar vídeo');
    } finally {
      setUploadingVideo(false);
      setVideoProgress(0);
      setVideoProgressLabel('');
    }
  };

  const handleDeleteSession = async (sessaoId: string) => {
    if (!confirm('Excluir esta sessão e todo o conhecimento associado?')) return;
    const result = await invokeFunction({ action: 'delete_session', sessao_id: sessaoId });
    if (result.success) {
      toast.success('Sessão excluída');
      loadSessoes();
      if (viewingSessaoId === sessaoId) {
        setViewingSessaoId(null);
        setSelectedSessaoKnowledge([]);
      }
    }
  };

  // Pós Atendimento handlers
  const handleCapturarPosAtendimento = async () => {
    if (!serverUrl || roboStatus !== 'online') return toast.error('Robô precisa estar online');
    setPosAtendimentoLoading(true);
    setPosAtendimentoClientes([]);
    try {
      // Step 1: Extract text from CobMais via Playwright
      const extractRes = await fetch(`${serverUrl}/automacao/extrair-pos-atendimento`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const extractData = await extractRes.json();
      if (!extractData.success || !extractData.texto) {
        throw new Error(extractData.error || 'Não foi possível extrair o painel Pós Atendimento');
      }

      // Step 2: Process with AI
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const processRes = await fetch(`${supabaseUrl}/functions/v1/process-pos-atendimento`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ texto: extractData.texto, template: posAtendimentoTemplate }),
      });
      const processData = await processRes.json();
      if (!processRes.ok || !processData.success) {
        throw new Error(processData.error || 'Erro ao processar dados');
      }

      const clientes = (processData.clientes || []).map((c: any) => ({
        ...c,
        selecionado: true,
        enviando: false,
        enviado: false,
        erro: null,
      }));
      setPosAtendimentoClientes(clientes);
      if (clientes.length === 0) {
        toast.info('Nenhum cliente encontrado no painel Pós Atendimento');
      } else {
        toast.success(`${clientes.length} cliente(s) extraído(s) do Pós Atendimento`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao capturar Pós Atendimento');
    } finally {
      setPosAtendimentoLoading(false);
    }
  };

  const handleEnviarPosAtendimento = async () => {
    const selecionados = posAtendimentoClientes.filter(c => c.selecionado && !c.enviado);
    if (selecionados.length === 0) return toast.error('Nenhum cliente selecionado para envio');

    setPosAtendimentoEnviando(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error('Não autenticado'); setPosAtendimentoEnviando(false); return; }

    // Get user's WhatsApp config
    const { data: whatsappConfig } = await supabase
      .from('user_whatsapp_instances')
      .select('server_url, instance_token')
      .eq('user_id', session.user.id)
      .eq('ativo', true)
      .limit(1)
      .maybeSingle();

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    for (let i = 0; i < posAtendimentoClientes.length; i++) {
      const c = posAtendimentoClientes[i];
      if (!c.selecionado || c.enviado || !c.telefone) continue;

      setPosAtendimentoClientes(prev => prev.map((cl, idx) => idx === i ? { ...cl, enviando: true } : cl));

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({
            telefone: c.telefone,
            mensagem: c.mensagem,
            uazapi_server_url: whatsappConfig?.server_url,
            uazapi_instance_token: whatsappConfig?.instance_token,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setPosAtendimentoClientes(prev => prev.map((cl, idx) => idx === i ? { ...cl, enviando: false, enviado: true } : cl));
        } else {
          throw new Error(data.error || 'Erro ao enviar');
        }
      } catch (err: any) {
        setPosAtendimentoClientes(prev => prev.map((cl, idx) => idx === i ? { ...cl, enviando: false, erro: err.message } : cl));
      }

      // Small delay between sends
      if (i < posAtendimentoClientes.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    const enviados = posAtendimentoClientes.filter(c => c.enviado).length;
    toast.success(`${enviados + selecionados.length} mensagem(ns) enviada(s)`);
    setPosAtendimentoEnviando(false);
  };

  // Chat with AI about knowledge
  const handleChatSend = async () => {
    const text = chatInput.trim();
    if (!text && !chatImage) return;
    if (isChatLoading) return;

    // Build multimodal content if image attached
    let userContent: string | any[];
    if (chatImage) {
      userContent = [
        { type: 'text', text },
        { type: 'image_url', image_url: { url: chatImage } },
      ];
    } else {
      userContent = text;
    }

    const userMsg: ChatMsg = { role: 'user', content: userContent, image: chatImage || undefined };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatImage(null);
    setIsChatLoading(true);

    // Auto-scroll to streaming section
    setTimeout(() => {
      streamingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    const allMessages = [...chatMessages, { role: 'user' as const, content: userContent }];
    let assistantSoFar = '';

    // Show "executing automation" toast if response takes more than 5s
    const slowTimer = setTimeout(() => {
      toast.info('⚙️ Automação em execução no robô... Aguarde, isso pode levar alguns minutos.', { duration: 30000, id: 'automation-running' });
    }, 5000);

    const abortController = new AbortController();
    chatAbortRef.current = abortController;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const resp = await fetch(`${supabaseUrl}/functions/v1/chat-cobmais-knowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ messages: allMessages }),
        signal: abortController.signal,
      });

      if (!resp.ok || !resp.body) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao conectar com a IA');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;

      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setChatMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant') {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
          }
          return [...prev, { role: 'assistant', content: assistantSoFar }];
        });
      };

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setChatMessages(prev => [...prev, { role: 'assistant', content: '⏹️ Comando interrompido pelo usuário.' }]);
      } else {
        toast.error(err.message || 'Erro ao conversar com a IA');
      }
    } finally {
      chatAbortRef.current = null;
      clearTimeout(slowTimer);
      toast.dismiss('automation-running');
      setIsChatLoading(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const currentParams = ACOES_DISPONIVEIS.find(a => a.value === selectedAcao)?.params || [];

  const statusColor = roboStatus === 'online' ? 'bg-green-500' : roboStatus === 'checking' ? 'bg-yellow-500' : 'bg-destructive';

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Bot className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Robô CobMais</h1>
            <p className="text-muted-foreground">Automação de tarefas no CobMais via Playwright</p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {/* Stop automation button */}
            <Button variant="destructive" size="sm" onClick={handleStopAutomation} disabled={roboStatus !== 'online'}>
              <Square className="h-4 w-4 mr-1" />
              Parar Robô
            </Button>
            {/* Recording button */}
            {isRecording ? (
              <Button variant="destructive" size="sm" onClick={handleStopRecording} className="animate-pulse">
                <Square className="h-4 w-4 mr-1" />
                Parar Gravação
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowRecordDialog(true)} disabled={roboStatus !== 'online'}>
                <GraduationCap className="h-4 w-4 mr-1" />
                Gravar Sessão
              </Button>
            )}
            {/* Agent mode toggle */}
            <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Script</span>
              <Switch checked={modoAgente} onCheckedChange={setModoAgente} />
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Agente IA</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${statusColor} animate-pulse`} />
              <span className="text-sm font-medium capitalize">{roboStatus === 'checking' ? 'Verificando...' : roboStatus}</span>
            </div>
          </div>
        </div>

        {/* Recording indicator */}
        {isRecording && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="flex items-center gap-3 py-3">
              <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
              <span className="font-medium text-destructive">🎓 Gravando: "{recordingName}"</span>
              <span className="text-sm text-muted-foreground">— Navegue normalmente no CobMais pelo stream. Seus cliques e preenchimentos estão sendo gravados.</span>
              <Button variant="destructive" size="sm" onClick={handleStopRecording} className="ml-auto">
                <Square className="h-4 w-4 mr-1" /> Parar
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {roboStatus === 'online' ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-destructive" />}
                Status do Robô
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={roboStatus === 'online' ? 'default' : 'destructive'} className="text-lg px-4 py-1">
                {roboStatus === 'checking' ? 'Verificando...' : roboStatus === 'online' ? 'ONLINE' : 'OFFLINE'}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><MessageCircle className="h-4 w-4" />Chatbot WhatsApp</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Controla as respostas automáticas do chatbot para todos os clientes</p>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Switch
                checked={chatbotAtivo}
                onCheckedChange={toggleChatbot}
                disabled={togglingChatbot}
              />
              <span className={`text-sm font-medium ${chatbotAtivo ? 'text-green-600' : 'text-destructive'}`}>
                {chatbotAtivo ? 'Ativado' : 'Desativado'}
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {modoAgente ? <Brain className="h-4 w-4" /> : <List className="h-4 w-4" />}
                Modo Atual
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={modoAgente ? 'default' : 'secondary'} className="text-lg px-4 py-1">
                {modoAgente ? '🧠 AGENTE IA' : '📜 SCRIPT'}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" />Último Comando</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-sm text-muted-foreground">
                {comandos[0] ? format(new Date(comandos[0].criado_em), 'dd/MM/yyyy HH:mm') : 'Nenhum'}
              </span>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Config */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5" />Configuração</CardTitle>
              <CardDescription>URL do servidor Playwright e credenciais CobMais</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>URL do Servidor Playwright</Label>
                <Input placeholder="https://meurobo.ngrok.app" value={serverUrl} onChange={e => setServerUrl(e.target.value)} />
              </div>
              <Separator />
              <div>
              <Label>Login CobMais</Label>
                <Input placeholder="seu.usuario" value={cobmaisEmail} onChange={e => setCobmaisEmail(e.target.value)} />
              </div>
              <div>
                <Label>Senha CobMais</Label>
                <Input type="password" value={cobmaisSenha} onChange={e => setCobmaisSenha(e.target.value)} />
              </div>
              <Button onClick={handleSaveConfig} disabled={savingConfig} className="w-full">
                {savingConfig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar Configuração
              </Button>
            </CardContent>
          </Card>

          {/* Console - Script or Agent mode */}
          {modoAgente ? (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  Agente Inteligente
                </CardTitle>
                <CardDescription>
                  Descreva em texto livre o que o robô deve fazer. A IA analisará a tela e decidirá as ações automaticamente.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>O que você quer que o robô faça?</Label>
                  <Textarea
                    placeholder="Ex: Gerar boleto para o CPF 123.456.789-00 com valor de R$ 1.500,00 em 3 parcelas"
                    value={agentObjective}
                    onChange={e => setAgentObjective(e.target.value)}
                    className="min-h-[100px]"
                  />
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                  <p>🧠 <strong>Gemini Vision</strong> analisa a tela a cada passo</p>
                  <p>🔄 Máx. <strong>30 iterações</strong> | Timeout: <strong>5 min</strong></p>
                  <p>⚠️ Para automaticamente se confiança &lt; 70%</p>
                  {sessoes.length > 0 && (
                    <p>🎓 <strong>{sessoes.length} fluxo(s) aprendido(s)</strong> serão usados como referência</p>
                  )}
                </div>
                <Button
                  onClick={handleAgentExecute}
                  disabled={agentRunning || !agentObjective.trim() || roboStatus !== 'online'}
                  className="w-full"
                  size="lg"
                >
                  {agentRunning ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Agente em execução...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 mr-2" />
                      Executar Agente
                    </>
                  )}
                </Button>
                {roboStatus !== 'online' && agentObjective.trim() && (
                  <p className="text-sm text-destructive">O robô precisa estar online para o agente funcionar.</p>
                )}
                {agentResult && (
                  <div className="mt-2 space-y-2">
                    <Label>Resultado do Agente:</Label>
                    <Badge variant={agentResult.success ? 'default' : 'destructive'}>
                      {agentResult.success ? '✅ Sucesso' : '❌ Erro'}
                    </Badge>
                    {agentResult.resultado?.iterations && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {agentResult.resultado.iterations} iterações | {((agentResult.tempo_ms || 0) / 1000).toFixed(1)}s
                      </span>
                    )}
                    {agentResult.resultado?.history && (
                      <ScrollArea className="h-48 rounded-md border p-3 bg-muted">
                        <div className="space-y-1">
                          {(agentResult.resultado.history as any[]).map((h: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="text-muted-foreground shrink-0 font-mono">{i + 1}.</span>
                              <Badge variant={h.result === 'ok' || h.result === 'concluido' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 shrink-0">
                                {h.action}
                              </Badge>
                              <span className="truncate">{h.description}</span>
                              {h.confidence && (
                                <span className="text-muted-foreground shrink-0">({Math.round(h.confidence * 100)}%)</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                    {!agentResult.resultado?.history && (
                      <ScrollArea className="h-32 rounded-md border p-3 bg-muted">
                        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(agentResult, null, 2)}</pre>
                      </ScrollArea>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Terminal className="h-5 w-5" />Console de Comandos</CardTitle>
                <CardDescription>Envie comandos para o robô CobMais</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Ação</Label>
                  <Select value={selectedAcao} onValueChange={v => { setSelectedAcao(v); setParamValues({}); }}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma ação" /></SelectTrigger>
                    <SelectContent>
                      {ACOES_DISPONIVEIS.map(a => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {currentParams.map(param => (
                  <div key={param}>
                    <Label className="capitalize">{param}</Label>
                    <Input
                      placeholder={param === 'cpf' ? '000.000.000-00' : param === 'valor' ? '1500.00' : param}
                      value={paramValues[param] || ''}
                      onChange={e => setParamValues(prev => ({ ...prev, [param]: e.target.value }))}
                    />
                  </div>
                ))}
                <Button onClick={handleExecute} disabled={executing || !selectedAcao || roboStatus !== 'online'} className="w-full">
                  {executing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                  Executar
                </Button>
                {roboStatus !== 'online' && selectedAcao && (
                  <p className="text-sm text-destructive">O robô precisa estar online para executar comandos.</p>
                )}
                {lastResult && (
                  <div className="mt-2">
                    <Label>Resultado:</Label>
                    <ScrollArea className="h-32 rounded-md border p-3 bg-muted">
                      <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(lastResult, null, 2)}</pre>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Streaming */}
        {roboStatus === 'online' && serverUrl && (
          <div ref={streamingRef}>
            <RoboStreamViewer serverUrl={serverUrl} roboOnline={roboStatus === 'online'} />
          </div>
        )}

        {/* Pós Atendimento */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              📞 Pós Atendimento → WhatsApp
            </CardTitle>
            <CardDescription>
              Capture os clientes do painel "Pós Atendimento" do CobMais e envie mensagens automáticas via WhatsApp.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Template de mensagem */}
            <div>
              <Label>Template da Mensagem</Label>
              <Textarea
                value={posAtendimentoTemplate}
                onChange={e => setPosAtendimentoTemplate(e.target.value)}
                placeholder="Olá {nome}, tudo bem?..."
                className="min-h-[80px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Variáveis disponíveis: <code>{'{nome}'}</code> (primeiro nome), <code>{'{nome_completo}'}</code>, <code>{'{telefone}'}</code>, <code>{'{cpf}'}</code>
              </p>
            </div>

            {/* Botão capturar */}
            <Button
              onClick={handleCapturarPosAtendimento}
              disabled={posAtendimentoLoading || roboStatus !== 'online'}
              className="w-full"
            >
              {posAtendimentoLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Capturando...</>
              ) : (
                <><Monitor className="h-4 w-4 mr-2" />Capturar Pós Atendimento</>
              )}
            </Button>

            {roboStatus !== 'online' && (
              <p className="text-sm text-destructive">O robô precisa estar online para capturar o Pós Atendimento.</p>
            )}

            {/* Lista de clientes extraídos */}
            {posAtendimentoClientes.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>{posAtendimentoClientes.length} cliente(s) encontrado(s)</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPosAtendimentoClientes(prev => prev.map(c => ({ ...c, selecionado: !prev.every(p => p.selecionado) })))}
                    >
                      <CheckSquare className="h-4 w-4 mr-1" />
                      {posAtendimentoClientes.every(c => c.selecionado) ? 'Desmarcar Todos' : 'Selecionar Todos'}
                    </Button>
                  </div>
                </div>

                <ScrollArea className="max-h-[300px] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Hora</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>CPF</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {posAtendimentoClientes.map((c, i) => (
                        <TableRow key={i} className={c.enviado ? 'opacity-60' : ''}>
                          <TableCell>
                            <Checkbox
                              checked={c.selecionado}
                              disabled={c.enviado || c.enviando}
                              onCheckedChange={(checked) => {
                                setPosAtendimentoClientes(prev => prev.map((cl, idx) => idx === i ? { ...cl, selecionado: !!checked } : cl));
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-sm font-mono">{c.hora || '-'}</TableCell>
                          <TableCell className="font-medium">{c.nome}</TableCell>
                          <TableCell className="font-mono text-sm">{c.telefone}</TableCell>
                          <TableCell className="font-mono text-sm">{c.cpf}</TableCell>
                          <TableCell>
                            {c.enviando ? (
                              <Badge variant="secondary"><Loader2 className="h-3 w-3 animate-spin mr-1" />Enviando</Badge>
                            ) : c.enviado ? (
                              <Badge variant="default">✅ Enviado</Badge>
                            ) : c.erro ? (
                              <Badge variant="destructive" title={c.erro}>❌ Erro</Badge>
                            ) : (
                              <Badge variant="outline">Pendente</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                {/* Preview da mensagem */}
                {posAtendimentoClientes.length > 0 && (
                  <div className="rounded-lg bg-muted/50 p-3">
                    <Label className="text-xs text-muted-foreground">Preview da mensagem (primeiro cliente):</Label>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{posAtendimentoClientes[0]?.mensagem}</p>
                  </div>
                )}

                {/* Botão enviar */}
                <Button
                  onClick={handleEnviarPosAtendimento}
                  disabled={posAtendimentoEnviando || !posAtendimentoClientes.some(c => c.selecionado && !c.enviado)}
                  className="w-full"
                  size="lg"
                >
                  {posAtendimentoEnviando ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />Enviando mensagens...</>
                  ) : (
                    <><MessageSquare className="h-4 w-4 mr-2" />Enviar WhatsApp ({posAtendimentoClientes.filter(c => c.selecionado && !c.enviado).length})</>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chat com IA sobre o conhecimento */}
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5" />
                💬 Conversar com a IA sobre o Conhecimento
              </CardTitle>
              <CardDescription>
                Pergunte à IA o que ela aprendeu, se tem dúvidas ou se precisa de mais treinamento.
              </CardDescription>
            </div>
            {chatMessages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={async () => {
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) await supabase.from('chat_ia_mensagens').delete().eq('user_id', user.id);
                  setChatMessages([]);
                  prevMsgCountRef.current = 0;
                  toast.success('Histórico limpo');
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" /> Limpar
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Messages area */}
              <ScrollArea className="h-80 rounded-md border p-4 bg-muted/30">
                <div className="space-y-4">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Comece perguntando algo como:</p>
                      <div className="flex flex-wrap gap-2 justify-center mt-3">
                        {['O que você sabe fazer?', 'Tem alguma dúvida?', 'Sabe gerar boleto?'].map(q => (
                          <Button key={q} variant="outline" size="sm" onClick={() => { setChatInput(q); }}>
                            {q}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => {
                    const textContent = typeof msg.content === 'string' 
                      ? msg.content 
                      : (msg.content as any[])?.find((c: any) => c.type === 'text')?.text || '';
                    return (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-card border'
                      }`}>
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown>{textContent}</ReactMarkdown>
                            {textContent.includes('📹') && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={() => setShowVideoUpload(true)}
                              >
                                <FileVideo className="h-4 w-4 mr-1" />
                                Enviar Vídeo de Treinamento
                              </Button>
                            )}
                          </div>
                        ) : (
                          <div>
                            {msg.image && (
                              <img src={msg.image} alt="Screenshot enviado" className="rounded-md max-h-48 mb-2" />
                            )}
                            <p>{textContent}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {isChatLoading && chatMessages[chatMessages.length - 1]?.role !== 'assistant' && (
                    <div className="flex justify-start">
                      <div className="bg-card border rounded-lg px-4 py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {/* Image preview */}
              {chatImage && (
                <div className="relative inline-block">
                  <img src={chatImage} alt="Preview" className="rounded-md max-h-32 border" />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                    onClick={() => setChatImage(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}

              {/* Input area */}
              <input
                type="file"
                accept="image/*"
                ref={chatImageInputRef}
                className="hidden"
                onChange={handleChatImageSelect}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => chatImageInputRef.current?.click()}
                  disabled={isChatLoading}
                  title="Anexar imagem/screenshot"
                >
                  <ImagePlus className="h-4 w-4" />
                </Button>
                <Input
                  placeholder="Pergunte à IA ou envie um print mostrando onde clicar..."
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                  onPaste={e => {
                    const items = e.clipboardData?.items;
                    if (!items) return;
                    for (const item of Array.from(items)) {
                      if (item.type.startsWith('image/')) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (!file || file.size > 5 * 1024 * 1024) return;
                        const reader = new FileReader();
                        reader.onload = () => setChatImage(reader.result as string);
                        reader.readAsDataURL(file);
                        break;
                      }
                    }
                  }}
                  disabled={isChatLoading}
                  className="flex-1"
                />
                {isChatLoading ? (
                  <Button variant="destructive" onClick={() => chatAbortRef.current?.abort()} title="Parar">
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button onClick={handleChatSend} disabled={!chatInput.trim() && !chatImage}>
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Knowledge base - Learned sessions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5" />
                🎓 Conhecimento Aprendido
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowVideoUpload(true)}>
                  <FileVideo className="h-4 w-4 mr-1" /> Enviar Vídeo
                </Button>
                <Button variant="outline" size="sm" onClick={loadSessoes}>
                  <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
                </Button>
              </div>
            </div>
            <CardDescription>
              Sessões gravadas e vídeos de treinamento. O conhecimento é usado automaticamente pelo agente IA.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sessoes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <GraduationCap className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma sessão gravada ainda.</p>
                <p className="text-sm mt-1">Clique em "Gravar Sessão" para ensinar a IA como usar o CobMais.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome do Fluxo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Passos</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessoes.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.nome}</TableCell>
                        <TableCell>
                          <Badge variant={s.status === 'concluida' ? 'default' : s.status === 'gravando' ? 'secondary' : 'destructive'}>
                            {s.status === 'concluida' ? '✅ Concluída' : s.status === 'gravando' ? '🔴 Gravando' : s.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{s.total_passos}</TableCell>
                        <TableCell className="text-sm">{format(new Date(s.criado_em), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleViewKnowledge(s.id)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleDeleteSession(s.id)} className="text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Knowledge detail view */}
                {viewingSessaoId && selectedSessaoKnowledge.length > 0 && (
                  <div className="mt-4">
                    <Label className="text-sm font-medium mb-2 block">
                      Passos gravados ({selectedSessaoKnowledge.length}):
                    </Label>
                    <ScrollArea className="h-64 rounded-md border p-3 bg-muted">
                      <div className="space-y-2">
                        {selectedSessaoKnowledge.map((step, i) => (
                          <div key={step.id || i} className="flex items-start gap-2 text-xs border-b border-border/50 pb-2">
                            <span className="text-muted-foreground shrink-0 font-mono w-6">{step.passo_numero}.</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                              {step.acao}
                            </Badge>
                            {step.seletor && <code className="text-primary text-[10px]">{step.seletor}</code>}
                            {step.valor && <span className="text-muted-foreground truncate max-w-[200px]">"{step.valor}"</span>}
                            {step.descricao_tela && <span className="text-muted-foreground italic truncate">{step.descricao_tela}</span>}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Código do Robô */}
        <RoboCodeViewer />

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Fila & Logs</CardTitle>
              <Button variant="outline" size="sm" onClick={() => { loadComandos(); loadLogs(); }}>
                <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="comandos">
              <TabsList>
                <TabsTrigger value="comandos">Comandos ({comandos.length})</TabsTrigger>
                <TabsTrigger value="logs">Logs ({logs.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="comandos">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ação</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Tempo</TableHead>
                        <TableHead>Erro</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {comandos.map(cmd => (
                        <TableRow key={cmd.id}>
                          <TableCell className="font-mono text-sm">{cmd.acao}</TableCell>
                          <TableCell>
                            <Badge variant={cmd.status === 'concluido' ? 'default' : cmd.status === 'erro' ? 'destructive' : 'secondary'}>
                              {cmd.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{cmd.tempo_execucao_ms ? `${cmd.tempo_execucao_ms}ms` : '-'}</TableCell>
                          <TableCell className="text-sm text-destructive max-w-[200px] truncate">{cmd.erro || '-'}</TableCell>
                          <TableCell className="text-sm">{format(new Date(cmd.criado_em), 'dd/MM HH:mm:ss')}</TableCell>
                        </TableRow>
                      ))}
                      {comandos.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nenhum comando executado</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="logs">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Mensagem</TableHead>
                        <TableHead>Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map(log => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <Badge variant={log.tipo === 'sucesso' ? 'default' : log.tipo === 'erro' ? 'destructive' : 'secondary'}>
                              {log.tipo}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[400px] truncate">{log.mensagem}</TableCell>
                          <TableCell className="text-sm">{format(new Date(log.criado_em), 'dd/MM HH:mm:ss')}</TableCell>
                        </TableRow>
                      ))}
                      {logs.length === 0 && (
                        <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Nenhum log registrado</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Record session dialog */}
      <Dialog open={showRecordDialog} onOpenChange={setShowRecordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              Gravar Sessão de Aprendizado
            </DialogTitle>
            <DialogDescription>
              A IA vai observar enquanto você navega no CobMais. Seus cliques e preenchimentos serão gravados como "lições" que o agente usará no futuro.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome do Fluxo</Label>
              <Input
                placeholder="Ex: gerar_boleto, cadastrar_email, buscar_cliente"
                value={recordingName}
                onChange={e => setRecordingName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Use nomes descritivos como "gerar_boleto" ou "cadastrar_email_devedor"</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-2">
              <p>📋 <strong>Como funciona:</strong></p>
              <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                <li>O robô vai começar a capturar seus cliques e preenchimentos</li>
                <li>Navegue normalmente no CobMais pelo stream de vídeo</li>
                <li>Quando terminar, clique "Parar Gravação"</li>
                <li>Os passos serão salvos e usados pelo agente IA automaticamente</li>
              </ol>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecordDialog(false)}>Cancelar</Button>
            <Button onClick={handleStartRecording} disabled={!recordingName.trim()}>
              <GraduationCap className="h-4 w-4 mr-2" />
              Iniciar Gravação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video upload dialog */}
      <Dialog open={showVideoUpload} onOpenChange={v => { if (!uploadingVideo) setShowVideoUpload(v); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileVideo className="h-5 w-5" />
              Enviar Vídeo de Treinamento
            </DialogTitle>
            <DialogDescription>
              Grave sua tela com narração usando uma extensão como Screen Recorder. A IA vai analisar o vídeo e extrair os passos automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome do Fluxo</Label>
              <Input
                placeholder="Ex: gerar_boleto, cadastrar_email"
                value={videoFlowName}
                onChange={e => setVideoFlowName(e.target.value)}
                disabled={uploadingVideo}
              />
            </div>
            <div>
              <Label>Vídeo (.webm ou .mp4)</Label>
              <div className="mt-2">
                {videoFile ? (
                  <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/50">
                    <Video className="h-5 w-5 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{videoFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(videoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    {!uploadingVideo && (
                      <Button variant="ghost" size="sm" onClick={() => setVideoFile(null)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">Clique para selecionar o vídeo</span>
                    <span className="text-xs text-muted-foreground mt-1">Máx. 20MB • .webm ou .mp4</span>
                    <input
                      type="file"
                      accept="video/webm,video/mp4,.webm,.mp4"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) setVideoFile(file);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>
            {uploadingVideo && (
              <div className="space-y-2">
                <Progress value={videoProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">{videoProgressLabel}</p>
              </div>
            )}
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-2">
              <p>💡 <strong>Dicas:</strong></p>
              <ul className="list-disc list-inside space-y-1 text-xs text-muted-foreground">
                <li>Grave vídeos curtos e focados (2-5 min por fluxo)</li>
                <li>Narre em voz alta o que você está fazendo e por quê</li>
                <li>Exemplo: "Agora clico no botão amarelo para abrir o menu de boletos"</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVideoUpload(false)} disabled={uploadingVideo}>Cancelar</Button>
            <Button onClick={handleVideoUpload} disabled={!videoFile || !videoFlowName.trim() || uploadingVideo}>
              {uploadingVideo ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Processando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Enviar e Processar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
