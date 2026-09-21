# -*- coding: utf-8 -*-
"""Descubrimiento de grupos/canales donde la cuenta es administradora.

Usa ``get_dialogs`` una sola vez (llamada sensible a FloodWait: sin bucles
por caracter aqui) y filtra por ``get_chat_member(chat, "me")`` quedandose
solo con OWNER / ADMINISTRATOR o privilegios de restriccion/invitacion.
"""

from . import tg_fetch


def _is_group_type(chat):
    t = str(getattr(chat, "type", "")).upper()
    return any(k in t for k in ("SUPERGROUP", "CHANNEL", "GROUP"))


def _is_admin(member):
    st = str(getattr(member, "status", "")).upper()
    if "OWNER" in st or "ADMINISTRATOR" in st:
        return True, st.split(".")[-1]
    priv = getattr(member, "privileges", None)
    if priv is not None:
        if (getattr(priv, "can_restrict_members", False)
                or getattr(priv, "can_invite_users", False)
                or getattr(priv, "can_post_messages", False)
                or getattr(priv, "can_manage_chat", False)):
            return True, st.split(".")[-1]
    return False, st.split(".")[-1]


def list_admin_groups(progress=None, session_name=None):
    """Retorna ``(grupos, yo)`` usando la sesion indicada (o la por defecto).

    grupos: lista de {id, title, type, members_count, my_status}.
    yo: {id, name, username} de la sesion. Lanza RuntimeError si falla login.
    """
    app = tg_fetch.get_client(session_name=session_name)
    groups = []
    me_info = {}
    with app:
        try:
            me = app.get_me()
            me_info = {
                "id": getattr(me, "id", 0),
                "name": ("%s %s" % (getattr(me, "first_name", "") or "",
                                    getattr(me, "last_name", "") or "")).strip(),
                "username": getattr(me, "username", "") or "",
            }
        except Exception as e:
            raise RuntimeError("No se pudo iniciar sesion en Telegram: %s" % e)
        try:
            dialogs = list(app.get_dialogs(limit=200))
        except Exception as e:
            raise RuntimeError("No se pudieron listar los chats: %s" % e)
        total = len(dialogs)
        for i, d in enumerate(dialogs):
            chat = d.chat
            if chat is None or not _is_group_type(chat):
                continue
            if progress:
                progress(i + 1, total, getattr(chat, "title", "") or "")
            try:
                member = app.get_chat_member(chat.id, "me")
            except Exception:
                continue
            ok, status = _is_admin(member)
            if not ok:
                continue
            try:
                full = app.get_chat(chat.id)
                count = getattr(full, "members_count", None)
            except Exception:
                count = getattr(chat, "members_count", None)
            groups.append({
                "id": chat.id,
                "title": getattr(chat, "title", "") or "(sin titulo)",
                "type": str(getattr(chat, "type", "")).split(".")[-1],
                "members_count": count or 0,
                "my_status": status,
            })
    groups.sort(key=lambda g: str(g["title"]).lower())
    return groups, me_info
