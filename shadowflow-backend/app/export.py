"""交付文件包：客户付完钱，除了网页上能看，还得能拿走一份文件。

为什么之前一直没做：页面能读就够了——这话只对老板自己成立。
客户拿到文案，下一步是发给他的客户、丢进群里、贴进公众号后台；
他要的是「一个能双击打开的文件」，不是「一个链接，打开，全选，复制」。

这一层只做两件事，都不碰业务：
  · `build_zip`  —— 正文、可编辑版、质检报告、订单信息、附录，一个包收齐；
  · `build_pdf`  —— 一份能直接转发/打印的交付单（正文 + 质检摘要 + 附录）。

设计约束：
  · 不依赖网络、不改数据库，纯函数式：给订单和交付物，还字节；
  · PDF 依赖 reportlab；没装也能用，`available()` 会如实说 PDF 不可用，
    调用方据此只给 ZIP 下载，而不是让页面点出一个 500；
  · 中文必须真能显示：优先嵌系统字体（只嵌用到的字形，几 KB），
    找不到字体才退回 Adobe 的 STSong-Light（不嵌字，靠阅读器替换）。
"""

import io
import os
import re
import zipfile
from datetime import datetime
from xml.sax.saxutils import escape

try:  # PDF 是可选能力：没装 reportlab 时其余功能照常
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import (
        KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    _PDF_OK = True
except Exception:  # noqa: BLE001 - 缺库不是错误，是「这一项暂时没有」
    _PDF_OK = False

# 系统里可能有中文字体的地方。Windows 在前（本项目的主场），Linux 兜底。
FONT_CANDIDATES = (
    (os.environ.get("SF_PDF_FONT") or "", None),
    (r"C:\Windows\Fonts\simhei.ttf", None),
    (r"C:\Windows\Fonts\msyh.ttc", 0),
    (r"C:\Windows\Fonts\simsun.ttc", 0),
    (r"C:\Windows\Fonts\Deng.ttf", None),
    ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", 0),
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 0),
    ("/usr/share/fonts/truetype/arphic/uming.ttc", 0),
)
FONT_NAME = "SFCJK"
_FONT_READY = None

# 文件名里不能出现的字符（Windows 最严格，按它来）
_BAD_NAME = re.compile(r'[\\/:*?"<>|\r\n\t]')


# 有些符号黑体里没有字形（¥ ✓ •），PDF 上会显示成方框。
# 换成字体里有的等价字符，别让客户看到一排豆腐块。
PDF_SYMBOLS = {"¥": "￥", "✓": "√", "•": "·", "✗": "×", "□": "口"}


def _pdf_plain(text):
    """表格单元格用：只换符号，不转义（Table 不吃 XML）。"""
    out = str(text or "")
    for raw, plain in PDF_SYMBOLS.items():
        out = out.replace(raw, plain)
    return out


def _pdf_text(text):
    """PDF 专用：先换掉字体里没有的符号，再转义 XML。"""
    out = str(text or "")
    for raw, plain in PDF_SYMBOLS.items():
        out = out.replace(raw, plain)
    return escape(out)


class ExportError(Exception):
    """打包失败：缺交付物、格式不支持、字体/库不可用。"""

    def __init__(self, message, status=409):
        super().__init__(message)
        self.message = message
        self.status = status


def _clean_name(name, limit=60):
    text = _BAD_NAME.sub("·", (name or "").strip()) or "未命名"
    return text[:limit]


def _fmt_time(stamp):
    """2026-11-04T15:41:02.123 → 2026-11-04 15:41"""
    if not stamp:
        return "—"
    return str(stamp).replace("T", " ")[:16]


def _money(order):
    if order.get("amount_text"):
        return str(order["amount_text"])
    cents = order.get("amount_cents")
    return f"¥{cents / 100:.2f}" if isinstance(cents, (int, float)) else "—"


