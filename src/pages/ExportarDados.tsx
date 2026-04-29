import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Download, Database, Loader2, Search, Code2, Copy, Check } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

// Curated catalog of exportable tables grouped by Cloud category
const CATEGORIES: { label: string; icon: string; tables: string[] }[] = [
  {
    label: 'AI / Uso e Orçamento',
    icon: '🤖',
    tables: ['ai_usage_log', 'ai_alerts_sent', 'ai_daily_snapshot', 'ai_budget_config', 'ai_function_limits', 'chat_ia_mensagens', 'mentor_conversas'],
  },
  {
    label: 'Database / Acordos & Devedores',
    icon: '💾',
    tables: ['acordos', 'acordos_devedor', 'pagamentos', 'parcelas_devedor', 'devedores', 'devedor_eventos', 'devedor_telefones', 'grupo_empresarial_membros', 'retornos', 'auditoria_divergencias'],
  },
  {
    label: 'Users / Equipe & Permissões',
    icon: '👥',
    tables: ['profiles', 'user_roles', 'user_permissions', 'team_members', 'metas_funcionarios', 'metas_mensais'],
  },
  {
    label: 'Financeiro',
    icon: '💰',
    tables: ['gastos_empresa', 'gastos_funcionarios', 'receitas_empresa'],
  },
  {
    label: 'WhatsApp / Inbox & Aquecimento',
    icon: '💬',
    tables: ['user_whatsapp_instances', 'user_whatsapp_config', 'whatsapp_contatos', 'whatsapp_mensagens', 'whatsapp_etiquetas', 'whatsapp_contato_etiquetas', 'whatsapp_mensagens_rapidas', 'whatsapp_fila', 'whatsapp_lembretes_log', 'whatsapp_conversas_ia', 'whatsapp_conversas_auditoria', 'whatsapp_dialogos_pool', 'whatsapp_dialogos_uso', 'whatsapp_aquecimento_grupos', 'whatsapp_aquecimento_grupo_membros', 'whatsapp_aquecimento_instancias', 'whatsapp_aquecimento_dialogos', 'whatsapp_aquecimento_interacoes', 'whatsapp_aquecimento_agendamentos', 'whatsapp_aquecimento_config', 'whatsapp_aquecimento_status_log', 'aquecimento_contatos_autosave', 'aquecimento_envios_autosave', 'aquecimento_notificacoes'],
  },
  {
    label: 'Chatbot & Automação CobMais',
    icon: '🤖',
    tables: ['chatbot_config', 'chatbot_regras', 'chatbot_templates', 'chatbot_conversas', 'automacao_comandos', 'automacao_config', 'automacao_logs', 'cobmais_conhecimento', 'cobmais_sessoes_gravadas'],
  },
  {
    label: 'Campanhas de Voz',
    icon: '📞',
    tables: ['voice_campaigns', 'voice_campaign_audios', 'voice_campaign_contacts'],
  },
  {
    label: 'Importações & Lembretes',
    icon: '📥',
    tables: ['importacoes', 'importacao_jobs', 'lembrete_envio_progresso', 'lembrete_mensagens_templates', 'lembretes_lidos', 'acionamento_agendamentos'],
  },
  {
    label: 'Configurações & Credores',
    icon: '⚙️',
    tables: ['system_config', 'credor_tokens', 'credor_relatorio_config', 'relatorio_diario_config', 'relatorios_diarios_enviados'],
  },
];

