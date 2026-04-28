import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Search, X, Users, SearchX, Eye, Link2, Unlink, Trash2, Loader2, Download } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions } from '@/hooks/useUserPermissions';
import { exportarParaExcel } from '@/lib/exportExcel';

interface ClienteRow {
  id: string;
  nome: string;
  cpf: string;
  credor: string | null;
  contrato: string | null;
  valor_original: number;
  valor_atualizado: number;
  estagio: string;
  tem_acordo?: boolean;
}

interface ClienteAgrupado {
  id: string;
  nome: string;
  cpf: string;
  credor: string | null;
  qtdContratos: number;
  valorTotal: number;
  estagios: string[];
  temAcordo?: boolean;
  isGrupo?: boolean;
  grupoId?: string;
  cpfsGrupo?: string[];
}

interface GrupoMembro {
  id: string;
  grupo_id: string;
  nome_grupo: string;
  cpf_cnpj: string;
}

const CREDORES_FIXOS = ['MUNDO DA MODA', 'UME | NOVO MUNDO', 'MONTREAL'];

const CREDOR_SLUG_MAP: Record<string, string> = {
  'ume_novo_mundo': 'UME | NOVO MUNDO',
  'mundo_da_moda': 'MUNDO DA MODA',
  'montreal': 'MONTREAL',
};
const ESTAGIOS = [
  { value: 'novo', label: 'Novo' },
  { value: 'andamento', label: 'Andamento' },
  { value: 'acordo', label: 'Acordo' },
  { value: 'finalizado', label: 'Finalizado' },
];

const PAGE_SIZE = 20;

