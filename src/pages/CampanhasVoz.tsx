import { useState, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVoiceCampaignSending } from '@/contexts/VoiceCampaignSendingContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Upload, Play, Pause, Trash2, Send, StopCircle, Download, Plus, Mic, FileSpreadsheet, Loader2, Check, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { exportarParaExcel } from '@/lib/exportExcel';
import * as XLSX from 'xlsx';

type Campaign = {
  id: string;
  name: string;
  audio_url: string | null;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  total_contacts: number;
  total_sent: number;
  total_errors: number;
  campaign_type?: string;
};

type CampaignAudio = {
  id: string;
  campaign_id: string;
  audio_url: string;
  file_name: string;
  created_at: string;
};

type CampaignContact = {
  id: string;
  campaign_id: string;
  telefone: string;
  nome: string | null;
  status: string;
  enviado_em: string | null;
  erro_mensagem: string | null;
};

type AudioFileItem = {
  file: File;
  previewUrl: string;
  name: string;
};

export default function CampanhasVoz() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campaignName, setCampaignName] = useState('');
  const [audioFiles, setAudioFiles] = useState<AudioFileItem[]>([]);
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [contactSource, setContactSource] = useState<'acordos' | 'devedores' | 'planilha'>('planilha');
  const [importedContacts, setImportedContacts] = useState<{ id: string; nome: string; telefone: string }[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [verificandoWhatsApp, setVerificandoWhatsApp] = useState(false);
  const [numerosInvalidos, setNumerosInvalidos] = useState<{ nome: string; telefone: string }[]>([]);
  const [mostrarInvalidos, setMostrarInvalidos] = useState(false);
  const [verificacaoConcluida, setVerificacaoConcluida] = useState(false);
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('voice-campaign-instances');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [delayMin, setDelayMin] = useState(() => {
    const saved = localStorage.getItem('voice-campaign-delay-min');
    return saved ? Number(saved) : 1;
  });
  const [delayMax, setDelayMax] = useState(() => {
    const saved = localStorage.getItem('voice-campaign-delay-max');
    return saved ? Number(saved) : 5;
  });

  useEffect(() => {
    localStorage.setItem('voice-campaign-instances', JSON.stringify(selectedInstanceIds));
  }, [selectedInstanceIds]);
  useEffect(() => {
    localStorage.setItem('voice-campaign-delay-min', String(delayMin));
  }, [delayMin]);
  useEffect(() => {
    localStorage.setItem('voice-campaign-delay-max', String(delayMax));
  }, [delayMax]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { sendingCampaignId, sendingProgress, startCampaign: startCampaignContext, cancelCampaign } = useVoiceCampaignSending();

  // Fetch campaigns
  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery({
    queryKey: ['voice-campaigns', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('voice_campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Campaign[];
    },
    enabled: !!user,
  });

  // Fetch campaign contacts
  const { data: campaignContacts = [] } = useQuery({
    queryKey: ['voice-campaign-contacts', selectedCampaignId],
    queryFn: async () => {
      if (!selectedCampaignId) return [];
      const { data, error } = await supabase
        .from('voice_campaign_contacts')
        .select('*')
        .eq('campaign_id', selectedCampaignId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      return data as CampaignContact[];
    },
    enabled: !!selectedCampaignId,
    refetchInterval: sendingCampaignId ? 5000 : false,
  });

  // Fetch campaign audios
  const { data: campaignAudios = [] } = useQuery({
    queryKey: ['voice-campaign-audios', selectedCampaignId],
    queryFn: async () => {
      if (!selectedCampaignId) return [];
      const { data, error } = await supabase
        .from('voice_campaign_audios')
        .select('*')
        .eq('campaign_id', selectedCampaignId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as CampaignAudio[];
    },
    enabled: !!selectedCampaignId,
  });

  // Fetch WhatsApp instances
  const { data: allInstances = [] } = useQuery({
    queryKey: ['whatsapp-instances-voice', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_whatsapp_instances')
        .select('id, nome, server_url, instance_token')
        .eq('user_id', user!.id)
        .eq('ativo', true);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Check connection status for each instance
  const [connectionStatus, setConnectionStatus] = useState<Record<string, 'checking' | 'connected' | 'disconnected'>>({});
  const [checkingConnections, setCheckingConnections] = useState(false);

  useEffect(() => {
    if (allInstances.length === 0) return;
    
    setCheckingConnections(true);
    const newStatus: Record<string, 'checking' | 'connected' | 'disconnected'> = {};
    allInstances.forEach(inst => { newStatus[inst.id] = 'checking'; });
    setConnectionStatus(newStatus);

    const checkAll = async () => {
      const results = await Promise.allSettled(
        allInstances.map(async (inst) => {
          try {
            const { data } = await supabase.functions.invoke('test-uazapi-connection', {
              body: { server_url: inst.server_url, instance_token: inst.instance_token },
            });
            return { id: inst.id, connected: data?.ok === true };
          } catch {
            return { id: inst.id, connected: false };
          }
        })
      );

      const finalStatus: Record<string, 'connected' | 'disconnected'> = {};
      results.forEach(r => {
        if (r.status === 'fulfilled') {
          finalStatus[r.value.id] = r.value.connected ? 'connected' : 'disconnected';
        }
      });
      setConnectionStatus(finalStatus);
      setCheckingConnections(false);
    };

    checkAll();
  }, [allInstances]);

  const instances = allInstances.filter(inst => connectionStatus[inst.id] === 'connected');

  // Fetch DB contacts
  const { data: dbContacts = [] } = useQuery({
    queryKey: ['available-contacts', contactSource, user?.id],
    queryFn: async () => {
      if (contactSource === 'acordos') {
        const { data, error } = await supabase
          .from('acordos')
          .select('id, cliente_nome, cliente_telefone')
          .eq('user_id', user!.id)
          .eq('status', 'ativo')
          .not('cliente_telefone', 'is', null);
        if (error) throw error;
        return (data || []).map(a => ({ id: a.id, nome: a.cliente_nome, telefone: a.cliente_telefone! }));
      } else if (contactSource === 'devedores') {
        const { data, error } = await supabase
          .from('devedores')
          .select('id, nome, telefone')
          .eq('ativo', true)
          .not('telefone', 'is', null);
        if (error) throw error;
        return (data || []).map(d => ({ id: d.id, nome: d.nome, telefone: d.telefone! }));
      }
      return [];
    },
    enabled: !!user && contactSource !== 'planilha',
  });

  const availableContacts = contactSource === 'planilha' ? importedContacts : dbContacts;

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const contacts = rows.slice(1)
        .filter(row => row[1])
        .map(row => {
          const raw = String(row[1] || '').replace(/\D/g, '');
          const telefone = raw.startsWith('55') ? raw : `55${raw}`;
          return {
            id: crypto.randomUUID(),
            nome: String(row[0] || ''),
            telefone,
          };
        })
        .filter(c => c.telefone.length >= 10);
      setImportedContacts(contacts);
      setContactSource('planilha');
      setSelectedContacts(new Set());
      setVerificacaoConcluida(false);
      setNumerosInvalidos([]);
      toast.success(`${contacts.length} contatos importados da planilha`);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleVerificarWhatsApp = async () => {
    if (importedContacts.length === 0) return;
    const connectedInstance = allInstances.find(i => connectionStatus[i.id] === 'connected');
    if (!connectedInstance) {
      toast.error('Nenhuma instância WhatsApp conectada para verificar');
      return;
    }
    setVerificandoWhatsApp(true);
    setNumerosInvalidos([]);
    setVerificacaoConcluida(false);
    try {
      const telefones = importedContacts.map(c => c.telefone);
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
        const removidos: { nome: string; telefone: string }[] = [];
        const mantidos: { id: string; nome: string; telefone: string }[] = [];
        importedContacts.forEach(c => {
          const clean = c.telefone.replace(/\D/g, '');
          const full = clean.startsWith('55') ? clean : `55${clean}`;
          if (invalidSet.has(clean) || invalidSet.has(full)) {
            removidos.push({ nome: c.nome, telefone: c.telefone });
          } else {
            mantidos.push(c);
          }
        });
        setNumerosInvalidos(removidos);
        setImportedContacts(mantidos);
        setSelectedContacts(new Set());
        setVerificacaoConcluida(true);
        toast.success(`${mantidos.length} válidos, ${removidos.length} sem WhatsApp removidos`);
      } else {
        setVerificacaoConcluida(true);
        toast.info('Todos os números parecem válidos');
      }
    } catch (err: any) {
      toast.error(`Erro: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setVerificandoWhatsApp(false);
    }
  };

  // Multi-audio handling
  const handleAudioFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newItems: AudioFileItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      newItems.push({
        file,
        previewUrl: URL.createObjectURL(file),
        name: file.name,
      });
    }
    setAudioFiles(prev => [...prev, ...newItems]);
  };

  const removeAudioFile = (index: number) => {
    setAudioFiles(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
    if (playingIndex === index) {
      audioRef.current?.pause();
      setPlayingIndex(null);
    }
  };

  const togglePlayAudio = (index: number) => {
    if (!audioRef.current) return;
    if (playingIndex === index) {
      audioRef.current.pause();
      setPlayingIndex(null);
    } else {
      audioRef.current.src = audioFiles[index].previewUrl;
      audioRef.current.play();
      setPlayingIndex(index);
    }
  };

  // Create campaign with multiple audios
  const createCampaign = async () => {
    if (!user || audioFiles.length === 0 || !campaignName.trim()) {
      toast.error('Preencha o nome e adicione pelo menos um áudio');
      return;
    }
    if (selectedInstanceIds.length === 0) {
      toast.error('Selecione pelo menos um WhatsApp');
      return;
    }
    setUploading(true);
    try {
      // Upload all audio files
      const uploadedAudios: { audio_url: string; file_name: string }[] = [];
      for (const item of audioFiles) {
        const ext = item.file.name.split('.').pop() || 'mp3';
        const filePath = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('campaign-audio')
          .upload(filePath, item.file);
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage
          .from('campaign-audio')
          .getPublicUrl(filePath);
        uploadedAudios.push({ audio_url: publicUrl, file_name: item.name });
      }

      // Create campaign (audio_url = first audio for backward compat)
      const { data: newCampaign, error } = await supabase
        .from('voice_campaigns')
        .insert({
          user_id: user.id,
          name: campaignName.trim(),
          audio_url: uploadedAudios[0].audio_url,
          campaign_type: 'audio_message',
        } as any)
        .select('id')
        .single();
      if (error) throw error;

      // Insert all audios into voice_campaign_audios
      const audioInserts = uploadedAudios.map(a => ({
        campaign_id: newCampaign.id,
        audio_url: a.audio_url,
        file_name: a.file_name,
      }));
      const { error: audioError } = await supabase
        .from('voice_campaign_audios')
        .insert(audioInserts as any);
      if (audioError) throw audioError;

      toast.success('Campanha criada!');
      setCampaignName('');
      setAudioFiles([]);
      setShowNewCampaign(false);
      queryClient.invalidateQueries({ queryKey: ['voice-campaigns'] });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar campanha');
    } finally {
      setUploading(false);
    }
  };

  // Add contacts to campaign
  const addContactsToCampaign = async () => {
    if (!selectedCampaignId || selectedContacts.size === 0) return;
    const contacts = availableContacts.filter(c => selectedContacts.has(c.id));
    const inserts = contacts.map(c => ({
      campaign_id: selectedCampaignId,
      telefone: c.telefone,
      nome: c.nome,
    }));

    const { error } = await supabase
      .from('voice_campaign_contacts')
      .insert(inserts as any);
    if (error) {
      toast.error('Erro ao adicionar contatos');
      return;
    }

    await supabase
      .from('voice_campaigns')
      .update({ total_contacts: (campaignContacts.length + contacts.length) } as any)
      .eq('id', selectedCampaignId);

    toast.success(`${contacts.length} contatos adicionados`);
    setSelectedContacts(new Set());
    queryClient.invalidateQueries({ queryKey: ['voice-campaign-contacts'] });
    queryClient.invalidateQueries({ queryKey: ['voice-campaigns'] });
  };

  const handleStartCampaign = async (campaign: Campaign) => {
    const activeInstances = instances.filter(i => selectedInstanceIds.includes(i.id));
    if (activeInstances.length === 0) {
      toast.error('Selecione pelo menos um WhatsApp para envio');
      return;
    }

    // Get audios for this campaign
    const { data: audios } = await supabase
      .from('voice_campaign_audios')
      .select('*')
      .eq('campaign_id', campaign.id)
      .order('created_at', { ascending: true });

    const audioList = (audios && audios.length > 0)
      ? audios.map(a => ({ audio_url: a.audio_url, file_name: a.file_name }))
      : campaign.audio_url
        ? [{ audio_url: campaign.audio_url, file_name: 'audio' }]
        : [];

    if (audioList.length === 0) {
      toast.error('Nenhum áudio encontrado para esta campanha');
      return;
    }

    // Get pending contacts
    const { data: pendingContacts, error } = await supabase
      .from('voice_campaign_contacts')
      .select('*')
      .eq('campaign_id', campaign.id)
      .eq('status', 'pendente')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error || !pendingContacts?.length) {
      toast.error('Nenhum contato pendente para enviar');
      return;
    }

    startCampaignContext({
      campaignId: campaign.id,
      instances: activeInstances,
      audioList,
      pendingContacts: pendingContacts.map(c => ({ id: c.id, telefone: c.telefone, nome: c.nome })),
      initialSent: campaign.total_sent,
      initialErrors: campaign.total_errors,
      delayMin,
      delayMax,
    });
  };

  const exportReport = (contacts: CampaignContact[]) => {
    exportarParaExcel(contacts, [
      { chave: 'nome', titulo: 'Nome' },
      { chave: 'telefone', titulo: 'Telefone' },
      { chave: 'status', titulo: 'Status' },
      { chave: 'enviado_em', titulo: 'Enviado Em' },
      { chave: 'erro_mensagem', titulo: 'Erro' },
    ], 'relatorio-campanha-voz');
  };

  const toggleContact = (id: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllContacts = () => {
    if (selectedContacts.size === availableContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(availableContacts.map(c => c.id)));
    }
  };

  const deleteCampaign = async (campaignId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta campanha?')) return;
    try {
      await supabase.from('voice_campaign_contacts').delete().eq('campaign_id', campaignId);
      await supabase.from('voice_campaign_audios').delete().eq('campaign_id', campaignId);
      await supabase.from('voice_campaigns').delete().eq('id', campaignId);
      if (selectedCampaignId === campaignId) setSelectedCampaignId(null);
      queryClient.invalidateQueries({ queryKey: ['voice-campaigns'] });
      toast.success('Campanha excluída');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir');
    }
  };

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
  const statusColors: Record<string, string> = {
    pendente: 'bg-yellow-100 text-yellow-800',
    enviado: 'bg-green-100 text-green-800',
    erro: 'bg-red-100 text-red-800',
    rascunho: 'bg-muted text-muted-foreground',
    enviando: 'bg-blue-100 text-blue-800',
    concluido: 'bg-green-100 text-green-800',
    cancelado: 'bg-red-100 text-red-800',
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <audio ref={audioRef} onEnded={() => setPlayingIndex(null)} className="hidden" />

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Campanhas de Voz</h1>
            <p className="text-muted-foreground">Envie áudios em massa via WhatsApp como nota de voz</p>
          </div>
          <Button onClick={() => setShowNewCampaign(!showNewCampaign)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Campanha
          </Button>
        </div>

        {/* New Campaign Form */}
        {showNewCampaign && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Mic className="h-5 w-5" />
                Criar Campanha
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Nome da Campanha</Label>
                <Input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder="Ex: Lembrete de pagamento"
                />
              </div>

              {/* WhatsApp instances */}
              <div>
              <div className="flex items-center justify-between">
                  <Label>WhatsApp para envio ({selectedInstanceIds.length}/{instances.length} selecionadas)</Label>
                  {!checkingConnections && instances.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        if (selectedInstanceIds.length === instances.length) {
                          setSelectedInstanceIds([]);
                        } else {
                          setSelectedInstanceIds(instances.map(i => i.id));
                        }
                      }}
                    >
                      {selectedInstanceIds.length === instances.length ? 'Desmarcar todas' : 'Selecionar todas'}
                    </Button>
                  )}
                </div>
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                  {checkingConnections && (
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verificando conexões...
                    </p>
                  )}
                  {!checkingConnections && instances.map(inst => (
                    <label key={inst.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedInstanceIds.includes(inst.id)}
                        onCheckedChange={(checked) => {
                          setSelectedInstanceIds(prev =>
                            checked ? [...prev, inst.id] : prev.filter(id => id !== inst.id)
                          );
                        }}
                      />
                      <span className="text-sm">{inst.nome || inst.server_url}</span>
                    </label>
                  ))}
                  {!checkingConnections && instances.length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum WhatsApp conectado</p>
                  )}
                </div>
              </div>

              {/* Multi-audio upload */}
              <div>
                <Label>Áudios (selecione um ou mais arquivos)</Label>
                <Input
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={handleAudioFilesChange}
                />
              </div>

              {audioFiles.length > 0 && (
                <div className="space-y-2 border rounded-md p-3">
                  <p className="text-sm font-medium">{audioFiles.length} áudio(s) selecionado(s)</p>
                  {audioFiles.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2 bg-muted rounded">
                      <Badge variant="outline" className="shrink-0">Áudio {idx + 1}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => togglePlayAudio(idx)} className="h-7 w-7 p-0">
                        {playingIndex === idx ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      </Button>
                      <span className="text-sm truncate flex-1">{item.name}</span>
                      <Button size="sm" variant="ghost" onClick={() => removeAudioFile(idx)} className="h-7 w-7 p-0 text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Delay config */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Delay mínimo (segundos)</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={delayMin}
                    onChange={(e) => setDelayMin(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Delay máximo (segundos)</Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={delayMax}
                    onChange={(e) => setDelayMax(Number(e.target.value))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                O intervalo entre cada envio será aleatório entre {delayMin} e {delayMax} segundo(s)
              </p>

              {/* Excel import in creation */}
              <div>
                <Label className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Importar contatos da planilha (Coluna A = Nome, Coluna B = Telefone)
                </Label>
                <Input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelImport}
                  className="mt-1"
                />
                {importedContacts.length > 0 && (
                  <div className="space-y-2 mt-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-muted-foreground">
                        {importedContacts.length} contatos importados
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleVerificarWhatsApp}
                        disabled={verificandoWhatsApp}
                        className="gap-1 h-7 text-xs"
                      >
                        {verificandoWhatsApp ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        {verificandoWhatsApp ? 'Verificando...' : 'Verificar WhatsApp'}
                      </Button>
                    </div>
                    {verificacaoConcluida && numerosInvalidos.length > 0 && (
                      <Alert>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle>{numerosInvalidos.length} sem WhatsApp removidos</AlertTitle>
                        <AlertDescription>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setMostrarInvalidos(!mostrarInvalidos)}
                            className="text-xs p-0 h-auto"
                          >
                            {mostrarInvalidos ? 'Ocultar' : 'Ver removidos'}
                          </Button>
                          {mostrarInvalidos && (
                            <div className="max-h-32 overflow-y-auto border rounded p-2 mt-1 space-y-0.5">
                              {numerosInvalidos.map((c, i) => (
                                <p key={i} className="text-xs text-muted-foreground">{c.nome} — {c.telefone}</p>
                              ))}
                            </div>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}
                    {verificacaoConcluida && numerosInvalidos.length === 0 && (
                      <Alert>
                        <Check className="h-4 w-4" />
                        <AlertTitle>Todos possuem WhatsApp ✓</AlertTitle>
                      </Alert>
                    )}
                  </div>
                )}
              </div>

              <Button onClick={createCampaign} disabled={uploading || audioFiles.length === 0 || !campaignName.trim()}>
                {uploading ? 'Enviando...' : 'Criar Campanha'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Campaign List */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {campaigns.map(campaign => (
            <Card
              key={campaign.id}
              className={cn(
                "cursor-pointer transition-all hover:border-primary/50",
                selectedCampaignId === campaign.id && "border-primary ring-1 ring-primary"
              )}
              onClick={() => setSelectedCampaignId(campaign.id)}
            >
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold truncate">{campaign.name}</h3>
                  <div className="flex items-center gap-2">
                    <Badge className={statusColors[campaign.status] || ''}>
                      {campaign.status}
                    </Badge>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); deleteCampaign(campaign.id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>{campaign.total_contacts} contatos</p>
                  <p className="text-green-600">{campaign.total_sent} enviados</p>
                  {campaign.total_errors > 0 && (
                    <p className="text-red-600">{campaign.total_errors} erros</p>
                  )}
                  <p>{new Date(campaign.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
              </CardContent>
            </Card>
          ))}
          {campaigns.length === 0 && !loadingCampaigns && (
            <p className="text-muted-foreground col-span-full text-center py-8">
              Nenhuma campanha criada ainda
            </p>
          )}
        </div>

        {/* Campaign Detail */}
        {selectedCampaign && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg">{selectedCampaign.name}</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  {(selectedCampaign.status !== 'enviando' || (selectedCampaign.status === 'enviando' && sendingCampaignId !== selectedCampaign.id)) && campaignContacts.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex flex-wrap gap-2 border rounded-md p-2 max-w-md">
                        {instances.map(inst => (
                          <label key={inst.id} className="flex items-center gap-1.5 cursor-pointer text-xs">
                            <Checkbox
                              checked={selectedInstanceIds.includes(inst.id)}
                              onCheckedChange={(checked) => {
                                setSelectedInstanceIds(prev =>
                                  checked ? [...prev, inst.id] : prev.filter(id => id !== inst.id)
                                );
                              }}
                            />
                            <span>{inst.nome || inst.server_url}</span>
                          </label>
                        ))}
                      </div>
                      <Badge variant="outline" className="text-xs whitespace-nowrap">
                        {selectedInstanceIds.length} de {instances.length} selecionada{instances.length !== 1 ? 's' : ''}
                      </Badge>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={delayMin}
                          onChange={(e) => setDelayMin(Number(e.target.value))}
                          className="w-20 h-8 text-xs"
                          placeholder="Min"
                        />
                        <span className="text-xs text-muted-foreground">a</span>
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={delayMax}
                          onChange={(e) => setDelayMax(Number(e.target.value))}
                          className="w-20 h-8 text-xs"
                          placeholder="Max"
                        />
                        <span className="text-xs text-muted-foreground">seg</span>
                      </div>
                      <Button
                        onClick={() => handleStartCampaign(selectedCampaign)}
                        disabled={sendingCampaignId !== null || selectedInstanceIds.length === 0}
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {selectedCampaign.status === 'enviando' ? 'Retomar Envio' : 'Iniciar Envio'}
                      </Button>
                    </div>
                  )}
                  {sendingCampaignId === selectedCampaign.id && (
                    <div className="flex items-center gap-3">
                      {sendingProgress && (
                        <div className="flex items-center gap-2 bg-muted px-3 py-1.5 rounded-lg">
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          <span className="text-sm font-medium">
                            Enviados: <span className="text-green-600">{sendingProgress.sent}</span>
                            {sendingProgress.errors > 0 && (
                              <> | Erros: <span className="text-destructive">{sendingProgress.errors}</span></>
                            )}
                            {' '}/ {sendingProgress.total}
                          </span>
                          {sendingProgress.currentContact && (
                            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                              — {sendingProgress.currentContact}
                            </span>
                          )}
                        </div>
                      )}
                      <Button variant="destructive" onClick={cancelCampaign}>
                        <StopCircle className="h-4 w-4 mr-2" />
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {campaignContacts.length > 0 && (
                    <Button variant="outline" onClick={() => exportReport(campaignContacts)}>
                      <Download className="h-4 w-4 mr-2" />
                      Exportar
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Audios preview */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Áudios da campanha ({campaignAudios.length})</p>
                {campaignAudios.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {campaignAudios.map((a, idx) => (
                      <div key={a.id} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                        <Badge variant="outline" className="shrink-0 text-xs">Áudio {idx + 1}</Badge>
                        <audio controls src={a.audio_url} className="flex-1 h-8" />
                      </div>
                    ))}
                  </div>
                ) : selectedCampaign.audio_url ? (
                  <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                    <Mic className="h-5 w-5 text-muted-foreground" />
                    <audio controls src={selectedCampaign.audio_url} className="flex-1 h-8" />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum áudio</p>
                )}
              </div>

              {/* Add contacts section */}
              {(selectedCampaign.status === 'rascunho' || selectedCampaign.status === 'cancelado') && (
                <div className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Adicionar Contatos</h4>
                    <Select value={contactSource} onValueChange={(v: 'acordos' | 'devedores' | 'planilha') => { setContactSource(v); setSelectedContacts(new Set()); }}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="acordos">Acordos</SelectItem>
                        <SelectItem value="devedores">Devedores</SelectItem>
                        <SelectItem value="planilha">Planilha</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {contactSource === 'planilha' && (
                    <div className="flex items-center gap-3">
                      <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                      <Input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleExcelImport}
                        className="max-w-xs"
                      />
                      <span className="text-xs text-muted-foreground">Coluna A = Nome, Coluna B = Telefone</span>
                    </div>
                  )}

                  <div className="max-h-60 overflow-y-auto border rounded">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={selectedContacts.size === availableContacts.length && availableContacts.length > 0}
                              onCheckedChange={toggleAllContacts}
                            />
                          </TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Telefone</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {availableContacts.map(c => (
                          <TableRow key={c.id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedContacts.has(c.id)}
                                onCheckedChange={() => toggleContact(c.id)}
                              />
                            </TableCell>
                            <TableCell className="text-sm">{c.nome}</TableCell>
                            <TableCell className="text-sm">{c.telefone}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Button onClick={addContactsToCampaign} disabled={selectedContacts.size === 0} size="sm">
                    Adicionar {selectedContacts.size} contato{selectedContacts.size !== 1 ? 's' : ''}
                  </Button>
                </div>
              )}

              {/* Contacts report */}
              {campaignContacts.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Enviado Em</TableHead>
                        <TableHead>Erro</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaignContacts.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="text-sm">{c.nome || '-'}</TableCell>
                          <TableCell className="text-sm">{c.telefone}</TableCell>
                          <TableCell>
                            <Badge className={statusColors[c.status] || ''} variant="secondary">
                              {c.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {c.enviado_em ? new Date(c.enviado_em).toLocaleString('pt-BR') : '-'}
                          </TableCell>
                          <TableCell className="text-sm text-red-600 max-w-32 truncate">
                            {c.erro_mensagem || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Floating sending indicator */}
      {sendingCampaignId && sendingProgress && (
        <div className="fixed bottom-4 right-4 z-50 bg-card border border-border rounded-lg shadow-lg p-4 max-w-sm w-80 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-semibold">Campanha em andamento</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {sendingProgress.sent + sendingProgress.errors}/{sendingProgress.total}
            </Badge>
          </div>

          {sendingProgress.lastSentContact && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>
                ✅ Áudio enviado para <span className="font-medium text-foreground">{sendingProgress.lastSentContact}</span>
              </p>
              <p>
                📱 Pelo número <span className="font-medium text-foreground">{sendingProgress.lastSentInstance}</span>
              </p>
            </div>
          )}

          {sendingProgress.countdownSec !== null && sendingProgress.countdownSec > 0 && (
            <div className="text-xs bg-muted rounded px-2 py-1.5 text-center">
              ⏳ Próximo envio em <span className="font-bold text-primary">{sendingProgress.countdownSec}s</span>
            </div>
          )}

          {sendingProgress.currentContact && sendingProgress.countdownSec === null && (
            <div className="text-xs text-muted-foreground">
              📤 Enviando para <span className="font-medium text-foreground">{sendingProgress.currentContact}</span>...
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}
