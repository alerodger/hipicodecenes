import { select, insert } from './api.js';
import { isConfigured } from './config.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '');
// Dirección de la portada, válida tanto en dominio propio como en usuario.github.io/repositorio/
const siteUrl = location.origin + location.pathname.replace(/index\.html$/, '');

const parseDate = d => { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day); };
const fmt = (d, o) => new Intl.DateTimeFormat('es-ES', o).format(parseDate(d));
const todayISO = () => { const t = new Date(); return new Date(t.getTime() - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

const CATEGORIAS = {
  competicion: 'Competición', clinic: 'Clinic', campamento: 'Campamento', ruta: 'Ruta',
  jornada: 'Jornada', social: 'Social', otro: 'Evento',
};
const SEXOS = { yegua: 'Yegua', caballo: 'Caballo', castrado: 'Castrado', pony: 'Pony' };

const emptyState = msg => `<div class="empty">${icon('i-shoe', '')}<p>${msg}</p></div>`;

/* ------------------------------------------------------------------ */
/*  Navegación                                                         */
/* ------------------------------------------------------------------ */
const nav = $('#nav');
const toggle = $('#nav-toggle');
const onScroll = () => nav.classList.toggle('is-solid', scrollY > 40);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const setMenu = open => {
  nav.classList.toggle('is-open', open);
  toggle.setAttribute('aria-expanded', open);
  toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  document.body.style.overflow = open ? 'hidden' : '';
};
toggle.addEventListener('click', () => setMenu(!nav.classList.contains('is-open')));
$$('#nav-links a').forEach(a => a.addEventListener('click', () => setMenu(false)));

$('#year').textContent = new Date().getFullYear();

/* ------------------------------------------------------------------ */
/*  Aparición al hacer scroll                                          */
/* ------------------------------------------------------------------ */
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
}, { rootMargin: '0px 0px -8% 0px' });
const observeReveal = (root = document) => $$('.reveal:not(.is-visible)', root).forEach(el => io.observe(el));
observeReveal();

/* ------------------------------------------------------------------ */
/*  Modal genérico                                                     */
/* ------------------------------------------------------------------ */
const modal = $('#modal');
const modalBody = $('#modal-body');
function openModal(html, hash) {
  modalBody.innerHTML = html;
  modal.showModal();
  if (hash) history.replaceState(null, '', `#${hash}`);
}
modal.addEventListener('close', () => {
  if (/^#(evento|caballo)-/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
});
$$('dialog').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
});

/* ------------------------------------------------------------------ */
/*  Portada (fotos destacadas)                                         */
/* ------------------------------------------------------------------ */
async function loadHero() {
  const fotos = await select('fotos', 'select=url,titulo&destacada=eq.true&order=created_at.desc&limit=6');
  if (!fotos.length) return;
  const media = $('#hero-media');
  const slides = [];
  // Cada imagen se descarga solo cuando le toca aparecer (ahorra datos en móvil).
  const loadSlide = i => slides[i] || (slides[i] = new Promise(resolve => {
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    if (i === 0) img.fetchPriority = 'high';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = fotos[i].url;
    media.append(img);
  }));
  const show = img => { if (img) $$('img', media).forEach(im => im.classList.toggle('is-active', im === img)); };
  show(await loadSlide(0));
  if (fotos.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let current = 0;
  setInterval(async () => {
    current = (current + 1) % fotos.length;
    show(await loadSlide(current));
  }, 7000);
}

/* ------------------------------------------------------------------ */
/*  Caballos                                                           */
/* ------------------------------------------------------------------ */
let caballos = [];

function horseMeta(c) {
  const parts = [c.raza, SEXOS[c.sexo]].filter(Boolean);
  return parts.join(' · ');
}

function horseAge(c) {
  if (!c.anio_nacimiento) return '';
  const age = new Date().getFullYear() - c.anio_nacimiento;
  return `${age} ${age === 1 ? 'año' : 'años'}`;
}

function renderHorses() {
  const grid = $('#horses-grid');
  if (!caballos.length) { grid.innerHTML = emptyState('Muy pronto podrás conocer aquí a los caballos del club.'); return; }
  grid.innerHTML = caballos.map(c => `
    <button class="horse reveal" data-horse="${c.id}" aria-label="Conocer a ${esc(c.nombre)}">
      ${c.foto_url ? `<img src="${esc(c.foto_url)}" alt="${esc(c.nombre)}" loading="lazy" decoding="async">`
                   : `<span class="horse__noimg">${icon('i-shoe', '')}</span>`}
      <span class="horse__body">
        <span class="horse__name">${esc(c.nombre)}</span>
        <span class="horse__meta">${esc(horseMeta(c) || c.disciplina || '')}</span>
        ${c.caracter ? `<span class="horse__quote">«${esc(c.caracter)}»</span>` : ''}
      </span>
    </button>`).join('');
  observeReveal(grid);
}

function openHorse(id) {
  const c = caballos.find(x => x.id === id);
  if (!c) return;
  const facts = [
    ['Raza', c.raza], ['Sexo', SEXOS[c.sexo]], ['Edad', horseAge(c)],
    ['Capa', c.capa], ['Alzada', c.alzada], ['Disciplina', c.disciplina],
  ].filter(([, v]) => v);
  openModal(`
    <article class="horse-detail">
      <div class="horse-detail__img">${c.foto_url ? `<img src="${esc(c.foto_url)}" alt="${esc(c.nombre)}">` : ''}</div>
      <div class="horse-detail__text">
        <p class="eyebrow">Nuestra cuadra</p>
        <h2>${esc(c.nombre)}</h2>
        ${c.caracter ? `<p class="horse-detail__quote">«${esc(c.caracter)}»</p>` : ''}
        ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : ''}
        ${c.descripcion ? `<div class="prose"><p>${esc(c.descripcion)}</p></div>` : ''}
      </div>
    </article>`, `caballo-${c.id}`);
}

$('#horses-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-horse]');
  if (b) openHorse(b.dataset.horse);
});

