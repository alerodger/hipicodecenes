import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, STORAGE_BUCKET, isConfigured } from './config.js';

// GitHub Pages no permite cabeceras anti-iframe: impide que el panel se cargue dentro de otra web.
if (window.top !== window.self) window.top.location = window.location.href;

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s = '') => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = id => `<svg class="icon"><use href="#${id}"/></svg>`;
const parseDate = d => { const [y, m, day] = d.split('-').map(Number); return new Date(y, m - 1, day); };
const fmt = (d, o) => new Intl.DateTimeFormat('es-ES', o).format(typeof d === 'string' && d.length === 10 ? parseDate(d) : new Date(d));
const todayISO = () => { const t = new Date(); return new Date(t.getTime() - t.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };
const nullify = obj => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? (v.trim() || null) : v]));

const CATEGORIAS = { competicion: 'Competición', clinic: 'Clinic', campamento: 'Campamento', ruta: 'Ruta', jornada: 'Jornada', social: 'Social', otro: 'Otro' };
const SEXOS = { yegua: 'Yegua', caballo: 'Caballo', castrado: 'Castrado', pony: 'Pony' };
const FOTO_CATS = { club: 'Club', clases: 'Clases', competiciones: 'Competiciones', caballos: 'Caballos', instalaciones: 'Instalaciones', eventos: 'Eventos' };

/* ------------------------------------------------------------------ */
/*  Utilidades                                                         */
/* ------------------------------------------------------------------ */
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${type === 'error' ? 'toast--error' : ''}`;
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3000);
}

function errMsg(err) {
  const m = err?.message || String(err);
  if (/Invalid login credentials/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/Email not confirmed/i.test(m)) return 'El email aún no está confirmado.';
  if (/row-level security|permission denied/i.test(m)) return 'No tienes permisos para esta acción.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sin conexión con el servidor. Revisa tu conexión a internet.';
  return m;
}

const withBusy = async (btn, label, fn) => {
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = label;
  try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = prev; }
};

/** Redimensiona y comprime una imagen en el navegador (WebP, o JPEG si no hay soporte). */
async function processImage(file, maxSide, quality = 0.82) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    src = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`No se puede leer la imagen «${file.name}». Prueba con JPG o PNG.`));
      img.src = URL.createObjectURL(file);
    });
  }
  const w0 = src.width, h0 = src.height;
  const scale = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  src.close?.();
  const toBlob = type => new Promise(r => canvas.toBlob(r, type, quality));
  let blob = await toBlob('image/webp');
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg');
  return { blob, width: w, height: h, ext: blob.type === 'image/webp' ? 'webp' : 'jpg' };
}

async function uploadBlob(path, blob) {
  const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return sb.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removeFiles(...paths) {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await sb.storage.from(STORAGE_BUCKET).remove(list);
  if (error) console.warn('No se pudo borrar del almacenamiento:', error);
}

async function uploadImage(folder, file, maxSide) {
  const img = await processImage(file, maxSide);
  const path = `${folder}/${crypto.randomUUID()}.${img.ext}`;
  const url = await uploadBlob(path, img.blob);
  return { path, url };
}

/* ------------------------------------------------------------------ */
/*  Autenticación                                                      */
/* ------------------------------------------------------------------ */
const views = { login: $('#view-login'), reset: $('#view-reset'), app: $('#view-app') };
const show = name => Object.entries(views).forEach(([k, v]) => { v.hidden = k !== name; });

const sb = isConfigured()
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

let recovering = /type=recovery/.test(location.hash);
let entered = false;

if (!sb) {
  show('login');
  $('#login-msg').textContent = 'Falta configurar Supabase en assets/js/config.js (consulta el README).';
  $('#login-form button[type="submit"]').disabled = true;
  $('#forgot').disabled = true;
} else {
  sb.auth.onAuthStateChange((event, session) => {
    // Evita llamar a Supabase dentro del callback (recomendación oficial).
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') { recovering = true; show('reset'); return; }
      if (event === 'SIGNED_OUT') { entered = false; show('login'); return; }
      if (recovering) { show('reset'); return; }
      if (session && !entered) enterApp(session);
      else if (!session) show('login');
    }, 0);
  });
}

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget;
  const msg = $('#login-msg');
  msg.textContent = '';
  msg.className = 'auth__msg';
  await withBusy(f.querySelector('[type="submit"]'), 'Entrando…', async () => {
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    if (error) msg.textContent = errMsg(error);
  });
});

$('#forgot').addEventListener('click', async () => {
  const email = $('#login-form').email.value.trim();
  const msg = $('#login-msg');
  if (!email) { msg.className = 'auth__msg'; msg.textContent = 'Escribe tu email y vuelve a pulsar.'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  msg.className = error ? 'auth__msg' : 'auth__msg is-ok';
  msg.textContent = error ? errMsg(error) : 'Si el email existe, recibirás un enlace para cambiar la contraseña.';
});

$('#reset-form').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.currentTarget;
  const msg = $('#reset-msg');
  await withBusy(f.querySelector('[type="submit"]'), 'Guardando…', async () => {
    const { error } = await sb.auth.updateUser({ password: f.password.value });
    if (error) { msg.textContent = errMsg(error); return; }
    recovering = false;
    history.replaceState(null, '', location.pathname);
    toast('Contraseña actualizada.');
    const { data } = await sb.auth.getSession();
    if (data.session) enterApp(data.session); else show('login');
  });
});

$('#logout').addEventListener('click', () => sb.auth.signOut());

async function enterApp(session) {
  entered = true;
  const { data: ok, error } = await sb.rpc('is_admin');
  if (error || !ok) {
    entered = false;
    await sb.auth.signOut();
    show('login');
    $('#login-msg').textContent = 'Esta cuenta no tiene permisos de administrador.';
    return;
  }
  $('#user-email').textContent = session.user.email;
  show('app');
  openTab(location.hash.slice(1) || 'eventos');
  loadMessages();
}

/* ------------------------------------------------------------------ */
/*  Pestañas                                                           */
/* ------------------------------------------------------------------ */
const loaders = { eventos: loadEvents, caballos: loadHorses, fotos: () => loadPhotos(true), mensajes: loadMessages };
const loaded = new Set();

function openTab(name) {
  if (!loaders[name]) name = 'eventos';
  $$('.side__link[data-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.tab === name));
  $$('.panel').forEach(p => { p.hidden = p.id !== `tab-${name}`; });
  history.replaceState(null, '', `#${name}`);
  if (!loaded.has(name)) { loaded.add(name); loaders[name]().catch(err => toast(errMsg(err), 'error')); }
}
$$('.side__link[data-tab]').forEach(b => b.addEventListener('click', () => openTab(b.dataset.tab)));

