import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { useToast } from '@/hooks/use-toast';
import { Users, UserPlus, Trash2, Pencil, Trophy } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';
import { EditPermissionsDialog } from '@/components/EditPermissionsDialog';
import { EstrategiasCobranca } from '@/components/EstrategiasCobranca';

type AppRole = Database['public']['Enums']['app_role'];

interface Profile {
  id: string;
  nome: string;
  email: string;
}

interface UserWithRole extends Profile {
  role: AppRole;
}

interface TeamMember {
  id: string;
  gestor_id: string;
  funcionario_id: string;
  criado_em: string;
  funcionario?: Profile;
}

export default function AdminEquipes() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedGestor, setSelectedGestor] = useState<string>('');
  const [selectedFuncionario, setSelectedFuncionario] = useState<string>('');
  const [editingUser, setEditingUser] = useState<{ id: string; nome: string } | null>(null);

  // Fetch all users with their roles
  const { data: usersData } = useQuery({
    queryKey: ['admin-users-with-roles'],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*');

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      const usersWithRoles: UserWithRole[] = profiles.map((profile) => {
        const userRole = roles.find((r) => r.user_id === profile.id);
        return {
          ...profile,
          role: userRole?.role ?? 'funcionario',
        };
      });

      return usersWithRoles;
    },
  });

  // Fetch team members
  const { data: teamMembers, isLoading: isLoadingTeams } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('*')
        .order('criado_em', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch user permissions for credores/ranking display
  const { data: allPermissions } = useQuery({
    queryKey: ['all-user-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_permissions')
        .select('*');
      if (error) throw error;
      return data;
    },
  });

  const getPermissions = (userId: string) =>
    allPermissions?.find((p) => p.user_id === userId) as any;

  // Filter gestores and funcionarios
  const gestores = usersData?.filter((u) => u.role === 'gestor' || u.role === 'admin') ?? [];
  const funcionarios = usersData?.filter((u) => u.role === 'funcionario' || u.role === 'admin') ?? [];

  // Get profile by id
  const getProfile = (id: string) => usersData?.find((u) => u.id === id);

  // Get funcionarios not already assigned to the selected gestor
  const availableFuncionarios = funcionarios.filter((f) => {
    if (!selectedGestor) return true;
    return !teamMembers?.some(
      (tm) => tm.gestor_id === selectedGestor && tm.funcionario_id === f.id
    );
  });

  const addTeamMemberMutation = useMutation({
    mutationFn: async ({ gestorId, funcionarioId }: { gestorId: string; funcionarioId: string }) => {
      const { error } = await supabase
        .from('team_members')
        .insert({ gestor_id: gestorId, funcionario_id: funcionarioId });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      setSelectedFuncionario('');
      toast({
        title: 'Associação criada',
        description: 'Funcionário associado ao gestor com sucesso.',
      });
    },
    onError: (error) => {
      console.error('Error adding team member:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível criar a associação.',
        variant: 'destructive',
      });
    },
  });

  const removeTeamMemberMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({
        title: 'Associação removida',
        description: 'A associação foi removida com sucesso.',
      });
    },
    onError: (error) => {
      console.error('Error removing team member:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível remover a associação.',
        variant: 'destructive',
      });
    },
  });

  const handleAddTeamMember = () => {
    if (selectedGestor && selectedFuncionario) {
      addTeamMemberMutation.mutate({
        gestorId: selectedGestor,
        funcionarioId: selectedFuncionario,
      });
    }
  };

  // Group team members by gestor
  const teamsByGestor = teamMembers?.reduce((acc, tm) => {
    if (!acc[tm.gestor_id]) {
      acc[tm.gestor_id] = [];
    }
    acc[tm.gestor_id].push(tm);
    return acc;
  }, {} as Record<string, typeof teamMembers>);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Gestão de Equipes</h1>
          <p className="text-muted-foreground mt-1">
            Associe funcionários aos seus gestores
          </p>
        </div>

        {/* Add Association Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Nova Associação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 items-end">
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Gestor</label>
                <Select value={selectedGestor} onValueChange={setSelectedGestor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um gestor" />
                  </SelectTrigger>
                  <SelectContent>
                    {gestores.map((gestor) => (
                      <SelectItem key={gestor.id} value={gestor.id}>
                        {gestor.nome} ({gestor.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">Funcionário</label>
                <Select
                  value={selectedFuncionario}
                  onValueChange={setSelectedFuncionario}
                  disabled={!selectedGestor}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um funcionário" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFuncionarios.map((func) => (
                      <SelectItem key={func.id} value={func.id}>
                        {func.nome} ({func.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAddTeamMember}
                disabled={
                  !selectedGestor ||
                  !selectedFuncionario ||
                  addTeamMemberMutation.isPending
                }
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Associar
              </Button>
            </div>
            {gestores.length === 0 && (
              <p className="text-sm text-muted-foreground mt-4">
                Nenhum gestor disponível. Promova usuários para o papel de Gestor na página de Usuários.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Teams List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Equipes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingTeams ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando equipes...
              </div>
            ) : gestores.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum gestor cadastrado. Promova usuários para o papel de Gestor primeiro.
              </div>
            ) : (
              <div className="space-y-6">
                {gestores.map((gestor) => {
                  const team = teamsByGestor?.[gestor.id] ?? [];
                  return (
                    <div key={gestor.id} className="border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-4">
                        <Badge variant="default">{gestor.nome}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {gestor.email}
                        </span>
                        <Badge variant="outline" className="ml-auto">
                          {team.length} funcionário(s)
                        </Badge>
                      </div>
                      {team.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Funcionário</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Credores</TableHead>
                              <TableHead>Ranking</TableHead>
                              <TableHead className="w-[100px]">Ações</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {team.map((member) => {
                              const func = getProfile(member.funcionario_id);
                              const perms = getPermissions(member.funcionario_id);
                              const credores: string[] = perms?.credores ?? [];
                              const visivelRanking = perms?.visivel_ranking ?? true;
                              return (
                                <TableRow key={member.id}>
                                  <TableCell className="font-medium">
                                    {func?.nome ?? 'N/A'}
                                  </TableCell>
                                  <TableCell>{func?.email ?? 'N/A'}</TableCell>
                                  <TableCell>
                                    <div className="flex flex-wrap gap-1">
                                      {credores.map((c: string) => (
                                        <Badge key={c} variant="secondary" className="text-xs">
                                          {c === 'ume_novo_mundo' ? 'UME' : c === 'mundo_da_moda' ? 'MODA' : 'MONTREAL'}
                                        </Badge>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    {visivelRanking ? (
                                      <Trophy className="h-4 w-4 text-primary" />
                                    ) : (
                                      <span className="text-xs text-muted-foreground">Oculto</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex gap-1">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setEditingUser({ id: member.funcionario_id, nome: func?.nome ?? '' })}
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => removeTeamMemberMutation.mutate(member.id)}
                                        disabled={removeTeamMemberMutation.isPending}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          Nenhum funcionário associado a este gestor.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Estratégias de Cobrança */}
        <EstrategiasCobranca />
      </div>

      {editingUser && (
        <EditPermissionsDialog
          open={!!editingUser}
          onOpenChange={(open) => !open && setEditingUser(null)}
          userId={editingUser.id}
          userName={editingUser.nome}
        />
      )}
    </AppLayout>
  );
}
