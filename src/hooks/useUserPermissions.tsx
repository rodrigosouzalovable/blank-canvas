import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';

export function useUserPermissions() {
  const { user } = useAuth();

  const { data: permissions, isLoading } = useQuery({
    queryKey: ['user-permissions', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  return {
    abasPermitidas: permissions?.abas_permitidas ?? null,
    credores: permissions?.credores ?? null,
    visivelRanking: permissions?.visivel_ranking ?? true,
    inboxCompartilhado: permissions?.inbox_compartilhado ?? false,
    acordosCompartilhados: permissions?.acordos_compartilhados ?? false,
    concedidoPor: permissions?.concedido_por ?? null,
    permiteCpfDuplicado: (permissions as any)?.permite_cpf_duplicado ?? false,
    isLoading,
  };
}
