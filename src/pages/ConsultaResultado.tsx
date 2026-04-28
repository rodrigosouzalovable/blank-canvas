import { useEffect, useState } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ArrowLeft, MessageCircle, FileText, Phone, AlertCircle, CalendarIcon, Check, Shield, Lock, Clock, ChevronDown, TrendingDown, Sparkles } from 'lucide-react';
import DiscountTierSelector, { type DescontoFaixa, getDesconto, getMinParcelas, getMaxParcelasFaixa } from '@/components/negociacao/DiscountTierSelector';
import { getCredorConfig, isValidCredorSlug } from '@/lib/credorConfig';
import { calcularJurosAporte } from '@/lib/comissao';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Debito {
  id: string;
  nome: string;
  cpf: string;
  valor_original: number;
  valor_atualizado: number;
  descricao: string | null;
  contrato: string | null;
  data_vencimento: string | null;
  credor: string | null;
}

interface ParcelaAcordo {
  numero_parcela: number;
  valor_parcela: number;
  data_prevista: string;
  status: string;
  data_paga: string | null;
  total_parcelas: number;
  valor_total_acordo: number;
}

interface NegociacaoState {
  negociando: boolean;
  confirmado: boolean;
  entrada: number;
  parcelas: number;
  dataPrimeiroPagamento: Date | undefined;
  descontoFaixa: DescontoFaixa | undefined;
}

const VALOR_MINIMO_PARCELA = 90;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function formatCpfFull(cpf: string) {
  if (cpf.length !== 11) return cpf;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}

