import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { MessageCircle, Save, Loader2, Plus, Trash2, RotateCcw, Upload, Volume2, MousePointerClick } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface TemplateRow {
  id?: string;
  tipo_lembrete: string;
  mensagem: string;
  ativo: boolean;
  ordem: number;
  audio_url?: string | null;
  botoes_texto?: string | null;
  botoes_choices?: string[] | null;
}

interface TipoLembrete {
  key: string;
  label: string;
  desc: string;
  custom?: boolean;
}

const BASE_TIPOS: TipoLembrete[] = [
  { key: '3_dias', label: 'D-3 (3 dias antes)', desc: 'Enviada 3 dias antes do vencimento' },
  { key: 'dia_vencimento', label: 'D-0 (Dia do vencimento)', desc: 'Enviada no dia do vencimento' },
  { key: 'vencido_d1', label: 'D+1 (1 dia após)', desc: 'Enviada 1 dia após o vencimento' },
  { key: 'vencido_d2', label: 'D+2 (2 dias após)', desc: 'Enviada 2 dias após o vencimento' },
  { key: 'vencido_d10', label: 'D+10 (10 dias após)', desc: 'Enviada 10 dias após o vencimento' },
  { key: 'vencido_d11', label: 'D+11 (11 dias após)', desc: 'Enviada 11 dias após o vencimento' },
  { key: 'vencido_d20', label: 'D+20 (20 dias após)', desc: 'Enviada 20 dias após o vencimento' },
  { key: 'vencido_d30', label: 'D+30 (30 dias após)', desc: 'Enviada 30 dias após o vencimento' },
  { key: 'vencido_generico', label: 'Vencido (genérico)', desc: 'Usado quando não há template específico para o dia de atraso' },
];

const BASE_KEYS = new Set(BASE_TIPOS.map(t => t.key));

const DEFAULT_MESSAGES: Record<string, string> = {
  '3_dias': 'Olá {nome_cliente}, aqui é {nome_operador}, do departamento de acordos das Lojas Novo Mundo e estou passando para lembrar que o vencimento da sua parcela no valor de {valor} é dia {data_vencimento}. Gostaria que enviasse o boleto para pagamento?',
  'dia_vencimento': 'Olá {nome_cliente}, aqui é {nome_operador}, do departamento de acordos das Lojas Novo Mundo e estou passando para lembrar que o vencimento da sua parcela no valor de {valor} vence HOJE. Gostaria que enviasse o boleto para pagamento?',
  'vencido_d1': 'Olá {nome_cliente}, aqui é {nome_operador}, do departamento de acordos das Lojas Novo Mundo. Sua parcela no valor de {valor} venceu ontem ({data_vencimento}). Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.',
  'vencido_d2': 'Olá {nome_cliente}, aqui é {nome_operador}, do departamento de acordos das Lojas Novo Mundo. Notamos que a parcela no valor de {valor} com vencimento em {data_vencimento} ainda consta em aberto. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza. Caso contrário, consegue regularizar hoje?',
  'vencido_d10': 'Olá {nome_cliente}, aqui é {nome_operador}, do departamento de acordos das Lojas Novo Mundo. Identificamos que sua parcela no valor de {valor}, vencida em {data_vencimento}, continua em aberto há 10 dias. É muito importante manter o acordo em dia. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.',
  'vencido_d11': 'Olá {nome_cliente}, aqui é {nome_operador}, do departamento de acordos das Lojas Novo Mundo. Reforçamos que sua parcela de {valor} (vencimento {data_vencimento}) segue pendente há 11 dias. Por favor, regularize o quanto antes para evitar problemas com seu acordo. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.',
  'vencido_d20': 'Olá {nome_cliente}, aqui é {nome_operador}, do departamento de acordos das Lojas Novo Mundo. Sua parcela de {valor} está em atraso há 20 dias (vencimento {data_vencimento}). Pedimos que regularize a situação o mais breve possível para evitar o descumprimento do acordo. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.',
  'vencido_d30': 'Olá {nome_cliente}, aqui é {nome_operador}, do departamento de acordos das Lojas Novo Mundo. Este é o último aviso referente à parcela de {valor} vencida em {data_vencimento}, em atraso há 30 dias. Caso o pagamento não seja regularizado, o acordo poderá ser considerado descumprido. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.',
  'vencido_generico': 'Olá {primeiro_nome}, aqui é {nome_operador}, do departamento de acordos das Lojas Novo Mundo. Sua parcela no valor de {valor} com vencimento em {data_vencimento} encontra-se em atraso há {dias_atraso} dias. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.',
};

