import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import successSound from '@/assets/success-sound.mp3';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { formatarMoeda, formatarData } from '@/lib/comissao';
import { ArrowLeft, Check, Clock, Calendar, User, DollarSign, Phone, Pencil, X, Send, Trash2, MessageCircle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tables } from '@/integrations/supabase/types';

type Acordo = Tables<'acordos'>;
type Pagamento = Tables<'pagamentos'>;

export default function AcordoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { acordosCompartilhados, concedidoPor } = useUserPermissions();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [acordo, setAcordo] = useState<Acordo | null>(null);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [funcionarioNome, setFuncionarioNome] = useState<string | null>(null);
  const [editandoDataPagamento, setEditandoDataPagamento] = useState<string | null>(null);
  const [novaDataPagamento, setNovaDataPagamento] = useState<string>('');
  const [editandoComissao, setEditandoComissao] = useState<string | null>(null);
  const [novaComissao, setNovaComissao] = useState<string>('');
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState<string | null>(null);
  const [editandoDataVencimento, setEditandoDataVencimento] = useState<string | null>(null);
  const [novaDataVencimento, setNovaDataVencimento] = useState<string>('');
  const [isQuebraAcordo, setIsQuebraAcordo] = useState(false);

  // Verifica se o usuário logado é o dono do acordo
  const isOwner = acordo?.user_id === user?.id;
  const canEdit = isOwner || isAdmin || (acordosCompartilhados && acordo?.user_id === concedidoPor);

  useEffect(() => {
    async function loadAcordo() {
      if (!user || !id) return;

      try {
        // RLS cuida do acesso - gestores/admins podem ver acordos da equipe
        const { data: acordoData, error: acordoError } = await supabase
          .from('acordos')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (acordoError) throw acordoError;
        if (!acordoData) {
          navigate('/acordos');
          return;
        }
        setAcordo(acordoData);

        // Se não for o dono, buscar nome do funcionário
        if (acordoData.user_id !== user.id) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('nome')
            .eq('id', acordoData.user_id)
            .maybeSingle();
          
          if (profileData) {
            setFuncionarioNome(profileData.nome);
          }
        }

        const { data: pagamentosData, error: pagamentosError } = await supabase
          .from('pagamentos')
          .select('*')
          .eq('acordo_id', id)
          .order('numero_parcela', { ascending: true });

        if (pagamentosError) throw pagamentosError;
        setPagamentos(pagamentosData || []);

        // Verificar se é QUEBRA DE ACORDO (status 'quebrado' OU última parcela pendente vencida há mais de 10 dias)
        if (acordoData.status === 'quebrado') {
          setIsQuebraAcordo(true);
        } else {
          const parcelasPendentes = (pagamentosData || []).filter(p => p.status === 'pendente');
          if (parcelasPendentes.length > 0) {
            const ultimaParcelaPendente = parcelasPendentes.reduce((max, p) => 
              p.data_prevista > max.data_prevista ? p : max
            );
            const dezDiasAtras = new Date();
            dezDiasAtras.setDate(dezDiasAtras.getDate() - 10);
            const dezDiasAtrasStr = dezDiasAtras.toISOString().split('T')[0];
            setIsQuebraAcordo(ultimaParcelaPendente.data_prevista < dezDiasAtrasStr);
          } else {
            setIsQuebraAcordo(false);
          }
        }
      } catch (error) {
        console.error('Erro ao carregar acordo:', error);
        navigate('/acordos');
      } finally {
        setLoading(false);
      }
    }

    loadAcordo();
  }, [user, id, navigate]);

  const marcarBoletoEnviado = async () => {
    if (!acordo) return;
    
    try {
      const novoStatus = !acordo.boleto_enviado;
      
      const { error } = await supabase
        .from('acordos')
        .update({ boleto_enviado: novoStatus })
        .eq('id', acordo.id);

      if (error) throw error;

      setAcordo({ ...acordo, boleto_enviado: novoStatus });
      
      toast({
        title: novoStatus ? 'Boleto marcado como enviado!' : 'Status do boleto atualizado',
        description: novoStatus 
          ? 'O cliente foi notificado sobre o boleto.' 
          : 'O boleto foi desmarcado.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar o status do boleto.',
      });
    }
  };

  const marcarComoPago = async (pagamentoId: string) => {
    try {
      const dataHoje = new Date().toISOString().split('T')[0];
      const pagamento = pagamentos.find(p => p.id === pagamentoId);
      
      const { error } = await supabase
        .from('pagamentos')
        .update({ status: 'pago', data_paga: dataHoje })
        .eq('id', pagamentoId);

      if (error) throw error;

      // Reproduzir som de sucesso
      const audio = new Audio(successSound);
      audio.play().catch(err => console.log('Erro ao reproduzir som:', err));

      // Atualizar meta pessoal do funcionário no localStorage
      if (pagamento && user) {
        const valor = Number(pagamento.valor_parcela);
        const uid = user.id;
        const currentDay = new Date().toISOString().slice(0, 10);
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        const diarioKey = `meta_recebido_diario_${uid}_${currentDay}`;
        const mensalKey = `meta_recebido_mensal_${uid}_${currentMonth}`;
        const metaDiariaKey = `acionamento_meta_diaria_${uid}`;
        const metaMensalKey = `acionamento_meta_mensal_${uid}`;
        
        const prevDiario = Number(localStorage.getItem(diarioKey)) || 0;
        const novoDiario = prevDiario + valor;
        localStorage.setItem(diarioKey, String(novoDiario));
        
        const prevMensal = Number(localStorage.getItem(mensalKey)) || 0;
        const novoMensal = prevMensal + valor;
        localStorage.setItem(mensalKey, String(novoMensal));

        // Verificar se atingiu metas
        const metaDiaria = Number(localStorage.getItem(metaDiariaKey)) || 0;
        const metaMensal = Number(localStorage.getItem(metaMensalKey)) || 0;

        if (metaDiaria > 0 && prevDiario < metaDiaria && novoDiario >= metaDiaria) {
          // Tocar som de celebração
          const celebrationAudio = new Audio(successSound);
          celebrationAudio.play().catch(() => {});
          setTimeout(() => celebrationAudio.play().catch(() => {}), 300);
          toast({
            title: '🎉 Meta Diária Atingida!',
            description: `Parabéns! Você alcançou sua meta diária de R$ ${metaDiaria.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}!`,
          });
        }

        if (metaMensal > 0 && prevMensal < metaMensal && novoMensal >= metaMensal) {
          const celebrationAudio = new Audio(successSound);
          setTimeout(() => {
            celebrationAudio.play().catch(() => {});
            setTimeout(() => celebrationAudio.play().catch(() => {}), 300);
          }, 1500);
          toast({
            title: '🏆 Meta Mensal Atingida!',
            description: `Incrível! Você alcançou sua meta mensal de R$ ${metaMensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}!`,
          });
        }
      }

      setPagamentos(prev =>
        prev.map(p =>
          p.id === pagamentoId
            ? { ...p, status: 'pago', data_paga: dataHoje }
            : p
        )
      );

      // Verificar se todas as parcelas foram pagas
      const todasPagas = pagamentos.every(p => p.id === pagamentoId || p.status === 'pago');
      if (todasPagas && acordo) {
        await supabase
          .from('acordos')
          .update({ status: 'concluido' })
          .eq('id', acordo.id);
        
        setAcordo({ ...acordo, status: 'concluido' });
      }

      toast({
        title: 'Parcela marcada como paga!',
        description: 'A comissão foi liberada.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar a parcela.',
      });
    }
  };

  const desmarcarComoPago = async (pagamentoId: string) => {
    try {
      const pagamento = pagamentos.find(p => p.id === pagamentoId);
      
      const { error } = await supabase
        .from('pagamentos')
        .update({ status: 'pendente', data_paga: null })
        .eq('id', pagamentoId);

      if (error) throw error;

      // Reverter meta pessoal do funcionário no localStorage
      if (pagamento && user) {
        const valor = Number(pagamento.valor_parcela);
        const uid = user.id;
        const currentDay = new Date().toISOString().slice(0, 10);
        const currentMonth = new Date().toISOString().slice(0, 7);
        
        const diarioKey = `meta_recebido_diario_${uid}_${currentDay}`;
        const mensalKey = `meta_recebido_mensal_${uid}_${currentMonth}`;
        
        const prevDiario = Number(localStorage.getItem(diarioKey)) || 0;
        localStorage.setItem(diarioKey, String(Math.max(0, prevDiario - valor)));
        
        const prevMensal = Number(localStorage.getItem(mensalKey)) || 0;
        localStorage.setItem(mensalKey, String(Math.max(0, prevMensal - valor)));
      }

      setPagamentos(prev =>
        prev.map(p =>
          p.id === pagamentoId
            ? { ...p, status: 'pendente', data_paga: null }
            : p
        )
      );

      // Se o acordo estava concluído, voltar para ativo
      if (acordo?.status === 'concluido') {
        await supabase
          .from('acordos')
          .update({ status: 'ativo' })
          .eq('id', acordo.id);
        
        setAcordo({ ...acordo, status: 'ativo' });
      }

      toast({
        title: 'Parcela desmarcada',
        description: 'O pagamento foi revertido para pendente.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível desmarcar a parcela.',
      });
    }
  };

  const atualizarDataPagamento = async (pagamentoId: string, novaData: string) => {
    try {
      const { error } = await supabase
        .from('pagamentos')
        .update({ data_paga: novaData })
        .eq('id', pagamentoId);

      if (error) throw error;

      setPagamentos(prev =>
        prev.map(p =>
          p.id === pagamentoId ? { ...p, data_paga: novaData } : p
        )
      );

      setEditandoDataPagamento(null);
      setNovaDataPagamento('');

      toast({
        title: 'Data atualizada!',
        description: 'A data de pagamento foi corrigida.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar a data.',
      });
    }
  };

  const atualizarComissaoParcela = async (pagamentoId: string, novoValor: number) => {
    try {
      const { error } = await supabase
        .from('pagamentos')
        .update({ comissao_parcela: novoValor })
        .eq('id', pagamentoId);

      if (error) throw error;

      setPagamentos(prev =>
        prev.map(p =>
          p.id === pagamentoId ? { ...p, comissao_parcela: novoValor } : p
        )
      );

      setEditandoComissao(null);
      setNovaComissao('');

      toast({
        title: 'Comissão atualizada!',
        description: `Novo valor: ${formatarMoeda(novoValor)}`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar a comissão.',
      });
    }
  };

  const handleExcluirAcordo = async () => {
    if (!acordo) return;
    
    try {
      // Primeiro, deletar os pagamentos associados
      const { error: pagamentosError } = await supabase
        .from('pagamentos')
        .delete()
        .eq('acordo_id', acordo.id);

      if (pagamentosError) throw pagamentosError;

      // Depois, deletar o acordo
      const { error: acordoError } = await supabase
        .from('acordos')
        .delete()
        .eq('id', acordo.id);

      if (acordoError) throw acordoError;

      toast({
        title: 'Acordo excluído',
        description: 'O acordo foi removido com sucesso.',
      });

      navigate('/equipe/acordos');
    } catch (error) {
      console.error('Erro ao excluir acordo:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir o acordo.',
      });
    }
  };

  const atualizarDataVencimento = async (pagamentoId: string, novaData: string) => {
    try {
      const { error } = await supabase
        .from('pagamentos')
        .update({ data_prevista: novaData })
        .eq('id', pagamentoId);

      if (error) throw error;

      setPagamentos(prev =>
        prev.map(p =>
          p.id === pagamentoId ? { ...p, data_prevista: novaData } : p
        )
      );

      setEditandoDataVencimento(null);
      setNovaDataVencimento('');

      toast({
        title: 'Data de vencimento atualizada!',
        description: 'A data foi corrigida com sucesso.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar a data de vencimento.',
      });
    }
  };

  const enviarLembreteParcela = async (pagamento: Pagamento) => {
    if (!acordo?.cliente_telefone) {
      toast({
        variant: 'destructive',
        title: 'Telefone não cadastrado',
        description: 'Este cliente não possui telefone cadastrado.',
      });
      return;
    }

    setEnviandoWhatsApp(pagamento.id);

    try {
      // Extrair primeiro nome do cliente
      const primeiroNome = acordo.cliente_nome.split(' ')[0];
      
      // Formatar número da parcela (1ª, 2ª, 3ª, etc.)
      const numeroParcela = `${pagamento.numero_parcela}ª`;
      
      // Formatar valor
      const valorFormatado = formatarMoeda(pagamento.valor_parcela);
      
      // Formatar data
      const dataVencimento = formatarData(pagamento.data_prevista);
      
      const mensagem = `Olá ${primeiroNome}, meu nome é Rodrigo e sou do departamento de acordos das Lojas Novo Mundo. Estou entrando em contato para informar que a ${numeroParcela} parcela no valor de ${valorFormatado} vence no dia ${dataVencimento}. Você já possui o boleto ou gostaria que enviássemos novamente?`;

      // Fetch active instance for credentials
      const { data: instData } = await supabase
        .from('user_whatsapp_instances')
        .select('id, server_url, instance_token')
        .eq('user_id', user!.id)
        .eq('ativo', true)
        .eq('apenas_lembretes', false)
        .limit(1)
        .maybeSingle();

      const sendBody: any = { telefone: acordo.cliente_telefone, mensagem };
      if (instData) {
        sendBody.uazapi_server_url = instData.server_url;
        sendBody.uazapi_instance_token = instData.instance_token;
        sendBody.instancia_id = instData.id;
      }

      const { error } = await supabase.functions.invoke('send-whatsapp', {
        body: sendBody,
      });

      if (error) throw error;

      toast({
        title: 'Mensagem enviada!',
        description: 'O lembrete foi enviado via WhatsApp.',
      });
    } catch (error) {
      console.error('Erro ao enviar WhatsApp:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar',
        description: 'Não foi possível enviar a mensagem.',
      });
    } finally {
      setEnviandoWhatsApp(null);
    }
  };

  const excluirParcela = async (pagamentoId: string, numeroParcela: number) => {
    try {
      const { error } = await supabase
        .from('pagamentos')
        .delete()
        .eq('id', pagamentoId);

      if (error) throw error;

      setPagamentos(prev => prev.filter(p => p.id !== pagamentoId));

      toast({
        title: 'Parcela excluída',
        description: `A parcela ${numeroParcela} foi removida com sucesso.`,
      });
    } catch (error) {
      console.error('Erro ao excluir parcela:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir a parcela.',
      });
    }
  };

  if (loading || !acordo) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AppLayout>
    );
  }

  const parcelasPagas = pagamentos.filter(p => p.status === 'pago').length;
  const comissaoRecebida = pagamentos
    .filter(p => p.status === 'pago')
    .reduce((sum, p) => sum + Number(p.comissao_parcela), 0);
  const comissaoPendente = pagamentos
    .filter(p => p.status === 'pendente')
    .reduce((sum, p) => sum + Number(p.comissao_parcela), 0);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(isOwner ? '/acordos' : '/equipe/acordos')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              {acordo.cliente_nome}
              <CopyButton value={acordo.cliente_nome} label="Nome" preserveText />
            </h1>
            <p className="text-muted-foreground">
              {funcionarioNome && <span className="text-primary font-medium">{funcionarioNome} • </span>}
              Acordo criado em {formatarData(acordo.criado_em)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && acordo.status === 'ativo' && (
              <>
                <Button
                  variant={acordo.boleto_enviado ? "secondary" : "outline"}
                  size="sm"
                  onClick={marcarBoletoEnviado}
                >
                  {acordo.boleto_enviado ? (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Boleto Enviado
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" />
                      Boleto Enviado
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/acordos/${acordo.id}/editar`)}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Editar
                </Button>
              </>
            )}
            {/* Botão de excluir apenas para Admin */}
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-1" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir o acordo de <strong>{acordo.cliente_nome}</strong>?
                      Esta ação não pode ser desfeita e todos os pagamentos associados serão removidos.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleExcluirAcordo}>
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {!canEdit && (
              <Badge variant="outline" className="text-sm">
                Somente Leitura
              </Badge>
            )}
            {isQuebraAcordo && (
              <Badge variant="destructive" className="bg-red-600 text-white font-bold text-sm">
                QUEBRA DE ACORDO
              </Badge>
            )}
            <Badge
              variant={
                acordo.status === 'ativo' ? 'default' :
                acordo.status === 'concluido' ? 'secondary' : 'destructive'
              }
              className="text-sm"
            >
              {acordo.status === 'ativo' ? 'Ativo' :
               acordo.status === 'concluido' ? 'Concluído' : 
               acordo.status === 'quebrado' ? 'Quebrado' : 'Cancelado'}
            </Badge>
          </div>
        </div>

        {/* Cards de resumo */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Valor Total</p>
                  <p className="text-xl font-bold">{formatarMoeda(acordo.valor_total)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Calendar className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm text-muted-foreground">Parcelas</p>
                  <p className="text-xl font-bold">{parcelasPagas} / {acordo.parcelas}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Check className="h-8 w-8 text-secondary" />
                <div>
                  <p className="text-sm text-muted-foreground">Comissão Recebida</p>
                  <p className="text-xl font-bold text-secondary">{formatarMoeda(comissaoRecebida)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-warning" />
                <div>
                  <p className="text-sm text-muted-foreground">Comissão Pendente</p>
                  <p className="text-xl font-bold text-warning">{formatarMoeda(comissaoPendente)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Detalhes do acordo */}
        <Card>
          <CardHeader>
            <CardTitle>Detalhes do Acordo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Dias em Atraso</p>
                <p className="font-medium">{acordo.dias_atraso} dias</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Percentual de Comissão</p>
                <p className="font-medium">{acordo.percentual_comissao}%</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Valor por Parcela</p>
                <p className="font-medium">{formatarMoeda(acordo.valor_parcela)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Comissão por Parcela</p>
                <p className="font-medium">{formatarMoeda(acordo.comissao_total / acordo.parcelas)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Primeiro Pagamento</p>
                <p className="font-medium">{formatarData(acordo.data_primeiro_pagamento)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Empresa</p>
                <p className="font-medium">
                  {acordo.empresa === 'mundo_da_moda' ? 'MUNDO DA MODA' : 'UME | NOVO MUNDO'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Comissão Total</p>
                <p className="font-medium text-secondary">{formatarMoeda(acordo.comissao_total)}</p>
              </div>
            </div>
            {(acordo.cliente_cpf || acordo.cliente_telefone) && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm font-medium mb-2">Dados do Cliente</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {acordo.cliente_cpf && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">CPF</p>
                        <div className="flex items-center gap-1">
                          <p className="font-medium">{acordo.cliente_cpf}</p>
                          <CopyButton value={acordo.cliente_cpf} label="CPF" />
                        </div>
                      </div>
                    </div>
                  )}
                  {acordo.cliente_telefone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm text-muted-foreground">Telefone</p>
                        <div className="flex items-center gap-1">
                          <p className="font-medium">{acordo.cliente_telefone}</p>
                          <CopyButton value={acordo.cliente_telefone} label="Telefone" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {acordo.observacoes && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">Observações</p>
                <p className="mt-1">{acordo.observacoes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lista de parcelas */}
        <Card>
          <CardHeader>
            <CardTitle>Parcelas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pagamentos.map((pagamento) => (
                <div
                  key={pagamento.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    pagamento.status === 'pago' ? 'bg-secondary/5 border-secondary/20' : 'bg-card'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full ${
                      pagamento.status === 'pago' ? 'bg-secondary/20' : 'bg-muted'
                    }`}>
                      {pagamento.status === 'pago' ? (
                        <Check className="h-4 w-4 text-secondary" />
                      ) : (
                        <Clock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">Parcela {pagamento.numero_parcela}</p>
                      <div className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
                        {editandoDataVencimento === pagamento.id ? (
                          <span className="flex items-center gap-1">
                            <span>Vencimento:</span>
                            <Input
                              type="date"
                              value={novaDataVencimento}
                              onChange={(e) => setNovaDataVencimento(e.target.value)}
                              className="h-7 w-36 text-sm"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-secondary hover:text-secondary"
                              onClick={() => atualizarDataVencimento(pagamento.id, novaDataVencimento)}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => {
                                setEditandoDataVencimento(null);
                                setNovaDataVencimento('');
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span>Vencimento: {formatarData(pagamento.data_prevista)}</span>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={() => {
                                  setEditandoDataVencimento(pagamento.id);
                                  setNovaDataVencimento(pagamento.data_prevista);
                                }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </span>
                        )}
                        {pagamento.status === 'pago' && pagamento.data_paga && (
                          <>
                            <span>•</span>
                            {editandoDataPagamento === pagamento.id ? (
                              <span className="flex items-center gap-1">
                                <span>Pago em:</span>
                                <Input
                                  type="date"
                                  value={novaDataPagamento}
                                  onChange={(e) => setNovaDataPagamento(e.target.value)}
                                  className="h-7 w-36 text-sm"
                                />
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-secondary hover:text-secondary"
                                  onClick={() => atualizarDataPagamento(pagamento.id, novaDataPagamento)}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={() => {
                                    setEditandoDataPagamento(null);
                                    setNovaDataPagamento('');
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <span>Pago em: {formatarData(pagamento.data_paga)}</span>
                                {canEdit && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 w-5 p-0"
                                    onClick={() => {
                                      setEditandoDataPagamento(pagamento.id);
                                      setNovaDataPagamento(pagamento.data_paga || '');
                                    }}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                )}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-medium">{formatarMoeda(pagamento.valor_parcela)}</p>
                      {editandoComissao === pagamento.id ? (
                        <div className="flex items-center gap-1 justify-end">
                          <span className="text-sm text-muted-foreground">R$</span>
                          <Input
                            type="text"
                            value={novaComissao}
                            onChange={(e) => setNovaComissao(e.target.value)}
                            className="h-6 w-20 text-sm text-right"
                            placeholder="0,00"
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-secondary hover:text-secondary"
                            onClick={() => {
                              const valor = parseFloat(novaComissao.replace(',', '.'));
                              if (!isNaN(valor)) {
                                atualizarComissaoParcela(pagamento.id, valor);
                              }
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => {
                              setEditandoComissao(null);
                              setNovaComissao('');
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-secondary flex items-center gap-1 justify-end">
                          Comissão: {formatarMoeda(pagamento.comissao_parcela)}
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={() => {
                                setEditandoComissao(pagamento.id);
                                setNovaComissao(String(pagamento.comissao_parcela).replace('.', ','));
                              }}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </p>
                      )}
                    </div>
                    {isAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir Parcela</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir a parcela {pagamento.numero_parcela}?
                              Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => excluirParcela(pagamento.id, pagamento.numero_parcela)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    {pagamento.status === 'pendente' && acordo.cliente_telefone && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 hover:bg-green-50 hover:text-green-700 border-green-300"
                        onClick={() => enviarLembreteParcela(pagamento)}
                        disabled={enviandoWhatsApp === pagamento.id}
                      >
                        <MessageCircle className="h-4 w-4" />
                      </Button>
                    )}
                    {pagamento.status === 'pendente' && canEdit && (
                      <Button
                        size="sm"
                        onClick={() => marcarComoPago(pagamento.id)}
                      >
                        Marcar Pago
                      </Button>
                    )}
                    {pagamento.status === 'pago' && canEdit && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                        onClick={() => desmarcarComoPago(pagamento.id)}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Desmarcar
                      </Button>
                    )}
                    {pagamento.status === 'pago' && !canEdit && (
                      <Badge variant="secondary">Pago</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
