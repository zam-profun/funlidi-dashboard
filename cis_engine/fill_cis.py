# -*- coding: utf-8 -*-
"""Shared library for filling the CIS DOCX template.

Three fill modes, all formatting-preserving:
  1. append_after_label  -> "Label\\t: " body fields (add a new run after the last run).
  2. replace_in_text     -> in-place placeholder replacement ((NAME OF PERSON), Todays Date, header placeholders).
  3. insert_image        -> contain + white-pad image into the fixed COPY PASSPORT frame.

The image is normalized to a fixed frame so every generated CIS has identical
image geometry regardless of the source scan's size.
"""

import os
import io
import re
from datetime import datetime

from docx import Document
from docx.shared import Inches, Emu
from docx.enum.text import WD_ALIGN_PARAGRAPH
from PIL import Image

# Fixed image frame: the anchored text-box at paragraph 74 in MODELO CIS.docx.
# extent cx=4648200 cy=6257925 EMU  (1 inch = 914400 EMU)
FRAME_W_EMU = 4648200
FRAME_H_EMU = 6257925
FRAME_W_IN = FRAME_W_EMU / 914400.0  # ~5.08
FRAME_H_IN = FRAME_H_EMU / 914400.0  # ~6.84
FRAME_ASPECT = FRAME_W_EMU / float(FRAME_H_EMU)  # ~0.743 portrait

TEMPLATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "TEMPLATES", "MODELO CIS.docx")

BLUE = "0070C0"  # en azul -> declaration/signature names + signature date


# --------------------------------------------------------------------------
# Text helpers
# --------------------------------------------------------------------------

def split_name(full_name):
    """Split a full name into (first, middle, last) using First | one Middle | Last two words."""
    parts = [p for p in str(full_name or "").strip().split() if p]
    if not parts:
        return "", "", ""
    if len(parts) == 1:
        return parts[0], "", ""
    if len(parts) == 2:
        return parts[0], "", parts[1]
    if len(parts) == 3:
        return parts[0], parts[1], parts[2]
    # 4+ words: first, second-as-middle, remainder-as-last
    return parts[0], parts[1], " ".join(parts[2:])


def fmt_date(value, default="N/A"):
    """Format a date value as DD/MM/YYYY. Accepts datetime/date/str."""
    if not value:
        return default
    if isinstance(value, datetime):
        return value.strftime("%d/%m/%Y")
    if hasattr(value, "strftime"):  # date object
        return value.strftime("%d/%m/%Y")
    s = str(value).strip()
    if not s:
        return default
    # try to parse common formats
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%m/%d/%Y", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).strftime("%d/%m/%Y")
        except ValueError:
            continue
    # already DD/MM/YYYY-ish
    if re.fullmatch(r"\d{1,2}/\d{1,2}/\d{4}", s):
        return s
    return s


# Header composition tuning.
HEADER_PARTS_HARD_MAX = 150  # sanity cap only; real addresses stay far below
HEADER_LINE_CHARS = 66  # measured chars per visual header line (16pt bold centered)
HEADER_LINE_PT = 16  # vertical budget per header line
HEADER_ADDR_LINE_MAX = 60  # packed address lines stay below this (margin under capacity)

_MISSING_PARTS = ("", "N/A", "NA", "NAN", "-", "0", "NONE", "NO", "NULL")


def _present_part(v):
    s = str(v or "").strip()
    return s if s and s.upper() not in _MISSING_PARTS else ""


def _clean_part(v):
    """Normalize an address part: collapse whitespace, fix space-before-comma."""
    s = _present_part(v)
    if not s:
        return ""
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r" +,", ",", s)
    return s.strip()


