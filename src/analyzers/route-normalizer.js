/**
 * Algoritmo de Normalizacao e Canonizacao de Rotas
 * rest-api-matrix-analyzer
 *
 * Harmoniza URLs e caminhos de declaracoes backend (Express) e chamadas frontend
 * (Fetch e Axios) em um formato canonico uniforme (:param), permitindo cruzamento
 * deterministico na matriz REST.
 */

export const CANONICAL_PARAM_PLACEHOLDER = ':param';

/**
 * Normaliza e canoniza qualquer caminho ou URL de rota em formato padronizado.
 *
 * Transforma:
 * - /api/users/:id -> /api/users/:param
 * - /api/users/${userId}/orders -> /api/users/:param/orders
 * - /api/users/ + id -> /api/users/:param
 * - http://localhost:3000/api/users/:id?page=1#top -> /api/users/:param
 * - //api///v1//users/ -> /api/v1/users
 * - / -> /
 *
 * @param {string} rawPath Caminho bruto da rota ou URL
 * @returns {string} Caminho canonizado uniforme
 */
export function canonicalizeRoutePath(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return '/';
  }

  let path = rawPath.trim();

  // Remove protocolo e dominio de URLs absolutas (http://..., https://...)
  if (/^https?:\/\//i.test(path)) {
    const match = path.match(/^https?:\/\/[^/?#]+(\/[^?#]*)?/i);
    path = match && match[1] ? match[1] : '/';
  }

  // Trunca fragmento de hash e query string
  path = path.split('?')[0].split('#')[0];

  if (!path || path === '/') {
    return '/';
  }

  // Harmoniza concatenacoes de variaveis (+ id, + userId, etc.)
  path = path.replace(/\s*\+\s*['"]?([a-zA-Z0-9_$]+)['"]?/g, '/:param');

  // Limpa aspas residuais resultantes de concatenacoes
  path = path.replace(/['"`]/g, '');

  // Substitui interpolacoes de template strings (${id}, ${userId}, etc.)
  path = path.replace(/\$\{[^}]+\}/g, CANONICAL_PARAM_PLACEHOLDER);

  // Substitui parametros Express nomeados (:id, :userId, :id(\\d+), :id?)
  path = path.replace(/:([a-zA-Z_$][a-zA-Z0-9_$]*)(\([^)]*\))?\??/g, CANONICAL_PARAM_PLACEHOLDER);

  // Substitui wildcards de rota (*)
  path = path.replace(/(?<=\/|^)\*(?=\/|$)/g, CANONICAL_PARAM_PLACEHOLDER);

  // Colapsa barras consecutivas e sanitiza
  path = path.replace(/\/+/g, '/');

  // Decompoe e valida cada segmento para garantir harmonizacao uniforme
  const rawSegments = path.split('/').filter(Boolean);
  if (rawSegments.length === 0) {
    return '/';
  }

  const canonicalSegments = rawSegments.map((segment) => {
    if (
      segment === CANONICAL_PARAM_PLACEHOLDER ||
      segment.startsWith(':') ||
      segment === '*' ||
      segment.includes(CANONICAL_PARAM_PLACEHOLDER)
    ) {
      return CANONICAL_PARAM_PLACEHOLDER;
    }
    return segment;
  });

  const canonical = `/${canonicalSegments.join('/')}`;
  return canonical;
}

/**
 * Decompoe um caminho de rota em segmentos limpos ignorando barras vazias.
 * Retorna array vazio para rota raiz (/).
 *
 * @param {string} path Caminho canonico ou bruto
 * @returns {string[]} Array com os segmentos da rota
 */
export function splitRouteSegments(path) {
  const canonical = canonicalizeRoutePath(path);
  if (canonical === '/') {
    return [];
  }
  return canonical.split('/').filter(Boolean);
}

/**
 * Determina se um dado segmento de rota representa um parametro dinamico.
 *
 * @param {string} segment Segmento de rota individual
 * @returns {boolean} Verdadeiro se for um parametro canonico ou dinâmico
 */
export function isParamSegment(segment) {
  if (typeof segment !== 'string') {
    return false;
  }
  const trimmed = segment.trim();
  return (
    trimmed === CANONICAL_PARAM_PLACEHOLDER ||
    trimmed.startsWith(':') ||
    trimmed === '*' ||
    (trimmed.startsWith('${') && trimmed.endsWith('}')) ||
    trimmed.includes(CANONICAL_PARAM_PLACEHOLDER)
  );
}

/**
 * Verifica se duas rotas sao semanticamente equivalentes apos canonizacao.
 *
 * @param {string} pathA Primeira rota
 * @param {string} pathB Segunda rota
 * @returns {boolean} Verdadeiro se os caminhos canonicos forem identicos
 */
export function areRoutesEquivalent(pathA, pathB) {
  return canonicalizeRoutePath(pathA) === canonicalizeRoutePath(pathB);
}

/**
 * Extrai a lista de nomes originais de parametros presentes na rota bruta.
 *
 * @param {string} rawPath Caminho bruto da rota
 * @returns {string[]} Lista ordenada de identificadores de parametros unicos
 */
export function extractRouteParameters(rawPath) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return [];
  }

  const clean = rawPath.trim().split('?')[0].split('#')[0];
  const params = [];

  // Captura parametros Express (:id, :userId, etc.)
  const expressMatches = clean.matchAll(/:([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
  for (const match of expressMatches) {
    if (match[1] && match[1] !== 'param') {
      params.push(match[1]);
    }
  }

  // Captura interpolacoes de template string (${id}, ${userId}, etc.)
  const templateMatches = clean.matchAll(/\$\{([a-zA-Z_$][a-zA-Z0-9_$]*)\}/g);
  for (const match of templateMatches) {
    if (match[1]) {
      params.push(match[1]);
    }
  }

  // Captura parametros de concatenacao (+ id, + userId, etc.)
  const concatMatches = clean.matchAll(/\+\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
  for (const match of concatMatches) {
    if (match[1] && match[1] !== 'param') {
      params.push(match[1]);
    }
  }

  // Remove duplicatas preservando ordem de aparicao
  return Array.from(new Set(params));
}

/**
 * Normaliza prefixos de rota ou base URLs de clientes HTTP.
 *
 * @param {string} baseUrl Prefixo ou URL base
 * @returns {string} Caminho base limpo e normalizado
 */
export function normalizeBaseUrl(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    return '/';
  }

  let clean = baseUrl.trim();

  if (/^https?:\/\//i.test(clean)) {
    const match = clean.match(/^https?:\/\/[^/?#]+(\/[^?#]*)?/i);
    clean = match && match[1] ? match[1] : '/';
  }

  clean = clean.split('?')[0].split('#')[0];
  clean = clean.replace(/\/+/g, '/');

  if (!clean.startsWith('/')) {
    clean = `/${clean}`;
  }

  if (clean.length > 1 && clean.endsWith('/')) {
    clean = clean.slice(0, -1);
  }

  return clean || '/';
}
