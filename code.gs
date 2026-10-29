// ==========================================
// CONFIGURACIÓN Y CONSTANTES
// ==========================================

// 🔀 INTERRUPTOR DE MODO
// false → Formulario de inscripción (el color se sortea pero NO se muestra)
// true  → Solo pantalla de consulta de color por cédula (activar el 9 de noviembre)
const MODO_CONSULTA = false;

const SHEET_NAME = "Inscripciones";
const SHEET_TIOS = "Tíos";

const COLORS = ["Azul", "Rojo", "Amarillo", "Verde", "Naranja", "Lila", "Blanco", "Marrón", "Gris", "Celeste", "Bordó", "Beige"];

const BASES = [
  "San José Obrero",
  "Virgen de Fátima",
  "Espíritu Santo",
  "San Antonio de Padua",
  "San Lucas",
  "Sagrado Corazón de Jesús",
  "Niño Jesús"
];

const TALLES = ["P", "M", "G", "XG"];

const HEADERS = [
  "Nombre Completo",
  "Cédula",
  "Teléfono / WhatsApp",
  "Base",
  "Contacto de Emergencia",
  "Enfermedades / Medicación",
  "Limitación para Actividades Físicas",
  "Restricciones Alimentarias",
  "Color Asignado",
  "Marca Temporal",
  "Talle de Remera",
  "Seña",
  "Total"
];

// Hoja de Tíos: una fila por pareja
const HEADERS_TIOS = [
  "Nombre Tío",
  "Nombre Tía",
  "Cédula Tío",
  "Cédula Tía",
  "Teléfono / WhatsApp",
  "Base",
  "Remera Tío",
  "Remera Tía",
  "Contacto de Emergencia",
  "Lleva Vehículo (Estacionamiento)",
  "Enfermedades / Medicación",
  "Limitación para Actividades Físicas",
  "Restricciones Alimentarias",
  "Color Asignado",
  "Marca Temporal",
  "Seña",
  "Total"
];
// Posiciones fijas (0-based) en la hoja de Tíos
const TIOS_COL = { cedulaTio: 2, cedulaTia: 3, base: 5, vehiculo: 9, color: 13, sena: 15, total: 16 };

// ==========================================
// MENÚ DE HOJA DE CÁLCULO Y CONFIGURACIÓN
// ==========================================

/**
 * Agrega un menú interactivo en Google Sheets al abrir la planilla
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('🏕️ Campamento MFCJ')
      .addItem('Configurar / Actualizar Encabezados', 'inicializarEncabezados')
      .addToUi();
  } catch (e) {
    // Si corre desde la Web App o no hay UI interactiva activa
  }
}

/**
 * Inicializa los encabezados oficiales en la fila 1 de la hoja
 */
function inicializarEncabezados(targetSheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = targetSheet || (ss ? ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0] : null);
  if (!sheet) return;

  aplicarEncabezados(sheet, HEADERS);

  // Si se ejecuta desde el menú, también prepara la hoja de Tíos
  if (!targetSheet && ss) {
    aplicarEncabezados(getTiosSheet(), HEADERS_TIOS);
  }
}

function aplicarEncabezados(sheet, headers) {
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#2D4A3E")
    .setFontColor("#FFFFFF");
  sheet.setFrozenRows(1);
}

// ==========================================
// FUNCIONES DEL BACKEND
// ==========================================

/**
 * [FUNCIÓN 1] doGet
 * Retorna la vista HTML por defecto, o JSON si se pasa ?api=true (pensado para Astro futuro)
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'true') {
    try {
      const records = getAllRecords();
      const colIdx = getColumnIndexes();
      const distribution = getDistributionCounts(null);
      
      const participants = records.map(function(row) {
        return {
          nombre: String(row[colIdx.nombre] || ''),
          cedula: String(row[colIdx.cedula] || ''),
          telefono: String(row[colIdx.telefono] || ''),
          base: String(row[colIdx.base] || ''),
          contactoEmergencia: String(row[colIdx.contactoEmergencia] || ''),
          enfermedades: String(row[colIdx.enfermedades] || ''),
          limitacionesFisicas: String(row[colIdx.limitacionesFisicas] || ''),
          alimentacion: String(row[colIdx.alimentacion] || ''),
          color: MODO_CONSULTA ? String(row[colIdx.color] || '') : '',
          timestamp: row[colIdx.timestamp] || '',
          talleRemera: String(row[colIdx.talleRemera] || '')
        };
      });

      return createJsonResponse({
        status: "success",
        totalRegistrados: records.length,
        colors: COLORS,
        bases: BASES,
        distribution: distribution.totalCounts,
        participants: participants
      });
      
    } catch (error) {
      return createJsonResponse({
        status: "error",
        message: error.toString()
      });
    }
  }

  // Comportamiento por defecto: renderiza el HTML
  const template = HtmlService.createTemplateFromFile('index');
  template.modoConsulta = MODO_CONSULTA ? 'true' : 'false';
  return template.evaluate()
    .setTitle('Inscripción Campamento 2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * [FUNCIÓN 2] doPost
 * Endpoint principal de API (para futuro uso con Astro o frontend externo)
 */
