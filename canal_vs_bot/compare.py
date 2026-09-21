# -*- coding: utf-8 -*-
"""Cruce miembros Telegram <-> filas Supabase + exportacion XLSX.

Clave de cruce: @username normalizado (minusculas, sin @, sin acentos).
Igual convencion que ``sys-group/telegram-bot-cis/bot.py`` y
``comparar_canal.py``.
"""

import os
import unicodedata
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def normalize_str(s):
    if not s:
        return ""
    return unicodedata.normalize("NFKD", str(s)).encode("ASCII", "ignore").decode().strip()


def norm_username(u):
    if not u:
        return ""
    return normalize_str(str(u)).lower().strip().lstrip("@")


def compare_members(members, rows, entry):
    """Cruza y retorna dict con en_ambos / faltantes / extra / resumen.

    members: [{user_id, username, full_name}]
    rows: filas Supabase (dicts). entry: entrada del catalogo sb_catalog.
    """
    user_col = entry["user_col"]
    name_col = entry["name_col"]
    doc_cols = entry.get("doc_cols", [])
    extra_cols = entry.get("extra_cols", [])

    db_by_user = {}
    db_no_user = 0
    for r in rows or []:
        u = norm_username(r.get(user_col))
        if not u:
            db_no_user += 1
            continue
        if u not in db_by_user:
            doc = ""
            for dc in doc_cols:
                if r.get(dc):
                    doc = normalize_str(r.get(dc))
                    break
            db_by_user[u] = {
                "username": u,
                "name": normalize_str(r.get(name_col) or ""),
                "doc": doc,
                "extras": {c: r.get(c) for c in extra_cols},
                "raw": r,
            }

    tg_by_user = {}
    tg_no_user = 0
    for m in members or []:
        u = norm_username(m.get("username"))
        if not u:
            tg_no_user += 1
            continue
        tg_by_user[u] = m

    en_ambos, faltantes, extra = [], [], []
    for u, info in db_by_user.items():
        m = tg_by_user.get(u)
        if m:
            en_ambos.append({"username": u, "db": info, "tg": m})
        else:
            faltantes.append({"username": u, "db": info})
    for u, m in tg_by_user.items():
        if u not in db_by_user:
            extra.append({"username": u, "tg": m})

    en_ambos.sort(key=lambda x: x["username"])
    faltantes.sort(key=lambda x: x["username"])
    extra.sort(key=lambda x: x["username"])

    return {
        "en_ambos": en_ambos,
        "faltantes": faltantes,
        "extra": extra,
        "resumen": {
            "miembros_canal": len(members or []),
            "miembros_con_usuario": len(tg_by_user),
            "miembros_sin_usuario": tg_no_user,
            "filas_db": len(rows or []),
            "db_con_usuario": len(db_by_user),
            "db_sin_usuario": db_no_user,
            "en_ambos": len(en_ambos),
            "faltantes": len(faltantes),
            "extra": len(extra),
        },
    }


def default_out_path(chat_title, table):
    safe_chat = "".join(c if (c.isalnum() or c in ("-", "_")) else "_" for c in str(chat_title))[:40] or "canal"
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    name = "COMPARACION_%s_%s_%s.xlsx" % (safe_chat, table, stamp)
    return os.path.join(BASE_DIR, name)


def export_xlsx(path, result, chat_title="", table_label=""):
    """Genera XLSX estilo comparar_canal.py (Faltantes/Extra/Detalle)."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = Workbook()
    wb.remove(wb.active)

    def style_header(ws, headers, fill):
        ws.append(headers)
        f = PatternFill(start_color=fill, end_color=fill, fill_type="solid")
        font = Font(bold=True, color="FFFFFF")
        for cell in ws[1]:
            cell.fill = f
            cell.font = font
            cell.alignment = Alignment(horizontal="center")
        for col in ws.columns:
            letter = col[0].column_letter
            max_len = max((len(str(c.value)) if c.value is not None else 0) for c in col)
            ws.column_dimensions[letter].width = min(max_len + 4, 50)

    r = result["resumen"]
    ws = wb.create_sheet("Resumen")
    style_header(ws, ["Metrica", "Valor"], fill="607D8B")
    ws.append(["Canal", chat_title])
    ws.append(["Tabla", table_label])
    for k in ("miembros_canal", "miembros_con_usuario", "miembros_sin_usuario",
              "filas_db", "db_con_usuario", "db_sin_usuario",
              "en_ambos", "faltantes", "extra"):
        ws.append([k, r[k]])

    ws = wb.create_sheet("En ambos")
    style_header(ws, ["Telegram", "User ID", "Nombre Telegram", "Nombre BD", "Documento", "Extras"], fill="4CAF50")
    for item in result["en_ambos"]:
        ws.append(["@%s" % item["username"], item["tg"].get("user_id", ""),
                   item["tg"].get("full_name", "") or "", item["db"]["name"],
                   item["db"]["doc"], str(item["db"]["extras"])])

    ws = wb.create_sheet("Faltantes")
    style_header(ws, ["Telegram", "Nombre BD", "Documento", "Extras"], fill="E53935")
    for item in result["faltantes"]:
        ws.append(["@%s" % item["username"], item["db"]["name"],
                   item["db"]["doc"], str(item["db"]["extras"])])

    ws = wb.create_sheet("Extra")
    style_header(ws, ["Telegram", "User ID", "Nombre Telegram"], fill="1E88E5")
    for item in result["extra"]:
        ws.append(["@%s" % item["username"], item["tg"].get("user_id", ""),
                   item["tg"].get("full_name", "") or ""])

    wb.save(path)
    return path