def _quality_lines(quality):
    """质检摘要，写成客户看得懂的话，不抄内部字段名。"""
    q = quality or {}
    if not q:
        return ["这一单没有留质检记录。"]
    lines = [
        f"发货前自检：{q.get('score', '—')} 分（{q.get('level') or '—'}）",
        f"结论：{q.get('verdict') or '—'}",
    ]
    length = q.get("length") or {}
    if length:
        asked = length.get("wanted")
        span = f"客户要求「{asked}」" if asked else f"合理区间 {length.get('floor')}–{length.get('ceiling')} 字"
        lines.append(f"篇幅：{length.get('chars')} 字（{span}）")
    form = q.get("form") or {}
    if form.get("note"):
        lines.append(f"形态：{form['note']}")
    items = q.get("items") or []
    if items:
        lines.append("四项打分：")
        for i in items:
            mark = "✓" if i.get("ok") else "!"
            lines.append(f"  {mark} {i.get('name')} {i.get('score')}/{i.get('weight')} —— {i.get('note') or ''}")
    if q.get("polish"):
        lines.append(f"出街清洗：{'、'.join(q['polish'])}")
    rework = q.get("rework") or {}
    if rework:
        if rework.get("kept") == "original":
            lines.append(f"返工记录：补过一次没变好，保留了原来那版（{rework.get('score_before')} 分）")
        else:
            lines.append(
                f"返工记录：{rework.get('task')} 从 {rework.get('score_before')} 分补到 {rework.get('score_after')} 分"
            )
    return lines


def _readme(order, payload):
    quality = (payload or {}).get("quality") or {}
    appendix = (payload or {}).get("appendix") or []
    trimmed = (payload or {}).get("trimmed") or {}
    files = [
        ("交付正文.txt", "客户能直接复制使用的成品（纯文本，没有排版符号）"),
        ("交付正文.md", "带小标题的版本，方便二次编辑和粘贴进后台"),
        ("质检报告.txt", "这单发货前查了什么、扣在哪、怎么改的"),
        ("订单信息.txt", "订单号、服务、金额、需求原文，对账或追溯用"),
    ]
    if appendix:
        files.append((f"附录/（{len(appendix)} 个文件）", "策划过程与未精简原稿，需要核对时再看"))
    lines = [
        "ShadowFlow 交付文件包",
        "=" * 34,
        f"订单号：{order.get('id')}",
        f"服务：{order.get('product_name') or '—'}",
        f"客户：{order.get('buyer_name') or '—'}",
        f"金额：{_money(order)}",
        f"交付时间：{_fmt_time(order.get('delivered_at'))}",
        f"质检：{quality.get('score', '—')} 分 · {quality.get('verdict') or ''}",
        "",
        "包里有什么",
        "-" * 34,
    ]
    for name, note in files:
        lines.append(f"  {name}")
        lines.append(f"      {note}")
    lines += ["", "怎么用", "-" * 34]
    if trimmed:
        lines.append(
            f"  正文按你要求的篇幅精简过：原稿 {trimmed.get('from')} 字 → 交付 {trimmed.get('to')} 字，"
            "完整原稿在附录里。"
        )
    lines += [
        "  先打开「交付正文.txt」直接用；要改稿开「交付正文.md」。",
        "  想核对评分和篇幅，看「质检报告.txt」；要对账/追溯，看「订单信息.txt」。",
        "  网页上的内容和这份包里的正文是同一份，不是两套东西。",
        "",
        "本文件包由 ShadowFlow 自动生成，订单号是唯一凭据。",
    ]
    return "\n".join(lines)


def _order_info(order, payload):
    quality = (payload or {}).get("quality") or {}
    lines = [
        "订单信息",
        "=" * 34,
        f"订单号：{order.get('id')}",
        f"服务：{order.get('product_name') or '—'}（{order.get('product_id') or '—'}）",
        f"客户：{order.get('buyer_name') or '—'}",
        f"联系方式：{order.get('contact') or '—'}",
        f"金额：{_money(order)}",
        f"下单时间：{_fmt_time(order.get('created_at'))}",
        f"支付时间：{_fmt_time(order.get('paid_at'))}",
        f"交付时间：{_fmt_time(order.get('delivered_at'))}",
        f"自检分数：{quality.get('score', '—')}",
        "",
        "需求原文",
        "-" * 34,
        (order.get("requirement") or "（客户没写需求）").strip(),
        "",
    ]
    return "\n".join(lines)


def _body_heading(payload):
    """给 markdown 版配一个标题：用订单号，不用内部项目名。"""
    return f"# 交付正文（{payload.get('_order_id') or ''}）\n"


