import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, Loader2, Upload, X, Archive, ArchiveRestore } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface MensagemRapida {
  id: string;
  titulo: string;
  tipo: string;
  conteudo: string | null;
  audio_url: string | null;
  botoes_texto: string | null;
  botoes_choices: any[] | null;
  ordem: number;
  arquivado: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  onUpdated: () => void;
}

export function MensagensRapidasDialog({ open, onOpenChange, userId, onUpdated }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<MensagemRapida[]>([]);
  const [loading, setLoading] = useState(false);
  const [editando, setEditando] = useState<MensagemRapida | null>(null);
  const [criando, setCriando] = useState(false);

  // form
  const [titulo, setTitulo] = useState('');
  const [tipo, setTipo] = useState<string>('texto');
  const [conteudo, setConteudo] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [botoesTexto, setBotoesTexto] = useState('');
  const [botoesChoices, setBotoesChoices] = useState<string[]>(['']);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const audioRef = useRef<HTMLInputElement>(null);

  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_mensagens_rapidas')
      .select('*')
      .eq('user_id', userId)
      .order('ordem', { ascending: true });
    setItems((data as MensagemRapida[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchItems();
  }, [open]);

  const resetForm = () => {
    setTitulo('');
    setTipo('texto');
    setConteudo('');
    setAudioUrl('');
    setBotoesTexto('');
    setBotoesChoices(['']);
    setEditando(null);
    setCriando(false);
  };

  const startEdit = (item: MensagemRapida) => {
    setEditando(item);
    setCriando(true);
    setTitulo(item.titulo);
    setTipo(item.tipo);
    setConteudo(item.conteudo || '');
    setAudioUrl(item.audio_url || '');
    setBotoesTexto(item.botoes_texto || '');
    setBotoesChoices(
      item.botoes_choices && Array.isArray(item.botoes_choices)
        ? item.botoes_choices.map((c: any) => c.buttonText || c)
        : ['']
    );
  };

  const handleAudioUpload = async (file: File) => {
    setUploadingAudio(true);
    try {
      const fileName = `mensagens-rapidas/${userId}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from('inbox-media').upload(fileName, file, { contentType: file.type });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('inbox-media').getPublicUrl(fileName);
      setAudioUrl(urlData.publicUrl);
    } catch (err: any) {
      toast({ title: 'Erro ao enviar áudio', description: err.message, variant: 'destructive' });
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleSave = async () => {
    if (!titulo.trim()) return;

    const payload: any = {
      user_id: userId,
      titulo: titulo.trim(),
      tipo,
      conteudo: tipo === 'texto' ? conteudo : tipo === 'botoes' ? null : null,
      audio_url: tipo === 'audio' ? audioUrl : null,
      botoes_texto: tipo === 'botoes' ? botoesTexto : null,
      botoes_choices: tipo === 'botoes'
        ? botoesChoices.filter(c => c.trim()).map(c => ({ buttonText: c.trim() }))
        : null,
      ordem: editando ? editando.ordem : items.length,
    };

    if (editando) {
      const { error } = await supabase
        .from('whatsapp_mensagens_rapidas')
        .update(payload)
        .eq('id', editando.id);
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        return;
      }
    } else {
      const { error } = await supabase
        .from('whatsapp_mensagens_rapidas')
        .insert(payload);
      if (error) {
        toast({ title: 'Erro', description: error.message, variant: 'destructive' });
        return;
      }
    }

    resetForm();
    fetchItems();
    onUpdated();
    toast({ title: editando ? 'Atalho atualizado' : 'Atalho criado' });
  };

  const handleDelete = async (id: string) => {
    await supabase.from('whatsapp_mensagens_rapidas').delete().eq('id', id);
    fetchItems();
    onUpdated();
  };

  const handleToggleArquivar = async (item: MensagemRapida) => {
    const { error } = await supabase
      .from('whatsapp_mensagens_rapidas')
      .update({ arquivado: !item.arquivado } as any)
      .eq('id', item.id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    fetchItems();
    onUpdated();
    toast({ title: item.arquivado ? 'Atalho restaurado' : 'Atalho arquivado' });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Mensagens Rápidas</DialogTitle>
        </DialogHeader>

        {!criando ? (
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum atalho configurado</p>
            ) : (
              items.map(item => (
                <div key={item.id} className={cn("flex items-center gap-2 p-2 rounded-md border border-border bg-card", item.arquivado && "opacity-50")}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate">{item.titulo}</p>
                      {item.arquivado && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Arquivado</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground capitalize">{item.tipo}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleToggleArquivar(item)} title={item.arquivado ? 'Desarquivar' : 'Arquivar'}>
                    {item.arquivado ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
            <Button onClick={() => setCriando(true)} className="w-full" variant="outline">
              <Plus className="h-4 w-4 mr-1" /> Adicionar atalho
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Título (nome do botão)</Label>
              <Input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Ex: Bom dia" />
            </div>

            <div>
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={v => setTipo(v)} disabled={!!editando}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="texto">Texto</SelectItem>
                  <SelectItem value="audio">Áudio</SelectItem>
                  <SelectItem value="botoes">Botões</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {tipo === 'texto' && (
              <div>
                <Label>Mensagem</Label>
                <Textarea value={conteudo} onChange={e => setConteudo(e.target.value)} rows={4} placeholder="Digite a mensagem..." />
              </div>
            )}

            {tipo === 'audio' && (
              <div className="space-y-2">
                <Label>Arquivo de áudio</Label>
                <input
                  type="file"
                  ref={audioRef}
                  className="hidden"
                  accept="audio/*"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleAudioUpload(f);
                    e.target.value = '';
                  }}
                />
                {audioUrl ? (
                  <div className="flex items-center gap-2">
                    <audio src={audioUrl} controls className="flex-1 h-8" />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAudioUrl('')}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => audioRef.current?.click()} disabled={uploadingAudio}>
                    {uploadingAudio ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                    Enviar áudio
                  </Button>
                )}
              </div>
            )}

            {tipo === 'botoes' && (
              <div className="space-y-3">
                <div>
                  <Label>Texto da mensagem</Label>
                  <Textarea value={botoesTexto} onChange={e => setBotoesTexto(e.target.value)} rows={3} placeholder="Texto que acompanha os botões..." />
                </div>
                <div>
                  <Label>Botões (até 3)</Label>
                  <div className="space-y-2">
                    {botoesChoices.map((c, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          value={c}
                          onChange={e => {
                            const next = [...botoesChoices];
                            next[i] = e.target.value;
                            setBotoesChoices(next);
                          }}
                          placeholder={`Botão ${i + 1}`}
                        />
                        {botoesChoices.length > 1 && (
                          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0" onClick={() => setBotoesChoices(botoesChoices.filter((_, j) => j !== i))}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {botoesChoices.length < 3 && (
                      <Button variant="outline" size="sm" onClick={() => setBotoesChoices([...botoesChoices, ''])}>
                        <Plus className="h-3 w-3 mr-1" /> Adicionar botão
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button onClick={handleSave} disabled={!titulo.trim()}>
                {editando ? 'Salvar' : 'Criar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
