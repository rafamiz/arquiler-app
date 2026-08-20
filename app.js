'use strict';

/* ================= Utilidades ================= */

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function ym(y, m)      { return `${y}-${String(m).padStart(2, '0')}`; }
function ymParts(k)    { const [y, m] = k.split('-').map(Number); return { y, m }; }
function ymToNum(k)    { const { y, m } = ymParts(k); return y * 12 + (m - 1); }
function numToYm(n)    { return ym(Math.floor(n / 12), (n % 12) + 1); }
function addMeses(k,d) { return numToYm(ymToNum(k) + d); }
function ymLabel(k)    { const { y, m } = ymParts(k); return `${MESES_CORTO[m - 1]} ${y}`; }
function ymLabelLargo(k){ const { y, m } = ymParts(k); return `${MESES_LARGO[m - 1]} ${y}`; }
function ymRange(a, b) {
  const out = [];
  for (let n = ymToNum(a); n <= ymToNum(b); n++) out.push(numToYm(n));
  return out;
}

const HOY = new Date();
const MES_ACTUAL = ym(HOY.getFullYear(), HOY.getMonth() + 1);

const nfARS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
function money(monto, moneda) {
  return (moneda === 'USD' ? 'US$ ' : '$ ') + nfARS.format(Math.round(monto));
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function uid() {
  return 'd_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function parseMonto(str) {
  if (str == null) return NaN;
  const limpio = String(str).trim().replace(/\$/g, '').replace(/\s/g, '')
    .replace(/\./g, '').replace(/,/g, '.');
  return parseFloat(limpio);
}

/* ================= Estado ================= */

const LS_KEY = 'arquiler_v1';

let state = cargarEstado();
let tabActiva = 'resumen';
let mesCobros = MES_ACTUAL;
let detalleId = null; // depto abierto en el modal de detalle

function cargarEstado() {
  let st = null;
  try { st = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { /* corrupto */ }
  if ((!st || typeof st !== 'object') && typeof DATOS_INICIALES !== 'undefined') {
    // primera vez en este navegador: arrancar con los datos importados del Excel
    st = JSON.parse(JSON.stringify(DATOS_INICIALES));
  }
  if (!st || typeof st !== 'object') st = { version: 1, ipc: {}, deptos: [] };
  st.ipc = { ...IPC_BASE, ...(st.ipc || {}) }; // lo editado por el usuario pisa lo precargado
  st.deptos = st.deptos || [];
  return st;
}

let pushTimer = null;

// Guarda en el navegador y, si hay nube, empuja el estado (con debounce).
function persistir() {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  if (nubeActiva() && haySesion()) {
    ponerEstadoNube('guardando');
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try { await nubeEmpujarEstado(state); ponerEstadoNube('ok'); }
      catch (e) { ponerEstadoNube('offline'); }
    }, 700);
  }
}

function guardar() {
  persistir();
  render();
}

function ponerEstadoNube(cual) {
  const el = $('#nube-estado');
  if (!el) return;
  el.textContent = {
    cargando: '☁ cargando…',
    guardando: '☁ guardando…',
    ok: '☁ al día',
    offline: '⚠ sin conexión',
  }[cual] || '';
  el.className = 'nube' + (cual === 'offline' ? ' nube-mal' : '');
}

/* ================= Motor de precios ================= */

// Devuelve un mapa ym -> { alquiler, monto (alquiler+cochera), esAjuste, faltantes[], esOverride }
// Dos formas de ajustar por IPC:
//  - 'compuesto': cada ajuste multiplica por (1+ipc) de cada mes del período (interés compuesto).
//  - 'simple': alquiler = ancla × (1 + suma de los IPC desde el ancla). El ancla es el precio
//    inicial, o el último precio pactado a mano (✎). Es el método del Excel de Rafa; un mes
//    sin IPC cargado suma 0 y queda marcado como faltante.
function calcularPrecios(d) {
  const out = {};
  if (!d.desde || !d.hasta || ymToNum(d.hasta) < ymToNum(d.desde)) return out;
  const meses = ymRange(d.desde, d.hasta);
  let base = Number(d.precioInicial) || 0;
  let anclaMes = d.desde;
  let anclaPrecio = base;
  meses.forEach((m, i) => {
    let esAjuste = false;
    let faltantes = [];
    if (d.ajuste === 'ipc' && i > 0 && i % d.cadaMeses === 0) {
      esAjuste = true;
      if (d.calculo === 'simple') {
        let suma = 0;
        for (const vm of ymRange(anclaMes, addMeses(m, -1))) {
          const v = state.ipc[vm];
          if (v == null || v === '') faltantes.push(vm);
          else suma += Number(v);
        }
        base = Math.round(anclaPrecio * (1 + suma / 100));
      } else {
        let factor = 1;
        for (const vm of meses.slice(i - d.cadaMeses, i)) {
          const v = state.ipc[vm];
          if (v == null || v === '') faltantes.push(vm);
          else factor *= 1 + Number(v) / 100;
        }
        base = Math.round(base * factor);
      }
    }
    const esOverride = d.overrides && d.overrides[m] != null;
    if (esOverride) {
      base = Number(d.overrides[m]);
      anclaMes = m;
      anclaPrecio = base;
    }
    out[m] = {
      alquiler: base,
      monto: base + (Number(d.cocheraMonto) || 0),
      esAjuste, faltantes, esOverride,
    };
  });
  return out;
}

