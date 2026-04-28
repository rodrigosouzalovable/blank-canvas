import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, MessageSquare, Volume2, Upload, X, Loader2, Image, Smile } from 'lucide-react';

interface Dialogo {
  id: string;
  tipo: string;
  conteudo: string;
  conteudo_resposta_esperada: string | null;
  fase_minima: number;
  ativo: boolean;
  tags: string[] | null;
}

const EMPTY_FORM = { tipo: 'texto', conteudo: '', conteudo_resposta_esperada: '', fase_minima: 1, ativo: true };

export default function AquecimentoDialogosTab() {
  const [dialogos, setDialogos] = useState<Dialogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadDialogos(); }, []);

  async function loadDialogos() {
    setLoading(true);
    const { data } = await supabase.from('whatsapp_aquecimento_dialogos' as any).select('*').order('fase_minima', { ascending: true });
    if (data) setDialogos(data as any[]);
    setLoading(false);
  }

  function openNew(tipo?: string) {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, tipo: tipo || 'texto' });
    setAudioFiles([]);
    setImageFiles([]);
    setDialogOpen(true);
  }

  function openEdit(d: Dialogo) {
    setEditingId(d.id);
    setForm({ tipo: d.tipo, conteudo: d.conteudo, conteudo_resposta_esperada: d.conteudo_resposta_esperada || '', fase_minima: d.fase_minima, ativo: d.ativo });
    setAudioFiles([]);
    setImageFiles([]);
    setDialogOpen(true);
  }

  function handleAudioSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setAudioFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function removeAudioFile(index: number) {
    setAudioFiles(prev => prev.filter((_, i) => i !== index));
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      setImageFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  }

  function removeImageFile(index: number) {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function uploadFile(file: File, folder: string): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'bin';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('campaign-audio').upload(path, file);
    if (error) {
      console.error('Upload error:', error);
      return null;
    }
    const { data: urlData } = supabase.storage.from('campaign-audio').getPublicUrl(path);
    return urlData.publicUrl;
  }

  async function uploadAudio(file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'mp3';
    const path = `aquecimento/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('campaign-audio').upload(path, file);
    if (error) {
      console.error('Upload error:', error);
      return null;
    }
    const { data: urlData } = supabase.storage.from('campaign-audio').getPublicUrl(path);
    return urlData.publicUrl;
  }

  async function handleSave() {
    const isFileType = form.tipo === 'audio' || form.tipo === 'imagem';
    const files = form.tipo === 'audio' ? audioFiles : imageFiles;
    const folder = form.tipo === 'audio' ? 'aquecimento' : 'aquecimento-imagens';
    const label = form.tipo === 'audio' ? 'áudio' : 'imagem';

    if (isFileType && !editingId) {
      if (files.length === 0) {
        toast({ title: `Selecione pelo menos um ${label}`, variant: 'destructive' });
        return;
      }
      setUploading(true);
      let created = 0;
      for (const file of files) {
        const url = await uploadFile(file, folder);
        if (url) {
          await supabase.from('whatsapp_aquecimento_dialogos' as any).insert({
            tipo: form.tipo,
            conteudo: url,
            conteudo_resposta_esperada: form.conteudo_resposta_esperada || null,
            fase_minima: form.fase_minima,
            ativo: form.ativo,
          } as any);
          created++;
        }
      }
      setUploading(false);
      toast({ title: `${created} ${label}(s) adicionado(s)!` });
    } else if (isFileType && editingId) {
      setUploading(true);
      let conteudo = form.conteudo;
      if (files.length > 0) {
        const url = await uploadFile(files[0], folder);
        if (url) conteudo = url;
      }
      await supabase.from('whatsapp_aquecimento_dialogos' as any).update({
        tipo: form.tipo,
        conteudo,
        conteudo_resposta_esperada: form.conteudo_resposta_esperada || null,
        fase_minima: form.fase_minima,
        ativo: form.ativo,
      } as any).eq('id', editingId);
      setUploading(false);
      toast({ title: 'Diálogo atualizado!' });
    } else {
      if (!form.conteudo.trim()) {
        toast({ title: 'Preencha o conteúdo', variant: 'destructive' });
        return;
      }
      const payload = {
        tipo: form.tipo,
        conteudo: form.conteudo,
        conteudo_resposta_esperada: form.conteudo_resposta_esperada || null,
        fase_minima: form.fase_minima,
        ativo: form.ativo,
      };
      if (editingId) {
        await supabase.from('whatsapp_aquecimento_dialogos' as any).update(payload as any).eq('id', editingId);
        toast({ title: 'Diálogo atualizado!' });
      } else {
        await supabase.from('whatsapp_aquecimento_dialogos' as any).insert(payload as any);
        toast({ title: 'Diálogo criado!' });
      }
    }
    setDialogOpen(false);
    setAudioFiles([]);
    setImageFiles([]);
    loadDialogos();
  }

  async function handleDelete(id: string) {
    await supabase.from('whatsapp_aquecimento_dialogos' as any).delete().eq('id', id);
    toast({ title: 'Diálogo removido' });
    loadDialogos();
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    await supabase.from('whatsapp_aquecimento_dialogos' as any).update({ ativo } as any).eq('id', id);
    loadDialogos();
  }

  const tipos = [
    { value: 'texto', label: '📝 Texto', icon: MessageSquare },
    { value: 'audio', label: '🎙️ Áudio', icon: Volume2 },
    { value: 'imagem', label: '🖼️ Imagem', icon: Image },
    { value: 'sticker', label: '😄 Sticker', icon: Smile },
  ];

  const countByType = (tipo: string) => dialogos.filter(d => d.tipo === tipo).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Mensagens e Áudios do Aquecimento</CardTitle>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1"><Plus className="h-4 w-4" /> Adicionar Diálogo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? 'Editar Diálogo' : 'Novo Diálogo'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Tipo de Mensagem</Label>
                <Select value={form.tipo} onValueChange={v => { setForm(f => ({ ...f, tipo: v })); setAudioFiles([]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="texto">📝 Texto</SelectItem>
                    <SelectItem value="audio">🎙️ Áudio</SelectItem>
                    <SelectItem value="imagem">🖼️ Imagem</SelectItem>
                    <SelectItem value="sticker">😄 Sticker</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.tipo === 'audio' ? (
                <div className="space-y-2">
                  <Label>Arquivos de Áudio</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.ogg,.wav,.m4a,.opus"
                    multiple={!editingId}
                    className="hidden"
                    onChange={handleAudioSelect}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 border-dashed h-16"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-5 w-5" />
                    {editingId ? 'Selecionar novo áudio (opcional)' : 'Clique para selecionar áudios'}
                  </Button>
                  {audioFiles.length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {audioFiles.map((file, i) => (
                        <div key={i} className="flex items-center justify-between bg-muted rounded px-3 py-1.5 text-sm">
                          <span className="truncate mr-2">🎵 {file.name}</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removeAudioFile(i)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!editingId && (
                    <p className="text-xs text-muted-foreground">
                      Cada arquivo será criado como um diálogo separado. Formatos aceitos: MP3, OGG, WAV, M4A, OPUS.
                    </p>
                  )}
                  {editingId && form.conteudo && (
                    <p className="text-xs text-muted-foreground">
                      Áudio atual: <a href={form.conteudo} target="_blank" rel="noopener noreferrer" className="underline text-primary">ouvir</a>
                    </p>
                  )}
                </div>
              ) : form.tipo === 'imagem' ? (
                <div className="space-y-2">
                  <Label>Arquivos de Imagem</Label>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*,.jpg,.jpeg,.png,.gif,.webp"
                    multiple={!editingId}
                    className="hidden"
                    onChange={handleImageSelect}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2 border-dashed h-16"
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <Upload className="h-5 w-5" />
                    {editingId ? 'Selecionar nova imagem (opcional)' : 'Clique para selecionar imagens'}
                  </Button>
                  {imageFiles.length > 0 && (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {imageFiles.map((file, i) => (
                        <div key={i} className="flex items-center justify-between bg-muted rounded px-3 py-1.5 text-sm">
                          <span className="truncate mr-2">🖼️ {file.name}</span>
                          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removeImageFile(i)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!editingId && (
                    <p className="text-xs text-muted-foreground">
                      Cada arquivo será criado como um diálogo separado. Formatos aceitos: JPG, PNG, GIF, WEBP.
                    </p>
                  )}
                  {editingId && form.conteudo && (
                    <p className="text-xs text-muted-foreground">
                      Imagem atual: <a href={form.conteudo} target="_blank" rel="noopener noreferrer" className="underline text-primary">ver</a>
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>{form.tipo === 'texto' ? 'Mensagem de Texto' : 'Conteúdo / URL'}</Label>
                  <Textarea
                    value={form.conteudo}
                    onChange={e => setForm(f => ({ ...f, conteudo: e.target.value }))}
                    placeholder={form.tipo === 'texto' ? 'Ex: Oi, tudo bem? Como vai?' : 'Ex: https://exemplo.com/sticker.webp'}
                    rows={3}
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label>Resposta Esperada <span className="text-muted-foreground text-xs">(opcional)</span></Label>
                <Textarea
                  value={form.conteudo_resposta_esperada}
                  onChange={e => setForm(f => ({ ...f, conteudo_resposta_esperada: e.target.value }))}
                  placeholder="Ex: Tudo bem sim! E você?"
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">Se preenchido, o número que receber a mensagem responderá com este texto.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Fase Mínima</Label>
                  <Select value={String(form.fase_minima)} onValueChange={v => setForm(f => ({ ...f, fase_minima: Number(v) }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Fase 1 - Início</SelectItem>
                      <SelectItem value="2">Fase 2</SelectItem>
                      <SelectItem value="3">Fase 3</SelectItem>
                      <SelectItem value="4">Fase 4</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Esta mensagem só será usada a partir desta fase.</p>
                </div>
                <div className="space-y-1">
                  <Label>Ativo</Label>
                  <div className="flex items-center gap-2 pt-1">
                    <Switch checked={form.ativo} onCheckedChange={v => setForm(f => ({ ...f, ativo: v }))} />
                    <span className="text-sm text-muted-foreground">{form.ativo ? 'Sim' : 'Não'}</span>
                  </div>
                </div>
              </div>
              <Button onClick={handleSave} className="w-full" disabled={uploading}>
                {uploading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enviando...</> : editingId ? 'Salvar Alterações' : 'Criar Diálogo'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-center text-muted-foreground py-8">Carregando...</p>
        ) : (
          <Tabs defaultValue="texto" onValueChange={(v) => setForm(f => ({ ...f, tipo: v }))}>
            <TabsList className="mb-4">
              {tipos.map(t => (
                <TabsTrigger key={t.value} value={t.value} className="gap-1.5">
                  {t.label}
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{countByType(t.value)}</Badge>
                </TabsTrigger>
              ))}
            </TabsList>
            {tipos.map(t => {
              const filtered = dialogos.filter(d => d.tipo === t.value);
              return (
                <TabsContent key={t.value} value={t.value}>
                  {filtered.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum diálogo de {t.label.split(' ')[1]?.toLowerCase()} cadastrado.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Conteúdo</TableHead>
                          <TableHead>Resposta Esperada</TableHead>
                          <TableHead>Fase Mín.</TableHead>
                          <TableHead>Ativo</TableHead>
                          <TableHead>Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map(d => (
                          <TableRow key={d.id}>
                            <TableCell className="max-w-[250px] truncate text-sm">{d.conteudo}</TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">{d.conteudo_resposta_esperada || '-'}</TableCell>
                            <TableCell>Fase {d.fase_minima}</TableCell>
                            <TableCell>
                              <Switch checked={d.ativo} onCheckedChange={v => toggleAtivo(d.id, v)} />
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>
                                <Button size="icon" variant="ghost" onClick={() => handleDelete(d.id)} className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
