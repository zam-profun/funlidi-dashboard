# -*- coding: utf-8 -*-
"""Cache JSON local para la consola Canal-vs-BOT.

Guarda ``grupos`` y ``miembros_<chat_id>`` en ``canal_vs_bot/.cache/`` para que
la GUI abra al instante sin llamar a Telegram. Nunca guarda secretos.
"""

import json
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(BASE_DIR, "canal_vs_bot", ".cache")


def _path(name):
    os.makedirs(CACHE_DIR, exist_ok=True)
    safe = "".join(c if (c.isalnum() or c in ("-", "_")) else "_" for c in name)
    return os.path.join(CACHE_DIR, safe + ".json")


def save(name, data):
    """Guarda ``data`` (serializable) bajo ``name``. No lanza excepciones."""
    try:
        with open(_path(name), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        return True
    except Exception:
        return False


def load(name, default=None):
    """Carga ``name`` o retorna ``default`` si no existe / esta corrupto."""
    try:
        with open(_path(name), "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default
