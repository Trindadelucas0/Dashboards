from __future__ import annotations

import re
import unicodedata

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


def _trimestre_id(competencia: str) -> tuple[str, int, str]:
    """Retorna (qid, quarter 1-4, year) a partir de YYYY-MM."""
    try:
        year, mm = competencia.split("-")[0], int(competencia.split("-")[1])
        q = (mm - 1) // 3 + 1
        return f"q{q}", q, year
    except Exception:  # noqa: BLE001
        return "q1", 1, competencia[:4] if competencia else ""


def _trimestre_meses(competencia: str) -> list[str]:
    """Lista das 3 competências do trimestre civil da competência."""
    qid, q, year = _trimestre_id(competencia)
    if not year:
        return []
    start = (q - 1) * 3 + 1
    return [f"{year}-{m:02d}" for m in range(start, start + 3)]


def _trimestre_label(competencia: str) -> str:
    _, q, year = _trimestre_id(competencia)
    return f"{q}º Trimestre {year}" if year else f"{q}º Trimestre"


def is_trimestre_key(key: str) -> bool:
    """True para chaves tipo q1-2026."""
    return bool(re.fullmatch(r"q[1-4]-\d{4}", str(key or "").strip().lower()))


def parse_period_key(key: str) -> tuple[str, str | None]:
    """
    Retorna ('month', 'YYYY-MM') ou ('trimestre', 'qN-YYYY').
    Aceita competência mensal ou chave de trimestre.
    """
    raw = str(key or "").strip().lower()
    if is_trimestre_key(raw):
        return "trimestre", raw
    if re.fullmatch(r"\d{4}-\d{2}", raw):
        return "month", raw
    return "month", raw or None


def year_from_period(competencia: str) -> str:
    """Ano civil da competência mensal (YYYY-MM) ou do trimestre (q1-2026)."""
    kind, key = parse_period_key(competencia)
    if kind == "trimestre" and key:
        return key.split("-")[-1]
    raw = str(key or competencia or "")
    match = re.match(r"(\d{4})", raw)
    return match.group(1) if match else ""


def _fold_dre_label(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text or "")
    folded = "".join(ch for ch in nfkd if not unicodedata.combining(ch)).lower().strip()
    folded = re.sub(r"^[\(\)=\+\-\/\s–—−-]+", "", folded)
    return re.sub(r"\s+", " ", folded)


def _is_cmv_line(linha: dict) -> bool:
    if str(linha.get("grupo") or "").lower() == "cmv":
        return True
    key = _fold_dre_label(str(linha.get("descricao") or ""))
    return (
        key == "cmv"
        or "custo das mercadorias" in key
        or "custos das mercadorias" in key
        or "custo da mercadoria" in key
    )


def cmv_pendente(pack: dict | None) -> bool:
    """True se a DRE do mês existe e a linha CMV está sem valor numérico (não trata 0 como pendente)."""
    pack = pack or {}
    dre = pack.get("dre") if isinstance(pack.get("dre"), dict) else {}
    if not (pack.get("hasDre") or dre):
        return False
    if pack.get("cmv") is not None:
        return False
    if dre.get("cmv") is not None:
        return False
    found = False
    for ln in dre.get("linhas") or []:
        if not isinstance(ln, dict) or not _is_cmv_line(ln):
            continue
        found = True
        if ln.get("valor") is not None:
            return False
    return found


def dre_period_label(competencias: list[str]) -> str:
    if not competencias:
        return ""
    year = str(competencias[0])[:4]
    shorts = [_month_short(c) for c in competencias]
    if len(shorts) == 1:
        return f"{shorts[0]} / {year}"
    return f"{shorts[0]} a {shorts[-1]} / {year}"


def dre_media_acumulado(valores: list[float | None]) -> dict[str, float | None]:
    """Média e soma só dos meses com número; null/None ficam de fora."""
    nums = [float(v) for v in valores if v is not None]
    if not nums:
        return {"media": None, "acumulado": None}
    return {
        "media": round(sum(nums) / len(nums), 2),
        "acumulado": round(sum(nums), 2),
    }