function monedaDe(d) { return d.ajuste === 'usd' ? 'USD' : 'ARS'; }

function contratoActivo(d, mes) {
  return d.desde && d.hasta && ymToNum(d.desde) <= ymToNum(mes) && ymToNum(mes) <= ymToNum(d.hasta);
}

function registroMes(d, mes) {
  return (d.meses && d.meses[mes]) || {};
}

// Próximo mes de ajuste estrictamente posterior a `desdeMes`
function proximoAjuste(d, precios, desdeMes) {
  if (d.ajuste !== 'ipc') return null;
  for (const m of Object.keys(precios)) {
    if (precios[m].esAjuste && ymToNum(m) > ymToNum(desdeMes)) {
      return { mes: m, ...precios[m] };
    }
  }
  return null;
}

// Meses de IPC que algún cálculo necesita y no están cargados (hasta el mes actual)
function ipcFaltante() {
  const falta = new Set();
  for (const d of state.deptos) {
    const precios = calcularPrecios(d);
    for (const m of Object.keys(precios)) {
      if (ymToNum(m) > ymToNum(MES_ACTUAL)) continue;
      precios[m].faltantes.forEach(f => falta.add(f));
    }
  }
  return [...falta].sort();
}

/* ================= Render general ================= */

function render() {
  $$('.tab').forEach(t => t.classList.toggle('activa', t.dataset.tab === tabActiva));
  const vista = {
    resumen: renderResumen,
    cobros: renderCobros,
    deptos: renderDeptos,
    ipc: renderIpc,
    backup: renderBackup,
  }[tabActiva];
  $('#view').innerHTML = vista();
  // si el modal de detalle está abierto, refrescarlo
  const dlg = $('#dlg-detalle');
  if (dlg.open && detalleId) {
    const d = state.deptos.find(x => x.id === detalleId);
    if (d) $('#detalle-body').innerHTML = htmlDetalle(d);
    else dlg.close();
  }
}

/* ================= Vista: Resumen ================= */

function renderResumen() {
  if (!state.deptos.length) return htmlVacio();

  const activos = state.deptos.filter(d => contratoActivo(d, MES_ACTUAL));
  const totales = { ARS: 0, USD: 0 };
  let pagados = 0, facturados = 0;
  const pendientes = [];

  for (const d of activos) {
    const precios = calcularPrecios(d);
    const p = precios[MES_ACTUAL];
    if (!p) continue;
    totales[monedaDe(d)] += p.monto;
    const reg = registroMes(d, MES_ACTUAL);
    if (reg.pago) pagados++; else pendientes.push({ d, monto: p.monto });
    if (reg.factura) facturados++;
  }

  // Morosidad: meses pasados sin marcar como pagados
  const morosos = [];
  for (const d of state.deptos) {
    const precios = calcularPrecios(d);
    const impagos = Object.keys(precios).filter(m =>
      ymToNum(m) < ymToNum(MES_ACTUAL) && !registroMes(d, m).pago);
    if (impagos.length) morosos.push({ d, impagos });
  }

  // Contratos que vencen dentro de 3 meses (o ya vencidos hace poco)
  const porVencer = state.deptos
    .filter(d => d.hasta)
    .map(d => ({ d, meses: ymToNum(d.hasta) - ymToNum(MES_ACTUAL) }))
    .filter(x => x.meses >= 0 && x.meses <= 3)
    .sort((a, b) => a.meses - b.meses);

  // Próximos ajustes (2 meses vista)
  const ajustes = [];
  for (const d of state.deptos) {
    const precios = calcularPrecios(d);
    const prox = proximoAjuste(d, precios, addMeses(MES_ACTUAL, -1));
    if (prox && ymToNum(prox.mes) - ymToNum(MES_ACTUAL) <= 2) ajustes.push({ d, prox });
  }

  const faltaIpc = ipcFaltante();
  const nActivos = activos.length;

  const lineaTotal = [];
  if (totales.ARS) lineaTotal.push(money(totales.ARS, 'ARS'));
  if (totales.USD) lineaTotal.push(money(totales.USD, 'USD'));

  let html = `<h2 class="titulo-vista">${esc(ymLabelLargo(MES_ACTUAL))}</h2>
  <div class="tiles">
    <div class="tile">
      <div class="tile-label">A cobrar este mes</div>
      <div class="tile-num">${lineaTotal.length ? lineaTotal.map(esc).join(' + ') : '—'}</div>
      <div class="tile-sub">${nActivos} contrato${nActivos === 1 ? '' : 's'} activo${nActivos === 1 ? '' : 's'}</div>
    </div>
    <div class="tile">
      <div class="tile-label">Cobrados</div>
      <div class="tile-num">${pagados} <span class="tile-de">de ${nActivos}</span></div>
      ${htmlBarra(pagados, nActivos)}
    </div>
    <div class="tile">
      <div class="tile-label">Facturados en ARCA</div>
      <div class="tile-num">${facturados} <span class="tile-de">de ${nActivos}</span></div>
      ${htmlBarra(facturados, nActivos)}
    </div>
  </div>`;

  if (pendientes.length) {
    html += `<section class="panel">
      <h3>Pendientes de cobro · ${esc(ymLabel(MES_ACTUAL))}</h3>
      ${pendientes.map(({ d, monto }) => `
        <div class="fila-pend">
          <div><strong>${esc(d.nombre)}</strong><span class="sub"> · ${esc(d.inquilino?.nombre || '')}</span></div>
          <div class="monto">${esc(money(monto, monedaDe(d)))}</div>
        </div>`).join('')}
    </section>`;
  }

  const alertas = [];
  for (const { d, impagos } of morosos) {
    alertas.push(`<div class="alerta critica"><span class="ico">✗</span>
      <div><strong>${esc(d.nombre)}</strong> tiene ${impagos.length} mes${impagos.length === 1 ? '' : 'es'} sin marcar como pagado${impagos.length === 1 ? '' : 's'}:
      ${impagos.map(ymLabel).map(esc).join(', ')}</div></div>`);
  }
  for (const { d, meses } of porVencer) {
    alertas.push(`<div class="alerta seria"><span class="ico">⏳</span>
      <div>El contrato de <strong>${esc(d.nombre)}</strong> vence en <strong>${esc(ymLabel(d.hasta))}</strong>
      ${meses === 0 ? '(¡este mes!)' : `(en ${meses} mes${meses === 1 ? '' : 'es'})`}. Hablá con ${esc(d.inquilino?.nombre || 'el inquilino')} para renovar o rescindir.</div></div>`);
  }
  for (const { d, prox } of ajustes) {
    const nota = prox.faltantes.length
      ? ` <em>(estimado: falta IPC de ${prox.faltantes.map(ymLabel).join(', ')})</em>` : '';
    alertas.push(`<div class="alerta info"><span class="ico">↑</span>
      <div><strong>${esc(d.nombre)}</strong> ajusta por IPC en <strong>${esc(ymLabel(prox.mes))}</strong>:
      pasaría a ${esc(money(prox.monto, monedaDe(d)))}${nota}. Avisale al inquilino con tiempo.</div></div>`);
  }
  if (faltaIpc.length) {
    alertas.push(`<div class="alerta advertencia"><span class="ico">⚠</span>
      <div>Falta cargar el IPC de: ${faltaIpc.map(ymLabel).map(esc).join(', ')}.
      Andá a la pestaña <a href="#" data-action="tab" data-tab="ipc">IPC</a> y usá «Actualizar desde internet».</div></div>`);
  }

  if (alertas.length) {
    html += `<section class="panel"><h3>Avisos</h3>${alertas.join('')}</section>`;
  } else {
    html += `<section class="panel"><h3>Avisos</h3><p class="sub">Todo en orden ✨ — sin morosidad, vencimientos ni ajustes inminentes.</p></section>`;
  }
  return html;
}

