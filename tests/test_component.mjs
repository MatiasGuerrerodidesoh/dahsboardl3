/**
 * Prueba de regresión de la lógica del dashboard.
 *
 * Extrae la clase Component del diseño editable (la misma que corre en el
 * compilado — la paridad se verifica aparte) y la ejecuta con el payload de
 * fixtures/api.sim.json, generado por el simulador del repositorio Linea3
 * (sim/run.mjs). Verifica la tabla de Proyectos con sus columnas de etapa.
 *
 *   node tests/test_component.mjs
 */
import fs from 'fs';
import path from 'path';

const AQUI = new URL('.', import.meta.url).pathname;
const html = fs.readFileSync(path.join(AQUI, '..', 'Dashboard FNDR L3.dc.html'), 'utf8');
const ini = html.indexOf('class Component extends DCLogic');
let src = html.slice(ini, html.indexOf('</script>', ini));
src = src.slice(0, src.lastIndexOf('}') + 1);

class DCLogic { setState(p) { Object.assign(this.state, typeof p === 'function' ? p(this.state) : p); } }
globalThis.window = { location: { search: '' }, history: { replaceState() {} }, print() {} };
globalThis.document = { createElement: () => ({ remove() {} }), head: { appendChild() {} } };
globalThis.location = globalThis.window.location;
globalThis.DCLogic = DCLogic;

const Component = new Function('DCLogic', 'window', 'document', 'location',
  'return (' + src.replace('class Component extends DCLogic', 'class Component extends DCLogic') + ')'
)(DCLogic, globalThis.window, globalThis.document, globalThis.location);

const api = JSON.parse(fs.readFileSync(path.join(AQUI, 'fixtures', 'api.sim.json'), 'utf8'));
const c = new Component();
c.props = { mostrarMontos: true, apiUrl: '', vistaInicial: 'proyectos' };
c.state.raw = api.data.map(r => ({ ...r, acuerdoCore: c.yesNo(r.acuerdoCore) }));
c.state.loading = false;
c.state.view = 'proyectos';

let fail = 0;
const eq = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fail++; };

const data = c.renderVals();
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
eq(c.renderVals().funnel !== undefined, 'vista Panorama sigue rindiendo');
c.state.view = 'alertas';
eq(Array.isArray(c.renderVals().alertCards), 'vista Alertas sigue rindiendo');

// Paridad: el dc-script del compilado debe ser idéntico al del diseño editable.
const compilado = fs.readFileSync(path.join(AQUI, '..', 'index.html'), 'utf8');
const desescapar = t => t.replace(/\\\\/g, '\u0000').replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\u0000/g, '\\');
const corte = (t) => { const i = t.indexOf('class Component extends DCLogic'); return t.slice(i, t.indexOf('onCloseBackdrop', i)); };
eq(corte(desescapar(compilado)) === corte(html), 'paridad dc-script: compilado ≡ diseño editable');

console.log(fail ? `\n${fail} FALLOS` : '\nTodo OK');
process.exit(fail ? 1 : 0);
