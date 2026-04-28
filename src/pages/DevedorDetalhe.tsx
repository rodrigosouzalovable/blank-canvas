import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { differenceInDays, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowLeft, ChevronDown, ChevronRight, Plus, FileText, Phone, Download, DollarSign, User, MoreHorizontal, Pencil, Trash2, Loader2, Mic, MicOff } from 'lucide-react';
import jsPDF from 'jspdf';
import logoSouzaRibeiro from '@/assets/logo-souza-ribeiro.png';
import { TelefoneTab } from '@/components/devedor/TelefoneTab';
import { CalculadoraDebitoDialog } from '@/components/devedor/CalculadoraDebitoDialog';
import { AcordoDevedorSection } from '@/components/devedor/AcordoDevedorSection';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Devedor {
  id: string;
  nome: string;
  cpf: string;
  telefone: string | null;
  credor: string | null;
  contrato: string | null;
  valor_original: number;
  valor_atualizado: number;
  data_vencimento: string | null;
  descricao: string | null;
  estagio: string;
}

interface Evento {
  id: string;
  tipo: string;
  descricao: string;
  arquivo_url: string | null;
  arquivo_nome: string | null;
  criado_por: string;
  criado_em: string;
}

interface Telefone {
  id: string;
  numero: string;
  tipo: string;
  is_contato: boolean;
  is_whatsapp: boolean;
  ativo: boolean;
  autorizado: boolean;
  observacao: string | null;
  ramal: string | null;
}

