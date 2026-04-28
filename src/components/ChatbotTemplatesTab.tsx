import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Save, Loader2, Bot, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import ChatbotTeachChat from './ChatbotTeachChat';

interface Template {
  id: string;
  etapa: string;
  descricao: string;
  template: string;
  ativo: boolean;
  atualizado_em: string;
}

interface Regra {
  id: string;
  gatilho: string;
  resposta: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

const VARIAVEIS = [
  { key: '{primeiro_nome}', desc: 'Primeiro nome capitalizado' },
  { key: '{nome_completo}', desc: 'Nome completo do devedor' },
  { key: '{cpf_formatado}', desc: 'CPF com máscara (123.456.789-00)' },
  { key: '{valor_avista}', desc: 'Valor à vista (50% do saldo)' },
  { key: '{valor_parcela}', desc: 'Valor de cada parcela' },
  { key: '{valor_parcelado}', desc: 'Valor total parcelado (70%)' },
  { key: '{max_parcelas}', desc: 'Quantidade máxima de parcelas' },
  { key: '{credor}', desc: 'Nome do credor' },
  { key: '{telefone_contato}', desc: '(62) 98218-3144' },
];

const ETAPA_LABELS: Record<string, string> = {
  saudacao: '👋 Saudação Inicial',
  confirmacao_cpf: '🔍 Confirmação de CPF',
  proposta: '💰 Proposta de Negociação',
  sem_debitos: '✅ Sem Débitos',
  negacao_identidade: '❌ Negação de Identidade',
  cpf_invalido: '⚠️ CPF Inválido',
  erro_consulta: '🔧 Erro na Consulta',
  escolha_avista: '💵 Escolha À Vista',
  escolha_parcelado: '📋 Escolha Parcelado',
};

export default function ChatbotTemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);
  const [editedTemplates, setEditedTemplates] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
    fetchRegras();
  }, []);

  const fetchTemplates = async () => {
    const { data, error } = await supabase
      .from('chatbot_templates')
      .select('*')
      .order('etapa');
    if (error) {
      toast.error('Erro ao carregar templates');
      console.error(error);
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  };

  const fetchRegras = async () => {
    const { data, error } = await supabase
      .from('chatbot_regras')
      .select('*')
      .order('criado_em', { ascending: false });
    if (error) {
      console.error('Erro ao carregar regras:', error);
    } else {
      setRegras(data || []);
    }
  };

  const handleSave = async (template: Template) => {
    const newText = editedTemplates[template.id];
    if (newText === undefined || newText === template.template) return;

    setSavingId(template.id);
    const { error } = await supabase
      .from('chatbot_templates')
      .update({ template: newText, atualizado_em: new Date().toISOString() })
      .eq('id', template.id);

    if (error) {
      toast.error('Erro ao salvar template');
    } else {
      toast.success('Template salvo!');
      setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, template: newText } : t));
      setEditedTemplates(prev => { const n = { ...prev }; delete n[template.id]; return n; });
    }
    setSavingId(null);
  };

  const handleToggle = async (template: Template) => {
    const { error } = await supabase
      .from('chatbot_templates')
      .update({ ativo: !template.ativo, atualizado_em: new Date().toISOString() })
      .eq('id', template.id);

    if (error) {
      toast.error('Erro ao alterar status');
    } else {
      setTemplates(prev => prev.map(t => t.id === template.id ? { ...t, ativo: !t.ativo } : t));
    }
  };

  const handleDeleteRegra = async (id: string) => {
    const { error } = await supabase
      .from('chatbot_regras')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Erro ao excluir regra');
    } else {
      toast.success('Regra excluída');
      setRegras(prev => prev.filter(r => r.id !== id));
    }
  };

  const handleToggleRegra = async (regra: Regra) => {
    const { error } = await supabase
      .from('chatbot_regras')
      .update({ ativo: !regra.ativo, atualizado_em: new Date().toISOString() })
      .eq('id', regra.id);

    if (error) {
      toast.error('Erro ao alterar status');
    } else {
      setRegras(prev => prev.map(r => r.id === regra.id ? { ...r, ativo: !r.ativo } : r));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chat para ensinar a IA - visível na tela principal */}
      <ChatbotTeachChat onRegraCreated={fetchRegras} />

      {/* Card de regras personalizadas */}
      {regras.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              📚 Regras Aprendidas ({regras.length})
            </CardTitle>
            <CardDescription>
              Regras que a IA aprendeu nas conversas. Ela responde automaticamente quando detecta o gatilho.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {regras.map(regra => (
                <div key={regra.id} className={`flex items-start gap-3 p-3 rounded-lg border ${!regra.ativo ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs shrink-0">Gatilho</Badge>
                      <span className="text-sm font-medium truncate">{regra.gatilho}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary" className="text-xs shrink-0 mt-0.5">Resposta</Badge>
                      <span className="text-sm text-muted-foreground line-clamp-2">{regra.resposta}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch
                      checked={regra.ativo}
                      onCheckedChange={() => handleToggleRegra(regra)}
                    />
                    <Button variant="ghost" size="icon" onClick={() => handleDeleteRegra(regra.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Legenda de variáveis */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4" />
            Variáveis disponíveis
          </CardTitle>
          <CardDescription>
            Use essas variáveis nos templates. Elas serão substituídas automaticamente pelos dados reais do cliente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {VARIAVEIS.map(v => (
              <Badge key={v.key} variant="secondary" className="text-xs cursor-help" title={v.desc}>
                {v.key}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Templates */}
      {templates.map(template => {
        const currentText = editedTemplates[template.id] ?? template.template;
        const hasChanges = editedTemplates[template.id] !== undefined && editedTemplates[template.id] !== template.template;

        return (
          <Card key={template.id} className={!template.ativo ? 'opacity-60' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {ETAPA_LABELS[template.etapa] || template.etapa}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`toggle-${template.id}`} className="text-xs text-muted-foreground">
                    {template.ativo ? 'Ativo' : 'Inativo'}
                  </Label>
                  <Switch
                    id={`toggle-${template.id}`}
                    checked={template.ativo}
                    onCheckedChange={() => handleToggle(template)}
                  />
                </div>
              </div>
              <CardDescription className="text-xs">{template.descricao}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                value={currentText}
                onChange={(e) => setEditedTemplates(prev => ({ ...prev, [template.id]: e.target.value }))}
                rows={4}
                className="text-sm"
              />
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">
                  Atualizado: {new Date(template.atualizado_em).toLocaleString('pt-BR')}
                </span>
                <Button
                  size="sm"
                  onClick={() => handleSave(template)}
                  disabled={!hasChanges || savingId === template.id}
                >
                  {savingId === template.id ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Save className="h-3 w-3 mr-1" />
                  )}
                  Salvar
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
