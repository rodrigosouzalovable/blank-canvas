import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { DateRangePicker } from '@/components/DateRangePicker';
import { useToast } from '@/hooks/use-toast';
import { formatarMoeda, formatarData } from '@/lib/comissao';
import { calcularPercentualComissaoEmpresa } from '@/lib/comissao';
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Wallet, Building2, Users, DollarSign } from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';

const CATEGORIAS_EMPRESA = [
  'Aluguel',
  'Energia',
  'Água',
  'Sistema',
  'Impostos',
  'Material de Escritório',
  'Internet/Telefone',
  'Outros'
];

const CATEGORIAS_FUNCIONARIO = [
  'Salário',
  'Benefícios',
  'Equipamento',
  'Treinamento',
  'Vale Transporte',
  'Vale Alimentação',
  'Outros'
];

const CATEGORIAS_RECEITA = [
  'Serviços Extras',
  'Bonificação',
  'Rendimentos',
  'Recuperação de Crédito',
  'Parcerias',
  'Outros'
];

interface GastoEmpresa {
  id: string;
  user_id: string;
  categoria: string;
  descricao: string | null;
  valor: number;
  data_referencia: string;
  recorrente: boolean;
  criado_em: string;
}

interface GastoFuncionario {
  id: string;
  user_id: string;
  funcionario_id: string;
  categoria: string;
  descricao: string | null;
  valor: number;
  data_referencia: string;
  recorrente: boolean;
  criado_em: string;
  profiles?: {
    nome: string | null;
  };
}

interface Profile {
  id: string;
  nome: string | null;
  email: string | null;
}

interface ReceitaEmpresa {
  id: string;
  user_id: string;
  categoria: string;
  descricao: string | null;
  valor: number;
  data_referencia: string;
  recorrente: boolean;
  criado_em: string;
}

