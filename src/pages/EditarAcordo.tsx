import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { calcularComissao, calcularPercentualComissaoMundoDaModa, formatarMoeda, gerarParcelas, gerarParcelasMundoDaModa, tabelaComissoes, tabelaComissoesMundoDaModa } from '@/lib/comissao';
import { z } from 'zod';
import { ArrowLeft, Calculator, AlertTriangle } from 'lucide-react';

const acordoSchema = z.object({
  clienteNome: z.string().min(2, 'Nome do cliente é obrigatório').max(200, 'Nome muito longo'),
  clienteCpf: z.string().min(14, 'CPF incompleto').max(14, 'CPF inválido').refine((val) => val.replace(/\D/g, '').length === 11, { message: 'CPF deve ter 11 dígitos' }),
  clienteTelefone: z.string().max(15, 'Telefone inválido').optional(),
  valorTotal: z.number().positive('Valor deve ser maior que zero'),
  parcelas: z.number().int().positive().min(1, 'Mínimo 1 parcela').max(120, 'Máximo 120 parcelas'),
  dataPrimeiroPagamento: z.string().min(1, 'Data é obrigatória'),
  diasAtraso: z.number().int().min(0, 'Dias em atraso não pode ser negativo').max(9999),
  observacoes: z.string().max(1000, 'Observações muito longas').optional(),
});

