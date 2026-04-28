import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageCircle, Loader2 } from 'lucide-react';

interface WhatsAppLembreteConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

export function WhatsAppLembreteConfigDialog({
  open,
  onOpenChange,
  userId,
  userName,
}: WhatsAppLembreteConfigDialogProps) {
  const { toast } = useToast();
  const [serverUrl, setServerUrl] = useState('');
  const [instanceToken, setInstanceToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (open && userId) {
      setFetching(true);
      supabase
        .from('profiles')
        .select('whatsapp_lembrete_server_url, whatsapp_lembrete_instance_token')
        .eq('id', userId)
        .single()
        .then(({ data }) => {
          setServerUrl((data as any)?.whatsapp_lembrete_server_url || '');
          setInstanceToken((data as any)?.whatsapp_lembrete_instance_token || '');
          setFetching(false);
        });
    }
  }, [open, userId]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          whatsapp_lembrete_server_url: serverUrl || null,
          whatsapp_lembrete_instance_token: instanceToken || null,
        } as any)
        .eq('id', userId);

      if (error) throw error;

      toast({
        title: 'Configuração salva',
        description: `Instância UAZAPI de lembretes configurada para ${userName}.`,
      });
      onOpenChange(false);
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível salvar a configuração.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          whatsapp_lembrete_server_url: null,
          whatsapp_lembrete_instance_token: null,
        } as any)
        .eq('id', userId);

      if (error) throw error;

      setServerUrl('');
      setInstanceToken('');
      toast({
        title: 'Configuração removida',
        description: `Instância de lembretes removida. Será usado o WhatsApp global.`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível remover.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            WhatsApp Lembretes - {userName}
          </DialogTitle>
          <DialogDescription>
            Configure a instância UAZAPI que será usada para enviar lembretes de pagamento deste funcionário.
          </DialogDescription>
        </DialogHeader>

        {fetching ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="server-url">Server URL</Label>
              <Input
                id="server-url"
                placeholder="https://certificadoracnpj.uazapi.com"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instance-token">Instance Token</Label>
              <Input
                id="instance-token"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={instanceToken}
                onChange={(e) => setInstanceToken(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Se não configurado, os lembretes serão enviados pela instância global do admin.
            </p>
          </div>
        )}

        <DialogFooter className="flex gap-2 sm:justify-between">
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={loading || (!serverUrl && !instanceToken)}
          >
            Limpar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              'Salvar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
