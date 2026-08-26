from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.companies import ALL_TABS, COMPANY_BY_ID, only_digits, slugify
from app.db import get_db
from app.deps import allowed_company_ids, current_user, require_admin, require_company, tabs_for_user
from app.extract.cfop import aggregate_macro, cfop_meta, top_grupos
from app.models import Company, CompanyCnpj, FiscalMonth, User, UserCompany

router = APIRouter(prefix="/api/companies", tags=["companies"])

TAB_KEYS = (
    "visao-geral",
    "compras",
    "finalidade",
    "vendas",
    "impostos",
    "memoria",
    "recebimentos",
    "balancete",
    "dre",
    "indicadores",
)


class CompanyCreateIn(BaseModel):
    label: str = Field(min_length=2, max_length=120)
    cnpj: str = Field(min_length=11, max_length=18)
    razao: str = ""
    description: str = ""
    theme: str = "green"
    extra_cnpjs: str = ""


def _unique_id(db: Session, label: str) -> str:
    base = slugify(label)
    candidate = base
    n = 2
    while db.query(Company).filter(Company.id == candidate).first():
        candidate = f"{base}-{n}"[:40]
        n += 1
    return candidate


def _month_label(comp: str) -> str:
    months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    try:
        mm = int(comp.split("-")[1])
        return f"{months[mm - 1]}/{comp[:4]}"
    except Exception:  # noqa: BLE001
        return comp


def _month_short(comp: str) -> str:
    months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    try:
        mm = int(str(comp).split("-")[1])
        return months[mm - 1]
    except Exception:  # noqa: BLE001
        return str(comp)


def _vendas_val(pack: dict | None) -> float:
    p = pack or {}
    return float(p.get("cfopSaidasTotal") or p.get("receitaBruta") or 0)


def variacao_vendas_mom(competencia: str, months: list) -> dict:
    """Compara saídas do mês atual com o mês anterior na mesma unidade."""
    comps = [m.competencia for m in months]
    try:
        idx = comps.index(competencia)
    except ValueError:
        return {"pct": None, "label": "vs mês anterior"}
    if idx <= 0:
        return {"pct": None, "label": "vs mês anterior"}
    curr = _vendas_val(getattr(months[idx], "pack", None))
    prev = _vendas_val(getattr(months[idx - 1], "pack", None))
    if not prev:
        return {"pct": None, "label": f"vs {_month_short(months[idx - 1].competencia)}"}
    pct = round(100 * (curr - prev) / prev, 1)
    return {"pct": pct, "label": f"vs {_month_short(months[idx - 1].competencia)}"}


@router.get("")
def list_companies(user: User = Depends(current_user), db: Session = Depends(get_db)):
    ids = allowed_company_ids(user, db)
    rows = db.query(Company).filter(Company.id.in_(ids)).all() if ids else []
    out = []
    for row in rows:
        reg = COMPANY_BY_ID.get(row.id)
        out.append(
            {
                "id": row.id,
                "label": row.label,
                "theme": row.theme,
                "cnpj": row.cnpj,
                "tabs": tabs_for_user(row.tabs or (list(reg.tabs) if reg else []), user),
                "desc": (getattr(row, "description", None) or {
                    "egaplast": "Artefatos e comércio de plásticos",
                    "baifer": "Distribuidora de ferramentas",
                }.get(row.id, row.label)),
            }
        )
    order = [c.id for c in COMPANY_BY_ID.values()]
    out.sort(key=lambda x: order.index(x["id"]) if x["id"] in order else 99)
    return out


