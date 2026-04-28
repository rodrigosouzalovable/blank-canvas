import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { useUserRole } from '@/hooks/useUserRole';
import { format, addDays } from 'date-fns';

interface PaymentReminder {
  id: string;
  acordo_id?: string;
  numero_parcela?: number;
  data_prevista: string;
  valor_parcela?: number;
  cliente_nome: string;
  cliente_telefone?: string;
  observacao?: string;
  tipo: 'hoje' | 'tres_dias' | 'vencido';
  categoria: 'pagamento' | 'retorno';
}

// Filtra parcelas pendentes que possuem parcelas posteriores já pagas no mesmo acordo
async function filterParcelsWithLaterPaid(items: PaymentReminder[]): Promise<PaymentReminder[]> {
  if (items.length === 0) return items;

  const acordoIds = [...new Set(items.filter(i => i.acordo_id).map(i => i.acordo_id!))];
  if (acordoIds.length === 0) return items;

  const { data: pagas } = await supabase
    .from('pagamentos')
    .select('acordo_id, numero_parcela')
    .in('acordo_id', acordoIds)
    .eq('status', 'pago');

  if (!pagas || pagas.length === 0) return items;

  // Para cada acordo, encontrar a maior parcela paga
  const maxPagaPorAcordo: Record<string, number> = {};
  pagas.forEach(p => {
    const current = maxPagaPorAcordo[p.acordo_id] || 0;
    if (p.numero_parcela > current) maxPagaPorAcordo[p.acordo_id] = p.numero_parcela;
  });

  return items.filter(item => {
    if (!item.acordo_id || !item.numero_parcela) return true;
    const maxPaga = maxPagaPorAcordo[item.acordo_id];
    if (maxPaga && maxPaga > item.numero_parcela) return false;
    return true;
  });
}