async function loadHorses() {
  caballos = await select('caballos', 'select=*&visible=eq.true&order=orden.asc,nombre.asc');
  renderHorses();
}

/* ------------------------------------------------------------------ */
/*  Eventos                                                            */
/* ------------------------------------------------------------------ */
const eventsCache = {};

function eventDates(ev) {
  const start = fmt(ev.fecha_inicio, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (!ev.fecha_fin || ev.fecha_fin === ev.fecha_inicio) return start;
  const sameYear = ev.fecha_inicio.slice(0, 4) === ev.fecha_fin.slice(0, 4);
  const sameMonth = sameYear && ev.fecha_inicio.slice(5, 7) === ev.fecha_fin.slice(5, 7);
  const from = fmt(ev.fecha_inicio, sameMonth ? { day: 'numeric' } : sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
  return `Del ${from} al ${fmt(ev.fecha_fin, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

function renderEvents(list, past) {
  const el = $('#events-list');
  if (!list.length) {
    el.innerHTML = emptyState(past ? 'Aún no hay eventos anteriores publicados.'
      : 'No hay eventos programados ahora mismo. ¡Síguenos en Instagram para no perderte nada!');
    return;
  }
  el.innerHTML = list.map(ev => `
    <button class="event ${past ? 'event--past' : ''}" data-event="${ev.id}">
      <span class="event__date" aria-hidden="true">
        <span class="event__day">${fmt(ev.fecha_inicio, { day: 'numeric' })}</span>
        <span class="event__month">${fmt(ev.fecha_inicio, { month: 'short' }).replace('.', '')}</span>
      </span>
      <span class="event__info">
        <span class="badge">${CATEGORIAS[ev.categoria] || 'Evento'}</span>
        <span class="event__title">${esc(ev.titulo)}</span>
        ${ev.resumen ? `<span class="event__summary">${esc(ev.resumen)}</span>` : ''}
        <span class="event__meta">
          <span>${icon('i-cal')}${eventDates(ev)}</span>
          ${ev.hora ? `<span>${icon('i-clock')}${esc(ev.hora)}</span>` : ''}
          ${ev.lugar ? `<span>${icon('i-pin')}${esc(ev.lugar)}</span>` : ''}
        </span>
      </span>
      ${ev.imagen_url ? `<img class="event__thumb" src="${esc(ev.imagen_url)}" alt="" loading="lazy" decoding="async">` : ''}
    </button>`).join('');
}

async function loadEvents(when = 'proximos') {
  const t = todayISO();
  const base = 'select=*&publicado=eq.true';
  if (!eventsCache[when]) {
    eventsCache[when] = when === 'proximos'
      ? await select('eventos', `${base}&or=(fecha_fin.gte.${t},and(fecha_fin.is.null,fecha_inicio.gte.${t}))&order=fecha_inicio.asc`)
      : await select('eventos', `${base}&or=(fecha_fin.lt.${t},and(fecha_fin.is.null,fecha_inicio.lt.${t}))&order=fecha_inicio.desc&limit=12`);
  }
  renderEvents(eventsCache[when], when === 'anteriores');
  if (when === 'proximos') injectEventsJsonLd(eventsCache[when]);
}

function openEvent(id) {
  const ev = Object.values(eventsCache).flat().find(x => x.id === id);
  if (!ev) return;
  const link = safeUrl(ev.enlace);
  openModal(`
    <article class="event-detail">
      ${ev.imagen_url ? `<img class="event-detail__img" src="${esc(ev.imagen_url)}" alt="">` : ''}
      <div class="event-detail__text">
        <span class="badge">${CATEGORIAS[ev.categoria] || 'Evento'}</span>
        <h2>${esc(ev.titulo)}</h2>
        <div class="event-detail__meta">
          <span>${icon('i-cal')}${eventDates(ev)}</span>
          ${ev.hora ? `<span>${icon('i-clock')}${esc(ev.hora)}</span>` : ''}
          ${ev.lugar ? `<span>${icon('i-pin')}${esc(ev.lugar)}</span>` : ''}
          ${ev.precio ? `<span>${icon('i-euro')}${esc(ev.precio)}</span>` : ''}
        </div>
        <div class="prose">${ev.descripcion ? `<p>${esc(ev.descripcion)}</p>` : `<p>${esc(ev.resumen || '')}</p>`}</div>
        <p style="display:flex;gap:.7rem;flex-wrap:wrap;margin-top:1.5rem">
          <a class="btn btn--gold" href="#contacto" data-close>Quiero apuntarme</a>
          ${link ? `<a class="btn btn--outline" href="${esc(link)}" target="_blank" rel="noopener">Más información</a>` : ''}
        </p>
      </div>
    </article>`, `evento-${ev.id}`);
}

$('#events-list').addEventListener('click', e => {
  const b = e.target.closest('[data-event]');
  if (b) openEvent(b.dataset.event);
});

$$('.tab').forEach(tab => tab.addEventListener('click', () => {
  $$('.tab').forEach(t => { t.classList.toggle('is-active', t === tab); t.setAttribute('aria-selected', t === tab); });
  loadEvents(tab.dataset.when).catch(showLoadError('#events-list'));
}));

function injectEventsJsonLd(list) {
  $('#ld-events')?.remove();
  if (!list.length) return;
  const s = document.createElement('script');
  s.type = 'application/ld+json';
  s.id = 'ld-events';
  s.textContent = JSON.stringify(list.slice(0, 10).map(ev => ({
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.titulo,
    description: ev.resumen || ev.descripcion || ev.titulo,
    startDate: ev.fecha_inicio,
    endDate: ev.fecha_fin || ev.fecha_inicio,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    image: ev.imagen_url || undefined,
    url: `${siteUrl}#evento-${ev.id}`,
    location: {
      '@type': 'Place',
      name: ev.lugar || 'Club Hípico de Cenes',
      address: 'Camino del Río Genil s/n, 18190 Cenes de la Vega, Granada',
    },
    organizer: { '@type': 'Organization', name: 'Club Hípico de Cenes', url: siteUrl },
  })));
  document.head.append(s);
}

