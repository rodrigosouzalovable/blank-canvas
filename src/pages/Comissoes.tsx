import { useState } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateRangePicker } from '@/components/DateRangePicker';
import { formatarMoeda, formatarData } from '@/lib/comissao';
import { exportarParaExcel } from '@/lib/exportExcel';
import { Clock, CheckCircle, Download, DollarSign } from 'lucide-react';
import { toast } from 'sonner';

interface Acordo {
  id: string;
  cliente_nome: string;
  cliente_cpf: string | null;
  valor_total: number;
  comissao_total: number;
  parcelas: number;
  status: string;
  dias_atraso: number;
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

export default function Comissoes() {
  const { user } = useAuth();
  const [filtro, setFiltro] = useState<'todas' | 'pagas' | 'duplicados'>('todas');
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  const { data: acordos, isLoading: loadingAcordos } = useQuery({
    queryKey: ['meus-acordos', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acordos')
        .select('id, cliente_nome, cliente_cpf, valor_total, comissao_total, parcelas, status, dias_atraso')
        .eq('user_id', user!.id)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return data as Acordo[];
    },
    enabled: !!user,
  });

  const { data: pagamentos, isLoading: loadingPagamentos } = useQuery({
    queryKey: ['meus-pagamentos', acordos?.map(a => a.id)],
    queryFn: async () => {
      if (!acordos || acordos.length === 0) return [];
      
      const { data, error } = await supabase
        .from('pagamentos')
        .select('id, acordo_id, numero_parcela, valor_parcela, comissao_parcela, data_prevista, data_paga, status')
        .in('acordo_id', acordos.map(a => a.id))
        .order('numero_parcela', { ascending: true });

      if (error) throw error;
      return data as Pagamento[];
    },
    enabled: !!acordos && acordos.length > 0,
  });

  const loading = loadingAcordos || loadingPagamentos;

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

  // Calcular totais (apenas parcelas pagas no período)
  const pagamentosPagosNoPeriodo = pagamentosFiltradosPorPeriodo?.filter(p => p.status === 'pago') || [];
  const totalPaga = pagamentosPagosNoPeriodo.reduce((sum, p) => sum + Number(p.comissao_parcela), 0);
  const totalValorParcelasPagas = pagamentosPagosNoPeriodo.reduce((sum, p) => sum + Number(p.valor_parcela), 0);

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

  // Usar acordos filtrados pelo tipo de filtro
  const acordosParaExibir = filtro === 'duplicados' ? acordosDuplicados : acordos;

  // Agrupar acordos por CPF
  const acordosPorCpf = acordosParaExibir?.reduce((acc, acordo) => {
    const cpf = acordo.cliente_cpf || 'Sem CPF';
    if (!acc[cpf]) {
      acc[cpf] = [];
    }
    acc[cpf].push(acordo);
    return acc;
  }, {} as Record<string, Acordo[]>) || {};

  // Filtrar pagamentos por status (todas/pagas)
  const pagamentosFiltrados = filtro === 'pagas' 
    ? pagamentosFiltradosPorPeriodo?.filter(p => p.status === 'pago') 
    : pagamentosFiltradosPorPeriodo;

  const getPagamentosDoAcordo = (acordoId: string) => {
    return pagamentosFiltrados?.filter(p => p.acordo_id === acordoId) || [];
  };

  const handleExportarExcel = () => {
    // Filtrar apenas parcelas pagas no período
    const parcelasPagas = pagamentosFiltradosPorPeriodo?.filter(p => p.status === 'pago') || [];
    
    if (parcelasPagas.length === 0) {
      toast.error('Nenhuma parcela paga para exportar no período selecionado');
      return;
    }

    const dadosExport = parcelasPagas.map(parcela => {
      const acordo = acordos?.find(a => a.id === parcela.acordo_id);
      return {
        cpf: acordo?.cliente_cpf || '',
        cliente: acordo?.cliente_nome || '',
        valor_total: acordo?.valor_total || 0,
        valor_parcela: parcela.valor_parcela,
        data_pagamento: formatarData(parcela.data_paga),
        numero_parcela: parcela.numero_parcela,
        comissao_funcionario: parcela.comissao_parcela,
        dias_atraso: acordo?.dias_atraso || 0,
      };
    });

    // SEM COLUNA DE COMISSÃO DO ESCRITÓRIO - funcionário não pode ver
    const colunas = [
      { chave: 'cpf' as const, titulo: 'CPF' },
      { chave: 'cliente' as const, titulo: 'Cliente' },
      { chave: 'valor_total' as const, titulo: 'Valor Total' },
      { chave: 'valor_parcela' as const, titulo: 'Valor Parcela' },
      { chave: 'data_pagamento' as const, titulo: 'Data Pagamento' },
      { chave: 'numero_parcela' as const, titulo: 'Nº Parcela' },
      { chave: 'comissao_funcionario' as const, titulo: 'Comissão Funcionário' },
      { chave: 'dias_atraso' as const, titulo: 'Dias Atraso' },
    ];

    exportarParaExcel(dadosExport, colunas, 'minhas-comissoes');
    toast.success(`Exportando ${dadosExport.length} parcela(s) paga(s)!`);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold">Minhas Comissões</h1>
          <Button onClick={handleExportarExcel} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar Pagos
          </Button>
        </div>

        {/* Filtro por período */}
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

        {/* Cards de resumo */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <DollarSign className="h-8 w-8 text-secondary" />
                <div>
                  <p className="text-sm text-muted-foreground">Total Parcelas Pagas</p>
                  <p className="text-2xl font-bold text-secondary">{formatarMoeda(totalValorParcelasPagas)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-green-500" />
                <div>
                  <p className="text-sm text-muted-foreground">Comissão Parcelas Pagas</p>
                  <p className="text-2xl font-bold text-green-500">{formatarMoeda(totalPaga)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs de filtro */}
        <Tabs value={filtro} onValueChange={(v) => setFiltro(v as 'todas' | 'pagas' | 'duplicados')}>
          <TabsList>
            <TabsTrigger value="todas">Todas as Parcelas</TabsTrigger>
            <TabsTrigger value="pagas">Somente Pagas</TabsTrigger>
            <TabsTrigger value="duplicados" className="text-orange-600 data-[state=active]:text-orange-600">
              Duplicados {acordosDuplicados.length > 0 && `(${acordosDuplicados.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value={filtro} className="mt-4">
            {Object.keys(acordosPorCpf).length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">
                    Nenhum acordo encontrado
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {Object.entries(acordosPorCpf).map(([cpf, acordosDoCpf]) => (
                  <Card key={cpf}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">
                        CPF: {cpf}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Accordion type="multiple" className="w-full">
                        {acordosDoCpf.map((acordo) => {
                          const pagamentosAcordo = getPagamentosDoAcordo(acordo.id);
                          const comissaoAcordo = pagamentosAcordo.reduce((sum, p) => sum + Number(p.comissao_parcela), 0);
                          
                          if (filtro === 'pagas' && pagamentosAcordo.length === 0) {
                            return null;
                          }

                          return (
                            <AccordionItem key={acordo.id} value={acordo.id}>
                              <AccordionTrigger className="hover:no-underline">
                                <div className="flex flex-wrap items-center gap-2 text-left">
                                  <span className="font-semibold flex items-center gap-1">
                                    {acordo.cliente_nome}
                                    <CopyButton value={acordo.cliente_nome} label="Nome" preserveText />
                                  </span>
                                  {filtro === 'duplicados' && (
                                    <Badge variant="outline" className="border-orange-500 text-orange-600">
                                      {cpfDuplicados.has(normalizarCPF(acordo.cliente_cpf)) && 'CPF duplicado'}
                                      {cpfDuplicados.has(normalizarCPF(acordo.cliente_cpf)) && 
                                       nomeDuplicados.has(normalizarNome(acordo.cliente_nome)) && ' | '}
                                      {nomeDuplicados.has(normalizarNome(acordo.cliente_nome)) && 'Nome duplicado'}
                                    </Badge>
                                  )}
                                  <Badge variant="outline">{acordo.parcelas} parcelas</Badge>
                                  <Badge variant="secondary">Total: {formatarMoeda(acordo.valor_total)}</Badge>
                                  <Badge>Comissão: {formatarMoeda(acordo.comissao_total)}</Badge>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent>
                                {pagamentosAcordo.length > 0 ? (
                                  <div className="space-y-4">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Parcela</TableHead>
                                          <TableHead>Valor</TableHead>
                                          <TableHead>Comissão</TableHead>
                                          <TableHead>Vencimento</TableHead>
                                          <TableHead>Pagamento</TableHead>
                                          <TableHead>Status</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {pagamentosAcordo.map((pagamento) => (
                                          <TableRow key={pagamento.id}>
                                            <TableCell>{pagamento.numero_parcela}/{acordo.parcelas}</TableCell>
                                            <TableCell>{formatarMoeda(pagamento.valor_parcela)}</TableCell>
                                            <TableCell className="font-medium">{formatarMoeda(pagamento.comissao_parcela)}</TableCell>
                                            <TableCell>{formatarData(pagamento.data_prevista)}</TableCell>
                                            <TableCell>
                                              {pagamento.data_paga ? formatarData(pagamento.data_paga) : '-'}
                                            </TableCell>
                                            <TableCell>
                                              {pagamento.status === 'pago' ? (
                                                <Badge className="bg-secondary text-secondary-foreground">
                                                  <CheckCircle className="h-3 w-3 mr-1" />
                                                  Pago
                                                </Badge>
                                              ) : (
                                                <Badge variant="outline">
                                                  <Clock className="h-3 w-3 mr-1" />
                                                  Pendente
                                                </Badge>
                                              )}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                    <div className="flex justify-end">
                                      <div className="text-right">
                                        <p className="text-sm text-muted-foreground">Comissão do acordo</p>
                                        <p className="text-lg font-bold">{formatarMoeda(comissaoAcordo)}</p>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-muted-foreground text-center py-4">
                                    {filtro === 'pagas' 
                                      ? 'Nenhuma parcela paga neste acordo'
                                      : 'Nenhuma parcela encontrada'}
                                  </p>
                                )}
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
