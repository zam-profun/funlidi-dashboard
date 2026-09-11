import os
import io
import json
import re
import secrets
import time
import difflib
import unicodedata
from datetime import datetime, timezone, timedelta
from collections import defaultdict

import openpyxl

from dotenv import load_dotenv
from fastapi import FastAPI, Body, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from supabase import create_client, Client
from openpyxl import Workbook

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
AYUDAS_SUPABASE_URL = os.environ.get("AYUDAS_SUPABASE_URL") or os.environ["SUPABASE_URL"]
AYUDAS_SUPABASE_KEY = os.environ.get("AYUDAS_SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_SERVICE_KEY"]
INVENTARIO_SUPABASE_URL = os.environ.get("INVENTARIO_SUPABASE_URL") or os.environ["SUPABASE_URL"]
INVENTARIO_SUPABASE_KEY = os.environ.get("INVENTARIO_SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_SERVICE_KEY"]

# --- Auth ---
_USERS = {}
if os.getenv("PASSWORD_MARIA"):
    _USERS["Maria"] = os.environ["PASSWORD_MARIA"]
if os.getenv("PASSWORD_JEOVANI"):
    _USERS["Jeovani"] = os.environ["PASSWORD_JEOVANI"]
if os.getenv("PASSWORD_ANGEL"):
    _USERS["Angel"] = os.environ["PASSWORD_ANGEL"]
if os.getenv("PASSWORD_ELIANA"):
    _USERS["Eliana"] = os.environ["PASSWORD_ELIANA"]

_SESSIONS = {}  # token -> {"expiry": float, "username": str}

# Users allowed to access the CIS module (data, preview, export, CRUD).
CIS_ALLOWED_USERS = {"Angel", "Jeovani"}

def _clean_sessions():
    now = time.time()
    expired = [k for k, v in _SESSIONS.items() if v["expiry"] < now]
    for k in expired:
        del _SESSIONS[k]
# --- end Auth ---

COL_TZ = timezone(timedelta(hours=-5))

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data_to_show")
_PAGOS_CACHE = {"data": None, "mtime": 0}
_CRM_CACHE = {"data": None, "mtime": 0}

PAGOS_FILES = [
    "EXCEL ACTIVACION PAGOS MARIA ELVIRA SUS.xlsx",
    "EXCEL INFINITY - LOGISTICA - ARITA MARIA ELVIRA SUS.xlsx",
]


def _load_pagos_data():
    latest_mtime = 0
    for fname in PAGOS_FILES:
        fpath = os.path.join(DATA_DIR, fname)
        if os.path.exists(fpath):
            mtime = os.path.getmtime(fpath)
            if mtime > latest_mtime:
                latest_mtime = mtime
    if latest_mtime == 0:
        return []

    if _PAGOS_CACHE["data"] is not None and latest_mtime <= _PAGOS_CACHE["mtime"]:
        return _PAGOS_CACHE["data"]

    records = []
    for fname in PAGOS_FILES:
        fpath = os.path.join(DATA_DIR, fname)
        if not os.path.exists(fpath):
            continue
        wb = openpyxl.load_workbook(fpath, read_only=True, data_only=True)
        ws = wb[wb.sheetnames[0]]
        for row in ws.iter_rows(min_row=3, values_only=True):
            if row[0] is None and row[1] is None:
                break
            num, ident, nombres, ref, fecha, hora, flayer, valor = row[0:8]
            fecha_str = ""
            if fecha:
                try:
                    fecha_str = fecha.isoformat() if hasattr(fecha, "isoformat") else str(fecha)
                except Exception:
                    fecha_str = str(fecha)
            hora_str = ""
            if hora:
                try:
                    hora_str = hora.strftime("%H:%M") if hasattr(hora, "strftime") else str(hora)
                except Exception:
                    hora_str = str(hora)
            records.append({
                "id": int(num) if num else 0,
                "identificacion": str(ident).strip() if ident else "",
                "nombres": str(nombres).strip() if nombres else "",
                "referencia": str(ref).strip() if ref else "",
                "fecha": fecha_str,
                "hora": hora_str,
                "flayer": re.sub(r'\s+', ' ', str(flayer)).strip() if flayer else "",
                "valor": int(valor) if isinstance(valor, (int, float)) else 0,
                "archivo": fname,
            })
        wb.close()

    _PAGOS_CACHE["data"] = records
    _PAGOS_CACHE["mtime"] = latest_mtime
    return records


def _load_crm_data():
    fpath = os.path.join(DATA_DIR, "dashboard-data.json")
    if not os.path.exists(fpath):
        return None
    mtime = os.path.getmtime(fpath)
    if _CRM_CACHE["data"] is not None and mtime <= _CRM_CACHE["mtime"]:
        return _CRM_CACHE["data"]
    with open(fpath, "r", encoding="utf-8") as f:
        data = json.load(f)
    _CRM_CACHE["data"] = data
    _CRM_CACHE["mtime"] = mtime
    return data


supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
supabase_ayudas: Client = create_client(AYUDAS_SUPABASE_URL, AYUDAS_SUPABASE_KEY)
supabase_inventario: Client = create_client(INVENTARIO_SUPABASE_URL, INVENTARIO_SUPABASE_KEY)

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.post("/api/auth/login")
async def auth_login(data: dict):
    pwd = data.get("password", "")
    username = None
    for u, pw in _USERS.items():
        if pw == pwd:
            username = u
            break
    if not username:
        raise HTTPException(401, "Contraseña incorrecta")
    token = secrets.token_hex(32)
    _SESSIONS[token] = {"expiry": time.time() + 86400, "username": username}
    resp = JSONResponse({"ok": True, "username": username})
    resp.set_cookie(key="session", value=token, httponly=True,
                    samesite="lax", max_age=86400)
    return resp


@app.post("/api/auth/logout")
async def auth_logout(request: Request):
    token = request.cookies.get("session")
    _SESSIONS.pop(token, None)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("session")
    return resp


@app.get("/api/auth/check")
async def auth_check(request: Request):
    token = request.cookies.get("session")
    _clean_sessions()
    if token and token in _SESSIONS:
        return {"authenticated": True, "username": _SESSIONS[token]["username"]}
    return {"authenticated": False}


@app.middleware("http")
async def session_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/") and not path.startswith("/api/auth/"):
        token = request.cookies.get("session")
        _clean_sessions()
        if not token or token not in _SESSIONS:
            return JSONResponse(status_code=401, content={"detail": "No autorizado"})
        if path.startswith("/api/cis/"):
            username = _SESSIONS[token].get("username")
            if username not in CIS_ALLOWED_USERS:
                return JSONResponse(status_code=403, content={"detail": "Sin acceso al modulo CIS"})
    return await call_next(request)


@app.get("/")
async def index():
    return FileResponse("static/index.html")


@app.get("/api/data")
async def get_data():
    result = supabase.table("usuarios_funlidi").select("*").order("updated_at", desc=True).execute()
    return {"data": result.data, "total": len(result.data)}


@app.get("/api/stats")
async def get_stats():
    result = supabase.table("usuarios_funlidi").select("*").execute()
    rows = result.data
    total = len(rows)
    completados = sum(
        1 for r in rows
        if r.get("nombres_completos") and r.get("correo_electronico") and r.get("numero_documento")
    )
    incompletos = total - completados
    ultima = max(
        (r.get("updated_at") or r.get("created_at") or "") for r in rows
    ) if rows else None

    ahora_col = datetime.now(COL_TZ)
    hoy_inicio_col = ahora_col.replace(hour=0, minute=0, second=0, microsecond=0)
    semana_inicio_col = hoy_inicio_col - timedelta(days=7)

    registros_hoy = 0
    actualizaciones_hoy = 0
    registros_semana = 0
    actualizaciones_semana = 0

    for r in rows:
        creado = r.get("created_at")
        actualizado = r.get("updated_at")
        if creado:
            try:
                c = datetime.fromisoformat(creado.replace("Z", "+00:00")).astimezone(COL_TZ)
                if c >= hoy_inicio_col:
                    registros_hoy += 1
                if c >= semana_inicio_col:
                    registros_semana += 1
            except Exception:
                pass
        if actualizado:
            try:
                a = datetime.fromisoformat(actualizado.replace("Z", "+00:00")).astimezone(COL_TZ)
                if a >= hoy_inicio_col:
                    if creado:
                        try:
                            c = datetime.fromisoformat(creado.replace("Z", "+00:00")).astimezone(COL_TZ)
                            if abs((a - c).total_seconds()) > 5:
                                actualizaciones_hoy += 1
                        except Exception:
                            actualizaciones_hoy += 1
                    else:
                        actualizaciones_hoy += 1
                if a >= semana_inicio_col:
                    if creado:
                        try:
                            c = datetime.fromisoformat(creado.replace("Z", "+00:00")).astimezone(COL_TZ)
                            if abs((a - c).total_seconds()) > 5:
                                actualizaciones_semana += 1
                        except Exception:
                            actualizaciones_semana += 1
                    else:
                        actualizaciones_semana += 1
            except Exception:
                pass

    return {
        "total": total,
        "completados": completados,
        "incompletos": incompletos,
        "ultima_actualizacion": ultima,
        "registros_hoy": registros_hoy,
        "actualizaciones_hoy": actualizaciones_hoy,
        "registros_semana": registros_semana,
        "actualizaciones_semana": actualizaciones_semana,
    }


@app.get("/api/activity")
async def get_activity():
    result = supabase.table("usuarios_funlidi").select("*").order("updated_at", desc=True).limit(10).execute()
    rows = result.data
    actividades = []
    for r in rows:
        creado = r.get("created_at")
        actualizado = r.get("updated_at")
        tipo = "Nuevo registro"
        if creado and actualizado:
            try:
                c = datetime.fromisoformat(creado.replace("Z", "+00:00"))
                a = datetime.fromisoformat(actualizado.replace("Z", "+00:00"))
                if abs((a - c).total_seconds()) > 5:
                    tipo = "Informacion actualizada"
            except Exception:
                pass
        timestamp = actualizado or creado
        usuario = r.get("telegram_username")
        if usuario:
            usuario = "@" + usuario
        else:
            usuario = str(r.get("telegram_user_id", ""))
        nombre = r.get("nombres_completos") or "(sin nombre)"
        actividades.append({
            "usuario": usuario,
            "nombre": nombre,
            "tipo": tipo,
            "timestamp": timestamp,
        })
    return {"actividades": actividades}


@app.get("/api/anomalies")
async def get_anomalies():
    result = supabase.table("usuarios_funlidi").select("*").execute()
    rows = result.data
    anomalias = []

    usuarios = {}
    for r in rows:
        uid = r.get("telegram_user_id")
        if uid is not None:
            usuarios[uid] = r

    docs = {}
    correos = {}
    nombres = []

    for uid, r in usuarios.items():
        doc = r.get("numero_documento")
        corr = r.get("correo_electronico")
        nom = r.get("nombres_completos")
        usr = r.get("telegram_username") or str(uid)
        if usr and not usr.startswith("@"):
            usr = "@" + usr

        if doc:
            docs.setdefault(doc, []).append({"uid": uid, "usuario": usr, "nombre": nom})
        if corr:
            correos.setdefault(corr, []).append({"uid": uid, "usuario": usr, "nombre": nom})
        if nom:
            nombres.append({"uid": uid, "usuario": usr, "nombre": nom})

    for doc, involucrados in docs.items():
        if len(involucrados) > 1:
            uids = list(set(i["uid"] for i in involucrados))
            if len(uids) > 1:
                anomalias.append({
                    "tipo": "documento",
                    "descripcion": f"El numero de documento {doc} esta siendo usado por {len(uids)} personas distintas.",
                    "involucrados": [{"usuario": i["usuario"], "nombre": i["nombre"] or "(sin nombre)"} for i in involucrados],
                })

    for corr, involucrados in correos.items():
        if len(involucrados) > 1:
            uids = list(set(i["uid"] for i in involucrados))
            if len(uids) > 1:
                anomalias.append({
                    "tipo": "correo",
                    "descripcion": f"El correo electronico {corr} esta siendo usado por {len(uids)} personas distintas.",
                    "involucrados": [{"usuario": i["usuario"], "nombre": i["nombre"] or "(sin nombre)"} for i in involucrados],
                })

    for i in range(len(nombres)):
        for j in range(i + 1, len(nombres)):
            if nombres[i]["uid"] == nombres[j]["uid"]:
                continue
            a = (nombres[i]["nombre"] or "").upper().strip()
            b = (nombres[j]["nombre"] or "").upper().strip()
            if not a or not b:
                continue
            ratio = difflib.SequenceMatcher(None, a, b).ratio()
            if ratio >= 0.75:
                anomalias.append({
                    "tipo": "nombre",
                    "descripcion": (
                        f"Los nombres son muy similares ({int(ratio * 100)}% de coincidencia): "
                        f'"{nombres[i]["nombre"]}" y "{nombres[j]["nombre"]}"'
                    ),
                    "involucrados": [
                        {"usuario": nombres[i]["usuario"], "nombre": nombres[i]["nombre"] or "(sin nombre)"},
                        {"usuario": nombres[j]["usuario"], "nombre": nombres[j]["nombre"] or "(sin nombre)"},
                    ],
                })

    return {"anomalias": anomalias, "total": len(anomalias)}


@app.get("/api/pagos/data")
async def get_pagos_data():
    records = _load_pagos_data()
    return {"data": records, "total": len(records)}


@app.get("/api/pagos/stats")
async def get_pagos_stats():
    records = _load_pagos_data()
    total_cop = sum(r["valor"] for r in records)
    total_trans = len(records)
    ids_unicos = set(r["identificacion"] for r in records if r["identificacion"])
    total_personas = len(ids_unicos)

    ultima = ""
    for r in records:
        if r["fecha"] and r["fecha"] > ultima:
            ultima = r["fecha"]

    por_flayer = defaultdict(lambda: {"cantidad": 0, "total_cop": 0, "personas": set()})
    for r in records:
        f = r["flayer"] or "SIN ESPECIFICAR"
        por_flayer[f]["cantidad"] += 1
        por_flayer[f]["total_cop"] += r["valor"]
        if r["identificacion"]:
            por_flayer[f]["personas"].add(r["identificacion"])

    flayer_list = []
    for f, d in sorted(por_flayer.items(), key=lambda x: -x[1]["total_cop"]):
        flayer_list.append({
            "flayer": f,
            "cantidad": d["cantidad"],
            "total_cop": d["total_cop"],
            "personas_unicas": len(d["personas"]),
            "porcentaje_cop": round(d["total_cop"] / total_cop * 100, 1) if total_cop else 0,
        })

    por_dia = defaultdict(lambda: {"cantidad": 0, "total_cop": 0})
    for r in records:
        if not r["fecha"]:
            continue
        dia = r["fecha"][:10]
        por_dia[dia]["cantidad"] += 1
        por_dia[dia]["total_cop"] += r["valor"]

    dia_list = [{"fecha": d, **v} for d, v in sorted(por_dia.items())]

    return {
        "total_cop": total_cop,
        "total_transacciones": total_trans,
        "total_personas_unicas": total_personas,
        "ultima_transaccion": ultima,
        "por_flayer": flayer_list,
        "por_dia": dia_list,
    }


