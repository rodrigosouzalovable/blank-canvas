import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Upload, FileSpreadsheet, Trash2, Check, AlertCircle, History, Users, Eye, Loader2, Square, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import * as XLSX from 'xlsx';
import { calcularComissao } from '@/lib/comissao';

type CredorLayout = 'padrao' | 'montreal' | 'montreal_atualizacao' | 'cobmais' | 'pesquisa' | 'pagamentos' | 'ume_aporte' | 'ume_consolidado';

type MontrealRowStatus = 'existe' | 'nova_parcela' | 'cliente_novo';

interface MontrealAtualizacaoRow extends DevedorRow {
  status_importacao: MontrealRowStatus;
}

interface DevedorRow {
  cpf: string;
  nascimento: string;
  nome: string;
  credor: string;
  contrato: string;
  atraso: string;
  valor_original: number;
  valor_atualizado: number;
  telefone?: string;
  telefone2?: string;
  descricao?: string;
}

interface PagamentoRow {
  cpf: string;
  cliente: string;
  numero_parcela: number;
  vencimento: string;
  valor: number;
  observacao: string;
  status_planilha: string;
  acordo_id?: string;
  pagamento_id?: string;
  ja_pago?: boolean;
  sem_acordo?: boolean;
}

interface UmeAporteParcelaRow {
  numeroParcela: number;
  dataVencimento: Date;
  valor: number;
}

interface UmeAporteGroup {
  cpf: string;
  nome: string;
  telefone: string;
  parcelas: UmeAporteParcelaRow[];
  valorTotal: number;
  numParcelas: number;
  dataPrimeiroPagamento: Date;
  diasAtraso: number;
  jaTemAcordo: boolean;
}

interface Importacao {
  id: string;
  nome_arquivo: string;
  credor: string;
  total_registros: number;
  importado_por: string;
  criado_em: string;
}

const DESCRICOES: Record<CredorLayout, string> = {
  padrao: 'A = CPF/CNPJ, B = Nascimento, C = Cliente, D = Credor, E = Contrato, F = Atraso, G = Risco (valor devido)',
  montreal: 'A = Parceiro, B = Razão Social, C = CNPJ/CPF, D = Fone1, E = Fone2, F = Apelido, G = Atraso (dias), H = Nro Nota, I = Desdob., J = Vlr do Desdobramento, K = Dt. Venc. Inicial',
  montreal_atualizacao: 'Importação inteligente MONTREAL — Cruza com dados existentes e insere apenas parcelas novas. Mesmo layout da planilha Montreal.',
  cobmais: 'A = CPF/CNPJ, B = Cliente, C = Contrato, D = Número, E = Vencimento, F = Valor, G = Total, H = Telefone | Aba 2: Telefones (opcional)',
  pesquisa: 'A = CPF/CNPJ, B = Nome, C = Telefone',
  pagamentos: 'A = CPF/CNPJ, B = Cliente, C = Credor, D = Contrato, E = Inclusão, F = Arquivo, G = Número, H = Vencimento, I = Valor, J = Observação, K = Status — Marca parcelas PAGAS automaticamente',
  ume_aporte: 'A = CPF, B = Nome, C = Telefone, D = Nº Parcela, E = Data Vencimento, F = Valor Parcela — Cria acordos automaticamente no sistema',
  ume_consolidado: 'A = CPF, B = Nome, C = Credor, D = Contrato, E = Nº Parcela, F = Vencimento, G = Valor Parcela, H = Valor Total — Importa INADIMPLENTES e APORTE juntos',
};

