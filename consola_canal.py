# -*- coding: utf-8 -*-
"""Consola grafica Canal/Telegram vs BOT (Supabase).

Dos paneles con buscador: izquierda grupos/canales donde la cuenta es admin,
derecha proyectos/tablas Supabase. Luego descarga miembros, cruza por
@username y muestra Resumen / En ambos / Faltantes / Extra + exporta XLSX.

El trabajo pesado corre en hilos; la UI se alimenta por cola (mismo patron
que sys-group/cis_consola.py). Uso CLI:

    python consola_canal.py                  # GUI
    python consola_canal.py --list-groups    # solo listar grupos admin
    python consola_canal.py --quick CHAT_ID --project INVENTARIO --table clientes_cis
"""

import os
import sys
import io
import queue
import threading
import tkinter as tk
from tkinter import ttk, scrolledtext, filedialog, messagebox

# Consola Windows (cp1252): los titulos de Telegram traen emojis.
if sys.stdout is not None and hasattr(sys.stdout, "buffer"):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

from canal_vs_bot import cache, compare, sb_catalog, tg_discovery, tg_fetch, tg_sessions  # noqa: E402

try:
    # Import en el hilo principal: fija el main_loop de pyrogram.sync aqui
    # para que los workers tomen la ruta simple run_until_complete.
    import pyrogram  # noqa: F401
except ImportError:
    pass

# --------------------------------------------------------------------------
# Paleta pastel sobre blanco (misma familia que sys-group/cis_consola.py)
# --------------------------------------------------------------------------
PALETTE = {
    "BG": "#FFFFFF",
    "PANEL": "#F4F7FC",
    "BORDER": "#DCE5F2",
    "PRIMARY": "#B9D4F0",
    "PRIMARY_HOVER": "#A5C6EA",
    "PRIMARY_TEXT": "#1E3A5F",
    "OK_BG": "#BFE8C9",
    "OK_TEXT": "#1E5B33",
    "WARN_BG": "#FBDDB8",
    "WARN_TEXT": "#8A5A1E",
    "ERR_BG": "#F3C2C7",
    "ERR_TEXT": "#8A2B33",
    "INFO_BG": "#DCD2F5",
    "TEXT": "#2B3440",
    "MUTED": "#6B7686",
    "DISABLED_BG": "#E4EAF3",
    "DISABLED_FG": "#9AA5B5",
}


def setup_style(root):
    style = ttk.Style(root)
    try:
        style.theme_use("clam")
    except Exception:
        pass
    f = ("Segoe UI", 10)
    fb = ("Segoe UI", 10, "bold")
    style.configure(".", background=PALETTE["BG"], foreground=PALETTE["TEXT"], font=f)
    style.configure("TFrame", background=PALETTE["BG"])
    style.configure("Card.TFrame", background=PALETTE["PANEL"])
    style.configure("TLabel", background=PALETTE["BG"], foreground=PALETTE["TEXT"])
    style.configure("Card.TLabel", background=PALETTE["PANEL"])
    style.configure("Muted.TLabel", background=PALETTE["BG"], foreground=PALETTE["MUTED"])
    style.configure("CardMuted.TLabel", background=PALETTE["PANEL"], foreground=PALETTE["MUTED"])
    style.configure("Header.TLabel", background=PALETTE["BG"],
                    font=("Segoe UI", 15, "bold"), foreground=PALETTE["PRIMARY_TEXT"])
    style.configure("SubHeader.TLabel", background=PALETTE["PANEL"],
                    font=("Segoe UI", 11, "bold"), foreground=PALETTE["PRIMARY_TEXT"])
    style.configure("TButton", background=PALETTE["PRIMARY"],
                    foreground=PALETTE["PRIMARY_TEXT"], borderwidth=0,
                    padding=(12, 7), font=fb)
    style.map("TButton",
              background=[("active", PALETTE["PRIMARY_HOVER"]),
                          ("disabled", PALETTE["DISABLED_BG"])],
              foreground=[("disabled", PALETTE["DISABLED_FG"])])
    style.configure("TNotebook", background=PALETTE["BG"], borderwidth=0)
    style.configure("TNotebook.Tab", background=PALETTE["PANEL"],
                    foreground=PALETTE["MUTED"], padding=(14, 8), font=fb)
    style.map("TNotebook.Tab",
              background=[("selected", PALETTE["PRIMARY"])],
              foreground=[("selected", PALETTE["PRIMARY_TEXT"])])
    style.configure("TCombobox", fieldbackground="#FFFFFF")
    style.configure("TEntry", fieldbackground="#FFFFFF")
    style.configure("Treeview", background="#FFFFFF", fieldbackground="#FFFFFF",
                    foreground=PALETTE["TEXT"], rowheight=24, borderwidth=1)
    style.configure("Treeview.Heading", background=PALETTE["PANEL"],
                    foreground=PALETTE["PRIMARY_TEXT"], font=("Segoe UI", 9, "bold"))
    style.map("Treeview",
              background=[("selected", PALETTE["PRIMARY"])],
              foreground=[("selected", PALETTE["PRIMARY_TEXT"])])
    style.configure("Horizontal.TProgressbar", background=PALETTE["PRIMARY"])
    return style


