import { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { calcularComissao, calcularPercentualComissaoMundoDaModa, formatarMoeda, formatarData, gerarParcelas, gerarParcelasMundoDaModa, tabelaComissoes, tabelaComissoesMundoDaModa } from '@/lib/comissao';
import { z } from 'zod';
import { ArrowLeft, Calculator, AlertCircle, User, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const acordoSchema = z.object({
  clienteNome: z.string().min(2, 'Nome do cliente é obrigatório').max(200, 'Nome muito longo'),
  clienteCpf: z.string().min(11, 'CPF é obrigatório').max(14, 'CPF inválido'),
  clienteTelefone: z.string().min(10, 'Telefone é obrigatório').max(15, 'Telefone inválido'),
  valorTotal: z.number().positive('Valor deve ser maior que zero'),
  parcelas: z.number().int().positive().min(1, 'Mínimo 1 parcela').max(120, 'Máximo 120 parcelas'),
  valorPrimeiraParcela: z.number().nonnegative().optional(),
  valorDemaisParcelas: z.number().nonnegative().optional(),
  dataPrimeiroPagamento: z.string().min(1, 'Data é obrigatória'),
  diasAtraso: z.number().int().min(0, 'Dias em atraso não pode ser negativo').max(9999),
  observacoes: z.string().max(1000, 'Observações muito longas').optional(),
});

const formatNome = (value: string) => {
  return value.replace(/[^a-zA-ZÀ-ÿ\s]/g, '');
};

const formatCpf = (value: string) => {
  const numbers = value.replace(/\D/g, '').slice(0, 11);
  return numbers
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const formatPhone = (value: string) => {
  const numbers = value.replace(/\D/g, '').slice(0, 11);
  if (numbers.length <= 10) {
    return numbers
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return numbers
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
};

const formatCurrencyDisplay = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const parseCurrency = (value: string): number => {
  const cleaned = value.replace(/[R$\s.]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
};

export default function NovoAcordoAdmin() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [parcelasPagas, setParcelasPagas] = useState<Record<number, { pago: boolean; dataPagamento: string }>>({});
  const [nomeError, setNomeError] = useState('');

  // Buscar perfil do funcionário
  const { data: profile, isLoading: profileLoading } = useQuery({
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

  const handleNomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const filteredValue = formatNome(rawValue);
    
    if (/\d/.test(rawValue)) {
      setNomeError('Este campo aceita apenas letras');
      setTimeout(() => setNomeError(''), 3000);
    }
    
    setForm({ ...form, clienteNome: filteredValue });
  };
  
  const [empresa, setEmpresa] = useState<'ume_novo_mundo' | 'mundo_da_moda'>('ume_novo_mundo');
  
  const [form, setForm] = useState({
    clienteNome: '',
    clienteCpf: '',
    clienteTelefone: '',
    valorTotal: '',
    parcelas: '',
    valorPrimeiraParcela: '',
    valorDemaisParcelas: '',
    dataPrimeiroPagamento: '',
    diasAtraso: '',
    observacoes: '',
  });

  const handleCurrencyRealtime = (value: string, field: 'valorTotal') => {
    let cleaned = value.replace(/^R\$\s*/, '');
    cleaned = cleaned.replace(/[^\d,]/g, '');
    
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      cleaned = parts[0] + ',' + parts.slice(1).join('');
    }
    
    if (parts.length === 2 && parts[1].length > 2) {
      cleaned = parts[0] + ',' + parts[1].slice(0, 2);
    }
    
    if (parts[0]) {
      const intPart = parts[0].replace(/\D/g, '');
      const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      cleaned = parts.length === 2 ? formatted + ',' + parts[1] : formatted;
    }
    
    if (cleaned) {
      setForm({ ...form, [field]: 'R$ ' + cleaned });
    } else {
      setForm({ ...form, [field]: '' });
    }
  };

  const handleCurrencyWithCentsChange = (value: string, field: 'valorPrimeiraParcela' | 'valorDemaisParcelas') => {
    let cleaned = value.replace(/[^\d,]/g, '');
    
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      cleaned = parts[0] + ',' + parts.slice(1).join('');
    }
    
    if (parts.length === 2 && parts[1].length > 2) {
      cleaned = parts[0] + ',' + parts[1].slice(0, 2);
    }
    
    setForm({ ...form, [field]: cleaned });
  };

  const handleCurrencyWithCentsBlur = (field: 'valorPrimeiraParcela' | 'valorDemaisParcelas') => {
    const value = form[field];
    
    const normalized = value.replace(',', '.');
    const amount = parseFloat(normalized) || 0;
    
    if (amount > 0) {
      setForm({ ...form, [field]: formatCurrencyDisplay(amount) });
    } else {
      setForm({ ...form, [field]: '' });
    }
  };

  const calculo = useMemo(() => {
    const parcelas = parseInt(form.parcelas) || 0;
    const diasAtraso = parseInt(form.diasAtraso) || 0;
    const valorTotal = parseCurrency(form.valorTotal);
    const valorPrimeiraParcela = parseCurrency(form.valorPrimeiraParcela);
    const valorDemaisParcelas = parseCurrency(form.valorDemaisParcelas);

    if (parcelas <= 0 || diasAtraso < 0 || valorTotal <= 0) return null;

    const usarValoresEspecificos = valorPrimeiraParcela > 0 && valorDemaisParcelas > 0;

    // Lógica diferente para cada empresa
    if (empresa === 'mundo_da_moda') {
      const percentual = calcularPercentualComissaoMundoDaModa(diasAtraso);
      
      if (usarValoresEspecificos) {
        const comissaoPrimeira = valorPrimeiraParcela * (percentual / 100);
        return {
          percentual,
          valorTotal,
          valorPrimeiraParcela,
          valorDemaisParcelas,
          comissaoPrimeiraParcela: Math.round(comissaoPrimeira * 100) / 100,
          comissaoDemaisParcelas: 0,
          comissaoTotal: Math.round(comissaoPrimeira * 100) / 100,
          usarValoresEspecificos: true as const,
        };
      } else {
        const valorParcela = valorTotal / parcelas;
        const comissaoPrimeiraParcela = valorParcela * (percentual / 100);
        return {
          percentual,
          valorTotal,
          valorPrimeiraParcela: valorParcela,
          valorDemaisParcelas: valorParcela,
          comissaoPrimeiraParcela: Math.round(comissaoPrimeiraParcela * 100) / 100,
          comissaoDemaisParcelas: 0,
          comissaoTotal: Math.round(comissaoPrimeiraParcela * 100) / 100,
          usarValoresEspecificos: false as const,
        };
      }
    } else {
      const { percentual } = calcularComissao(valorTotal, parcelas, diasAtraso);

      if (usarValoresEspecificos) {
        const comissaoPrimeira = valorPrimeiraParcela * (percentual / 100);
        const comissaoDemais = valorDemaisParcelas * (percentual / 100);
        const comissaoTotal = comissaoPrimeira + (comissaoDemais * (parcelas - 1));

        return {
          percentual,
          valorTotal,
          valorPrimeiraParcela,
          valorDemaisParcelas,
          comissaoPrimeiraParcela: Math.round(comissaoPrimeira * 100) / 100,
          comissaoDemaisParcelas: Math.round(comissaoDemais * 100) / 100,
          comissaoTotal: Math.round(comissaoTotal * 100) / 100,
          usarValoresEspecificos: true as const,
        };
      } else {
        const valorParcela = valorTotal / parcelas;
        const comissaoPorParcela = valorParcela * (percentual / 100);
        const comissaoTotal = comissaoPorParcela * parcelas;

        return {
          percentual,
          valorTotal,
          valorPrimeiraParcela: valorParcela,
          valorDemaisParcelas: valorParcela,
          comissaoPrimeiraParcela: Math.round(comissaoPorParcela * 100) / 100,
          comissaoDemaisParcelas: Math.round(comissaoPorParcela * 100) / 100,
          comissaoTotal: Math.round(comissaoTotal * 100) / 100,
          usarValoresEspecificos: false as const,
        };
      }
    }
  }, [form.valorTotal, form.parcelas, form.diasAtraso, form.valorPrimeiraParcela, form.valorDemaisParcelas, empresa]);

  const validacaoSomaParcelas = useMemo(() => {
    const numParcelas = parseInt(form.parcelas) || 0;
    const valorTotal = parseCurrency(form.valorTotal);
    const valorPrimeira = parseCurrency(form.valorPrimeiraParcela);
    const valorDemais = parseCurrency(form.valorDemaisParcelas);

    if (numParcelas <= 1 || valorPrimeira <= 0 || valorDemais <= 0) {
      return { valido: true, diferenca: 0, somaParcelas: 0 };
    }

    const somaParcelas = valorPrimeira + (valorDemais * (numParcelas - 1));
    const diferenca = Math.abs(somaParcelas - valorTotal);
    
    const valido = diferenca <= 0.01;

    return { valido, diferenca, somaParcelas };
  }, [form.parcelas, form.valorTotal, form.valorPrimeiraParcela, form.valorDemaisParcelas]);

  // Gerar preview das parcelas para visualização
  const parcelasPreview = useMemo(() => {
    if (!calculo || !form.dataPrimeiroPagamento) return [];
    
    const dataPrimeiro = new Date(form.dataPrimeiroPagamento + 'T00:00:00');
    const numParcelas = parseInt(form.parcelas) || 1;
    
    if (empresa === 'mundo_da_moda') {
      return gerarParcelasMundoDaModa(
        dataPrimeiro,
        numParcelas,
        calculo.valorDemaisParcelas,
        calculo.comissaoPrimeiraParcela,
        calculo.valorPrimeiraParcela,
        calculo.comissaoPrimeiraParcela
      );
    }
    
    return gerarParcelas(
      dataPrimeiro,
      numParcelas,
      calculo.valorDemaisParcelas,
      calculo.comissaoDemaisParcelas,
      calculo.valorPrimeiraParcela,
      calculo.comissaoPrimeiraParcela
    );
  }, [calculo, form.dataPrimeiroPagamento, form.parcelas, empresa]);

  // Handler para marcar/desmarcar parcela como paga
  const handleParcelaPagaChange = (numeroParcela: number, pago: boolean, dataPrevista: string) => {
    setParcelasPagas(prev => ({
      ...prev,
      [numeroParcela]: {
        pago,
        dataPagamento: pago ? (prev[numeroParcela]?.dataPagamento || dataPrevista) : ''
      }
    }));
  };

  // Handler para alterar data de pagamento
  const handleDataPagamentoChange = (numeroParcela: number, data: string) => {
    setParcelasPagas(prev => ({
      ...prev,
      [numeroParcela]: {
        ...prev[numeroParcela],
        dataPagamento: data
      }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !calculo) return;
    
    setIsLoading(true);

    try {
      const numParcelas = parseInt(form.parcelas);
      const valorPrimeiraParcela = parseCurrency(form.valorPrimeiraParcela);
      const valorDemaisParcelas = parseCurrency(form.valorDemaisParcelas);

      if (numParcelas > 1) {
        if (!form.valorPrimeiraParcela || valorPrimeiraParcela <= 0) {
          throw new Error('Valor da primeira parcela é obrigatório para acordos com mais de 1 parcela');
        }
        if (!form.valorDemaisParcelas || valorDemaisParcelas <= 0) {
          throw new Error('Valor das demais parcelas é obrigatório para acordos com mais de 1 parcela');
        }
        if (!validacaoSomaParcelas.valido) {
          throw new Error('A soma das parcelas não confere com o valor total do acordo');
        }
      }

      const validated = acordoSchema.parse({
        clienteNome: form.clienteNome.trim(),
        clienteCpf: form.clienteCpf.trim(),
        clienteTelefone: form.clienteTelefone.trim(),
        valorTotal: calculo.valorTotal,
        parcelas: numParcelas,
        valorPrimeiraParcela: valorPrimeiraParcela || undefined,
        valorDemaisParcelas: valorDemaisParcelas || undefined,
        dataPrimeiroPagamento: form.dataPrimeiroPagamento,
        diasAtraso: parseInt(form.diasAtraso),
        observacoes: form.observacoes.trim() || undefined,
      });

      // Criar acordo usando o userId do funcionário (parâmetro da URL)
      const { data: acordo, error: acordoError } = await supabase
        .from('acordos')
        .insert({
          user_id: userId,
          cliente_nome: validated.clienteNome,
          cliente_cpf: validated.clienteCpf || null,
          cliente_telefone: validated.clienteTelefone || null,
          valor_total: validated.valorTotal,
          parcelas: validated.parcelas,
          valor_parcela: calculo.valorDemaisParcelas,
          data_primeiro_pagamento: validated.dataPrimeiroPagamento,
          dias_atraso: validated.diasAtraso,
          percentual_comissao: calculo.percentual,
          comissao_total: calculo.comissaoTotal,
          observacoes: validated.observacoes || null,
          empresa: empresa,
        })
        .select()
        .single();

      if (acordoError) throw acordoError;

      // Gerar parcelas - lógica diferente para cada empresa
      let parcelas;
      if (empresa === 'mundo_da_moda') {
        parcelas = gerarParcelasMundoDaModa(
          new Date(validated.dataPrimeiroPagamento),
          validated.parcelas,
          calculo.valorDemaisParcelas,
          calculo.comissaoPrimeiraParcela,
          calculo.usarValoresEspecificos ? calculo.valorPrimeiraParcela : undefined,
          calculo.usarValoresEspecificos ? calculo.comissaoPrimeiraParcela : undefined
        );
      } else {
        parcelas = calculo.usarValoresEspecificos
          ? gerarParcelas(
              new Date(validated.dataPrimeiroPagamento),
              validated.parcelas,
              calculo.valorDemaisParcelas,
              calculo.comissaoDemaisParcelas,
              calculo.valorPrimeiraParcela,
              calculo.comissaoPrimeiraParcela
            )
          : gerarParcelas(
              new Date(validated.dataPrimeiroPagamento),
              validated.parcelas,
              calculo.valorDemaisParcelas,
              calculo.comissaoDemaisParcelas
            );
      }

      // Inserir os pagamentos com status baseado nas parcelas marcadas como pagas
      const pagamentosData = parcelas.map(p => {
        const parcelaPaga = parcelasPagas[p.numero_parcela];
        return {
          acordo_id: acordo.id,
          numero_parcela: p.numero_parcela,
          data_prevista: p.data_prevista,
          valor_parcela: p.valor_parcela,
          comissao_parcela: p.comissao_parcela,
          status: parcelaPaga?.pago ? 'pago' : 'pendente',
          data_paga: parcelaPaga?.pago ? parcelaPaga.dataPagamento : null
        };
      });

      const { error: parcelasError } = await supabase
        .from('pagamentos')
        .insert(pagamentosData);

      if (parcelasError) throw parcelasError;

      // Verificar se todas as parcelas foram marcadas como pagas
      const todasPagas = parcelas.every(p => parcelasPagas[p.numero_parcela]?.pago);

      // Se todas as parcelas foram pagas, atualizar status do acordo para concluído
      if (todasPagas) {
        await supabase
          .from('acordos')
          .update({ status: 'concluido' })
          .eq('id', acordo.id);
      }

      toast({
        title: 'Acordo criado!',
        description: `Acordo com ${validated.clienteNome} cadastrado para ${profile?.nome}.`,
      });

      navigate(`/admin/usuarios/${userId}/comissoes`);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          variant: 'destructive',
          title: 'Dados inválidos',
          description: err.errors[0].message,
        });
      } else if (err instanceof Error) {
        toast({
          variant: 'destructive',
          title: 'Dados inválidos',
          description: err.message,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro ao criar acordo',
          description: 'Tente novamente mais tarde.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (profileLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <p>Carregando...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/admin/usuarios/${userId}/comissoes`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Novo Acordo</h1>
            <p className="text-muted-foreground flex items-center gap-1">
              <User className="h-4 w-4" />
              Para: {profile?.nome ?? 'Funcionário'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Dados do Cliente</CardTitle>
              <CardDescription>Informações do cliente do acordo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clienteNome">Nome do Cliente *</Label>
                <Input
                  id="clienteNome"
                  placeholder="Nome completo do cliente"
                  value={form.clienteNome}
                  onChange={handleNomeChange}
                  required
                  className={nomeError ? 'border-destructive' : ''}
                />
                {nomeError && (
                  <p className="text-sm text-destructive">{nomeError}</p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="clienteCpf">CPF *</Label>
                  <Input
                    id="clienteCpf"
                    placeholder="000.000.000-00"
                    value={form.clienteCpf}
                    onChange={(e) => setForm({ ...form, clienteCpf: formatCpf(e.target.value) })}
                    maxLength={14}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clienteTelefone">Telefone *</Label>
                  <Input
                    id="clienteTelefone"
                    placeholder="(00) 00000-0000"
                    value={form.clienteTelefone}
                    onChange={(e) => setForm({ ...form, clienteTelefone: formatPhone(e.target.value) })}
                    maxLength={15}
                    required
                  />
                </div>
              </div>

              {/* Seletor de Empresa */}
              <div className="space-y-2">
                <Label>Empresa *</Label>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant={empresa === 'ume_novo_mundo' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setEmpresa('ume_novo_mundo')}
                  >
                    UME | NOVO MUNDO
                  </Button>
                  <Button
                    type="button"
                    variant={empresa === 'mundo_da_moda' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setEmpresa('mundo_da_moda')}
                  >
                    MUNDO DA MODA
                  </Button>
                </div>
                {empresa === 'mundo_da_moda' && (
                  <p className="text-sm text-muted-foreground">
                    ⚠️ Comissão calculada apenas sobre a 1ª parcela
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados do Acordo</CardTitle>
              <CardDescription>Preencha as informações do acordo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="valorTotal">Valor Total do Acordo (R$) *</Label>
                <Input
                  id="valorTotal"
                  placeholder="Digite o valor (ex: 2094,96)"
                  value={form.valorTotal}
                  onChange={(e) => handleCurrencyRealtime(e.target.value, 'valorTotal')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parcelas">Número de Parcelas *</Label>
                <Input
                  id="parcelas"
                  type="number"
                  min="1"
                  max="120"
                  placeholder="1"
                  value={form.parcelas}
                  onChange={(e) => setForm({ ...form, parcelas: e.target.value })}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="valorPrimeiraParcela">
                    Valor da Primeira Parcela (R$) {parseInt(form.parcelas) !== 1 && '*'}
                  </Label>
                  <Input
                    id="valorPrimeiraParcela"
                    placeholder="Ex: 149,25"
                    value={form.valorPrimeiraParcela}
                    onChange={(e) => handleCurrencyWithCentsChange(e.target.value, 'valorPrimeiraParcela')}
                    onBlur={() => handleCurrencyWithCentsBlur('valorPrimeiraParcela')}
                    required={parseInt(form.parcelas) !== 1}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="valorDemaisParcelas">
                    Valor das Demais Parcelas (R$) {parseInt(form.parcelas) !== 1 && '*'}
                  </Label>
                  <Input
                    id="valorDemaisParcelas"
                    placeholder="Ex: 300,50"
                    value={form.valorDemaisParcelas}
                    onChange={(e) => handleCurrencyWithCentsChange(e.target.value, 'valorDemaisParcelas')}
                    onBlur={() => handleCurrencyWithCentsBlur('valorDemaisParcelas')}
                    required={parseInt(form.parcelas) !== 1}
                  />
                </div>
              </div>

              {!validacaoSomaParcelas.valido && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Valores não conferem</AlertTitle>
                  <AlertDescription>
                    A soma das parcelas ({formatarMoeda(validacaoSomaParcelas.somaParcelas)}) 
                    é diferente do valor total do acordo ({formatarMoeda(parseCurrency(form.valorTotal))}).
                    Diferença: {formatarMoeda(validacaoSomaParcelas.diferenca)}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dataPrimeiroPagamento">Data do 1º Pagamento *</Label>
                  <Input
                    id="dataPrimeiroPagamento"
                    type="date"
                    value={form.dataPrimeiroPagamento}
                    onChange={(e) => setForm({ ...form, dataPrimeiroPagamento: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="diasAtraso">Dias em Atraso *</Label>
                  <Input
                    id="diasAtraso"
                    type="number"
                    min="0"
                    placeholder="0"
                    value={form.diasAtraso}
                    onChange={(e) => setForm({ ...form, diasAtraso: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações (opcional)</Label>
                <Textarea
                  id="observacoes"
                  placeholder="Informações adicionais sobre o acordo..."
                  value={form.observacoes}
                  onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {calculo && (
            <Card className="border-secondary/50 bg-secondary/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-secondary">
                  <Calculator className="h-5 w-5" />
                  Cálculo da Comissão
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor da Primeira Parcela</p>
                    <p className="text-lg font-semibold">{formatarMoeda(calculo.valorPrimeiraParcela)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Valor das Demais Parcelas</p>
                    <p className="text-lg font-semibold">{formatarMoeda(calculo.valorDemaisParcelas)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Comissão Primeira Parcela</p>
                    <p className="text-lg font-semibold">{formatarMoeda(calculo.comissaoPrimeiraParcela)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Comissão Demais Parcelas</p>
                    <p className="text-lg font-semibold">{formatarMoeda(calculo.comissaoDemaisParcelas)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Faixa de Atraso</p>
                    <p className="text-lg font-semibold">{calculo.percentual}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Total</p>
                    <p className="text-lg font-semibold">{formatarMoeda(calculo.valorTotal)}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-sm text-muted-foreground">Comissão Total</p>
                    <p className="text-xl font-bold text-secondary">{formatarMoeda(calculo.comissaoTotal)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {parcelasPreview.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4" />
                  Parcelas do Acordo
                </CardTitle>
                <CardDescription>Marque as parcelas que já foram pagas</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Comissão</TableHead>
                      <TableHead>Data Prevista</TableHead>
                      <TableHead>Pago?</TableHead>
                      <TableHead>Data Pagamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parcelasPreview.map((parcela) => (
                      <TableRow key={parcela.numero_parcela}>
                        <TableCell>{parcela.numero_parcela}/{parcelasPreview.length}</TableCell>
                        <TableCell>{formatarMoeda(parcela.valor_parcela)}</TableCell>
                        <TableCell>{formatarMoeda(parcela.comissao_parcela)}</TableCell>
                        <TableCell>{formatarData(parcela.data_prevista)}</TableCell>
                        <TableCell>
                          <Checkbox
                            checked={parcelasPagas[parcela.numero_parcela]?.pago || false}
                            onCheckedChange={(checked) => 
                              handleParcelaPagaChange(parcela.numero_parcela, !!checked, parcela.data_prevista)
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {parcelasPagas[parcela.numero_parcela]?.pago && (
                            <Input
                              type="date"
                              value={parcelasPagas[parcela.numero_parcela]?.dataPagamento || ''}
                              onChange={(e) => handleDataPagamentoChange(parcela.numero_parcela, e.target.value)}
                              className="w-36"
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Tabela de Comissões - {empresa === 'ume_novo_mundo' ? 'UME | NOVO MUNDO' : 'MUNDO DA MODA'}
              </CardTitle>
              {empresa === 'mundo_da_moda' && (
                <CardDescription>Comissão paga apenas sobre a 1ª parcela</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className={`grid grid-cols-3 gap-2 text-center text-sm ${empresa === 'ume_novo_mundo' ? 'sm:grid-cols-6' : 'sm:grid-cols-5'}`}>
                {(empresa === 'ume_novo_mundo' ? tabelaComissoes : tabelaComissoesMundoDaModa).map((faixa) => (
                  <div
                    key={faixa.min}
                    className={`p-2 rounded ${
                      calculo && calculo.percentual === faixa.percentual
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    <p className="text-xs text-muted-foreground">
                      {faixa.min}-{faixa.max === 9999 ? '+' : faixa.max}
                    </p>
                    <p className="font-bold">{faixa.percentual}%</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => navigate(`/admin/usuarios/${userId}/comissoes`)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={
                isLoading || 
                !calculo || 
                !form.clienteCpf || 
                !form.clienteTelefone || 
                (parseInt(form.parcelas) > 1 && (!form.valorPrimeiraParcela || !form.valorDemaisParcelas)) ||
                !validacaoSomaParcelas.valido
              }
            >
              {isLoading ? 'Salvando...' : 'Criar Acordo'}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
