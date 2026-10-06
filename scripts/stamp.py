#!/usr/bin/env python3
"""Pone la versión en cada import de módulo, en los .json del juego y en index.html / sw.js.
Sin esto, GitHub Pages (caché de ~10 min) puede mezclar módulos nuevos con viejos justo después de publicar.
Uso: python3 scripts/stamp.py 0.7"""
import re, sys, pathlib
ver = sys.argv[1]; root = pathlib.Path(__file__).resolve().parent.parent
dirs = ['dashboard', 'data', 'flipping', 'black-market', 'crafting', 'profit-engine', 'refining', 'settings', 'markets', 'opportunity-engine', 'history']
imp = re.compile(r"(from\s+'(?:\.{1,2}/)[^'?]+?\.js)(\?v=[\d.]+)?'")
for d in dirs:
    for f in (root / d).glob('*.js'):
        s = f.read_text(); n = imp.sub(lambda m: m.group(1) + '?v=' + ver + "'", s); n = re.sub(r"\.json\?v=[\d.]+", ".json?v=" + ver, n)
        if n != s: f.write_text(n)
ix = root / 'index.html'; s = ix.read_text(); s = re.sub(r'(styles\.css|app\.js)\?v=[\d.]+', r'\1?v=' + ver, s); s = re.sub(r'>v[\d.]+</span>', '>v' + ver + '</span>', s); ix.write_text(s)
sw = root / 'sw.js'; s = sw.read_text(); s = re.sub(r"profitgod-[\d.]+", 'profitgod-' + ver, s); sw.write_text(s)
print('versión', ver)
