/**
 * ═══════════════════════════════════════════════════════════════════════════
 * API DEL DASHBOARD CONSOLIDADO FNDR L3
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lee las cuatro hojas de Proyectos Postulados L3 y las cruza en un registro
 * por proyecto para el dashboard de GitHub Pages.
 *
 * DEPENDENCIA
 * -----------
 * Requiere FoliosL3.gs en el mismo proyecto Apps Script. Es el mismo archivo
 * que usan SyncAdmisPostulados y Sincronizacion_Factibilidad_Directa en el
 * repositorio Linea3; se copia, no se reescribe.
 *
 * CORRECCIONES 2026-07-27
 * -----------------------
 * 1. El cruce se hacía con trim().toUpperCase(). Un proyecto que Iniciativas
 *    llama «1C» y Factibilidad llama «15» aparecía DOS VECES, cada fila con
 *    la mitad de los datos. Ahora se cruza con la equivalencia canónica.
 * 2. dictamenAC se leía de la columna «Estado», que no existe en la hoja
 *    «Admisibilidad y Consistencia» — el encabezado es «Dictamen». La columna
 *    salía siempre vacía, y con ella el KPI de A&C favorable y la etapa.
 * 3. Una hoja faltante hacía fallar todo el dashboard. Ahora degrada: se
 *    reporta la hoja ausente y el resto de los datos se sirve igual.
 * 4. Se agregan las alertas de proceso que antes había que salir a buscar a
 *    mano en las planillas.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const CFG_DASHBOARD_L3 = Object.freeze({
  SPREADSHEET_ID: '1Y2o6zTsVakCy3NZNkgeA1qaeTJcnIx94PdS9DbGj3QE',
  SHEETS: Object.freeze({
    INICIATIVAS: 'Iniciativas',
    FACTIBILIDAD: 'Factibilidad',
    AC: 'Admisibilidad y Consistencia',
    PRIORIZACION: 'Priorización'
  })
});

function doGet(e) {
  try {
    const payload = construirDashboardL3_();
    return responderDashboard_(payload, e && e.parameter && e.parameter.callback);
  } catch (error) {
    return responderDashboard_({
      ok: false,
      error: error && error.message ? error.message : String(error),
      updatedAt: new Date().toISOString(),
      data: []
    }, e && e.parameter && e.parameter.callback);
  }
}

function construirDashboardL3_() {
  if (typeof L3_normalizarFolio_ !== 'function') {
    throw new Error('Falta FoliosL3.gs en este proyecto Apps Script. ' +
      'Cópialo desde el repositorio Linea3 (apps-script/FoliosL3.gs) y vuelve a desplegar.');
  }

  const ss = SpreadsheetApp.openById(CFG_DASHBOARD_L3.SPREADSHEET_ID);
  const avisos = [];
  const iniciativas = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.INICIATIVAS, avisos);
  const factibilidad = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.FACTIBILIDAD, avisos);
  const ac = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.AC, avisos);
  const priorizacion = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.PRIORIZACION, avisos);

  // La clave es el folio CANÓNICO (ver folio_). Es lo que impide que «1C» y
  // «15» terminen siendo dos tarjetas distintas del mismo proyecto.
  const proyectos = new Map();

  iniciativas.rows.forEach(row => {
    const folio = folio_(valor_(row, 'Numero_Ingreso', 'N° postulación'));
    if (!folio) return;
    // Dos filas de Iniciativas pueden colapsar en el mismo folio canónico
    // (1C y 15). Gana la primera; la segunda solo completa lo que falte.
    if (proyectos.has(folio)) {
      const y = proyectos.get(folio);
      y.comuna = primero_(y.comuna, valor_(row, 'Comuna'));
      y.fondo = primero_(y.fondo, valor_(row, 'Fondo'));
      y.monto = primero_(y.monto, valor_(row, 'Monto_Solicitado_CLP'));
      return;
    }
    proyectos.set(folio, {
      nPostulacion: folio,
      nombreProyecto: valor_(row, 'Nombre_Proyecto', 'Nombre proyecto'),
      institucion: valor_(row, 'Nombre_Organizacion', 'Institución - Nombre'),
      rutInstitucion: valor_(row, 'Rut_Organizacion', 'Institución - Rut'),
      comuna: valor_(row, 'Comuna'),
      fondo: valor_(row, 'Fondo'),
      categoria: valor_(row, 'Tipo_Categoria', 'Tipo categoría'),
      monto: valor_(row, 'Monto_Solicitado_CLP', 'Monto Solicitado GORE', 'Monto solicitado'),
      fechaInicioEjecucion: valor_(row, 'Fecha_Inicio'),
      fechaTerminoEjecucion: valor_(row, 'Fecha_Termino'),
      alertas: []
    });
  });

  factibilidad.rows.forEach(row => {
    const folio = folio_(valor_(row, 'Numero_Ingreso', 'N° postulación'));
    if (!folio) return;
    const p = asegurarProyecto_(proyectos, folio, row);
    p.nombreProyecto = primero_(p.nombreProyecto, valor_(row, 'Nombre_Proyecto', 'Nombre proyecto'));
    p.institucion = primero_(p.institucion, valor_(row, 'Nombre_Organizacion', 'Institución - Nombre'));
    p.rutInstitucion = primero_(p.rutInstitucion, valor_(row, 'Rut_Organizacion', 'Institución - Rut'));
    p.comuna = primero_(p.comuna, valor_(row, 'Comuna'));
    p.fondo = primero_(p.fondo, valor_(row, 'Fondo'));
    p.categoria = primero_(p.categoria, valor_(row, 'Tipo_Categoria', 'Tipo categoría'));
    p.monto = primero_(p.monto, valor_(row, 'Monto_Solicitado_CLP', 'Monto solicitado'));
    p.evaluadorFactibilidad = valor_(row, 'Revisor', 'Revisora', 'Evaluador/a');
    p.estadoFactibilidad = valor_(row, 'Estado');
    p.resumenFactibilidad = valor_(row, 'Resumen De proyecto', 'Resumen de proyecto', 'Resumen');
    // Acá viene el motivo de una evaluación pendiente y los criterios sin
    // resolver. Antes no se leía, así que el dashboard mostraba «pendiente»
    // sin decir nunca por qué.
    p.observacionesFactibilidad = valor_(row, 'Observaciones de Evaluación');
    p.folioFactibilidad = valor_(row, 'Numero_Ingreso', 'N° postulación');
  });

  ac.rows.forEach(row => {
    const folio = folio_(valor_(row, 'N° postulación', 'Numero_Ingreso', 'Folio'));
    if (!folio) return;
    const p = asegurarProyecto_(proyectos, folio, row);
    p.nombreProyecto = primero_(valor_(row, 'Nombre proyecto', 'Nombre_Proyecto'), p.nombreProyecto);
    p.institucion = primero_(valor_(row, 'Institución - Nombre', 'Nombre_Organizacion'), p.institucion);
    p.rutInstitucion = primero_(valor_(row, 'Institución - Rut', 'Rut_Organizacion'), p.rutInstitucion);
    p.comuna = primero_(valor_(row, 'Comuna'), p.comuna);
    p.fondo = primero_(valor_(row, 'Fondo'), p.fondo);
    p.categoria = primero_(valor_(row, 'Tipo categoría', 'Tipo_Categoria'), p.categoria);
    p.monto = primero_(valor_(row, 'Monto Solicitado GORE', 'Monto_Solicitado_CLP'), p.monto);
    p.evaluadorAC = valor_(row, 'Evaluador/a');
    p.rondaAC = valor_(row, 'Ronda');

    // La hoja «Admisibilidad y Consistencia» rotula esta columna «Dictamen»
    // (así la escribe SyncAdmisPostulados). Se mantiene «Estado» como alias
    // porque algunas Pautas todavía usan ese encabezado heredado; leer solo
    // «Estado» dejaba el dictamen SIEMPRE vacío.
    p.dictamenAC = valor_(row, 'Dictamen', 'Estado');
    p.estadoAC = valor_(row, 'Estado proyecto');
    p.observacionesAC = valor_(row, 'Observaciones de Evaluación');

    p.observacionesAbiertasAC = valor_(row, '# Obs abiertas');
    p.observacionesCerradasAC = valor_(row, '# Obs cerradas');
    p.fechaEvaluacionAC = valor_(row, 'Fecha evaluación');
    p.resumenAC = valor_(row, 'Resumen de proyecto');
    p.comentarioAC = primero_(valor_(row, 'Comentario'), valor_(row, 'Observaciones de Evaluación'));
    p.pronunciamiento = primero_(p.pronunciamiento, valor_(row, 'Pronunciamiento'));
    p.enlacePautaAC = valor_(row, 'Link Pauta');
    p.pdfAC = valor_(row, 'Último PDF');
  });

  priorizacion.rows.forEach(row => {
    const folio = folio_(valor_(row, 'N° postulación', 'Numero_Ingreso', 'Folio'));
    if (!folio) return;
    const p = asegurarProyecto_(proyectos, folio, row);
    p.nombreProyecto = primero_(valor_(row, 'Nombre proyecto', 'Nombre_Proyecto'), p.nombreProyecto);
    p.institucion = primero_(valor_(row, 'Institución - Nombre', 'Nombre_Organizacion'), p.institucion);
    p.rutInstitucion = primero_(valor_(row, 'Institución - Rut', 'Rut_Organizacion'), p.rutInstitucion);
    p.comuna = primero_(valor_(row, 'Comuna'), p.comuna);
    p.fondo = primero_(valor_(row, 'Fondo'), p.fondo);
    p.categoria = primero_(valor_(row, 'Tipo de Categoría (excepcional / emergente / emblemático)', 'Tipo categoría'), p.categoria);
    p.monto = primero_(valor_(row, 'Monto solicitado'), p.monto);
    p.pronunciamiento = valor_(row, 'Pronunciamiento');
    p.comentario = valor_(row, 'Comentario');
    p.resumen = valor_(row, 'Resumen');

    // Fuente explícita solicitada: hoja Priorización, columna Acuerdo CORE.
    p.acuerdoCore = normalizarSiNo_(valor_(row, 'Acuerdo CORE'));
    p.acuerdoCoreNumero = valor_(row, 'N° Acuerdo CORE');
    p.acuerdoCoreFecha = valor_(row, 'Fecha Acuerdo CORE');
    p.acuerdoCoreUrl = valor_(row, 'Enlace Acuerdo CORE');
    p.resolucionNumero = valor_(row, 'N° Resolución Aprobatoria');
    p.resolucionFecha = valor_(row, 'Fecha Resolución Aprobatoria');
    p.resolucionUrl = valor_(row, 'Enlace Resolución Aprobatoria');
    p.fechaInicioEjecucion = primero_(valor_(row, 'Fecha inicio ejecución'), p.fechaInicioEjecucion);
    p.fechaTerminoEjecucion = primero_(valor_(row, 'Fecha término ejecución'), p.fechaTerminoEjecucion);
    p.estadoEjecucion = valor_(row, 'Estado ejecución');
  });

  const data = Array.from(proyectos.values()).map(p => {
    p.alertas = calcularAlertas_(p);
    p.etapa = calcularEtapa_(p);
    return p;
  }).sort((a, b) => compararFolios_(a.nPostulacion, b.nPostulacion));

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    avisos: avisos,
    sources: {
      iniciativas: iniciativas.rows.length,
      factibilidad: factibilidad.rows.length,
      admisibilidadConsistencia: ac.rows.length,
      priorizacionCore: priorizacion.rows.length,
      proyectos: data.length,
      conAlertas: data.filter(p => p.alertas.length).length
    },
    data: data
  };
}

/**
 * Inconsistencias de proceso que antes había que ir a buscar a mano en las
 * planillas. Son las que hacen que el dashboard sirva para decidir y no solo
 * para mirar: cada una señala un dato que se contradice con otro.
 */
