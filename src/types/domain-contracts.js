/**
 * Contratos de Dominio, Fabricas e Enumeradores Centrais
 * rest-api-matrix-analyzer
 *
 * Define as entidades fundamentais e enumeradores imutaveis que trafegam
 * entre parsers AST, analisadores, reconciliadores, storage e UI.
 */

export const HTTP_METHODS = Object.freeze({
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
});

export const SUPPORTED_HTTP_METHODS = Object.freeze(Object.values(HTTP_METHODS));

export const CELL_STATUS = Object.freeze({
  CONNECTED: 'CONNECTED',
  BACKEND_ONLY: 'BACKEND_ONLY',
  FRONTEND_ONLY: 'FRONTEND_ONLY',
  NOT_DECLARED: 'NOT_DECLARED',
  INCONCLUSIVE: 'INCONCLUSIVE',
});

export const ISSUE_SEVERITY = Object.freeze({
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
});

export const ISSUE_TYPE = Object.freeze({
  BROKEN_CALL: 'BROKEN_CALL',
  ORPHAN_ENDPOINT: 'ORPHAN_ENDPOINT',
  METHOD_MISMATCH: 'METHOD_MISMATCH',
  UNORGANIZED_CALLS: 'UNORGANIZED_CALLS',
  NEAR_DUPLICATE: 'NEAR_DUPLICATE',
});

function assertParamsObject(params, entityName) {
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    throw new TypeError(`${entityName}: parametros invalidos. Esperava um objeto nao nulo.`);
  }
}

