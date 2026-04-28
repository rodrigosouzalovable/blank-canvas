import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, BellOff, Check, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

interface Notificacao {
  id: string;
  tipo: string;
  mensagem: string;
  lida: boolean;
  criado_em: string;
  instancia_id: string | null;
}

export default function AquecimentoNotificacoes() {
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    loadNotificacoes();
  }, []);

  async function loadNotificacoes() {
    setLoading(true);
    const { data } = await supabase
      .from('aquecimento_notificacoes' as any)
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(50);
    setNotificacoes((data as any[]) || []);
    setLoading(false);
  }

  async function marcarLida(id: string) {
    await supabase.from('aquecimento_notificacoes' as any).update({ lida: true } as any).eq('id', id);
    setNotificacoes(prev => prev.map(n => n.id === id ? { ...n, lida: true } : n));
  }

  async function marcarTodasLidas() {
    const naoLidas = notificacoes.filter(n => !n.lida).map(n => n.id);
    if (naoLidas.length === 0) return;
    for (const id of naoLidas) {
      await supabase.from('aquecimento_notificacoes' as any).update({ lida: true } as any).eq('id', id);
    }
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })));
  }

  async function limparLidas() {
    const lidas = notificacoes.filter(n => n.lida).map(n => n.id);
    for (const id of lidas) {
      await supabase.from('aquecimento_notificacoes' as any).delete().eq('id', id);
    }
    setNotificacoes(prev => prev.filter(n => !n.lida));
  }

  const naoLidas = notificacoes.filter(n => !n.lida).length;
  const displayed = showAll ? notificacoes : notificacoes.slice(0, 10);

  const tipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'novo_numero': return '🔌';
      case 'mudanca_fase': return '📈';
      case 'aquecido': return '✅';
      case 'risco_bloqueio': return '⚠️';
      case 'meta_atingida': return '🎯';
      default: return '🔔';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Notificações
            {naoLidas > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{naoLidas}</Badge>
            )}
          </CardTitle>
          <div className="flex gap-1">
            {naoLidas > 0 && (
              <Button variant="ghost" size="sm" onClick={marcarTodasLidas} className="text-xs gap-1">
                <Check className="h-3 w-3" /> Marcar todas lidas
              </Button>
            )}
            {notificacoes.some(n => n.lida) && (
              <Button variant="ghost" size="sm" onClick={limparLidas} className="text-xs gap-1 text-muted-foreground">
                <Trash2 className="h-3 w-3" /> Limpar lidas
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center text-muted-foreground py-4">Carregando...</div>
        ) : notificacoes.length === 0 ? (
          <div className="text-center text-muted-foreground py-6 flex flex-col items-center gap-2">
            <BellOff className="h-8 w-8 opacity-30" />
            <span className="text-sm">Nenhuma notificação ainda</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            {displayed.map(n => (
              <div
                key={n.id}
                className={`flex items-start gap-3 p-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
                  n.lida ? 'opacity-60' : 'bg-accent/50'
                }`}
                onClick={() => !n.lida && marcarLida(n.id)}
              >
                <span className="text-lg shrink-0 mt-0.5">{tipoIcon(n.tipo)}</span>
                <div className="flex-1 min-w-0">
                  <p className={`${n.lida ? '' : 'font-medium'}`}>{n.mensagem}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(new Date(n.criado_em), 'dd/MM/yyyy HH:mm')}
                  </p>
                </div>
                {!n.lida && (
                  <span className="shrink-0 mt-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </div>
            ))}
            {notificacoes.length > 10 && (
              <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setShowAll(!showAll)}>
                {showAll ? 'Mostrar menos' : `Ver todas (${notificacoes.length})`}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
