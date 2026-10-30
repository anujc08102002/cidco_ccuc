from pathlib import Path
p=Path('src/features/account/PersonalizePage.tsx');s=p.read_text(encoding='utf-8').replace('<select value={String(draft[key])}', '<select aria-label={label} value={String(draft[key])}');p.write_text(s,encoding='utf-8')