export default function DevedorDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [devedor, setDevedor] = useState<Devedor | null>(null);
  const [contratos, setContratos] = useState<Devedor[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [telefones, setTelefones] = useState<Telefone[]>([]);
  const [loading, setLoading] = useState(true);
  const [openContratos, setOpenContratos] = useState<Record<string, boolean>>({});
  const [cpfNorm, setCpfNorm] = useState('');
  const [editingVencId, setEditingVencId] = useState<string | null>(null);
  const [editingVencDate, setEditingVencDate] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [eventoTipo, setEventoTipo] = useState('contato_cliente');
  const [eventoDescricao, setEventoDescricao] = useState('');
  const [eventoFile, setEventoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit evento state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editEventoId, setEditEventoId] = useState<string | null>(null);
  const [editEventoTipo, setEditEventoTipo] = useState('contato_cliente');
  const [editEventoDescricao, setEditEventoDescricao] = useState('');
  const [telefonesDialogOpen, setTelefonesDialogOpen] = useState(false);
  const [operadorNomes, setOperadorNomes] = useState<Record<string, string>>({});

  // Notificação Extrajudicial state
  const [notifDialogOpen, setNotifDialogOpen] = useState(false);
  const [notifContent, setNotifContent] = useState('');
  const [showAllContratos, setShowAllContratos] = useState(false);

  // Termo de Acordo state
  const [termoDialogOpen, setTermoDialogOpen] = useState(false);
  const [termoInput, setTermoInput] = useState('');
  const [termoContent, setTermoContent] = useState('');
  const [termoGenerating, setTermoGenerating] = useState(false);

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

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
        setTermoInput(prev => prev ? `${prev}\n${data.text}` : data.text);
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
  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    // Reset state to avoid showing stale data from previous client
    setContratos([]);
    setEventos([]);
    setTelefones([]);

    const { data: dev, error: devErr } = await supabase
      .from('devedores')
      .select('id, nome, cpf, telefone, credor, contrato, valor_original, valor_atualizado, data_vencimento, descricao, estagio')
      .eq('id', id)
      .eq('ativo', true)
      .maybeSingle();

    if (devErr) console.error('[DevedorDetalhe] erro ao carregar devedor:', devErr);
    if (!dev) { setLoading(false); return; }
    setDevedor(dev as Devedor);

    // Normalize and pad CPF/CNPJ to handle leading-zero loss from Excel imports
    const rawDigits = (dev as any).cpf?.replace(/\D/g, '') || '';
    let normCpf = rawDigits;
    if (rawDigits && rawDigits.length <= 11) normCpf = rawDigits.padStart(11, '0');
    else if (rawDigits && rawDigits.length <= 14) normCpf = rawDigits.padStart(14, '0');
    setCpfNorm(normCpf);

    if (normCpf) {
      // Build all CPF variants to be resilient to historical data with stripped zeros
      const cpfVariants = new Set<string>([normCpf, rawDigits]);
      // Also try unpadded versions in case some rows still lack leading zeros
      cpfVariants.add(normCpf.replace(/^0+/, ''));

      // Check if this CPF belongs to a business group
      let allCpfs = Array.from(cpfVariants).filter(Boolean);
      const { data: grupoMembro } = await supabase
        .from('grupo_empresarial_membros' as any)
        .select('grupo_id')
        .eq('cpf_cnpj', normCpf)
        .limit(1);

      if (grupoMembro && (grupoMembro as any[]).length > 0) {
        const grupoId = (grupoMembro as any[])[0].grupo_id;
        const { data: allMembros } = await supabase
          .from('grupo_empresarial_membros' as any)
          .select('cpf_cnpj')
          .eq('grupo_id', grupoId);
        if (allMembros) {
          (allMembros as any[]).forEach(m => allCpfs.push(m.cpf_cnpj));
          allCpfs = Array.from(new Set(allCpfs));
        }
      }

      // Contracts for all CPFs in the group (and their variants)
      const { data: ctrs, error: ctrsErr } = await supabase
        .from('devedores')
        .select('id, nome, cpf, telefone, credor, contrato, valor_original, valor_atualizado, data_vencimento, descricao, estagio')
        .eq('ativo', true)
        .in('cpf', allCpfs)
        .order('data_vencimento', { ascending: true });
      if (ctrsErr) console.error('[DevedorDetalhe] erro ao carregar contratos:', ctrsErr, 'cpfs=', allCpfs);
      console.log('[DevedorDetalhe] contratos carregados:', ctrs?.length || 0, 'para cpfs=', allCpfs);
      if (ctrs) setContratos(ctrs as Devedor[]);

      // Phones for all CPFs in the group
      const allPhones: Telefone[] = [];
      for (const cpfItem of allCpfs) {
        const { data: phones } = await supabase
          .from('devedor_telefones' as any)
          .select('*')
          .eq('devedor_cpf', cpfItem);
        if (phones) allPhones.push(...(phones as unknown as Telefone[]));
      }
      setTelefones(allPhones);
    }

    // Events
    const { data: evts } = await supabase
      .from('devedor_eventos' as any)
      .select('*')
      .eq('devedor_id', id)
      .order('criado_em', { ascending: false });
    if (evts) {
      const eventosData = evts as unknown as Evento[];
      setEventos(eventosData);
      // Fetch operator names
      const uniqueIds = [...new Set(eventosData.map(e => e.criado_por))];
      if (uniqueIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, nome')
          .in('id', uniqueIds);
        if (profiles) {
          const nomes: Record<string, string> = {};
          profiles.forEach((p: any) => { nomes[p.id] = p.nome; });
          setOperadorNomes(nomes);
        }
      }
    }

    setLoading(false);
  }, [id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveEvento = async () => {
    if (!user || !id) return;
    setSaving(true);
    let arquivo_url: string | null = null;
    let arquivo_nome: string | null = null;

    if (eventoTipo === 'anexar_arquivo' && eventoFile) {
      const filePath = `${id}/${Date.now()}-${eventoFile.name}`;
      const { error: uploadError } = await supabase.storage.from('devedor-arquivos').upload(filePath, eventoFile);
      if (uploadError) { toast.error('Erro no upload: ' + uploadError.message); setSaving(false); return; }
      arquivo_url = filePath;
      arquivo_nome = eventoFile.name;
    }

    const { error } = await supabase.from('devedor_eventos' as any).insert({
      devedor_id: id, tipo: eventoTipo, descricao: eventoDescricao, arquivo_url, arquivo_nome, criado_por: user.id,
    } as any);

    if (error) { toast.error('Erro: ' + error.message); }
    else {
      // Atualizar estágio de "novo" para "andamento" em TODOS os contratos do mesmo CPF
      if (devedor?.estagio === 'novo') {
        // Update all contracts with the same CPF/CNPJ from 'novo' to 'andamento'
        // Fetch all devedores with estagio 'novo' and filter by normalized CPF in JS
        const cpfNorm = devedor.cpf.replace(/\D/g, '');
        const { data: allNovo } = await supabase
          .from('devedores')
          .select('id, cpf')
          .eq('estagio', 'novo')
          .eq('ativo', true);
        if (allNovo && allNovo.length > 0) {
          const idsToUpdate = allNovo
            .filter(d => d.cpf?.replace(/\D/g, '') === cpfNorm)
            .map(d => d.id);
          if (idsToUpdate.length > 0) {
            await supabase.from('devedores').update({ estagio: 'andamento' }).in('id', idsToUpdate);
          }
        }
      }
      toast.success('Evento registrado!');
      setDialogOpen(false); setEventoTipo('contato_cliente'); setEventoDescricao(''); setEventoFile(null);
      fetchData();
    }
    setSaving(false);
  };

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from('devedor-arquivos').download(filePath);
    if (error || !data) { toast.error('Erro ao baixar'); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteEvento = async (eventoId: string) => {
    const { error } = await supabase.from('devedor_eventos').delete().eq('id', eventoId);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Evento excluído'); fetchData(); }
  };

  const handleEditEvento = async () => {
    if (!editEventoId) return;
    setSaving(true);
    const { error } = await supabase.from('devedor_eventos').update({
      tipo: editEventoTipo, descricao: editEventoDescricao,
    }).eq('id', editEventoId);
    if (error) toast.error('Erro: ' + error.message);
    else { toast.success('Evento atualizado'); setEditDialogOpen(false); fetchData(); }
    setSaving(false);
  };

  const openEditEvento = (evt: Evento) => {
    setEditEventoId(evt.id);
    setEditEventoTipo(evt.tipo);
    setEditEventoDescricao(evt.descricao);
    setEditDialogOpen(true);
  };
  const totalEmAtraso = contratos.reduce((acc, c) => acc + c.valor_atualizado, 0);

  const credoresInfo: Record<string, { nomeCompleto: string; cnpj: string; endereco: string }> = {
    'MONTREAL': {
      nomeCompleto: 'MONTREAL - MONTADORA DE MÓVEIS E ELETRO-DOMÉSTICOS LTDA.',
      cnpj: '07.019.882/0001-86',
      endereco: 'Av. Eurípedes de Menezes, qd. 04, lts. 01/13 e 28/36, Setor Parque Industrial, CEP: 74993-540, Aparecida de Goiânia-GO'
    },
    'UME | NOVO MUNDO': {
      nomeCompleto: 'UME | NOVO MUNDO',
      cnpj: '[CNPJ]',
      endereco: '[ENDEREÇO]'
    }
  };

  const gerarTextoNotificacao = () => {
    const dataAtual = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    const totalOriginal = contratos.reduce((acc, c) => acc + c.valor_original, 0);
    const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const credorKey = devedor.credor || '';
    const credorInfo = credoresInfo[credorKey] || {
      nomeCompleto: credorKey || '[CREDOR NÃO INFORMADO]',
      cnpj: '[CNPJ]',
      endereco: '[ENDEREÇO]'
    };

    // Find oldest due date for inadimplemento paragraph
    const datesVenc = contratos
      .filter(c => c.data_vencimento)
      .map(c => new Date(c.data_vencimento + 'T00:00:00'))
      .sort((a, b) => a.getTime() - b.getTime());
    const dataInadimplemento = datesVenc.length > 0
      ? format(datesVenc[0], "MMMM'/'yyyy", { locale: ptBR })
      : '[DATA]';

    // Number in words helper (simple)
    const numPorExtenso = (n: number): string => {
      const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez',
        'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte'];
      const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa', 'cem'];
      if (n <= 20) return unidades[n];
      if (n <= 100) {
        const d = Math.floor(n / 10);
        const u = n % 10;
        return u === 0 ? dezenas[d] : `${dezenas[d]} e ${unidades[u]}`;
      }
      return String(n);
    };

    const qtdExtenso = numPorExtenso(contratos.length);

    return `${credorInfo.nomeCompleto}, pessoa jurídica de direito privado, inscrita no CNPJ nº ${credorInfo.cnpj}, com sede na ${credorInfo.endereco}.
________________________________________

NOTIFICAÇÃO EXTRAJUDICIAL

Assunto: Cobrança de dívida vencida – Intimação para pagamento

À
${devedor.nome}
CNPJ: ${devedor.cpf}
Endereço: [PRECISA SER PREENCHIDO]
E aos sócios:
[PRECISA SER PREENCHIDO]
________________________________________
Prezados Cliente,

Notificamos Vossas Senhorias acerca da existência de ${contratos.length} (${qtdExtenso}) títulos vencidos e não quitados, referentes às mercadorias que lhes foram vendidas, os quais somam o valor total originário de: ${fmtBRL(totalOriginal)}, sendo que, para efeito de negociação, esse valor será corrigido monetariamente, pela Taxa Selic diária, mais juros de mora de 1% (um por cento) ao mês e multa de 2% (dois por cento).

O inadimplemento persiste desde ${dataInadimplemento}, o que configura descumprimento contratual e autoriza a adoção imediata das medidas legais cabíveis.
________________________________________
EXIGÊNCIA
Fica concedido o prazo IMPRORROGÁVEL de 48 (quarenta e oito) horas, a contar do recebimento desta, para pagamento integral do débito, acrescido de:
•\tJuros de mora de 1% ao mês;
•\tMulta contratual de 2%;
•\tCorreção monetária, pela Taxa Selic diária;
•\tHonorários e encargos de cobrança.
Pagamento via PIX (CNPJ 05.950.717/0001-18) ou depósito identificado.
________________________________________
CONSEQUÊNCIAS DO NÃO PAGAMENTO
O não cumprimento no prazo estipulado ensejará, sem novo aviso:
•\tProtesto dos títulos em cartório;
•\tInclusão nos órgãos de proteção ao crédito;
•\tAjuizamento de Ação de Execução, com penhora de bens;
•\tPedido de desconsideração da personalidade jurídica, para atingir bens dos sócios;
•\tBloqueio de valores via SISBAJUD;
•\tCobrança de custas e honorários judiciais.
________________________________________
Esta notificação possui caráter formal e definitivo, constituindo Vossas Senhorias em mora.

Para tratativas imediatas de negociação do débito, contatar:
Luiz Carlos: (62) 99679-9697 ou Rodrigo: (62) 99167-2674.
contato@souzaeribeiro.com.br
________________________________________

Goiânia-GO, ${dataAtual}.




______________________________________________________________
p.p. ${credorInfo.nomeCompleto}
Rodrigo Ribeiro de Souza - Souza e Ribeiro Sociedade de Advogados.

Rua 24, nº 208, Setor Marista, CEP: 74150-070, Goiânia-GO.
Telefone/WhatsApp: (62) 99679-9697 - E-mail: contato@souzaeribeiro.com.br`;
  };

  const handleOpenNotificacao = () => {
    setNotifContent(gerarTextoNotificacao());
    setNotifDialogOpen(true);
  };

  const handleDownloadNotifPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const marginLeft = 20;
    const marginRight = 20;
    const contentWidth = pageWidth - marginLeft - marginRight;
    const topMargin = 20;
    const bottomMargin = 35; // space for footer
    const lineHeight = 6;

    const addHeaderAndFooter = () => {
      // Footer
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text('Rua 24, nº 208, Setor Marista, CEP: 74150-070, Goiânia-GO.', pageWidth / 2, pageHeight - 15, { align: 'center' });
      doc.text('Telefone/WhatsApp: (62) 99679-9697 - E-mail: contato@souzaeribeiro.com.br', pageWidth / 2, pageHeight - 10, { align: 'center' });
    };

    addHeaderAndFooter();

    const contentLines = notifContent.split('\n');
    let y = topMargin;
    const boldSections = ['NOTIFICAÇÃO EXTRAJUDICIAL', 'EXIGÊNCIA', 'CONSEQUÊNCIAS DO NÃO PAGAMENTO'];

    for (const rawLine of contentLines) {
      const isBold = boldSections.some(s => rawLine.trim().startsWith(s));
      doc.setFontSize(isBold ? 12 : 11);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');

      const wrapped = doc.splitTextToSize(rawLine || ' ', contentWidth);
      for (const wLine of wrapped) {
        if (y > pageHeight - bottomMargin) {
          doc.addPage();
          addHeaderAndFooter();
          y = topMargin;
        }
        doc.text(wLine, marginLeft, y);
        y += lineHeight;
      }
    }

    doc.save(`Notificacao-Extrajudicial-${devedor.nome}.pdf`);
  };

  const getLogoBase64 = (): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve('');
      img.src = logoSouzaRibeiro;
    });
  };

  const handleDownloadNotifWord = async () => {
    // Logo removido do Word conforme modelo
    const lines = notifContent.split('\n');

    const formatLine = (line: string): string => {
      const trimmed = line.trim();
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Separador
      if (trimmed.startsWith('______')) {
        return '<hr style="border:none;border-top:1px solid #000;margin:12pt 0;" />';
      }

      // Título centralizado e sublinhado
      if (trimmed === 'NOTIFICAÇÃO EXTRAJUDICIAL') {
        return `<p align="center" style="margin:12pt 0;"><b><u>${escaped}</u></b></p>`;
      }

      // Assunto em negrito
      if (trimmed.startsWith('Assunto:')) {
        return `<p style="margin:6pt 0;"><b>${escaped}</b></p>`;
      }

      // EXIGÊNCIA sublinhado
      if (trimmed === 'EXIGÊNCIA') {
        return `<p style="margin:12pt 0;"><b><u>${escaped}</u></b></p>`;
      }

      // CONSEQUÊNCIAS em negrito
      if (trimmed === 'CONSEQUÊNCIAS DO NÃO PAGAMENTO') {
        return `<p style="margin:12pt 0;"><b>${escaped}</b></p>`;
      }

      // Bullets com quadrado
      if (trimmed.startsWith('•')) {
        const bulletText = escaped.replace(/^•\s*/, '');
        return `<table border="0" cellspacing="0" cellpadding="0" style="margin:8pt 0 8pt 36pt;"><tr><td valign="top" style="width:18pt;font-size:11pt;">□</td><td style="font-size:11pt;">${bulletText}</td></tr></table>`;
      }

      // Credor (primeira linha com dados completos - bold até a vírgula do tipo jurídico)
      if (trimmed.match(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s\-\|]+\s*-\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+LTDA/i)) {
        const parts = escaped.match(/^(.+?LTDA\.?)(,.*)$/i);
        if (parts) {
          return `<p style="margin:6pt 0;"><b>${parts[1]}</b>${parts[2]}</p>`;
        }
        return `<p style="margin:6pt 0;"><b>${escaped}</b></p>`;
      }

      // "À" destinatário
      if (trimmed === 'À') {
        return `<p style="margin:12pt 0 0 0;"><b>${escaped}</b></p>`;
      }

      // Nome do cliente (linha após "À")
      if (trimmed.match(/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+LTDA/i) && !trimmed.includes('pessoa jurídica')) {
        return `<p style="margin:2pt 0;"><b>${escaped}</b></p>`;
      }

      // "E aos sócios:"
      if (trimmed.startsWith('E aos sócios:')) {
        return `<p style="margin:6pt 0;"><b>${escaped}</b></p>`;
      }

      // Linha vazia
      if (trimmed === '') {
        return '<p style="margin:0;">&nbsp;</p>';
      }

      // Aplicar negrito inline em trechos específicos
      let processed = escaped;
      // IMPRORROGÁVEL de 48 (quarenta e oito) horas
      processed = processed.replace(/(IMPRORROGÁVEL de 48 \(quarenta e oito\) horas)/g, '<b>$1</b>');
      // "sem novo aviso"
      processed = processed.replace(/(sem novo aviso)/g, '<b>$1</b>');
      // "formal e definitivo"
      processed = processed.replace(/(formal e definitivo)/g, '<b>$1</b>');

      // Assinatura p.p.
      if (trimmed.startsWith('p.p.')) {
        return `<p style="margin:2pt 0;"><b>${escaped}</b></p>`;
      }
      if (trimmed.startsWith('Rodrigo Ribeiro')) {
        return `<p style="margin:2pt 0;"><b>${escaped}</b></p>`;
      }

      // Data (Goiânia-GO,)
      if (trimmed.startsWith('Goiânia-GO,')) {
        return `<p style="margin:24pt 0 6pt 0;">${escaped}</p>`;
      }

      // Linha de assinatura ____
      if (trimmed.startsWith('____') && !trimmed.startsWith('________________________________________')) {
        return `<p style="margin:36pt 0 0 0;">${escaped}</p>`;
      }

      return `<p style="margin:4pt 0;">${processed}</p>`;
    };

    const bodyContent = lines.map(formatLine).join('\n');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 15">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
