import os
import io
import difflib
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from supabase import create_client, Client
from openpyxl import Workbook

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

COL_TZ = timezone(timedelta(hours=-5))

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

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
