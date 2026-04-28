import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { MentorChat } from '@/components/monitor/MentorChat';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useMonitorEnvios, InstanceStats } from '@/hooks/useMonitorEnvios';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import {
  MessageSquare,
  Smartphone,
  TrendingUp,
  Clock,
  Settings,
  RefreshCw,
  Bot,
  BellRing,
  Pause,
  Play,
  ShieldAlert,
  Stethoscope,
  Wrench,
  CheckCircle2,
  XCircle,
  Zap,
} from 'lucide-react';
import { format } from 'date-fns';

interface WebhookDiag {
  id: string;
  nome: string;
  ok: boolean;
  healthy: boolean;
  url?: string | null;
  events?: string[];
  excludeGroupMessages?: boolean | null;
  excludeBroadcast?: boolean | null;
  excludeMessages?: string[];
  issues?: string[];
  error?: string;
}

function getStatus(inst: InstanceStats, limite: number) {
  if (!inst.ativo) return { label: 'Pausado', color: 'bg-muted text-muted-foreground', emoji: '⏸️' };
  if (inst.enviadas_hoje >= limite) return { label: 'Limite atingido', color: 'bg-destructive/15 text-destructive', emoji: '🔴' };
  if (inst.enviadas_hoje >= limite * 0.8) return { label: 'Quase no limite', color: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400', emoji: '🟡' };
  return { label: 'Ativo', color: 'bg-green-500/15 text-green-700 dark:text-green-400', emoji: '🟢' };
}

function calcProximoEnvio(inst: InstanceStats, delay: number, totalAtivas: number): string {
  if (!inst.ativo || !inst.ultimo_envio) return '--:--';
  const ultimo = new Date(inst.ultimo_envio);
  const proximo = new Date(ultimo.getTime() + delay * totalAtivas * 1000);
  if (proximo.getTime() < Date.now()) return 'Em breve';
  return proximo.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function MonitorEnvios() {
  const [limiteDiario, setLimiteDiario] = useState(30);
  const [delaySegundos, setDelaySegundos] = useState(400);
  const [configOpen, setConfigOpen] = useState(false);
  const [mentorOpen, setMentorOpen] = useState(false);
  const [tempLimite, setTempLimite] = useState(30);
  const [tempDelay, setTempDelay] = useState(400);

  const {
    instances,
    loading,
    totalEnviadas,
    totalAtivas,
    totalCapacidade,
    progresso,
    tempoEstimado,
    toggleAtivo,
    refetch,
  } = useMonitorEnvios(limiteDiario, delaySegundos);

  const handleSaveConfig = () => {
    setLimiteDiario(tempLimite);
    setDelaySegundos(tempDelay);
    setConfigOpen(false);
  };

  const [diagOpen, setDiagOpen] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [diagResult, setDiagResult] = useState<{ expectedWebhookUrl: string; total: number; healthy: number; broken: number; details: WebhookDiag[] } | null>(null);

  const handleDiagnose = async () => {
    setDiagOpen(true);
    setDiagLoading(true);
    setDiagResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('diagnose-webhooks');
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Falha no diagnóstico');
      setDiagResult(data);
    } catch (e: any) {
      toast({ title: 'Erro no diagnóstico', description: e.message || 'Falha', variant: 'destructive' });
      setDiagOpen(false);
    } finally {
      setDiagLoading(false);
    }
  };

  const handleRepairAll = async () => {
    if (!confirm('Reativar o webhook de TODAS as instâncias ativas?\n\nIsso restaura o recebimento de respostas no Inbox mantendo grupos e broadcasts BLOQUEADOS.')) return;
    setRepairLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-qr', {
        body: { action: 'setup-webhook-all', userId: 'system' },
      });
      if (error) throw error;
      const failed = data?.failed ?? 0;
      toast({
        title: failed === 0 ? '✅ Webhooks reativados' : '⚠️ Reativação parcial',
        description: `${data.success}/${data.total} instâncias reativadas. Falhas: ${failed}. Aguarde 1-5 min e teste enviando uma mensagem.`,
        variant: failed === 0 ? 'default' : 'destructive',
      });
      // Se o diálogo de diagnóstico estiver aberto, atualiza o estado
      if (diagOpen) await handleDiagnose();
    } catch (e: any) {
      toast({ title: 'Erro ao reativar', description: e.message || 'Falha', variant: 'destructive' });
    } finally {
      setRepairLoading(false);
    }
  };

  const [panicLoading, setPanicLoading] = useState(false);
  const handlePanicDisableGroups = async () => {
    if (!confirm('PÂNICO: Desativar webhooks de grupo em TODAS as instâncias UAZAPI?\n\nIsso para o gasto descontrolado de créditos. As DMs continuam funcionando normalmente.')) return;
    setPanicLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('uazapi-disable-group-webhooks');
      if (error) throw error;
      toast({
        title: '🛡️ Webhooks restritos',
        description: `${data.success}/${data.total} instâncias blindadas contra grupos. Falhas: ${data.failed}.`,
      });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message || 'Falha ao reconfigurar webhooks', variant: 'destructive' });
    } finally {
      setPanicLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Monitor de Envios</h1>
            <p className="text-muted-foreground text-sm">
              {format(new Date(), "dd/MM/yyyy")} — Atualização automática a cada 30s
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refetch}>
              <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleDiagnose}
              disabled={diagLoading}
              title="Verifica e repara webhooks das instâncias (respostas no Inbox)"
            >
              <Stethoscope className="h-4 w-4 mr-1" />
              {diagLoading ? 'Diagnosticando...' : 'Diagnosticar Webhooks'}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleRepairAll}
              disabled={repairLoading}
              title="Reativa o webhook de TODAS as instâncias ativas em um clique (UAZAPI)"
              className="bg-amber-500 hover:bg-amber-600 text-white"
            >
              <Zap className="h-4 w-4 mr-1" />
              {repairLoading ? 'Reativando...' : 'Reativar Todos Webhooks'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handlePanicDisableGroups}
              disabled={panicLoading}
              title="Desativa webhooks de grupo em todas as instâncias UAZAPI (corte de gasto)"
            >
              <ShieldAlert className="h-4 w-4 mr-1" />
              {panicLoading ? 'Aplicando...' : 'Pânico: Cortar Grupos'}
            </Button>
            <Dialog open={configOpen} onOpenChange={setConfigOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => { setTempLimite(limiteDiario); setTempDelay(delaySegundos); }}>
                  <Settings className="h-4 w-4 mr-1" /> Configurações
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Configurações do Monitor</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Limite diário por número</Label>
                    <Input type="number" value={tempLimite} onChange={e => setTempLimite(Number(e.target.value))} min={1} max={100} />
                  </div>
                  <div>
                    <Label>Delay entre mensagens (segundos)</Label>
                    <Input type="number" value={tempDelay} onChange={e => setTempDelay(Number(e.target.value))} min={30} max={3600} />
                  </div>
                  <Button onClick={handleSaveConfig} className="w-full">Salvar</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <MessageSquare className="h-4 w-4" /> Enviadas Hoje
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalEnviadas}</p>
              <p className="text-xs text-muted-foreground">de {totalCapacidade} possíveis</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Smartphone className="h-4 w-4" /> Números Ativos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalAtivas}</p>
              <p className="text-xs text-muted-foreground">de {instances.length} total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <TrendingUp className="h-4 w-4" /> Progresso
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{progresso}%</p>
              <Progress value={progresso} className="mt-1 h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Clock className="h-4 w-4" /> Término Estimado
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{tempoEstimado ?? 'Concluído'}</p>
              <p className="text-xs text-muted-foreground">previsão</p>
            </CardContent>
          </Card>
        </div>

        {/* Instances Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instâncias WhatsApp</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Carregando...</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Instância</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Enviadas Hoje</TableHead>
                      <TableHead className="hidden md:table-cell">Último Envio</TableHead>
                      <TableHead className="hidden lg:table-cell">Próximo Envio</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instances.map(inst => {
                      const status = getStatus(inst, limiteDiario);
                      const pct = Math.min((inst.enviadas_hoje / limiteDiario) * 100, 100);
                      return (
                        <TableRow key={inst.id} className={!inst.ativo ? 'opacity-50' : ''}>
                          <TableCell className="font-medium">
                            📱 {inst.nome || inst.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            {inst.robo ? (
                              <Badge variant="secondary" className="gap-1"><Bot className="h-3 w-3" /> Robô</Badge>
                            ) : inst.apenas_lembretes ? (
                              <Badge variant="outline" className="gap-1"><BellRing className="h-3 w-3" /> Lembretes</Badge>
                            ) : (
                              <Badge variant="outline">Geral</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <Progress value={pct} className="h-2 flex-1" />
                              <span className="text-xs font-mono whitespace-nowrap">{inst.enviadas_hoje}/{limiteDiario}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                            {inst.ultimo_envio
                              ? new Date(inst.ultimo_envio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                              : '—'}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                            {inst.enviadas_hoje >= limiteDiario
                              ? '—'
                              : calcProximoEnvio(inst, delaySegundos, totalAtivas)}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${status.color} border-0`}>
                              {status.emoji} {status.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleAtivo(inst.id, !inst.ativo)}
                              title={inst.ativo ? 'Pausar' : 'Retomar'}
                            >
                              {inst.ativo ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Floating mentor button */}
      <button
        onClick={() => setMentorOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-primary text-primary-foreground rounded-full px-4 py-3 shadow-lg hover:shadow-xl transition-all flex items-center gap-2 text-sm font-medium"
      >
        💬 Consultar Especialista
      </button>

      <MentorChat
        open={mentorOpen}
        onOpenChange={setMentorOpen}
        contexto={{
          totalEnviadas,
          totalAtivas,
          totalInstancias: instances.length,
          totalCapacidade,
          progresso,
          limiteDiario,
          delaySegundos,
          instances,
        }}
      />

      {/* Diagnóstico de Webhooks */}
      <Dialog open={diagOpen} onOpenChange={setDiagOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" /> Diagnóstico de Webhooks
            </DialogTitle>
          </DialogHeader>

          {diagLoading && (
            <div className="py-8 text-center text-muted-foreground">
              Verificando webhooks de todas as instâncias...
            </div>
          )}

          {diagResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="text-2xl font-bold">{diagResult.total}</p>
                  </CardContent>
                </Card>
                <Card className="bg-green-500/10">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Saudáveis</p>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">{diagResult.healthy}</p>
                  </CardContent>
                </Card>
                <Card className="bg-destructive/10">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Com problema</p>
                    <p className="text-2xl font-bold text-destructive">{diagResult.broken}</p>
                  </CardContent>
                </Card>
              </div>

              <div className="bg-muted p-3 rounded text-xs font-mono break-all">
                <span className="text-muted-foreground">URL esperada: </span>
                {diagResult.expectedWebhookUrl}
              </div>

              {diagResult.broken > 0 && (
                <Button
                  onClick={handleRepairAll}
                  disabled={repairLoading}
                  className="w-full"
                  variant="default"
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  {repairLoading ? 'Reparando...' : `Reparar ${diagResult.broken} Webhook(s) com Problema`}
                </Button>
              )}

              <div className="space-y-2">
                {diagResult.details.map((d) => (
                  <Card key={d.id} className={d.healthy ? 'border-green-500/30' : 'border-destructive/30'}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 font-medium">
                          {d.healthy ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                          {d.nome}
                        </div>
                        <Badge variant={d.healthy ? 'secondary' : 'destructive'}>
                          {d.healthy ? 'OK' : 'Quebrado'}
                        </Badge>
                      </div>
                      {d.error && (
                        <p className="text-xs text-destructive">{d.error}</p>
                      )}
                      {d.url !== undefined && (
                        <p className="text-xs font-mono break-all text-muted-foreground">URL: {d.url || '(vazio)'}</p>
                      )}
                      {d.events && d.events.length > 0 && (
                        <p className="text-xs text-muted-foreground">Eventos: {d.events.join(', ')}</p>
                      )}
                      {d.issues && d.issues.length > 0 && (
                        <ul className="text-xs text-destructive mt-1 list-disc list-inside">
                          {d.issues.map((i, idx) => <li key={idx}>{i}</li>)}
                        </ul>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
