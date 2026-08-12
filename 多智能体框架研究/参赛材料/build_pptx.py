# -*- coding: utf-8 -*-
"""
ShadowFlow GOAI 初赛方案 PPT - 重建脚本 (Python / python-pptx)
设计：午夜深色 + 青色/紫色 AI 质感；图标由 PIL 直接绘制。
"""
import math
import io
from PIL import Image, ImageDraw

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree

# ======================================================================
# 调色板
# ======================================================================
def C(hexstr):
    return RGBColor.from_string(hexstr)

MIDNIGHT    = "0B1437"
MIDNIGHT2   = "141B3A"
CARD_DARK   = "1A2347"
SLATE900    = "0F172A"
SLATE800    = "1E293B"
SLATE700    = "334155"
CYAN        = "06B6D4"
CYAN_DARK   = "0891B2"
CYAN_LIGHT  = "67E8F9"
VIOLET      = "8B5CF6"
VIOLET_DK   = "7C3AED"
BG          = "F8FAFC"
CARD        = "FFFFFF"
TEXT_DARK   = "0F172A"
TEXT_BODY   = "334155"
TEXT_MUTED  = "64748B"
TEXT_LIGHT  = "94A3B8"
TEXT_INV    = "F8FAFC"
TEXT_INVM   = "94A3B8"
SUCCESS     = "10B981"
WARNING     = "F59E0B"
DANGER      = "EF4444"
BLUE        = "3B82F6"

FONT = "微软雅黑"

# 幻灯片尺寸（LAYOUT_WIDE: 13.333 x 7.5 inch）
SLIDE_W = 13.333
SLIDE_H = 7.5
MARGIN = 0.55

# ======================================================================
# 图标绘制 (PIL)  —— 256x256 画布，白色描边线条风
# ======================================================================
ICON_SIZE = 256

