// Tabela de juros UME APORTE baseada em dias de atraso
export const tabelaJurosAporte = [
  { min: 1, max: 30, percentual: 7 },
  { min: 31, max: 90, percentual: 15 },
  { min: 91, max: 180, percentual: 20 },
  { min: 181, max: 365, percentual: 27 },
  { min: 366, max: 99999, percentual: 36 },
];

export function calcularPercentualJurosAporte(diasAtraso: number): number {
  for (const faixa of tabelaJurosAporte) {
    if (diasAtraso >= faixa.min && diasAtraso <= faixa.max) {
      return faixa.percentual;
    }
  }
  return 0;
}

// Calcula valor com juros para APORTE: retorna valor original + juros
export function calcularJurosAporte(valorParcela: number, diasAtraso: number): number {
  const percentual = calcularPercentualJurosAporte(diasAtraso);
  return Math.round(valorParcela * (1 + percentual / 100) * 100) / 100;
}

// Tabela de comissões UME | NOVO MUNDO baseada em dias em atraso (comissão em todas as parcelas)
export const tabelaComissoes = [
  { min: 1, max: 60, percentual: 2 },
  { min: 61, max: 90, percentual: 4 },
  { min: 91, max: 180, percentual: 5 },
  { min: 181, max: 360, percentual: 7 },
  { min: 361, max: 720, percentual: 9 },
  { min: 721, max: 9999, percentual: 13 }
];

// Tabela de comissões MUNDO DA MODA baseada em dias em atraso (comissão apenas na 1ª parcela)
export const tabelaComissoesMundoDaModa = [
  { min: 1, max: 60, percentual: 2 },
  { min: 61, max: 90, percentual: 5 },
  { min: 91, max: 180, percentual: 7 },
  { min: 181, max: 420, percentual: 9 },
  { min: 421, max: 9999, percentual: 13 }
];

// Tabela de comissões da EMPRESA baseada em dias em atraso
export const tabelaComissoesEmpresa = [
  { min: 1, max: 30, percentual: 7 },
  { min: 31, max: 60, percentual: 8 },
  { min: 61, max: 90, percentual: 15 },
  { min: 91, max: 120, percentual: 20 },
  { min: 121, max: 150, percentual: 20 },
  { min: 151, max: 180, percentual: 20 },
  { min: 181, max: 210, percentual: 27 },
  { min: 211, max: 240, percentual: 27 },
  { min: 241, max: 270, percentual: 27 },
  { min: 271, max: 300, percentual: 27 },
  { min: 301, max: 330, percentual: 27 },
  { min: 331, max: 360, percentual: 27 },
  { min: 361, max: 420, percentual: 36 },
  { min: 421, max: 480, percentual: 36 },
  { min: 481, max: 540, percentual: 36 },
  { min: 541, max: 600, percentual: 36 },
  { min: 601, max: 660, percentual: 36 },
  { min: 661, max: 720, percentual: 36 },
  { min: 721, max: 1800, percentual: 50 },
  { min: 1801, max: 99999, percentual: 50 }
];

export function calcularPercentualComissaoEmpresa(diasAtraso: number): number {
  for (const faixa of tabelaComissoesEmpresa) {
    if (diasAtraso >= faixa.min && diasAtraso <= faixa.max) {
      return faixa.percentual;
    }
  }
  return 0;
}

export function calcularPercentualComissao(diasAtraso: number): number {
  for (const faixa of tabelaComissoes) {
    if (diasAtraso >= faixa.min && diasAtraso <= faixa.max) {
      return faixa.percentual;
    }
  }
  return 0;
}

export function calcularPercentualComissaoMundoDaModa(diasAtraso: number): number {
  for (const faixa of tabelaComissoesMundoDaModa) {
    if (diasAtraso >= faixa.min && diasAtraso <= faixa.max) {
      return faixa.percentual;
    }
  }
  return 0;
}

