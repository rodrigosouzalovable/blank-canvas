import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { calcularComissao, calcularComissaoMundoDaModa, calcularPercentualComissaoMundoDaModa, formatarMoeda, gerarParcelas, gerarParcelasMundoDaModa, tabelaComissoes, tabelaComissoesMundoDaModa } from '@/lib/comissao';
import { z } from 'zod';
import { ArrowLeft, Calculator, AlertCircle, Sparkles, FileText } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ImageDataExtractor, ExtractedData } from '@/components/ImageDataExtractor';
const acordoSchema = z.object({
  clienteNome: z.string().min(2, 'Nome do cliente é obrigatório').max(200, 'Nome muito longo'),
  clienteCpf: z.string().min(14, 'CPF incompleto').max(14, 'CPF inválido').refine(val => val.replace(/\D/g, '').length === 11, {
    message: 'CPF deve ter 11 dígitos'
  }),
  clienteTelefone: z.string().min(15, 'Telefone incompleto').max(15, 'Telefone inválido').refine(val => val.replace(/\D/g, '').length === 11, {
    message: 'Telefone deve ter 11 dígitos'
  }),
  valorTotal: z.number().positive('Valor deve ser maior que zero'),
  parcelas: z.number().int().positive().min(1, 'Mínimo 1 parcela').max(120, 'Máximo 120 parcelas'),
  valorPrimeiraParcela: z.number().nonnegative().optional(),
  valorDemaisParcelas: z.number().nonnegative().optional(),
  dataPrimeiroPagamento: z.string().min(1, 'Data é obrigatória'),
  diasAtraso: z.number().int().min(0, 'Dias em atraso não pode ser negativo').max(9999),
  observacoes: z.string().max(1000, 'Observações muito longas').optional()
});

// Funções de máscara
const formatNome = (value: string) => {
  // Permite apenas letras (maiúsculas/minúsculas), acentos e espaços
  return value.replace(/[^a-zA-ZÀ-ÿ\s]/g, '');
};
const formatCpf = (value: string) => {
  const numbers = value.replace(/\D/g, '').slice(0, 11);
  return numbers.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};