$$('dialog').forEach(d => d.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) d.close();
}));

/* Campo de imagen reutilizable (eventos y caballos) */
function imageField({ input, preview, remove }) {
  const state = { file: null, removed: false, currentUrl: null };
  const paint = url => {
    $(preview).style.backgroundImage = url ? `url("${url}")` : '';
    $(preview).textContent = url ? ' ' : '';
  };
  $(input).addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    state.file = file;
    state.removed = false;
    paint(URL.createObjectURL(file));
  });
  $(remove).addEventListener('click', () => { state.file = null; state.removed = true; $(input).value = ''; paint(null); });
  return {
    state,
    reset(url) { Object.assign(state, { file: null, removed: false, currentUrl: url || null }); $(input).value = ''; paint(url); },
  };
}

/* ------------------------------------------------------------------ */
/*  EVENTOS                                                            */
/* ------------------------------------------------------------------ */
let eventos = [];
let editingEvent = null;
const eventDialog = $('#event-dialog');
const eventForm = $('#event-form');
const eventImg = imageField({ input: '#event-image', preview: '#event-preview', remove: '#event-image-remove' });

async function loadEvents() {
  const { data, error } = await sb.from('eventos').select('*').order('fecha_inicio', { ascending: false });
  if (error) throw error;
  eventos = data;
  renderEvents();
}

