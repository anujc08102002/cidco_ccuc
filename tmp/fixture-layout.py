from pathlib import Path
p=Path('server/site-report.test.js');s=p.read_text(encoding='utf-8').replace("original.addPage().drawText('TEST ORIGINAL ORDER - NOT AN OFFICIAL INSTRUMENT');", "original.addPage().drawText('TEST ORIGINAL ORDER - NOT AN OFFICIAL INSTRUMENT',{x:48,y:760,size:12});");p.write_text(s,encoding='utf-8')
