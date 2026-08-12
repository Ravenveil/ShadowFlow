# -*- coding: utf-8 -*-
"""把 lingbot-复现报告 的 5 份 markdown 合并导出为一个 Word 文档。
处理：标题/表格/无序列表(含缩进)/引用/加粗/行内代码/链接/水平线。
"""
import re, sys, os
import docx
from docx.shared import Pt, RGBColor, Inches
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = ["README.md", "01-LingBot-VLA.md", "02-LingBot-World.md",
         "03-LingBot-VA.md", "04-LingBot-Depth.md"]
OUT = os.path.join(HERE, "LingBot系列复现报告.docx")

FONT_EN = "Times New Roman"
FONT_CN = "微软雅黑"

doc = docx.Document()

# 全局字体（含东亚字体）
for style in doc.styles:
    if hasattr(style, "font"):
        style.font.name = FONT_EN
        rpr = style.element.get_or_add_rPr()
        rfonts = rpr.find(qn("w:rFonts"))
        if rfonts is None:
            rfonts = rpr.makeelement(qn("w:rFonts"), {})
            rpr.append(rfonts)
        rfonts.set(qn("w:eastAsia"), FONT_CN)

INLINE = re.compile(r"(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))")

def add_runs(paragraph, text):
    """渲染行内：**加粗** `代码` [文字](链接)。"""
    pos = 0
    for m in INLINE.finditer(text):
        if m.start() > pos:
            _run(paragraph, text[pos:m.start()])
        tok = m.group(0)
        if tok.startswith("**"):
            _run(paragraph, tok[2:-2], bold=True)
        elif tok.startswith("`"):
            _run(paragraph, tok[1:-1], code=True)
        else:  # link
            lm = re.match(r"\[([^\]]+)\]\(([^)]+)\)", tok)
            _run(paragraph, lm.group(1), link=True)
        pos = m.end()
    if pos < len(text):
        _run(paragraph, text[pos:])

def _run(paragraph, text, bold=False, code=False, link=False):
    if text == "":
        return
    r = paragraph.add_run(text)
    r.font.name = FONT_EN
    r._element.rPr.rFonts.set(qn("w:eastAsia"), FONT_CN)
    if bold:
        r.bold = True
    if code:
        r.font.name = "Consolas"
        r.font.color.rgb = RGBColor(0xC0, 0x39, 0x2B)
    if link:
        r.font.color.rgb = RGBColor(0x1A, 0x5F, 0xB4)
        r.underline = True

def is_table_row(line):
    s = line.strip()
    return s.startswith("|") and s.endswith("|")

def parse_cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]

def flush_table(rows):
    if not rows:
        return
    # rows[1] 是 |---| 分隔行
    header = parse_cells(rows[0])
    body = [parse_cells(r) for r in rows[2:]]
    ncol = len(header)
    t = doc.add_table(rows=1, cols=ncol)
    t.style = "Table Grid"
    for i, h in enumerate(header):
        cell = t.rows[0].cells[i]
        cell.paragraphs[0].text = ""
        add_runs(cell.paragraphs[0], h)
        for run in cell.paragraphs[0].runs:
            run.bold = True
        # 表头底纹
        tcpr = cell._tc.get_or_add_tcPr()
        shd = tcpr.makeelement(qn("w:shd"), {qn("w:fill"): "D9E1F2"})
        tcpr.append(shd)
    for brow in body:
        cells = t.add_row().cells
        for i in range(ncol):
            txt = brow[i] if i < len(brow) else ""
            cells[i].paragraphs[0].text = ""
            add_runs(cells[i].paragraphs[0], txt)
    doc.add_paragraph()

for fidx, fname in enumerate(FILES):
    with open(os.path.join(HERE, fname), encoding="utf-8") as f:
        lines = f.read().split("\n")
    if fidx > 0:
        doc.add_page_break()
    tbl_buf = []
    for line in lines:
        if is_table_row(line):
            tbl_buf.append(line)
            continue
        elif tbl_buf:
            flush_table(tbl_buf)
            tbl_buf = []
        s = line.rstrip()
        if not s.strip():
            continue
        if s.startswith("# "):
            h = doc.add_heading(level=0 if fidx == 0 and s.startswith("# LingBot 系列") else 1)
            add_runs(h, s[2:])
        elif s.startswith("## "):
            h = doc.add_heading(level=1); add_runs(h, s[3:])
        elif s.startswith("### "):
            h = doc.add_heading(level=2); add_runs(h, s[4:])
        elif s.strip() == "---":
            continue
        elif s.lstrip().startswith("- ") or s.lstrip().startswith("* "):
            indent = len(s) - len(s.lstrip())
            p = doc.add_paragraph(style="List Bullet")
            if indent >= 2:
                p.paragraph_format.left_indent = Inches(0.5)
            add_runs(p, s.lstrip()[2:])
        elif s.lstrip().startswith(">"):
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.3)
            txt = s.lstrip()[1:].lstrip()
            add_runs(p, txt)
            for run in p.runs:
                run.italic = True
                run.font.color.rgb = RGBColor(0x55, 0x55, 0x55)
        else:
            p = doc.add_paragraph()
            add_runs(p, s)
    if tbl_buf:
        flush_table(tbl_buf)

doc.save(OUT)
print("SAVED:", OUT)
