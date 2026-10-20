/**
 * Issue Detector - Auditor Deterministico de Anomalias Arquiteturais REST
 * rest-api-matrix-analyzer
 *
 * Inspeciona a grade matricial REST e as correlacoes de backend e frontend,
 * detectando chamadas quebradas (BROKEN_CALL), incompatibilidades de metodo HTTP
 * (METHOD_MISMATCH), endpoints orfaos (ORPHAN_ENDPOINT), rotas quase-duplicadas
 * (NEAR_DUPLICATE) e chamadas diretas em componentes visuais (UNORGANIZED_CALLS).
 */

import {
  ISSUE_SEVERITY,
  ISSUE_TYPE,
  CELL_STATUS,
  createIssue,
} from '../types/domain-contracts.js';

const UI_PATH_REGEX = /(?:^|[\\/])(components|pages|views|screens|ui)[\\/]/i;
const UI_EXT_REGEX = /\.(jsx|tsx)$/i;
const SERVICE_PATH_REGEX = /(?:^|[\\/])(services|api|clients|sdk|repositories)[\\/]/i;

const SEVERITY_ORDER = Object.freeze({
  [ISSUE_SEVERITY.HIGH]: 3,
  [ISSUE_SEVERITY.MEDIUM]: 2,
  [ISSUE_SEVERITY.LOW]: 1,
});

/**
 * Computa a distancia de Levenshtein entre duas strings em espaco linear O(min(m, n)).
 */
export function calculateLevenshteinDistance(strA, strB) {
  if (typeof strA !== 'string' || typeof strB !== 'string') {
    throw new TypeError('calculateLevenshteinDistance: ambos os argumentos devem ser strings.');
  }
  if (strA === strB) return 0;
  if (strA.length === 0) return strB.length;
  if (strB.length === 0) return strA.length;

  let sA = strA;
  let sB = strB;
  if (sA.length < sB.length) {
    sA = strB;
    sB = strA;
  }

  const prev = new Array(sB.length + 1);
  const curr = new Array(sB.length + 1);
  for (let j = 0; j <= sB.length; j += 1) prev[j] = j;

  for (let i = 1; i <= sA.length; i += 1) {
    curr[0] = i;
    const charA = sA.charCodeAt(i - 1);
    for (let j = 1; j <= sB.length; j += 1) {
      const cost = charA === sB.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= sB.length; j += 1) prev[j] = curr[j];
  }
  return prev[sB.length];
}

/**
 * Identifica pares unicos de rotas cuja distancia de Levenshtein esteja dentro do limiar.
 */
export function findNearDuplicateRoutes(resources = [], threshold = 1) {
  if (!Array.isArray(resources)) return Object.freeze([]);
  const safeThreshold = typeof threshold === 'number' && threshold >= 0 ? threshold : 1;
  const filtered = Array.from(new Set(resources.filter((r) => typeof r === 'string' && r.trim().length > 0)));
  const duplicates = [];

  for (let i = 0; i < filtered.length; i += 1) {
    const routeA = filtered[i];
    for (let j = i + 1; j < filtered.length; j += 1) {
      const routeB = filtered[j];
      const distance = calculateLevenshteinDistance(routeA, routeB);
      if (distance > 0 && distance <= safeThreshold) {
        duplicates.push(Object.freeze({ routeA, routeB, distance }));
      }
    }
  }
  return Object.freeze(duplicates);
}

/**
 * Avalia se o caminho relativo pertence a um componente de tela ou visual.
 */
export function isUiComponentFile(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) return false;
  const normalized = filePath.trim().replace(/\\/g, '/');
  if (SERVICE_PATH_REGEX.test(normalized)) return false;
  return UI_PATH_REGEX.test(normalized) || UI_EXT_REGEX.test(normalized);
}

/**
 * Consolida estatisticas e contadores de anomalias por severidade e por tipo.
 */
export function calculateIssueSummary(issues = []) {
  const safeIssues = Array.isArray(issues) ? issues : [];
  let high = 0;
  let medium = 0;
  let low = 0;
  const byType = {
    [ISSUE_TYPE.BROKEN_CALL]: 0,
    [ISSUE_TYPE.METHOD_MISMATCH]: 0,
    [ISSUE_TYPE.ORPHAN_ENDPOINT]: 0,
    [ISSUE_TYPE.NEAR_DUPLICATE]: 0,
    [ISSUE_TYPE.UNORGANIZED_CALLS]: 0,
  };

  for (const issue of safeIssues) {
    if (!issue) continue;
    if (issue.severity === ISSUE_SEVERITY.HIGH) high += 1;
    else if (issue.severity === ISSUE_SEVERITY.MEDIUM) medium += 1;
    else if (issue.severity === ISSUE_SEVERITY.LOW) low += 1;

    if (issue.type && byType[issue.type] !== undefined) {
      byType[issue.type] += 1;
    }
  }

  return Object.freeze({
    total: safeIssues.length,
    highSeverityCount: high,
    mediumSeverityCount: medium,
    lowSeverityCount: low,
    bySeverity: Object.freeze({
      [ISSUE_SEVERITY.HIGH]: high,
      [ISSUE_SEVERITY.MEDIUM]: medium,
      [ISSUE_SEVERITY.LOW]: low,
      high,
      medium,
      low,
    }),
    byType: Object.freeze(byType),
  });
}