def _new_canvas():
    img = Image.new("RGBA", (ICON_SIZE, ICON_SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.line_width = 0  # 用 rectangle/ellipse 的 outline width
    return img, d

def _icon_to_bytes(img):
    bio = io.BytesIO()
    img.save(bio, format="PNG")
    bio.seek(0)
    return bio

W_LINE = 16  # 线宽

def _line(d, p1, p2, w=W_LINE, color=(255, 255, 255, 255)):
    # Pillow line: use joint="curve" for nicer corners, width param
    d.line([p1, p2], fill=color, width=w, joint="curve")

def _circle(d, cx, cy, r, w=W_LINE, color=(255, 255, 255, 255)):
    bbox = [cx - r, cy - r, cx + r, cy + r]
    d.ellipse(bbox, outline=color, width=w)

def _round_rect(d, bbox, r, w=W_LINE, color=(255, 255, 255, 255)):
    d.rounded_rectangle(bbox, radius=r, outline=color, width=w)

def _poly(d, pts, w=W_LINE, color=(255, 255, 255, 255)):
    d.line(pts + [pts[0]], fill=color, width=w, joint="curve")

# ---- 各图标 ----
def ic_project_diagram():
    img, d = _new_canvas()
    # 顶部主节点
    _round_rect(d, [96, 40, 160, 88], 8)
    # 左下节点
    _round_rect(d, [32, 168, 96, 216], 8)
    # 右下节点
    _round_rect(d, [160, 168, 224, 216], 8)
    # 连线
    _line(d, (112, 88), (64, 168))
    _line(d, (144, 88), (192, 168))
    return _icon_to_bytes(img)

def ic_code():
    img, d = _new_canvas()
    # 左尖括号 <
    _line(d, (96, 80), (56, 128))
    _line(d, (56, 128), (96, 176))
    # 右尖括号 >
    _line(d, (160, 80), (200, 128))
    _line(d, (200, 128), (160, 176))
    # 中间斜线
    _line(d, (144, 72), (112, 184), w=14)
    return _icon_to_bytes(img)

def ic_search():
    img, d = _new_canvas()
    _circle(d, 108, 108, 52)
    _line(d, (148, 148), (208, 208), w=20)
    return _icon_to_bytes(img)

def ic_check_double():
    img, d = _new_canvas()
    _line(d, (48, 132), (96, 180), w=18)
    _line(d, (88, 180), (168, 80), w=18)
    _line(d, (128, 180), (176, 228), w=16)
    _line(d, (168, 228), (232, 144), w=16)
    return _icon_to_bytes(img)

def ic_warning():
    img, d = _new_canvas()
    _poly(d, [(128, 40), (224, 208), (32, 208)], r=0) if False else _poly(d, [(128, 44), (220, 204), (36, 204)])
    _line(d, (128, 96), (128, 152), w=18)
    d.ellipse([120, 168, 136, 184], fill=(255, 255, 255, 255))
    return _icon_to_bytes(img)

def ic_check_circle():
    img, d = _new_canvas()
    _circle(d, 128, 128, 88)
    _line(d, (84, 128), (116, 160), w=18)
    _line(d, (112, 160), (176, 96), w=18)
    return _icon_to_bytes(img)

def ic_rocket():
    img, d = _new_canvas()
    # 火箭主体（尖头椭圆）
    d.line([(128, 32), (176, 96), (176, 168), (80, 168), (80, 96), (128, 32)],
           fill=(255, 255, 255, 255), width=W_LINE, joint="curve")
    # 窗口
    _circle(d, 128, 104, 18, w=12)
    # 左翼
    _poly(d, [(80, 140), (44, 196), (80, 180)])
    # 右翼
    _poly(d, [(176, 140), (212, 196), (176, 180)])
    # 火焰
    _line(d, (112, 168), (104, 208), w=12)
    _line(d, (128, 168), (128, 216), w=12)
    _line(d, (144, 168), (152, 208), w=12)
    return _icon_to_bytes(img)

def ic_comments():
    img, d = _new_canvas()
    # 大气泡
    _round_rect(d, [36, 48, 220, 168], 24)
    # 尾巴
    _poly(d, [(72, 168), (72, 212), (116, 168)])
    # 三个点
    for cx in (96, 128, 160):
        d.ellipse([cx - 8, 100, cx + 8, 116], fill=(255, 255, 255, 255))
    return _icon_to_bytes(img)

def ic_users():
    img, d = _new_canvas()
    # 中间人
    _circle(d, 128, 84, 32, w=W_LINE)
    d.arc([80, 128, 176, 224], 200, 340, fill=(255, 255, 255, 255), width=W_LINE)
    # 左人（半）
    _circle(d, 60, 96, 24, w=W_LINE)
    d.arc([28, 132, 100, 216], 200, 340, fill=(255, 255, 255, 255), width=W_LINE)
    # 右人（半）
    _circle(d, 196, 96, 24, w=W_LINE)
    d.arc([156, 132, 228, 216], 200, 340, fill=(255, 255, 255, 255), width=W_LINE)
    return _icon_to_bytes(img)

def ic_cube():
    img, d = _new_canvas()
    # 顶面菱形
    _poly(d, [(128, 36), (212, 84), (128, 132), (44, 84)])
    # 左右两棱到下
    _line(d, (44, 84), (44, 172))
    _line(d, (212, 84), (212, 172))
    _line(d, (128, 132), (128, 220))
    # 底面（三边）
    _poly(d, [(44, 172), (128, 220), (212, 172)])
    return _icon_to_bytes(img)

def ic_plug():
    img, d = _new_canvas()
    # 左右两根插针
    _round_rect(d, [76, 36, 100, 100], 6)
    _round_rect(d, [156, 36, 180, 100], 6)
    # 主体
    _poly(d, [(68, 100), (68, 156), (100, 188), (156, 188), (188, 156), (188, 100)])
    # 中线
    _line(d, (128, 188), (128, 224), w=18)
    return _icon_to_bytes(img)

def ic_shield():
    img, d = _new_canvas()
    _poly(d, [(128, 28), (212, 68), (212, 132), (128, 228), (44, 132), (44, 68)])
    # 对勾
    _line(d, (88, 128), (120, 160), w=16)
    _line(d, (116, 160), (176, 92), w=16)
    return _icon_to_bytes(img)

def ic_sitemap():
    img, d = _new_canvas()
    # 顶部
    _round_rect(d, [96, 32, 160, 76], 8)
    # 中部两个
    _round_rect(d, [40, 112, 104, 156], 8)
    _round_rect(d, [152, 112, 216, 156], 8)
    # 底部两个
    _round_rect(d, [40, 192, 104, 236], 8)
    _round_rect(d, [152, 192, 216, 236], 8)
    # 连线
    _line(d, (128, 76), (128, 94))
    _line(d, (72, 94), (184, 94))
    _line(d, (72, 94), (72, 112))
    _line(d, (184, 94), (184, 112))
    _line(d, (72, 156), (72, 192))
    _line(d, (184, 156), (184, 192))
    return _icon_to_bytes(img)

def ic_exchange():
    img, d = _new_canvas()
    # 上箭头（向右）
    _line(d, (44, 92), (196, 92), w=18)
    _poly(d, [(196, 92), (164, 64), (164, 120)])
    # 下箭头（向左）
    _line(d, (212, 164), (60, 164), w=18)
    _poly(d, [(60, 164), (92, 136), (92, 192)])
    return _icon_to_bytes(img)

def ic_database():
    img, d = _new_canvas()
    # 顶部椭圆
    d.ellipse([44, 36, 212, 96], outline=(255, 255, 255, 255), width=W_LINE)
    # 左右侧
    _line(d, (44, 66), (44, 176))
    _line(d, (212, 66), (212, 176))
    # 底部弧
    d.arc([44, 132, 212, 220], 0, 180, fill=(255, 255, 255, 255), width=W_LINE)
    # 中间两条横弧
    d.arc([44, 88, 212, 160], 0, 180, fill=(255, 255, 255, 255), width=12)
    return _icon_to_bytes(img)

def ic_bug():
    img, d = _new_canvas()
    # 身体（椭圆）
    d.ellipse([80, 76, 176, 204], outline=(255, 255, 255, 255), width=W_LINE)
    # 中线
    _line(d, (128, 76), (128, 204), w=12)
    # 头部圆
    _circle(d, 128, 64, 16, w=W_LINE)
    # 触角
    _line(d, (116, 52), (92, 28), w=12)
    _line(d, (140, 52), (164, 28), w=12)
    # 腿（左右各3）
    for (y, ex) in [(100, 56), (140, 44), (180, 56)]:
        _line(d, (80, y), (ex, y - 18), w=12)
    for (y, ex) in [(100, 200), (140, 212), (180, 200)]:
        _line(d, (176, y), (ex, y - 18), w=12)
    return _icon_to_bytes(img)

def ic_chart_line():
    img, d = _new_canvas()
    # 坐标轴
    _line(d, (48, 40), (48, 208), w=16)
    _line(d, (48, 208), (216, 208), w=16)
    # 折线（上升）
    _line(d, (64, 168), (104, 128), w=18)
    _line(d, (104, 128), (144, 152), w=18)
    _line(d, (144, 152), (184, 80), w=18)
    _line(d, (184, 80), (208, 56), w=18)
    return _icon_to_bytes(img)

def ic_list():
    img, d = _new_canvas()
    for y in (64, 128, 192):
        d.ellipse([40, y - 12, 64, y + 12], fill=(255, 255, 255, 255))
        _line(d, (88, y), (216, y), w=14)
    return _icon_to_bytes(img)

def ic_share():
    img, d = _new_canvas()
    # 三个圆：左下、右下、上
    _circle(d, 64, 176, 28)
    _circle(d, 192, 176, 28)
    _circle(d, 128, 56, 28)
    # 连线
    _line(d, (88, 152), (112, 80), w=14)
    _line(d, (168, 152), (144, 80), w=14)
    _line(d, (92, 176), (164, 176), w=14)
    return _icon_to_bytes(img)

def ic_file_contract():
    img, d = _new_canvas()
    # 文件外框（缺右上角）
    d.line([(56, 32), (56, 224), (200, 224), (200, 88), (144, 32), (56, 32)],
           fill=(255, 255, 255, 255), width=W_LINE, joint="curve")
    # 折角
    d.line([(144, 32), (144, 88), (200, 88)], fill=(255, 255, 255, 255), width=W_LINE)
    # 内容横线
    _line(d, (80, 128), (176, 128), w=12)
    _line(d, (80, 160), (176, 160), w=12)
    # 印章圆
    _circle(d, 128, 192, 14, w=10)
    return _icon_to_bytes(img)

def ic_random():
    img, d = _new_canvas()
    # 入口两条线 → 出口
    _line(d, (44, 80), (96, 80), w=14)
    _line(d, (44, 176), (96, 176), w=14)
    _line(d, (160, 80), (212, 80), w=14)
    _line(d, (160, 176), (212, 176), w=14)
    # 中段交叉
    _line(d, (96, 80), (160, 176), w=14)
    _line(d, (96, 176), (160, 80), w=14)
    # 箭头
    _poly(d, [(212, 80), (196, 68), (196, 92)])
    _poly(d, [(212, 176), (196, 164), (196, 188)])
    return _icon_to_bytes(img)

def ic_user_shield():
    img, d = _new_canvas()
    # 人头
    _circle(d, 92, 80, 32, w=W_LINE)
    # 身体弧
    d.arc([44, 128, 140, 224], 200, 340, fill=(255, 255, 255, 255), width=W_LINE)
    # 右侧盾牌
    _poly(d, [(176, 64), (224, 88), (224, 144), (176, 216), (128, 144), (128, 88)])
    # 对勾
    _line(d, (152, 144), (172, 164), w=12)
    _line(d, (168, 164), (204, 124), w=12)
    return _icon_to_bytes(img)

def ic_undo():
    img, d = _new_canvas()
    # 弧形箭头
    d.arc([48, 56, 208, 200], 140, 360, fill=(255, 255, 255, 255), width=W_LINE)
    # 箭头头
    _poly(d, [(48, 100), (48, 56), (88, 76)])
    return _icon_to_bytes(img)

def ic_lock():
    img, d = _new_canvas()
    # 锁体
    _round_rect(d, [56, 104, 200, 216], 16)
    # 锁拱
    d.arc([76, 40, 180, 144], 180, 360, fill=(255, 255, 255, 255), width=W_LINE)
    _line(d, (76, 92), (76, 104), w=W_LINE)
    _line(d, (180, 92), (180, 104), w=W_LINE)
    # 钥匙孔
    _circle(d, 128, 148, 12, w=12)
    _line(d, (128, 156), (128, 184), w=12)
    return _icon_to_bytes(img)

def ic_play():
    img, d = _new_canvas()
    _circle(d, 128, 128, 92)
    # 三角
    d.polygon([(104, 76), (104, 180), (180, 128)], fill=(255, 255, 255, 255))
    return _icon_to_bytes(img)

def ic_cogs():
    img, d = _new_canvas()
    # 大齿轮（中心）
    _draw_gear(d, 128, 128, 56, 12, 14, tooth_h=18)
    # 中心孔
    _circle(d, 128, 128, 22, w=12)
    return _icon_to_bytes(img)

def _draw_gear(d, cx, cy, r, teeth, tooth_w, tooth_h=16):
    # 简化齿轮：外圆 + 齿
    _circle(d, cx, cy, r, w=W_LINE)
    for i in range(teeth):
        ang = 2 * math.pi * i / teeth
        x = cx + r * math.cos(ang)
        y = cy + r * math.sin(ang)
        d.rectangle([x - tooth_w / 2, y - tooth_h / 2, x + tooth_w / 2, y + tooth_h / 2],
                    fill=(255, 255, 255, 255))

def ic_flag():
    img, d = _new_canvas()
    # 旗杆
    _line(d, (72, 32), (72, 224), w=16)
    # 旗面（三角缺角）
    d.line([(72, 44), (192, 44), (192, 92), (72, 92)],
           fill=(255, 255, 255, 255), width=W_LINE, joint="curve")
    # 旗面填充斜线
    d.polygon([(80, 52), (184, 52), (184, 84), (80, 84)], fill=(255, 255, 255, 120))
    return _icon_to_bytes(img)

def ic_trophy():
    img, d = _new_canvas()
    # 杯体
    d.line([(80, 44), (176, 44), (168, 140), (88, 140), (80, 44)],
           fill=(255, 255, 255, 255), width=W_LINE, joint="curve")
    # 左右把手
    d.arc([32, 56, 96, 128], 90, 270, fill=(255, 255, 255, 255), width=14)
    d.arc([160, 56, 224, 128], 270, 90, fill=(255, 255, 255, 255), width=14)
    # 杯柄
    _line(d, (128, 140), (128, 172), w=16)
    # 底座
    _round_rect(d, [88, 172, 168, 200], 6, w=W_LINE)
    _line(d, (72, 216), (184, 216), w=16)
    return _icon_to_bytes(img)

def ic_gift():
    img, d = _new_canvas()
    # 盒身
    _round_rect(d, [48, 104, 208, 216], 8)
    # 盒盖
    _round_rect(d, [40, 76, 216, 112], 8)
    # 竖丝带
    _round_rect(d, [116, 76, 140, 216], 4, w=0, color=(255, 255, 255, 180))
    d.rectangle([116, 76, 140, 216], fill=(255, 255, 255, 200))
    # 蝴蝶结
    _poly(d, [(128, 76), (88, 44), (88, 84)])
    _poly(d, [(128, 76), (168, 44), (168, 84)])
    return _icon_to_bytes(img)

def ic_balance():
    img, d = _new_canvas()
    # 中柱
    _line(d, (128, 40), (128, 192), w=16)
    # 顶横杆
    _line(d, (48, 64), (208, 64), w=16)
    # 顶环
    _circle(d, 128, 40, 10, w=10)
    # 底座
    _line(d, (88, 192), (168, 192), w=16)
    _line(d, (128, 184), (128, 200), w=12)
    # 左盘
    _line(d, (48, 64), (32, 120), w=12)
    _line(d, (48, 64), (64, 120), w=12)
    d.arc([16, 108, 80, 152], 0, 180, fill=(255, 255, 255, 255), width=14)
    # 右盘
    _line(d, (208, 64), (192, 120), w=12)
    _line(d, (208, 64), (224, 120), w=12)
    d.arc([176, 108, 240, 152], 0, 180, fill=(255, 255, 255, 255), width=14)
    return _icon_to_bytes(img)

def ic_stream():
    img, d = _new_canvas()
    # 三条横线，中间带圆点
    for i, y in enumerate([68, 128, 188]):
        _line(d, (40, y), (176, y), w=14)
        d.ellipse([176, y - 12, 200, y + 12], fill=(255, 255, 255, 255))
    return _icon_to_bytes(img)

# 图标注册表
ICON_FUNCS = {
    "project_diagram": ic_project_diagram,
    "code": ic_code,
    "search": ic_search,
    "check_double": ic_check_double,
    "warning": ic_warning,
    "check_circle": ic_check_circle,
    "rocket": ic_rocket,
    "comments": ic_comments,
    "users": ic_users,
    "cube": ic_cube,
    "plug": ic_plug,
    "shield": ic_shield,
    "sitemap": ic_sitemap,
    "exchange": ic_exchange,
    "database": ic_database,
    "bug": ic_bug,
    "chart_line": ic_chart_line,
    "list": ic_list,
    "share": ic_share,
    "file_contract": ic_file_contract,
    "random": ic_random,
    "user_shield": ic_user_shield,
    "undo": ic_undo,
    "lock": ic_lock,
    "play": ic_play,
    "cogs": ic_cogs,
    "flag": ic_flag,
    "trophy": ic_trophy,
    "gift": ic_gift,
    "balance": ic_balance,
    "stream": ic_stream,
}

def make_icon(name):
    return ICON_FUNCS[name]()

# ======================================================================
# python-pptx 辅助
# ======================================================================
def set_fill(shape, hex_color):
    shape.fill.solid()
    shape.fill.fore_color.rgb = C(hex_color)

def set_line(shape, hex_color=None, width_pt=1.0):
    if hex_color is None:
        shape.line.fill.background()  # no line
    else:
        shape.line.color.rgb = C(hex_color)
        shape.line.width = Pt(width_pt)

def add_rect(slide, x, y, w, h, fill=None, line=None, line_w=1.0, shadow=False, shape=MSO_SHAPE.RECTANGLE):
    sp = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill is None:
        sp.fill.background()
    else:
        set_fill(sp, fill)
    if line is None:
        sp.line.fill.background()
    else:
        set_line(sp, line, line_w)
    if shadow:
        _add_shadow(sp)
    # 清掉默认文本
    sp.text_frame.text = ""
    return sp

def _add_shadow(shape):
    """给形状添加柔和外阴影。"""
    spPr = shape._element.spPr
    # 移除已有 effectLst
    for el in spPr.findall(qn('a:effectLst')):
        spPr.remove(el)
    nsmap = {
        'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'
    }
    effectLst = etree.SubElement(spPr, qn('a:effectLst'))
    outerShdw = etree.SubElement(effectLst, qn('a:outerShdw'))
    outerShdw.set('blurRad', '90000')
    outerShdw.set('dist', '38100')
    outerShdw.set('dir', '5400000')
    outerShdw.set('rotWithShape', '0')
    clr = etree.SubElement(outerShdw, qn('a:srgbClr'))
    clr.set('val', '0F172A')
    alpha = etree.SubElement(clr, qn('a:alpha'))
    alpha.set('val', '18000')

def add_text(slide, x, y, w, h, runs, align="left", valign="top",
             margin=0.0, line_spacing=None, space_after=None, wrap=True):
    """runs: list of dict {text, size, color, bold, italic, font} 或单个字符串。
    返回 text frame。"""
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = wrap
    # margins
    tf.margin_left = Inches(margin)
    tf.margin_right = Inches(margin)
    tf.margin_top = Inches(margin)
    tf.margin_bottom = Inches(margin)
    # valign
    vmap = {"top": MSO_ANCHOR.TOP, "middle": MSO_ANCHOR.MIDDLE, "bottom": MSO_ANCHOR.BOTTOM}
    tf.vertical_anchor = vmap.get(valign, MSO_ANCHOR.TOP)

    if isinstance(runs, str):
        runs = [{"text": runs}]

    # 多段支持：runs 里的 dict 可以包含 break=True 表示新段落
    # 简化：每个 run 一个段落，若 run 有 .break 则起新段
    # 这里采用：runs 列表中每个元素是一段（list of sub-runs）或单 dict
    # 统一成 list of paragraphs，每段是 list of run-dicts
    paragraphs = []
    cur = []
    for r in runs:
        if isinstance(r, str):
            cur.append({"text": r})
        elif r.get("break") and cur:
            # 结束当前段，用本 run 开启新段
            paragraphs.append(cur)
            cur = [r]
        else:
            cur.append(r)
    if cur:
        paragraphs.append(cur)
    if not paragraphs:
        paragraphs = [[{"text": ""}]]

    amap = {"left": PP_ALIGN.LEFT, "center": PP_ALIGN.CENTER, "right": PP_ALIGN.RIGHT, "justify": PP_ALIGN.JUSTIFY}
    for i, para_runs in enumerate(paragraphs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = amap.get(align, PP_ALIGN.LEFT)
        if line_spacing is not None:
            p.line_spacing = line_spacing
        if space_after is not None:
            p.space_after = Pt(space_after)
        # 去掉首段默认空行
        for rd in para_runs:
            r = p.add_run()
            r.text = rd.get("text", "")
            f = r.font
            f.size = Pt(rd.get("size", 11))
            f.name = rd.get("font", FONT)
            f.bold = rd.get("bold", False)
            f.italic = rd.get("italic", False)
            f.color.rgb = C(rd.get("color", TEXT_BODY))
            # also set East Asian font
            _set_ea_font(r, rd.get("font", FONT))
            # bullet
            if rd.get("bullet"):
                _add_bullet(p, rd["bullet"])
    return tb

def _set_ea_font(run, font_name):
    rPr = run._r.get_or_add_rPr()
    # latin
    latin = rPr.find(qn('a:latin'))
    if latin is None:
        latin = etree.SubElement(rPr, qn('a:latin'))
    latin.set('typeface', font_name)
    # ea
    ea = rPr.find(qn('a:ea'))
    if ea is None:
        ea = etree.SubElement(rPr, qn('a:ea'))
    ea.set('typeface', font_name)

def _add_bullet(paragraph, bullet_opt):
    """bullet_opt: True 或 dict {color, char}。每段只加一次（幂等）。"""
    pPr = paragraph._pPr
    if pPr is None:
        pPr = paragraph._p.get_or_add_pPr()
    # 已有 buChar 则跳过（防止一段多 bullet）
    if pPr.find(qn('a:buChar')) is not None:
        return
    color = "06B6D4"
    char = "●"
    if isinstance(bullet_opt, dict):
        color = bullet_opt.get("color", color)
        char = bullet_opt.get("char", char)
    # 顺序：spcAft 等 padding 元素必须在 bu* 之前；buFont→buClr→buChar
    # buClr 应在 buFont 之前（schema: buClrTx/buClr, buSzTx/buSz*, buFontTx/buFont, buNone/buAutoNum/buChar）
    buClr = etree.SubElement(pPr, qn('a:buClr'))
    srgb = etree.SubElement(buClr, qn('a:srgbClr'))
    srgb.set('val', color)
    buFont = etree.SubElement(pPr, qn('a:buFont'))
    buFont.set('typeface', 'Arial')
    buChar = etree.SubElement(pPr, qn('a:buChar'))
    buChar.set('char', char)

def add_oval(slide, x, y, w, h, fill=None, line=None, line_w=1.0, shadow=False):
    return add_rect(slide, x, y, w, h, fill=fill, line=line, line_w=line_w,
                    shadow=shadow, shape=MSO_SHAPE.OVAL)

def add_icon(slide, icon_name, x, y, size):
    bio = make_icon(icon_name)
    slide.shapes.add_picture(bio, Inches(x), Inches(y), Inches(size), Inches(size))

def add_card(slide, x, y, w, h, accent=None, fill=CARD, shadow=True):
    add_rect(slide, x, y, w, h, fill=fill, shadow=shadow)
    if accent:
        add_rect(slide, x, y, 0.06, h, fill=accent)

def add_top_accent_card(slide, x, y, w, h, accent, fill=CARD):
    """顶部色条卡片。"""
    add_rect(slide, x, y, w, h, fill=fill, shadow=True)
    add_rect(slide, x, y, w, 0.07, fill=accent)

def add_page_header(slide, num, title, subtitle):
    # 顶部细线
    add_rect(slide, 0, 0, SLIDE_W, 0.08, fill=CYAN)
    # 编号 + 标题
    add_text(slide, MARGIN, 0.32, 9.8, 0.65,
             [{"text": num + "  ", "size": 22, "color": CYAN, "bold": True},
              {"text": title, "size": 26, "color": TEXT_DARK, "bold": True}],
             valign="middle")
    # 副标题
    add_text(slide, MARGIN, 1.02, 11.5, 0.35,
             [{"text": subtitle, "size": 12.5, "color": TEXT_MUTED}],
             valign="top")
    # 右上品牌
    add_text(slide, SLIDE_W - 2.2, 0.4, 1.65, 0.35,
             [{"text": "ShadowFlow", "size": 11, "color": CYAN, "bold": True}],
             align="right", valign="middle")

def bullets(items, dot_color, text_color=TEXT_BODY, size=11, space_after=6):
    """生成带圆点 bullet 的 runs（每项一段，含 break）。"""
    runs = []
    for i, it in enumerate(items):
        runs.append({
            "text": it, "size": size, "color": text_color,
            "bullet": {"color": dot_color, "char": "●"},
            "break": i > 0,
        })
    # 第一段不要 break
    return runs

def add_icon_header(slide, x, y, accent, icon_name):
    """卡片左上图标圆。"""
    add_oval(slide, x, y, 0.62, 0.62, fill=accent)
    pad = 0.14
    add_icon(slide, icon_name, x + pad, y + pad, 0.62 - 2 * pad)


# ======================================================================
# 构建幻灯片
# ======================================================================
def build():
    prs = Presentation()
    prs.slide_width = Inches(SLIDE_W)
    prs.slide_height = Inches(SLIDE_H)
    blank = prs.slide_layouts[6]  # Blank

    def new_slide(bg=BG):
        s = prs.slides.add_slide(blank)
        # 背景
        bg_rect = add_rect(s, -0.06, -0.06, SLIDE_W + 0.12, SLIDE_H + 0.12, fill=bg)
        # 移到最底层
        spTree = bg_rect._element.getparent()
        spTree.remove(bg_rect._element)
        spTree.insert(2, bg_rect._element)  # 在 nvGrpSpPr/grpSpPr 之后
        return s

    # ============== Slide 1: 标题 ==============
    s = new_slide(bg=MIDNIGHT)
    # 装饰圆
    add_oval(s, SLIDE_W - 2.8, -1.4, 4.5, 4.5, fill=CYAN)
    o = s.shapes[-1]
    _set_transparency(o, 85)
    add_oval(s, SLIDE_W - 1.8, 4.6, 3.6, 3.6, fill=VIOLET)
    _set_transparency(s.shapes[-1], 88)
    # 点阵
    for r in range(4):
        for c in range(4):
            dot = add_oval(s, 0.5 + c * 0.28, SLIDE_H - 1.4 + r * 0.28, 0.09, 0.09,
                           fill=CYAN if c == r else CYAN_DARK)
            _set_transparency(dot, 50 + (r + c) * 6)
    # 顶部 logo 方块
    add_rect(s, 0.9, 0.85, 0.5, 0.5, fill=CYAN)
    add_icon(s, "stream", 0.99, 0.94, 0.32)
    # 给 stream icon 着深色（覆盖：用一个深色半透明矩形？简化：直接用白色，因为底是青色，对比够）
    # 实际我们画的 stream 是白色，在青色块上可见。OK。
    add_text(s, 1.55, 0.85, 4, 0.5,
             [{"text": "ShadowFlow", "size": 18, "color": TEXT_INV, "bold": True}],
             valign="middle")
    # 主标题
    add_text(s, 0.9, 2.25, 11.5, 1.2,
             [{"text": "ShadowFlow", "size": 72, "color": TEXT_INV, "bold": True}],
             valign="top")
    add_rect(s, 0.95, 3.6, 0.9, 0.07, fill=CYAN)
    add_text(s, 0.9, 3.78, 11.5, 0.7,
             [{"text": "软件研发全流程多 Agent 自主协同基座", "size": 28, "color": CYAN_LIGHT, "bold": True}])
    add_text(s, 0.9, 4.55, 11.5, 0.4,
             [{"text": "以 AgentTeams 为协同设计基点  ｜  图式协作 · Skill 工程化 · 执行证据可回放",
               "size": 14, "color": TEXT_LIGHT}])
    # 分隔线
    line = add_rect(s, 0.9, 6.0, 11.5, 0.015, fill=CYAN)
    _set_transparency(line, 60)
    add_text(s, 0.9, 6.18, 11.5, 0.35,
             [{"text": "GOAI 2026  ·  赛道一：新智基座丨Agent Infra  ·  初赛方案",
               "size": 13, "color": TEXT_INV, "bold": True}])
    add_text(s, 0.9, 6.58, 11.5, 0.3,
             [{"text": "2026 年 8 月", "size": 11, "color": TEXT_LIGHT}])

    # ============== Slide 2: 场景与价值 ==============
    s = new_slide()
    add_page_header(s, "01", "场景与价值", "研发复杂任务协同的真实痛点与可感知收益")
    top_y = 1.55
    col_h = 2.85
    col_w = 5.95
    gap = 0.25
    left_x = MARGIN
    right_x = left_x + col_w + gap

    # 左卡：痛点
    add_top_accent_card(s, left_x, top_y, col_w, col_h, DANGER)
    add_icon_header(s, left_x + 0.28, top_y + 0.28, DANGER, "warning")
    add_text(s, left_x + 1.1, top_y + 0.32, col_w - 1.3, 0.35,
             [{"text": "痛点", "size": 16, "color": TEXT_DARK, "bold": True}], valign="middle")
    add_text(s, left_x + 1.1, top_y + 0.66, col_w - 1.3, 0.28,
             [{"text": "多 Agent 从 Demo 到 Production 的断点", "size": 10.5, "color": DANGER}])
    add_text(s, left_x + 0.32, top_y + 1.12, col_w - 0.55, col_h - 1.25,
             bullets([
                 "需求与缺陷分散在 Issue、日志、群聊，拆解与指派靠人",
                 "Agent 间上下文靠拼提示词，易丢失、不可追踪",
                 "执行过程是黑盒：无证据、难审计、无法回放",
                 "高风险动作缺少审批与回滚，专家经验难以沉淀复用",
             ], DANGER, size=11.5, space_after=6),
             valign="top")

    # 右卡：答案
    add_top_accent_card(s, right_x, top_y, col_w, col_h, SUCCESS)
    add_icon_header(s, right_x + 0.28, top_y + 0.28, SUCCESS, "check_circle")
    add_text(s, right_x + 1.1, top_y + 0.32, col_w - 1.3, 0.35,
             [{"text": "ShadowFlow 的答案", "size": 16, "color": TEXT_DARK, "bold": True}], valign="middle")
    add_text(s, right_x + 1.1, top_y + 0.66, col_w - 1.3, 0.28,
             [{"text": "Contract-first 多 Agent 协作基座", "size": 10.5, "color": SUCCESS}])
    add_text(s, right_x + 0.32, top_y + 1.12, col_w - 0.55, col_h - 1.25,
             bullets([
                 "Agent 以 DAG 图互连：自动任务拆解与分工合作",
                 "产物文件 + 标准化结果显式交接，上下文结构化",
                 "step / trace 原子落盘，执行证据可回放可审计",
                 "策略门三态过滤 + 人工审批门，支持重试与回滚",
             ], SUCCESS, size=11.5, space_after=6),
             valign="top")

    # 底部价值卡
    bot_y = top_y + col_h + 0.25
    bot_h = SLIDE_H - bot_y - 0.35
    add_card(s, MARGIN, bot_y, SLIDE_W - 2 * MARGIN, bot_h, accent=CYAN)
    add_icon_header(s, MARGIN + 0.3, bot_y + 0.3, CYAN, "rocket")
    add_text(s, MARGIN + 1.1, bot_y + 0.28, 10, 0.35,
             [{"text": "价值与行业可复制性", "size": 16, "color": TEXT_DARK, "bold": True}], valign="middle")
    add_text(s, MARGIN + 1.1, bot_y + 0.62, 10, 0.28,
             [{"text": "同一基座覆盖多行业复杂协同场景", "size": 10.5, "color": CYAN_DARK}])
    # 三栏
    v_y = bot_y + 1.1
    v_gap = 0.3
    v_w = (SLIDE_W - 2 * MARGIN - 0.7 - v_gap * 2) / 3
    v_vals = [
        ("全流程", "需求聚合 → 任务拆解 → 编码 → 审查 → 验证 → 复盘沉淀", CYAN),
        ("可复制", "同一基座可复制到运维排障、客服闭环、风控处置等同类协同场景", VIOLET),
        ("可量化", "常规研发人工介入减少 60%+，全流程留痕审计覆盖 100%，经验沉淀为 Skill", SUCCESS),
    ]
    for i, (tag, txt, col) in enumerate(v_vals):
        vx = MARGIN + 0.35 + i * (v_w + v_gap)
        add_rect(s, vx, v_y, 0.04, 1.0, fill=col)
        add_text(s, vx + 0.18, v_y, v_w - 0.2, 0.3,
                 [{"text": tag, "size": 11, "color": col, "bold": True}])
        add_text(s, vx + 0.18, v_y + 0.32, v_w - 0.2, 0.7,
                 [{"text": txt, "size": 10.5, "color": TEXT_BODY}], valign="top")

    # ============== Slide 3: 总体架构 ==============
    s = new_slide()
    add_page_header(s, "02", "方案设计：总体架构", "分层解耦：编排、协同、能力、工具、证据治理各司其职")
    stack_x = MARGIN
    stack_y = 1.6
    layer_h = 0.82
    layer_gap = 0.1
    stack_w = 7.4
    layers = [
        ("用户入口层", "群聊 / 单聊 / 三栏工作台 —— 一句话发起任务，群聊即可驱动协作执行", "comments", BLUE, "L1"),
        ("AgentTeams 编排层", "以 AgentTeams 为协同设计基点：角色编排、任务拆解、状态流转、升级策略", "users", CYAN, "L2"),
        ("多 Agent 协同层", "Planner 拆解 ｜ Coder 执行 ｜ Reviewer 挑错 ｜ Verifier 验证 —— DAG 图互连", "project_diagram", VIOLET, "L3"),
        ("Skill 能力层", "说明文档 + 机器可读清单双格式封装：检索、编码、审查、验证、复盘等可复用技能", "cube", CYAN_DARK, "L4"),
        ("工具集成层", "四类调用契约（API / CLI / ACP / MCP）+ 内置工具运行器，MCP 等价集成契约", "plug", SLATE700, "L5"),
        ("证据与治理层", "step / trace 原子落盘、时间线回放、策略门三态、人工审批、重试与回滚", "shield", SUCCESS, "L6"),
    ]
    for i, (name, desc, icon, col, num) in enumerate(layers):
        ly = stack_y + i * (layer_h + layer_gap)
        add_rect(s, stack_x, ly, stack_w, layer_h, fill=CARD, shadow=True)
        add_rect(s, stack_x, ly, 1.2, layer_h, fill=col)
        add_text(s, stack_x, ly, 1.2, layer_h,
                 [{"text": num, "size": 22, "color": TEXT_INV, "bold": True}],
                 align="center", valign="middle")
        # 图标：彩色圆底 + 白色图标
        cx_icon = stack_x + 1.45
        cy_icon = ly + (layer_h - 0.42) / 2
        add_oval(s, cx_icon - 0.05, cy_icon - 0.05, 0.52, 0.52, fill=col)
        add_icon(s, icon, cx_icon, cy_icon, 0.42)
        add_text(s, stack_x + 2.15, ly + 0.1, stack_w - 2.3, 0.3,
                 [{"text": name, "size": 13.5, "color": TEXT_DARK, "bold": True}])
        add_text(s, stack_x + 2.15, ly + 0.4, stack_w - 2.3, 0.38,
                 [{"text": desc, "size": 10, "color": TEXT_MUTED}], valign="top")

    # 右侧设计原则深色卡
    right_x = stack_x + stack_w + 0.3
    right_w = SLIDE_W - right_x - MARGIN
    add_rect(s, right_x, stack_y, right_w, SLIDE_H - stack_y - 0.35, fill=MIDNIGHT, shadow=True)
    add_rect(s, right_x, stack_y, right_w, 0.07, fill=CYAN)
    add_text(s, right_x + 0.3, stack_y + 0.25, right_w - 0.6, 0.35,
             [{"text": "设计原则", "size": 15, "color": TEXT_INV, "bold": True}])
    principles = [
        ("Contract-first", "先定义契约，再写代码"),
        ("图式协作", "Agent 关系即 DAG 图"),
        ("证据原生", "每步落盘，可回放审计"),
        ("插件化接入", "任意 Agent 运行时可接入"),
    ]
    for i, (t, d) in enumerate(principles):
        py = stack_y + 0.8 + i * 0.95
        dot_col = CYAN if i % 2 == 0 else VIOLET
        add_oval(s, right_x + 0.3, py + 0.08, 0.28, 0.28, fill=dot_col)
        add_text(s, right_x + 0.3, py + 0.08, 0.28, 0.28,
                 [{"text": str(i + 1), "size": 11, "color": TEXT_INV, "bold": True}],
                 align="center", valign="middle")
        add_text(s, right_x + 0.7, py, right_w - 1.0, 0.3,
                 [{"text": t, "size": 12.5, "color": TEXT_INV, "bold": True}])
        add_text(s, right_x + 0.7, py + 0.32, right_w - 1.0, 0.3,
                 [{"text": d, "size": 10, "color": TEXT_LIGHT}])

    # ============== Slide 4: Agent 分工与协作流 ==============
    s = new_slide()
    add_page_header(s, "03", "Agent 分工与协作流", "不少于 3 个不同职能 Agent 的端到端闭环")
    roles_y = 1.55
    roles_h = 2.5
    roles_gap = 0.2
    role_w = (SLIDE_W - 2 * MARGIN - 3 * roles_gap) / 4
    roles = [
        ("Planner", "任务拆解", "把模糊需求拆为 DAG 子任务，定义依赖与验收标准", "project_diagram", CYAN),
        ("Coder", "编码执行", "调用 Skill 与工具完成实现，产出代码与产物文件", "code", SUCCESS),
        ("Reviewer", "质量挑错", "独立审查产物：挑错、给修复建议、把关质量", "search", WARNING),
        ("Verifier", "验证复盘", "验证结果是否达标，沉淀复盘与经验为可复用能力", "check_double", VIOLET),
    ]
    for i, (name, sub, desc, icon, col) in enumerate(roles):
        rx = MARGIN + i * (role_w + roles_gap)
        add_rect(s, rx, roles_y, role_w, roles_h, fill=CARD, shadow=True)
        add_rect(s, rx, roles_y, role_w, 0.85, fill=col)
        add_text(s, rx + role_w - 0.95, roles_y + 0.05, 0.85, 0.75,
                 [{"text": "0" + str(i + 1), "size": 32, "color": "FFFFFF", "bold": True}],
                 align="right", valign="middle")
        # 图标圆（白半透明底 + 白图标，在彩色顶条上）
        add_oval(s, rx + 0.3, roles_y + 0.18, 0.5, 0.5, fill="FFFFFF")
        _set_transparency(s.shapes[-1], 80)
        add_icon(s, icon, rx + 0.4, roles_y + 0.28, 0.3)
        # 名称
        add_text(s, rx + 0.3, roles_y + 1.0, role_w - 0.6, 0.4,
                 [{"text": name, "size": 19, "color": TEXT_DARK, "bold": True}])
        # 子标签
        tag = add_rect(s, rx + 0.3, roles_y + 1.45, 0.9, 0.28, fill=col)
        _set_transparency(tag, 85)
        add_text(s, rx + 0.3, roles_y + 1.45, 0.9, 0.28,
                 [{"text": sub, "size": 10, "color": col, "bold": True}],
                 align="center", valign="middle")
        add_text(s, rx + 0.3, roles_y + 1.85, role_w - 0.55, 0.55,
                 [{"text": desc, "size": 10.5, "color": TEXT_BODY}], valign="top")
        # 箭头
        if i < len(roles) - 1:
            add_rect(s, rx + role_w + 0.04, roles_y + roles_h / 2 - 0.015,
                     roles_gap - 0.08, 0.03, fill=CYAN)

    # 协作拓扑条
    topo_y = roles_y + roles_h + 0.18
    add_rect(s, MARGIN, topo_y, SLIDE_W - 2 * MARGIN, 0.42, fill=MIDNIGHT)
    add_rect(s, MARGIN, topo_y, 0.06, 0.42, fill=CYAN)
    add_text(s, MARGIN + 0.25, topo_y, SLIDE_W - 2 * MARGIN - 0.5, 0.42,
             [{"text": "协作拓扑  ", "size": 12, "color": CYAN, "bold": True},
              {"text": "sequential 顺序    ｜    parallel 并行扇出    ｜    conditional 条件路由    ——    三类边在画布上可视化编排",
               "size": 11, "color": TEXT_INV}],
             valign="middle")

    # 底部两栏
    bot_y = topo_y + 0.6
    bot_h = SLIDE_H - bot_y - 0.3
    half_w = (SLIDE_W - 2 * MARGIN - 0.3) / 2
    # 典型闭环
    add_card(s, MARGIN, bot_y, half_w, bot_h, accent=CYAN)
    add_icon_header(s, MARGIN + 0.22, bot_y + 0.17, CYAN, "stream")
    add_text(s, MARGIN + 0.95, bot_y + 0.25, half_w - 1.2, 0.4,
             [{"text": "典型闭环", "size": 15, "color": TEXT_DARK, "bold": True}], valign="middle")
    add_text(s, MARGIN + 0.3, bot_y + 0.85, half_w - 0.6, bot_h - 1.0,
             bullets([
                 "群聊下达需求 → Planner 拆解为 DAG",
                 "Coder 并行执行 → Reviewer 审查挑错",
                 "conditional 边：不合格自动回炉重做",
                 "Verifier 验收 → 复盘沉淀为新 Skill",
             ], CYAN, size=11, space_after=5), valign="top")
    # 执行保障
    rx2 = MARGIN + half_w + 0.3
    add_card(s, rx2, bot_y, half_w, bot_h, accent=VIOLET)
    add_icon_header(s, rx2 + 0.22, bot_y + 0.17, VIOLET, "shield")
    add_text(s, rx2 + 0.95, bot_y + 0.25, half_w - 1.2, 0.4,
             [{"text": "执行保障", "size": 15, "color": TEXT_DARK, "bold": True}], valign="middle")
    add_text(s, rx2 + 0.3, bot_y + 0.85, half_w - 0.6, bot_h - 1.0,
             bullets([
                 "分层拓扑调度，层内并行、有界并发",
                 "失败级联跳过、按错误类型分类重试",
                 "节点状态五态追踪（待跑/运行/完成/失败/跳过）",
                 "支持取消、步骤级重试与断点续跑",
             ], VIOLET, size=11, space_after=5), valign="top")

    # ============== 通用：三栏卡片页 ==============
    def three_col_slide(num, title, subtitle, cards):
        s = new_slide()
        add_page_header(s, num, title, subtitle)
        top_y = 1.6
        card_gap = 0.25
        cw = (SLIDE_W - 2 * MARGIN - 2 * card_gap) / 3
        ch = SLIDE_H - top_y - 0.35
        for i, card in enumerate(cards):
            cx = MARGIN + i * (cw + card_gap)
            col = card["color"]
            add_rect(s, cx, top_y, cw, ch, fill=CARD, shadow=True)
            add_rect(s, cx, top_y, cw, 0.85, fill=col)
            add_text(s, cx + cw - 1.0, top_y + 0.05, 0.85, 0.75,
                     [{"text": "0" + str(i + 1), "size": 30, "color": "FFFFFF", "bold": True}],
                     align="right", valign="middle")
            add_oval(s, cx + 0.3, top_y + 0.18, 0.5, 0.5, fill="FFFFFF")
            _set_transparency(s.shapes[-1], 80)
            add_icon(s, card["icon"], cx + 0.4, top_y + 0.28, 0.3)
            add_text(s, cx + 0.3, top_y + 1.0, cw - 0.6, 0.35,
                     [{"text": card["heading"], "size": 15, "color": TEXT_DARK, "bold": True}])
            add_rect(s, cx + 0.3, top_y + 1.4, 0.5, 0.025, fill=col)
            add_text(s, cx + 0.3, top_y + 1.6, cw - 0.55, ch - 1.75,
                     bullets(card["items"], col, size=10.5, space_after=6), valign="top")
        return s

    # ============== Slide 5 ==============
    three_col_slide("04", "任务拆解与上下文传递", "结构化交接，拒绝上下文黑盒", [
        {"color": CYAN, "icon": "sitemap", "heading": "任务拆解", "items": [
            "Planner 将企业任务输入（需求/缺陷/日志）拆为 DAG 节点",
            "DAG 定义经校验后落库：环检测、孤儿成员、未解析引用均拒绝写入",
            "条件边使用安全表达式（禁赋值/禁函数定义），与主流工作流引擎同族",
        ]},
        {"color": VIOLET, "icon": "exchange", "heading": "上下文传递", "items": [
            "节点间以产物文件显式交接：产出即证据，落盘可查验",
            "标准化结果对象在下游节点间传递（状态/产物/耗时/错误）",
            "会话历史与决策上下文持久化，支持时间窗口查询",
        ]},
        {"color": SUCCESS, "icon": "database", "heading": "状态追踪与证据沉淀", "items": [
            "每一步执行生成结构化 step 记录并原子落盘：输入、输出、工具调用、耗时、错误",
            "事件总线全程记录并可回放：任意一次协作可从证据完整复盘",
            "细粒度事件投影为时间线视图，人可逐帧审计 Agent 的决策依据",
        ]},
    ])

    # ============== Slide 6 ==============
    three_col_slide("05", "结果验证与异常分支", "闭环的最后一公里：验证、容错、重做", [
        {"color": SUCCESS, "icon": "check_circle", "heading": "结果验证", "items": [
            "Verifier 独立验证产物是否满足验收标准",
            "验证结论回写 DAG：通过则收尾，不通过触发重做",
            "运行产物集中管理，支持预览与导出（文档/代码/报告）",
        ]},
        {"color": DANGER, "icon": "bug", "heading": "异常分支处理", "items": [
            "失败级联：上游失败，下游自动跳过并标记原因",
            "错误分类重试：限流/超时/鉴权等七类错误区别处置",
            "条件重做：条件边按上游结果动态路由，形成自我修正回路",
        ]},
        {"color": CYAN, "icon": "chart_line", "heading": "验证方式与评估规划", "items": [
            "当前：步骤级重试/恢复 + 时间线回放，支持人工逐节点核验",
            "复赛：构建 Golden / Badcase 评估数据集，对典型研发任务做案例回放评测",
            "决赛：引入 LLM-as-Judge 对任务完成度、工具选择合理性做语义评估，结果回流用于 Prompt / Skill 调优",
        ]},
    ])

    # ============== Slide 7 ==============
    three_col_slide("06", "Skill 工程体系", "Skill 是任务能力抽象层，不是一次性提示词", [
        {"color": CYAN, "icon": "cube", "heading": "Skill 封装标准", "items": [
            "双格式：说明文档（Agent 可读）+ 机器可读清单（程序可调）",
            "每个 Skill 声明：输入输出、调用条件、依赖工具、失败处理、安全边界",
            "目录即技能，可整体导入、导出与分发",
        ]},
        {"color": VIOLET, "icon": "list", "heading": "核心 Skill 清单（示例）", "items": [
            "需求拆解 Skill：自然语言需求 → DAG 子任务",
            "代码审查 Skill：产物挑错与修复建议",
            "结果验证 Skill：对照验收标准判定达标与否",
            "复盘沉淀 Skill：执行结果 → 可复用经验规则",
        ]},
        {"color": SUCCESS, "icon": "share", "heading": "复用与生态", "items": [
            "Skill 可跨 Agent、跨场景复用：研发闭环沉淀的技能可直接迁移到运维/客服场景",
            "支持从 GitHub / 文本一键导入第三方 Skill，内置探针与注册管线",
            "规划 Skill 版本管理、发布与回滚，对齐云 Skills 门户的分发规范",
        ]},
    ])

    # ============== Slide 8 ==============
    three_col_slide("07", "工具集成与 MCP 等价契约", "工具连接层：统一契约，平滑迁移 MCP", [
        {"color": CYAN, "icon": "plug", "heading": "四类调用契约（已实现）", "items": [
            "API 调用：HTTP 服务类工具的稳定接入",
            "CLI 调用：本地命令行工具受控执行",
            "ACP 调用：Agent 通信协议对接外部 Agent",
            "MCP 调用：原生支持 MCP 工具协议",
        ]},
        {"color": VIOLET, "icon": "file_contract", "heading": "等价集成契约要素", "items": [
            "工具名称、调用入口、参数 Schema、返回结构",
            "权限范围、失败重试、审计日志、降级方式",
            "内置 11 个工具运行器：文件、检索、执行等",
        ]},
        {"color": SUCCESS, "icon": "random", "heading": "迁移成本说明", "items": [
            "所有工具已抽象为统一 callable 接口：迁移到 MCP Server 仅需协议适配，无需重设计调用链",
            "RAG 与上下文增强：已实现 Agent 记忆存储与轨迹可观测两项（满足四选二要求），知识库 RAG 复赛前接入",
            "可观测规划：Trace / Log / Metrics 三类数据，评估对接 OpenTelemetry GenAI 语义规范",
        ]},
    ])

    # ============== Slide 9: 安全边界 2x2 ==============
    s = new_slide()
    add_page_header(s, "08", "安全边界、风险控制与审计", "零人工不等于无约束：可验证、可审计、可回滚")
    grid_y = 1.55
    grid_gap = 0.25
    cell_w = (SLIDE_W - 2 * MARGIN - grid_gap) / 2
    cell_h = (SLIDE_H - grid_y - 0.35 - grid_gap) / 2
    cells = [
        {"color": CYAN, "icon": "shield", "heading": "策略门（三态）", "items": [
            "permit：放行，自动执行",
            "warn：警告，记录并提示",
            "deny：拦截，阻断协作边",
            "按边配置，粒度到单次调用",
        ]},
        {"color": VIOLET, "icon": "user_shield", "heading": "人工审批门", "items": [
            "高风险动作强制人工确认",
            "审批事件结构化落盘",
            "与执行证据同一证据链",
            "支持审批后自动续跑",
        ]},
        {"color": WARNING, "icon": "undo", "heading": "回滚与审计", "items": [
            "步骤级重试与断点恢复",
            "执行可整体取消",
            "全程留痕：谁审批、何时、何结论",
            "证据链支持全链路回放",
        ]},
        {"color": SUCCESS, "icon": "lock", "heading": "风险控制", "items": [
            "表达式沙箱：条件边禁赋值、禁函数定义；CLI 工具受控执行，权限最小化",
            "密钥与凭据集中管理，商业 API 调用环节、费用假设与可替代性将在复赛材料中完整披露",
            "数据来源与授权边界清晰：演示数据为团队自有研发过程数据，无第三方合规风险",
        ]},
    ]
    for i, cell in enumerate(cells):
        col = i % 2
        row = i // 2
        cx = MARGIN + col * (cell_w + grid_gap)
        cy = grid_y + row * (cell_h + grid_gap)
        c = cell["color"]
        add_rect(s, cx, cy, cell_w, cell_h, fill=CARD, shadow=True)
        add_rect(s, cx, cy, 0.07, cell_h, fill=c)
        add_icon_header(s, cx + 0.3, cy + 0.28, c, cell["icon"])
        add_text(s, cx + 1.1, cy + 0.32, cell_w - 1.4, 0.4,
                 [{"text": cell["heading"], "size": 16, "color": TEXT_DARK, "bold": True}], valign="middle")
        add_rect(s, cx + 1.1, cy + 0.78, 0.4, 0.02, fill=c)
        add_text(s, cx + 0.32, cy + 1.05, cell_w - 0.6, cell_h - 1.2,
                 bullets(cell["items"], c, size=11, space_after=5), valign="top")

    # ============== Slide 10: 可行性与当前进展 ==============
    s = new_slide()
    add_page_header(s, "09", "可行性与当前进展", "不是概念稿：双引擎已在真实产品中运行")
    top_y = 1.55
    top_h = 2.85
    half_w = (SLIDE_W - 2 * MARGIN - 0.25) / 2
    # 左：已运行
    add_card(s, MARGIN, top_y, half_w, top_h, accent=SUCCESS)
    add_icon_header(s, MARGIN + 0.28, top_y + 0.28, SUCCESS, "play")
    add_text(s, MARGIN + 1.05, top_y + 0.28, half_w - 1.3, 0.35,
             [{"text": "已真实运行的能力", "size": 15, "color": TEXT_DARK, "bold": True}], valign="middle")
    add_text(s, MARGIN + 1.05, top_y + 0.62, half_w - 1.3, 0.28,
             [{"text": "双引擎已在真实产品中运行", "size": 10.5, "color": SUCCESS}])
    add_text(s, MARGIN + 0.3, top_y + 1.12, half_w - 0.55, top_h - 1.25,
             bullets([
                 "DAG 协作引擎：分层调度/并行扇出/条件路由/失败级联",
                 "群聊多 Agent 执行：有界并发 + 策略门过滤",
                 "步骤落盘、重试、恢复、取消与时间线回放",
                 "三栏工作台前端：协作画布 + 产物预览 + 审批面板",
             ], SUCCESS, size=11, space_after=5), valign="top")
    # 右：工程成熟度
    rx2 = MARGIN + half_w + 0.25
    add_card(s, rx2, top_y, half_w, top_h, accent=CYAN)
    add_icon_header(s, rx2 + 0.28, top_y + 0.28, CYAN, "cogs")
    add_text(s, rx2 + 1.05, top_y + 0.28, half_w - 1.3, 0.35,
             [{"text": "工程成熟度", "size": 15, "color": TEXT_DARK, "bold": True}], valign="middle")
    add_text(s, rx2 + 1.05, top_y + 0.62, half_w - 1.3, 0.28,
             [{"text": "模块化清晰，即首个用户", "size": 10.5, "color": CYAN_DARK}])
    add_text(s, rx2 + 0.3, top_y + 1.12, half_w - 0.55, top_h - 1.25,
             bullets([
                 "Node + Python 双后端，模块化清晰",
                 "11 个内置工具 + 四类外部调用契约",
                 "DAG 定义写入前强制校验（环/孤儿/引用）",
                 "自有产品即首个用户，日常研发已在使用",
             ], CYAN, size=11, space_after=5), valign="top")
    # 下：指标深色条
    bot_y = top_y + top_h + 0.22
    bot_h = SLIDE_H - bot_y - 0.3
    add_rect(s, MARGIN, bot_y, SLIDE_W - 2 * MARGIN, bot_h, fill=MIDNIGHT, shadow=True)
    add_text(s, MARGIN + 0.3, bot_y + 0.18, SLIDE_W - 2 * MARGIN - 0.6, 0.35,
             [{"text": "评估指标设计", "size": 14, "color": TEXT_INV, "bold": True},
              {"text": "    科学量化智能体推理效果与效率", "size": 11, "color": TEXT_LIGHT}],
             valign="middle")
    metrics = [
        ("60%+", "常规研发任务", "人工介入减少", CYAN),
        ("100%", "全流程留痕", "审计覆盖率", VIOLET),
        ("≥70%", "闭环完成率", "端到端无人工", SUCCESS),
    ]
    metr_w = (SLIDE_W - 2 * MARGIN - 0.9 - 0.6) / 3
    for i, (big, label, sub, col) in enumerate(metrics):
        mx = MARGIN + 0.45 + i * (metr_w + 0.3)
        my = bot_y + 0.78
        add_text(s, mx, my, metr_w, 0.7,
                 [{"text": big, "size": 40, "color": col, "bold": True}],
                 valign="middle")
        add_text(s, mx, my + 0.75, metr_w, 0.28,
                 [{"text": label, "size": 12, "color": TEXT_INV, "bold": True}])
        add_text(s, mx, my + 1.02, metr_w, 0.25,
                 [{"text": sub, "size": 10, "color": TEXT_LIGHT}])

    # ============== Slide 11: 落地计划 ==============
    s = new_slide()
    add_page_header(s, "10", "落地计划：初赛 → 复赛 → 决赛", "每个阶段都有可验证交付物")
    tl_y = 1.65
    tl_h = 3.5
    tl_gap = 0.35
    stage_w = (SLIDE_W - 2 * MARGIN - 2 * tl_gap) / 3
    stages = [
        ("初赛", "V0.2", "当前", CYAN, "flag", [
            "方案设计与四职能 Agent 闭环定义",
            "Skill 清单与封装标准",
            "可运行系统 + 演示视频 + 执行证据导出",
        ]),
        ("复赛", "V0.5", "9 月", VIOLET, "rocket", [
            "AgentTeams 适配层：DAG 定义翻译为框架 spec",
            "全局状态与检查点恢复，评估数据集构建",
            "知识库 RAG 接入，可观测 Trace 看板",
        ]),
        ("决赛", "V1.0", "9 月下旬", SUCCESS, "trophy", [
            "真实研发场景端到端现场演示",
            "LLM-as-Judge 语义评估报告",
            "开源发布：引擎 + Skill 清单 + 部署文档",
        ]),
    ]
    # 时间轴底线
    line_y = tl_y + 0.85
    ln = add_rect(s, MARGIN + stage_w / 2, line_y, 2 * stage_w + 2 * tl_gap, 0.04, fill=SLATE700)
    _set_transparency(ln, 50)
    for i, (tag, ver, time, col, icon, items) in enumerate(stages):
        sx = MARGIN + i * (stage_w + tl_gap)
        # 阶段卡片
        add_rect(s, sx, tl_y + 1.2, stage_w, tl_h - 1.2, fill=CARD, shadow=True)
        add_rect(s, sx, tl_y + 1.2, stage_w, 0.07, fill=col)
        # 时间轴节点圆
        dot_x = sx + stage_w / 2 - 0.32
        dot_y = line_y - 0.3
        dot = add_oval(s, dot_x, dot_y, 0.64, 0.64, fill=col, line=BG, line_w=3, shadow=True)
        add_icon(s, icon, dot_x + 0.16, dot_y + 0.16, 0.32)
        # 顶部标签
        add_text(s, sx, tl_y, stage_w, 0.35,
                 [{"text": tag + "  ", "size": 14, "color": TEXT_DARK, "bold": True}], align="center")
        add_text(s, sx, tl_y + 0.4, stage_w, 0.25,
                 [{"text": time, "size": 11, "color": col}], align="center")
        # 版本号
        add_text(s, sx + 0.3, tl_y + 1.4, stage_w - 0.6, 0.5,
                 [{"text": ver, "size": 26, "color": col, "bold": True}])
        add_text(s, sx + 0.3, tl_y + 2.0, stage_w - 0.55, tl_h - 2.15,
                 bullets(items, col, size=10.5, space_after=6), valign="top")

    # 底部合规路径条
    bot_y = tl_y + tl_h + 0.15
    add_rect(s, MARGIN, bot_y, SLIDE_W - 2 * MARGIN, SLIDE_H - bot_y - 0.3, fill=MIDNIGHT)
    add_rect(s, MARGIN, bot_y, 0.06, SLIDE_H - bot_y - 0.3, fill=CYAN)
    add_text(s, MARGIN + 0.25, bot_y, SLIDE_W - 2 * MARGIN - 0.5, SLIDE_H - bot_y - 0.3,
             [{"text": "关键合规路径  ", "size": 11.5, "color": CYAN, "bold": True},
              {"text": "多 Agent 协同设计全程以 AgentTeams 为基点 —— 角色编排、任务拆解、上下文传递、协同执行、状态追踪五项能力逐一映射；初赛提交能力映射表，复赛提交可执行适配层代码包。",
               "size": 10.5, "color": TEXT_INV}],
             valign="middle")

    # ============== Slide 12: 开放 / 开源计划（结尾深色） ==============
    s = new_slide(bg=MIDNIGHT)
    # 装饰
    o1 = add_oval(s, -1.5, -1.5, 4, 4, fill=CYAN); _set_transparency(o1, 88)
    o2 = add_oval(s, SLIDE_W - 2.2, SLIDE_H - 2.8, 4, 4, fill=VIOLET); _set_transparency(o2, 90)
    # 顶部条
    add_rect(s, 0, 0, SLIDE_W, 0.08, fill=CYAN)
    add_text(s, MARGIN, 0.4, 9.8, 0.65,
             [{"text": "11  ", "size": 22, "color": CYAN, "bold": True},
              {"text": "开放 / 开源计划", "size": 26, "color": TEXT_INV, "bold": True}],
             valign="middle")
    add_text(s, MARGIN, 1.1, 11.5, 0.35,
             [{"text": "可复用成果与长期成长", "size": 12.5, "color": TEXT_LIGHT}])
    add_text(s, SLIDE_W - 2.2, 0.5, 1.65, 0.35,
             [{"text": "ShadowFlow", "size": 11, "color": CYAN, "bold": True}],
             align="right", valign="middle")
    top_y = 1.7
    card_h = 3.0
    half_w = (SLIDE_W - 2 * MARGIN - 0.3) / 2
    # 左：开放范围
    add_rect(s, MARGIN, top_y, half_w, card_h, fill=CARD_DARK, shadow=True)
    add_rect(s, MARGIN, top_y, half_w, 0.07, fill=CYAN)
    add_icon_header(s, MARGIN + 0.3, top_y + 0.28, CYAN, "gift")
    add_text(s, MARGIN + 1.05, top_y + 0.32, half_w - 1.3, 0.4,
             [{"text": "开放范围", "size": 15, "color": TEXT_INV, "bold": True}], valign="middle")
    add_text(s, MARGIN + 0.3, top_y + 1.12, half_w - 0.55, card_h - 1.25,
             bullets([
                 "DAG 协作引擎与调度器（核心）",
                 "核心 Skill 清单与封装标准",
                 "Agent / 工具集成契约与适配器样例",
                 "评估数据集与演示脚本",
             ], CYAN, text_color=TEXT_INVM, size=11, space_after=6), valign="top")
    # 右：合规披露
    rx2 = MARGIN + half_w + 0.3
    add_rect(s, rx2, top_y, half_w, card_h, fill=CARD_DARK, shadow=True)
    add_rect(s, rx2, top_y, half_w, 0.07, fill=VIOLET)
    add_icon_header(s, rx2 + 0.3, top_y + 0.28, VIOLET, "balance")
    add_text(s, rx2 + 1.05, top_y + 0.32, half_w - 1.3, 0.4,
             [{"text": "合规披露", "size": 15, "color": TEXT_INV, "bold": True}], valign="middle")
    add_text(s, rx2 + 0.3, top_y + 1.12, half_w - 0.55, card_h - 1.25,
             bullets([
                 "开源协议：Apache-2.0（计划），依赖清单完整披露",
                 "商业 API：披露调用环节、费用假设、可替代性",
                 "闭源模型：说明使用范围、替代方案与迁移成本",
                 "本项目为团队自有项目持续开发，新增贡献范围明确",
             ], VIOLET, text_color=TEXT_INVM, size=11, space_after=6), valign="top")
    # 结语
    close_y = top_y + card_h + 0.35
    add_rect(s, MARGIN, close_y, 0.9, 0.07, fill=CYAN)
    add_text(s, MARGIN, close_y + 0.18, SLIDE_W - 2 * MARGIN, 0.5,
             [{"text": "让复杂研发任务从人拉肩扛，走向可协作、可治理、可复用的 Agent Infra。",
               "size": 15, "color": TEXT_INV, "bold": True}])
    add_text(s, MARGIN, close_y + 0.7, SLIDE_W - 2 * MARGIN, 0.35,
             [{"text": "ShadowFlow —— 软件研发全流程多 Agent 自主协同基座",
               "size": 12, "color": CYAN_LIGHT}])
    add_text(s, MARGIN, close_y + 1.08, SLIDE_W - 2 * MARGIN, 0.3,
             [{"text": "谢谢评审，恳请指正。", "size": 11, "color": TEXT_LIGHT}])

    # 保存
    out = r"D:\VScode\TotalProject\ShadowFlow\多智能体框架研究\参赛材料\ShadowFlow-GOAI初赛方案-v2.pptx"
    prs.save(out)
    print("Generated:", out)


def _set_transparency(shape, pct):
    """给形状填充设置透明度（pct=0 不透明，100 全透明）。"""
    spPr = shape._element.spPr
    solidFill = spPr.find(qn('a:solidFill'))
    if solidFill is None:
        # fill.background() 时无 solidFill，需要重建
        # 这里仅处理 solid 的情况
        return
    srgb = solidFill.find(qn('a:srgbClr'))
    if srgb is None:
        return
    # 移除已有 alpha
    for a in srgb.findall(qn('a:alpha')):
        srgb.remove(a)
    alpha = etree.SubElement(srgb, qn('a:alpha'))
    alpha.set('val', str(int((100 - pct) * 1000)))


if __name__ == "__main__":
    build()
