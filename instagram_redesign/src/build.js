// Builds the Y&B Instagram identity kit as PNGs. Run: node src/build.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const FONTS = path.join(ROOT, 'fonts');

const C = { blue: '#1F2766', deep: '#1B1F23', yellow: '#E2BB6A', cream: '#F3E3B5', white: '#F6F1E4', ink: '#14171B' };
const GOLD = 'linear-gradient(135deg,#F3D58A,#D4AF5F 45%,#A57743)';
const MARK = `file://${ROOT}/logo/mark.png`;
const gtxt = `background:${GOLD};-webkit-background-clip:text;background-clip:text;color:transparent;`;

const css = `
@font-face{font-family:'CairoAr';font-weight:600;src:url('file://${FONTS}/cairo-arabic-600-normal.woff2')}
@font-face{font-family:'CairoAr';font-weight:800;src:url('file://${FONTS}/cairo-arabic-800-normal.woff2')}
@font-face{font-family:'CairoLa';font-weight:600;src:url('file://${FONTS}/cairo-latin-600-normal.woff2')}
@font-face{font-family:'CairoLa';font-weight:800;src:url('file://${FONTS}/cairo-latin-800-normal.woff2')}
*{margin:0;padding:0;box-sizing:border-box}
html,body{font-family:'CairoLa','CairoAr',sans-serif;font-weight:600}
.rtl{direction:rtl}
`;

const ICONS = {
  services: '<path d="M12 2 2 7l10 5 10-5-10-5zM2 12l10 5 10-5M2 17l10 5 10-5"/>',
  works: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  gift: '<rect x="3" y="8" width="18" height="4"/><path d="M12 8v13M19 12v9H5v-9M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  steps: '<path d="M9 6h12M9 12h12M9 18h12M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  brand: '<path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7L12 17.6 5.7 21.3l1.6-7L2 9.6 9 9z"/>',
  video: '<rect x="2" y="5" width="14" height="14" rx="2"/><path d="M22 8l-6 4 6 4z"/>',
  social: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/>',
  ads: '<path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 8a5 5 0 0 1 0 8"/>',
  print: '<rect x="3" y="3" width="18" height="14" rx="1"/><path d="M8 21h8M12 17v4"/>',
};
const icon = (n, size, color, sw = 1.6) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;

const mono = (size) => `<span style="font-weight:800;font-size:${size}px;line-height:1;letter-spacing:-${size * 0.02}px">
  <span style="color:${C.yellow}">Y</span><span style="color:${C.white};font-size:${size * 0.62}px;margin:0 ${size * 0.03}px">&amp;</span><span style="color:${C.white}">B</span></span>`;

const page = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body style="width:${w}px;height:${h}px;overflow:hidden">${body}</body></html>`;

const assets = {};

// 1) Avatar 1080x1080 (circle-safe)
assets['01_avatar'] = { w: 1080, h: 1080, html: page(1080, 1080, `
<div style="width:1080px;height:1080px;background:${C.deep};display:flex;align-items:center;justify-content:center;position:relative">
  <div style="position:absolute;width:800px;height:800px;border-radius:50%;padding:6px;background:${GOLD}"><div style="width:100%;height:100%;border-radius:50%;background:${C.deep}"></div></div>
  <img src="${MARK}" style="position:relative;width:600px">
</div>`) };

// 2) Highlight covers 1080x1920
const hl = [['02_hl_services', 'services'], ['03_hl_works', 'works'], ['04_hl_consult', 'gift'], ['05_hl_process', 'steps'], ['06_hl_contact', 'phone']];
for (const [name, ic] of hl) {
  assets[name] = { w: 1080, h: 1920, html: page(1080, 1920, `
<div style="width:1080px;height:1920px;background:${C.deep};display:flex;align-items:center;justify-content:center">
  <div style="width:640px;height:640px;border-radius:50%;padding:8px;background:${GOLD}">
    <div style="width:100%;height:100%;border-radius:50%;background:${C.blue};display:flex;align-items:center;justify-content:center">${icon(ic, 330, '#E8C271', 1.4)}</div>
  </div>
</div>`) };
}

// 3) Posts 1080x1350 (4:5)
const footer = `<div style="position:absolute;bottom:60px;left:72px;right:72px;display:flex;justify-content:space-between;align-items:center;direction:ltr">
  <div style="font-size:30px;font-weight:600;color:${C.white};opacity:.7">@yellow.blue.om</div>
  <div style="width:150px;height:6px;background:${GOLD};border-radius:3px"></div>
