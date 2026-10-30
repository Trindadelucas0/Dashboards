import assert from "node:assert/strict";
import test from "node:test";

import { consolidateNfeLines } from "./nfeExportRows.ts";

test("consolida a mesma nota e CFOP preservando o valor", () => {
  const rows = consolidateNfeLines([
    { competencia: "2026-09", unidade: "matriz", nota: "101", serie: "1", cfop: "1-102", nome: "Fornecedor A", doc: "123", uf: "GO", valor: 10.1 },
    { competencia: "2026-09", unidade: "matriz", nota: "101", serie: "1", cfop: "1-102", nome: "Fornecedor A", doc: "123", uf: "GO", valor: 20.2 },
  ], "2026-09", "matriz");

  assert.equal(rows.length, 1);
  assert.equal(rows[0].nota, "101");
  assert.equal(rows[0].valor, 30.3);
});

test("mantém a nota uma vez por CFOP e preenche campos ausentes", () => {
  const rows = consolidateNfeLines([
    { nota: "101", cfop: "1-102", valor: 10 },
    { nota: "101", cfop: "1-556", valor: 20 },
    { nota: "", serie: "", cfop: "1-102", valor: 5 },
  ], "2026-09", "filial");

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.cfop), ["1-102", "1-556", "1-102"]);
  assert.equal(rows[2].nota, "—");
  assert.equal(rows[2].serie, "—");
  assert.equal(rows[2].competencia, "2026-09");
  assert.equal(rows[2].unidade, "filial");
  assert.equal(rows.reduce((sum, row) => sum + row.valor, 0), 35);
});