function validateRequiredString(value, fieldName, entityName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${entityName}: o campo '${fieldName}' e obrigatorio e deve ser uma string nao vazia.`);
  }
  return value.trim();
}

function validateOptionalString(value, fieldName, entityName, defaultValue = null) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  if (typeof value !== 'string') {
    throw new TypeError(`${entityName}: o campo '${fieldName}' deve ser uma string ou nulo.`);
  }
  return value.trim();
}

function validateNonNegativeInteger(value, fieldName, entityName) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new TypeError(`${entityName}: o campo '${fieldName}' deve ser um numero inteiro nao-negativo.`);
  }
  return value;
}

function validateOptionalNonNegativeInteger(value, fieldName, entityName, defaultValue = null) {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  return validateNonNegativeInteger(value, fieldName, entityName);
}

function validateHttpMethod(method, entityName) {
  if (typeof method !== 'string' || method.trim().length === 0) {
    throw new TypeError(`${entityName}: o campo 'method' e obrigatorio e deve ser uma string valida.`);
  }
  const normalized = method.trim().toUpperCase();
  if (!SUPPORTED_HTTP_METHODS.includes(normalized)) {
    throw new TypeError(
      `${entityName}: metodo HTTP '${method}' nao suportado. Metodos aceitos: ${SUPPORTED_HTTP_METHODS.join(', ')}.`
    );
  }
  return normalized;
}

function validateStringArray(arr, fieldName, entityName) {
  if (!Array.isArray(arr)) {
    throw new TypeError(`${entityName}: o campo '${fieldName}' deve ser um array de strings.`);
  }
  return Object.freeze(
    arr.map((item, index) => {
      if (typeof item !== 'string') {
        throw new TypeError(`${entityName}: elemento no indice ${index} de '${fieldName}' deve ser uma string.`);
      }
      return item.trim();
    })
  );
}

/**
 * Cria uma entidade de rota de backend (Express).
 *
 * @param {Object} params
 * @param {string} params.method - Verbo HTTP (GET, POST, etc.)
 * @param {string} params.canonicalPath - Caminho canonico normalizado
 * @param {string} params.filePath - Caminho relativo do arquivo de declaracao
 * @param {number} params.line - Linha do arquivo
 * @param {string} [params.rawPath] - Caminho bruto original do codigo
 * @param {number} [params.column=0] - Coluna do arquivo
 * @param {string[]} [params.middlewares=[]] - Lista de middlewares aplicados
 * @param {string|null} [params.handlerName=null] - Nome do controller ou funcao
 * @param {string|number|null} [params.id=null] - Identificador de persistencia
 * @param {string|number|null} [params.auditId=null] - Identificador da auditoria
 * @returns {Readonly<Object>}
 */
export function createRoute(params) {
  assertParamsObject(params, 'createRoute');

  const method = validateHttpMethod(params.method, 'createRoute');
  const canonicalPath = validateRequiredString(params.canonicalPath, 'canonicalPath', 'createRoute');
  const filePath = validateRequiredString(params.filePath, 'filePath', 'createRoute');
  const line = validateNonNegativeInteger(params.line, 'line', 'createRoute');

  const rawPath = params.rawPath !== undefined && params.rawPath !== null
    ? validateRequiredString(params.rawPath, 'rawPath', 'createRoute')
    : canonicalPath;
  const column = params.column !== undefined
    ? validateNonNegativeInteger(params.column, 'column', 'createRoute')
    : 0;
  const middlewares = params.middlewares !== undefined
    ? validateStringArray(params.middlewares, 'middlewares', 'createRoute')
    : Object.freeze([]);
  const handlerName = validateOptionalString(params.handlerName, 'handlerName', 'createRoute', null);
  const id = params.id ?? null;
  const auditId = params.auditId ?? null;

  return Object.freeze({
    id,
    auditId,
    method,
    canonicalPath,
    rawPath,
    filePath,
    line,
    column,
    middlewares,
    handlerName,
  });
}

/**
 * Cria uma entidade de chamada HTTP de frontend (fetch ou axios).
 *
 * @param {Object} params
 * @param {string} params.method - Verbo HTTP utilizado
 * @param {string} params.canonicalPath - Caminho canonico inferido
 * @param {string} params.filePath - Caminho relativo do arquivo de chamada
 * @param {number} params.line - Linha do arquivo
 * @param {string} [params.rawUrl] - URL bruta ou expressao do codigo
 * @param {number} [params.column=0] - Coluna do arquivo
 * @param {string|null} [params.callerName=null] - Nome da funcao ou componente chamador
 * @param {string} [params.clientType='fetch'] - Tipo do cliente HTTP (fetch ou axios)
 * @param {string|number|null} [params.id=null] - Identificador de persistencia
 * @param {string|number|null} [params.auditId=null] - Identificador da auditoria
 * @returns {Readonly<Object>}
 */
export function createHttpCall(params) {
  assertParamsObject(params, 'createHttpCall');

  const method = validateHttpMethod(params.method, 'createHttpCall');
  const canonicalPath = validateRequiredString(params.canonicalPath, 'canonicalPath', 'createHttpCall');
  const filePath = validateRequiredString(params.filePath, 'filePath', 'createHttpCall');
  const line = validateNonNegativeInteger(params.line, 'line', 'createHttpCall');

  const rawUrl = params.rawUrl !== undefined && params.rawUrl !== null
    ? validateRequiredString(params.rawUrl, 'rawUrl', 'createHttpCall')
    : canonicalPath;
  const column = params.column !== undefined
    ? validateNonNegativeInteger(params.column, 'column', 'createHttpCall')
    : 0;
  const callerName = validateOptionalString(params.callerName, 'callerName', 'createHttpCall', null);
  const clientType = params.clientType !== undefined
    ? validateRequiredString(params.clientType, 'clientType', 'createHttpCall')
    : 'fetch';
  const id = params.id ?? null;
  const auditId = params.auditId ?? null;

  return Object.freeze({
    id,
    auditId,
    method,
    canonicalPath,
    rawUrl,
    filePath,
    line,
    column,
    callerName,
    clientType,
  });
}

/**
 * Cria uma celula de intersecao da Matriz REST.
 *
 * @param {Object} params
 * @param {string} params.canonicalPath - Recurso normalizado
 * @param {string} params.method - Verbo HTTP da coluna
 * @param {string} params.status - Estado de conexao (CELL_STATUS)
 * @param {number} [params.consumersCount=0] - Quantidade de chamadas associadas
 * @param {Array} [params.routes=[]] - Lista de rotas backend associadas
 * @param {Array} [params.calls=[]] - Lista de chamadas HTTP frontend associadas
 * @param {string|number|null} [params.id=null] - Identificador de persistencia
 * @param {string|number|null} [params.auditId=null] - Identificador da auditoria
 * @returns {Readonly<Object>}
 */
export function createMatrixCell(params) {
  assertParamsObject(params, 'createMatrixCell');

  const canonicalPath = validateRequiredString(params.canonicalPath, 'canonicalPath', 'createMatrixCell');
  const method = validateHttpMethod(params.method, 'createMatrixCell');

  if (typeof params.status !== 'string' || !Object.values(CELL_STATUS).includes(params.status.trim())) {
    throw new TypeError(
      `createMatrixCell: status '${params.status}' invalido. Estados aceitos: ${Object.values(CELL_STATUS).join(', ')}.`
    );
  }
  const status = params.status.trim();

  const consumersCount = params.consumersCount !== undefined
    ? validateNonNegativeInteger(params.consumersCount, 'consumersCount', 'createMatrixCell')
    : 0;

  if (params.routes !== undefined && !Array.isArray(params.routes)) {
    throw new TypeError("createMatrixCell: o campo 'routes' deve ser um array.");
  }
  const routes = Object.freeze(params.routes ? [...params.routes] : []);

  if (params.calls !== undefined && !Array.isArray(params.calls)) {
    throw new TypeError("createMatrixCell: o campo 'calls' deve ser um array.");
  }
  const calls = Object.freeze(params.calls ? [...params.calls] : []);

  const id = params.id ?? null;
  const auditId = params.auditId ?? null;

  return Object.freeze({
    id,
    auditId,
    canonicalPath,
    method,
    status,
    consumersCount,
    routes,
    calls,
  });
}

/**
 * Cria um registro de anomalia arquitetural (Issue).
 *
 * @param {Object} params
 * @param {string} params.severity - Severidade (ISSUE_SEVERITY)
 * @param {string} params.type - Categoria da issue (ISSUE_TYPE)
 * @param {string} params.canonicalPath - Rota canonica envolvida
 * @param {string} params.message - Mensagem descritiva da anomalia
 * @param {string|null} [params.method=null] - Verbo HTTP envolvido
 * @param {string|null} [params.filePath=null] - Arquivo relacionado
 * @param {number|null} [params.line=null] - Linha relacionada
 * @param {Object} [params.details={}] - Metadados e detalhes adicionais de contexto
 * @param {string|number|null} [params.id=null] - Identificador de persistencia
 * @param {string|number|null} [params.auditId=null] - Identificador da auditoria
 * @returns {Readonly<Object>}
 */
export function createIssue(params) {
  assertParamsObject(params, 'createIssue');

  if (typeof params.severity !== 'string' || !Object.values(ISSUE_SEVERITY).includes(params.severity.trim())) {
    throw new TypeError(
      `createIssue: severidade '${params.severity}' invalida. Severidades aceitas: ${Object.values(ISSUE_SEVERITY).join(', ')}.`
    );
  }
  const severity = params.severity.trim();

  if (typeof params.type !== 'string' || !Object.values(ISSUE_TYPE).includes(params.type.trim())) {
    throw new TypeError(
      `createIssue: tipo de anomalia '${params.type}' invalido. Tipos aceitos: ${Object.values(ISSUE_TYPE).join(', ')}.`
    );
  }
  const type = params.type.trim();

  const canonicalPath = validateRequiredString(params.canonicalPath, 'canonicalPath', 'createIssue');
  const message = validateRequiredString(params.message, 'message', 'createIssue');

  let method = null;
  if (params.method !== undefined && params.method !== null) {
    method = validateHttpMethod(params.method, 'createIssue');
  }

  const filePath = validateOptionalString(params.filePath, 'filePath', 'createIssue', null);
  const line = validateOptionalNonNegativeInteger(params.line, 'line', 'createIssue', null);

  if (params.details !== undefined && (typeof params.details !== 'object' || params.details === null || Array.isArray(params.details))) {
    throw new TypeError("createIssue: o campo 'details' deve ser um objeto.");
  }
  const details = Object.freeze(params.details ? { ...params.details } : {});

  const id = params.id ?? null;
  const auditId = params.auditId ?? null;

  return Object.freeze({
    id,
    auditId,
    severity,
    type,
    canonicalPath,
    method,
    message,
    filePath,
    line,
    details,
  });
}
