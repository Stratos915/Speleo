import { supabase } from '../lib/supabaseClient';

const TABLE = 'equipment';
const TOTAL_KEYS = ['quantity', 'quantity_total', 'total_quantity', 'qty_total', 'total'];
const AVAILABLE_KEYS = ['quantity_available', 'available_quantity', 'qty_available', 'available', 'disponibile'];
const NOTES_KEYS = ['notes', 'note', 'memo', 'osservazioni'];
const INSPECTION_KEYS = ['inspection_url', 'inspection_link', 'ispezione_url', 'drive_url', 'scheda_ispezione_url'];

let equipmentPrimaryKey = 'id';
let equipmentQuantityColumn = null;
let equipmentAvailableColumn = null;
let equipmentNotesColumn;
let equipmentInspectionColumn;

function detectPrimaryKey(row) {
  if (!row) return;
  if (Object.prototype.hasOwnProperty.call(row, 'equipment_id')) {
    equipmentPrimaryKey = 'equipment_id';
  } else if (Object.prototype.hasOwnProperty.call(row, 'uuid')) {
    equipmentPrimaryKey = 'uuid';
  } else if (Object.prototype.hasOwnProperty.call(row, 'id')) {
    equipmentPrimaryKey = 'id';
  }
}

function detectColumn(row, keys) {
  if (!row) return null;
  return keys.find((key) => Object.prototype.hasOwnProperty.call(row, key)) ?? null;
}

function rememberColumns(row) {
  if (!row) return;
  if (!equipmentQuantityColumn) {
    const detected = detectColumn(row, TOTAL_KEYS);
    if (detected) {
      equipmentQuantityColumn = detected;
    }
  }
  if (!equipmentAvailableColumn) {
    const detected = detectColumn(row, AVAILABLE_KEYS);
    if (detected) {
      equipmentAvailableColumn = detected;
    }
  }
  if (equipmentNotesColumn === undefined) {
    const detected = detectColumn(row, NOTES_KEYS);
    equipmentNotesColumn = detected ?? null;
  }
  if (equipmentInspectionColumn === undefined) {
    const detected = detectColumn(row, INSPECTION_KEYS);
    equipmentInspectionColumn = detected ?? null;
  }
}

function resolveNumber(row, keys, fallback = 0) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) {
      const parsed = Number(row[key]);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return fallback;
}

export function resolveEquipmentFilter(target) {
  if (target && typeof target === 'object') {
    if (Object.prototype.hasOwnProperty.call(target, 'column') && Object.prototype.hasOwnProperty.call(target, 'value')) {
      return target;
    }
    if (Object.prototype.hasOwnProperty.call(target, 'id') && target.id !== undefined && target.id !== null) {
      return { column: equipmentPrimaryKey, value: target.id };
    }
    if (
      Object.prototype.hasOwnProperty.call(target, 'equipment_id') &&
      target.equipment_id !== undefined &&
      target.equipment_id !== null
    ) {
      return { column: 'equipment_id', value: target.equipment_id };
    }
    if (Object.prototype.hasOwnProperty.call(target, 'uuid') && target.uuid) {
      return { column: 'uuid', value: target.uuid };
    }
  }
  return { column: equipmentPrimaryKey, value: target };
}

function withEquipmentFilter(query, target) {
  const { column, value } = resolveEquipmentFilter(target);
  return query.eq(column, value);
}

export function normalizeEquipmentRow(row) {
  if (!row) return row;
  detectPrimaryKey(row);
  rememberColumns(row);
  const quantity = resolveNumber(row, TOTAL_KEYS);
  const quantityAvailable = resolveNumber(row, AVAILABLE_KEYS, quantity);
  const identifier =
    row.id ?? row.equipment_id ?? row.uuid ?? row[`${equipmentPrimaryKey}`] ?? row.ID ?? row.record_id ?? null;
  return {
    ...row,
    id: identifier,
    quantity,
    quantity_available: quantityAvailable,
    notes: equipmentNotesColumn ? row[equipmentNotesColumn] ?? null : row.notes ?? null,
    inspection_url: equipmentInspectionColumn ? row[equipmentInspectionColumn] ?? null : row.inspection_url ?? null,
  };
}

