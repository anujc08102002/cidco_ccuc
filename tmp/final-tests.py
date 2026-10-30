from pathlib import Path
p=Path('src/components/navigation.ts');s=p.read_text(encoding='utf-8').replace('Object.hasOwn(pageHelp,path)','Object.prototype.hasOwnProperty.call(pageHelp,path)');p.write_text(s,encoding='utf-8')
p=Path('server/verify-experience.mjs');s=p.read_text(encoding='utf-8')
s=s.replace("await page.keyboard.press('Alt+Shift+d');await page.getByRole('button',{name:'Switch to dark theme'})", """await page.keyboard.press('Alt+Shift+d');await page.keyboard.press('n');await page.getByRole('dialog').waitFor();check(await page.getByRole('dialog').count()===1,'New case keyboard shortcut');await page.keyboard.press('Escape');await page.getByRole('button',{name:'Switch to dark theme'})""")
s=s.replace("check(await page.getByRole('navigation',{name:'Department navigation'}).isVisible(),'Mobile menu');await page.keyboard.press('Escape');", """check(await page.getByRole('navigation',{name:'Department navigation'}).isVisible(),'Mobile menu');await page.keyboard.press('Escape');check(await page.locator('aside[inert]').count()===1,'Hidden mobile navigation is not focusable');""")
s=s.replace("role='legal';await page.goto", "role='legal';await page.goto")
p.write_text(s,encoding='utf-8')
p=Path('package.json');s=p.read_text(encoding='utf-8').replace('server/admin-deletion.test.js"','server/admin-deletion.test.js server/site-report.test.js server/site-report-routes.test.js"').replace('"test:ui":', '"test:experience": "node server/verify-experience.mjs",\n    "test:ui":');p.write_text(s,encoding='utf-8')