@app.get("/api/pagos/personas")
async def get_pagos_personas():
    records = _load_pagos_data()
    personas = defaultdict(lambda: {
        "nombres": "", "total_gastado": 0, "transacciones": 0,
        "flyers": set(), "referencias": [], "primer_pago": "", "ultimo_pago": "",
    })
    for r in records:
        ident = r["identificacion"]
        if not ident:
            continue
        p = personas[ident]
        if not p["nombres"]:
            p["nombres"] = r["nombres"]
        p["total_gastado"] += r["valor"]
        p["transacciones"] += 1
        p["flyers"].add(r["flayer"])
        p["referencias"].append(r["referencia"])
        if r["fecha"]:
            if not p["primer_pago"] or r["fecha"] < p["primer_pago"]:
                p["primer_pago"] = r["fecha"]
            if not p["ultimo_pago"] or r["fecha"] > p["ultimo_pago"]:
                p["ultimo_pago"] = r["fecha"]

    persona_list = [
        {
            "identificacion": ident,
            "nombres": d["nombres"],
            "total_gastado": d["total_gastado"],
            "transacciones": d["transacciones"],
            "flyers": sorted(d["flyers"]),
            "primer_pago": d["primer_pago"],
            "ultimo_pago": d["ultimo_pago"],
        }
        for ident, d in sorted(personas.items(), key=lambda x: -x[1]["total_gastado"])
    ]
    return {"personas": persona_list, "total": len(persona_list)}


@app.get("/api/crm/data")
async def get_crm_data():
    data = _load_crm_data()
    if data is None:
        raise HTTPException(status_code=404, detail="CRM data file not found")
    return data


def formatear_fecha_simple(valor):
    if not valor:
        return "-"
    try:
        d = datetime.fromisoformat(valor.replace("Z", "+00:00")).astimezone(COL_TZ)
        meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        return f"{d.day} de {meses[d.month - 1]} de {d.year} a las {d.hour}:{d.minute:02d}"
    except Exception:
        return str(valor)


