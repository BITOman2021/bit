const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + __dirname + '/profile.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  await p.pdf({ path: 'GSW-Company-Profile.pdf', preferCSSPageSize: true, printBackground: true });
  await b.close();
})();