function renderEvents() {
  const el = $('#events-admin');
  if (!eventos.length) { el.innerHTML = '<div class="empty">Todavía no hay eventos. Crea el primero con «Nuevo evento».</div>'; return; }
  const t = todayISO();
  el.innerHTML = eventos.map(ev => {
    const past = (ev.fecha_fin || ev.fecha_inicio) < t;
    return `
    <article class="row ${past ? 'row--past' : ''}">
      <div class="row__date"><b>${fmt(ev.fecha_inicio, { day: 'numeric' })}</b><span>${fmt(ev.fecha_inicio, { month: 'short', year: '2-digit' }).replace('.', '')}</span></div>
      <div>
        <p class="row__title">${esc(ev.titulo)}
          <span class="tag">${CATEGORIAS[ev.categoria] || ev.categoria}</span>
          ${ev.publicado ? '' : '<span class="tag tag--draft">Borrador</span>'}
        </p>
        <p class="row__sub">${[ev.hora, ev.lugar].filter(Boolean).map(esc).join(' · ') || (past ? 'Finalizado' : '&nbsp;')}</p>
      </div>
      <div class="row__actions">
        <button class="icon-btn" data-edit="${ev.id}" title="Editar" aria-label="Editar">${icon('i-edit')}</button>
        <button class="icon-btn icon-btn--danger" data-del="${ev.id}" title="Eliminar" aria-label="Eliminar">${icon('i-trash')}</button>
      </div>
    </article>`;
  }).join('');
}

function openEventForm(ev = null) {
  editingEvent = ev;
  eventForm.reset();
  $('#event-form-title').textContent = ev ? 'Editar evento' : 'Nuevo evento';
  if (ev) {
    for (const [k, v] of Object.entries(ev)) {
      const field = eventForm.elements[k];
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = !!v; else field.value = v ?? '';
    }
  }
  eventImg.reset(ev?.imagen_url);
  eventDialog.showModal();
}

$('#new-event').addEventListener('click', () => openEventForm());
$('#events-admin').addEventListener('click', async e => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (edit) openEventForm(eventos.find(x => x.id === edit.dataset.edit));
  if (del) {
    const ev = eventos.find(x => x.id === del.dataset.del);
    if (!confirm(`¿Eliminar el evento «${ev.titulo}»? Esta acción no se puede deshacer.`)) return;
    const { error } = await sb.from('eventos').delete().eq('id', ev.id);
    if (error) return toast(errMsg(error), 'error');
    await removeFiles(ev.imagen_path);
    toast('Evento eliminado.');
    loadEvents();
  }
});

eventForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!eventForm.reportValidity()) return;
  const fd = Object.fromEntries(new FormData(eventForm));
  const row = nullify({
    titulo: fd.titulo, categoria: fd.categoria, fecha_inicio: fd.fecha_inicio, fecha_fin: fd.fecha_fin,
    hora: fd.hora, lugar: fd.lugar, precio: fd.precio, resumen: fd.resumen, descripcion: fd.descripcion, enlace: fd.enlace,
  });
  row.publicado = eventForm.elements.publicado.checked;
  if (row.fecha_fin && row.fecha_fin < row.fecha_inicio) return toast('La fecha de fin no puede ser anterior a la de inicio.', 'error');

  await withBusy(e.submitter || eventForm.querySelector('[type="submit"]'), 'Guardando…', async () => {
    const oldPath = editingEvent?.imagen_path;
    let newImage = null;
    try {
      if (eventImg.state.file) {
        newImage = await uploadImage('eventos', eventImg.state.file, 1400);
        Object.assign(row, { imagen_url: newImage.url, imagen_path: newImage.path });
      } else if (eventImg.state.removed) {
        Object.assign(row, { imagen_url: null, imagen_path: null });
      }
      const q = editingEvent ? sb.from('eventos').update(row).eq('id', editingEvent.id) : sb.from('eventos').insert(row);
      const { error } = await q;
      if (error) throw error;
      if (oldPath && (newImage || eventImg.state.removed)) await removeFiles(oldPath);
      eventDialog.close();
      toast(editingEvent ? 'Evento actualizado.' : 'Evento publicado.');
      loadEvents();
    } catch (err) {
      if (newImage) await removeFiles(newImage.path);
      toast(errMsg(err), 'error');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  CABALLOS                                                           */
/* ------------------------------------------------------------------ */
let caballos = [];
let editingHorse = null;
const horseDialog = $('#horse-dialog');
const horseForm = $('#horse-form');
const horseImg = imageField({ input: '#horse-image', preview: '#horse-preview', remove: '#horse-image-remove' });

async function loadHorses() {
  const { data, error } = await sb.from('caballos').select('*').order('orden').order('nombre');
  if (error) throw error;
  caballos = data;
  renderHorses();
}

function renderHorses() {
  const el = $('#horses-admin');
  if (!caballos.length) { el.innerHTML = '<div class="empty" style="grid-column:1/-1">Añade el primer caballo con «Nuevo caballo».</div>'; return; }
  el.innerHTML = caballos.map(c => `
    <article class="card">
      <div class="card__img">${c.foto_url ? `<img src="${esc(c.foto_url)}" alt="" loading="lazy">` : '<svg><use href="#i-logo"/></svg>'}</div>
      <div class="card__body">
        <div>
          <strong>${esc(c.nombre)}</strong>
          <small>${esc([c.raza, SEXOS[c.sexo]].filter(Boolean).join(' · ') || '—')}${c.visible ? '' : ' · <b>Oculto</b>'}</small>
        </div>
        <div class="row__actions">
          <button class="icon-btn" data-edit="${c.id}" title="Editar" aria-label="Editar">${icon('i-edit')}</button>
          <button class="icon-btn icon-btn--danger" data-del="${c.id}" title="Eliminar" aria-label="Eliminar">${icon('i-trash')}</button>
        </div>
      </div>
    </article>`).join('');
}

function openHorseForm(c = null) {
  editingHorse = c;
  horseForm.reset();
  $('#horse-form-title').textContent = c ? `Editar a ${c.nombre}` : 'Nuevo caballo';
  if (c) {
    for (const [k, v] of Object.entries(c)) {
      const field = horseForm.elements[k];
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = !!v; else field.value = v ?? '';
    }
  } else {
    horseForm.elements.orden.value = caballos.length ? Math.max(...caballos.map(x => x.orden)) + 1 : 0;
  }
  horseImg.reset(c?.foto_url);
  horseDialog.showModal();
}

$('#new-horse').addEventListener('click', () => openHorseForm());
$('#horses-admin').addEventListener('click', async e => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (edit) openHorseForm(caballos.find(x => x.id === edit.dataset.edit));
  if (del) {
    const c = caballos.find(x => x.id === del.dataset.del);
    if (!confirm(`¿Eliminar a ${c.nombre} de la web? Esta acción no se puede deshacer.`)) return;
    const { error } = await sb.from('caballos').delete().eq('id', c.id);
    if (error) return toast(errMsg(error), 'error');
    await removeFiles(c.foto_path);
    toast(`${c.nombre} eliminado.`);
    loadHorses();
  }
});

horseForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (!horseForm.reportValidity()) return;
  const fd = Object.fromEntries(new FormData(horseForm));
  const row = nullify({
    nombre: fd.nombre, raza: fd.raza, sexo: fd.sexo, capa: fd.capa, alzada: fd.alzada,
    disciplina: fd.disciplina, caracter: fd.caracter, descripcion: fd.descripcion,
  });
  row.anio_nacimiento = fd.anio_nacimiento ? Number(fd.anio_nacimiento) : null;
  row.orden = Number(fd.orden) || 0;
  row.visible = horseForm.elements.visible.checked;

  await withBusy(e.submitter || horseForm.querySelector('[type="submit"]'), 'Guardando…', async () => {
    const oldPath = editingHorse?.foto_path;
    let newImage = null;
    try {
      if (horseImg.state.file) {
        newImage = await uploadImage('caballos', horseImg.state.file, 1000);
        Object.assign(row, { foto_url: newImage.url, foto_path: newImage.path });
      } else if (horseImg.state.removed) {
        Object.assign(row, { foto_url: null, foto_path: null });
      }
      const q = editingHorse ? sb.from('caballos').update(row).eq('id', editingHorse.id) : sb.from('caballos').insert(row);
      const { error } = await q;
      if (error) throw error;
      if (oldPath && (newImage || horseImg.state.removed)) await removeFiles(oldPath);
      horseDialog.close();
      toast(editingHorse ? 'Caballo actualizado.' : 'Caballo añadido.');
      loadHorses();
    } catch (err) {
      if (newImage) await removeFiles(newImage.path);
      toast(errMsg(err), 'error');
    }
  });
});

