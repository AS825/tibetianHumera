// "mehr lesen" bei den Massage-Arten: Detailfenster (Handy: von unten, Desktop: mittig)
const sheet = document.getElementById('artSheet');
const content = document.getElementById('sheetContent');
const sheetImg = document.getElementById('sheetImg');

document.querySelectorAll('.art__more').forEach((btn) => {
  btn.addEventListener('click', () => {
    const art = btn.closest('.art');
    const tpl = document.getElementById(`art-${btn.dataset.art}`);
    content.replaceChildren(tpl.content.cloneNode(true));
    content.querySelector('h3').id = 'sheetTitle';
    const img = art.querySelector('img');
    sheetImg.src = img.currentSrc || img.src;
    sheetImg.alt = img.alt;
    sheet.showModal();
    sheet.scrollTop = 0;
  });
});

const close = () => {
  // Ohne Animationen (reduzierte Bewegung) sofort schließen
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { sheet.close(); return; }
  sheet.classList.add('closing');
  sheet.addEventListener('animationend', () => { sheet.classList.remove('closing'); sheet.close(); }, { once: true });
};
sheet?.querySelector('.sheet__close').addEventListener('click', close);
// Klick neben das Fenster schließt es
sheet?.addEventListener('click', (e) => { if (e.target === sheet) close(); });
sheet?.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
