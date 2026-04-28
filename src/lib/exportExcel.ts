import * as XLSX from 'xlsx';

interface ColunaExport<T> {
  chave: keyof T;
  titulo: string;
}

export function exportarParaExcel<T extends Record<string, any>>(
  dados: T[],
  colunas: ColunaExport<T>[],
  nomeArquivo: string
) {
  const dadosFormatados = dados.map(item => {
    const linha: Record<string, any> = {};
    colunas.forEach(col => {
      linha[col.titulo] = item[col.chave];
    });
    return linha;
  });

  const ws = XLSX.utils.json_to_sheet(dadosFormatados);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Dados');

  ws['!cols'] = colunas.map(col => ({ wch: Math.max(col.titulo.length, 15) }));

  XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
}