function htmlBarra(v, total) {
  const pct = total ? Math.round(v / total * 100) : 0;
  return `<div class="barra"><div class="barra-fill" style="width:${pct}%"></div></div>`;
}

function htmlVacio() {
  return `<div class="vacio">
    <div class="vacio-emoji">🏢</div>
    <h2>Todavía no cargaste ningún departamento</h2>
    <p>Cargá el primero a mano, o probá la app con datos de ejemplo.<br>
    Cuando tengas tu Excel, pasáselo a Claude y te lo importa acá.</p>
    <div class="vacio-botones">
      <button class="btn" data-action="nuevo-depto">+ Agregar departamento</button>
      <button class="btn ghost" data-action="import-json">⬆ Restaurar backup</button>
      <button class="btn ghost" data-action="ejemplo">Cargar datos de ejemplo</button>
    </div>
  </div>`;
}

/* ================= Vista: Cobros ================= */

function renderCobros() {
  if (!state.deptos.length) return htmlVacio();

  const activos = state.deptos.filter(d => contratoActivo(d, mesCobros));
  let pagados = 0;
  const filas = activos.map(d => {
    const precios = calcularPrecios(d);
    const p = precios[mesCobros];
    const reg = registroMes(d, mesCobros);
    if (reg.pago) pagados++;
    const esPasado = ymToNum(mesCobros) < ymToNum(MES_ACTUAL);
    const avisos = [];
    if (p.esAjuste) avisos.push(`<span class="mini-badge ajuste" title="Este mes se ajusta el precio">↑ ajuste</span>`);
    if (p.esOverride) avisos.push(`<span class="mini-badge" title="Precio pactado a mano">✎ pactado</span>`);
    if (p.faltantes.length) avisos.push(`<span class="mini-badge falta" title="Falta IPC de: ${esc(p.faltantes.map(ymLabel).join(', '))}">⚠ falta IPC</span>`);
    return `<div class="fila-cobro">
      <div class="fc-quien">
        <strong>${esc(d.nombre)}</strong>
        <span class="sub">${esc(d.inquilino?.nombre || '')}</span>
      </div>
      <div class="fc-monto">
        <span class="monto">${esc(money(p.monto, monedaDe(d)))}</span>
        ${avisos.join('')}
      </div>
      <div class="fc-chips">
        ${chipPago(d.id, mesCobros, reg, esPasado)}
        ${chipFactura(d.id, mesCobros, reg)}
      </div>
    </div>`;
  });

  return `<div class="nav-mes">
    <button class="btn ghost" data-action="mes-prev" title="Mes anterior">‹</button>
    <h2 class="titulo-mes">${esc(ymLabelLargo(mesCobros))}</h2>
    <button class="btn ghost" data-action="mes-next" title="Mes siguiente">›</button>
    ${mesCobros !== MES_ACTUAL ? `<button class="btn ghost hoy" data-action="mes-hoy">Hoy</button>` : ''}
  </div>
  ${activos.length ? `
    <div class="resumen-mes">
      <span>${pagados} de ${activos.length} cobrados</span>
      ${htmlBarra(pagados, activos.length)}
    </div>
    <section class="panel lista-cobros">${filas.join('')}</section>`
    : `<p class="sub centrado">Ningún contrato activo en este mes.</p>`}
  <p class="ayuda">Tocá los botones para marcar si el inquilino <strong>pagó</strong> y si vos lo <strong>facturaste en ARCA</strong>.</p>`;
}

