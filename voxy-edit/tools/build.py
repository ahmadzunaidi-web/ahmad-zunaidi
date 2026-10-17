# -*- coding: utf-8 -*-
import os
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
import sys, json, html
sys.path.insert(0, _HERE)
from words import load_words, fix_text
from edl import EDL

OUT = os.path.join(_ROOT, "index.html")
W, H = 1080, 1920
SRC = "assets/media/voxy-portrait.mp4"

# ---------- timeline map ----------
segs, t = [], 0.0
for (a, b, n, lab) in EDL:
    segs.append({"a": a, "b": b, "n": n, "lab": lab, "tl": round(t, 3), "dur": 0.0})
    t += b - a
TOTAL = round(t, 3)
for i, sg in enumerate(segs):           # tile exactly: dur = next_start - start
    nxt = segs[i + 1]["tl"] if i + 1 < len(segs) else TOTAL
    sg["dur"] = round(nxt - sg["tl"], 3)

def src2tl(s):
    for sg in segs:
        if sg["a"] - 0.001 <= s <= sg["b"] + 0.001:
            return round(sg["tl"] + (s - sg["a"]), 3)
    return None

# ---------- words -> timeline ----------
RAW = load_words()
words = []
for sg in segs:
    for w in RAW:
        if w["end"] <= sg["a"] + 0.02 or w["start"] >= sg["b"] - 0.02:
            continue
        s = max(w["start"], sg["a"]); e = min(w["end"], sg["b"])
        words.append({
            "text": fix_text(w["text"]),
            "start": round(sg["tl"] + (s - sg["a"]), 3),
            "end":   round(sg["tl"] + (e - sg["a"]), 3),
            "seg":   sg["tl"],
        })

CAPTION_FROM = 7.0                      # hook + title card carry 0-7s
CAPTION_TO   = TOTAL - 9.6              # price/CTA card owns the lower frame
words = [w for w in words if CAPTION_FROM <= w["start"] < CAPTION_TO]

# ---------- items ----------
ITEMS = [
    (1, "POWER BOOT",           10.92, None),
    (2, "BLIND SPOT MONITOR",   13.47, None),
    (3, "SIDE STEP",            25.03, ("bad",  28.50)),
    (4, "LEG REST + SEAT HEATER", 29.17, ("bad", 34.50)),
    (5, "DIGITAL INNER MIRROR", 48.25, ("good", 50.40, "AFTERMARKET")),
    (6, "360° CAMERA",          53.57, ("bad",  59.60)),
    (7, "INFRARED CAMERA",      61.13, None),
    (8, "HEAD-UP DISPLAY",      68.93, None),
    (9, "LAMPU LED",            94.97, ("bad",  97.10)),
]
CHIP_END = TOTAL - 14.10               # chips stop when the CTA block starts

HOOK = ["JANGAN TENGOK\nTAHUN SAJA", "JANGAN TENGOK\nMILEAGE SAJA", "JANGAN TENGOK\nGRADE SAJA"]

esc = lambda s: html.escape(s, quote=True)

# ---------- video clips ----------
vid = []
for i, sg in enumerate(segs, 1):
    vid.append(
        f'      <video id="sh{i:02d}" class="clip" src="{SRC}" playsinline data-has-audio="true"\n'
        f'        data-start="{sg["tl"]:.3f}" data-duration="{sg["dur"]:.3f}" data-media-start="{sg["a"]:.3f}"\n'
        f'        data-track-index="{(i-1)%2}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1"></video>'
    )

# ---------- overlays ----------
ov, tw, sfx = [], [], []

# hook lines
for i, line in enumerate(HOOK):
    st = 0.15 + i * 1.30
    ov.append(
        f'      <div id="hook{i}" class="clip hook-line h{i}" data-start="{st:.2f}" data-duration="{4.34-st:.2f}" data-track-index="2">'
        f'{esc(line).replace(chr(10),"<br>")}</div>'
    )
    tw.append(f'tl.fromTo("#hook{i}",{{opacity:0,yPercent:18}},{{opacity:1,yPercent:0,duration:.34,ease:"power3.out"}},{st:.2f});')
    sfx.append(("tick", st, 0.9))

