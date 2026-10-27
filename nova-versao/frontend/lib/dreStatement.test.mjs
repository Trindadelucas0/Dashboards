import assert from "node:assert/strict";
import test from "node:test";

import {
  allDreExpandedKeys,
  buildDreTreeRows,
  collapseTrimestre,
  compactDreExpandedKeys,
  pivotDreMonths,
  visibleDreTreeRows,
} from "./dreStatement.ts";

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
  assert.equal(rows.find((row) => row.display === "DESPESAS ADMINISTRATIVAS")?.kind, "subtotal");
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

test("árvore abre grupos, mantém subtotais fechados e preserva resultados finais", () => {
  const pivoted = pivotDreMonths([
    month([
      { descricao: "(-) DESPESAS OPERACIONAIS", valor: -150, grupo: "despesas", nivel: "total" },
      { descricao: "DESPESAS ADMINISTRATIVAS", valor: -100, grupo: "total", nivel: "total" },
      { descricao: "SALÁRIOS E ORDENADOS", valor: -60, grupo: "linha", nivel: "detalhe" },
      { descricao: "INSS", valor: -40, grupo: "linha", nivel: "detalhe" },
      { descricao: "= LUCRO OU PREJUÍZO OPERACIONAL", valor: 50, grupo: "total", nivel: "total" },
    ]),
  ]);
  const tree = buildDreTreeRows(pivoted);
  const compact = compactDreExpandedKeys(tree);
  const visibleCompact = visibleDreTreeRows(tree, compact).map((node) => node.row.display);

  const admin = tree.find((node) => node.row.display === "DESPESAS ADMINISTRATIVAS");
  const salarios = tree.find((node) => node.row.display === "SALÁRIOS E ORDENADOS");
  const resultado = tree.find((node) => node.row.display === "= LUCRO OU PREJUÍZO OPERACIONAL");

  assert.equal(admin?.depth, 1);
  assert.equal(salarios?.depth, 2);
  assert.equal(salarios?.parentKey, admin?.row.key);
  assert.equal(resultado?.parentKey, null);
  assert.ok(visibleCompact.includes("DESPESAS ADMINISTRATIVAS"));
  assert.ok(!visibleCompact.includes("SALÁRIOS E ORDENADOS"));
  assert.ok(visibleCompact.includes("= LUCRO OU PREJUÍZO OPERACIONAL"));

  const expanded = new Set(compact);
  expanded.add(admin.row.key);
  const visibleOpen = visibleDreTreeRows(tree, expanded).map((node) => node.row.display);
  assert.ok(visibleOpen.includes("SALÁRIOS E ORDENADOS"));
  assert.ok(visibleOpen.includes("INSS"));

  const allVisible = visibleDreTreeRows(tree, allDreExpandedKeys(tree));
  assert.equal(allVisible.length, tree.length);
});

test("lucro e prejuízo do exercício viram uma linha só e netam no trimestre", () => {
  const mes = (competencia, label, descricao, valor) => ({
    competencia,
    label,
    hasDre: true,
    cmvPendente: false,
    dre: {
      kind: "exito",
      linhas: [
        { descricao: "= LUCRO OU PREJUÍZO LÍQUIDO DO EXERCÍCIO", valor, grupo: "resultado" },
        { descricao, valor, grupo: "resultado" },
      ],
    },
  });
  const meses = [
    mes("2026-07", "Jul/2026", "LUCRO LÍQUIDO DO EXERCÍCIO", 34940),
    mes("2026-08", "Ago/2026", "LUCRO LÍQUIDO DO EXERCÍCIO", 305265),
    mes("2026-09", "Set/2026", "PREJUÍZO DO EXERCÍCIO", -111953),
  ];

  const rows = pivotDreMonths(meses);
  const resultado = rows.filter((r) => r.kind === "lucro" && !r.display.includes("OU"));
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0].acumulado, 228252);
  assert.equal(resultado[0].display, "LUCRO LÍQUIDO DO EXERCÍCIO");
  assert.equal(resultado[0].valores["2026-09"], -111953);

  const [tri] = collapseTrimestre(meses, "q3-2026");
  const triRows = pivotDreMonths([tri]).filter((r) => r.kind === "lucro" && !r.display.includes("OU"));
  assert.equal(triRows.length, 1);
  assert.equal(triRows[0].valores["q3-2026"], 228252);
});
