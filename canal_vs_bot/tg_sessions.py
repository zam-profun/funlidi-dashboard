# -*- coding: utf-8 -*-
"""Cuentas multiples de Telegram (sesiones Pyrogram nombradas).

La sesion historica ``inventario_session`` queda registrada como cuenta
``inventario`` (builtin, no se borra su archivo). Las cuentas nuevas se
guardan en ``canal_vs_bot/.sessions/tg_<digitos>.session``.

El login se expone en pasos (begin/submit_code/submit_password/finish) para
que tanto la GUI (dialogo por pasos) como el CLI (input) lo reutilicen.
"""

import os
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SESSIONS_DIR = os.path.join(BASE_DIR, "canal_vs_bot", ".sessions")
REGISTRY_PATH = os.path.join(SESSIONS_DIR, "sessions.json")
LEGACY_SESSION = os.path.join(BASE_DIR, "inventario_session")
BUILTIN_NAME = "inventario"

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(BASE_DIR, ".env"))
except Exception:
    pass


def _empty_registry():
    return {"sessions": [], "default": BUILTIN_NAME}


def _load_registry():
    try:
        with open(REGISTRY_PATH, "r", encoding="utf-8") as f:
            reg = __import__("json").load(f)
        if not isinstance(reg, dict) or not isinstance(reg.get("sessions"), list):
            return _empty_registry()
        return reg
    except Exception:
        return _empty_registry()


def _save_registry(reg):
    os.makedirs(SESSIONS_DIR, exist_ok=True)
    tmp = REGISTRY_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        __import__("json").dump(reg, f, ensure_ascii=False, indent=1)
    os.replace(tmp, REGISTRY_PATH)


def _ensure_builtin(reg):
    if not any(s.get("name") == BUILTIN_NAME for s in reg["sessions"]):
        reg["sessions"].insert(0, {
            "name": BUILTIN_NAME,
            "phone": os.environ.get("TELEGRAM_PHONE", ""),
            "path": "inventario_session",  # relativo a BASE_DIR
            "builtin": True,
        })
    return reg


def _abs_path(entry):
    p = entry.get("path", "")
    if not p:
        return ""
    if os.path.isabs(p):
        return p
    return os.path.join(BASE_DIR, p)


def list_sessions():
    """Retorna (sesiones, default). Cada sesion: {name, phone, username}."""
    reg = _ensure_builtin(_load_registry())
    return list(reg["sessions"]), reg.get("default", BUILTIN_NAME)


def get_session(name):
    """Entrada de sesion por nombre o None."""
    sessions, _d = list_sessions()
    for s in sessions:
        if s.get("name") == name:
            return s
    return None


def default_session_name():
    _s, d = list_sessions()
    return d or BUILTIN_NAME


def set_default(name):
    reg = _ensure_builtin(_load_registry())
    if not any(s.get("name") == name for s in reg["sessions"]):
        raise RuntimeError("Cuenta desconocida: %s" % name)
    reg["default"] = name
    _save_registry(reg)


def session_path(name):
    """Ruta base (sin extension) del .session para ``name``."""
    entry = get_session(name)
    if entry is None:
        raise RuntimeError("Cuenta desconocida: %s" % name)
    return _abs_path(entry)


def remove_session(name):
    """Elimina la cuenta del registro. Solo borra el .session si esta nuevo."""
    if name == BUILTIN_NAME:
        raise RuntimeError("La cuenta '%s' no se puede eliminar." % BUILTIN_NAME)
    reg = _ensure_builtin(_load_registry())
    entry = next((s for s in reg["sessions"] if s.get("name") == name), None)
    if entry is None:
        raise RuntimeError("Cuenta desconocida: %s" % name)
    reg["sessions"] = [s for s in reg["sessions"] if s.get("name") != name]
    if reg.get("default") == name:
        reg["default"] = BUILTIN_NAME
    _save_registry(reg)
    # Borrar archivo solo si vive dentro de .sessions (nunca el legacy).
    p = _abs_path(entry)
    try:
        base = os.path.abspath(SESSIONS_DIR)
        if p and os.path.abspath(p).startswith(base):
            for ext in (".session", ".session-journal"):
                try:
                    os.remove(p + ext)
                except OSError:
                    pass
    except Exception:
        pass


def _new_entry_for_phone(phone):
    digits = re.sub(r"\D", "", phone or "")
    if len(digits) < 7:
        raise RuntimeError("Telefono invalido (usa codigo de pais, ej. +573001112233).")
    return {
        "name": "tg_%s" % digits,
        "phone": phone.strip(),
        "path": os.path.join("canal_vs_bot", ".sessions", "tg_%s" % digits),
        "builtin": False,
    }


def ensure_event_loop():
    """Garantiza un event loop en el hilo actual.

    Pyrogram llama ``asyncio.get_event_loop()`` en ``Client.__init__`` y a
    nivel de import: en hilos workers (Python 3.10+) eso lanza
    ``RuntimeError: There is no current event loop``. Llamar a esto primero
    lo evita. En el hilo principal es un no-op inofensivo.
    """
    import asyncio
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())


