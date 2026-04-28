import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Users, Shield, UserCheck, KeyRound, DollarSign, Search, MessageCircle, UserPlus, Eye, EyeOff, Settings2, Trash2, ArrowLeftRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { ResetPasswordDialog } from '@/components/ResetPasswordDialog';
import type { Database } from '@/integrations/supabase/types';
import { EditPermissionsDialog } from '@/components/EditPermissionsDialog';
import { WhatsAppLembreteConfigDialog } from '@/components/WhatsAppLembreteConfigDialog';
import { TransferAcordosDialog } from '@/components/TransferAcordosDialog';
import { useAuth } from '@/hooks/useAuth';
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

type AppRole = Database['public']['Enums']['app_role'];

interface UserWithRole {
  id: string;
  nome: string;
  email: string;
  role: AppRole;
  criado_em: string;
  whatsappHabilitado: boolean;
  ativo: boolean;
}

const roleLabels: Record<AppRole, string> = {
  funcionario: 'Funcionário',
  gestor: 'Gestor',
  admin: 'Admin',
};

const roleBadgeVariants: Record<AppRole, 'default' | 'secondary' | 'destructive'> = {
  funcionario: 'secondary',
  gestor: 'default',
  admin: 'destructive',
};

export default function AdminUsuarios() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState<Record<string, AppRole>>({});
  const [resetPasswordUser, setResetPasswordUser] = useState<UserWithRole | null>(null);
  const [permissionsUser, setPermissionsUser] = useState<UserWithRole | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteUser, setDeleteUser] = useState<UserWithRole | null>(null);
  const [whatsappConfigUser, setWhatsappConfigUser] = useState<UserWithRole | null>(null);
  const [transferUser, setTransferUser] = useState<UserWithRole | null>(null);
  
  // Estados para criação de novo usuário
  const [newUserNome, setNewUserNome] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('criado_em', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Combine profiles with roles
      const usersWithRoles: UserWithRole[] = profiles.map((profile) => {
        const userRole = roles.find((r) => r.user_id === profile.id);
        return {
          id: profile.id,
          nome: profile.nome,
          email: profile.email,
          role: userRole?.role ?? 'funcionario',
          criado_em: profile.criado_em,
          whatsappHabilitado: profile.whatsapp_lembretes_habilitado ?? false,
          ativo: (profile as any).ativo ?? true,
        };
      });

      return usersWithRoles;
    },
  });

  // Filtrar usuários por nome ou email
  const filteredUsers = users?.filter(user =>
    user.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  ) ?? [];

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: AppRole }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Papel atualizado',
        description: 'O papel do usuário foi atualizado com sucesso.',
      });
    },
    onError: (error) => {
      console.error('Error updating role:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o papel do usuário.',
        variant: 'destructive',
      });
    },
  });

  const handleRoleChange = (userId: string, newRole: AppRole) => {
    setSelectedRole((prev) => ({ ...prev, [userId]: newRole }));
  };

  const handleSaveRole = (userId: string) => {
    const newRole = selectedRole[userId];
    if (newRole) {
      updateRoleMutation.mutate({ userId, newRole });
    }
  };

  const updateWhatsappMutation = useMutation({
    mutationFn: async ({ userId, enabled }: { userId: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ whatsapp_lembretes_habilitado: enabled })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Configuração atualizada',
        description: 'O envio de lembretes via WhatsApp foi atualizado.',
      });
    },
    onError: (error) => {
      console.error('Error updating whatsapp setting:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar a configuração.',
        variant: 'destructive',
      });
    },
  });

  const updateAtivoMutation = useMutation({
    mutationFn: async ({ userId, ativo }: { userId: string; ativo: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ ativo } as any)
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Status atualizado',
        description: 'O status do usuário foi atualizado com sucesso.',
      });
    },
    onError: (error) => {
      console.error('Error updating ativo:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível atualizar o status do usuário.',
        variant: 'destructive',
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await supabase.functions.invoke('reset-user-password', {
        body: { userId, newPassword },
      });

      if (response.error) throw response.error;
      if (!response.data.success) throw new Error(response.data.error);
      
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: 'Senha redefinida',
        description: 'A senha do usuário foi redefinida com sucesso.',
      });
      setResetPasswordUser(null);
    },
    onError: (error: Error) => {
      console.error('Error resetting password:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível redefinir a senha.',
        variant: 'destructive',
      });
    },
  });

  // Mutation para criar novo usuário
  const createUserMutation = useMutation({
    mutationFn: async ({ nome, email, password }: { nome: string; email: string; password: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await supabase.functions.invoke('create-user-admin', {
        body: { nome, email, password },
      });

      if (response.error) throw response.error;
      if (!response.data.success) throw new Error(response.data.error);
      
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Usuário criado',
        description: 'O novo usuário foi criado com sucesso.',
      });
      // Limpar formulário
      setNewUserNome('');
      setNewUserEmail('');
      setNewUserPassword('');
    },
    onError: (error: Error) => {
      console.error('Error creating user:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível criar o usuário.',
        variant: 'destructive',
      });
    },
  });

  const handleResetPassword = (newPassword: string) => {
    if (resetPasswordUser) {
      resetPasswordMutation.mutate({ userId: resetPasswordUser.id, newPassword });
    }
  };

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Não autenticado');

      const response = await supabase.functions.invoke('delete-user-admin', {
        body: { userId },
      });

      if (response.error) throw response.error;
      if (!response.data.success) throw new Error(response.data.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({
        title: 'Usuário excluído',
        description: 'O usuário foi excluído com sucesso.',
      });
      setDeleteUser(null);
    },
    onError: (error: Error) => {
      console.error('Error deleting user:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Não foi possível excluir o usuário.',
        variant: 'destructive',
      });
    },
  });

  const stats = {
    total: users?.length ?? 0,
    admins: users?.filter((u) => u.role === 'admin').length ?? 0,
    gestores: users?.filter((u) => u.role === 'gestor').length ?? 0,
    funcionarios: users?.filter((u) => u.role === 'funcionario').length ?? 0,
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestão de Usuários</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie os usuários e seus papéis no sistema
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total de Usuários</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Administradores</CardTitle>
              <Shield className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.admins}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Gestores</CardTitle>
              <UserCheck className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.gestores}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Funcionários</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.funcionarios}</div>
            </CardContent>
          </Card>
        </div>

        {/* Criar Novo Usuário */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Criar Novo Usuário
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createUserMutation.mutate({
                  nome: newUserNome,
                  email: newUserEmail,
                  password: newUserPassword,
                });
              }}
              className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
            >
              <div className="space-y-2">
                <Label htmlFor="newUserNome">Nome Completo</Label>
                <Input
                  id="newUserNome"
                  placeholder="João da Silva"
                  value={newUserNome}
                  onChange={(e) => setNewUserNome(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newUserEmail">Email</Label>
                <Input
                  id="newUserEmail"
                  type="email"
                  placeholder="joao@exemplo.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newUserPassword">Senha</Label>
                <div className="relative">
                  <Input
                    id="newUserPassword"
                    type={showNewUserPassword ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                  >
                    {showNewUserPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={createUserMutation.isPending}
                className="w-full"
              >
                {createUserMutation.isPending ? 'Criando...' : 'Criar Usuário'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>Usuários</CardTitle>
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando usuários...
              </div>
            ) : filteredUsers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Papel Atual</TableHead>
                    <TableHead>Novo Papel</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <MessageCircle className="h-4 w-4" />
                        Lembretes
                      </div>
                    </TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.nome}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={roleBadgeVariants[user.role]}>
                          {roleLabels[user.role]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={selectedRole[user.id] ?? user.role}
                          onValueChange={(value: AppRole) => handleRoleChange(user.id, value)}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="funcionario">Funcionário</SelectItem>
                            <SelectItem value="gestor">Gestor</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={user.ativo}
                            onCheckedChange={(checked) =>
                              updateAtivoMutation.mutate({ userId: user.id, ativo: checked })
                            }
                            disabled={updateAtivoMutation.isPending}
                          />
                          <Badge variant={user.ativo ? 'default' : 'secondary'}>
                            {user.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={user.whatsappHabilitado}
                          onCheckedChange={(checked) =>
                            updateWhatsappMutation.mutate({ userId: user.id, enabled: checked })
                          }
                          disabled={updateWhatsappMutation.isPending}
                        />
                      </TableCell>
                      <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            <Button
                              size="sm"
                              onClick={() => handleSaveRole(user.id)}
                              disabled={
                                !selectedRole[user.id] ||
                                selectedRole[user.id] === user.role ||
                                updateRoleMutation.isPending
                              }
                            >
                              Salvar
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => setResetPasswordUser(user)}
                              title="Redefinir Senha"
                            >
                              <KeyRound className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => navigate(`/admin/usuarios/${user.id}/comissoes`)}
                              title="Comissões"
                            >
                              <DollarSign className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => setPermissionsUser(user)}
                              title="Permissões"
                            >
                              <Settings2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => setWhatsappConfigUser(user)}
                              title="Configurar UAZAPI"
                            >
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-8 w-8"
                              onClick={() => setTransferUser(user)}
                              title="Transferir Acordos"
                            >
                              <ArrowLeftRight className="h-4 w-4" />
                            </Button>
                            {user.id !== currentUser?.id && (
                              <Button
                                size="icon"
                                variant="destructive"
                                className="h-8 w-8"
                                onClick={() => setDeleteUser(user)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum usuário encontrado.
              </div>
            )}
          </CardContent>
        </Card>

        <ResetPasswordDialog
          open={!!resetPasswordUser}
          onOpenChange={(open) => !open && setResetPasswordUser(null)}
          userName={resetPasswordUser?.nome ?? ''}
          onConfirm={handleResetPassword}
          isLoading={resetPasswordMutation.isPending}
        />

        <EditPermissionsDialog
          open={!!permissionsUser}
          onOpenChange={(open) => !open && setPermissionsUser(null)}
          userId={permissionsUser?.id ?? ''}
          userName={permissionsUser?.nome ?? ''}
        />

        <WhatsAppLembreteConfigDialog
          open={!!whatsappConfigUser}
          onOpenChange={(open) => !open && setWhatsappConfigUser(null)}
          userId={whatsappConfigUser?.id ?? ''}
          userName={whatsappConfigUser?.nome ?? ''}
        />

        {transferUser && users && (
          <TransferAcordosDialog
            open={!!transferUser}
            onOpenChange={(open) => !open && setTransferUser(null)}
            sourceUser={{ id: transferUser.id, nome: transferUser.nome, email: transferUser.email }}
            allUsers={users.map((u) => ({ id: u.id, nome: u.nome, email: u.email }))}
          />
        )}

        <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir usuário</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o usuário <strong>{deleteUser?.nome}</strong> ({deleteUser?.email})?
                Esta ação não pode ser desfeita. Todos os dados relacionados serão removidos.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => deleteUser && deleteUserMutation.mutate(deleteUser.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteUserMutation.isPending}
              >
                {deleteUserMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </AppLayout>
  );
}