class CanalApp:
    def __init__(self, root):
        self.root = root
        self.q = queue.Queue()
        self.busy = False
        # Sesion Telegram activa
        self.sessions = []
        self.session_name = tg_sessions.default_session_name()
        self._login_dialog = None
        self._login_box = None  # handoff hilo-principal <-> worker de login
        # Estado
        self.groups = []
        self.me_info = {}
        self.members = []
        self.members_chat = None  # dict del grupo descargado
        self.reported_count = 0
        self.db_rows = []
        self.db_entry = None
        self.db_project = None
        self.result = None
        self.last_xlsx = ""
        # Filtros de resultados
        self.f_both = tk.StringVar()
        self.f_miss = tk.StringVar()
        self.f_extra = tk.StringVar()
        self.build_ui()
        self._load_sessions()
        self._load_cached_groups()
        self._refresh_table_list()
        self.root.after(150, self.drain_queue)

    # ------------------------------------------------------------------
    # Sesiones / cuentas Telegram
    # ------------------------------------------------------------------
    def _sess_display(self, s):
        name = s.get("name", "")
        user = s.get("username") or s.get("phone", "")
        return "%s  (@%s)" % (name, user) if user else name

    def _load_sessions(self):
        self.sessions, default = tg_sessions.list_sessions()
        if not tg_sessions.get_session(self.session_name):
            self.session_name = default
        self.sess_combo["values"] = [self._sess_display(s) for s in self.sessions]
        idx = next((i for i, s in enumerate(self.sessions)
                    if s.get("name") == self.session_name), 0)
        self.sess_combo.current(idx)
        self.sess_var.set(self.sess_combo["values"][idx] if self.sessions else "")

    def _cache_key(self, base):
        # La cuenta builtin mantiene la cache historica sin sufijo.
        if self.session_name == tg_sessions.BUILTIN_NAME:
            return base
        return "%s_%s" % (base, self.session_name)

    def _on_session_change(self):
        idx = self.sess_combo.current()
        if idx is None or idx < 0 or idx >= len(self.sessions):
            return
        self.session_name = self.sessions[idx]["name"]
        try:
            tg_sessions.set_default(self.session_name)
        except Exception:
            pass
        # Cambiar de cuenta invalida miembros/resultados anteriores.
        self.members = []
        self.members_chat = None
        self.result = None
        self.btn_export.config(state="disabled")
        self.resumen_text.delete("1.0", "end")
        self._load_cached_groups()
        self._update_action_state()
        self.log_line("Cuenta activa: %s. Pulsa Actualizar para leer sus grupos."
                      % self._sess_display(self.sessions[idx]))

    def remove_account(self):
        idx = self.sess_combo.current()
        if idx is None or idx < 0 or idx >= len(self.sessions):
            return
        name = self.sessions[idx]["name"]
        if name == tg_sessions.BUILTIN_NAME:
            messagebox.showinfo("Cuentas", "La cuenta '%s' no se puede quitar." % name)
            return
        if not messagebox.askyesno("Quitar cuenta",
                                    "Quitar '%s' de la lista?\n(Se borra su sesion local.)" % name):
            return
        try:
            tg_sessions.remove_session(name)
        except Exception as e:
            messagebox.showerror("Error", str(e))
            return
        self.session_name = tg_sessions.default_session_name()
        self._load_sessions()
        self._on_session_change()

    # ---- Dialogo Anadir cuenta (telefono -> codigo -> 2FA) ----
    def open_add_account(self):
        if self._login_dialog is not None:
            try:
                self._login_dialog.lift()
                return
            except Exception:
                self._login_dialog = None
        dlg = tk.Toplevel(self.root)
        dlg.title("Anadir cuenta Telegram")
        dlg.geometry("420x300")
        dlg.transient(self.root)
        self._login_dialog = dlg
        dlg.protocol("WM_DELETE_WINDOW", self._login_cancel)

        body = ttk.Frame(dlg, padding=14)
        body.pack(fill="both", expand=True)
        ttk.Label(body, text="1. Telefono (con codigo de pais)").pack(anchor="w")
        self._lg_phone = ttk.Entry(body)
        self._lg_phone.pack(fill="x", pady=(2, 6))
        self._lg_btn_send = ttk.Button(body, text="Enviar codigo", command=self._login_send)
        self._lg_btn_send.pack(anchor="w")

        ttk.Label(body, text="2. Codigo recibido").pack(anchor="w", pady=(10, 0))
        self._lg_code = ttk.Entry(body, state="disabled")
        self._lg_code.pack(fill="x", pady=(2, 6))
        self._lg_btn_ok = ttk.Button(body, text="Entrar", command=self._login_code, state="disabled")
        self._lg_btn_ok.pack(anchor="w")

        ttk.Label(body, text="3. Contrasena 2FA (solo si la pide)").pack(anchor="w", pady=(10, 0))
        self._lg_pwd = ttk.Entry(body, show="*", state="disabled")
        self._lg_pwd.pack(fill="x", pady=(2, 6))

        self._lg_status = ttk.Label(body, text="", style="Muted.TLabel", wraplength=380)
        self._lg_status.pack(anchor="w", pady=(8, 0))

    def _login_status(self, msg):
        if self._login_dialog is not None:
            self._lg_status.config(text=msg)

    def _login_cancel(self):
        # Avisa al worker (si sigue vivo) y cierra el dialogo. El worker
        # aborta el pending; nunca se toca el Client desde este hilo.
        box = self._login_box
        self._login_box = None
        if box is not None:
            box["cancelled"] = True
            box["code_event"].set()
            box["pwd_event"].set()
        if self._login_dialog is not None:
            try:
                self._login_dialog.destroy()
            except Exception:
                pass
            self._login_dialog = None

    def _login_send(self):
        phone = self._lg_phone.get().strip()
        if not phone:
            self._login_status("Escribe el telefono primero.")
            return
        if self._login_box is not None:
            return  # ya hay un login en curso
        self._login_box = {"cancelled": False, "phase": "send",
                           "code": "", "pwd": "",
                           "code_event": threading.Event(),
                           "pwd_event": threading.Event()}
        self._lg_btn_send.config(state="disabled")
        self._lg_phone.config(state="disabled")
        self._login_status("Enviando codigo…")
        threading.Thread(target=self._login_job, args=(phone,), daemon=True).start()

    def _login_job(self, phone):
        """Toda la sesion Pyrogram vive en ESTE unico hilo worker."""
        box = self._login_box
        try:
            pending = tg_sessions.begin_login(phone)
        except Exception as e:
            self.q.put(("login_fatal", str(e)))
            return
        try:
            if box is None or box["cancelled"]:
                tg_sessions.abort_login(pending)
                return
            if pending.get("authorized"):
                entry = tg_sessions.finish_login(pending)
                self.q.put(("login_done", entry))
                return
            # --- fase codigo (con reintentos) ---
            box["phase"] = "code"
            self.q.put(("login_need_code", None))
            while True:
                box["code_event"].wait(timeout=600)
                if box["cancelled"]:
                    tg_sessions.abort_login(pending)
                    return
                box["code_event"].clear()
                try:
                    res = tg_sessions.submit_code(pending, box["code"])
                    break
                except Exception as e:
                    self.q.put(("login_error", str(e)))
            # --- fase 2FA (si aplica) ---
            if res == "password_needed":
                box["phase"] = "pwd"
                self.q.put(("login_need_password", None))
                while True:
                    box["pwd_event"].wait(timeout=600)
                    if box["cancelled"]:
                        tg_sessions.abort_login(pending)
                        return
                    box["pwd_event"].clear()
                    try:
                        tg_sessions.submit_password(pending, box["pwd"])
                        break
                    except Exception as e:
                        self.q.put(("login_error", str(e)))
            entry = tg_sessions.finish_login(pending)
            self.q.put(("login_done", entry))
        except Exception as e:
            try:
                tg_sessions.abort_login(pending)
            except Exception:
                pass
            self.q.put(("login_error", str(e)))

    def _login_code(self):
        # El boton Entrar solo entrega el valor al worker (hilo unico).
        box = self._login_box
        if box is None or self._login_dialog is None:
            return
        phase = box.get("phase")
        if phase == "code" and str(self._lg_code["state"]) == "normal":
            box["code"] = self._lg_code.get()
            if not box["code"].strip():
                self._login_status("Escribe el codigo recibido.")
                return
            self._lg_btn_ok.config(state="disabled")
            self._login_status("Verificando codigo…")
            box["code_event"].set()
        elif phase == "pwd" and str(self._lg_pwd["state"]) == "normal":
            box["pwd"] = self._lg_pwd.get()
            if not box["pwd"]:
                self._login_status("Escribe tu contrasena 2FA.")
                return
            self._lg_btn_ok.config(state="disabled")
            self._login_status("Verificando contrasena…")
            box["pwd_event"].set()

    # ------------------------------------------------------------------
    # UI
    # ------------------------------------------------------------------
    def build_ui(self):
        header = ttk.Frame(self.root, padding=(16, 12, 16, 6))
        header.pack(fill="x")
        ttk.Label(header, text="Canal Telegram  vs  BOT (Supabase)",
                  style="Header.TLabel").pack(side="left")
        self.status_pill = tk.Label(
            header, text="LISTO", bg=PALETTE["OK_BG"], fg=PALETTE["OK_TEXT"],
            font=("Segoe UI", 9, "bold"), padx=12, pady=4)
        self.status_pill.pack(side="right")
        self.me_label = ttk.Label(header, text="", style="Muted.TLabel")
        self.me_label.pack(side="right", padx=(0, 10))

        sessbar = ttk.Frame(self.root, padding=(16, 0, 16, 0))
        sessbar.pack(fill="x")
        ttk.Label(sessbar, text="Cuenta Telegram:").pack(side="left")
        self.sess_var = tk.StringVar()
        self.sess_combo = ttk.Combobox(sessbar, textvariable=self.sess_var,
                                       state="readonly", width=28)
        self.sess_combo.pack(side="left", padx=(6, 0))
        self.sess_combo.bind("<<ComboboxSelected>>", lambda _e: self._on_session_change())
        ttk.Button(sessbar, text="Anadir cuenta", command=self.open_add_account).pack(side="left", padx=(6, 0))
        ttk.Button(sessbar, text="Quitar", command=self.remove_account).pack(side="left", padx=(6, 0))

        panes = ttk.Frame(self.root, padding=(12, 4, 12, 4))
        panes.pack(fill="x")

        # ---- Panel Telegram ----
        tg = ttk.Frame(panes, style="Card.TFrame", padding=10)
        tg.pack(side="left", fill="both", expand=True, padx=(0, 6))
        ttk.Label(tg, text="1. Telegram — grupos donde soy admin",
                  style="SubHeader.TLabel").pack(anchor="w")
        row = ttk.Frame(tg, style="Card.TFrame")
        row.pack(fill="x", pady=(6, 4))
        self.tg_search = ttk.Entry(row)
        self.tg_search.pack(side="left", fill="x", expand=True)
        self.tg_search.bind("<KeyRelease>", lambda _e: self._filter_groups())
        ttk.Button(row, text="Actualizar", command=self.refresh_groups).pack(side="left", padx=(6, 0))
        self.tg_tree = ttk.Treeview(tg, columns=("tipo", "count", "id"),
                                    show="tree headings", height=8)
        self.tg_tree.heading("#0", text="Grupo / canal")
        self.tg_tree.heading("tipo", text="Tipo")
        self.tg_tree.heading("count", text="Miembros")
        self.tg_tree.heading("id", text="ID")
        self.tg_tree.column("#0", width=280)
        self.tg_tree.column("tipo", width=90, anchor="center")
        self.tg_tree.column("count", width=80, anchor="center")
        self.tg_tree.column("id", width=140, anchor="center")
        self.tg_tree.pack(fill="both", expand=True)
        self.tg_tree.bind("<<TreeviewSelect>>", lambda _e: self._update_action_state())
        self.tg_count = ttk.Label(tg, text="0 grupos", style="CardMuted.TLabel")
        self.tg_count.pack(anchor="w", pady=(4, 0))

        # ---- Panel Supabase ----
        sb = ttk.Frame(panes, style="Card.TFrame", padding=10)
        sb.pack(side="left", fill="both", expand=True, padx=(6, 0))
        ttk.Label(sb, text="2. Supabase — proyecto y tabla",
                  style="SubHeader.TLabel").pack(anchor="w")
        self.proj_var = tk.StringVar()
        self.proj_combo = ttk.Combobox(sb, textvariable=self.proj_var, state="readonly")
        self.proj_combo.pack(fill="x", pady=(6, 4))
        self.proj_combo.bind("<<ComboboxSelected>>", lambda _e: self._refresh_table_list())
        row2 = ttk.Frame(sb, style="Card.TFrame")
        row2.pack(fill="x", pady=(0, 4))
        ttk.Label(row2, text="Buscar:", style="Card.TLabel").pack(side="left")
        self.sb_search = ttk.Entry(row2)
        self.sb_search.pack(side="left", fill="x", expand=True, padx=(6, 0))
        self.sb_search.bind("<KeyRelease>", lambda _e: self._refresh_table_list())
        self.table_list = tk.Listbox(sb, height=7, font=("Segoe UI", 10),
                                     bg="#FFFFFF", fg=PALETTE["TEXT"],
                                     selectbackground=PALETTE["PRIMARY"],
                                     selectforeground=PALETTE["PRIMARY_TEXT"])
        self.table_list.pack(fill="both", expand=True)
        self.table_list.bind("<<ListboxSelect>>", lambda _e: self._update_action_state())
        self.sb_info = ttk.Label(sb, text="", style="CardMuted.TLabel", wraplength=420)
        self.sb_info.pack(anchor="w", pady=(4, 0))

        # ---- Barra de acciones ----
        bar = ttk.Frame(self.root, padding=(12, 4, 12, 4))
        bar.pack(fill="x")
        self.btn_fetch = ttk.Button(bar, text="3. Descargar miembros",
                                    command=self.fetch_members)
        self.btn_fetch.pack(side="left")
        self.btn_compare = ttk.Button(bar, text="4. Cruzar con la tabla",
                                      command=self.run_compare)
        self.btn_compare.pack(side="left", padx=(8, 0))
        self.btn_export = ttk.Button(bar, text="Exportar XLSX",
                                     command=self.export_xlsx, state="disabled")
        self.btn_export.pack(side="left", padx=(8, 0))
        self.prog = ttk.Progressbar(bar, mode="determinate", length=220)
        self.prog.pack(side="right")
        self.prog_label = ttk.Label(bar, text="", style="Muted.TLabel")
        self.prog_label.pack(side="right", padx=(0, 8))

        # ---- Resultados ----
        self.nb = ttk.Notebook(self.root)
        self.nb.pack(fill="both", expand=True, padx=12, pady=(4, 12))
        self.tab_resumen = ttk.Frame(self.nb, padding=10)
        self.tab_both = ttk.Frame(self.nb, padding=10)
        self.tab_miss = ttk.Frame(self.nb, padding=10)
        self.tab_extra = ttk.Frame(self.nb, padding=10)
        self.tab_log = ttk.Frame(self.nb, padding=10)
        self.nb.add(self.tab_resumen, text="Resumen")
        self.nb.add(self.tab_both, text="En ambos (0)")
        self.nb.add(self.tab_miss, text="Faltantes (0)")
        self.nb.add(self.tab_extra, text="Extra (0)")
        self.nb.add(self.tab_log, text="Bitacora")

        self.resumen_text = tk.Text(self.tab_resumen, height=12, font=("Consolas", 10),
                                    bg="#FFFFFF", fg=PALETTE["TEXT"], relief="flat")
        self.resumen_text.pack(fill="both", expand=True)

        self.tree_both = self._result_tree(
            self.tab_both, self.f_both,
            ("Telegram", "User ID", "Nombre Telegram", "Nombre BD", "Documento", "Extras"),
            (140, 120, 200, 220, 140, 260), self._fill_both)
        self.tree_miss = self._result_tree(
            self.tab_miss, self.f_miss,
            ("Telegram", "Nombre BD", "Documento", "Extras"),
            (160, 240, 160, 300), self._fill_miss)
        self.tree_extra = self._result_tree(
            self.tab_extra, self.f_extra,
            ("Telegram", "User ID", "Nombre Telegram"),
            (180, 140, 280), self._fill_extra)

        self.log = scrolledtext.ScrolledText(self.tab_log, height=12, font=("Consolas", 9),
                                             bg="#FFFFFF", fg=PALETTE["TEXT"], relief="flat")
        self.log.pack(fill="both", expand=True)

    def _result_tree(self, parent, var, cols, widths, refill):
        top = ttk.Frame(parent)
        top.pack(fill="x", pady=(0, 4))
        ttk.Label(top, text="Buscar:").pack(side="left")
        ent = ttk.Entry(top, textvariable=var)
        ent.pack(side="left", fill="x", expand=True, padx=(6, 0))
        var.trace_add("write", lambda *_a: refill())
        tree = ttk.Treeview(parent, columns=cols[1:], show="tree headings", height=10)
        tree.heading("#0", text=cols[0])
        tree.column("#0", width=widths[0])
        for c, w in zip(cols[1:], widths[1:]):
            tree.heading(c, text=c)
            tree.column(c, width=w)
        tree.pack(fill="both", expand=True)
        return tree

    # ------------------------------------------------------------------
    # Grupos (panel izquierdo)
    # ------------------------------------------------------------------
    def _load_cached_groups(self):
        cached = cache.load(self._cache_key("groups"), None)
        if cached is None and self.session_name == tg_sessions.BUILTIN_NAME:
            cached = cache.load("groups", None)  # compatibilidad historica
        if isinstance(cached, dict) and isinstance(cached.get("groups"), list):
            self.groups = cached["groups"]
            self.me_info = cached.get("me", {})
            self._render_groups()
            self._render_me()
            self.log_line("Cache de grupos cargada (%d). Pulsa Actualizar para re-leer Telegram."
                          % len(self.groups))

    def _render_me(self):
        if self.me_info.get("username"):
            self.me_label.config(text="Sesion: @%s" % self.me_info["username"])
        elif self.me_info.get("name"):
            self.me_label.config(text="Sesion: %s" % self.me_info["name"])

    def _render_groups(self):
        self._filter_groups()

    def _filter_groups(self):
        q = self.tg_search.get().strip().lower()
        self.tg_tree.delete(*self.tg_tree.get_children())
        n = 0
        for g in self.groups:
            hay = ("%s %s" % (g.get("title", ""), g.get("id", ""))).lower()
            if q and q not in hay:
                continue
            self.tg_tree.insert("", "end", text=g.get("title", ""),
                                values=(g.get("type", ""), g.get("members_count", ""),
                                        g.get("id", "")))
            n += 1
        self.tg_count.config(text="%d de %d grupos" % (n, len(self.groups)))

    def selected_group(self):
        sel = self.tg_tree.selection()
        if not sel:
            return None
        gid = str(self.tg_tree.item(sel[0], "values")[2])
        for g in self.groups:
            if str(g.get("id")) == gid:
                return g
        return None

    def refresh_groups(self):
        if self.busy:
            return
        self._set_busy(True, "Leyendo grupos de Telegram…")
        threading.Thread(target=self._groups_job, daemon=True).start()

    def _groups_job(self):
        session = self.session_name
        key = "groups" if session == tg_sessions.BUILTIN_NAME else "groups_%s" % session
        try:
            groups, me = tg_discovery.list_admin_groups(
                progress=lambda i, t, name: self.q.put(("log", "  %d/%d %s" % (i, t, name))),
                session_name=session)
            cache.save(key, {"groups": groups, "me": me})
            self.q.put(("groups", (groups, me, session)))
        except Exception as e:
            self.q.put(("error", "Grupos: %s" % e))

    # ------------------------------------------------------------------
    # Tablas (panel derecho)
    # ------------------------------------------------------------------
    def _refresh_table_list(self):
        projects = sb_catalog.get_projects()
        labels = ["%s%s" % (p["label"], "" if p["configured"] else "  (sin credenciales)")
                  for p in projects]
        self._projects = projects
        self.proj_combo["values"] = labels
        if not self.proj_var.get() and labels:
            dproj, _dtab = sb_catalog.default_selection()
            idx = next((i for i, p in enumerate(projects) if p["key"] == dproj), 0)
            self.proj_combo.current(idx)
        self._render_tables()

    def _current_project(self):
        idx = self.proj_combo.current()
        if idx is None or idx < 0 or idx >= len(self._projects):
            return self._projects[0] if self._projects else None
        return self._projects[idx]

    def _render_tables(self):
        proj = self._current_project()
        self.table_list.delete(0, "end")
        self._table_entries = []
        if not proj:
            return
        q = self.sb_search.get().strip().lower()
        for e in sb_catalog.get_tables(proj["key"]):
            hay = ("%s %s" % (e["label"], e["table"])).lower()
            if q and q not in hay:
                continue
            mark = "" if proj["configured"] else "  [sin credenciales]"
            self.table_list.insert("end", e["label"] + mark)
            self._table_entries.append(e)
        # Preseleccion BOT-CIS
        for i, e in enumerate(self._table_entries):
            if e.get("default"):
                self.table_list.selection_clear(0, "end")
                self.table_list.selection_set(i)
                self.table_list.see(i)
                break
        self._update_sb_info()

    def _update_sb_info(self):
        e = self.selected_entry()
        if not e:
            self.sb_info.config(text="")
            return
        self.sb_info.config(
            text="Tabla: %s   |   usuario: %s   |   nombre: %s   |   docs: %s"
            % (e["table"], e["user_col"], e["name_col"], ", ".join(e.get("doc_cols", []))))

    def selected_entry(self):
        sel = self.table_list.curselection()
        if not sel or sel[0] >= len(self._table_entries):
            return None
        return self._table_entries[sel[0]]

    # ------------------------------------------------------------------
    # Acciones: fetch + cruce
    # ------------------------------------------------------------------
    def _update_action_state(self):
        if self.busy:
            return
        has_g = self.selected_group() is not None
        self.btn_fetch.config(state="normal" if has_g else "disabled")
        has_m = bool(self.members)
        has_e = self.selected_entry() is not None
        self.btn_compare.config(state="normal" if (has_m and has_e) else "disabled")
        self._update_sb_info()

    def fetch_members(self):
        g = self.selected_group()
        if not g or self.busy:
            return
        self._set_busy(True, "Descargando miembros…")
        threading.Thread(target=self._fetch_job, args=(g,), daemon=True).start()

    def _fetch_job(self, g):
        session = self.session_name
        try:
            self.q.put(("log", "Descargando '%s' (%s) con [%s]…"
                        % (g["title"], g["id"], session)))

            def prog(step, done, total, count):
                self.q.put(("progress", (done, total, "%s: %d" % (step, count))))

            members, reported = tg_fetch.fetch_members_by_id(
                int(g["id"]), progress=prog, session_name=session)
            key = ("miembros_%s" % g["id"]) if session == tg_sessions.BUILTIN_NAME \
                else ("miembros_%s_%s" % (g["id"], session))
            cache.save(key, {"members": members, "reported": reported})
            self.q.put(("members", (g, members, reported)))
        except Exception as e:
            self.q.put(("error", "Miembros: %s" % e))

    def run_compare(self):
        if not self.members or self.busy:
            return
        proj = self._current_project()
        entry = self.selected_entry()
        if not proj or not entry:
            return
        self._set_busy(True, "Cruzando con %s…" % entry["table"])
        threading.Thread(target=self._compare_job, args=(proj, entry), daemon=True).start()

    def _compare_job(self, proj, entry):
        try:
            self.q.put(("log", "Leyendo %s.%s…" % (proj["key"], entry["table"])))

            def prog(n):
                self.q.put(("progress", (0, 0, "%d filas…" % n)))

            rows = sb_catalog.fetch_rows(proj["key"], entry["table"], progress=prog)
            self.q.put(("log", "Filas: %d. Cruzando por @username…" % len(rows)))
            result = compare.compare_members(self.members, rows, entry)
            self.q.put(("dbresult", (proj, entry, rows, result)))
        except Exception as e:
            self.q.put(("error", "Cruce: %s" % e))

    def export_xlsx(self):
        if not self.result:
            return
        chat = (self.members_chat or {}).get("title", "canal")
        table = (self.db_entry or {}).get("table", "tabla")
        init = compare.default_out_path(chat, table)
        path = filedialog.asksaveasfilename(
            defaultextension=".xlsx", filetypes=[("Excel", "*.xlsx")],
            initialfile=os.path.basename(init), initialdir=BASE_DIR)
        if not path:
            return
        try:
            label = "%s.%s" % ((self.db_project or {}).get("key", ""), table)
            compare.export_xlsx(path, self.result, chat_title=chat, table_label=label)
            self.last_xlsx = path
            self.log_line("XLSX guardado: %s" % path)
            messagebox.showinfo("Listo", "Guardado:\n%s" % path)
        except Exception as e:
            messagebox.showerror("Error", "No se pudo exportar:\n%s" % e)

    # ------------------------------------------------------------------
    # Resultados
    # ------------------------------------------------------------------
    def _show_result(self, proj, entry, rows, result):
        self.db_project = proj
        self.db_entry = entry
        self.db_rows = rows
        self.result = result
        r = result["resumen"]
        chat = (self.members_chat or {}).get("title", "")
        lines = [
            "Canal: %s (%s)" % (chat, (self.members_chat or {}).get("id", "")),
            "Tabla: %s.%s  (usuario: %s)" % (proj["key"], entry["table"], entry["user_col"]),
            "",
            "Miembros del canal ............ %d  (con @usuario: %d, sin @usuario: %d)"
            % (r["miembros_canal"], r["miembros_con_usuario"], r["miembros_sin_usuario"]),
            "Filas en la tabla ............. %d  (con @usuario: %d, sin @usuario: %d)"
            % (r["filas_db"], r["db_con_usuario"], r["db_sin_usuario"]),
            "",
            "EN AMBOS ...................... %d" % r["en_ambos"],
            "FALTANTES (en BD, no en canal)  %d" % r["faltantes"],
            "EXTRA (en canal, no en BD) .... %d" % r["extra"],
        ]
        if self.reported_count and r["miembros_canal"] < self.reported_count:
            lines.append("")
            lines.append("AVISO: Telegram reporta %d pero solo se obtuvieron %d "
                         "(limite del servidor)." % (self.reported_count, r["miembros_canal"]))
        self.resumen_text.delete("1.0", "end")
        self.resumen_text.insert("1.0", "\n".join(lines))
        self.nb.tab(self.tab_both, text="En ambos (%d)" % r["en_ambos"])
        self.nb.tab(self.tab_miss, text="Faltantes (%d)" % r["faltantes"])
        self.nb.tab(self.tab_extra, text="Extra (%d)" % r["extra"])
        self._fill_both()
        self._fill_miss()
        self._fill_extra()
        self.btn_export.config(state="normal")
        self.log_line("Cruce listo: %d en ambos, %d faltantes, %d extra."
                      % (r["en_ambos"], r["faltantes"], r["extra"]))

    def _match(self, text, q):
        return (not q) or (q in text.lower())

    def _fill_both(self):
        tree = self.tree_both
        tree.delete(*tree.get_children())
        if not self.result:
            return
        q = self.f_both.get().strip().lower()
        for it in self.result["en_ambos"]:
            if not self._match("@%s %s %s" % (it["username"], it["tg"].get("full_name", ""),
                                              it["db"]["name"]), q):
                continue
            tree.insert("", "end", text="@%s" % it["username"],
                        values=(it["tg"].get("user_id", ""), it["tg"].get("full_name", "") or "",
                                it["db"]["name"], it["db"]["doc"], str(it["db"]["extras"])))

    def _fill_miss(self):
        tree = self.tree_miss
        tree.delete(*tree.get_children())
        if not self.result:
            return
        q = self.f_miss.get().strip().lower()
        for it in self.result["faltantes"]:
            if not self._match("@%s %s" % (it["username"], it["db"]["name"]), q):
                continue
            tree.insert("", "end", text="@%s" % it["username"],
                        values=(it["db"]["name"], it["db"]["doc"], str(it["db"]["extras"])))

    def _fill_extra(self):
        tree = self.tree_extra
        tree.delete(*tree.get_children())
        if not self.result:
            return
        q = self.f_extra.get().strip().lower()
        for it in self.result["extra"]:
            if not self._match("@%s %s" % (it["username"], it["tg"].get("full_name", "")), q):
                continue
            tree.insert("", "end", text="@%s" % it["username"],
                        values=(it["tg"].get("user_id", ""),
                                it["tg"].get("full_name", "") or ""))

    # ------------------------------------------------------------------
    # Cola UI / estado
    # ------------------------------------------------------------------
    def log_line(self, msg):
        self.log.insert("end", msg + "\n")
        self.log.see("end")

    def _set_busy(self, busy, status=""):
        self.busy = busy
        if busy:
            self.status_pill.config(text="TRABAJANDO…", bg=PALETTE["WARN_BG"], fg=PALETTE["WARN_TEXT"])
            self.prog_label.config(text=status)
            self.prog.config(mode="indeterminate")
            self.prog.start(12)
            self.btn_fetch.config(state="disabled")
            self.btn_compare.config(state="disabled")
        else:
            self.status_pill.config(text="LISTO", bg=PALETTE["OK_BG"], fg=PALETTE["OK_TEXT"])
            self.prog.stop()
            self.prog.config(mode="determinate", value=0)
            self.prog_label.config(text="")
            self._update_action_state()

    def drain_queue(self):
        try:
            while True:
                kind, payload = self.q.get_nowait()
                if kind == "log":
                    self.log_line(str(payload))
                elif kind == "progress":
                    done, total, txt = payload
                    self.prog_label.config(text=str(txt))
                    if total:
                        self.prog.config(mode="determinate", maximum=total, value=done)
                elif kind == "groups":
                    groups, me, session = payload
                    if session != self.session_name:
                        continue
                    self.groups = groups
                    self.me_info = me or {}
                    self._render_groups()
                    self._render_me()
                    self.log_line("Grupos admin: %d (%s)." % (
                        len(groups),
                        ("@%s" % me.get("username")) if me.get("username") else me.get("name", "")))
                    self._set_busy(False)
                elif kind == "login_need_code":
                    self._login_status("Codigo enviado. Revisa Telegram e ingresalo.")
                    if self._login_dialog is not None:
                        self._lg_code.config(state="normal")
                        self._lg_btn_ok.config(state="normal")
                elif kind == "login_need_password":
                    self._login_status("Cuenta con 2FA: escribe tu contrasena y pulsa Entrar.")
                    if self._login_dialog is not None:
                        self._lg_pwd.config(state="normal")
                        self._lg_btn_ok.config(state="normal")
                elif kind == "login_done":
                    self._login_cancel()
                    self._load_sessions()
                    idx = next((i for i, s in enumerate(self.sessions)
                                if s.get("name") == payload.get("name")), 0)
                    self.sess_combo.current(idx)
                    self._on_session_change()
                    self.log_line("Cuenta anadida: %s (@%s)."
                                  % (payload.get("name"), payload.get("username", "")))
                    self.refresh_groups()
                elif kind == "login_fatal":
                    # El worker murio (fallo begin_login): permitir corregir telefono.
                    self._login_box = None
                    if self._login_dialog is not None:
                        self._login_status(str(payload))
                        self._lg_phone.config(state="normal")
                        self._lg_btn_send.config(state="normal")
                        self._lg_btn_ok.config(state="normal")
                    else:
                        self.log_line("ERROR login: %s" % payload)
                elif kind == "login_error":
                    # Error reintentable (codigo/2FA): el worker sigue esperando.
                    if self._login_dialog is not None:
                        self._login_status(str(payload))
                        self._lg_btn_ok.config(state="normal")
                    else:
                        self.log_line("ERROR login: %s" % payload)
                elif kind == "members":
                    g, members, reported = payload
                    self.members = members
                    self.members_chat = g
                    self.reported_count = reported or 0
                    self.result = None
                    self.btn_export.config(state="disabled")
                    self.log_line("Miembros: %d (Telegram reporta %d)." % (len(members), reported or 0))
                    if reported and len(members) < reported:
                        self.log_line("AVISO: faltan %d por el limite del servidor."
                                      % (reported - len(members)))
                    self._set_busy(False)
                elif kind == "dbresult":
                    proj, entry, rows, result = payload
                    self._set_busy(False)
                    self._show_result(proj, entry, rows, result)
                elif kind == "error":
                    self._set_busy(False)
                    self.log_line("ERROR: %s" % payload)
                    messagebox.showerror("Error", str(payload))
        except queue.Empty:
            pass
        self.root.after(150, self.drain_queue)