def _entries(order, payload):
    """包里放什么，只在这里定义一次 —— manifest 和 zip 都从它来，不会说一套给一套。"""
    payload = dict(payload or {})
    payload["_order_id"] = order.get("id")
    text = (payload.get("final_text") or "").strip()
    if not text:
        raise ExportError("这一单还没有正文，暂时不能打包", status=404)
    quality = payload.get("quality") or {}
    entries = [
        ("交付说明.txt", _readme(order, payload)),
        ("交付正文.txt", text),
        ("交付正文.md", _body_heading(payload) + "\n" + text + "\n"),
        ("质检报告.txt", "\n".join(_quality_lines(quality))),
        ("订单信息.txt", _order_info(order, payload)),
    ]
    for idx, item in enumerate(payload.get("appendix") or [], start=1):
        title = item.get("title") or f"附录{idx}"
        entries.append(
            (f"附录/{idx:02d}-{_clean_name(title, 40)}.txt", (item.get("text") or "").strip())
        )
    return [(name, body.encode("utf-8")) for name, body in entries]


def manifest(order, payload):
    """包里有什么、各多大 —— 页面不用下载就知道里面是啥。"""
    items = _entries(order, payload)
    return {
        "order_id": order.get("id"),
        "files": [{"name": n, "bytes": len(b)} for n, b in items],
        "total_bytes": sum(len(b) for _, b in items),
        "formats": ["zip"] + (["pdf"] if _PDF_OK else []),
        "pdf_note": None if _PDF_OK else "服务端没装 reportlab，暂时只能下 ZIP；装完重启即可开启 PDF",
    }


def build_zip(order, payload):
    """把一个包里的东西压成一个 zip。文件名带订单号，客户下十个也不会混。"""
    items = _entries(order, payload)
    root = f"ShadowFlow-交付-{order.get('id')}"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, body in items:
            info = zipfile.ZipInfo(f"{root}/{name}", date_time=datetime.now().timetuple()[:6])
            info.compress_type = zipfile.ZIP_DEFLATED
            # 统一 UTF-8 文件名：Windows 10+ 自带解压能认，不会变成乱码
            info.flag_bits |= 0x800
            zf.writestr(info, body)
    return buf.getvalue(), f"{root}.zip", "application/zip"


# ---------------------------------------------------------------- PDF

def _register_font():
    """注册一个能显示中文的字体。只做一次，失败退回 CID 字体。"""
    global _FONT_READY
    if _FONT_READY:
        return _FONT_READY
    for path, index in FONT_CANDIDATES:
        if not path or not os.path.exists(path):
            continue
        try:
            font = TTFont(FONT_NAME, path, subfontIndex=index) if index is not None else TTFont(FONT_NAME, path)
            pdfmetrics.registerFont(font)
            _FONT_READY = (FONT_NAME, os.path.basename(path))
            return _FONT_READY
        except Exception:  # noqa: BLE001 - 换下一个候选
            continue
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    _FONT_READY = ("STSong-Light", "未找到系统字体，退回 STSong-Light")
    return _FONT_READY


def _styles(font):
    return {
        "title": ParagraphStyle("t", fontName=font, fontSize=19, leading=26, spaceAfter=4,
                                textColor=colors.HexColor("#12312b")),
        "sub": ParagraphStyle("s", fontName=font, fontSize=9.5, leading=15,
                              textColor=colors.HexColor("#6b7f7a")),
        "h2": ParagraphStyle("h2", fontName=font, fontSize=12.5, leading=19, spaceBefore=12, spaceAfter=5,
                             textColor=colors.HexColor("#0f5f52")),
        "body": ParagraphStyle("b", fontName=font, fontSize=10.5, leading=18, spaceAfter=8,
                               alignment=TA_LEFT, wordWrap="CJK", textColor=colors.HexColor("#22302c")),
        "small": ParagraphStyle("sm", fontName=font, fontSize=9, leading=15, wordWrap="CJK",
                                textColor=colors.HexColor("#5d6f6a")),
    }


def _paras(text, style):
    """按空行分段落。CJK 不需要空格断词，但空行必须保留，否则一片糊。"""
    out = []
    for block in re.split(r"\n\s*\n", (text or "").strip()):
        block = block.strip()
        if not block:
            continue
        out.append(Paragraph(_pdf_text(block).replace("\n", "<br/>"), style))
    return out


