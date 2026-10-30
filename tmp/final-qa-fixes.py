from pathlib import Path
p=Path('server/verify-experience.mjs');s=p.read_text(encoding='utf-8').replace("await page.goto('http://127.0.0.1:5194/#/settings');await", "await page.goto('http://127.0.0.1:5194/#/settings');await page.reload();await");p.write_text(s,encoding='utf-8')
p=Path('server/site-report.js');s=p.read_text(encoding='utf-8').replace(" const bold=await pdf.embedFont(StandardFonts.HelveticaBold),ink=", " const boldBytes=await readFile('C:/Windows/Fonts/arialbd.ttf').catch(()=>null);\n const bold=boldBytes?await pdf.embedFont(boldBytes,{subset:true}):font,ink=")
p.write_text(s,encoding='utf-8')
p=Path('src/components/navigation.ts');s=p.read_text(encoding='utf-8').replace('path in pageHelp', 'Object.hasOwn(pageHelp,path)');p.write_text(s,encoding='utf-8')
