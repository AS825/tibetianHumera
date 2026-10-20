// Sanftes Einblenden
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
  });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.transitionDelay = `${(i % 4) * 80}ms`;
  io.observe(el);
});

// Topbar-Schatten + aktiver Tab (nur auf der Startseite)
const topbar = document.querySelector('.topbar');
const tabs = [...document.querySelectorAll('.tabbar a[href^="#"]')];
const topLinks = [...document.querySelectorAll('.topnav a[href^="#"]')];
const sections = tabs.map((t) => document.querySelector(t.getAttribute('href')));
const topSections = topLinks.map((a) => document.querySelector(a.getAttribute('href')));
const onScroll = () => {
  topbar.classList.toggle('scrolled', scrollY > 8);
  if (!tabs.length) return;
  let current = 0;
  sections.forEach((s, i) => { if (s.getBoundingClientRect().top < innerHeight * 0.4) current = i; });
  tabs.forEach((t, i) => t.classList.toggle('active', i === current));
  let top = -1;
  topSections.forEach((sec, i) => { if (sec && sec.getBoundingClientRect().top < innerHeight * 0.4) top = i; });
  topLinks.forEach((a, i) => a.classList.toggle('active', i === top));
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// Atemübung: 4 s ein, 4 s aus, 4 Runden
const breathe = document.getElementById('breathe');
const label = document.getElementById('breatheLabel');
let breathTimer = null;
breathe?.addEventListener('click', () => {
  if (breathTimer) {
    clearInterval(breathTimer); breathTimer = null;
    breathe.classList.remove('in'); label.textContent = 'Tippen';
    return;
  }
  let step = 0;
  const tick = () => {
    if (step >= 8) { clearInterval(breathTimer); breathTimer = null; label.textContent = 'Schön.'; return; }
    const inhale = step % 2 === 0;
    breathe.classList.toggle('in', inhale);
    label.textContent = inhale ? 'Einatmen' : 'Ausatmen';
    if (navigator.vibrate) navigator.vibrate(20);
    step++;
  };
  tick();
  breathTimer = setInterval(tick, 4000);
});

// PWA: Installieren
let deferredPrompt;
const installBtn = document.getElementById('installBtn');
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); deferredPrompt = e; if (installBtn) installBtn.hidden = false;
});
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null; installBtn.hidden = true;
});

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
  // Übernimmt eine neue Version der App die Seite, einmal neu laden, damit alles zusammenpasst
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
}

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();
