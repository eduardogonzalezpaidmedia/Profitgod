#!/usr/bin/env python3
"""Genera data/game/*.json (versión compacta) a partir de los datos verificados de Silver Master.
Uso:  python3 scripts/build-data.py /ruta/a/Albion/data
Origen de los datos: ao-data/ao-bin-dumps (ver meta en cada archivo). No se inventa nada: solo se copian y recortan campos."""
import json, sys, os
src = sys.argv[1] if len(sys.argv) > 1 else '../Albion/data'
out = os.path.join(os.path.dirname(__file__), '..', 'data', 'game')
os.makedirs(out, exist_ok=True)
L = lambda n: json.load(open(os.path.join(src, n + '.json'), encoding='utf-8'))
W = lambda n, o: open(os.path.join(out, n + '.json'), 'w', encoding='utf-8').write(json.dumps(o, ensure_ascii=False, separators=(',', ':')))

items = L('items'); recipes = L('recipes'); mats = L('materials'); cities = L('cities'); stations = L('stations'); settings = L('settings')
meta = {'source': items['meta']['source'], 'generated': items['meta']['generated']}
# items: [id, nombre, tier, encantamiento, categoría, subcategoría, estación]
W('items', {'meta': meta, 'cols': ['id', 'name', 'tier', 'ench', 'cat', 'sub', 'station'],
            'rows': [[i['item_id'], i['name'], i['tier'], i['enchantment'], i['category'], i['subcategory'], i['crafting_station']] for i in items['items']]})
# recetas: [producto, cantidad producida, estación, foco base, [[material, cantidad, retornable], ...]]
W('recipes', {'meta': meta, 'cols': ['product', 'qty', 'station', 'focus', 'mats'],
              'rows': [[r['product_item_id'], r['quantity_produced'], r['crafting_station'], r['focus_base'],
                        [[m['item_id'], m['quantity'], 1 if m.get('returnable', True) else 0] for m in r['materials']]] for r in recipes['recipes']]})
W('materials', {'meta': meta, 'rows': [[m['item_id'], m['name']] for m in mats['materials']]})
W('cities', cities)
W('stations', stations['stations'])
W('settings', {k: settings[k] for k in ('taxes', 'return_rate', 'focus', 'crafting_fee')})
print({n: os.path.getsize(os.path.join(out, n)) for n in os.listdir(out)})
