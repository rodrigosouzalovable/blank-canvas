import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileSpreadsheet, Upload, Download, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, AlertCircle, Trash2, History, Eye } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatarMoeda } from '@/lib/comissao';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Interface para linhas importadas da planilha simplificada
// Novo formato: Coluna A = CPF, Coluna B = Nome, Coluna C = Valor, Coluna D = Data
interface LinhaImportada {
  cpf: string;           // Coluna A
  nomeCliente: string;   // Coluna B
  valorPago: number;     // Coluna C
  dataPagamento: string; // Coluna D
}

interface PagamentoSistema {
  id: string;
  cpf: string;
  nomeCliente: string;
  dataPaga: string | null;
  valorParcela: number;
  comissaoParcela: number;
  diasAtraso: number;
  numeroParcela: number;
  acordoId: string;
  status: string;
}

interface Divergencia {
  cpf: string;
  nomeClientePlanilha: string;
  nomeClienteSistema: string;
  tipoDivergencia: string;
  valorPlanilha: number;
  valorSistema: number;
  dataPlanilha: string;
  dataSistema: string;
  pagamentoId?: string;
  acordoId?: string;
}

interface AcordoDivergente {
  id: string;
  clienteNome: string;
  clienteCpf: string;
  valorTotal: number;
  somaParcelas: number;
  diferencaValor: number;
  qtdParcelasAcordo: number;
  qtdParcelasCadastradas: number;
  comissaoTotal: number;
  somaComissoes: number;
  diferencaComissao: number;
  tiposDivergencia: string[];
}

interface CpfDuplicado {
  cpf: string;
  qtdAcordos: number;
  acordos: {
    id: string;
    clienteNome: string;
    valorTotal: number;
    status: string;
    criadoEm: string;
  }[];
}

interface HistoricoAuditoria {
  arquivoNome: string;
  criadoEm: string;
  qtdDivergencias: number;
}

interface DivergenciaSalva {
  id: string;
  criado_em: string;
  arquivo_nome: string;
  cpf_planilha: string;
  nome_planilha: string | null;
  valor_planilha: number | null;
  data_planilha: string | null;
  nome_sistema: string | null;
  valor_sistema: number | null;
  data_sistema: string | null;
  tipo_divergencia: string;
  pagamento_id: string | null;
  acordo_id: string | null;
  resolvido: boolean;
}

const normalizarCPF = (cpf: string): string => {
  return String(cpf || '').replace(/\D/g, '');
};

const parseDataExcel = (valor: any): string => {
  if (!valor) return '';
  
  // Se for número serial do Excel
  if (typeof valor === 'number') {
    const data = XLSX.SSF.parse_date_code(valor);
    if (data) {
      return `${String(data.d).padStart(2, '0')}/${String(data.m).padStart(2, '0')}/${data.y}`;
    }
  }
  
  // Se for string com data e hora (ex: "28/11/2025 16:29:27")
  const strValor = String(valor).trim();
  
  // Extrair apenas a data (antes do espaço) se houver hora
  const partes = strValor.split(' ');
  const dataStr = partes[0];
  
  // Verificar se está no formato DD/MM/YYYY
  const regexBR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const matchBR = dataStr.match(regexBR);
  if (matchBR) {
    const dia = matchBR[1].padStart(2, '0');
    const mes = matchBR[2].padStart(2, '0');
    const ano = matchBR[3];
    return `${dia}/${mes}/${ano}`;
  }
  
  // Verificar se está no formato YYYY-MM-DD
  const regexISO = /^(\d{4})-(\d{2})-(\d{2})$/;
  const matchISO = dataStr.match(regexISO);
  if (matchISO) {
    return `${matchISO[3]}/${matchISO[2]}/${matchISO[1]}`;
  }
  
  return dataStr;
};

