import glob
import re

cdn_links = set()
for fpath in glob.glob('templates/**/*.html', recursive=True):
    with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    urls = re.findall(r'(https?://[^\s"\'<>]+)', content)
    for u in urls:
        if 'w3.org' not in u:
            cdn_links.add((fpath, u))

print(f'Total external URL occurrences: {len(cdn_links)}')
for fpath, u in sorted(cdn_links):
    print(f'{fpath}: {u}')
