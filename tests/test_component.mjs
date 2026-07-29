/**
 * Prueba de regresión de la lógica del dashboard.
 *
 * Extrae la clase Component del diseño editable (la misma que corre en el
 * compilado — la paridad se verifica al final) y la ejecuta con el payload de
 * fixtures/api.sim.json.
 *
 * ESE PAYLOAD YA NO ESTÁ ESCRITO A MANO: se genera ejecutando el
 * apps-script/Code.gs real sobre fixtures/sheets.sim.json (tools/gen-fixture.mjs)
 * y el bloque J vuelve a generarlo para comprobar que sigue siendo una salida
 * que la capa de datos puede producir. La versión anterior contenía filas
 * imposibles —una etapa «Con resolución» sin marca de resolución, marcas sin su
 * campo `…Estado`—, así que las aserciones sobre el contrato pasaban por el
 * camino de respaldo y no por el contrato.
 *
 * Lo que cubre, por bloques:
 *   A. tabla de Proyectos y columnas de etapa (regresión original)
 *   B. trampa de substring: «No factible» NO es Factibilidad favorable
 *   C. marca tri-estado: «En tramitación» no es vacío y no es «No»
 *   D. valor fuera de dominio: se ve, se cuenta y el proyecto NO desaparece
 *   E. la MARCA de resolución manda sobre la presencia de N° o de enlace
 *   F. los enlaces se omiten cuando no existen
 *   G. el descuadre «A&C 6 → 4»: el conteo lo manda el Dictamen
 *   H. salidas documentales: CSV sin fila espuria, .docx y encabezado de página
 *   I. paridad dc-script entre el diseño editable y el compilado
 *   J. la CAPA DE DATOS (apps-script/Code.gs) ejecutada sobre planillas de prueba
 *   K. marco de coherencia entre hitos: una sola redacción en las dos capas
 *   L. alcance e impresión: el encabezado no puede declarar lo que no contiene
 *
 *   node tests/test_component.mjs
 */
import fs from 'fs';
import path from 'path';
import { correrDashboard, cargarAppsScript, hojasDePrueba, leerHojas } from './apps_script_sim.mjs';
import vm from 'vm';

const AQUI = new URL('.', import.meta.url).pathname;
const html = fs.readFileSync(path.join(AQUI, '..', 'Dashboard FNDR L3.dc.html'), 'utf8');
const ini = html.indexOf('class Component extends DCLogic');
let src = html.slice(ini, html.indexOf('</script>', ini));
src = src.slice(0, src.lastIndexOf('}') + 1);

class DCLogic { setState(p) { Object.assign(this.state, typeof p === 'function' ? p(this.state) : p); } }

/* Stubs de plataforma. Los de descarga CAPTURAN lo generado, para poder afirmar
   sobre el contenido real del CSV y del .docx en vez de sobre una
   reimplementación de la exportación dentro de la propia prueba. */
const descargas = [];
class BlobSim {
  constructor(partes, opciones) {
    this.partes = partes;
    this.type = (opciones || {}).type || '';
    this.texto = partes.map(p => (typeof p === 'string' ? p : Buffer.from(p).toString('latin1'))).join('');
  }
}
globalThis.Blob = BlobSim;
globalThis.URL = { createObjectURL: b => { descargas.push(b); return 'blob:sim'; }, revokeObjectURL() { } };
/* window con lo justo. `impresiones` cuenta los print() y `oyentes` guarda lo
   que el componente engancha a beforeprint/afterprint: esa es la ruta que un
   Ctrl+P recorre y la que antes no tenía ninguna cobertura. flushSync se
   simula ejecutando la función en el acto, que es su contrato. */
const impresiones = [];
const oyentes = {};
globalThis.window = {
  location: { search: '' },
  history: { replaceState() { } },
  print() { impresiones.push(Date.now()); },
  addEventListener(tipo, fn) { (oyentes[tipo] = oyentes[tipo] || []).push(fn); },
  removeEventListener(tipo, fn) { oyentes[tipo] = (oyentes[tipo] || []).filter(x => x !== fn); },
  ReactDOM: { flushSync: fn => fn() }
};
globalThis.document = {
  createElement: () => ({ style: {}, click() { }, remove() { } }),
  body: { appendChild() { } },
  head: { appendChild() { } }
};
globalThis.location = globalThis.window.location;
globalThis.DCLogic = DCLogic;

const Component = new Function('DCLogic', 'window', 'document', 'location',
  'return (' + src.replace('class Component extends DCLogic', 'class Component extends DCLogic') + ')'
)(DCLogic, globalThis.window, globalThis.document, globalThis.location);

const api = JSON.parse(fs.readFileSync(path.join(AQUI, 'fixtures', 'api.sim.json'), 'utf8'));
const c = new Component();
c.props = { mostrarMontos: true, apiUrl: '', vistaInicial: 'proyectos' };
/* Las filas entran TAL CUAL las emite la capa de datos. Antes esta línea hacía
   `acuerdoCore: c.yesNo(r.acuerdoCore)`, imitando un load() que normalizaba de
   forma destructiva: yesNo() devolvía '' para todo lo que no fuera sí/no, así
   que «En tramitación» y cualquier valor fuera de dominio se perdían antes de
   que la prueba —o la pantalla— pudieran verlos (D4). load() ya no lo hace, y
   la idempotencia de yesNo() se verifica aparte, en el bloque C. */
c.state.raw = api.data.slice();
c.state.loading = false;
c.state.view = 'proyectos';
c.state.sources = api.sources;

let fail = 0;
const eq = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fail++; };
const crudo = n => api.data.find(r => r.nPostulacion === n);
const vals = () => c.renderVals();

// ===========================================================================
// A. Tabla de Proyectos (regresión original)
// ===========================================================================
const data = vals();
const labels = data.columns.map(x => x.label);
eq(JSON.stringify(labels).includes('"Factibilidad","A&C","Priorización","Estado actual"'),
  'columnas en orden: ' + labels.join(' | '));

const fila = n => data.rows.find(r => r.n === n);
const r16 = fila('16'), rJd = fila('1C'), r45 = fila('45'), r7 = fila('7');