function chipPago(id, mes, reg, esPasado) {
  if (reg.pago) {
    const f = reg.fechaPago ? ` title="Marcado el ${esc(reg.fechaPago)}"` : '';
    return `<button class="chip ok" data-action="toggle-pago" data-id="${id}" data-mes="${mes}"${f}>✓ Pagó</button>`;
  }
  const clase = esPasado ? 'mal' : 'off';
  const texto = esPasado ? '✗ Sin pagar' : '· Pendiente';
  return `<button class="chip ${clase}" data-action="toggle-pago" data-id="${id}" data-mes="${mes}">${texto}</button>`;
}

function chipFactura(id, mes, reg) {
  if (reg.factura) {
    return `<button class="chip ok" data-action="toggle-factura" data-id="${id}" data-mes="${mes}">✓ ARCA</button>`;
  }
  return `<button class="chip off" data-action="toggle-factura" data-id="${id}" data-mes="${mes}">· Sin facturar</button>`;
}

/* ================= Vista: Departamentos ================= */

function renderDeptos() {
  const cards = state.deptos.map(d => {
    const precios = calcularPrecios(d);
    const p = precios[MES_ACTUAL];
    const activo = contratoActivo(d, MES_ACTUAL);
    const precioLinea = p
      ? `${money(p.monto, monedaDe(d))} <span class="sub">/ mes</span>`
      : `${money(d.precioInicial || 0, monedaDe(d))} <span class="sub">inicial</span>`;
    const ajusteTxt = d.ajuste === 'ipc'
      ? `IPC cada ${d.cadaMeses} meses (${d.calculo === 'simple' ? 'suma simple' : 'compuesto'})`
      : d.ajuste === 'usd' ? 'USD fijo todo el contrato' : 'Monto fijo en pesos';
    const mesesFin = d.hasta ? ymToNum(d.hasta) - ymToNum(MES_ACTUAL) : null;
    const vence = mesesFin != null && mesesFin >= 0 && mesesFin <= 3
      ? `<span class="mini-badge falta">⏳ vence ${esc(ymLabel(d.hasta))}</span>` : '';
    const estado = activo ? '' : (mesesFin != null && mesesFin < 0
      ? `<span class="mini-badge">contrato terminado</span>`
      : `<span class="mini-badge">empieza ${esc(ymLabel(d.desde))}</span>`);
    const dep = d.deposito?.monto
      ? `<div class="dato"><span>Depósito</span>${esc(money(d.deposito.monto, d.deposito.moneda || 'ARS'))}${d.deposito.devuelto ? ' <span class="sub">(devuelto)</span>' : ''}</div>` : '';
    return `<div class="card">
      <div class="card-top">
        <h3>${esc(d.nombre)} ${vence} ${estado}</h3>
        <div class="precio">${precioLinea}</div>
      </div>
      <div class="datos">
        <div class="dato"><span>Inquilino</span>${esc(d.inquilino?.nombre || '—')}</div>
        <div class="dato"><span>DNI</span>${esc(d.inquilino?.dni || '—')}</div>
        <div class="dato"><span>Mail</span>${d.inquilino?.mail ? `<a href="mailto:${esc(d.inquilino.mail)}">${esc(d.inquilino.mail)}</a>` : '—'}</div>
        ${d.inquilino?.telefono ? `<div class="dato"><span>Teléfono</span>${esc(d.inquilino.telefono)}</div>` : ''}
        <div class="dato"><span>Contrato</span>${esc(ymLabel(d.desde))} → ${esc(ymLabel(d.hasta))}</div>
        <div class="dato"><span>Ajuste</span>${esc(ajusteTxt)}</div>
        <div class="dato"><span>Cochera</span>${d.cochera ? `Sí${d.cocheraMonto ? ' (+' + esc(money(d.cocheraMonto, monedaDe(d))) + ')' : ''}` : 'No'}</div>
        ${dep}
        ${d.notas ? `<div class="dato"><span>Notas</span>${esc(d.notas)}</div>` : ''}
      </div>
      <div class="card-botones">
        <button class="btn chico" data-action="detalle-depto" data-id="${d.id}">Ver meses</button>
        <button class="btn chico ghost" data-action="editar-depto" data-id="${d.id}">Editar</button>
        <button class="btn chico ghost peligro" data-action="borrar-depto" data-id="${d.id}">Borrar</button>
      </div>
    </div>`;
  });

  return `<div class="encabezado-vista">
    <h2 class="titulo-vista">Departamentos</h2>
    <button class="btn" data-action="nuevo-depto">+ Agregar</button>
  </div>
  ${state.deptos.length ? `<div class="cards">${cards.join('')}</div>` : htmlVacio()}`;
}

/* ============ Modal de detalle (todos los meses) ============ */

