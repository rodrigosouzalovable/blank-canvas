import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Save, Clock, Calendar, MessageSquare, Timer, Zap, Camera, UserPlus, Smartphone, Shield, Coffee, TrendingDown } from 'lucide-react';
import GrupoAquecimentoCard from './GrupoAquecimentoCard';

interface ConfigItem {
  id: string;
  chave: string;
  valor: any;
  descricao: string | null;
}

const DIAS_SEMANA = [
  { label: 'Dom', value: 0 },
  { label: 'Seg', value: 1 },
  { label: 'Ter', value: 2 },
  { label: 'Qua', value: 3 },
  { label: 'Qui', value: 4 },
  { label: 'Sex', value: 5 },
  { label: 'Sáb', value: 6 },
];

const DEFAULTS = {
  limites_por_fase: { '1': 1, '2': 3, '3': 7, '4': 15, '5': 25 },
  dias_por_fase: { '1': 7, '2': 7, '3': 7, '4': 7, '5': 0 },
  horario_comercial: { inicio: '08:00', fim: '18:00', timezone: 'America/Sao_Paulo' },
  dias_ativos: [1, 2, 3, 4, 5, 6],
  delay_config: { min: 30, max: 180 },
  auto_start: { horario_inicio: '09:00', novas_instancias: false },
  dias_carencia: 2,
  salvar_contatos_auto: true,
  postar_status_auto: true,
  status_incluir_imagens: true,
  status_incluir_videos: false,
  pausa_almoco: { ativo: true, inicio: '12:00', fim: '14:00' },
  reducao_fim_semana: { sabado: 60, domingo: 40 },
};

