# cis_engine (vendored)

Copies of `sys-group/fill_cis.py` and `sys-group/generar_cis.py` plus the
`TEMPLATES/MODELO CIS.docx` template, so the dashboard works standalone
(e.g. on Render) without the `sys-group` folder, the ID images, or Word.

- Fast per-person DOCX generation needs only these two files + `python-docx`.
- If you change the engine in `sys-group/`, re-copy the files here.
- To change the template permanently, replace
  `cis_engine/TEMPLATES/MODELO CIS.docx` and push (a dashboard upload via
  `/api/cis/template` only lives until the next Render restart).