# --------------------------------------------------------------------------
# CLI sin GUI
# --------------------------------------------------------------------------
def cli_list_groups(session_name=None):
    session_name = session_name or tg_sessions.default_session_name()
    groups, me = tg_discovery.list_admin_groups(
        progress=lambda i, t, name: print("  %d/%d %s" % (i, t, name)),
        session_name=session_name)
    who = ("@%s" % me.get("username")) if me.get("username") else me.get("name", "")
    print("Cuenta: [%s]  Sesion: %s" % (session_name, who))
    print("Grupos donde soy admin: %d" % len(groups))
    for g in groups:
        print("  %-18s %-10s %6s  %s" % (g["id"], g["type"], g["members_count"], g["title"]))
    if not groups:
        print("  (ninguno — la cuenta debe ser admin del grupo/canal)")


def cli_quick(chat_id, project, table, out="", session_name=None):
    import time as _t
    session_name = session_name or tg_sessions.default_session_name()
    print("Cuenta: [%s]  Descargando miembros de %s…" % (session_name, chat_id))
    t0 = _t.time()
    members, reported = tg_fetch.fetch_members_by_id(
        int(chat_id),
        progress=lambda s, d, t, c: print("  %s: %d" % (s, c), end="\r"),
        session_name=session_name)
    print("\nMiembros: %d (Telegram reporta %d) en %.0fs" % (len(members), reported, _t.time() - t0))
    entry = sb_catalog.get_entry(project, table)
    if entry is None:
        print("Tabla desconocida. Opciones en %s:" % project)
        for e in sb_catalog.get_tables(project):
            print("  %s" % e["table"])
        sys.exit(2)
    rows = sb_catalog.fetch_rows(project, table, progress=lambda n: print("  filas: %d" % n, end="\r"))
    print("\nFilas: %d" % len(rows))
    result = compare.compare_members(members, rows, entry)
    r = result["resumen"]
    print("En ambos: %(en_ambos)d | Faltantes: %(faltantes)d | Extra: %(extra)d" % r)
    path = out or compare.default_out_path("canal_%s" % chat_id, table)
    compare.export_xlsx(path, result, chat_title=str(chat_id),
                        table_label="%s.%s" % (project, table))
    print("XLSX: %s" % path)


