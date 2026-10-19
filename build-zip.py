#!/usr/bin/env python3
"""Build wa-agent-complete.zip (source + docs, no node_modules/data/secrets)."""
import os, sys, zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "wa-agent-complete.zip")
TOP = "wa-agent-complete"
SKIP_DIRS = {"node_modules", "data", ".git", "__pycache__"}
SKIP_FILES = {".env"}
SKIP_SUFFIX = (".db", ".db-wal", ".db-shm", ".png", ".zip")

def add_tree(z, rel):
    base = os.path.join(ROOT, rel)
    for d, dirs, files in os.walk(base):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
        for f in sorted(files):
            if f in SKIP_FILES or f.endswith(SKIP_SUFFIX):
                continue
            full = os.path.join(d, f)
            z.write(full, os.path.join(TOP, os.path.relpath(full, ROOT)))

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(ROOT, "ZIP-README.md"), os.path.join(TOP, "README.md"))
    z.write(os.path.join(ROOT, "build-zip.py"), os.path.join(TOP, "build-zip.py"))
    z.write(os.path.join(ROOT, "respondio-ai-agent-rebuild-blueprint.md"), os.path.join(TOP, "docs", "respondio-ai-agent-rebuild-blueprint.md"))
    z.write(os.path.join(ROOT, "docs", "REBUILD-GUIDE.md"), os.path.join(TOP, "docs", "REBUILD-GUIDE.md"))
    add_tree(z, "wa-agent")
    add_tree(z, "scripts")
print(f"wrote {OUT} ({os.path.getsize(OUT)//1024} KB)")