export default function ImportarDevedores() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [credorSelecionado, setCredorSelecionado] = useState<CredorLayout>('padrao');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<DevedorRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [montrealGrouped, setMontrealGrouped] = useState(true);
  const [importacoes, setImportacoes] = useState<Importacao[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedImportacoes, setSelectedImportacoes] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [parsing, setParsing] = useState(false);
  const [credorDestino, setCredorDestino] = useState('');
  const [credorOutro, setCredorOutro] = useState('');
  const [importProgress, setImportProgress] = useState(0);
  const [insertedCount, setInsertedCount] = useState(0);

  // Pagamentos-specific state
  const [pagamentoRows, setPagamentoRows] = useState<PagamentoRow[]>([]);
  const [pagamentoImporting, setPagamentoImporting] = useState(false);
  const [pagamentoImported, setPagamentoImported] = useState(false);
  const [pagamentoProgress, setPagamentoProgress] = useState(0);
  const [pagamentoUpdated, setPagamentoUpdated] = useState(0);

  // UME Aporte state
  const [umeAporteGroups, setUmeAporteGroups] = useState<UmeAporteGroup[]>([]);
  const [umeAporteImporting, setUmeAporteImporting] = useState(false);
  const [umeAporteImported, setUmeAporteImported] = useState(false);
  const [umeAporteProgress, setUmeAporteProgress] = useState(0);
  const [umeAporteInserted, setUmeAporteInserted] = useState(0);

  // Montreal Atualização state
  const [montrealRows, setMontrealRows] = useState<MontrealAtualizacaoRow[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const CREDORES_OPCOES = ['MUNDO DA MODA', 'UME | NOVO MUNDO', 'MONTREAL'];

  // Multi-file batch state
  const [files, setFiles] = useState<File[]>([]);
  const [fileResults, setFileResults] = useState<{name: string; status: 'pending'|'processing'|'done'|'error'; count: number; error?: string}[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(-1);
  const [batchImporting, setBatchImporting] = useState(false);
  const stopRef = useRef(false);

  // Background jobs polling
  const [backgroundJobs, setBackgroundJobs] = useState<any[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPagamentos = credorSelecionado === 'pagamentos';
  const isMontrealAtualizacao = credorSelecionado === 'montreal_atualizacao';
  const isUmeAporte = credorSelecionado === 'ume_aporte';
  const isUmeConsolidado = credorSelecionado === 'ume_consolidado';

  const fetchImportacoes = useCallback(async () => {
    setLoadingHistory(true);
    const { data, error } = await supabase
      .from('importacoes' as any)
      .select('*')
      .order('criado_em', { ascending: false });
    if (!error && data) {
      setImportacoes(data as unknown as Importacao[]);
    }
    setLoadingHistory(false);
  }, []);

  // Fetch background jobs
  const fetchBackgroundJobs = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('importacao_jobs' as any)
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['pendente', 'processando', 'concluido', 'erro'])
      .order('criado_em', { ascending: false })
      .limit(20);
    if (data) setBackgroundJobs(data as any[]);
  }, [user]);

  useEffect(() => {
    fetchImportacoes();
    fetchBackgroundJobs();
  }, [fetchImportacoes, fetchBackgroundJobs]);

  // Poll for active jobs
  useEffect(() => {
    const hasActive = backgroundJobs.some((j: any) => j.status === 'pendente' || j.status === 'processando');
    if (hasActive && !pollingRef.current) {
      pollingRef.current = setInterval(() => {
        fetchBackgroundJobs();
        fetchImportacoes();
      }, 3000);
    } else if (!hasActive && pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [backgroundJobs, fetchBackgroundJobs, fetchImportacoes]);

  const handleCredorChange = (value: CredorLayout) => {
    setCredorSelecionado(value);
    setFile(null);
    setRows([]);
    setPagamentoRows([]);
    setMontrealRows([]);
    setUmeAporteGroups([]);
    setImported(false);
    setPagamentoImported(false);
    setUmeAporteImported(false);
    if (value === 'pagamentos') {
      setCredorDestino('UME | NOVO MUNDO');
    }
    if (value === 'montreal_atualizacao') {
      setCredorDestino('MONTREAL');
    }
    if (value === 'ume_aporte') {
      setCredorDestino('UME | NOVO MUNDO');
    }
    if (value === 'ume_consolidado') {
      setCredorDestino('UME | NOVO MUNDO');
    }
  };

  const parseNum = (val: unknown) => {
    if (val === undefined || val === null) return 0;
    const raw = String(val).replace(/[^\d.,-]/g, '').replace(',', '.');
    return parseFloat(raw) || 0;
  };

  const getSheetRowsByLetters = (sheet: XLSX.WorkSheet): Record<string, unknown>[] => {
    const cellKeys = Object.keys(sheet).filter((key) => !key.startsWith('!'));
    if (cellKeys.length === 0) return [];

    let maxRow = 0;
    let maxCol = 0;

    for (const key of cellKeys) {
      const decoded = XLSX.utils.decode_cell(key);
      if (decoded.r > maxRow) maxRow = decoded.r;
      if (decoded.c > maxCol) maxCol = decoded.c;
    }

    const rows: Record<string, unknown>[] = [];

    for (let r = 0; r <= maxRow; r++) {
      const record: Record<string, unknown> = {};

      for (let c = 0; c <= maxCol; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (!cell) continue;

        const key = String.fromCharCode(65 + c);

        if (cell.t === 'd') {
          record[key] = cell.v;
        } else if (cell.t === 'n' && typeof cell.v === 'number') {
          const maybeDate = XLSX.SSF.parse_date_code(cell.v);
          if (key === 'E' && maybeDate && cell.v > 20000 && cell.v < 90000) {
            record[key] = new Date(maybeDate.y, maybeDate.m - 1, maybeDate.d);
          } else {
            record[key] = cell.v;
          }
        } else {
          record[key] = cell.v;
        }
      }

      if (Object.keys(record).length > 0) {
        rows.push(record);
      }
    }

    return rows;
  };

  const normalizeHeaderValue = (value: unknown) => {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toUpperCase();
  };

  const findBestSheetForUmeAporte = (workbook: XLSX.WorkBook) => {
    let fallbackSheet = workbook.Sheets[workbook.SheetNames[0]];
    let bestSheet = fallbackSheet;
    let bestScore = -1;

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = getSheetRowsByLetters(sheet);
      if (rows.length === 0) continue;

      const headerRow = rows[0] ?? {};
      const headers = ['A', 'B', 'C', 'D', 'E', 'F'].map((col) => normalizeHeaderValue(headerRow[col]));
      const hasCpf = headers[0].includes('CPF');
      const hasNome = headers[1].includes('CLIENTE') || headers[1].includes('NOME');
      const hasTelefone = headers[2].includes('TELEFONE') || headers[2].includes('FONE') || headers[2].includes('CELULAR');
      const hasParcela = headers[3].includes('NUMERO') || headers[3].includes('NRO') || headers[3].includes('PARCELA');
      const hasVencimento = headers[4].includes('VENC');
      const hasValor = headers[5].includes('VALOR');

      const score = [hasCpf, hasNome, hasTelefone, hasParcela, hasVencimento, hasValor].filter(Boolean).length;

      if (score > bestScore || (score === bestScore && rows.length > getSheetRowsByLetters(bestSheet).length)) {
        bestSheet = sheet;
        bestScore = score;
      }

      if (score >= 5 && rows.length > 1) {
        fallbackSheet = sheet;
      }
    }

    return bestScore >= 4 ? bestSheet : fallbackSheet;
  };

  // Normaliza CPF/CNPJ: pad-left de zeros (corrige Excel que perde zero à esquerda em células numéricas)
  const normalizeCpfCnpj = (raw: unknown): string => {
    const digits = String(raw ?? '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length <= 11) return digits.padStart(11, '0');
    if (digits.length <= 14) return digits.padStart(14, '0');
    return digits;
  };

  const parsePadrao = (dataRows: Record<string, unknown>[]): DevedorRow[] => {
    return dataRows.map((row) => {
      const risco = parseNum(row['G']);
      return {
        cpf: normalizeCpfCnpj(row['A']),
        nascimento: String(row['B'] ?? ''),
        nome: String(row['C'] ?? ''),
        credor: String(row['D'] ?? ''),
        contrato: String(row['E'] ?? ''),
        atraso: String(row['F'] ?? ''),
        valor_original: risco,
        valor_atualizado: risco,
      };
    }).filter(r => r.cpf.length >= 11);
  };

  const insertTelefonesFromRows = async (importedRows: DevedorRow[], userId: string) => {
    const phoneRecords: { devedor_cpf: string; numero: string; tipo: string; criado_por: string; is_whatsapp: boolean; is_contato: boolean; observacao: string }[] = [];
    const seenPhones = new Set<string>();

    for (const row of importedRows) {
      const phones = [row.telefone, row.telefone2].filter(Boolean) as string[];
      for (const phone of phones) {
        const normalized = phone.replace(/\D/g, '');
        if (!normalized || normalized.length < 10) continue;
        const key = `${row.cpf}_${normalized}`;
        if (seenPhones.has(key)) continue;
        seenPhones.add(key);
        phoneRecords.push({
          devedor_cpf: row.cpf,
          numero: phone,
          tipo: 'celular',
          criado_por: userId,
          is_whatsapp: false,
          is_contato: false,
          observacao: 'Importado da planilha',
        });
      }
    }

    if (phoneRecords.length === 0) return 0;

    // Fetch existing phones to avoid duplicates
    const cpfs = [...new Set(phoneRecords.map(p => p.devedor_cpf))];
    const existingPhones = new Set<string>();
    const PAGE_SIZE = 1000;
    for (let i = 0; i < cpfs.length; i += 10) {
      const cpfBatch = cpfs.slice(i, i + 10);
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from('devedor_telefones' as any)
          .select('devedor_cpf, numero')
          .in('devedor_cpf', cpfBatch)
          .range(from, from + PAGE_SIZE - 1);
        if (!data || data.length === 0) break;
        for (const t of data as any[]) {
          existingPhones.add(`${t.devedor_cpf}_${String(t.numero).replace(/\D/g, '')}`);
        }
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
    }

    const newRecords = phoneRecords.filter(p => {
      const key = `${p.devedor_cpf}_${p.numero.replace(/\D/g, '')}`;
      return !existingPhones.has(key);
    });

    if (newRecords.length === 0) return 0;

    const BATCH = 500;
    for (let i = 0; i < newRecords.length; i += BATCH) {
      const batch = newRecords.slice(i, i + BATCH);
      await supabase.from('devedor_telefones' as any).insert(batch as any);
    }
    return newRecords.length;
  };

  const parseMontreal = (dataRows: Record<string, unknown>[]): DevedorRow[] => {
    return dataRows.map((row) => {
      const valor = parseNum(row['J']);
      const tel1 = String(row['D'] ?? '').replace(/\D/g, '');
      const tel2 = String(row['E'] ?? '').replace(/\D/g, '');

      let vencimentoStr = '';
      const vencRaw = row['K'];
      if (typeof vencRaw === 'number') {
        const dt = XLSX.SSF.parse_date_code(vencRaw);
        if (dt) {
          vencimentoStr = `${String(dt.d).padStart(2, '0')}/${String(dt.m).padStart(2, '0')}/${dt.y}`;
        }
      } else if (vencRaw) {
        vencimentoStr = String(vencRaw);
      }

      return {
        cpf: normalizeCpfCnpj(row['C']),
        nascimento: '',
        nome: String(row['B'] ?? ''),
        credor: 'MONTREAL',
        contrato: String(row['H'] ?? ''),
        descricao: String(row['I'] ?? ''),
        atraso: vencimentoStr,
        valor_original: valor,
        valor_atualizado: valor,
        telefone: tel1 || tel2 || undefined,
        telefone2: tel1 ? (tel2 || undefined) : undefined,
      };
    }).filter(r => r.cpf.length >= 11);
  };

  const parseMontrealAtualizacao = async (dataRows: Record<string, unknown>[]): Promise<MontrealAtualizacaoRow[]> => {
    const parsed = parseMontreal(dataRows);
    if (parsed.length === 0) return [];

    const uniqueCpfs = [...new Set(parsed.map(r => r.cpf))];

    // Fetch existing devedores for these CPFs
    const existingMap = new Map<string, { cpf: string; contrato: string; descricao: string; data_vencimento: string }[]>();
    
    for (let i = 0; i < uniqueCpfs.length; i += 10) {
      const batch = uniqueCpfs.slice(i, i + 10);
      let allData: any[] = [];
      let from = 0;
      const PAGE_SIZE = 1000;
      
      while (true) {
        const { data } = await supabase
          .from('devedores')
          .select('cpf, contrato, descricao, data_vencimento')
          .eq('credor', 'MONTREAL')
          .eq('ativo', true)
          .in('cpf', batch)
          .range(from, from + PAGE_SIZE - 1);
        
        if (data && data.length > 0) {
          allData = allData.concat(data);
          if (data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        } else {
          break;
        }
      }
      
      for (const d of allData) {
        const cpfNorm = (d.cpf || '').replace(/\D/g, '');
        if (!existingMap.has(cpfNorm)) existingMap.set(cpfNorm, []);
        existingMap.get(cpfNorm)!.push({
          cpf: cpfNorm,
          contrato: d.contrato || '',
          descricao: d.descricao || '',
          data_vencimento: d.data_vencimento || '',
        });
      }
    }

    return parsed.map(row => {
      const existingForCpf = existingMap.get(row.cpf);
      if (!existingForCpf || existingForCpf.length === 0) {
        return { ...row, status_importacao: 'cliente_novo' as MontrealRowStatus };
      }

      const vencIso = parseDate(row.atraso);
      const match = existingForCpf.find(e => 
        e.contrato === (row.contrato || '') && 
        e.descricao === (row.descricao || '') &&
        e.data_vencimento === (vencIso || '')
      );

      return {
        ...row,
        status_importacao: match ? 'existe' as MontrealRowStatus : 'nova_parcela' as MontrealRowStatus,
      };
    });
  };

  const parsePesquisa = (dataRows: Record<string, unknown>[]): DevedorRow[] => {
    return dataRows.map((row) => {
      const cpf = String(row['A'] ?? '').replace(/\D/g, '');
      const nome = String(row['B'] ?? '').trim();
      const telefone = String(row['C'] ?? '').replace(/\D/g, '');
      return {
        cpf,
        nascimento: '',
        nome,
        credor: '',
        contrato: '',
        atraso: '',
        valor_original: 0,
        valor_atualizado: 0,
        telefone: telefone || undefined,
      };
    }).filter(r => r.cpf.length >= 11 && r.nome.length > 0);
  };

  const isNDValue = (val: unknown): boolean => {
    if (val === undefined || val === null) return true;
    const s = String(val).trim().toUpperCase();
    return s === '#N/D' || s === '#N/A' || s === '#REF!' || s === '#VALUE!' || s === '';
  };

  const parseUmeConsolidado = (dataRows: Record<string, unknown>[]): DevedorRow[] => {
    return dataRows.map((row) => {
      let cpf = String(row['A'] ?? '').replace(/\D/g, '');
      if (!cpf) return null;
      cpf = cpf.padStart(11, '0');

      const nome = String(row['B'] ?? '').trim();
      if (!nome) return null;

      const credorRaw = String(row['C'] ?? '').toUpperCase();
      const isAporte = credorRaw.includes('APORTE');
      const credor = isAporte ? 'ume_novo_mundo_aporte' : 'ume_novo_mundo';

      const contrato = String(row['D'] ?? '').trim();
      const numeroParcela = parseInt(String(row['E'] ?? '0')) || 0;
      const valor = parseNum(row['G']);
      const valorTotal = parseNum(row['H']);

      let vencimentoStr = '';
      const vencRaw = row['F'];
      if (typeof vencRaw === 'number') {
        const dt = XLSX.SSF.parse_date_code(vencRaw);
        if (dt) {
          vencimentoStr = `${String(dt.d).padStart(2, '0')}/${String(dt.m).padStart(2, '0')}/${dt.y}`;
        }
      } else if (vencRaw) {
        vencimentoStr = String(vencRaw);
      }

      return {
        cpf,
        nascimento: vencimentoStr, // use nascimento field for date (used by parseDate in handleImport)
        nome,
        credor,
        contrato,
        atraso: '',
        descricao: `Parcela ${numeroParcela}`,
        valor_original: valor,
        valor_atualizado: valor,
      };
    }).filter(Boolean) as DevedorRow[];
  };

  const parseCobmais = (workbook: XLSX.WorkBook): DevedorRow[] => {
    const sheet1 = workbook.Sheets[workbook.SheetNames[0]];
    const rows1 = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet1, { header: 'A' }).slice(1);
    console.log('[COBMAIS] Total de abas:', workbook.SheetNames.length, '| Linhas aba 1:', rows1.length);

    const sheet2 = workbook.SheetNames.length >= 2 ? workbook.Sheets[workbook.SheetNames[1]] : null;
    const rows2 = sheet2 ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet2, { header: 'A' }).slice(1) : [];

    const cpfRealMap = new Map<string, string>();
    const phoneMap = new Map<string, string>();
    for (const row of rows2) {
      const cpfReal = String(row['A'] ?? '').replace(/\D/g, '');
      if (!cpfReal) continue;
      const cpfSemZeros = cpfReal.replace(/^0+/, '');
      if (cpfSemZeros && !cpfRealMap.has(cpfSemZeros)) {
        cpfRealMap.set(cpfSemZeros, cpfReal);
      }
      const ativo = String(row['I'] ?? '').toUpperCase().trim();
      if (cpfReal && ativo === 'SIM' && !phoneMap.has(cpfReal)) {
        const numero = String(row['C'] ?? '').replace(/\D/g, '');
        if (numero) phoneMap.set(cpfReal, numero);
      }
    }

    const resolverCpf = (raw: unknown): string => {
      const digits = String(raw ?? '').replace(/\D/g, '');
      if (!digits) return '';
      const semZeros = digits.replace(/^0+/, '');
      const cpfReal = cpfRealMap.get(semZeros);
      if (cpfReal) return cpfReal;
      if (digits.length <= 11) return digits.padStart(11, '0');
      if (digits.length <= 14) return digits.padStart(14, '0');
      return digits;
    };

    const devedores: DevedorRow[] = [];
    for (const row of rows1) {
      const cpf = resolverCpf(row['A']);
      if (cpf.length < 11) continue;

      const contrato = String(row['C'] ?? '').trim();
      const valor = parseNum(row['F']);
      const total = isNDValue(row['G']) ? valor : parseNum(row['G']);

      // Telefone from column H (direct), fallback to phone map from sheet 2
      let telefone = '';
      if (!isNDValue(row['H'])) {
        telefone = String(row['H']).replace(/\D/g, '');
      }
      if (!telefone) {
        telefone = phoneMap.get(cpf) || '';
      }

      let vencimentoStr = '';
      const vencRaw = row['E'];
      if (typeof vencRaw === 'number') {
        const dt = XLSX.SSF.parse_date_code(vencRaw);
        if (dt) {
          vencimentoStr = `${String(dt.d).padStart(2, '0')}/${String(dt.m).padStart(2, '0')}/${dt.y}`;
        }
      } else if (vencRaw && !isNDValue(vencRaw)) {
        vencimentoStr = String(vencRaw);
      }

      devedores.push({
        cpf,
        nascimento: '',
        nome: isNDValue(row['B']) ? '' : String(row['B'] ?? ''),
        credor: '',
        contrato: isNDValue(contrato) ? '' : contrato,
        atraso: vencimentoStr,
        valor_original: valor,
        valor_atualizado: total || valor,
        telefone: telefone || undefined,
      });
    }

    console.log(`[COBMAIS] Total de linhas lidas: ${devedores.length}`);
    return devedores;
  };

  const parsePagamentos = async (dataRows: Record<string, unknown>[]): Promise<PagamentoRow[]> => {
    // Parse rows and filter only STATUS = "PAGA"
    const rawRows: PagamentoRow[] = [];
    // Debug: log first 3 rows to see actual column mapping
    console.log('[PAGAMENTOS] Primeiras 3 linhas:', dataRows.slice(0, 3).map(r => {
      const keys = Object.keys(r);
      return { keys, K: r['K'], J: r['J'], allValues: keys.map(k => `${k}=${r[k]}`) };
    }));
    console.log('[PAGAMENTOS] Total dataRows:', dataRows.length);
    for (const row of dataRows) {
      const statusRaw = String(row['K'] ?? '').trim().toUpperCase();
      if (statusRaw !== 'PAGA') continue;

      let cpf = String(row['A'] ?? '').replace(/\D/g, '');
      if (cpf.length >= 10 && cpf.length < 11) cpf = cpf.padStart(11, '0');
      if (cpf.length < 11) continue;

      let vencimentoStr = '';
      const vencRaw = row['H'];
      if (typeof vencRaw === 'number') {
        const dt = XLSX.SSF.parse_date_code(vencRaw);
        if (dt) {
          vencimentoStr = `${String(dt.d).padStart(2, '0')}/${String(dt.m).padStart(2, '0')}/${dt.y}`;
        }
      } else if (vencRaw) {
        vencimentoStr = String(vencRaw);
      }

      rawRows.push({
        cpf,
        cliente: String(row['B'] ?? ''),
        numero_parcela: parseInt(String(row['G'] ?? '0')) || 0,
        vencimento: vencimentoStr,
        valor: parseNum(row['I']),
        observacao: String(row['J'] ?? ''),
        status_planilha: 'PAGA',
      });
    }

    if (rawRows.length === 0) return [];

    // Detect 0-based parcela numbering per CPF and shift to 1-based
    const cpfGroups = new Map<string, PagamentoRow[]>();
    for (const row of rawRows) {
      if (!cpfGroups.has(row.cpf)) cpfGroups.set(row.cpf, []);
      cpfGroups.get(row.cpf)!.push(row);
    }
    for (const [, rows] of cpfGroups) {
      const hasZero = rows.some(r => r.numero_parcela === 0);
      if (hasZero) {
        for (const r of rows) {
          r.numero_parcela += 1;
        }
      }
    }

    // Get unique CPFs
    const uniqueCpfs = [...new Set(rawRows.map(r => r.cpf))];
    console.log(`[PAGAMENTOS] ${rawRows.length} linhas PAGA, ${uniqueCpfs.length} CPFs únicos`);

    // Fetch all active acordos for these CPFs
    const { data: acordos } = await supabase
      .from('acordos')
      .select('id, cliente_cpf, status')
      .in('status', ['ativo', 'concluido']);

    // Build CPF -> acordo map (normalized)
    const cpfAcordoMap = new Map<string, string>();
    if (acordos) {
      for (const a of acordos) {
        const cpfNorm = (a.cliente_cpf || '').replace(/\D/g, '');
        if (cpfNorm && !cpfAcordoMap.has(cpfNorm)) {
          cpfAcordoMap.set(cpfNorm, a.id);
        }
      }
    }

    // Get acordo IDs that we found
    const acordoIds = [...new Set(
      rawRows
        .map(r => cpfAcordoMap.get(r.cpf))
        .filter(Boolean)
    )] as string[];

    // Fetch all pagamentos for these acordos
    const pagamentosMap = new Map<string, { id: string; numero_parcela: number; status: string }[]>();
    if (acordoIds.length > 0) {
      // Fetch in batches to avoid URI too long
      for (let i = 0; i < acordoIds.length; i += 50) {
        const batch = acordoIds.slice(i, i + 50);
        const { data: pags } = await supabase
          .from('pagamentos')
          .select('id, acordo_id, numero_parcela, status')
          .in('acordo_id', batch);
        if (pags) {
          for (const p of pags) {
            if (!pagamentosMap.has(p.acordo_id)) pagamentosMap.set(p.acordo_id, []);
            pagamentosMap.get(p.acordo_id)!.push({ id: p.id, numero_parcela: p.numero_parcela, status: p.status });
          }
        }
      }
    }

    // Match each row
    for (const row of rawRows) {
      const acordoId = cpfAcordoMap.get(row.cpf);
      if (!acordoId) {
        row.sem_acordo = true;
        continue;
      }
      row.acordo_id = acordoId;
      const parcelas = pagamentosMap.get(acordoId) || [];
      const match = parcelas.find(p => p.numero_parcela === row.numero_parcela);
      if (match) {
        row.pagamento_id = match.id;
        row.ja_pago = match.status === 'pago';
      } else {
        row.sem_acordo = true; // parcela not found
      }
    }

    return rawRows;
  };

  const parseUmeAporte = async (dataRows: Record<string, unknown>[]): Promise<UmeAporteGroup[]> => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const cpfMap = new Map<string, { nome: string; telefone: string; parcelas: UmeAporteParcelaRow[] }>();

    console.log('parseUmeAporte: total rows received:', dataRows.length);
    if (dataRows.length > 0) {
      console.log('parseUmeAporte: first row sample:', JSON.stringify(dataRows[0]));
    }
    for (const row of dataRows) {
      let cpfRaw = String(row['A'] ?? '').replace(/\D/g, '');
      if (!cpfRaw) continue;
      cpfRaw = cpfRaw.padStart(11, '0');

      const nome = String(row['B'] ?? '').trim();
      if (!nome) continue;
      const telefone = String(row['C'] ?? '').replace(/\D/g, '');
      const numeroParcela = parseInt(String(row['D'] ?? '0')) || 0;
      const valor = parseNum(row['F']);

      let dataVencimento: Date | null = null;
      const vencRaw = row['E'];
      if (vencRaw instanceof Date && !isNaN(vencRaw.getTime())) {
        dataVencimento = vencRaw;
      } else if (typeof vencRaw === 'number') {
        const dt = XLSX.SSF.parse_date_code(vencRaw);
        if (dt) {
          dataVencimento = new Date(dt.y, dt.m - 1, dt.d);
        }
      } else if (vencRaw) {
        const vStr = String(vencRaw).trim();
        // Try dd/mm/yyyy
        const parts = vStr.split('/');
        if (parts.length === 3) {
          dataVencimento = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        } else {
          // Try ISO or other parseable format
          const tryDate = new Date(vStr);
          if (!isNaN(tryDate.getTime())) {
            dataVencimento = tryDate;
          }
        }
      }
      if (!dataVencimento || isNaN(dataVencimento.getTime())) continue;

      if (!cpfMap.has(cpfRaw)) {
        cpfMap.set(cpfRaw, { nome, telefone, parcelas: [] });
      }
      cpfMap.get(cpfRaw)!.parcelas.push({ numeroParcela, dataVencimento, valor });
    }

    if (cpfMap.size === 0) return [];

    for (const [, group] of cpfMap) {
      group.parcelas.sort((a, b) => a.numeroParcela - b.numeroParcela);
    }

    // Check existing acordos by CPF
    const existingCpfs = new Set<string>();
    const { data: allAcordos } = await supabase
      .from('acordos')
      .select('cliente_cpf')
      .in('status', ['ativo', 'concluido']);
    if (allAcordos) {
      for (const a of allAcordos) {
        const cpfNorm = (a.cliente_cpf || '').replace(/\D/g, '').padStart(11, '0');
        existingCpfs.add(cpfNorm);
      }
    }

    const groups: UmeAporteGroup[] = [];
    for (const [cpf, data] of cpfMap) {
      const valorTotal = data.parcelas.reduce((sum, p) => sum + p.valor, 0);
      const numParcelas = data.parcelas.length;
      const dataPrimeiroPagamento = new Date(Math.min(...data.parcelas.map(p => p.dataVencimento.getTime())));
      const diffMs = hoje.getTime() - dataPrimeiroPagamento.getTime();
      const diasAtraso = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

      groups.push({
        cpf, nome: data.nome, telefone: data.telefone, parcelas: data.parcelas,
        valorTotal, numParcelas, dataPrimeiroPagamento, diasAtraso,
        jaTemAcordo: existingCpfs.has(cpf),
      });
    }
    return groups;
  };

  const handleImportUmeAporte = async () => {
    if (!user) return;
    const toImport = umeAporteGroups.filter(g => !g.jaTemAcordo);
    if (toImport.length === 0) {
      toast({ title: 'Nada para importar', description: 'Todos os clientes já possuem acordo no sistema.', variant: 'destructive' });
      return;
    }

    setUmeAporteImporting(true);
    setUmeAporteProgress(0);
    setUmeAporteInserted(0);

    const { data: importacao, error: importError } = await supabase
      .from('importacoes' as any)
      .insert({ nome_arquivo: file?.name || 'unknown', credor: 'UME | NOVO MUNDO', total_registros: toImport.length, importado_por: user.id } as any)
      .select('id')
      .single();

    if (importError || !importacao) {
      toast({ title: 'Erro ao registrar importação', description: importError?.message, variant: 'destructive' });
      setUmeAporteImporting(false);
      return;
    }

    let inserted = 0;
    for (let i = 0; i < toImport.length; i++) {
      const group = toImport[i];
      const comissao = calcularComissao(group.valorTotal, group.numParcelas, group.diasAtraso);

      const { data: acordo, error: acordoError } = await supabase
        .from('acordos')
        .insert({
          cliente_nome: group.nome,
          cliente_cpf: group.cpf,
          cliente_telefone: group.telefone || null,
          valor_total: Math.round(group.valorTotal * 100) / 100,
          parcelas: group.numParcelas,
          valor_parcela: Math.round((group.parcelas[0]?.valor || group.valorTotal / group.numParcelas) * 100) / 100,
          data_primeiro_pagamento: group.dataPrimeiroPagamento.toISOString().split('T')[0],
          dias_atraso: group.diasAtraso,
          percentual_comissao: comissao.percentual,
          comissao_total: comissao.comissaoTotal,
          empresa: 'ume_novo_mundo',
          user_id: user.id,
          status: 'ativo',
          duplicado_verificado: true,
        } as any)
        .select('id')
        .single();

      if (acordoError || !acordo) {
        console.error('Erro ao inserir acordo:', acordoError);
        continue;
      }

      const pagamentosToInsert = group.parcelas.map(p => ({
        acordo_id: (acordo as any).id,
        numero_parcela: p.numeroParcela,
        data_prevista: p.dataVencimento.toISOString().split('T')[0],
        valor_parcela: Math.round(p.valor * 100) / 100,
        comissao_parcela: Math.round(p.valor * (comissao.percentual / 100) * 100) / 100,
        status: 'pendente',
      }));

      const { error: pagError } = await supabase.from('pagamentos').insert(pagamentosToInsert as any);
      if (pagError) console.error('Erro ao inserir pagamentos:', pagError);

      inserted++;
      setUmeAporteInserted(inserted);
      setUmeAporteProgress(Math.round(((i + 1) / toImport.length) * 100));
    }

    setUmeAporteImported(true);
    setUmeAporteImporting(false);
    toast({ title: 'Importação concluída', description: `${inserted} acordos criados com sucesso.` });
    fetchImportacoes();
  };

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    setImported(false);
    setPagamentoImported(false);
    setUmeAporteImported(false);

    // Multi-file: batch mode, no preview
    if (selectedFiles.length > 1) {
      setFiles(selectedFiles);
      setFile(null);
      setRows([]);
      setPagamentoRows([]);
      setMontrealRows([]);
      setUmeAporteGroups([]);
      setFileResults(selectedFiles.map(f => ({ name: f.name, status: 'pending' as const, count: 0 })));
      setParsing(false);
      return;
    }

    // Single file: existing preview flow
    const f = selectedFiles[0];
    setFile(f);
    setFiles([f]);
    setFileResults([]);
    setParsing(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const binaryStr = evt.target?.result as string;
        const usesCellDates = credorSelecionado === 'ume_aporte';
        const workbook = XLSX.read(binaryStr, { type: 'binary', cellDates: usesCellDates });

        if (credorSelecionado === 'ume_consolidado') {
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const dataRows = getSheetRowsByLetters(sheet).slice(1);
          const parsed = parseUmeConsolidado(dataRows);
          setRows(parsed);
          setPagamentoRows([]);
          setMontrealRows([]);
          setUmeAporteGroups([]);
          if (parsed.length === 0) {
            toast({ title: 'Nenhum registro encontrado', description: 'A planilha não contém dados válidos.', variant: 'destructive' });
          }
        } else if (credorSelecionado === 'ume_aporte') {
          const sheet = findBestSheetForUmeAporte(workbook);
          const dataRows = getSheetRowsByLetters(sheet).slice(1);
          const parsed = await parseUmeAporte(dataRows);
          setUmeAporteGroups(parsed);
          setRows([]);
          setPagamentoRows([]);
          setMontrealRows([]);
          if (parsed.length === 0) {
            toast({ title: 'Nenhum registro encontrado', description: 'A planilha não contém dados válidos.', variant: 'destructive' });
          }
        } else if (credorSelecionado === 'pagamentos') {
          let bestSheet = workbook.Sheets[workbook.SheetNames[0]];
          let bestSheetName = workbook.SheetNames[0];
          let bestRowCount = 0;
          for (const sName of workbook.SheetNames) {
            const s = workbook.Sheets[sName];
            const ref = s['!ref'] || '';
            const match = ref.match(/:.*?(\d+)$/);
            const rowCount = match ? parseInt(match[1], 10) : 0;
            if (rowCount > bestRowCount) {
              bestRowCount = rowCount;
              bestSheet = s;
              bestSheetName = sName;
            }
          }
          console.log('[PAGAMENTOS] Melhor aba:', bestSheetName, '| Linhas:', bestRowCount);
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(bestSheet, { header: 'A' });
          const dataRows = json.slice(1);
          const parsed = await parsePagamentos(dataRows);
          setPagamentoRows(parsed);
          setRows([]);
          setMontrealRows([]);
          setUmeAporteGroups([]);
          if (parsed.length === 0) {
            toast({ title: 'Nenhuma parcela PAGA encontrada', description: 'A planilha não contém linhas com status "PAGA" na coluna K.', variant: 'destructive' });
          }
        } else if (credorSelecionado === 'montreal_atualizacao') {
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 'A' });
          const dataRows = json.slice(1);
          const parsed = await parseMontrealAtualizacao(dataRows);
          setMontrealRows(parsed);
          setRows([]);
          setPagamentoRows([]);
          setUmeAporteGroups([]);
          if (parsed.length === 0) {
            toast({ title: 'Nenhum registro encontrado', description: 'A planilha não contém dados válidos.', variant: 'destructive' });
          }
        } else if (credorSelecionado === 'cobmais') {
          const parsed = parseCobmais(workbook);
          setRows(parsed);
          setPagamentoRows([]);
          setMontrealRows([]);
          setUmeAporteGroups([]);
          if (parsed.length === 0) {
            toast({ title: 'Nenhum registro encontrado', description: 'A planilha não contém dados válidos.', variant: 'destructive' });
          }
        } else {
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 'A' });
          const dataRows = json.slice(1);
          let parsed: DevedorRow[];
          if (credorSelecionado === 'montreal') {
            parsed = parseMontreal(dataRows);
          } else if (credorSelecionado === 'pesquisa') {
            parsed = parsePesquisa(dataRows);
          } else {
            parsed = parsePadrao(dataRows);
          }
          setRows(parsed);
          setPagamentoRows([]);
          setMontrealRows([]);
          setUmeAporteGroups([]);
          if (parsed.length === 0) {
            toast({ title: 'Nenhum registro encontrado', description: 'A planilha não contém dados válidos.', variant: 'destructive' });
          }
        }
      } catch (err) {
        console.error('Erro ao processar planilha:', err);
        toast({ title: 'Erro ao ler planilha', description: 'Verifique o formato do arquivo.', variant: 'destructive' });
      }
      setParsing(false);
    };
    reader.readAsBinaryString(f);
  }, [credorSelecionado]);

  const parseDate = (raw: string): string | null => {
    if (!raw) return null;
    const parts = raw.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      if (day && month && year && year.length === 4) {
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
    }
    return null;
  };

  // Batch: read and parse a single file (returns parsed data without setting state)
  const readAndParseFile = (f: File): Promise<{ rows: DevedorRow[]; pagamentoRows: PagamentoRow[]; umeAporteGroups: UmeAporteGroup[]; montrealRows: MontrealAtualizacaoRow[] }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const binaryStr = evt.target?.result as string;
          const usesCellDates = credorSelecionado === 'ume_aporte';
          const workbook = XLSX.read(binaryStr, { type: 'binary', cellDates: usesCellDates });
          let pRows: DevedorRow[] = [];
          let pPag: PagamentoRow[] = [];
          let pUme: UmeAporteGroup[] = [];
          let pMontreal: MontrealAtualizacaoRow[] = [];

          if (credorSelecionado === 'ume_consolidado') {
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const dataRows = getSheetRowsByLetters(sheet).slice(1);
            pRows = parseUmeConsolidado(dataRows);
          } else if (credorSelecionado === 'ume_aporte') {
            const sheet = findBestSheetForUmeAporte(workbook);
            const dataRows = getSheetRowsByLetters(sheet).slice(1);
            pUme = await parseUmeAporte(dataRows);
          } else if (credorSelecionado === 'pagamentos') {
            let bestSheet = workbook.Sheets[workbook.SheetNames[0]];
            let bestRowCount = 0;
            for (const sName of workbook.SheetNames) {
              const s = workbook.Sheets[sName];
              const ref = s['!ref'] || '';
              const match = ref.match(/:.*?(\d+)$/);
              const rowCount = match ? parseInt(match[1], 10) : 0;
              if (rowCount > bestRowCount) { bestRowCount = rowCount; bestSheet = s; }
            }
            const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(bestSheet, { header: 'A' });
            pPag = await parsePagamentos(json.slice(1));
          } else if (credorSelecionado === 'montreal_atualizacao') {
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 'A' });
            pMontreal = await parseMontrealAtualizacao(json.slice(1));
          } else if (credorSelecionado === 'cobmais') {
            pRows = parseCobmais(workbook);
          } else {
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: 'A' });
            const dataRows = json.slice(1);
            if (credorSelecionado === 'montreal') pRows = parseMontreal(dataRows);
            else if (credorSelecionado === 'pesquisa') pRows = parsePesquisa(dataRows);
            else pRows = parsePadrao(dataRows);
          }
          resolve({ rows: pRows, pagamentoRows: pPag, umeAporteGroups: pUme, montrealRows: pMontreal });
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsBinaryString(f);
    });
  };

  // Batch: import parsed data for a single file (returns count of records processed)
  const importParsedData = async (parsed: { rows: DevedorRow[]; pagamentoRows: PagamentoRow[]; umeAporteGroups: UmeAporteGroup[]; montrealRows: MontrealAtualizacaoRow[] }, fileName: string): Promise<number> => {
    if (!user) return 0;

    if (credorSelecionado === 'pagamentos') {
      const toUpdate = parsed.pagamentoRows.filter(r => r.pagamento_id && !r.ja_pago);
      let updated = 0;
      for (const row of toUpdate) {
        const dataPaga = parseDate(row.vencimento);
        const { error } = await supabase.from('pagamentos').update({ status: 'pago', data_paga: dataPaga } as any).eq('id', row.pagamento_id!);
        if (!error) updated++;
      }
      return updated;
    }

    if (credorSelecionado === 'ume_aporte') {
      const toImport = parsed.umeAporteGroups.filter(g => !g.jaTemAcordo);
      if (toImport.length === 0) return 0;
      const { data: importacao } = await supabase.from('importacoes' as any).insert({ nome_arquivo: fileName, credor: 'UME | NOVO MUNDO', total_registros: toImport.length, importado_por: user.id } as any).select('id').single();
      if (!importacao) return 0;
      let inserted = 0;
      for (const group of toImport) {
        const comissao = calcularComissao(group.valorTotal, group.numParcelas, group.diasAtraso);
        const { data: acordo } = await supabase.from('acordos').insert({
          cliente_nome: group.nome, cliente_cpf: group.cpf, cliente_telefone: group.telefone || null,
          valor_total: Math.round(group.valorTotal * 100) / 100, parcelas: group.numParcelas,
          valor_parcela: Math.round((group.parcelas[0]?.valor || group.valorTotal / group.numParcelas) * 100) / 100,
          data_primeiro_pagamento: group.dataPrimeiroPagamento.toISOString().split('T')[0],
          dias_atraso: group.diasAtraso, percentual_comissao: comissao.percentual,
          comissao_total: comissao.comissaoTotal, empresa: 'ume_novo_mundo', user_id: user.id,
          status: 'ativo', duplicado_verificado: true,
        } as any).select('id').single();
        if (!acordo) continue;
        const pagamentos = group.parcelas.map(p => ({
          acordo_id: (acordo as any).id, numero_parcela: p.numeroParcela,
          data_prevista: p.dataVencimento.toISOString().split('T')[0],
          valor_parcela: Math.round(p.valor * 100) / 100,
          comissao_parcela: Math.round(p.valor * (comissao.percentual / 100) * 100) / 100, status: 'pendente',
        }));
        await supabase.from('pagamentos').insert(pagamentos as any);
        inserted++;
      }
      return inserted;
    }

    if (credorSelecionado === 'montreal_atualizacao') {
      const toImport = parsed.montrealRows.filter(r => r.status_importacao !== 'existe');
      if (toImport.length === 0) return 0;
      const { data: importacao } = await supabase.from('importacoes' as any).insert({ nome_arquivo: fileName, credor: 'MONTREAL', total_registros: toImport.length, importado_por: user.id } as any).select('id').single();
      if (!importacao) return 0;
      const importacaoId = (importacao as any).id;
      const records = toImport.map(r => ({
        nome: r.nome, cpf: r.cpf, valor_original: r.valor_original, valor_atualizado: r.valor_atualizado,
        credor: 'MONTREAL', descricao: r.descricao || null, contrato: r.contrato || null,
        data_vencimento: parseDate(r.atraso), telefone: r.telefone || null,
        importado_por: user.id, arquivo_importacao: fileName, importacao_id: importacaoId,
      }));
      const BATCH_SIZE = 500;
      let inserted = 0;
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const { error } = await supabase.from('devedores' as any).insert(records.slice(i, i + BATCH_SIZE) as any);
        if (error) break;
        inserted += records.slice(i, i + BATCH_SIZE).length;
      }
      if (inserted > 0) await insertTelefonesFromRows(parsed.montrealRows, user.id);
      return inserted;
    }

    // Standard layouts (padrao, montreal, cobmais, pesquisa, ume_consolidado)
    const rowsToImport = parsed.rows;
    if (rowsToImport.length === 0) return 0;
    const credorFinal = credorSelecionado === 'ume_consolidado' ? 'UME | NOVO MUNDO' : (credorDestino === 'outro' ? credorOutro.trim() : credorDestino);
    const { data: importacao } = await supabase.from('importacoes' as any).insert({ nome_arquivo: fileName, credor: credorFinal, total_registros: rowsToImport.length, importado_por: user.id } as any).select('id').single();
    if (!importacao) return 0;
    const importacaoId = (importacao as any).id;
    const records = rowsToImport.map(r => ({
      nome: r.nome, cpf: r.cpf, valor_original: r.valor_original, valor_atualizado: r.valor_atualizado,
      credor: credorSelecionado === 'ume_consolidado' ? r.credor : credorFinal,
      descricao: credorSelecionado === 'montreal' ? (r.descricao || null) : credorSelecionado === 'ume_consolidado' ? (r.descricao || null) : (r.credor || null),
      contrato: r.contrato || null,
      data_vencimento: credorSelecionado === 'pesquisa' ? null : (credorSelecionado === 'montreal' || credorSelecionado === 'cobmais') ? parseDate(r.atraso) : parseDate(r.nascimento),
      telefone: r.telefone || null,
      importado_por: user.id, arquivo_importacao: fileName, importacao_id: importacaoId,
    }));
    const BATCH_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const { error } = await supabase.from('devedores' as any).insert(records.slice(i, i + BATCH_SIZE) as any);
      if (error) break;
      inserted += records.slice(i, i + BATCH_SIZE).length;
    }
    if (inserted > 0 && credorSelecionado === 'montreal') {
      await insertTelefonesFromRows(rowsToImport, user.id);
    }
    return inserted;
  };

  // Prepare dados_json for the edge function based on layout
  const prepareDadosJson = (parsed: { rows: DevedorRow[]; pagamentoRows: PagamentoRow[]; umeAporteGroups: UmeAporteGroup[]; montrealRows: MontrealAtualizacaoRow[] }, fileName: string): { layout: string; credor: string; dados: any; totalRegistros: number } | null => {
    if (!user) return null;

    const credorFinal = credorSelecionado === 'ume_consolidado' ? 'UME | NOVO MUNDO' : (credorDestino === 'outro' ? credorOutro.trim() : credorDestino);

    if (credorSelecionado === 'pagamentos') {
      const updates = parsed.pagamentoRows
        .filter(r => r.pagamento_id && !r.ja_pago)
        .map(r => ({ pagamento_id: r.pagamento_id, data_paga: parseDate(r.vencimento) }));
      if (updates.length === 0) return null;
      return { layout: 'pagamentos', credor: 'UME | NOVO MUNDO', dados: { updates }, totalRegistros: updates.length };
    }

    if (credorSelecionado === 'ume_aporte') {
      const toImport = parsed.umeAporteGroups.filter(g => !g.jaTemAcordo);
      if (toImport.length === 0) return null;
      const groups = toImport.map(group => {
        const comissao = calcularComissao(group.valorTotal, group.numParcelas, group.diasAtraso);
        return {
          cliente_nome: group.nome,
          cliente_cpf: group.cpf,
          cliente_telefone: group.telefone || null,
          valor_total: Math.round(group.valorTotal * 100) / 100,
          parcelas: group.numParcelas,
          valor_parcela: Math.round((group.parcelas[0]?.valor || group.valorTotal / group.numParcelas) * 100) / 100,
          data_primeiro_pagamento: group.dataPrimeiroPagamento.toISOString().split('T')[0],
          dias_atraso: group.diasAtraso,
          percentual_comissao: comissao.percentual,
          comissao_total: comissao.comissaoTotal,
          empresa: 'ume_novo_mundo',
          pagamentos: group.parcelas.map(p => ({
            numero_parcela: p.numeroParcela,
            data_prevista: p.dataVencimento.toISOString().split('T')[0],
            valor_parcela: Math.round(p.valor * 100) / 100,
            comissao_parcela: Math.round(p.valor * (comissao.percentual / 100) * 100) / 100,
          })),
        };
      });
      return { layout: 'acordos', credor: 'UME | NOVO MUNDO', dados: { groups }, totalRegistros: groups.length };
    }

    if (credorSelecionado === 'montreal_atualizacao') {
      const toImport = parsed.montrealRows.filter(r => r.status_importacao !== 'existe');
      if (toImport.length === 0) return null;
      const records = toImport.map(r => ({
        nome: r.nome, cpf: r.cpf, valor_original: r.valor_original, valor_atualizado: r.valor_atualizado,
        credor: 'MONTREAL', descricao: r.descricao || null, contrato: r.contrato || null,
        data_vencimento: parseDate(r.atraso), telefone: r.telefone || null,
      }));
      // Prepare telefones
      const phoneRecords: any[] = [];
      const seenPhones = new Set<string>();
      for (const row of parsed.montrealRows) {
        const phones = [row.telefone, row.telefone2].filter(Boolean) as string[];
        for (const phone of phones) {
          const normalized = phone.replace(/\D/g, '');
          if (!normalized || normalized.length < 10) continue;
          const key = `${row.cpf}_${normalized}`;
          if (seenPhones.has(key)) continue;
          seenPhones.add(key);
          phoneRecords.push({
            devedor_cpf: row.cpf, numero: phone, tipo: 'celular',
            criado_por: user.id, is_whatsapp: false, is_contato: false, observacao: 'Importado da planilha',
          });
        }
      }
      return { layout: 'devedores', credor: 'MONTREAL', dados: { records, telefones: phoneRecords }, totalRegistros: records.length };
    }

    // Standard layouts
    const rowsToImport = parsed.rows;
    if (rowsToImport.length === 0) return null;
    const records = rowsToImport.map(r => ({
      nome: r.nome, cpf: r.cpf, valor_original: r.valor_original, valor_atualizado: r.valor_atualizado,
      credor: credorSelecionado === 'ume_consolidado' ? r.credor : credorFinal,
      descricao: credorSelecionado === 'montreal' ? (r.descricao || null) : credorSelecionado === 'ume_consolidado' ? (r.descricao || null) : (r.credor || null),
      contrato: r.contrato || null,
      data_vencimento: credorSelecionado === 'pesquisa' ? null : (credorSelecionado === 'montreal' || credorSelecionado === 'cobmais') ? parseDate(r.atraso) : parseDate(r.nascimento),
      telefone: r.telefone || null,
    }));
    // Montreal telefones
    let telefones: any[] = [];
    if (credorSelecionado === 'montreal') {
      const seenPhones = new Set<string>();
      for (const row of rowsToImport) {
        const phones = [row.telefone, row.telefone2].filter(Boolean) as string[];
        for (const phone of phones) {
          const normalized = phone.replace(/\D/g, '');
          if (!normalized || normalized.length < 10) continue;
          const key = `${row.cpf}_${normalized}`;
          if (seenPhones.has(key)) continue;
          seenPhones.add(key);
          telefones.push({
            devedor_cpf: row.cpf, numero: phone, tipo: 'celular',
            criado_por: user.id, is_whatsapp: false, is_contato: false, observacao: 'Importado da planilha',
          });
        }
      }
    }
    return { layout: 'devedores', credor: credorFinal, dados: { records, telefones }, totalRegistros: records.length };
  };

  // Batch: import all files via background jobs
  const handleImportAll = async () => {
    if (files.length === 0 || !user) return;
    setBatchImporting(true);
    stopRef.current = false;
    const results: {name: string; status: 'pending'|'processing'|'done'|'error'; count: number; error?: string}[] = files.map(f => ({ name: f.name, status: 'pending' as const, count: 0 }));
    setFileResults([...results]);

    for (let i = 0; i < files.length; i++) {
      if (stopRef.current) break;
      setCurrentFileIndex(i);
      results[i] = { ...results[i], status: 'processing' };
      setFileResults([...results]);

      try {
        // Parse file in browser
        const parsed = await readAndParseFile(files[i]);
        const prepared = prepareDadosJson(parsed, files[i].name);
        
        if (!prepared) {
          results[i] = { name: files[i].name, status: 'error', count: 0, error: 'Nenhum registro válido' };
          setFileResults([...results]);
          continue;
        }

        // Create job in DB
        const { data: job, error: jobError } = await supabase
          .from('importacao_jobs' as any)
          .insert({
            user_id: user.id,
            nome_arquivo: files[i].name,
            credor: prepared.credor,
            layout: prepared.layout,
            total_registros: prepared.totalRegistros,
            status: 'pendente',
            dados_json: prepared.dados,
          } as any)
          .select('id')
          .single();

        if (jobError || !job) {
          results[i] = { name: files[i].name, status: 'error', count: 0, error: jobError?.message || 'Erro ao criar job' };
          setFileResults([...results]);
          continue;
        }

        // Fire-and-forget: invoke edge function
        supabase.functions.invoke('process-import-job', {
          body: { job_id: (job as any).id },
        }).catch(err => console.error('Edge function invoke error:', err));

        results[i] = { name: files[i].name, status: 'done', count: prepared.totalRegistros };
      } catch (err: any) {
        results[i] = { name: files[i].name, status: 'error', count: 0, error: err.message || 'Erro desconhecido' };
      }
      setFileResults([...results]);
      
      // Throttle between jobs to avoid saturating browser connection pool
      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    setBatchImporting(false);
    setCurrentFileIndex(-1);
    fetchBackgroundJobs();
    const totalDone = results.filter(r => r.status === 'done').length;
    const totalErr = results.filter(r => r.status === 'error').length;
    toast({ title: 'Jobs de importação criados', description: `${totalDone} arquivo(s) enviado(s) para processamento em background${totalErr > 0 ? `, ${totalErr} com erro` : ''}. Você pode fechar a página.` });
  };

  const handleImportPagamentos = async () => {
    const toUpdate = pagamentoRows.filter(r => r.pagamento_id && !r.ja_pago);
    if (toUpdate.length === 0) {
      toast({ title: 'Nada para atualizar', description: 'Todas as parcelas já estão marcadas como pagas.', variant: 'destructive' });
      return;
    }

    setPagamentoImporting(true);
    setPagamentoProgress(0);
    setPagamentoUpdated(0);

    let updated = 0;
    for (let i = 0; i < toUpdate.length; i++) {
      const row = toUpdate[i];
      const dataPaga = parseDate(row.vencimento);
      const { error } = await supabase
        .from('pagamentos')
        .update({ status: 'pago', data_paga: dataPaga } as any)
        .eq('id', row.pagamento_id!);
      
      if (!error) {
        updated++;
        row.ja_pago = true;
      }
      setPagamentoUpdated(updated);
      setPagamentoProgress(Math.round(((i + 1) / toUpdate.length) * 100));
    }

    setPagamentoImported(true);
    setPagamentoImporting(false);
    toast({ title: 'Importação concluída', description: `${updated} parcelas marcadas como pagas.` });
  };

  const handleImport = async () => {
    if (!user || rows.length === 0) return;

    const credorFinal = credorSelecionado === 'ume_consolidado' ? 'UME | NOVO MUNDO' : (credorDestino === 'outro' ? credorOutro.trim() : credorDestino);
    if (!credorFinal && credorSelecionado !== 'ume_consolidado') {
      toast({ title: 'Selecione o credor de destino', variant: 'destructive' });
      return;
    }

    setImporting(true);
    setImportProgress(0);
    setInsertedCount(0);

    const { data: importacao, error: importError } = await supabase
      .from('importacoes' as any)
      .insert({
        nome_arquivo: file?.name || 'unknown',
        credor: credorFinal,
        total_registros: rows.length,
        importado_por: user.id,
      } as any)
      .select('id')
      .single();

    if (importError || !importacao) {
      toast({ title: 'Erro ao registrar importação', description: importError?.message, variant: 'destructive' });
      setImporting(false);
      return;
    }

    const importacaoId = (importacao as any).id;

    const records = rows.map(r => ({
      nome: r.nome,
      cpf: r.cpf,
      valor_original: r.valor_original,
      valor_atualizado: r.valor_atualizado,
      credor: credorSelecionado === 'ume_consolidado' ? r.credor : credorFinal,
      descricao: credorSelecionado === 'montreal' ? (r.descricao || null) : credorSelecionado === 'ume_consolidado' ? (r.descricao || null) : (r.credor || null),
      contrato: r.contrato || null,
      data_vencimento: credorSelecionado === 'pesquisa' ? null : (credorSelecionado === 'montreal' || credorSelecionado === 'cobmais') ? parseDate(r.atraso) : credorSelecionado === 'ume_consolidado' ? parseDate(r.nascimento) : parseDate(r.nascimento),
      telefone: r.telefone || null,
      importado_por: user.id,
      arquivo_importacao: file?.name || 'unknown',
      importacao_id: importacaoId,
    }));

    const BATCH_SIZE = 500;
    let inserted = 0;
    let batchError: any = null;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('devedores' as any).insert(batch as any);
      if (error) {
        batchError = error;
        break;
      }
      inserted += batch.length;
      setInsertedCount(inserted);
      setImportProgress(Math.round((inserted / records.length) * 100));
    }

    if (batchError) {
      toast({
        title: 'Erro na importação',
        description: `${inserted} de ${records.length} registros inseridos antes do erro: ${batchError.message}`,
        variant: 'destructive',
      });
    } else {
      if (isMontreal) {
        await insertTelefonesFromRows(rows, user.id);
      }
      toast({ title: 'Importação concluída', description: `${records.length} registros importados com sucesso.` });
      setImported(true);
      fetchImportacoes();
    }
    setImporting(false);
  };

  const handleDeleteImportacao = async (id: string) => {
    setDeleting(id);
    try {
      const { data, error } = await supabase.rpc('delete_importacao_em_lotes', {
        p_importacao_id: id,
      });
      if (error) throw error;
      const deleted = (data as any)?.deleted ?? 0;
      toast({ title: 'Importação excluída', description: `${deleted} devedores removidos com sucesso.` });
      fetchImportacoes();
    } catch (error: any) {
      console.error('Erro ao excluir importação:', error);
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    }
    setDeleting(null);
  };

  const toggleSelectImportacao = (id: string) => {
    setSelectedImportacoes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAllImportacoes = () => {
    setSelectedImportacoes((prev) => {
      if (prev.size === importacoes.length) return new Set();
      return new Set(importacoes.map(i => i.id));
    });
  };

  const handleBulkDeleteImportacoes = async () => {
    const ids = Array.from(selectedImportacoes);
    if (ids.length === 0) return;
    const idToNome = new Map(importacoes.map(i => [i.id, i.nome_arquivo]));
    setBulkDeleting(true);
    setBulkProgress({ current: 0, total: ids.length });
    let totalDeleted = 0;
    const failed: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      setBulkProgress({ current: i + 1, total: ids.length });
      try {
        const { data, error } = await supabase.rpc('delete_importacao_em_lotes', {
          p_importacao_id: id,
        });
        if (error) throw error;
        totalDeleted += (data as any)?.deleted ?? 0;
        // Atualiza UI incrementalmente
        setImportacoes((prev) => prev.filter((imp) => imp.id !== id));
        setSelectedImportacoes((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch (error: any) {
        console.error('Erro ao excluir importação:', id, error);
        failed.push(idToNome.get(id) ?? id);
      }
    }
    const okCount = ids.length - failed.length;
    if (okCount > 0) {
      toast({
        title: 'Importações excluídas',
        description: `${okCount} de ${ids.length} planilhas excluídas. ${totalDeleted} devedores removidos.`,
      });
    }
    if (failed.length > 0) {
      toast({
        title: `${failed.length} planilha(s) falharam`,
        description: failed.slice(0, 5).join(', ') + (failed.length > 5 ? '…' : ''),
        variant: 'destructive',
      });
    }
    setBulkDeleting(false);
    setBulkProgress(null);
    fetchImportacoes();
  };

  const handleClear = () => {
    setFile(null);
    setFiles([]);
    setFileResults([]);
    setCurrentFileIndex(-1);
    setBatchImporting(false);
    stopRef.current = false;
    setRows([]);
    setPagamentoRows([]);
    setMontrealRows([]);
    setUmeAporteGroups([]);
    setImported(false);
    setPagamentoImported(false);
    setUmeAporteImported(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImportTelefonesOnly = async () => {
    if (!user) return;
    setImporting(true);
    const count = await insertTelefonesFromRows(montrealRows, user.id);
    if (count === 0) {
      toast({ title: 'Sem telefones novos', description: 'Todos os telefones da planilha já estão cadastrados.', variant: 'destructive' });
    } else {
      toast({ title: 'Telefones importados', description: `${count} telefones novos cadastrados.` });
    }
    setImported(true);
    setImporting(false);
  };

  const handleImportMontrealAtualizacao = async () => {
    if (!user) return;
    const toImport = montrealRows.filter(r => r.status_importacao !== 'existe');
    if (toImport.length === 0) {
      toast({ title: 'Nada para importar', description: 'Todas as parcelas já existem no sistema.', variant: 'destructive' });
      return;
    }

    setImporting(true);
    setImportProgress(0);
    setInsertedCount(0);

    const { data: importacao, error: importError } = await supabase
      .from('importacoes' as any)
      .insert({
        nome_arquivo: file?.name || 'unknown',
        credor: 'MONTREAL',
        total_registros: toImport.length,
        importado_por: user.id,
      } as any)
      .select('id')
      .single();

    if (importError || !importacao) {
      toast({ title: 'Erro ao registrar importação', description: importError?.message, variant: 'destructive' });
      setImporting(false);
      return;
    }

    const importacaoId = (importacao as any).id;

    const records = toImport.map(r => ({
      nome: r.nome,
      cpf: r.cpf,
      valor_original: r.valor_original,
      valor_atualizado: r.valor_atualizado,
      credor: 'MONTREAL',
      descricao: r.descricao || null,
      contrato: r.contrato || null,
      data_vencimento: parseDate(r.atraso),
      telefone: r.telefone || null,
      importado_por: user.id,
      arquivo_importacao: file?.name || 'unknown',
      importacao_id: importacaoId,
    }));

    const BATCH_SIZE = 500;
    let inserted = 0;
    let batchError: any = null;

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const { error } = await supabase.from('devedores' as any).insert(batch as any);
      if (error) {
        batchError = error;
        break;
      }
      inserted += batch.length;
      setInsertedCount(inserted);
      setImportProgress(Math.round((inserted / records.length) * 100));
    }

    if (batchError) {
      toast({
        title: 'Erro na importação',
        description: `${inserted} de ${records.length} registros inseridos antes do erro: ${batchError.message}`,
        variant: 'destructive',
      });
    } else {
      await insertTelefonesFromRows(montrealRows, user.id);
      toast({ title: 'Importação concluída', description: `${inserted} registros importados (${montrealRows.filter(r => r.status_importacao === 'existe').length} ignorados por já existirem).` });
      setImported(true);
      fetchImportacoes();
    }
    setImporting(false);
  };

  const isMontreal = credorSelecionado === 'montreal';
  const isCobmais = credorSelecionado === 'cobmais';
  const isPesquisa = credorSelecionado === 'pesquisa';

  // Pagamentos summary
  const pagToUpdate = pagamentoRows.filter(r => r.pagamento_id && !r.ja_pago);
  const pagJaPago = pagamentoRows.filter(r => r.ja_pago);
  const pagSemAcordo = pagamentoRows.filter(r => r.sem_acordo);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Importar Devedores</h1>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload de Planilha
            </CardTitle>
            <CardDescription>
              {DESCRICOES[credorSelecionado]}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Credor / Layout da Planilha</Label>
              <Select value={credorSelecionado} onValueChange={(v) => handleCredorChange(v as CredorLayout)}>
                <SelectTrigger className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="padrao">Padrão</SelectItem>
                  <SelectItem value="montreal">MONTREAL</SelectItem>
                  <SelectItem value="montreal_atualizacao">MONTREAL (Atualização)</SelectItem>
                   <SelectItem value="cobmais">COBMAIS</SelectItem>
                   <SelectItem value="pesquisa">Pesquisa Cliente</SelectItem>
                   <SelectItem value="pagamentos">Pagamentos</SelectItem>
                   <SelectItem value="ume_aporte">UME APORTE</SelectItem>
                   <SelectItem value="ume_consolidado">UME Consolidado (INADIMPLENTES + APORTE)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!isPagamentos && !isMontrealAtualizacao && !isUmeAporte && !isUmeConsolidado && (
              <div className="space-y-2">
                <Label>Credor de Destino</Label>
                <Select value={credorDestino} onValueChange={setCredorDestino}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="Selecione o credor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {CREDORES_OPCOES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    <SelectItem value="outro">Outro (digitar)</SelectItem>
                  </SelectContent>
                </Select>
                {credorDestino === 'outro' && (
                  <Input
                    placeholder="Digite o nome do credor"
                    value={credorOutro}
                    onChange={(e) => setCredorOutro(e.target.value)}
                    className="max-w-xs"
                  />
                )}
              </div>
            )}
            {(isPagamentos || isUmeAporte || isUmeConsolidado) && (
              <div className="text-sm text-muted-foreground">
                Credor: <strong>UME | NOVO MUNDO</strong> (automático)
                {isUmeAporte && <> — O sistema criará acordos automaticamente para CPFs que ainda não possuem acordo.</>}
                {isUmeConsolidado && <> — Importa INADIMPLENTES e APORTE com credor diferenciado por linha. Juros calculados automaticamente no portal.</>}
              </div>
            )}
            {isMontrealAtualizacao && (
              <div className="text-sm text-muted-foreground">
                Credor: <strong>MONTREAL</strong> (automático) — O sistema cruzará os dados e importará apenas parcelas novas.
              </div>
            )}
            <div className="flex items-center gap-4">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFile}
                className="max-w-sm"
                disabled={parsing || batchImporting}
                multiple
              />
              {(file || files.length > 0) && !parsing && !batchImporting && (
                <Button variant="outline" size="sm" onClick={handleClear}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Limpar
                </Button>
              )}
            </div>

            {parsing && (
              <Card className="border-dashed">
                <CardContent className="flex items-center gap-3 py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div>
                    <p className="font-semibold text-sm">Processando planilha...</p>
                    <p className="text-xs text-muted-foreground">
                      {isPagamentos ? 'Lendo parcelas e cruzando com acordos no sistema...' : isMontrealAtualizacao ? 'Cruzando com dados existentes no sistema...' : isUmeAporte ? 'Agrupando por CPF e verificando acordos existentes...' : 'Lendo abas e cruzando dados, aguarde...'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        {/* Batch Multi-File UI */}
        {files.length > 1 && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    Importação em Lote ({files.length} arquivos)
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {batchImporting
                      ? `Processando arquivo ${currentFileIndex + 1} de ${files.length}...`
                      : fileResults.every(r => r.status === 'done' || r.status === 'error')
                        ? `Concluído — ${fileResults.filter(r => r.status === 'done').length} importado(s), ${fileResults.filter(r => r.status === 'error').length} erro(s)`
                        : `${files.length} arquivos selecionados. Clique em "Importar Todos" para iniciar.`
                    }
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {batchImporting ? (
                    <Button variant="destructive" size="sm" onClick={() => { stopRef.current = true; }}>
                      <Square className="h-4 w-4 mr-1" />
                      Parar
                    </Button>
                  ) : !fileResults.some(r => r.status === 'done' || r.status === 'error') ? (
                    <Button onClick={handleImportAll} style={{ background: '#00a86b', color: '#fff' }}>
                      <Check className="h-4 w-4 mr-1" />
                      Importar Todos
                    </Button>
                  ) : null}
                </div>
              </div>
              {batchImporting && (
                <div className="mt-4 space-y-2">
                  <Progress value={Math.round(((currentFileIndex + 1) / files.length) * 100)} className="h-3" />
                  <p className="text-sm text-muted-foreground text-center">
                    Arquivo {currentFileIndex + 1} de {files.length} ({Math.round(((currentFileIndex + 1) / files.length) * 100)}%)
                  </p>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {fileResults.map((result, idx) => (
                  <div key={idx} className={`flex items-center justify-between border rounded-lg p-3 ${result.status === 'done' ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950' : result.status === 'error' ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950' : result.status === 'processing' ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950' : ''}`}>
                    <div className="flex items-center gap-3">
                      {result.status === 'pending' && <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">{idx + 1}</div>}
                      {result.status === 'processing' && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
                      {result.status === 'done' && <Check className="h-5 w-5 text-green-600" />}
                      {result.status === 'error' && <AlertCircle className="h-5 w-5 text-red-500" />}
                      <div>
                        <p className="font-medium text-sm">{result.name}</p>
                        {result.status === 'done' && <p className="text-xs text-green-600">{result.count} registros importados</p>}
                        {result.status === 'error' && <p className="text-xs text-red-500">{result.error}</p>}
                        {result.status === 'processing' && <p className="text-xs text-blue-500">Processando...</p>}
                      </div>
                    </div>
                    <Badge variant={result.status === 'done' ? 'default' : result.status === 'error' ? 'destructive' : 'secondary'} className={result.status === 'done' ? 'bg-green-600' : ''}>
                      {result.status === 'pending' ? 'Pendente' : result.status === 'processing' ? 'Processando' : result.status === 'done' ? 'Concluído' : 'Erro'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Background Jobs Status */}
        {backgroundJobs.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className={`h-5 w-5 ${backgroundJobs.some((j: any) => j.status === 'pendente' || j.status === 'processando') ? 'animate-spin text-blue-500' : 'text-muted-foreground'}`} />
                Importações em Background
              </CardTitle>
              <CardDescription>
                {backgroundJobs.some((j: any) => j.status === 'pendente' || j.status === 'processando')
                  ? 'Processando no servidor — você pode fechar a página sem problemas.'
                  : 'Todas as importações foram concluídas.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {backgroundJobs.map((job: any) => (
                  <div key={job.id} className={`flex items-center justify-between border rounded-lg p-3 ${
                    job.status === 'concluido' ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950' :
                    job.status === 'erro' ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950' :
                    job.status === 'processando' ? 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950' : ''
                  }`}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {job.status === 'pendente' && <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center text-xs">⏳</div>}
                      {job.status === 'processando' && <Loader2 className="h-5 w-5 animate-spin text-blue-500 shrink-0" />}
                      {job.status === 'concluido' && <Check className="h-5 w-5 text-green-600 shrink-0" />}
                      {job.status === 'erro' && <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{job.nome_arquivo}</p>
                        {job.status === 'processando' && (
                          <div className="flex items-center gap-2 mt-1">
                            <Progress value={job.total_registros > 0 ? Math.round((job.registros_inseridos / job.total_registros) * 100) : 0} className="h-2 w-32" />
                            <span className="text-xs text-blue-500">{job.registros_inseridos}/{job.total_registros}</span>
                          </div>
                        )}
                        {job.status === 'concluido' && <p className="text-xs text-green-600">{job.registros_inseridos} registros importados</p>}
                        {job.status === 'erro' && <p className="text-xs text-red-500">{job.erro_mensagem || 'Erro desconhecido'}</p>}
                        {job.status === 'pendente' && <p className="text-xs text-muted-foreground">Aguardando processamento...</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={job.status === 'concluido' ? 'default' : job.status === 'erro' ? 'destructive' : 'secondary'} className={job.status === 'concluido' ? 'bg-green-600' : ''}>
                        {job.status === 'pendente' ? 'Pendente' : job.status === 'processando' ? 'Processando' : job.status === 'concluido' ? 'Concluído' : 'Erro'}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(job.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}


        {isUmeAporte && umeAporteGroups.length > 0 && (() => {
          const novos = umeAporteGroups.filter(g => !g.jaTemAcordo);
          const existentes = umeAporteGroups.filter(g => g.jaTemAcordo);

          return (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5" />
                      Preview UME APORTE ({umeAporteGroups.length} clientes)
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {file?.name} — 
                      <span className="text-blue-600 font-medium"> {novos.length} acordos novos</span>,
                      <span className="text-green-600 font-medium"> {existentes.length} já possuem acordo</span>
                    </CardDescription>
                  </div>
                  {!umeAporteImported ? (
                    <Button
                      onClick={handleImportUmeAporte}
                      disabled={umeAporteImporting || novos.length === 0}
                      style={{ background: '#00a86b', color: '#fff' }}
                    >
                      {umeAporteImporting ? (
                        <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Importando...</>
                      ) : (
                        <><Check className="h-4 w-4 mr-1" />Criar {novos.length} acordos</>
                      )}
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 text-sm" style={{ color: '#00a86b' }}>
                      <Check className="h-4 w-4" />
                      {umeAporteInserted} acordos criados
                    </div>
                  )}
                </div>
                {umeAporteImporting && (
                  <div className="mt-4 space-y-2">
                    <Progress value={umeAporteProgress} className="h-3" />
                    <p className="text-sm text-muted-foreground text-center">
                      Criando {umeAporteInserted} de {novos.length} acordos... ({umeAporteProgress}%)
                    </p>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {umeAporteGroups.map((group, idx) => (
                    <div key={idx} className={`border rounded-lg p-3 ${group.jaTemAcordo ? 'opacity-50' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {group.jaTemAcordo ? (
                            <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs">Já tem acordo</Badge>
                          ) : (
                            <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs">Novo acordo</Badge>
                          )}
                          <div>
                            <p className="font-medium text-sm">{group.nome}</p>
                            <p className="text-xs text-muted-foreground font-mono">{group.cpf}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">
                            {group.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {group.numParcelas} parcela{group.numParcelas !== 1 ? 's' : ''} · {group.diasAtraso > 0 ? `${group.diasAtraso} dias atraso` : 'Em dia'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            1º pgto: {group.dataPrimeiroPagamento.toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* Montreal Atualização Preview */}
        {isMontrealAtualizacao && montrealRows.length > 0 && (() => {
          const existe = montrealRows.filter(r => r.status_importacao === 'existe').length;
          const novaParcela = montrealRows.filter(r => r.status_importacao === 'nova_parcela').length;
          const clienteNovo = montrealRows.filter(r => r.status_importacao === 'cliente_novo').length;
          const toImport = novaParcela + clienteNovo;

          // Group by CPF
          const groupedData = montrealRows.reduce<Record<string, { cpf: string; nome: string; telefone?: string; rows: MontrealAtualizacaoRow[]; valorTotal: number; existeCount: number; novaCount: number; }>>((acc, row) => {
            const cpfNorm = row.cpf.replace(/\D/g, '');
            if (!acc[cpfNorm]) {
              acc[cpfNorm] = { cpf: row.cpf, nome: row.nome, telefone: row.telefone, rows: [], valorTotal: 0, existeCount: 0, novaCount: 0 };
            }
            acc[cpfNorm].rows.push(row);
            acc[cpfNorm].valorTotal += row.valor_original;
            if (row.status_importacao === 'existe') acc[cpfNorm].existeCount++;
            else acc[cpfNorm].novaCount++;
            return acc;
          }, {});
          const groupEntries = Object.entries(groupedData);
          const clientesNovosCount = groupEntries.filter(([, g]) => g.rows.every(r => r.status_importacao === 'cliente_novo')).length;
          const clientesExistentesCount = groupEntries.filter(([, g]) => g.rows.some(r => r.status_importacao !== 'cliente_novo')).length;

          return (
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileSpreadsheet className="h-5 w-5" />
                      Preview Montreal ({montrealRows.length} registros — {groupEntries.length} clientes)
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {file?.name} — 
                      <span className="text-green-600 font-medium"> {existe} já existem</span>,
                      <span className="text-yellow-600 font-medium"> {novaParcela} novas parcelas</span>,
                      <span className="text-blue-600 font-medium"> {clienteNovo} clientes novos</span>
                      {toImport > 0 && <span className="font-semibold"> → {toImport} serão importados</span>}
                    </CardDescription>
                  </div>
                  {!imported ? (
                    <div className="flex gap-2">
                      <Button
                        onClick={handleImportTelefonesOnly}
                        disabled={importing}
                        variant="outline"
                      >
                        {importing ? (
                          <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Importando...</>
                        ) : (
                          <>📞 Importar Telefones</>
                        )}
                      </Button>
                      {toImport > 0 && (
                        <Button
                          onClick={handleImportMontrealAtualizacao}
                          disabled={importing}
                          style={{ background: '#00a86b', color: '#fff' }}
                        >
                          {importing ? (
                            <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Importando...</>
                          ) : (
                            <><Check className="h-4 w-4 mr-1" />Importar {toImport} registros</>
                          )}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm" style={{ color: '#00a86b' }}>
                      <Check className="h-4 w-4" />
                      {insertedCount} registros importados
                    </div>
                  )}
                </div>
                {importing && (
                  <div className="mt-4 space-y-2">
                    <Progress value={importProgress} className="h-3" />
                    <p className="text-sm text-muted-foreground text-center">
                      Inserindo {insertedCount.toLocaleString('pt-BR')} de {toImport.toLocaleString('pt-BR')} registros... ({importProgress}%)
                    </p>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 mb-4">
                  <Switch checked={montrealGrouped} onCheckedChange={setMontrealGrouped} id="montreal-group-toggle" />
                  <Label htmlFor="montreal-group-toggle" className="flex items-center gap-1 cursor-pointer">
                    <Users className="h-4 w-4" />
                    Agrupar por CPF/CNPJ
                  </Label>
                </div>

                {montrealGrouped ? (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {groupEntries.map(([cpfNorm, g]) => {
                      const isAllExist = g.rows.every(r => r.status_importacao === 'existe');
                      const isNewClient = g.rows.every(r => r.status_importacao === 'cliente_novo');
                      const novasDoCliente = g.rows.filter(r => r.status_importacao !== 'existe');
                      const valorNovas = novasDoCliente.reduce((sum, r) => sum + r.valor_original, 0);

                      return (
                        <div key={cpfNorm} className={`border rounded-lg p-3 ${isAllExist ? 'opacity-50' : ''}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {isNewClient ? (
                                <Badge className="bg-blue-500 hover:bg-blue-600 text-white text-xs">Cliente novo</Badge>
                              ) : isAllExist ? (
                                <Badge className="bg-green-600 hover:bg-green-700 text-white text-xs">Tudo existe</Badge>
                              ) : (
                                <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs">{g.novaCount} nova{g.novaCount !== 1 ? 's' : ''}</Badge>
                              )}
                              <div>
                                <p className="font-medium text-sm">{g.nome}</p>
                                <p className="text-xs text-muted-foreground font-mono">{g.cpf}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold">
                                {g.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {g.rows.length} contrato{g.rows.length !== 1 ? 's' : ''}
                                {!isAllExist && !isNewClient && (
                                  <> · <span className="text-yellow-600">{valorNovas.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} novas</span></>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-96">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>CPF/CNPJ</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Nro Nota</TableHead>
                          <TableHead>Desdob.</TableHead>
                          <TableHead>Vencimento</TableHead>
                          <TableHead>Valor (R$)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {montrealRows.slice(0, 100).map((row, i) => (
                          <TableRow key={i} className={row.status_importacao === 'existe' ? 'opacity-50' : ''}>
                            <TableCell>
                              {row.status_importacao === 'existe' ? (
                                <Badge className="bg-green-600 hover:bg-green-700 text-white">Já existe</Badge>
                              ) : row.status_importacao === 'nova_parcela' ? (
                                <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">Nova parcela</Badge>
                              ) : (
                                <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Cliente novo</Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{row.cpf}</TableCell>
                            <TableCell>{row.nome}</TableCell>
                            <TableCell>{row.contrato || '-'}</TableCell>
                            <TableCell>{row.descricao || '-'}</TableCell>
                            <TableCell>{row.atraso || '-'}</TableCell>
                            <TableCell>{row.valor_original.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {montrealRows.length > 100 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Mostrando 100 de {montrealRows.length} registros
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}
        {/* Pagamentos Preview */}
        {isPagamentos && pagamentoRows.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    Preview Pagamentos ({pagamentoRows.length} parcelas PAGAS)
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {file?.name} — 
                    <span className="text-yellow-600 font-medium"> {pagToUpdate.length} a atualizar</span>,
                    <span className="text-green-600 font-medium"> {pagJaPago.length} já pagas</span>
                    {pagSemAcordo.length > 0 && <span className="text-red-600 font-medium">, {pagSemAcordo.length} sem acordo</span>}
                  </CardDescription>
                </div>
                {!pagamentoImported ? (
                  <Button
                    onClick={handleImportPagamentos}
                    disabled={pagamentoImporting || pagToUpdate.length === 0}
                    style={{ background: '#00a86b', color: '#fff' }}
                  >
                    {pagamentoImporting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Atualizando...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 mr-1" />
                        Marcar {pagToUpdate.length} como Pagas
                      </>
                    )}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 text-sm" style={{ color: '#00a86b' }}>
                    <Check className="h-4 w-4" />
                    {pagamentoUpdated} parcelas atualizadas
                  </div>
                )}
              </div>
              {pagamentoImporting && (
                <div className="mt-4 space-y-2">
                  <Progress value={pagamentoProgress} className="h-3" />
                  <p className="text-sm text-muted-foreground text-center">
                    Atualizando {pagamentoUpdated} de {pagToUpdate.length} parcelas... ({pagamentoProgress}%)
                  </p>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CPF</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Parcela</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead>Status no Sistema</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagamentoRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{row.cpf}</TableCell>
                        <TableCell>{row.cliente}</TableCell>
                        <TableCell className="text-center">{row.numero_parcela}</TableCell>
                        <TableCell>{row.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                        <TableCell>{row.vencimento}</TableCell>
                        <TableCell>
                          {row.sem_acordo ? (
                            <Badge variant="destructive">Acordo não encontrado</Badge>
                          ) : row.ja_pago ? (
                            <Badge className="bg-green-600 hover:bg-green-700 text-white">Já pago</Badge>
                          ) : (
                            <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">Será marcado como pago</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Standard Devedores Preview */}
        {!isPagamentos && !isMontrealAtualizacao && !isUmeAporte && rows.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    Preview ({rows.length} registros)
                  </CardTitle>
                  <CardDescription>{file?.name}</CardDescription>
                </div>
                {!imported ? (
                   <Button onClick={handleImport} disabled={importing} style={{ background: '#00a86b', color: '#fff' }}>
                     {importing ? (
                       <>
                         <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                         Importando...
                       </>
                     ) : (
                       <>
                         <Check className="h-4 w-4 mr-1" />
                         Confirmar Importação
                       </>
                     )}
                   </Button>
                ) : (
                  <div className="flex items-center gap-2 text-sm" style={{ color: '#00a86b' }}>
                    <Check className="h-4 w-4" />
                    Importado com sucesso
                  </div>
                )}
              </div>
              {importing && (
                <div className="mt-4 space-y-2">
                  <Progress value={importProgress} className="h-3" />
                  <p className="text-sm text-muted-foreground text-center">
                    Inserindo {insertedCount.toLocaleString('pt-BR')} de {rows.length.toLocaleString('pt-BR')} registros... ({importProgress}%)
                  </p>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 mb-4">
                <Switch checked={grouped} onCheckedChange={setGrouped} id="group-toggle" />
                <Label htmlFor="group-toggle" className="flex items-center gap-1 cursor-pointer">
                  <Users className="h-4 w-4" />
                  Agrupar por CPF/CNPJ
                </Label>
              </div>

              {grouped ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {(() => {
                    const groups = rows.reduce<Record<string, { cpf: string; nome: string; contratos: number; valorTotal: number }>>((acc, row) => {
                      const cpfNorm = row.cpf.replace(/\D/g, '');
                      if (!acc[cpfNorm]) {
                        acc[cpfNorm] = { cpf: row.cpf, nome: row.nome, contratos: 0, valorTotal: 0 };
                      }
                      acc[cpfNorm].contratos += 1;
                      acc[cpfNorm].valorTotal += row.valor_atualizado;
                      return acc;
                    }, {});

                    return Object.entries(groups).map(([cpfNorm, g]) => (
                      <div key={cpfNorm} className="flex items-center justify-between border rounded-lg p-3">
                        <div>
                          <p className="font-medium">{g.nome}</p>
                          <p className="text-xs text-muted-foreground font-mono">{g.cpf}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm font-semibold">
                              {g.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                            <p className="text-xs text-muted-foreground">{g.contratos} contrato{g.contratos !== 1 ? 's' : ''}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              const { data } = await supabase
                                .from('devedores')
                                .select('id')
                                .eq('ativo', true)
                                .limit(1);
                              const match = data?.find((d: any) => {
                                return true;
                              });
                              const { data: devs } = await supabase
                                .from('devedores')
                                .select('id, cpf')
                                .eq('ativo', true);
                              const found = devs?.find((d: any) => d.cpf.replace(/\D/g, '') === cpfNorm);
                              if (found) navigate(`/clientes/${found.id}`);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver Ficha
                          </Button>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CPF/CNPJ</TableHead>
                        {isPesquisa ? (
                          <>
                            <TableHead>Nome</TableHead>
                            <TableHead>Telefone</TableHead>
                          </>
                        ) : isMontreal ? (
                          <>
                            <TableHead>Nome</TableHead>
                            <TableHead>Nro Nota</TableHead>
                            <TableHead>Tipo Título</TableHead>
                            <TableHead>Vencimento</TableHead>
                            <TableHead>Valor (R$)</TableHead>
                            <TableHead>Telefone</TableHead>
                          </>
                        ) : isCobmais ? (
                          <>
                            <TableHead>Nome</TableHead>
                            <TableHead>Contrato</TableHead>
                            <TableHead>Vencimento</TableHead>
                            <TableHead>Total (R$)</TableHead>
                            <TableHead>Telefone</TableHead>
                          </>
                        ) : (
                          <>
                            <TableHead>Nascimento</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Credor</TableHead>
                            <TableHead>Contrato</TableHead>
                            <TableHead>Atraso</TableHead>
                            <TableHead>Risco (R$)</TableHead>
                          </>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 50).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-xs">{row.cpf}</TableCell>
                          {isPesquisa ? (
                            <>
                              <TableCell>{row.nome || <span className="text-destructive"><AlertCircle className="h-3 w-3 inline" /> Vazio</span>}</TableCell>
                              <TableCell>{row.telefone || '-'}</TableCell>
                            </>
                          ) : isMontreal ? (
                            <>
                              <TableCell>{row.nome || <span className="text-destructive"><AlertCircle className="h-3 w-3 inline" /> Vazio</span>}</TableCell>
                              <TableCell>{row.contrato || '-'}</TableCell>
                              <TableCell>{row.descricao || '-'}</TableCell>
                              <TableCell>{row.atraso || '-'}</TableCell>
                              <TableCell>{row.valor_original.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                              <TableCell>{row.telefone || '-'}</TableCell>
                            </>
                          ) : isCobmais ? (
                            <>
                              <TableCell>{row.nome || <span className="text-destructive"><AlertCircle className="h-3 w-3 inline" /> Vazio</span>}</TableCell>
                              <TableCell>{row.contrato || '-'}</TableCell>
                              <TableCell>{row.atraso || '-'}</TableCell>
                              <TableCell>{row.valor_original.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                              <TableCell>{row.telefone || '-'}</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell>{row.nascimento || '-'}</TableCell>
                              <TableCell>{row.nome || <span className="text-destructive"><AlertCircle className="h-3 w-3 inline" /> Vazio</span>}</TableCell>
                              <TableCell>{row.credor || '-'}</TableCell>
                              <TableCell>{row.contrato || '-'}</TableCell>
                              <TableCell>{row.atraso || '-'}</TableCell>
                              <TableCell>{row.valor_original.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                            </>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {rows.length > 50 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Mostrando 50 de {rows.length} registros
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Histórico de Importações */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Histórico de Importações
            </CardTitle>
            <CardDescription>Planilhas importadas anteriormente. Ao excluir, todos os devedores associados serão removidos.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingHistory ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : importacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma importação registrada.</p>
            ) : (
              <div className="space-y-3">
                {selectedImportacoes.size > 0 && (
                  <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                    <span className="text-sm font-medium">
                      {selectedImportacoes.size} planilha(s) selecionada(s)
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" disabled={bulkDeleting}>
                          <Trash2 className="h-4 w-4 mr-1" />
                          {bulkDeleting && bulkProgress
                            ? `Excluindo ${bulkProgress.current} de ${bulkProgress.total}...`
                            : `Excluir ${selectedImportacoes.size} selecionadas`}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir {selectedImportacoes.size} importações?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso removerá permanentemente todos os devedores associados às planilhas selecionadas. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={handleBulkDeleteImportacoes}>
                            Confirmar Exclusão
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={importacoes.length > 0 && selectedImportacoes.size === importacoes.length}
                            onCheckedChange={toggleSelectAllImportacoes}
                            aria-label="Selecionar todas"
                          />
                        </TableHead>
                        <TableHead>Arquivo</TableHead>
                        <TableHead>Credor</TableHead>
                        <TableHead>Registros</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importacoes.map((imp) => (
                        <TableRow key={imp.id} data-state={selectedImportacoes.has(imp.id) ? 'selected' : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selectedImportacoes.has(imp.id)}
                              onCheckedChange={() => toggleSelectImportacao(imp.id)}
                              aria-label={`Selecionar ${imp.nome_arquivo}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{imp.nome_arquivo}</TableCell>
                          <TableCell className="capitalize">{imp.credor}</TableCell>
                          <TableCell>{imp.total_registros}</TableCell>
                          <TableCell>{new Date(imp.criado_em).toLocaleDateString('pt-BR')} {new Date(imp.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                          <TableCell className="text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="sm" disabled={deleting === imp.id}>
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  {deleting === imp.id ? 'Excluindo...' : 'Excluir'}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Excluir importação?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Isso removerá permanentemente <strong>{imp.total_registros} devedores</strong> importados do arquivo "<strong>{imp.nome_arquivo}</strong>". Esta ação não pode ser desfeita.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDeleteImportacao(imp.id)}>
                                    Confirmar Exclusão
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