# title card
ov.append(
    '      <div id="titlecard" class="clip" data-start="4.34" data-duration="2.70" data-track-index="2">'
    '<span class="tc-card"><span class="tc-num">9</span><span class="tc-txt">BENDA TOYOTA<br>JUAL <span class="tc-hl">OPTIONAL</span></span></span></div>'
)
tw.append('tl.fromTo("#titlecard",{opacity:0,scale:.82},{opacity:1,scale:1,duration:.30,ease:"back.out(2.2)"},4.40);')
tw.append('tl.to("#titlecard",{opacity:0,duration:.26,ease:"power2.in"},6.74);')
sfx.append(("slam", 4.40, 1.0))

# counter chips + lower thirds + marks
for idx, it in enumerate(ITEMS):
    n, name, st = it[0], it[1], it[2]
    mark = it[3]
    end = ITEMS[idx + 1][2] if idx + 1 < len(ITEMS) else CHIP_END
    dur = max(1.2, end - st)
    ov.append(
        f'      <div id="chip{n}" class="clip chip" data-start="{st:.2f}" data-duration="{dur:.2f}" data-track-index="3">'
        f'<span class="chip-inner"><span class="chip-n">{n}</span><span class="chip-d">/9</span></span></div>'
    )
    tw.append(f'tl.fromTo("#chip{n}",{{opacity:0,xPercent:40}},{{opacity:1,xPercent:0,duration:.28,ease:"power3.out"}},{st:.2f});')
    sfx.append(("click", st, 1.0))

    ld = min(3.6, dur)
    ov.append(
        f'      <div id="lt{n}" class="clip lt" data-start="{st:.2f}" data-duration="{ld:.2f}" data-track-index="4">'
        f'<span class="lt-txt">{esc(name)}</span></div>'
    )
    tw.append(f'tl.fromTo("#lt{n}",{{opacity:0,xPercent:-8}},{{opacity:1,xPercent:0,duration:.32,ease:"power3.out"}},{st+0.10:.2f});')
    tw.append(f'tl.to("#lt{n}",{{opacity:0,duration:.28,ease:"power2.in"}},{st+ld-0.32:.2f});')

    if mark:
        kind, mt = mark[0], mark[1]
        note = mark[2] if len(mark) > 2 else None
        glyph = "✓" if kind == "good" else "✗"
        lbl = note if note else ("ADA" if kind == "good" else "TAK ADA")
        ov.append(
            f'      <div id="mk{n}" class="clip mark {kind}" data-start="{mt:.2f}" data-duration="2.30" data-track-index="5">'
            f'<span class="mk-inner"><span class="mk-g">{glyph}</span><span class="mk-l">{esc(lbl)}</span></span></div>'
        )
        tw.append(f'tl.fromTo("#mk{n}",{{opacity:0,scale:.6}},{{opacity:1,scale:1,duration:.26,ease:"back.out(3)"}},{mt:.2f});')
        tw.append(f'tl.to("#mk{n}",{{opacity:0,duration:.3,ease:"power2.in"}},{mt+2.0:.2f});')
        sfx.append(("ping" if kind == "good" else "thud", mt, 1.0))

# side-step LED highlight
LEDT = 27.40
ov.append(f'      <div id="ledglow" class="clip" data-start="{LEDT:.2f}" data-duration="1.60" data-track-index="6"></div>')
tw.append(f'tl.fromTo("#ledglow",{{opacity:0,scale:.75}},{{opacity:.85,scale:1.06,duration:.55,ease:"power2.out"}},{LEDT:.2f});')
tw.append(f'tl.to("#ledglow",{{opacity:0,duration:.5,ease:"power2.in"}},{LEDT+1.05:.2f});')
sfx.append(("whoosh", LEDT - 0.12, 1.0))

# price / CTA card
PT = TOTAL - 9.6
ov.append(
    f'      <div id="price" class="clip" data-start="{PT:.2f}" data-duration="9.60" data-track-index="7">'
    f'<span class="pr-card"><span class="pr-k">HARGA OTR DARI</span><span class="pr-v">RM153,000</span>'
    f'<span class="pr-c">DM untuk tempahan · link di profil</span></span></div>'
)
tw.append(f'tl.fromTo("#price",{{opacity:0,yPercent:16}},{{opacity:1,yPercent:0,duration:.4,ease:"power3.out"}},{PT:.2f});')
sfx.append(("swoosh", PT, 1.0))

