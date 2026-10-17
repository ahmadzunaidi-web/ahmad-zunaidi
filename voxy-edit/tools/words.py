import os
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
import json, re, sys

SRC = os.path.join(_ROOT, "transcript", "whisper-medium.json")

def load_words():
    d = json.load(open(SRC, encoding="utf-8"))
    words = []
    for seg in d["transcription"]:
        for tok in seg.get("tokens", []):
            t = tok["text"]
            if t.startswith("[_") or not t.strip():
                continue
            s = tok["offsets"]["from"] / 1000.0
            e = tok["offsets"]["to"] / 1000.0
            if t.startswith(" ") or not words:
                words.append({"text": t.strip(), "start": s, "end": e})
            else:
                words[-1]["text"] += t
                words[-1]["end"] = max(words[-1]["end"], e)
    # drop zero-length artifacts
    return [w for w in words if w["text"]]

# ---- text corrections (ASR fixes confirmed with the user) ----
FIX = [
    (r"\bpowerboat\b",        "power boot"),
    (r"\bPowerboat\b",        "Power boot"),
    (r"\bVauxy\b",            "Voxy"),
    (r"\bVW\s*SZ\b",          "Voxy SZ"),
    (r"\bVW\s*C\b",           "Voxy SZ"),
    (r"\bsekris\b",           "CCRIS"),
    (r"\bKamis\b",            "Khamis"),
    (r"\badd up display\b",   "head-up display"),
    (r"\bAdd up display\b",   "Head-up display"),
    (r"\bone to work kita\b", "orang tua kita"),
    (r"\bstaring\b",          "stereng"),
]

def fix_text(s):
    for pat, rep in FIX:
        s = re.sub(pat, rep, s, flags=re.IGNORECASE if pat.islower() else 0)
    return s

if __name__ == "__main__":
    W = load_words()
    print(f"total words: {len(W)}")
    print(f"span: {W[0]['start']:.2f} -> {W[-1]['end']:.2f}")
    print()
    EDL = [
     (37.10,41.44),(41.46,47.00),(47.00,48.04),(49.94,53.00),(53.60,57.44),
     (57.46,60.80),(60.82,64.00),(65.20,70.50),(72.70,82.66),(82.68,91.80),
     (97.50,102.82),(102.84,110.40),(120.50,127.86),(127.88,139.16),
     (139.18,142.62),(145.46,158.74),(158.76,175.06),(175.08,189.18),
    ]
    print("BOUNDARY AUDIT — does any cut land inside a word?")
    print(f"{'seg':<4}{'edge':<6}{'t':>8}  {'verdict':<22} detail")
    bad = 0
    for i,(s,e) in enumerate(EDL,1):
        for label, t in (("IN", s), ("OUT", e)):
            hit = [w for w in W if w["start"] < t - 0.02 and w["end"] > t + 0.02]
            if hit:
                bad += 1
                w = hit[0]
                print(f"{i:<4}{label:<6}{t:>8.2f}  MID-WORD ✗           '{w['text']}' [{w['start']:.2f}-{w['end']:.2f}]")
            else:
                prev = [w for w in W if w["end"] <= t + 0.02]
                nxt  = [w for w in W if w["start"] >= t - 0.02]
                gap_prev = t - prev[-1]["end"] if prev else 99
                gap_next = nxt[0]["start"] - t if nxt else 99
                print(f"{i:<4}{label:<6}{t:>8.2f}  clean (gap {gap_prev:.2f}/{gap_next:.2f})")
    print()
    print(f"mid-word cuts: {bad}")

def show(a, b):
    W = load_words()
    print(f"--- words {a}-{b} ---")
    for w in W:
        if w["end"] > a and w["start"] < b:
            print(f"  {w['start']:7.2f} {w['end']:7.2f}  {w['text']}")
