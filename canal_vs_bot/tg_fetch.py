# -*- coding: utf-8 -*-
"""Descarga de miembros de un grupo/canal con el workaround del limite ~200.

``get_chat_members`` con query vacia solo devuelve los ~200 miembros
recientes (limite del servidor de Telegram). Como cada nombre/username
contiene al menos una letra o digito, repetir la consulta con cada
caracter ``a-z0-9`` (36 consultas) captura la lista completa.
Misma tecnica que ``compare_members.py`` / ``fetch_and_match_telegram.py``.
"""

import os
import string
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SESSION_PATH = os.path.join(BASE_DIR, "inventario_session")

SEARCH_CHARS = list(string.ascii_lowercase + string.digits)


def _patch_pyrogram():
    try:
        import pyrogram.utils
        # Grupos nuevos tienen IDs mas negativos que el tope de 32 bits.
        pyrogram.utils.MIN_CHANNEL_ID = -1009999999999
    except Exception:
        pass


def load_env():
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BASE_DIR, ".env"))
    except Exception:
        pass


def get_client(session_name=None):
    """Crea el cliente Pyrogram con la sesion indicada (o la por defecto)."""
    from . import tg_sessions
    tg_sessions.ensure_event_loop()
    _patch_pyrogram()
    load_env()
    try:
        from pyrogram import Client
    except ImportError:
        raise RuntimeError("Falta pyrogram (pip install pyrogram tgcrypto)")
    api_id = os.environ.get("TELEGRAM_API_ID")
    api_hash = os.environ.get("TELEGRAM_API_HASH")
    if not api_id or not api_hash:
        raise RuntimeError("Faltan TELEGRAM_API_ID / TELEGRAM_API_HASH en el .env")
    if session_name is None:
        session_name = tg_sessions.default_session_name()
    path = tg_sessions.session_path(session_name)
    return Client(str(path), api_id=int(api_id), api_hash=api_hash)


def fetch_all_members(app, chat_id, progress=None, delay=0.3):
    """Descarga miembros deduplicados por user.id.

    ``progress``: callable(paso:str, hecho:int, total:int, obtenidos:int).
    Retorna ``(users, reported_count)`` donde users es lista de User.
    Maneja FloodWait durmiendo lo que pide Telegram (max 120s).
    """
    try:
        from pyrogram.errors import FloodWait
    except ImportError:  # pragma: no cover
        class FloodWait(Exception):
            def __init__(self, x=0):
                self.x = x

    seen = {}
    chat = app.get_chat(chat_id)
    reported = getattr(chat, "members_count", 0) or 0

    def _grab(query):
        try:
            for m in app.get_chat_members(chat_id, query=query):
                u = m.user
                if u is not None and not getattr(u, "is_bot", False):
                    seen[u.id] = u
        except FloodWait as e:
            wait = min(int(getattr(e, "x", 10) or 10), 120)
            if progress:
                progress("flood", 0, 0, len(seen))
            time.sleep(wait)
        except Exception:
            pass

    if progress:
        progress("recientes", 0, len(SEARCH_CHARS) + 1, 0)
    _grab("")
    if progress:
        progress("recientes", 1, len(SEARCH_CHARS) + 1, len(seen))

    for i, ch in enumerate(SEARCH_CHARS, 2):
        _grab(ch)
        if progress:
            progress(ch, i, len(SEARCH_CHARS) + 1, len(seen))
        time.sleep(delay)

    return list(seen.values()), reported


def to_simple(users):
    """Convierte Users de Pyrogram a dicts serializables."""
    out = []
    for u in users:
        try:
            first = getattr(u, "first_name", "") or ""
            last = getattr(u, "last_name", "") or ""
            out.append({
                "user_id": getattr(u, "id", 0),
                "username": getattr(u, "username", "") or "",
                "full_name": ("%s %s" % (first, last)).strip(),
            })
        except Exception:
            continue
    return out


def fetch_members_by_id(chat_id, progress=None, delay=0.3, session_name=None):
    """Abre sesion, descarga y retorna (miembros_simples, reported_count)."""
    app = get_client(session_name=session_name)
    with app:
        users, reported = fetch_all_members(app, chat_id, progress=progress, delay=delay)
        return to_simple(users), reported
