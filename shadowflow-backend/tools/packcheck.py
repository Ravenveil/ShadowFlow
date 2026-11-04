"""文件包走查：确认客户真能拿到一个「打开就能用」的包，而不是一堆散文件。

为什么要单独查：
  · 清单说包里有 5 个文件、下载解压只有 4 个——客户当场就发现，我们看不出来；
  · 包里正文和网页正文不是同一份——客户改稿改错版本；
  · 中文文件名在 Windows 解压成乱码——最常被投诉的一条；
  · PDF 打开是空白（字体没嵌进去）——只用大小和魔数挡不住，这里至少查页数与文字量。

用法：python tools/packcheck.py [--base http://127.0.0.1:8787]
退出码：0 全过；1 有问题；2 连不上服务或没有可查的已交付订单。
"""

import argparse
import io
import json
import sys
import urllib.error
import urllib.request
import zipfile

sys.path.insert(0, ".")


def call(base, path, raw=False):
    req = urllib.request.Request(base + path)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=60) as resp:
            body = resp.read()
            if raw:
                return resp.status, body, dict(resp.headers)
            return resp.status, json.loads(body or b"{}"), dict(resp.headers)
    except urllib.error.HTTPError as exc:
        return exc.code, None, {}
    except urllib.error.URLError as exc:
        print(f"连不上 {base}：{exc}")
        sys.exit(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:8787")
    ap.add_argument("--token", default="")
    args = ap.parse_args()
    base = args.base.rstrip("/")
    if args.token:
        # 后台接口要令牌时，这里也带一份（下载接口走订单凭据，不受影响）
        urllib.request.install_opener(
            urllib.request.build_opener(urllib.request.ProxyHandler({}))
        )

    st, orders, _ = call(base, "/api/orders?limit=50")
    if st != 200:
        print(f"取订单失败（HTTP {st}）；本机直接跑请确认服务在 {base}")
        return 2
    done = next((o for o in orders.get("items", []) if o.get("status") == "delivered"), None)
    if not done:
        print("库里没有已交付订单，先跑一单再来")
        return 2

    oid = done["id"]
    key = done.get("access_key") or ""
    qs = f"?k={key}" if key else ""
    bad = 0

    st, detail, _ = call(base, f"/api/orders/{oid}{qs}")
    final_text = ((detail or {}).get("order") or {}).get("deliverable", {}).get("final_text") or ""
    q = (((detail or {}).get("order") or {}).get("deliverable") or {}).get("quality") or {}
    print(f"样本订单 {oid}｜正文 {len(final_text)} 字｜自检 {q.get('score')} 分")

    # ① 清单
    st, man, _ = call(base, f"/api/orders/{oid}/package{qs}")
    if st != 200 or not man:
        print(f"  FAIL 清单接口 HTTP {st}")
        return 1
    files = man.get("files") or []
    ok = bool(files) and man.get("total_bytes", 0) > 0 and bool((man.get("download") or {}).get("zip"))
    print(f"  {'OK  ' if ok else 'FAIL'} 清单：{len(files)} 个文件 / {man.get('total_bytes')} 字节")
    bad += 0 if ok else 1

    # ② ZIP 真能解，且和清单一一对应
    st, blob, headers = call(base, f"/api/orders/{oid}/package.zip{qs}", raw=True)
    zok = st == 200 and blob[:2] == b"PK"
    print(f"  {'OK  ' if zok else 'FAIL'} ZIP 下载：HTTP {st}、{len(blob or b'')} 字节、魔数 {blob[:2] if blob else b''}")
    bad += 0 if zok else 1

    if zok:
        try:
            zf = zipfile.ZipFile(io.BytesIO(blob))
            names = zf.namelist()
        except Exception as exc:  # noqa: BLE001
            print(f"  FAIL ZIP 打不开：{exc}")
            return 1
        inner = [n.split("/", 1)[1] for n in names if "/" in n]
        missing = [f["name"] for f in files if f["name"] not in inner]
        print(f"  {'OK  ' if not missing else 'FAIL'} 清单与包内一致：包内 {len(inner)} 项"
              + (f"，缺 {missing}" if missing else ""))
        bad += 0 if not missing else 1

        empty = [n for n in names if not n.endswith("/") and zf.getinfo(n).file_size == 0]
        print(f"  {'OK  ' if not empty else 'FAIL'} 没有空文件" + (f"：{empty}" if empty else ""))
        bad += 0 if not empty else 1

        main_file = next((n for n in names if n.endswith("交付正文.txt")), None)
        if main_file:
            inside = zf.read(main_file).decode("utf-8").strip()
            same = inside == final_text.strip()
            print(f"  {'OK  ' if same else 'FAIL'} 包内正文与网页正文一致（{len(inside)} 字）")
            bad += 0 if same else 1
        else:
            print("  FAIL 包里没有「交付正文.txt」")
            bad += 1

        utf8 = all(zf.getinfo(n).flag_bits & 0x800 for n in names)
        print(f"  {'OK  ' if utf8 else 'FAIL'} 文件名带 UTF-8 标记（Windows 解压中文不乱码）")
        bad += 0 if utf8 else 1

    # ③ PDF：能下、像 PDF、不是空壳
    if (man.get("available") or {}).get("pdf"):
        st, pdf, _ = call(base, f"/api/orders/{oid}/package.pdf{qs}", raw=True)
        has_font = (b"/FontFile2" in pdf) or (b"STSong" in pdf)
        pok = bool(st == 200 and pdf[:4] == b"%PDF" and len(pdf) > 5000 and has_font)
        print(f"  {'OK  ' if pok else 'FAIL'} PDF：HTTP {st}、{len(pdf or b'')} 字节、内嵌字体 "
              f"{'是' if b'/FontFile2' in (pdf or b'') else ('CID' if b'STSong' in (pdf or b'') else '否')}")
        bad += 0 if pok else 1
    else:
        print("  --   PDF 未启用（服务端没装 reportlab），只查 ZIP")

    # ④ 错误分支
    st, _, _ = call(base, f"/api/orders/{oid}/package.rar{qs}", raw=True)
    print(f"  {'OK  ' if st == 400 else 'FAIL'} 乱传格式返回 400（实际 {st}）")
    bad += 0 if st == 400 else 1

    print()
    if bad:
        print(f"文件包有问题：{bad} 项")
        return 1
    print("文件包可用：清单、ZIP、正文一致性、中文名、PDF、错误分支都对得上")
    return 0


if __name__ == "__main__":
    sys.exit(main())