</div>`;

assets['07_pin1_intro'] = { w: 1080, h: 1350, html: page(1080, 1350, `
<div class="rtl" style="width:1080px;height:1350px;background:radial-gradient(circle at 70% 25%,#262B33 0%,${C.deep} 60%);position:relative;overflow:hidden">
  <div style="position:absolute;right:72px;top:90px;font-size:28px;font-weight:600;color:${C.yellow};letter-spacing:6px;direction:ltr">YELLOW &amp; BLUE ADVERTISING</div>
  <div style="position:absolute;right:72px;left:72px;top:250px;font-weight:800;font-size:172px;line-height:1.15;${gtxt}">فكرتك<br>تستحق<br>أن تُرى</div>
  <div style="position:absolute;right:72px;top:830px;font-size:42px;color:${C.white};font-weight:600">دعاية وإعلان • مسقط، عُمان</div>
  <img src="${MARK}" style="position:absolute;left:96px;bottom:130px;width:430px">
  ${footer}
</div>`) };

const services = [['brand', 'الهوية البصرية والشعارات'], ['social', 'تصميم السوشيال ميديا'], ['video', 'فيديو وموشن جرافيك'], ['steps', 'إدارة حسابات التواصل'], ['ads', 'الإعلانات الممولة'], ['print', 'المطبوعات واللوحات']];
assets['08_pin2_offer'] = { w: 1080, h: 1350, html: page(1080, 1350, `
<div class="rtl" style="width:1080px;height:1350px;background:radial-gradient(circle at 20% 0%,#262B33 0%,${C.deep} 60%);position:relative">
  <div style="position:absolute;right:72px;left:72px;top:90px;font-weight:800;font-size:78px;line-height:1.25;color:${C.white}">كل اللي يحتاجه مشروعك<br><span style="${gtxt}">تحت سقف واحد</span></div>
  <div style="position:absolute;right:72px;left:72px;top:380px;display:grid;grid-template-columns:1fr 1fr;gap:26px">
    ${services.map(([ic, t]) => `<div style="background:linear-gradient(160deg,#252E7A,${C.blue});border:2px solid rgba(226,187,106,.55);border-radius:28px;padding:28px 30px;display:flex;flex-direction:column;gap:16px;min-height:190px">
      ${icon(ic, 66, '#E8C271', 1.6)}<div style="font-size:38px;font-weight:800;color:${C.white};line-height:1.25">${t}</div></div>`).join('')}
  </div>
  <div style="position:absolute;right:72px;left:72px;bottom:150px;background:${GOLD};border-radius:30px;padding:30px 40px;display:flex;justify-content:space-between;align-items:center">
    <div style="font-size:44px;font-weight:800;color:${C.ink}">استشارة تسويقية مجانية</div>
    <div style="font-size:40px;font-weight:800;color:${C.ink};direction:ltr">76761808</div>
  </div>
  ${footer}