export default function Financeiro() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [dataInicio, setDataInicio] = useState<Date | undefined>(startOfMonth(new Date()));
  const [dataFim, setDataFim] = useState<Date | undefined>(endOfMonth(new Date()));
  
  // Dialog states
  const [dialogEmpresaOpen, setDialogEmpresaOpen] = useState(false);
  const [dialogFuncionarioOpen, setDialogFuncionarioOpen] = useState(false);
  const [editingGastoEmpresa, setEditingGastoEmpresa] = useState<GastoEmpresa | null>(null);
  const [editingGastoFuncionario, setEditingGastoFuncionario] = useState<GastoFuncionario | null>(null);
  
  // Form states - Empresa
  const [categoriaEmpresa, setCategoriaEmpresa] = useState('');
  const [descricaoEmpresa, setDescricaoEmpresa] = useState('');
  const [valorEmpresa, setValorEmpresa] = useState('');
  const [dataReferenciaEmpresa, setDataReferenciaEmpresa] = useState('');
  const [recorrenteEmpresa, setRecorrenteEmpresa] = useState(false);
  
  // Form states - Funcionário
  const [funcionarioSelecionado, setFuncionarioSelecionado] = useState('');
  const [categoriaFuncionario, setCategoriaFuncionario] = useState('');
  const [descricaoFuncionario, setDescricaoFuncionario] = useState('');
  const [valorFuncionario, setValorFuncionario] = useState('');
  const [dataReferenciaFuncionario, setDataReferenciaFuncionario] = useState('');
  const [recorrenteFuncionario, setRecorrenteFuncionario] = useState(false);
  
  // Filter for funcionário tab
  const [filtroFuncionario, setFiltroFuncionario] = useState('todos');

  // Dialog states - Receita
  const [dialogReceitaOpen, setDialogReceitaOpen] = useState(false);
  const [editingReceita, setEditingReceita] = useState<ReceitaEmpresa | null>(null);
  
  // Form states - Receita
  const [categoriaReceita, setCategoriaReceita] = useState('');
  const [descricaoReceita, setDescricaoReceita] = useState('');
  const [valorReceita, setValorReceita] = useState('');
  const [dataReferenciaReceita, setDataReferenciaReceita] = useState('');
  const [recorrenteReceita, setRecorrenteReceita] = useState(false);

  // Fetch profiles (funcionários)
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-financeiro'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, email')
        .order('nome');
      if (error) throw error;
      return data as Profile[];
    }
  });

  // Fetch gastos empresa
  const { data: gastosEmpresa = [] } = useQuery({
    queryKey: ['gastos-empresa', dataInicio, dataFim],
    queryFn: async () => {
      let query = supabase
        .from('gastos_empresa')
        .select('*')
        .order('data_referencia', { ascending: false });
      
      if (dataInicio) {
        query = query.gte('data_referencia', format(dataInicio, 'yyyy-MM-dd'));
      }
      if (dataFim) {
        query = query.lte('data_referencia', format(dataFim, 'yyyy-MM-dd'));
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as GastoEmpresa[];
    }
  });

  // Fetch gastos funcionários
  const { data: gastosFuncionarios = [] } = useQuery({
    queryKey: ['gastos-funcionarios', dataInicio, dataFim],
    queryFn: async () => {
      let query = supabase
        .from('gastos_funcionarios')
        .select('*, profiles(nome)')
        .order('data_referencia', { ascending: false });
      
      if (dataInicio) {
        query = query.gte('data_referencia', format(dataInicio, 'yyyy-MM-dd'));
      }
      if (dataFim) {
        query = query.lte('data_referencia', format(dataFim, 'yyyy-MM-dd'));
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as GastoFuncionario[];
    }
  });

  // Fetch pagamentos pagos (para calcular receita)
  const { data: pagamentosPagos = [] } = useQuery({
    queryKey: ['pagamentos-pagos-financeiro', dataInicio, dataFim],
    queryFn: async () => {
      let query = supabase
        .from('pagamentos')
        .select('*, acordos!inner(user_id, dias_atraso)')
        .eq('status', 'pago');
      
      if (dataInicio) {
        query = query.gte('data_paga', format(dataInicio, 'yyyy-MM-dd'));
      }
      if (dataFim) {
        query = query.lte('data_paga', format(dataFim, 'yyyy-MM-dd'));
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch receitas empresa
  const { data: receitasEmpresa = [] } = useQuery({
    queryKey: ['receitas-empresa', dataInicio, dataFim],
    queryFn: async () => {
      let query = supabase
        .from('receitas_empresa')
        .select('*')
        .order('data_referencia', { ascending: false });
      
      if (dataInicio) {
        query = query.gte('data_referencia', format(dataInicio, 'yyyy-MM-dd'));
      }
      if (dataFim) {
        query = query.lte('data_referencia', format(dataFim, 'yyyy-MM-dd'));
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as ReceitaEmpresa[];
    }
  });

  // Calculate totals
  const totalGastosEmpresa = useMemo(() => {
    return gastosEmpresa.reduce((acc, g) => acc + Number(g.valor), 0);
  }, [gastosEmpresa]);

  const totalGastosFuncionarios = useMemo(() => {
    return gastosFuncionarios.reduce((acc, g) => acc + Number(g.valor), 0);
  }, [gastosFuncionarios]);

  const totalGastos = totalGastosEmpresa + totalGastosFuncionarios;

  const totalReceitaComissao = useMemo(() => {
    return pagamentosPagos.reduce((acc, p) => {
      const diasAtraso = p.acordos?.dias_atraso || 0;
      const percentual = calcularPercentualComissaoEmpresa(diasAtraso);
      return acc + (Number(p.valor_parcela) * percentual / 100);
    }, 0);
  }, [pagamentosPagos]);

  const totalReceitasCadastradas = useMemo(() => {
    return receitasEmpresa.reduce((acc, r) => acc + Number(r.valor), 0);
  }, [receitasEmpresa]);

  const totalReceita = totalReceitaComissao + totalReceitasCadastradas;

  const lucroPrejuizo = totalReceita - totalGastos;

  // Analysis per funcionário
  const analisesPorFuncionario = useMemo(() => {
    return profiles.map(profile => {
      // Gastos do funcionário
      const gastos = gastosFuncionarios
        .filter(g => g.funcionario_id === profile.id)
        .reduce((acc, g) => acc + Number(g.valor), 0);
      
      // Receita do funcionário (comissão empresa das parcelas pagas)
      const receita = pagamentosPagos
        .filter(p => p.acordos?.user_id === profile.id)
        .reduce((acc, p) => {
          const diasAtraso = p.acordos?.dias_atraso || 0;
          const percentual = calcularPercentualComissaoEmpresa(diasAtraso);
          return acc + (Number(p.valor_parcela) * percentual / 100);
        }, 0);
      
      return {
        id: profile.id,
        nome: profile.nome || profile.email || 'Sem nome',
        gastos,
        receita,
        resultado: receita - gastos
      };
    }).filter(a => a.gastos > 0 || a.receita > 0);
  }, [profiles, gastosFuncionarios, pagamentosPagos]);

  // Filtered gastos funcionários
  const gastosFuncionariosFiltrados = useMemo(() => {
    if (filtroFuncionario === 'todos') return gastosFuncionarios;
    return gastosFuncionarios.filter(g => g.funcionario_id === filtroFuncionario);
  }, [gastosFuncionarios, filtroFuncionario]);

  // Mutations
  const addGastoEmpresaMutation = useMutation({
    mutationFn: async (gasto: Omit<GastoEmpresa, 'id' | 'criado_em'>) => {
      const { error } = await supabase.from('gastos_empresa').insert(gasto);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos-empresa'] });
      toast({ title: 'Gasto adicionado com sucesso!' });
      resetFormEmpresa();
      setDialogEmpresaOpen(false);
    },
    onError: () => {
      toast({ title: 'Erro ao adicionar gasto', variant: 'destructive' });
    }
  });

  const updateGastoEmpresaMutation = useMutation({
    mutationFn: async ({ id, ...gasto }: Partial<GastoEmpresa> & { id: string }) => {
      const { error } = await supabase.from('gastos_empresa').update(gasto).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos-empresa'] });
      toast({ title: 'Gasto atualizado com sucesso!' });
      resetFormEmpresa();
      setDialogEmpresaOpen(false);
      setEditingGastoEmpresa(null);
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar gasto', variant: 'destructive' });
    }
  });

  const deleteGastoEmpresaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastos_empresa').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos-empresa'] });
      toast({ title: 'Gasto excluído com sucesso!' });
    },
    onError: () => {
      toast({ title: 'Erro ao excluir gasto', variant: 'destructive' });
    }
  });

  const addGastoFuncionarioMutation = useMutation({
    mutationFn: async (gasto: Omit<GastoFuncionario, 'id' | 'criado_em' | 'profiles'>) => {
      const { error } = await supabase.from('gastos_funcionarios').insert(gasto);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos-funcionarios'] });
      toast({ title: 'Gasto adicionado com sucesso!' });
      resetFormFuncionario();
      setDialogFuncionarioOpen(false);
    },
    onError: () => {
      toast({ title: 'Erro ao adicionar gasto', variant: 'destructive' });
    }
  });

  const updateGastoFuncionarioMutation = useMutation({
    mutationFn: async ({ id, ...gasto }: Partial<GastoFuncionario> & { id: string }) => {
      const { error } = await supabase.from('gastos_funcionarios').update(gasto).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos-funcionarios'] });
      toast({ title: 'Gasto atualizado com sucesso!' });
      resetFormFuncionario();
      setDialogFuncionarioOpen(false);
      setEditingGastoFuncionario(null);
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar gasto', variant: 'destructive' });
    }
  });

  const deleteGastoFuncionarioMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastos_funcionarios').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gastos-funcionarios'] });
      toast({ title: 'Gasto excluído com sucesso!' });
    },
    onError: () => {
      toast({ title: 'Erro ao excluir gasto', variant: 'destructive' });
    }
  });

  // Receita mutations
  const addReceitaMutation = useMutation({
    mutationFn: async (receita: Omit<ReceitaEmpresa, 'id' | 'criado_em'>) => {
      const { error } = await supabase.from('receitas_empresa').insert(receita);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receitas-empresa'] });
      toast({ title: 'Receita adicionada com sucesso!' });
      resetFormReceita();
      setDialogReceitaOpen(false);
    },
    onError: () => {
      toast({ title: 'Erro ao adicionar receita', variant: 'destructive' });
    }
  });

  const updateReceitaMutation = useMutation({
    mutationFn: async ({ id, ...receita }: Partial<ReceitaEmpresa> & { id: string }) => {
      const { error } = await supabase.from('receitas_empresa').update(receita).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receitas-empresa'] });
      toast({ title: 'Receita atualizada com sucesso!' });
      resetFormReceita();
      setDialogReceitaOpen(false);
      setEditingReceita(null);
    },
    onError: () => {
      toast({ title: 'Erro ao atualizar receita', variant: 'destructive' });
    }
  });

  const deleteReceitaMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('receitas_empresa').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['receitas-empresa'] });
      toast({ title: 'Receita excluída com sucesso!' });
    },
    onError: () => {
      toast({ title: 'Erro ao excluir receita', variant: 'destructive' });
    }
  });

  // Form handlers
  const resetFormEmpresa = () => {
    setCategoriaEmpresa('');
    setDescricaoEmpresa('');
    setValorEmpresa('');
    setDataReferenciaEmpresa('');
    setRecorrenteEmpresa(false);
  };

  const resetFormFuncionario = () => {
    setFuncionarioSelecionado('');
    setCategoriaFuncionario('');
    setDescricaoFuncionario('');
    setValorFuncionario('');
    setDataReferenciaFuncionario('');
    setRecorrenteFuncionario(false);
  };

  const resetFormReceita = () => {
    setCategoriaReceita('');
    setDescricaoReceita('');
    setValorReceita('');
    setDataReferenciaReceita('');
    setRecorrenteReceita(false);
  };

  const openEditEmpresa = (gasto: GastoEmpresa) => {
    setEditingGastoEmpresa(gasto);
    setCategoriaEmpresa(gasto.categoria);
    setDescricaoEmpresa(gasto.descricao || '');
    setValorEmpresa(gasto.valor.toString());
    setDataReferenciaEmpresa(gasto.data_referencia);
    setRecorrenteEmpresa(gasto.recorrente);
    setDialogEmpresaOpen(true);
  };

  const openEditFuncionario = (gasto: GastoFuncionario) => {
    setEditingGastoFuncionario(gasto);
    setFuncionarioSelecionado(gasto.funcionario_id);
    setCategoriaFuncionario(gasto.categoria);
    setDescricaoFuncionario(gasto.descricao || '');
    setValorFuncionario(gasto.valor.toString());
    setDataReferenciaFuncionario(gasto.data_referencia);
    setRecorrenteFuncionario(gasto.recorrente);
    setDialogFuncionarioOpen(true);
  };

  const openEditReceita = (receita: ReceitaEmpresa) => {
    setEditingReceita(receita);
    setCategoriaReceita(receita.categoria);
    setDescricaoReceita(receita.descricao || '');
    setValorReceita(receita.valor.toString());
    setDataReferenciaReceita(receita.data_referencia);
    setRecorrenteReceita(receita.recorrente);
    setDialogReceitaOpen(true);
  };

  const handleSaveEmpresa = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const valor = parseFloat(valorEmpresa.replace(',', '.'));
    if (isNaN(valor) || !categoriaEmpresa || !dataReferenciaEmpresa) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }

    if (editingGastoEmpresa) {
      updateGastoEmpresaMutation.mutate({
        id: editingGastoEmpresa.id,
        categoria: categoriaEmpresa,
        descricao: descricaoEmpresa || null,
        valor,
        data_referencia: dataReferenciaEmpresa,
        recorrente: recorrenteEmpresa
      });
    } else {
      addGastoEmpresaMutation.mutate({
        user_id: user.id,
        categoria: categoriaEmpresa,
        descricao: descricaoEmpresa || null,
        valor,
        data_referencia: dataReferenciaEmpresa,
        recorrente: recorrenteEmpresa
      });
    }
  };

  const handleSaveFuncionario = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const valor = parseFloat(valorFuncionario.replace(',', '.'));
    if (isNaN(valor) || !categoriaFuncionario || !dataReferenciaFuncionario || !funcionarioSelecionado) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }

    if (editingGastoFuncionario) {
      updateGastoFuncionarioMutation.mutate({
        id: editingGastoFuncionario.id,
        funcionario_id: funcionarioSelecionado,
        categoria: categoriaFuncionario,
        descricao: descricaoFuncionario || null,
        valor,
        data_referencia: dataReferenciaFuncionario,
        recorrente: recorrenteFuncionario
      });
    } else {
      addGastoFuncionarioMutation.mutate({
        user_id: user.id,
        funcionario_id: funcionarioSelecionado,
        categoria: categoriaFuncionario,
        descricao: descricaoFuncionario || null,
        valor,
        data_referencia: dataReferenciaFuncionario,
        recorrente: recorrenteFuncionario
      });
    }
  };

  const handleSaveReceita = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const valor = parseFloat(valorReceita.replace(',', '.'));
    if (isNaN(valor) || !categoriaReceita || !dataReferenciaReceita) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }

    if (editingReceita) {
      updateReceitaMutation.mutate({
        id: editingReceita.id,
        categoria: categoriaReceita,
        descricao: descricaoReceita || null,
        valor,
        data_referencia: dataReferenciaReceita,
        recorrente: recorrenteReceita
      });
    } else {
      addReceitaMutation.mutate({
        user_id: user.id,
        categoria: categoriaReceita,
        descricao: descricaoReceita || null,
        valor,
        data_referencia: dataReferenciaReceita,
        recorrente: recorrenteReceita
      });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Wallet className="h-8 w-8" />
              Financeiro
            </h1>
            <p className="text-muted-foreground">Controle de gastos e análise de lucro/prejuízo</p>
          </div>
          <DateRangePicker
            startDate={dataInicio}
            endDate={dataFim}
            onStartDateChange={setDataInicio}
            onEndDateChange={setDataFim}
          />
        </div>

        <Tabs defaultValue="resumo" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="receitas">Receitas</TabsTrigger>
            <TabsTrigger value="empresa">Gastos Empresa</TabsTrigger>
            <TabsTrigger value="funcionarios">Gastos Funcionários</TabsTrigger>
            <TabsTrigger value="analise">Análise</TabsTrigger>
          </TabsList>

          {/* Tab Resumo */}
          <TabsContent value="resumo" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Gastos</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">{formatarMoeda(totalGastos)}</div>
                  <p className="text-xs text-muted-foreground">
                    Empresa: {formatarMoeda(totalGastosEmpresa)} | Funcionários: {formatarMoeda(totalGastosFuncionarios)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Receita</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{formatarMoeda(totalReceita)}</div>
                  <p className="text-xs text-muted-foreground">
                    Comissão: {formatarMoeda(totalReceitaComissao)} | Outras: {formatarMoeda(totalReceitasCadastradas)}
                  </p>
                </CardContent>
              </Card>

              <Card className={lucroPrejuizo >= 0 ? 'border-green-500' : 'border-destructive'}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {lucroPrejuizo >= 0 ? 'Lucro' : 'Prejuízo'}
                  </CardTitle>
                  {lucroPrejuizo >= 0 ? (
                    <TrendingUp className="h-4 w-4 text-green-600" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-destructive" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${lucroPrejuizo >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {formatarMoeda(Math.abs(lucroPrejuizo))}
                  </div>
                  <p className="text-xs text-muted-foreground">Receita - Gastos</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Margem</CardTitle>
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${lucroPrejuizo >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {totalReceita > 0 ? ((lucroPrejuizo / totalReceita) * 100).toFixed(1) : 0}%
                  </div>
                  <p className="text-xs text-muted-foreground">Lucro/Receita</p>
                </CardContent>
              </Card>
            </div>

            {/* Quick summary tables */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Gastos Empresa</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(
                      gastosEmpresa.reduce((acc, g) => {
                        acc[g.categoria] = (acc[g.categoria] || 0) + Number(g.valor);
                        return acc;
                      }, {} as Record<string, number>)
                    )
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([cat, valor]) => (
                        <div key={cat} className="flex justify-between items-center">
                          <span className="text-sm">{cat}</span>
                          <span className="font-medium">{formatarMoeda(valor)}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Top Gastos Funcionários</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(
                      gastosFuncionarios.reduce((acc, g) => {
                        const nome = g.profiles?.nome || 'Sem nome';
                        acc[nome] = (acc[nome] || 0) + Number(g.valor);
                        return acc;
                      }, {} as Record<string, number>)
                    )
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 5)
                      .map(([nome, valor]) => (
                        <div key={nome} className="flex justify-between items-center">
                          <span className="text-sm">{nome}</span>
                          <span className="font-medium">{formatarMoeda(valor)}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Tab Receitas */}
          <TabsContent value="receitas" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => { resetFormReceita(); setEditingReceita(null); setDialogReceitaOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Receita
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Data Ref.</TableHead>
                      <TableHead>Recorrente</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receitasEmpresa.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhuma receita cadastrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      receitasEmpresa.map((receita) => (
                        <TableRow key={receita.id}>
                          <TableCell className="font-medium">{receita.categoria}</TableCell>
                          <TableCell>{receita.descricao || '-'}</TableCell>
                          <TableCell className="text-green-600 font-medium">{formatarMoeda(receita.valor)}</TableCell>
                          <TableCell>{formatarData(receita.data_referencia)}</TableCell>
                          <TableCell>{receita.recorrente ? 'Sim' : 'Não'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" onClick={() => openEditReceita(receita)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteReceitaMutation.mutate(receita.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Gastos Empresa */}
          <TabsContent value="empresa" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => { resetFormEmpresa(); setEditingGastoEmpresa(null); setDialogEmpresaOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Gasto
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Data Ref.</TableHead>
                      <TableHead>Recorrente</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gastosEmpresa.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          Nenhum gasto cadastrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      gastosEmpresa.map((gasto) => (
                        <TableRow key={gasto.id}>
                          <TableCell className="font-medium">{gasto.categoria}</TableCell>
                          <TableCell>{gasto.descricao || '-'}</TableCell>
                          <TableCell>{formatarMoeda(gasto.valor)}</TableCell>
                          <TableCell>{formatarData(gasto.data_referencia)}</TableCell>
                          <TableCell>{gasto.recorrente ? 'Sim' : 'Não'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" onClick={() => openEditEmpresa(gasto)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteGastoEmpresaMutation.mutate(gasto.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Gastos Funcionários */}
          <TabsContent value="funcionarios" className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
              <Select value={filtroFuncionario} onValueChange={setFiltroFuncionario}>
                <SelectTrigger className="w-full sm:w-[250px]">
                  <SelectValue placeholder="Filtrar por funcionário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os funcionários</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={() => { resetFormFuncionario(); setEditingGastoFuncionario(null); setDialogFuncionarioOpen(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Gasto
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Funcionário</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Data Ref.</TableHead>
                      <TableHead>Recorrente</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gastosFuncionariosFiltrados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          Nenhum gasto cadastrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      gastosFuncionariosFiltrados.map((gasto) => (
                        <TableRow key={gasto.id}>
                          <TableCell className="font-medium">{gasto.profiles?.nome || 'Sem nome'}</TableCell>
                          <TableCell>{gasto.categoria}</TableCell>
                          <TableCell>{gasto.descricao || '-'}</TableCell>
                          <TableCell>{formatarMoeda(gasto.valor)}</TableCell>
                          <TableCell>{formatarData(gasto.data_referencia)}</TableCell>
                          <TableCell>{gasto.recorrente ? 'Sim' : 'Não'}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" onClick={() => openEditFuncionario(gasto)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => deleteGastoFuncionarioMutation.mutate(gasto.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Análise por Funcionário */}
          <TabsContent value="analise" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Análise de Lucro/Prejuízo por Funcionário
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Funcionário</TableHead>
                      <TableHead className="text-right">Gastos</TableHead>
                      <TableHead className="text-right">Receita Gerada</TableHead>
                      <TableHead className="text-right">Resultado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analisesPorFuncionario.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          Nenhum dado disponível para o período selecionado
                        </TableCell>
                      </TableRow>
                    ) : (
                      analisesPorFuncionario.map((analise) => (
                        <TableRow key={analise.id}>
                          <TableCell className="font-medium">{analise.nome}</TableCell>
                          <TableCell className="text-right text-destructive">{formatarMoeda(analise.gastos)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatarMoeda(analise.receita)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`font-bold ${analise.resultado >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                              {analise.resultado >= 0 ? '+' : ''}{formatarMoeda(analise.resultado)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Dialog Gasto Empresa */}
      <Dialog open={dialogEmpresaOpen} onOpenChange={setDialogEmpresaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGastoEmpresa ? 'Editar Gasto' : 'Novo Gasto da Empresa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={categoriaEmpresa} onValueChange={setCategoriaEmpresa}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_EMPRESA.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={descricaoEmpresa}
                onChange={(e) => setDescricaoEmpresa(e.target.value)}
                placeholder="Descrição do gasto"
              />
            </div>
            <div className="space-y-2">
              <Label>Valor *</Label>
              <Input
                value={valorEmpresa}
                onChange={(e) => setValorEmpresa(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Referência *</Label>
              <Input
                type="date"
                value={dataReferenciaEmpresa}
                onChange={(e) => setDataReferenciaEmpresa(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="recorrente-empresa"
                checked={recorrenteEmpresa}
                onCheckedChange={(checked) => setRecorrenteEmpresa(checked as boolean)}
              />
              <Label htmlFor="recorrente-empresa">Gasto recorrente (mensal)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogEmpresaOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEmpresa}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Gasto Funcionário */}
      <Dialog open={dialogFuncionarioOpen} onOpenChange={setDialogFuncionarioOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGastoFuncionario ? 'Editar Gasto' : 'Novo Gasto de Funcionário'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Funcionário *</Label>
              <Select value={funcionarioSelecionado} onValueChange={setFuncionarioSelecionado}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o funcionário" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.nome || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={categoriaFuncionario} onValueChange={setCategoriaFuncionario}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_FUNCIONARIO.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={descricaoFuncionario}
                onChange={(e) => setDescricaoFuncionario(e.target.value)}
                placeholder="Descrição do gasto"
              />
            </div>
            <div className="space-y-2">
              <Label>Valor *</Label>
              <Input
                value={valorFuncionario}
                onChange={(e) => setValorFuncionario(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Referência *</Label>
              <Input
                type="date"
                value={dataReferenciaFuncionario}
                onChange={(e) => setDataReferenciaFuncionario(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="recorrente-funcionario"
                checked={recorrenteFuncionario}
                onCheckedChange={(checked) => setRecorrenteFuncionario(checked as boolean)}
              />
              <Label htmlFor="recorrente-funcionario">Gasto recorrente (mensal)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogFuncionarioOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveFuncionario}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Receita */}
      <Dialog open={dialogReceitaOpen} onOpenChange={setDialogReceitaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingReceita ? 'Editar Receita' : 'Nova Receita'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={categoriaReceita} onValueChange={setCategoriaReceita}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_RECEITA.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={descricaoReceita}
                onChange={(e) => setDescricaoReceita(e.target.value)}
                placeholder="Descrição da receita"
              />
            </div>
            <div className="space-y-2">
              <Label>Valor *</Label>
              <Input
                value={valorReceita}
                onChange={(e) => setValorReceita(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Data de Referência *</Label>
              <Input
                type="date"
                value={dataReferenciaReceita}
                onChange={(e) => setDataReferenciaReceita(e.target.value)}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="recorrente-receita"
                checked={recorrenteReceita}
                onCheckedChange={(checked) => setRecorrenteReceita(checked as boolean)}
              />
              <Label htmlFor="recorrente-receita">Receita recorrente (mensal)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogReceitaOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveReceita}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