def _footer(canvas, doc, font):
    canvas.saveState()
    canvas.setFont(font, 8)
    canvas.setFillColor(colors.HexColor("#8a9a96"))
    canvas.drawString(20 * mm, 12 * mm, "ShadowFlow · 交付单")
    canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"第 {doc.page} 页")
    canvas.restoreState()


def build_pdf(order, payload):
    """一份能直接转发、能打印的交付单：正文 + 质检摘要 + 附录。"""
    if not _PDF_OK:
        raise ExportError("服务端没装 reportlab，PDF 暂时不可用；可以先下 ZIP", status=501)
    text = (payload or {}).get("final_text") or ""
    if not text.strip():
        raise ExportError("这一单还没有正文，暂时不能打包", status=404)
    font, font_src = _register_font()
    st = _styles(font)
    quality = payload.get("quality") or {}

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, title=f"ShadowFlow 交付单 {order.get('id')}",
        author="ShadowFlow", leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=20 * mm,
    )
    story = [
        Paragraph("交付单", st["title"]),
        Paragraph(
            f"{_pdf_text(order.get('product_name'))}　·　订单 {_pdf_text(order.get('id'))}",
            st["sub"],
        ),
        Spacer(1, 8),
    ]
    meta = [
        ["客户", _pdf_plain(order.get("buyer_name") or "—"), "金额", _pdf_plain(_money(order))],
        ["交付时间", _fmt_time(order.get("delivered_at")), "质检", _pdf_plain(f"{quality.get('score', '—')} 分")],
        ["篇幅", _pdf_plain(f"{(quality.get('length') or {}).get('chars', '—')} 字"),
         "形态", _pdf_plain((quality.get("form") or {}).get("label") or "不限")],
    ]
    table = Table(meta, colWidths=[24 * mm, 62 * mm, 20 * mm, 44 * mm])
    table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), font),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#6b7f7a")),
        ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#6b7f7a")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, colors.HexColor("#e3ebe8")),
    ]))
    story += [table, Spacer(1, 10), Paragraph("交付正文", st["h2"])]
    story += _paras(text, st["body"])

    trimmed = payload.get("trimmed") or {}
    if trimmed:
        story.append(Paragraph(
            f"按客户要求的篇幅精简过：原稿 {trimmed.get('from')} 字 → 交付 {trimmed.get('to')} 字，"
            "完整原稿见附录。", st["small"],
        ))

    story += [Spacer(1, 6), Paragraph("质检摘要", st["h2"])]
    story += [Paragraph(_pdf_text(line), st["small"]) for line in _quality_lines(quality)]

    appendix = payload.get("appendix") or []
    if appendix:
        story += [PageBreak(), Paragraph("附录：策划过程与未精简原稿", st["h2"])]
        for idx, item in enumerate(appendix, start=1):
            head = Paragraph(f"{idx}. {_pdf_text(item.get('title'))}", st["h2"])
            body = _paras(item.get("text") or "", st["small"])
            story.append(KeepTogether([head] + body[:2]))
            story += body[2:]

    doc.build(story, onFirstPage=lambda c, d: _footer(c, d, font), onLaterPages=lambda c, d: _footer(c, d, font))
    data = buf.getvalue()
    return data, f"ShadowFlow-交付-{order.get('id')}.pdf", "application/pdf"


def build(order, payload, fmt="zip"):
    """统一入口：按格式给 (bytes, 文件名, MIME)，调用方不用知道细节。"""
    fmt = (fmt or "zip").lower().lstrip(".")
    if fmt == "zip":
        return build_zip(order, payload)
    if fmt == "pdf":
        return build_pdf(order, payload)
    raise ExportError(f"不支持的格式：{fmt}（只支持 zip / pdf）", status=400)


def available():
    """这份能力清单给前端看：能不能下 PDF、用的哪个字体。

    这里顺手把字体注册掉，否则第一次问「pdf_font」永远是 null，
    对接方会以为字体没找到。
    """
    if not _PDF_OK:
        return {"zip": True, "pdf": False, "pdf_font": None,
                "note": "服务端未安装 reportlab，PDF 不可用；ZIP 不受影响"}
    font, source = _register_font()
    return {"zip": True, "pdf": True, "pdf_font": source, "note": None}
