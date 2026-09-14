const API_ROOT = '/api/cybersecurity';
import { supabase } from './supabase';

async function request(path) {
  const response = await fetch(`${API_ROOT}${path}`, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'No fue posible consultar el módulo de ciberseguridad');
  }
  return response.json();
}

export const cybersecurityService = {
  getOverview: () => request('/overview'),
  getInventoryOverview: () => request('/inventory/overview'),
  // `all: true` trae TODOS los candidatos paginando en el cliente (el backend topa
  // `limit` en 200 por request). Con esto la vista de Inventario puede buscar/filtrar
  // sobre el conjunto completo, igual que Subredes ya hace con sus ~27 segmentos —
  // antes solo se veían los primeros 100 de más de mil candidatos.
  getInventoryCandidates: async ({ source = '', state = '', limit = 100, offset = 0, all = false } = {}) => {
    if (!all) {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (source) params.set('source', source);
      if (state) params.set('state', state);
      return request(`/inventory/candidates?${params.toString()}`);
    }
    const pageSize = 200;
    const items = [];
    let total = Infinity;
    let assessmentSummary = {};
    for (let pageOffset = 0; pageOffset < total && items.length < 5000; pageOffset += pageSize) {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(pageOffset) });
      if (source) params.set('source', source);
      if (state) params.set('state', state);
      // eslint-disable-next-line no-await-in-loop
      const page = await request(`/inventory/candidates?${params.toString()}`);
      total = page.total ?? 0;
      assessmentSummary = page.assessmentSummary || assessmentSummary;
      if (!page.items?.length) break;
      items.push(...page.items);
    }
    return { total, assessmentSummary, items };
  },
  getNetworkSegments: () => request('/network-segments'),
  getAdminNetworkSegments: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Se requiere una sesión administrativa activa');
    const response = await fetch(`${API_ROOT}/admin/network-segments`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error === 'SUPERADMIN_REQUIRED' ? 'La API no confirmó el rol superadmin' : (body.error || 'No fue posible consultar las subredes'));
    }
    return response.json();
  },
  saveNetworkSegmentPolicy: async (segmentId, policy) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Se requiere una sesión administrativa activa');
    const response = await fetch(`${API_ROOT}/admin/network-segments/${encodeURIComponent(segmentId)}/policy`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(policy),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || 'No fue posible aplicar la política');
    }
    return response.json();
  },
  saveNetworkSegmentDisposition: async (segmentId, disposition) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Se requiere una sesión administrativa activa');
    const response = await fetch(`${API_ROOT}/admin/network-segments/${encodeURIComponent(segmentId)}/disposition`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(disposition),
    });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'No fue posible guardar el estado de revisión'); }
    return response.json();
  },
  getNetworkSegmentAudit: async (segmentId) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Se requiere una sesión administrativa activa');
    const response = await fetch(`${API_ROOT}/admin/network-segments/${encodeURIComponent(segmentId)}/audit`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${session.access_token}` },
    });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'No fue posible consultar el historial de cambios'); }
    return response.json();
  },
  getCases: ({ priority = '', status = '' } = {}) => {
    const params = new URLSearchParams();
    if (priority) params.set('priority', priority);
    if (status) params.set('status', status);
    const query = params.toString();
    return request(`/cases${query ? `?${query}` : ''}`);
  },
  getCase: (id) => request(`/cases/${encodeURIComponent(id)}`),

  // Inventory actions
  getInventoryCandidate: (id) => request(`/inventory/candidates/${encodeURIComponent(id)}`),
  promoteInventoryCandidate: (id, data) => request(`/inventory/candidates/${encodeURIComponent(id)}/promote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  markInventoryCandidateAsConflict: (id, data) => request(`/inventory/candidates/${encodeURIComponent(id)}/conflict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  markInventoryCandidateAsProtected: (id, data) => request(`/inventory/candidates/${encodeURIComponent(id)}/protect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
};
