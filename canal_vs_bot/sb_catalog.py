# -*- coding: utf-8 -*-
"""Catalogo de proyectos/tablas Supabase disponibles para comparar.

Lee las URLs/keys del ``.env`` del dashboard (mismos nombres que ``main.py``)
y expone un catalogo fijo proyecto -> tablas con su columna de @username.
``clientes_cis`` (BOT-CIS) es la seleccion por defecto.

No imprime ni importa secretos: solo lee ``os.environ``.
"""

import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PROJECTS = [
    {
        "key": "INVENTARIO",
        "label": "INVENTARIO (BOT-INV + BOT-CIS)",
        "url_env": "INVENTARIO_SUPABASE_URL",
        "key_env": "INVENTARIO_SUPABASE_SERVICE_KEY",
    },
    {
        "key": "FUNLIDI",
        "label": "FUNLIDI-BOT",
        "url_env": "SUPABASE_URL",
        "key_env": "SUPABASE_SERVICE_KEY",
    },
    {
        "key": "AYUDAS",
        "label": "AYUDAS",
        "url_env": "AYUDAS_SUPABASE_URL",
        "key_env": "AYUDAS_SUPABASE_SERVICE_KEY",
    },
]

# Cada entrada: table / label / user_col / name_col / doc_cols / extra_cols.
# ``default: True`` marca la seleccion inicial (BOT-CIS).
TABLES = {
    "INVENTARIO": [
        {"table": "clientes_cis", "label": "BOT-CIS  (clientes_cis)",
         "user_col": "telegram", "name_col": "nombre_completo",
         "doc_cols": ["pasaporte", "cc"],
         "extra_cols": ["habilitado", "tipo_documento"],
         "default": True},
        {"table": "inventario_adquisiciones", "label": "BOT-INVENTARIO  (inventario_adquisiciones)",
         "user_col": "telegram_username", "name_col": "nombre",
         "doc_cols": ["dni"], "extra_cols": ["telegram_user_id", "pais"]},
        {"table": "reparticion_vaquita", "label": "Reparticion vaquita",
         "user_col": "telegram_username", "name_col": "nombres",
         "doc_cols": ["documento"], "extra_cols": ["pais"]},
        {"table": "directorio_vaquitas", "label": "Directorio vaquitas",
         "user_col": "telegram_username", "name_col": "nombres",
         "doc_cols": ["documento"], "extra_cols": ["pais"]},
        {"table": "participaciones_aguila_roja", "label": "Aguila roja",
         "user_col": "telegram_username", "name_col": "nombres",
         "doc_cols": ["documento"], "extra_cols": ["pais"]},
        {"table": "participaciones_aguila_verde", "label": "Aguila verde",
         "user_col": "telegram_username", "name_col": "nombres",
         "doc_cols": ["documento"], "extra_cols": ["pais"]},
        {"table": "participaciones_vaquita_googolplex", "label": "Vaquita googolplex",
         "user_col": "telegram_username", "name_col": "nombres",
         "doc_cols": ["documento"], "extra_cols": ["pais"]},
        {"table": "participaciones_vaquita_listado1", "label": "Vaquita listado 1",
         "user_col": "telegram_username", "name_col": "nombres",
         "doc_cols": ["documento"], "extra_cols": ["pais"]},
        {"table": "participaciones_vaquita_listado2", "label": "Vaquita listado 2",
         "user_col": "telegram_username", "name_col": "nombres",
         "doc_cols": ["documento"], "extra_cols": ["pais"]},
        {"table": "dinares_usuarios", "label": "Dinares",
         "user_col": "telegram_username", "name_col": "nombre_completo",
         "doc_cols": ["documento"], "extra_cols": ["pais"]},
        {"table": "microlingotes_usuarios", "label": "Microlingotes",
         "user_col": "telegram_username", "name_col": "nombre_completo",
         "doc_cols": ["documento"], "extra_cols": ["pais"]},
        {"table": "lider_entradas", "label": "Lider",
         "user_col": "telegram_username", "name_col": "nombre_completo",
         "doc_cols": ["documento"], "extra_cols": ["pais"]},
    ],
    "FUNLIDI": [
        {"table": "usuarios_funlidi", "label": "FUNLIDI-BOT  (usuarios_funlidi)",
         "user_col": "telegram_username", "name_col": "nombres_completos",
         "doc_cols": ["numero_documento"],
         "extra_cols": ["telegram_user_id", "correo_electronico"]},
    ],
    "AYUDAS": [
        {"table": "ayudas_humanitarias", "label": "Ayudas humanitarias",
         "user_col": "telegram_username", "name_col": "nombre",
         "doc_cols": ["dni"], "extra_cols": ["pais", "ciudad"]},
        {"table": "ayudas_beneficiarios", "label": "Ayudas beneficiarios",
         "user_col": "telegram_username", "name_col": "nombre",
         "doc_cols": ["dni"], "extra_cols": ["pais"]},
        {"table": "clientes", "label": "Clientes",
         "user_col": "telegram_username", "name_col": "nombre_completo",
         "doc_cols": ["documento"], "extra_cols": []},
    ],
}


def load_env():
    """Carga el .env del dashboard (tolera ausencia de python-dotenv)."""
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BASE_DIR, ".env"))
    except Exception:
        pass


def get_projects():
    """Proyectos con credenciales configuradas (lista de dicts)."""
    load_env()
    out = []
    for p in PROJECTS:
        url = os.environ.get(p["url_env"] or "")
        key = os.environ.get(p["key_env"] or "")
        if url and key:
            out.append({**p, "configured": True})
        else:
            out.append({**p, "configured": False})
    return out


def get_tables(project_key):
    """Entradas de tabla para un proyecto (lista de dicts)."""
    return list(TABLES.get(project_key, []))


def get_entry(project_key, table):
    """Entrada del catalogo o None."""
    for e in TABLES.get(project_key, []):
        if e["table"] == table:
            return e
    return None


def default_selection():
    """(project_key, table) inicial: BOT-CIS."""
    return ("INVENTARIO", "clientes_cis")


def fetch_rows(project_key, table, progress=None, page_size=1000, max_rows=50000):
    """Descarga todas las filas (paginado .range) y retorna lista de dicts.

    ``progress``: callable(descargadas:int) opcional para la barra de progreso.
    Lanza RuntimeError si faltan credenciales o falla Supabase.
    """
    load_env()
    proj = next((p for p in PROJECTS if p["key"] == project_key), None)
    if proj is None:
        raise RuntimeError("Proyecto desconocido: %s" % project_key)
    entry = get_entry(project_key, table)
    if entry is None:
        raise RuntimeError("Tabla desconocida: %s" % table)
    url = os.environ.get(proj["url_env"] or "")
    key = os.environ.get(proj["key_env"] or "")
    if not url or not key:
        raise RuntimeError("Sin credenciales para %s (%s)" % (proj["label"], proj["url_env"]))

    try:
        from supabase import create_client
    except ImportError:
        raise RuntimeError("Falta el paquete 'supabase' (pip install supabase)")

    cols = [entry["user_col"], entry["name_col"]] + entry.get("doc_cols", []) + entry.get("extra_cols", [])
    cols = [c for c in dict.fromkeys(cols) if c]
    sb = create_client(url, key)
    rows = []
    start = 0
    while True:
        res = sb.table(table).select(",".join(cols)).range(start, start + page_size - 1).execute()
        batch = res.data or []
        rows.extend(batch)
        if progress:
            progress(len(rows))
        if len(batch) < page_size or len(rows) >= max_rows:
            break
        start += page_size
    return rows
