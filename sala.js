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

const GRADOS = 7; // filas de la cuadrícula de armonía y melodía: grados 0 a 6 de la escala global

// Parámetros por tipo de instrumento: una lista de opciones o un rango [mínimo, máximo].
// Lo que llegue fuera de rango se recorta; las claves desconocidas se ignoran.
const ADSR = { ataque: [0.001, 2], decaimiento: [0.01, 2], sostenido: [0, 1], relajacion: [0.01, 4] };
const ESQUEMA = {
  percusion: { sonido: ['kick', 'snare', 'hat', 'perc'], pitch: [-12, 12], decay: [0.02, 1.5], volumen: [0, 1] },
  armonia: { acorde: ['triada', 'septima', 'sus'], inversion: [0, 2], ...ADSR, cutoff: [100, 12000], volumen: [0, 1] },
  melodia: { ...ADSR, cutoff: [100, 12000], glide: [0, 0.5], volumen: [0, 1] },
};
const ENTEROS = new Set(['inversion', 'pitch']);

// Valores por defecto: cada módulo suena bien en cuanto se acopla.
// La percusión rota entre kick, hat, snare y perc según cuántas haya ya en la sala.
const SONIDOS_EN_ORDEN = ['kick', 'hat', 'snare', 'perc'];
const DECAY_PERC = { kick: 0.4, snare: 0.18, hat: 0.05, perc: 0.25 };
const PATRON_PERC = { // x = golpe, en 16 semicorcheas (un compás)
  kick: 'x...x...x...x...',
  hat: '..x...x...x...x.',
  snare: '....x.......x...',
  perc: '...x..x....x.x..',
};
const _ = null; // paso sin nota
const POR_DEFECTO = {
  armonia: () => ({ // i – VI – iv – v en corcheas: un acorde cada medio compás, dos compases
    pasos: 16, subdivision: 'corchea',
    patron: [0, _, _, _, 5, _, _, _, 3, _, _, _, 4, _, _, _],
    parametros: { acorde: 'triada', inversion: 0, ataque: 0.08, decaimiento: 0.4, sostenido: 0.5, relajacion: 1.2, cutoff: 1800, volumen: 0.7 },
  }),
  melodia: () => ({ // arpegio en semicorcheas que sigue los acordes de la armonía, dos compases
    pasos: 32, subdivision: 'semicorchea',
    patron: [4, _, 2, _, 0, _, 2, 4, 5, _, 4, _, 2, _, 0, _, 3, _, 5, _, 0, _, 5, 3, 4, _, 6, _, 1, _, 6, 4],
    parametros: { ataque: 0.01, decaimiento: 0.25, sostenido: 0.4, relajacion: 0.3, cutoff: 2500, glide: 0.05, volumen: 0.7 },
  }),
  percusion: () => {
    const cuantas = estado.instrumentos.filter((i) => i.tipo === 'percusion').length;
    const sonido = SONIDOS_EN_ORDEN[cuantas % SONIDOS_EN_ORDEN.length];
    return {
      pasos: 16, subdivision: 'semicorchea',
      patron: [...PATRON_PERC[sonido]].map((c) => c === 'x'),
      parametros: { sonido, pitch: 0, decay: DECAY_PERC[sonido], volumen: 0.8 },
    };
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

// Un paso del patrón. Percusión: encendido/apagado. Armonía y melodía: un grado (0 a 6) o null.
function limpiarPaso(tipo, valor) {
  if (tipo === 'percusion') return Boolean(valor);
  if (valor === null || valor === undefined || valor === false) return null;
  const g = Number(valor);
  return Number.isInteger(g) && g >= 0 && g < GRADOS ? g : null;
}

// Ajusta el patrón al número de pasos. Si se da un patrón nuevo, se recorta o se rellena
// con silencio; si solo cambia el número de pasos, el patrón actual se repite para llenar.
function ajustarPatron(tipo, patron, pasos, repetir = false) {
  const base = Array.isArray(patron) ? patron.map((v) => limpiarPaso(tipo, v)) : [];
  const vacio = tipo === 'percusion' ? false : null;
  return Array.from({ length: pasos }, (_, i) => {
    if (i < base.length) return base[i];
    return repetir && base.length ? base[i % base.length] : vacio;
  });
}

// Aplica los cambios de parámetros según ESQUEMA: opciones válidas y números dentro de su rango.
function mezclarParametros(tipo, actuales, cambios) {
  if (!cambios || typeof cambios !== 'object') return actuales;
  const resultado = { ...actuales };
  for (const [clave, valor] of Object.entries(cambios)) {
    const regla = ESQUEMA[tipo][clave];
    if (!regla) continue;
    if (typeof regla[0] === 'string') {
      if (regla.includes(valor)) resultado[clave] = valor;
    } else if (valor !== null && valor !== '' && Number.isFinite(Number(valor))) {
      let n = Math.min(regla[1], Math.max(regla[0], Number(valor)));
      if (ENTEROS.has(clave)) n = Math.round(n);
      resultado[clave] = n;
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
  const tipo = datos.tipo;
  const base = POR_DEFECTO[tipo]();
  const pasos = datos.pasos === undefined ? base.pasos : validarPasos(datos.pasos);
  const { x, z } = limitarAlRadio(
    datos.x === undefined ? 0 : numero(datos.x, 'x'),
    datos.z === undefined ? 0 : numero(datos.z, 'z'),
  );
  contadorInstrumentos += 1;
  const instrumento = {
    id: 'inst-' + contadorInstrumentos,
    tipo,
    dueno: duenoId,
    x,
    z,
    pasos,
    subdivision: SUBDIVISIONES.includes(datos.subdivision) ? datos.subdivision : base.subdivision,
    patron: ajustarPatron(tipo, datos.patron !== undefined ? datos.patron : base.patron, pasos, datos.patron === undefined),
    parametros: mezclarParametros(tipo, base.parametros, datos.parametros),
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
  const patronNuevo = cambios.patron !== undefined;
  instrumento.patron = ajustarPatron(
    instrumento.tipo,
    patronNuevo ? cambios.patron : instrumento.patron,
    instrumento.pasos,
    !patronNuevo,
  );
  instrumento.parametros = mezclarParametros(instrumento.tipo, instrumento.parametros, cambios.parametros);
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
