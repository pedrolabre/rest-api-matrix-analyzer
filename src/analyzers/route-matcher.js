/**
 * Route Matcher - Motor de Cruzamento Relacional Front vs Back
 * rest-api-matrix-analyzer
 *
 * Cruza declaracoes de rotas do backend (Express) com chamadas HTTP do frontend
 * (Fetch e Axios), projetando uma grade matricial bidimensional de recursos
 * por metodos REST e calculando os estados semanticos de conexao.
 */

import {
  HTTP_METHODS,
  SUPPORTED_HTTP_METHODS,
  CELL_STATUS,
  createMatrixCell,
} from '../types/domain-contracts.js';
import { canonicalizeRoutePath } from './route-normalizer.js';

/**
 * Determina o estado semantico de uma operacao REST com base na presenca de rotas e chamadas.
 *
 * @param {boolean} hasRoute Indica se o backend declara a rota
 * @param {boolean} hasCalls Indica se o frontend dispara chamadas para a rota
 * @returns {string} Estado de conexao correspondente (CELL_STATUS)
 */
export function determineCellStatus(hasRoute, hasCalls) {
  if (hasRoute && hasCalls) {
    return CELL_STATUS.CONNECTED;
  }
  if (hasRoute && !hasCalls) {
    return CELL_STATUS.BACKEND_ONLY;
  }
  if (!hasRoute && hasCalls) {
    return CELL_STATUS.FRONTEND_ONLY;
  }
  return CELL_STATUS.NOT_DECLARED;
}

/**
 * Obtem a referencia principal da rota backend associada a uma celula.
 *
 * @param {Object} cell Celula matricial
 * @returns {Object|null} Rota backend principal ou null se ausente
 */
export function getRouteRef(cell) {
  if (!cell || !Array.isArray(cell.routes) || cell.routes.length === 0) {
    return null;
  }
  return cell.routes[0];
}

/**
 * Obtem a colecao de referencias de chamadas HTTP frontend associadas a uma celula.
 *
 * @param {Object} cell Celula matricial
 * @returns {Array} Lista de chamadas HTTP associadas
 */
export function getCallRefs(cell) {
  if (!cell || !Array.isArray(cell.calls)) {
    return [];
  }
  return cell.calls;
}

/**
 * Localiza com seguranca uma celula na estrutura matricial.
 *
 * @param {Object} matrix Mapa matricial indexado por [canonicalPath][method]
 * @param {string} canonicalPath Caminho canonico do recurso
 * @param {string} method Metodo HTTP da operacao
 * @returns {Object|null} Celula correspondente ou null se nao encontrada
 */
export function findCell(matrix, canonicalPath, method) {
  if (!matrix || typeof matrix !== 'object') {
    return null;
  }
  const normPath = canonicalizeRoutePath(canonicalPath);
  const normMethod = typeof method === 'string' ? method.trim().toUpperCase() : '';

  if (!matrix[normPath] || !matrix[normPath][normMethod]) {
    return null;
  }
  return matrix[normPath][normMethod];
}

/**
 * Filtra as celulas da matriz por um estado de conexao especifico.
 *
 * @param {Object|Array} matrixOrCells Estrutura da matriz ou array de celulas
 * @param {string} status Estado semantico desejado (CELL_STATUS)
 * @returns {Array} Lista de celulas que possuem o estado informado
 */
export function filterCellsByStatus(matrixOrCells, status) {
  if (!matrixOrCells || !status) {
    return [];
  }

  let cellList = [];
  if (Array.isArray(matrixOrCells)) {
    cellList = matrixOrCells;
  } else if (typeof matrixOrCells === 'object') {
    if (Array.isArray(matrixOrCells.flatCells)) {
      cellList = matrixOrCells.flatCells;
    } else {
      const sourceMatrix = matrixOrCells.matrix || matrixOrCells;
      for (const resource of Object.keys(sourceMatrix)) {
        const methodMap = sourceMatrix[resource];
        if (methodMap && typeof methodMap === 'object') {
          for (const method of Object.keys(methodMap)) {
            cellList.push(methodMap[method]);
          }
        }
      }
    }
  }

  const normStatus = String(status).trim();
  return cellList.filter((cell) => cell && cell.status === normStatus);
}