# recap ticks
RECAP = 81.69
for i in range(3):
    st = RECAP + 3.0 + i * 1.5
    ov.append(f'      <div id="rc{i}" class="clip rc r{i}" data-start="{st:.2f}" data-duration="{(RECAP+13.28)-st:.2f}" data-track-index="8">✓ {["TAHUN","MILEAGE","GRADE"][i]}</div>')
    tw.append(f'tl.fromTo("#rc{i}",{{opacity:0,xPercent:-14}},{{opacity:1,xPercent:0,duration:.3,ease:"power3.out"}},{st:.2f});')
    sfx.append(("ping", st, 0.75))

# ---------- sfx elements ----------
sfx_el = []
DUR = {"tick":0.05,"click":0.07,"slam":0.34,"whoosh":0.55,"ping":0.26,"thud":0.20,"swoosh":0.45}
for i, (name, st, vol) in enumerate(sfx):
    sfx_el.append(
        f'      <audio id="sfx{i:02d}" src="assets/sfx/{name}.wav" data-start="{max(0,st):.2f}" '
        f'data-duration="{DUR[name]}" data-volume="{vol}" data-track-index="{20+i}"></audio>'
    )

CAPWORDS = json.dumps([{"t": w["text"], "s": w["start"], "e": w["end"], "g": w["seg"]} for w in words],
                      ensure_ascii=False, separators=(",", ":"))