const parseValorNumerico = (valor: any): number => {
  if (typeof valor === 'number') return valor;
  if (!valor) return 0;
  
  const limpo = String(valor)
    .replace(/R\$\s?/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  
  return parseFloat(limpo) || 0;
};

const compararValores = (v1: number, v2: number, tolerancia = 0.01): boolean => {
  return Math.abs(v1 - v2) <= tolerancia;
};

const formatarDataParaComparacao = (data: string): string => {
  if (!data) return '';
  
  if (data.includes('/')) {
    return data;
  }
  
  if (data.includes('-')) {
    const [ano, mes, dia] = data.split('-');
    return `${dia}/${mes}/${ano}`;
  }
  
  return data;
};

const formatarCPF = (cpf: string): string => {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

export default function Auditoria() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [processando, setProcessando] = useState(false);
  const [dadosImportados, setDadosImportados] = useState<LinhaImportada[]>([]);
  const [divergencias, setDivergencias] = useState<Divergencia[]>([]);
  const [correspondencias, setCorrespondencias] = useState(0);
  const [processado, setProcessado] = useState(false);

  // Estados para divergências internas
  const [acordosDivergentes, setAcordosDivergentes] = useState<AcordoDivergente[]>([]);
  const [carregandoDivergencias, setCarregandoDivergencias] = useState(false);
  const [corrigindo, setCorrigindo] = useState<string | null>(null);
  const [cpfsDuplicados, setCpfsDuplicados] = useState<CpfDuplicado[]>([]);

  // Estados para histórico
  const [historico, setHistorico] = useState<HistoricoAuditoria[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [divergenciasSelecionadas, setDivergenciasSelecionadas] = useState<DivergenciaSalva[]>([]);
  const [arquivoSelecionado, setArquivoSelecionado] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const handleArquivoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setArquivo(file);
      setProcessado(false);
      setDivergencias([]);
      setCorrespondencias(0);
    }
  };

  const buscarHistorico = async () => {
    setCarregandoHistorico(true);
    try {
      const { data, error } = await supabase
        .from('auditoria_divergencias')
        .select('arquivo_nome, criado_em')
        .order('criado_em', { ascending: false });

      if (error) throw error;

      // Agrupar por arquivo
      const agrupado = new Map<string, { criadoEm: string; qtd: number }>();
      for (const item of data || []) {
        const atual = agrupado.get(item.arquivo_nome);
        if (!atual) {
          agrupado.set(item.arquivo_nome, { criadoEm: item.criado_em, qtd: 1 });
        } else {
          atual.qtd += 1;
        }
      }

      const historicoFormatado: HistoricoAuditoria[] = [];
      agrupado.forEach((value, key) => {
        historicoFormatado.push({
          arquivoNome: key,
          criadoEm: value.criadoEm,
          qtdDivergencias: value.qtd,
        });
      });

      setHistorico(historicoFormatado);
    } catch (error) {
      console.error('Erro ao buscar histórico:', error);
    } finally {
      setCarregandoHistorico(false);
    }
  };

  const carregarDivergenciasArquivo = async (arquivoNome: string) => {
    try {
      const { data, error } = await supabase
        .from('auditoria_divergencias')
        .select('*')
        .eq('arquivo_nome', arquivoNome)
        .order('criado_em', { ascending: false });

      if (error) throw error;

      setDivergenciasSelecionadas(data || []);
      setArquivoSelecionado(arquivoNome);
    } catch (error) {
      console.error('Erro ao carregar divergências:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar as divergências.',
      });
    }
  };

  const excluirHistoricoArquivo = async (arquivoNome: string) => {
    setExcluindo(true);
    try {
      const { error } = await supabase
        .from('auditoria_divergencias')
        .delete()
        .eq('arquivo_nome', arquivoNome);

      if (error) throw error;

      toast({
        title: 'Histórico excluído',
        description: 'As divergências foram removidas do histórico.',
      });

      // Atualizar lista
      await buscarHistorico();
      if (arquivoSelecionado === arquivoNome) {
        setDivergenciasSelecionadas([]);
        setArquivoSelecionado(null);
      }
    } catch (error) {
      console.error('Erro ao excluir histórico:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível excluir o histórico.',
      });
    } finally {
      setExcluindo(false);
    }
  };

  const excluirTodoHistorico = async () => {
    setExcluindo(true);
    try {
      const { error } = await supabase
        .from('auditoria_divergencias')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Deleta tudo

      if (error) throw error;

      toast({
        title: 'Histórico limpo',
        description: 'Todo o histórico de auditorias foi excluído.',
      });

      setHistorico([]);
      setDivergenciasSelecionadas([]);
      setArquivoSelecionado(null);
    } catch (error) {
      console.error('Erro ao excluir histórico:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível excluir o histórico.',
      });
    } finally {
      setExcluindo(false);
    }
  };

  const buscarDivergenciasInternas = async () => {
    setCarregandoDivergencias(true);
    try {
      const { data: acordos, error: acordosError } = await supabase
        .from('acordos')
        .select(`
          id,
          cliente_nome,
          cliente_cpf,
          valor_total,
          parcelas,
          comissao_total,
          status,
          criado_em
        `)
        .order('criado_em', { ascending: false });

      if (acordosError) throw acordosError;

      let allPagamentos: { acordo_id: string; valor_parcela: number; comissao_parcela: number }[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error: batchError } = await supabase
          .from('pagamentos')
          .select('acordo_id, valor_parcela, comissao_parcela')
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (batchError) throw batchError;

        if (batch && batch.length > 0) {
          allPagamentos = [...allPagamentos, ...batch];
          offset += pageSize;
          hasMore = batch.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      const pagamentos = allPagamentos;

      const pagamentosPorAcordo = new Map<string, { soma: number; qtd: number; somaComissao: number }>();
      for (const pag of pagamentos || []) {
        const atual = pagamentosPorAcordo.get(pag.acordo_id) || { soma: 0, qtd: 0, somaComissao: 0 };
        atual.soma += Number(pag.valor_parcela) || 0;
        atual.qtd += 1;
        atual.somaComissao += Number(pag.comissao_parcela) || 0;
        pagamentosPorAcordo.set(pag.acordo_id, atual);
      }

      const divergentes: AcordoDivergente[] = [];
      
      for (const acordo of acordos || []) {
        const dadosParcelas = pagamentosPorAcordo.get(acordo.id) || { soma: 0, qtd: 0, somaComissao: 0 };
        const valorTotal = Number(acordo.valor_total) || 0;
        const somaParcelas = dadosParcelas.soma;
        const qtdParcelasAcordo = acordo.parcelas || 0;
        const qtdParcelasCadastradas = dadosParcelas.qtd;
        const comissaoTotal = Number(acordo.comissao_total) || 0;
        const somaComissoes = dadosParcelas.somaComissao;

        const diferencaValor = Math.abs(valorTotal - somaParcelas);
        const diferencaQtdParcelas = Math.abs(qtdParcelasAcordo - qtdParcelasCadastradas);
        const diferencaComissao = Math.abs(comissaoTotal - somaComissoes);

        const tiposDivergencia: string[] = [];

        if (diferencaValor > 0.10) {
          tiposDivergencia.push('Valor total divergente');
        }

        if (diferencaQtdParcelas > 0) {
          tiposDivergencia.push('Quantidade de parcelas incorreta');
        }

        if (diferencaComissao > 0.10) {
          tiposDivergencia.push('Comissão inconsistente');
        }

        if (tiposDivergencia.length > 0) {
          divergentes.push({
            id: acordo.id,
            clienteNome: acordo.cliente_nome,
            clienteCpf: acordo.cliente_cpf || '',
            valorTotal,
            somaParcelas,
            diferencaValor,
            qtdParcelasAcordo,
            qtdParcelasCadastradas,
            comissaoTotal,
            somaComissoes,
            diferencaComissao,
            tiposDivergencia,
          });
        }
      }

      setAcordosDivergentes(divergentes);

      // Detectar CPFs duplicados
      const acordosPorCpf = new Map<string, typeof acordos>();
      for (const acordo of acordos || []) {
        const cpfNormalizado = normalizarCPF(acordo.cliente_cpf || '');
        if (cpfNormalizado.length === 11) {
          const lista = acordosPorCpf.get(cpfNormalizado) || [];
          lista.push(acordo);
          acordosPorCpf.set(cpfNormalizado, lista);
        }
      }

      // Filtrar apenas CPFs com mais de 1 acordo
      const duplicados: CpfDuplicado[] = [];
      acordosPorCpf.forEach((acordosList, cpf) => {
        if (acordosList.length > 1) {
          duplicados.push({
            cpf,
            qtdAcordos: acordosList.length,
            acordos: acordosList.map(a => ({
              id: a.id,
              clienteNome: a.cliente_nome,
              valorTotal: Number(a.valor_total) || 0,
              status: a.status || 'ativo',
              criadoEm: a.criado_em,
            })),
          });
        }
      });

      // Ordenar por quantidade de acordos (mais duplicados primeiro)
      duplicados.sort((a, b) => b.qtdAcordos - a.qtdAcordos);
      setCpfsDuplicados(duplicados);

      if (divergentes.length === 0 && duplicados.length === 0) {
        toast({
          title: 'Nenhuma divergência encontrada',
          description: 'Todos os acordos estão com valores consistentes.',
        });
      } else {
        toast({
          title: 'Divergências encontradas',
          description: `${divergentes.length} acordo(s) com inconsistências.`,
        });
      }
    } catch (error) {
      console.error('Erro ao buscar divergências:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível buscar as divergências.',
      });
    } finally {
      setCarregandoDivergencias(false);
    }
  };

  useEffect(() => {
    buscarDivergenciasInternas();
    buscarHistorico();
  }, []);

  const corrigirDataPagamento = async (pagamentoId: string, novaData: string, index: number) => {
    setCorrigindo(pagamentoId);
    try {
      const [dia, mes, ano] = novaData.split('/');
      const dataFormatada = `${ano}-${mes}-${dia}`;

      const { error } = await supabase
        .from('pagamentos')
        .update({ 
          data_paga: dataFormatada,
          status: 'pago'
        })
        .eq('id', pagamentoId);

      if (error) throw error;

      setDivergencias(prev => prev.filter((_, i) => i !== index));
      setCorrespondencias(prev => prev + 1);

      toast({
        title: 'Data corrigida!',
        description: `A data de pagamento foi atualizada para ${novaData}.`,
      });
    } catch (error) {
      console.error('Erro ao corrigir data:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível corrigir a data de pagamento.',
      });
    } finally {
      setCorrigindo(null);
    }
  };

  const salvarDivergenciasNoBanco = async (divergenciasParaSalvar: Divergencia[], nomeArquivo: string) => {
    if (!user) return;

    setSalvando(true);
    try {
      const registros = divergenciasParaSalvar.map(d => ({
        arquivo_nome: nomeArquivo,
        cpf_planilha: d.cpf,
        nome_planilha: d.nomeClientePlanilha,
        valor_planilha: d.valorPlanilha,
        data_planilha: d.dataPlanilha,
        nome_sistema: d.nomeClienteSistema !== '-' ? d.nomeClienteSistema : null,
        valor_sistema: d.valorSistema > 0 ? d.valorSistema : null,
        data_sistema: d.dataSistema !== '-' ? d.dataSistema : null,
        tipo_divergencia: d.tipoDivergencia,
        pagamento_id: d.pagamentoId || null,
        acordo_id: d.acordoId || null,
        user_id: user.id,
      }));

      const { error } = await supabase
        .from('auditoria_divergencias')
        .insert(registros);

      if (error) throw error;

      toast({
        title: 'Histórico salvo!',
        description: `${divergenciasParaSalvar.length} divergências foram salvas no histórico.`,
      });

      // Atualizar histórico
      await buscarHistorico();
    } catch (error) {
      console.error('Erro ao salvar divergências:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar as divergências no histórico.',
      });
    } finally {
      setSalvando(false);
    }
  };

  const processarPlanilha = async () => {
    if (!arquivo) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Selecione um arquivo Excel para processar.',
      });
      return;
    }

    setProcessando(true);

    try {
      const buffer = await arquivo.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      // Novo formato simplificado:
      // Coluna A (índice 0) = CPF
      // Coluna B (índice 1) = NOME
      // Coluna C (índice 2) = VALOR PAGO
      // Coluna D (índice 3) = DATA

      const linhasImportadas: LinhaImportada[] = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || !row[0]) continue; // CPF está na coluna A (índice 0)

        const cpfValue = normalizarCPF(row[0]);
        if (!cpfValue || cpfValue.length < 11) continue; // Pular linhas sem CPF válido

        linhasImportadas.push({
          cpf: cpfValue,
          nomeCliente: String(row[1] || '').trim(),
          valorPago: parseValorNumerico(row[2]),
          dataPagamento: parseDataExcel(row[3]),
        });
      }

      setDadosImportados(linhasImportadas);

      // Buscar pagamentos do sistema com paginação
      let allPagamentos: any[] = [];
      let offset = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: batch, error: batchError } = await supabase
          .from('pagamentos')
          .select(`
            id,
            data_paga,
            valor_parcela,
            comissao_parcela,
            numero_parcela,
            status,
            acordo_id,
            acordos (
              cliente_cpf,
              cliente_nome,
              dias_atraso
            )
          `)
          .order('id', { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (batchError) throw batchError;

        if (batch && batch.length > 0) {
          allPagamentos = [...allPagamentos, ...batch];
          offset += pageSize;
          hasMore = batch.length === pageSize;
        } else {
          hasMore = false;
        }
      }

      const pagamentosSistema: PagamentoSistema[] = allPagamentos.map((p: any) => ({
        id: p.id,
        cpf: normalizarCPF(p.acordos?.cliente_cpf || ''),
        nomeCliente: p.acordos?.cliente_nome || '',
        dataPaga: p.data_paga,
        valorParcela: p.valor_parcela,
        comissaoParcela: p.comissao_parcela,
        diasAtraso: p.acordos?.dias_atraso || 0,
        numeroParcela: p.numero_parcela,
        acordoId: p.acordo_id,
        status: p.status || 'pendente',
      }));

      const divergenciasEncontradas: Divergencia[] = [];
      let correspondenciasCount = 0;

      // Função robusta para normalizar QUALQUER formato de data para DD/MM/YYYY
      const normalizarDataParaComparacao = (data: string | null | undefined): string => {
        if (!data) return '';
        
        // Se for string ISO com hora (YYYY-MM-DDTHH:mm:ss...)
        if (typeof data === 'string' && data.includes('T')) {
          const parteData = data.split('T')[0]; // Pega só YYYY-MM-DD
          const [ano, mes, dia] = parteData.split('-');
          if (ano && mes && dia) {
            return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
          }
        }
        
        // Se for formato YYYY-MM-DD
        if (typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data)) {
          const [ano, mes, dia] = data.split('-');
          return `${dia}/${mes}/${ano}`;
        }
        
        // Se já estiver em DD/MM/YYYY
        if (typeof data === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
          return data;
        }
        
        // Tentar extrair data de strings com hora no formato DD/MM/YYYY HH:mm:ss
        if (typeof data === 'string' && /^\d{2}\/\d{2}\/\d{4}/.test(data)) {
          return data.substring(0, 10);
        }
        
        return String(data);
      };

      // Agrupar APENAS pagamentos PAGOS (status='pago' e data_paga preenchida) por CPF
      const pagamentosPagosPorCPF = new Map<string, PagamentoSistema[]>();
      for (const pag of pagamentosSistema) {
        if (!pag.cpf) continue;
        // IMPORTANTE: Só considerar pagamentos efetivamente pagos
        if (pag.status !== 'pago' || !pag.dataPaga) continue;
        
        const lista = pagamentosPagosPorCPF.get(pag.cpf) || [];
        lista.push(pag);
        pagamentosPagosPorCPF.set(pag.cpf, lista);
      }

      // Também manter lista completa para verificar se CPF existe no sistema
      const todosPagamentosPorCPF = new Map<string, PagamentoSistema[]>();
      for (const pag of pagamentosSistema) {
        if (!pag.cpf) continue;
        const lista = todosPagamentosPorCPF.get(pag.cpf) || [];
        lista.push(pag);
        todosPagamentosPorCPF.set(pag.cpf, lista);
      }

      // Identificar CPFs com múltiplos acordos para detecção de ambiguidade
      const acordosPorCPF = new Map<string, Set<string>>();
      for (const pag of pagamentosSistema) {
        if (!pag.cpf || !pag.acordoId) continue;
        const acordos = acordosPorCPF.get(pag.cpf) || new Set();
        acordos.add(pag.acordoId);
        acordosPorCPF.set(pag.cpf, acordos);
      }

      // Função auxiliar para normalizar nomes para comparação
      const normalizarNome = (nome: string): string => {
        return nome
          .toUpperCase()
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '') // Remove acentos
          .replace(/\s+/g, ' '); // Normaliza espaços múltiplos
      };

      // Função para comparar nomes (verifica se pelo menos o primeiro nome é igual)
      const compararNomes = (nomePlanilha: string, nomeSistema: string): { igual: boolean; detalhe: string } => {
        const p = normalizarNome(nomePlanilha);
        const s = normalizarNome(nomeSistema);
        
        if (p === s) {
          return { igual: true, detalhe: '' };
        }
        
        // Verificar se pelo menos o primeiro nome é igual
        const primeiroNomePlanilha = p.split(' ')[0];
        const primeiroNomeSistema = s.split(' ')[0];
        
        if (primeiroNomePlanilha === primeiroNomeSistema) {
          return { igual: true, detalhe: '' }; // Primeiro nome igual, considera OK
        }
        
        return { igual: false, detalhe: `Nome: "${nomePlanilha}" vs "${nomeSistema}"` };
      };

      // Controle para registrar ambiguidade apenas uma vez por CPF
      const cpfsAmbiguosRegistrados = new Set<string>();

      // Agrupar linhas da planilha por CPF para processamento em lote
      const linhasPorCPF = new Map<string, LinhaImportada[]>();
      for (const linha of linhasImportadas) {
        const lista = linhasPorCPF.get(linha.cpf) || [];
        lista.push(linha);
        linhasPorCPF.set(linha.cpf, lista);
      }

      // Processar CPF por CPF usando algoritmo de matching com pool
      for (const [cpf, linhasCPF] of linhasPorCPF) {
        const todosPagamentosCliente = todosPagamentosPorCPF.get(cpf) || [];
        const pagamentosPagosCliente = pagamentosPagosPorCPF.get(cpf) || [];

        // ======== 1. VERIFICAR CPF ========
        if (todosPagamentosCliente.length === 0) {
          // CPF não existe no sistema
          for (const linha of linhasCPF) {
            divergenciasEncontradas.push({
              cpf: linha.cpf,
              nomeClientePlanilha: linha.nomeCliente,
              nomeClienteSistema: '-',
              tipoDivergencia: 'CPF não encontrado no sistema',
              valorPlanilha: linha.valorPago,
              valorSistema: 0,
              dataPlanilha: linha.dataPagamento,
              dataSistema: '-',
            });
          }
          continue;
        }

        // ======== 2. VERIFICAR AMBIGUIDADE (MÚLTIPLOS ACORDOS) ========
        const acordosCliente = acordosPorCPF.get(cpf);
        if (acordosCliente && acordosCliente.size > 1) {
          if (!cpfsAmbiguosRegistrados.has(cpf)) {
            cpfsAmbiguosRegistrados.add(cpf);
            const acordoIds = Array.from(acordosCliente).slice(0, 3).join(', ').substring(0, 50);
            const qtdPagosPorAcordo = Array.from(acordosCliente).map(acordoId => {
              const pagos = pagamentosPagosCliente.filter(p => p.acordoId === acordoId).length;
              return pagos;
            });
            divergenciasEncontradas.push({
              cpf: cpf,
              nomeClientePlanilha: linhasCPF[0]?.nomeCliente || '-',
              nomeClienteSistema: todosPagamentosCliente[0]?.nomeCliente || '-',
              tipoDivergencia: `⚠️ CPF com ${acordosCliente.size} acordos - verificação manual. Pagamentos pagos: ${qtdPagosPorAcordo.join(', ')} por acordo`,
              valorPlanilha: 0,
              valorSistema: 0,
              dataPlanilha: '-',
              dataSistema: '-',
            });
          }
          continue;
        }

        // ======== 3. VERIFICAR SE HÁ PAGAMENTOS PAGOS ========
        if (pagamentosPagosCliente.length === 0) {
          for (const linha of linhasCPF) {
            divergenciasEncontradas.push({
              cpf: linha.cpf,
              nomeClientePlanilha: linha.nomeCliente,
              nomeClienteSistema: todosPagamentosCliente[0]?.nomeCliente || '-',
              tipoDivergencia: `CPF sem pagamentos pagos no sistema (planilha indica pagamento em ${linha.dataPagamento})`,
              valorPlanilha: linha.valorPago,
              valorSistema: 0,
              dataPlanilha: linha.dataPagamento,
              dataSistema: '-',
              acordoId: todosPagamentosCliente[0]?.acordoId,
            });
          }
          continue;
        }

        // ======== 4. MATCHING COM POOL (MULTICONJUNTO) ========
        // Criar pool mutável de pagamentos do sistema para este CPF
        const poolSistema = pagamentosPagosCliente.map(p => ({
          ...p,
          dataNormalizada: normalizarDataParaComparacao(p.dataPaga),
          usado: false,
        }));

        // Para cada linha da planilha, tentar encontrar match no pool
        for (const linha of linhasCPF) {
          const dataPlanilhaNormalizada = normalizarDataParaComparacao(linha.dataPagamento);
          
          // A) Tentar match por DATA + VALOR (tolerância 0.01)
          let matchEncontrado = false;
          for (const pagSistema of poolSistema) {
            if (pagSistema.usado) continue;
            
            const datasIguais = pagSistema.dataNormalizada === dataPlanilhaNormalizada;
            const valoresProximos = Math.abs(pagSistema.valorParcela - linha.valorPago) <= 0.10;
            
            if (datasIguais && valoresProximos) {
              // Match perfeito - marcar como usado e contar correspondência
              pagSistema.usado = true;
              correspondenciasCount++;
              matchEncontrado = true;
              break;
            }
          }
          
          if (matchEncontrado) continue;

          // B) Se não achou match perfeito, procurar por VALOR similar (para indicar data divergente)
          let pagamentoComValorSimilar: typeof poolSistema[0] | null = null;
          for (const pagSistema of poolSistema) {
            if (pagSistema.usado) continue;
            const valoresProximos = Math.abs(pagSistema.valorParcela - linha.valorPago) <= 0.10;
            if (valoresProximos) {
              pagamentoComValorSimilar = pagSistema;
              break;
            }
          }

          if (pagamentoComValorSimilar) {
            // Data divergente - valor igual mas data diferente
            pagamentoComValorSimilar.usado = true;
            divergenciasEncontradas.push({
              cpf: linha.cpf,
              nomeClientePlanilha: linha.nomeCliente,
              nomeClienteSistema: pagamentoComValorSimilar.nomeCliente,
              tipoDivergencia: `📅 DATA DIVERGENTE: Planilha ${dataPlanilhaNormalizada} ≠ Sistema ${pagamentoComValorSimilar.dataNormalizada} (Parcela ${pagamentoComValorSimilar.numeroParcela})`,
              valorPlanilha: linha.valorPago,
              valorSistema: pagamentoComValorSimilar.valorParcela,
              dataPlanilha: dataPlanilhaNormalizada,
              dataSistema: pagamentoComValorSimilar.dataNormalizada,
              pagamentoId: pagamentoComValorSimilar.id,
              acordoId: pagamentoComValorSimilar.acordoId,
            });
          } else {
            // C) Não encontrou nada - pagamento da planilha não existe no sistema
            divergenciasEncontradas.push({
              cpf: linha.cpf,
              nomeClientePlanilha: linha.nomeCliente,
              nomeClienteSistema: todosPagamentosCliente[0]?.nomeCliente || '-',
              tipoDivergencia: `❌ Pagamento da planilha NÃO encontrado no sistema (data: ${dataPlanilhaNormalizada}, valor: R$ ${linha.valorPago.toFixed(2).replace('.', ',')})`,
              valorPlanilha: linha.valorPago,
              valorSistema: 0,
              dataPlanilha: dataPlanilhaNormalizada,
              dataSistema: '-',
              acordoId: todosPagamentosCliente[0]?.acordoId,
            });
          }
        }

        // ======== 5. SOBRAS NO SISTEMA (pagamentos pagos que não estão na planilha) ========
        const sobrasDoSistema = poolSistema.filter(p => !p.usado);
        for (const sobra of sobrasDoSistema) {
          divergenciasEncontradas.push({
            cpf: cpf,
            nomeClientePlanilha: '-',
            nomeClienteSistema: sobra.nomeCliente,
            tipoDivergencia: `⚠️ Pagamento no SISTEMA não consta na planilha (data: ${sobra.dataNormalizada}, parcela ${sobra.numeroParcela})`,
            valorPlanilha: 0,
            valorSistema: sobra.valorParcela,
            dataPlanilha: '-',
            dataSistema: sobra.dataNormalizada,
            pagamentoId: sobra.id,
            acordoId: sobra.acordoId,
          });
        }
      }

      setDivergencias(divergenciasEncontradas);
      setCorrespondencias(correspondenciasCount);
      setProcessado(true);

      // Salvar divergências no histórico automaticamente
      if (divergenciasEncontradas.length > 0) {
        await salvarDivergenciasNoBanco(divergenciasEncontradas, arquivo.name);
      }

      toast({
        title: 'Processamento concluído',
        description: `${correspondenciasCount} correspondências, ${divergenciasEncontradas.length} divergências.`,
      });

    } catch (error) {
      console.error('Erro ao processar planilha:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao processar',
        description: 'Não foi possível processar a planilha. Verifique o formato.',
      });
    } finally {
      setProcessando(false);
    }
  };

  const exportarDivergencias = () => {
    if (divergencias.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sem dados',
        description: 'Não há divergências para exportar.',
      });
      return;
    }

    const dadosExport = divergencias.map((d) => ({
      'CPF': formatarCPF(d.cpf),
      'Nome Cliente (Planilha)': d.nomeClientePlanilha,
      'Nome Cliente (Sistema)': d.nomeClienteSistema,
      'Tipo de Divergência': d.tipoDivergencia,
      'Valor Planilha': d.valorPlanilha,
      'Valor Sistema': d.valorSistema,
      'Data Planilha': d.dataPlanilha,
      'Data Sistema': d.dataSistema,
    }));

    const ws = XLSX.utils.json_to_sheet(dadosExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Divergências');

    ws['!cols'] = [
      { wch: 15 },
      { wch: 30 },
      { wch: 30 },
      { wch: 45 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];

    XLSX.writeFile(wb, 'divergencias-auditoria.xlsx');

    toast({
      title: 'Exportação concluída',
      description: 'Arquivo de divergências baixado com sucesso.',
    });
  };

  const exportarDivergenciasInternas = () => {
    if (acordosDivergentes.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sem dados',
        description: 'Não há divergências internas para exportar.',
      });
      return;
    }

    const dadosExport = acordosDivergentes.map((a) => ({
      'Cliente': a.clienteNome,
      'CPF': formatarCPF(a.clienteCpf),
      'Tipo de Divergência': a.tiposDivergencia.join(', '),
      'Valor Total Acordo': a.valorTotal,
      'Soma das Parcelas': a.somaParcelas,
      'Diferença Valor': a.diferencaValor,
      'Parcelas Esperadas': a.qtdParcelasAcordo,
      'Parcelas Cadastradas': a.qtdParcelasCadastradas,
      'Comissão Total': a.comissaoTotal,
      'Soma Comissões': a.somaComissoes,
      'Diferença Comissão': a.diferencaComissao,
    }));

    const ws = XLSX.utils.json_to_sheet(dadosExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Divergências Internas');

    ws['!cols'] = [
      { wch: 30 },
      { wch: 15 },
      { wch: 35 },
      { wch: 18 },
      { wch: 18 },
      { wch: 15 },
      { wch: 18 },
      { wch: 20 },
      { wch: 15 },
      { wch: 15 },
      { wch: 18 },
    ];

    XLSX.writeFile(wb, 'divergencias-internas-acordos.xlsx');

    toast({
      title: 'Exportação concluída',
      description: 'Arquivo de divergências internas baixado com sucesso.',
    });
  };

  const exportarCpfsDuplicados = () => {
    if (cpfsDuplicados.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Sem dados',
        description: 'Não há CPFs duplicados para exportar.',
      });
      return;
    }

    const dadosExport: Record<string, any>[] = [];
    cpfsDuplicados.forEach(dup => {
      dup.acordos.forEach((acordo, idx) => {
        dadosExport.push({
          'CPF': formatarCPF(dup.cpf),
          'Qtd Acordos': idx === 0 ? dup.qtdAcordos : '',
          'Cliente': acordo.clienteNome,
          'Valor Total': acordo.valorTotal,
          'Status': acordo.status,
          'Data Criação': acordo.criadoEm ? new Date(acordo.criadoEm).toLocaleDateString('pt-BR') : '',
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(dadosExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'CPFs Duplicados');

    ws['!cols'] = [
      { wch: 15 },
      { wch: 12 },
      { wch: 30 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
    ];

    XLSX.writeFile(wb, 'cpfs-duplicados.xlsx');

    toast({
      title: 'Exportação concluída',
      description: 'Arquivo de CPFs duplicados baixado com sucesso.',
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Auditoria de Pagamentos</h1>
            <p className="text-muted-foreground">
              Compare pagamentos do Cobmais e identifique divergências
            </p>
          </div>
        </div>

        <Tabs defaultValue="comparacao-planilha" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="comparacao-planilha">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Comparação com Planilha
            </TabsTrigger>
            <TabsTrigger value="historico">
              <History className="h-4 w-4 mr-2" />
              Histórico
              {historico.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {historico.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="divergencias-internas">
              <AlertCircle className="h-4 w-4 mr-2" />
              Divergências Internas
              {acordosDivergentes.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {acordosDivergentes.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="comparacao-planilha" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Importar Planilha</CardTitle>
                <CardDescription>
                  Formato esperado: Coluna A (CPF), Coluna B (Nome), Coluna C (Valor Pago), Coluna D (Data de Pagamento)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <Input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleArquivoChange}
                    className="flex-1"
                  />
                  <Button
                    onClick={processarPlanilha}
                    disabled={!arquivo || processando || salvando}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {processando ? 'Processando...' : salvando ? 'Salvando...' : 'Processar e Comparar'}
                  </Button>
                </div>
                
                {arquivo && (
                  <p className="text-sm text-muted-foreground">
                    Arquivo selecionado: {arquivo.name}
                  </p>
                )}
              </CardContent>
            </Card>

            {processado && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="flex items-center gap-4 pt-6">
                      <FileSpreadsheet className="h-10 w-10 text-muted-foreground" />
                      <div>
                        <p className="text-2xl font-bold">{dadosImportados.length}</p>
                        <p className="text-muted-foreground">Linhas importadas</p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="flex items-center gap-4 pt-6">
                      <CheckCircle2 className="h-10 w-10 text-green-500" />
                      <div>
                        <p className="text-2xl font-bold">{correspondencias}</p>
                        <p className="text-muted-foreground">Correspondências</p>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="flex items-center gap-4 pt-6">
                      <AlertTriangle className="h-10 w-10 text-yellow-500" />
                      <div>
                        <p className="text-2xl font-bold">{divergencias.length}</p>
                        <p className="text-muted-foreground">Divergências</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {divergencias.length > 0 && (
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Divergências Encontradas</CardTitle>
                        <CardDescription>
                          Lista de registros com diferenças entre a planilha Cobmais e o sistema
                        </CardDescription>
                      </div>
                      <Button onClick={exportarDivergencias} variant="outline">
                        <Download className="h-4 w-4 mr-2" />
                        Exportar Excel
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>CPF</TableHead>
                              <TableHead>Cliente (Planilha)</TableHead>
                              <TableHead>Cliente (Sistema)</TableHead>
                              <TableHead>Divergência</TableHead>
                              <TableHead className="text-right">Valor Plan.</TableHead>
                              <TableHead className="text-right">Valor Sist.</TableHead>
                              <TableHead>Data Plan.</TableHead>
                              <TableHead>Data Sist.</TableHead>
                              <TableHead className="text-center">Ação</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {divergencias.map((d, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-mono text-sm">{formatarCPF(d.cpf)}</TableCell>
                                <TableCell>{d.nomeClientePlanilha}</TableCell>
                                <TableCell>{d.nomeClienteSistema}</TableCell>
                                <TableCell>
                                  <Badge variant="destructive" className="text-xs whitespace-normal">
                                    {d.tipoDivergencia}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">{formatarMoeda(d.valorPlanilha)}</TableCell>
                                <TableCell className="text-right">{formatarMoeda(d.valorSistema)}</TableCell>
                                <TableCell>{d.dataPlanilha}</TableCell>
                                <TableCell>{d.dataSistema}</TableCell>
                                <TableCell className="text-center">
                                  {d.tipoDivergencia.includes('Pagamento não registrado') && d.pagamentoId && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => corrigirDataPagamento(d.pagamentoId!, d.dataPlanilha, index)}
                                      disabled={corrigindo === d.pagamentoId}
                                    >
                                      {corrigindo === d.pagamentoId ? (
                                        <RefreshCw className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <>
                                          <CheckCircle2 className="h-4 w-4 mr-1" />
                                          Corrigir
                                        </>
                                      )}
                                    </Button>
                                  )}
                                  {d.acordoId && (
                                    <Button asChild size="sm" variant="ghost">
                                      <Link to={`/acordos/${d.acordoId}`}>
                                        <ExternalLink className="h-4 w-4" />
                                      </Link>
                                    </Button>
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

                {divergencias.length === 0 && (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-10">
                      <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                      <h3 className="text-xl font-semibold">Tudo certo!</h3>
                      <p className="text-muted-foreground">
                        Todos os registros da planilha correspondem ao sistema.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="historico" className="space-y-6 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Histórico de Auditorias</h2>
                <p className="text-sm text-muted-foreground">
                  Divergências salvas de importações anteriores
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={buscarHistorico}
                  disabled={carregandoHistorico}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${carregandoHistorico ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
                {historico.length > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={excluindo}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Limpar Todo Histórico
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir todo o histórico?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. Todas as {historico.reduce((acc, h) => acc + h.qtdDivergencias, 0)} divergências salvas serão removidas permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={excluirTodoHistorico}>
                          Excluir Tudo
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>

            {carregandoHistorico ? (
              <Card>
                <CardContent className="flex items-center justify-center py-10">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : historico.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-10">
                  <History className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold">Nenhum histórico</h3>
                  <p className="text-muted-foreground">
                    Importe uma planilha para começar a registrar divergências.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {historico.map((h) => (
                  <Card key={h.arquivoNome} className={arquivoSelecionado === h.arquivoNome ? 'border-primary' : ''}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
                          <CardTitle className="text-sm font-medium truncate max-w-[180px]" title={h.arquivoNome}>
                            {h.arquivoNome}
                          </CardTitle>
                        </div>
                      </div>
                      <CardDescription className="text-xs">
                        {new Date(h.criadoEm).toLocaleDateString('pt-BR')} às {new Date(h.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{h.qtdDivergencias} divergências</Badge>
                      </div>

                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => carregarDivergenciasArquivo(h.arquivoNome)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={excluindo}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir histórico?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Deseja excluir as {h.qtdDivergencias} divergências do arquivo "{h.arquivoNome}"?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => excluirHistoricoArquivo(h.arquivoNome)}>
                                Excluir
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {arquivoSelecionado && divergenciasSelecionadas.length > 0 && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Divergências: {arquivoSelecionado}</CardTitle>
                      <CardDescription>
                        {divergenciasSelecionadas.length} divergências encontradas neste arquivo
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setArquivoSelecionado(null)}>
                      Fechar
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>CPF</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Divergência</TableHead>
                          <TableHead className="text-right">Valor Plan.</TableHead>
                          <TableHead className="text-right">Valor Sist.</TableHead>
                          <TableHead>Data Plan.</TableHead>
                          <TableHead>Data Sist.</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {divergenciasSelecionadas.map((d) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-mono text-sm">{formatarCPF(d.cpf_planilha)}</TableCell>
                            <TableCell>{d.nome_planilha || d.nome_sistema || '-'}</TableCell>
                            <TableCell>
                              <Badge variant="destructive" className="text-xs whitespace-normal">
                                {d.tipo_divergencia}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">{formatarMoeda(d.valor_planilha || 0)}</TableCell>
                            <TableCell className="text-right">{formatarMoeda(d.valor_sistema || 0)}</TableCell>
                            <TableCell>{d.data_planilha || '-'}</TableCell>
                            <TableCell>{d.data_sistema || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="divergencias-internas" className="space-y-6 mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Acordos com Divergências</h2>
                <p className="text-sm text-muted-foreground">
                  Acordos que possuem inconsistências nos valores cadastrados
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={buscarDivergenciasInternas}
                  disabled={carregandoDivergencias}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${carregandoDivergencias ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
                {acordosDivergentes.length > 0 && (
                  <Button variant="outline" onClick={exportarDivergenciasInternas}>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar Excel
                  </Button>
                )}
              </div>
            </div>

            {carregandoDivergencias ? (
              <Card>
                <CardContent className="flex items-center justify-center py-10">
                  <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </CardContent>
              </Card>
            ) : acordosDivergentes.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-10">
                  <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                  <h3 className="text-xl font-semibold">Nenhuma divergência encontrada</h3>
                  <p className="text-muted-foreground">
                    Todos os acordos estão com valores consistentes.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {acordosDivergentes.map((acordo) => (
                  <Card key={acordo.id} className="border-destructive/50">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                          <CardTitle className="text-base">{acordo.clienteNome}</CardTitle>
                        </div>
                      </div>
                      {acordo.clienteCpf && (
                        <CardDescription className="font-mono text-xs">
                          CPF: {formatarCPF(acordo.clienteCpf)}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-1">
                        {acordo.tiposDivergencia.map((tipo, idx) => (
                          <Badge key={idx} variant="destructive" className="text-xs">
                            {tipo}
                          </Badge>
                        ))}
                      </div>

                      <div className="space-y-2 text-sm">
                        {acordo.diferencaValor > 0.10 && (
                          <div className="p-2 rounded bg-destructive/10 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Valor Total:</span>
                              <span className="font-medium">{formatarMoeda(acordo.valorTotal)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Soma Parcelas:</span>
                              <span className="font-medium">{formatarMoeda(acordo.somaParcelas)}</span>
                            </div>
                            <div className="flex justify-between text-destructive font-medium">
                              <span>Diferença:</span>
                              <span>{formatarMoeda(acordo.diferencaValor)}</span>
                            </div>
                          </div>
                        )}

                        {acordo.qtdParcelasAcordo !== acordo.qtdParcelasCadastradas && (
                          <div className="p-2 rounded bg-destructive/10 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Parcelas Esperadas:</span>
                              <span className="font-medium">{acordo.qtdParcelasAcordo}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Parcelas Cadastradas:</span>
                              <span className="font-medium">{acordo.qtdParcelasCadastradas}</span>
                            </div>
                          </div>
                        )}

                        {acordo.diferencaComissao > 0.10 && (
                          <div className="p-2 rounded bg-destructive/10 space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Comissão Total:</span>
                              <span className="font-medium">{formatarMoeda(acordo.comissaoTotal)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Soma Comissões:</span>
                              <span className="font-medium">{formatarMoeda(acordo.somaComissoes)}</span>
                            </div>
                            <div className="flex justify-between text-destructive font-medium">
                              <span>Diferença:</span>
                              <span>{formatarMoeda(acordo.diferencaComissao)}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <Button asChild variant="outline" size="sm" className="w-full">
                        <Link to={`/acordos/${acordo.id}`}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Ver Acordo
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Seção de CPFs Duplicados */}
            <div className="space-y-4 mt-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-orange-500" />
                    CPFs com Acordos Duplicados
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    CPFs que possuem mais de um acordo cadastrado no sistema
                  </p>
                </div>
                {cpfsDuplicados.length > 0 && (
                  <Button variant="outline" onClick={exportarCpfsDuplicados}>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar Duplicados
                  </Button>
                )}
              </div>

              {cpfsDuplicados.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-10">
                    <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                    <h3 className="text-xl font-semibold">Nenhum CPF duplicado</h3>
                    <p className="text-muted-foreground">
                      Todos os CPFs possuem apenas um acordo no sistema.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {cpfsDuplicados.map((dup) => (
                    <Card key={dup.cpf} className="border-orange-500/50">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-orange-500" />
                            <CardTitle className="text-base font-mono">
                              {formatarCPF(dup.cpf)}
                            </CardTitle>
                          </div>
                          <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                            {dup.qtdAcordos} acordos
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {dup.acordos.map((acordo, idx) => (
                          <div key={acordo.id} className="p-2 rounded bg-muted/50 space-y-1">
                            <div className="flex justify-between items-start">
                              <span className="text-sm font-medium truncate flex-1">
                                {idx + 1}. {acordo.clienteNome}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{formatarMoeda(acordo.valorTotal)}</span>
                              <span>{acordo.criadoEm ? new Date(acordo.criadoEm).toLocaleDateString('pt-BR') : '-'}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <Badge variant={acordo.status === 'concluido' ? 'default' : 'outline'} className="text-xs">
                                {acordo.status}
                              </Badge>
                              <Button asChild variant="ghost" size="sm" className="h-6 px-2">
                                <Link to={`/acordos/${acordo.id}`}>
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              </Button>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
