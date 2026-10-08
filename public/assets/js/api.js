// Cliente REST mínimo para la web pública (evita cargar la librería de Supabase).
import { SUPABASE_URL, SUPABASE_KEY, isConfigured } from './config.js';

function headers(extra = {}) {
  const h = { apikey: SUPABASE_KEY, ...extra };
  // Las claves antiguas (JWT "anon") también se envían como Bearer;
  // las nuevas "sb_publishable_..." solo necesitan la cabecera apikey.
  if (!SUPABASE_KEY.startsWith('sb_')) h.Authorization = `Bearer ${SUPABASE_KEY}`;
  return h;
}

export async function select(table, query) {
  if (!isConfigured()) return [];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: headers() });
  if (!res.ok) throw new Error(`Error ${res.status} al cargar ${table}`);
  return res.json();
}

export async function insert(table, row) {
  if (!isConfigured()) throw new Error('La base de datos aún no está configurada.');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Error ${res.status}`);
  }
}