function calcularAlertas_(p) {
  const alertas = Array.isArray(p.alertas) ? p.alertas.slice() : [];
  const dictamen = normalizar_(p.dictamenAC);
  const estadoAC = normalizar_(p.estadoAC);
  const estadoFact = normalizar_(p.estadoFactibilidad);

  if (dictamen === 'evaluacion tecnica favorable' && estadoAC !== 'favorable') {
    alertas.push('El dictamen A&C es favorable, pero Estado proyecto no está en Favorable.');
  }

  // El caso Liceo Mixto: pendiente y sin nada que lo explique.
  const obsAbiertas = Number(p.observacionesAbiertasAC || 0);
  if (/pendiente|revision/.test(dictamen) && !obsAbiertas) {
    alertas.push('A&C pendiente con 0 observaciones abiertas: revisar si quedan criterios sin resolver.');
  }
  if (/pendiente|en revision/.test(estadoFact) && !texto_(p.observacionesFactibilidad)) {
    alertas.push('Factibilidad pendiente sin observaciones registradas: no está dicho qué falta.');
  }

  // Saltos de etapa: un proyecto no debería estar más adelante que su propia
  // evaluación.
  if (normalizarSiNo_(p.acuerdoCore) === 'Sí' && dictamen && dictamen !== 'evaluacion tecnica favorable') {
    alertas.push('Priorizado por el CORE sin dictamen A&C favorable.');
  }
  if ((p.resolucionNumero || p.resolucionUrl) && normalizarSiNo_(p.acuerdoCore) !== 'Sí') {
    alertas.push('Tiene resolución aprobatoria pero no figura acuerdo CORE.');
  }
  if ((p.estadoEjecucion || p.fechaInicioEjecucion) && !(p.resolucionNumero || p.resolucionUrl)) {
    alertas.push('Aparece en ejecución sin resolución aprobatoria registrada.');
  }

  // Datos que faltan y bloquean el paso siguiente.
  if (texto_(p.estadoFactibilidad) && !texto_(p.evaluadorFactibilidad)) {
    alertas.push('Evaluado en Factibilidad sin evaluador/a registrado.');
  }
  if ((texto_(p.dictamenAC) || texto_(p.estadoAC)) && !texto_(p.evaluadorAC)) {
    alertas.push('Evaluado en A&C sin evaluador/a registrado.');
  }
  if (!texto_(p.nombreProyecto)) {
    alertas.push('Sin nombre de proyecto en ninguna planilla.');
  }

  // El proyecto existe en Factibilidad pero no en el padrón de Iniciativas.
  if (texto_(p.folioFactibilidad) && !texto_(p.comuna)) {
    alertas.push('Sin comuna: probablemente no cruza con Iniciativas.');
  }

  return alertas;
}