def build_dre_por_mes(months: list, year: str) -> list[dict]:
    """Meses do ano com DRE oficial, em ordem cronológica."""
    out: list[dict] = []
    if not year:
        return out
    for row in months or []:
        comp = str(getattr(row, "competencia", "") or "")
        if not comp.startswith(year):
            continue
        pack = getattr(row, "pack", None) or {}
        dre = pack.get("dre") if isinstance(pack.get("dre"), dict) else {}
        if not (pack.get("hasDre") or dre):
            continue
        sliced = _slice("dre", pack)
        out.append(
            {
                "competencia": comp,
                "label": _month_label(comp),
                "hasDre": True,
                "cmvPendente": cmv_pendente(pack),
                "receitaBruta": sliced.get("receitaBruta"),
                "cmv": sliced.get("cmv"),
                "lucBruto": sliced.get("lucBruto"),
                "lucLiq": sliced.get("lucLiq"),
                "margMb": sliced.get("margMb"),
                "margMl": sliced.get("margMl"),
                "dre": dre,
                "source": dre.get("source"),
            }
        )
    return out


def _meses_from_trimestre_key(key: str) -> list[str]:
    """q1-2026 → ['2026-01','2026-02','2026-03']."""
    raw = str(key or "").strip().lower()
    m = re.fullmatch(r"q([1-4])-(\d{4})", raw)
    if not m:
        return []
    q, year = int(m.group(1)), m.group(2)
    start = (q - 1) * 3 + 1
    return [f"{year}-{mm:02d}" for mm in range(start, start + 3)]


def trimestre_key_from_competencia(competencia: str) -> str:
    qid, _, year = _trimestre_id(competencia)
    return f"{qid}-{year}" if year else qid


def _merge_party_lists(packs: list[dict], field: str) -> list[dict]:
    by_key: dict[str, dict] = {}
    for p in packs:
        for item in p.get(field) or []:
            nome = str(item.get("nome") or "—")
            uf = str(item.get("uf") or "—")
            cnpj = str(item.get("cnpj") or "")
            k = f"{cnpj}|{nome}|{uf}"
            row = by_key.setdefault(
                k,
                {"nome": nome, "cnpj": cnpj, "uf": uf, "total": 0.0, "qtd": 0},
            )
            row["total"] = round(float(row["total"]) + float(item.get("total") or 0), 2)
            row["qtd"] = int(row["qtd"]) + int(item.get("qtd") or 0)
    out = list(by_key.values())
    out.sort(key=lambda x: x["total"], reverse=True)
    return out


def _merge_cfop_lists(packs: list[dict], field: str) -> list[dict]:
    by_cfop: dict[str, dict] = {}
    party_field = "fornecedores" if field in ("cfopDados", "cfopEntradas") else None
    for p in packs:
        for item in p.get(field) or []:
            cfop = str(item.get("cfop") or "—")
            row = by_cfop.setdefault(
                cfop,
                {
                    "cfop": cfop,
                    "total": 0.0,
                    "qtd": 0,
                    "descricao": item.get("descricao"),
                    "finalidade": item.get("finalidade"),
                    "creditoPisCofins": item.get("creditoPisCofins"),
                    **({party_field: {}} if party_field else {}),
                },
            )
            row["total"] = round(float(row["total"]) + float(item.get("total") or 0), 2)
            row["qtd"] = int(row["qtd"]) + int(item.get("qtd") or 0)
            if not row.get("descricao") and item.get("descricao"):
                row["descricao"] = item.get("descricao")
            if party_field:
                parties = row[party_field]
                for f in item.get(party_field) or item.get("fornecedores") or []:
                    pk = f"{f.get('cnpj')}|{f.get('nome')}|{f.get('uf')}"
                    pr = parties.setdefault(
                        pk,
                        {
                            "nome": f.get("nome"),
                            "cnpj": f.get("cnpj") or "",
                            "uf": f.get("uf") or "—",
                            "total": 0.0,
                            "qtd": 0,
                        },
                    )
                    pr["total"] = round(float(pr["total"]) + float(f.get("total") or 0), 2)
                    pr["qtd"] = int(pr["qtd"]) + int(f.get("qtd") or 0)
    out = []
    for row in by_cfop.values():
        item = {k: v for k, v in row.items() if k != "fornecedores" or party_field}
        if party_field and isinstance(row.get(party_field), dict):
            parties = list(row[party_field].values())
            parties.sort(key=lambda x: x["total"], reverse=True)
            item[party_field] = parties
        out.append(item)
    out.sort(key=lambda x: x["total"], reverse=True)
    return out


def _merge_uf_maps(packs: list[dict], field: str) -> dict:
    out: dict[str, float] = {}
    for p in packs:
        for uf, val in (p.get(field) or {}).items():
            out[str(uf)] = round(float(out.get(str(uf), 0)) + float(val or 0), 2)
    return out


