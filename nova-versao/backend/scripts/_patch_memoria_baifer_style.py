"""Patch page.tsx Memória para layout Baifer com valores em branco se sem 5005."""
from __future__ import annotations

from pathlib import Path

PAGE = Path("page.tsx")  # overridden by argv in main()

NEW_BLOCK = r'''      {showBody && aba === "memoria" && (() => {
        const mem = d.memoriaCalculo as Record<string, number | string | undefined> | undefined;
        const hasMem = !!(mem && (mem.debitoOriginal != null || mem.icmsARecolher != null));
        const n = (v: unknown) => (hasMem && v != null && v !== "" ? Number(v) : null);
        const icmsVal = n(mem?.icmsARecolher);
        const icmsCredor = icmsVal != null && icmsVal < 0;
        const subvVal = n(mem?.ganhoReceitaSubvencao ?? d.subvencao);
        const debOrig = n(mem?.debitoOriginal);
        const credOrig = n(mem?.creditoOriginal);
        const deb5005 = n(mem?.debitos5005);
        const cred5005 = n(mem?.creditos5005);
        const debFora = n(mem?.debitoFora);
        const credFora = n(mem?.creditoFora);
        const outorg = n(mem?.creditoOutorgado);
        const totOrig = n(mem?.totalOriginal);
        const tot5005 = n(mem?.total5005);
        const totFora = n(mem?.totalFora);
        const toK = (v: number | null) => (v == null ? 0 : +(v / 1000).toFixed(1));
        const doughSlices = [
          { label: "Débitos 5005", valor: deb5005 },
          { label: "Créditos 5005", valor: cred5005 },
          { label: "Crédito fora", valor: credFora },
          { label: "Outorgado", valor: outorg },
        ].filter((s) => s.valor != null && Number(s.valor) > 0) as { label: string; valor: number }[];
        const chip5005 = hasMem ? (icmsCredor ? "Saldo credor" : "Importado") : "Sem dados";
        const chip5005Cls = hasMem ? (icmsCredor ? "gr" : "bl") : "gy";

        return (
          <>
            <div className="formula-box">
              {hasMem
                ? "Fonte: APURAÇÃO 5005 · ICMS a recolher alimenta a aba Impostos."
                : "Layout APURAÇÃO 5005 · sem planilha os valores ficam em branco."}
            </div>
            <div className="tax-grid">
              <div className="tax-card">
                <div className="tax-card-head">
                  <div className={`tax-name ${icmsCredor ? "t-success" : "t-accent"}`}>ICMS a recolher</div>
                  <span className={`chip ${chip5005Cls}`}>{chip5005}</span>
                </div>
                <div className={`tax-cur ${icmsCredor ? "t-success" : "t-accent"}`}>{moneyOrDash(icmsVal)}</div>
                <div className="tax-prev">Fonte APURAÇÃO 5005 · alimenta Impostos</div>
              </div>
              <div className="tax-card">
                <div className="tax-card-head">
                  <div className="tax-name t-success">Subvenção</div>
                  <span className={`chip ${hasMem ? "gr" : "gy"}`}>{hasMem ? "Importado" : "Sem dados"}</span>
                </div>
                <div className="tax-cur t-success">{moneyOrDash(subvVal)}</div>
                <div className="tax-prev">Ganho receita de subvenção</div>
              </div>
              <div className="tax-card">
                <div className="tax-card-head">
                  <div className="tax-name">Original</div>
                  <span className="chip gy">Bloco</span>
                </div>
                <div className="tax-cur">{moneyOrDash(totOrig)}</div>
                <div className="tax-prev">
                  Débito {moneyOrDash(debOrig)} · Crédito {moneyOrDash(credOrig)}
                </div>
              </div>
              <div className="tax-card">
                <div className="tax-card-head">
                  <div className="tax-name t-accent">Apuração 5005</div>
                  <span className="chip bl">Bloco</span>
                </div>
                <div className="tax-cur t-accent">{moneyOrDash(tot5005)}</div>
                <div className="tax-prev">
                  Débitos {moneyOrDash(deb5005)} · Créditos {moneyOrDash(cred5005)}
                </div>
              </div>
              <div className="tax-card">
                <div className="tax-card-head">
                  <div className="tax-name t-warning">Fora / Outorgado</div>
                  <span className="chip ye">Bloco</span>
                </div>
                <div className="tax-cur t-warning">{moneyOrDash(totFora)}</div>
                <div className="tax-prev">
                  Débito {moneyOrDash(debFora)} · Crédito {moneyOrDash(credFora)} · Outorgado {moneyOrDash(outorg)}
                </div>
              </div>
            </div>

            <div className="charts-row cr-2col">
              <div className="chart-card">
                <div className="chart-ttl">Débitos × Créditos por bloco</div>
                <div className="chart-sub">Valores da memória 5005 (R$ mil)</div>
                <div className="chart-wrap h260">
                  <Bar
                    data={{
                      labels: ["Original", "5005", "Fora"],
                      datasets: [
                        {
                          label: "Débitos",
                          data: [toK(debOrig), toK(deb5005), toK(debFora)],
                          backgroundColor: "rgba(239,68,68,0.7)",
                          borderRadius: 4,
                        },
                        {
                          label: "Créditos",
                          data: [toK(credOrig), toK(cred5005), toK((credFora ?? 0) + (outorg ?? 0))],
                          backgroundColor: "rgba(34,163,41,0.7)",
                          borderRadius: 4,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: "bottom" } },
                      scales: { y: { ticks: { callback: (v) => `R$ ${v}K` } } },
                    }}
                  />
                </div>
              </div>
              <div className="chart-card">
                <div className="chart-ttl">Composição da memória</div>
                <div className="chart-sub">Participação 5005 + fora / outorgado</div>
                <div className="chart-wrap h260">
                  <Doughnut
                    data={{
                      labels: doughSlices.length ? doughSlices.map((s) => s.label) : ["Sem dados"],
                      datasets: [{
                        data: doughSlices.length ? doughSlices.map((s) => s.valor) : [1],
                        backgroundColor: doughSlices.length ? PAL.slice(0, doughSlices.length) : ["#64748b"],
                        borderWidth: 0,
                      }],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      cutout: "60%",
                      plugins: { legend: { position: "right" } },
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="formula-box">Detalhe dos blocos (planilha APURAÇÃO 5005)</div>
            <div className="mem-grid mem-grid-3">
              <div className="mem-card">
                <div className="mem-card-head">Original</div>
                <div className="mem-row"><span className="lbl">Débito original</span><span className="val">{moneyOrDash(debOrig)}</span></div>
                <div className="mem-row"><span className="lbl">Crédito original</span><span className="val">{moneyOrDash(credOrig)}</span></div>
                <div className="mem-row tot"><span className="lbl">Total</span><span className="val">{moneyOrDash(totOrig)}</span></div>
              </div>
              <div className="mem-card">
                <div className="mem-card-head">Apuração 5005</div>
                <div className="mem-row"><span className="lbl">Débitos 5005</span><span className="val">{moneyOrDash(deb5005)}</span></div>
                <div className="mem-row"><span className="lbl">Créditos 5005</span><span className="val">{moneyOrDash(cred5005)}</span></div>
                <div className="mem-row tot"><span className="lbl">Total</span><span className="val">{moneyOrDash(tot5005)}</span></div>
              </div>
              <div className="mem-card">
                <div className="mem-card-head">Fora / Outorgado</div>
                <div className="mem-row"><span className="lbl">Débito fora</span><span className="val">{moneyOrDash(debFora)}</span></div>
                <div className="mem-row"><span className="lbl">Crédito fora</span><span className="val">{moneyOrDash(credFora)}</span></div>
                <div className="mem-row"><span className="lbl">Crédito outorgado</span><span className="val">{moneyOrDash(outorg)}</span></div>
                <div className="mem-row tot"><span className="lbl">Total</span><span className="val">{moneyOrDash(totFora)}</span></div>
              </div>
            </div>

            <div className="formula-box">Conferência movimento — Total Geral Excel × soma das NFs</div>
            <div className="mem-grid">
              <div className="mem-card">
                <div className="mem-card-head">Entradas</div>
                <div className="mem-row"><span className="lbl">Total Geral Excel</span><span className="val">{moneyOrDash(d.entradasMeta?.totalGeralExcel)}</span></div>
                <div className="mem-row"><span className="lbl">Soma NFs</span><span className="val">{moneyOrDash(d.entradasMeta?.soma)}</span></div>
                <div className={`mem-row ${Math.abs(d.entradasMeta?.delta || 0) >= 0.02 ? "neg" : "tot"}`}>
                  <span className="lbl">Δ</span>
                  <span className="val">{d.entradasMeta?.delta ?? "—"}</span>
                </div>
              </div>
              <div className="mem-card">
                <div className="mem-card-head">Saídas</div>
                <div className="mem-row"><span className="lbl">Total Geral Excel</span><span className="val">{moneyOrDash(d.saidasMeta?.totalGeralExcel)}</span></div>
                <div className="mem-row"><span className="lbl">Soma NFs</span><span className="val">{moneyOrDash(d.saidasMeta?.soma)}</span></div>
                <div className={`mem-row ${Math.abs(d.saidasMeta?.delta || 0) >= 0.02 ? "neg" : "tot"}`}>
                  <span className="lbl">Δ</span>
                  <span className="val">{d.saidasMeta?.delta ?? "—"}</span>
                </div>
              </div>
            </div>
          </>
        );
      })()}
'''


