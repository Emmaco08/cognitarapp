import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from app import app

routes = []
routes_by_bp = {}

for rule in app.url_map.iter_rules():
    methods = sorted(list(rule.methods - {'HEAD', 'OPTIONS'}))
    endpoint = rule.endpoint
    bp = endpoint.split('.')[0] if '.' in endpoint else 'global'
    entry = {
        'rule': str(rule),
        'endpoint': endpoint,
        'methods': methods,
        'blueprint': bp
    }
    routes.append(entry)
    routes_by_bp.setdefault(bp, []).append(entry)

routes.sort(key=lambda r: (r['rule'], r['endpoint']))
print(f'Total registered rules: {len(routes)}')
print('-' * 45)
for bp, rlist in sorted(routes_by_bp.items()):
    print(f'  {bp:<20}: {len(rlist):>3} routes')
print('-' * 45)

if '--save' in sys.argv:
    with open('scripts/routes_current.json', 'w', encoding='utf-8') as out:
        json.dump(routes, out, indent=2)
    print('Saved current routes to scripts/routes_current.json')