</div>`) };

// 4) Profile mockup
const filler = (i) => `<div style="aspect-ratio:3/4;background:${C.deep};display:flex;align-items:center;justify-content:center"><img src="${MARK}" style="width:62%;opacity:.9"></div>`;
const hlLabels = [['services', 'الخدمات'], ['works', 'أعمالنا'], ['gift', 'استشارة مجانية'], ['steps', 'كيف نشتغل'], ['phone', 'تواصل']];
const avatarSvg = `<div style="width:210px;height:210px;border-radius:50%;padding:4px;background:${GOLD}"><div style="width:100%;height:100%;border-radius:50%;background:${C.deep};display:flex;align-items:center;justify-content:center"><img src="${MARK}" style="width:76%"></div></div>`;
assets['10_profile_preview'] = { w: 1080, h: 2200, html: page(1080, 2200, `
<div style="width:1080px;height:2200px;background:#fff;color:#111;position:relative">
  <div style="padding:70px 56px 0;display:flex;align-items:center;gap:56px;direction:ltr">
    ${avatarSvg}
    <div style="display:flex;gap:56px;flex:1;justify-content:space-around;text-align:center">
      <div><div style="font-weight:800;font-size:46px">42</div><div style="font-size:30px;color:#555">posts</div></div>
      <div><div style="font-weight:800;font-size:46px">247</div><div style="font-size:30px;color:#555">followers</div></div>
      <div><div style="font-weight:800;font-size:46px">–</div><div style="font-size:30px;color:#555">following</div></div>
    </div>
  </div>
  <div class="rtl" style="padding:34px 56px 0">
    <div style="font-weight:800;font-size:42px">Y&amp;B | دعاية وإعلان مسقط</div>
    <div style="font-size:28px;color:#666;margin-top:6px">Advertising/Marketing</div>
    <div style="font-size:36px;line-height:1.6;margin-top:18px;font-weight:600">لأصحاب المشاريع في عُمان: نحوّل فكرتك لعلامة تِنشاف<br>هوية بصرية • ريلز • إعلانات ممولة • إدارة حسابات<br>🎁 استشارة تسويقية مجانية: واتساب 76761808</div>
    <div style="font-size:34px;color:#0A5FB4;margin-top:12px;direction:ltr;text-align:right;font-weight:600">wa.me/96876761808</div>
  </div>
  <div style="padding:30px 56px 0;display:flex;gap:18px;direction:ltr">
    <div style="flex:1;background:${C.blue};color:#fff;border-radius:16px;padding:20px;text-align:center;font-size:32px;font-weight:800">Follow</div>
    <div style="flex:1;background:#EFEFEF;border-radius:16px;padding:20px;text-align:center;font-size:32px;font-weight:800">Message</div>
    <div style="flex:1;background:#EFEFEF;border-radius:16px;padding:20px;text-align:center;font-size:32px;font-weight:800">Contact</div>
  </div>
  <div style="padding:44px 40px 0;display:flex;justify-content:space-between;direction:rtl">
    ${hlLabels.map(([ic, t]) => `<div style="width:176px;text-align:center">
      <div style="width:150px;height:150px;border-radius:50%;margin:0 auto;padding:4px;background:${GOLD}"><div style="width:100%;height:100%;border-radius:50%;background:${C.blue};display:flex;align-items:center;justify-content:center">${icon(ic, 76, '#E8C271', 1.7)}</div></div>
      <div style="font-size:26px;margin-top:12px;font-weight:600">${t}</div></div>`).join('')}
  </div>
  <div style="margin-top:44px;border-top:2px solid #ddd"></div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin-top:4px">
    <div style="aspect-ratio:3/4;overflow:hidden"><img src="file://${OUT}/07_pin1_intro.png" style="width:100%;height:100%;object-fit:cover"></div>
    <div style="aspect-ratio:3/4;overflow:hidden"><img src="file://${OUT}/08_pin2_offer.png" style="width:100%;height:100%;object-fit:cover"></div>
    ${[0, 1, 2, 3, 4, 5, 6].map(filler).join('')}
  </div>
</div>`) };

// 5) Stories 1080x1920 (UI-safe: nothing in top 250px / bottom 340px)
const storyShell = (label, title, body, ic) => page(1080, 1920, `
<div class="rtl" style="width:1080px;height:1920px;background:${C.deep};position:relative;overflow:hidden">
  <div style="position:absolute;right:-250px;bottom:-250px;width:900px;height:900px;border-radius:50%;background:${C.blue};opacity:.35"></div>
  <div style="position:absolute;right:80px;top:270px;display:flex;align-items:center;gap:22px">
    <div style="width:92px;height:92px;border-radius:50%;padding:4px;background:${GOLD}"><div style="width:100%;height:100%;border-radius:50%;background:${C.blue};display:flex;align-items:center;justify-content:center">${icon(ic, 50, '#E8C271', 1.7)}</div></div>
    <div style="font-size:40px;font-weight:800;${gtxt}">${label}</div>
  </div>
  <div style="position:absolute;right:80px;left:80px;top:420px;font-weight:800;font-size:80px;line-height:1.25;color:${C.white}">${title}</div>
  <div style="position:absolute;right:80px;left:80px;top:690px">${body}</div>
  <img src="${MARK}" style="position:absolute;left:60px;top:240px;width:190px;opacity:.95">
  <div style="position:absolute;right:80px;bottom:262px;font-size:32px;font-weight:600;color:${C.white};opacity:.75;direction:ltr">@yellow.blue.om</div>