function htmlDetalle(d) {
  const precios = calcularPrecios(d);
  const filas = Object.keys(precios).map(m => {
    const p = precios[m];
    const reg = registroMes(d, m);
    const esPasado = ymToNum(m) < ymToNum(MES_ACTUAL);
    const esHoy = m === MES_ACTUAL;
    const marcas = [];
    if (p.esAjuste && !p.esOverride) marcas.push('<span class="mini-badge ajuste">↑ IPC</span>');
    if (p.esOverride) marcas.push('<span class="mini-badge">✎ pactado</span>');
    if (p.faltantes.length) marcas.push(`<span class="mini-badge falta" title="Falta IPC de: ${esc(p.faltantes.map(ymLabel).join(', '))}">⚠</span>`);
    return `<tr class="${esHoy ? 'mes-hoy' : ''}">
      <td>${esc(ymLabel(m))}</td>
      <td class="num">${esc(money(p.monto, monedaDe(d)))} ${marcas.join('')}</td>
      <td>${chipPago(d.id, m, reg, esPasado)}</td>
      <td>${chipFactura(d.id, m, reg)}</td>
      <td><button class="btn mini ghost" data-action="override" data-id="${d.id}" data-mes="${m}" title="Fijar a mano el precio desde este mes">✎</button>${
        p.esOverride ? `<button class="btn mini ghost" data-action="quitar-override" data-id="${d.id}" data-mes="${m}" title="Volver al precio calculado">↺</button>` : ''
      }</td>
    </tr>`;
  }).join('');

  return `<h3>${esc(d.nombre)} <span class="sub">· ${esc(d.inquilino?.nombre || '')}</span></h3>
  <p class="sub">El ✎ fija un precio pactado a mano desde ese mes (por ejemplo, si redondearon el ajuste).
  Los ajustes siguientes se calculan desde ese valor.</p>
  <div class="tabla-scroll"><table class="tabla-meses">
    <thead><tr><th>Mes</th><th class="num">Alquiler</th><th>Pago</th><th>ARCA</th><th></th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>`;
}

/* ================= Vista: IPC ================= */

function renderIpc() {
  // años a mostrar: desde el contrato más viejo (o 2023) hasta hoy
  let min = 2023;
  for (const d of state.deptos) {
    if (d.desde) min = Math.min(min, ymParts(d.desde).y);
  }
  const max = HOY.getFullYear();

  let tablas = '';
  for (let y = max; y >= min; y--) {
    const celdas = MESES_CORTO.map((nombre, i) => {
      const k = ym(y, i + 1);
      const v = state.ipc[k];
      const futuro = ymToNum(k) > ymToNum(MES_ACTUAL);
      return `<div class="ipc-celda ${futuro ? 'futuro' : ''}">
        <label>${nombre}</label>
        <input type="number" step="0.01" inputmode="decimal" data-ipc="${k}"
          value="${v != null ? esc(Number(v).toFixed(2)) : ''}" placeholder="—" ${futuro ? 'disabled' : ''}>
      </div>`;
    }).join('');
    tablas += `<section class="panel"><h3>${y}</h3><div class="ipc-grid">${celdas}</div></section>`;
  }

  return `<div class="encabezado-vista">
    <h2 class="titulo-vista">IPC mensual (%)</h2>
    <button class="btn" data-action="ipc-fetch">↓ Actualizar desde internet</button>
  </div>
  <p class="sub">Variación mensual del IPC nivel general (INDEC). Con estos valores se calculan los ajustes.
  Podés editar cualquier casillero a mano; <span id="ipc-status"></span></p>
  ${tablas}`;
}

// Fuentes del IPC (variación mensual, nivel general):
//  1) apis.datos.gob.ar: serie oficial del INDEC con precisión completa ⇒ dos decimales.
//  2) api.argentinadatos.com: respaldo, publica los valores ya redondeados a un decimal.
const IPC_URL_INDEC = 'https://apis.datos.gob.ar/series/api/series/'
  + '?ids=145.3_INGNACUAL_DICI_M_38&start_date=2020-01&limit=1000&format=json';
const IPC_URL_RESPALDO = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';

// dos decimales (2.1137… → 2.11)
function redondearIpc(v) {
  return Math.round(v * 100) / 100;
}

// devuelve [['2026-07', 2.11], ...]
async function bajarIpcIndec() {
  const r = await fetch(IPC_URL_INDEC);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const json = await r.json(); // {data: [["2026-07-01", 0.0211377…], ...]}
  const filas = (json && json.data) || [];
  if (!filas.length) throw new Error('serie vacía');
  // la serie viene como fracción: 0.0211377 = 2,11 %
  return filas
    .filter(f => Array.isArray(f) && typeof f[1] === 'number')
    .map(f => [String(f[0]).slice(0, 7), redondearIpc(f[1] * 100)]);
}

async function bajarIpcRespaldo() {
  const r = await fetch(IPC_URL_RESPALDO);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const datos = await r.json(); // [{fecha:"2024-01-31", valor:20.6}, ...]
  return datos
    .filter(f => f && typeof f.valor === 'number')
    .map(f => [String(f.fecha).slice(0, 7), redondearIpc(f.valor)]);
}