function doPost(e) {
  let payload = {};
  if (e && e.postData && e.postData.contents) {
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (jsonErr) {
      payload = e.parameter || {};
    }
  } else if (e && e.parameter) {
    payload = e.parameter;
  }
  
  if (payload && payload.action === 'consultarColor') {
    return createJsonResponse(consultarColor(payload.cedula));
  }

  const esParejaTios = payload && (payload.tipo === 'tios' || payload.nombreTio || payload.cedulaTio);
  const result = esParejaTios
    ? procesarInscripcionTios(payload)
    : procesarInscripcion(payload);
  return createJsonResponse(result);
}

/**
 * [FUNCIÓN 3] procesarInscripcion
 * Lógica principal de registro y sorteo. 
 * Se llama directamente desde index.html con google.script.run
 */
function procesarInscripcion(payload) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.waitLock(10000);
    
    const { 
      nombre, 
      cedula, 
      telefono, 
      base, 
      talleRemera,
      contactoEmergencia, 
      enfermedades,
      limitacionesFisicas,
      alimentacion 
    } = payload || {};
    
    // 1. Validar campos obligatorios
    if (!nombre || !cedula || !telefono || !base || !talleRemera || !contactoEmergencia) {
      return {
        status: "error",
        message: "Los campos de datos personales son obligatorios"
      };
    }
    
    const cleanTalle = String(talleRemera).trim().toUpperCase();
    if (!TALLES.includes(cleanTalle)) {
      return {
        status: "error",
        message: "El talle de remera seleccionado no es válido"
      };
    }
    
    // 2. Validar base oficial
    const cleanBase = String(base).trim();
    if (!BASES.includes(cleanBase)) {
      return {
        status: "error",
        message: "La base seleccionada no es válida"
      };
    }
    
    // 3. Validar duplicado por Cédula
    const existingUser = findUserByCedula(cedula);
    if (existingUser) {
      return {
        status: "duplicate",
        message: "Esta cédula ya se encuentra registrada",
        data: {
          cedula: existingUser.cedula,
          nombre: existingUser.nombre
        }
      };
    }
    
    // 4. Obtener distribución actual
    const { totalCounts, baseCounts } = getDistributionCounts(cleanBase);
    const minTotal = Math.min(...Object.values(totalCounts));
    const minBase = Math.min(...Object.values(baseCounts));
    
    // 5. Calcular pesos dinámicos
    const weights = {};
    COLORS.forEach(color => {
      const diffTotal = totalCounts[color] - minTotal;
      const diffBase = baseCounts[color] - minBase;
      
      let wGlobal = 1.0;
      if (diffTotal === 2) wGlobal = 0.35;
      else if (diffTotal >= 3) wGlobal = 0.0;
      
      let wBase = 1.0;
      if (diffBase === 1) wBase = 0.70;
      else if (diffBase >= 2) wBase = 0.20;
      
      weights[color] = wGlobal * wBase;
    });
    
    // 6. Selección aleatoria ponderada
    const selectedColor = weightedRandomSelect(COLORS, weights);
    
    // 7. Guardar en Google Sheets
    const sheet = getInscripcionesSheet();
    const timestamp = new Date().toISOString();
    
    sheet.appendRow([
      String(nombre).trim(),
      String(cedula).trim(),
      String(telefono).trim(),
      cleanBase,
      String(contactoEmergencia).trim(),
      String(enfermedades || '').trim(),
      String(limitacionesFisicas || '').trim(),
      String(alimentacion || '').trim(),
      selectedColor,
      timestamp,
      cleanTalle,
      '', // Seña (la completa el administrador)
      ''  // Total (la completa el administrador)
    ]);
    
    return {
      status: "success",
      message: "Inscripción registrada correctamente",
      data: {
        cedula: String(cedula).trim(),
        nombre: String(nombre).trim()
        // El color NO se envía: se revela recién el 9 de noviembre
      }
    };
    
  } catch (error) {
    return {
      status: "error",
      message: error.toString()
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * [FUNCIÓN 3b] procesarInscripcionTios
 * Registra a una pareja de tíos en una sola fila de la hoja "Tíos" y les sortea un color.
 */
function procesarInscripcionTios(payload) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(10000);

    const {
      nombreTio, nombreTia, cedulaTio, cedulaTia, telefono, base,
      remeraTio, remeraTia, contactoEmergencia, llevaVehiculo,
      enfermedades, limitacionesFisicas, alimentacion
    } = payload || {};

    if (!nombreTio || !nombreTia || !cedulaTio || !cedulaTia || !telefono || !base || !remeraTio || !remeraTia || !contactoEmergencia) {
      return { status: "error", message: "Los campos de datos personales son obligatorios" };
    }

    const cleanRemeraTio = String(remeraTio).trim().toUpperCase();
    const cleanRemeraTia = String(remeraTia).trim().toUpperCase();
    if (!TALLES.includes(cleanRemeraTio) || !TALLES.includes(cleanRemeraTia)) {
      return { status: "error", message: "El talle de remera seleccionado no es válido" };
    }

    const cleanBase = String(base).trim();
    if (!BASES.includes(cleanBase)) {
      return { status: "error", message: "La base seleccionada no es válida" };
    }

    const sheet = getTiosSheet();
    const records = sheet.getLastRow() > 1
      ? sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS_TIOS.length).getValues()
      : [];
    const nombrePareja = String(nombreTio).trim() + ' y ' + String(nombreTia).trim();

    // Duplicado: si la cédula del tío o de la tía ya figura en alguna pareja
    const cTio = String(cedulaTio).trim();
    const cTia = String(cedulaTia).trim();
    const targetCedula = cTio;
    const existing = records.find(function(r) {
      const a = String(r[TIOS_COL.cedulaTio] || '').trim();
      const b = String(r[TIOS_COL.cedulaTia] || '').trim();
      return [a, b].indexOf(cTio) !== -1 || [a, b].indexOf(cTia) !== -1;
    });
    if (existing) {
      return {
        status: "duplicate",
        message: "Esta cédula ya se encuentra registrada",
        data: { cedula: targetCedula, nombre: existing[0] + ' y ' + existing[1] }
      };
    }

    // Distribución entre parejas de tíos
    const totalCounts = {};
    const baseCounts = {};
    COLORS.forEach(function(c) { totalCounts[c] = 0; baseCounts[c] = 0; });
    records.forEach(function(r) {
      const color = COLORS.find(function(c) { return c.toLowerCase() === String(r[TIOS_COL.color] || '').trim().toLowerCase(); });
      if (!color) return;
      totalCounts[color]++;
      if (String(r[TIOS_COL.base] || '').trim().toLowerCase() === cleanBase.toLowerCase()) baseCounts[color]++;
    });
    const selectedColor = weightedRandomSelect(COLORS, calcularPesos(totalCounts, baseCounts));

    const tieneVehiculo = (llevaVehiculo === true || String(llevaVehiculo || '').trim().toUpperCase() === 'SÍ' || String(llevaVehiculo || '').trim().toUpperCase() === 'SI') ? 'SÍ' : 'NO';

    sheet.appendRow([
      String(nombreTio).trim(),
      String(nombreTia).trim(),
      cTio,
      cTia,
      String(telefono).trim(),
      cleanBase,
      cleanRemeraTio,
      cleanRemeraTia,
      String(contactoEmergencia).trim(),
      tieneVehiculo,
      String(enfermedades || '').trim(),
      String(limitacionesFisicas || '').trim(),
      String(alimentacion || '').trim(),
      selectedColor,
      new Date().toISOString(),
      '', // Seña (una sola por pareja)
      ''  // Total
    ]);

    return {
      status: "success",
      message: "Inscripción de tíos registrada correctamente",
      data: { cedula: targetCedula, nombre: nombrePareja }
    };

  } catch (error) {
    return { status: "error", message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * [FUNCIÓN 3c] consultarColor
 * Devuelve el color de una cédula (jóvenes o tíos) solo si MODO_CONSULTA está activo
 * y la seña figura como pagada.
 */
function consultarColor(cedula) {
  try {
    if (!MODO_CONSULTA) {
      return { status: "closed", message: "La consulta de colores todavía no está habilitada. ¡Esperá al 9 de noviembre!" };
    }
    const target = String(cedula || '').trim();
    if (!target) return { status: "error", message: "Ingresá tu número de cédula" };

    // Jóvenes
    const records = getAllRecords();
    const colIdx = getColumnIndexes();
    for (let i = 0; i < records.length; i++) {
      if (String(records[i][colIdx.cedula] || '').trim() === target) {
        return armarRespuestaConsulta(records[i][colIdx.nombre], records[i][colIdx.color], records[i][colIdx.sena]);
      }
    }

    // Tíos (una fila por pareja, una sola seña)
    const sheetTios = getTiosSheet();
    if (sheetTios.getLastRow() > 1) {
      const rows = sheetTios.getRange(2, 1, sheetTios.getLastRow() - 1, HEADERS_TIOS.length).getValues();
      for (let j = 0; j < rows.length; j++) {
        const r = rows[j];
        if (String(r[TIOS_COL.cedulaTio] || '').trim() === target || String(r[TIOS_COL.cedulaTia] || '').trim() === target) {
          return armarRespuestaConsulta(r[0] + ' y ' + r[1], r[TIOS_COL.color], r[TIOS_COL.sena]);
        }
      }
    }

    return { status: "not_found", message: "No encontramos ninguna inscripción con esa cédula." };
  } catch (error) {
    return { status: "error", message: error.toString() };
  }
}

function armarRespuestaConsulta(nombre, color, sena) {
  if (!senaPagada(sena)) {
    return {
      status: "pending",
      nombre: String(nombre),
      message: "Tu inscripción aún no está confirmada, aboná la seña."
    };
  }
  return { status: "success", nombre: String(nombre), color: String(color || '') };
}

/**
 * Considera pagada la seña si la celda tiene un valor (monto > 0, "sí", "x", etc.)
 */
function senaPagada(valor) {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === 'number') return valor > 0;
  const v = String(valor).trim().toLowerCase();
  return v !== '' && v !== '0' && v !== 'no' && v !== 'false';
}

/**
 * Pesos dinámicos para el sorteo balanceado (misma regla que jóvenes)
 */
function calcularPesos(totalCounts, baseCounts) {
  const minTotal = Math.min.apply(null, Object.values(totalCounts));
  const minBase = Math.min.apply(null, Object.values(baseCounts));
  const weights = {};
  COLORS.forEach(function(color) {
    const diffTotal = totalCounts[color] - minTotal;
    const diffBase = baseCounts[color] - minBase;
    let wGlobal = 1.0;
    if (diffTotal === 2) wGlobal = 0.35;
    else if (diffTotal >= 3) wGlobal = 0.0;
    let wBase = 1.0;
    if (diffBase === 1) wBase = 0.70;
    else if (diffBase >= 2) wBase = 0.20;
    weights[color] = wGlobal * wBase;
  });
  return weights;
}

/**
 * Obtiene (o crea) la hoja de Tíos con sus encabezados
 */
function getTiosSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_TIOS);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TIOS);
  }
  if (sheet.getLastRow() === 0) {
    aplicarEncabezados(sheet, HEADERS_TIOS);
  }
  return sheet;
}