/**
 * Calcula o sumario estatistico consolidado a partir da matriz ou de suas celulas.
 *
 * @param {Object|Array} matrixInput Matriz indexada, resultado do matcher ou lista de celulas
 * @returns {Readonly<Object>} Sumario estatistico consolidado
 */
export function calculateMatrixSummary(matrixInput) {
  let cells = [];
  let uniqueResources = new Set();
  let totalRoutesCount = 0;
  let totalCallsCount = 0;

  if (Array.isArray(matrixInput)) {
    cells = matrixInput;
    for (const cell of cells) {
      if (cell?.canonicalPath) {
        uniqueResources.add(cell.canonicalPath);
      }
      totalRoutesCount += cell?.routes?.length || 0;
      totalCallsCount += cell?.calls?.length || 0;
    }
  } else if (matrixInput && typeof matrixInput === 'object') {
    if (Array.isArray(matrixInput.resources)) {
      matrixInput.resources.forEach((r) => uniqueResources.add(r));
    }
    if (Array.isArray(matrixInput.flatCells)) {
      cells = matrixInput.flatCells;
      for (const cell of cells) {
        if (!uniqueResources.has(cell?.canonicalPath) && cell?.canonicalPath) {
          uniqueResources.add(cell.canonicalPath);
        }
        totalRoutesCount += cell?.routes?.length || 0;
        totalCallsCount += cell?.calls?.length || 0;
      }
    } else {
      const sourceMatrix = matrixInput.matrix || matrixInput;
      for (const resource of Object.keys(sourceMatrix)) {
        uniqueResources.add(resource);
        const methodMap = sourceMatrix[resource];
        if (methodMap && typeof methodMap === 'object') {
          for (const method of Object.keys(methodMap)) {
            const cell = methodMap[method];
            if (cell) {
              cells.push(cell);
              totalRoutesCount += cell?.routes?.length || 0;
              totalCallsCount += cell?.calls?.length || 0;
            }
          }
        }
      }
    }
  }

  let connected = 0;
  let backendOnly = 0;
  let frontendOnly = 0;
  let notDeclared = 0;
  let inconclusive = 0;

  for (const cell of cells) {
    if (!cell) continue;
    switch (cell.status) {
      case CELL_STATUS.CONNECTED:
        connected += 1;
        break;
      case CELL_STATUS.BACKEND_ONLY:
        backendOnly += 1;
        break;
      case CELL_STATUS.FRONTEND_ONLY:
        frontendOnly += 1;
        break;
      case CELL_STATUS.NOT_DECLARED:
        notDeclared += 1;
        break;
      case CELL_STATUS.INCONCLUSIVE:
        inconclusive += 1;
        break;
      default:
        break;
    }
  }

  const totalResources = uniqueResources.size;
  const totalOperations = cells.length;
  const declaredBackendOperations = connected + backendOnly;
  const coveragePercentage = declaredBackendOperations > 0
    ? Number(((connected / declaredBackendOperations) * 100).toFixed(1))
    : 0;

  return Object.freeze({
    totalResources,
    totalOperations,
    connected,
    backendOnly,
    frontendOnly,
    notDeclared,
    inconclusive,
    orphanCount: backendOnly,
    brokenCount: frontendOnly,
    connectedCount: connected,
    notDeclaredCount: notDeclared,
    totalRoutes: totalRoutesCount,
    totalCalls: totalCallsCount,
    coveragePercentage,
  });
}

