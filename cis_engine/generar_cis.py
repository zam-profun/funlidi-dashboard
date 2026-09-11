# -*- coding: utf-8 -*-
"""Generate filled CIS documents from client records.

Reads client records (from Supabase, or --local for testing with the Excel), fills
the DOCX template using fill_cis, and writes the result to FILLED CYS/.

Usage:
    python generar_cis.py [--local] [--limit N] [--all]
"""

import os
import sys
import io
import argparse
from datetime import datetime

from fill_cis import (
    TEMPLATE_PATH, FRAME_W_IN, FRAME_H_IN, BLUE,
    split_name, fmt_date, is_us, gender_word,
    fill_label, fill_label_rebuilt, replace_in_text, insert_image_into_frame, fill_header,
    normalize_image,
)
from docx import Document

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE_DIR, "FILLED CYS")
IMG_DIR = os.path.join(BASE_DIR, "ID IMAGES")
TEMPLATE_PATH = os.path.join(BASE_DIR, "TEMPLATES", "MODELO CIS.docx")

# Address rows are rebuilt as `Label:<spaces><value>` (no tabs: tab stops shift
# with indentation, which would detach the value column from the hanging
# position). Spaces + hanging indent keep every wrapped line aligned under the
# value start. w:left/w:hanging are margin-relative (margin = 44pt), while
# measured value columns are page-absolute, hence the -44pt correction:
# page 1 value at 132.4pt -> (132.4-44)/72 = 1.2278in;
# page 4 value at 136.4pt -> (136.4-44)/72 = 1.2833in.
P1_STREET_SEP_SPACES = 8
P1_STREET_HANGING_IN = 1.2278
P4_ADDRESS_SEP_SPACES = 8
P4_ADDRESS_HANGING_IN = 1.2833


