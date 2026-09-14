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
    fill_label, fill_label_tabbed, apply_hanging_to_label, replace_in_text, insert_image_into_frame, fill_header,
    normalize_image, build_header_lines, fit_header_box,
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
# Page-1 officer block: native `Label\t: value` rows. The tab snaps to the
# hanging-indent position, so with hanging H the ": " of every row lands at
# H + left margin, exactly like the sibling rows above (": " at ~297.5pt),
# and wrapped lines align under it. Verified from rendered PDFs.
P1_OFFICER_HANGING_IN = 3.5278
# First lines keep the native label offset (~49.7pt = 5.7pt past the margin).
P1_OFFICER_HANG_IN = 3.4472
# Page-4 block: `Label:` + single tab + value. The tab snaps to the hanging
# position, so every value lands at 44 + 253.5 = 297.5pt (the page-1 grid)
# and wrapped lines align under it. First lines keep the native label offset
# (~100.7pt): hanging = 253.5 - 56.7 = 196.8pt. Measured from rendered PDFs.
P4_LEFT_IN = 3.5208
P4_HANG_IN = 2.7333


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
    split_first, split_middle, split_last = split_name(nombre)

    def _name(*keys, fallback=""):
        for k in keys:
            v = r.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return fallback

    # Stored split fields win (dashboard-editable edge cases); otherwise the
    # positional split of nombre_completo applies.
    first = _name("first_name", fallback=split_first)
    middle = _name("middle_name", fallback=split_middle)
    last = _name("last_name", fallback=split_last)

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
    # Legal + residence countries: stored columns win, plain pais is fallback.
    _pl = str(g("pais_legal") or "").strip().upper()
    _pr = str(g("pais_residencia") or "").strip().upper()
    pais_legal = _pl or pais
    pais_residencia = _pr or pais

    return {
        "first": first,
        "middle": middle or "N/A",
        "last": last,
        "full": nombre,
        "gender": gender_word(str(g("genero", "GENERO", "gender") or "")),
        "dob": fmt_date(g("fecha_nacimiento", "FECHA DE NACIMIENTO", "date_of_birth")),
        "ssn": _name("ssn", fallback="N/A"),
        "country": pais_legal,
        "pais_legal": pais_legal,
        "pais_residencia": pais_residencia,
        "address_country": pais_residencia,
        "languages": _name("languages", fallback="SPANISH"),
        "telephone": str(g("telefono", "INDICATIVO MAS CELULAR", "telephone") or "N/A"),
        "email": str(g("correo", "CORREO", "email") or "N/A"),
        "doc_number": doc_number,
        "doc_type": tipo,
        "fecha_exp": fmt_date(g("fecha_expedicion", "FECHA DE EXPEDICION")),
        "fecha_venc": fmt_date(g("fecha_vencimiento", "FECHA DE VENCIMIENTO")),
        "autoridad": str(g("autoridad_emisora", "AUTORIDAD EMISORA") or "N/A"),
        "officer": _name("officer_name", fallback=nombre),
        "street": str(g("direccion", "DIRECCION", "street_address") or "N/A"),
        "city": str(g("ciudad", "CUIDAD") or "N/A"),
        "state": str(g("departamento", "DEPARTAMENTO") or "N/A"),
        "zip": str(g("codigo_postal", "CODIGO POSTAL") or "N/A"),
        "urbanizacion": _name("urbanizacion", fallback="N/A"),
        "distrito": _name("distrito", fallback="N/A"),
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


def find_image(c, report=None):
    """Resolve the image path for a client.

    Primary: ID IMAGES/CARPETAS/<FULL NAME>/<PASAPORTE|CEDULA>.* — the folder
    name identifies the person, the file name the document kind.
    Fallback: legacy flat files named by document number in ID IMAGES/.
    Records carpeta_faltante / archivo_faltante anomalies when report given.
    """
    want = "PASAPORTE" if c.get("doc_type") == "PASAPORTE" else "CEDULA"
    folders = _person_folders()
    folder = folders.get(_norm_folder_name(c.get("full")))
    if folder is not None:
        for f in sorted(os.listdir(folder)):
            base, fe = os.path.splitext(f)
            if base.strip().upper() == want and fe.lower() in (".png", ".jpg", ".jpeg", ".jfif"):
                return os.path.join(folder, f)
    # legacy fallback: flat file named by document number
    if os.path.isdir(IMG_DIR):
        for ext in ("png", "PNG", "jfif", "JFIF", "jpg", "jpeg"):
            for f in os.listdir(IMG_DIR):
                if not os.path.isfile(os.path.join(IMG_DIR, f)):
                    continue
                base, fe = os.path.splitext(f)
                if base.strip() == str(c["doc_number"]).strip() and fe.lower() == "." + ext.lower():
                    return os.path.join(IMG_DIR, f)
    if report is not None:
        if folder is None:
            report.add(c.get("full"), c.get("doc_number"), "carpeta_faltante",
                       f"sin carpeta ID IMAGES/CARPETAS/{c.get('full')}")
        else:
            report.add(c.get("full"), c.get("doc_number"), "archivo_faltante",
                       f"falta {want}.* en ID IMAGES/CARPETAS/{os.path.basename(folder)}")
    return None


def safe_filename(s):
    import re
    s = re.sub(r"[^\w\- ]+", "", str(s)).strip()
    return "_".join(s.split())


# --------------------------------------------------------------------------
# Anomaly report: collects per-client problems during a batch run so main()
# can print one grouped list at the end instead of failing silently.
# Kinds: sin_documento | carpeta_faltante | archivo_faltante | foto_fallida |
#         etiqueta_faltante | encabezado_faltante | fallido
# --------------------------------------------------------------------------

class AnomalyReport:
    KIND_LABELS = {
        "sin_documento": "saltados (sin documento)",
        "carpeta_faltante": "sin foto (sin carpeta en ID IMAGES/CARPETAS)",
        "archivo_faltante": "sin foto (carpeta existe, falta el archivo PASAPORTE/CEDULA)",
        "foto_fallida": "foto no insertada (error al normalizar/insertar)",
        "etiqueta_faltante": "etiqueta no encontrada en la plantilla",
        "encabezado_faltante": "encabezado no rellenado",
        "fallido": "fallidos (sin documento generado)",
    }
    KIND_ORDER = ["fallido", "sin_documento", "carpeta_faltante",
                  "archivo_faltante", "foto_fallida", "etiqueta_faltante",
                  "encabezado_faltante"]

    def __init__(self):
        self.items = []

    def add(self, cliente, documento, tipo, detalle=""):
        self.items.append({
            "cliente": str(cliente or "-"),
            "documento": str(documento or "-"),
            "tipo": tipo,
            "detalle": str(detalle or ""),
        })

    def count(self, tipo):
        return sum(1 for i in self.items if i["tipo"] == tipo)

    def total(self):
        return len(self.items)

    def print(self, total, ok):
        photo_kinds = ("carpeta_faltante", "archivo_faltante", "foto_fallida")
        failed = self.count("fallido") + self.count("sin_documento")
        print("")
        if not self.items:
            print(f"Generados OK: {ok}/{total} (sin anomalias)")
            return
        print(f"============ ANOMALIAS ({self.total()}) ============")
        for kind in self.KIND_ORDER:
            rows = [i for i in self.items if i["tipo"] == kind]
            if not rows:
                continue
            print(f"[{kind}] ({len(rows)}): {self.KIND_LABELS.get(kind, kind)}")
            for r in rows:
                extra = f" | {r['detalle']}" if r["detalle"] else ""
                print(f"  - {r['cliente']} | doc {r['documento']}{extra}")
        no_photo = sum(self.count(k) for k in photo_kinds)
        print(f"Generados OK: {ok}/{total} (con foto: {ok - no_photo}, sin foto: {no_photo}, fallidos: {failed})")


def _fill_checked(doc, report, c, label, value, tabbed=None):
    """fill_label / fill_label_tabbed wrapper that records etiqueta_faltante.

    tabbed = (left_inches, hanging_inches) for tab-snapped rows, else plain fill.
    """
    if tabbed is None:
        ok = fill_label(doc, label, value)
    else:
        ok = fill_label_tabbed(doc, label, value, tabbed[0], tabbed[1])
    if not ok and report is not None:
        report.add(c.get("full"), c.get("doc_number"), "etiqueta_faltante",
                   f"etiqueta '{label}' no encontrada en la plantilla")
    return ok


def fill_document(c, image_path, out_path, template_path=None, skip_image=False, report=None):
    doc = Document(template_path or TEMPLATE_PATH)
    fl = lambda label, value, tabbed=None: _fill_checked(
        doc, report, c, label, value, tabbed=tabbed)

    # --- Body identity ---
    fl("First Name", c["first"])
    fl("Middle Name", c["middle"])
    fl("Last Name", c["last"])
    fl("Gender", c["gender"])
    fl("Date of Birth", c["dob"])
    fl("Social Security Number", c["ssn"])
    fl("Country of Citizenship", c["country"])
    fl("Languages", c["languages"])
    fl("Telephone", c["telephone"])
    fl("E-mail", c["email"])

    # --- Passport / document information ---
    fl("Passport", c["doc_number"])
    fl("Date of Issue", c["fecha_exp"])
    fl("Date of Expiry", c["fecha_venc"])
    fl("Issuing Authority", c["autoridad"])

    # --- Officer address block (page 1) ---
    # Native `Label\t: value` structure (same grid rhythm as the rows above:
    # the tab snaps to the hanging-indent position, so values land with the
    # sibling rows and wrapped lines align under them).
    fl("Full Name of Officer", c["officer"])
    fl("Street Address", c["street"])
    fl("City", c["city"])
    fl("State", c["state"])
    fl("Country", c["address_country"])
    fl("Postal Code", c["zip"])
    for _lbl in ("Full Name of Officer", "Street Address", "City", "State",
                 "Country", "Postal Code"):
        apply_hanging_to_label(doc, _lbl, P1_OFFICER_HANGING_IN, P1_OFFICER_HANG_IN)

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
    # All rows rebuilt uniformly so values share one column (per-field spacing
    # compensates for different label lengths) and wrapped lines align under it.
    p4 = (P4_LEFT_IN, P4_HANG_IN)
    fl("ADDRESS:", c["street"], tabbed=p4)
    fl("ZIP CODE", c["zip"], tabbed=p4)
    fl("DISTRICT", c["distrito"], tabbed=p4)
    fl("CITY", c["city"], tabbed=p4)
    fl("STATE", c["state"], tabbed=p4)
    fl("COUNTRY", c["address_country"], tabbed=p4)

    # --- Header (every page) ---
    # Name / PASSPORT line / Address(+Postal) / telephone / e-mail. Address
    # parts are comma-joined with missing skipped; Postal Code shares the line
    # or drops below depending on length (full address lives on pages 1/4).
    header_lines = build_header_lines(
        c["doc_number"], c["pais_legal"], c["street"],
        c["city"], c["state"], c["zip"],
        c["pais_residencia"],
    )
    header_filled = fill_header(doc, {
        "header_name": c["full"],
        "header_country": header_lines["country_line"],
        "header_address": header_lines["address_parts"],
        "header_postal": header_lines["postal_text"],
        "header_postal_newline": header_lines["postal_newline"],
        "header_telephone": c["telephone"],
        "header_email": c["email"],
    })
    if not header_filled and report is not None:
        report.add(c.get("full"), c.get("doc_number"), "encabezado_faltante",
                   "no se rellenó ningún campo del encabezado")
    # Grow the header box when the address block needs extra lines so nothing
    # is pushed out of view (transparent shape behind text; body layout kept).
    fit_header_box(doc, header_lines["address_lines"])

    # --- Image (normalized to the fixed frame) ---
    if not skip_image:
        if image_path:
            try:
                import tempfile
                with tempfile.TemporaryDirectory() as tmp:
                    norm = os.path.join(tmp, "normalized.png")
                    normalize_image(image_path, norm)
                    placed = insert_image_into_frame(doc, norm, 74)
                if not placed and report is not None:
                    report.add(c.get("full"), c.get("doc_number"), "foto_fallida",
                               "marco de imagen no encontrado en la plantilla")
            except Exception as e:
                if report is not None:
                    report.add(c.get("full"), c.get("doc_number"), "foto_fallida", str(e)[:160])

    doc.save(out_path)
    return out_path


def build_cis_file(c, out_dir=OUT_DIR, template_path=None, skip_image=False, report=None):
    """Generate a single client's CIS document and return the output path."""
    if not c["doc_number"]:
        raise ValueError(f"no document number for {c['full']}")
    img = None if skip_image else find_image(c, report=report)
    os.makedirs(out_dir, exist_ok=True)
    fname = safe_filename(f"{c['full']}_{c['doc_type']}_{c['doc_number']}") + ".docx"
    out = os.path.join(out_dir, fname)
    fill_document(c, img, out, template_path=template_path, skip_image=skip_image, report=report)
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

    report = AnomalyReport()
    print(f"Generating {len(clients)} CIS document(s)...")
    ok = 0
    for c in clients:
        if not c["doc_number"]:
            report.add(c.get("full"), "", "sin_documento", "sin pasaporte ni CC utilizable")
            continue
        try:
            out = build_cis_file(c, report=report)
            print(f"  OK: {os.path.basename(out)}")
            ok += 1
        except Exception as e:
            report.add(c.get("full"), c.get("doc_number"), "fallido", str(e)[:160])

    report.print(total=len(clients), ok=ok)
    print("Done.")


if __name__ == "__main__":
    main()