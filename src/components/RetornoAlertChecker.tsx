import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Bell, User, Phone, FileText } from 'lucide-react';
import successSound from '@/assets/success-sound.mp3';

interface RetornoAlerta {
  id: string;
  cliente_nome: string;
  cliente_cpf: string;
  cliente_telefone: string;
  observacao: string | null;
  data_retorno: string;
}

export function RetornoAlertChecker() {
  const { user } = useAuth();
  const [alertaRetorno, setAlertaRetorno] = useState<RetornoAlerta | null>(null);
  const notifiedIds = useRef<Set<string>>(new Set());

  const checkRetornos = useCallback(async () => {
    if (!user) return;

    const now = new Date();
    // Build UTC-based window: compare against UTC times since DB stores as UTC
    const past5Min = new Date(now.getTime() - 5 * 60 * 1000);
    const in2Min = new Date(now.getTime() + 2 * 60 * 1000);

    // We need to compare in "user local time" because the user entered local time 
    // but it was stored as UTC. So we shift the window by the timezone offset.
    const offsetMs = now.getTimezoneOffset() * 60 * 1000;
    const past5MinUtc = new Date(past5Min.getTime() + offsetMs);
    const in2MinUtc = new Date(in2Min.getTime() + offsetMs);

    const { data, error } = await supabase
      .from('retornos')
      .select('id, cliente_nome, cliente_cpf, cliente_telefone, observacao, data_retorno')
      .eq('user_id', user.id)
      .eq('status', 'pendente')
      .lte('data_retorno', in2MinUtc.toISOString())
      .gte('data_retorno', past5MinUtc.toISOString());

    if (error || !data || data.length === 0) return;

    // Find first non-notified retorno
    const retorno = data.find(r => !notifiedIds.current.has(r.id));
    if (!retorno) return;

    notifiedIds.current.add(retorno.id);
    setAlertaRetorno(retorno);

    // Play sound
    try {
      const audio = new Audio(successSound);
      await audio.play();
      setTimeout(() => {
        const audio2 = new Audio(successSound);
        audio2.play().catch(() => {});
      }, 500);
    } catch {}
  }, [user]);

  useEffect(() => {
    if (!user) return;

    // Check immediately
    checkRetornos();

    const interval = setInterval(checkRetornos, 30000);
    return () => clearInterval(interval);
  }, [user, checkRetornos]);

  return (
    <AlertDialog open={!!alertaRetorno} onOpenChange={(open) => { if (!open) setAlertaRetorno(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            🔔 Retorno Agendado!
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-2">
              <p className="text-base font-medium text-foreground">
                Você tem um retorno agendado para agora:
              </p>
              <div className="space-y-2 rounded-lg bg-muted p-3">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{alertaRetorno?.cliente_nome}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <FileText className="h-3 w-3 text-muted-foreground" />
                  <span>CPF: {alertaRetorno?.cliente_cpf}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  <span>{alertaRetorno?.cliente_telefone}</span>
                </div>
                {alertaRetorno?.observacao && (
                  <p className="text-sm text-muted-foreground mt-2 border-t pt-2">
                    {alertaRetorno.observacao}
                  </p>
                )}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Entendido</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