function getGenericMessage(dias: number): string {
  return `Olá {primeiro_nome}, aqui é {nome_operador}, do departamento de acordos das Lojas Novo Mundo. Sua parcela no valor de {valor} com vencimento em {data_vencimento} encontra-se em atraso há ${dias} dias. Caso tenha efetuado o pagamento, nos envie o comprovante por gentileza.`;
}

export default function LembreteMensagensDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [tipos, setTipos] = useState<TipoLembrete[]>([...BASE_TIPOS]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTipo, setActiveTipo] = useState(BASE_TIPOS[0].key);
  const [showAddDay, setShowAddDay] = useState(false);
  const [newDayInput, setNewDayInput] = useState('');
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && user) loadTemplates();
  }, [open, user]);

  const loadTemplates = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('lembrete_mensagens_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('ordem', { ascending: true });
      if (error) throw error;

      // Discover custom types from DB
      const customTiposFromDb: TipoLembrete[] = [];
      for (const row of (data || [])) {
        if (!BASE_KEYS.has(row.tipo_lembrete) && !customTiposFromDb.find(t => t.key === row.tipo_lembrete)) {
          const match = row.tipo_lembrete.match(/^vencido_d(\d+)$/);
          if (match) {
            const dias = parseInt(match[1]);
            customTiposFromDb.push({
              key: row.tipo_lembrete,
              label: `D+${dias} (${dias} dias após)`,
              desc: `Enviada ${dias} dias após o vencimento`,
              custom: true,
            });
          }
        }
      }

      const allTipos = [...BASE_TIPOS, ...customTiposFromDb].sort((a, b) => {
        const getOrder = (t: TipoLembrete) => {
          if (t.key === '3_dias') return -3;
          if (t.key === 'dia_vencimento') return 0;
          if (t.key === 'vencido_generico') return 99999;
          const m = t.key.match(/^vencido_d(\d+)$/);
          return m ? parseInt(m[1]) : 999;
        };
        return getOrder(a) - getOrder(b);
      });
      setTipos(allTipos);

      // Build templates - one per type
      const loaded: TemplateRow[] = [];
      for (const tipo of allTipos) {
        const existing = (data || []).find((d: any) => d.tipo_lembrete === tipo.key);
        if (existing) {
          loaded.push({
            id: existing.id,
            tipo_lembrete: existing.tipo_lembrete,
            mensagem: existing.mensagem,
            ativo: existing.ativo ?? true,
            ordem: existing.ordem ?? 0,
            audio_url: existing.audio_url || null,
            botoes_texto: existing.botoes_texto || null,
            botoes_choices: Array.isArray(existing.botoes_choices) ? existing.botoes_choices as string[] : null,
          });
        } else {
          const match = tipo.key.match(/^vencido_d(\d+)$/);
          const dias = match ? parseInt(match[1]) : 0;
          loaded.push({
            tipo_lembrete: tipo.key,
            mensagem: DEFAULT_MESSAGES[tipo.key] || getGenericMessage(dias),
            ativo: true,
            ordem: 0,
            audio_url: null,
            botoes_texto: null,
            botoes_choices: null,
          });
        }
      }
      setTemplates(loaded);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await supabase
        .from('lembrete_mensagens_templates')
        .delete()
        .eq('user_id', user.id);

      const rows = templates.map((t) => ({
        user_id: user.id,
        tipo_lembrete: t.tipo_lembrete,
        mensagem: t.mensagem,
        ativo: t.ativo,
        ordem: t.ordem,
        audio_url: t.audio_url || null,
        botoes_texto: t.botoes_texto || null,
        botoes_choices: t.botoes_choices && t.botoes_choices.length > 0 ? t.botoes_choices : null,
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('lembrete_mensagens_templates')
          .insert(rows);
        if (error) throw error;
      }

      toast.success('Templates salvos com sucesso!');
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao salvar: ' + (err.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const currentTemplate = templates.find(t => t.tipo_lembrete === activeTipo);
  const tipoInfo = tipos.find(t => t.key === activeTipo);

  const updateCurrentTemplate = (field: keyof TemplateRow, value: any) => {
    setTemplates(prev => prev.map(t =>
      t.tipo_lembrete === activeTipo ? { ...t, [field]: value } : t
    ));
  };

  const resetToDefault = () => {
    const match = activeTipo.match(/^vencido_d(\d+)$/);
    const dias = match ? parseInt(match[1]) : 0;
    const defaultMsg = DEFAULT_MESSAGES[activeTipo] || getGenericMessage(dias);
    updateCurrentTemplate('mensagem', defaultMsg);
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Reset input
    if (audioInputRef.current) audioInputRef.current.value = '';

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 10MB.');
      return;
    }

    setUploadingAudio(true);
    try {
      const ext = file.name.split('.').pop() || 'mp3';
      const path = `${user.id}/lembretes/${activeTipo}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('campaign-audio')
        .upload(path, file, { contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('campaign-audio')
        .getPublicUrl(path);

      // Add cache-bust to URL
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      updateCurrentTemplate('audio_url', publicUrl);
      toast.success('Áudio importado!');
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao importar áudio: ' + (err.message || ''));
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleRemoveAudio = async () => {
    if (!user) return;
    try {
      const currentAudioUrl = currentTemplate?.audio_url;
      if (currentAudioUrl) {
        // Try to delete from storage
        const ext = currentAudioUrl.split('.').pop()?.split('?')[0] || 'mp3';
        const path = `${user.id}/lembretes/${activeTipo}.${ext}`;
        await supabase.storage.from('campaign-audio').remove([path]);
      }
    } catch { /* ignore */ }
    updateCurrentTemplate('audio_url', null);
    toast.success('Áudio removido');
  };

  const addCustomDay = () => {
    const dias = parseInt(newDayInput);
    if (isNaN(dias) || dias < 1 || dias > 365) {
      toast.error('Digite um número de dias válido (1 a 365)');
      return;
    }
    const key = `vencido_d${dias}`;
    if (tipos.find(t => t.key === key)) {
      toast.error(`D+${dias} já existe`);
      return;
    }

    const newTipo: TipoLembrete = {
      key,
      label: `D+${dias} (${dias} dias após)`,
      desc: `Enviada ${dias} dias após o vencimento`,
      custom: true,
    };

    const newTipos = [...tipos, newTipo].sort((a, b) => {
      const getOrder = (t: TipoLembrete) => {
        if (t.key === '3_dias') return -3;
        if (t.key === 'dia_vencimento') return 0;
        if (t.key === 'vencido_generico') return 99999;
        const m = t.key.match(/^vencido_d(\d+)$/);
        return m ? parseInt(m[1]) : 999;
      };
      return getOrder(a) - getOrder(b);
    });
    setTipos(newTipos);

    setTemplates(prev => [...prev, {
      tipo_lembrete: key,
      mensagem: getGenericMessage(dias),
      ativo: true,
      ordem: 0,
      audio_url: null,
      botoes_texto: null,
      botoes_choices: null,
    }]);

    setActiveTipo(key);
    setNewDayInput('');
    setShowAddDay(false);
  };

  const removeCustomDay = (key: string) => {
    setTipos(prev => prev.filter(t => t.key !== key));
    setTemplates(prev => prev.filter(t => t.tipo_lembrete !== key));
    if (activeTipo === key) setActiveTipo(BASE_TIPOS[0].key);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Mensagens de Lembrete
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 space-y-1">
          <p className="font-medium">Variáveis disponíveis:</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs">{'{nome_cliente}'} — Nome completo</Badge>
            <Badge variant="outline" className="text-xs">{'{primeiro_nome}'} — Ex: Rodrigo</Badge>
            <Badge variant="outline" className="text-xs">{'{nome_operador}'}</Badge>
            <Badge variant="outline" className="text-xs">{'{valor}'}</Badge>
            <Badge variant="outline" className="text-xs">{'{data_vencimento}'}</Badge>
            <Badge variant="outline" className="text-xs">{'{dias_atraso}'}</Badge>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex gap-4 flex-1 min-h-0">
            {/* Sidebar */}
            <div className="w-48 shrink-0">
              <ScrollArea className="h-[400px]">
                <div className="space-y-1 pr-2">
                  {tipos.map(tipo => (
                    <div key={tipo.key} className="flex items-center gap-1">
                      <button
                        onClick={() => setActiveTipo(tipo.key)}
                        className={`flex-1 text-left px-3 py-2 rounded-md text-sm transition-colors ${
                          activeTipo === tipo.key
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          {tipo.label}
                          {templates.find(t => t.tipo_lembrete === tipo.key)?.audio_url && (
                            <Volume2 className="h-3 w-3 shrink-0" />
                          )}
                        </span>
                      </button>
                      {tipo.custom && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-destructive"
                          onClick={() => removeCustomDay(tipo.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}

                  {/* Add custom day */}
                  {showAddDay ? (
                    <div className="flex items-center gap-1 mt-2">
                      <span className="text-xs text-muted-foreground pl-1">D+</span>
                      <Input
                        type="number"
                        min={1}
                        max={365}
                        value={newDayInput}
                        onChange={e => setNewDayInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addCustomDay()}
                        className="h-8 w-16 text-sm"
                        autoFocus
                        placeholder="dias"
                      />
                      <Button size="sm" className="h-8 px-2" onClick={addCustomDay}>OK</Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => { setShowAddDay(false); setNewDayInput(''); }}>✕</Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddDay(true)}
                      className="w-full mt-2"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Adicionar dia
                    </Button>
                  )}
                </div>
              </ScrollArea>
            </div>

            <Separator orientation="vertical" />

            {/* Content */}
            <div className="flex-1 min-w-0">
              <ScrollArea className="h-[400px]">
                <div className="space-y-4 pr-2">
                  {tipoInfo && (
                    <div>
                      <p className="text-sm font-medium">{tipoInfo.label}</p>
                      <p className="text-xs text-muted-foreground">{tipoInfo.desc}</p>
                    </div>
                  )}

                  {currentTemplate && (
                    <>
                      <div className="space-y-2 border rounded-md p-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">Mensagem</Label>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <Switch
                                checked={currentTemplate.ativo}
                                onCheckedChange={(v) => updateCurrentTemplate('ativo', v)}
                              />
                              <span className="text-xs text-muted-foreground">
                                {currentTemplate.ativo ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={resetToDefault}
                              title="Restaurar padrão"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <Textarea
                          value={currentTemplate.mensagem}
                          onChange={(e) => updateCurrentTemplate('mensagem', e.target.value)}
                          rows={5}
                          className="text-sm"
                        />
                      </div>

                      {/* Audio section */}
                      <div className="border rounded-md p-3 space-y-2">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Volume2 className="h-3.5 w-3.5" />
                          Áudio de lembrete
                        </Label>
                        {currentTemplate.audio_url ? (
                          <div className="space-y-2">
                            <audio controls className="w-full h-10" src={currentTemplate.audio_url} />
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => audioInputRef.current?.click()}
                                disabled={uploadingAudio}
                              >
                                {uploadingAudio ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                                Substituir
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={handleRemoveAudio}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                                Remover
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => audioInputRef.current?.click()}
                            disabled={uploadingAudio}
                          >
                            {uploadingAudio ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                            Importar áudio
                          </Button>
                        )}
                        <input
                          ref={audioInputRef}
                          type="file"
                          accept="audio/*"
                          className="hidden"
                          onChange={handleAudioUpload}
                        />
                      </div>

                      {/* Buttons section */}
                      <div className="border rounded-md p-3 space-y-2">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <MousePointerClick className="h-3.5 w-3.5" />
                          Botões interativos (máx. 3)
                        </Label>
                        <Textarea
                          placeholder="Mensagem que acompanha os botões (suporta variáveis)"
                          value={currentTemplate.botoes_texto || ''}
                          onChange={(e) => updateCurrentTemplate('botoes_texto', e.target.value || null)}
                          rows={3}
                          className="text-sm"
                        />
                        <div className="space-y-1.5">
                          {(currentTemplate.botoes_choices || []).map((choice, idx) => {
                            const label = choice.split('|')[0] || '';
                            return (
                              <div key={idx} className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
                                <Input
                                  value={label}
                                  onChange={(e) => {
                                    const newLabel = e.target.value;
                                    const newId = newLabel.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
                                    const newChoices = [...(currentTemplate.botoes_choices || [])];
                                    newChoices[idx] = `${newLabel}|${newId}`;
                                    updateCurrentTemplate('botoes_choices', newChoices);
                                  }}
                                  placeholder={`Texto do botão ${idx + 1}`}
                                  className="h-8 text-sm flex-1"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-destructive"
                                  onClick={() => {
                                    const newChoices = (currentTemplate.botoes_choices || []).filter((_, i) => i !== idx);
                                    updateCurrentTemplate('botoes_choices', newChoices.length > 0 ? newChoices : null);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            );
                          })}
                          {(currentTemplate.botoes_choices || []).length < 3 && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full"
                              onClick={() => {
                                const current = currentTemplate.botoes_choices || [];
                                updateCurrentTemplate('botoes_choices', [...current, `Botão ${current.length + 1}|botao_${current.length + 1}`]);
                              }}
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" />
                              Adicionar botão
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
