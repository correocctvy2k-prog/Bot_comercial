/**
 * Convierte cualquier URL de imagen de Trello en una URL del proxy del backend,
 * que añade las credenciales necesarias para tableros privados.
 */
const BACKEND = import.meta.env.VITE_API_URL || 'http://localhost:3003';

export function proxyImg(url) {
  if (!url) return null;
  return `${BACKEND}/api/images/proxy?url=${encodeURIComponent(url)}`;
}

/**
 * Extrae la mejor URL de imagen del objeto cover de una tarjeta Trello.
 * Prioridad: cover.scaled → attachments.previews → attachments.url
 */
export function resolveCoverUrl(card) {
  const cover = card?.cover;
  if (!cover) return null;

  // 1. cover.scaled – previews generados por Trello (más optimizados)
  if (cover.scaled?.length > 0) {
    const sorted = [...cover.scaled].sort((a, b) => b.width - a.width);
    const best = sorted.find(s => s.width >= 300 && s.width <= 1200) || sorted[0];
    if (best?.url) return proxyImg(best.url);
  }

  // 2. Adjunto directo (viene con attachments=cover)
  const atts = card?.attachments || [];
  if (atts.length > 0) {
    const coverAtt = atts.find(a => a.id === cover.idAttachment) || atts[0];
    if (coverAtt) {
      // Previews escalados del adjunto
      if (coverAtt.previews?.length > 0) {
        const sorted = [...coverAtt.previews].sort((a, b) => b.width - a.width);
        const best = sorted.find(p => p.width >= 300) || sorted[sorted.length - 1];
        if (best?.url) return proxyImg(best.url);
      }
      // URL directa del adjunto
      if (coverAtt.url) return proxyImg(coverAtt.url);
    }
  }

  return null;
}

// Paleta de colores Trello (para labels y covers de color sólido)
export const TRELLO_COLORS = {
  green:  '#4BCE97',
  yellow: '#F5CD47',
  orange: '#FAA53D',
  red:    '#F87168',
  purple: '#9F8FEF',
  blue:   '#579DFF',
  sky:    '#6CC3E0',
  lime:   '#94C748',
  pink:   '#E774BB',
  black:  '#8590A2',
};