function toCSV(rows: any[]): string {
  if (!rows || rows.length === 0) return '';
  const headerSet = new Set<string>();
  for (const r of rows) {
    Object.keys(r ?? {}).forEach(k => headerSet.add(k));
  }
  const headers: string[] = Array.from(headerSet);
  const escape = (val: any) => {
    if (val === null || val === undefined) return '';
    let s = typeof val === 'object' ? JSON.stringify(val) : String(val);
    if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map(h => escape(r[h])).join(','));
  }
  return lines.join('\n');
}

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ExportarDados() {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sqlMap, setSqlMap] = useState<Record<string, string>>({});
  const [sqlLoading, setSqlLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [bulkSqlBusy, setBulkSqlBusy] = useState(false);

  const allTables = useMemo(() => CATEGORIES.flatMap(c => c.tables), []);

  const fetchDDL = async (table: string): Promise<string> => {
    const { data, error } = await (supabase as any).rpc('get_table_ddl', { p_table: table });
    if (error) throw error;
    return (data as string) ?? '';
  };

  const loadSql = async (table: string) => {
    setSqlLoading(table);
    try {
      const ddl = await fetchDDL(table);
      setSqlMap(prev => ({ ...prev, [table]: ddl }));
    } catch (e: any) {
      toast.error(`Erro ao gerar SQL de ${table}: ${e.message ?? e}`);
    } finally {
      setSqlLoading(null);
    }
  };

  const copyText = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    toast.success('SQL copiado!');
    setTimeout(() => setCopied(null), 1500);
  };

  const generateAllSql = async () => {
    setBulkSqlBusy(true);
    const parts: string[] = [
      '-- ============================================',
      '-- DDL completo (CREATE TABLE + RLS) — public schema',
      `-- Gerado em ${new Date().toISOString()}`,
      '-- ============================================',
      '',
    ];
    let ok = 0, fail = 0;
    for (const t of allTables) {
      try {
        const ddl = await fetchDDL(t);
        parts.push(ddl, '');
        ok++;
      } catch {
        parts.push(`-- ERRO ao gerar DDL para ${t}`, '');
        fail++;
      }
    }
    setBulkSqlBusy(false);
    const full = parts.join('\n');
    const blob = new Blob([full], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schema_completo_${new Date().toISOString().slice(0,10)}.sql`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Schema gerado: ${ok} tabelas (${fail} falhas)`);
  };

  const [search, setSearch] = useState('');

  const filteredCats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.map(cat => ({
      ...cat,
      tables: cat.tables.filter(t => t.toLowerCase().includes(q) || cat.label.toLowerCase().includes(q)),
    })).filter(c => c.tables.length > 0);
  }, [search]);

  // Helper to safely index unknown row objects
  const getVal = (row: any, key: string) => (row as Record<string, any>)[key];

  if (roleLoading) {
    return <AppLayout><div className="p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div></AppLayout>;
  }

  if (!isAdmin) {
    return <AppLayout><div className="p-6 text-center text-muted-foreground">Acesso restrito a administradores.</div></AppLayout>;
  }

  const toggle = (table: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(table)) n.delete(table); else n.add(table);
      return n;
    });
  };

  const toggleCategory = (tables: string[]) => {
    setSelected(prev => {
      const n = new Set(prev);
      const allSel = tables.every(t => n.has(t));
      if (allSel) tables.forEach(t => n.delete(t));
      else tables.forEach(t => n.add(t));
      return n;
    });
  };

  async function fetchAllRows(table: string): Promise<any[]> {
    const pageSize = 1000;
    let from = 0;
    const all: any[] = [];
    // Limit to avoid runaway exports
    const HARD_LIMIT = 100000;
    while (all.length < HARD_LIMIT) {
      const { data, error } = await (supabase as any)
        .from(table)
        .select('*')
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  const exportTable = async (table: string) => {
    setBusy(table);
    try {
      const rows = await fetchAllRows(table);
      if (rows.length === 0) {
        toast.warning(`${table}: sem dados (ou bloqueado por RLS)`);
      } else {
        const csv = toCSV(rows);
        const stamp = new Date().toISOString().slice(0, 10);
        downloadCSV(`${table}_${stamp}.csv`, csv);
        toast.success(`${table}: ${rows.length} linhas exportadas`);
      }
    } catch (e: any) {
      toast.error(`Erro em ${table}: ${e.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const exportSelected = async () => {
    if (selected.size === 0) {
      toast.error('Selecione ao menos uma tabela');
      return;
    }
    setBulkBusy(true);
    let ok = 0, fail = 0;
    for (const table of selected) {
      try {
        const rows = await fetchAllRows(table);
        if (rows.length > 0) {
          const csv = toCSV(rows);
          const stamp = new Date().toISOString().slice(0, 10);
          downloadCSV(`${table}_${stamp}.csv`, csv);
          ok++;
        }
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        fail++;
      }
    }
    setBulkBusy(false);
    toast.success(`Exportação concluída: ${ok} ok, ${fail} falhas`);
  };

  const totalSelected = selected.size;

  return (
    <AppLayout>
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="h-8 w-8" /> Exportar Dados
          </h1>
          <p className="text-muted-foreground mt-1">
            Baixe em CSV os dados das tabelas do Lovable Cloud. Limite: 100k linhas por tabela.
          </p>
        </div>
      </div>

      <Tabs defaultValue="csv" className="w-full">
        <TabsList>
          <TabsTrigger value="csv"><Download className="h-4 w-4 mr-1" /> CSV (dados)</TabsTrigger>
          <TabsTrigger value="sql"><Code2 className="h-4 w-4 mr-1" /> SQL (estrutura)</TabsTrigger>
        </TabsList>

        <TabsContent value="csv" className="space-y-4 mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setSelected(new Set())} disabled={totalSelected === 0}>
              Limpar ({totalSelected})
            </Button>
            <Button onClick={exportSelected} disabled={bulkBusy || totalSelected === 0}>
              {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exportar selecionadas ({totalSelected})
            </Button>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tabela ou categoria..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          <ScrollArea className="h-[calc(100vh-340px)]">
            <div className="grid gap-4 md:grid-cols-2 pr-4">
              {filteredCats.map(cat => {
                const allSel = cat.tables.every(t => selected.has(t));
                return (
                  <Card key={cat.label}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2">
                          <span>{cat.icon}</span> {cat.label}
                        </CardTitle>
                        <Checkbox checked={allSel} onCheckedChange={() => toggleCategory(cat.tables)} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {cat.tables.map(table => (
                        <div key={table} className="flex items-center justify-between gap-2 py-1 px-2 rounded hover:bg-muted/50">
                          <label className="flex items-center gap-2 flex-1 cursor-pointer text-sm font-mono">
                            <Checkbox checked={selected.has(table)} onCheckedChange={() => toggle(table)} />
                            {table}
                          </label>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => exportTable(table)}
                            disabled={busy === table}
                          >
                            {busy === table ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="sql" className="space-y-4 mt-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Button onClick={generateAllSql} disabled={bulkSqlBusy}>
              {bulkSqlBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Baixar schema completo (.sql)
            </Button>
            <p className="text-xs text-muted-foreground">
              Clique em uma tabela para gerar o <code>CREATE TABLE</code> + RLS, depois copie e cole no novo banco.
            </p>
          </div>

          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tabela..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          <ScrollArea className="h-[calc(100vh-340px)]">
            <div className="space-y-3 pr-4">
              {filteredCats.flatMap(cat => cat.tables).map(table => (
                <Card key={table}>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-mono">{table}</CardTitle>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" onClick={() => loadSql(table)} disabled={sqlLoading === table}>
                        {sqlLoading === table ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Code2 className="h-3.5 w-3.5" />}
                        {sqlMap[table] ? 'Recarregar' : 'Gerar SQL'}
                      </Button>
                      {sqlMap[table] && (
                        <Button size="sm" variant="ghost" onClick={() => copyText(table, sqlMap[table])}>
                          {copied === table ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                          Copiar
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  {sqlMap[table] && (
                    <CardContent>
                      <Textarea
                        readOnly
                        value={sqlMap[table]}
                        className="font-mono text-xs min-h-[200px] max-h-[400px]"
                        onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                      />
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      <Card className="bg-muted/30">
        <CardContent className="pt-4 text-xs text-muted-foreground space-y-1">
          <p><strong>Observações:</strong></p>
          <p>• Auth/Users (auth.users), Storage objects, Secrets e Edge Functions code não ficam em tabelas públicas — não são exportáveis daqui. Use o painel do Cloud para esses itens.</p>
          <p>• Logs (Auth/DB/Edge) ficam em analytics e não em tabelas públicas. Para esses, consulte via "Logs" no Cloud.</p>
          <p>• O SQL gerado inclui <code>CREATE TABLE</code> + políticas RLS, mas não inclui funções auxiliares (ex: <code>has_role</code>) que precisam existir no destino.</p>
        </CardContent>
      </Card>
    </div>
    </AppLayout>
  );
}
