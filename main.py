import os
import io
import re
import time
import difflib
from datetime import datetime, timezone, timedelta
from collections import defaultdict

import openpyxl

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from supabase import create_client, Client
from openpyxl import Workbook

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
AYUDAS_SUPABASE_URL = os.environ.get("AYUDAS_SUPABASE_URL") or os.environ["SUPABASE_URL"]
AYUDAS_SUPABASE_KEY = os.environ.get("AYUDAS_SUPABASE_SERVICE_KEY") or os.environ["SUPABASE_SERVICE_KEY"]

COL_TZ = timezone(timedelta(hours=-5))

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data_to_show")
_PAGOS_CACHE = {"data": None, "mtime": 0}

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

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
supabase_ayudas: Client = create_client(AYUDAS_SUPABASE_URL, AYUDAS_SUPABASE_KEY)

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")


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