/**
 * Filtra anomalias por nivel de severidade.
 */
export function filterIssuesBySeverity(issues = [], severity) {
  if (!Array.isArray(issues) || typeof severity !== 'string') return Object.freeze([]);
  const norm = severity.trim().toUpperCase();
  return Object.freeze(issues.filter((i) => i && i.severity === norm));
}

/**
 * Filtra anomalias por categoria ou tipo.
 */
export function filterIssuesByType(issues = [], type) {
  if (!Array.isArray(issues) || typeof type !== 'string') return Object.freeze([]);
  const norm = type.trim().toUpperCase();
  return Object.freeze(issues.filter((i) => i && i.type === norm));
}

/**
 * Ordena deterministicamente as anomalias por severidade, caminho canonico e linha.
 */
export function sortIssuesBySeverity(issues = []) {
  if (!Array.isArray(issues)) return Object.freeze([]);
  const copy = [...issues];
  copy.sort((a, b) => {
    const weightA = SEVERITY_ORDER[a?.severity] || 0;
    const weightB = SEVERITY_ORDER[b?.severity] || 0;
    if (weightB !== weightA) return weightB - weightA;
    const pathCompare = (a?.canonicalPath || '').localeCompare(b?.canonicalPath || '');
    if (pathCompare !== 0) return pathCompare;
    const typeCompare = (a?.type || '').localeCompare(b?.type || '');
    if (typeCompare !== 0) return typeCompare;
    return (a?.line || 0) - (b?.line || 0);
  });
  return Object.freeze(copy);
}

/**
 * Audita o grafo da matriz REST e detecta todas as anomalias arquiteturais priorizadas por severidade.
 */
