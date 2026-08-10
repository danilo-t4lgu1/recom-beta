// Geração dos exports Excel do Painel Administrativo do Recom (achado 2026-08-10).
// Usa `exceljs` (não `xlsx`/SheetJS — auditoria de pacote encontrou 2 vulnerabilidades
// HIGH sem correção disponível na versão npm do `xlsx`, prototype pollution + ReDoS
// no parsing; `exceljs` tem só 2 MODERATE transitivas via `uuid`, não exploráveis pelo
// uso que fazemos aqui — só geramos arquivos, nunca fazemos parsing de .xlsx de
// terceiros). Módulo de I/O puro (monta o workbook em memória, nunca escreve em disco
// nem lê nada) — quem chama decide o que fazer com o Buffer resultante (resposta HTTP,
// por enquanto).
//
// Nomes de coluna e formato seguem EXATAMENTE os 2 arquivos de exemplo fornecidos
// pelo usuário (catalogo_tags_tecidos_10_08.xlsx / log_cron.xlsx), não o resumo em
// texto da conversa que os originou.

import ExcelJS from 'exceljs';

/**
 * Primeira letra de cada palavra maiúscula, resto minúsculo — só para EXIBIÇÃO/export
 * (ex: "alfaiataria" -> "Alfaiataria"). Nunca usado para comparação/filtro — o valor
 * canônico real (`fabricTagCanonical`) permanece como está em todo o resto do sistema.
 * @param {string} value
 * @returns {string}
 */
function titleCase(value) {
  return value
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word))
    .join(' ');
}

/**
 * Monta o workbook do export do Card "Tecido preenchido em tags" — mesmas colunas
 * do arquivo de exemplo do usuário: `ID_Nuvem | Nome | SKU | Estoque | Tag |
 * Grupo_De_Tecidos`. `Tag` é 'SIM'/'NÃO'; `Grupo_De_Tecidos` fica vazio quando
 * `hasTag` é falso (nunca um valor "adivinhado").
 * @param {{ rows: Array<{ productId: string, name: string|null, sku: string|null,
 *   stockTotal: number, hasTag: boolean, fabricTagCanonical: string|null }> }} detail
 * @returns {Promise<Buffer>}
 */
export async function buildFabricTagWorkbook({ rows }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Planilha1');
  sheet.columns = [
    { header: 'ID_Nuvem', key: 'idNuvem', width: 14 },
    { header: 'Nome', key: 'nome', width: 42 },
    { header: 'SKU', key: 'sku', width: 18 },
    { header: 'Estoque', key: 'estoque', width: 10 },
    { header: 'Tag', key: 'tag', width: 8 },
    { header: 'Grupo_De_Tecidos', key: 'grupoDeTecidos', width: 20 },
  ];

  for (const row of rows) {
    sheet.addRow({
      idNuvem: row.productId,
      nome: row.name ?? '',
      sku: row.sku ?? '',
      estoque: row.stockTotal,
      tag: row.hasTag ? 'SIM' : 'NÃO',
      grupoDeTecidos: row.hasTag && row.fabricTagCanonical ? titleCase(row.fabricTagCanonical) : '',
    });
  }

  return workbook.xlsx.writeBuffer();
}

/**
 * Monta o workbook do export do Card "Cron Diário" — mesmas colunas do arquivo de
 * exemplo do usuário: `Data | Hora | Status | Catalogo | Relacionados |
 * Daily_Recompute`. Células `null` (gap de dado documentado — dias sem run, ou
 * Daily_Recompute anterior a 2026-08-10) ficam em branco na planilha, nunca "0"
 * nem um valor inventado.
 * @param {{ rows: Array<{ date: string, time: string|null, status: string,
 *   catalog: number|null, related: number|null, dailyRecompute: string|null }> }} params
 * @returns {Promise<Buffer>}
 */
export async function buildCronLogWorkbook({ rows }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Planilha1');
  sheet.columns = [
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Hora', key: 'hora', width: 10 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Catalogo', key: 'catalogo', width: 10 },
    { header: 'Relacionados', key: 'relacionados', width: 14 },
    { header: 'Daily_Recompute', key: 'dailyRecompute', width: 16 },
  ];

  for (const row of rows) {
    sheet.addRow({
      data: row.date,
      hora: row.time ?? '',
      status: row.status,
      catalogo: row.catalog ?? '',
      relacionados: row.related ?? '',
      dailyRecompute: row.dailyRecompute ?? '',
    });
  }

  return workbook.xlsx.writeBuffer();
}