eq(r16.fact === 'HABILITAR FORMULACIÓN DE EXPEDIENTE' && r16.factColor === '#256128', '16: Factibilidad verde con estado real');
eq(r16.ac === 'EVALUACIÓN TÉCNICA FAVORABLE' && r16.acColor === '#256128', '16: A&C dictamen favorable verde');
eq(r16.acSub === 'Favorable · R2', '16: sub A&C «Favorable · R2»');
eq(r16.prio === 'Priorizado CORE' && r16.prioColor === '#5B2A86', '16: Priorización morada');
eq(r16.prioSub.includes('184/2026'), '16: sub priorización con N° de acuerdo');

eq(rJd.fact === 'DESESTIMAR' && rJd.factColor === '#9B1C1C', '1C: Factibilidad DESESTIMAR roja');
eq(rJd.factSub === 'Dominique Plotz', '1C: evaluadora bajo la píldora');
eq(rJd.ac === 'DESESTIMADO POR NO SUBSANACIÓN' && rJd.acColor === '#9B1C1C', '1C: A&C desestimado rojo');
eq(rJd.prio === 'Sin priorizar' && rJd.prioColor === '#8A96A4', '1C: sin priorizar gris');

eq(r45.fact === 'EVALUACIÓN PENDIENTE' && r45.factColor === '#7A5300', '45: Factibilidad pendiente ámbar');
eq(r45.ac === '—', '45: A&C vacío se muestra como —');
eq(r7.prio === 'Sin priorizar', '7: Acuerdo CORE «No» → Sin priorizar');

// Trampas de substring: lo negativo debe ganar.
eq(c.tonoPill('no avanza, con pronunciamiento desfavorable').color === '#9B1C1C', 'tonoPill: «desfavorable» no cae en verde');
eq(c.tonoPill('No factible').color === '#9B1C1C', 'tonoPill: «no factible» no cae en verde');
eq(c.tonoPill('avanza, con pronunciamiento favorable').color === '#256128', 'tonoPill: pronunciamiento favorable verde');

c.state.view = 'panorama';
eq(vals().funnel !== undefined, 'vista Panorama sigue rindiendo');
c.state.view = 'alertas';
eq(Array.isArray(vals().alertCards), 'vista Alertas sigue rindiendo');
c.state.view = 'proyectos';

// ===========================================================================
// B. D1 — la trampa de substring: «No factible» contiene «factible»
// ===========================================================================
const f50 = crudo('50');
eq(!!f50 && f50.estadoFactibilidad === 'No factible', 'fixture: el proyecto 50 trae «No factible»');
eq(c.factFav({ estadoFactibilidad: 'No factible' }) === false, 'factFav: «No factible» NO es Factibilidad favorable');
eq(c.factFav({ estadoFactibilidad: 'No es factible' }) === false, 'factFav: «No es factible» tampoco');
eq(c.factFav({ estadoFactibilidad: 'no avanza, con pronunciamiento desfavorable' }) === false,
  'factFav: «desfavorable» no cuenta como favorable');
eq(c.factFav({ estadoFactibilidad: 'DESESTIMAR' }) === false, 'factFav: DESESTIMAR no es favorable');
eq(c.factFav({ estadoFactibilidad: 'OBSERVAR PARA SUBSANACIÓN' }) === false, 'factFav: OBSERVAR PARA SUBSANACIÓN no es favorable');
eq(c.factFav({ estadoFactibilidad: 'EVALUACIÓN PENDIENTE' }) === false, 'factFav: EVALUACIÓN PENDIENTE no es favorable');
eq(c.factFav({ estadoFactibilidad: 'HABILITAR FORMULACIÓN DE EXPEDIENTE' }) === true, 'factFav: el literal canónico sí es favorable');
eq(c.factFav({ estadoFactibilidad: 'Factible Técnicamente, habilitado para formulación de expediente' }) === true,
  'factFav: la forma de la Nómina Gobernador también es favorable');
eq(c.factFav({ estadoFactibilidad: 'HABILITAR  FORMULACIÓN DE EXPEDIENTE' }) === true,
  'factFav: doble espacio y NBSP no hacen desaparecer un favorable');

const hitoFF = c.MILESTONES[1];
eq(hitoFF.k === 'ff' && hitoFF.test(f50) === false, 'hito «Fact. favorable»: el 50 («No factible») no lo cumple');
eq(hitoFF.test(crudo('16')) === true, 'hito «Fact. favorable»: el 16 sí lo cumple');
const nFF = c.state.raw.filter(r => hitoFF.test(r)).length;
eq(nFF === 5, 'hito «Fact. favorable» = 5 (16, 51, 52, 53, 54) y no incluye al 50: ' + nFF);

const r50 = fila('50');
eq(!!r50, '50: «No factible» NO desaparece de la tabla');
eq(r50.factColor === '#9B1C1C', '50: la píldora de Factibilidad sale roja, no verde');
eq(r50.estado === 'No continúa', '50: el estado actual es «No continúa»');

// ===========================================================================
// C. D4 — marca tri-estado: «En tramitación» no es vacío y no es «No»
// ===========================================================================
eq(c.marcaEstado('Sí') === 'si' && c.marcaEstado('No') === 'no', 'marcaEstado: sí / no');
eq(c.marcaEstado('En tramitación') === 'tramitacion', 'marcaEstado: «En tramitación» tiene estado propio');
eq(c.marcaEstado('En trámite') === 'tramitacion', 'marcaEstado: «En trámite» es la misma marca');
eq(c.marcaEstado('') === 'vacio' && c.marcaEstado(null) === 'vacio', 'marcaEstado: vacío es «vacio», no «no»');
eq(c.marcaEstado('VERDADERO') === 'si', 'marcaEstado: el checkbox de Sheets en es-CL (VERDADERO) se entiende');
eq(c.marcaEstado('en trámite??') === 'desconocido', 'marcaEstado: lo que no está en el dominio es «desconocido», nunca vacío');

eq(c.yesNo('En tramitación') === 'En tramitación', 'yesNo: «En tramitación» ya no se borra');
eq(c.yesNo(c.yesNo('En tramitación')) === 'En tramitación', 'yesNo es idempotente sobre «En tramitación»');
eq(c.yesNo(c.yesNo('VERDADERO')) === 'Sí' && c.yesNo(c.yesNo('No')) === 'No', 'yesNo es idempotente sobre sí / no');
eq(c.yesNo('en trámite??') === 'en trámite??', 'yesNo: un valor fuera de dominio conserva su texto original');
/* El map histórico de esta misma prueba (`acuerdoCore: c.yesNo(r.acuerdoCore)`)
   destruía la marca. Hoy tiene que ser inocuo sobre TODAS las filas. */