function texto_(v) {
  return String(v == null ? '' : v).trim();
}

/**
 * Lee una hoja indexando por encabezado normalizado.
 *
 * Una hoja ausente ya no derriba el dashboard completo: se anota en `avisos` y
 * se devuelve una tabla vacía. Perder la pestaña «Priorización» no puede dejar
 * a oscuras también Factibilidad y A&C.
 */
function leerTablaPorEncabezados_(ss, sheetName, avisos) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    if (avisos) avisos.push('No existe la hoja «' + sheetName + '»: esa sección viene vacía.');
    return { headers: [], rows: [] };
  }
  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return { headers: [], rows: [] };
  const headers = values[0].map(String);
  const normalizedHeaders = headers.map(normalizarClave_);
  const rows = values.slice(1).filter(row => row.some(v => String(v).trim() !== '')).map(row => {
    const obj = {};
    normalizedHeaders.forEach((key, i) => { if (key) obj[key] = row[i] == null ? '' : String(row[i]).trim(); });
    return obj;
  });
  return { headers: headers, rows: rows };
}

function valor_(row) {
  for (let i = 1; i < arguments.length; i++) {
    const key = normalizarClave_(arguments[i]);
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      const value = row[key];
      if (value !== '') return value;
    }
  }
  return '';
}