/* ------------------------------------------------------------------ */
/*  Galería + lightbox                                                 */
/* ------------------------------------------------------------------ */
const PAGE = 18;
const gallery = { cat: '', items: [], offset: 0, done: false };

async function loadGallery(reset = false) {
  if (reset) Object.assign(gallery, { items: [], offset: 0, done: false });
  const grid = $('#gallery-grid');
  const more = $('#gallery-more');
  const filter = gallery.cat ? `&categoria=eq.${gallery.cat}` : '';
  const rows = await select('fotos', `select=id,url,thumb_url,titulo,ancho,alto${filter}&order=created_at.desc&limit=${PAGE}&offset=${gallery.offset}`);
  gallery.items.push(...rows);
  gallery.offset += rows.length;
  gallery.done = rows.length < PAGE;
  if (reset) grid.innerHTML = '';
  if (!gallery.items.length) {
    grid.innerHTML = emptyState('Pronto añadiremos fotos. Mientras tanto, visítanos en Instagram.');
  } else {
    const start = gallery.items.length - rows.length;
    grid.insertAdjacentHTML('beforeend', rows.map((f, i) => `
      <button class="gallery__item" data-index="${start + i}" aria-label="${esc(f.titulo || 'Ver foto')}">
        <img src="${esc(f.thumb_url || f.url)}" alt="${esc(f.titulo || 'Foto del Club Hípico de Cenes')}" loading="lazy" decoding="async"
          ${f.ancho && f.alto ? `width="${f.ancho}" height="${f.alto}"` : ''}>
        ${f.titulo ? `<figcaption>${esc(f.titulo)}</figcaption>` : ''}
      </button>`).join(''));
  }
  more.hidden = gallery.done;
}

$('#gallery-filters').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip || chip.classList.contains('is-active')) return;
  $$('#gallery-filters .chip').forEach(c => c.classList.toggle('is-active', c === chip));
  gallery.cat = chip.dataset.cat;
  loadGallery(true).catch(showLoadError('#gallery-grid'));
});
$('#gallery-more').addEventListener('click', () => loadGallery().catch(() => {}));