const isCpfCompleto = (cpf: string): boolean => {
  const apenasNumeros = cpf.replace(/\D/g, '');
  return apenasNumeros.length === 11;
};
const isTelefoneCompleto = (telefone: string): boolean => {
  const apenasNumeros = telefone.replace(/\D/g, '');
  return apenasNumeros.length === 11;
};
const formatPhone = (value: string) => {
  const numbers = value.replace(/\D/g, '').slice(0, 11);
  if (numbers.length <= 10) {
    return numbers.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return numbers.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
};
const formatCurrencyDisplay = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};
const parseCurrency = (value: string): number => {
  // Remove "R$", espaços e pontos de milhar, converte vírgula para ponto decimal
  const cleaned = value.replace(/[R$\s.]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
};
export default function NovoAcordo() {
  const {
    user
  } = useAuth();
  const { isAdmin } = useUserRole();
  const { permiteCpfDuplicado } = useUserPermissions();
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [nomeError, setNomeError] = useState('');
  const [cpfError, setCpfError] = useState('');
  const [cpfDuplicateError, setCpfDuplicateError] = useState('');
  const [cpfQuebraInfo, setCpfQuebraInfo] = useState('');
  const [checkingCpf, setCheckingCpf] = useState(false);
  const [telefoneError, setTelefoneError] = useState('');
  const handleNomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const filteredValue = formatNome(rawValue);
    if (/\d/.test(rawValue)) {
      setNomeError('Este campo aceita apenas letras');
      setTimeout(() => setNomeError(''), 3000);
    }
    setForm({
      ...form,
      clienteNome: filteredValue
    });
  };
  const [empresa, setEmpresa] = useState<'ume_novo_mundo' | 'mundo_da_moda'>('ume_novo_mundo');
  const [activeTab, setActiveTab] = useState('ai');
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
    observacoes: ''
  });

  // Handler para dados extraídos pela IA
  const handleDataExtracted = (data: ExtractedData) => {
    // Formata CPF se vier sem formatação
    let formattedCpf = data.cliente_cpf || '';
    if (formattedCpf && !formattedCpf.includes('.')) {
      formattedCpf = formatCpf(formattedCpf);
    }

    // Formata telefone se vier sem formatação
    let formattedPhone = data.cliente_telefone || '';
    if (formattedPhone && !formattedPhone.includes('(')) {
      formattedPhone = formatPhone(formattedPhone);
    }

    // Formata data de DD/MM/AAAA para YYYY-MM-DD (formato do input date)
    let formattedDate = '';
    if (data.data_primeiro_pagamento) {
      const parts = data.data_primeiro_pagamento.split('/');
      if (parts.length === 3) {
        formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }

    setForm({
      clienteNome: data.cliente_nome || '',
      clienteCpf: formattedCpf,
      clienteTelefone: formattedPhone,
      valorTotal: data.valor_total ? formatCurrencyDisplay(data.valor_total) : '',
      parcelas: data.parcelas?.toString() || '',
      valorPrimeiraParcela: data.valor_parcela ? formatCurrencyDisplay(data.valor_parcela) : '',
      valorDemaisParcelas: data.valor_parcela ? formatCurrencyDisplay(data.valor_parcela) : '',
      dataPrimeiroPagamento: formattedDate,
      diasAtraso: data.dias_atraso?.toString() || '',
      observacoes: ''
    });

    // Muda para aba manual para revisão
    setActiveTab('manual');

    toast({
      title: 'Dados extraídos!',
      description: 'Revise as informações na aba "Preencher Manualmente" antes de salvar.',
    });
  };

  // Função para calcular e preencher automaticamente os valores das parcelas
  const calcularValoresParcelas = (valorTotalStr: string, parcelasStr: string) => {
    const valorTotal = parseCurrency(valorTotalStr);
    const numParcelas = parseInt(parcelasStr) || 0;
    
    if (valorTotal > 0 && numParcelas > 0) {
      const valorParcela = Math.round((valorTotal / numParcelas) * 100) / 100;
      const valorFormatado = formatCurrencyDisplay(valorParcela);
      
      setForm(prev => ({
        ...prev,
        valorPrimeiraParcela: valorFormatado,
        valorDemaisParcelas: valorFormatado
      }));
    }
  };

  // Handler para formatação em tempo real do valor total (com centavos)
  const handleCurrencyRealtime = (value: string, field: 'valorTotal') => {
    // Remove "R$ " e espaços iniciais
    let cleaned = value.replace(/^R\$\s*/, '');

    // Remove tudo exceto números e vírgula
    cleaned = cleaned.replace(/[^\d,]/g, '');

    // Permite apenas uma vírgula
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      cleaned = parts[0] + ',' + parts.slice(1).join('');
    }

    // Limita a 2 casas decimais após a vírgula
    if (parts.length === 2 && parts[1].length > 2) {
      cleaned = parts[0] + ',' + parts[1].slice(0, 2);
    }

    // Formata a parte inteira com pontos de milhar
    if (parts[0]) {
      const intPart = parts[0].replace(/\D/g, '');
      const formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      cleaned = parts.length === 2 ? formatted + ',' + parts[1] : formatted;
    }

    // Adiciona "R$ " no início se tiver valor
    if (cleaned) {
      const novoValorTotal = 'R$ ' + cleaned;
      setForm(prev => ({
        ...prev,
        [field]: novoValorTotal
      }));
      // Calcular automaticamente os valores das parcelas
      calcularValoresParcelas(novoValorTotal, form.parcelas);
    } else {
      setForm(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  // Handler para número de parcelas com cálculo automático
  const handleParcelasChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 3);
    setForm(prev => ({
      ...prev,
      parcelas: value
    }));
    
    // Calcular automaticamente quando muda o número de parcelas
    if (value && form.valorTotal) {
      calcularValoresParcelas(form.valorTotal, value);
    }
  };

  // Handler para campos com centavos (parcelas) - aceita números e vírgula
  const handleCurrencyWithCentsChange = (value: string, field: 'valorPrimeiraParcela' | 'valorDemaisParcelas') => {
    // Remove tudo exceto números e vírgula
    let cleaned = value.replace(/[^\d,]/g, '');

    // Permite apenas uma vírgula
    const parts = cleaned.split(',');
    if (parts.length > 2) {
      cleaned = parts[0] + ',' + parts.slice(1).join('');
    }

    // Limita a 2 casas decimais após a vírgula
    if (parts.length === 2 && parts[1].length > 2) {
      cleaned = parts[0] + ',' + parts[1].slice(0, 2);
    }
    setForm({
      ...form,
      [field]: cleaned
    });
  };

  // Handler para formatar ao sair do campo (parcelas - com centavos)
  const handleCurrencyWithCentsBlur = (field: 'valorPrimeiraParcela' | 'valorDemaisParcelas') => {
    const value = form[field];

    // Converte "149,25" para número 149.25
    const normalized = value.replace(',', '.');
    const amount = parseFloat(normalized) || 0;
    if (amount > 0) {
      setForm({
        ...form,
        [field]: formatCurrencyDisplay(amount)
      });
    } else {
      setForm({
        ...form,
        [field]: ''
      });
    }
  };

  // Cálculo automático da comissão
  const calculo = useMemo(() => {
    const parcelas = parseInt(form.parcelas) || 0;
    const diasAtraso = parseInt(form.diasAtraso) || 0;
    const valorTotal = parseCurrency(form.valorTotal);
    const valorPrimeiraParcela = parseCurrency(form.valorPrimeiraParcela);
    const valorDemaisParcelas = parseCurrency(form.valorDemaisParcelas);
    if (parcelas <= 0 || diasAtraso < 0 || valorTotal <= 0) return null;

    // Se valores das parcelas foram especificados, usa eles
    const usarValoresEspecificos = valorPrimeiraParcela > 0 && valorDemaisParcelas > 0;

    // Lógica diferente para cada empresa
    if (empresa === 'mundo_da_moda') {
      // MUNDO DA MODA: comissão apenas na 1ª parcela
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
          // Sem comissão nas demais
          comissaoTotal: Math.round(comissaoPrimeira * 100) / 100,
          usarValoresEspecificos: true as const
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
          // Sem comissão nas demais
          comissaoTotal: Math.round(comissaoPrimeiraParcela * 100) / 100,
          usarValoresEspecificos: false as const
        };
      }
    } else {
      // UME | NOVO MUNDO: comissão em todas as parcelas (comportamento atual)
      const {
        percentual
      } = calcularComissao(valorTotal, parcelas, diasAtraso);
      if (usarValoresEspecificos) {
        const comissaoPrimeira = valorPrimeiraParcela * (percentual / 100);
        const comissaoDemais = valorDemaisParcelas * (percentual / 100);
        const comissaoTotal = comissaoPrimeira + comissaoDemais * (parcelas - 1);
        return {
          percentual,
          valorTotal,
          valorPrimeiraParcela,
          valorDemaisParcelas,
          comissaoPrimeiraParcela: Math.round(comissaoPrimeira * 100) / 100,
          comissaoDemaisParcelas: Math.round(comissaoDemais * 100) / 100,
          comissaoTotal: Math.round(comissaoTotal * 100) / 100,
          usarValoresEspecificos: true as const
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
          usarValoresEspecificos: false as const
        };
      }
    }
  }, [form.valorTotal, form.parcelas, form.diasAtraso, form.valorPrimeiraParcela, form.valorDemaisParcelas, empresa]);

  // Validação da soma das parcelas
  const validacaoSomaParcelas = useMemo(() => {
    const numParcelas = parseInt(form.parcelas) || 0;
    const valorTotal = parseCurrency(form.valorTotal);
    const valorPrimeira = parseCurrency(form.valorPrimeiraParcela);
    const valorDemais = parseCurrency(form.valorDemaisParcelas);

    // Só valida se tiver mais de 1 parcela e valores preenchidos
    if (numParcelas <= 1 || valorPrimeira <= 0 || valorDemais <= 0) {
      return {
        valido: true,
        diferenca: 0,
        somaParcelas: 0
      };
    }

    // Soma = primeira + (demais × (parcelas - 1))
    const somaParcelas = valorPrimeira + valorDemais * (numParcelas - 1);
    const diferenca = Math.abs(somaParcelas - valorTotal);

    // Tolerância de R$ 0,01 para erros de arredondamento
    const valido = diferenca <= 0.01;
    return {
      valido,
      diferenca,
      somaParcelas
    };
  }, [form.parcelas, form.valorTotal, form.valorPrimeiraParcela, form.valorDemaisParcelas]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !calculo) return;
    setIsLoading(true);
    try {
      const numParcelas = parseInt(form.parcelas);
      const valorPrimeiraParcela = parseCurrency(form.valorPrimeiraParcela);
      const valorDemaisParcelas = parseCurrency(form.valorDemaisParcelas);

      // Validação condicional: se parcelas > 1, exige valores das parcelas
      if (numParcelas > 1) {
        if (!form.valorPrimeiraParcela || valorPrimeiraParcela <= 0) {
          throw new Error('Valor da primeira parcela é obrigatório para acordos com mais de 1 parcela');
        }
        if (!form.valorDemaisParcelas || valorDemaisParcelas <= 0) {
          throw new Error('Valor das demais parcelas é obrigatório para acordos com mais de 1 parcela');
        }
        // Validação da soma das parcelas
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
        observacoes: form.observacoes.trim() || undefined
      });

      // Criar acordo
      const {
        data: acordo,
        error: acordoError
      } = await supabase.from('acordos').insert({
        user_id: user.id,
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
        empresa: empresa
      }).select().single();
      if (acordoError) throw acordoError;

      // Gerar parcelas - lógica diferente para cada empresa
      let parcelas;
      if (empresa === 'mundo_da_moda') {
        parcelas = gerarParcelasMundoDaModa(new Date(validated.dataPrimeiroPagamento), validated.parcelas, calculo.valorDemaisParcelas, calculo.comissaoPrimeiraParcela, calculo.usarValoresEspecificos ? calculo.valorPrimeiraParcela : undefined, calculo.usarValoresEspecificos ? calculo.comissaoPrimeiraParcela : undefined);
      } else {
        parcelas = calculo.usarValoresEspecificos ? gerarParcelas(new Date(validated.dataPrimeiroPagamento), validated.parcelas, calculo.valorDemaisParcelas, calculo.comissaoDemaisParcelas, calculo.valorPrimeiraParcela, calculo.comissaoPrimeiraParcela) : gerarParcelas(new Date(validated.dataPrimeiroPagamento), validated.parcelas, calculo.valorDemaisParcelas, calculo.comissaoDemaisParcelas);
      }
      const {
        error: parcelasError
      } = await supabase.from('pagamentos').insert(parcelas.map(p => ({
        acordo_id: acordo.id,
        numero_parcela: p.numero_parcela,
        data_prevista: p.data_prevista,
        valor_parcela: p.valor_parcela,
        comissao_parcela: p.comissao_parcela,
        status: p.status
      })));
      if (parcelasError) throw parcelasError;
      toast({
        title: 'Acordo criado!',
        description: `Acordo com ${validated.clienteNome} cadastrado com sucesso.`
      });
      navigate(`/acordos/${acordo.id}`);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          variant: 'destructive',
          title: 'Dados inválidos',
          description: err.errors[0].message
        });
      } else if (err instanceof Error) {
        // Tratar erro do trigger de CPF duplicado
        const errorMessage = err.message;
        if (errorMessage.includes('Este CPF já possui acordo lançado por')) {
          setCpfDuplicateError(errorMessage);
          toast({
            variant: 'destructive',
            title: 'CPF já cadastrado',
            description: errorMessage,
          });
        } else if (errorMessage.includes('Este CPF já possui acordo')) {
          setCpfDuplicateError(errorMessage);
          toast({
            variant: 'destructive',
            title: 'CPF já cadastrado',
            description: errorMessage,
          });
        } else {
          toast({
            variant: 'destructive',
            title: 'Dados inválidos',
            description: errorMessage
          });
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro ao criar acordo',
          description: 'Tente novamente mais tarde.'
        });
      }
    } finally {
      setIsLoading(false);
    }
  };
  return <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Novo Acordo</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Preencher com IA
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Preencher Manualmente
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ai" className="space-y-4">
            <ImageDataExtractor onDataExtracted={handleDataExtracted} />
          </TabsContent>

          <TabsContent value="manual" className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <Card>
            <CardHeader>
              <CardTitle>Dados do Cliente</CardTitle>
              <CardDescription>Informações do cliente do acordo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clienteNome">Nome do Cliente *</Label>
                <Input id="clienteNome" placeholder="Nome completo do cliente" value={form.clienteNome} onChange={handleNomeChange} required className={nomeError ? 'border-destructive' : ''} />
                {nomeError && <p className="text-sm text-destructive">{nomeError}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="clienteCpf">CPF *</Label>
                  <Input id="clienteCpf" placeholder="000.000.000-00" value={form.clienteCpf} onChange={async e => {
                  const formatted = formatCpf(e.target.value);
                  setForm({
                    ...form,
                    clienteCpf: formatted
                  });
                  if (cpfError) setCpfError('');
                  if (cpfDuplicateError) setCpfDuplicateError('');
                  if (cpfQuebraInfo) setCpfQuebraInfo('');
                  
                  // Verificar CPF duplicado quando completo (11 dígitos) e não for admin
                  if (isCpfCompleto(formatted) && !isAdmin && !permiteCpfDuplicado) {
                    setCheckingCpf(true);
                    try {
                      const { data: hasDuplicate, error } = await supabase.rpc('cpf_has_acordo', { p_cpf: formatted });
                      if (!error && hasDuplicate) {
                        // Verificar se o último acordo tem QUEBRA DE ACORDO
                        const { data: isQuebrado, error: quebraError } = await supabase.rpc('cpf_ultimo_acordo_quebrado', { p_cpf: formatted });
                        
                        if (!quebraError && isQuebrado) {
                          // CPF tem quebra, permitir novo acordo
                          setCpfQuebraInfo('CPF possui acordo anterior com QUEBRA DE ACORDO. Novo acordo permitido.');
                          setCpfDuplicateError('');
                        } else {
                          // CPF não tem quebra, buscar nome do funcionário
                          const { data: nomeFuncionario } = await supabase.rpc('cpf_acordo_funcionario_nome' as any, { p_cpf: formatted });
                          const nome = nomeFuncionario || 'outro funcionário';
                          setCpfDuplicateError(`Este CPF já possui acordo ativo lançado por ${nome}. Contate o administrador.`);
                          setCpfQuebraInfo('');
                        }
                      }
                    } catch (err) {
                      console.error('Erro ao verificar CPF:', err);
                    } finally {
                      setCheckingCpf(false);
                    }
                  }
                }} onBlur={() => {
                  if (form.clienteCpf && !isCpfCompleto(form.clienteCpf)) {
                    setCpfError('CPF deve ter 11 dígitos');
                  }
                }} maxLength={14} required className={cpfError || cpfDuplicateError ? 'border-destructive' : cpfQuebraInfo ? 'border-green-500' : ''} />
                  {cpfError && <p className="text-sm text-destructive">{cpfError}</p>}
                  {cpfDuplicateError && <p className="text-sm text-destructive">{cpfDuplicateError}</p>}
                  {cpfQuebraInfo && <p className="text-sm text-green-600">{cpfQuebraInfo}</p>}
                  {checkingCpf && <p className="text-sm text-muted-foreground">Verificando CPF...</p>}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clienteTelefone">Telefone *</Label>
                  <Input id="clienteTelefone" placeholder="(00) 00000-0000" value={form.clienteTelefone} onChange={e => {
                  const formatted = formatPhone(e.target.value);
                  setForm({
                    ...form,
                    clienteTelefone: formatted
                  });
                  if (telefoneError) setTelefoneError('');
                }} onBlur={() => {
                  if (form.clienteTelefone && !isTelefoneCompleto(form.clienteTelefone)) {
                    setTelefoneError('Telefone deve ter 11 dígitos');
                  }
                }} maxLength={15} required className={telefoneError ? 'border-destructive' : ''} />
                  {telefoneError && <p className="text-sm text-destructive">{telefoneError}</p>}
                </div>
              </div>

              {/* Seletor de Empresa */}
              <div className="space-y-2">
                <Label>Empresa *</Label>
                <div className="flex gap-3">
                  <Button type="button" variant={empresa === 'ume_novo_mundo' ? 'default' : 'outline'} className="flex-1" onClick={() => setEmpresa('ume_novo_mundo')}>
                    UME | NOVO MUNDO
                  </Button>
                  <Button type="button" variant={empresa === 'mundo_da_moda' ? 'default' : 'outline'} className="flex-1" onClick={() => setEmpresa('mundo_da_moda')}>
                    MUNDO DA MODA
                  </Button>
                </div>
                {empresa === 'mundo_da_moda'}
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
                <Input id="valorTotal" placeholder="Digite o valor (ex: 2094,96)" value={form.valorTotal} onChange={e => handleCurrencyRealtime(e.target.value, 'valorTotal')} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parcelas">Número de Parcelas *</Label>
                <Input id="parcelas" type="text" inputMode="numeric" min="1" max="120" placeholder="1" value={form.parcelas} onChange={handleParcelasChange} required />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="valorPrimeiraParcela">
                    Valor da Primeira Parcela (R$) {parseInt(form.parcelas) !== 1 && '*'}
                  </Label>
                  <Input id="valorPrimeiraParcela" placeholder="Ex: 149,25" value={form.valorPrimeiraParcela} onChange={e => handleCurrencyWithCentsChange(e.target.value, 'valorPrimeiraParcela')} onBlur={() => handleCurrencyWithCentsBlur('valorPrimeiraParcela')} required={parseInt(form.parcelas) !== 1} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="valorDemaisParcelas">
                    Valor das Demais Parcelas (R$) {parseInt(form.parcelas) !== 1 && '*'}
                  </Label>
                  <Input id="valorDemaisParcelas" placeholder="Ex: 300,50" value={form.valorDemaisParcelas} onChange={e => handleCurrencyWithCentsChange(e.target.value, 'valorDemaisParcelas')} onBlur={() => handleCurrencyWithCentsBlur('valorDemaisParcelas')} required={parseInt(form.parcelas) !== 1} />
                </div>
              </div>

              {/* Alerta de validação da soma das parcelas */}
              {!validacaoSomaParcelas.valido && <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Valores não conferem</AlertTitle>
                  <AlertDescription>
                    A soma das parcelas ({formatarMoeda(validacaoSomaParcelas.somaParcelas)}) 
                    é diferente do valor total do acordo ({formatarMoeda(parseCurrency(form.valorTotal))}).
                    Diferença: {formatarMoeda(validacaoSomaParcelas.diferenca)}
                  </AlertDescription>
                </Alert>}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dataPrimeiroPagamento">Data do 1º Pagamento *</Label>
                  <Input id="dataPrimeiroPagamento" type="date" value={form.dataPrimeiroPagamento} onChange={e => setForm({
                  ...form,
                  dataPrimeiroPagamento: e.target.value
                })} required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="diasAtraso">Dias em Atraso *</Label>
                  <Input id="diasAtraso" type="number" min="0" placeholder="0" value={form.diasAtraso} onChange={e => setForm({
                  ...form,
                  diasAtraso: e.target.value
                })} required />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações (opcional)</Label>
                <Textarea id="observacoes" placeholder="Informações adicionais sobre o acordo..." value={form.observacoes} onChange={e => setForm({
                ...form,
                observacoes: e.target.value
              })} rows={3} />
              </div>
            </CardContent>
          </Card>

          {/* Preview do cálculo */}
          {calculo && <Card className="border-secondary/50 bg-secondary/5">
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
            </Card>}

          {/* Tabela de referência */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Tabela de Comissões - {empresa === 'ume_novo_mundo' ? 'UME | NOVO MUNDO' : 'MUNDO DA MODA'}
              </CardTitle>
              {empresa === 'mundo_da_moda' && <CardDescription>Comissão paga apenas sobre a 1ª parcela</CardDescription>}
            </CardHeader>
            <CardContent>
              <div className={`grid grid-cols-3 gap-2 text-center text-sm ${empresa === 'ume_novo_mundo' ? 'sm:grid-cols-6' : 'sm:grid-cols-5'}`}>
                {(empresa === 'ume_novo_mundo' ? tabelaComissoes : tabelaComissoesMundoDaModa).map(faixa => <div key={faixa.min} className={`p-2 rounded ${calculo && calculo.percentual === faixa.percentual ? 'bg-secondary text-secondary-foreground' : 'bg-muted'}`}>
                    <p className="text-xs text-muted-foreground">
                      {faixa.min}-{faixa.max === 9999 ? '+' : faixa.max}
                    </p>
                    <p className="font-bold">{faixa.percentual}%</p>
                  </div>)}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(-1)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={isLoading || !calculo || !isCpfCompleto(form.clienteCpf) || !isTelefoneCompleto(form.clienteTelefone) || parseInt(form.parcelas) > 1 && (!form.valorPrimeiraParcela || !form.valorDemaisParcelas) || !validacaoSomaParcelas.valido || !!cpfDuplicateError}>
              {isLoading ? 'Salvando...' : 'Criar Acordo'}
            </Button>
          </div>
            </form>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>;
}