/**
 * Cruza rotas de backend com chamadas de frontend e constroi a grade matricial REST.
 *
 * @param {Array} [routes=[]] Lista de rotas extraidas do backend (Express)
 * @param {Array} [calls=[]] Lista de chamadas HTTP extraidas do frontend (Fetch/Axios)
 * @param {Object} [options={}] Opcoes adicionais de processamento
 * @param {string|number|null} [options.auditId=null] Identificador opcional da auditoria
 * @returns {Readonly<Object>} Objeto MatrixResult contendo grade matricial e estatisticas
 */
export function matchRoutesAndCalls(routes = [], calls = [], options = {}) {
  const safeRoutes = Array.isArray(routes) ? routes : [];
  const safeCalls = Array.isArray(calls) ? calls : [];
  const auditId = options?.auditId ?? null;

  // Agrupa rotas por [caminho_canonico][metodo]
  const routesByResourceAndMethod = new Map();
  const uniqueResourcesSet = new Set();

  for (const route of safeRoutes) {
    if (!route) continue;
    const rawPath = route.canonicalPath || route.rawPath || '/';
    const canonicalPath = canonicalizeRoutePath(rawPath);
    const method = typeof route.method === 'string' ? route.method.trim().toUpperCase() : '';

    if (!SUPPORTED_HTTP_METHODS.includes(method)) continue;

    uniqueResourcesSet.add(canonicalPath);

    if (!routesByResourceAndMethod.has(canonicalPath)) {
      routesByResourceAndMethod.set(canonicalPath, new Map());
    }
    const methodMap = routesByResourceAndMethod.get(canonicalPath);
    if (!methodMap.has(method)) {
      methodMap.set(method, []);
    }
    methodMap.get(method).push(route);
  }

  // Agrupa chamadas por [caminho_canonico][metodo]
  const callsByResourceAndMethod = new Map();

  for (const call of safeCalls) {
    if (!call) continue;
    const rawPath = call.canonicalPath || call.rawUrl || '/';
    const canonicalPath = canonicalizeRoutePath(rawPath);
    const method = typeof call.method === 'string' ? call.method.trim().toUpperCase() : '';

    if (!SUPPORTED_HTTP_METHODS.includes(method)) continue;

    uniqueResourcesSet.add(canonicalPath);

    if (!callsByResourceAndMethod.has(canonicalPath)) {
      callsByResourceAndMethod.set(canonicalPath, new Map());
    }
    const methodMap = callsByResourceAndMethod.get(canonicalPath);
    if (!methodMap.has(method)) {
      methodMap.set(method, []);
    }
    methodMap.get(method).push(call);
  }

  // Ordena os recursos unicos alfabeticamente
  const resources = Object.freeze(Array.from(uniqueResourcesSet).sort((a, b) => a.localeCompare(b)));

  // Projeta a matriz bidimensional cobrindo os 5 verbos REST para cada recurso
  const matrix = {};
  const flatCells = [];

  for (const resource of resources) {
    matrix[resource] = {};
    const routeMethods = routesByResourceAndMethod.get(resource);
    const callMethods = callsByResourceAndMethod.get(resource);

    for (const method of SUPPORTED_HTTP_METHODS) {
      const matchedRoutes = routeMethods?.get(method) || [];
      const matchedCalls = callMethods?.get(method) || [];

      const hasRoute = matchedRoutes.length > 0;
      const hasCalls = matchedCalls.length > 0;
      const status = determineCellStatus(hasRoute, hasCalls);
      const consumersCount = matchedCalls.length;

      const cell = createMatrixCell({
        auditId,
        canonicalPath: resource,
        method,
        status,
        consumersCount,
        routes: matchedRoutes,
        calls: matchedCalls,
      });

      matrix[resource][method] = cell;
      flatCells.push(cell);
    }
    Object.freeze(matrix[resource]);
  }

  Object.freeze(matrix);
  Object.freeze(flatCells);

  const summary = calculateMatrixSummary({
    resources,
    flatCells,
    matrix,
  });

  return Object.freeze({
    resources,
    matrix,
    flatCells,
    summary,
    totalResources: resources.length,
    totalRoutes: safeRoutes.length,
    totalCalls: safeCalls.length,
  });
}
