export const XMI_MAPPING_MODES = ['class', 'entity', 'auto'];
export const xmiList = (value) => Array.isArray(value) ? value : [];
export const xmiCount = (value) => {
  if (Array.isArray(value)) return value.length;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

// Keep external server data primitive before it reaches JSX. This prevents an
// Axios/XMI object from being rendered as a React child.
export const xmiText = (value, fallback = '') => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value && typeof value === 'object') return xmiText(value.message ?? value.detail ?? value.error ?? value.code, fallback);
  return fallback;
};
export const canStartXmiPreview = (file, isPreviewing, hasActiveRequest) => Boolean(file) && !isPreviewing && !hasActiveRequest;

export const isValidXmiPreview = (value) => Boolean(
  value
  && typeof value === 'object'
  && value.dry_run === true
  && value.report
  && typeof value.report === 'object'
  && value.report.mapping
  && typeof value.report.mapping === 'object'
  && value.preview
  && typeof value.preview === 'object'
);

export const xmiPreviewContractError = (value) => {
  const hasDocument = Array.isArray(value?.nodes) || Array.isArray(value?.edges);
  if (hasDocument && value?.dry_run !== true) {
    return 'El backend no está ejecutando el contrato de previsualización XMI. Verifica que dry_run=true sea enviado y que el backend esté actualizado.';
  }
  return 'El servidor no devolvió una previsualización XMI válida. Inténtalo nuevamente.';
};

export const initialXmiImportState = () => ({
  phase: 'idle', mappingMode: 'class', preview: null, selectedIds: [], excludedIds: [], error: '',
});

export const xmiIdOf = (item) => String(item?.xmi_id || item?.xmiId || item?.id || '');

export const selectionFromMapping = (mapping = {}) => ({
  selectedIds: xmiList(mapping?.entities).map(xmiIdOf).filter(Boolean),
  excludedIds: [],
});

export const toggleXmiCandidate = ({ selectedIds = [], excludedIds = [] }, candidate, checked) => {
  const id = xmiIdOf(candidate);
  const technical = candidate?.technical || candidate?.reason === 'technical_table';
  if (!id || candidate?.kind === 'interface' || !candidate?.has_identifier || technical) return { selectedIds, excludedIds };
  const isDefaultEntity = Boolean(candidate?.default_entity ?? candidate?.entity ?? false);
  if (checked) return {
    selectedIds: [...new Set([...selectedIds, id])],
    excludedIds: excludedIds.filter((value) => value !== id),
  };
  return {
    selectedIds: selectedIds.filter((value) => value !== id),
    excludedIds: isDefaultEntity ? [...new Set([...excludedIds, id])] : excludedIds.filter((value) => value !== id),
  };
};

export const appendXmiImportFormData = (formData, { file, mappingMode = 'class', dryRun = false, selectedIds = [], excludedIds = [] }) => {
  formData.append('file', file);
  formData.append('mode', 'replace');
  formData.append('mapping_mode', XMI_MAPPING_MODES.includes(mappingMode) ? mappingMode : 'class');
  formData.append('dry_run', dryRun ? 'true' : 'false');
  const excluded = new Set(excludedIds);
  [...new Set(selectedIds)].filter((id) => !excluded.has(id)).forEach((id) => formData.append('selected_xmi_ids', id));
  [...excluded].forEach((id) => formData.append('excluded_xmi_ids', id));
  return formData;
};

export const xmiImportErrorMessage = (error) => {
  const status = error?.response?.status;
  const body = error?.response?.data || {};
  if (status === 403) return 'No tienes permiso para importar XMI en este diagrama.';
  if (status === 413) return 'El archivo XMI es demasiado grande.';
  if (status === 400) return xmiText(body.message ?? body.detail, 'El archivo XMI es inválido o no es compatible.');
  if (!error?.response) return 'No se pudo conectar con el servidor para importar el XMI.';
  return xmiText(body.message ?? body.detail, 'No se pudo procesar el archivo XMI.');
};