def load_clients_from_supabase():
    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv()
    for _env in (
        os.path.join(BASE_DIR, ".env"),
        os.path.join(BASE_DIR, "telegram-bot-cis", ".env"),
        r"C:\Users\amazi\Desktop\mariaelvira\telegram-bot-funlidi-dashboard\.env",
    ):
        if os.path.exists(_env):
            load_dotenv(_env)
    url = os.environ.get("INVENTARIO_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("INVENTARIO_SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise RuntimeError("Supabase credentials not found.")
    client = create_client(url, key)
    res = client.table("clientes_cis").select("*").execute()
    return res.data or []


def load_clients_from_excel(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb[wb.sheetnames[0]]
    headers = None
    clients = []
    for i, row in enumerate(ws.iter_rows(min_col=1, max_col=18, values_only=True)):
        if i == 0:
            headers = [str(h).strip() if h else h for h in row]
            continue
        if not row or not any(v is not None for v in row):
            continue
        d = {}
        for h, v in zip(headers, row):
            if h:
                d[str(h).strip()] = v
        # skip stray rows with no name
        nombre = d.get("NOMBRE COMPLETO") or d.get("nombre_completo") or ""
        if not str(nombre).strip():
            continue
        clients.append(d)
    wb.close()
    return clients


def row_to_client(r):
    """Normalize a row (excel dict or supabase dict) into the document-shaped dict."""
    def g(*keys, default=""):
        for k in keys:
            if r.get(k) not in (None, ""):
                return r[k]
        return default

    nombre = str(g("nombre_completo", "NOMBRE COMPLETO", "full_name") or "").strip()
    first, middle, last = split_name(nombre)

    def _doc(v):
        s = str(v or "").strip()
        return s if s and s.upper() not in ("", "N/A", "NA", "NAN", "-", "0", "NONE", "NO", "NULL") else ""

    pasaporte = _doc(g("pasaporte", "PASAPORTE"))
    cc_raw = str(g("cc", "CC (DOCUMENTO DEL PAIS DE ORIGEN)", "CC") or "").strip()
    cc = _doc(cc_raw)
    tipo = str(g("tipo_documento", "tipo") or "").strip().upper()
    if tipo not in ("PASAPORTE", "ID", "CC"):
        tipo = "PASAPORTE" if pasaporte else ("ID" if cc else "PASAPORTE")
    doc_number = pasaporte if tipo == "PASAPORTE" else cc
    pais = str(g("pais", "PAIS") or "").strip().upper()

    return {
        "first": first,
        "middle": middle or "N/A",
        "last": last,
        "full": nombre,
        "gender": gender_word(str(g("genero", "GENERO", "gender") or "")),
        "dob": fmt_date(g("fecha_nacimiento", "FECHA DE NACIMIENTO", "date_of_birth")),
        "ssn": "N/A",
        "country": pais,
        "languages": "SPANISH",
        "telephone": str(g("telefono", "INDICATIVO MAS CELULAR", "telephone") or "N/A"),
        "email": str(g("correo", "CORREO", "email") or "N/A"),
        "doc_number": doc_number,
        "doc_type": tipo,
        "fecha_exp": fmt_date(g("fecha_expedicion", "FECHA DE EXPEDICION")),
        "fecha_venc": fmt_date(g("fecha_vencimiento", "FECHA DE VENCIMIENTO")),
        "autoridad": str(g("autoridad_emisora", "AUTORIDAD EMISORA") or "N/A"),
        "officer": nombre,
        "street": str(g("direccion", "DIRECCION", "street_address") or "N/A"),
        "city": str(g("ciudad", "CUIDAD") or "N/A"),
        "state": str(g("departamento", "DEPARTAMENTO") or "N/A"),
        "zip": str(g("codigo_postal", "CODIGO POSTAL") or "N/A"),
        "urbanizacion": "N/A",
        "distrito": "N/A",
        "us": is_us(pais),
        "today": datetime.now().strftime("%d/%m/%Y"),
    }


CARPETAS_DIR = os.path.join(IMG_DIR, "CARPETAS")

# Cache of normalized folder name -> real folder path
_FOLDERS_CACHE = None


def _norm_folder_name(s):
    import re
    return re.sub(r"\s+", " ", str(s or "").strip().upper())


def _person_folders():
    global _FOLDERS_CACHE
    if _FOLDERS_CACHE is None:
        _FOLDERS_CACHE = {}
        if os.path.isdir(CARPETAS_DIR):
            for entry in os.listdir(CARPETAS_DIR):
                full = os.path.join(CARPETAS_DIR, entry)
                if os.path.isdir(full):
                    _FOLDERS_CACHE[_norm_folder_name(entry)] = full
    return _FOLDERS_CACHE


def find_image(c):
    """Resolve the image path for a client.

    Primary: ID IMAGES/CARPETAS/<FULL NAME>/<PASAPORTE|CEDULA>.* — the folder
    name identifies the person, the file name the document kind.
    Fallback: legacy flat files named by document number in ID IMAGES/.
    """
    folders = _person_folders()
    folder = folders.get(_norm_folder_name(c.get("full")))
    if folder:
        want = "PASAPORTE" if c.get("doc_type") == "PASAPORTE" else "CEDULA"
        for f in sorted(os.listdir(folder)):
            base, fe = os.path.splitext(f)
            if base.strip().upper() == want and fe.lower() in (".png", ".jpg", ".jpeg", ".jfif"):
                return os.path.join(folder, f)
    # legacy fallback: flat file named by document number
    if not os.path.isdir(IMG_DIR):
        return None
    for ext in ("png", "PNG", "jfif", "JFIF", "jpg", "jpeg"):
        for f in os.listdir(IMG_DIR):
            if not os.path.isfile(os.path.join(IMG_DIR, f)):
                continue
            base, fe = os.path.splitext(f)
            if base.strip() == str(c["doc_number"]).strip() and fe.lower() == "." + ext.lower():
                return os.path.join(IMG_DIR, f)
    return None


def safe_filename(s):
    import re
    s = re.sub(r"[^\w\- ]+", "", str(s)).strip()
    return "_".join(s.split())


def fill_document(c, image_path, out_path, template_path=None, skip_image=False):
    doc = Document(template_path or TEMPLATE_PATH)

    # --- Body identity ---
    fill_label(doc, "First Name", c["first"])
    fill_label(doc, "Middle Name", c["middle"])
    fill_label(doc, "Last Name", c["last"])
    fill_label(doc, "Gender", c["gender"])
    fill_label(doc, "Date of Birth", c["dob"])
    fill_label(doc, "Social Security Number", c["ssn"])
    fill_label(doc, "Country of Citizenship", c["country"])
    fill_label(doc, "Languages", c["languages"])
    fill_label(doc, "Telephone", c["telephone"])
    fill_label(doc, "E-mail", c["email"])

    # --- Passport / document information ---
    fill_label(doc, "Passport", c["doc_number"])
    fill_label(doc, "Date of Issue", c["fecha_exp"])
    fill_label(doc, "Date of Expiry", c["fecha_venc"])
    fill_label(doc, "Issuing Authority", c["autoridad"])

    # --- Address (page 1) ---
    fill_label(doc, "Full Name of Officer", c["officer"])
    fill_label_rebuilt(doc, "Street Address", c["street"], P1_STREET_SEP_SPACES, P1_STREET_HANGING_IN)
    fill_label(doc, "City", c["city"])
    fill_label(doc, "State", c["state"])
    fill_label(doc, "Country", c["country"])
    fill_label(doc, "Postal Code", c["zip"])

    # --- Declaration (page 2) : names + date in blue ---
    today = c["today"]
    for para in doc.paragraphs:
        if "(NAME OF PERSON)" in para.text:
            replace_in_text(para, "(NAME OF PERSON)", c["officer"], color=BLUE)
    for para in doc.paragraphs:
        if "Todays Date" in para.text:
            replace_in_text(para, "Todays Date", today, color=BLUE)

    # Name / Title (blue) is handled by the (NAME OF PERSON) replacement above.

    # --- Page 4 address block ---
    fill_label_rebuilt(doc, "ADDRESS:", c["street"], P4_ADDRESS_SEP_SPACES, P4_ADDRESS_HANGING_IN)
    fill_label(doc, "ZIP CODE", c["zip"])
    fill_label(doc, "URBANIZATION", c["urbanizacion"])
    fill_label(doc, "DISTRICT", c["distrito"])
    fill_label(doc, "CITY", c["city"])
    fill_label(doc, "STATE", c["state"])
    fill_label(doc, "COUNTRY", c["country"])

    # --- Header (every page) ---
    fill_header(doc, {
        "header_name": c["full"],
        "header_country": f"{c['doc_number']} / {c['country']}",
        "header_address": c["street"],
        "header_telephone": c["telephone"],
        "header_email": c["email"],
    })

    # --- Image (normalized to the fixed frame) ---
    if not skip_image:
        if image_path:
            import tempfile
            with tempfile.TemporaryDirectory() as tmp:
                norm = os.path.join(tmp, "normalized.png")
                normalize_image(image_path, norm)
                insert_image_into_frame(doc, norm, 74)
        else:
            print(f"  WARNING: no image found for document number {c['doc_number']}", file=sys.stderr)

    doc.save(out_path)
    return out_path


def build_cis_file(c, out_dir=OUT_DIR, template_path=None, skip_image=False):
    """Generate a single client's CIS document and return the output path."""
    if not c["doc_number"]:
        raise ValueError(f"no document number for {c['full']}")
    img = None if skip_image else find_image(c)
    os.makedirs(out_dir, exist_ok=True)
    fname = safe_filename(f"{c['full']}_{c['doc_type']}_{c['doc_number']}") + ".docx"
    out = os.path.join(out_dir, fname)
    fill_document(c, img, out, template_path=template_path, skip_image=skip_image)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--local", action="store_true", help="use the Excel instead of Supabase")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)

    if args.local:
        excel = os.path.join(BASE_DIR, "DATABASE", "DATOS FINALES (REGALO SOPRESA EXPRESS).xlsx")
        if not os.path.exists(excel):
            excel = os.path.join(BASE_DIR, "DATABASE", "BASE DE DATOS CIS.xlsx")
        rows = load_clients_from_excel(excel)
    else:
        rows = load_clients_from_supabase()

    clients = [row_to_client(r) for r in rows]
    if not args.all and args.limit:
        clients = clients[: args.limit]
    elif not args.all and not args.limit:
        clients = clients[:1]  # default: just the first, for quick runs

    print(f"Generating {len(clients)} CIS document(s)...")
    for c in clients:
        if not c["doc_number"]:
            print(f"  SKIP: no document number for {c['full']}")
            continue
        out = build_cis_file(c)
        print(f"  OK: {os.path.basename(out)}")

    print("Done.")


if __name__ == "__main__":
    main()