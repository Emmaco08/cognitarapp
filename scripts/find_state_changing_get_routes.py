import glob
import re

for fpath in glob.glob('cognitara/routes/**/*.py', recursive=True):
    with open(fpath, 'r', encoding='utf-8') as f:
        content = f.read()
    pattern = r'@[\w\.]+\.route\((["\'][^"\']+["\'])(?:,\s*methods=\[([^\]]+)\])?\)'
    for match in re.finditer(pattern, content):
        path_str = match.group(1).strip('"\'')
        methods_str = match.group(2)
        if any(action in path_str for action in ['delete', 'toggle', 'reset', 'approve', 'reject', 'promote']):
            if not methods_str or ('POST' not in methods_str):
                print(f"{fpath}: {path_str} -> Methods: {methods_str or 'GET (default)'}")
