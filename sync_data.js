const { execSync } = require('child_process');
const fs = require('fs');

console.log('Obteniendo datos de PARTICIPANTES OFICIAL...');
const partRaw = execSync('gsheets readonly read 1XKyHmXWIzGtP9jcw_VZgj94eMjo9GjC0LwTJwjVvIIU "\'PARTICIPANTES OFICIAL\'!A1:P"', { encoding: 'utf8' });

console.log('Obteniendo datos de Tíos...');
const tiosRaw = execSync('gsheets readonly read 1XKyHmXWIzGtP9jcw_VZgj94eMjo9GjC0LwTJwjVvIIU "\'Tíos\'!A1:T"', { encoding: 'utf8' });

function estaPagado(sena, total) {
  const s = String(sena || '').toLowerCase().trim();
  const t = String(total || '').toLowerCase().trim();
  return (s !== '' && s !== '0' && s !== 'no' && s !== 'pendiente') ||
         (t !== '' && t !== '0' && t !== 'no' && t !== 'pendiente');
}

function esVerdadero(val) {
  const v = String(val || '').toLowerCase().trim();
  return v === 'sí' || v === 'si' || v === 'yes' || v === 'presente' || v === 'entregado' || v === 'true' || v === '1' || v === 'ok';
}

// Participantes: orden oficial de columnas en PARTICIPANTES OFICIAL
// Col 0 (A): Tipo ("Participante")
// Col 1 (B): Nombre Completo
// Col 2 (C): Cédula
// Col 3 (D): Teléfono / WhatsApp
// Col 4 (E): Base
// Col 5 (F): Color Asignado
// Col 6 (G): Talle de Remera
// Col 7 (H): Contacto de Emergencia
// Col 8 (I): Enfermedades / Medicación
// Col 9 (J): Limitación Física
// Col 10 (K): Restricciones Alimentarias
// Col 11 (L): Seña
// Col 12 (M): Total
// Col 13 (N): Marca Temporal
// Col 14 (O): Presencia
// Col 15 (P): Entrega de Kit

const partLines = partRaw.trim().split('\n');
const participantes = [];

for (let i = 1; i < partLines.length; i++) {
  const cols = partLines[i].split('\t').map(c => (c || '').trim());
  if (!cols[1] && !cols[2]) continue;

  participantes.push({
    tipo: 'Participante',
    nombre: cols[1] || '',
    cedula: cols[2] || '',
    telefono: cols[3] || '',
    base: cols[4] || '',
    color: cols[5] || '',
    talle: cols[6] || '',
    contactoEmergencia: cols[7] || '',
    enfermedades: cols[8] || '',
    limitacionesFisicas: cols[9] || '',
    alimentacion: cols[10] || '',
    sena: cols[11] || '',
    total: cols[12] || '',
    pagado: estaPagado(cols[11], cols[12]),
    presencia: esVerdadero(cols[14]),
    entregaKit: esVerdadero(cols[15])
  });
}

// Tíos: mapeo por encabezados
function parseTiosTSV(tsv) {
  const lines = tsv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t').map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cols[idx] ? cols[idx].trim() : '';
    });
    rows.push(obj);
  }
  return rows;
}

const tiosRows = parseTiosTSV(tiosRaw);
const tios = tiosRows.map(r => ({
  tipo: 'Tíos',
  nombre: ((r['Nombre Tío'] || '') + ' y ' + (r['Nombre Tía'] || '')).trim(),
  cedula: ((r['Cédula Tío'] || '') + ' / ' + (r['Cédula Tía'] || '')).trim(),
  telefono: r['Teléfono / WhatsApp'] || '',
  base: r['Base'] || '',
  talle: ((r['Remera Tío'] || '') + ' / ' + (r['Remera Tía'] || '')).trim(),
  contactoEmergencia: r['Contacto de Emergencia'] || '',
  llevaVehiculo: r['Lleva Vehículo (Estacionamiento)'] || '',
  enfermedades: r['Enfermedades / Medicación'] || '',
  limitacionesFisicas: r['Limitación para Actividades Físicas'] || '',
  alimentacion: r['Restricciones Alimentarias'] || '',
  color: r['Color Asignado'] || '',
  sena: r['Seña'] || '',
  total: r['Total'] || '',
  pagado: estaPagado(r['Seña'], r['Total']),
  presencia: esVerdadero(r['Presencia']),
  entregaKit: esVerdadero(r['Entrega de Kit'])
}));

const data = {
  success: true,
  participantes,
  tios
};

fs.writeFileSync('datos-recepcion.json', JSON.stringify(data, null, 2), 'utf8');
console.log('¡datos-recepcion.json generado con éxito!');
console.log('Total participantes:', participantes.length);
console.log('Total parejas de tíos:', tios.length);
