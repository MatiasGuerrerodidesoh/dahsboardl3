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
  const ss = SpreadsheetApp.openById(CFG_DASHBOARD_L3.SPREADSHEET_ID);
  const iniciativas = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.INICIATIVAS);
  const factibilidad = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.FACTIBILIDAD);
  const ac = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.AC);
  const priorizacion = leerTablaPorEncabezados_(ss, CFG_DASHBOARD_L3.SHEETS.PRIORIZACION);

  const proyectos = new Map();

  iniciativas.rows.forEach(row => {
    const folio = folio_(valor_(row, 'Numero_Ingreso', 'N° postulación'));
    if (!folio) return;
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

    // Fuente explícita solicitada: hoja A&C, columna Estado.
    p.dictamenAC = valor_(row, 'Estado');
    p.estadoAC = valor_(row, 'Estado proyecto');

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
    p.alertas = Array.isArray(p.alertas) ? p.alertas : [];
    if (normalizar_(p.dictamenAC) === 'evaluacion tecnica favorable' && normalizar_(p.estadoAC) !== 'favorable') {
      p.alertas.push('El dictamen A&C es favorable, pero Estado proyecto no está en Favorable.');
    }
    p.etapa = calcularEtapa_(p);
    return p;
  }).sort((a, b) => compararFolios_(a.nPostulacion, b.nPostulacion));

  return {
    ok: true,
    updatedAt: new Date().toISOString(),
    sources: {
      iniciativas: iniciativas.rows.length,
      factibilidad: factibilidad.rows.length,
      admisibilidadConsistencia: ac.rows.length,
      priorizacionCore: priorizacion.rows.length
    },
    data: data
  };
}

function leerTablaPorEncabezados_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No existe la hoja: ' + sheetName);
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

function folio_(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
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