doc = f'''<!doctype html>
<html lang="ms" data-resolution="portrait">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      @font-face {{ font-family:"InterLocal"; src:url("assets/fonts/Inter-Regular.otf") format("opentype"); font-weight:400; font-display:block; }}
      @font-face {{ font-family:"InterLocal"; src:url("assets/fonts/Inter-SemiBold.otf") format("opentype"); font-weight:600; font-display:block; }}
      @font-face {{ font-family:"InterLocal"; src:url("assets/fonts/Inter-Bold.otf") format("opentype"); font-weight:700; font-display:block; }}
      @font-face {{ font-family:"InterLocal"; src:url("assets/fonts/Inter-ExtraBold.otf") format("opentype"); font-weight:800; font-display:block; }}
      *,*::before,*::after {{ margin:0; padding:0; box-sizing:border-box; }}
      html,body {{ width:{W}px; height:{H}px; overflow:hidden; background:#000;
        font-family:"InterLocal", sans-serif; -webkit-font-smoothing:antialiased; }}
      :root {{ --ink:#0B0D0E; --paper:#F5F3EF; --accent:#E8502E; --good:#1FA971; --bad:#E0453A; }}

      #scrim {{ position:absolute; left:0; right:0; bottom:0; height:780px; z-index:2; pointer-events:none;
        background:linear-gradient(to top, rgba(8,9,10,.90) 0%, rgba(8,9,10,.72) 26%, rgba(8,9,10,.34) 58%, rgba(8,9,10,0) 100%); }}
      #topscrim {{ position:absolute; left:0; right:0; top:0; height:330px; z-index:2; pointer-events:none;
        background:linear-gradient(to bottom, rgba(8,9,10,.62) 0%, rgba(8,9,10,0) 100%); }}

      .hook-line {{ position:absolute; left:72px; right:72px; z-index:8; font-weight:800; font-size:104px;
        line-height:1.02; letter-spacing:-.035em; color:var(--paper); text-shadow:0 8px 40px rgba(0,0,0,.65); }}
      .h0 {{ top:470px; }}
      .h1 {{ top:720px; }}
      .h2 {{ top:970px; color:var(--accent); }}

      #titlecard {{ position:absolute; inset:0; z-index:9; display:flex; align-items:center; justify-content:center; }}
      .tc-card {{ display:block; background:var(--paper); border-radius:38px; padding:70px 84px; text-align:center;
        box-shadow:0 40px 120px rgba(0,0,0,.6); }}
      .tc-num {{ display:block; font-weight:800; font-size:260px; line-height:.88; color:var(--accent); letter-spacing:-.05em; }}
      .tc-txt {{ display:block; font-weight:800; font-size:76px; line-height:1.06; color:var(--ink); letter-spacing:-.03em; margin-top:16px; }}
      .tc-hl {{ color:var(--accent); }}

      .chip {{ position:absolute; right:60px; top:210px; z-index:7; text-align:right; }}
      .chip-inner {{ display:inline-flex; align-items:baseline; gap:4px; background:var(--accent); border-radius:999px;
        padding:20px 42px 24px; box-shadow:0 14px 44px rgba(0,0,0,.45); }}
      .chip-n {{ font-weight:800; font-size:86px; line-height:1; color:#fff; letter-spacing:-.04em; }}
      .chip-d {{ font-weight:700; font-size:44px; line-height:1; color:rgba(255,255,255,.72); }}

      .lt {{ position:absolute; left:60px; right:60px; top:1120px; z-index:7; }}
      .lt-txt {{ display:inline-block; background:rgba(245,243,239,.96); color:var(--ink); font-weight:800;
        font-size:52px; letter-spacing:-.02em; padding:24px 40px 26px; border-radius:6px 12px 12px 6px;
        border-left:14px solid var(--accent); box-shadow:0 14px 44px rgba(0,0,0,.4); }}

      .mark {{ position:absolute; left:60px; top:960px; z-index:8; }}
      .mk-inner {{ display:inline-flex; align-items:center; gap:22px; padding:20px 40px 22px; border-radius:999px;
        box-shadow:0 14px 44px rgba(0,0,0,.45); }}
      .mark.good .mk-inner {{ background:var(--good); }}
      .mark.bad  .mk-inner {{ background:var(--bad); }}
      .mk-g {{ font-weight:800; font-size:62px; line-height:1; color:#fff; }}
      .mk-l {{ font-weight:800; font-size:44px; letter-spacing:.01em; color:#fff; }}

      #ledglow {{ position:absolute; left:250px; top:1080px; width:560px; height:300px; z-index:6; border-radius:50%;
        background:radial-gradient(ellipse at center, rgba(90,170,255,.60) 0%, rgba(90,170,255,.26) 42%, rgba(90,170,255,0) 72%);
        filter:blur(6px); }}

      .rc {{ position:absolute; left:72px; right:72px; z-index:8; font-weight:800; font-size:76px;
        letter-spacing:-.02em; color:var(--paper); text-shadow:0 8px 34px rgba(0,0,0,.6); }}
      .r0 {{ top:690px; }}
      .r1 {{ top:840px; }}
      .r2 {{ top:990px; }}

      #price {{ position:absolute; left:60px; right:60px; top:1040px; z-index:9; text-align:center; }}
      .pr-card {{ display:block; background:var(--paper); border-radius:32px; padding:52px 56px 56px;
        box-shadow:0 36px 100px rgba(0,0,0,.58); }}
      .pr-k {{ display:block; font-weight:700; font-size:40px; letter-spacing:.10em; color:#6A6A6A; }}
      .pr-v {{ display:block; font-weight:800; font-size:132px; line-height:1.04; letter-spacing:-.04em; color:var(--ink); margin-top:8px; }}
      .pr-c {{ display:block; font-weight:600; font-size:38px; color:var(--accent); margin-top:18px; }}

      #cap-stage {{ position:absolute; left:70px; right:70px; bottom:360px; height:300px; z-index:10;
        display:flex; align-items:center; justify-content:center; pointer-events:none; }}
      .cap-group {{ position:absolute; left:0; right:0; display:flex; align-items:center; justify-content:center; opacity:0; }}
      .cap-box {{ max-width:940px; text-align:center; }}
      .cap-line {{ display:flex; justify-content:center; flex-wrap:nowrap; gap:16px; line-height:1.14; }}
      .cap-w {{ display:inline-block; font-weight:800; letter-spacing:-.02em; color:#9BA0A4;
        text-shadow:0 5px 26px rgba(0,0,0,.75); }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}"
         data-width="{W}" data-height="{H}">
{chr(10).join(vid)}
      <div id="topscrim"></div>
      <div id="scrim"></div>
{chr(10).join(ov)}
      <div id="cap-stage"></div>
{chr(10).join(sfx_el)}
    </div>
    <script>
      var WORDS = {CAPWORDS};
      var MAXW = 4, BASE = 60, MIN = 42, GAP = 16, BOX = 880;
      var ON = "#FFFFFF", OFF = "#9BA0A4", PAUSE = 0.26, TAIL = 0.28;

      var cv = document.createElement("canvas"), cx = cv.getContext("2d");
      function wWidth(t, fs) {{ cx.font = "800 " + fs + "px InterLocal"; return cx.measureText(t).width * 1.06; }}
      function lineW(ws, fs) {{ return ws.reduce(function (a, w, i) {{ return a + wWidth(w.t, fs) + (i ? GAP : 0); }}, 0); }}
      function split2(ws, fs) {{
        if (ws.some(function (w) {{ return wWidth(w.t, fs) > BOX; }})) return null;
        if (lineW(ws, fs) <= BOX) return [ws];
        var best = null, bi = Infinity;
        for (var i = 1; i < ws.length; i++) {{
          var A = ws.slice(0, i), B = ws.slice(i), aw = lineW(A, fs), bw = lineW(B, fs);
          if (aw <= BOX && bw <= BOX && Math.abs(aw - bw) < bi) {{ best = [A, B]; bi = Math.abs(aw - bw); }}
        }}
        return best;
      }}
      function fits(ws, fs) {{ return split2(ws, fs) !== null; }}
      function sizeFor(ws) {{ var s = BASE; while (s > MIN && !fits(ws, s)) s -= 2; return s; }}

      var groups = [], cur = [];
      function flush() {{ if (cur.length) {{ groups.push({{ ws: cur.slice(), s: cur[0].s, e: cur[cur.length - 1].e }}); cur = []; }} }}
      WORDS.forEach(function (w, i) {{
        var nx = WORDS[i + 1];
        if (cur.length && cur[0].g !== w.g) flush();
        if (cur.length + 1 > MAXW || !fits(cur.concat([w]), BASE)) flush();
        cur.push(w);
        if (!nx || /[,.!?:]$/.test(w.t) || nx.g !== w.g || cur.length >= MAXW || nx.s - w.e >= PAUSE) flush();
      }});
      flush();

      var stage = document.getElementById("cap-stage");
      groups.forEach(function (g, gi) {{
        var fs = sizeFor(g.ws), lines = split2(g.ws, fs) || [g.ws];
        var ge = document.createElement("div"); ge.className = "cap-group"; ge.id = "cg" + gi;
        var bx = document.createElement("div"); bx.className = "cap-box";
        var k = 0;
        lines.slice(0, 2).forEach(function (ln) {{
          var le = document.createElement("div"); le.className = "cap-line";
          ln.forEach(function (w) {{
            var s = document.createElement("span");
            s.className = "cap-w"; s.id = "cw" + gi + "_" + (k++);
            s.style.fontSize = fs + "px"; s.textContent = w.t;
            le.appendChild(s);
          }});
          bx.appendChild(le);
        }});
        ge.appendChild(bx); stage.appendChild(ge);
      }});

      var tl = gsap.timeline({{ paused: true }});
{chr(10).join("      " + x for x in tw)}

      groups.forEach(function (g, gi) {{
        var nx = groups[gi + 1];
        var vs = g.s, ve = nx ? Math.min(nx.s, g.e + TAIL) : g.e + TAIL;
        if (ve <= vs) ve = vs + 0.05;
        tl.set("#cg" + gi, {{ opacity: 1 }}, vs);
        tl.set("#cg" + gi, {{ opacity: 0 }}, ve);
        var k = 0;
        g.ws.forEach(function (w, wi) {{
          var id = "#cw" + gi + "_" + (k++);
          tl.set(id, {{ color: wi === 0 ? ON : OFF }}, vs);
          if (wi > 0) tl.to(id, {{ color: ON, duration: 0.09, ease: "none" }}, Math.max(vs, w.s - 0.04));
        }});
      }});

      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
'''

open(OUT, "w", encoding="utf-8").write(doc)
print(f"wrote {OUT}")
print(f"TOTAL {TOTAL}s  segments={len(segs)}  caption-words={len(words)}  sfx={len(sfx)}  overlays={len(ov)}")