def _creds():
    try:
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BASE_DIR, ".env"))
    except Exception:
        pass
    api_id = os.environ.get("TELEGRAM_API_ID")
    api_hash = os.environ.get("TELEGRAM_API_HASH")
    if not api_id or not api_hash:
        raise RuntimeError("Faltan TELEGRAM_API_ID / TELEGRAM_API_HASH en el .env")
    try:
        import pyrogram.utils
        pyrogram.utils.MIN_CHANNEL_ID = -1009999999999
    except Exception:
        pass
    return int(api_id), api_hash


def _friendly(e):
    msg = str(e)
    if "PHONE_CODE_INVALID" in msg or "PhoneCodeInvalid" in type(e).__name__:
        return "Codigo incorrecto. Revisa el SMS/Telegram y reintenta."
    if "PHONE_CODE_EXPIRED" in msg or "PhoneCodeExpired" in type(e).__name__:
        return "Codigo vencido. Pide uno nuevo (cierra y reabre el dialogo)."
    if "PASSWORD_HASH_INVALID" in msg or "PasswordHashInvalid" in type(e).__name__:
        return "Contrasena 2FA incorrecta."
    if "FLOOD_WAIT" in msg.upper() or "FloodWait" in type(e).__name__:
        return "Telegram pide esperar (%s). Intenta mas tarde." % msg
    if "PHONE_NUMBER_INVALID" in msg:
        return "Numero invalido. Usa formato internacional (+codigo numero)."
    return msg[:200]


# --------------------------------------------------------------------------
# Login por pasos (compartido GUI / CLI)
# --------------------------------------------------------------------------
def begin_login(phone):
    """Conecta y envia el codigo. Retorna pending dict.

    Si la cuenta ya tiene sesion valida, retorna {"authorized": True, ...}
    sin pedir codigo.
    """
    ensure_event_loop()  # ANTES de importar pyrogram (sync.py lo exige)
    os.makedirs(SESSIONS_DIR, exist_ok=True)  # el .session nuevo necesita la carpeta
    from pyrogram import Client
    try:
        from pyrogram.errors import AuthKeyUnregistered
    except ImportError:  # pragma: no cover
        class AuthKeyUnregistered(Exception):
            pass

    phone = (phone or "").strip().replace(" ", "")
    api_id, api_hash = _creds()
    reg = _ensure_builtin(_load_registry())
    entry = next((s for s in reg["sessions"] if s.get("phone") == phone), None)
    if entry is None:
        entry = _new_entry_for_phone(phone)
    app = Client(_abs_path(entry), api_id=api_id, api_hash=api_hash)
    try:
        app.connect()
    except Exception as e:
        try:
            app.disconnect()
        except Exception:
            pass
        raise RuntimeError("No se pudo conectar: %s" % _friendly(e))
    try:
        me = app.get_me()
        return {"client": app, "entry": entry, "authorized": True,
                "me": {"id": me.id, "username": me.username or "",
                       "name": ("%s %s" % (me.first_name or "", me.last_name or "")).strip()}}
    except AuthKeyUnregistered:
        pass
    except Exception:
        # Cualquier otro fallo al leer perfil => asumir sesion no valida.
        pass
    try:
        sent = app.send_code(phone)
    except Exception as e:
        try:
            app.disconnect()
        except Exception:
            pass
        raise RuntimeError(_friendly(e))
    return {"client": app, "entry": entry, "authorized": False,
            "phone": phone, "phone_code_hash": sent.phone_code_hash}


def submit_code(pending, code):
    """Verifica el codigo. Retorna 'ok' o 'password_needed'. Lanza si invalido."""
    from pyrogram.errors import SessionPasswordNeeded
    code = (code or "").strip().replace(" ", "")
    if not code:
        raise RuntimeError("Escribe el codigo recibido.")
    app = pending["client"]
    try:
        app.sign_in(pending["phone"], pending["phone_code_hash"], code)
        return "ok"
    except SessionPasswordNeeded:
        return "password_needed"
    except Exception as e:
        raise RuntimeError(_friendly(e))


def submit_password(pending, password):
    """Verifica la contrasena 2FA. Retorna 'ok'. Lanza si invalida."""
    if not password:
        raise RuntimeError("Escribe tu contrasena de verificacion en dos pasos.")
    app = pending["client"]
    try:
        app.check_password(password)
        return "ok"
    except Exception as e:
        raise RuntimeError(_friendly(e))


def finish_login(pending):
    """Lee el perfil, registra la cuenta y desconecta. Retorna entry."""
    app = pending["client"]
    try:
        me = app.get_me()
        username = me.username or ""
    except Exception as e:
        try:
            app.disconnect()
        except Exception:
            pass
        raise RuntimeError("Login incompleto: %s" % _friendly(e))
    try:
        app.disconnect()
    except Exception:
        pass
    entry = dict(pending["entry"])
    entry["username"] = username
    reg = _ensure_builtin(_load_registry())
    reg["sessions"] = [s for s in reg["sessions"] if s.get("name") != entry["name"]]
    reg["sessions"].append(entry)
    reg["default"] = entry["name"]
    _save_registry(reg)
    return entry


def abort_login(pending):
    """Desconecta un login a medias (al cerrar el dialogo)."""
    try:
        pending["client"].disconnect()
    except Exception:
        pass
