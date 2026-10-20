// Instagram-Beiträge erst nach Zustimmung laden (Zwei-Klick-Lösung, DSGVO)
const KEY = 'insta-consent';
const consentBox = document.getElementById('instaConsent');
const track = document.getElementById('instaTrack');

function loadInstagram() {
  if (!track || track.dataset.loaded) return;
  track.dataset.loaded = '1';
  consentBox.hidden = true;
  track.classList.add('is-live');
  track.querySelectorAll('.insta-item').forEach((item) => {
    const q = document.createElement('blockquote');
    q.className = 'instagram-media';
    q.setAttribute('data-instgrm-captioned', '');
    q.setAttribute('data-instgrm-permalink', `${item.dataset.permalink}?utm_source=ig_embed&utm_campaign=loading`);
    q.setAttribute('data-instgrm-version', '14');
    const a = Object.assign(document.createElement('a'), { href: item.dataset.permalink, target: '_blank', rel: 'noopener', textContent: 'Beitrag auf Instagram ansehen' });
    q.append(a);
    item.replaceChildren(q);
  });
  const s = document.createElement('script');
  s.src = 'https://www.instagram.com/embed.js';
  s.async = true;
  s.onload = () => window.instgrm?.Embeds.process();
  document.body.append(s);
}

let remembered = false;
try { remembered = localStorage.getItem(KEY) === 'yes'; } catch {}
if (remembered) loadInstagram();

document.getElementById('instaLoad')?.addEventListener('click', () => {
  if (document.getElementById('instaRemember')?.checked) {
    try { localStorage.setItem(KEY, 'yes'); } catch {}
  }
  loadInstagram();
});