/**
 * [FUNCIÓN 4] getInscripcionesSheet
 */
function getInscripcionesSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheets()[0];
  }
  if (sheet.getLastRow() === 0) {
    inicializarEncabezados(sheet);
  }
  return sheet;
}

/**
 * [FUNCIÓN 5] getColumnIndexes
 * Detecta dinámicamente las posiciones de las columnas según los encabezados de la fila 1
 */
function getColumnIndexes() {
  const sheet = getInscripcionesSheet();
  const lastCol = sheet.getLastColumn();
  
  // Índices por defecto correspondientes a HEADERS
  let indexes = {
    nombre: 0,
    cedula: 1,
    telefono: 2,
    base: 3,
    contactoEmergencia: 4,
    enfermedades: 5,
    limitacionesFisicas: 6,
    alimentacion: 7,
    color: 8,
    timestamp: 9,
    talleRemera: 10,
    sena: 11,
    total: 12
  };

  if (lastCol <= 0) return indexes;

  const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  if (!headerRow || headerRow.length === 0 || !headerRow[0]) {
    return indexes;
  }

  headerRow.forEach(function(h, idx) {
    const headerStr = String(h || '').trim().toLowerCase();
    if (headerStr.indexOf('seña') !== -1 || headerStr.indexOf('sena') !== -1) {
      indexes.sena = idx;
    } else if (headerStr === 'total') {
      indexes.total = idx;
    } else if (headerStr.indexOf('talle') !== -1 || headerStr.indexOf('remera') !== -1) {
      indexes.talleRemera = idx;
    } else if (headerStr.indexOf('nombre') !== -1) {
      indexes.nombre = idx;
    } else if (headerStr.indexOf('cédula') !== -1 || headerStr.indexOf('cedula') !== -1) {
      indexes.cedula = idx;
    } else if (headerStr.indexOf('teléfono') !== -1 || headerStr.indexOf('telefono') !== -1 || headerStr.indexOf('whatsapp') !== -1) {
      indexes.telefono = idx;
    } else if (headerStr.indexOf('base') !== -1) {
      indexes.base = idx;
    } else if (headerStr.indexOf('emergencia') !== -1) {
      indexes.contactoEmergencia = idx;
    } else if (headerStr.indexOf('enfermedad') !== -1 || headerStr.indexOf('medicaci') !== -1) {
      indexes.enfermedades = idx;
    } else if (headerStr.indexOf('limitaci') !== -1 || headerStr.indexOf('físic') !== -1 || headerStr.indexOf('fisic') !== -1) {
      indexes.limitacionesFisicas = idx;
    } else if (headerStr.indexOf('alimenta') !== -1 || headerStr.indexOf('comida') !== -1 || headerStr.indexOf('dieta') !== -1) {
      indexes.alimentacion = idx;
    } else if (headerStr.indexOf('color') !== -1) {
      indexes.color = idx;
    } else if (headerStr.indexOf('time') !== -1 || headerStr.indexOf('marca') !== -1 || headerStr.indexOf('fecha') !== -1) {
      indexes.timestamp = idx;
    }
  });

  return indexes;
}

