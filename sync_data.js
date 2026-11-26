const { execSync } = require('child_process');
const fs = require('fs');

console.log('Obteniendo datos exclusivamente desde PARTICIPANTES OFICIAL...');
const partRaw = execSync('gsheets readonly read 1XKyHmXWIzGtP9jcw_VZgj94eMjo9GjC0LwTJwjVvIIU "\'PARTICIPANTES OFICIAL\'!A1:P"', { encoding: 'utf8' });

function estaPagado(sena, total) {
  const s = String(sena || '').toLowerCase().trim();
  const t = String(total || '').toLowerCase().trim();
  return (s !== '' && s !== '0' && s !== 'no' && s !== 'pendiente' && s !== 'debe') ||
         (t !== '' && t !== '0' && t !== 'no' && t !== 'pendiente' && t !== 'debe');
}

function esVerdadero(val) {
  const v = String(val || '').toLowerCase().trim();
  return v === 'sí' || v === 'si' || v === 'yes' || v === 'presente' || v === 'entregado' || v === 'true' || v === '1' || v === 'ok';
}

// Estructura oficial de PARTICIPANTES OFICIAL:
// Col 0 (A): Tipo ("Participante" | "Tíos" | "Hijo de Tíos")
// Col 1 (B): Nombre Completo
// Col 2 (C): Cédula
// Col 3 (D): Teléfono / WhatsApp
// Col 4 (E): Base
// Col 5 (F): Color Asignado
// Col 6 (G): Talle de Remera
// Col 7 (H): Contacto de Emergencia
// Col 8 (I): Enfermedades / Medicación
// Col 9 (J): Limitación para Actividades Físicas
// Col 10 (K): Restricciones Alimentarias
// Col 11 (L): Seña
// Col 12 (M): Total
// Col 13 (N): Marca Temporal
// Col 14 (O): Presencia
// Col 15 (P): Entrega de Kit

const lines = partRaw.trim().split('\n');
const participantes = [];
const tios = [];
const hijos = [];

for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split('\t').map(c => (c || '').trim());
  const tipoRaw = cols[0] || 'Participante';
  const nombre = cols[1] || '';
  const cedula = cols[2] || '';

  if (!nombre && !cedula) continue;

  const rowNumber = i + 1;
  const tipoNorm = tipoRaw.toLowerCase();

  let categoria = 'Participante';
  if (tipoNorm.includes('hijo')) {
    categoria = 'Hijo de Tíos';
  } else if (tipoNorm.includes('tío') || tipoNorm.includes('tio')) {
    categoria = 'Tíos';
  }

  const registro = {
    id: 'po-' + rowNumber,
    rowNumber: rowNumber,
    tipo: categoria,
    nombre: nombre,
    cedula: cedula,
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
  };

  if (categoria === 'Hijo de Tíos') {
    hijos.push(registro);
  } else if (categoria === 'Tíos') {
    tios.push(registro);
  } else {
    participantes.push(registro);
  }
}

const data = {
  success: true,
  fuente: 'PARTICIPANTES OFICIAL',
  participantes,
  tios,
  hijos
};

fs.writeFileSync('datos-recepcion.json', JSON.stringify(data, null, 2), 'utf8');
console.log('¡datos-recepcion.json generado exclusivamente desde PARTICIPANTES OFICIAL!');
console.log('Jóvenes:', participantes.length, '| Parejas de Tíos:', tios.length, '| Hijos de Tíos:', hijos.length);
