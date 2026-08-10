// Testes de src/api/admin-export.js — geração dos workbooks Excel do Painel
// Administrativo. Valida por round-trip: gera o Buffer, lê de volta com o próprio
// exceljs, confirma cabeçalhos e valores exatos (nomes de coluna batendo com os
// arquivos de exemplo do usuário, não o resumo em texto).

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildFabricTagWorkbook, buildCronLogWorkbook } from './admin-export.js';

async function readBackFirstSheet(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    rows.push(row.values.slice(1)); // exceljs usa índice 1-based, [0] é sempre undefined
  });
  return rows;
}

describe('buildFabricTagWorkbook', () => {
  it('gera cabeçalho e linhas exatas, Tag SIM/NÃO e Grupo_De_Tecidos capitalizado', async () => {
    const buffer = await buildFabricTagWorkbook({
      rows: [
        { productId: '337925823', name: 'Vestido Marta Em Malha Marrom', sku: '6051704201', stockTotal: 19, hasTag: true, fabricTagCanonical: 'malha' },
        { productId: '349353893', name: 'Blusa Pâmela Off White', sku: '9032900201', stockTotal: 62, hasTag: false, fabricTagCanonical: null },
      ],
    });

    const rows = await readBackFirstSheet(buffer);
    expect(rows[0]).toEqual(['ID_Nuvem', 'Nome', 'SKU', 'Estoque', 'Tag', 'Grupo_De_Tecidos']);
    expect(rows[1]).toEqual(['337925823', 'Vestido Marta Em Malha Marrom', '6051704201', 19, 'SIM', 'Malha']);
    expect(rows[2]).toEqual(['349353893', 'Blusa Pâmela Off White', '9032900201', 62, 'NÃO', '']);
  });

  it('sku/nome nulos viram string vazia, nunca "null" literal', async () => {
    const buffer = await buildFabricTagWorkbook({
      rows: [{ productId: '1', name: null, sku: null, stockTotal: 0, hasTag: false, fabricTagCanonical: null }],
    });
    const rows = await readBackFirstSheet(buffer);
    expect(rows[1]).toEqual(['1', '', '', 0, 'NÃO', '']);
  });

  it('rows vazio gera só o cabeçalho, sem lançar', async () => {
    const buffer = await buildFabricTagWorkbook({ rows: [] });
    const rows = await readBackFirstSheet(buffer);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(['ID_Nuvem', 'Nome', 'SKU', 'Estoque', 'Tag', 'Grupo_De_Tecidos']);
  });
});

describe('buildCronLogWorkbook', () => {
  it('gera cabeçalho e linhas exatas, campos null viram célula vazia', async () => {
    const buffer = await buildCronLogWorkbook({
      rows: [
        { date: '2026-08-10', time: '04:14', status: 'ATUALIZADO', catalog: 3022, related: 1017, dailyRecompute: 'OK' },
        { date: '2026-08-11', time: null, status: 'NÃO ATUALIZADO', catalog: null, related: null, dailyRecompute: 'ERROR' },
      ],
    });

    const rows = await readBackFirstSheet(buffer);
    expect(rows[0]).toEqual(['Data', 'Hora', 'Status', 'Catalogo', 'Relacionados', 'Daily_Recompute']);
    expect(rows[1]).toEqual(['2026-08-10', '04:14', 'ATUALIZADO', 3022, 1017, 'OK']);
    expect(rows[2]).toEqual(['2026-08-11', '', 'NÃO ATUALIZADO', '', '', 'ERROR']);
  });

  it('dailyRecompute null (gap de dado anterior a 2026-08-10) vira célula vazia, não "null"', async () => {
    const buffer = await buildCronLogWorkbook({
      rows: [{ date: '2026-07-17', time: '09:09', status: 'ATUALIZADO', catalog: 672, related: 0, dailyRecompute: null }],
    });
    const rows = await readBackFirstSheet(buffer);
    expect(rows[1]).toEqual(['2026-07-17', '09:09', 'ATUALIZADO', 672, 0, '']);
  });

  it('rows vazio gera só o cabeçalho, sem lançar', async () => {
    const buffer = await buildCronLogWorkbook({ rows: [] });
    const rows = await readBackFirstSheet(buffer);
    expect(rows).toHaveLength(1);
  });
});
