// Bildleiste "Einblicke": Punkte zeigen die Position, auf dem Handy wischt sie sanft von selbst weiter
const track = document.getElementById('galleryTrack');
const dots = [...document.querySelectorAll('#galleryDots span')];

if (track) {
  const items = [...track.children];
  const index = () => Math.round(track.scrollLeft / (items[1].offsetLeft - items[0].offsetLeft));
  const update = () => { const i = index(); dots.forEach((d, n) => d.classList.toggle('on', n === i)); };
  track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let paused = false;
  let visible = false;
  ['pointerdown', 'touchstart', 'focusin', 'mouseenter'].forEach((ev) => track.addEventListener(ev, () => { paused = true; }, { passive: true }));
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.5 }).observe(track);

  setInterval(() => {
    const scrollable = track.scrollWidth > track.clientWidth + 4;
    if (reduced || paused || !visible || !scrollable || document.hidden) return;
    const next = (index() + 1) % items.length;
    track.scrollTo({ left: items[next].offsetLeft - items[0].offsetLeft, behavior: next === 0 ? 'auto' : 'smooth' });
  }, 4500);
}