/* ------------------------------------------------------------------ */
/*  FOTOS                                                              */
/* ------------------------------------------------------------------ */
const PHOTO_PAGE = 40;
let fotos = [];

async function loadPhotos(reset = false) {
  if (reset) fotos = [];
  const { data, error, count } = await sb.from('fotos').select('*', { count: 'exact' })
    .order('created_at', { ascending: false }).range(fotos.length, fotos.length + PHOTO_PAGE - 1);
  if (error) throw error;
  fotos.push(...data);
  $('#photo-count').textContent = `${count} ${count === 1 ? 'foto' : 'fotos'}`;
  $('#photos-more').hidden = fotos.length >= count;
  renderPhotos();
}

function renderPhotos() {
  const el = $('#photos-admin');
  if (!fotos.length) { el.innerHTML = '<div class="empty" style="grid-column:1/-1">Aún no hay fotos. Sube las primeras arriba.</div>'; return; }
  el.innerHTML = fotos.map(f => `
    <article class="photo" data-id="${f.id}">
      <div class="photo__img">
        <img src="${esc(f.thumb_url || f.url)}" alt="" loading="lazy">
        <div class="photo__tools">
          <button class="icon-btn ${f.destacada ? 'is-on' : ''}" data-act="star" title="${f.destacada ? 'Quitar de portada' : 'Usar como portada'}" aria-pressed="${f.destacada}">${icon('i-star')}</button>
          <button class="icon-btn icon-btn--danger" data-act="del" title="Eliminar" aria-label="Eliminar">${icon('i-trash')}</button>
        </div>
      </div>
      <div class="photo__fields">
        <input data-field="titulo" value="${esc(f.titulo || '')}" placeholder="Pie de foto" maxlength="160" aria-label="Pie de foto">
        <select data-field="categoria" aria-label="Categoría">
          ${Object.entries(FOTO_CATS).map(([v, l]) => `<option value="${v}" ${v === f.categoria ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
    </article>`).join('');
}

async function updatePhoto(id, patch) {
  const { error } = await sb.from('fotos').update(patch).eq('id', id);
  if (error) { toast(errMsg(error), 'error'); return false; }
  Object.assign(fotos.find(f => f.id === id), patch);
  return true;
}

$('#photos-admin').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.photo').dataset.id;
  const f = fotos.find(x => x.id === id);
  if (btn.dataset.act === 'star') {
    if (await updatePhoto(id, { destacada: !f.destacada })) {
      renderPhotos();
      toast(f.destacada ? 'Añadida a la portada.' : 'Quitada de la portada.');
    }
  }
  if (btn.dataset.act === 'del') {
    if (!confirm('¿Eliminar esta foto definitivamente?')) return;
    const { error } = await sb.from('fotos').delete().eq('id', id);
    if (error) return toast(errMsg(error), 'error');
    await removeFiles(f.path, f.thumb_path);
    fotos = fotos.filter(x => x.id !== id);
    renderPhotos();
    const n = Number.parseInt($('#photo-count').textContent, 10) - 1;
    $('#photo-count').textContent = `${n} ${n === 1 ? 'foto' : 'fotos'}`;
    toast('Foto eliminada.');
  }
});

$('#photos-admin').addEventListener('change', async e => {
  const field = e.target.dataset.field;
  if (!field) return;
  const id = e.target.closest('.photo').dataset.id;
  const value = e.target.value.trim() || (field === 'titulo' ? null : e.target.value);
  if (await updatePhoto(id, { [field]: value })) toast('Guardado.');
});

$('#photos-more').addEventListener('click', () => loadPhotos().catch(err => toast(errMsg(err), 'error')));

/* Subida múltiple */
const drop = $('#drop');
const filesInput = $('#files');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', e => uploadPhotos([...e.dataTransfer.files]));
filesInput.addEventListener('change', () => { uploadPhotos([...filesInput.files]); filesInput.value = ''; });

let uploading = Promise.resolve();
function uploadPhotos(files) {
  files = files.filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (!files.length) return;
  const categoria = $('#upload-cat').value;
  const titulo = $('#upload-title').value.trim() || null;
  const queue = $('#queue');
  const items = files.map(file => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(file.name)}</span><span class="st">En cola</span><progress max="3" value="0"></progress>`;
    queue.append(li);
    return { file, li };
  });
  uploading = uploading.then(async () => {
    let ok = 0;
    for (const { file, li } of items) {
      const st = $('.st', li);
      const bar = $('progress', li);
      const paths = [];
      try {
        st.textContent = 'Optimizando…';
        const full = await processImage(file, 2000, 0.84);
        const thumb = await processImage(file, 720, 0.78);
        bar.value = 1;
        st.textContent = 'Subiendo…';
        const id = crypto.randomUUID();
        const path = `fotos/${id}.${full.ext}`;
        const thumbPath = `fotos/thumbs/${id}.${thumb.ext}`;
        const url = await uploadBlob(path, full.blob); paths.push(path);
        bar.value = 2;
        const thumbUrl = await uploadBlob(thumbPath, thumb.blob); paths.push(thumbPath);
        const { error } = await sb.from('fotos').insert({
          path, url, thumb_path: thumbPath, thumb_url: thumbUrl, titulo, categoria, ancho: full.width, alto: full.height,
        });
        if (error) throw error;
        bar.value = 3;
        st.textContent = '✓ Subida';
        ok++;
        setTimeout(() => li.remove(), 2500);
      } catch (err) {
        await removeFiles(...paths);
        st.textContent = errMsg(err);
        st.className = 'st err';
      }
    }
    if (ok) { toast(`${ok} ${ok === 1 ? 'foto subida' : 'fotos subidas'}.`); await loadPhotos(true); }
  });
}