async function fetchIpc() {
  const status = $('#ipc-status');
  if (status) status.textContent = 'buscando datos…';

  let filas = null, fuente = '';
  try {
    filas = await bajarIpcIndec();
    fuente = 'INDEC';
  } catch (e) {
    try {
      filas = await bajarIpcRespaldo();
      fuente = 'argentinadatos, solo 1 decimal';
    } catch (e2) {
      const s0 = $('#ipc-status');
      if (s0) s0.textContent = '✗ no se pudo conectar (¿sin internet?). Cargalos a mano.';
      return;
    }
  }

  let n = 0;
  for (const [k, v] of filas) {
    // solo interesan los años de contratos modernos
    if (k >= '2020-01' && /^\d{4}-\d{2}$/.test(k)) {
      state.ipc[k] = v;
      n++;
    }
  }
  guardar();
  const s2 = $('#ipc-status');
  if (s2) s2.textContent = `✓ listo: ${n} meses actualizados (${fuente}).`;
}

/* ================= Vista: Backup ================= */

function renderBackup() {
  return `<h2 class="titulo-vista">Backup y datos</h2>
  <section class="panel">
    <h3>Guardar / restaurar</h3>
    <p class="sub">Los datos viven en este navegador (localStorage). Hacé un backup cada tanto
    y guardalo donde quieras (Drive, mail, etc.).</p>
    <div class="botonera">
      <button class="btn" data-action="export-json">⬇ Descargar backup (JSON)</button>
      <button class="btn ghost" data-action="import-json">⬆ Restaurar backup</button>
      <button class="btn ghost" data-action="export-csv">⬇ Exportar planilla (CSV)</button>
    </div>
  </section>
  ${typeof DATOS_INICIALES !== 'undefined' ? `<section class="panel">
    <h3>Tu Excel</h3>
    <p class="sub">Los contratos de <em>Sistema_Administracion_Alquileres_v5.xlsx</em> ya están
    importados (agosto 2026). Si actualizás el Excel, pasáselo de nuevo a Claude en el chat.</p>
    <div class="botonera">
      <button class="btn ghost" data-action="restaurar-seed">↺ Volver a los datos del Excel</button>
    </div>
  </section>` : `<section class="panel">
    <h3>Versión web (sin datos precargados)</h3>
    <p class="sub">Esta versión arranca vacía a propósito: tus datos viven solo en este
    navegador. Restaurá tu backup JSON para cargarlos.</p>
  </section>`}
  <section class="panel">
    <h3>Zona peligrosa</h3>
    <div class="botonera">
      <button class="btn ghost" data-action="ejemplo">Cargar datos de ejemplo</button>
      <button class="btn ghost peligro" data-action="wipe">🗑 Borrar todo</button>
    </div>
  </section>`;
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `alquileres-backup-${MES_ACTUAL}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportCsv() {
  const filas = [['Departamento', 'Inquilino', 'DNI', 'Mes', 'Moneda', 'Monto', 'Pagado', 'Fecha pago', 'Facturado ARCA'].join(';')];
  for (const d of state.deptos) {
    const precios = calcularPrecios(d);
    for (const m of Object.keys(precios)) {
      const reg = registroMes(d, m);
      filas.push([
        d.nombre, d.inquilino?.nombre || '', d.inquilino?.dni || '', m,
        monedaDe(d), Math.round(precios[m].monto),
        reg.pago ? 'SI' : 'NO', reg.fechaPago || '', reg.factura ? 'SI' : 'NO',
      ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'));
    }
  }
  const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `alquileres-${MES_ACTUAL}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJson(archivo) {
  const lector = new FileReader();
  lector.onload = () => {
    try {
      const datos = JSON.parse(lector.result);
      if (!datos || !Array.isArray(datos.deptos)) throw new Error('formato');
      state = datos;
      state.ipc = { ...IPC_BASE, ...(state.ipc || {}) };
      guardar();
      alert('Backup restaurado ✓');
    } catch (e) {
      alert('Ese archivo no parece un backup válido de esta app.');
    }
  };
  lector.readAsText(archivo);
}

/* ================= Datos de ejemplo ================= */

function cargarEjemplo() {
  if (state.deptos.length &&
      !confirm('Ya hay departamentos cargados. ¿Agregar igual los de ejemplo?')) return;

  const ejemplos = [
    {
      id: uid(), nombre: 'Gorriti 4400 3°A',
      inquilino: { nombre: 'Martina López', dni: '33.222.111', mail: 'martina@example.com', telefono: '11-5555-1234' },
      desde: '2025-09', hasta: '2027-08',
      ajuste: 'ipc', cadaMeses: 4, precioInicial: 520000,
      cochera: false, cocheraMonto: 0,
      deposito: { monto: 520000, moneda: 'ARS', devuelto: false },
      notas: '', overrides: {}, meses: {},
    },
    {
      id: uid(), nombre: 'Av. Santa Fe 2300 7°C',
      inquilino: { nombre: 'Pedro Aguirre', dni: '28.111.999', mail: 'pedro@example.com', telefono: '' },
      desde: '2026-01', hasta: '2027-12',
      ajuste: 'usd', cadaMeses: 0, precioInicial: 650,
      cochera: true, cocheraMonto: 0,
      deposito: { monto: 650, moneda: 'USD', devuelto: false },
      notas: 'Cochera incluida en el precio.', overrides: {}, meses: {},
    },
    {
      id: uid(), nombre: 'Lavalle 900 2°B',
      inquilino: { nombre: 'Carla Méndez', dni: '35.888.444', mail: 'carla@example.com', telefono: '' },
      desde: '2024-11', hasta: '2026-10',
      ajuste: 'ipc', cadaMeses: 3, precioInicial: 380000,
      cochera: false, cocheraMonto: 0,
      deposito: { monto: 380000, moneda: 'ARS', devuelto: false },
      notas: '', overrides: {}, meses: {},
    },
  ];

  // marcar como pagados/facturados los meses pasados (menos uno, para ver la alerta de morosidad)
  for (const d of ejemplos) {
    for (const m of ymRange(d.desde, d.hasta)) {
      if (ymToNum(m) >= ymToNum(MES_ACTUAL)) break;
      d.meses[m] = { pago: true, fechaPago: m + '-05', factura: true };
    }
  }
  delete ejemplos[2].meses[addMeses(MES_ACTUAL, -1)]; // Carla debe el mes pasado

  state.deptos.push(...ejemplos);
  guardar();
}

/* ================= Formulario de departamento ================= */

function abrirFormulario(d) {
  const f = $('#form-depto');
  f.reset();
  f.elements.id.value = d?.id || '';
  $('#dlg-depto-titulo').textContent = d ? 'Editar departamento' : 'Nuevo departamento';
  if (d) {
    f.elements.nombre.value = d.nombre || '';
    f.elements.inqNombre.value = d.inquilino?.nombre || '';
    f.elements.inqDni.value = d.inquilino?.dni || '';
    f.elements.inqMail.value = d.inquilino?.mail || '';
    f.elements.inqTel.value = d.inquilino?.telefono || '';
    f.elements.desde.value = d.desde || '';
    f.elements.hasta.value = d.hasta || '';
    f.elements.ajuste.value = d.ajuste || 'ipc';
    f.elements.calculo.value = d.calculo || 'simple';
    f.elements.cadaMeses.value = d.cadaMeses || 4;
    f.elements.precioInicial.value = d.precioInicial ?? '';
    f.elements.cochera.checked = !!d.cochera;
    f.elements.cocheraMonto.value = d.cocheraMonto || '';
    f.elements.depMonto.value = d.deposito?.monto || '';
    f.elements.depMoneda.value = d.deposito?.moneda || 'ARS';
    f.elements.depDevuelto.checked = !!d.deposito?.devuelto;
    f.elements.notas.value = d.notas || '';
  } else {
    f.elements.ajuste.value = 'ipc';
    f.elements.calculo.value = 'simple';
    f.elements.cadaMeses.value = 4;
    f.elements.depMoneda.value = 'ARS';
  }
  actualizarFormAjuste();
  $('#dlg-depto').showModal();
}

function actualizarFormAjuste() {
  const f = $('#form-depto');
  const tipo = f.elements.ajuste.value;
  $('#campo-cada-meses').style.display = tipo === 'ipc' ? '' : 'none';
  $('#campo-calculo').style.display = tipo === 'ipc' ? '' : 'none';
  $('#label-precio').textContent = tipo === 'usd' ? 'Alquiler mensual (USD)' : 'Alquiler inicial ($)';
}

function guardarFormulario(f) {
  const id = f.elements.id.value;
  const existente = id ? state.deptos.find(x => x.id === id) : null;
  const d = existente || { id: uid(), overrides: {}, meses: {} };

  d.nombre = f.elements.nombre.value.trim();
  d.inquilino = {
    nombre: f.elements.inqNombre.value.trim(),
    dni: f.elements.inqDni.value.trim(),
    mail: f.elements.inqMail.value.trim(),
    telefono: f.elements.inqTel.value.trim(),
  };
  d.desde = f.elements.desde.value;
  d.hasta = f.elements.hasta.value;
  d.ajuste = f.elements.ajuste.value;
  d.calculo = f.elements.calculo.value;
  d.cadaMeses = Math.max(1, parseInt(f.elements.cadaMeses.value, 10) || 4);
  d.precioInicial = parseMonto(f.elements.precioInicial.value) || 0;
  d.cochera = f.elements.cochera.checked;
  d.cocheraMonto = parseMonto(f.elements.cocheraMonto.value) || 0;
  d.deposito = {
    monto: parseMonto(f.elements.depMonto.value) || 0,
    moneda: f.elements.depMoneda.value,
    devuelto: f.elements.depDevuelto.checked,
  };
  d.notas = f.elements.notas.value.trim();

  if (!d.nombre) { alert('Poné un nombre o dirección para identificar el departamento.'); return false; }
  if (!d.desde || !d.hasta || ymToNum(d.hasta) < ymToNum(d.desde)) {
    alert('Revisá las fechas del contrato: "hasta" tiene que ser posterior a "desde".'); return false;
  }
  if (!existente) state.deptos.push(d);
  guardar();
  return true;
}

/* ================= Acciones ================= */

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const { action, id, mes, tab } = el.dataset;
  const depto = id ? state.deptos.find(x => x.id === id) : null;

  switch (action) {
    case 'tab':
      ev.preventDefault();
      tabActiva = tab;
      render();
      break;

    case 'mes-prev': mesCobros = addMeses(mesCobros, -1); render(); break;
    case 'mes-next': mesCobros = addMeses(mesCobros, 1); render(); break;
    case 'mes-hoy':  mesCobros = MES_ACTUAL; render(); break;

    case 'toggle-pago': {
      if (!depto) break;
      depto.meses = depto.meses || {};
      const reg = depto.meses[mes] || (depto.meses[mes] = {});
      reg.pago = !reg.pago;
      reg.fechaPago = reg.pago ? new Date().toISOString().slice(0, 10) : '';
      guardar();
      break;
    }
    case 'toggle-factura': {
      if (!depto) break;
      depto.meses = depto.meses || {};
      const reg = depto.meses[mes] || (depto.meses[mes] = {});
      reg.factura = !reg.factura;
      guardar();
      break;
    }

    case 'nuevo-depto': abrirFormulario(null); break;
    case 'editar-depto': if (depto) abrirFormulario(depto); break;
    case 'borrar-depto':
      if (depto && confirm(`¿Borrar "${depto.nombre}" con todo su historial?`)) {
        state.deptos = state.deptos.filter(x => x.id !== id);
        guardar();
      }
      break;
    case 'detalle-depto':
      if (depto) {
        detalleId = id;
        $('#detalle-body').innerHTML = htmlDetalle(depto);
        $('#dlg-detalle').showModal();
      }
      break;

    case 'override': {
      if (!depto) break;
      const p = calcularPrecios(depto)[mes];
      const resp = prompt(
        `Precio pactado de ${depto.nombre} desde ${ymLabel(mes)} (sin cochera).\n` +
        `Calculado: ${money(p.alquiler, monedaDe(depto))}`,
        p.alquiler);
      if (resp == null) break;
      const v = parseMonto(resp);
      if (isNaN(v) || v <= 0) { alert('No entendí ese monto.'); break; }
      depto.overrides = depto.overrides || {};
      depto.overrides[mes] = Math.round(v);
      guardar();
      break;
    }
    case 'quitar-override':
      if (depto && depto.overrides) { delete depto.overrides[mes]; guardar(); }
      break;

    case 'ipc-fetch': fetchIpc(); break;

    case 'salir':
      if (confirm('¿Cerrar sesión? Tus datos quedan guardados en la nube.')) nubeSalir();
      break;

    case 'restaurar-seed':
      if (typeof DATOS_INICIALES === 'undefined') { alert('No hay datos del Excel cargados en la app.'); break; }
      if (confirm('Esto reemplaza TODOS los departamentos y marcas de pago por los importados del Excel. ¿Seguir?')) {
        const seed = JSON.parse(JSON.stringify(DATOS_INICIALES));
        state.deptos = seed.deptos;
        state.ipc = { ...IPC_BASE, ...(seed.ipc || {}) };
        guardar();
      }
      break;

    case 'export-json': exportJson(); break;
    case 'export-csv': exportCsv(); break;
    case 'import-json': $('#file-import').click(); break;
    case 'ejemplo': cargarEjemplo(); break;
    case 'wipe':
      if (confirm('¿Borrar TODOS los datos de la app? (los backups descargados no se tocan)') &&
          confirm('¿Seguro? Esta acción no se puede deshacer.')) {
        localStorage.removeItem(LS_KEY);
        state = cargarEstado();
        render();
      }
      break;
  }
});

