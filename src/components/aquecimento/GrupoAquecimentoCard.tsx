import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Users, Save, Trash2, RefreshCw, ExternalLink, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

interface Instancia {
  id: string;
  nome: string;
  ativo: boolean;
}

interface Grupo {
  id: string;
  group_jid: string;
  nome: string;
  instancia_admin_id: string;
  auto_add_novas: boolean;
  ativo: boolean;
  ultimo_erro: string | null;
}

interface Membro {
  id: string;
  instancia_id: string;
  status: string;
  invite_link: string | null;
  erro_mensagem: string | null;
  tentativas: number;
  adicionado_em: string | null;
  ultima_tentativa_em: string | null;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
  ok: { label: "Adicionada", variant: "default" },
  pendente: { label: "Pendente", variant: "secondary" },
  erro: { label: "Erro", variant: "destructive" },
  convite_necessario: { label: "Convite manual", variant: "outline" },
  removido_manualmente: { label: "Removida manual", variant: "secondary" },
};

export default function GrupoAquecimentoCard() {
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [grupo, setGrupo] = useState<Grupo | null>(null);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sweeping, setSweeping] = useState(false);

  // Form
  const [groupJid, setGroupJid] = useState("");
  const [nome, setNome] = useState("");
  const [adminId, setAdminId] = useState("");
  const [autoAdd, setAutoAdd] = useState(true);
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [instRes, grupoRes] = await Promise.all([
      supabase.from("user_whatsapp_instances").select("id, nome, ativo").order("nome"),
      supabase.from("whatsapp_aquecimento_grupos" as any).select("*").limit(1).maybeSingle(),
    ]);
    setInstancias((instRes.data as Instancia[]) || []);
    if (grupoRes.data) {
      const g = grupoRes.data as any as Grupo;
      setGrupo(g);
      setGroupJid(g.group_jid);
      setNome(g.nome);
      setAdminId(g.instancia_admin_id);
      setAutoAdd(g.auto_add_novas);
      setAtivo(g.ativo);
      const memRes = await supabase
        .from("whatsapp_aquecimento_grupo_membros" as any)
        .select("*")
        .eq("grupo_id", g.id)
        .order("criado_em", { ascending: false });
      setMembros((memRes.data as any) || []);
    }
    setLoading(false);
  }

  async function salvar() {
    if (!groupJid.trim() || !nome.trim() || !adminId) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    if (!groupJid.includes("@g.us")) {
      toast({ title: "JID inválido", description: "Deve terminar com @g.us (ex: 120363xxx@g.us)", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = { group_jid: groupJid.trim(), nome: nome.trim(), instancia_admin_id: adminId, auto_add_novas: autoAdd, ativo };
    if (grupo) {
      const { error } = await supabase.from("whatsapp_aquecimento_grupos" as any).update(payload as any).eq("id", grupo.id);
      if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      else toast({ title: "Grupo atualizado!" });
    } else {
      const { error } = await supabase.from("whatsapp_aquecimento_grupos" as any).insert(payload as any);
      if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      else toast({ title: "Grupo cadastrado!" });
    }
    setSaving(false);
    await load();
  }

  async function excluir() {
    if (!grupo) return;
    if (!confirm("Excluir o grupo de aquecimento? Os registros de membros também serão removidos.")) return;
    await supabase.from("whatsapp_aquecimento_grupos" as any).delete().eq("id", grupo.id);
    toast({ title: "Grupo excluído" });
    setGrupo(null);
    setGroupJid("");
    setNome("");
    setAdminId("");
    setMembros([]);
  }

  async function executarSweep() {
    setSweeping(true);
    try {
      const { data, error } = await supabase.functions.invoke("add-to-warming-group", { body: {} });
      if (error) throw error;
      toast({ title: "Sweep executado", description: `Resultado: ${JSON.stringify(data?.results || []).substring(0, 200)}` });
      await load();
    } catch (e: any) {
      toast({ title: "Erro no sweep", description: e.message, variant: "destructive" });
    } finally {
      setSweeping(false);
    }
  }

  async function tentarAgora(instanciaId: string) {
    try {
      const { data, error } = await supabase.functions.invoke("add-to-warming-group", { body: { instancia_id: instanciaId } });
      if (error) throw error;
      toast({ title: "Tentativa enviada", description: JSON.stringify(data?.results?.[0] || {}).substring(0, 200) });
      await load();
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  }

  if (loading) return <div className="text-sm text-muted-foreground py-4">Carregando grupo de aquecimento...</div>;

  const instanciasAtivas = instancias.filter(i => i.ativo);
  const naoMembros = grupo
    ? instanciasAtivas.filter(i => i.id !== grupo.instancia_admin_id && !membros.some(m => m.instancia_id === i.id && ["ok", "removido_manualmente"].includes(m.status)))
    : [];

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Grupo de Aquecimento WhatsApp</CardTitle>
        </div>
        <CardDescription>
          Grupo real onde todos os números conectados conversam entre si para aquecimento. Novas instâncias são adicionadas automaticamente. Apenas este grupo aparece no Inbox — outros grupos são ocultados.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">JID do Grupo (WhatsApp)</Label>
            <Input
              placeholder="120363xxx@g.us"
              value={groupJid}
              onChange={(e) => setGroupJid(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">Pegue no WhatsApp Web → grupo → Info → ID</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Nome do grupo</Label>
            <Input placeholder="Aquecimento WhatsApp" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs font-semibold">Instância ADMIN (criadora do grupo)</Label>
            <Select value={adminId} onValueChange={setAdminId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a instância que criou o grupo" />
              </SelectTrigger>
              <SelectContent>
                {instanciasAtivas.map(i => (
                  <SelectItem key={i.id} value={i.id}>{i.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">Só essa instância pode adicionar outras ao grupo</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <Label className="text-sm font-semibold">Adicionar novas instâncias</Label>
              <p className="text-[11px] text-muted-foreground">Sempre que conectar uma nova, adiciona ao grupo</p>
            </div>
            <Switch checked={autoAdd} onCheckedChange={setAutoAdd} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <Label className="text-sm font-semibold">Grupo ativo</Label>
              <p className="text-[11px] text-muted-foreground">Desativa todo o sistema de grupo</p>
            </div>
            <Switch checked={ativo} onCheckedChange={setAtivo} />
          </label>
        </div>

        {grupo?.ultimo_erro && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <div>
              <p className="font-semibold text-destructive">Último erro do grupo</p>
              <p className="text-xs text-muted-foreground">{grupo.ultimo_erro}</p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={salvar} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {grupo ? "Atualizar" : "Cadastrar"}
          </Button>
          {grupo && (
            <>
              <Button variant="outline" onClick={executarSweep} disabled={sweeping}>
                {sweeping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Adicionar pendentes agora
              </Button>
              <Button variant="destructive" onClick={excluir}>
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            </>
          )}
        </div>

        {grupo && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="text-sm font-semibold">Membros ({membros.filter(m => m.status === "ok").length}/{instanciasAtivas.length - 1})</h4>
            {membros.length === 0 && naoMembros.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma instância ativa para adicionar.</p>
            )}
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {membros.map(m => {
                const inst = instancias.find(i => i.id === m.instancia_id);
                const sl = STATUS_LABELS[m.status] || { label: m.status, variant: "secondary" as const };
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {m.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                        <span className="truncate">{inst?.nome || m.instancia_id}</span>
                      </div>
                      {m.erro_mensagem && <p className="text-[10px] text-destructive truncate">{m.erro_mensagem}</p>}
                      {m.invite_link && (
                        <a href={m.invite_link} target="_blank" rel="noreferrer" className="text-[10px] text-primary inline-flex items-center gap-1">
                          Abrir convite <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant={sl.variant} className="text-[10px]">{sl.label}</Badge>
                      {m.status !== "ok" && m.status !== "removido_manualmente" && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => tentarAgora(m.instancia_id)}>
                          Tentar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
              {naoMembros.filter(i => !membros.some(m => m.instancia_id === i.id)).map(i => (
                <div key={i.id} className="flex items-center justify-between gap-2 rounded border border-dashed p-2 text-sm">
                  <span className="truncate">{i.nome}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant="outline" className="text-[10px]">Não adicionada</Badge>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => tentarAgora(i.id)}>
                      Adicionar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground pt-2">
              Anti-ban: máx 3 adições/dia, delay 30-120s entre cada uma, apenas das 7h às 21h (exceto domingo).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