def aggregate_fiscal_packs(packs: list[dict], competencia_label: str) -> dict:
    """Soma packs mensais em um pack virtual (visão de trimestre)."""
    packs = [_enrich_fiscal(p or {}) for p in packs if p is not None]
    if not packs:
        return {
            "hasMovimentacao": False,
            "hasDre": False,
            "totalCompras": 0,
            "cfopSaidasTotal": 0,
            "receitaBruta": 0,
            "nfsEntradas": 0,
            "nfsSaidas": 0,
            "competenciaLabel": competencia_label,
            "isTrimestre": True,
        }

    def _sum(key: str) -> float:
        return round(sum(float(p.get(key) or 0) for p in packs), 2)

    compras = _sum("totalCompras")
    vendas = round(sum(_vendas_val(p) for p in packs), 2)
    receita = _sum("receitaBruta") or vendas
    ap_keys = ("icms", "icmsSt", "pis", "cofins", "ipi")
    apuracao: dict = {}
    for k in ap_keys:
        bucket: dict[str, float] = {}
        for p in packs:
            ap = p.get("apuracao") or {}
            item = ap.get(k) if isinstance(ap, dict) else None
            if not isinstance(item, dict):
                continue
            for f, v in item.items():
                if isinstance(v, (int, float)):
                    bucket[f] = round(float(bucket.get(f, 0)) + float(v), 2)
        if bucket:
            apuracao[k] = bucket
    subv = round(sum(float((p.get("apuracao") or {}).get("subvencao") or p.get("subvencao") or 0) for p in packs), 2)
    if subv:
        apuracao["subvencao"] = subv

    clientes = _merge_party_lists(packs, "clientes")
    if not clientes:
        clientes = _merge_party_lists(packs, "clientesTop10")
    fornecedores = _merge_party_lists(packs, "fornecedores")
    top10 = clientes[:10]
    top_sum = round(sum(float(c.get("total") or 0) for c in top10), 2)

    pack = {
        "hasMovimentacao": any(p.get("hasMovimentacao") for p in packs),
        "hasDre": any(p.get("hasDre") for p in packs),
        "totalCompras": compras,
        "cfopSaidasTotal": vendas,
        "receitaBruta": receita,
        "nfsEntradas": int(sum(int(p.get("nfsEntradas") or 0) for p in packs)),
        "nfsSaidas": int(sum(int(p.get("nfsSaidas") or 0) for p in packs)),
        "cfopDados": _merge_cfop_lists(packs, "cfopDados") or _merge_cfop_lists(packs, "cfopEntradas"),
        "cfopSaidas": _merge_cfop_lists(packs, "cfopSaidas"),
        "fornecedores": fornecedores,
        "clientes": clientes,
        "clientesTop10": top10,
        "demaisClientes": round(vendas - top_sum, 2),
        "porUf": _merge_uf_maps(packs, "porUf"),
        "porUfSaidas": _merge_uf_maps(packs, "porUfSaidas"),
        "apuracao": apuracao or None,
        "composicao": None,
        "deducoes": None,
        "competenciaLabel": competencia_label,
        "isTrimestre": True,
    }
    return _enrich_fiscal(pack)


def _meses_label_presentes(presentes: list[str]) -> str:
    if not presentes:
        return ""
    shorts = [_month_short(c) for c in presentes]
    year = presentes[0][:4]
    if len(shorts) == 1:
        return f"{shorts[0]} / {year}"
    return f"{shorts[0]} – {shorts[-1]} / {year}"