@router.post("")
def create_company(
    body: CompanyCreateIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    digits = only_digits(body.cnpj)
    if len(digits) != 14:
        raise HTTPException(400, "CNPJ deve ter 14 dígitos")
    theme = body.theme if body.theme in ("green", "blue") else "green"
    if db.query(Company).filter(Company.cnpj == digits).first():
        raise HTTPException(409, "Já existe empresa com este CNPJ")
    if db.query(CompanyCnpj).filter(CompanyCnpj.cnpj == digits).first():
        raise HTTPException(409, "Este CNPJ já está ligado a outra empresa")
    extras: list[str] = []
    for raw in re.split(r"[\s,;]+", body.extra_cnpjs or ""):
        extra = only_digits(raw)
        if not extra:
            continue
        if len(extra) != 14:
            raise HTTPException(400, f"CNPJ extra inválido: {raw}")
        if extra == digits or extra in extras:
            continue
        extras.append(extra)
        if db.query(Company).filter(Company.cnpj == extra).first():
            raise HTTPException(409, f"CNPJ extra {extra} já pertence a outra empresa")
        if db.query(CompanyCnpj).filter(CompanyCnpj.cnpj == extra).first():
            raise HTTPException(409, f"CNPJ extra {extra} já está ligado a outra empresa")
    company_id = _unique_id(db, body.label)
    razao = (body.razao or body.label).strip()
    name_re = re.escape(razao)[:80]
    row = Company(
        id=company_id,
        label=body.label.strip(),
        theme=theme,
        cnpj=digits,
        tabs=list(ALL_TABS),
        name_re=name_re,
        description=(body.description or "").strip()[:255],
    )
    db.add(row)
    db.flush()
    db.add(CompanyCnpj(company_id=company_id, cnpj=digits, unidade="matriz", label="Matriz"))
    for idx, extra in enumerate(extras, start=1):
        db.add(
            CompanyCnpj(
                company_id=company_id,
                cnpj=extra,
                unidade=f"filial-{idx}",
                label=f"Filial {idx}",
            )
        )
    db.add(UserCompany(user_id=user.id, company_id=company_id))
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "label": row.label,
        "theme": row.theme,
        "cnpj": row.cnpj,
        "tabs": row.tabs,
        "desc": row.description or row.label,
    }