const remapeado = api.data.map(r => ({ ...r, acuerdoCore: c.yesNo(r.acuerdoCore) }));
eq(remapeado.every((r, i) => c.marca(r, 'acuerdoCore').estado === c.marca(api.data[i], 'acuerdoCore').estado),
  'el map histórico de la línea 33 ya no altera ningún estado de marca');

const f51 = crudo('51'), f7 = crudo('7'), f1c = crudo('1C');
eq(c.marca(f51, 'acuerdoCore').estado === 'tramitacion', '51: la marca CORE es «tramitacion»');
eq(c.marca(f7, 'acuerdoCore').estado === 'no', '7: la marca CORE es «no»');
eq(c.marca(f1c, 'acuerdoCore').estado === 'vacio', '1C: sin fila de Priorización, la marca CORE es «vacio»');
eq(c.coreOk(f51) === false && c.coreTramite(f51) === true, '51: «En tramitación» NO se cuenta como priorizado');
eq(c.coreOk(f7) === false && c.coreTramite(f7) === false, '7: «No» no es ni priorizado ni en tramitación');

const r51 = fila('51');
eq(r51.prio === 'CORE en tramitación', '51: la columna Priorización dice «CORE en tramitación»');
eq(r7.prio === 'Sin priorizar' && r7.prioSub.includes('Acuerdo CORE: No'), '7: «No» se nombra en el subtítulo');
eq(rJd.prioSub.includes('Sin marca de acuerdo'), '1C: el vacío se nombra «Sin marca de acuerdo»');
eq(r51.prioColor !== r7.prioColor && r7.prioColor !== rJd.prioColor && r51.prioColor !== rJd.prioColor,
  'los tres casos (tramitación / No / vacío) se distinguen por color: ' + [r51.prioColor, r7.prioColor, rJd.prioColor].join(' '));

// El buscador tiene que encontrar lo que está en tramitación.
c.state.q = 'trámite';
const enTramite = vals().rows.map(r => r.n).sort();
c.state.q = '';
eq(JSON.stringify(enTramite) === JSON.stringify(['51', '52']), 'buscar «trámite» encuentra 51 y 52: ' + enTramite.join(','));

// ===========================================================================
// D. T7 — un valor fuera de dominio se hace visible y NO borra el proyecto
// ===========================================================================
const f52 = crudo('52');
eq(f52.acuerdoCoreEstado === 'desconocido' && f52.acuerdoCoreRaw === 'en trámite??',
  'fixture: el 52 trae una marca CORE fuera de dominio con su crudo');
const r52 = fila('52');
eq(!!r52, '52: el proyecto con dato fuera de dominio NO desaparece de la tabla');
eq(c.filtered().some(r => r.nPostulacion === '52'), '52: tampoco desaparece del conjunto filtrado');
eq(r52.prio === 'en trámite??', '52: la columna Priorización muestra el crudo, no un vacío');
eq(r52.prioColor === '#9B1C1C', '52: el valor fuera de dominio se pinta como problema');
eq(c.inconsistencias(f52).some(t => t.includes('en trámite??')), '52: la inconsistencia nombra el valor original');
eq(r52.alertBadge.includes('⌀'), '52: el indicador de la tabla marca el dato roto: ' + r52.alertBadge);
c.state.sel = f52;
const det52 = vals().detFields.find(f => f.k.startsWith('Acuerdo CORE'));
eq(!!det52 && det52.v.includes('en trámite??') && det52.v.includes('fuera de dominio'),
  '52: el expediente rotula la marca como fuera de dominio');
eq(vals().detFields.some(f => f.k === 'Inconsistencias de datos'), '52: el expediente lista las inconsistencias');
c.state.sel = null;
eq(c.marca({ acuerdoCoreEstado: 'desconocido', acuerdoCoreRaw: 'quizá' }, 'acuerdoCore').label === 'quizá',
  'marca(): un «desconocido» se etiqueta con su crudo, nunca con vacío');

// ===========================================================================
// E. D3 — la MARCA de resolución manda sobre el N° y sobre el enlace
// ===========================================================================
const f53 = crudo('53'), f54 = crudo('54');
const hitoRes = c.MILESTONES[5];
eq(hitoRes.k === 'res', 'el hito 6 es «Con resolución»');

eq(c.has(f7.resolucionNumero) && c.has(f7.resolucionUrl), 'fixture: el 7 tiene N° y enlace de resolución');
eq(c.resOk(f7) === false && hitoRes.test(f7) === false, '7: N° + enlace SIN marca no acreditan resolución');
eq(c.inconsistencias(f7).some(t => t.includes('marca de resolución aprobatoria está vacía')),
  '7: el desajuste entre el respaldo y la marca se declara, no se calla');

eq(!c.has(f53.resolucionNumero) && !c.has(f53.resolucionUrl), 'fixture: el 53 no tiene N° ni enlace de resolución');
eq(c.resOk(f53) === true && hitoRes.test(f53) === true, '53: la marca «Sí» acredita resolución aunque no haya enlace');
eq(c.inconsistencias(f53).some(t => t.includes('no hay N° ni enlace de resolución')),
  '53: la falta de respaldo se declara, sin bajar el conteo');

eq(c.has(f54.resolucionNumero) && c.has(f54.resolucionUrl), 'fixture: el 54 tiene N° y enlace de resolución');
eq(c.marca(f54, 'resolucionMarca').estado === 'no', '54: la marca de resolución dice «No»');
eq(c.resOk(f54) === false && hitoRes.test(f54) === false, '54: un «No» explícito gana al N° y al enlace');

const nRes = c.state.raw.filter(r => hitoRes.test(r)).length;
const conRespaldo = c.state.raw.filter(r => c.has(r.resolucionNumero) || c.has(r.resolucionUrl)).length;
eq(nRes === 1 && conRespaldo === 2,
  'el conteo «Con resolución» lo dan las marcas (' + nRes + '), no los respaldos (' + conRespaldo + ')');
eq(f53.etapa === 'Con resolución' && f54.etapa === 'Priorizado/CORE',
  'la capa de datos ya publica la etapa por marca, no por presencia de enlace');

// ===========================================================================
// F. Los enlaces se omiten cuando no existen (y un no-URL no se descarta)
// ===========================================================================
const expediente = r => { c.state.sel = r; const v = vals(); c.state.sel = null; return v; };

eq(expediente(f52).detLinks.length === 0, '52: sin ninguna URL, el expediente no muestra botones de enlace');

