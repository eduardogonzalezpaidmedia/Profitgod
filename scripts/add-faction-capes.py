#!/usr/bin/env python3
"""Agrega las capas de ciudad y de facción (Fort Sterling, Lymhurst, Martlock, Thetford, Bridgewatch, Caerleon, smuggler, heretic,
undead, keeper, morgana, demon) que faltaban en data/game/*.json. Origen: ao-data/ao-bin-dumps (items.json + formatted/items.json).
Uso: python3 scripts/add-faction-capes.py /ruta/items.json /ruta/formatted_items.json
Mismo formato de receta que las capas de Brecilien: capa base (con su encantamiento) + insignia (_BP) + ficha de facción, sin retorno de recursos.
No inventa nada: solo copia ids, nombres y requisitos del dump. Es idempotente (no duplica filas existentes)."""
import json, sys, os
dump, fmt = sys.argv[1], sys.argv[2]
G = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'game')
R = lambda n: json.load(open(os.path.join(G, n + '.json'), encoding='utf-8'))
W = lambda n, o: open(os.path.join(G, n + '.json'), 'w', encoding='utf-8').write(json.dumps(o, ensure_ascii=False, separators=(',', ':')))
items, recipes, mats = R('items'), R('recipes'), R('materials')
have, haveR, haveM = {r[0] for r in items['rows']}, {r[0] for r in recipes['rows']}, {r[0] for r in mats['rows']}
names = {x['UniqueName']: ((x.get('LocalizedNames') or {}).get('ES-ES') or (x.get('LocalizedNames') or {}).get('EN-US')) for x in json.load(open(fmt, encoding='utf-8'))}
eq = json.load(open(dump, encoding='utf-8'))['items']['equipmentitem']
lst = lambda v: v if isinstance(v, list) else ([v] if v else [])
addI = addR = addM = 0
def res_id(rs, lvl):
    uid = rs['@uniquename']; l = rs.get('@enchantmentlevel')
    return uid + '@' + l if l and l != '0' else uid
for it in eq:
    sub = it.get('@shopsubcategory1') or ''
    if it.get('@shopcategory') != 'capes' or not sub.startswith('accessoires_capes_'): continue
    base = it['@uniquename']; tier = int(it['@tier']); name = names.get(base)
    if not name: print('sin nombre:', base); continue
    variants = [(0, it.get('craftingrequirements'))] + [(int(e['@enchantmentlevel']), e.get('craftingrequirements')) for e in lst((it.get('enchantments') or {}).get('enchantment'))]
    for lvl, cr in variants:
        iid = base + ('@%d' % lvl if lvl else '')
        if iid not in have: items['rows'].append([iid, name, tier, lvl, 'capes', sub, None]); have.add(iid); addI += 1
        if cr and iid not in haveR:
            rs = lst(cr.get('craftresource')); recipes['rows'].append([iid, 1, None, 0, [[res_id(r, lvl), int(r['@count']), 0 if r.get('@maxreturnamount') == '0' else 1] for r in rs]]); haveR.add(iid); addR += 1
            for r in rs:
                u = r['@uniquename']
                if u not in haveM and (u.endswith('_BP') or 'TOKEN' in u or 'QUESTITEM' in u) and names.get(u): mats['rows'].append([u, names[u]]); haveM.add(u); addM += 1
W('items', items); W('recipes', recipes); W('materials', mats)
print({'items': addI, 'recetas': addR, 'materiales': addM})