</div>`);

const row = (t, sub) => `<div style="background:linear-gradient(160deg,#252E7A,${C.blue});border:2px solid rgba(226,187,106,.5);border-radius:28px;padding:24px 36px;margin-bottom:20px">
  <div style="font-size:42px;font-weight:800;color:${C.white}">${t}</div>${sub ? `<div style="font-size:30px;margin-top:6px;color:${C.cream};opacity:.85">${sub}</div>` : ''}</div>`;
const cta = (t, n) => `<div style="background:${GOLD};border-radius:30px;padding:32px 40px;margin-top:34px;display:flex;justify-content:space-between;align-items:center">
  <div style="font-size:44px;font-weight:800;color:${C.ink}">${t}</div><div style="font-size:42px;font-weight:800;color:${C.ink};direction:ltr">${n}</div></div>`;

assets['11_story_services'] = { w: 1080, h: 1920, html: storyShell('الخدمات', 'كل اللي يحتاجه مشروعك<br><span style="' + gtxt + '">تحت سقف واحد</span>',
  row('الهوية البصرية والشعارات') + row('تصميم السوشيال ميديا') + row('فيديو وموشن جرافيك') + row('إدارة حسابات التواصل') + row('الإعلانات الممولة') + row('المطبوعات واللوحات الإعلانية'), 'services') };
assets['12_story_works'] = { w: 1080, h: 1920, html: storyShell('أعمالنا', 'من الفكرة<br><span style="' + gtxt + '">إلى علامة تُرى</span>',
  row('الجناح الثلجي العالمية', 'Global Snow Wing International') + row('تصميم المحتوى: Yellow & Blue') + `<div style="font-size:36px;font-weight:600;color:${C.white};opacity:.8;margin-top:28px">شاهد المنشور في الملف ←</div>`, 'works') };
assets['13_story_consult'] = { w: 1080, h: 1920, html: storyShell('استشارة مجانية', 'حساباتك ما تجيب نتيجة؟<br><span style="' + gtxt + '">لا تحاتي</span>',
  row('نحلل هويتك وحساباتك') + row('أفكار محتوى جاهزة') + row('خطة إعلانات تناسب ميزانيتك') + cta('احجز على الواتساب', '76761808'), 'gift') };
assets['14_story_process'] = { w: 1080, h: 1920, html: storyShell('كيف نشتغل', 'من الفكرة<br><span style="' + gtxt + '">إلى قياس النتيجة</span>',
  row('1. الفكرة', 'نفهم مشروعك وجمهورك') + row('2. التصميم', 'هوية وتصاميم وفيديو') + row('3. النشر', 'سوشيال وإعلانات ممولة') + row('4. قياس النتائج', 'تقارير أداء واضحة'), 'steps') };
assets['15_story_contact'] = { w: 1080, h: 1920, html: storyShell('تواصل', 'فكرتك<br><span style="' + gtxt + '">تستحق أن تُرى</span>',
  row('واتساب', '<span style="direction:ltr;display:inline-block">+968 76761808</span>') + row('البريد الإلكتروني', '<span style="direction:ltr;display:inline-block">Yellow.blue.om@gmail.com</span>') + row('الموقع', 'مسقط، سلطنة عُمان'), 'phone') };

// 6) Reel cover 1080x1920. Key content stays inside the central 1080x1080 square (y 420-1500),
// which survives the 3:4 grid crop and the 1:1 profile preview crop.
assets['16_reel_cover_logo_mistakes'] = { w: 1080, h: 1920, html: page(1080, 1920, `
<div class="rtl" style="width:1080px;height:1920px;background:${C.deep};position:relative;overflow:hidden">
  <div style="position:absolute;left:50%;top:1180px;width:1100px;height:1100px;margin:-550px 0 0 -550px;border-radius:50%;background:radial-gradient(circle,rgba(31,39,102,.75) 0%,rgba(31,39,102,0) 62%)"></div>
  <img src="${MARK}" style="position:absolute;left:50%;top:480px;width:200px;margin-left:-100px">
  <div style="position:absolute;left:0;right:0;top:660px;text-align:center;font-family:'CairoLa';font-weight:800;font-size:430px;line-height:1;${gtxt}">3</div>
  <div style="position:absolute;left:0;right:0;top:1130px;text-align:center;font-weight:800;font-size:108px;line-height:1.15;color:${C.white}">أخطاء تضعّف<br>شعارك</div>
  <div style="position:absolute;left:0;right:0;top:1420px;text-align:center"><span style="display:inline-block;width:170px;height:6px;border-radius:3px;background:${GOLD}"></span></div>
</div>`) };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const order = Object.keys(assets).sort();
  for (const name of order) {
    const { w, h, html } = assets[name];
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const f = path.join(OUT, `.${name}.html`);
    fs.writeFileSync(f, html);
    await p.goto('file://' + f);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, `${name}.png`) });
    fs.unlinkSync(f);
    await ctx.close();
    console.log('built', name);
  }
  await browser.close();
})();