def main() -> int:
    import sys

    path = Path(sys.argv[1]) if len(sys.argv) > 1 else PAGE
    text = path.read_text(encoding="utf-8")

    text2 = text.replace(
        '  if (aba === "memoria") return "Sem metadados de conferência neste mês. Importe Entradas/Saídas.";',
        '  if (aba === "memoria") return "Memória no estilo APURAÇÃO 5005 — sem planilha os valores ficam em branco.";',
    )
    text2 = text2.replace(
        "  const showBody = !loading && !error && !(payload?.empty);",
        '  const showBody = !loading && !error && (!(payload?.empty) || aba === "impostos" || aba === "memoria");',
    )
    text2 = text2.replace(
        '{!loading && !error && payload?.empty && aba !== "impostos" ? (',
        '{!loading && !error && payload?.empty && aba !== "impostos" && aba !== "memoria" ? (',
    )

    start = text2.find('{showBody && aba === "memoria" && (() => {')
    if start < 0:
        raise SystemExit("memoria block start not found")
    # include leading spaces before {
    line_start = text2.rfind("\n", 0, start) + 1
    end_marker = '{showBody && aba === "recebimentos"'
    end = text2.find(end_marker, start)
    if end < 0:
        raise SystemExit("recebimentos marker not found")
    end_line = text2.rfind("\n", 0, end) + 1
    text3 = text2[:line_start] + NEW_BLOCK + "\n" + text2[end_line:]
    path.write_text(text3, encoding="utf-8")
    print("patched", path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
