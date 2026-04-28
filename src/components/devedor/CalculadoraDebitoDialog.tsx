import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calculator, Download } from 'lucide-react';
import { toast } from 'sonner';
import { differenceInMonths, differenceInDays, format, addDays } from 'date-fns';
import { calcularINPCAcumulado } from '@/lib/inpcData';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';

interface Contrato {
  id: string;
  nome: string;
  cpf: string;
  credor: string | null;
  contrato: string | null;
  valor_original: number;
  valor_atualizado: number;
  data_vencimento: string | null;
  descricao: string | null;
  estagio: string;
}

interface Devedor {
  id: string;
  nome: string;
  cpf: string;
}

interface CalculadoraDebitoDialogProps {
  contratos: Contrato[];
  devedor: Devedor;
}

type Frequencia = 'semanal' | 'quinzenal' | 'mensal';

const getTaxaJurosMensal = (numParcelas: number): number => {
  if (numParcelas <= 1) return 0;
  return 0.01;
};

const getTaxaJurosLabel = (numParcelas: number): string => {
  const taxa = getTaxaJurosMensal(numParcelas);
  if (taxa === 0) return 'Sem juros';
  return `${(taxa * 100).toFixed(1)}% a.m.`;
};

const ajustarTaxaPorFrequencia = (taxaMensal: number, freq: Frequencia): number => {
  if (taxaMensal === 0) return 0;
  if (freq === 'semanal') return taxaMensal / 4.33;
  if (freq === 'quinzenal') return taxaMensal / 2;
  return taxaMensal;
};

const calcularPMT = (pv: number, i: number, n: number): number => {
  if (i === 0 || n <= 1) return pv / n;
  const fator = Math.pow(1 + i, n);
  return pv * (i * fator) / (fator - 1);
};

const getDiasFrequencia = (freq: Frequencia): number => {
  if (freq === 'semanal') return 7;
  if (freq === 'quinzenal') return 15;
  return 30;
};

const getFrequenciaLabel = (freq: Frequencia): string => {
  if (freq === 'semanal') return 'Semanal';
  if (freq === 'quinzenal') return 'Quinzenal';
  return 'Mensal';
};

