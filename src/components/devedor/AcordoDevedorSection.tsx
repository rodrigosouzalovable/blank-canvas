import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, Check, X, Handshake, Loader2, Pencil, Save, Trash2, Mic, MicOff, Upload } from 'lucide-react';
import { format } from 'date-fns';

interface AcordoDevedor {
  id: string;
  devedor_cpf: string;
  valor_total: number;
  num_parcelas: number;
  data_primeiro_vencimento: string;
  criado_por: string;
  criado_em: string;
  status: string;
}

interface ParcelaDevedor {
  id: string;
  acordo_id: string;
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
  pago: boolean;
  data_pagamento: string | null;
}

interface ParcelaPreview {
  numero_parcela: number;
  valor: number;
  data_vencimento: string;
}

interface Props {
  cpf: string;
  userId: string;
  contratosIds: string[];
  onContratosArquivados: () => void;
}

export function AcordoDevedorSection({ cpf, userId, contratosIds, onContratosArquivados }: Props) {
  const [acordos, setAcordos] = useState<AcordoDevedor[]>([]);
  const [parcelas, setParcelas] = useState<Record<string, ParcelaDevedor[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Inline editing for existing parcelas
  const [editingParcelaId, setEditingParcelaId] = useState<string | null>(null);
  const [editParcelaValor, setEditParcelaValor] = useState('');
  const [editParcelaData, setEditParcelaData] = useState('');
  const [savingParcela, setSavingParcela] = useState(false);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [observacoes, setObservacoes] = useState('');

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Preview state (after PDF extraction, before saving)
  const [previewParcelas, setPreviewParcelas] = useState<ParcelaPreview[] | null>(null);
  const [previewValorTotal, setPreviewValorTotal] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValor, setEditValor] = useState('');
  const [editData, setEditData] = useState('');

  const cpfNorm = cpf.replace(/\D/g, '');

  const fetchAcordos = useCallback(async () => {
    setLoading(true);
    const { data: acordosData } = await supabase
      .from('acordos_devedor' as any)
      .select('*')
      .eq('devedor_cpf', cpfNorm)
      .order('criado_em', { ascending: false });

    if (acordosData && (acordosData as any[]).length > 0) {
      const typedAcordos = acordosData as unknown as AcordoDevedor[];
      setAcordos(typedAcordos);

      const parcelasMap: Record<string, ParcelaDevedor[]> = {};
      for (const acordo of typedAcordos) {
        const { data: parcelasData } = await supabase
          .from('parcelas_devedor' as any)
          .select('*')
          .eq('acordo_id', acordo.id)
          .order('numero_parcela', { ascending: true });
        if (parcelasData) {
          parcelasMap[acordo.id] = parcelasData as unknown as ParcelaDevedor[];
        }
      }
      setParcelas(parcelasMap);
    } else {
      setAcordos([]);
      setParcelas({});
    }
    setLoading(false);
  }, [cpfNorm]);

  useEffect(() => { fetchAcordos(); }, [fetchAcordos]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      toast.error('Não foi possível acessar o microfone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(audioBlob);
      });

      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audio: base64 },
      });

      if (error) throw error;
      if (data?.text) {
        setObservacoes(prev => prev ? `${prev}\n${data.text}` : data.text);
        toast.success('Áudio transcrito com sucesso!');
      } else {
        toast.error('Não foi possível transcrever o áudio.');
      }
    } catch (err) {
      console.error('Erro ao transcrever:', err);
      toast.error('Erro ao transcrever o áudio.');
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleImportPdf = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.type !== 'application/pdf') {
        toast.error('Selecione um arquivo PDF.');
        return;
      }

      setExtracting(true);
      setDialogOpen(false);
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const { data, error } = await supabase.functions.invoke('extract-pdf-acordo', {
          body: { pdfBase64: base64 },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const extracted = data.data;
        if (!extracted?.parcelas || extracted.parcelas.length === 0) {
          toast.error('Nenhuma parcela encontrada no PDF.');
          return;
        }

        setPreviewParcelas(extracted.parcelas.sort((a: ParcelaPreview, b: ParcelaPreview) => a.numero_parcela - b.numero_parcela));
        setPreviewValorTotal(extracted.valor_total || extracted.parcelas.reduce((s: number, p: ParcelaPreview) => s + p.valor, 0));
        toast.success(`${extracted.parcelas.length} parcelas extraídas do PDF! Revise e confirme.`);
      } catch (err: any) {
        console.error('Erro ao extrair PDF:', err);
        toast.error('Erro ao extrair dados do PDF: ' + (err.message || 'Tente novamente.'));
      } finally {
        setExtracting(false);
      }
    };
    input.click();
  };

  const handleStartEdit = (index: number) => {
    const p = previewParcelas![index];
    setEditingIndex(index);
    setEditValor(String(p.valor));
    setEditData(p.data_vencimento);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null || !previewParcelas) return;
    const updated = [...previewParcelas];
    updated[editingIndex] = {
      ...updated[editingIndex],
      valor: parseFloat(editValor) || updated[editingIndex].valor,
      data_vencimento: editData || updated[editingIndex].data_vencimento,
    };
    setPreviewParcelas(updated);
    setPreviewValorTotal(updated.reduce((s, p) => s + p.valor, 0));
    setEditingIndex(null);
  };

  const handleSalvarAcordoTexto = async () => {
    if (!observacoes.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-texto-acordo', {
        body: { texto: observacoes.trim() },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const extracted = data.data;
      if (!extracted?.parcelas || extracted.parcelas.length === 0) {
        toast.error('Não foi possível identificar parcelas no texto. Detalhe melhor os valores e datas.');
        return;
      }

      setPreviewParcelas(extracted.parcelas.sort((a: ParcelaPreview, b: ParcelaPreview) => a.numero_parcela - b.numero_parcela));
      setPreviewValorTotal(extracted.valor_total || extracted.parcelas.reduce((s: number, p: ParcelaPreview) => s + p.valor, 0));
      setDialogOpen(false);
      toast.success(`${extracted.parcelas.length} parcelas identificadas! Revise e confirme.`);
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao interpretar acordo: ' + (err.message || 'Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmarAcordo = async () => {
    if (!previewParcelas || previewParcelas.length === 0) return;

    setSaving(true);
    try {
      const valorTotal = previewParcelas.reduce((s, p) => s + p.valor, 0);
      const primeiraData = previewParcelas[0].data_vencimento;

      const { data: acordo, error: acordoErr } = await supabase
        .from('acordos_devedor' as any)
        .insert({
          devedor_cpf: cpfNorm,
          valor_total: Math.round(valorTotal * 100) / 100,
          num_parcelas: previewParcelas.length,
          data_primeiro_vencimento: primeiraData,
          criado_por: userId,
          observacoes: observacoes || null,
        } as any)
        .select()
        .single();

      if (acordoErr) throw acordoErr;

      const acordoId = (acordo as any).id;

      const parcelasToInsert = previewParcelas.map(p => ({
        acordo_id: acordoId,
        numero_parcela: p.numero_parcela,
        valor: Math.round(p.valor * 100) / 100,
        data_vencimento: p.data_vencimento,
      }));

      const { error: parcErr } = await supabase
        .from('parcelas_devedor' as any)
        .insert(parcelasToInsert as any);

      if (parcErr) throw parcErr;

      // Contratos NÃO são mais desativados automaticamente ao criar acordo.
      // A desativação deve ser feita manualmente pelo administrador.

      toast.success('Acordo criado com sucesso!');
      setPreviewParcelas(null);
      setPreviewValorTotal(0);
      onContratosArquivados();
      fetchAcordos();
    } catch (err: any) {
      console.error(err);
      toast.error('Erro ao criar acordo: ' + (err.message || 'Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  const togglePago = async (parcela: ParcelaDevedor) => {
    const novoPago = !parcela.pago;
    const { error } = await supabase
      .from('parcelas_devedor' as any)
      .update({
        pago: novoPago,
        data_pagamento: novoPago ? format(new Date(), 'yyyy-MM-dd') : null,
      } as any)
      .eq('id', parcela.id);

    if (error) {
      toast.error('Erro ao atualizar parcela.');
    } else {
      toast.success(novoPago ? 'Parcela marcada como paga!' : 'Pagamento desmarcado.');
      fetchAcordos();
    }
  };

  const handleExcluirAcordo = async (acordoId: string) => {
    try {
      const { error } = await supabase
        .from('acordos_devedor' as any)
        .delete()
        .eq('id', acordoId);
      if (error) throw error;
      toast.success('Acordo excluído com sucesso!');
      fetchAcordos();
    } catch (err: any) {
      toast.error('Erro ao excluir acordo: ' + (err.message || 'Tente novamente.'));
    }
  };

  const handleStartEditParcela = (parcela: ParcelaDevedor) => {
    setEditingParcelaId(parcela.id);
    setEditParcelaValor(String(parcela.valor));
    setEditParcelaData(parcela.data_vencimento);
  };

  const handleCancelEditParcela = () => {
    setEditingParcelaId(null);
  };

  const handleSaveEditParcela = async (parcela: ParcelaDevedor) => {
    const novoValor = parseFloat(editParcelaValor);
    if (isNaN(novoValor) || novoValor <= 0) {
      toast.error('Informe um valor válido.');
      return;
    }
    if (!editParcelaData) {
      toast.error('Informe uma data válida.');
      return;
    }

    setSavingParcela(true);
    try {
      const { error } = await supabase
        .from('parcelas_devedor' as any)
        .update({
          valor: Math.round(novoValor * 100) / 100,
          data_vencimento: editParcelaData,
        } as any)
        .eq('id', parcela.id);

      if (error) throw error;

      // Update valor_total do acordo
      const acordoParcelas = parcelas[parcela.acordo_id] || [];
      const novoTotal = acordoParcelas.reduce((s, p) => {
        if (p.id === parcela.id) return s + novoValor;
        return s + p.valor;
      }, 0);

      await supabase
        .from('acordos_devedor' as any)
        .update({ valor_total: Math.round(novoTotal * 100) / 100 } as any)
        .eq('id', parcela.acordo_id);

      toast.success('Parcela atualizada!');
      setEditingParcelaId(null);
      fetchAcordos();
    } catch (err: any) {
      toast.error('Erro ao atualizar parcela: ' + (err.message || 'Tente novamente.'));
    } finally {
      setSavingParcela(false);
    }
  };

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Handshake className="h-4 w-4" /> Acordos do Cliente
          </CardTitle>
          <Button size="sm" onClick={() => { setObservacoes(''); setDialogOpen(true); }} disabled={extracting}>
            {extracting ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analisando PDF...</>
            ) : (
              <><Plus className="h-4 w-4 mr-1" /> Novo Acordo</>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Preview after PDF extraction */}
        {previewParcelas && (
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold text-sm">Parcelas extraídas do PDF</h3>
                <p className="text-xs text-muted-foreground">
                  {previewParcelas.length} parcelas • Total: {fmtBRL(previewValorTotal)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreviewParcelas(null)}>
                  <X className="h-3 w-3 mr-1" /> Cancelar
                </Button>
                <Button size="sm" onClick={handleConfirmarAcordo} disabled={saving}>
                  {saving ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Salvando...</> : <><Check className="h-3 w-3 mr-1" /> Confirmar Acordo</>}
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs">Nº</TableHead>
                  <TableHead className="text-xs">Vencimento</TableHead>
                  <TableHead className="text-xs">Valor</TableHead>
                  <TableHead className="text-xs text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewParcelas.map((p, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs font-medium">{p.numero_parcela}</TableCell>
                    <TableCell className="text-xs">
                      {editingIndex === idx ? (
                        <Input type="date" value={editData} onChange={(e) => setEditData(e.target.value)} className="h-7 text-xs w-36" />
                      ) : (
                        new Date(p.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {editingIndex === idx ? (
                        <Input type="number" step="0.01" value={editValor} onChange={(e) => setEditValor(e.target.value)} className="h-7 text-xs w-28" />
                      ) : (
                        fmtBRL(p.valor)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingIndex === idx ? (
                        <Button size="sm" className="h-7 text-xs" onClick={handleSaveEdit}>
                          <Save className="h-3 w-3 mr-1" /> Salvar
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleStartEdit(idx)}>
                          <Pencil className="h-3 w-3 mr-1" /> Editar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Existing agreements */}
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-4">Carregando...</p>
        ) : acordos.length === 0 && !previewParcelas ? (
          <p className="text-sm text-muted-foreground text-center py-4">Nenhum acordo registrado.</p>
        ) : (
          <div className="space-y-4">
            {acordos.map((acordo) => {
              const acordoParcelas = parcelas[acordo.id] || [];
              const pagas = acordoParcelas.filter(p => p.pago).length;
              return (
                <div key={acordo.id} className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={acordo.status === 'ativo' ? 'default' : 'secondary'}>{acordo.status}</Badge>
                      <span className="font-semibold">{fmtBRL(acordo.valor_total)}</span>
                      <span className="text-xs text-muted-foreground">
                        {acordo.num_parcelas}x • {pagas}/{acordo.num_parcelas} pagas
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {new Date(acordo.criado_em).toLocaleDateString('pt-BR')}
                      </span>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir Acordo</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir este acordo de {fmtBRL(acordo.valor_total)}? Todas as parcelas serão removidas. Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleExcluirAcordo(acordo.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Nº</TableHead>
                        <TableHead className="text-xs">Vencimento</TableHead>
                        <TableHead className="text-xs">Valor</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs text-right">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {acordoParcelas.map((parcela) => (
                        <TableRow key={parcela.id} className={parcela.pago ? 'bg-green-50 dark:bg-green-950/20' : ''}>
                          <TableCell className="text-xs font-medium">{parcela.numero_parcela}</TableCell>
                          <TableCell className="text-xs">
                            {editingParcelaId === parcela.id ? (
                              <Input type="date" value={editParcelaData} onChange={(e) => setEditParcelaData(e.target.value)} className="h-7 text-xs w-36" />
                            ) : (
                              new Date(parcela.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {editingParcelaId === parcela.id ? (
                              <Input type="number" step="0.01" value={editParcelaValor} onChange={(e) => setEditParcelaValor(e.target.value)} className="h-7 text-xs w-28" />
                            ) : (
                              fmtBRL(parcela.valor)
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={parcela.pago ? 'default' : 'secondary'} className="text-xs">
                              {parcela.pago ? 'Pago' : 'Pendente'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {editingParcelaId === parcela.id ? (
                                <>
                                  <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveEditParcela(parcela)} disabled={savingParcela}>
                                    {savingParcela ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Save className="h-3 w-3 mr-1" /> Salvar</>}
                                  </Button>
                                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCancelEditParcela} disabled={savingParcela}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  {!parcela.pago && (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleStartEditParcela(parcela)}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button
                                    variant={parcela.pago ? 'outline' : 'default'}
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => togglePago(parcela)}
                                  >
                                    {parcela.pago ? (
                                      <><X className="h-3 w-3 mr-1" /> Desmarcar</>
                                    ) : (
                                      <><Check className="h-3 w-3 mr-1" /> Marcar Pago</>
                                    )}
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Dialog Novo Acordo */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Acordo</DialogTitle>
            <DialogDescription>
              Descreva a negociação feita com o cliente. Você pode salvar apenas as observações ou importar o PDF do acordo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Detalhes da negociação</Label>
                <Button
                  type="button"
                  variant={isRecording ? 'destructive' : 'outline'}
                  size="sm"
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isTranscribing}
                >
                  {isTranscribing ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Transcrevendo...</>
                  ) : isRecording ? (
                    <><MicOff className="h-4 w-4 mr-1" /> Parar</>
                  ) : (
                    <><Mic className="h-4 w-4 mr-1" /> Gravar Áudio</>
                  )}
                </Button>
              </div>
              <Textarea
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Descreva como foi a negociação, valores combinados, condições especiais..."
                rows={5}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSalvarAcordoTexto}
                disabled={saving || !observacoes.trim()}
                variant="outline"
                className="w-full"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando com IA...</>
                ) : (
                  <><Save className="h-4 w-4 mr-2" /> Gerar Parcelas com IA</>
                )}
              </Button>
              <Button onClick={handleImportPdf} disabled={extracting} className="w-full">
                <Upload className="h-4 w-4 mr-2" /> Importar PDF do Acordo
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