export function detectProjectIssues(matrixOrResult, routes = [], calls = [], options = {}) {
  const auditId = options?.auditId ?? null;
  const levenshteinThreshold = typeof options?.levenshteinThreshold === 'number'
    ? options.levenshteinThreshold
    : 1;
  const includeNearDuplicates = options?.includeNearDuplicates !== false;
  const includeUnorganizedCalls = options?.includeUnorganizedCalls !== false;
  const checkUi = typeof options?.uiFilePredicate === 'function'
    ? options.uiFilePredicate
    : isUiComponentFile;

  let flatCells = [];
  let resources = [];

  if (matrixOrResult && typeof matrixOrResult === 'object') {
    if (Array.isArray(matrixOrResult.flatCells)) {
      flatCells = matrixOrResult.flatCells;
    } else if (matrixOrResult.matrix && typeof matrixOrResult.matrix === 'object') {
      flatCells = Object.values(matrixOrResult.matrix).flatMap((m) => Object.values(m || {}));
    } else if (Array.isArray(matrixOrResult)) {
      flatCells = matrixOrResult;
    }

    resources = Array.isArray(matrixOrResult.resources)
      ? matrixOrResult.resources
      : Array.from(new Set(flatCells.map((c) => c?.canonicalPath).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  // Agrupa os metodos declarados no backend por recurso canonico
  const backendDeclaredMethodsByResource = new Map();
  for (const cell of flatCells) {
    if (!cell || !cell.canonicalPath) continue;
    const path = cell.canonicalPath;
    if (!backendDeclaredMethodsByResource.has(path)) {
      backendDeclaredMethodsByResource.set(path, new Set());
    }
    if (Array.isArray(cell.routes) && cell.routes.length > 0) {
      backendDeclaredMethodsByResource.get(path).add(cell.method);
    }
  }

  const issues = [];

  // 1. Alta Severidade (HIGH): BROKEN_CALL e METHOD_MISMATCH
  for (const cell of flatCells) {
    if (!cell || cell.status !== CELL_STATUS.FRONTEND_ONLY) continue;

    const declaredMethodsSet = backendDeclaredMethodsByResource.get(cell.canonicalPath);
    const hasAnyBackendRoute = declaredMethodsSet && declaredMethodsSet.size > 0;
    const declaredMethods = hasAnyBackendRoute ? Array.from(declaredMethodsSet).sort() : [];
    const callList = Array.isArray(cell.calls) && cell.calls.length > 0 ? cell.calls : [null];

    for (const call of callList) {
      const isBroken = !hasAnyBackendRoute;
      issues.push(
        createIssue({
          auditId,
          severity: ISSUE_SEVERITY.HIGH,
          type: isBroken ? ISSUE_TYPE.BROKEN_CALL : ISSUE_TYPE.METHOD_MISMATCH,
          canonicalPath: cell.canonicalPath,
          method: cell.method,
          message: isBroken
            ? `Chamada HTTP para recurso inexistente no backend: '${cell.method} ${cell.canonicalPath}' (potencial erro 404).`
            : `Incompatibilidade de metodo HTTP: chamada '${cell.method} ${cell.canonicalPath}' mas o backend atende apenas [${declaredMethods.join(', ')}].`,
          filePath: call?.filePath || null,
          line: call?.line ?? null,
          details: {
            clientType: call?.clientType || null,
            callerName: call?.callerName || null,
            rawUrl: call?.rawUrl || null,
            ...(isBroken ? {} : { requestedMethod: cell.method, availableMethods: declaredMethods }),
          },
        })
      );
    }
  }

  // 2. Media Severidade (MEDIUM): ORPHAN_ENDPOINT
  for (const cell of flatCells) {
    if (!cell || cell.status !== CELL_STATUS.BACKEND_ONLY) continue;
    const routeList = Array.isArray(cell.routes) && cell.routes.length > 0 ? cell.routes : [null];

    for (const route of routeList) {
      issues.push(
        createIssue({
          auditId,
          severity: ISSUE_SEVERITY.MEDIUM,
          type: ISSUE_TYPE.ORPHAN_ENDPOINT,
          canonicalPath: cell.canonicalPath,
          method: cell.method,
          message: `Endpoint backend sem consumidor interno identificado: '${cell.method} ${cell.canonicalPath}'.`,
          filePath: route?.filePath || null,
          line: route?.line ?? null,
          details: {
            handlerName: route?.handlerName || null,
            middlewares: route?.middlewares || [],
            rawPath: route?.rawPath || null,
          },
        })
      );
    }
  }

  // 3. Media Severidade (MEDIUM): NEAR_DUPLICATE
  if (includeNearDuplicates && resources.length > 1) {
    const nearDuplicates = findNearDuplicateRoutes(resources, levenshteinThreshold);
    for (const item of nearDuplicates) {
      issues.push(
        createIssue({
          auditId,
          severity: ISSUE_SEVERITY.MEDIUM,
          type: ISSUE_TYPE.NEAR_DUPLICATE,
          canonicalPath: item.routeA,
          method: null,
          message: `Rotas com grafia quase-duplicada detectadas: '${item.routeA}' e '${item.routeB}' (distancia: ${item.distance}).`,
          filePath: null,
          line: null,
          details: {
            peerPath: item.routeB,
            distance: item.distance,
            threshold: levenshteinThreshold,
          },
        })
      );
    }
  }

  // 4. Baixa Severidade (LOW): UNORGANIZED_CALLS
  if (includeUnorganizedCalls) {
    const allCalls = Array.isArray(calls) && calls.length > 0
      ? calls
      : flatCells.flatMap((c) => (Array.isArray(c?.calls) ? c.calls : []));
    const seenCalls = new Set();

    for (const call of allCalls) {
      if (!call || !call.filePath) continue;
      const callKey = `${call.filePath}:${call.line ?? 0}:${call.column ?? 0}:${call.method || ''}:${call.canonicalPath || ''}`;
      if (seenCalls.has(callKey)) continue;
      seenCalls.add(callKey);

      if (checkUi(call.filePath)) {
        issues.push(
          createIssue({
            auditId,
            severity: ISSUE_SEVERITY.LOW,
            type: ISSUE_TYPE.UNORGANIZED_CALLS,
            canonicalPath: call.canonicalPath || call.rawUrl || '/',
            method: call.method || null,
            message: `Chamada HTTP disparada diretamente a partir de componente visual ('${call.filePath}'): recomenda-se encapsular na camada de servicos.`,
            filePath: call.filePath,
            line: call.line ?? null,
            details: {
              callerName: call.callerName || null,
              clientType: call.clientType || null,
              rawUrl: call.rawUrl || null,
            },
          })
        );
      }
    }
  }

  const sortedIssues = sortIssuesBySeverity(issues);
  const summary = calculateIssueSummary(sortedIssues);

  const result = [...sortedIssues];
  Object.defineProperty(result, 'summary', {
    value: summary,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  Object.defineProperty(result, 'totalIssues', {
    value: sortedIssues.length,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return Object.freeze(result);
}