function asegurarProyecto_(map, folio, row) {
  if (!map.has(folio)) {
    map.set(folio, {
      nPostulacion: folio,
      nombreProyecto: valor_(row, 'Nombre proyecto', 'Nombre_Proyecto'),
      institucion: valor_(row, 'Institución - Nombre', 'Nombre_Organizacion'),
      rutInstitucion: valor_(row, 'Institución - Rut', 'Rut_Organizacion'),
      comuna: valor_(row, 'Comuna'),
      fondo: valor_(row, 'Fondo'),
      categoria: valor_(row, 'Tipo categoría', 'Tipo_Categoria'),
      monto: valor_(row, 'Monto solicitado', 'Monto Solicitado GORE', 'Monto_Solicitado_CLP'),
      alertas: []
    });
  }
  return map.get(folio);
}

function calcularEtapa_(p) {
  if (p.estadoEjecucion || p.fechaInicioEjecucion) return 'En ejecución';
  if (p.resolucionNumero || p.resolucionUrl) return 'Con resolución';
  if (normalizarSiNo_(p.acuerdoCore) === 'Sí') return 'Priorizado/CORE';
  if (normalizar_(p.dictamenAC) === 'evaluacion tecnica favorable' && normalizar_(p.estadoAC) === 'favorable') return 'A&C favorable';
  if (p.dictamenAC || p.estadoAC) return 'Admisibilidad y Consistencia';
  if (/habilitar|favorable|factible/.test(normalizar_(p.estadoFactibilidad))) return 'Factibilidad favorable';
  if (p.estadoFactibilidad) return 'Factibilidad';
  return 'Ingresado';
}

function normalizarSiNo_(value) {
  const n = normalizar_(value);
  if (['si', 'true', '1', 'x'].indexOf(n) >= 0) return 'Sí';
  if (['no', 'false', '0'].indexOf(n) >= 0) return 'No';
  return '';
}

/**
 * Identidad del proyecto para el cruce entre hojas.
 *
 * Devuelve el folio CANÓNICO: normaliza «16.0» → «16», «N° 7» → «7», y colapsa
 * las equivalencias declaradas en FoliosL3 (1C ≡ 15) a una sola clave. Antes
 * era trim().toUpperCase(), así que Judo Fukuoka salía duplicado —«1C» con los
 * datos de Iniciativas y «15» con los de Factibilidad— y ninguna de las dos
 * filas mostraba el proyecto completo.
 */
function folio_(value) {
  return L3_folioCanonico_(value);
}

function primero_() {
  for (let i = 0; i < arguments.length; i++) {
    const value = arguments[i];
    if (value != null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function normalizar_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizarClave_(value) {
  return normalizar_(value).replace(/[^a-z0-9]+/g, '');
}

function compararFolios_(a, b) {
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

function responderDashboard_(payload, callback) {
  const json = JSON.stringify(payload);
  const cb = String(callback || '').trim();
  if (cb && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}
