const $ = id => document.getElementById(id);
const moneda = n => '$' + Number(n).toLocaleString('es-CO', { maximumFractionDigits: 2 });
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function mostrarMensaje(texto, tipo) {
  const m = $('mensaje');
  m.textContent = texto;
  m.className = 'mensaje ' + (tipo || '');
}

// ---------- Filas de productos ----------
function agregarFila(d = {}) {
  const fila = document.createElement('div');
  fila.className = 'fila';
  fila.innerHTML = `
    <input type="text" placeholder="Ej: Brownie" class="producto" value="${esc(d.producto || '')}">
    <input type="number" placeholder="1" class="cantidad" min="1" step="1" value="${d.cantidad || ''}">
    <input type="number" placeholder="0.00" class="precio" min="0" step="any" value="${d.precio_unitario || ''}">
    <button type="button" class="quitar" title="Quitar">✕</button>`;
  fila.querySelector('.quitar').onclick = () => {
    if (document.querySelectorAll('#items .fila').length > 1) fila.remove();
  };
  $('items').appendChild(fila);
}

// ---------- Validación en cliente ----------
function leerItems() {
  let valido = true;
  const items = [];
  document.querySelectorAll('#items .fila').forEach(f => {
    const p = f.querySelector('.producto'), c = f.querySelector('.cantidad'), pr = f.querySelector('.precio');
    const okP = p.value.trim() !== '';
    const okC = c.value !== '' && Number.isInteger(Number(c.value)) && Number(c.value) > 0;
    const okPr = Number(pr.value) > 0;
    p.classList.toggle('invalido', !okP);
    c.classList.toggle('invalido', !okC);
    pr.classList.toggle('invalido', !okPr);
    if (!okP || !okC || !okPr) valido = false;
    items.push({ producto: p.value.trim(), cantidad: Number(c.value), precio_unitario: Number(pr.value) });
  });
  return valido ? items : null;
}

// ---------- Vista previa de imágenes ----------
$('imagenes').addEventListener('change', e => {
  $('preview').innerHTML = '';
  [...e.target.files].forEach(file => {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    $('preview').appendChild(img);
  });
});

// ---------- Guardar venta ----------
$('form-venta').addEventListener('submit', async e => {
  e.preventDefault();
  const items = leerItems();
  if (!items) return mostrarMensaje('Revisa los campos en rojo: producto obligatorio, cantidad entera > 0 y precio > 0.', 'error');

  const datos = new FormData();
  datos.append('items', JSON.stringify(items));
  [...$('imagenes').files].forEach(f => datos.append('imagenes', f));

  try {
    const r = await fetch('/api/ventas', { method: 'POST', body: datos });
    const j = await r.json();
    if (!r.ok) return mostrarMensaje(j.error, 'error');
    $('form-venta').reset();
    $('preview').innerHTML = '';
    $('items').innerHTML = '';
    agregarFila();
    mostrarMensaje('Venta registrada ✔', 'ok');
    cargarTodo();
  } catch {
    mostrarMensaje('No se pudo conectar con el servidor.', 'error');
  }
});

// ---------- Resumen e historial ----------
async function cargarResumen() {
  const r = await (await fetch('/api/resumen')).json();
  $('kpi-total').textContent = moneda(r.total);
  $('kpi-trans').textContent = r.transacciones;
  const max = Math.max(...r.top.map(t => t.unidades), 1);
  $('top').innerHTML = r.top.length
    ? r.top.map(t => `<div class="barra"><span class="nombre">${esc(t.producto)}</span>
        <div class="relleno" style="width:${(t.unidades / max) * 50}%"></div>
        <span>${t.unidades} u · ${moneda(t.recaudado)}</span></div>`).join('')
    : '<p class="vacio">Aún no hay ventas.</p>';
}

async function cargarHistorial() {
  const ventas = await (await fetch('/api/ventas')).json();
  $('historial').innerHTML = ventas.length ? ventas.map(v => `
    <div class="venta">
      <div class="venta-cab"><strong>Venta #${v.id} · ${esc(v.fecha)} · ${moneda(v.total)}</strong>
        <button class="quitar" onclick="eliminarVenta(${v.id})" title="Eliminar">🗑</button></div>
      <table><tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr>
      ${v.items.map(i => `<tr><td>${esc(i.producto)}</td><td>${i.cantidad}</td><td>${moneda(i.precio_unitario)}</td><td>${moneda(i.cantidad * i.precio_unitario)}</td></tr>`).join('')}
      </table>
      ${v.imagenes.length ? `<div class="miniaturas">${v.imagenes.map(u => `<a href="${u}" target="_blank"><img src="${u}" alt="Imagen de venta"></a>`).join('')}</div>` : ''}
    </div>`).join('') : '<p class="vacio">Sin transacciones todavía.</p>';
}

async function eliminarVenta(id) {
  if (!confirm('¿Eliminar la venta #' + id + '?')) return;
  await fetch('/api/ventas/' + id, { method: 'DELETE' });
  cargarTodo();
}

function cargarTodo() { cargarResumen(); cargarHistorial(); }

$('btn-agregar').onclick = () => agregarFila();

// ---------- Lectura con IA ----------
$('btn-ia').addEventListener('click', async () => {
  const archivos = [...$('imagenes').files];
  if (!archivos.length) return mostrarMensaje('Primero selecciona al menos una imagen.', 'error');

  const btn = $('btn-ia');
  btn.disabled = true;
  let leidos = 0;
  for (const [i, archivo] of archivos.entries()) {
    mostrarMensaje(`Leyendo imagen ${i + 1} de ${archivos.length} con IA...`);
    const datos = new FormData();
    datos.append('imagen', archivo);
    try {
      const r = await fetch('/api/leer-imagen', { method: 'POST', body: datos });
      const j = await r.json();
      if (!r.ok) { mostrarMensaje(j.error, 'error'); btn.disabled = false; return; }
      // Si la única fila está vacía, se reemplaza
      const filas = document.querySelectorAll('#items .fila');
      if (filas.length === 1 && !filas[0].querySelector('.producto').value.trim()) filas[0].remove();
      j.items.forEach(it => agregarFila(it));
      leidos += j.items.length;
    } catch {
      mostrarMensaje('No se pudo conectar con el servidor.', 'error');
      btn.disabled = false;
      return;
    }
  }
  btn.disabled = false;
  if (!document.querySelector('#items .fila')) agregarFila();
  mostrarMensaje(leidos ? `La IA encontró ${leidos} producto(s). Revisa los datos antes de guardar.` : 'La IA no encontró productos legibles. Ingrésalos manualmente.', leidos ? 'ok' : 'error');
});
agregarFila();
cargarTodo();
