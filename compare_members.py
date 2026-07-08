import os
import sys
import csv
import string
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

# =====================================================================
# WORKAROUNDS FOR TELEGRAM GROUP MEMBER SCRAPING LIMITATIONS
# =====================================================================
# The Telegram Bot API has NO method to list all group members (only
# getChatMember for individual checks). Pyrogram (MTProto client API)
# has get_chat_members, but it hits TWO Telegram server-side limits:
#
# 1. CHANNEL ID > 32-BIT (ValueError: Peer id invalid)
#    - Pyrogram's MIN_CHANNEL_ID constant caps at -1002147483647 (32-bit
#      signed max). Groups/channels created more recently have IDs larger
#      than 2^31-1 (e.g., -1004286637959).
#    - FIX: Patch pyrogram.utils.MIN_CHANNEL_ID to a more negative value
#      (-1009999999999) at line 23 before any Pyrogram call.
#
# 2. ONLY ~200 MEMBERS RETURNED (alphabetical search workaround)
#    - get_chat_members with empty query returns only recent/active
#      members (~200). Even admin accounts hit this server-side limit.
#    - FIX: Iterate through all lowercase a-z + digits 0-9 (36 queries)
#      as search queries. Since every user's name or username contains
#      at least one of these characters, this captures ALL members.
#      Implemented in fetch_all_members() with dedup by user.id.
#
# 3. MATCHING MANUAL ENTRIES (negative IDs via @username)
#    - Dashboard entries submitted manually (not via bot) have negative
#      telegram_user_id (-1, -2, etc.), which can't match real Telegram
#      user IDs.
#    - FIX: Match primarily by @username (lowercased, stripped of @),
#      fall back to user_id only for positive IDs. See by_username and
#      by_user_id lookup dicts in main().
# =====================================================================


load_dotenv()

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
PHONE = os.environ["TELEGRAM_PHONE"]
GROUP_ID = int(os.environ.get("INVENTARIO_GROUP_ID", "-1004286637959"))
INV_SUPABASE_URL = os.environ["INVENTARIO_SUPABASE_URL"]
INV_SUPABASE_KEY = os.environ["INVENTARIO_SUPABASE_SERVICE_KEY"]
TABLE_NAME = "inventario_adquisiciones"

try:
    from pyrogram import Client
    import pyrogram.utils
    pyrogram.utils.MIN_CHANNEL_ID = -1009999999999
except ImportError:
    print("ERROR: Pyrogram no está instalado.")
    print("  pip install pyrogram")
    sys.exit(1)


SEARCH_CHARS = list(string.ascii_lowercase + string.digits)


def norm_username(u):
    if not u:
        return ""
    return u.lower().strip().lstrip("@")


def fetch_all_members(app, chat_id):
    seen = {}

    chat = app.get_chat(chat_id)
    print(f"  Miembros según Telegram: {chat.members_count}")

    print(f"  Obteniendo miembros recientes...")
    for m in app.get_chat_members(chat_id, query=""):
        if not m.user.is_bot:
            seen[m.user.id] = m.user
    print(f"    -> {len(seen)}")

    total_chars = len(SEARCH_CHARS)
    for idx, ch in enumerate(SEARCH_CHARS, 1):
        print(f"  Buscando '{ch}' ({idx}/{total_chars})...", end="")
        try:
            for m in app.get_chat_members(chat_id, query=ch):
                if not m.user.is_bot:
                    seen[m.user.id] = m.user
        except Exception:
            pass
        print(f" {len(seen)}")

    return list(seen.values()), chat.members_count


def get_db_entries():
    from supabase import create_client

    sb = create_client(INV_SUPABASE_URL, INV_SUPABASE_KEY)
    result = sb.table(TABLE_NAME).select(
        "telegram_user_id", "telegram_username", "nombre", "dni"
    ).execute()
    return result.data or []