def build_header_lines(doc_number, legal_country, street, city, state, zip_code,
                       address_country):
    """Compose the header's passport and address lines.

    - Passport line: " / "-joined present values among [doc_number,
      legal_country] (pais_legal: USA for Puerto Ricans etc. as stored data).
    - Address block: cleaned segments (street fragments, city, state, address
      country; Barrio rides inside the street value) plus "Postal Code: X" as
      the final segment, greedily packed into balanced lines of at most
      HEADER_ADDR_LINE_MAX chars. Every non-final line ends with a comma, so
      breaks only ever fall between segments — labels never split and no
      lonely stumps appear.
    Returns dict(country_line, address_lines=[line1, line2, ...]).
    """
    country_line = " / ".join([p for p in (
        _present_part(doc_number), _present_part(legal_country)) if p])
    parts_list = [_clean_part(v) for v in (street, city, state, address_country)]
    parts_list = [p for p in parts_list if p]
    # Expand comma-separated segments (the street often already holds
    # barrio/street/city fragments) so consecutive duplicates collapse across
    # boundaries too ("A, GUATEMALA, GUATEMALA, B" -> "A, GUATEMALA, B").
    segments = []
    for p in parts_list:
        segments.extend([s.strip() for s in p.split(",") if s.strip()])
    deduped = []
    for p in segments:
        if not deduped or deduped[-1].upper() != p.upper():
            deduped.append(p)
    zip_clean = _present_part(zip_code)
    if zip_clean:
        deduped.append(f"Postal Code: {zip_clean}")
    # Sanity cap only against pathological input (never engages in practice).
    joined = ", ".join(deduped)
    if len(joined) > HEADER_PARTS_HARD_MAX:
        joined = joined[: HEADER_PARTS_HARD_MAX - 1].rstrip() + "…"
        deduped = [s.strip() for s in joined.split(",") if s.strip()]
    # Greedy pack: every non-final line ends with "," and stays within budget,
    # so Word never needs to re-wrap mid-label on its own.
    lines = []
    current = ""
    for seg in deduped:
        candidate = seg if not current else current + ", " + seg
        # +1 reserves room for the trailing comma on non-final lines.
        if current and len(candidate) + 1 > HEADER_ADDR_LINE_MAX:
            lines.append(current + ",")
            current = seg
        else:
            current = candidate
    if current:
        lines.append(current)
    if not lines:
        lines = [""]
    # Box budget: one visual line per packed line, plus natural wrap for any
    # single over-long segment without commas to break on.
    addr_count = 0
    for ln in lines:
        addr_count += max(1, -(-len(ln) // HEADER_LINE_CHARS))
    return {
        "country_line": country_line,
        "address_lines": lines,
        "address_line_count": addr_count,
    }


def is_us(pais):
    p = (pais or "").upper().strip()
    return p in ("ESTADOS UNIDOS", "ESTADOS UNIDOS DE AMERICA", "USA", "US", "UNITED STATES", "EEUU", "EE.UU.")


def gender_word(genero):
    """Normalize gender to uppercase MALE / FEMALE."""
    g = (genero or "").strip().upper()
    if g in ("MALE", "MASCULINO", "HOMBRE", "M"):
        return "MALE"
    if g in ("FEMALE", "FEMENINO", "MUJER", "F"):
        return "FEMALE"
    return g or "N/A"


# --------------------------------------------------------------------------
# DOCX fill engine
# --------------------------------------------------------------------------

def _set_run_color(run, hexcolor):
    """Force a run's font color (hex without '#')."""
    from docx.shared import RGBColor
    if isinstance(hexcolor, str) and not hexcolor.startswith("#"):
        hexcolor = "#" + hexcolor
    run.font.color.rgb = RGBColor.from_string(hexcolor.lstrip("#"))


def _clone_props(source_run, dest_run):
    """Copy the source run's rPr (formatting) onto dest run, preserving dest text."""
    import copy
    src_rpr = source_run._r.find(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}rPr")
    if src_rpr is not None:
        new_rpr = copy.deepcopy(src_rpr)
        dest_rpr = dest_run._r.find(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}rPr")
        if dest_rpr is not None:
            dest_run._r.remove(dest_rpr)
        dest_run._r.insert(0, new_rpr)


def _last_run(p):
    """Return the last run of paragraph p, or None."""
    return p.runs[-1] if p.runs else None


def append_after_label(p, value):
    """Append `value` after the paragraph's existing runs, cloning the label's formatting.

    Preserves every existing run (labels, tabs, bold colons, heading styles) untouched.
    """
    value = str(value if value is not None else "")
    last = _last_run(p)
    if last is None:
        p.add_run(value)
        return p.runs[-1]
    # clone formatting from the first non-empty run (the label) if available
    src = next((r for r in p.runs if r.text.strip()), None) or last
    new_run = p.add_run(value)
    _clone_props(src, new_run)
    return new_run


def replace_in_text(p, old, new, color=None):
    """Replace literal `old` text inside a paragraph's runs, preserving run formatting.

    Handles `old` spanning multiple runs. If `color` given, force that color on
    the run(s) that received the replacement.
    """
    new = str(new if new is not None else "")
    # Concatenate run texts to find the span
    full = "".join(r.text for r in p.runs)
    idx = full.find(old)
    if idx < 0:
        return False
    end = idx + len(old)
    # Walk runs, replacing the slice
    pos = 0
    replaced_any = False
    for r in p.runs:
        run_start = pos
        run_end = pos + len(r.text)
        if run_end <= idx or run_start >= end:
            pos = run_end
            continue
        # overlap with [idx, end)
        seg_start = max(run_start, idx)
        seg_end = min(run_end, end)
        left = r.text[: seg_start - run_start]
        right = r.text[seg_end - run_start:]
        new_part = new if seg_start == idx else ""
        r.text = left + new_part + right
        if color and new_part:
            _set_run_color(r, color)
        replaced_any = True
        pos = run_end
    return replaced_any


def paragraph_label(p):
    """Extract the label of a fill paragraph: text before the first tab if any,
    else text before the first colon. Strips whitespace."""
    text = p.text
    if "\t" in text:
        return text.split("\t")[0].strip()
    if ":" in text:
        return text.split(":")[0].strip()
    return text.strip()


def set_hanging_indent(p, left_inches, hanging_inches=None):
    """Set a hanging indent (inches, margin-relative).

    Wrapped lines start at `left_inches`; the first line starts at
    `left_inches - hanging_inches`. With hanging omitted, the first line
    stays at 0 (margin).
    """
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    if hanging_inches is None:
        hanging_inches = left_inches
    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    ind.set(qn("w:left"), str(int(round(left_inches * 1440))))
    ind.set(qn("w:hanging"), str(int(round(hanging_inches * 1440))))


def apply_hanging_to_label(doc, label_text, left_inches, hanging_inches=None):
    """Set hanging indent on every paragraph whose label equals `label_text`."""
    n = 0
    for p in doc.paragraphs:
        if paragraph_label(p) == label_text.strip():
            set_hanging_indent(p, left_inches, hanging_inches)
            n += 1
    return n


def fill_label_tabbed(doc, label_text, value, left_inches, hanging_inches, color=None):
    """Rebuild a label paragraph as `Label:` + single tab + value, with hanging
    indent. The tab snaps to the hanging-indent position, so the value lands on
    the same column for every row and wrapped lines align under it.
    """
    value = str(value if value is not None else "")
    target = label_text.strip()
    matched = False
    for p in doc.paragraphs:
        if paragraph_label(p) == target:
            src = next((r for r in p.runs if r.text.strip()), None)
            clean_label = target.rstrip(":") + ":"
            for r in list(p.runs):
                r._element.getparent().remove(r._element)
            lbl_run = p.add_run(clean_label)
            tab_run = p.add_run("\t")
            val_run = p.add_run(value)
            if src is not None:
                _clone_props(src, lbl_run)
                _clone_props(src, tab_run)
                _clone_props(src, val_run)
            if color is not None:
                _set_run_color(val_run, color)
            set_hanging_indent(p, left_inches, hanging_inches)
            matched = True
    return matched


def fill_label(doc, label_text, value, color=None):
    """Fill every paragraph whose label (see paragraph_label) equals `label_text`,
    appending `value` after the label. Optional forced color.

    Exact-label matching prevents 'Passport' from hitting 'Passport Information' and
    'Country' from hitting 'Country of Citizenship', and keeps the 'ADDRESS:' field
    distinct from the bare 'ADDRESS' section title.
    """
    value = str(value if value is not None else "")
    target = label_text.strip()
    matched = False
    for p in doc.paragraphs:
        if paragraph_label(p) == target:
            run = append_after_label(p, value)
            if color and run is not None:
                _set_run_color(run, color)
            matched = True
    return matched





def normalize_image(src_path, out_path, frame_w_in=FRAME_W_IN, frame_h_in=FRAME_H_IN, bg=(255, 255, 255)):
    """Contain + white-pad `src_path` into a fixed frame; write to `out_path` (PNG)."""
    with Image.open(src_path) as im:
        im = im.convert("RGB")
        # Downscale only if larger than needed; never upscale beyond reasonable max.
        target_w = int(round(frame_w_in * 150))  # 150 DPI proxy
        target_h = int(round(frame_h_in * 150))
        scale = min(target_w / im.width, target_h / im.height)
        new_w = max(1, int(round(im.width * scale)))
        new_h = max(1, int(round(im.height * scale)))
        resized = im.resize((new_w, new_h), Image.LANCZOS)

        canvas = Image.new("RGB", (target_w, target_h), bg)
        offset_x = (target_w - new_w) // 2
        offset_y = (target_h - new_h) // 2
        canvas.paste(resized, (offset_x, offset_y))
        canvas.save(out_path, "PNG")
    return out_path


def insert_image_into_frame(doc, img_bytes_or_path, para_index):
    """Insert an image into the anchored text box at `para_index`, sized to the frame.

    The placeholder is an anchored wps text box. We place the picture inside the
    text box's first empty paragraph so it renders inside the fixed frame.
    """
    from docx.text.paragraph import Paragraph
    from docx.oxml.ns import qn
    p = doc.paragraphs[para_index]
    boxes = p._p.findall(".//" + qn("w:txbxContent"))
    if not boxes:
        return None
    for wp in boxes[0].findall(qn("w:p")):
        para = Paragraph(wp, p)
        if not para.text.strip():
            run = para.add_run()
            if hasattr(img_bytes_or_path, "read"):
                run.add_picture(img_bytes_or_path, width=Inches(FRAME_W_IN), height=Inches(FRAME_H_IN))
            else:
                run.add_picture(img_bytes_or_path, width=Inches(FRAME_W_IN), height=Inches(FRAME_H_IN))
            return run
    return None


def find_para_index(doc, startswith):
    for i, p in enumerate(doc.paragraphs):
        if p.text.strip().startswith(startswith):
            return i
    return None


def fill_header(doc, data):
    """Fill the per-page header text box placeholders in header2.xml via python-docx."""
    filled = []
    section = doc.sections[0]
    header = section.header
    # Search paragraphs recursively (header can contain nested text boxes in shapes)
    for para in header.paragraphs:
        _walk_replace_in_shapes(para, data, filled)
    return filled


def fit_header_box(doc, address_lines):
    """Grow the header text box so a multi-line address never pushes content out.

    The stock box fits ~5 lines (name, passport, 1-line address, tel, email).
    Every extra address line adds HEADER_LINE_PT below; the shape is transparent
    and behind text, and body layout is driven by section margins, so growing
    is visually safe. Updates both wp:extent and a:ext on every header drawing.
    """
    from docx.oxml.ns import qn
    extra = max(0, int(address_lines) - 1)
    if extra <= 0:
        return False
    grown = False
    section = doc.sections[0]
    header = section.header
    for para in header.paragraphs:
        for drawing in para._p.iter(qn("w:drawing")):
            for ext in list(drawing.iter(qn("wp:extent"))):
                try:
                    cx = int(ext.get("cx"))
                    cy = int(ext.get("cy"))
                except (TypeError, ValueError):
                    continue
                ext.set("cy", str(cy + extra * HEADER_LINE_PT * 12700))
                grown = True
            for a_ext in drawing.iter("{http://schemas.openxmlformats.org/drawingml/2006/main}ext"):
                try:
                    acx = int(a_ext.get("cx"))
                    acy = int(a_ext.get("cy"))
                except (TypeError, ValueError):
                    continue
                a_ext.set("cy", str(acy + extra * HEADER_LINE_PT * 12700))
                grown = True
    return grown


def _insert_run_after(p_el, ref_r_el, text, rPr_src=None, break_first=False):
    """Insert a new run with `text` right after `ref_r_el` inside paragraph `p_el`,
    cloning formatting from `rPr_src`. Optionally starts with a line break."""
    import copy
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    kids = list(p_el)
    pos = kids.index(ref_r_el) + 1 if ref_r_el in kids else len(kids)
    if break_first:
        br_run = OxmlElement("w:r")
        if rPr_src is not None:
            br_run.append(copy.deepcopy(rPr_src))
        br_run.append(OxmlElement("w:br"))
        p_el.insert(pos, br_run)
        pos += 1
    nr = OxmlElement("w:r")
    if rPr_src is not None:
        nr.append(copy.deepcopy(rPr_src))
    t_el = OxmlElement("w:t")
    t_el.set(qn("xml:space"), "preserve")
    t_el.text = text
    nr.append(t_el)
    p_el.insert(pos, nr)
    return nr


def _walk_replace_in_shapes(paragraph, data, filled):
    """Recursively walk a paragraph's w:drawing text boxes and replace header placeholders."""
    from docx.oxml.ns import qn
    addr_lines = data.get("header_address_lines") or []
    addr_first = addr_lines[0] if addr_lines else data.get("header_address", "")
    mapping = [
        ("Name of the Person", data.get("header_name", "")),
        ("Number / Country of Issue", data.get("header_country", "")),
        ("Full Address", addr_first),
        ("Number", data.get("header_telephone", "")),
        ("Address", data.get("header_email", "")),
    ]
    addr_rest = addr_lines[1:] if len(addr_lines) > 1 else []
    # Exact token match per w:t so the 'Address: ' label is never clobbered.
    for t in paragraph._p.iter(qn("w:t")):
        text = t.text or ""
        if not text:
            continue
        new_text = text
        for ph, val in mapping:
            if ph == new_text and val:
                new_text = val
                break
        if new_text != text:
            t.text = new_text
            filled.append(t)
            if text == "Full Address" and addr_rest:
                # Remaining address lines each start on a fresh line, keeping
                # the token run's formatting. NOTE: the token run lives in a
                # nested txbxContent paragraph, so insert relative to its real
                # parent, not the outer paragraph.
                run_el = t.getparent()
                inner_p = run_el.getparent()
                rPr = run_el.find(qn("w:rPr"))
                anchor = run_el
                for ln in addr_rest:
                    # _insert_run_after returns the new w:r: chain after it.
                    anchor = _insert_run_after(inner_p, anchor, ln,
                                               rPr_src=rPr, break_first=True)
                filled.append(t)