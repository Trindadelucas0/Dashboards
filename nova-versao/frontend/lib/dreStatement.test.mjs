import assert from "node:assert/strict";
import test from "node:test";

import { collapseTrimestre, pivotDreMonths } from "./dreStatement.ts";

function month(linhas, kind = "exito") {
  return {
    competencia: "2026-07",
    label: "Jul/2026",
    hasDre: true,
    cmvPendente: false,
    dre: { kind, linhas },
  };
}

function accountingRows(rows) {
  return rows.filter((row) => row.kind !== "group");
}

test("DRE EXITO mantém subtotais e todos os detalhes na ordem da planilha", () => {
  const source = [
    { descricao: "(-) DESPESAS OPERACIONAIS", valor: -150, grupo: "despesas", nivel: "total" },
    { descricao: "DESPESAS ADMINISTRATIVAS", valor: -100, grupo: "total", nivel: "total" },
    { descricao: "SALÁRIOS E ORDENADOS", valor: -60, grupo: "linha", nivel: "detalhe" },
    { descricao: "INSS", valor: -40, grupo: "linha", nivel: "detalhe" },
    { descricao: "(-) CMV", valor: -200, grupo: "cmv", nivel: "total" },
    { descricao: "CUSTOS DAS MERCADORIAS VENDIDAS", valor: -200, grupo: "cmv", nivel: "detalhe" },
  ];

  const rows = accountingRows(pivotDreMonths([month(source)]));

  assert.deepEqual(rows.map((row) => row.display), source.map((line) => line.descricao));
  assert.equal(rows.find((row) => row.display === "DESPESAS ADMINISTRATIVAS")?.kind, "subtotal");
  assert.equal(rows.find((row) => row.display === "SALÁRIOS E ORDENADOS")?.group, "Despesas");
  assert.equal(rows.find((row) => row.display === "INSS")?.group, "Despesas");
  assert.ok(rows.some((row) => row.display === "(-) CMV"));
  assert.ok(rows.some((row) => row.display === "CUSTOS DAS MERCADORIAS VENDIDAS"));
});

test("packs EXITO antigos também exibem linhas genéricas sem exigir reimportação", () => {
  const rows = accountingRows(
    pivotDreMonths([
      month([
        { descricao: "DESPESAS ADMINISTRATIVAS", valor: -100, grupo: "total" },
        { descricao: "SALÁRIOS E ORDENADOS", valor: -60, grupo: "linha" },
        { descricao: "INSS", valor: -40, grupo: "linha" },
      ]),
    ]),
  );

  assert.deepEqual(rows.map((row) => row.display), [
    "DESPESAS ADMINISTRATIVAS",
    "SALÁRIOS E ORDENADOS",
    "INSS",
  ]);
  assert.equal(rows.find((row) => row.display === "SALÁRIOS E ORDENADOS")?.group, "Despesas");
  assert.equal(rows.find((row) => row.display === "INSS")?.group, "Despesas");
});

test("trimestre preserva o tipo EXITO e os rótulos originais", () => {
  const months = [
    month([
      { descricao: "DESPESAS ADMINISTRATIVAS", valor: -100, grupo: "total", nivel: "total" },
      { descricao: "SALÁRIOS E ORDENADOS", valor: -60, grupo: "linha", nivel: "detalhe" },
    ]),
    {
      ...month([
        { descricao: "DESPESAS ADMINISTRATIVAS", valor: -80, grupo: "total", nivel: "total" },
        { descricao: "SALÁRIOS E ORDENADOS", valor: -50, grupo: "linha", nivel: "detalhe" },
      ]),
      competencia: "2026-08",
      label: "Ago/2026",
    },
  ];

  const collapsed = collapseTrimestre(months, "q3-2026");
  const rows = accountingRows(pivotDreMonths(collapsed));

  assert.equal(collapsed[0].dre.kind, "exito");
  assert.deepEqual(rows.map((row) => row.display), [
    "DESPESAS ADMINISTRATIVAS",
    "SALÁRIOS E ORDENADOS",
  ]);
  assert.equal(rows[1].valores["q3-2026"], -110);
});