def main():
    print("Conectando con Telegram...")
    app = Client("inventario_session", api_id=API_ID, api_hash=API_HASH)

    users = []
    reported_count = 0
    with app:
        users, reported_count = fetch_all_members(app, GROUP_ID)

    total_fetched = len(users)
    print(f"\n  Total obtenidos: {total_fetched}")
    if reported_count and total_fetched < reported_count:
        print(f"  [!] Telegram reporta {reported_count}, pero solo se obtuvieron {total_fetched}")

    print("Consultando base de datos...")
    db_entries = get_db_entries()
    total_db = len(db_entries)
    print(f"  Registros en {TABLE_NAME}: {total_db}")

    by_username = {}
    by_user_id = {}
    for entry in db_entries:
        uid_raw = entry.get("telegram_user_id")
        try:
            uid = int(uid_raw)
        except (ValueError, TypeError):
            continue
        uname = norm_username(entry.get("telegram_username", ""))
        if uname:
            by_username[uname] = entry
        if uid > 0:
            by_user_id[uid] = entry

    matched_db = set()
    missing = []
    for u in users:
        uname = norm_username(u.username)
        if uname and uname in by_username:
            matched_db.add(id(by_username[uname]))
            continue
        if u.id in by_user_id:
            matched_db.add(id(by_user_id[u.id]))
            continue
        missing.append(u)

    orphans = [e for e in db_entries if id(e) not in matched_db]

    missing.sort(key=lambda x: (x.last_name or x.first_name or x.username or "").lower())
    orphans.sort(key=lambda x: x.get("telegram_username") or x.get("nombre") or "")

    sep = "-" * 80
    print(f"\n{sep}")
    print(f"  FALTANTES - {len(missing)} personas")
    print(f"{sep}")
    if missing:
        print(f"  {'ID':<12} {'USUARIO':<20} {'NOMBRE':<40}")
        print(f"  {'-'*12} {'-'*20} {'-'*40}")
        for u in missing:
            name = f"{u.first_name or ''} {u.last_name or ''}".strip()
            print(f"  {u.id:<12} @{(u.username or ''):<18} {name:<40}")
    else:
        print("  Todos los miembros del grupo han enviado datos!")

    print(f"\n{sep}")
    print(f"  NO ENCONTRADOS - {len(orphans)} registro(s) en BD no vinculados al grupo")
    print(f"{sep}")
    if orphans:
        print(f"  {'ID':<14} {'USUARIO':<22} {'NOMBRE':<30} {'DNI':<16}")
        print(f"  {'-'*14} {'-'*22} {'-'*30} {'-'*16}")
        for e in orphans:
            uid = e.get("telegram_user_id", "")
            uname = "@" + e.get("telegram_username", "") if e.get("telegram_username") else "-"
            nombre = e.get("nombre", "") or "-"
            dni = e.get("dni", "") or "-"
            print(f"  {str(uid):<14} {uname:<22} {nombre:<30} {dni:<16}")
    else:
        print("  (ninguno)")

    csv_path = Path(__file__).parent / "missing_members.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["user_id", "username", "first_name", "last_name", "status"])
        for u in missing:
            w.writerow([u.id, u.username or "", u.first_name or "", u.last_name or "", "missing"])
        for e in orphans:
            w.writerow([
                e.get("telegram_user_id", ""),
                e.get("telegram_username", ""),
                e.get("nombre", ""),
                e.get("dni", ""),
                "orphan",
            ])

    print(f"\n{sep}")
    print(f"  Reporte guardado: {csv_path}")
    print(f"  ({len(missing)} faltantes, {len(orphans)} no encontrados)")
    print(f"{sep}")

    report_path = Path(__file__).parent / "full_report.txt"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(f"FALTANTES - {len(missing)} personas\n")
        f.write(f"{sep}\n")
        if missing:
            f.write(f"  {'ID':<12} {'USUARIO':<20} {'NOMBRE':<40}\n")
            f.write(f"  {'-'*12} {'-'*20} {'-'*40}\n")
            for u in missing:
                name = f"{u.first_name or ''} {u.last_name or ''}".strip()
                f.write(f"  {u.id:<12} @{(u.username or ''):<18} {name:<40}\n")
        else:
            f.write("  Todos los miembros del grupo han enviado datos!\n")
        f.write(f"\n{sep}\n")
        f.write(f"NO ENCONTRADOS - {len(orphans)} registro(s) en BD no vinculados al grupo\n")
        f.write(f"{sep}\n")
        if orphans:
            f.write(f"  {'ID':<14} {'USUARIO':<22} {'NOMBRE':<30} {'DNI':<16}\n")
            f.write(f"  {'-'*14} {'-'*22} {'-'*30} {'-'*16}\n")
            for e in orphans:
                uid = e.get("telegram_user_id", "")
                uname = "@" + e.get("telegram_username", "") if e.get("telegram_username") else "-"
                nombre = e.get("nombre", "") or "-"
                dni = e.get("dni", "") or "-"
                f.write(f"  {str(uid):<14} {uname:<22} {nombre:<30} {dni:<16}\n")
        else:
            f.write("  (ninguno)\n")

    print(f"  Reporte completo: {report_path}")


if __name__ == "__main__":
    main()
