import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface InstanceStats {
  id: string;
  nome: string | null;
  ativo: boolean;
  robo: boolean;
  apenas_lembretes: boolean;
  enviadas_hoje: number;
  ultimo_envio: string | null;
}

export function useMonitorEnvios(limiteDiario: number = 30, delaySegundos: number = 400) {
  const [instances, setInstances] = useState<InstanceStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    // Get today start in local timezone
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const hojeISO = hoje.toISOString();

    // Fetch only instances belonging to the current user
    const { data: instancias } = await supabase
      .from('user_whatsapp_instances')
      .select('id, nome, ativo, robo, apenas_lembretes')
      .eq('user_id', user.id)
      .order('ordem', { ascending: true });

    if (!instancias) {
      setLoading(false);
      return;
    }

    // Fetch today's outbound messages grouped by instance
    const { data: mensagens } = await (supabase as any)
      .from('whatsapp_mensagens')
      .select('instancia_id, timestamp_msg')
      .eq('direcao', 'saida')
      .gte('timestamp_msg', hojeISO)
      .order('timestamp_msg', { ascending: false });

    // Build stats map
    const statsMap = new Map<string, { count: number; ultimo: string | null }>();
    if (mensagens) {
      for (const msg of mensagens) {
        const current = statsMap.get(msg.instancia_id);
        if (!current) {
          statsMap.set(msg.instancia_id, { count: 1, ultimo: msg.timestamp_msg });
        } else {
          current.count++;
        }
      }
    }

    const result: InstanceStats[] = instancias.map((inst: any) => {
      const stats = statsMap.get(inst.id);
      return {
        id: inst.id,
        nome: inst.nome,
        ativo: inst.ativo,
        robo: inst.robo,
        apenas_lembretes: inst.apenas_lembretes,
        enviadas_hoje: stats?.count ?? 0,
        ultimo_envio: stats?.ultimo ?? null,
      };
    });

    setInstances(result);
    setLoading(false);
  }, []);

  // Toggle instance active state
  const toggleAtivo = useCallback(async (instanceId: string, novoAtivo: boolean) => {
    await supabase
      .from('user_whatsapp_instances')
      .update({ ativo: novoAtivo })
      .eq('id', instanceId);
    
    setInstances(prev =>
      prev.map(i => i.id === instanceId ? { ...i, ativo: novoAtivo } : i)
    );
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Computed totals
  const totalEnviadas = instances.reduce((sum, i) => sum + i.enviadas_hoje, 0);
  const totalAtivas = instances.filter(i => i.ativo).length;
  const totalCapacidade = totalAtivas * limiteDiario;
  const progresso = totalCapacidade > 0 ? Math.round((totalEnviadas / totalCapacidade) * 100) : 0;

  // Estimated completion: based on remaining messages and delay
  const calcTempoEstimado = () => {
    const restante = totalCapacidade - totalEnviadas;
    if (restante <= 0) return null;
    const ativasCount = instances.filter(i => i.ativo && i.enviadas_hoje < limiteDiario).length;
    if (ativasCount === 0) return null;
    const segundosRestantes = (restante / ativasCount) * delaySegundos;
    const conclusao = new Date(Date.now() + segundosRestantes * 1000);
    return conclusao.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return {
    instances,
    loading,
    totalEnviadas,
    totalAtivas,
    totalCapacidade,
    progresso,
    tempoEstimado: calcTempoEstimado(),
    toggleAtivo,
    refetch: fetchStats,
  };
}