export default function AquecimentoConfigTab() {
  const [configs, setConfigs] = useState<ConfigItem[]>([]);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  async function loadConfigs() {
    setLoading(true);
    const { data } = await supabase.from('whatsapp_aquecimento_config' as any).select('*');
    if (data) {
      const items = data as any[];
      setConfigs(items);
      const vals: Record<string, any> = {};
      items.forEach(c => { vals[c.chave] = c.valor; });
      setEditValues(vals);
    }
    setLoading(false);
  }

  function getConfig(chave: string): ConfigItem | undefined {
    return configs.find(c => c.chave === chave);
  }

  function getVal(chave: string) {
    return editValues[chave] ?? (DEFAULTS as any)[chave] ?? {};
  }

  function updateLocal(chave: string, valor: any) {
    setEditValues(prev => ({ ...prev, [chave]: valor }));
  }

  async function saveConfig(chave: string) {
    const cfg = getConfig(chave);
    if (!cfg) return;
    const val = editValues[chave] ?? (DEFAULTS as any)[chave];
    await supabase.from('whatsapp_aquecimento_config' as any).update({ valor: val } as any).eq('id', cfg.id);
  }

  async function saveAll() {
    setSaving(true);
    const knownKeys = ['limites_por_fase', 'dias_por_fase', 'horario_comercial', 'dias_ativos', 'delay_config', 'auto_start', 'dias_carencia', 'salvar_contatos_auto', 'postar_status_auto', 'status_incluir_imagens', 'status_incluir_videos', 'pausa_almoco', 'reducao_fim_semana'];
    for (const chave of knownKeys) {
      if (getConfig(chave)) {
        await saveConfig(chave);
      }
    }
    toast({ title: 'Todas as configurações foram salvas!' });
    await loadConfigs();
    setSaving(false);
  }

  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando configurações...</div>;

  const limitesPorFase = getVal('limites_por_fase');
  const diasPorFase = getVal('dias_por_fase');
  const horarioComercial = getVal('horario_comercial');
  const diasAtivos = editValues['dias_ativos'] ?? DEFAULTS.dias_ativos;
  const delayConfig = getVal('delay_config');
  const autoStart = getVal('auto_start');
  const pausaAlmoco = getVal('pausa_almoco');
  const reducaoFimSemana = getVal('reducao_fim_semana');

  const knownKeys = ['limites_por_fase', 'dias_por_fase', 'horario_comercial', 'dias_ativos', 'delay_config', 'auto_start', 'dias_carencia', 'salvar_contatos_auto', 'postar_status_auto', 'status_incluir_imagens', 'status_incluir_videos', 'pausa_almoco', 'reducao_fim_semana'];
  const unknownConfigs = configs.filter(c => !knownKeys.includes(c.chave));

  const faseDescricoes: Record<number, string> = {
    1: 'Início — pouquíssimas msgs para não levantar suspeita',
    2: 'Número já tem algum histórico',
    3: 'Quase pronto, volume moderado',
    4: 'Fase final antes de ser considerado aquecido',
    5: 'Aquecido — limite máximo diário',
  };

  return (
    <div className="space-y-6">
      {/* Grupo de Aquecimento */}
      <GrupoAquecimentoCard />

      {/* Limites por Fase */}
      {getConfig('limites_por_fase') && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Limite de Mensagens por Fase</CardTitle>
            </div>
            <CardDescription>
              Quantas mensagens cada número pode enviar <strong>por dia</strong> em cada fase. 
              Progressão conservadora: 1 → 3 → 7 → 15 → 25 (aquecimento completo em ~28 dias).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
              {[1, 2, 3, 4, 5].map(fase => (
                <div key={fase} className="space-y-1">
                  <Label className="text-xs font-semibold">Fase {fase} {fase === 5 ? '✅' : ''}</Label>
                  <p className="text-[10px] text-muted-foreground leading-tight min-h-[24px]">{faseDescricoes[fase]}</p>
                  <Input
                    type="number"
                    min={1}
                    placeholder={String((DEFAULTS.limites_por_fase as any)[String(fase)])}
                    value={limitesPorFase[String(fase)] ?? ''}
                    onChange={e => updateLocal('limites_por_fase', { ...limitesPorFase, [String(fase)]: Number(e.target.value) })}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dias por Fase */}
      {getConfig('dias_por_fase') && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Dias em Cada Fase</CardTitle>
            </div>
            <CardDescription>
              Quantos dias o número precisa ficar em cada fase antes de avançar. 
              Baseado na idade do número (dias desde conexão). Fase 5 é permanente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[1, 2, 3, 4, 5].map(fase => (
                <div key={fase} className="space-y-1">
                  <Label className="text-xs font-semibold">Fase {fase} {fase === 5 ? '(permanente)' : ''}</Label>
                  <Input
                    type="number"
                    min={fase === 5 ? 0 : 1}
                    placeholder={String((DEFAULTS.dias_por_fase as any)[String(fase)])}
                    value={diasPorFase[String(fase)] ?? ''}
                    onChange={e => updateLocal('dias_por_fase', { ...diasPorFase, [String(fase)]: Number(e.target.value) })}
                    disabled={fase === 5}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Horário Comercial */}
      {getConfig('horario_comercial') && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Horário de Funcionamento</CardTitle>
            </div>
            <CardDescription>
              O aquecimento só enviará mensagens dentro deste horário. Fora dele, nenhuma mensagem será enviada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Início</Label>
                <Input
                  type="time"
                  value={horarioComercial['inicio'] ?? DEFAULTS.horario_comercial.inicio}
                  onChange={e => updateLocal('horario_comercial', { ...horarioComercial, inicio: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Fim</Label>
                <Input
                  type="time"
                  value={horarioComercial['fim'] ?? DEFAULTS.horario_comercial.fim}
                  onChange={e => updateLocal('horario_comercial', { ...horarioComercial, fim: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Fuso Horário</Label>
                <Input
                  value={horarioComercial['timezone'] ?? DEFAULTS.horario_comercial.timezone}
                  onChange={e => updateLocal('horario_comercial', { ...horarioComercial, timezone: e.target.value })}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pausa de Almoço */}
      <Card className="border-amber-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Coffee className="h-5 w-5 text-amber-500" />
            <CardTitle className="text-lg">Pausa de Almoço</CardTitle>
          </div>
          <CardDescription>
            Nenhuma atividade é realizada durante o horário de almoço. Simula comportamento humano real — pessoas não enviam mensagens durante a refeição.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Ativar pausa de almoço</Label>
            <Switch
              checked={pausaAlmoco['ativo'] ?? DEFAULTS.pausa_almoco.ativo}
              onCheckedChange={(checked) => updateLocal('pausa_almoco', { ...pausaAlmoco, ativo: checked })}
            />
          </div>
          {(pausaAlmoco['ativo'] ?? DEFAULTS.pausa_almoco.ativo) && (
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Início</Label>
                <Input
                  type="time"
                  value={pausaAlmoco['inicio'] ?? DEFAULTS.pausa_almoco.inicio}
                  onChange={e => updateLocal('pausa_almoco', { ...pausaAlmoco, inicio: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Fim</Label>
                <Input
                  type="time"
                  value={pausaAlmoco['fim'] ?? DEFAULTS.pausa_almoco.fim}
                  onChange={e => updateLocal('pausa_almoco', { ...pausaAlmoco, fim: e.target.value })}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Redução Fim de Semana */}
      <Card className="border-blue-500/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingDown className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-lg">Redução de Fim de Semana</CardTitle>
          </div>
          <CardDescription>
            Reduz automaticamente o limite diário de mensagens nos fins de semana. Sábado e domingo têm padrões diferentes de uso real.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Sábado (% do limite)</Label>
              <Input
                type="number"
                min={10}
                max={100}
                placeholder="60"
                value={reducaoFimSemana['sabado'] ?? DEFAULTS.reducao_fim_semana.sabado}
                onChange={e => updateLocal('reducao_fim_semana', { ...reducaoFimSemana, sabado: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Domingo (% do limite)</Label>
              <Input
                type="number"
                min={10}
                max={100}
                placeholder="40"
                value={reducaoFimSemana['domingo'] ?? DEFAULTS.reducao_fim_semana.domingo}
                onChange={e => updateLocal('reducao_fim_semana', { ...reducaoFimSemana, domingo: Number(e.target.value) })}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Exemplo: Com limite de 25 msgs/dia, sábado envia até {Math.floor(25 * (reducaoFimSemana['sabado'] ?? 60) / 100)} e domingo até {Math.floor(25 * (reducaoFimSemana['domingo'] ?? 40) / 100)}.
          </p>
        </CardContent>
      </Card>

      {/* Dias Ativos */}
      {getConfig('dias_ativos') && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Dias Ativos da Semana</CardTitle>
            </div>
            <CardDescription>
              Selecione em quais dias da semana o aquecimento deve funcionar. 
              Recomendamos manter domingo desativado para simular comportamento humano.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-4">
              {DIAS_SEMANA.map(dia => {
                const isChecked = Array.isArray(diasAtivos) && diasAtivos.includes(dia.value);
                return (
                  <div key={dia.value} className="flex items-center gap-2">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={(checked) => {
                        const current = Array.isArray(diasAtivos) ? [...diasAtivos] : [];
                        if (checked) {
                          current.push(dia.value);
                        } else {
                          const idx = current.indexOf(dia.value);
                          if (idx >= 0) current.splice(idx, 1);
                        }
                        current.sort((a: number, b: number) => a - b);
                        updateLocal('dias_ativos', current);
                      }}
                    />
                    <Label className="text-sm cursor-pointer">{dia.label}</Label>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delay Config */}
      {getConfig('delay_config') && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Timer className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Intervalo entre Mensagens</CardTitle>
            </div>
            <CardDescription>
              Tempo mínimo e máximo (em segundos) de espera entre cada mensagem. 
              O sistema escolhe um valor aleatório dentro dessa faixa para parecer mais natural.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Mínimo (segundos)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder={String(DEFAULTS.delay_config.min)}
                  value={delayConfig['min'] ?? ''}
                  onChange={e => updateLocal('delay_config', { ...delayConfig, min: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Máximo (segundos)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder={String(DEFAULTS.delay_config.max)}
                  value={delayConfig['max'] ?? ''}
                  onChange={e => updateLocal('delay_config', { ...delayConfig, max: Number(e.target.value) })}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Auto Start */}
      {getConfig('auto_start') && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Início Automático</CardTitle>
            </div>
            <CardDescription>
              Se ativado, o sistema inicia o aquecimento automaticamente todos os dias no horário definido.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={autoStart['novas_instancias'] ?? DEFAULTS.auto_start.novas_instancias}
                  onCheckedChange={(checked) => updateLocal('auto_start', { ...autoStart, novas_instancias: checked })}
                />
                <Label className="text-sm">Iniciar novas instâncias automaticamente</Label>
              </div>
            </div>
            <div className="max-w-[200px] space-y-1">
              <Label className="text-xs font-semibold">Horário de início automático</Label>
              <Input
                type="time"
                value={autoStart['horario_inicio'] ?? DEFAULTS.auto_start.horario_inicio}
                onChange={e => updateLocal('auto_start', { ...autoStart, horario_inicio: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Carência (Grace Period) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Período de Carência</CardTitle>
          </div>
          <CardDescription>
            Quantos dias um número recém-conectado deve esperar antes de começar a enviar mensagens de aquecimento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-[200px] space-y-1">
            <Label className="text-xs font-semibold">Dias de carência</Label>
            <Input
              type="number"
              min={0}
              max={30}
              placeholder={String(DEFAULTS.dias_carencia)}
              value={editValues['dias_carencia'] ?? DEFAULTS.dias_carencia}
              onChange={e => updateLocal('dias_carencia', Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Comportamento Automático */}
      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Comportamento Automático</CardTitle>
          </div>
          <CardDescription>
            Controles gerais do aquecimento automático. Inclui proteções anti-ban: 20% dias silenciosos, 15% dias somente-leitura, 30% skip por ciclo, burst matinal aleatório.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Camera className="h-5 w-5 text-purple-500" />
                <div>
                  <Label className="text-sm font-semibold">Postar status automaticamente</Label>
                  <p className="text-xs text-muted-foreground">Cada número posta 1-2 status/dia (texto, imagem) conforme a fase</p>
                </div>
              </div>
              <Switch
                checked={editValues['postar_status_auto'] ?? DEFAULTS.postar_status_auto}
                onCheckedChange={(checked) => updateLocal('postar_status_auto', checked)}
              />
            </div>
            {(editValues['postar_status_auto'] ?? DEFAULTS.postar_status_auto) && (
              <div className="ml-8 space-y-3 border-l-2 border-border pl-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Incluir imagens nos status (Fase 2+)</Label>
                    <p className="text-xs text-muted-foreground">Imagens únicas por número/dia via Lorem Picsum</p>
                  </div>
                  <Switch
                    checked={editValues['status_incluir_imagens'] ?? DEFAULTS.status_incluir_imagens}
                    onCheckedChange={(checked) => updateLocal('status_incluir_imagens', checked)}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">Incluir vídeos nos status (Fase 5+)</Label>
                    <p className="text-xs text-muted-foreground">Vídeos curtos para números já aquecidos</p>
                  </div>
                  <Switch
                    checked={editValues['status_incluir_videos'] ?? DEFAULTS.status_incluir_videos}
                    onCheckedChange={(checked) => updateLocal('status_incluir_videos', checked)}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex items-center gap-3">
              <UserPlus className="h-5 w-5 text-cyan-500" />
              <div>
                <Label className="text-sm font-semibold">Salvar contatos automaticamente</Label>
                <p className="text-xs text-muted-foreground">Salva na agenda do WhatsApp números de interações recentes</p>
              </div>
            </div>
            <Switch
              checked={editValues['salvar_contatos_auto'] ?? DEFAULTS.salvar_contatos_auto}
              onCheckedChange={(checked) => updateLocal('salvar_contatos_auto', checked)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Fallback para configs desconhecidas */}
      {unknownConfigs.map(cfg => (
        <Card key={cfg.id}>
          <CardHeader>
            <CardTitle className="text-lg">{cfg.chave.replace(/_/g, ' ').toUpperCase()}</CardTitle>
            {cfg.descricao && <CardDescription>{cfg.descricao}</CardDescription>}
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              defaultValue={JSON.stringify(cfg.valor)}
              onBlur={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  updateLocal(cfg.chave, parsed);
                } catch {
                  toast({ title: 'JSON inválido', variant: 'destructive' });
                }
              }}
            />
            <Button size="sm" onClick={async () => { await saveConfig(cfg.chave); toast({ title: 'Salvo!' }); loadConfigs(); }} className="gap-1">
              <Save className="h-3 w-3" /> Salvar
            </Button>
          </CardContent>
        </Card>
      ))}

      {/* Salvar Tudo */}
      <div className="flex justify-end pt-2">
        <Button onClick={saveAll} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Salvando...' : 'Salvar Todas as Configurações'}
        </Button>
      </div>
    </div>
  );
}
