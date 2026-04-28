import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Upload, Trash2, RefreshCw, Phone, CheckCircle2, Activity } from 'lucide-react';

interface Contato {
  id: string;
  numero: string;
  nome: string | null;
  ativo: boolean;
  total_usos: number;
  total_respostas: number;
  ultimo_uso_em: string | null;
}

const PAGE_SIZE = 50;

function normalizarNumero(raw: any): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return null;
  return digits.startsWith('55') ? digits : `55${digits}`;
}

export default function AquecimentoAutoSaveTab() {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [loading, setLoading] = useState(false);
  const [importando, setImportando] = useState(false);
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'inativos'>('ativos');
  const [busca, setBusca] = useState('');
  const [enviosHoje, setEnviosHoje] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('aquecimento_contatos_autosave' as any).select('*').order('ultimo_uso_em', { ascending: true, nullsFirst: true }).limit(500);
    if (filtro === 'ativos') q = q.eq('ativo', true);
    if (filtro === 'inativos') q = q.eq('ativo', false);
    const { data, error } = await q;
    if (error) toast.error('Erro ao carregar contatos: ' + error.message);
    else setContatos((data as any) || []);
    setLoading(false);
  }, [filtro]);

  const carregarEnviosHoje = useCallback(async () => {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from('aquecimento_envios_autosave' as any)
      .select('id', { count: 'exact', head: true })
      .gte('enviado_em', inicio.toISOString());
    setEnviosHoje(count || 0);
  }, []);

  useEffect(() => { carregar(); carregarEnviosHoje(); }, [carregar, carregarEnviosHoje]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportando(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const allRows: any[] = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: '', raw: false });
        allRows.push(...rows);
      }

      const novos: { numero: string; nome: string | null }[] = [];
      const vistos = new Set<string>();
      for (const row of allRows) {
        // Tenta achar coluna de telefone
        let numeroRaw: any = null;
        let nomeRaw: any = null;
        for (const k of Object.keys(row)) {
          const lk = k.toLowerCase();
          if (!numeroRaw && (lk.includes('tel') || lk.includes('cel') || lk.includes('phone') || lk.includes('numero') || lk.includes('número') || lk.includes('whats'))) {
            numeroRaw = row[k];
          }
          if (!nomeRaw && (lk.includes('nome') || lk.includes('name') || lk.includes('contato'))) {
            nomeRaw = row[k];
          }
        }
        if (!numeroRaw) {
          // Fallback: tenta primeira coluna que pareça número
          for (const k of Object.keys(row)) {
            const v = String(row[k] || '').replace(/\D/g, '');
            if (v.length >= 10) { numeroRaw = row[k]; break; }
          }
        }
        const norm = normalizarNumero(numeroRaw);
        if (!norm || vistos.has(norm)) continue;
        vistos.add(norm);
        novos.push({ numero: norm, nome: nomeRaw ? String(nomeRaw).trim().slice(0, 100) : null });
      }

      if (!novos.length) {
        toast.error('Nenhum número válido encontrado na planilha.');
        return;
      }

      // Insere em batches de 200, ignorando duplicados (UNIQUE no numero)
      let inseridos = 0;
      let duplicados = 0;
      for (let i = 0; i < novos.length; i += 200) {
        const lote = novos.slice(i, i + 200);
        const { error, count } = await supabase
          .from('aquecimento_contatos_autosave' as any)
          .upsert(lote, { onConflict: 'numero', ignoreDuplicates: true, count: 'exact' });
        if (error) {
          toast.error('Erro no lote: ' + error.message);
        } else {
          inseridos += count || 0;
          duplicados += lote.length - (count || 0);
        }
      }
      toast.success(`Importação concluída: ${inseridos} novos, ${duplicados} duplicados ignorados.`);
      await carregar();
    } catch (err: any) {
      toast.error('Erro ao processar planilha: ' + err.message);
    } finally {
      setImportando(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const toggleAtivo = async (c: Contato) => {
    const { error } = await supabase
      .from('aquecimento_contatos_autosave' as any)
      .update({ ativo: !c.ativo } as any)
      .eq('id', c.id);
    if (error) toast.error(error.message);
    else { toast.success(c.ativo ? 'Desativado' : 'Ativado'); carregar(); }
  };

  const excluir = async (c: Contato) => {
    if (!confirm(`Excluir ${c.numero}?`)) return;
    const { error } = await supabase.from('aquecimento_contatos_autosave' as any).delete().eq('id', c.id);
    if (error) toast.error(error.message);
    else { toast.success('Excluído'); carregar(); }
  };

  const dispararCiclo = async () => {
    toast.info('Disparando ciclo manual...');
    const { data, error } = await supabase.functions.invoke('aquecimento-envio-autosave', { body: {} });
    if (error) toast.error(error.message);
    else { toast.success(`Ciclo: ${(data as any)?.enviados || 0} enviados`); carregarEnviosHoje(); }
  };

  const totalAtivos = contatos.filter(c => c.ativo).length;
  const totalRespostas = contatos.reduce((s, c) => s + (c.total_respostas || 0), 0);
  const totalUsos = contatos.reduce((s, c) => s + (c.total_usos || 0), 0);
  const taxaResposta = totalUsos > 0 ? ((totalRespostas / totalUsos) * 100).toFixed(1) : '0.0';

  const filtrados = contatos.filter(c => !busca || c.numero.includes(busca.replace(/\D/g, '')) || (c.nome || '').toLowerCase().includes(busca.toLowerCase())).slice(0, PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total na pool</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Phone className="h-5 w-5 text-primary" />{contatos.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Ativos</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-primary">{totalAtivos}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Taxa de Resposta</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" />{taxaResposta}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Envios Hoje</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold flex items-center gap-2"><Activity className="h-5 w-5 text-accent-foreground" />{enviosHoje}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contatos Auto-Save</CardTitle>
          <p className="text-xs text-muted-foreground">
            Pool de números externos que respondem automaticamente, usados para aumentar a saúde das instâncias em aquecimento. Cada contato é reutilizado por uma instância no máximo a cada 30 dias.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importando} className="gap-1">
              <Upload className="h-4 w-4" /> {importando ? 'Importando...' : 'Importar Planilha'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { carregar(); carregarEnviosHoje(); }} className="gap-1">
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
            <Button size="sm" variant="secondary" onClick={dispararCiclo} className="gap-1">
              <Activity className="h-4 w-4" /> Disparar ciclo agora
            </Button>
            <div className="ml-auto flex gap-2 items-center">
              <Input placeholder="Buscar número/nome..." value={busca} onChange={e => setBusca(e.target.value)} className="w-48 h-8" />
              <select value={filtro} onChange={e => setFiltro(e.target.value as any)} className="h-8 text-sm border rounded px-2 bg-background">
                <option value="ativos">Só ativos</option>
                <option value="inativos">Só inativos</option>
                <option value="todos">Todos</option>
              </select>
            </div>
          </div>

          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Usos</TableHead>
                  <TableHead className="text-right">Respostas</TableHead>
                  <TableHead className="text-right">Taxa</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead className="text-center">Ativo</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Carregando...</TableCell></TableRow>}
                {!loading && filtrados.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nenhum contato. Importe uma planilha.</TableCell></TableRow>}
                {filtrados.map(c => {
                  const taxa = c.total_usos > 0 ? ((c.total_respostas / c.total_usos) * 100).toFixed(0) : '-';
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.numero}</TableCell>
                      <TableCell className="text-sm">{c.nome || '-'}</TableCell>
                      <TableCell className="text-right text-sm">{c.total_usos}</TableCell>
                      <TableCell className="text-right text-sm">{c.total_respostas}</TableCell>
                      <TableCell className="text-right text-sm">
                        {taxa === '-' ? '-' : <Badge variant={Number(taxa) >= 50 ? 'default' : 'secondary'}>{taxa}%</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.ultimo_uso_em ? new Date(c.ultimo_uso_em).toLocaleString('pt-BR') : 'Nunca'}</TableCell>
                      <TableCell className="text-center"><Switch checked={c.ativo} onCheckedChange={() => toggleAtivo(c)} /></TableCell>
                      <TableCell><Button variant="ghost" size="icon" onClick={() => excluir(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {contatos.length > PAGE_SIZE && <p className="text-xs text-muted-foreground">Exibindo {filtrados.length} de {contatos.length}. Use a busca para filtrar.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
