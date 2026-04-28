import { useState, useEffect, useRef } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { ArrowLeft, Mic, MicOff, Trash2, Check, Calendar, User, Phone, FileText, Loader2, Plus, MessageCircle, DollarSign, Hash, CalendarDays, UserCircle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const retornoSchema = z.object({
  clienteNome: z.string().min(2, 'Nome do cliente é obrigatório').max(200, 'Nome muito longo'),
  clienteCpf: z.string().min(11, 'CPF é obrigatório').max(14, 'CPF inválido'),
  clienteTelefone: z.string().min(10, 'Telefone é obrigatório').max(15, 'Telefone inválido'),
  observacao: z.string().max(2000, 'Observação muito longa').optional(),
  dataRetorno: z.string().min(1, 'Data de retorno é obrigatória'),
  valorTotal: z.number().positive('Valor total deve ser positivo').optional().nullable(),
  numeroParcelas: z.number().int().min(1, 'Mínimo 1 parcela').optional().nullable(),
  valorPrimeiraParcela: z.number().positive('Valor deve ser positivo').optional().nullable(),
  valorDemaisParcelas: z.number().positive('Valor deve ser positivo').optional().nullable(),
  dataPrimeiroPagamento: z.string().optional().nullable(),
});

// Funções de máscara
const formatNome = (value: string) => {
  return value.replace(/[^a-zA-ZÀ-ÿ\s]/g, '');
};

const formatCpf = (value: string) => {
  const numbers = value.replace(/\D/g, '').slice(0, 11);
  return numbers
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const formatPhone = (value: string) => {
  const numbers = value.replace(/\D/g, '').slice(0, 11);
  if (numbers.length <= 10) {
    return numbers
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return numbers
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
};

// Função para formatar valor monetário em tempo real
const formatCurrencyInput = (value: string): string => {
  // Remove tudo que não é número
  const numbers = value.replace(/\D/g, '');
  
  if (!numbers) return '';
  
  // Converte para número com 2 casas decimais
  const amount = parseInt(numbers, 10) / 100;
  
  // Formata para moeda brasileira
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

// Função para converter string formatada para número
const parseCurrencyToNumber = (value: string): number => {
  const numbers = value.replace(/\D/g, '');
  if (!numbers) return 0;
  return parseInt(numbers, 10) / 100;
};

// Função para formatar número para exibição
const formatCurrencyDisplay = (value: number | null): string => {
  if (value === null || value === undefined) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
};

// Função para calcular valores de parcela automaticamente
const calcularValoresParcelas = (valorTotalStr: string, parcelasStr: string): { valorPrimeiraParcela: string; valorDemaisParcelas: string } => {
  const valorTotal = parseCurrencyToNumber(valorTotalStr);
  const numParcelas = parseInt(parcelasStr) || 0;
  
  if (valorTotal > 0 && numParcelas > 1) {
    const valorParcela = valorTotal / numParcelas;
    const valorFormatado = formatCurrencyDisplay(Math.round(valorParcela * 100) / 100);
    return { valorPrimeiraParcela: valorFormatado, valorDemaisParcelas: valorFormatado };
  }
  
  return { valorPrimeiraParcela: '', valorDemaisParcelas: '' };
};

interface Retorno {
  id: string;
  user_id: string;
  cliente_nome: string;
  cliente_cpf: string;
  cliente_telefone: string;
  observacao: string | null;
  data_retorno: string;
  status: string;
  criado_em: string;
  valor_total: number | null;
  numero_parcelas: number | null;
  valor_primeira_parcela: number | null;
  valor_demais_parcelas: number | null;
  data_primeiro_pagamento: string | null;
  whatsapp_enviado_em: string | null;
  profiles?: {
    nome: string | null;
  };
}

export default function Retornos() {
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [retornos, setRetornos] = useState<Retorno[]>([]);
  const [loadingRetornos, setLoadingRetornos] = useState(true);
  const [nomeError, setNomeError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);
  
  // Admin filter states
  const [funcionarios, setFuncionarios] = useState<{ id: string; nome: string }[]>([]);
  const [funcionarioFilter, setFuncionarioFilter] = useState<string>('todos');

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [form, setForm] = useState({
    clienteNome: '',
    clienteCpf: '',
    clienteTelefone: '',
    observacao: '',
    dataRetorno: '',
    horaRetorno: '',
    valorTotal: '',
    numeroParcelas: '',
    valorPrimeiraParcela: '',
    valorDemaisParcelas: '',
    dataPrimeiroPagamento: '',
  });

  // Load retornos when user and role are ready
  useEffect(() => {
    if (user && !roleLoading) {
      fetchRetornos();
    }
  }, [user, roleLoading, isAdmin]);

  // Load funcionarios list for admin filter
  useEffect(() => {
    if (isAdmin) {
      fetchFuncionarios();
    }
  }, [isAdmin]);

  const fetchFuncionarios = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, nome')
      .order('nome');
    
    if (data) setFuncionarios(data.filter(f => f.nome) as { id: string; nome: string }[]);
  };

  const fetchRetornos = async () => {
    try {
      // Admin vê todos, funcionário vê apenas os seus
      let query = supabase
        .from('retornos')
        .select('*')
        .order('data_retorno', { ascending: true });

      if (!isAdmin && user) {
        query = query.eq('user_id', user.id);
      }

      const { data: retornosData, error: retornosError } = await query;

      if (retornosError) throw retornosError;

      // Buscar todos os profiles para mapear id -> nome
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, nome');

      // Mapear profiles por id (que corresponde ao user_id)
      const profilesMap = new Map<string, string>();
      (profilesData || []).forEach((p: { id: string; nome: string }) => {
        if (p.nome) profilesMap.set(p.id, p.nome);
      });

      // Combinar retornos com profiles
      const retornosComProfiles = (retornosData || []).map(r => ({
        ...r,
        profiles: profilesMap.has(r.user_id) ? { nome: profilesMap.get(r.user_id) || null } : undefined
      }));

      setRetornos(retornosComProfiles as Retorno[]);
    } catch (error) {
      console.error('Error fetching retornos:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os retornos.',
      });
    } finally {
      setLoadingRetornos(false);
    }
  };

  // Filter retornos based on selected funcionario
  const retornosFiltrados = funcionarioFilter === 'todos'
    ? retornos
    : retornos.filter(r => r.user_id === funcionarioFilter);

  const handleNomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const filteredValue = formatNome(rawValue);

    if (/\d/.test(rawValue)) {
      setNomeError('Este campo aceita apenas letras');
      setTimeout(() => setNomeError(''), 3000);
    }

    setForm({ ...form, clienteNome: filteredValue });
  };

  // Audio recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);

      toast({
        title: 'Gravando...',
        description: 'Fale sua observação. Clique novamente para parar.',
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível acessar o microfone. Verifique as permissões.',
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsTranscribing(true);
    try {
      const base64Audio = await blobToBase64(audioBlob);

      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { audio: base64Audio },
      });

      if (error) throw error;

      if (data?.text) {
        setForm(prev => ({
          ...prev,
          observacao: prev.observacao ? `${prev.observacao} ${data.text}` : data.text,
        }));
        toast({
          title: 'Transcrição concluída',
          description: 'O áudio foi transcrito com sucesso.',
        });
      } else if (data?.error) {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Transcription error:', error);
      toast({
        variant: 'destructive',
        title: 'Erro na transcrição',
        description: error instanceof Error ? error.message : 'Não foi possível transcrever o áudio.',
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  // Verifica se todos os campos obrigatórios estão preenchidos
  const isFormValid = () => {
    const cpfDigits = form.clienteCpf.replace(/\D/g, '');
    const telefoneDigits = form.clienteTelefone.replace(/\D/g, '');
    
    // Apenas campos obrigatórios: dados do cliente + data de retorno
    return (
      form.clienteNome.trim().length >= 2 &&
      cpfDigits.length === 11 &&
      telefoneDigits.length === 11 &&
      form.dataRetorno
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsLoading(true);

    try {
      const numParcelas = parseInt(form.numeroParcelas) || null;
      const valorTotalNum = parseCurrencyToNumber(form.valorTotal) || null;

      // Calcular valores de parcela se tiver dados do acordo
      let valorPrimeiraParcela = null;
      let valorDemaisParcelas = null;
      
      if (valorTotalNum && numParcelas) {
        if (numParcelas === 1) {
          valorPrimeiraParcela = valorTotalNum;
          valorDemaisParcelas = valorTotalNum;
        } else {
          valorPrimeiraParcela = parseCurrencyToNumber(form.valorPrimeiraParcela) || null;
          valorDemaisParcelas = parseCurrencyToNumber(form.valorDemaisParcelas) || null;
        }
      }

      const validated = retornoSchema.parse({
        clienteNome: form.clienteNome.trim(),
        clienteCpf: form.clienteCpf.trim(),
        clienteTelefone: form.clienteTelefone.trim(),
        observacao: form.observacao.trim() || undefined,
        dataRetorno: form.dataRetorno,
        valorTotal: valorTotalNum,
        numeroParcelas: numParcelas,
        valorPrimeiraParcela: valorPrimeiraParcela,
        valorDemaisParcelas: valorDemaisParcelas,
        dataPrimeiroPagamento: form.dataPrimeiroPagamento || null,
      });

      // Concatenar data + hora para salvar como timestamptz
      const dataRetornoFinal = form.horaRetorno 
        ? `${validated.dataRetorno}T${form.horaRetorno}:00` 
        : validated.dataRetorno;

      const { error } = await supabase.from('retornos').insert({
        user_id: user.id,
        cliente_nome: validated.clienteNome,
        cliente_cpf: validated.clienteCpf,
        cliente_telefone: validated.clienteTelefone,
        observacao: validated.observacao || null,
        data_retorno: dataRetornoFinal,
        valor_total: validated.valorTotal,
        numero_parcelas: validated.numeroParcelas,
        valor_primeira_parcela: validated.valorPrimeiraParcela,
        valor_demais_parcelas: validated.valorDemaisParcelas,
        data_primeiro_pagamento: validated.dataPrimeiroPagamento,
      });

      if (error) throw error;

      toast({
        title: 'Retorno cadastrado!',
        description: `Retorno para ${validated.clienteNome} agendado com sucesso.`,
      });

      // Reset form
      setForm({
        clienteNome: '',
        clienteCpf: '',
        clienteTelefone: '',
        observacao: '',
        dataRetorno: '',
        horaRetorno: '',
        valorTotal: '',
        numeroParcelas: '',
        valorPrimeiraParcela: '',
        valorDemaisParcelas: '',
        dataPrimeiroPagamento: '',
      });

      // Hide form and refresh list
      setShowForm(false);
      fetchRetornos();
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          variant: 'destructive',
          title: 'Dados inválidos',
          description: err.errors[0].message,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro ao cadastrar retorno',
          description: 'Tente novamente mais tarde.',
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMarcarConcluido = async (retornoId: string) => {
    try {
      const { error } = await supabase
        .from('retornos')
        .update({ status: 'concluido' })
        .eq('id', retornoId);

      if (error) throw error;

      setRetornos(prev =>
        prev.map(r => (r.id === retornoId ? { ...r, status: 'concluido' } : r))
      );

      toast({
        title: 'Retorno concluído',
        description: 'O retorno foi marcado como concluído.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível atualizar o retorno.',
      });
    }
  };

  const handleDeletar = async (retornoId: string) => {
    try {
      const { error } = await supabase
        .from('retornos')
        .delete()
        .eq('id', retornoId);

      if (error) throw error;

      setRetornos(prev => prev.filter(r => r.id !== retornoId));

      toast({
        title: 'Retorno excluído',
        description: 'O retorno foi removido com sucesso.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível excluir o retorno.',
      });
    }
  };

  const handleEnviarWhatsApp = async (retorno: Retorno) => {
    if (!retorno.valor_total || !retorno.numero_parcelas || !retorno.valor_primeira_parcela || !retorno.valor_demais_parcelas || !retorno.data_primeiro_pagamento) {
      toast({
        variant: 'destructive',
        title: 'Dados incompletos',
        description: 'Este retorno não possui todos os dados do acordo.',
      });
      return;
    }

    setSendingWhatsApp(retorno.id);

    try {
      const primeiroNome = retorno.cliente_nome.split(' ')[0];
      const dataPagamentoFormatada = format(
        new Date(retorno.data_primeiro_pagamento + 'T00:00:00'),
        "dd/MM/yyyy"
      );

      let mensagem: string;

      if (retorno.numero_parcelas === 1) {
        mensagem = `Olá ${primeiroNome}, tudo bem? Sou do departamento de confirmação de acordos das Lojas Novo Mundo, e estou entrando em contato para finalizamos o acordo que negociamos no valor de ${formatCurrencyDisplay(retorno.valor_total)} para o dia ${dataPagamentoFormatada}. Posso enviar o boleto para pagamento?`;
      } else {
        const parcelasRestantes = retorno.numero_parcelas - 1;
        mensagem = `Olá ${primeiroNome}, tudo bem? Sou do departamento de confirmação de acordos das Lojas Novo Mundo, e estou entrando em contato para finalizamos o acordo que negociamos no valor de ${formatCurrencyDisplay(retorno.valor_primeira_parcela)} para o dia ${dataPagamentoFormatada} e o restante em ${parcelasRestantes} DE ${formatCurrencyDisplay(retorno.valor_demais_parcelas)} para o dia ${dataPagamentoFormatada}. Gostaria de alterar essa negociação ou posso enviar o boleto para pagamento?`;
      }

      // Fetch active instance for credentials
      const { data: instData } = await supabase
        .from('user_whatsapp_instances')
        .select('id, server_url, instance_token')
        .eq('user_id', user!.id)
        .eq('ativo', true)
        .eq('apenas_lembretes', false)
        .limit(1)
        .maybeSingle();

      const sendBody: any = { telefone: retorno.cliente_telefone, mensagem };
      if (instData) {
        sendBody.uazapi_server_url = instData.server_url;
        sendBody.uazapi_instance_token = instData.instance_token;
        sendBody.instancia_id = instData.id;
      }

      const { error } = await supabase.functions.invoke('send-whatsapp', {
        body: sendBody,
      });

      if (error) throw error;

      // Atualizar o campo whatsapp_enviado_em
      await supabase
        .from('retornos')
        .update({ whatsapp_enviado_em: new Date().toISOString() })
        .eq('id', retorno.id);

      // Atualizar estado local
      setRetornos(prev =>
        prev.map(r => r.id === retorno.id ? { ...r, whatsapp_enviado_em: new Date().toISOString() } : r)
      );

      toast({
        title: 'Mensagem enviada!',
        description: `WhatsApp enviado para ${primeiroNome}.`,
      });
    } catch (error) {
      console.error('WhatsApp error:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar WhatsApp',
        description: 'Não foi possível enviar a mensagem. Tente novamente.',
      });
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const getStatusBadge = (status: string, dataRetorno: string) => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dataRet = new Date(dataRetorno);
    // Use UTC values to build a local-only date for comparison
    const dataRetDate = new Date(dataRet.getUTCFullYear(), dataRet.getUTCMonth(), dataRet.getUTCDate());

    if (status === 'concluido') {
      return <Badge variant="secondary">Concluído</Badge>;
    }

    if (dataRetDate < hoje) {
      return <Badge variant="destructive">Atrasado</Badge>;
    }

    if (dataRetDate.getTime() === hoje.getTime()) {
      return <Badge className="bg-amber-500 hover:bg-amber-600">Hoje</Badge>;
    }

    return <Badge>Pendente</Badge>;
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold">Retornos</h1>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <Select value={funcionarioFilter} onValueChange={setFuncionarioFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrar por funcionário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os funcionários</SelectItem>
                  {funcionarios.map(func => (
                    <SelectItem key={func.id} value={func.id}>
                      {func.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {retornos.length > 0 && !showForm && (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Agendar Retorno
              </Button>
            )}
          </div>
        </div>

        {(retornos.length === 0 || showForm) && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {showForm && (
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
            )}
            <Card>
              <CardHeader>
                <CardTitle>Dados do Cliente</CardTitle>
                <CardDescription>Informações do cliente para retorno</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clienteNome">Nome do Cliente *</Label>
                  <Input
                    id="clienteNome"
                    placeholder="Nome completo do cliente"
                    value={form.clienteNome}
                    onChange={handleNomeChange}
                    required
                    className={nomeError ? 'border-destructive' : ''}
                  />
                  {nomeError && (
                    <p className="text-sm text-destructive">{nomeError}</p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clienteCpf">CPF *</Label>
                    <Input
                      id="clienteCpf"
                      placeholder="000.000.000-00"
                      value={form.clienteCpf}
                      onChange={(e) => setForm({ ...form, clienteCpf: formatCpf(e.target.value) })}
                      maxLength={14}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clienteTelefone">Telefone *</Label>
                    <Input
                      id="clienteTelefone"
                      placeholder="(00) 00000-0000"
                      value={form.clienteTelefone}
                      onChange={(e) => setForm({ ...form, clienteTelefone: formatPhone(e.target.value) })}
                      maxLength={15}
                      required
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Card de Dados do Acordo */}
            <Card>
              <CardHeader>
                <CardTitle>Dados do Acordo</CardTitle>
                <CardDescription>Informações do acordo negociado (opcional)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="valorTotal">Valor Total</Label>
                    <Input
                      id="valorTotal"
                      placeholder="R$ 0,00"
                      value={form.valorTotal}
                      onChange={(e) => {
                        const novoValor = formatCurrencyInput(e.target.value);
                        const calculados = calcularValoresParcelas(novoValor, form.numeroParcelas);
                        setForm(prev => ({
                          ...prev,
                          valorTotal: novoValor,
                          ...(calculados.valorPrimeiraParcela && calculados),
                        }));
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="numeroParcelas">Número de Parcelas</Label>
                    <Input
                      id="numeroParcelas"
                      type="number"
                      min="1"
                      placeholder="1"
                      value={form.numeroParcelas}
                      onChange={(e) => {
                        const novaParcela = e.target.value;
                        const calculados = calcularValoresParcelas(form.valorTotal, novaParcela);
                        setForm(prev => ({
                          ...prev,
                          numeroParcelas: novaParcela,
                          ...(calculados.valorPrimeiraParcela && calculados),
                        }));
                      }}
                    />
                  </div>
                </div>

                {parseInt(form.numeroParcelas) > 1 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="valorPrimeiraParcela">Valor da Primeira Parcela</Label>
                      <Input
                        id="valorPrimeiraParcela"
                        placeholder="R$ 0,00"
                        value={form.valorPrimeiraParcela}
                        onChange={(e) => setForm({ ...form, valorPrimeiraParcela: formatCurrencyInput(e.target.value) })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="valorDemaisParcelas">Valor das Demais Parcelas</Label>
                      <Input
                        id="valorDemaisParcelas"
                        placeholder="R$ 0,00"
                        value={form.valorDemaisParcelas}
                        onChange={(e) => setForm({ ...form, valorDemaisParcelas: formatCurrencyInput(e.target.value) })}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="dataPrimeiroPagamento">Data do Primeiro Pagamento</Label>
                  <Input
                    id="dataPrimeiroPagamento"
                    type="date"
                    value={form.dataPrimeiroPagamento}
                    onChange={(e) => setForm({ ...form, dataPrimeiroPagamento: e.target.value })}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lembrete de Retorno</CardTitle>
                <CardDescription>Adicione uma observação e a data de retorno</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="observacao">Observação</Label>
                  <div className="relative">
                    <Textarea
                      id="observacao"
                      placeholder="Digite ou grave um áudio com sua observação de retorno..."
                      value={form.observacao}
                      onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                      rows={4}
                      className="pr-12"
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant={isRecording ? 'destructive' : 'outline'}
                      className="absolute right-2 top-2"
                      onClick={isRecording ? stopRecording : startRecording}
                      disabled={isTranscribing}
                    >
                      {isTranscribing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isRecording ? (
                        <MicOff className="h-4 w-4" />
                      ) : (
                        <Mic className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {isRecording && (
                    <p className="text-sm text-muted-foreground animate-pulse">
                      🔴 Gravando... Clique no microfone para parar
                    </p>
                  )}
                  {isTranscribing && (
                    <p className="text-sm text-muted-foreground">
                      Transcrevendo áudio...
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="dataRetorno">Data de Retorno *</Label>
                    <Input
                      id="dataRetorno"
                      type="date"
                      value={form.dataRetorno}
                      onChange={(e) => setForm({ ...form, dataRetorno: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="horaRetorno">Horário do Retorno</Label>
                    <Input
                      id="horaRetorno"
                      type="time"
                      value={form.horaRetorno}
                      onChange={(e) => setForm({ ...form, horaRetorno: e.target.value })}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={isLoading || !isFormValid()}>
                  {isLoading ? 'Cadastrando...' : 'Cadastrar Retorno'}
                </Button>
              </CardContent>
            </Card>
          </form>
        )}

        {/* Lista de Retornos */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            {isAdmin ? 'Retornos' : 'Meus Retornos'} {retornosFiltrados.length > 0 && `(${retornosFiltrados.length})`}
          </h2>

          {loadingRetornos ? (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </CardContent>
            </Card>
          ) : retornosFiltrados.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                {funcionarioFilter !== 'todos' 
                  ? 'Nenhum retorno encontrado para este funcionário.'
                  : 'Nenhum retorno cadastrado ainda.'}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {retornosFiltrados.map((retorno) => (
                <Card key={retorno.id} className={retorno.status === 'concluido' ? 'opacity-60' : ''}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold flex items-center gap-1">
                            {retorno.cliente_nome}
                            <CopyButton value={retorno.cliente_nome} label="Nome" preserveText />
                          </span>
                          {getStatusBadge(retorno.status, retorno.data_retorno)}
                        </div>

                        <div className="grid gap-1 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3 w-3" />
                            <span>CPF: {retorno.cliente_cpf}</span>
                            <CopyButton value={retorno.cliente_cpf} label="CPF" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3" />
                            <span>{retorno.cliente_telefone}</span>
                            <CopyButton value={retorno.cliente_telefone} label="Telefone" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3" />
                            <span>
                              Retorno: {(() => {
                                const dataStr = retorno.data_retorno;
                                // Check if it has a meaningful time (not midnight)
                                const date = new Date(dataStr);
                                const hasTime = dataStr.includes('T');
                                // Use UTC values to avoid timezone shift
                                const year = date.getUTCFullYear();
                                const month = date.getUTCMonth();
                                const day = date.getUTCDate();
                                const localDate = new Date(year, month, day);
                                const formatted = format(localDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
                                if (hasTime) {
                                  const hours = String(date.getUTCHours()).padStart(2, '0');
                                  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
                                  if (hours !== '00' || minutes !== '00') {
                                    return `${formatted} às ${hours}:${minutes}`;
                                  }
                                }
                                return formatted;
                              })()}
                            </span>
                          </div>
                          {retorno.profiles?.nome && (
                            <div className="flex items-center gap-2">
                              <UserCircle className="h-3 w-3" />
                              <span>Lançado por: {retorno.profiles.nome}</span>
                            </div>
                          )}
                        </div>

                        {/* Dados do Acordo */}
                        {retorno.valor_total && (
                          <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <DollarSign className="h-3 w-3 text-primary" />
                              <span className="font-medium">Valor Total: {formatCurrencyDisplay(retorno.valor_total)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Hash className="h-3 w-3" />
                              <span>{retorno.numero_parcelas}x - 1ª: {formatCurrencyDisplay(retorno.valor_primeira_parcela)} | Demais: {formatCurrencyDisplay(retorno.valor_demais_parcelas)}</span>
                            </div>
                            {retorno.data_primeiro_pagamento && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <CalendarDays className="h-3 w-3" />
                                <span>1º Pagamento: {format(new Date(retorno.data_primeiro_pagamento + 'T00:00:00'), "dd/MM/yyyy")}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {retorno.observacao && (
                          <p className="text-sm mt-2 p-2 bg-muted rounded">
                            {retorno.observacao}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2 sm:flex-col">
                        {retorno.status !== 'concluido' && retorno.valor_total && (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:bg-green-50 hover:text-green-700"
                              onClick={() => handleEnviarWhatsApp(retorno)}
                              disabled={sendingWhatsApp === retorno.id}
                            >
                              {sendingWhatsApp === retorno.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <MessageCircle className="h-4 w-4 mr-1" />
                              )}
                              WhatsApp
                            </Button>
                            {retorno.whatsapp_enviado_em && (
                              <Badge variant="secondary" className="text-xs">
                                <CheckCircle className="h-3 w-3 mr-1 text-green-500" />
                                Enviado
                              </Badge>
                            )}
                          </div>
                        )}
                        {retorno.status !== 'concluido' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarcarConcluido(retorno.id)}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Concluir
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          onClick={() => handleDeletar(retorno.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