export default function Clientes() {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const { credores: credoresPermitidos } = useUserPermissions();
  const [busca, setBusca] = useState('');
  const [telefone, setTelefone] = useState('');
  const [credor, setCredor] = useState('todos');
  const [estagio, setEstagio] = useState('todos');
  const [rawResults, setRawResults] = useState<ClienteRow[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [loadingCount, setLoadingCount] = useState(0);

  // Grupo empresarial state
  const [grupos, setGrupos] = useState<GrupoMembro[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCpfs, setSelectedCpfs] = useState<Set<string>>(new Set());
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [nomeGrupo, setNomeGrupo] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  // Delete mode state
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exportingPhones, setExportingPhones] = useState(false);

  const [credores, setCredores] = useState<string[]>(CREDORES_FIXOS);

  const handleExportTelefones = async () => {
    if (filteredGrouped.length === 0) {
      toast.error('Nenhum cliente para exportar.');
      return;
    }
    setExportingPhones(true);
    try {
      // Collect all unique CPFs
      const allCpfs: string[] = [];
      for (const row of filteredGrouped) {
        if (row.cpfsGrupo) {
          for (const c of row.cpfsGrupo) allCpfs.push(c.replace(/\D/g, ''));
        } else {
          allCpfs.push(row.cpf.replace(/\D/g, ''));
        }
      }
      const uniqueCpfs = Array.from(new Set(allCpfs));

      // Build name map from rawResults
      const cpfToName: Record<string, string> = {};
      for (const r of rawResults) {
        const norm = r.cpf.replace(/\D/g, '');
        if (!cpfToName[norm]) cpfToName[norm] = r.nome;
      }
      // Also from grouped (grupo names)
      for (const row of filteredGrouped) {
        if (row.cpfsGrupo) {
          for (const c of row.cpfsGrupo) {
            const norm = c.replace(/\D/g, '');
            if (!cpfToName[norm]) cpfToName[norm] = row.nome;
          }
        }
      }

      // Fetch devedor_telefones for these CPFs
      const allTelefones: { devedor_cpf: string; numero: string }[] = [];
      const batchSize = 50;
      for (let i = 0; i < uniqueCpfs.length; i += batchSize) {
        const batch = uniqueCpfs.slice(i, i + batchSize);
        const { data } = await supabase
          .from('devedor_telefones')
          .select('devedor_cpf, numero')
          .in('devedor_cpf', batch)
          .eq('ativo', true);
        if (data) allTelefones.push(...data);
      }

      // Also get telefone from devedores table
      const devedorTelMap: Record<string, string[]> = {};
      for (const r of rawResults) {
        const norm = r.cpf.replace(/\D/g, '');
        if ((r as any).telefone) {
          if (!devedorTelMap[norm]) devedorTelMap[norm] = [];
          const tel = (r as any).telefone;
          if (!devedorTelMap[norm].includes(tel)) devedorTelMap[norm].push(tel);
        }
      }

      // Build cpf -> telefones map
      const cpfTelMap: Record<string, Set<string>> = {};
      for (const t of allTelefones) {
        const norm = t.devedor_cpf.replace(/\D/g, '');
        if (!cpfTelMap[norm]) cpfTelMap[norm] = new Set();
        cpfTelMap[norm].add(t.numero.replace(/\D/g, ''));
      }
      // Merge devedores.telefone
      for (const [cpf, tels] of Object.entries(devedorTelMap)) {
        if (!cpfTelMap[cpf]) cpfTelMap[cpf] = new Set();
        for (const t of tels) cpfTelMap[cpf].add(t.replace(/\D/g, ''));
      }

      // Build export rows: one row per phone
      const exportRows: { Nome: string; Telefone: string }[] = [];
      for (const cpf of uniqueCpfs) {
        const nome = cpfToName[cpf] || cpf;
        const phones = cpfTelMap[cpf];
        if (phones && phones.size > 0) {
          for (const phone of phones) {
            exportRows.push({ Nome: nome, Telefone: phone });
          }
        } else {
          exportRows.push({ Nome: nome, Telefone: '' });
        }
      }

      if (exportRows.length === 0) {
        toast.error('Nenhum telefone encontrado.');
        return;
      }

      exportarParaExcel(exportRows, [
        { chave: 'Nome', titulo: 'Nome' },
        { chave: 'Telefone', titulo: 'Telefone' },
      ], `telefones-clientes`);
      toast.success(`${exportRows.length} registros exportados.`);
    } catch (err: any) {
      toast.error('Erro ao exportar: ' + err.message);
    } finally {
      setExportingPhones(false);
    }
  };

  // Fetch dynamic creditors from database (single RPC call instead of paginating 717k rows)
  useEffect(() => {
    const fetchCredores = async () => {
      const { data } = await supabase.rpc('listar_credores_distintos');
      if (data && data.length > 0) {
        const unique = (data as { credor: string }[]).map(d => d.credor).filter(Boolean);
        let merged = Array.from(new Set([...CREDORES_FIXOS, ...unique]));
        
        // Filter by user permissions
        if (credoresPermitidos && credoresPermitidos.length > 0) {
          const allowedNames = credoresPermitidos.map((slug: string) => CREDOR_SLUG_MAP[slug] || slug);
          merged = merged.filter(c => allowedNames.includes(c));
        }
        
        setCredores(merged);
        
        // Auto-select if only one credor allowed
        if (merged.length === 1) {
          setCredor(merged[0]);
        }
      } else if (credoresPermitidos && credoresPermitidos.length > 0) {
        const allowedNames = credoresPermitidos.map((slug: string) => CREDOR_SLUG_MAP[slug] || slug);
        const filtered = CREDORES_FIXOS.filter(c => allowedNames.includes(c));
        setCredores(filtered);
        if (filtered.length === 1) {
          setCredor(filtered[0]);
        }
      }
    };
    fetchCredores();
  }, [credoresPermitidos]);

  // Fetch groups on mount
  useEffect(() => {
    const fetchGrupos = async () => {
      const { data } = await supabase.from('grupo_empresarial_membros' as any).select('*');
      if (data) setGrupos(data as unknown as GrupoMembro[]);
    };
    fetchGrupos();
  }, []);

  const grouped = useMemo<ClienteAgrupado[]>(() => {
    // Step 1: Group by CPF (existing logic)
    const map: Record<string, ClienteAgrupado> = {};
    for (const row of rawResults) {
      const cpfNorm = row.cpf.replace(/\D/g, '');
      if (!map[cpfNorm]) {
        map[cpfNorm] = { id: row.id, nome: row.nome, cpf: row.cpf, credor: row.credor, qtdContratos: 0, valorTotal: 0, estagios: [], temAcordo: false };
      }
      map[cpfNorm].qtdContratos += 1;
      map[cpfNorm].valorTotal += Number(row.valor_atualizado);
      if (!map[cpfNorm].estagios.includes(row.estagio)) map[cpfNorm].estagios.push(row.estagio);
      if (row.tem_acordo) map[cpfNorm].temAcordo = true;
    }

    // Step 2: Merge by grupo_empresarial
    const cpfToGrupo: Record<string, string> = {};
    const grupoInfo: Record<string, { nome: string; cpfs: string[] }> = {};
    for (const g of grupos) {
      cpfToGrupo[g.cpf_cnpj] = g.grupo_id;
      if (!grupoInfo[g.grupo_id]) grupoInfo[g.grupo_id] = { nome: g.nome_grupo, cpfs: [] };
      if (!grupoInfo[g.grupo_id].cpfs.includes(g.cpf_cnpj)) grupoInfo[g.grupo_id].cpfs.push(g.cpf_cnpj);
    }

    const result: ClienteAgrupado[] = [];
    const processedGrupos = new Set<string>();
    const processedCpfs = new Set<string>();

    for (const cpfNorm of Object.keys(map)) {
      const grupoId = cpfToGrupo[cpfNorm];
      if (grupoId) {
        if (processedGrupos.has(grupoId)) continue;
        processedGrupos.add(grupoId);

        const info = grupoInfo[grupoId];
        let totalContratos = 0;
        let totalValor = 0;
        const allEstagios: string[] = [];
        const allCredores: string[] = [];
        let firstId = '';
        let grupoTemAcordo = false;

        for (const memberCpf of info.cpfs) {
          if (map[memberCpf]) {
            if (!firstId) firstId = map[memberCpf].id;
            totalContratos += map[memberCpf].qtdContratos;
            totalValor += map[memberCpf].valorTotal;
            for (const e of map[memberCpf].estagios) {
              if (!allEstagios.includes(e)) allEstagios.push(e);
            }
            const memberCredor = map[memberCpf].credor;
            if (memberCredor && !allCredores.includes(memberCredor)) {
              allCredores.push(memberCredor);
            }
            if (map[memberCpf].temAcordo) grupoTemAcordo = true;
            processedCpfs.add(memberCpf);
          }
        }

        if (totalContratos > 0) {
          result.push({
            id: firstId,
            nome: info.nome,
            cpf: info.cpfs.join(', '),
            credor: allCredores.length > 0 ? allCredores.join(', ') : null,
            qtdContratos: totalContratos,
            valorTotal: totalValor,
            estagios: allEstagios,
            temAcordo: grupoTemAcordo,
            isGrupo: true,
            grupoId,
            cpfsGrupo: info.cpfs,
          });
        }
      }
    }

    // Add non-grouped entries
    for (const [cpfNorm, entry] of Object.entries(map)) {
      if (!processedCpfs.has(cpfNorm) && !cpfToGrupo[cpfNorm]) {
        result.push(entry);
      }
    }

    // Final ordering: clients with agreements first, then by name
    result.sort((a, b) => {
      if (!!a.temAcordo !== !!b.temAcordo) return a.temAcordo ? -1 : 1;
      return a.nome.localeCompare(b.nome, 'pt-BR');
    });

    return result;
  }, [rawResults, grupos]);

  const filteredGrouped = useMemo(() => {
    const prioridade = ['acordo', 'finalizado', 'andamento', 'novo'];
    const base = estagio === 'todos'
      ? grouped
      : grouped.filter(row => {
          const estagiosLower = row.estagios.map(e => (e || '').toLowerCase());
          const principal = prioridade.find(p => estagiosLower.includes(p)) || estagiosLower[0];
          return principal === estagio;
        });
    // Sempre colocar clientes com tag "Acordo" no topo
    return [...base].sort((a, b) => {
      const aHas = a.estagios.some(e => (e || '').toLowerCase() === 'acordo') ? 1 : 0;
      const bHas = b.estagios.some(e => (e || '').toLowerCase() === 'acordo') ? 1 : 0;
      return bHas - aHas;
    });
  }, [grouped, estagio]);

  const totalPages = Math.ceil(filteredGrouped.length / PAGE_SIZE);
  const paginatedResults = filteredGrouped.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleSearch = async () => {
    if (!busca.trim() && !telefone.trim() && credor === 'todos' && estagio === 'todos') {
      toast.error('Preencha ao menos um filtro para pesquisar.');
      return;
    }
    setLoading(true);
    setLoadingCount(0);
    setPage(0);
    setSelectionMode(false);
    setSelectedCpfs(new Set());
    setDeleteMode(false);
    setSelectedForDeletion(new Set());

    let allData: ClienteRow[] = [];

    // Fast path: if search term is purely numeric (CPF/CNPJ), use indexed RPC
    const termLimpo = busca.trim().replace(/\D/g, '');
    const isNumericSearch =
      busca.trim().length > 0 &&
      termLimpo.length > 0 &&
      /^[\d.\-/\s]+$/.test(busca.trim());

    // Fast path: only credor selected (no name, no phone) → use RPC with tem_acordo flag
    const isCredorOnlySearch =
      !busca.trim() && !telefone.trim() && credor !== 'todos';

    if (isCredorOnlySearch) {
      const { data, error } = await supabase.rpc('listar_devedores_por_credor', {
        p_credor: credor,
      });
      if (error) {
        toast.error('Erro na busca: ' + error.message);
      } else if (data) {
        allData = data as ClienteRow[];
        setLoadingCount(allData.length);
      }
    } else if (isNumericSearch) {
      const { data, error } = await supabase.rpc('buscar_devedores_por_documento', {
        p_doc: termLimpo,
        p_credor: credor !== 'todos' ? credor : null,
      });
      if (error) {
        toast.error('Erro na busca: ' + error.message);
      } else if (data) {
        let rows = data as ClienteRow[];
        if (telefone.trim()) {
          const tel = telefone.trim().replace(/\D/g, '');
          rows = rows.filter(r => (r as any).telefone && (r as any).telefone.replace(/\D/g, '').includes(tel));
        }
        allData = rows;
        setLoadingCount(allData.length);
      }
    } else {
      const PAGE_FETCH = 1000;
      let from = 0;
      let keepFetching = true;

      while (keepFetching) {
        let q = supabase
          .from('devedores')
          .select('id, nome, cpf, credor, contrato, valor_original, valor_atualizado, estagio, telefone')
          .eq('ativo', true)
          .order('criado_em', { ascending: false })
          .range(from, from + PAGE_FETCH - 1);

        if (busca.trim()) {
          q = q.ilike('nome', `%${busca.trim()}%`);
        }
        if (telefone.trim()) q = q.ilike('telefone', `%${telefone.trim().replace(/\D/g, '')}%`);
        if (credor !== 'todos') q = q.eq('credor', credor);

        const { data, error } = await q;
        if (error) { toast.error('Erro na busca: ' + error.message); break; }
        if (data) {
          allData = [...allData, ...(data as ClienteRow[])];
          setLoadingCount(allData.length);
        }
        if (!data || data.length < PAGE_FETCH) keepFetching = false;
        else from += PAGE_FETCH;
      }
    }

    setRawResults(allData);

    // Refresh groups
    const { data: grpData } = await supabase.from('grupo_empresarial_membros' as any).select('*');
    if (grpData) setGrupos(grpData as unknown as GrupoMembro[]);

    setSearched(true);
    setLoading(false);
  };

  const handleClear = () => {
    setBusca('');
    setTelefone('');
    setCredor('todos');
    setEstagio('todos');
    setRawResults([]);
    setPage(0);
    setSearched(false);
    setSelectionMode(false);
    setSelectedCpfs(new Set());
    setDeleteMode(false);
    setSelectedForDeletion(new Set());
  };

  const toggleCpfSelection = (cpfNorm: string) => {
    setSelectedCpfs(prev => {
      const next = new Set(prev);
      if (next.has(cpfNorm)) next.delete(cpfNorm);
      else next.add(cpfNorm);
      return next;
    });
  };

  const handleConfirmGroup = async () => {
    if (!nomeGrupo.trim()) { toast.error('Informe o nome do grupo.'); return; }
    if (!user) return;
    setSavingGroup(true);

    const grupoId = crypto.randomUUID();
    const inserts = Array.from(selectedCpfs).map(cpfNorm => ({
      grupo_id: grupoId,
      nome_grupo: nomeGrupo.trim(),
      cpf_cnpj: cpfNorm,
      criado_por: user.id,
    }));

    const { error } = await supabase.from('grupo_empresarial_membros' as any).insert(inserts as any);
    if (error) { toast.error('Erro ao criar grupo: ' + error.message); }
    else {
      toast.success('Grupo empresarial criado!');
      setGroupDialogOpen(false);
      setNomeGrupo('');
      setSelectionMode(false);
      setSelectedCpfs(new Set());
      // Refresh groups
      const { data: grpData } = await supabase.from('grupo_empresarial_membros' as any).select('*');
      if (grpData) setGrupos(grpData as unknown as GrupoMembro[]);
    }
    setSavingGroup(false);
  };

  const handleUngroup = async (grupoId: string) => {
    const { error } = await supabase.from('grupo_empresarial_membros' as any).delete().eq('grupo_id', grupoId);
    if (error) { toast.error('Erro ao desagrupar: ' + error.message); }
    else {
      toast.success('Grupo desfeito!');
      const { data: grpData } = await supabase.from('grupo_empresarial_membros' as any).select('*');
      if (grpData) setGrupos(grpData as unknown as GrupoMembro[]);
    }
  };

  const estagioVariant = (e: string) => {
    switch ((e || '').toLowerCase()) {
      case 'novo': return 'default';
      case 'andamento': return 'secondary';
      case 'acordo': return 'default';
      case 'finalizado': return 'outline';
      default: return 'default';
    }
  };

  // Get all devedor IDs for a given grouped row
  const getIdsForRow = (row: ClienteAgrupado): string[] => {
    if (row.isGrupo && row.cpfsGrupo) {
      return rawResults
        .filter(r => row.cpfsGrupo!.includes(r.cpf.replace(/\D/g, '')))
        .map(r => r.id);
    }
    return rawResults
      .filter(r => r.cpf.replace(/\D/g, '') === row.cpf.replace(/\D/g, ''))
      .map(r => r.id);
  };

  const toggleDeletionForRow = (row: ClienteAgrupado) => {
    const ids = getIdsForRow(row);
    setSelectedForDeletion(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const isRowSelected = (row: ClienteAgrupado): boolean => {
    const ids = getIdsForRow(row);
    return ids.length > 0 && ids.every(id => selectedForDeletion.has(id));
  };

  const toggleSelectAll = () => {
    const allIds = rawResults.map(r => r.id);
    setSelectedForDeletion(prev => {
      if (prev.size === allIds.length) return new Set();
      return new Set(allIds);
    });
  };

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    const ids = Array.from(selectedForDeletion);
    const BATCH = 200;
    let totalDeleted = 0;
    let lastError: string | null = null;
    for (let i = 0; i < ids.length; i += BATCH) {
      const slice = ids.slice(i, i + BATCH);
      const { error } = await supabase.from('devedores').delete().in('id', slice);
      if (error) {
        lastError = error.message;
        break;
      }
      totalDeleted += slice.length;
    }
    if (lastError) {
      toast.error(`Erro ao excluir contratos: ${lastError} (${totalDeleted}/${ids.length} excluídos)`);
      if (totalDeleted > 0) {
        const deletedSet = new Set(ids.slice(0, totalDeleted));
        setRawResults(prev => prev.filter(r => !deletedSet.has(r.id)));
      }
    } else {
      toast.success(`${totalDeleted} contrato(s) excluído(s) com sucesso!`);
      setRawResults(prev => prev.filter(r => !selectedForDeletion.has(r.id)));
      setDeleteMode(false);
      setSelectedForDeletion(new Set());
    }
    setDeleteDialogOpen(false);
    setDeleting(false);
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Users className="h-6 w-6" />
          Clientes
        </h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Pesquisar Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Nome ou CPF/CNPJ</label>
                <Input placeholder="Nome ou CPF/CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Telefone</label>
                <Input placeholder="Telefone" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Credor</label>
                <Select value={credor} onValueChange={setCredor}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {credores.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Estágio</label>
                <Select value={estagio} onValueChange={setEstagio}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {ESTAGIOS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 lg:col-span-3">
                <Button onClick={() => handleSearch()} disabled={loading}>
                  <Search className="h-4 w-4 mr-1" />
                  {loading ? 'Pesquisando...' : 'Pesquisar'}
                </Button>
                <Button variant="outline" onClick={handleClear}>
                  <X className="h-4 w-4 mr-1" />
                  Limpar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {loading && (
          <Card className="mb-6">
            <CardContent className="py-6">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm font-medium">
                  Carregando registros... {loadingCount > 0 ? `${loadingCount.toLocaleString('pt-BR')} registros encontrados até agora` : 'Iniciando busca...'}
                </span>
              </div>
              <Progress value={undefined} className="h-2 animate-pulse" />
              <p className="text-xs text-muted-foreground mt-3">
                Aguarde, esta operação pode levar alguns segundos dependendo do volume de dados.
              </p>
            </CardContent>
          </Card>
        )}

        {searched && !loading && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{filteredGrouped.length} cliente{filteredGrouped.length !== 1 ? 's' : ''} encontrado{filteredGrouped.length !== 1 ? 's' : ''}</CardTitle>
                {isAdmin && filteredGrouped.length >= 1 && (
                  <div className="flex gap-2">
                    {deleteMode ? (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={selectedForDeletion.size === 0}
                          onClick={() => setDeleteDialogOpen(true)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir Selecionados ({selectedForDeletion.size})
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setDeleteMode(false); setSelectedForDeletion(new Set()); }}>
                          Cancelar
                        </Button>
                      </>
                    ) : selectionMode ? (
                      <>
                        <Button
                          size="sm"
                          disabled={selectedCpfs.size < 2}
                          onClick={() => setGroupDialogOpen(true)}
                        >
                          <Link2 className="h-4 w-4 mr-1" />
                          Confirmar Agrupamento ({selectedCpfs.size})
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => { setSelectionMode(false); setSelectedCpfs(new Set()); }}>
                          Cancelar
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" onClick={handleExportTelefones} disabled={exportingPhones}>
                          <Download className="h-4 w-4 mr-1" />
                          {exportingPhones ? 'Exportando...' : 'Exportar Telefones'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteMode(true)}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir Contratos
                        </Button>
                        {filteredGrouped.length >= 2 && (
                          <Button variant="outline" size="sm" onClick={() => setSelectionMode(true)}>
                            <Link2 className="h-4 w-4 mr-1" />
                            Agrupar CNPJs
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {(selectionMode || deleteMode) && (
                        <TableHead className="w-10">
                          {deleteMode && (
                            <Checkbox
                              checked={rawResults.length > 0 && selectedForDeletion.size === rawResults.length}
                              onCheckedChange={toggleSelectAll}
                            />
                          )}
                        </TableHead>
                      )}
                      <TableHead>Nome</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>Credor</TableHead>
                      <TableHead>Contratos</TableHead>
                      <TableHead>Valor Total (R$)</TableHead>
                      <TableHead>Estágio</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedResults.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={(selectionMode || deleteMode) ? 8 : 7} className="text-center py-12">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <SearchX className="h-10 w-10" />
                            <p className="text-lg font-semibold">Cliente não encontrado</p>
                            <p className="text-sm">Tente ajustar os filtros da pesquisa.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedResults.map((row) => {
                        const cpfNorm = row.cpf.replace(/\D/g, '');
                        return (
                          <TableRow key={row.isGrupo ? row.grupoId : row.cpf}>
                            {deleteMode && (
                              <TableCell>
                                <Checkbox
                                  checked={isRowSelected(row)}
                                  onCheckedChange={() => toggleDeletionForRow(row)}
                                />
                              </TableCell>
                            )}
                            {selectionMode && !deleteMode && (
                              <TableCell>
                                {!row.isGrupo && (
                                  <Checkbox
                                    checked={selectedCpfs.has(cpfNorm)}
                                    onCheckedChange={() => toggleCpfSelection(cpfNorm)}
                                  />
                                )}
                              </TableCell>
                            )}
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                {row.nome}
                                {row.isGrupo && <Badge variant="secondary">Grupo</Badge>}
                                {row.temAcordo && (
                                  <Badge
                                    className="border-transparent text-white"
                                    style={{ backgroundColor: 'hsl(var(--success))' }}
                                  >
                                    Com acordo
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs max-w-[200px]">
                              {row.isGrupo ? (
                                <div className="flex flex-wrap gap-1">
                                  {row.cpfsGrupo?.map(c => (
                                    <Badge key={c} variant="outline" className="font-mono text-xs">{c}</Badge>
                                  ))}
                                </div>
                              ) : row.cpf}
                            </TableCell>
                            <TableCell>{row.credor || '-'}</TableCell>
                            <TableCell>{row.qtdContratos} contrato{row.qtdContratos !== 1 ? 's' : ''}</TableCell>
                            <TableCell>{row.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                            <TableCell>
                              {(() => {
                                const prioridade = ['acordo', 'finalizado', 'andamento', 'novo'];
                                const estagiosLower = row.estagios.map(e => (e || '').toLowerCase());
                                const principal = prioridade.find(p => estagiosLower.includes(p)) || estagiosLower[0];
                                return (
                                  <Badge variant={estagioVariant(principal)} className={principal === 'acordo' ? 'bg-green-600 hover:bg-green-600 text-white' : ''}>
                                    {ESTAGIOS.find(es => es.value === principal)?.label || principal}
                                  </Badge>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="outline" size="sm" onClick={() => navigate(`/clientes/${row.id}`)}>
                                  <Eye className="h-4 w-4 mr-1" />
                                  Ver Ficha
                                </Button>
                                {isAdmin && row.isGrupo && row.grupoId && (
                                  <Button variant="outline" size="sm" onClick={() => handleUngroup(row.grupoId!)}>
                                    <Unlink className="h-4 w-4 mr-1" />
                                    Desagrupar
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">Página {page + 1} de {totalPages}</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Dialog para nome do grupo */}
        <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Grupo Empresarial</DialogTitle>
              <DialogDescription>
                Agrupe {selectedCpfs.size} CNPJs em um único grupo empresarial.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome do Grupo</Label>
                <Input
                  placeholder="Ex: POLLYANE DANTAS ALVES"
                  value={nomeGrupo}
                  onChange={(e) => setNomeGrupo(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">CPFs/CNPJs selecionados:</Label>
                <div className="flex flex-wrap gap-1">
                  {Array.from(selectedCpfs).map(c => (
                    <Badge key={c} variant="outline" className="font-mono text-xs">{c}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleConfirmGroup} disabled={savingGroup}>
                {savingGroup ? 'Salvando...' : 'Criar Grupo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* AlertDialog para confirmar exclusão */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir {selectedForDeletion.size} contrato(s)? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteConfirm} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