export function usePaymentReminders() {
  const { user } = useAuth();
  const { acordosCompartilhados, concedidoPor } = useUserPermissions();
  const { isAdmin } = useUserRole();
  const queryClient = useQueryClient();

  // ID do admin cujos lembretes também devem ser exibidos
  const adminId = acordosCompartilhados && concedidoPor ? concedidoPor : null;
  const userIds = adminId ? [user?.id, adminId].filter(Boolean) as string[] : user ? [user.id] : [];

  // Buscar IDs de lembretes já lidos (próprios + admin compartilhado)
  const { data: lembretesLidos = [] } = useQuery({
    queryKey: ['lembretes-lidos', user?.id, adminId],
    queryFn: async () => {
      if (!user) return [];

      const hojeInicio = format(new Date(), 'yyyy-MM-dd') + 'T00:00:00';

      const { data, error } = await supabase
        .from('lembretes_lidos')
        .select('pagamento_id')
        .in('user_id', userIds)
        .gte('criado_em', hojeInicio);

      if (error) {
        console.error('Erro ao buscar lembretes lidos:', error);
        return [];
      }

      return data.map((l) => l.pagamento_id);
    },
    enabled: !!user,
    refetchInterval: 30 * 1000,
  });

  // Buscar pagamentos pendentes (hoje e 3 dias)
  const { data: pagamentos = [], isLoading: isLoadingPagamentos } = useQuery({
    queryKey: ['payment-reminders', user?.id, adminId, isAdmin],
    queryFn: async () => {
      if (!user) return [];
      if (!isAdmin && userIds.length === 0) return [];

      const hoje = format(new Date(), 'yyyy-MM-dd');
      const tresDias = format(addDays(new Date(), 3), 'yyyy-MM-dd');

      let query = supabase
        .from('pagamentos')
        .select(`
          id,
          acordo_id,
          numero_parcela,
          data_prevista,
          valor_parcela,
          acordos!inner(cliente_nome, cliente_telefone, user_id)
        `)
        .eq('status', 'pendente')
        .or(`data_prevista.eq.${hoje},data_prevista.eq.${tresDias}`);

      if (!isAdmin) {
        query = query.in('acordos.user_id', userIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar lembretes de pagamentos:', error);
        return [];
      }

      const items = (data || []).map((pagamento: any) => ({
        id: pagamento.id,
        acordo_id: pagamento.acordo_id,
        numero_parcela: pagamento.numero_parcela,
        data_prevista: pagamento.data_prevista,
        valor_parcela: pagamento.valor_parcela,
        cliente_nome: pagamento.acordos.cliente_nome,
        cliente_telefone: pagamento.acordos.cliente_telefone,
        tipo: pagamento.data_prevista === hoje ? 'hoje' : 'tres_dias',
        categoria: 'pagamento',
      })) as PaymentReminder[];

      return await filterParcelsWithLaterPaid(items);
    },
    enabled: !!user,
    refetchInterval: 30 * 1000,
  });

  // Buscar parcelas vencidas (data_prevista < hoje)
  const { data: parcelasVencidas = [], isLoading: isLoadingVencidas } = useQuery({
    queryKey: ['overdue-reminders', user?.id, adminId, isAdmin],
    queryFn: async () => {
      if (!user) return [];
      if (!isAdmin && userIds.length === 0) return [];

      const hoje = format(new Date(), 'yyyy-MM-dd');

      let query = supabase
        .from('pagamentos')
        .select(`
          id,
          acordo_id,
          numero_parcela,
          data_prevista,
          valor_parcela,
          acordos!inner(cliente_nome, cliente_telefone, user_id)
        `)
        .eq('status', 'pendente')
        .lt('data_prevista', hoje);

      if (!isAdmin) {
        query = query.in('acordos.user_id', userIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar parcelas vencidas:', error);
        return [];
      }

      const items = (data || []).map((pagamento: any) => ({
        id: pagamento.id,
        acordo_id: pagamento.acordo_id,
        numero_parcela: pagamento.numero_parcela,
        data_prevista: pagamento.data_prevista,
        valor_parcela: pagamento.valor_parcela,
        cliente_nome: pagamento.acordos.cliente_nome,
        cliente_telefone: pagamento.acordos.cliente_telefone,
        tipo: 'vencido',
        categoria: 'pagamento',
      })) as PaymentReminder[];

      return await filterParcelsWithLaterPaid(items);
    },
    enabled: !!user,
    refetchInterval: 30 * 1000,
  });

  // Buscar retornos pendentes
  const { data: retornos = [], isLoading: isLoadingRetornos } = useQuery({
    queryKey: ['retorno-reminders', user?.id, adminId, isAdmin],
    queryFn: async () => {
      if (!user) return [];
      if (!isAdmin && userIds.length === 0) return [];

      const hoje = format(new Date(), 'yyyy-MM-dd');
      const tresDias = format(addDays(new Date(), 3), 'yyyy-MM-dd');

      let query = supabase
        .from('retornos')
        .select('*')
        .eq('status', 'pendente')
        .or(`data_retorno.eq.${hoje},data_retorno.eq.${tresDias}`);

      if (!isAdmin) {
        query = query.in('user_id', userIds);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar lembretes de retornos:', error);
        return [];
      }

      return (data || []).map((retorno) => ({
        id: retorno.id,
        data_prevista: retorno.data_retorno,
        cliente_nome: retorno.cliente_nome,
        cliente_telefone: retorno.cliente_telefone,
        observacao: retorno.observacao,
        tipo: retorno.data_retorno === hoje ? 'hoje' : 'tres_dias',
        categoria: 'retorno',
      })) as PaymentReminder[];
    },
    enabled: !!user,
    refetchInterval: 30 * 1000,
  });

  const isLoading = isLoadingPagamentos || isLoadingRetornos || isLoadingVencidas;

  // Combinar pagamentos, retornos e parcelas vencidas
  const todosLembretes = [...pagamentos, ...retornos, ...parcelasVencidas];

  // Filtrar lembretes não lidos e lidos
  const lembretesNaoLidos = todosLembretes.filter(
    (r) => !lembretesLidos.includes(r.id)
  );
  const lembretesJaLidos = todosLembretes.filter(
    (r) => lembretesLidos.includes(r.id)
  );

  // Mutation para marcar como lido
  const marcarComoLido = useMutation({
    mutationFn: async (pagamentoId: string) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('lembretes_lidos')
        .insert({ user_id: user.id, pagamento_id: pagamentoId });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lembretes-lidos', user?.id, adminId] });
      queryClient.invalidateQueries({ queryKey: ['payment-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['retorno-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-reminders'] });
    },
    onError: (error) => {
      console.error('Erro ao marcar lembrete como visto:', error);
    },
  });

  // Mutation para desmarcar (mostrar novamente)
  const desmarcarLido = useMutation({
    mutationFn: async (pagamentoId: string) => {
      if (!user) throw new Error('Usuário não autenticado');

      const { error } = await supabase
        .from('lembretes_lidos')
        .delete()
        .eq('user_id', user.id)
        .eq('pagamento_id', pagamentoId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lembretes-lidos', user?.id, adminId] });
      queryClient.invalidateQueries({ queryKey: ['payment-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['retorno-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-reminders'] });
    },
    onError: (error) => {
      console.error('Erro ao desmarcar lembrete como visto:', error);
    },
  });

  const sortByDateDesc = (a: PaymentReminder, b: PaymentReminder) =>
    new Date(b.data_prevista).getTime() - new Date(a.data_prevista).getTime();

  const lembretesVencidos = lembretesNaoLidos.filter((r) => r.tipo === 'vencido').sort(sortByDateDesc);
  const lembretesHoje = lembretesNaoLidos.filter((r) => r.tipo === 'hoje').sort(sortByDateDesc);
  const lembretesTresDias = lembretesNaoLidos.filter((r) => r.tipo === 'tres_dias').sort(sortByDateDesc);

  return {
    reminders: lembretesNaoLidos,
    lembretesVencidos,
    lembretesHoje,
    lembretesTresDias,
    lembretesJaLidos,
    isLoading,
    temLembretes: lembretesNaoLidos.length > 0,
    marcarComoLido: marcarComoLido.mutate,
    desmarcarLido: desmarcarLido.mutate,
  };
}