export default function ConsultaResultado() {
  const { cpf, creditor } = useParams<{ cpf: string; creditor: string }>();
  const [debitos, setDebitos] = useState<Debito[]>([]);
  const [loading, setLoading] = useState(true);
  const [nomeCliente, setNomeCliente] = useState('');
  const [cpfCliente, setCpfCliente] = useState('');
  const [mostrarTodosDebitos, setMostrarTodosDebitos] = useState(false);
  const [negociacao, setNegociacao] = useState<NegociacaoState | null>(null);
  const [acordoExistente, setAcordoExistente] = useState<{ status: string; criadoEm: string; funcionarioNome: string } | null>(null);
  const [parcelasAcordo, setParcelasAcordo] = useState<ParcelaAcordo[]>([]);

  const validCreditor = creditor && isValidCredorSlug(creditor);
  const config = validCreditor ? getCredorConfig(creditor)! : null;
  const PHONE = config?.phone ?? '';
  const PHONE_DISPLAY = config?.phoneDisplay ?? '';

  useEffect(() => {
    async function fetchDebitos() {
      if (!cpf) return;
      const [debitosResult, acordoResult] = await Promise.all([
        supabase.rpc('consultar_debitos_por_cpf', { p_cpf: cpf }),
        supabase.rpc('consultar_acordo_ativo_por_cpf', { p_cpf: cpf } as any),
      ]);
      
      if (!debitosResult.error && debitosResult.data && debitosResult.data.length > 0) {
        const typedData = debitosResult.data as Debito[];
        setDebitos(typedData);
        setNomeCliente(typedData[0].nome);
        setCpfCliente(typedData[0].cpf);

        // Notificar consulta via WhatsApp (fire-and-forget)
        supabase.functions.invoke('notify-cpf-consulta', {
          body: {
            cpf: typedData[0].cpf,
            nome: typedData[0].nome,
            credor: config?.nome || creditor,
            totalDebitos: typedData.length,
          },
        }).catch(() => {});
      }
      
      if (!acordoResult.error && acordoResult.data && (acordoResult.data as any[]).length > 0) {
        const acordo = (acordoResult.data as any[])[0];
        setAcordoExistente({
          status: acordo.acordo_status,
          criadoEm: acordo.acordo_criado_em,
          funcionarioNome: acordo.funcionario_nome,
        });

        // Fetch agreement installments
        if (acordo.acordo_status === 'ativo' || acordo.acordo_status === 'concluido') {
          const parcelasResult = await supabase.rpc('consultar_parcelas_acordo_por_cpf' as any, { p_cpf: cpf });
          if (!parcelasResult.error && parcelasResult.data && (parcelasResult.data as any[]).length > 0) {
            setParcelasAcordo(parcelasResult.data as ParcelaAcordo[]);
          }
        }
      }
      
      setLoading(false);
    }
    fetchDebitos();
  }, [cpf]);

  // Separate APORTE and INADIMPLENTES debts
  const debitosAporte = debitos.filter(d => (d.credor || '').toLowerCase().includes('aporte'));
  const debitosInadimplentes = debitos.filter(d => !(d.credor || '').toLowerCase().includes('aporte'));
  const hasAporte = debitosAporte.length > 0;
  const hasInadimplentes = debitosInadimplentes.length > 0;

  // Calculate effective value per debt (with interest for APORTE)
  const getValorEfetivo = (d: Debito) => {
    if (!(d.credor || '').toLowerCase().includes('aporte')) return d.valor_original;
    if (!d.data_vencimento) return d.valor_original;
    const vencimento = new Date(d.data_vencimento + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const diffMs = hoje.getTime() - vencimento.getTime();
    const diasAtraso = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    if (diasAtraso === 0) return d.valor_original;
    return calcularJurosAporte(d.valor_original, diasAtraso);
  };

  // Total for INADIMPLENTES (eligible for discount)
  const valorTotalInadimplentes = debitosInadimplentes.reduce((acc, d) => acc + d.valor_original, 0);
  // Total for APORTE (with interest, no discount)
  const valorTotalAporte = debitosAporte.reduce((acc, d) => acc + getValorEfetivo(d), 0);
  // Grand total
  const valorTotal = valorTotalInadimplentes + valorTotalAporte;
  const valorAvista = valorTotalInadimplentes * 0.5 + valorTotalAporte;

  const toggleNegociacao = () => {
    setNegociacao(prev =>
      prev?.negociando
        ? null
        : { negociando: true, confirmado: false, entrada: 0, parcelas: 1, dataPrimeiroPagamento: undefined, descontoFaixa: undefined }
    );
  };

  const updateNegociacao = (updates: Partial<NegociacaoState>) => {
    setNegociacao(prev => prev ? { ...prev, ...updates } : prev);
  };

  const getValorComDesconto = (neg: NegociacaoState) => {
    if (!neg.descontoFaixa) return valorTotal;
    const desconto = getDesconto(neg.descontoFaixa);
    // Discount applies only to INADIMPLENTES; APORTE pays full + interest
    return valorTotalInadimplentes * (1 - desconto / 100) + valorTotalAporte;
  };

  const getValorParcela = (neg: NegociacaoState) => {
    const valorDesc = getValorComDesconto(neg);
    const restante = valorDesc - (neg.entrada || 0);
    if (restante <= 0 || neg.parcelas < 1) return 0;
    return restante / neg.parcelas;
  };

  const getMaxParcelas = (neg: NegociacaoState) => {
    if (!neg.descontoFaixa) return 24;
    const maxPelaFaixa = getMaxParcelasFaixa(neg.descontoFaixa);
    const valorDesc = getValorComDesconto(neg);
    const restante = valorDesc - (neg.entrada || 0);
    const maxPeloValor = restante > 0 ? Math.floor(restante / VALOR_MINIMO_PARCELA) : 1;
    return Math.max(1, Math.min(maxPelaFaixa, maxPeloValor));
  };

  const isNegociacaoValida = (neg: NegociacaoState) => {
    if (!neg.descontoFaixa) return false;
    if (!neg.dataPrimeiroPagamento) return false;
    const valorDesc = getValorComDesconto(neg);
    if (neg.entrada > valorDesc) return false;
    if (neg.entrada < 0) return false;
    const valorParcela = getValorParcela(neg);
    if (valorParcela < VALOR_MINIMO_PARCELA && (valorDesc - (neg.entrada || 0)) > 0) return false;
    return true;
  };

  const handleSelectFaixa = (faixa: DescontoFaixa) => {
    const min = getMinParcelas(faixa);
    updateNegociacao({ descontoFaixa: faixa, parcelas: min, entrada: 0 });
  };

  const gerarWhatsappLink = (neg: NegociacaoState) => {
    const valorParcela = getValorParcela(neg);
    const valorDesc = getValorComDesconto(neg);
    const desconto = neg.descontoFaixa ? getDesconto(neg.descontoFaixa) : 0;
    const dataFormatada = neg.dataPrimeiroPagamento
      ? format(neg.dataPrimeiroPagamento, 'dd/MM/yyyy', { locale: ptBR })
      : '';
    const contratosStr = debitos.map(d => d.contrato).filter(Boolean).join(', ');
    const descontoStr = desconto > 0 ? `, com desconto de ${desconto}%, totalizando ${formatCurrency(valorDesc)}` : '';

    let msg: string;
    if (neg.descontoFaixa === 'avista') {
      msg = `Olá! Meu nome é ${nomeCliente}, meu CPF é ${cpfCliente} e quero negociar os contratos em aberto ${contratosStr}, no valor total de ${formatCurrency(valorTotal)}${descontoStr}. Quero pagar à vista no dia ${dataFormatada}. Me envie o boleto por gentileza.`;
    } else if (neg.entrada > 0) {
      msg = `Olá! Meu nome é ${nomeCliente}, meu CPF é ${cpfCliente} e quero negociar os contratos em aberto ${contratosStr}, no valor total de ${formatCurrency(valorTotal)}${descontoStr}, da seguinte forma: Entrada de ${formatCurrency(neg.entrada)} e mais ${neg.parcelas}x de ${formatCurrency(valorParcela)}. Quero pagar a primeira parcela no dia ${dataFormatada}. Me envie o boleto por gentileza.`;
    } else {
      msg = `Olá! Meu nome é ${nomeCliente}, meu CPF é ${cpfCliente} e quero negociar os contratos em aberto ${contratosStr}, no valor total de ${formatCurrency(valorTotal)}${descontoStr}, da seguinte forma: ${neg.parcelas}x de ${formatCurrency(valorParcela)}. Quero pagar a primeira parcela no dia ${dataFormatada}. Me envie o boleto por gentileza.`;
    }

    return `https://wa.me/${PHONE}?text=${encodeURIComponent(msg)}`;
  };

  const handleEntradaChange = (value: string) => {
    const num = parseFloat(value.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    updateNegociacao({ entrada: num });
  };

  const debitosVisiveis = mostrarTodosDebitos ? debitos : debitos.slice(0, 2);
  const debitosOcultos = debitos.length - 2;

  const isDebitoVencido = (d: Debito) => {
    if (!d.data_vencimento) return false;
    return new Date(d.data_vencimento + 'T00:00:00') < new Date();
  };

  if (!validCreditor || !config) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #001a33 0%, #003366 50%, #004080 100%)' }}>
      <header className="border-b px-4 py-3" style={{ borderColor: '#ffffff15' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.logos.negociacao ? (
              <img src={config.logos.negociacao} alt={config.nome} className="h-10 max-w-[160px] object-contain" />
            ) : (
              <span className="text-xl font-black" style={{ color: '#00a86b' }}>{config.nome.toUpperCase()}</span>
            )}
            <p className="text-sm" style={{ color: '#ffffffaa' }}>Portal de Negociação</p>
          </div>
          <a href={`https://wa.me/${PHONE}`} target="_blank" rel="noopener noreferrer" className="hidden sm:flex items-center gap-2 text-sm" style={{ color: '#00a86b' }}>
            <Phone className="h-4 w-4" />
            {PHONE_DISPLAY}
          </a>
        </div>
      </header>

      <main className="flex-1 px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Link to={`/${creditor}`} className="inline-flex items-center gap-2 text-sm mb-6 hover:underline" style={{ color: '#00a86b' }}>
            <ArrowLeft className="h-4 w-4" />
            Voltar à consulta
          </Link>

          {loading ? (
            <div className="text-center py-20">
              <div className="animate-spin h-8 w-8 border-2 rounded-full mx-auto mb-4" style={{ borderColor: '#00a86b', borderTopColor: 'transparent' }} />
              <p style={{ color: '#ffffffaa' }}>Consultando débitos...</p>
            </div>
          ) : debitos.length === 0 ? (
            <Card className="border-0 text-center" style={{ background: '#ffffff0d' }}>
              <CardContent className="p-12">
                <AlertCircle className="h-16 w-16 mx-auto mb-4" style={{ color: '#00a86b' }} />
                <h2 className="text-2xl font-bold mb-2" style={{ color: '#fff' }}>Nenhum débito encontrado</h2>
                <p className="mb-6" style={{ color: '#ffffffaa' }}>
                  Não encontramos débitos em aberto para o CPF informado.
                </p>
                <a href={`https://wa.me/${PHONE}`} target="_blank" rel="noopener noreferrer">
                  <Button style={{ background: '#00a86b', color: '#fff' }}>
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Falar no WhatsApp
                  </Button>
                </a>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Header persuasivo */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-full"
                    style={{
                      background: 'linear-gradient(135deg, #ff6b3d, #ff9a5c)',
                      color: '#fff',
                      animation: 'shimmer 2.5s ease-in-out infinite',
                      boxShadow: '0 2px 10px rgba(255, 107, 61, 0.3)',
                    }}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Oportunidade exclusiva
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full"
                    style={{ background: '#ffffff11', color: '#ffffffaa' }}
                  >
                    <Clock className="h-3 w-3" style={{ animation: 'float 2s ease-in-out infinite' }} />
                    Oferta por tempo limitado
                  </span>
              </div>

              {/* Banner de acordo existente */}
              {acordoExistente && acordoExistente.status === 'ativo' && (
                <div
                  className="rounded-xl p-5 mb-6"
                  style={{
                    background: 'linear-gradient(135deg, #1a3a1a 0%, #0d2b0d 100%)',
                    border: '2px solid #f59e0b66',
                    boxShadow: '0 4px 20px rgba(245, 158, 11, 0.15)',
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full flex items-center justify-center shrink-0" style={{ background: '#f59e0b22' }}>
                      <AlertCircle className="h-5 w-5" style={{ color: '#f59e0b' }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-bold mb-1" style={{ color: '#f59e0b' }}>
                        Você já possui uma negociação em andamento!
                      </h3>
                      <p className="text-sm mb-3" style={{ color: '#ffffffaa' }}>
                        Seu acordo está sendo acompanhado por nossa equipe. Entre em contato para mais detalhes sobre sua negociação.
                      </p>
                      <a
                        href={`https://wa.me/${PHONE}?text=${encodeURIComponent(
                          `Olá! Meu nome é ${nomeCliente}, CPF ${cpfCliente}, e gostaria de informações sobre meu acordo em andamento.`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button
                          className="h-10 rounded-lg text-sm font-semibold"
                          style={{ background: '#25D366', color: '#fff' }}
                        >
                          <MessageCircle className="h-4 w-4 mr-2" />
                          Falar no WhatsApp
                        </Button>
                      </a>
                    </div>
                  </div>
                </div>
              )}
                <h2 className="text-3xl font-black mb-1" style={{ color: '#fff' }}>
                  Olá, <span style={{ color: '#00ff88' }}>{nomeCliente}</span>!
                </h2>
                <p className="text-sm" style={{ color: '#ffffffaa' }}>
                  CPF: {formatCpfFull(cpfCliente)}
                </p>
              </div>

              {parcelasAcordo.length > 0 ? (
                /* === AGREEMENT INSTALLMENTS VIEW === */
                <>
                  <div className="mb-6">
                    <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, #00a86b15, #00cc8815)', border: '1px solid #00a86b33' }}>
                      <p className="text-sm font-semibold" style={{ color: '#00a86b' }}>
                        Seu acordo: {parcelasAcordo[0].total_parcelas}x de {formatCurrency(parcelasAcordo[0].valor_parcela)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 mb-6">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#ffffff66' }}>
                      Parcelas do acordo
                    </p>
                    {parcelasAcordo.map((parcela) => (
                      <Card key={parcela.numero_parcela} className="border-0" style={{ 
                        background: '#ffffff0a', 
                        borderLeft: parcela.status === 'pago' ? '3px solid #00a86b' : '3px solid #ffffff15' 
                      }}>
                        <CardContent className="p-4 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm" style={{ color: '#fff' }}>
                                Parcela {parcela.numero_parcela} de {parcela.total_parcelas}
                              </p>
                              {parcela.status === 'pago' ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: '#00a86b22', color: '#00a86b', border: '1px solid #00a86b44' }}>
                                  <Check className="h-3 w-3" />
                                  PAGO
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>
                                  PENDENTE
                                </span>
                              )}
                            </div>
                            <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: '#ffffffaa' }}>
                              <CalendarIcon className="h-3 w-3" />
                              {parcela.status === 'pago' && parcela.data_paga
                                ? `Pago em: ${format(new Date(parcela.data_paga + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}`
                                : `Vencimento: ${format(new Date(parcela.data_prevista + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}`
                              }
                            </p>
                          </div>
                          <p className="text-lg font-black" style={{ color: parcela.status === 'pago' ? '#00a86b' : '#fff' }}>
                            {formatCurrency(parcela.valor_parcela)}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {(() => {
                    const parcelasPendentes = parcelasAcordo.filter(p => p.status !== 'pago');
                    const saldoRestante = parcelasPendentes.reduce((acc, p) => acc + p.valor_parcela, 0);
                    const parcelasPagas = parcelasAcordo.filter(p => p.status === 'pago').length;
                    return (
                      <Card className="border-0 overflow-hidden mb-6" style={{ background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 100%)', border: '1px solid #ffffff10' }}>
                        <CardContent className="p-6">
                          {parcelasPagas > 0 && (
                            <div className="flex items-center gap-2 mb-3">
                              <Check className="h-4 w-4" style={{ color: '#00a86b' }} />
                              <p className="text-sm" style={{ color: '#00a86b' }}>
                                {parcelasPagas} parcela{parcelasPagas > 1 ? 's' : ''} paga{parcelasPagas > 1 ? 's' : ''}
                              </p>
                            </div>
                          )}
                          <p className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: '#ffffff55' }}>
                            Saldo restante
                          </p>
                          <p className="text-3xl font-black" style={{ color: parcelasPendentes.length === 0 ? '#00a86b' : '#fff' }}>
                            {formatCurrency(saldoRestante)}
                          </p>
                          <p className="text-xs mt-1" style={{ color: '#ffffffaa' }}>
                            {parcelasPendentes.length} parcela{parcelasPendentes.length !== 1 ? 's' : ''} pendente{parcelasPendentes.length !== 1 ? 's' : ''}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  <a
                    href={`https://wa.me/${PHONE}?text=${encodeURIComponent(
                      `Olá! Meu nome é ${nomeCliente}, CPF ${cpfCliente}, e gostaria de informações sobre meu acordo em andamento.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      className="w-full h-14 text-base font-bold rounded-xl"
                      style={{
                        background: 'linear-gradient(135deg, #25d366, #128c7e)',
                        color: '#fff',
                        boxShadow: '0 4px 20px rgba(37, 211, 102, 0.4)',
                      }}
                    >
                      <MessageCircle className="h-5 w-5 mr-2" />
                      Falar no WhatsApp
                    </Button>
                  </a>
                </>
              ) : (
                /* === ORIGINAL DEBTS VIEW === */
                <>
                  <p className="mt-2 text-base mb-6" style={{ color: '#ffffffcc' }}>
                    Aproveite esta oportunidade única para regularizar sua situação com <strong style={{ color: '#00a86b' }}>até 50% de desconto</strong>!
                  </p>

                  {/* Cards de débito colapsáveis */}
                  <div className="space-y-2 mb-6">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#ffffff66' }}>
                      {debitos.length} débito{debitos.length > 1 ? 's' : ''} em aberto
                    </p>
                    {debitosVisiveis.map((debito, index) => {
                      const isAporte = (debito.credor || '').toLowerCase().includes('aporte');
                      const valorEfetivo = getValorEfetivo(debito);
                      const temJuros = isAporte && valorEfetivo > debito.valor_original;
                      return (
                      <Card key={debito.id} className="border-0" style={{ background: '#ffffff0a', borderLeft: isDebitoVencido(debito) ? '3px solid #ff6b6b' : isAporte ? '3px solid #f59e0b' : '3px solid #ffffff15' }}>
                        <CardContent className="p-4 flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm" style={{ color: '#fff' }}>
                                Parcela {index + 1} de {debitos.length}
                              </p>
                              {isAporte && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>
                                  APORTE
                                </span>
                              )}
                              {isDebitoVencido(debito) && !isAporte && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#ff6b6b22', color: '#ff6b6b', border: '1px solid #ff6b6b44' }}>
                                  VENCIDO
                                </span>
                              )}
                            </div>
                            {debito.contrato && (
                              <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: '#ffffffaa' }}>
                                <FileText className="h-3 w-3" />
                                Contrato: {debito.contrato}
                              </p>
                            )}
                            {debito.data_vencimento && (
                              <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: '#ffffffaa' }}>
                                <CalendarIcon className="h-3 w-3" />
                                Vencimento: {format(new Date(debito.data_vencimento + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black" style={{ color: isAporte ? '#f59e0b' : '#ff6b6b' }}>
                              {formatCurrency(valorEfetivo)}
                            </p>
                            {temJuros && (
                              <p className="text-[10px]" style={{ color: '#ffffff66' }}>
                                Original: {formatCurrency(debito.valor_original)}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                      );
                    })}
                    {debitos.length > 2 && !mostrarTodosDebitos && (
                      <button
                        onClick={() => setMostrarTodosDebitos(true)}
                        className="w-full flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-colors"
                        style={{ color: '#00a86b', background: '#00a86b11' }}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                        Ver mais {debitosOcultos} débito{debitosOcultos > 1 ? 's' : ''}
                      </button>
                    )}
                  </div>

                  {/* Card de valor total premium */}
                  <Card className="border-0 overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 100%)', border: '1px solid #ffffff10' }}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-xs uppercase tracking-wider font-semibold" style={{ color: '#ffffff55' }}>
                        Valor total dos débitos
                      </CardTitle>
                      <p className="text-4xl font-black" style={{ color: '#ff6b6b' }}>
                        {formatCurrency(valorTotal)}
                      </p>

                      {/* Destaque à vista */}
                      <div className="rounded-xl p-4 mt-3" style={{ background: 'linear-gradient(135deg, #00a86b15, #00cc8815)', border: '1px solid #00a86b33' }}>
                        <p className="text-sm mb-1" style={{ color: '#ffffffaa' }}>
                          Mas você pode pagar à vista por apenas:
                        </p>
                        <p className="text-3xl font-black" style={{ color: '#00ff88', animation: 'float 4s ease-in-out infinite' }}>
                          {formatCurrency(valorAvista)}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <TrendingDown className="h-4 w-4" style={{ color: '#00a86b' }} />
                          <span className="text-sm font-bold" style={{ color: '#00a86b' }}>
                            Economize {formatCurrency(valorTotal - valorAvista)}
                          </span>
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1"
                            style={{ background: '#00a86b22', color: '#00a86b', border: '1px solid #00a86b44' }}
                          >
                            50% OFF
                          </span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      {!negociacao?.negociando ? (
                        <Button
                          className="w-full h-14 text-base font-bold rounded-xl"
                          style={{
                            background: acordoExistente?.status === 'ativo'
                              ? '#ffffff15'
                              : 'linear-gradient(135deg, #00a86b, #00cc88)',
                            color: '#fff',
                            boxShadow: acordoExistente?.status === 'ativo' ? 'none' : '0 4px 20px rgba(0, 168, 107, 0.4)',
                            animation: acordoExistente?.status === 'ativo' ? 'none' : 'pulse-border 2s ease-in-out infinite',
                            cursor: acordoExistente?.status === 'ativo' ? 'not-allowed' : 'pointer',
                            opacity: acordoExistente?.status === 'ativo' ? 0.5 : 1,
                          }}
                          onClick={toggleNegociacao}
                          disabled={acordoExistente?.status === 'ativo'}
                        >
                          <MessageCircle className="h-5 w-5 mr-2" />
                          {acordoExistente?.status === 'ativo' ? 'NEGOCIAÇÃO EM ANDAMENTO' : 'NEGOCIAR AGORA COM DESCONTO'}
                        </Button>
                      ) : !negociacao.confirmado ? (
                        <div className="space-y-5 pt-4" style={{ borderTop: '1px solid #ffffff15' }}>
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-base flex items-center gap-2" style={{ color: '#00a86b' }}>
                              <Sparkles className="h-4 w-4" />
                              Monte sua proposta
                            </h3>
                            <button onClick={toggleNegociacao} className="text-xs hover:underline" style={{ color: '#ffffff55' }}>
                              Cancelar
                            </button>
                          </div>

                          <DiscountTierSelector
                            selected={negociacao.descontoFaixa}
                            onSelect={handleSelectFaixa}
                            valorTotal={valorTotal}
                          />

                          {negociacao.descontoFaixa && (
                            <>
                          {(
                                <div
                                  className="rounded-xl p-5 text-center"
                                  style={{
                                    background: 'linear-gradient(135deg, #00a86b15, #00cc8815)',
                                    border: '1px solid #00a86b44',
                                    boxShadow: '0 0 30px rgba(0, 168, 107, 0.1)',
                                  }}
                                >
                                  <p className="text-xs mb-1" style={{ color: '#ffffffaa' }}>
                                    De <span style={{ textDecoration: 'line-through', color: '#ff6b6b' }}>{formatCurrency(valorTotal)}</span> por
                                  </p>
                                  <p className="text-4xl font-black" style={{ color: '#00ff88' }}>
                                    {formatCurrency(getValorComDesconto(negociacao))}
                                  </p>
                                  <div className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full" style={{ background: '#00a86b22', border: '1px solid #00a86b44' }}>
                                    <TrendingDown className="h-3.5 w-3.5" style={{ color: '#00a86b' }} />
                                    <p className="text-xs font-bold" style={{ color: '#00a86b' }}>
                                      Você economiza {formatCurrency(valorTotal - getValorComDesconto(negociacao))} ({getDesconto(negociacao.descontoFaixa)}%)
                                    </p>
                                  </div>
                                </div>
                              )}

                              {negociacao.descontoFaixa !== 'avista' && (
                                <div>
                                  <Label className="text-xs font-semibold" style={{ color: '#ffffffaa' }}>Valor de entrada (opcional)</Label>
                                  <Input
                                    type="number"
                                    min={0}
                                    max={getValorComDesconto(negociacao)}
                                    step={0.01}
                                    placeholder="R$ 0,00"
                                    value={negociacao.entrada || ''}
                                    onChange={(e) => handleEntradaChange(e.target.value)}
                                    className="mt-1 border-0 h-12 rounded-xl text-base"
                                    style={{ background: '#ffffff12', color: '#fff' }}
                                  />
                                  {negociacao.entrada > getValorComDesconto(negociacao) && (
                                    <p className="text-xs mt-1" style={{ color: '#ff6b6b' }}>Entrada não pode ser maior que o valor com desconto</p>
                                  )}
                                </div>
                              )}

                              {negociacao.descontoFaixa !== 'avista' && (
                                <div>
                                  <Label className="text-xs font-semibold" style={{ color: '#ffffffaa' }}>Número de parcelas</Label>
                                  <Select
                                    value={String(negociacao.parcelas)}
                                    onValueChange={(v) => updateNegociacao({ parcelas: parseInt(v) })}
                                  >
                                    <SelectTrigger className="mt-1 border-0 h-12 rounded-xl text-base" style={{ background: '#ffffff12', color: '#fff' }}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Array.from(
                                        { length: getMaxParcelas(negociacao) - getMinParcelas(negociacao.descontoFaixa) + 1 },
                                        (_, i) => i + getMinParcelas(negociacao.descontoFaixa)
                                      ).map(n => (
                                        <SelectItem key={n} value={String(n)}>
                                          {n}x de {formatCurrency((getValorComDesconto(negociacao) - (negociacao.entrada || 0)) / n)}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}

                              <div>
                                <Label className="text-xs font-semibold" style={{ color: '#ffffffaa' }}>{negociacao.descontoFaixa === 'avista' ? 'Data do pagamento' : 'Data do primeiro pagamento'}</Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className={cn("w-full mt-1 justify-start text-left font-normal border-0 h-12 rounded-xl text-base", !negociacao.dataPrimeiroPagamento && "opacity-70")}
                                      style={{ background: '#ffffff12', color: '#fff' }}
                                    >
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      {negociacao.dataPrimeiroPagamento
                                        ? format(negociacao.dataPrimeiroPagamento, 'dd/MM/yyyy', { locale: ptBR })
                                        : 'Selecione a data'}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={negociacao.dataPrimeiroPagamento}
                                      onSelect={(d) => updateNegociacao({ dataPrimeiroPagamento: d })}
                                      disabled={(date) => {
                                        const today = new Date();
                                        today.setHours(0, 0, 0, 0);
                                        return date < today;
                                      }}
                                      initialFocus
                                      className={cn("p-3 pointer-events-auto")}
                                      locale={ptBR}
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>

                              {negociacao.dataPrimeiroPagamento && negociacao.entrada <= getValorComDesconto(negociacao) && (
                                <div
                                  className="rounded-xl p-4"
                                  style={{
                                    background: 'linear-gradient(135deg, #00a86b08, #00cc8808)',
                                    border: '1px solid #00a86b33',
                                    boxShadow: '0 0 20px rgba(0, 168, 107, 0.05)',
                                  }}
                                >
                                  <p className="text-sm font-bold mb-3 flex items-center gap-2" style={{ color: '#00a86b' }}>
                                    <Check className="h-4 w-4" />
                                    Resumo da negociação
                                  </p>
                              <p className="text-sm mb-1" style={{ color: '#ffffffcc' }}>
                                      Desconto: {getDesconto(negociacao.descontoFaixa)}% — <span style={{ textDecoration: 'line-through', color: '#ff6b6b' }}>{formatCurrency(valorTotal)}</span> → <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{formatCurrency(getValorComDesconto(negociacao))}</span>
                                    </p>
                                  {negociacao.entrada > 0 && (
                                    <p className="text-sm mb-1" style={{ color: '#ffffffcc' }}>Entrada: {formatCurrency(negociacao.entrada)}</p>
                                  )}
                                  <p className="text-sm mb-1" style={{ color: '#ffffffcc' }}>
                                    {negociacao.parcelas}x de <strong style={{ color: '#00ff88' }}>{formatCurrency(getValorParcela(negociacao))}</strong>
                                  </p>
                                  <p className="text-sm" style={{ color: '#ffffffcc' }}>
                                    Primeiro pagamento: {format(negociacao.dataPrimeiroPagamento, 'dd/MM/yyyy', { locale: ptBR })}
                                  </p>
                                </div>
                              )}

                              <Button
                                className="w-full h-14 text-base font-bold rounded-xl"
                                style={{
                                  background: isNegociacaoValida(negociacao)
                                    ? 'linear-gradient(135deg, #00a86b, #00cc88)'
                                    : '#ffffff15',
                                  color: '#fff',
                                  boxShadow: isNegociacaoValida(negociacao) ? '0 4px 20px rgba(0, 168, 107, 0.4)' : 'none',
                                  animation: isNegociacaoValida(negociacao) ? 'pulse-border 2s ease-in-out infinite' : 'none',
                                }}
                                disabled={!isNegociacaoValida(negociacao)}
                                onClick={() => updateNegociacao({ confirmado: true })}
                              >
                                <Check className="h-5 w-5 mr-2" />
                                CONFIRMAR PROPOSTA
                              </Button>

                              <a
                                href={`https://wa.me/${PHONE}?text=${encodeURIComponent(
                                  `Olá! Meu nome é ${nomeCliente}, CPF ${cpfCliente}, e gostaria de fazer uma contra proposta para os contratos ${debitos.map(d => d.contrato).filter(Boolean).join(', ')}.`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <Button
                                  variant="outline"
                                  className="w-full h-12 rounded-xl text-sm"
                                  style={{ borderColor: '#ffffff22', color: '#ffffffaa', background: '#ffffff05' }}
                                >
                                  <MessageCircle className="h-4 w-4 mr-2" />
                                  TENHO UMA CONTRA PROPOSTA
                                </Button>
                              </a>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-4 pt-4" style={{ borderTop: '1px solid #ffffff15' }}>
                          <div
                            className="rounded-xl p-5 text-center"
                            style={{
                              background: 'linear-gradient(135deg, #00a86b15, #00cc8815)',
                              border: '1px solid #00a86b44',
                            }}
                          >
                            <div
                              className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center"
                              style={{ background: '#00a86b', boxShadow: '0 0 30px rgba(0, 168, 107, 0.4)' }}
                            >
                              <Check className="h-8 w-8" style={{ color: '#fff' }} />
                            </div>
                            <p className="text-lg font-bold mb-3" style={{ color: '#00ff88' }}>✓ Proposta confirmada!</p>
                            {negociacao.descontoFaixa && (
                              <p className="text-sm mb-1" style={{ color: '#ffffffcc' }}>
                                Desconto: {getDesconto(negociacao.descontoFaixa)}% — <span style={{ textDecoration: 'line-through', color: '#ff6b6b' }}>{formatCurrency(valorTotal)}</span> → <span style={{ color: '#00ff88', fontWeight: 'bold' }}>{formatCurrency(getValorComDesconto(negociacao))}</span>
                              </p>
                            )}
                            {negociacao.entrada > 0 && (
                              <p className="text-sm mb-1" style={{ color: '#ffffffcc' }}>Entrada: {formatCurrency(negociacao.entrada)}</p>
                            )}
                            <p className="text-sm mb-1" style={{ color: '#ffffffcc' }}>
                              {negociacao.parcelas}x de <strong style={{ color: '#00ff88' }}>{formatCurrency(getValorParcela(negociacao))}</strong>
                            </p>
                            <p className="text-sm" style={{ color: '#ffffffcc' }}>
                              Primeiro pagamento: {format(negociacao.dataPrimeiroPagamento!, 'dd/MM/yyyy', { locale: ptBR })}
                            </p>
                          </div>
                          <a href={gerarWhatsappLink(negociacao)} target="_blank" rel="noopener noreferrer" className="block">
                            <Button
                              className="w-full h-14 text-base font-bold rounded-xl"
                              style={{
                                background: 'linear-gradient(135deg, #25d366, #128c7e)',
                                color: '#fff',
                                boxShadow: '0 4px 20px rgba(37, 211, 102, 0.4)',
                                animation: 'pulse-border 2s ease-in-out infinite',
                              }}
                            >
                              <MessageCircle className="h-5 w-5 mr-2" />
                              ENVIAR PROPOSTA PELO WHATSAPP
                            </Button>
                          </a>
                          <button onClick={() => updateNegociacao({ confirmado: false })} className="w-full text-xs text-center hover:underline" style={{ color: '#ffffff55' }}>
                            Alterar proposta
                          </button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      </main>

      {/* Footer com selos de confiança */}
      <footer className="border-t px-4 py-8" style={{ borderColor: '#ffffff10', background: '#00000044' }}>
        <div className="max-w-5xl mx-auto text-center space-y-4">
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <div className="flex items-center gap-1.5" style={{ color: '#ffffff44' }}>
              <Shield className="h-4 w-4" />
              <span className="text-xs">Negociação Segura</span>
            </div>
            <div className="flex items-center gap-1.5" style={{ color: '#ffffff44' }}>
              <Lock className="h-4 w-4" />
              <span className="text-xs">Dados Protegidos</span>
            </div>
            <div className="flex items-center gap-1.5" style={{ color: '#ffffff44' }}>
              <Shield className="h-4 w-4" />
              <span className="text-xs">LGPD Compliance</span>
            </div>
          </div>
          <p className="text-[10px]" style={{ color: '#ffffff33' }}>
            Suas informações são tratadas com total sigilo e segurança conforme a Lei Geral de Proteção de Dados (LGPD).
          </p>
          <p className="text-xs" style={{ color: '#ffffff44' }}>
            © {new Date().getFullYear()} {config.copyrightTexto} — Todos os direitos reservados
          </p>
        </div>
      </footer>
    </div>
  );
}
