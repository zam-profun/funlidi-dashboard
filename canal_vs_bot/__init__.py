# -*- coding: utf-8 -*-
"""Comparador Canal/ Grupo Telegram vs bases Supabase (BOT-CIS, INVENTARIO, ...).

Subpaquete de utilidades sin efectos laterales al importar:

- ``tg_discovery``: lista los grupos/canales donde la cuenta es admin.
- ``tg_fetch``: descarga todos los miembros (workaround a-z0-9 del limite ~200).
- ``sb_catalog``: catalogo de proyectos/tablas Supabase desde el .env.
- ``compare``: cruce normalizado por @username + exportacion a XLSX.
- ``cache``: cache JSON local (grupos, miembros) para abrir la GUI al instante.
"""

__version__ = "1.0.0"