def cli_list_sessions():
    sessions, default = tg_sessions.list_sessions()
    print("Cuentas Telegram (%d):" % len(sessions))
    for s in sessions:
        mark = "  <-- por defecto" if s.get("name") == default else ""
        user = ("@%s" % s.get("username")) if s.get("username") else (s.get("phone", "") or "-")
        print("  %-16s %-22s%s" % (s.get("name"), user, mark))


def cli_add_account(phone=""):
    import getpass
    phone = (phone or input("Telefono con codigo de pais (ej. +573001112233): ")).strip()
    pending = None
    try:
        pending = tg_sessions.begin_login(phone)
        if pending.get("authorized"):
            entry = tg_sessions.finish_login(pending)
            print("Sesion ya valida. Cuenta: %s (@%s)" % (entry["name"], entry.get("username", "")))
            return
        print("Codigo enviado. Revisa Telegram.")
        while True:
            code = input("Codigo: ").strip()
            try:
                res = tg_sessions.submit_code(pending, code)
                break
            except Exception as e:
                print("  %s" % e)
        if res == "password_needed":
            pwd = getpass.getpass("Contrasena 2FA: ")
            tg_sessions.submit_password(pending, pwd)
        entry = tg_sessions.finish_login(pending)
        print("Cuenta anadida: %s (@%s)" % (entry["name"], entry.get("username", "")))
    except KeyboardInterrupt:
        print("\nCancelado.")
    finally:
        if pending is not None and pending.get("client") is not None:
            try:
                pending["client"].disconnect()
            except Exception:
                pass


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Consola Canal Telegram vs BOT (Supabase)")
    ap.add_argument("--list-groups", action="store_true")
    ap.add_argument("--list-sessions", action="store_true")
    ap.add_argument("--add-account", nargs="?", const="", metavar="PHONE")
    ap.add_argument("--session", default="", help="Cuenta a usar (por defecto: la marcada)")
    ap.add_argument("--quick", metavar="CHAT_ID")
    ap.add_argument("--project", default="INVENTARIO")
    ap.add_argument("--table", default="clientes_cis")
    ap.add_argument("--out", default="")
    args = ap.parse_args()
    if args.list_sessions:
        cli_list_sessions()
        return
    if args.add_account is not None:
        cli_add_account(args.add_account)
        return
    if args.list_groups:
        cli_list_groups(args.session or None)
        return
    if args.quick:
        cli_quick(args.quick, args.project, args.table, args.out, args.session or None)
        return
    root = tk.Tk()
    root.title("Canal Telegram vs BOT (Supabase)")
    root.geometry("1180x760")
    setup_style(root)
    CanalApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