/* ------------------------------------------------------------------ */
/*  MENSAJES                                                           */
/* ------------------------------------------------------------------ */
let mensajes = [];

async function loadMessages() {
  const { data, error } = await sb.from('mensajes').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  mensajes = data;
  renderMessages();
}

function renderMessages() {
  const unread = mensajes.filter(m => !m.leido).length;
  $('#unread').hidden = !unread;
  $('#unread').textContent = unread;
  const el = $('#messages-admin');
  if (!mensajes.length) { el.innerHTML = '<div class="empty">No hay mensajes todavía.</div>'; return; }
  el.innerHTML = mensajes.map(m => {
    const reply = `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re: ${m.asunto || 'Tu consulta'} · Club Hípico de Cenes`)}`;
    return `
    <article class="msg ${m.leido ? '' : 'msg--unread'}" data-id="${m.id}">
      <div class="msg__head">
        <div>
          <p class="row__title">${esc(m.nombre)} ${m.leido ? '' : '<span class="tag tag--new">Nuevo</span>'} ${m.asunto ? `<span class="tag">${esc(m.asunto)}</span>` : ''}</p>
          <p class="msg__meta"><a href="mailto:${esc(m.email)}">${esc(m.email)}</a>${m.telefono ? ` · <a href="tel:${esc(m.telefono)}">${esc(m.telefono)}</a>` : ''} · ${fmt(m.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</p>
        </div>
        <div class="row__actions">
          <a class="icon-btn" href="${reply}" title="Responder por email" aria-label="Responder">${icon('i-reply')}</a>
          <button class="icon-btn ${m.leido ? 'is-on' : ''}" data-act="read" title="${m.leido ? 'Marcar como no leído' : 'Marcar como leído'}">${icon('i-check')}</button>
          <button class="icon-btn icon-btn--danger" data-act="del" title="Eliminar" aria-label="Eliminar">${icon('i-trash')}</button>
        </div>
      </div>
      <p class="msg__body">${esc(m.mensaje)}</p>
    </article>`;
  }).join('');
}

$('#messages-admin').addEventListener('click', async e => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.closest('.msg').dataset.id;
  const m = mensajes.find(x => x.id === id);
  if (btn.dataset.act === 'read') {
    const { error } = await sb.from('mensajes').update({ leido: !m.leido }).eq('id', id);
    if (error) return toast(errMsg(error), 'error');
    m.leido = !m.leido;
    renderMessages();
  }
  if (btn.dataset.act === 'del') {
    if (!confirm(`¿Eliminar el mensaje de ${m.nombre}?`)) return;
    const { error } = await sb.from('mensajes').delete().eq('id', id);
    if (error) return toast(errMsg(error), 'error');
    mensajes = mensajes.filter(x => x.id !== id);
    renderMessages();
    toast('Mensaje eliminado.');
  }
});
