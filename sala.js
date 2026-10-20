// Estado en memoria de la sala global y las reglas que lo modifican.
// Las funciones lanzan un Error con un mensaje en español si algo no es válido.

const PALETA = ['#ff3fa4', '#2fe6ff', '#ffc247']; // magenta, cian, dorado
const TIPOS = ['percusion', 'armonia', 'melodia'];
const SUBDIVISIONES = ['corchea', 'tresillo', 'semicorchea', 'quintillo'];
const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MODOS = ['mayor', 'menor', 'dorico', 'frigio', 'lidio', 'mixolidio', 'locrio', 'pentatonica', 'blues'];
const RADIO_MAX = 12; // las piezas no pueden salir de este radio
const TEMPO_MIN = 40;
const TEMPO_MAX = 240;

// Parámetros básicos por tipo de instrumento (ver CLAUDE.md).
const PARAMETROS_BASE = {
  percusion: { sonido: 'kick', pitch: 0, decay: 0.3, volumen: 0.8 },
  armonia: {
    acorde: 'triada', inversion: 0,
    ataque: 0.05, decaimiento: 0.3, sostenido: 0.6, relajacion: 0.8,
    cutoff: 2000, volumen: 0.7,
  },
  melodia: {
    notas: [0, 2, 4, 2], // grados dentro de la escala global
    ataque: 0.01, decaimiento: 0.2, sostenido: 0.5, relajacion: 0.4,
    cutoff: 3000, glide: 0, volumen: 0.7,
  },
};

const estado = {
  tempo: 120,
  escala: { tonica: 'C', modo: 'menor' },
  tripulantes: [],
  instrumentos: [],
};

let contadorTripulantes = 0;
let contadorInstrumentos = 0;

// --- Tripulantes ---

function buscarTripulante(id) {
  return estado.tripulantes.find((t) => t.id === id);
}