const et53 = expediente(f53).detLinks.map(l => l.label);
eq(et53.includes('Enlace acuerdo CORE') && !et53.includes('Enlace resolución aprobatoria'),
  '53: se muestra el enlace del acuerdo y NO se deja hueco por el de la resolución: ' + et53.join(' | '));

const et54 = expediente(f54).detLinks.map(l => l.label);
eq(et54.includes('Enlace resolución aprobatoria') && !et54.includes('Enlace acuerdo CORE'),
  '54: al revés — sólo el enlace que existe: ' + et54.join(' | '));

const v1c = expediente(f1c);
eq(v1c.detLinks.length > 0 && v1c.detLinks.every(l => /^https?:\/\//i.test(l.url)),
  '1C: todo lo que llega a detLinks es una URL de verdad');
eq(!v1c.detLinks.some(l => l.label === 'PDF A&C'), '1C: «pdf-judo-ac» no se ofrece como enlace');
eq(v1c.detFields.some(f => f.k === 'PDF A&C (referencia)' && f.v === 'pdf-judo-ac'),
  '1C: pero tampoco se descarta en silencio — se muestra como referencia');
eq(v1c.detFields.some(f => f.k === 'RUT institución' && f.v === '65.111.222-3'),
  '1C: el RUT se lee de rutInstitucion y ya no sale «—»');

// ===========================================================================
// G. El descuadre «A&C 6 → 4»: el conteo lo manda el Dictamen (col. L)
// ===========================================================================
const diag = api.sources.diagnosticoAC;
eq(c.acFav(f51) === true, '51: dictamen favorable con «Estado proyecto» vacío SIGUE siendo A&C favorable');
eq(c.acFav(crudo('16')) === true && c.acFav(f1c) === false, 'acFav: el 16 sí, el desestimado 1C no');
eq(c.acFav({ dictamenAC: 'EVALUACIÓN TÉCNICA FAVORABLE', estadoAC: 'Aprobado' }) === true,
  'acFav: un «Estado proyecto» con otro literal ya no resta');
eq(c.acFav({ dictamenAC: 'CON OBSERVACIONES', estadoAC: 'Favorable' }) === false,
  'acFav: manda el dictamen, no la columna derivada');
const nAcFav = c.state.raw.filter(r => c.acFav(r)).length;
eq(nAcFav === diag.conDictamenFavorable,
  'A&C favorable = ' + nAcFav + ' = conDictamenFavorable del diagnóstico');
eq(nAcFav !== diag.conDictamenYEstadoFavorable,
  'y ya NO es el ' + diag.conDictamenYEstadoFavorable + ' del criterio de dos columnas (el descuadre)');

// La etiqueta de fuentes distingue «0 filas» de «0 marcas».
const fuentes = c.fuentesTexto();
eq(fuentes.includes('con acuerdo') && fuentes.includes('en tramitación'),
  'el pie de fuentes separa filas de marcas: ' + fuentes);

// ===========================================================================
// H. Salidas documentales
// ===========================================================================
c.state.q = ''; c.state.hito = ''; c.state.alcanceExport = 'filtrados';
descargas.length = 0;
c.exportCsv();
eq(descargas.length === 1, 'exportCsv genera exactamente un archivo');
const csv = descargas[0].texto.replace(/^﻿/, '');
const lineas = csv.split('\n');
eq(lineas.length === 1 + api.data.length,
  'D7: el CSV tiene 1 encabezado + ' + api.data.length + ' proyectos y ninguna fila espuria (' + lineas.length + ' líneas)');
eq(!/^"Estado actual";"Alertas"$/.test(lineas[lineas.length - 1]),
  'D7: la última línea es un proyecto, no el par «Estado actual»;«Alertas»');
const cab = lineas[0];
eq(cab.includes('"Acuerdo CORE (marca)"') && cab.includes('"Resolución aprobatoria (marca)"') && cab.includes('"Inconsistencias de datos"'),
  'el CSV exporta las marcas y las inconsistencias');
const linea = n => lineas.find(l => l.startsWith('"' + n + '";'));
eq(linea('51').includes('"En tramitación"'), '51: el CSV conserva «En tramitación» (antes salía celda vacía)');
eq(linea('51').includes('"tramitacion"'), '51: y su estado de marca, legible por máquina');
eq(linea('52').includes('en trámite?? (fuera de dominio)'), '52: el CSV muestra el crudo fuera de dominio');
eq(linea('7').includes('"vacio"'), '7: el CSV declara vacía la marca de resolución pese al N° y al enlace');
eq(/^fndr-l3-cartera-filtrados-\d{4}-\d{2}-\d{2}\.csv$/.test(c.nombreArchivo('filtrados', 'csv')),
  'el nombre del CSV lleva alcance y fecha: ' + c.nombreArchivo('filtrados', 'csv'));

const docx = c.exportDocx('todos', { descargar: false });
const firma = Buffer.from(docx.bytes.slice(0, 2)).toString('latin1');
eq(firma === 'PK', 'exportDocx produce un ZIP real (firma ' + JSON.stringify(firma) + ')');
eq(docx.n === api.data.length, 'exportDocx con alcance «todos» incluye los ' + docx.n + ' proyectos');
eq(/^fndr-l3-cartera-todos-\d{4}-\d{2}-\d{2}\.docx$/.test(docx.nombre), 'nombre del .docx: ' + docx.nombre);
const doc = Buffer.from(docx.bytes).toString('utf8');
eq(doc.includes('word/document.xml') && doc.includes('[Content_Types].xml'), 'el .docx trae las partes OPC obligatorias');
eq(doc.includes('En tramitación'), 'el .docx conserva «En tramitación»');

// ===========================================================================
// I. Paridad: el dc-script del compilado debe ser idéntico al del diseño
// ===========================================================================
const compilado = fs.readFileSync(path.join(AQUI, '..', 'index.html'), 'utf8');
const desescapar = t => t.replace(/\\\\/g, '\u0000').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\u0000/g, '\\');
/* El corte termina en la ÚLTIMA aparición de onCloseBackdrop, no en la primera
   a partir del marcador: la primera está en el markup (`{{ onCloseBackdrop }}`)
   y si algún día apareciera otra dentro del JS, el corte se truncaría en
   silencio y la paridad pasaría siendo falsa. */
