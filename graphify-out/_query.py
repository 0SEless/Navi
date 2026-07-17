import json
from pathlib import Path
g = json.loads(Path('C:/Users/Administrator/Desktop/CODEme/Navi/navi-next/graphify-out/graph.json').read_text())
nodes = g.get('nodes', [])
edges = g.get('edges', [])
print(f'Graph: {len(nodes)} nodes, {len(edges)} edges')
for n in nodes:
    nid = n.get('id', '')
    if any(kw in nid.lower() for kw in ['valid', 'publish', 'graph-valid', 'compile']):
        print(f'  Node: {nid}')