@app.get("/api/download")
async def download_xlsx():
    result = supabase.table("usuarios_funlidi").select("*").order("updated_at", desc=True).execute()
    rows = result.data

    wb = Workbook()
    ws = wb.active
    ws.title = "Usuarios FUNLIDI"

    headers = [
        "Usuario de Telegram", "Nombres Completos",
        "Correo Electronico", "Numero de Documento",
        "Fecha de Creacion", "Ultima Actualizacion",
    ]
    ws.append(headers)

    for r in rows:
        usuario = r.get("telegram_username")
        if usuario:
            usuario = "@" + usuario
        else:
            usuario = "-"
        ws.append([
            usuario,
            r.get("nombres_completos") or "-",
            r.get("correo_electronico") or "-",
            r.get("numero_documento") or "-",
            formatear_fecha_simple(r.get("created_at")),
            formatear_fecha_simple(r.get("updated_at")),
        ])

    from openpyxl.styles import Font, PatternFill
    header_fill = PatternFill(start_color="FFC107", end_color="FFC107", fill_type="solid")
    header_font = Font(bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for column in ws.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    hoy = datetime.now(COL_TZ)
    filename = f"Registros_FUNLIDI_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ========== AYUDAS HUMANITARIAS ENDPOINTS ==========

AYUDAS_TABLE = "ayudas_humanitarias"
AYUDAS_BENEF_TABLE = "ayudas_beneficiarios"
AYUDAS_PERSONAL_FIELDS = ["nombre", "dni", "pais", "ciudad", "pasaporte", "ocupacion", "telefono", "correo"]
AYUDAS_BANK_FIELDS = ["banco", "swift", "nbancaria", "tipocuenta"]
AYUDAS_ALL_FIELDS = AYUDAS_PERSONAL_FIELDS + AYUDAS_BANK_FIELDS


def _ayudas_estado(r):
    personal = all(r.get(f) and str(r.get(f, "")).strip() for f in AYUDAS_PERSONAL_FIELDS)
    if not personal:
        return "incompleto"
    bank = all(r.get(f) and str(r.get(f, "")).strip() for f in AYUDAS_BANK_FIELDS)
    if not bank:
        return "sin_banco"
    bank_real = all(
        str(r.get(f, "")).strip() not in ("", "N/A") for f in AYUDAS_BANK_FIELDS
    )
    if bank_real:
        return "completo"
    return "sin_banco"


@app.get("/api/ayudas/data")
async def get_ayudas_data():
    result = supabase_ayudas.table(AYUDAS_TABLE).select("*").order("updated_at", desc=True).execute()
    rows = result.data or []
    for r in rows:
        r["estado"] = _ayudas_estado(r)
        uid = r.get("telegram_user_id")
        if uid is not None:
            benef = supabase_ayudas.table(AYUDAS_BENEF_TABLE).select("*").eq("telegram_user_id", uid).order("beneficiary_number").execute()
            r["beneficiarios"] = benef.data or []
        else:
            r["beneficiarios"] = []
    return {"data": rows, "total": len(rows)}


@app.get("/api/ayudas/stats")
async def get_ayudas_stats():
    result = supabase_ayudas.table(AYUDAS_TABLE).select("*").execute()
    rows = result.data or []
    total = len(rows)
    completos = sum(1 for r in rows if _ayudas_estado(r) == "completo")
    sin_banco = sum(1 for r in rows if _ayudas_estado(r) == "sin_banco")
    incompletos = sum(1 for r in rows if _ayudas_estado(r) == "incompleto")
    paises = set()
    for r in rows:
        p = r.get("pais")
        if p and str(p).strip() and str(p).strip() != "VACIO":
            paises.add(str(p).strip().upper())
    ultima = max(
        (r.get("updated_at") or r.get("created_at") or "") for r in rows
    ) if rows else None

    ahora_col = datetime.now(COL_TZ)
    hoy_inicio_col = ahora_col.replace(hour=0, minute=0, second=0, microsecond=0)
    semana_inicio_col = hoy_inicio_col - timedelta(days=7)
    registros_hoy = 0
    registros_semana = 0
    for r in rows:
        c = r.get("created_at")
        if c:
            try:
                d = datetime.fromisoformat(c.replace("Z", "+00:00")).astimezone(COL_TZ)
                if d >= hoy_inicio_col:
                    registros_hoy += 1
                if d >= semana_inicio_col:
                    registros_semana += 1
            except Exception:
                pass

    benef_result = supabase_ayudas.table(AYUDAS_BENEF_TABLE).select("*").execute()
    total_benef = len(benef_result.data or [])

    paises_list = sorted(paises) if paises else []
    return {
        "total": total,
        "completos": completos,
        "sin_banco": sin_banco,
        "incompletos": incompletos,
        "ultima_actualizacion": ultima,
        "registros_hoy": registros_hoy,
        "registros_semana": registros_semana,
        "paises": paises_list,
        "total_beneficiarios": total_benef,
    }


@app.get("/api/ayudas/download")
async def download_ayudas_xlsx():
    result = supabase_ayudas.table(AYUDAS_TABLE).select("*").order("updated_at", desc=True).execute()
    rows = result.data or []

    wb = Workbook()
    ws = wb.active
    ws.title = "Ayudas Humanitarias"

    headers = [
        "Usuario Telegram", "Tratamiento Datos",
        "Nombres y Apellidos", "Cedula/DNI", "Pais", "Ciudad",
        "Pasaporte", "Ocupacion", "Telefono", "Correo",
        "Banco", "Swift", "Numero Cuenta", "Tipo Cuenta",
        "Fecha Creacion", "Ultima Actualizacion",
    ]
    ws.append(headers)

    for r in rows:
        usuario = r.get("telegram_username")
        if usuario:
            usuario = "@" + usuario
        else:
            usuario = "-"
        ws.append([
            usuario,
            "Si" if r.get("data_treatment_accepted") else "No",
            r.get("nombre") or "-", r.get("dni") or "-",
            r.get("pais") or "-", r.get("ciudad") or "-",
            r.get("pasaporte") or "-", r.get("ocupacion") or "-",
            r.get("telefono") or "-", r.get("correo") or "-",
            r.get("banco") or "-", r.get("swift") or "-",
            r.get("nbancaria") or "-", r.get("tipocuenta") or "-",
            formatear_fecha_simple(r.get("created_at")),
            formatear_fecha_simple(r.get("updated_at")),
        ])

    from openpyxl.styles import Font, PatternFill
    header_fill = PatternFill(start_color="64B5F6", end_color="64B5F6", fill_type="solid")
    header_font = Font(bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for column in ws.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    ws2 = wb.create_sheet(title="Beneficiarios")
    benef_headers = [
        "Usuario Telegram", "Beneficiario #",
        "Nombres y Apellidos", "Cedula/DNI", "Pais", "Ciudad",
        "Pasaporte", "Ocupacion", "Telefono", "Correo",
    ]
    ws2.append(benef_headers)
    for r in rows:
        usuario = r.get("telegram_username")
        if usuario:
            usuario = "@" + usuario
        else:
            usuario = "-"
        uid = r.get("telegram_user_id")
        if uid is not None:
            benef_res = supabase_ayudas.table(AYUDAS_BENEF_TABLE).select("*").eq("telegram_user_id", uid).order("beneficiary_number").execute()
            for b in (benef_res.data or []):
                ws2.append([
                    usuario,
                    b.get("beneficiary_number", ""),
                    b.get("nombre") or "-", b.get("dni") or "-",
                    b.get("pais") or "-", b.get("ciudad") or "-",
                    b.get("pasaporte") or "-", b.get("ocupacion") or "-",
                    b.get("telefono") or "-", b.get("correo") or "-",
                ])
    from openpyxl.styles import Font, PatternFill
    header_fill2 = PatternFill(start_color="64B5F6", end_color="64B5F6", fill_type="solid")
    header_font2 = Font(bold=True, size=11)
    for cell in ws2[1]:
        cell.fill = header_fill2
        cell.font = header_font2
    for column in ws2.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws2.column_dimensions[col_letter].width = min(max_len + 4, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    hoy = datetime.now(COL_TZ)
    filename = f"Ayudas_Humanitarias_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ========== AYUDAS CRUD ENDPOINTS ==========


AYUDAS_CRUD_FIELDS = AYUDAS_PERSONAL_FIELDS + AYUDAS_BANK_FIELDS


def _next_ayudas_negative_id():
    result = (
        supabase_ayudas.table(AYUDAS_TABLE)
        .select("telegram_user_id")
        .lt("telegram_user_id", 0)
        .order("telegram_user_id")
        .execute()
    )
    existing = [r["telegram_user_id"] for r in (result.data or [])]
    if not existing:
        return -1
    return min(existing) - 1


@app.post("/api/ayudas/add")
async def add_ayudas_entry(data: dict = Body(...)):
    telegram_username = (data.get("telegram_username") or "").strip()
    if not telegram_username:
        telegram_username = "MANUAL"

    nombre = (data.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")

    telegram_user_id = _next_ayudas_negative_id()
    now = datetime.now(timezone.utc).isoformat()

    row = {
        "telegram_user_id": telegram_user_id,
        "telegram_username": telegram_username,
        "data_treatment_accepted": False,
        "created_at": now,
        "updated_at": now,
    }
    for k in AYUDAS_CRUD_FIELDS:
        v = data.get(k)
        row[k] = str(v).strip() if v and str(v).strip() else None

    supabase_ayudas.table(AYUDAS_TABLE).upsert(row, on_conflict="telegram_user_id").execute()

    # Handle beneficiaries: delete existing, insert new
    beneficiarios = data.get("beneficiarios", [])
    if beneficiarios:
        supabase_ayudas.table(AYUDAS_BENEF_TABLE).delete().eq("telegram_user_id", telegram_user_id).execute()
        for i, b in enumerate(beneficiarios):
            b_row = {"telegram_user_id": telegram_user_id, "beneficiary_number": i + 1}
            for field in AYUDAS_PERSONAL_FIELDS:
                v = b.get(field)
                b_row[field] = str(v).strip() if v and str(v).strip() else None
            b_row["created_at"] = now
            b_row["updated_at"] = now
            supabase_ayudas.table(AYUDAS_BENEF_TABLE).insert(b_row).execute()

    return {"success": True, "data": row}


@app.put("/api/ayudas/edit/{telegram_user_id}")
async def edit_ayudas_entry(telegram_user_id: int, data: dict = Body(...)):
    existing = supabase_ayudas.table(AYUDAS_TABLE).select("*").eq("telegram_user_id", telegram_user_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    row = {}
    for k in AYUDAS_CRUD_FIELDS:
        if k in data:
            v = data[k]
            row[k] = str(v).strip() if v and str(v).strip() else None

    if "telegram_username" in data:
        v = data["telegram_username"]
        row["telegram_username"] = str(v).strip() if v and str(v).strip() else "MANUAL"

    if row:
        row["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase_ayudas.table(AYUDAS_TABLE).update(row).eq("telegram_user_id", telegram_user_id).execute()

    # Handle beneficiaries
    if "beneficiarios" in data:
        supabase_ayudas.table(AYUDAS_BENEF_TABLE).delete().eq("telegram_user_id", telegram_user_id).execute()
        now = datetime.now(timezone.utc).isoformat()
        for i, b in enumerate(data["beneficiarios"]):
            b_row = {"telegram_user_id": telegram_user_id, "beneficiary_number": i + 1}
            for field in AYUDAS_PERSONAL_FIELDS:
                v = b.get(field)
                b_row[field] = str(v).strip() if v and str(v).strip() else None
            b_row["created_at"] = now
            b_row["updated_at"] = now
            supabase_ayudas.table(AYUDAS_BENEF_TABLE).insert(b_row).execute()

    return {"success": True}


@app.delete("/api/ayudas/delete/{telegram_user_id}")
async def delete_ayudas_entry(telegram_user_id: int):
    supabase_ayudas.table(AYUDAS_BENEF_TABLE).delete().eq("telegram_user_id", telegram_user_id).execute()
    supabase_ayudas.table(AYUDAS_TABLE).delete().eq("telegram_user_id", telegram_user_id).execute()
    return {"success": True}


@app.put("/api/ayudas/toggle-benef-approval/{telegram_user_id}")
async def toggle_ayudas_benef_approval(telegram_user_id: int):
    result = supabase_ayudas.table(AYUDAS_TABLE).select("beneficiarios_autorizado").eq("telegram_user_id", telegram_user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    current = result.data[0].get("beneficiarios_autorizado", False)
    supabase_ayudas.table(AYUDAS_TABLE).update({"beneficiarios_autorizado": not current}).eq("telegram_user_id", telegram_user_id).execute()
    return {"success": True, "autorizado": not current}


# ========== INVENTARIO ENDPOINTS ==========

INVENTARIO_TABLE = "inventario_adquisiciones"


@app.get("/api/inventario/data")
async def get_inventario_data():
    result = supabase_inventario.table(INVENTARIO_TABLE).select("*").order("updated_at", desc=True).execute()
    rows = result.data or []
    return {"data": rows, "total": len(rows)}


@app.get("/api/inventario/stats")
async def get_inventario_stats():
    result = supabase_inventario.table(INVENTARIO_TABLE).select("*").execute()
    rows = result.data or []
    total = len(rows)

    cajamicro_total = sum(to_int(r.get("cajamicro")) for r in rows)
    cajadinar_total = sum(to_int(r.get("cajadinar")) for r in rows)
    per_aleman_total = sum(to_int(r.get("per_aleman")) for r in rows)
    per_top_total = sum(to_int(r.get("per_top")) for r in rows)
    per_dragon_total = sum(to_int(r.get("per_dragon")) for r in rows)

    ultima = max(
        (r.get("updated_at") or r.get("created_at") or "") for r in rows
    ) if rows else None

    ahora_col = datetime.now(COL_TZ)
    hoy_inicio_col = ahora_col.replace(hour=0, minute=0, second=0, microsecond=0)
    semana_inicio_col = hoy_inicio_col - timedelta(days=7)
    registros_hoy = 0
    registros_semana = 0
    for r in rows:
        c = r.get("created_at") or r.get("updated_at")
        if c:
            try:
                d = datetime.fromisoformat(c.replace("Z", "+00:00")).astimezone(COL_TZ)
                if d >= hoy_inicio_col:
                    registros_hoy += 1
                if d >= semana_inicio_col:
                    registros_semana += 1
            except Exception:
                pass

    return {
        "total": total,
        "cajamicro_total": cajamicro_total,
        "cajadinar_total": cajadinar_total,
        "per_aleman_total": per_aleman_total,
        "per_top_total": per_top_total,
        "per_dragon_total": per_dragon_total,
        "ultima_actualizacion": ultima,
        "registros_hoy": registros_hoy,
        "registros_semana": registros_semana,
    }


def to_int(v):
    if not v:
        return 0
    try:
        return int(v)
    except Exception:
        return 0


@app.get("/api/inventario/download")
async def download_inventario_xlsx():
    result = supabase_inventario.table(INVENTARIO_TABLE).select("*").order("updated_at", desc=True).execute()
    rows = result.data or []

    wb = Workbook()
    ws = wb.active
    ws.title = "Inventario de Adquisiciones"

    headers = [
        "Usuario Telegram", "Nombres y Apellidos", "Cedula/DNI", "Pais",
        "Cajas Microlingotes", "Cajas Dinares", "Pergaminos Alemanes",
        "Pergaminos Nonillon", "Cajas Pergaminos Dragones",
        "Fecha Creacion", "Ultima Actualizacion",
    ]
    ws.append(headers)

    for r in rows:
        usuario = r.get("telegram_username")
        if usuario:
            usuario = "@" + usuario
        else:
            usuario = "-"
        ws.append([
            usuario,
            r.get("nombre") or "-",
            r.get("dni") or "-",
            r.get("pais") or "-",
            to_int(r.get("cajamicro")),
            to_int(r.get("cajadinar")),
            to_int(r.get("per_aleman")),
            to_int(r.get("per_top")),
            to_int(r.get("per_dragon")),
            formatear_fecha_simple(r.get("created_at") or r.get("updated_at")),
            formatear_fecha_simple(r.get("updated_at")),
        ])

    from openpyxl.styles import Font, PatternFill
    header_fill = PatternFill(start_color="81C784", end_color="81C784", fill_type="solid")
    header_font = Font(bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for column in ws.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    hoy = datetime.now(COL_TZ)
    filename = f"Inventario_Adquisiciones_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


INVENTARIO_PRODUCTOS = {
    "cajamicro": "Caja Micro",
    "cajadinar": "Caja Dinar",
    "per_aleman": "Perfil Aleman",
    "per_top": "Perfil Top",
    "per_dragon": "Perfil Dragon",
}


def _productos_buyers():
    result = supabase_inventario.table(INVENTARIO_TABLE).select("*").execute()
    rows = result.data or []
    productos = {}
    for col, label in INVENTARIO_PRODUCTOS.items():
        buyers = []
        for r in rows:
            v = r.get(col)
            if v is not None and str(v).strip() not in ("", "0", "None"):
                try:
                    qty = int(float(str(v)))
                except Exception:
                    qty = 0
                if qty > 0:
                    buyers.append({
                        "nombre": r.get("nombre") or "-",
                        "telegram_username": r.get("telegram_username") or "",
                        "dni": r.get("dni") or "-",
                        "pais": r.get("pais") or "-",
                        "cantidad": qty,
                    })
        buyers.sort(key=lambda x: x["cantidad"], reverse=True)
        productos[col] = {
            "label": label,
            "total_buyers": len(buyers),
            "total_qty": sum(b["cantidad"] for b in buyers),
            "buyers": buyers,
        }
    return productos


@app.get("/api/inventario/productos")
async def get_inventario_productos():
    return {"productos": _productos_buyers()}


@app.get("/api/inventario/productos/download/{producto}")
async def download_inventario_producto(producto: str):
    if producto not in INVENTARIO_PRODUCTOS:
        raise HTTPException(status_code=404, detail="Producto no encontrado")

    data = _productos_buyers()
    prod = data[producto]
    label = prod["label"]
    buyers = prod["buyers"]

    wb = Workbook()
    ws = wb.active
    ws.title = label

    headers = ["Nombres y Apellidos", "Usuario Telegram", "DNI", "Pais", "Cantidad"]
    ws.append(headers)

    for b in buyers:
        usuario = b["telegram_username"]
        if usuario:
            usuario = "@" + usuario if not usuario.startswith("@") else usuario
        else:
            usuario = "-"
        ws.append([b["nombre"], usuario, b["dni"], b["pais"], b["cantidad"]])

    from openpyxl.styles import Font, PatternFill
    header_fill = PatternFill(start_color="81C784", end_color="81C784", fill_type="solid")
    header_font = Font(bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for column in ws.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    hoy = datetime.now(COL_TZ)
    safe_label = label.replace(" ", "_")
    filename = f"{safe_label}_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ========== INVENTARIO CRUD ENDPOINTS ==========


INVENTARIO_FIELDS = ["nombre", "dni", "pais", "cajamicro", "cajadinar", "per_aleman", "per_top", "per_dragon"]


def _next_negative_id():
    result = (
        supabase_inventario.table(INVENTARIO_TABLE)
        .select("telegram_user_id")
        .lt("telegram_user_id", 0)
        .order("telegram_user_id")
        .execute()
    )
    existing = [r["telegram_user_id"] for r in (result.data or [])]
    if not existing:
        return -1
    return min(existing) - 1


@app.post("/api/inventario/add")
async def add_inventario_entry(data: dict = Body(...)):
    telegram_username = (data.get("telegram_username") or "").strip()
    if not telegram_username:
        telegram_username = "MANUAL"

    nombre = (data.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")

    telegram_user_id = _next_negative_id()
    now = datetime.now(timezone.utc).isoformat()

    row = {
        "telegram_user_id": telegram_user_id,
        "telegram_username": telegram_username,
        "created_at": now,
        "updated_at": now,
    }
    for k in INVENTARIO_FIELDS:
        v = data.get(k)
        row[k] = str(v).strip() if v and str(v).strip() else None

    supabase_inventario.table(INVENTARIO_TABLE).upsert(row, on_conflict="telegram_user_id").execute()
    return {"success": True, "data": row}


@app.put("/api/inventario/edit/{telegram_user_id}")
async def edit_inventario_entry(telegram_user_id: int, data: dict = Body(...)):
    row = {}
    for k in INVENTARIO_FIELDS:
        if k in data:
            v = data[k]
            row[k] = str(v).strip() if v and str(v).strip() else None

    if "telegram_username" in data:
        v = data["telegram_username"]
        row["telegram_username"] = str(v).strip() if v and str(v).strip() else "MANUAL"

    if not row:
        raise HTTPException(status_code=400, detail="No fields to update")

    row["updated_at"] = datetime.now(timezone.utc).isoformat()

    supabase_inventario.table(INVENTARIO_TABLE).update(row).eq("telegram_user_id", telegram_user_id).execute()
    return {"success": True}


@app.delete("/api/inventario/delete/{telegram_user_id}")
async def delete_inventario_entry(telegram_user_id: int):
    supabase_inventario.table(INVENTARIO_TABLE).delete().eq("telegram_user_id", telegram_user_id).execute()
    return {"success": True}


# ========== CIS ENDPOINTS ==========

CIS_TABLE = "clientes_cis"

CIS_FIELDS = [
    "nombre_completo", "first_name", "middle_name", "last_name",
    "gender", "date_of_birth", "ssn", "country_citizenship", "languages",
    "telephone", "email", "tipo_documento", "pasaporte", "cc",
    "fecha_expedicion", "fecha_vencimiento", "autoridad_emisora",
    "officer_name", "street_address", "ciudad", "departamento", "pais",
    "codigo_postal", "urbanizacion", "distrito", "telegram",
    "cantidad_participacion", "habilitado",
]


@app.get("/api/cis/data")
async def get_cis_data():
    result = supabase_inventario.table(CIS_TABLE).select("*").order("nombre_completo").execute()
    rows = result.data or []
    return {"data": rows, "total": len(rows)}


@app.get("/api/cis/stats")
async def get_cis_stats():
    result = supabase_inventario.table(CIS_TABLE).select("*").execute()
    rows = result.data or []
    total = len(rows)
    habilitados = sum(1 for r in rows if r.get("habilitado"))
    no_habilitados = total - habilitados
    con_documento = sum(1 for r in rows if (r.get("pasaporte") or r.get("cc")))
    tipos = {}
    for r in rows:
        t = (r.get("tipo_documento") or "SIN_TIPO").upper()
        tipos[t] = tipos.get(t, 0) + 1
    ultima = max(
        (r.get("updated_at") or r.get("created_at") or "") for r in rows
    ) if rows else None
    return {
        "total": total,
        "habilitados": habilitados,
        "no_habilitados": no_habilitados,
        "con_documento": con_documento,
        "sin_documento": total - con_documento,
        "tipos": tipos,
        "ultima_actualizacion": ultima,
    }


@app.get("/api/cis/download")
async def download_cis_xlsx():
    result = supabase_inventario.table(CIS_TABLE).select("*").order("nombre_completo").execute()
    rows = result.data or []

    wb = Workbook()
    ws = wb.active
    ws.title = "CIS"

    headers = [
        "Nombre Completo", "Tipo Documento", "Pasaporte", "CC",
        "Primer Nombre", "Segundo Nombre", "Apellidos", "Genero",
        "Fecha Nacimiento", "SSN", "Pais Residencia", "Idiomas",
        "Telefono", "Correo", "Fecha Expedicion", "Fecha Vencimiento",
        "Autoridad Emisora", "Oficial", "Direccion", "Ciudad",
        "Departamento", "Pais", "Codigo Postal", "Urbanizacion", "Distrito",
        "Telegram", "Cantidad Participacion", "Habilitado",
        "Fecha Creacion", "Ultima Actualizacion",
    ]
    ws.append(headers)

    for r in rows:
        ws.append([
            r.get("nombre_completo") or "-",
            r.get("tipo_documento") or "-",
            r.get("pasaporte") or "-",
            r.get("cc") or "-",
            r.get("first_name") or "-",
            r.get("middle_name") or "-",
            r.get("last_name") or "-",
            r.get("gender") or "-",
            r.get("date_of_birth") or "-",
            r.get("ssn") or "-",
            r.get("country_citizenship") or "-",
            r.get("languages") or "-",
            r.get("telephone") or "-",
            r.get("email") or "-",
            r.get("fecha_expedicion") or "-",
            r.get("fecha_vencimiento") or "-",
            r.get("autoridad_emisora") or "-",
            r.get("officer_name") or "-",
            r.get("street_address") or "-",
            r.get("ciudad") or "-",
            r.get("departamento") or "-",
            r.get("pais") or "-",
            r.get("codigo_postal") or "-",
            r.get("urbanizacion") or "-",
            r.get("distrito") or "-",
            r.get("telegram") or "-",
            r.get("cantidad_participacion") or 0,
            "Si" if r.get("habilitado") else "No",
            formatear_fecha_simple(r.get("created_at")),
            formatear_fecha_simple(r.get("updated_at")),
        ])

    from openpyxl.styles import Font, PatternFill
    header_fill = PatternFill(start_color="7E57C2", end_color="7E57C2", fill_type="solid")
    header_font = Font(bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for column in ws.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    hoy = datetime.now(COL_TZ)
    filename = f"CIS_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _clean_cis_value(v):
    return str(v).strip() if v is not None and str(v).strip() else None


@app.post("/api/cis/add")
async def add_cis_entry(data: dict = Body(...)):
    nombre = (data.get("nombre_completo") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    row = {}
    for k in CIS_FIELDS:
        v = data.get(k)
        if k == "habilitado":
            row[k] = bool(v)
        elif k == "cantidad_participacion":
            try:
                row[k] = int(v) if v is not None and str(v).strip() else None
            except Exception:
                row[k] = None
        else:
            row[k] = _clean_cis_value(v)
    row["doc_key"] = (row.get("pasaporte") or "").lower() + "|" + (row.get("cc") or "").lower()
    result = supabase_inventario.table(CIS_TABLE).insert(row).execute()
    return {"success": True, "data": result.data[0] if result.data else row}


@app.put("/api/cis/edit/{record_id}")
async def edit_cis_entry(record_id: str, data: dict = Body(...)):
    existing = supabase_inventario.table(CIS_TABLE).select("*").eq("id", record_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    row = {}
    for k in CIS_FIELDS:
        if k in data:
            v = data[k]
            if k == "habilitado":
                row[k] = bool(v)
            elif k == "cantidad_participacion":
                try:
                    row[k] = int(v) if v is not None and str(v).strip() else None
                except Exception:
                    row[k] = None
            else:
                row[k] = _clean_cis_value(v)

    if not row:
        raise HTTPException(status_code=400, detail="No fields to update")

    if "pasaporte" in row or "cc" in row:
        pas = row.get("pasaporte") if "pasaporte" in row else existing.data[0].get("pasaporte")
        c = row.get("cc") if "cc" in row else existing.data[0].get("cc")
        row["doc_key"] = (pas or "").lower() + "|" + (c or "").lower()

    row["updated_at"] = datetime.now(timezone.utc).isoformat()
    supabase_inventario.table(CIS_TABLE).update(row).eq("id", record_id).execute()
    return {"success": True}


@app.delete("/api/cis/delete/{record_id}")
async def delete_cis_entry(record_id: str):
    supabase_inventario.table(CIS_TABLE).delete().eq("id", record_id).execute()
    return {"success": True}


@app.put("/api/cis/toggle-habilitado/{record_id}")
async def toggle_cis_habilitado(record_id: str):
    result = supabase_inventario.table(CIS_TABLE).select("habilitado").eq("id", record_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    current = bool(result.data[0].get("habilitado"))
    supabase_inventario.table(CIS_TABLE).update({
        "habilitado": not current,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", record_id).execute()
    return {"success": True, "habilitado": not current}


# ========== CIS DOCUMENT GENERATION (preview + export) ==========

SYS_GROUP_DIR = r"C:\Users\amazi\Desktop\mariaelvira\sys-group"


def _cis_engine():
    import sys as _sys
    if SYS_GROUP_DIR not in _sys.path:
        _sys.path.insert(0, SYS_GROUP_DIR)
    import generar_cis
    import cis_pdf
    return generar_cis, cis_pdf


def _cis_row_or_404(record_id: str):
    result = supabase_inventario.table(CIS_TABLE).select("*").eq("id", record_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return result.data[0]


def _cis_scope_rows(scope: str):
    q = supabase_inventario.table(CIS_TABLE).select("*")
    if scope == "habilitados":
        q = q.eq("habilitado", True)
    result = q.order("nombre_completo").execute()
    return result.data or []


@app.get("/api/cis/preview/{record_id}")
async def preview_cis_pdf(record_id: str):
    """Generate the client's CIS and stream it back as an inline PDF preview."""
    import tempfile
    generar_cis, cis_pdf = _cis_engine()
    row = _cis_row_or_404(record_id)
    c = generar_cis.row_to_client(row)
    if not c.get("doc_number"):
        raise HTTPException(status_code=400, detail="El cliente no tiene documento")
    with tempfile.TemporaryDirectory() as tmp:
        docx_path = generar_cis.build_cis_file(c, out_dir=tmp)
        pdf_path = os.path.splitext(docx_path)[0] + ".pdf"
        cis_pdf.convert_docx_to_pdf(docx_path, pdf_path)
        with open(pdf_path, "rb") as f:
            content = f.read()
    hoy = datetime.now(COL_TZ)
    filename = f"CIS_preview_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.pdf"
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@app.get("/api/cis/file/{record_id}")
async def download_cis_file(record_id: str, format: str = "docx"):
    """Download a single client's CIS as .docx or .pdf."""
    import tempfile
    fmt = (format or "docx").lower()
    if fmt not in ("docx", "pdf"):
        raise HTTPException(status_code=400, detail="Formato invalido (docx|pdf)")
    generar_cis, cis_pdf = _cis_engine()
    row = _cis_row_or_404(record_id)
    c = generar_cis.row_to_client(row)
    if not c.get("doc_number"):
        raise HTTPException(status_code=400, detail="El cliente no tiene documento")
    with tempfile.TemporaryDirectory() as tmp:
        docx_path = generar_cis.build_cis_file(c, out_dir=tmp)
        if fmt == "docx":
            with open(docx_path, "rb") as f:
                content = f.read()
            media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            fname = os.path.basename(docx_path)
        else:
            pdf_path = os.path.splitext(docx_path)[0] + ".pdf"
            cis_pdf.convert_docx_to_pdf(docx_path, pdf_path)
            with open(pdf_path, "rb") as f:
                content = f.read()
            media = "application/pdf"
            fname = os.path.splitext(os.path.basename(docx_path))[0] + ".pdf"
    return StreamingResponse(
        io.BytesIO(content),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@app.get("/api/cis/export")
async def export_cis_batch(format: str = "docx", scope: str = "habilitados"):
    """Batch-export CIS documents as a .zip (format=docx|pdf, scope=all|habilitados)."""
    import tempfile
    import zipfile
    fmt = (format or "docx").lower()
    if fmt not in ("docx", "pdf"):
        raise HTTPException(status_code=400, detail="Formato invalido (docx|pdf)")
    if scope not in ("all", "habilitados"):
        raise HTTPException(status_code=400, detail="Scope invalido (all|habilitados)")
    generar_cis, cis_pdf = _cis_engine()
    rows = _cis_scope_rows(scope)
    if not rows:
        raise HTTPException(status_code=404, detail="No hay registros para exportar")

    buf = io.BytesIO()
    with tempfile.TemporaryDirectory() as tmp:
        outdir = os.path.join(tmp, "cis")
        os.makedirs(outdir, exist_ok=True)
        paths = []
        if fmt == "pdf":
            with cis_pdf.WordBatch() as batch:
                for row in rows:
                    try:
                        c = generar_cis.row_to_client(row)
                        if not c.get("doc_number"):
                            continue
                        docx_path = generar_cis.build_cis_file(c, out_dir=outdir)
                        pdf_path = os.path.splitext(docx_path)[0] + ".pdf"
                        batch.convert(docx_path, pdf_path)
                        try:
                            os.remove(docx_path)
                        except OSError:
                            pass
                        paths.append(pdf_path)
                    except Exception:
                        continue
        else:
            for row in rows:
                try:
                    c = generar_cis.row_to_client(row)
                    if not c.get("doc_number"):
                        continue
                    paths.append(generar_cis.build_cis_file(c, out_dir=outdir))
                except Exception:
                    continue
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for p in paths:
                z.write(p, os.path.basename(p))
    buf.seek(0)
    hoy = datetime.now(COL_TZ)
    filename = f"CIS_{fmt}_{scope}_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.zip"
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ========== MICROLINGOTES ENDPOINTS ==========

MICRO_USERS_TABLE = "microlingotes_usuarios"
MICRO_FLAG_TABLE = "microlingotes_validaciones"


def _norm_micro_user(value):
    if not value:
        return ""
    s = str(value).strip()
    if s.startswith("@"):
        s = s[1:]
    return s.strip().lower()


def _micro_to_int(v):
    if v is None or str(v).strip() == "":
        return 0
    try:
        return int(float(str(v)))
    except Exception:
        return 0


def _micro_flags_map():
    res = supabase_inventario.table(MICRO_FLAG_TABLE).select("*").execute()
    m = {}
    for f in (res.data or []):
        key = _norm_micro_user(f.get("telegram_username"))
        if key:
            m[key] = f
    return m


def _attach_micro_flags(rows):
    flags = _micro_flags_map()
    for r in rows:
        f = flags.get(_norm_micro_user(r.get("telegram_username")))
        r["validado"] = bool(f and f.get("validado"))
        r["validated_at"] = (f or {}).get("validated_at")
        r["flag_telegram_user_id"] = (f or {}).get("telegram_user_id")
    return rows


@app.get("/api/microlingotes/data")
async def get_microlingotes_data():
    result = supabase_inventario.table(MICRO_USERS_TABLE).select("*").order("nombre_completo").execute()
    rows = result.data or []
    _attach_micro_flags(rows)
    return {"data": rows, "total": len(rows)}


@app.get("/api/microlingotes/stats")
async def get_microlingotes_stats():
    result = supabase_inventario.table(MICRO_USERS_TABLE).select("*").execute()
    rows = result.data or []
    _attach_micro_flags(rows)
    total = len(rows)
    validados = sum(1 for r in rows if r.get("validado"))
    novalidados = total - validados
    total_cajas = sum(to_int(r.get("cantidad")) for r in rows)
    paises = {
        str(r.get("pais")).strip().upper()
        for r in rows
        if r.get("pais") and str(r.get("pais")).strip() and str(r.get("pais")).strip().upper() != "VACIO"
    }
    ultima = ""
    for r in rows:
        v = r.get("validated_at")
        if v and str(v) > ultima:
            ultima = str(v)
    pct = round(validados / total * 100, 1) if total else 0
    return {
        "total": total,
        "validados": validados,
        "novalidados": novalidados,
        "pct_validado": pct,
        "total_cajas": total_cajas,
        "paises": len(paises),
        "ultima_validacion": ultima,
    }


@app.get("/api/microlingotes/download")
async def download_microlingotes_xlsx():
    result = supabase_inventario.table(MICRO_USERS_TABLE).select("*").order("nombre_completo").execute()
    rows = result.data or []
    _attach_micro_flags(rows)

    wb = Workbook()
    ws = wb.active
    ws.title = "Microlingotes"
    headers = [
        "Usuario Telegram", "Nombres y Apellidos", "Documento", "Pais",
        "Cajas", "Material", "Validado", "Validado el", "Creado", "Actualizado",
    ]
    ws.append(headers)

    for r in rows:
        usuario = r.get("telegram_username")
        if usuario:
            usuario = usuario if usuario.startswith("@") else "@" + usuario
        else:
            usuario = "-"
        ws.append([
            usuario,
            r.get("nombre_completo") or "-",
            r.get("documento") or "-",
            r.get("pais") or "-",
            to_int(r.get("cantidad")),
            r.get("material") or "-",
            "Si" if r.get("validado") else "No",
            formatear_fecha_simple(r.get("validated_at")) if r.get("validated_at") else "-",
            formatear_fecha_simple(r.get("created_at")),
            formatear_fecha_simple(r.get("updated_at")),
        ])

    from openpyxl.styles import Font, PatternFill
    header_fill = PatternFill(start_color="FFC107", end_color="FFC107", fill_type="solid")
    header_font = Font(bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for column in ws.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    hoy = datetime.now(COL_TZ)
    filename = f"Microlingotes_Validacion_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/microlingotes/add")
async def add_microlingotes_entry(data: dict = Body(...)):
    nombre = (data.get("nombre_completo") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    username = _norm_micro_user(data.get("telegram_username"))
    if not username:
        raise HTTPException(status_code=400, detail="El usuario de Telegram es obligatorio")

    dup = supabase_inventario.table(MICRO_USERS_TABLE).select("id").eq("telegram_username", username).execute()
    if dup.data:
        raise HTTPException(status_code=409, detail="Ya existe una persona con ese usuario de Telegram")

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "telegram_username": username,
        "nombre_completo": nombre,
        "documento": (data.get("documento") or "").strip() or None,
        "pais": (data.get("pais") or "").strip() or None,
        "cantidad": _micro_to_int(data.get("cantidad")),
        "material": (data.get("material") or "").strip() or None,
        "created_at": now,
        "updated_at": now,
    }
    res = supabase_inventario.table(MICRO_USERS_TABLE).insert(row).execute()
    return {"success": True, "data": res.data[0] if res.data else row}


@app.put("/api/microlingotes/edit/{record_id}")
async def edit_microlingotes_entry(record_id: int, data: dict = Body(...)):
    existing = supabase_inventario.table(MICRO_USERS_TABLE).select("*").eq("id", record_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    old = existing.data[0]

    nombre = (data.get("nombre_completo") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    username = _norm_micro_user(data.get("telegram_username"))
    if not username:
        raise HTTPException(status_code=400, detail="El usuario de Telegram es obligatorio")

    old_username = _norm_micro_user(old.get("telegram_username"))
    if username != old_username:
        dup = supabase_inventario.table(MICRO_USERS_TABLE).select("id").eq("telegram_username", username).execute()
        if dup.data:
            raise HTTPException(status_code=409, detail="Ya existe una persona con ese usuario de Telegram")

    row = {
        "telegram_username": username,
        "nombre_completo": nombre,
        "documento": (data.get("documento") or "").strip() or None,
        "pais": (data.get("pais") or "").strip() or None,
        "cantidad": _micro_to_int(data.get("cantidad")),
        "material": (data.get("material") or "").strip() or None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase_inventario.table(MICRO_USERS_TABLE).update(row).eq("id", record_id).execute()

    if old_username and username != old_username:
        supabase_inventario.table(MICRO_FLAG_TABLE).update({"telegram_username": username}).eq("telegram_username", old_username).execute()

    return {"success": True}


@app.delete("/api/microlingotes/delete/{record_id}")
async def delete_microlingotes_entry(record_id: int):
    existing = supabase_inventario.table(MICRO_USERS_TABLE).select("*").eq("id", record_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    username = _norm_micro_user(existing.data[0].get("telegram_username"))
    supabase_inventario.table(MICRO_USERS_TABLE).delete().eq("id", record_id).execute()
    if username:
        supabase_inventario.table(MICRO_FLAG_TABLE).delete().eq("telegram_username", username).execute()
    return {"success": True}


@app.post("/api/microlingotes/set-validacion")
async def set_microlingotes_validacion(data: dict = Body(...)):
    username = _norm_micro_user(data.get("telegram_username"))
    if not username:
        raise HTTPException(status_code=400, detail="Usuario de Telegram requerido")
    validado = bool(data.get("validado"))
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "telegram_username": username,
        "validado": validado,
        "validated_at": now if validado else None,
        "updated_at": now,
    }
    supabase_inventario.table(MICRO_FLAG_TABLE).upsert(row, on_conflict="telegram_username").execute()
    return {"success": True, "validado": validado}


# ========== DINARES ENDPOINTS ==========

DINAR_USERS_TABLE = "dinares_usuarios"
DINAR_FLAG_TABLE = "dinares_validaciones"


def _norm_dinar_user(value):
    if not value:
        return ""
    s = str(value).strip()
    if s.startswith("@"):
        s = s[1:]
    return s.strip().lower()


def _dinar_to_int(v):
    if v is None or str(v).strip() == "":
        return 0
    try:
        return int(float(str(v)))
    except Exception:
        return 0


def _dinar_flags_map():
    res = supabase_inventario.table(DINAR_FLAG_TABLE).select("*").execute()
    m = {}
    for f in (res.data or []):
        key = _norm_dinar_user(f.get("telegram_username"))
        if key:
            m[key] = f
    return m


def _attach_dinar_flags(rows):
    flags = _dinar_flags_map()
    for r in rows:
        f = flags.get(_norm_dinar_user(r.get("telegram_username")))
        r["validado"] = bool(f and f.get("validado"))
        r["validated_at"] = (f or {}).get("validated_at")
        r["flag_telegram_user_id"] = (f or {}).get("telegram_user_id")
    return rows


@app.get("/api/dinares/data")
async def get_dinares_data():
    result = supabase_inventario.table(DINAR_USERS_TABLE).select("*").order("nombre_completo").execute()
    rows = result.data or []
    _attach_dinar_flags(rows)
    return {"data": rows, "total": len(rows)}


@app.get("/api/dinares/stats")
async def get_dinares_stats():
    result = supabase_inventario.table(DINAR_USERS_TABLE).select("*").execute()
    rows = result.data or []
    _attach_dinar_flags(rows)
    total = len(rows)
    validados = sum(1 for r in rows if r.get("validado"))
    novalidados = total - validados
    total_cajas = sum(to_int(r.get("cantidad")) for r in rows)
    paises = {
        str(r.get("pais")).strip().upper()
        for r in rows
        if r.get("pais") and str(r.get("pais")).strip() and str(r.get("pais")).strip().upper() != "VACIO"
    }
    ultima = ""
    for r in rows:
        v = r.get("validated_at")
        if v and str(v) > ultima:
            ultima = str(v)
    pct = round(validados / total * 100, 1) if total else 0
    return {
        "total": total,
        "validados": validados,
        "novalidados": novalidados,
        "pct_validado": pct,
        "total_cajas": total_cajas,
        "paises": len(paises),
        "ultima_validacion": ultima,
    }


@app.get("/api/dinares/download")
async def download_dinares_xlsx():
    result = supabase_inventario.table(DINAR_USERS_TABLE).select("*").order("nombre_completo").execute()
    rows = result.data or []
    _attach_dinar_flags(rows)

    wb = Workbook()
    ws = wb.active
    ws.title = "Dinares"
    headers = [
        "Usuario Telegram", "Nombres y Apellidos", "Documento", "Pais",
        "Cajas", "Material", "Validado", "Validado el", "Creado", "Actualizado",
    ]
    ws.append(headers)

    for r in rows:
        usuario = r.get("telegram_username")
        if usuario:
            usuario = usuario if usuario.startswith("@") else "@" + usuario
        else:
            usuario = "-"
        ws.append([
            usuario,
            r.get("nombre_completo") or "-",
            r.get("documento") or "-",
            r.get("pais") or "-",
            to_int(r.get("cantidad")),
            r.get("material") or "-",
            "Si" if r.get("validado") else "No",
            formatear_fecha_simple(r.get("validated_at")) if r.get("validated_at") else "-",
            formatear_fecha_simple(r.get("created_at")),
            formatear_fecha_simple(r.get("updated_at")),
        ])

    from openpyxl.styles import Font, PatternFill
    header_fill = PatternFill(start_color="E53935", end_color="E53935", fill_type="solid")
    header_font = Font(bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for column in ws.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    hoy = datetime.now(COL_TZ)
    filename = f"Dinares_Validacion_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/dinares/add")
async def add_dinares_entry(data: dict = Body(...)):
    nombre = (data.get("nombre_completo") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    username = _norm_dinar_user(data.get("telegram_username"))
    if not username:
        raise HTTPException(status_code=400, detail="El usuario de Telegram es obligatorio")

    dup = supabase_inventario.table(DINAR_USERS_TABLE).select("id").eq("telegram_username", username).execute()
    if dup.data:
        raise HTTPException(status_code=409, detail="Ya existe una persona con ese usuario de Telegram")

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "telegram_username": username,
        "nombre_completo": nombre,
        "documento": (data.get("documento") or "").strip() or None,
        "pais": (data.get("pais") or "").strip() or None,
        "cantidad": _dinar_to_int(data.get("cantidad")),
        "material": (data.get("material") or "").strip() or None,
        "created_at": now,
        "updated_at": now,
    }
    res = supabase_inventario.table(DINAR_USERS_TABLE).insert(row).execute()
    return {"success": True, "data": res.data[0] if res.data else row}


@app.put("/api/dinares/edit/{record_id}")
async def edit_dinares_entry(record_id: int, data: dict = Body(...)):
    existing = supabase_inventario.table(DINAR_USERS_TABLE).select("*").eq("id", record_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    old = existing.data[0]

    nombre = (data.get("nombre_completo") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    username = _norm_dinar_user(data.get("telegram_username"))
    if not username:
        raise HTTPException(status_code=400, detail="El usuario de Telegram es obligatorio")

    old_username = _norm_dinar_user(old.get("telegram_username"))
    if username != old_username:
        dup = supabase_inventario.table(DINAR_USERS_TABLE).select("id").eq("telegram_username", username).execute()
        if dup.data:
            raise HTTPException(status_code=409, detail="Ya existe una persona con ese usuario de Telegram")

    row = {
        "telegram_username": username,
        "nombre_completo": nombre,
        "documento": (data.get("documento") or "").strip() or None,
        "pais": (data.get("pais") or "").strip() or None,
        "cantidad": _dinar_to_int(data.get("cantidad")),
        "material": (data.get("material") or "").strip() or None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase_inventario.table(DINAR_USERS_TABLE).update(row).eq("id", record_id).execute()

    if old_username and username != old_username:
        supabase_inventario.table(DINAR_FLAG_TABLE).update({"telegram_username": username}).eq("telegram_username", old_username).execute()

    return {"success": True}


@app.delete("/api/dinares/delete/{record_id}")
async def delete_dinares_entry(record_id: int):
    existing = supabase_inventario.table(DINAR_USERS_TABLE).select("*").eq("id", record_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    username = _norm_dinar_user(existing.data[0].get("telegram_username"))
    supabase_inventario.table(DINAR_USERS_TABLE).delete().eq("id", record_id).execute()
    if username:
        supabase_inventario.table(DINAR_FLAG_TABLE).delete().eq("telegram_username", username).execute()
    return {"success": True}


@app.post("/api/dinares/set-validacion")
async def set_dinares_validacion(data: dict = Body(...)):
    username = _norm_dinar_user(data.get("telegram_username"))
    if not username:
        raise HTTPException(status_code=400, detail="Usuario de Telegram requerido")
    validado = bool(data.get("validado"))
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "telegram_username": username,
        "validado": validado,
        "validated_at": now if validado else None,
        "updated_at": now,
    }
    supabase_inventario.table(DINAR_FLAG_TABLE).upsert(row, on_conflict="telegram_username").execute()
    return {"success": True, "validado": validado}


# ========== CONTENEDORES ENDPOINTS ==========

CONTENEDORES_USERS_TABLE = "contenedores_usuarios"
CONTENEDORES_FLAG_TABLE = "contenedores_validaciones"


def _norm_contenedor_user(value):
    if not value:
        return ""
    s = str(value).strip()
    if s.startswith("@"):
        s = s[1:]
    return s.strip().lower()


def _contenedor_to_int(v):
    if v is None or str(v).strip() == "":
        return 0
    try:
        return int(float(str(v)))
    except Exception:
        return 0


def _contenedor_flags_map():
    res = supabase_inventario.table(CONTENEDORES_FLAG_TABLE).select("*").execute()
    m = {}
    for f in (res.data or []):
        key = _norm_contenedor_user(f.get("telegram_username"))
        if key:
            m[key] = f
    return m


def _attach_contenedor_flags(rows):
    flags = _contenedor_flags_map()
    for r in rows:
        f = flags.get(_norm_contenedor_user(r.get("telegram_username")))
        r["validado"] = bool(f and f.get("validado"))
        r["validated_at"] = (f or {}).get("validated_at")
        r["flag_telegram_user_id"] = (f or {}).get("telegram_user_id")
    return rows


@app.get("/api/contenedores/data")
async def get_contenedores_data():
    result = supabase_inventario.table(CONTENEDORES_USERS_TABLE).select("*").order("nombre_completo").execute()
    rows = result.data or []
    _attach_contenedor_flags(rows)
    return {"data": rows, "total": len(rows)}


@app.get("/api/contenedores/stats")
async def get_contenedores_stats():
    result = supabase_inventario.table(CONTENEDORES_USERS_TABLE).select("*").execute()
    rows = result.data or []
    _attach_contenedor_flags(rows)
    total = len(rows)
    validados = sum(1 for r in rows if r.get("validado"))
    novalidados = total - validados
    total_cajas = sum(to_int(r.get("cantidad")) for r in rows)
    paises = {
        str(r.get("pais")).strip().upper()
        for r in rows
        if r.get("pais") and str(r.get("pais")).strip() and str(r.get("pais")).strip().upper() != "VACIO"
    }
    ultima = ""
    for r in rows:
        v = r.get("validated_at")
        if v and str(v) > ultima:
            ultima = str(v)
    pct = round(validados / total * 100, 1) if total else 0
    return {
        "total": total,
        "validados": validados,
        "novalidados": novalidados,
        "pct_validado": pct,
        "total_cajas": total_cajas,
        "paises": len(paises),
        "ultima_validacion": ultima,
    }


@app.get("/api/contenedores/download")
async def download_contenedores_xlsx():
    result = supabase_inventario.table(CONTENEDORES_USERS_TABLE).select("*").order("nombre_completo").execute()
    rows = result.data or []
    _attach_contenedor_flags(rows)

    wb = Workbook()
    ws = wb.active
    ws.title = "Contenedores"
    headers = [
        "Usuario Telegram", "Nombres y Apellidos", "Documento", "Pais",
        "Cajas", "Material", "Validado", "Validado el", "Creado", "Actualizado",
    ]
    ws.append(headers)

    for r in rows:
        usuario = r.get("telegram_username")
        if usuario:
            usuario = usuario if usuario.startswith("@") else "@" + usuario
        else:
            usuario = "-"
        ws.append([
            usuario,
            r.get("nombre_completo") or "-",
            r.get("documento") or "-",
            r.get("pais") or "-",
            to_int(r.get("cantidad")),
            r.get("material") or "-",
            "Si" if r.get("validado") else "No",
            formatear_fecha_simple(r.get("validated_at")) if r.get("validated_at") else "-",
            formatear_fecha_simple(r.get("created_at")),
            formatear_fecha_simple(r.get("updated_at")),
        ])

    from openpyxl.styles import Font, PatternFill
    header_fill = PatternFill(start_color="F06292", end_color="F06292", fill_type="solid")
    header_font = Font(bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for column in ws.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    hoy = datetime.now(COL_TZ)
    filename = f"Contenedores_Validacion_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/contenedores/add")
async def add_contenedores_entry(data: dict = Body(...)):
    nombre = (data.get("nombre_completo") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    username = _norm_contenedor_user(data.get("telegram_username"))
    if not username:
        raise HTTPException(status_code=400, detail="El usuario de Telegram es obligatorio")

    dup = supabase_inventario.table(CONTENEDORES_USERS_TABLE).select("id").eq("telegram_username", username).execute()
    if dup.data:
        raise HTTPException(status_code=409, detail="Ya existe una persona con ese usuario de Telegram")

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "telegram_username": username,
        "nombre_completo": nombre,
        "documento": (data.get("documento") or "").strip() or None,
        "pais": (data.get("pais") or "").strip() or None,
        "cantidad": _contenedor_to_int(data.get("cantidad")),
        "material": (data.get("material") or "").strip() or None,
        "created_at": now,
        "updated_at": now,
    }
    res = supabase_inventario.table(CONTENEDORES_USERS_TABLE).insert(row).execute()
    return {"success": True, "data": res.data[0] if res.data else row}


@app.put("/api/contenedores/edit/{record_id}")
async def edit_contenedores_entry(record_id: int, data: dict = Body(...)):
    existing = supabase_inventario.table(CONTENEDORES_USERS_TABLE).select("*").eq("id", record_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    old = existing.data[0]

    nombre = (data.get("nombre_completo") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    username = _norm_contenedor_user(data.get("telegram_username"))
    if not username:
        raise HTTPException(status_code=400, detail="El usuario de Telegram es obligatorio")

    old_username = _norm_contenedor_user(old.get("telegram_username"))
    if username != old_username:
        dup = supabase_inventario.table(CONTENEDORES_USERS_TABLE).select("id").eq("telegram_username", username).execute()
        if dup.data:
            raise HTTPException(status_code=409, detail="Ya existe una persona con ese usuario de Telegram")

    row = {
        "telegram_username": username,
        "nombre_completo": nombre,
        "documento": (data.get("documento") or "").strip() or None,
        "pais": (data.get("pais") or "").strip() or None,
        "cantidad": _contenedor_to_int(data.get("cantidad")),
        "material": (data.get("material") or "").strip() or None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase_inventario.table(CONTENEDORES_USERS_TABLE).update(row).eq("id", record_id).execute()

    if old_username and username != old_username:
        supabase_inventario.table(CONTENEDORES_FLAG_TABLE).update({"telegram_username": username}).eq("telegram_username", old_username).execute()

    return {"success": True}


@app.delete("/api/contenedores/delete/{record_id}")
async def delete_contenedores_entry(record_id: int):
    existing = supabase_inventario.table(CONTENEDORES_USERS_TABLE).select("*").eq("id", record_id).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    username = _norm_contenedor_user(existing.data[0].get("telegram_username"))
    supabase_inventario.table(CONTENEDORES_USERS_TABLE).delete().eq("id", record_id).execute()
    if username:
        supabase_inventario.table(CONTENEDORES_FLAG_TABLE).delete().eq("telegram_username", username).execute()
    return {"success": True}


@app.post("/api/contenedores/set-validacion")
async def set_contenedores_validacion(data: dict = Body(...)):
    username = _norm_contenedor_user(data.get("telegram_username"))
    if not username:
        raise HTTPException(status_code=400, detail="Usuario de Telegram requerido")
    validado = bool(data.get("validado"))
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "telegram_username": username,
        "validado": validado,
        "validated_at": now if validado else None,
        "updated_at": now,
    }
    supabase_inventario.table(CONTENEDORES_FLAG_TABLE).upsert(row, on_conflict="telegram_username").execute()
    return {"success": True, "validado": validado}


# ========== LIDER CANAL ENDPOINTS ==========

LIDER_TABLE = "lider_entradas"
LIDER_FLAG_TABLE = "lider_validaciones"
LIDER_ORIGENES = ["REGALADO", "MEMBRESIA_SORTEO", "PERGAMINO_SORTEO", "COMPRADO"]
LIDER_ENTRADA_FIELDS = ["telegram_username", "nombre_completo", "documento", "pais",
                        "cantidad_1", "material_1", "cantidad_2", "material_2", "origen"]


def _lider_norm_user(value):
    if not value:
        return ""
    s = str(value).strip()
    if s.startswith("@"):
        s = s[1:]
    return s.strip().lower()


def _lider_norm_name(value) -> str:
    if value is None:
        return ""
    s = unicodedata.normalize("NFD", str(value).upper())
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s).strip()


def _lider_norm_doc(value) -> str:
    if value is None:
        return ""
    s = str(value).strip()
    if s.endswith(".0"):
        s = s[:-2]
    s = s.upper().lstrip("0")
    return s or "0"


def _lider_to_int(v):
    if v is None or str(v).strip() == "":
        return 0
    try:
        return int(float(str(v)))
    except Exception:
        return 0


def _lider_flags_map():
    res = supabase_inventario.table(LIDER_FLAG_TABLE).select("*").execute()
    m = {}
    for f in (res.data or []):
        key = (f.get("telegram_username") or "").strip().lower()
        if key:
            m[key] = f
    return m


def _lider_attach_flags(persons):
    flags = _lider_flags_map()
    for p in persons:
        f = None
        for u in p.get("telegram_usernames") or [p.get("telegram_username")]:
            cand = flags.get((u or "").strip().lower())
            if cand:
                f = cand
                break
        p["lider"] = (f or {}).get("lider")
        p["lider_telegram_user_id"] = (f or {}).get("telegram_user_id")
        p["lider_updated_at"] = (f or {}).get("updated_at")
    return persons


def _lider_persons(rows):
    """Agrupa por (nombre normalizado, documento normalizado) => identidad.
    Personas distintas que comparten un telefono/username quedan separadas
    y cada una conserva sus propios totales, origenes, etc."""
    persons = {}
    for r in rows:
        name = _lider_norm_name(r.get("nombre_completo"))
        doc = _lider_norm_doc(r.get("documento"))
        u = (r.get("telegram_username") or "").strip().lower()
        if not name and not doc:
            if not u:
                continue
            key = ("", u)
        else:
            key = (name, doc)
        p = persons.setdefault(key, {
            "telegram_username": None,
            "telegram_usernames": [],
            "nombre_completo": None,
            "documento": None,
            "pais": None,
            "total_membresias": 0,
            "total_pergaminos": 0,
            "num_entradas": 0,
            "created_at": None,
            "updated_at": None,
            "origenes": {
                "membresias": {"regaladas": 0, "sorteo": 0, "compradas": 0},
                "pergaminos": {"regalados": 0, "sorteo": 0, "comprados": 0},
            },
        })
        p["nombre_completo"] = p["nombre_completo"] or r.get("nombre_completo")
        p["documento"] = p["documento"] or r.get("documento")
        p["pais"] = p["pais"] or r.get("pais")
        if u and u not in p["telegram_usernames"]:
            p["telegram_usernames"].append(u)
            if p["telegram_username"] is None:
                p["telegram_username"] = r.get("telegram_username")
        c_created = r.get("created_at")
        c_updated = r.get("updated_at")
        if c_created and (not p["created_at"] or c_created < p["created_at"]):
            p["created_at"] = c_created
        if c_updated and (not p["updated_at"] or c_updated > p["updated_at"]):
            p["updated_at"] = c_updated
        c1 = _lider_to_int(r.get("cantidad_1"))
        c2 = _lider_to_int(r.get("cantidad_2"))
        p["total_membresias"] += c1
        p["total_pergaminos"] += c2
        p["num_entradas"] += 1
        o = r.get("origen")
        if o == "REGALADO":
            p["origenes"]["membresias"]["regaladas"] += c1
            p["origenes"]["pergaminos"]["regalados"] += c2
        elif o == "MEMBRESIA_SORTEO":
            p["origenes"]["membresias"]["sorteo"] += c1
        elif o == "PERGAMINO_SORTEO":
            p["origenes"]["pergaminos"]["sorteo"] += c2
        elif o == "COMPRADO":
            p["origenes"]["membresias"]["compradas"] += c1
            p["origenes"]["pergaminos"]["comprados"] += c2
    out = list(persons.values())
    out.sort(key=lambda x: (x.get("nombre_completo") or "").upper())
    return _lider_attach_flags(out)


def _lider_filter_entries(rows, nombre="", documento=""):
    """Devuelve las entradas que pertenecen a la identidad (nombre, documento)."""
    if not nombre and not documento:
        return rows
    want_name = _lider_norm_name(nombre) if nombre else None
    want_doc = _lider_norm_doc(documento) if documento else None
    filtered = []
    for r in rows:
        n = _lider_norm_name(r.get("nombre_completo"))
        d = _lider_norm_doc(r.get("documento"))
        if want_name is not None and n != want_name:
            continue
        if want_doc is not None and d != want_doc:
            continue
        filtered.append(r)
    return filtered


@app.get("/api/lider/data")
async def get_lider_data():
    result = supabase_inventario.table(LIDER_TABLE).select("*").order("id", desc=True).execute()
    rows = result.data or []
    persons = _lider_persons(rows)
    return {"data": persons, "total": len(persons), "total_entradas": len(rows)}


@app.get("/api/lider/entradas")
async def get_lider_entradas(username: str = "", nombre: str = "", documento: str = ""):
    q = supabase_inventario.table(LIDER_TABLE).select("*").order("id", desc=True)
    if username:
        q = q.eq("telegram_username", _lider_norm_user(username))
    result = q.execute()
    rows = result.data or []
    if nombre or documento:
        rows = _lider_filter_entries(rows, nombre, documento)
    return {"data": rows, "total": len(rows)}


@app.get("/api/lider/stats")
async def get_lider_stats():
    result = supabase_inventario.table(LIDER_TABLE).select("*").execute()
    rows = result.data or []
    persons = _lider_persons(rows)
    total_personas = len(persons)
    total_membresias = sum(_lider_to_int(r.get("cantidad_1")) for r in rows)
    total_pergaminos = sum(_lider_to_int(r.get("cantidad_2")) for r in rows)
    total_entradas = len(rows)

    lider_maria = sum(1 for p in persons if p.get("lider") == "MARIA")
    lider_otro = sum(1 for p in persons if p.get("lider") == "OTRO")
    lider_na = total_personas - lider_maria - lider_otro

    origen_counts = {}
    for r in rows:
        o = r.get("origen") or "DESCONOCIDO"
        origen_counts[o] = origen_counts.get(o, 0) + 1

    paises = {
        str(r.get("pais")).strip().upper()
        for r in rows
        if r.get("pais") and str(r.get("pais")).strip() and str(r.get("pais")).strip().upper() != "VACIO"
    }
    ultima = max(
        (r.get("updated_at") or r.get("created_at") or "") for r in rows
    ) if rows else None

    return {
        "total_personas": total_personas,
        "total_entradas": total_entradas,
        "total_membresias": total_membresias,
        "total_pergaminos": total_pergaminos,
        "lider_maria": lider_maria,
        "lider_otro": lider_otro,
        "lider_na": lider_na,
        "origenes": origen_counts,
        "paises": len(paises),
        "ultima_actualizacion": ultima,
    }


@app.get("/api/lider/download")
async def download_lider_xlsx():
    result = supabase_inventario.table(LIDER_TABLE).select("*").order("id", desc=True).execute()
    rows = result.data or []
    persons = _lider_persons(rows)

    wb = Workbook()
    ws = wb.active
    ws.title = "Lider Canal"

    headers = [
        "Usuario Telegram", "Nombres y Apellidos", "Cedula/DNI", "Pais",
        "Total Membresias", "Total Pergaminos", "Entradas",
        "Membresias Regaladas", "Membresias Sorteo", "Membresias Compradas",
        "Pergaminos Regalados", "Pergaminos Sorteo", "Pergaminos Comprados",
        "Lider",
    ]
    ws.append(headers)

    for p in persons:
        lider_txt = "N/A"
        if p.get("lider") == "MARIA":
            lider_txt = "MARIA ELVIRA SUS"
        elif p.get("lider") == "OTRO":
            lider_txt = "OTRO"
        usuario = p.get("telegram_username") or "-"
        if usuario and not str(usuario).startswith("@"):
            usuario = "@" + usuario
        o = p.get("origenes") or {}
        ws.append([
            usuario,
            p.get("nombre_completo") or "-",
            p.get("documento") or "-",
            p.get("pais") or "-",
            _lider_to_int(p.get("total_membresias")),
            _lider_to_int(p.get("total_pergaminos")),
            _lider_to_int(p.get("num_entradas")),
            _lider_to_int(o.get("membresias", {}).get("regaladas")),
            _lider_to_int(o.get("membresias", {}).get("sorteo")),
            _lider_to_int(o.get("membresias", {}).get("compradas")),
            _lider_to_int(o.get("pergaminos", {}).get("regalados")),
            _lider_to_int(o.get("pergaminos", {}).get("sorteo")),
            _lider_to_int(o.get("pergaminos", {}).get("comprados")),
            lider_txt,
        ])

    from openpyxl.styles import Font, PatternFill
    header_fill = PatternFill(start_color="BA68C8", end_color="BA68C8", fill_type="solid")
    header_font = Font(bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for column in ws.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    hoy = datetime.now(COL_TZ)
    filename = f"Lider_Canal_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _parse_lider_entrada(data):
    row = {}
    for k in LIDER_ENTRADA_FIELDS:
        if k not in data:
            continue
        v = data[k]
        if k in ("cantidad_1", "cantidad_2"):
            row[k] = _lider_to_int(v)
        elif k == "origen":
            o = str(v or "").strip().upper()
            row[k] = o if o in LIDER_ORIGENES else "REGALADO"
        else:
            row[k] = str(v).strip() if v and str(v).strip() else None
    return row


@app.post("/api/lider/entradas/add")
async def add_lider_entrada(data: dict = Body(...)):
    row = _parse_lider_entrada(data)
    username = row.get("telegram_username")
    nombre = row.get("nombre_completo")
    if not username and not nombre:
        raise HTTPException(status_code=400, detail="El usuario de Telegram o el nombre es obligatorio")
    now = datetime.now(timezone.utc).isoformat()
    row["created_at"] = now
    row["updated_at"] = now
    result = supabase_inventario.table(LIDER_TABLE).insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear la entrada")
    return {"success": True, "data": result.data[0]}


@app.put("/api/lider/entradas/edit/{record_id}")
async def edit_lider_entrada(record_id: int, data: dict = Body(...)):
    result = supabase_inventario.table(LIDER_TABLE).select("*").eq("id", record_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    row = _parse_lider_entrada(data)
    if not row:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")
    row["updated_at"] = datetime.now(timezone.utc).isoformat()
    supabase_inventario.table(LIDER_TABLE).update(row).eq("id", record_id).execute()
    return {"success": True}


@app.delete("/api/lider/entradas/delete/{record_id}")
async def delete_lider_entrada(record_id: int):
    result = supabase_inventario.table(LIDER_TABLE).select("id").eq("id", record_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    supabase_inventario.table(LIDER_TABLE).delete().eq("id", record_id).execute()
    return {"success": True}


@app.post("/api/lider/set-lider")
async def set_lider_flag(data: dict = Body(...)):
    username = _lider_norm_user(data.get("telegram_username"))
    if not username:
        raise HTTPException(status_code=400, detail="Usuario de Telegram requerido")
    lider = data.get("lider")
    if lider not in ("MARIA", "OTRO"):
        lider = None
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "telegram_username": username,
        "lider": lider,
        "updated_at": now,
    }
    if data.get("telegram_user_id") is not None:
        row["telegram_user_id"] = data["telegram_user_id"]
    supabase_inventario.table(LIDER_FLAG_TABLE).upsert(row, on_conflict="telegram_username").execute()
    return {"success": True, "lider": lider}


@app.post("/api/lider/usuario/add")
async def add_lider_usuario(data: dict = Body(...)):
    nombre = (data.get("nombre_completo") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio")
    username = _lider_norm_user(data.get("telegram_username")) or None
    documento = (data.get("documento") or "").strip() or None
    pais = (data.get("pais") or "").strip() or None
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "telegram_username": username,
        "nombre_completo": nombre,
        "documento": documento,
        "pais": pais,
        "cantidad_1": 0,
        "material_1": None,
        "cantidad_2": 0,
        "material_2": None,
        "origen": "REGALADO",
        "created_at": now,
        "updated_at": now,
    }
    result = supabase_inventario.table(LIDER_TABLE).insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear el usuario")
    return {"success": True, "data": result.data[0]}


def _lider_person_rows(rows, nombre="", documento="", username=""):
    """Devuelve TODAS las entradas de una identidad (nombre, documento).
    Si no hay nombre ni documento, se localiza por username."""
    if nombre or documento:
        return _lider_filter_entries(rows, nombre, documento)
    if username:
        u = _lider_norm_user(username)
        return [r for r in rows if _lider_norm_user(r.get("telegram_username")) == u]
    return []


def _lider_flag_cleanup_for_usernames(usernames, remaining_ids):
    """Elimina la flag de lider_validaciones de cada username que ya no
    aparece en NINGUNA entrada (protege usernames compartidos)."""
    for u in usernames:
        if not u:
            continue
        used = (
            supabase_inventario.table(LIDER_TABLE)
            .select("id")
            .eq("telegram_username", u)
            .execute()
            .data
            or []
        )
        still_used = any(r.get("id") not in remaining_ids for r in used)
        if not still_used:
            supabase_inventario.table(LIDER_FLAG_TABLE).delete().eq("telegram_username", u).execute()


@app.put("/api/lider/persona/edit")
async def edit_lider_persona(data: dict = Body(...)):
    nombre = data.get("nombre") or ""
    documento = data.get("documento") or ""
    username = data.get("telegram_username") or ""

    new_nombre = (data.get("new_nombre") or "").strip() or None
    new_documento = (data.get("new_documento") or "").strip() or None
    new_pais = (data.get("new_pais") or "").strip() or None
    new_username = _lider_norm_user(data.get("new_telegram_username")) or None

    if not new_nombre and not new_documento:
        raise HTTPException(status_code=400, detail="El nombre o el documento es obligatorio")

    result = supabase_inventario.table(LIDER_TABLE).select("*").execute()
    rows = result.data or []
    targets = _lider_person_rows(rows, nombre, documento, username)
    if not targets:
        raise HTTPException(status_code=404, detail="Persona no encontrada")

    ids = [r["id"] for r in targets]
    old_usernames = sorted({_lider_norm_user(r.get("telegram_username")) for r in targets if r.get("telegram_username")})

    update = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if new_nombre is not None:
        update["nombre_completo"] = new_nombre
    if new_documento is not None:
        update["documento"] = new_documento
    if new_pais is not None:
        update["pais"] = new_pais
    if new_username is not None:
        update["telegram_username"] = new_username

    supabase_inventario.table(LIDER_TABLE).update(update).in_("id", ids).execute()

    # Migracion de la flag si cambio el username
    if new_username is not None and new_username not in old_usernames:
        flag_to_move = None
        for old in old_usernames:
            f = supabase_inventario.table(LIDER_FLAG_TABLE).select("*").eq("telegram_username", old).execute().data or []
            if f:
                flag_to_move = f[0]
                break
        _lider_flag_cleanup_for_usernames(old_usernames, set(ids))
        if flag_to_move is not None:
            now = datetime.now(timezone.utc).isoformat()
            supabase_inventario.table(LIDER_FLAG_TABLE).upsert({
                "telegram_username": new_username,
                "telegram_user_id": flag_to_move.get("telegram_user_id"),
                "lider": flag_to_move.get("lider"),
                "updated_at": now,
            }, on_conflict="telegram_username").execute()

    return {"success": True, "updated": len(ids)}


@app.delete("/api/lider/persona/delete")
async def delete_lider_persona(data: dict = Body(...)):
    nombre = data.get("nombre") or ""
    documento = data.get("documento") or ""
    username = data.get("telegram_username") or ""

    result = supabase_inventario.table(LIDER_TABLE).select("*").execute()
    rows = result.data or []
    targets = _lider_person_rows(rows, nombre, documento, username)
    if not targets:
        raise HTTPException(status_code=404, detail="Persona no encontrada")

    ids = [r["id"] for r in targets]
    usernames = sorted({_lider_norm_user(r.get("telegram_username")) for r in targets if r.get("telegram_username")})

    supabase_inventario.table(LIDER_TABLE).delete().in_("id", ids).execute()
    _lider_flag_cleanup_for_usernames(usernames, set(ids))

    return {"success": True, "deleted": len(ids)}


# ========== REPARTICION VAQUITA ENDPOINTS ==========

REPARTICION_TABLE = "reparticion_vaquita"


@app.get("/api/reparticion/data")
async def get_reparticion_data():
    result = supabase_inventario.table(REPARTICION_TABLE).select("*").order("id", desc=True).execute()
    rows = result.data or []
    return {"data": rows, "total": len(rows)}


@app.get("/api/reparticion/stats")
async def get_reparticion_stats():
    result = supabase_inventario.table(REPARTICION_TABLE).select("*").execute()
    rows = result.data or []
    total = len(rows)
    total_aporte = sum(int(r.get("aporte") or 0) for r in rows)
    total_zim = sum(int(r.get("cant_zim") or 0) for r in rows)
    total_dinar = sum(int(r.get("cant_dinar") or 0) for r in rows)
    total_oro = sum(int(r.get("cant_oro") or 0) for r in rows)
    total_cajas = sum(int(r.get("cajas_total") or 0) for r in rows)
    matched = sum(1 for r in rows if r.get("nombres"))
    unmatched = total - matched

    return {
        "total": total,
        "total_aporte": total_aporte,
        "total_zim": total_zim,
        "total_dinar": total_dinar,
        "total_oro": total_oro,
        "total_cajas": total_cajas,
        "matched": matched,
        "unmatched": unmatched,
    }


REPARTICION_FIELDS = ["telegram_username", "aporte", "cant_zim", "cant_dinar", "cant_oro", "cajas_total", "nombres", "documento", "pais"]


def _parse_reparticion_row(data):
    row = {}
    for k in REPARTICION_FIELDS:
        if k in data:
            v = data[k]
            if k in ("aporte", "cant_zim", "cant_dinar", "cant_oro", "cajas_total"):
                try:
                    row[k] = int(v) if v and str(v).strip() else None
                except (ValueError, TypeError):
                    row[k] = None
            else:
                row[k] = str(v).strip() if v and str(v).strip() else None
    return row


@app.post("/api/reparticion/add")
async def add_reparticion_entry(data: dict = Body(...)):
    now = datetime.now(timezone.utc).isoformat()
    row = _parse_reparticion_row(data)
    row["created_at"] = now
    row["updated_at"] = now
    result = supabase_inventario.table(REPARTICION_TABLE).insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear el registro")
    return {"success": True, "data": result.data[0]}


@app.put("/api/reparticion/edit/{record_id}")
async def edit_reparticion_entry(record_id: int, data: dict = Body(...)):
    result = supabase_inventario.table(REPARTICION_TABLE).select("*").eq("id", record_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")

    row = _parse_reparticion_row(data)

    if row:
        row["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase_inventario.table(REPARTICION_TABLE).update(row).eq("id", record_id).execute()

    return {"success": True}


@app.get("/api/reparticion/download")
async def download_reparticion_xlsx():
    result = supabase_inventario.table(REPARTICION_TABLE).select("*").order("id", desc=True).execute()
    rows = result.data or []

    wb = Workbook()
    ws = wb.active
    ws.title = "Reparticion Vaquita"

    headers = [
        "Usuario Telegram", "Aporte COP",
        "Cant. ZIM", "Cant. DINAR", "Cant. ORO", "Cajas Total",
        "Nombres y Apellidos", "Documento de Identidad", "Pais",
    ]
    ws.append(headers)

    for r in rows:
        ws.append([
            r.get("telegram_username") or "-",
            int(r.get("aporte") or 0),
            int(r.get("cant_zim") or 0),
            int(r.get("cant_dinar") or 0),
            int(r.get("cant_oro") or 0),
            int(r.get("cajas_total") or 0),
            r.get("nombres") or "-",
            r.get("documento") or "-",
            r.get("pais") or "-",
        ])

    from openpyxl.styles import Font, PatternFill
    header_fill = PatternFill(start_color="FF8A65", end_color="FF8A65", fill_type="solid")
    header_font = Font(bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for column in ws.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    hoy = datetime.now(COL_TZ)
    filename = f"Reparticion_Vaquita_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/api/reparticion/delete/{record_id}")
async def delete_reparticion_entry(record_id: int):
    result = supabase_inventario.table(REPARTICION_TABLE).select("*").eq("id", record_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    supabase_inventario.table(REPARTICION_TABLE).delete().eq("id", record_id).execute()
    return {"success": True}


# ========== VAQUITA DIRECTORIO + PRODUCTOS ENDPOINTS ==========

VAQUITA_MODULES = {
    "directorio": {
        "table": "directorio_vaquitas",
        "title": "Directorio de Clientes Vaquitas",
        "fields": ["telegram_username", "nombres", "documento", "pais", "productos"],
        "num_fields": [],
        "json_fields": ["productos"],
        "headers": ["Usuario Telegram", "Nombres y Apellidos", "Documento", "Pais", "Productos"],
    },
    "aguila_roja": {
        "table": "participaciones_aguila_roja",
        "title": "Participaciones Aguila Roja",
        "fields": ["telegram_username", "nombres", "documento", "pais", "cupo", "porcentaje"],
        "num_fields": ["cupo", "porcentaje"],
        "headers": ["Usuario Telegram", "Nombres y Apellidos", "Documento", "Pais", "Cupo", "Porcentaje"],
    },
    "aguila_verde": {
        "table": "participaciones_aguila_verde",
        "title": "Participaciones Aguila Verde",
        "fields": ["telegram_username", "nombres", "documento", "pais", "cupos", "porcentaje"],
        "num_fields": ["cupos", "porcentaje"],
        "headers": ["Usuario Telegram", "Nombres y Apellidos", "Documento", "Pais", "Cupos", "Porcentaje"],
    },
    "googolplex": {
        "table": "participaciones_vaquita_googolplex",
        "title": "Participaciones Vaquita Googolplex",
        "fields": ["telegram_username", "nombres", "documento", "pais", "cantidad", "tipo"],
        "num_fields": ["cantidad"],
        "headers": ["Usuario Telegram", "Nombres y Apellidos", "Documento", "Pais", "Cantidad", "Tipo"],
    },
    "listado1": {
        "table": "participaciones_vaquita_listado1",
        "title": "Listado 1 - Vaquita 20 Contenedores",
        "fields": ["telegram_username", "nombres", "documento", "pais", "cajas_zim", "cajas_dinar", "cajas_oro", "material_zim", "material_dinar", "material_oro"],
        "num_fields": ["cajas_zim", "cajas_dinar", "cajas_oro"],
        "headers": ["Usuario Telegram", "Nombres y Apellidos", "Documento", "Pais", "Cajas ZIM", "Cajas DINAR", "Cajas ORO", "Material ZIM", "Material DINAR", "Material ORO"],
    },
    "listado2": {
        "table": "participaciones_vaquita_listado2",
        "title": "Listado 2 - Vaquita 20 Contenedores",
        "fields": ["telegram_username", "nombres", "documento", "pais", "cajas_zim", "cajas_dinar", "cajas_oro", "material_zim", "material_dinar", "material_oro"],
        "num_fields": ["cajas_zim", "cajas_dinar", "cajas_oro"],
        "headers": ["Usuario Telegram", "Nombres y Apellidos", "Documento", "Pais", "Cajas ZIM", "Cajas DINAR", "Cajas ORO", "Material ZIM", "Material DINAR", "Material ORO"],
    },
}


def _vaquita_mod(mod):
    cfg = VAQUITA_MODULES.get(mod)
    if not cfg:
        raise HTTPException(status_code=404, detail="Modulo no encontrado")
    return cfg


def _parse_vaquita_row(cfg, data):
    row = {}
    for k in cfg["fields"]:
        if k in data:
            v = data[k]
            if k in cfg.get("json_fields", []):
                if isinstance(v, list):
                    row[k] = v
                elif v and str(v).strip():
                    row[k] = [x.strip() for x in str(v).replace(";", ",").split(",") if x.strip()]
                else:
                    row[k] = []
            elif k in cfg["num_fields"]:
                try:
                    row[k] = int(float(v)) if v and str(v).strip() else None
                except (ValueError, TypeError):
                    row[k] = None
            else:
                row[k] = str(v).strip() if v and str(v).strip() else None
    return row


@app.get("/api/vaquitas/{mod}/data")
async def get_vaquitas_data(mod: str):
    cfg = _vaquita_mod(mod)
    result = supabase_inventario.table(cfg["table"]).select("*").order("id", desc=True).execute()
    rows = result.data or []
    return {"data": rows, "total": len(rows)}


@app.post("/api/vaquitas/{mod}/add")
async def add_vaquitas_entry(mod: str, data: dict = Body(...)):
    cfg = _vaquita_mod(mod)
    now = datetime.now(timezone.utc).isoformat()
    row = _parse_vaquita_row(cfg, data)
    row["created_at"] = now
    row["updated_at"] = now
    result = supabase_inventario.table(cfg["table"]).insert(row).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear el registro")
    return {"success": True, "data": result.data[0]}


@app.put("/api/vaquitas/{mod}/edit/{record_id}")
async def edit_vaquitas_entry(mod: str, record_id: int, data: dict = Body(...)):
    cfg = _vaquita_mod(mod)
    result = supabase_inventario.table(cfg["table"]).select("*").eq("id", record_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    row = _parse_vaquita_row(cfg, data)
    if row:
        row["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase_inventario.table(cfg["table"]).update(row).eq("id", record_id).execute()
    return {"success": True}


@app.delete("/api/vaquitas/{mod}/delete/{record_id}")
async def delete_vaquitas_entry(mod: str, record_id: int):
    cfg = _vaquita_mod(mod)
    result = supabase_inventario.table(cfg["table"]).select("*").eq("id", record_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    supabase_inventario.table(cfg["table"]).delete().eq("id", record_id).execute()
    return {"success": True}


@app.get("/api/vaquitas/{mod}/download")
async def download_vaquitas_xlsx(mod: str):
    cfg = _vaquita_mod(mod)
    result = supabase_inventario.table(cfg["table"]).select("*").order("id", desc=True).execute()
    rows = result.data or []

    wb = Workbook()
    ws = wb.active
    ws.title = cfg["title"][:30]

    def fmt(v):
        if v is None:
            return "-"
        if isinstance(v, list):
            return ", ".join(str(x) for x in v)
        return v

    ws.append(cfg["headers"])
    for r in rows:
        ws.append([fmt(r.get(k)) for k in cfg["fields"]])

    from openpyxl.styles import Font, PatternFill
    header_fill = PatternFill(start_color="FF8A65", end_color="FF8A65", fill_type="solid")
    header_font = Font(bold=True, size=11)
    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font

    for column in ws.columns:
        max_len = 0
        col_letter = column[0].column_letter
        for cell in column:
            try:
                val = str(cell.value) if cell.value else ""
                max_len = max(max_len, len(val))
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(max_len + 4, 40)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    hoy = datetime.now(COL_TZ)
    filename = f"{mod}_{hoy.day:02d}-{hoy.month:02d}-{hoy.year}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ========== CONSULTA ENDPOINT ==========


def _match_q(val, q):
    return val and q.lower() in str(val).lower()


def _norm(val):
    if not val:
        return ""
    return str(val).strip().lower()


@app.get("/api/consulta")
async def get_consulta(q: str = ""):
    q = q.strip()
    if len(q) < 2:
        return {"query": q, "total": 0, "persons": []}

    persons = {}

    def get_or_create(key):
        if key not in persons:
            persons[key] = {
                "name": "",
                "identifiers": {},
                "bot": {"exists": False},
                "ayudas": {"exists": False},
                "inventario": {"exists": False},
                "pagos": {"exists": False},
            }
        return persons[key]

    def link_record(rec, key_fields, source_name, extract_fn):
        def link_key(r):
            parts = []
            for k in key_fields:
                v = _norm(r.get(k))
                if v:
                    parts.append(f"{k}:{v}")
            return "|".join(parts) if parts else None

        keys = set()
        for field in key_fields:
            v = rec.get(field)
            if v is not None and str(v).strip():
                keys.add(("field:" + str(v).strip().lower(), source_name))

        if not keys:
            keys.add((source_name + ":" + str(id(rec)), source_name))

        for k, src in keys:
            p = get_or_create(k)
            extract_fn(p, rec)
            for other_k, other_src in keys:
                if other_k != k:
                    persons[other_k] = p

    # --- 1. Buscar en BOT (usuarios_funlidi) ---
    try:
        bot_result = supabase.table("usuarios_funlidi").select("*").execute()
        for r in (bot_result.data or []):
            if not any(_match_q(r.get(f), q) for f in ["nombres_completos", "numero_documento", "correo_electronico", "telegram_username"]):
                continue
            def extract_bot(p, rec):
                p["name"] = p["name"] or rec.get("nombres_completos") or ""
                p["identifiers"]["telegram_user_id"] = rec.get("telegram_user_id")
                p["identifiers"]["telegram_username"] = rec.get("telegram_username") or p["identifiers"].get("telegram_username")
                p["identifiers"]["dni"] = rec.get("numero_documento") or p["identifiers"].get("dni")
                p["identifiers"]["email"] = rec.get("correo_electronico") or p["identifiers"].get("email")
                p["bot"] = {
                    "exists": True,
                    "nombres_completos": rec.get("nombres_completos"),
                    "numero_documento": rec.get("numero_documento"),
                    "correo_electronico": rec.get("correo_electronico"),
                    "telegram_username": rec.get("telegram_username"),
                    "updated_at": rec.get("updated_at") or rec.get("created_at"),
                }
            link_record(r, ["telegram_user_id", "numero_documento", "correo_electronico"], "bot", extract_bot)
    except Exception:
        pass

    # --- 2. Buscar en AYUDAS (ayudas_humanitarias) ---
    try:
        ayudas_result = supabase_ayudas.table(AYUDAS_TABLE).select("*").execute()
        for r in (ayudas_result.data or []):
            if not any(_match_q(r.get(f), q) for f in ["nombre", "dni", "correo", "telegram_username"]):
                continue
            def extract_ayudas(p, rec):
                p["name"] = p["name"] or rec.get("nombre") or ""
                p["identifiers"]["telegram_user_id"] = rec.get("telegram_user_id") or p["identifiers"].get("telegram_user_id")
                p["identifiers"]["telegram_username"] = rec.get("telegram_username") or p["identifiers"].get("telegram_username")
                p["identifiers"]["dni"] = rec.get("dni") or p["identifiers"].get("dni")
                p["identifiers"]["email"] = rec.get("correo") or p["identifiers"].get("email")
                benef_count = 0
                uid = rec.get("telegram_user_id")
                if uid is not None:
                    try:
                        benef = supabase_ayudas.table(AYUDAS_BENEF_TABLE).select("*").eq("telegram_user_id", uid).execute()
                        benef_count = len(benef.data or [])
                    except Exception:
                        pass
                p["ayudas"] = {
                    "exists": True,
                    "nombre": rec.get("nombre"),
                    "dni": rec.get("dni"),
                    "pais": rec.get("pais"),
                    "estado": _ayudas_estado(rec),
                    "beneficiarios": benef_count,
                    "telefono": rec.get("telefono"),
                    "correo": rec.get("correo"),
                    "updated_at": rec.get("updated_at") or rec.get("created_at"),
                }
            link_record(r, ["telegram_user_id", "dni", "correo"], "ayudas", extract_ayudas)
    except Exception:
        pass

    # --- 3. Buscar en INVENTARIO (inventario_adquisiciones) ---
    try:
        inv_result = supabase_inventario.table(INVENTARIO_TABLE).select("*").execute()
        for r in (inv_result.data or []):
            if not any(_match_q(r.get(f), q) for f in ["nombre", "dni", "telegram_username"]):
                continue
            def extract_inventario(p, rec):
                p["name"] = p["name"] or rec.get("nombre") or ""
                p["identifiers"]["telegram_user_id"] = rec.get("telegram_user_id") or p["identifiers"].get("telegram_user_id")
                p["identifiers"]["telegram_username"] = rec.get("telegram_username") or p["identifiers"].get("telegram_username")
                p["identifiers"]["dni"] = rec.get("dni") or p["identifiers"].get("dni")
                p["inventario"] = {
                    "exists": True,
                    "nombre": rec.get("nombre"),
                    "dni": rec.get("dni"),
                    "pais": rec.get("pais"),
                    "materiales": {
                        "cajamicro": to_int(rec.get("cajamicro")),
                        "cajadinar": to_int(rec.get("cajadinar")),
                        "per_aleman": to_int(rec.get("per_aleman")),
                        "per_top": to_int(rec.get("per_top")),
                        "per_dragon": to_int(rec.get("per_dragon")),
                    },
                    "updated_at": rec.get("updated_at") or rec.get("created_at"),
                }
            link_record(r, ["telegram_user_id", "dni"], "inventario", extract_inventario)
    except Exception:
        pass

    # --- 4. Buscar en PAGOS (Excel) ---
    try:
        pagos_records = _load_pagos_data()
        for r in pagos_records:
            if not any(_match_q(r.get(f), q) for f in ["nombres", "identificacion"]):
                continue
            def extract_pagos(p, rec):
                p["name"] = p["name"] or rec.get("nombres") or ""
                p["identifiers"]["dni"] = rec.get("identificacion") or p["identifiers"].get("dni")
                pagos_data = p.get("pagos", {})
                if not pagos_data.get("exists"):
                    pagos_data["exists"] = True
                    pagos_data["transacciones"] = 0
                    pagos_data["total_cop"] = 0
                    pagos_data["detalles"] = []
                    pagos_data["ultimo_pago"] = ""
                pagos_data["transacciones"] += 1
                pagos_data["total_cop"] += int(rec.get("valor", 0))
                if rec.get("fecha") and rec["fecha"] > pagos_data.get("ultimo_pago", ""):
                    pagos_data["ultimo_pago"] = rec["fecha"]
                pagos_data["detalles"].append({
                    "fecha": rec.get("fecha", ""),
                    "flayer": rec.get("flayer", ""),
                    "valor": int(rec.get("valor", 0)),
                })
                p["pagos"] = pagos_data
            link_record(r, ["identificacion"], "pagos", extract_pagos)
    except Exception:
        pass

    # --- 5. Buscar en CRM (B. DATOS - FARLEY) ---
    try:
        crm_data = _load_crm_data()
        if crm_data and crm_data.get("members"):
            for m in crm_data["members"]:
                if not any(_match_q(m.get(f), q) for f in ["name", "cedula", "email", "telegram", "phone"]):
                    continue
                def extract_crm(p, rec):
                    p["name"] = p["name"] or rec.get("name") or ""
                    p["identifiers"]["dni"] = rec.get("cedula") or p["identifiers"].get("dni")
                    p["identifiers"]["email"] = rec.get("email") or p["identifiers"].get("email")
                    tags = set()
                    for pu in rec.get("purchases", []):
                        for t in pu.get("tags", []):
                            tags.add(t)
                    p["farley"] = {
                        "exists": True,
                        "name": rec.get("name"),
                        "cedula": rec.get("cedula"),
                        "email": rec.get("email"),
                        "telegram": rec.get("telegram"),
                        "phone": rec.get("phone"),
                        "city": rec.get("city"),
                        "department": rec.get("department"),
                        "country": rec.get("country"),
                        "purchase_count": rec.get("purchase_count", 0),
                        "total_spent": rec.get("total_spent", 0),
                        "categories": sorted(tags),
                        "purchases": sorted(rec.get("purchases", []), key=lambda x: x.get("date", ""), reverse=True)[:10],
                    }
                link_record(m, ["cedula", "email"], "farley", extract_crm)
    except Exception:
        pass

    # Deduplicate persons dict into a list
    seen = set()
    result_list = []
    for key, p in persons.items():
        pid = str(p["identifiers"])
        if pid in seen:
            continue
        seen.add(pid)
        # Sort pagos detalles newest first
        if p["pagos"]["exists"]:
            p["pagos"]["detalles"].sort(key=lambda x: x.get("fecha", ""), reverse=True)
            p["pagos"]["detalles"] = p["pagos"]["detalles"][:10]
        result_list.append(p)

    result_list.sort(key=lambda p: p["name"] or "")

    return {"query": q, "total": len(result_list), "persons": result_list}


# ========== VERIFICACION ENDPOINT ==========


@app.get("/api/verificacion")
async def get_verificacion(q: str = ""):
    crm = _load_crm_data()
    inv_result = supabase_inventario.table(INVENTARIO_TABLE).select("*").execute()
    inventario = inv_result.data or []

    # Build INVENTARIO lookup
    inv_by_dni = defaultdict(list)
    inv_by_tg = defaultdict(list)
    for r in inventario:
        dni = (r.get("dni") or "").strip().upper()
        if dni:
            inv_by_dni[dni].append(r)
        tg = (r.get("telegram_username") or "").strip().lower()
        if tg:
            inv_by_tg[tg].append(r)

    matched_inv_ids = set()
    persons = []

    for m in (crm or {}).get("members", []):
        name = m.get("name", "") or ""
        cedula = (m.get("cedula") or "").strip().upper()
        telegram_handle = (m.get("telegram") or "").strip().lower().lstrip("@")

        inv_recs = []
        match_source = None

        if cedula and cedula in inv_by_dni:
            inv_recs.extend(inv_by_dni[cedula])
            match_source = "cedula"

        if telegram_handle and telegram_handle in inv_by_tg:
            for ir in inv_by_tg[telegram_handle]:
                if ir not in inv_recs:
                    inv_recs.append(ir)
            if not match_source:
                match_source = "telegram"

        if not inv_recs and name:
            name_upper = name.upper().strip()
            for r in inventario:
                inv_name = (r.get("nombre") or "").upper().strip()
                if inv_name and (inv_name == name_upper or inv_name in name_upper or name_upper in inv_name):
                    if r not in inv_recs:
                        inv_recs.append(r)
                        match_source = "name"
                        break

        for ir in inv_recs:
            matched_inv_ids.add(ir.get("telegram_user_id"))

        # Compute FARLEY totals
        farley = {
            "present": True,
            "dinar_qty": 0,
            "gold_qty": 0,
            "gold_grams": 0,
            "membership_qty": 0,
            "card_qty": 0,
            "vaquita_count": 0,
            "bonus_count": 0,
            "purchase_count": m.get("purchase_count", 0),
            "total_spent": m.get("total_spent", 0),
        }
        for p in m.get("purchases", []):
            farley["dinar_qty"] += p.get("dinar_qty", 0) or 0
            farley["gold_qty"] += p.get("gold_qty", 0) or 0
            ggrams = p.get("gold_grams") or 0
            if ggrams and ggrams > farley["gold_grams"]:
                farley["gold_grams"] = ggrams
            farley["membership_qty"] += p.get("membership_qty", 0) or 0
            farley["card_qty"] += p.get("card_qty", 0) or 0
            tags = p.get("tags", []) or []
            if "vaquita" in tags:
                farley["vaquita_count"] += 1
            if "bonus" in tags:
                farley["bonus_count"] += 1

        # Compute INVENTARIO totals
        inv = {
            "present": len(inv_recs) > 0,
            "cajadinar": 0,
            "cajamicro": 0,
            "per_aleman": 0,
            "per_top": 0,
            "per_dragon": 0,
        }
        for ir in inv_recs:
            inv["cajadinar"] += int(ir.get("cajadinar") or 0)
            inv["cajamicro"] += int(ir.get("cajamicro") or 0)
            inv["per_aleman"] += int(ir.get("per_aleman") or 0)
            inv["per_top"] += int(ir.get("per_top") or 0)
            inv["per_dragon"] += int(ir.get("per_dragon") or 0)

        # Build comparison
        ggrams = farley.get("gold_grams", 0)
        comparison = [
            _verif_row("cajadinar", "Cajas Dinares Rojos", farley["dinar_qty"], inv["cajadinar"]),
            _verif_row("cajamicro", "Cajas Microlingotes Oro", farley["gold_qty"], inv["cajamicro"], detail=f"{ggrams}gr" if farley["gold_qty"] > 0 and ggrams > 0 else None),
        ]
        for key, label in [("per_aleman", "Pergaminos Alemanes"), ("per_top", "Perg. Top Nonillon"), ("per_dragon", "Perg. Dragones Amarillos")]:
            comparison.append(_verif_row(key, label, None, inv.get(key, 0)))
        for key, label, fv in [("membership", "Membresías", farley["membership_qty"]),
                                ("card", "Tarjetas Prepago", farley["card_qty"]),
                                ("vaquita", "Compras Vaquita", farley["vaquita_count"]),
                                ("bonus", "Bonos", farley["bonus_count"])]:
            comparison.append(_verif_row(key, label, fv, None))

        persons.append({
            "name": name,
            "cedula": m.get("cedula", ""),
            "telegram": m.get("telegram", ""),
            "match_type": "both" if inv["present"] else "farley_only",
            "match_source": match_source,
            "farley": farley,
            "inventario": inv,
            "comparison": comparison,
        })

    # Add unmatched INVENTARIO records
    for r in inventario:
        if r.get("telegram_user_id") in matched_inv_ids:
            continue
        inv = {
            "present": True,
            "cajadinar": int(r.get("cajadinar") or 0),
            "cajamicro": int(r.get("cajamicro") or 0),
            "per_aleman": int(r.get("per_aleman") or 0),
            "per_top": int(r.get("per_top") or 0),
            "per_dragon": int(r.get("per_dragon") or 0),
        }
        comparison = [
            _verif_row("cajadinar", "Cajas Dinares Rojos", None, inv["cajadinar"]),
            _verif_row("cajamicro", "Cajas Microlingotes Oro", None, inv["cajamicro"]),
        ]
        for key, label in [("per_aleman", "Pergaminos Alemanes"), ("per_top", "Perg. Top Nonillon"), ("per_dragon", "Perg. Dragones Amarillos")]:
            comparison.append(_verif_row(key, label, None, inv.get(key, 0)))
        for key, label in [("membership", "Membresías"), ("card", "Tarjetas Prepago"),
                           ("vaquita", "Compras Vaquita"), ("bonus", "Bonos")]:
            comparison.append(_verif_row(key, label, None, None))

        persons.append({
            "name": r.get("nombre", ""),
            "cedula": r.get("dni", ""),
            "telegram": r.get("telegram_username", ""),
            "match_type": "inventario_only",
            "match_source": None,
            "farley": {"present": False},
            "inventario": inv,
            "comparison": comparison,
        })

    if q:
        ql = q.strip().lower()
        persons = [p for p in persons if any(ql in str(p.get(f, "")).lower() for f in ["name", "cedula", "telegram"])]

    def _verif_sort_key(p):
        order = {"both": 0, "farley_only": 1, "inventario_only": 2}
        return (order.get(p["match_type"], 3), (p.get("name") or "").upper())
    persons.sort(key=_verif_sort_key)

    matched = sum(1 for p in persons if p["match_type"] == "both")
    only_farley = sum(1 for p in persons if p["match_type"] == "farley_only")
    only_inventario = sum(1 for p in persons if p["match_type"] == "inventario_only")
    mismatch_dinar = sum(1 for p in persons if any(c["key"] == "cajadinar" and c.get("status") == "mismatch" for c in p["comparison"]))
    mismatch_oro = sum(1 for p in persons if any(c["key"] == "cajamicro" and c.get("status") == "mismatch" for c in p["comparison"]))
    mismatch_total = sum(1 for p in persons if any(c.get("status") == "mismatch" for c in p["comparison"]))

    return {
        "stats": {
            "total_farley": len(crm.get("members", [])) if crm else 0,
            "total_inventario": len(inventario),
            "matched": matched,
            "only_farley": only_farley,
            "only_inventario": only_inventario,
            "mismatch_dinar": mismatch_dinar,
            "mismatch_oro": mismatch_oro,
            "mismatch_total": mismatch_total,
        },
        "total": len(persons),
        "persons": persons,
    }


def _verif_row(key, label, farley_val, inventario_val, detail=None):
    fv = farley_val if farley_val is not None else None
    iv = inventario_val if inventario_val is not None else None
    if fv is not None and iv is not None:
        status = "ok" if fv == iv else "mismatch"
    elif fv is not None:
        status = "only_farley"
    elif iv is not None:
        status = "only_inv"
    else:
        status = "absent"
    row = {"key": key, "label": label, "farley": fv, "inventario": iv, "status": status}
    if detail:
        row["detail"] = detail
    return row
