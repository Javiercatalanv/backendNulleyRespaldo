/**
 * Deduplicación de publicaciones por prioridad de fuente.
 *
 * Prioridad: WOS > SCOPUS > ORCID.
 * Cuando el mismo paper aparece desde varias fuentes (no fusionado por DOI),
 * se conserva una sola copia: la de la fuente de mayor prioridad.
 * Las citas se mantienen tal cual vienen del registro prioritario (dato puro).
 */

export const SOURCE_PRIORITY: Record<string, number> = {
  WOS: 3,
  SCOPUS: 2,
  ORCID: 1,
};

/** Rango de prioridad de un paper = máxima prioridad entre sus `sources`. */
export function sourceRank(pub: {
  sources?: Array<{ platform?: string }>;
}): number {
  let best = 0;
  for (const s of pub.sources ?? []) {
    const p = SOURCE_PRIORITY[(s.platform ?? '').toUpperCase()] ?? 0;
    if (p > best) best = p;
  }
  return best;
}

/** Clave de agrupación: DOI si existe; si no, título normalizado + año. */
export function dedupeKey(pub: {
  doi?: string | null;
  title?: string | null;
  year?: number | null;
}): string {
  if (pub.doi) return `doi:${pub.doi.toLowerCase().trim()}`;
  const t = (pub.title ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `ty:${t}|${pub.year ?? ''}`;
}

/**
 * Agrupa y conserva, por cada grupo, el registro de mayor prioridad de fuente.
 * En empate de prioridad, gana el que tenga más citas (desempate razonable).
 */
export function dedupeByPriority<
  T extends {
    sources?: Array<{ platform?: string }>;
    doi?: string | null;
    title?: string | null;
    year?: number | null;
    citedByCount?: number;
  },
>(publications: T[]): T[] {
  const groups = new Map<string, T>();
  for (const pub of publications) {
    const key = dedupeKey(pub);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, pub);
      continue;
    }
    const rNew = sourceRank(pub);
    const rOld = sourceRank(existing);
    if (rNew > rOld || (rNew === rOld && (pub.citedByCount ?? 0) > (existing.citedByCount ?? 0))) {
      groups.set(key, pub);
    }
  }
  return Array.from(groups.values());
}