@router.get("/{company_id}")
def company_detail(
    company_id: str,
    unidade: str | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require_company(company_id, user, db)
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(404, "Empresa não encontrada")
    q = db.query(FiscalMonth).filter(FiscalMonth.company_id == company_id)
    if unidade:
        q = q.filter(FiscalMonth.unidade == unidade)
    months = q.order_by(FiscalMonth.competencia).all()
    units = sorted({m.unidade for m in months}) or ["matriz"]
    return {
        "id": company.id,
        "label": company.label,
        "theme": company.theme,
        "cnpj": company.cnpj,
        "tabs": tabs_for_user(company.tabs, user),
        "units": units,
        "months": [
            {
                "competencia": m.competencia,
                "label": _month_label(m.competencia),
                "unidade": m.unidade,
                "hasMovimentacao": bool((m.pack or {}).get("hasMovimentacao")),
                "hasDre": bool((m.pack or {}).get("hasDre")),
            }
            for m in months
        ],
    }


def _uf_list(by_uf: dict, total: float) -> list[dict]:
    items = [
        {"uf": str(k), "total": float(v or 0), "pct": round(100 * float(v or 0) / total, 1) if total else 0}
        for k, v in (by_uf or {}).items()
    ]
    items.sort(key=lambda x: x["total"], reverse=True)
    return items


def _uf_from_parties(parties: list[dict], total: float) -> list[dict]:
    by_uf: dict[str, float] = {}
    for p in parties or []:
        uf = str(p.get("uf") or "—").strip() or "—"
        by_uf[uf] = by_uf.get(uf, 0.0) + float(p.get("total") or 0)
    return _uf_list(by_uf, total)


def _enrich_fiscal(pack: dict) -> dict:
    """Completa deduções/composição a partir de apuração quando o pack não trouxe DRE."""
    from app.extract.parse_impostos import composicao_from_apuracao, deducoes_from_apuracao

    pack = dict(pack or {})
    ap = pack.get("apuracao")
    if ap:
        # sempre recalcula — import parcial (IPI, PIS, ST…) atualiza só uma chave
        pack["composicao"] = composicao_from_apuracao(ap)
        pack["deducoes"] = deducoes_from_apuracao(ap)
    rb = float(pack.get("receitaBruta") or pack.get("cfopSaidasTotal") or 0)
    if pack.get("deducoes") is not None and rb:
        pack["dedPct"] = round(100 * float(pack["deducoes"]) / rb, 2)
    return pack


def _is_empty(tab: str, pack: dict, row) -> bool:
    if row is None:
        return True
    pack = pack or {}
    if tab == "dre":
        return not (pack.get("hasDre") or pack.get("dre"))
    if tab == "impostos":
        return not (pack.get("apuracao") or pack.get("impostos"))
    if tab == "balancete":
        return not pack.get("balancete")
    if tab == "memoria":
        return not (pack.get("entradasMeta") or pack.get("saidasMeta") or pack.get("apuracao"))
    if tab == "importar":
        return False
    return not pack.get("hasMovimentacao")


def _icms_kpi(apuracao: dict | None) -> dict | None:
    if not apuracao or not isinstance(apuracao.get("icms"), dict):
        return None
    raw = apuracao["icms"].get("aRecolher")
    if raw is None:
        return None
    v = float(raw)
    if v < 0:
        return {"val": abs(v), "lbl": "Crédito ICMS", "color": "green", "sub": "Saldo credor no período"}
    return {"val": v, "lbl": "ICMS a Recolher", "color": "purple", "sub": ""}


def _pis_cofins_recolher(apuracao: dict | None) -> float | None:
    if not apuracao:
        return None
    pis = apuracao.get("pis") or {}
    cofins = apuracao.get("cofins") or {}
    if not isinstance(pis, dict) and not isinstance(cofins, dict):
        return None
    if "aRecolher" not in pis and "aRecolher" not in cofins:
        return None
    return float(pis.get("aRecolher") or 0) + float(cofins.get("aRecolher") or 0)


def _slice(tab: str, pack: dict) -> dict:
    pack = _enrich_fiscal(pack or {})
    compras = float(pack.get("totalCompras") or 0)
    vendas = float(pack.get("cfopSaidasTotal") or 0)
    if not vendas:
        vendas = float(pack.get("receitaBruta") or 0)
    receita = float(pack.get("receitaBruta") or 0) or vendas
    if tab == "visao-geral":
        ap = pack.get("apuracao")
        return {
            "totalCompras": compras,
            "cfopSaidasTotal": vendas,
            "receitaBruta": receita,
            "saldoOperacional": round(vendas - compras, 2),
            "pisCofinsRecolher": _pis_cofins_recolher(ap),
            "icmsKpi": _icms_kpi(ap),
            "nfsEntradas": pack.get("nfsEntradas") or 0,
            "nfsSaidas": pack.get("nfsSaidas") or 0,
            "hasDre": pack.get("hasDre") or False,
            "hasMovimentacao": pack.get("hasMovimentacao") or False,
            "apuracao": ap,
            "dre": pack.get("dre"),
            "deducoes": pack.get("deducoes"),
            "dedPct": pack.get("dedPct"),
            "composicao": pack.get("composicao") or [],
            "subvencao": (ap or {}).get("subvencao") if ap else pack.get("subvencao"),
            "ufEntradas": _uf_list(pack.get("porUf") or {}, compras) or _uf_from_parties(pack.get("fornecedores") or [], compras),
            "ufSaidas": _uf_list(pack.get("porUfSaidas") or {}, vendas) or _uf_from_parties(pack.get("clientes") or pack.get("clientesTop10") or [], vendas),
        }
    if tab == "compras":
        fornecedores = pack.get("fornecedores") or []
        cfops = sorted(
            pack.get("cfopDados") or [],
            key=lambda c: float(c.get("total") or 0),
            reverse=True,
        )
        top_forn = fornecedores[0] if fornecedores else None
        conc = None
        if top_forn and compras:
            conc = round(100 * float(top_forn.get("total") or 0) / compras, 1)
        return {
            "totalCompras": compras,
            "nfsEntradas": pack.get("nfsEntradas") or 0,
            "fornecedores": fornecedores,
            "cfopDados": cfops,
            "concentracaoTopFornecedor": conc,
            "ufEntradas": _uf_list(pack.get("porUf") or {}, compras) or _uf_from_parties(fornecedores, compras),
            "meta": pack.get("entradasMeta"),
        }
    if tab == "finalidade":
        cfops = pack.get("cfopDados") or []
        enriched = [{**c, **cfop_meta(str(c.get("cfop") or ""))} for c in cfops]
        return {
            "totalCompras": compras,
            "nfsEntradas": pack.get("nfsEntradas") or 0,
            "cfopDados": enriched,
            "macro": aggregate_macro(cfops),
            "topGrupos": top_grupos(enriched, 4),
        }
    if tab == "vendas":
        clientes = pack.get("clientes") or pack.get("clientesTop10") or []
        top10 = pack.get("clientesTop10") or clientes[:10]
        demais = pack.get("demaisClientes")
        if demais is None:
            demais = round(vendas - sum(float(c.get("total") or 0) for c in top10), 2)
        cfops = pack.get("cfopSaidas") or []
        enriched = [{**c, **cfop_meta(str(c.get("cfop") or ""))} for c in cfops]
        nfs = int(pack.get("nfsSaidas") or 0)
        ticket = round(vendas / nfs, 2) if nfs > 0 else None
        return {
            "cfopSaidasTotal": vendas,
            "receitaBruta": receita,
            "nfsSaidas": nfs,
            "ticketMedio": ticket,
            "cfopSaidas": enriched,
            "clientes": clientes,
            "clientesTop10": top10,
            "demaisClientes": demais,
            "ufSaidas": _uf_list(pack.get("porUfSaidas") or {}, vendas) or _uf_from_parties(clientes, vendas),
            "meta": pack.get("saidasMeta"),
        }
    if tab == "dre":
        return {
            "hasDre": pack.get("hasDre") or False,
            "dre": pack.get("dre"),
            "receitaBruta": pack.get("receitaBruta") or vendas,
            "totalCompras": compras,
            "lucBruto": pack.get("lucBruto"),
            "lucLiq": pack.get("lucLiq"),
            "margMb": pack.get("margMb"),
            "margMl": pack.get("margMl"),
            "cmv": pack.get("cmv"),
        }
    if tab == "impostos":
        return {
            "impostos": pack.get("impostos"),
            "apuracao": pack.get("apuracao"),
            "receitaBruta": vendas,
            "composicao": pack.get("composicao") or [],
            "deducoes": pack.get("deducoes"),
            "dedPct": pack.get("dedPct"),
        }
    if tab == "memoria":
        return {
            "entradasMeta": pack.get("entradasMeta"),
            "saidasMeta": pack.get("saidasMeta"),
            "apuracao": pack.get("apuracao"),
        }
    if tab == "recebimentos":
        return {"receitaBruta": vendas, "totalCompras": compras}
    if tab == "balancete":
        return {"balancete": pack.get("balancete")}
    if tab == "indicadores":
        margem = pack.get("margMb")
        if margem is None and vendas:
            margem = round(100 * (vendas - compras) / vendas, 2)
        return {
            "receitaBruta": vendas,
            "totalCompras": compras,
            "margemBruta": (vendas - compras) / vendas if vendas else None,
            "margMb": margem,
            "margMl": pack.get("margMl"),
            "dedPct": pack.get("dedPct"),
            "nfsEntradas": pack.get("nfsEntradas") or 0,
            "nfsSaidas": pack.get("nfsSaidas") or 0,
            "hasDre": pack.get("hasDre") or False,
        }
    return pack


@router.get("/{company_id}/months/{competencia}/{tab}")
def tab_payload(
    company_id: str,
    competencia: str,
    tab: str,
    unidade: str = "matriz",
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    require_company(company_id, user, db)
    if tab not in TAB_KEYS:
        raise HTTPException(400, "Aba inválida")
    row = (
        db.query(FiscalMonth)
        .filter(
            FiscalMonth.company_id == company_id,
            FiscalMonth.competencia == competencia,
            FiscalMonth.unidade == unidade,
        )
        .first()
    )
    pack = row.pack if row else {}
    data = _slice(tab, pack)
    months = (
        db.query(FiscalMonth)
        .filter(FiscalMonth.company_id == company_id, FiscalMonth.unidade == unidade)
        .order_by(FiscalMonth.competencia)
        .all()
    )
    if tab in ("visao-geral", "recebimentos", "impostos", "indicadores"):
        labels = [_month_label(m.competencia) for m in months]
        compras_s = [float((m.pack or {}).get("totalCompras") or 0) for m in months]
        vendas_s = [
            float((m.pack or {}).get("cfopSaidasTotal") or (m.pack or {}).get("receitaBruta") or 0) for m in months
        ]
        ded_s = []
        ded_pct_s = []
        for m in months:
            ep = _enrich_fiscal(m.pack or {})
            ded_s.append(ep.get("deducoes"))
            ded_pct_s.append(ep.get("dedPct"))
        data["serie"] = {
            "labels": labels,
            "compras": compras_s,
            "vendas": vendas_s,
            "deducoes": ded_s,
            "dedPct": ded_pct_s,
        }
    if tab == "vendas":
        data["variacaoVendas"] = variacao_vendas_mom(competencia, months)
    return {
        "companyId": company_id,
        "competencia": competencia,
        "unidade": unidade,
        "tab": tab,
        "empty": _is_empty(tab, pack or {}, row),
        "data": data,
    }