const corte = (t) => t.slice(t.indexOf('class Component extends DCLogic'), t.lastIndexOf('onCloseBackdrop'));
const claro = desescapar(compilado);
eq(corte(claro) === corte(html), 'paridad dc-script: compilado ≡ diseño editable');
const colaIni = html.lastIndexOf('onCloseBackdrop');
const cola = html.slice(colaIni, html.indexOf('</script>', colaIni));
eq(claro.includes(cola), 'paridad: también el cierre de la clase, tras el último onCloseBackdrop');
eq((compilado.match(/class Component extends DCLogic/g) || []).length === 1,
  'index.html contiene una sola copia del dc-script');

/* Guardas del escape del bundler, para que el test las cace antes que el
   despliegue: dentro de la clase, «</» se compila a «</» y los caracteres
   de control se escapan — desescapar() no revierte ni lo uno ni lo otro. */
const region = corte(html);
eq(!/<\//.test(region), 'el dc-script no contiene «</» (rompería la paridad al compilar)');
eq(!/[\t\r\f\v\u2028\u2029]/.test(region), 'el dc-script no contiene TAB/CR/FF/VT/LS/PS literales');

// ===========================================================================
// J. LA CAPA DE DATOS — apps-script/Code.gs ejecutado de verdad
// ===========================================================================
/* Hasta acá no existía NINGUNA prueba de Code.gs: todo lo que decide la capa de
   datos —qué columna es la marca, qué pasa cuando dos filas colapsan en el mismo
   folio, cuándo un valor sale del dominio— sólo se podía verificar leyendo el
   archivo. tests/apps_script_sim.mjs ejecuta el archivo REAL contra una planilla
   simulada. */

// J.1 — el fixture es una salida que el Code.gs vigente puede producir.
const regenerado = correrDashboard(leerHojas('tests/fixtures/sheets.sim.json')).payload;
eq(JSON.stringify(regenerado) === JSON.stringify(api),
  'J.1 fixture: api.sim.json ES la salida de Code.gs sobre sheets.sim.json');
const ESTADOS = ['si', 'no', 'tramitacion', 'vacio', 'desconocido'];
eq(api.data.every(p => ESTADOS.includes(p.acuerdoCoreEstado) && ESTADOS.includes(p.resolucionMarcaEstado)),
  'J.1 fixture: TODAS las filas traen los dos estados de marca del contrato');
eq(api.data.filter(p => p.etapa === 'Con resolución').length === api.data.filter(p => p.resolucionMarcaEstado === 'si').length,
  'J.1 fixture: la etapa «Con resolución» y la marca cuentan lo mismo');
/* El desplegable de Etapa y la tarjeta «Con resolución» miran el mismo dato: si
   discrepan, el tablero se contradice a sí mismo en la misma pantalla. */
c.state.etapa = 'Con resolución';
const porEtapa = vals().rows.length;
c.state.etapa = '';
eq(porEtapa === c.state.raw.filter(r => c.resOk(r)).length,
  'J.1 filtrar por etapa «Con resolución» da lo mismo que la tarjeta: ' + porEtapa);

// J.2 — alias de la marca: gana la columna cuyo VALOR está en el dominio.
const iniTres = [['Numero_Ingreso', 'Nombre_Proyecto'], ['1', 'Uno'], ['2', 'Dos'], ['3', 'Tres']];
const dosColumnas = correrDashboard(hojasDePrueba(iniTres, [
  ['N° postulación', 'Acuerdo CORE', 'de acuerdo CORE', 'Resolución'],
  ['1', '184/2026', 'Sí', 'Sí'],
  ['2', '185/2026', 'Sí', 'No'],
  ['3', '', 'Sí', '']
])).payload;
eq(dosColumnas.data.every(p => p.acuerdoCoreEstado === 'si'),
  'J.2 con «Acuerdo CORE» (números) y «de acuerdo CORE» (marca), manda la del dominio: ' +
  dosColumnas.data.map(p => p.acuerdoCoreEstado).join(','));
eq(dosColumnas.sources.coreMarcados === 3, 'J.2 el conteo CORE es 3, no 1');
eq(dosColumnas.avisos.some(a => a.includes('2 columnas')),
  'J.2 y la ambigüedad de tener dos columnas candidatas queda dicha en avisos');

// J.3 — columna presente con TODOS los valores fuera de dominio: tiene que avisar.
const fueraDeDominio = correrDashboard(hojasDePrueba(iniTres, [
  ['N° postulación', 'de acuerdo CORE', 'Resolución'],
  ['1', 'APROBADO', 'EMITIDA'],
  ['2', 'ACUERDO 184', 'FIRMADA'],
  ['3', 'OK', 'SI/NO']
])).payload;
eq(fueraDeDominio.sources.coreDesconocidos === 3 && fueraDeDominio.sources.coreMarcados === 0,
  'J.3 tres valores fuera de dominio: 0 marcas y 3 desconocidos');
eq(fueraDeDominio.avisos.some(a => a.includes('no están en el dominio') && a.includes('«APROBADO»')),
  'J.3 el aviso nombra los valores rechazados (antes: silencio absoluto)');
eq(fueraDeDominio.data.every(p => p.inconsistenciasDatos.length && p.alertas.length),
  'J.3 y cada proyecto levanta su propia inconsistencia');

const celdasVacias = correrDashboard(hojasDePrueba(iniTres, [
  ['N° postulación', 'de acuerdo CORE', 'Resolución'],
  ['1', '', ''], ['2', '', ''], ['3', '', '']
])).payload;
eq(celdasVacias.avisos.some(a => a.includes('está vacía en las 3 filas')),
  'J.3 «la columna existe y está vacía» se distingue de «la columna no existe»');
eq(!celdasVacias.avisos.some(a => a.includes('no están en el dominio')),
  'J.3 y no se inventa un problema de dominio donde no hay valores');

const sinColumna = correrDashboard(hojasDePrueba(iniTres, [
  ['N° postulación', 'Otra cosa'], ['1', 'x'], ['2', 'y'], ['3', 'z']
])).payload;
eq(sinColumna.avisos.some(a => a.includes('ninguna columna de marca de acuerdo CORE')),
  'J.3 «la columna no existe» sigue avisando');

/* La UI tiene que poder distinguir los cuatro casos en el pie de fuentes, que es
   donde se reportó el síntoma «CORE 0». Antes los tres últimos imprimían la
   misma cadena, «0 marcas». */
const pieDe = payload => {
  const t = new Component();
  t.props = { mostrarMontos: true, apiUrl: '', vistaInicial: 'proyectos' };
  t.state.raw = payload.data.slice();
  t.state.sources = payload.sources;
  return t.fuentesTexto();
};
const pieFuera = pieDe(fueraDeDominio), pieVacio = pieDe(celdasVacias);
const pieNo = pieDe(correrDashboard(hojasDePrueba(iniTres, [
  ['N° postulación', 'de acuerdo CORE'], ['1', 'No'], ['2', 'No'], ['3', 'No']
])).payload);
eq(pieFuera !== pieVacio && pieVacio !== pieNo && pieFuera !== pieNo,
  'J.3 el pie distingue «fuera de dominio» / «sin marca» / «todos No»:\n       · ' +
  [pieFuera, pieVacio, pieNo].join('\n       · '));
eq(pieFuera.includes('3 fuera de dominio'), 'J.3 y nombra cuántos valores no se entendieron');

// J.4 — dos filas del mismo proyecto con marcas DISTINTAS: conflicto declarado.
const choque = correrDashboard(hojasDePrueba(
  [['Numero_Ingreso', 'Nombre_Proyecto'], ['1C', 'Judo Fukuoka Hijuelas']],
  [['N° postulación', 'de acuerdo CORE', 'Resolución'],
  ['1C', 'En tramitación', 'En tramitación'],
  ['15', 'No', 'No']]
)).payload;
const jd = choque.data[0];
eq(choque.data.length === 1, 'J.4 1C ≡ 15 sigue siendo UN solo proyecto');
eq(jd.acuerdoCoreEstado === 'desconocido' && jd.acuerdoCore === '',
  'J.4 marcas en conflicto: no se publica «No» ni «En tramitación» como si fuera la verdad');
eq(jd.acuerdoCoreRaw.includes('En tramitación') && jd.acuerdoCoreRaw.includes('No'),
  'J.4 el crudo conserva los DOS valores: ' + JSON.stringify(jd.acuerdoCoreRaw));
eq(jd.inconsistenciasDatos.some(t => t.includes('marcas distintas')) && jd.alertas.length > 0,
  'J.4 el conflicto se declara como inconsistencia y sube a las alertas');
const choqueInverso = correrDashboard(hojasDePrueba(
  [['Numero_Ingreso', 'Nombre_Proyecto'], ['1C', 'Judo Fukuoka Hijuelas']],
  [['N° postulación', 'de acuerdo CORE', 'Resolución'],
  ['15', 'No', 'No'],
  ['1C', 'En tramitación', 'En tramitación']]
)).payload;
eq(choqueInverso.data[0].acuerdoCoreEstado === jd.acuerdoCoreEstado,
  'J.4 y el resultado NO depende del orden de las filas en la hoja');
/* Sin equivalencia declarada: «16» y «16.0» son el mismo folio canónico. */
const choque16 = correrDashboard(hojasDePrueba(
  [['Numero_Ingreso', 'Nombre_Proyecto'], ['16', 'Dieciséis']],
  [['N° postulación', 'de acuerdo CORE'], ['16', 'En tramitación'], ['16.0', 'No']]
)).payload;
eq(choque16.data[0].acuerdoCoreEstado === 'desconocido',
  'J.4 «16» y «16.0» en la misma hoja también son un conflicto, no un pisotón');
/* Dos lecturas del MISMO estado no son conflicto, y una vacía nunca pisa. */
const sinChoque = correrDashboard(hojasDePrueba(
  [['Numero_Ingreso', 'Nombre_Proyecto'], ['1C', 'Judo']],
  [['N° postulación', 'de acuerdo CORE'], ['1C', 'Sí'], ['15', 'VERDADERO']]
)).payload;
eq(sinChoque.data[0].acuerdoCoreEstado === 'si', 'J.4 «Sí» y «VERDADERO» son la misma marca, no un conflicto');
const noPisa = correrDashboard(hojasDePrueba(
  [['Numero_Ingreso', 'Nombre_Proyecto'], ['1C', 'Judo']],
  [['N° postulación', 'de acuerdo CORE'], ['1C', 'Sí'], ['15', '']]
)).payload;
eq(noPisa.data[0].acuerdoCoreEstado === 'si', 'J.4 una lectura vacía sigue sin pisar una marca puesta');

// J.5 — la hoja mal rotulada (el sospechoso principal del «CORE 0»).
const conTilde = correrDashboard([
  { nombre: 'Iniciativas', filas: [['Numero_Ingreso', 'Nombre_Proyecto'], ['1', 'Uno']] },
  { nombre: 'Factibilidad', filas: [['Numero_Ingreso', 'Estado']] },
  { nombre: 'Admisibilidad y Consistencia', filas: [['N° postulación', 'Dictamen']] },
  { nombre: 'Priorizacion ', filas: [['N° postulación', 'de acuerdo CORE'], ['1', 'Sí']] }
]).payload;
eq(conTilde.sources.priorizacionCore === 1 && conTilde.sources.coreMarcados === 1,
  'J.5 «Priorizacion » (sin tilde, con espacio) se lee igual: CORE 1, no 0');
eq(conTilde.avisos.some(a => a.includes('difiere en tildes')),
  'J.5 pero la diferencia queda escrita, para que alguien renombre la pestaña');

// J.6 — una fecha de inicio PLANIFICADA no es una ejecución.
const planificado = correrDashboard(hojasDePrueba(
  [['Numero_Ingreso', 'Nombre_Proyecto'], ['1', 'Uno']],
  [['N° postulación', 'de acuerdo CORE', 'Resolución', 'Fecha inicio ejecución'],
  ['1', 'No', 'No', '30/06/2027']]
)).payload;
eq(planificado.data[0].etapa !== 'En ejecución',
  'J.6 fecha de inicio futura: la etapa NO es «En ejecución» (es «' + planificado.data[0].etapa + '»)');
eq(!planificado.data[0].alertas.some(a => a.includes('Aparece en ejecución')),
  'J.6 y no dispara la alerta falsa «aparece en ejecución sin resolución»');
const ejecutando = correrDashboard(hojasDePrueba(
  [['Numero_Ingreso', 'Nombre_Proyecto'], ['1', 'Uno']],
  [['N° postulación', 'de acuerdo CORE', 'Resolución', 'Estado ejecución'],
  ['1', 'No', 'No', 'En ejecución']]
)).payload;
eq(ejecutando.data[0].alertas.some(a => a.includes('Aparece en ejecución sin resolución')),
  'J.6 declarada la ejecución SIN resolución, la alerta sí corresponde');

// J.7 — las dos capas clasifican el texto libre con el MISMO criterio.
const ctxGs = cargarAppsScript([]);
const gs = expr => vm.runInContext(expr, ctxGs);
const NEGATIVOS = ['NO FACTIBLE TÉCNICAMENTE', 'No factible', 'no avanza, con pronunciamiento desfavorable',
  'NO HABILITAR FORMULACIÓN DE EXPEDIENTE', 'No habilitado para formulación de expediente',
  'No favorable', 'Factible: NO', 'Sin pronunciamiento favorable', 'No cumple', 'no aprobado',
  'no priorizado', 'no habilitar', 'sin habilitar', 'DESESTIMADO POR NO SUBSANACIÓN',
  'Habilitado NO', 'Sin evaluación técnica favorable', 'Informe no favorable',
  'nunca fue aprobado', 'tampoco es factible'];
NEGATIVOS.forEach(v => {
  const ui = c.signo(v), datos = gs('signo_(' + JSON.stringify(v) + ')');
  eq(ui === 'negativo' && datos === 'negativo',
    'J.7 «' + v + '» es negativo en las dos capas (ui=' + ui + ', datos=' + datos + ')');
});
eq(c.factFav({ estadoFactibilidad: 'NO HABILITAR FORMULACIÓN DE EXPEDIENTE' }) === false &&
  gs('esFactibilidadHabilitada_("NO HABILITAR FORMULACIÓN DE EXPEDIENTE")') === false,
  'J.7 la NEGACIÓN del literal canónico no acredita Factibilidad favorable');
eq(c.acFav({ dictamenAC: 'EVALUACIÓN TÉCNICA NO FAVORABLE' }) === false &&
  gs('esDictamenACFavorable_("EVALUACIÓN TÉCNICA NO FAVORABLE")') === false,
  'J.7 ni la negación del literal de A&C');
/* La otra mitad del riesgo: una regla de negación demasiado ancha convierte un
   positivo legítimo en «No continúa», que es un error igual de ruidoso. Estos
   son los bordes donde la regla NO debe morder. */
const NO_NEGATIVOS = [
  ['positivo', 'Favorable'], ['positivo', 'Factible'], ['positivo', 'Factible Técnicamente'],
  ['positivo', 'habilitado para formulacion'], ['positivo', 'Aprobado'], ['positivo', 'Priorizado'],
  ['positivo', 'Terminado'], ['positivo', 'Cumple con todos los criterios'],
  ['positivo', 'avanza, con pronunciamiento favorable'],
  // La coma cierra la cláusula: la negación no la cruza.
  ['pendiente', 'sin observaciones, habilitado'],
  ['pendiente', 'Habilitado sin observaciones'],
  ['pendiente', 'Habilitado, no requiere subsanación']
];
NO_NEGATIVOS.forEach(([esperado, v]) => {
  const ui = c.signo(v), datos = gs('signo_(' + JSON.stringify(v) + ')');
  eq(ui === esperado && datos === esperado,
    'J.7 «' + v + '» NO es negativo, es ' + esperado + ' (ui=' + ui + ', datos=' + datos + ')');
});
eq(c.stopped({ estadoFactibilidad: 'No habilitado para formulación de expediente' }) === true,
  'J.7 stopped(): esos valores además marcan el proyecto como «No continúa»');
/* Planilla heredada con texto libre: las dos capas tienen que coincidir en que
   SÍ acredita. Antes Code.gs decía «desconocido» y la UI «favorable», y el
   tablero mostraba una alerta que contradecía a su propia píldora de estado. */
const libre = { dictamenAC: 'Favorable', estadoFactibilidad: 'Factible' };
eq(c.acFav(libre) === true && gs('esDictamenACFavorable_("Favorable")') === true,
  'J.7 texto libre «Favorable»: las dos capas lo aceptan igual');
eq(c.factFav(libre) === true && gs('esFactibilidadHabilitada_("Factible")') === true,
  'J.7 texto libre «Factible»: idem');

// J.8 — el dominio de las MARCAS es el mismo en las dos capas.
['si', 'sí', 'SI', 'Sí ', 'VERDADERO', 'x', '1'].forEach(v => {
  eq(c.marcaEstado(v) === 'si' && gs('clasificarMarca_(' + JSON.stringify(v) + ').estado') === 'si',
    'J.8 «' + v + '» es marca Sí en las dos capas');
});
['S', 'N', 'yes', 'Tramitación', 'trámite', 'en tramitacion core'].forEach(v => {
  eq(c.marcaEstado(v) === gs('clasificarMarca_(' + JSON.stringify(v) + ').estado'),
    'J.8 «' + v + '» se clasifica igual en las dos capas (' + c.marcaEstado(v) + ')');
});
eq(c.marcaEstado('S') === 'desconocido',
  'J.8 lo que la capa de datos no reconoce, la UI tampoco lo da por válido');
/* Y un fuera de dominio SIN texto original no puede rotularse como un «No». */
const sinCrudo = { acuerdoCoreEstado: 'desconocido', acuerdoCore: '', acuerdoCoreRaw: '' };
eq(c.marca(sinCrudo, 'acuerdoCore').label !== '' &&
  c.celdaExport(sinCrudo, { k: '_marcaCore', val: 'marcaCore' }, 'docx').trim() !== '(fuera de dominio)',
  'J.8 un desconocido con crudo vacío se rotula igual: ' +
  JSON.stringify(c.celdaExport(sinCrudo, { k: '_marcaCore', val: 'marcaCore' }, 'docx')));

// ===========================================================================
// K. Coherencia entre hitos: UN marco, UNA redacción
// ===========================================================================
const t4 = crudo('55');
eq(!!t4 && c.acFav(t4) && !c.factFav(t4), 'K fixture: el 55 es A&C favorable sin habilitación en Factibilidad');
eq(t4.alertas.length === 1 && t4.alertas[0].includes('HABILITAR FORMULACIÓN DE EXPEDIENTE'),
  'K la capa de datos emite la alerta T4');
eq(c.alerts(t4).length === 1,
  'K y la UI NO la duplica con otra redacción: ' + JSON.stringify(c.alerts(t4)));
eq(c.alertasDerivadas(t4).length === 1 && c.alertasDerivadas(t4)[0] === t4.alertas[0],
  'K las dos capas usan el mensaje LITERALMENTE igual (por eso el dedup funciona)');
c.state.view = 'alertas';
const tarjeta55 = vals().alertCards.find(x => x.n === '55');
c.state.view = 'proyectos';
eq(!!tarjeta55 && tarjeta55.items.length === 1, 'K la tarjeta de Alertas muestra el defecto UNA vez');

/* El marco es una tabla, no un if: sin la capa de datos (modo demostración o
   Web App caído) las cuatro reglas tienen que seguir existiendo. */
eq(Array.isArray(c.REGLAS_COHERENCIA) && c.REGLAS_COHERENCIA.length === 4,
  'K la UI tiene la tabla de reglas, no una condición escrita a mano');
const idsUI = c.REGLAS_COHERENCIA.map(r => r.id).sort().join(',');
const idsGs = gs('REGLAS_COHERENCIA_HITOS_.map(function(r){return r.id}).sort().join(",")');
eq(idsUI === idsGs, 'K las dos tablas declaran las mismas reglas: ' + idsUI);
const mensajesUI = c.REGLAS_COHERENCIA.map(r => r.mensaje).join('|');
const mensajesGs = gs('REGLAS_COHERENCIA_HITOS_.map(function(r){return r.mensaje}).join("|")');
eq(mensajesUI === mensajesGs, 'K y con los mismos textos');

const sinCapaDeDatos = [
  [{ dictamenAC: 'CON OBSERVACIONES', estadoFactibilidad: 'HABILITAR FORMULACIÓN DE EXPEDIENTE', acuerdoCoreEstado: 'si' },
    'Priorizado por el CORE sin dictamen A&C favorable.'],
  [{ acuerdoCoreEstado: 'no', resolucionMarcaEstado: 'si' },
    'Tiene resolución aprobatoria pero no figura acuerdo CORE.'],
  [{ estadoEjecucion: 'En ejecución', resolucionMarcaEstado: 'no' },
    'Aparece en ejecución sin resolución aprobatoria registrada.'],
  [{ dictamenAC: 'EVALUACIÓN TÉCNICA FAVORABLE', estadoFactibilidad: 'DESESTIMAR' },
    'Dictamen A&C favorable, pero Factibilidad no dice «HABILITAR FORMULACIÓN DE EXPEDIENTE».']
];
sinCapaDeDatos.forEach(([fila, esperado]) => {
  eq(c.alerts(fila).includes(esperado),
    'K sin `alertas` de Code.gs la UI igual detecta: ' + esperado.slice(0, 44) + '…');
});
/* Y con la fila COMPLETA tal como la emite Code.gs, el mismo defecto se reporta
   una sola vez (era el doble reporte en Alertas, CSV y .docx). */
const yaReportada = Object.assign({ alertas: [sinCapaDeDatos[3][1]] }, sinCapaDeDatos[3][0]);
eq(c.alerts(yaReportada).length === 1, 'K una alerta ya emitida por la fuente no se repite');

// ===========================================================================
// L. Alcance, impresión y encabezados de las salidas documentales
// ===========================================================================
c.state.q = ''; c.state.hito = ''; c.state.fondo = 'Deporte'; c.state.alcanceExport = 'todos';
const conFiltro = vals();
eq(conFiltro.rows.length < c.state.raw.length, 'L hay un filtro activo que deja fuera proyectos');
eq(conFiltro.filtrosImpresos.includes('En esta página: ' + conFiltro.rows.length + ' de ' + c.state.raw.length),
  'L el encabezado impreso declara lo que la página CONTIENE: ' + conFiltro.filtrosImpresos);

/* Ctrl+P no pasa por el botón. El componente engancha beforeprint/afterprint,
   así que esa ruta recibe la misma corrección de alcance. */
c.escucharImpresion(true);
eq((oyentes.beforeprint || []).length === 1 && (oyentes.afterprint || []).length === 1,
  'L el componente escucha beforeprint y afterprint');
oyentes.beforeprint.forEach(fn => fn());
const durante = vals();
eq(durante.rows.length === c.state.raw.length,
  'L durante la impresión con alcance «todos» se imprimen los ' + durante.rows.length + ' proyectos');
eq(durante.filtrosImpresos.includes('suspendidos durante esta impresión'),
  'L y el encabezado declara que los filtros se suspendieron');
eq(durante.filtrosImpresos.includes('Fondo: Deporte'),
  'L sin ocultar CUÁLES eran (un PDF sin filtros y uno con filtros suspendidos no son lo mismo)');
oyentes.afterprint.forEach(fn => fn());
eq(c.state.fondo === 'Deporte' && !c.state.filtrosSuspendidos, 'L al terminar, los filtros vuelven');
c.escucharImpresion(false);
eq((oyentes.beforeprint || []).length === 0, 'L y al desmontarse, deja de escuchar');

/* El botón sigue funcionando por su cuenta, sin depender de flushSync. */
impresiones.length = 0;
c.imprimir();
eq(c.state.filtrosSuspendidos !== null && vals().rows.length === c.state.raw.length,
  'L el botón Imprimir también suspende los filtros con alcance «todos»');
c.setState({ filtrosSuspendidos: null, fondo: 'Deporte' });

// El .docx lleva encabezado de PÁGINA, no sólo una tabla en la página 1.
const docxFiltrado = c.exportDocx('filtrados', { descargar: false });
const zip = Buffer.from(docxFiltrado.bytes).toString('latin1');
eq(zip.includes('word/header1.xml'), 'L el paquete .docx contiene word/header1.xml');
eq(zip.includes('<w:hdr') && zip.includes('headerReference'),
  'L con su <w:hdr> y la referencia desde sectPr');
const hdr = zip.slice(zip.indexOf('<w:hdr'), zip.indexOf('/w:hdr>'));
eq(hdr.includes('Fondo: Deporte') && hdr.includes('Alcance'),
  'L y el encabezado de cada página declara alcance y filtros');
const todosDocx = c.exportDocx('todos', { descargar: false });
const zipTodos = Buffer.from(todosDocx.bytes).toString('latin1');
eq(zipTodos.slice(zipTodos.indexOf('<w:hdr')).includes('NO APLICADOS'),
  'L con alcance «todos» el encabezado dice que los filtros no se aplicaron');
c.state.fondo = ''; c.state.alcanceExport = 'filtrados';

console.log(fail ? `\n${fail} FALLOS` : '\nTodo OK');
process.exit(fail ? 1 : 0);