export function getEquipmentColumnNames() {
  return {
    primary: equipmentPrimaryKey,
    quantity: equipmentQuantityColumn,
    available: equipmentAvailableColumn,
    notes: equipmentNotesColumn || null,
    inspection: equipmentInspectionColumn || null,
  };
}

export async function getEquipment() {
  const { data, error } = await supabase.from(TABLE).select('*').order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((item) => normalizeEquipmentRow(item));
}

export async function createEquipment(payload) {
  await ensureEquipmentSchema();
  const nextPayload = { ...payload };
  if (equipmentPrimaryKey === 'equipment_id') {
    nextPayload.equipment_id = await getNextEquipmentIdentifier();
  }
  if (equipmentNotesColumn && Object.prototype.hasOwnProperty.call(nextPayload, 'notes')) {
    nextPayload[equipmentNotesColumn] = nextPayload.notes;
    delete nextPayload.notes;
  } else {
    delete nextPayload.notes;
  }
  if (equipmentInspectionColumn && Object.prototype.hasOwnProperty.call(nextPayload, 'inspection_url')) {
    nextPayload[equipmentInspectionColumn] = nextPayload.inspection_url;
    delete nextPayload.inspection_url;
  } else if (equipmentInspectionColumn === null) {
    delete nextPayload.inspection_url;
  }
  const { data, error } = await supabase.from(TABLE).insert(nextPayload).select().single();
  if (error) throw error;
  return normalizeEquipmentRow(data);
}

export async function updateEquipment(id, payload) {
  const nextPayload = { ...payload };
  if (equipmentNotesColumn && Object.prototype.hasOwnProperty.call(nextPayload, 'notes')) {
    nextPayload[equipmentNotesColumn] = nextPayload.notes;
    delete nextPayload.notes;
  } else {
    delete nextPayload.notes;
  }
  if (equipmentInspectionColumn && Object.prototype.hasOwnProperty.call(nextPayload, 'inspection_url')) {
    nextPayload[equipmentInspectionColumn] = nextPayload.inspection_url;
    delete nextPayload.inspection_url;
  } else if (equipmentInspectionColumn === null) {
    delete nextPayload.inspection_url;
  }
  const { data, error } = await withEquipmentFilter(supabase.from(TABLE).update(nextPayload), id).select().single();
  if (error) throw error;
  return normalizeEquipmentRow(data);
}

export async function deleteEquipment(id) {
  const { error } = await withEquipmentFilter(supabase.from(TABLE).delete(), id);
  if (error) throw error;
}

export async function getEquipmentById(identifier) {
  const { data, error } = await withEquipmentFilter(supabase.from(TABLE).select('*'), identifier).single();
  if (error) throw error;
  return normalizeEquipmentRow(data);
}

export async function setEquipmentAvailability(identifier, quantityAvailable) {
  if (!equipmentAvailableColumn) {
    await ensureEquipmentSchema(identifier);
  }
  const targetColumn = equipmentAvailableColumn ?? 'quantity_available';
  const { data, error } = await withEquipmentFilter(
    supabase.from(TABLE).update({ [targetColumn]: quantityAvailable }),
    identifier,
  )
    .select('*')
    .single();
  if (error) throw error;
  return normalizeEquipmentRow(data);
}

async function ensureEquipmentSchema(identifier) {
  if (
    equipmentQuantityColumn &&
    equipmentAvailableColumn &&
    equipmentNotesColumn !== undefined &&
    equipmentInspectionColumn !== undefined
  ) {
    return;
  }
  let query = supabase.from(TABLE).select('*').limit(1);
  if (identifier) {
    query = withEquipmentFilter(query, identifier);
  }
  const { data, error } = await query;
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (row) {
    detectPrimaryKey(row);
    rememberColumns(row);
  }
}

async function getNextEquipmentIdentifier() {
  if (equipmentPrimaryKey !== 'equipment_id') {
    return undefined;
  }
  const { data, error } = await supabase
    .from(TABLE)
    .select('equipment_id')
    .order('equipment_id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const current = data?.equipment_id ?? 0;
  return Number(current) + 1;
}
