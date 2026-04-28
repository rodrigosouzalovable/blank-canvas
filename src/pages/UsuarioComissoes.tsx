import { useState } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { DateRangePicker } from '@/components/DateRangePicker';
import { ArrowLeft, DollarSign, CheckCircle, Clock, TrendingUp, Download, Search, ExternalLink, PlusCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatarMoeda, formatarData, calcularPercentualComissaoEmpresa } from '@/lib/comissao';
import { exportarParaExcel } from '@/lib/exportExcel';
import { useToast } from '@/hooks/use-toast';

interface Acordo {
  id: string;
  cliente_nome: string;
  cliente_cpf: string | null;
  valor_total: number;
  comissao_total: number;
  parcelas: number;
  status: string;
  dias_atraso: number;
  duplicado_verificado?: boolean;
}

interface Pagamento {
  id: string;
  acordo_id: string;
  numero_parcela: number;
  valor_parcela: number;
  comissao_parcela: number;
  data_prevista: string;
  data_paga: string | null;
  status: string;
}

export default function UsuarioComissoes() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filtro, setFiltro] = useState<'todas' | 'pagas' | 'duplicados'>('todas');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [searchTerm, setSearchTerm] = useState('');

  // Mutation para marcar duplicado como verificado
  const marcarVerificadoMutation = useMutation({
    mutationFn: async (acordoId: string) => {
      const { error } = await supabase
        .from('acordos')
        .update({ duplicado_verificado: true })
        .eq('id', acordoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-acordos', userId] });
      toast({
        title: 'Acordo marcado como verificado!',
        description: 'O caso de duplicidade foi resolvido.',
      });
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: 'Erro ao marcar como verificado',
        description: 'Tente novamente.',
      });
    },
  });

  // Buscar perfil do usuário
  const { data: profile } = useQuery({
    queryKey: ['user-profile', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  // Buscar acordos do usuário
  const { data: acordos } = useQuery({
    queryKey: ['user-acordos', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acordos')
        .select('*')
        .eq('user_id', userId)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return data as Acordo[];
    },
    enabled: !!userId,
  });

  // Buscar pagamentos de todos os acordos
  const { data: pagamentos } = useQuery({
    queryKey: ['user-pagamentos', acordos?.map(a => a.id)],
    queryFn: async () => {
      if (!acordos || acordos.length === 0) return [];
      
      const acordoIds = acordos.map(a => a.id);
      const { data, error } = await supabase
        .from('pagamentos')
        .select('*')
        .in('acordo_id', acordoIds)
        .order('numero_parcela', { ascending: true });

      if (error) throw error;
      return data as Pagamento[];
    },
    enabled: !!acordos && acordos.length > 0,
  });

  // Filtrar pagamentos por período (usando data_paga)
  const pagamentosFiltradosPorPeriodo = pagamentos?.filter(p => {
    // Só filtra por período se houver data de pagamento
    if (!p.data_paga) return true; // Pendentes passam (serão filtrados depois se necessário)
    
    const dataPaga = new Date(p.data_paga + 'T00:00:00');
    
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (dataPaga < start) return false;
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (dataPaga > end) return false;
    }
    
    return true;
  });

  // Calcular totais (considerando o filtro de período)
  const pagamentosPagosNoPeriodo = pagamentosFiltradosPorPeriodo?.filter(p => p.status === 'pago') || [];
  const comissaoTotal = pagamentosFiltradosPorPeriodo?.reduce((acc, p) => acc + Number(p.comissao_parcela), 0) ?? 0;
  const comissaoPaga = pagamentosPagosNoPeriodo.reduce((acc, p) => acc + Number(p.comissao_parcela), 0);
  const comissaoPendente = comissaoTotal - comissaoPaga;
  const percentualRecebido = comissaoTotal > 0 
    ? (comissaoPaga / comissaoTotal) * 100 
    : 0;

  // Normalizar CPF (apenas dígitos)
  const normalizarCPF = (cpf: string | null) => 
    (cpf || '').replace(/\D/g, '');

  // Normalizar nome (minúsculo, sem acentos, sem espaços extras)
  const normalizarNome = (nome: string) => 
    nome.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  // Identificar CPFs duplicados
  const cpfDuplicados = new Set<string>();
  const cpfContagem = new Map<string, number>();
  acordos?.forEach(acordo => {
    const cpfNorm = normalizarCPF(acordo.cliente_cpf);
    if (cpfNorm.length === 11) {
      cpfContagem.set(cpfNorm, (cpfContagem.get(cpfNorm) || 0) + 1);
    }
  });
  cpfContagem.forEach((count, cpf) => {
    if (count > 1) cpfDuplicados.add(cpf);
  });

  // Identificar nomes duplicados
  const nomeDuplicados = new Set<string>();
  const nomeContagem = new Map<string, number>();
  acordos?.forEach(acordo => {
    const nomeNorm = normalizarNome(acordo.cliente_nome);
    nomeContagem.set(nomeNorm, (nomeContagem.get(nomeNorm) || 0) + 1);
  });
  nomeContagem.forEach((count, nome) => {
    if (count > 1) nomeDuplicados.add(nome);
  });

  // Filtrar acordos duplicados
  const acordosDuplicados = acordos?.filter(acordo => {
    const cpfNorm = normalizarCPF(acordo.cliente_cpf);
    const nomeNorm = normalizarNome(acordo.cliente_nome);
    return cpfDuplicados.has(cpfNorm) || nomeDuplicados.has(nomeNorm);
  }) || [];

  // Filtrar acordos por nome ou CPF
  const acordosFiltrados = acordos?.filter(acordo =>
    acordo.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (acordo.cliente_cpf && acordo.cliente_cpf.includes(searchTerm))
  ) ?? [];

  // Usar acordos filtrados pelo tipo de filtro
  const acordosParaExibir = filtro === 'duplicados' 
    ? acordosDuplicados.filter(acordo =>
        acordo.cliente_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (acordo.cliente_cpf && acordo.cliente_cpf.includes(searchTerm))
      )
    : acordosFiltrados;

  // Agrupar acordos por CPF
  const acordosPorCpf = acordosParaExibir.reduce((acc, acordo) => {
    const cpf = acordo.cliente_cpf || 'Sem CPF';
    if (!acc[cpf]) {
      acc[cpf] = [];
    }
    acc[cpf].push(acordo);
    return acc;
  }, {} as Record<string, Acordo[]>);

  // Filtrar pagamentos por status
  const getPagamentosDoAcordo = (acordoId: string) => {
    const pagamentosAcordo = pagamentosFiltradosPorPeriodo?.filter(p => p.acordo_id === acordoId) ?? [];
    if (filtro === 'pagas') {
      return pagamentosAcordo.filter(p => p.status === 'pago');
    }
    return pagamentosAcordo;
  };

  // Função de exportar Excel (COM comissão do escritório - apenas admin vê)
  const handleExportarExcel = () => {
    const parcelasPagas = pagamentosFiltradosPorPeriodo?.filter(p => p.status === 'pago') || [];
    
    if (parcelasPagas.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhuma parcela paga',
        description: 'Não há parcelas pagas para exportar no período selecionado.',
      });
      return;
    }

    const dadosExport = parcelasPagas.map(parcela => {
      const acordo = acordos?.find(a => a.id === parcela.acordo_id);
      const percentualEmpresa = calcularPercentualComissaoEmpresa(acordo?.dias_atraso || 0);
      const comissaoEscritorio = Number(parcela.valor_parcela) * percentualEmpresa / 100;

      return {
        cpf: acordo?.cliente_cpf || '',
        cliente: acordo?.cliente_nome || '',
        valor_total: acordo?.valor_total || 0,
        valor_parcela: parcela.valor_parcela,
        data_pagamento: formatarData(parcela.data_paga),
        numero_parcela: parcela.numero_parcela,
        comissao_funcionario: parcela.comissao_parcela,
        comissao_escritorio: Math.round(comissaoEscritorio * 100) / 100,
        dias_atraso: acordo?.dias_atraso || 0,
      };
    });

    const colunas = [
      { chave: 'cpf' as const, titulo: 'CPF' },
      { chave: 'cliente' as const, titulo: 'Cliente' },
      { chave: 'valor_total' as const, titulo: 'Valor Total' },
      { chave: 'valor_parcela' as const, titulo: 'Valor Parcela' },
      { chave: 'data_pagamento' as const, titulo: 'Data Pagamento' },
      { chave: 'numero_parcela' as const, titulo: 'Nº Parcela' },
      { chave: 'comissao_funcionario' as const, titulo: 'Comissão Funcionário' },
      { chave: 'comissao_escritorio' as const, titulo: 'Comissão Escritório' },
      { chave: 'dias_atraso' as const, titulo: 'Dias Atraso' },
    ];

    const nomeArquivo = `comissoes-${profile?.nome?.replace(/\s+/g, '-').toLowerCase() || 'usuario'}`;
    exportarParaExcel(dadosExport, colunas, nomeArquivo);

    toast({
      title: 'Download iniciado!',
      description: `Exportando ${dadosExport.length} parcela(s) paga(s).`,
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/usuarios')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Comissões - {profile?.nome ?? 'Carregando...'}
              </h1>
              <p className="text-muted-foreground mt-1">
                Visualização detalhada de comissões por acordo
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => navigate(`/admin/usuarios/${userId}/novo-acordo`)} className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              Novo Acordo
            </Button>
            <Button onClick={handleExportarExcel} variant="outline" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Exportar Pagos
            </Button>
          </div>
        </div>

        {/* Filtro por período e busca */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-muted-foreground">Filtrar por data de pagamento:</p>
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onStartDateChange={setStartDate}
                  onEndDateChange={setEndDate}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-muted-foreground">Buscar por nome ou CPF:</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Digite o nome ou CPF do cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cards de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Comissão Total</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatarMoeda(comissaoTotal)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Comissão Paga</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatarMoeda(comissaoPaga)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Comissão Pendente</CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{formatarMoeda(comissaoPendente)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">% Recebido</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{percentualRecebido.toFixed(1)}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Filtro */}
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as 'todas' | 'pagas' | 'duplicados')}>
          <TabsList>
            <TabsTrigger value="todas">Todas as Parcelas</TabsTrigger>
            <TabsTrigger value="pagas">Somente Pagas</TabsTrigger>
            <TabsTrigger value="duplicados" className="text-orange-600 data-[state=active]:text-orange-600">
              Duplicados {acordosDuplicados.filter(a => !a.duplicado_verificado).length > 0 && 
                `(${acordosDuplicados.filter(a => !a.duplicado_verificado).length})`}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Lista de Acordos por CPF */}
        <div className="space-y-4">
          {Object.entries(acordosPorCpf).length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum acordo encontrado para este usuário.
              </CardContent>
            </Card>
          ) : (
            Object.entries(acordosPorCpf).map(([cpf, acordosCpf]) => (
              <Card key={cpf}>
                <CardHeader>
                  <CardTitle className="text-lg">CPF: {cpf}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Accordion type="multiple" className="w-full">
                    {acordosCpf.map((acordo) => {
                      const pagamentosAcordo = getPagamentosDoAcordo(acordo.id);
                      const comissaoAcordo = pagamentosAcordo.reduce((acc, p) => acc + Number(p.comissao_parcela), 0);
                      
                      if (filtro === 'pagas' && pagamentosAcordo.length === 0) {
                        return null;
                      }
                      
                      return (
                        <AccordionItem key={acordo.id} value={acordo.id}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex flex-col md:flex-row md:items-center gap-2 text-left w-full pr-4">
                              <span className="font-medium flex items-center gap-1">
                                {acordo.cliente_nome}
                                <CopyButton value={acordo.cliente_nome} label="Nome" preserveText />
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {filtro === 'duplicados' && (
                                  <Badge variant="outline" className="border-orange-500 text-orange-600">
                                    {cpfDuplicados.has(normalizarCPF(acordo.cliente_cpf)) && 'CPF duplicado'}
                                    {cpfDuplicados.has(normalizarCPF(acordo.cliente_cpf)) && 
                                     nomeDuplicados.has(normalizarNome(acordo.cliente_nome)) && ' | '}
                                    {nomeDuplicados.has(normalizarNome(acordo.cliente_nome)) && 'Nome duplicado'}
                                  </Badge>
                                )}
                                <Badge variant="outline">
                                  {acordo.parcelas} parcelas
                                </Badge>
                                <Badge variant="secondary">
                                  Total: {formatarMoeda(acordo.valor_total)}
                                </Badge>
                                <Badge variant="default">
                                  Comissão: {formatarMoeda(comissaoAcordo)}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/acordos/${acordo.id}`);
                                  }}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  Ver Acordo
                                </Button>
                                {filtro === 'duplicados' && !acordo.duplicado_verificado && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 border-green-500 text-green-600 hover:bg-green-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      marcarVerificadoMutation.mutate(acordo.id);
                                    }}
                                    disabled={marcarVerificadoMutation.isPending}
                                  >
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Verificado
                                  </Button>
                                )}
                                {filtro === 'duplicados' && acordo.duplicado_verificado && (
                                  <Badge className="bg-green-100 text-green-700 border-green-300">
                                    ✓ Verificado
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            {pagamentosAcordo.length === 0 ? (
                              <p className="text-muted-foreground text-center py-4">
                                Nenhuma parcela {filtro === 'pagas' ? 'paga' : ''} encontrada.
                              </p>
                            ) : (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Parcela</TableHead>
                                    <TableHead>Valor</TableHead>
                                    <TableHead>Comissão</TableHead>
                                    <TableHead>Comissão Escritório</TableHead>
                                    <TableHead>Data do Pagamento</TableHead>
                                    <TableHead>Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {pagamentosAcordo.map((pagamento) => (
                                    <TableRow key={pagamento.id}>
                                      <TableCell>
                                        {pagamento.numero_parcela}/{acordo.parcelas}
                                      </TableCell>
                                      <TableCell>{formatarMoeda(pagamento.valor_parcela)}</TableCell>
                                      <TableCell>{formatarMoeda(pagamento.comissao_parcela)}</TableCell>
                                      <TableCell>
                                        {formatarMoeda(Number(pagamento.valor_parcela) * calcularPercentualComissaoEmpresa(acordo.dias_atraso) / 100)}
                                      </TableCell>
                                      <TableCell>{formatarData(pagamento.data_prevista)}</TableCell>
                                      <TableCell>
                                        <Badge 
                                          variant={pagamento.status === 'pago' ? 'default' : 'secondary'}
                                        >
                                          {pagamento.status === 'pago' ? 'Pago' : 'Pendente'}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </AppLayout>
  );
}
