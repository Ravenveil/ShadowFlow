# -*- coding: utf-8 -*-
"""通过 PowerPoint COM 把 pptx 导出为每页 PNG 图片。"""
import os, sys, glob, time
import win32com.client

SRC = sys.argv[1] if len(sys.argv) > 1 else r"D:\VScode\TotalProject\ShadowFlow\多智能体框架研究\参赛材料\ShadowFlow-GOAI初赛方案-v2.pptx"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else r"D:\VScode\TotalProject\ShadowFlow\多智能体框架研究\参赛材料\preview"

os.makedirs(OUT_DIR, exist_ok=True)
# 清理旧图
for f in glob.glob(os.path.join(OUT_DIR, "slide-*.png")):
    try: os.remove(f)
    except: pass

ppt = win32com.client.Dispatch("PowerPoint.Application")
# 不显示窗口（某些版本需 Visible=True 才能导出，这里设 True 但最小化）
try:
    ppt.Visible = 1
except Exception:
    pass
try:
    ppt.WindowState = 2  # ppWindowMinimized
except Exception:
    pass

pres = ppt.Presentations.Open(SRC, WithWindow=False)
# 导出整篇为图片（每页一张）。Export 方法按索引导出单页；SaveAs 整篇用 ppSaveAsPNG=18
try:
    pres.SaveAs(OUT_DIR, 18)  # 18 = ppSaveAsPNG
except Exception as e:
    print("SaveAs PNG failed, try per-slide:", e)
    # 兜底：逐页 Export
    for i, slide in enumerate(pres.Slides, 1):
        out = os.path.join(OUT_DIR, f"slide-{i:02d}.png")
        slide.Export(out, "PNG", 1600, 900)

pres.Close()
ppt.Quit()

# SaveAs 会生成 Slide1.PNG 等，重命名为 slide-01.png
renamed = 0
for f in sorted(glob.glob(os.path.join(OUT_DIR, "*.PNG"))) + sorted(glob.glob(os.path.join(OUT_DIR, "*.png"))):
    base = os.path.basename(f)
    if base.lower().startswith("slide") and base.lower().endswith(".png"):
        # 提取数字
        num = "".join(ch for ch in base if ch.isdigit())
        if num:
            new = os.path.join(OUT_DIR, f"slide-{int(num):02d}.png")
            if f.lower() != new.lower():
                try:
                    if os.path.exists(new): os.remove(new)
                    os.rename(f, new)
                    renamed += 1
                except Exception as e:
                    print("rename fail", f, e)
print(f"Done. Renamed {renamed} files. Files in {OUT_DIR}:")
for f in sorted(glob.glob(os.path.join(OUT_DIR, "*.png"))):
    print(" ", os.path.basename(f))
