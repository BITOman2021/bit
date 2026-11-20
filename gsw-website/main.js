// GSW — Phase 1–2 interactions (no 3D yet)
(() => {
  'use strict';
  document.documentElement.classList.add('js');

  const WHATSAPP = '96895087873';               // confirm in brief.md (needs confirmation)
  const EMAIL = 'snow.wing.oman@gmail.com';

  // Mobile nav
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('nav');
  const setNav = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
    nav.classList.toggle('open', open);
  };
  toggle.addEventListener('click', () => setNav(toggle.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) { setNav(false); toggle.focus(); }
  });

  // Reveal on scroll
  const items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    items.forEach((el) => io.observe(el));
  } else {
    items.forEach((el) => el.classList.add('in'));
  }

  // Quote form → prefilled WhatsApp / email message (nothing is stored or sent by the site)
  const form = document.getElementById('quote-form');
  const err = document.getElementById('form-error');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(form));
    const name = (d.name || '').trim();
    const missing = [];
    if (!name) missing.push(form.elements.name);
    if (!d.service) missing.push(form.elements.service);
    [form.elements.name, form.elements.service].forEach((f) => f.removeAttribute('aria-invalid'));
    if (missing.length) {
      missing.forEach((f) => f.setAttribute('aria-invalid', 'true'));
      err.hidden = false;
      missing[0].focus();
      return;
    }
    err.hidden = true;
    const lines = [
      'طلب عرض سعر — الجناح الثلجي العالمية',
      `الاسم: ${name}`,
      `الخدمة: ${d.service}`,
      d.location && d.location.trim() ? `الموقع: ${d.location.trim()}` : '',
      d.details && d.details.trim() ? `التفاصيل: ${d.details.trim()}` : '',
    ].filter(Boolean).join('\n');
    const channel = e.submitter && e.submitter.dataset.channel;
    const url = channel === 'email'
      ? `mailto:${EMAIL}?subject=${encodeURIComponent('طلب عرض سعر — ' + d.service)}&body=${encodeURIComponent(lines)}`
      : `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(lines)}`;
    if (channel === 'email') window.location.href = url;
    else window.open(url, '_blank', 'noopener');
  });

  // Footer year
  document.getElementById('year').textContent = new Date().getFullYear();
})();
