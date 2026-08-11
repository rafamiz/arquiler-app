'use strict';

/* ============ Sincronización con la nube (Supabase) ============
   Sin librerías: fetch directo contra Auth (GoTrue) y REST (PostgREST).
   El estado completo de la app viaja como un JSON por usuario a la tabla
   arquiler_estado, protegida por RLS: cada usuario ve solo su fila. */

const NUBE = (typeof SUPABASE_CONFIG !== 'undefined') ? SUPABASE_CONFIG : null;
const LS_SESION = 'arquiler_sesion';

let sesion = null;
try { sesion = JSON.parse(localStorage.getItem(LS_SESION)); } catch (e) { /* nada */ }

function nubeActiva() { return !!NUBE; }
function haySesion() { return !!(sesion && sesion.refresh_token); }

function guardarSesion(s) {
  sesion = s;
  if (s) localStorage.setItem(LS_SESION, JSON.stringify(s));
  else localStorage.removeItem(LS_SESION);
}

function sesionDesdeRespuesta(j) {
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    user_id: (j.user && j.user.id) || (sesion && sesion.user_id) || null,
  };
}

async function nubeLogin(usuario, password) {
  // el login es con "usuario"; por debajo Supabase usa mails
  const email = usuario.includes('@')
    ? usuario.trim()
    : usuario.trim().toLowerCase() + '@arquiler.app';
  const r = await fetch(`${NUBE.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: NUBE.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error_description || j.msg || 'error de conexión';
    throw new Error(/invalid login/i.test(msg) ? 'Usuario o contraseña incorrectos' : msg);
  }
  guardarSesion(sesionDesdeRespuesta(j));
}

// Devuelve un access token válido, renovándolo si está por vencer.
async function nubeToken() {
  if (!haySesion()) throw new Error('sin sesión');
  if (sesion.expires_at - 60 > Date.now() / 1000) return sesion.access_token;
  const r = await fetch(`${NUBE.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: NUBE.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: sesion.refresh_token }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status >= 400 && r.status < 500) guardarSesion(null); // sesión vencida de verdad
    throw new Error('sesión vencida');
  }
  guardarSesion(sesionDesdeRespuesta(j));
  return sesion.access_token;
}

// null si el usuario todavía no tiene nada guardado en la nube
async function nubeTraerEstado() {
  const token = await nubeToken();
  const r = await fetch(`${NUBE.url}/rest/v1/arquiler_estado?select=data`, {
    headers: { apikey: NUBE.anonKey, Authorization: 'Bearer ' + token },
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const filas = await r.json();
  return filas.length ? filas[0].data : null;
}

async function nubeEmpujarEstado(datos) {
  const token = await nubeToken();
  const r = await fetch(`${NUBE.url}/rest/v1/arquiler_estado`, {
    method: 'POST',
    headers: {
      apikey: NUBE.anonKey,
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify([{
      user_id: sesion.user_id,
      data: datos,
      updated_at: new Date().toISOString(),
    }]),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
}

function nubeSalir() {
  guardarSesion(null);
  localStorage.removeItem('arquiler_v1'); // no dejar datos cacheados en máquinas ajenas
  location.reload();
}