function mezclarColores(a, b, t) {
  const ca = parseInt(a.slice(1), 16);
  const cb = parseInt(b.slice(1), 16);
  const canal = (c, s) => (c >> s) & 255;
  const mix = (s) => Math.round(canal(ca, s) + (canal(cb, s) - canal(ca, s)) * t);
  return '#' + ((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0');
}

// Primero usa los tres colores puros; si ya están ocupados, genera mezclas
// entre ellos (siempre dentro de la paleta) hasta encontrar uno libre.
function colorLibre() {
  const usados = new Set(estado.tripulantes.map((t) => t.color));
  for (const c of PALETA) if (!usados.has(c)) return c;
  for (let divisiones = 2; divisiones < 64; divisiones *= 2) {
    for (let k = 1; k < divisiones; k += 2) {
      for (let i = 0; i < PALETA.length; i++) {
        const c = mezclarColores(PALETA[i], PALETA[(i + 1) % PALETA.length], k / divisiones);
        if (!usados.has(c)) return c;
      }
    }
  }
  return PALETA[contadorTripulantes % PALETA.length];
}

function agregarTripulante(id) {
  contadorTripulantes += 1;
  const tripulante = {
    id,
    indicativo: 'TRIPULANTE ' + String(contadorTripulantes).padStart(2, '0'),
    color: colorLibre(),
  };
  estado.tripulantes.push(tripulante);
  return tripulante;
}

// Quita al tripulante y todos sus instrumentos. Devuelve lo eliminado.
function quitarTripulante(id) {
  const tripulante = buscarTripulante(id);
  if (!tripulante) return null;
  estado.tripulantes = estado.tripulantes.filter((t) => t.id !== id);
  const instrumentosEliminados = estado.instrumentos.filter((i) => i.dueno === id).map((i) => i.id);
  estado.instrumentos = estado.instrumentos.filter((i) => i.dueno !== id);
  return { id, instrumentosEliminados };
}

// --- Validación ---

function numero(valor, nombre) {
  const n = Number(valor);
  if (valor === null || valor === '' || !Number.isFinite(n)) throw new Error(`${nombre} debe ser un número`);
  return n;
}

function limitarAlRadio(x, z) {
  const d = Math.hypot(x, z);
  if (d <= RADIO_MAX) return { x, z };
  return { x: (x / d) * RADIO_MAX, z: (z / d) * RADIO_MAX };
}

function validarPasos(pasos) {
  const n = numero(pasos, 'pasos');
  if (!Number.isInteger(n) || n < 1 || n > 32) throw new Error('pasos debe ser un entero entre 1 y 32');
  return n;
}

// Ajusta el patrón al número de pasos: recorta o rellena con false.
function ajustarPatron(patron, pasos) {
  const base = Array.isArray(patron) ? patron.map(Boolean) : [];
  return Array.from({ length: pasos }, (_, i) => base[i] || false);
}

// Solo acepta claves conocidas y del mismo tipo que el valor por defecto.
function mezclarParametros(actuales, cambios) {
  if (!cambios || typeof cambios !== 'object') return actuales;
  const resultado = { ...actuales };
  for (const [clave, valor] of Object.entries(cambios)) {
    if (!(clave in actuales)) continue;
    const base = actuales[clave];
    if (Array.isArray(base)) {
      if (Array.isArray(valor) && valor.every((v) => Number.isFinite(Number(v)))) {
        resultado[clave] = valor.map(Number);
      }
    } else if (typeof base === 'number') {
      if (Number.isFinite(Number(valor))) resultado[clave] = Number(valor);
    } else if (typeof base === typeof valor) {
      resultado[clave] = valor;
    }
  }
  return resultado;
}

// --- Instrumentos ---

function buscarPropio(duenoId, id) {
  const instrumento = estado.instrumentos.find((i) => i.id === id);
  if (!instrumento) throw new Error('El instrumento no existe');
  if (instrumento.dueno !== duenoId) throw new Error('Solo el dueño puede modificar este instrumento');
  return instrumento;
}

function agregarInstrumento(duenoId, datos) {
  if (!TIPOS.includes(datos.tipo)) throw new Error('tipo debe ser percusion, armonia o melodia');
  const pasos = datos.pasos === undefined ? 16 : validarPasos(datos.pasos);
  const { x, z } = limitarAlRadio(
    datos.x === undefined ? 0 : numero(datos.x, 'x'),
    datos.z === undefined ? 0 : numero(datos.z, 'z'),
  );
  contadorInstrumentos += 1;
  const instrumento = {
    id: 'inst-' + contadorInstrumentos,
    tipo: datos.tipo,
    dueno: duenoId,
    x,
    z,
    pasos,
    subdivision: SUBDIVISIONES.includes(datos.subdivision) ? datos.subdivision : 'semicorchea',
    patron: ajustarPatron(datos.patron, pasos),
    parametros: mezclarParametros(structuredClone(PARAMETROS_BASE[datos.tipo]), datos.parametros),
  };
  estado.instrumentos.push(instrumento);
  return instrumento;
}

// Cambia pasos, subdivisión, patrón y/o parámetros. No cambia tipo, dueño ni posición.
function editarInstrumento(duenoId, id, cambios) {
  const instrumento = buscarPropio(duenoId, id);
  if (cambios.pasos !== undefined) instrumento.pasos = validarPasos(cambios.pasos);
  if (cambios.subdivision !== undefined) {
    if (!SUBDIVISIONES.includes(cambios.subdivision)) throw new Error('subdivisión no válida');
    instrumento.subdivision = cambios.subdivision;
  }
  instrumento.patron = ajustarPatron(
    cambios.patron !== undefined ? cambios.patron : instrumento.patron,
    instrumento.pasos,
  );
  instrumento.parametros = mezclarParametros(instrumento.parametros, cambios.parametros);
  return instrumento;
}

function moverInstrumento(duenoId, id, x, z) {
  const instrumento = buscarPropio(duenoId, id);
  const pos = limitarAlRadio(numero(x, 'x'), numero(z, 'z'));
  instrumento.x = pos.x;
  instrumento.z = pos.z;
  return instrumento;
}

function eliminarInstrumento(duenoId, id) {
  buscarPropio(duenoId, id);
  estado.instrumentos = estado.instrumentos.filter((i) => i.id !== id);
}

// --- Globales (cualquiera puede cambiarlos) ---

function cambiarTempo(tempo) {
  const n = numero(tempo, 'tempo');
  if (n < TEMPO_MIN || n > TEMPO_MAX) throw new Error(`tempo debe estar entre ${TEMPO_MIN} y ${TEMPO_MAX} BPM`);
  estado.tempo = n;
  return n;
}

function cambiarEscala({ tonica, modo }) {
  const nueva = { ...estado.escala };
  if (tonica !== undefined) {
    if (!NOTAS.includes(tonica)) throw new Error('tónica no válida (usa C, C#, D…)');
    nueva.tonica = tonica;
  }
  if (modo !== undefined) {
    if (!MODOS.includes(modo)) throw new Error('modo no válido: ' + MODOS.join(', '));
    nueva.modo = modo;
  }
  estado.escala = nueva;
  return nueva;
}

module.exports = {
  estado,
  buscarTripulante,
  agregarTripulante,
  quitarTripulante,
  agregarInstrumento,
  editarInstrumento,
  moverInstrumento,
  eliminarInstrumento,
  cambiarTempo,
  cambiarEscala,
};
