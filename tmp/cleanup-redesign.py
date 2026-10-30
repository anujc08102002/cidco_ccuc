from pathlib import Path
p=Path('src/styles.css');s=p.read_text(encoding='utf-8');s=s.replace("@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap');\n",'');p.write_text(s,encoding='utf-8')
p=Path('src/features/auth/SignIn.css');s=p.read_text(encoding='utf-8').replace('background: url("../../assets/cidco-background.png") center center / cover no-repeat;', 'background: #f5f8f8;');p.write_text(s,encoding='utf-8')
p=Path('server/verify-experience.mjs');s=p.read_text(encoding='utf-8');s=s.replace("const {chromium}=createRequire('C:/Users/anujc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json')('playwright');", """const require=createRequire(import.meta.url);
+let chromium;
+try{({chromium}=require('playwright'));}catch{
+ const runtime=process.env.CODEX_PLAYWRIGHT_PACKAGE||`${process.env.USERPROFILE}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json`;
+ ({chromium}=createRequire(runtime)('playwright'));
+}""".replace('\n+','\n'));p.write_text(s,encoding='utf-8')