// Calcula comissão para MUNDO DA MODA (apenas 1ª parcela tem comissão)
export function calcularComissaoMundoDaModa(valorTotal: number, parcelas: number, diasAtraso: number) {
  const percentual = calcularPercentualComissaoMundoDaModa(diasAtraso);
  const valorParcela = valorTotal / parcelas;
  // Comissão apenas na primeira parcela
  const comissaoPrimeiraParcela = valorParcela * (percentual / 100);

  return {
    percentual,
    valorParcela: Math.round(valorParcela * 100) / 100,
    comissaoPrimeiraParcela: Math.round(comissaoPrimeiraParcela * 100) / 100,
    comissaoTotal: Math.round(comissaoPrimeiraParcela * 100) / 100 // Apenas 1ª parcela
  };
}

// Gera parcelas para MUNDO DA MODA (comissão apenas na 1ª parcela)
export function gerarParcelasMundoDaModa(
  dataPrimeiroPagamento: Date,
  numeroParcelas: number,
  valorParcela: number,
  comissaoPrimeiraParcela: number,
  valorEntrada?: number,
  comissaoEntrada?: number
) {
  const parcelas = [];
  
  for (let i = 0; i < numeroParcelas; i++) {
    const dataPrevista = new Date(dataPrimeiroPagamento);
    dataPrevista.setMonth(dataPrevista.getMonth() + i);
    
    // Se é a primeira parcela e tem entrada definida, usa os valores de entrada
    const isEntrada = i === 0 && valorEntrada !== undefined;
    const isPrimeiraParcela = i === 0;
    
    parcelas.push({
      numero_parcela: i + 1,
      data_prevista: dataPrevista.toISOString().split('T')[0],
      valor_parcela: isEntrada ? valorEntrada : valorParcela,
      // Comissão apenas na primeira parcela
      comissao_parcela: isPrimeiraParcela 
        ? (isEntrada && comissaoEntrada !== undefined ? comissaoEntrada : comissaoPrimeiraParcela)
        : 0,
      status: 'pendente' as const
    });
  }
  
  return parcelas;
}

export function calcularComissao(valorTotal: number, parcelas: number, diasAtraso: number) {
  const percentual = calcularPercentualComissao(diasAtraso);
  const valorParcela = valorTotal / parcelas;
  const comissaoPorParcela = valorParcela * (percentual / 100);
  const comissaoTotal = comissaoPorParcela * parcelas;

  return {
    percentual,
    valorParcela: Math.round(valorParcela * 100) / 100,
    comissaoPorParcela: Math.round(comissaoPorParcela * 100) / 100,
    comissaoTotal: Math.round(comissaoTotal * 100) / 100
  };
}

export function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor);
}

export function formatarData(data: string | Date | null | undefined): string {
  if (!data) return '-';
  
  let d: Date;
  if (typeof data === 'string') {
    // Se já contém 'T' (timestamp ISO), usa direto. Senão, adiciona T00:00:00
    d = data.includes('T') ? new Date(data) : new Date(data + 'T00:00:00');
  } else {
    d = data;
  }
  
  if (isNaN(d.getTime())) return '-';
  
  return new Intl.DateTimeFormat('pt-BR').format(d);
}

export function gerarParcelas(
  dataPrimeiroPagamento: Date,
  numeroParcelas: number,
  valorParcela: number,
  comissaoPorParcela: number,
  valorEntrada?: number,
  comissaoEntrada?: number
) {
  const parcelas = [];
  
  for (let i = 0; i < numeroParcelas; i++) {
    const dataPrevista = new Date(dataPrimeiroPagamento);
    dataPrevista.setMonth(dataPrevista.getMonth() + i);
    
    // Se é a primeira parcela e tem entrada definida, usa os valores de entrada
    const isEntrada = i === 0 && valorEntrada !== undefined;
    
    parcelas.push({
      numero_parcela: i + 1,
      data_prevista: dataPrevista.toISOString().split('T')[0],
      valor_parcela: isEntrada ? valorEntrada : valorParcela,
      comissao_parcela: isEntrada && comissaoEntrada !== undefined ? comissaoEntrada : comissaoPorParcela,
      status: 'pendente' as const
    });
  }
  
  return parcelas;
}