def build_trimestre_totais(competencia: str, months: list) -> dict:
    """Soma packs dos meses do trimestre civil já gravados na mesma unidade."""
    kind, key = parse_period_key(competencia)
    if kind == "trimestre" and key:
        meses = _meses_from_trimestre_key(key)
        qid = key.split("-")[0]
        year = key.split("-")[1] if "-" in key else ""
        label = f"{qid[1]}º Trimestre {year}" if year else f"{qid[1]}º Trimestre"
    else:
        qid, _, _ = _trimestre_id(competencia)
        meses = _trimestre_meses(competencia)
        label = _trimestre_label(competencia)
    by_comp = {m.competencia: m for m in months}
    presentes = [c for c in meses if c in by_comp]
    packs = [_enrich_fiscal(getattr(by_comp[c], "pack", None) or {}) for c in presentes]

    def _sum(key_name: str) -> float:
        return round(sum(float(p.get(key_name) or 0) for p in packs), 2)

    compras = _sum("totalCompras")
    vendas = sum(_vendas_val(p) for p in packs)
    vendas = round(vendas, 2)
    receita = _sum("receitaBruta") or vendas
    nfs_ent = int(sum(int(p.get("nfsEntradas") or 0) for p in packs))
    nfs_sai = int(sum(int(p.get("nfsSaidas") or 0) for p in packs))

    icms_sum: float | None = None
    pis_cofins_sum: float | None = None
    ded_sum = 0.0
    has_ded = False
    for p in packs:
        ap = p.get("apuracao")
        if isinstance(ap, dict) and isinstance(ap.get("icms"), dict) and "aRecolher" in ap["icms"]:
            icms_sum = (icms_sum or 0.0) + float(ap["icms"].get("aRecolher") or 0)
        pc = _pis_cofins_recolher(ap if isinstance(ap, dict) else None)
        if pc is not None:
            pis_cofins_sum = (pis_cofins_sum or 0.0) + pc
        if p.get("deducoes") is not None:
            has_ded = True
            ded_sum += float(p.get("deducoes") or 0)

    if icms_sum is not None:
        icms_sum = round(icms_sum, 2)
    if pis_cofins_sum is not None:
        pis_cofins_sum = round(pis_cofins_sum, 2)
    deducoes = round(ded_sum, 2) if has_ded else None
    ded_pct = round(100 * deducoes / receita, 2) if deducoes is not None and receita else None

    return {
        "id": qid,
        "key": f"{qid}-{meses[0][:4]}" if meses else qid,
        "label": label,
        "meses": meses,
        "mesesPresentes": presentes,
        "mesesLabel": _meses_label_presentes(presentes),
        "completo": len(presentes) == 3,
        "totais": {
            "totalCompras": compras,
            "cfopSaidasTotal": vendas,
            "receitaBruta": receita,
            "saldoOperacional": round(vendas - compras, 2),
            "nfsEntradas": nfs_ent,
            "nfsSaidas": nfs_sai,
            "icmsARecolher": icms_sum,
            "pisCofinsRecolher": pis_cofins_sum,
            "deducoes": deducoes,
            "dedPct": ded_pct,
            "icmsKpi": _icms_kpi({"icms": {"aRecolher": icms_sum}}) if icms_sum is not None else None,
        },
    }


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
        return not (pack.get("hasBalancete") or pack.get("balancete"))
    if tab == "memoria":
        return not (
            pack.get("entradasMeta")
            or pack.get("saidasMeta")
            or pack.get("apuracao")
            or pack.get("memoriaCalculo")
        )
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
            "memoriaCalculo": pack.get("memoriaCalculo"),
            "subvencao": pack.get("subvencao") or (pack.get("apuracao") or {}).get("subvencao"),
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
    months = (
        db.query(FiscalMonth)
        .filter(FiscalMonth.company_id == company_id, FiscalMonth.unidade == unidade)
        .order_by(FiscalMonth.competencia)
        .all()
    )
    kind, period_key = parse_period_key(competencia)
    row = None
    presentes: list[str] = []
    if kind == "trimestre" and period_key:
        tri_meses = _meses_from_trimestre_key(period_key)
        by_comp = {m.competencia: m for m in months}
        presentes = [c for c in tri_meses if c in by_comp]
        packs = [getattr(by_comp[c], "pack", None) or {} for c in presentes]
        q = int(period_key[1])
        year = period_key.split("-")[1]
        label = f"{q}º Trimestre {year}"
        pack = aggregate_fiscal_packs(packs, label)
        empty = not presentes
    else:
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
        empty = _is_empty(tab, pack or {}, row)

    data = _slice(tab, pack)
    if kind == "trimestre":
        data["isTrimestre"] = True
        data["competenciaLabel"] = (pack or {}).get("competenciaLabel")
    if tab == "dre":
        year = year_from_period(competencia)
        por_mes = build_dre_por_mes(months, year)
        data["porMes"] = por_mes
        comps = [m["competencia"] for m in por_mes]
        data["periodoLabel"] = dre_period_label(comps)
        sources = [m.get("source") for m in por_mes if m.get("source")]
        data["dreSource"] = sources[-1] if sources else (data.get("dre") or {}).get("source")
        if por_mes:
            empty = False
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
    if tab == "vendas" and kind == "month":
        data["variacaoVendas"] = variacao_vendas_mom(competencia, months)

    if kind == "trimestre" and period_key:
        tri_ref = presentes[0] if presentes else (_meses_from_trimestre_key(period_key) or [competencia])[0]
    else:
        tri_ref = competencia

    return {
        "companyId": company_id,
        "competencia": competencia,
        "unidade": unidade,
        "tab": tab,
        "empty": empty,
        "data": data,
        "trimestre": build_trimestre_totais(tri_ref, months),
        "periodKind": kind,
    }
