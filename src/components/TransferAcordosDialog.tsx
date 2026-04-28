import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Search, ArrowRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface UserInfo {
  id: string;
  nome: string;
  email: string;
}

interface TransferAcordosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceUser: UserInfo;
  allUsers: UserInfo[];
}

export function TransferAcordosDialog({
  open,
  onOpenChange,
  sourceUser,
  allUsers,
}: TransferAcordosDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [acordosCount, setAcordosCount] = useState<number | null>(null);

  const otherUsers = allUsers.filter(
    (u) =>
      u.id !== sourceUser.id &&
      (u.nome.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSelectUser = async (user: UserInfo) => {
    setSelectedUser(user);
    // Count acordos
    const { count } = await supabase
      .from('acordos')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', sourceUser.id);
    setAcordosCount(count ?? 0);
    setShowConfirm(true);
  };

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUser) throw new Error('Nenhum usuário selecionado');

      const { error } = await supabase
        .from('acordos')
        .update({ user_id: selectedUser.id })
        .eq('user_id', sourceUser.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['acordos'] });
      queryClient.invalidateQueries({ queryKey: ['payment-reminders'] });
      toast({
        title: 'Acordos transferidos',
        description: `Todos os acordos de ${sourceUser.nome} foram transferidos para ${selectedUser?.nome}.`,
      });
      setShowConfirm(false);
      setSelectedUser(null);
      setSearch('');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      console.error('Error transferring acordos:', error);
      toast({
        title: 'Erro na transferência',
        description: error.message || 'Não foi possível transferir os acordos.',
        variant: 'destructive',
      });
    },
  });

  const handleClose = (value: boolean) => {
    if (!value) {
      setSearch('');
      setSelectedUser(null);
      setShowConfirm(false);
      setAcordosCount(null);
    }
    onOpenChange(value);
  };

  return (
    <>
      <Dialog open={open && !showConfirm} onOpenChange={handleClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transferir Acordos</DialogTitle>
            <DialogDescription>
              Selecione o usuário que receberá todos os acordos de{' '}
              <strong>{sourceUser.nome}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar usuário..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {otherUsers.length > 0 ? (
                otherUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className="w-full flex items-center justify-between p-3 rounded-md hover:bg-accent text-left transition-colors"
                  >
                    <div>
                      <p className="font-medium text-sm text-foreground">{user.nome}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                ))
              ) : (
                <p className="text-center text-sm text-muted-foreground py-4">
                  Nenhum usuário encontrado.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={(v) => { if (!v) setShowConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar transferência</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Você está prestes a transferir{' '}
                <Badge variant="secondary" className="mx-1">
                  {acordosCount ?? '...'} acordo(s)
                </Badge>{' '}
                de <strong>{sourceUser.nome}</strong> para{' '}
                <strong>{selectedUser?.nome}</strong>.
              </span>
              <span className="block text-destructive font-medium">
                Esta ação não pode ser desfeita. Os acordos e seus lembretes de pagamento passarão a pertencer ao novo usuário.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transferMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => transferMutation.mutate()}
              disabled={transferMutation.isPending || acordosCount === 0}
            >
              {transferMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Transferindo...
                </>
              ) : (
                'Transferir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