/**
 * [FUNCIÓN 6] getAllRecords
 */
function getAllRecords() {
  const sheet = getInscripcionesSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  
  if (lastRow <= 1 || lastCol < 1) {
    return [];
  }
  
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

/**
 * [FUNCIÓN 7] findUserByCedula
 */
function findUserByCedula(cedula) {
  const records = getAllRecords();
  const colIdx = getColumnIndexes();
  const targetCedula = String(cedula).trim();
  
  for (let i = 0; i < records.length; i++) {
    const rowCedula = String(records[i][colIdx.cedula] || '').trim();
    if (rowCedula === targetCedula) {
      return {
        nombre: records[i][colIdx.nombre],
        cedula: records[i][colIdx.cedula],
        telefono: records[i][colIdx.telefono],
        base: records[i][colIdx.base],
        contactoEmergencia: records[i][colIdx.contactoEmergencia],
        enfermedades: records[i][colIdx.enfermedades] || '',
        limitacionesFisicas: records[i][colIdx.limitacionesFisicas] || '',
        alimentacion: records[i][colIdx.alimentacion] || '',
        color: records[i][colIdx.color],
        timestamp: records[i][colIdx.timestamp],
        talleRemera: records[i][colIdx.talleRemera] || ''
      };
    }
  }
  return null;
}

/**
 * [FUNCIÓN 8] getDistributionCounts
 */
function getDistributionCounts(targetBase) {
  const records = getAllRecords();
  const colIdx = getColumnIndexes();
  
  const totalCounts = {};
  const baseCounts = {};
  COLORS.forEach(function(color) {
    totalCounts[color] = 0;
    baseCounts[color] = 0;
  });
  
  const normalizedTargetBase = targetBase ? String(targetBase).trim().toLowerCase() : null;
  
  records.forEach(row => {
    const userBase = String(row[colIdx.base] || '').trim().toLowerCase();
    const userColor = String(row[colIdx.color] || '').trim();
    
    const matchedColor = COLORS.find(function(c) {
      return c.toLowerCase() === userColor.toLowerCase();
    });
    
    if (matchedColor) {
      totalCounts[matchedColor]++;
      if (normalizedTargetBase && userBase === normalizedTargetBase) {
        baseCounts[matchedColor]++;
      }
    }
  });
  
  return { totalCounts, baseCounts };
}

/**
 * [FUNCIÓN 9] weightedRandomSelect
 */
function weightedRandomSelect(items, weights) {
  const sum = items.reduce((acc, item) => acc + (weights[item] || 0), 0);
  
  if (sum <= 0) {
    return items[Math.floor(Math.random() * items.length)];
  }
  
  let random = Math.random() * sum;
  for (let item of items) {
    if (random < (weights[item] || 0)) {
      return item;
    }
    random -= (weights[item] || 0);
  }
  return items[items.length - 1];
}

/**
 * [FUNCIÓN 10] createJsonResponse
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}