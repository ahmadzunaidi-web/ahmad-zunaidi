import os
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
import sys
sys.path.insert(0, _HERE)
from words import load_words, fix_text

# (src_in, src_out, item_no or None, label)
EDL = [
 (37.10, 41.44, None, "HOOK"),
 (41.46, 48.04, None, "SETUP"),
 (49.94, 52.49, 1, "Power boot"),
 (53.60, 57.44, 2, "Blind spot monitor"),
 (57.46, 60.80, 2, "Blind spot (optional)"),
 (60.82, 65.20, 2, "Blind spot (owner)"),
 (66.20, 70.34, 3, "Side step"),
 (72.70, 82.66, 4, "Leg rest"),
 (82.68, 91.80, 4, "Seat heater"),
 (97.50,102.82, 5, "Digital inner mirror"),
 (102.84,110.40, 6, "360 camera"),
 (120.06,127.86, 7, "Infrared camera"),
 (127.88,139.16, 8, "Head-up display"),
 (139.18,140.66, 8, "HUD verdict"),
 (145.46,158.74, None, "RECAP"),
 (158.76,175.06, 9, "Lampu LED"),
 (175.08,189.18, None, "HARGA + CTA"),
]

W = load_words()

def seg_words(a, b):
    return [w for w in W if w["end"] > a + 0.02 and w["start"] < b - 0.02]

if __name__ == "__main__":
    t = 0.0
    bad = 0
    print(f"{'#':<3}{'SRC IN':>8}{'SRC OUT':>9}{'DUR':>7}{'TL IN':>8}  ITEM  TEXT")
    print("-"*118)
    for i,(a,b,n,lab) in enumerate(EDL,1):
        for t_edge in (a,b):
            if [w for w in W if w["start"] < t_edge-0.02 and w["end"] > t_edge+0.02]:
                bad += 1
                print(f"   !! MID-WORD at {t_edge}")
        txt = fix_text(" ".join(w["text"] for w in seg_words(a,b)))
        if len(txt) > 74: txt = txt[:71] + "..."
        item = f"#{n}" if n else "--"
        print(f"{i:<3}{a:>8.2f}{b:>9.2f}{b-a:>7.2f}{t:>8.2f}  {item:<5} {txt}")
        t += b - a
    print("-"*118)
    print(f"mid-word cuts: {bad}")
    print(f"ASAL 190.13s  ->  BARU {t:.2f}s  ({int(t//60)}m {t%60:.1f}s)   dipotong {190.13-t:.1f}s ({(190.13-t)/190.13*100:.0f}%)")
