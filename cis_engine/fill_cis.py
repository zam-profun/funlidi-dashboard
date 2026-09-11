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


def set_hanging_indent(p, inches):
    """Set a hanging indent so wrapped lines start at `inches` from the margin.

    First line stays at 0 (label), continuation lines align at `inches`
    (where the value starts).
    """
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    pPr = p._p.get_or_add_pPr()
    ind = pPr.find(qn("w:ind"))
    if ind is None:
        ind = OxmlElement("w:ind")
        pPr.append(ind)
    twips = str(int(round(inches * 1440)))
    ind.set(qn("w:left"), twips)
    ind.set(qn("w:hanging"), twips)


def fill_label_rebuilt(doc, label_text, value, sep_spaces, hanging_inches, color=None):
    """Rebuild a label paragraph as `Label:<spaces><value>` with hanging indent.

    Tabs are deliberately avoided: tab stops shift with paragraph indentation,
    which would move the value column away from the hanging position. Fixed
    spaces give a value column that is identical for every client, so wrapped
    lines always align under the value start.
    """
    import re
    value = str(value if value is not None else "")
    target = label_text.strip()
    sep = " " * int(sep_spaces)
    matched = False
    for p in doc.paragraphs:
        if paragraph_label(p) == target:
            src = next((r for r in p.runs if r.text.strip()), None)
            clean_label = target.rstrip(":") + ":"
            for r in list(p.runs):
                r._element.getparent().remove(r._element)
            run = p.add_run(clean_label + sep + value)
            if src is not None:
                _clone_props(src, run)
            if color is not None:
                _set_run_color(run, color)
            set_hanging_indent(p, hanging_inches)
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


def _walk_replace_in_shapes(paragraph, data, filled):
    """Recursively walk a paragraph's w:drawing text boxes and replace header placeholders."""
    from docx.oxml.ns import qn
    mapping = [
        ("Name of the Person", data.get("header_name", "")),
        ("Number / Country of Issue", data.get("header_country", "")),
        ("Full Address", data.get("header_address", "")),
        ("Number", data.get("header_telephone", "")),
        ("Address", data.get("header_email", "")),
    ]
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