const formatCpf = (value: string) => {
  const numbers = value.replace(/\D/g, '').slice(0, 11);
  return numbers
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const isCpfCompleto = (cpf: string): boolean => {
  const apenasNumeros = cpf.replace(/\D/g, '');
  return apenasNumeros.length === 11;
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

export default function EditarAcordo() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isAdmin, loading: loadingRole } = useUserRole();
  const { acordosCompartilhados, concedidoPor } = useUserPermissions();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [hasParcelasPagas, setHasParcelasPagas] = useState(false);
  const [cpfError, setCpfError] = useState('');
  
  const [empresa, setEmpresa] = useState<'ume_novo_mundo' | 'mundo_da_moda'>('ume_novo_mundo');
  
  const [form, setForm] = useState({
    clienteNome: '',
    clienteCpf: '',
    clienteTelefone: '',
    valorTotal: '',
    parcelas: '',
    dataPrimeiroPagamento: '',
    diasAtraso: '',
    observacoes: '',
  });

  // Carregar dados do acordo
  useEffect(() => {
    async function loadAcordo() {
      if (!user || !id || loadingRole) return;

      try {
        // Admin e usuários com acordos compartilhados podem editar, funcionário apenas os seus
        let query = supabase
          .from('acordos')
          .select('*')
          .eq('id', id);

        if (!isAdmin && !acordosCompartilhados) {
          query = query.eq('user_id', user.id);
        }

        const { data: acordo, error: acordoError } = await query.single();

        if (acordoError) throw acordoError;

        // Verificar se há parcelas pagas
        const { data: pagamentos, error: pagError } = await supabase
          .from('pagamentos')
          .select('status')
          .eq('acordo_id', id);

        if (pagError) throw pagError;

        const temPagas = pagamentos?.some(p => p.status === 'pago') || false;
        setHasParcelasPagas(temPagas);

        setEmpresa((acordo.empresa as 'ume_novo_mundo' | 'mundo_da_moda') || 'ume_novo_mundo');
        
        setForm({
          clienteNome: acordo.cliente_nome,
          clienteCpf: acordo.cliente_cpf || '',
          clienteTelefone: acordo.cliente_telefone || '',
          valorTotal: String(acordo.valor_total),
          parcelas: String(acordo.parcelas),
          dataPrimeiroPagamento: acordo.data_primeiro_pagamento,
          diasAtraso: String(acordo.dias_atraso),
          observacoes: acordo.observacoes || '',
        });
      } catch (error) {
        console.error('Erro ao carregar acordo:', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar acordo',
          description: 'Acordo não encontrado ou sem permissão.',
        });
        navigate('/acordos');
      } finally {
        setLoadingData(false);
      }
    }

    loadAcordo();
  }, [user, id, navigate, toast, isAdmin, loadingRole]);

  // Cálculo automático da comissão
  const calculo = useMemo(() => {
    const valorTotal = parseFloat(form.valorTotal) || 0;
    const parcelas = parseInt(form.parcelas) || 1;
    const diasAtraso = parseInt(form.diasAtraso) || 0;

    if (valorTotal > 0 && parcelas > 0 && diasAtraso >= 0) {
      return calcularComissao(valorTotal, parcelas, diasAtraso);
    }
    return null;
  }, [form.valorTotal, form.parcelas, form.diasAtraso]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !calculo || !id) return;
    
    setIsLoading(true);

    try {
      const validated = acordoSchema.parse({
        clienteNome: form.clienteNome.trim(),
        clienteCpf: form.clienteCpf.trim() || undefined,
        clienteTelefone: form.clienteTelefone.trim() || undefined,
        valorTotal: parseFloat(form.valorTotal),
        parcelas: parseInt(form.parcelas),
        dataPrimeiroPagamento: form.dataPrimeiroPagamento,
        diasAtraso: parseInt(form.diasAtraso),
        observacoes: form.observacoes.trim() || undefined,
      });

      // Atualizar acordo
      // Admin pode atualizar qualquer acordo
      let updateQuery = supabase
        .from('acordos')
        .update({
          cliente_nome: validated.clienteNome,
          cliente_cpf: validated.clienteCpf || null,
          cliente_telefone: validated.clienteTelefone || null,
          valor_total: validated.valorTotal,
          parcelas: validated.parcelas,
          valor_parcela: calculo.valorParcela,
          data_primeiro_pagamento: validated.dataPrimeiroPagamento,
          dias_atraso: validated.diasAtraso,
          percentual_comissao: calculo.percentual,
          comissao_total: calculo.comissaoTotal,
          observacoes: validated.observacoes || null,
        })
        .eq('id', id);

      if (!isAdmin && !acordosCompartilhados) {
        updateQuery = updateQuery.eq('user_id', user.id);
      }

      const { error: acordoError } = await updateQuery;

      if (acordoError) throw acordoError;

      // Admin pode regenerar parcelas mesmo com parcelas pagas (mantendo as pagas)
      // Funcionário só pode regenerar se não houver parcelas pagas
      if (!hasParcelasPagas || isAdmin) {
        // Deletar apenas parcelas pendentes
        const { error: deleteError } = await supabase
          .from('pagamentos')
          .delete()
          .eq('acordo_id', id)
          .eq('status', 'pendente');

        if (deleteError) throw deleteError;

        // Contar parcelas pagas para ajustar numeração
        const { data: parcelasPagas } = await supabase
          .from('pagamentos')
          .select('numero_parcela')
          .eq('acordo_id', id)
          .eq('status', 'pago');

        const quantidadePagas = parcelasPagas?.length || 0;
        const parcelasRestantes = validated.parcelas - quantidadePagas;

        if (parcelasRestantes > 0) {
          // Gerar apenas parcelas pendentes
          const novasParcelas = gerarParcelas(
            new Date(validated.dataPrimeiroPagamento),
            parcelasRestantes,
            calculo.valorParcela,
            calculo.comissaoPorParcela
          ).map((p, index) => ({
            ...p,
            numero_parcela: quantidadePagas + index + 1
          }));

          const { error: parcelasError } = await supabase
            .from('pagamentos')
            .insert(
              novasParcelas.map(p => ({
                acordo_id: id,
                numero_parcela: p.numero_parcela,
                data_prevista: p.data_prevista,
                valor_parcela: p.valor_parcela,
                comissao_parcela: p.comissao_parcela,
                status: p.status,
              }))
            );

          if (parcelasError) throw parcelasError;
        }
      }

      toast({
        title: 'Acordo atualizado!',
        description: `As alterações foram salvas com sucesso.`,
      });

      navigate(`/acordos/${id}`);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          variant: 'destructive',
          title: 'Dados inválidos',
          description: err.errors[0].message,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro ao atualizar acordo',
          description: 'Tente novamente mais tarde.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingData || loadingRole) {
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
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Editar Acordo</h1>
        </div>

        {hasParcelasPagas && !isAdmin && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Este acordo possui parcelas já pagas. Os campos financeiros (valor, parcelas, dias em atraso e data do 1º pagamento) não podem ser alterados.
            </AlertDescription>
          </Alert>
        )}

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
                  onChange={(e) => setForm({ ...form, clienteNome: e.target.value })}
                  required
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="clienteCpf">CPF *</Label>
                  <Input
                    id="clienteCpf"
                    placeholder="000.000.000-00"
                    value={form.clienteCpf}
                    onChange={(e) => {
                      const formatted = formatCpf(e.target.value);
                      setForm({ ...form, clienteCpf: formatted });
                      if (cpfError) setCpfError('');
                    }}
                    onBlur={() => {
                      if (form.clienteCpf && !isCpfCompleto(form.clienteCpf)) {
                        setCpfError('CPF deve ter 11 dígitos');
                      }
                    }}
                    maxLength={14}
                    required
                    className={cpfError ? 'border-destructive' : ''}
                  />
                  {cpfError && (
                    <p className="text-sm text-destructive">{cpfError}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clienteTelefone">Telefone</Label>
                  <Input
                    id="clienteTelefone"
                    placeholder="(00) 00000-0000"
                    value={form.clienteTelefone}
                    onChange={(e) => setForm({ ...form, clienteTelefone: formatPhone(e.target.value) })}
                    maxLength={15}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Dados do Acordo</CardTitle>
              <CardDescription>
                {hasParcelasPagas && !isAdmin
                  ? 'Campos financeiros bloqueados devido a parcelas pagas' 
                  : 'Edite as informações do acordo'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="valorTotal">Valor Total (R$) *</Label>
                  <Input
                    id="valorTotal"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0,00"
                    value={form.valorTotal}
                    onChange={(e) => setForm({ ...form, valorTotal: e.target.value })}
                    disabled={hasParcelasPagas && !isAdmin}
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
                    disabled={hasParcelasPagas && !isAdmin}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dataPrimeiroPagamento">Data do 1º Pagamento *</Label>
                  <Input
                    id="dataPrimeiroPagamento"
                    type="date"
                    value={form.dataPrimeiroPagamento}
                    onChange={(e) => setForm({ ...form, dataPrimeiroPagamento: e.target.value })}
                    disabled={hasParcelasPagas && !isAdmin}
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
                    disabled={hasParcelasPagas && !isAdmin}
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

          {/* Preview do cálculo */}
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
                    <p className="text-sm text-muted-foreground">Valor da Parcela</p>
                    <p className="text-lg font-semibold">{formatarMoeda(calculo.valorParcela)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Faixa de Atraso</p>
                    <p className="text-lg font-semibold">{calculo.percentual}%</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Comissão por Parcela</p>
                    <p className="text-lg font-semibold">{formatarMoeda(calculo.comissaoPorParcela)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Comissão Total</p>
                    <p className="text-xl font-bold text-secondary">{formatarMoeda(calculo.comissaoTotal)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabela de referência */}
          {(!hasParcelasPagas || isAdmin) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Tabela de Comissões</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-sm">
                  {tabelaComissoes.map((faixa) => (
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
          )}

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => navigate(-1)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isLoading || !calculo || !isCpfCompleto(form.clienteCpf)}
            >
              {isLoading ? 'Salvando...' : 'Salvar Alterações'}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