@page Section1 {
  size: 21cm 29.7cm;
  margin: 2.5cm 2.5cm 3cm 2.5cm;
  mso-header-margin: 1cm;
  mso-footer-margin: 1cm;
  mso-header: h1;
  mso-footer: f1;
}
div.Section1 { page: Section1; }
body {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 11pt;
  text-align: justify;
  line-height: 1.5;
  color: #000000;
}
p { margin: 4pt 0; }
hr { border: none; border-top: 1px solid #000; margin: 12pt 0; }
table { border-collapse: collapse; }
</style>
</head>
<body>
<div class="Section1">

<div style="mso-element:header" id="h1">
<p style="margin:0;">&nbsp;</p>
</div>

${bodyContent}

<div style="mso-element:footer" id="f1">
<p style="margin:0;">&nbsp;</p>
</div>

</div>
</body>
</html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Notificacao-Extrajudicial-${devedor.nome}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGerarTermo = async () => {
    if (!termoInput.trim()) {
      toast.error('Descreva os termos do acordo antes de gerar.');
      return;
    }
    setTermoGenerating(true);
    try {
      const contratosTexto = contratos.map(c =>
        `- Contrato: ${c.contrato || 'S/N'} | Valor: R$ ${c.valor_atualizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | Vencimento: ${c.data_vencimento ? new Date(c.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}`
      ).join('\n');

      const { data, error } = await supabase.functions.invoke('gerar-termo-acordo', {
        body: {
          descricaoAcordo: termoInput,
          clienteNome: devedor?.nome,
          clienteCpf: devedor?.cpf,
          credor: devedor?.credor,
          valorTotal: totalEmAtraso,
          contratos: contratosTexto,
        },
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setTermoContent(data.termo || '');
      toast.success('Termo gerado com sucesso!');
    } catch (err: any) {
      console.error('Erro ao gerar termo:', err);
      toast.error('Erro ao gerar termo de acordo. Tente novamente.');
    } finally {
      setTermoGenerating(false);
    }
  };

  const handleDownloadTermoWord = () => {
    if (!termoContent) return;
    const lines = termoContent.split('\n');
    const bodyContent = lines.map(line => {
      const trimmed = line.trim();
      const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (trimmed === '') return '<p style="margin:0;">&nbsp;</p>';
      if (trimmed.match(/^CL[ÁA]USULA/i)) return `<p style="margin:12pt 0 4pt 0;"><b>${escaped}</b></p>`;
      if (trimmed === 'TERMO DE ACORDO EXTRAJUDICIAL') return `<p align="center" style="margin:12pt 0;"><b><u>${escaped}</u></b></p>`;
      if (trimmed.startsWith('____')) return `<p style="margin:24pt 0 0 0;">${escaped}</p>`;
      return `<p style="margin:4pt 0;">${escaped}</p>`;
    }).join('\n');

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Microsoft Word 15">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
@page Section1 { size: 21cm 29.7cm; margin: 2.5cm; }
div.Section1 { page: Section1; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; text-align: justify; line-height: 1.5; color: #000000; }
p { margin: 4pt 0; }
</style>
</head>
<body>
<div class="Section1">
${bodyContent}
</div>
</body>
</html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Termo-Acordo-${devedor?.nome || 'documento'}.doc`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTermoPDF = () => {
    if (!termoContent) return;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const marginLeft = 20;
    const marginRight = 20;
    const contentWidth = pageWidth - marginLeft - marginRight;
    const topMargin = 20;
    const bottomMargin = 20;
    const lineHeight = 6;

    const lines = termoContent.split('\n');
    let y = topMargin;

    for (const rawLine of lines) {
      const isBold = rawLine.trim().match(/^CL[ÁA]USULA/i) || rawLine.trim() === 'TERMO DE ACORDO EXTRAJUDICIAL';
      doc.setFontSize(isBold ? 12 : 11);
      doc.setFont('helvetica', isBold ? 'bold' : 'normal');

      const wrapped = doc.splitTextToSize(rawLine || ' ', contentWidth);
      for (const wLine of wrapped) {
        if (y > pageHeight - bottomMargin) {
          doc.addPage();
          y = topMargin;
        }
        doc.text(wLine, marginLeft, y);
        y += lineHeight;
      }
    }

    doc.save(`Termo-Acordo-${devedor?.nome || 'documento'}.pdf`);
  };

  const getDiasAtraso = (dataVencimento: string | null) => {
    if (!dataVencimento) return null;
    const days = differenceInDays(new Date(), new Date(dataVencimento + 'T00:00:00'));
    return days > 0 ? days : 0;
  };

  if (loading) {
    return <AppLayout><div className="flex items-center justify-center min-h-[50vh]">Carregando...</div></AppLayout>;
  }

  if (!devedor) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
          <p className="text-muted-foreground">Devedor não encontrado.</p>
          <Button variant="outline" onClick={() => navigate('/clientes')}><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{devedor.nome}</h1>
                  <Badge variant={devedor.estagio === 'andamento' ? 'default' : 'secondary'} className="mt-1">
                    {devedor.estagio}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleOpenNotificacao}>
                  <FileText className="h-4 w-4 mr-1" /> Notificação Extrajudicial
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setTermoContent(''); setTermoInput(''); setTermoDialogOpen(true); }}>
                  <FileText className="h-4 w-4 mr-1" /> Termo de Acordo
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigate('/clientes')}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">CPF/CNPJ</span>
                <span className="font-mono font-medium">{devedor.cpf}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Telefone</span>
                <div className="flex items-center gap-1">
                  <span className="font-medium">{telefones.filter(t => t.ativo !== false).length > 0 ? telefones.filter(t => t.ativo !== false)[0].numero : (devedor.telefone || 'Não informado')}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setTelefonesDialogOpen(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {devedor.credor && (
                <div>
                  <span className="text-muted-foreground block text-xs">Credor</span>
                  <span className="font-medium">{devedor.credor}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Telefones Dialog */}
        <Dialog open={telefonesDialogOpen} onOpenChange={setTelefonesDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Phone className="h-5 w-5" /> Gerenciar Telefones</DialogTitle></DialogHeader>
            <TelefoneTab
              telefones={telefones}
              cpfNormalizado={cpfNorm}
              userId={user?.id || ''}
              onRefresh={fetchData}
              telefoneImportado={devedor.telefone}
              devedorId={devedor.id}
            />
          </DialogContent>
        </Dialog>

        {/* Notificação Extrajudicial Dialog */}
        <Dialog open={notifDialogOpen} onOpenChange={setNotifDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Notificação Extrajudicial
              </DialogTitle>
              <DialogDescription>
                Edite o conteúdo abaixo e clique em "Baixar PDF" para gerar o documento.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 min-h-0">
              <Textarea
                value={notifContent}
                onChange={(e) => setNotifContent(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
              />
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotifDialogOpen(false)}>Fechar</Button>
              <Button variant="outline" onClick={handleDownloadNotifWord}>
                <Download className="h-4 w-4 mr-1" /> Baixar Word
              </Button>
              <Button onClick={handleDownloadNotifPDF}>
                <Download className="h-4 w-4 mr-1" /> Baixar PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Termo de Acordo Dialog */}
        <Dialog open={termoDialogOpen} onOpenChange={setTermoDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Termo de Acordo
              </DialogTitle>
              <DialogDescription>
                Descreva os termos do acordo feito com o cliente e clique em "GERAR" para criar o documento.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 min-h-0 space-y-4">
              {!termoContent ? (
                <div className="space-y-4 p-1">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Descreva o acordo feito com o cliente</Label>
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
                      value={termoInput}
                      onChange={(e) => setTermoInput(e.target.value)}
                      placeholder="Ex: O cliente concordou em pagar R$ 5.000,00 em 10 parcelas de R$ 500,00, com primeira parcela em 15/03/2026. Foi concedido desconto de 20% sobre juros..."
                      className="min-h-[200px]"
                    />
                  </div>
                  <Button onClick={handleGerarTermo} disabled={termoGenerating || !termoInput.trim()} className="w-full">
                    {termoGenerating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando termo...</> : 'GERAR'}
                  </Button>
                </div>
              ) : (
                <div className="p-1">
                  <Textarea
                    value={termoContent}
                    onChange={(e) => setTermoContent(e.target.value)}
                    className="min-h-[400px] font-mono text-sm"
                  />
                </div>
              )}
            </ScrollArea>
            <DialogFooter>
              {termoContent ? (
                <>
                  <Button variant="outline" onClick={() => setTermoContent('')}>Voltar</Button>
                  <Button variant="outline" onClick={handleDownloadTermoWord}>
                    <Download className="h-4 w-4 mr-1" /> Baixar Word
                  </Button>
                  <Button onClick={handleDownloadTermoPDF}>
                    <Download className="h-4 w-4 mr-1" /> Baixar PDF
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setTermoDialogOpen(false)}>Fechar</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Contratos */}
          <div className="space-y-6">

            {/* Contratos */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DollarSign className="h-4 w-4" /> Contratos
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <CalculadoraDebitoDialog contratos={contratos} devedor={devedor} />
                    <span className="text-lg font-bold text-destructive">
                      Total: {totalEmAtraso.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(() => {
                    const sorted = [...contratos].sort((a, b) => {
                      if (!a.data_vencimento && !b.data_vencimento) return 0;
                      if (!a.data_vencimento) return 1;
                      if (!b.data_vencimento) return -1;
                      return a.data_vencimento.localeCompare(b.data_vencimento);
                    });
                    const visible = showAllContratos ? sorted : sorted.slice(0, 2);
                    return visible;
                  })().map((contrato) => {
                    const dias = getDiasAtraso(contrato.data_vencimento);
                    return (
                      <Collapsible
                        key={contrato.id}
                        open={openContratos[contrato.id] || false}
                        onOpenChange={(open) => setOpenContratos(prev => ({ ...prev, [contrato.id]: open }))}
                      >
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${contrato.estagio === 'novo' ? 'bg-green-500' : 'bg-destructive'}`} />
                              <span className="font-medium text-sm">{contrato.contrato || 'S/ contrato'}</span>
                              {dias !== null && dias > 0 && (
                                <span className="text-xs text-muted-foreground">- Atraso: {dias}</span>
                              )}
                              {contrato.data_vencimento && (
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  Venc: {new Date(contrato.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}
                                  <Popover open={editingVencId === contrato.id} onOpenChange={(open) => {
                                    if (open) {
                                      setEditingVencId(contrato.id);
                                      setEditingVencDate(contrato.data_vencimento || '');
                                    } else {
                                      setEditingVencId(null);
                                    }
                                  }}>
                                    <PopoverTrigger asChild>
                                      <button
                                        type="button"
                                        className="p-0.5 rounded hover:bg-muted"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-3" align="start" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex flex-col gap-2">
                                        <Label className="text-xs">Nova data de vencimento</Label>
                                        <Input
                                          type="date"
                                          value={editingVencDate}
                                          onChange={(e) => setEditingVencDate(e.target.value)}
                                          className="text-xs h-8"
                                        />
                                        <Button
                                          size="sm"
                                          className="h-7 text-xs"
                                          disabled={!editingVencDate}
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            const { error } = await supabase
                                              .from('devedores')
                                              .update({ data_vencimento: editingVencDate })
                                              .eq('id', contrato.id);
                                            if (error) {
                                              toast.error('Erro ao atualizar data');
                                            } else {
                                              toast.success('Data de vencimento atualizada');
                                              setContratos(prev => prev.map(c =>
                                                c.id === contrato.id ? { ...c, data_vencimento: editingVencDate } : c
                                              ));
                                              if (devedor?.id === contrato.id) {
                                                setDevedor(prev => prev ? { ...prev, data_vencimento: editingVencDate } : prev);
                                              }
                                              setEditingVencId(null);
                                            }
                                          }}
                                        >
                                          Salvar
                                        </Button>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </span>
                              )}
                              {!contrato.data_vencimento && (
                                <Popover open={editingVencId === contrato.id} onOpenChange={(open) => {
                                  if (open) {
                                    setEditingVencId(contrato.id);
                                    setEditingVencDate('');
                                  } else {
                                    setEditingVencId(null);
                                  }
                                }}>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      className="p-0.5 rounded hover:bg-muted text-muted-foreground"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-3" align="start" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex flex-col gap-2">
                                      <Label className="text-xs">Data de vencimento</Label>
                                      <Input
                                        type="date"
                                        value={editingVencDate}
                                        onChange={(e) => setEditingVencDate(e.target.value)}
                                        className="text-xs h-8"
                                      />
                                      <Button
                                        size="sm"
                                        className="h-7 text-xs"
                                        disabled={!editingVencDate}
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          const { error } = await supabase
                                            .from('devedores')
                                            .update({ data_vencimento: editingVencDate })
                                            .eq('id', contrato.id);
                                          if (error) {
                                            toast.error('Erro ao atualizar data');
                                          } else {
                                            toast.success('Data de vencimento adicionada');
                                            setContratos(prev => prev.map(c =>
                                              c.id === contrato.id ? { ...c, data_vencimento: editingVencDate } : c
                                            ));
                                            if (devedor?.id === contrato.id) {
                                              setDevedor(prev => prev ? { ...prev, data_vencimento: editingVencDate } : prev);
                                            }
                                            setEditingVencId(null);
                                          }
                                        }}
                                      >
                                        Salvar
                                      </Button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                              <span className="text-xs font-semibold text-destructive">
                                {contrato.valor_atualizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                title="Excluir parcela"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm(`Excluir parcela ${contrato.contrato || 'S/N'} - ${contrato.valor_atualizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}?`)) return;
                                  const { error } = await supabase
                                    .from('devedores')
                                    .update({ ativo: false })
                                    .eq('id', contrato.id);
                                  if (error) {
                                    toast.error('Erro ao excluir: ' + error.message);
                                  } else {
                                    toast.success('Parcela excluída');
                                    setContratos(prev => prev.filter(c => c.id !== contrato.id));
                                    if (devedor?.id === contrato.id) {
                                      navigate('/clientes');
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              {openContratos[contrato.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 border rounded-lg overflow-hidden">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  <TableHead className="text-xs">Número</TableHead>
                                  <TableHead className="text-xs">Vencimento</TableHead>
                                  <TableHead className="text-xs">Valor Original</TableHead>
                                  <TableHead className="text-xs">Valor Atualizado</TableHead>
                                  <TableHead className="text-xs">Atraso</TableHead>
                                  <TableHead className="text-xs">Estágio</TableHead>
                                  <TableHead className="text-xs">Descrição</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                <TableRow>
                                  <TableCell className="text-xs font-medium">{contrato.contrato || '—'}</TableCell>
                                  <TableCell className="text-xs">{contrato.data_vencimento ? new Date(contrato.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}</TableCell>
                                  <TableCell className="text-xs">{contrato.valor_original.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                  <TableCell className="text-xs font-semibold">{contrato.valor_atualizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                                  <TableCell className="text-xs">{dias !== null && dias > 0 ? `${dias} dias` : '—'}</TableCell>
                                  <TableCell><Badge variant="secondary" className="text-xs">{contrato.estagio}</Badge></TableCell>
                                  <TableCell className="text-xs max-w-[200px] truncate">{contrato.descricao || '—'}</TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                  {contratos.length > 2 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setShowAllContratos(prev => !prev)}
                    >
                      {showAllContratos ? `Mostrar apenas 2 contratos` : `Ver todos os ${contratos.length} contratos`}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right: Eventos */}
          <div>
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-5 w-5" /> Eventos
                  </CardTitle>
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Novo Evento</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Registrar Evento</DialogTitle></DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label>Tipo</Label>
                          <Select value={eventoTipo} onValueChange={setEventoTipo}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="contato_cliente">Contato com Cliente</SelectItem>
                              <SelectItem value="anexar_arquivo">Anexar Arquivo</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {eventoTipo === 'anexar_arquivo' && (
                          <div className="space-y-2">
                            <Label>Arquivo</Label>
                            <Input type="file" onChange={(e) => setEventoFile(e.target.files?.[0] || null)} />
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label>Observação</Label>
                          <Textarea placeholder="Descreva o evento..." value={eventoDescricao} onChange={(e) => setEventoDescricao(e.target.value)} />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleSaveEvento} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {eventos.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">Nenhum evento registrado.</p>
                ) : (
                  <div className="space-y-3">
                    {eventos.map((evt) => (
                      <div key={evt.id} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <Badge variant={evt.tipo === 'anexar_arquivo' ? 'secondary' : 'default'}>
                            {evt.tipo === 'contato_cliente' ? <><Phone className="h-3 w-3 mr-1" /> Contato</> : <><FileText className="h-3 w-3 mr-1" /> Arquivo</>}
                          </Badge>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openEditEvento(evt)}>
                                <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteEvento(evt.id)}>
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(evt.criado_em).toLocaleDateString('pt-BR')}{' '}
                          {new Date(evt.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          {operadorNomes[evt.criado_por] && ` - por ${operadorNomes[evt.criado_por]}`}
                        </p>
                        {evt.descricao && <p className="text-sm break-words">{evt.descricao}</p>}
                        {evt.arquivo_url && evt.arquivo_nome && (
                          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => handleDownload(evt.arquivo_url!, evt.arquivo_nome!)}>
                            <Download className="h-3 w-3 mr-1 shrink-0" />
                            <span className="truncate">{evt.arquivo_nome}</span>
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Edit Evento Dialog */}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Editar Evento</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={editEventoTipo} onValueChange={setEditEventoTipo}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contato_cliente">Contato com Cliente</SelectItem>
                      <SelectItem value="anexar_arquivo">Anexar Arquivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Observação</Label>
                  <Textarea value={editEventoDescricao} onChange={(e) => setEditEventoDescricao(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleEditEvento} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Acordos do Cliente */}
        <AcordoDevedorSection
          cpf={devedor.cpf}
          userId={user?.id || ''}
          contratosIds={contratos.map(c => c.id)}
          onContratosArquivados={fetchData}
        />
      </div>
    </AppLayout>
  );
}