// edición de celdas de IPC
document.addEventListener('change', ev => {
  const inp = ev.target.closest('input[data-ipc]');
  if (inp) {
    const k = inp.dataset.ipc;
    if (inp.value === '') delete state.ipc[k];
    else state.ipc[k] = redondearIpc(parseFloat(inp.value));
    persistir(); // sin re-render para no perder el foco
    return;
  }
  if (ev.target.id === 'file-import' && ev.target.files[0]) {
    importJson(ev.target.files[0]);
    ev.target.value = '';
  }
  if (ev.target.name === 'ajuste') actualizarFormAjuste();
});

// formulario
$('#form-depto').addEventListener('submit', ev => {
  ev.preventDefault();
  if (guardarFormulario(ev.target)) $('#dlg-depto').close();
});
$$('.cerrar-dlg').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$('#dlg-detalle').addEventListener('close', () => { detalleId = null; });

/* ================= Arranque (con o sin nube) ================= */

function mostrarLogin() {
  document.body.classList.add('modo-login');
  $('#login-pantalla').hidden = false;
}

$('#form-login').addEventListener('submit', async ev => {
  ev.preventDefault();
  const f = ev.target;
  const btn = f.querySelector('button[type=submit]');
  $('#login-error').textContent = '';
  btn.disabled = true;
  btn.textContent = 'Entrando…';
  try {
    await nubeLogin(f.elements.usuario.value, f.elements.password.value);
    location.reload();
  } catch (e) {
    $('#login-error').textContent = e.message;
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

async function iniciar() {
  if (!nubeActiva()) { render(); return; }
  if (!haySesion()) { mostrarLogin(); return; }

  document.body.classList.add('con-nube');
  ponerEstadoNube('cargando');
  try {
    const remoto = await nubeTraerEstado();
    const remotoTieneDatos = remoto && Array.isArray(remoto.deptos) && remoto.deptos.length;
    if (remotoTieneDatos) {
      remoto.ipc = { ...IPC_BASE, ...(remoto.ipc || {}) };
      state = remoto;
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } else if (state.deptos.length) {
      // la nube está vacía y acá hay datos: subirlos (primera sincronización).
      // Nunca al revés: una nube vacía no pisa datos locales.
      await nubeEmpujarEstado(state);
    }
    ponerEstadoNube('ok');
  } catch (e) {
    if (!haySesion()) { mostrarLogin(); return; } // la sesión venció
    ponerEstadoNube('offline'); // sin internet: se trabaja con la copia local
  }
  render();
}

iniciar();