const lb = $('#lightbox');
let lbIndex = 0;
function showLightbox(i) {
  const n = gallery.items.length;
  lbIndex = (i + n) % n;
  const f = gallery.items[lbIndex];
  $('#lb-img').src = f.url;
  $('#lb-img').alt = f.titulo || 'Foto del Club Hípico de Cenes';
  $('#lb-cap').textContent = f.titulo || '';
  if (!lb.open) lb.showModal();
}
$('#gallery-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-index]');
  if (b) showLightbox(+b.dataset.index);
});
$('#lb-prev').addEventListener('click', () => showLightbox(lbIndex - 1));
$('#lb-next').addEventListener('click', () => showLightbox(lbIndex + 1));
lb.addEventListener('keydown', e => {
  if (e.key === 'ArrowLeft') showLightbox(lbIndex - 1);
  if (e.key === 'ArrowRight') showLightbox(lbIndex + 1);
});
let touchX = null;
lb.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
lb.addEventListener('touchend', e => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 50) showLightbox(lbIndex + (dx < 0 ? 1 : -1));
  touchX = null;
});

/* ------------------------------------------------------------------ */
/*  Imagen de instalaciones                                            */
/* ------------------------------------------------------------------ */
async function loadFacilities() {
  const [f] = await select('fotos', 'select=url,titulo&categoria=eq.instalaciones&order=destacada.desc,created_at.desc&limit=1');
  if (!f) return;
  $('#facilities-media').innerHTML = `<img src="${esc(f.url)}" alt="${esc(f.titulo || 'Instalaciones del Club Hípico de Cenes')}" loading="lazy" decoding="async">`;
}

/* ------------------------------------------------------------------ */
/*  Mapa (se carga solo bajo demanda)                                  */
/* ------------------------------------------------------------------ */
$('#map-load').addEventListener('click', () => {
  $('#map').innerHTML = `<iframe title="Mapa: Club Hípico de Cenes" loading="lazy" referrerpolicy="no-referrer-when-downgrade"
    src="https://www.google.com/maps?q=${encodeURIComponent('Club Hípico de Cenes, Camino del Río Genil, 18190 Cenes de la Vega, Granada')}&output=embed"></iframe>`;
});

/* ------------------------------------------------------------------ */
/*  Formulario de contacto                                             */
/* ------------------------------------------------------------------ */
const form = $('#contact-form');
const status = $('#form-status');
const formShownAt = Date.now();

form.addEventListener('submit', async e => {
  e.preventDefault();
  status.className = 'form__status';
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const data = Object.fromEntries(new FormData(form));
  if (data.web || Date.now() - formShownAt < 3000) { // bots
    status.textContent = '¡Gracias! Hemos recibido tu mensaje.';
    status.classList.add('is-ok');
    form.reset();
    return;
  }
  const btn = form.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Enviando…';
  try {
    await insert('mensajes', {
      nombre: data.nombre.trim(), email: data.email.trim(), telefono: data.telefono.trim() || null,
      asunto: data.asunto, mensaje: data.mensaje.trim(),
    });
    form.reset();
    status.textContent = '¡Gracias! Hemos recibido tu mensaje y te responderemos muy pronto.';
    status.classList.add('is-ok');
  } catch (err) {
    status.textContent = 'No se ha podido enviar. Escríbenos por WhatsApp o email, por favor.';
    status.classList.add('is-error');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar mensaje';
  }
});

/* ------------------------------------------------------------------ */
/*  Arranque                                                           */
/* ------------------------------------------------------------------ */
function showLoadError(sel) {
  return err => {
    console.error(err);
    $(sel).innerHTML = emptyState('No se ha podido cargar el contenido. Inténtalo de nuevo más tarde.');
  };
}

function openFromHash() {
  const m = location.hash.match(/^#(evento|caballo)-([\w-]+)$/);
  if (!m) return;
  m[1] === 'evento' ? openEvent(m[2]) : openHorse(m[2]);
}

if (!isConfigured()) console.info('Supabase no configurado: edita assets/js/config.js');

loadHero().catch(console.error);
Promise.allSettled([
  loadHorses().catch(showLoadError('#horses-grid')),
  loadEvents().catch(showLoadError('#events-list')),
  loadGallery(true).catch(showLoadError('#gallery-grid')),
  loadFacilities(),
]).then(async () => {
  const m = location.hash.match(/^#evento-([\w-]+)$/);
  if (m && !Object.values(eventsCache).flat().some(x => x.id === m[1])) {
    eventsCache.extra = await select('eventos', `select=*&id=eq.${m[1]}`).catch(() => []);
  }
  openFromHash();
  addEventListener('hashchange', openFromHash);
});