export function CalculadoraDebitoDialog({ contratos, devedor }: CalculadoraDebitoDialogProps) {
  const [open, setOpen] = useState(false);
  const [contratoSelecionado, setContratoSelecionado] = useState<string>('todos');
  const [aplicarINPC, setAplicarINPC] = useState(false);
  const [aplicarJuros, setAplicarJuros] = useState(true);
  const [aplicarMulta, setAplicarMulta] = useState(true);
  const [taxaAcumulada, setTaxaAcumulada] = useState<number>(0);
  const [parcelas, setParcelas] = useState<number>(1);
  const [frequencia, setFrequencia] = useState<Frequencia>('mensal');
  const [dataBase, setDataBase] = useState<string>('');
  const [periodoConsultado, setPeriodoConsultado] = useState<string>('');
  const [dataPrimeiroPagamento, setDataPrimeiroPagamento] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const contratoAtual = contratoSelecionado === 'todos'
    ? null
    : contratos.find(c => c.id === contratoSelecionado);

  const valorOriginal = contratoSelecionado === 'todos'
    ? contratos.reduce((sum, c) => sum + c.valor_original, 0)
    : (contratoAtual?.valor_original || 0);

  const dataVencimento = contratoSelecionado === 'todos'
    ? contratos.reduce((oldest: string | null, c) => {
        if (!c.data_vencimento) return oldest;
        if (!oldest) return c.data_vencimento;
        return c.data_vencimento < oldest ? c.data_vencimento : oldest;
      }, null)
    : (contratoAtual?.data_vencimento || null);

  useEffect(() => {
    if (dataVencimento) {
      setDataBase(dataVencimento);
    }
  }, [dataVencimento, contratoSelecionado]);

  const hoje = new Date();
  const mesesAtraso = dataBase
    ? Math.max(0, differenceInMonths(hoje, new Date(dataBase + 'T00:00:00')))
    : 0;
  const diasAtraso = dataBase
    ? Math.max(0, differenceInDays(hoje, new Date(dataBase + 'T00:00:00')))
    : 0;

  const multa = aplicarMulta ? valorOriginal * 0.02 : 0;
  const juros = aplicarJuros ? valorOriginal * 0.01 * mesesAtraso : 0;
  const correcao = aplicarINPC ? valorOriginal * (taxaAcumulada / 100) : 0;
  const totalAtualizado = valorOriginal + multa + juros + correcao;

  const taxaJurosMensal = getTaxaJurosMensal(parcelas);
  const taxaAjustada = ajustarTaxaPorFrequencia(taxaJurosMensal, frequencia);
  const valorParcela = calcularPMT(totalAtualizado, taxaAjustada, parcelas);
  const totalAPagar = valorParcela * parcelas;
  const custoParcelamento = totalAPagar - totalAtualizado;

  const diasFreq = getDiasFrequencia(frequencia);
  const gerarDatasParcelas = () => {
    const baseDate = dataPrimeiroPagamento ? new Date(dataPrimeiroPagamento + 'T00:00:00') : hoje;
    return Array.from({ length: parcelas }, (_, i) => addDays(baseDate, diasFreq * i));
  };

  const isValidDate = (d: string) => {
    if (!d || d.length !== 10) return false;
    const year = parseInt(d.split('-')[0], 10);
    return year >= 1990 && year <= 2100;
  };

  const calcularTaxa = useCallback(() => {
    if (!isValidDate(dataBase)) return;
    const dataFinal = format(hoje, 'yyyy-MM-dd');
    if (dataBase >= dataFinal) return;

    const taxa = calcularINPCAcumulado(dataBase, dataFinal);
    setTaxaAcumulada(taxa);
    const diStr = new Date(dataBase + 'T00:00:00').toLocaleDateString('pt-BR');
    const dfStr = hoje.toLocaleDateString('pt-BR');
    setPeriodoConsultado(`${diStr} a ${dfStr}`);
  }, [dataBase]);

  useEffect(() => {
    if (open && isValidDate(dataBase)) {
      calcularTaxa();
    }
  }, [open, dataBase, calcularTaxa]);

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Calcula valor atualizado de cada contrato individual
  const calcularValorAtualizadoContrato = (valorOrig: number, dataVenc: string | null) => {
    if (!dataVenc) return valorOrig;
    const meses = Math.max(0, differenceInMonths(hoje, new Date(dataVenc + 'T00:00:00')));
    const m = aplicarMulta ? valorOrig * 0.02 : 0;
    const j = aplicarJuros ? valorOrig * 0.01 * meses : 0;
    const c = aplicarINPC ? valorOrig * (taxaAcumulada / 100) : 0;
    return valorOrig + m + j + c;
  };

  const gerarPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;
    const datasParcelas = gerarDatasParcelas();

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Cálculo de Atualização de Débito', pageWidth / 2, y, { align: 'center' });
    y += 12;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('DADOS DO DEVEDOR', 14, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.text(`Nome: ${devedor.nome}`, 14, y); y += 5;
    doc.text(`CPF/CNPJ: ${devedor.cpf}`, 14, y); y += 5;

    if (contratoAtual) {
      doc.text(`Credor: ${contratoAtual.credor || 'N/A'}`, 14, y); y += 5;
      doc.text(`Contrato: ${contratoAtual.contrato || 'N/A'}`, 14, y); y += 5;
    } else {
      doc.text(`Contratos: Todos (${contratos.length})`, 14, y); y += 5;
    }

    if (dataBase) {
      doc.text(`Data Base: ${new Date(dataBase + 'T00:00:00').toLocaleDateString('pt-BR')}`, 14, y); y += 5;
      doc.text(`Dias em Atraso: ${diasAtraso}`, 14, y); y += 5;
      doc.text(`Meses em Atraso: ${mesesAtraso}`, 14, y); y += 5;
    }

    y += 4;
    doc.setDrawColor(200);
    doc.line(14, y, pageWidth - 14, y);
    y += 8;

    // Detalhamento por contrato/parcela
    doc.setFont('helvetica', 'bold');
    doc.text('DETALHAMENTO POR PARCELA', 14, y); y += 6;

    // Table header
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 4, pageWidth - 28, 7, 'F');
    doc.setFontSize(8);
    doc.text('Contrato', 16, y);
    doc.text('Vencimento', 60, y);
    doc.text('Valor Original', 100, y);
    doc.text('Valor Atualizado', pageWidth - 16, y, { align: 'right' });
    y += 7;

    doc.setFont('helvetica', 'normal');
    const contratosParaListar = contratoSelecionado === 'todos' ? contratos : [contratoAtual!];
    let somaOriginal = 0;
    let somaAtualizado = 0;

    for (const c of contratosParaListar) {
      if (y > 270) { doc.addPage(); y = 20; }
      const valAtualizado = calcularValorAtualizadoContrato(c.valor_original, c.data_vencimento);
      somaOriginal += c.valor_original;
      somaAtualizado += valAtualizado;

      doc.text(c.contrato || 'S/N', 16, y);
      doc.text(c.data_vencimento ? new Date(c.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A', 60, y);
      doc.text(fmtBRL(c.valor_original), 100, y);
      doc.text(fmtBRL(valAtualizado), pageWidth - 16, y, { align: 'right' });
      y += 5;
    }

    // Totals
    y += 2;
    doc.setDrawColor(200);
    doc.line(14, y, pageWidth - 14, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', 16, y);
    doc.text(fmtBRL(somaOriginal), 100, y);
    doc.text(fmtBRL(somaAtualizado), pageWidth - 16, y, { align: 'right' });
    y += 8;

    // Composição
    doc.setFontSize(10);
    doc.text('COMPOSIÇÃO DA ATUALIZAÇÃO', 14, y); y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const items: [string, string][] = [
      ['Valor Original', fmtBRL(valorOriginal)],
    ];
    if (aplicarMulta) items.push(['Multa (2%)', fmtBRL(multa)]);
    if (aplicarJuros) items.push([`Juros de Mora (1% a.m. × ${mesesAtraso} meses)`, fmtBRL(juros)]);
    if (aplicarINPC) items.push([`Correção Monetária (INPC - ${taxaAcumulada.toFixed(4)}%)`, fmtBRL(correcao)]);

    for (const [label, value] of items) {
      doc.text(label, 14, y);
      doc.text(value, pageWidth - 14, y, { align: 'right' });
      y += 6;
    }

    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('VALOR TOTAL ATUALIZADO', 14, y);
    doc.text(fmtBRL(totalAtualizado), pageWidth - 14, y, { align: 'right' });
    y += 10;

    // Parcelamento
    doc.setFontSize(10);
    doc.text(`PARCELAMENTO EM ${parcelas}x - ${getFrequenciaLabel(frequencia)}`, 14, y); y += 6;
    
    if (parcelas > 1) {
      doc.setFont('helvetica', 'normal');
      doc.text(`Taxa de juros do parcelamento: ${getTaxaJurosLabel(parcelas)}`, 14, y); y += 5;
    }

    // Parcelas table
    doc.setFillColor(240, 240, 240);
    doc.rect(14, y - 4, pageWidth - 28, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Parcela', 20, y);
    doc.text('Vencimento', pageWidth / 2, y, { align: 'center' });
    doc.text('Valor', pageWidth - 30, y, { align: 'right' });
    y += 7;

    doc.setFont('helvetica', 'normal');
    for (let i = 0; i < parcelas; i++) {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(`${i + 1}ª parcela`, 20, y);
      doc.text(format(datasParcelas[i], 'dd/MM/yyyy'), pageWidth / 2, y, { align: 'center' });
      doc.text(fmtBRL(valorParcela), pageWidth - 30, y, { align: 'right' });
      y += 6;
    }

    if (parcelas > 1) {
      y += 3;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`Total a pagar: ${fmtBRL(totalAPagar)}`, 14, y); y += 5;
      if (custoParcelamento > 0) {
        doc.setFont('helvetica', 'normal');
        doc.text(`Custo do parcelamento: ${fmtBRL(custoParcelamento)}`, 14, y); y += 5;
      }
    }

    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(`Documento gerado em ${format(hoje, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`, 14, y);

    doc.save(`calculo-debito-${devedor.cpf.replace(/\D/g, '')}.pdf`);
    toast.success('PDF gerado com sucesso!');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <Calculator className="h-4 w-4 mr-1" /> CALCULAR
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" /> Cálculo de Atualização de Débito
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Contrato selection */}
          <div className="space-y-2">
            <Label>Contrato</Label>
            <Select value={contratoSelecionado} onValueChange={setContratoSelecionado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos ({contratos.length} contratos)</SelectItem>
                {contratos.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.contrato || 'S/ contrato'} - {c.credor || 'S/ credor'} ({fmtBRL(c.valor_original)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Info fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Valor Original</Label>
              <p className="font-semibold text-lg">{fmtBRL(valorOriginal)}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Data Base (referência)</Label>
              <Input
                type="date"
                value={dataBase}
                onChange={(e) => setDataBase(e.target.value)}
                className="w-full"
              />
            </div>
          </div>

          {dataBase && (
            <div className="flex items-center gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Atraso: </span>
                <Badge variant="destructive" className="text-xs">{diasAtraso} dias ({mesesAtraso} meses)</Badge>
              </div>
              {aplicarINPC && periodoConsultado && (
                <div className="text-muted-foreground text-xs">
                  Período consultado: {periodoConsultado}
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Correção Monetária - INPC checkbox */}
          <div className="space-y-3">
            <Label className="font-semibold">Correção Monetária</Label>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="inpc-check" className="text-sm font-medium">INPC (Índice Nacional de Preços ao Consumidor)</Label>
                {aplicarINPC && (
                  <p className="text-xs text-muted-foreground">Taxa acumulada: {taxaAcumulada.toFixed(4)}%</p>
                )}
              </div>
              <Checkbox
                id="inpc-check"
                checked={aplicarINPC}
                onCheckedChange={(checked) => setAplicarINPC(checked === true)}
              />
            </div>
          </div>

          {/* Juros e Multa checkboxes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="juros-check" className="text-sm font-medium">Juros de Mora (1% a.m.)</Label>
                {aplicarJuros && mesesAtraso > 0 && (
                  <p className="text-xs text-muted-foreground">{mesesAtraso} meses = {fmtBRL(juros)}</p>
                )}
              </div>
              <Checkbox
                id="juros-check"
                checked={aplicarJuros}
                onCheckedChange={(checked) => setAplicarJuros(checked === true)}
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="multa-check" className="text-sm font-medium">Multa (2%)</Label>
                {aplicarMulta && (
                  <p className="text-xs text-muted-foreground">{fmtBRL(multa)}</p>
                )}
              </div>
              <Checkbox
                id="multa-check"
                checked={aplicarMulta}
                onCheckedChange={(checked) => setAplicarMulta(checked === true)}
              />
            </div>
          </div>

          <Separator />

          {/* Parcelas + Frequência */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="font-semibold">Parcelamento</Label>
              <Select value={String(parcelas)} onValueChange={(v) => setParcelas(Number(v))}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 60 }, (_, i) => i + 1).map(n => (
                    <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Frequência de Pagamento</Label>
              <RadioGroup
                value={frequencia}
                onValueChange={(v) => setFrequencia(v as Frequencia)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="semanal" id="freq-semanal" />
                  <Label htmlFor="freq-semanal">Semanal</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="quinzenal" id="freq-quinzenal" />
                  <Label htmlFor="freq-quinzenal">Quinzenal</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="mensal" id="freq-mensal" />
                  <Label htmlFor="freq-mensal">Mensal</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Data do 1º Pagamento</Label>
              <Input
                type="date"
                value={dataPrimeiroPagamento}
                onChange={(e) => setDataPrimeiroPagamento(e.target.value)}
                className="w-48"
              />
            </div>

            {parcelas > 1 && (
              <div className="text-sm text-muted-foreground">
                Taxa de juros do parcelamento: <Badge variant="outline">{getTaxaJurosLabel(parcelas)}</Badge>
              </div>
            )}
          </div>

          <Separator />

          {/* Resumo */}
          <Card>
            <CardContent className="pt-4 space-y-3">
              <h3 className="font-semibold text-sm">Resumo do Cálculo</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Original</span>
                  <span>{fmtBRL(valorOriginal)}</span>
                </div>
                {aplicarMulta && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Multa (2%)</span>
                    <span>{fmtBRL(multa)}</span>
                  </div>
                )}
                {aplicarJuros && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Juros de Mora (1% a.m. × {mesesAtraso} meses)</span>
                    <span>{fmtBRL(juros)}</span>
                  </div>
                )}
                {aplicarINPC && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Correção INPC ({taxaAcumulada.toFixed(4)}%)
                    </span>
                    <span>{fmtBRL(correcao)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Total Atualizado</span>
                  <span className="text-destructive">{fmtBRL(totalAtualizado)}</span>
                </div>
                {parcelas > 1 && (
                  <>
                    <Separator />
                    <div className="flex justify-between text-muted-foreground">
                      <span>Juros do parcelamento</span>
                      <span>{getTaxaJurosLabel(parcelas)}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>{parcelas}x de ({getFrequenciaLabel(frequencia)})</span>
                      <span>{fmtBRL(valorParcela)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total a pagar</span>
                      <span className="font-semibold">{fmtBRL(totalAPagar)}</span>
                    </div>
                    {custoParcelamento > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Custo do parcelamento</span>
                        <span className="text-muted-foreground">{fmtBRL(custoParcelamento)}</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Tabela de parcelas */}
          {parcelas > 1 && (
            <div className="max-h-40 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-2">Parcela</th>
                    <th className="text-center p-2">Vencimento</th>
                    <th className="text-right p-2">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {gerarDatasParcelas().map((data, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2">{i + 1}ª parcela</td>
                      <td className="p-2 text-center">{format(data, 'dd/MM/yyyy')}</td>
                      <td className="p-2 text-right">{fmtBRL(valorParcela)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Download PDF */}
          <Button onClick={gerarPDF} className="w-full">
            <Download className="h-4 w-4 mr-2" /> Baixar PDF
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
