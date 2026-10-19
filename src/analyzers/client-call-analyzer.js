/**
 * Analisador AST de Chamadas de Clientes HTTP (Fetch e Axios)
 * rest-api-matrix-analyzer
 *
 * Inspeciona arvores de sintaxe abstrata (AST) do Babel para identificar
 * requisicoes disparadas por fetch nativo e clientes axios (metodos de atalho,
 * instancias customizadas e chamadas genericas configuradas).
 */

import babelTraverse from '@babel/traverse';
import { createHttpCall, SUPPORTED_HTTP_METHODS } from '../types/domain-contracts.js';
import { combineRoutePaths, extractExpressionName } from './express-route-analyzer.js';

const traverse = babelTraverse.default || babelTraverse;

export { combineRoutePaths, extractExpressionName };

export const CLIENT_HTTP_METHODS = Object.freeze([
  'get',
  'post',
  'put',
  'patch',
  'delete',
]);

export const DEFAULT_CLIENT_IDENTIFIERS = Object.freeze([
  'axios',
  'api',
  'client',
  'httpClient',
  'apiClient',
  'http',
  'service',
  'request',
  'instance',
]);

/**
 * Normaliza caminhos extraindo a parte de pathname canonica sem dominios, queries ou hashes.
 */
export function extractCanonicalPathFromUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return '/';
  const clean = url.trim();

  let pathPart = clean;

  if (/^https?:\/\//i.test(clean)) {
    const match = clean.match(/^https?:\/\/[^/?#]+(\/[^?#]*)?/i);
    pathPart = match && match[1] ? match[1] : '/';
  }

  const noQuery = pathPart.split('?')[0].split('#')[0];

  if (!noQuery || noQuery === '/') return '/';
  let norm = noQuery.replace(/\/+/g, '/');
  if (!norm.startsWith('/')) norm = `/${norm}`;
  if (norm.length > 1 && norm.endsWith('/')) norm = norm.slice(0, -1);

  return norm;
}

/**
 * Extrai informacoes de URL e caminho a partir de nos AST (StringLiteral, TemplateLiteral, BinaryExpression).
 */
export function extractUrlInfo(node) {
  if (!node) return null;

  if (node.type === 'StringLiteral') {
    const rawUrl = node.value;
    const canonicalPath = extractCanonicalPathFromUrl(rawUrl);
    return { rawUrl, canonicalPath };
  }

  if (node.type === 'TemplateLiteral') {
    let rawUrl = '';
    let canonical = '';

    for (let i = 0; i < node.quasis.length; i += 1) {
      const quasiText = node.quasis[i].value.raw || node.quasis[i].value.cooked || '';
      rawUrl += quasiText;
      canonical += quasiText;

      if (i < node.expressions.length) {
        const expr = node.expressions[i];
        const exprName = extractExpressionName(expr) || 'param';
        rawUrl += `\${${exprName}}`;
        canonical += `:${exprName}`;
      }
    }

    const canonicalPath = extractCanonicalPathFromUrl(canonical);
    return { rawUrl, canonicalPath };
  }

  if (node.type === 'BinaryExpression' && node.operator === '+') {
    if (node.left.type === 'StringLiteral') {
      const leftRaw = node.left.value;
      const rightName = node.right.type === 'StringLiteral' ? node.right.value : (extractExpressionName(node.right) || 'param');
      const rightCanonical = node.right.type === 'StringLiteral' ? node.right.value : `:${rightName}`;

      const rawUrl = `${leftRaw} + ${rightName}`;
      const combined = combineRoutePaths(leftRaw, rightCanonical);
      const canonicalPath = extractCanonicalPathFromUrl(combined);
      return { rawUrl, canonicalPath };
    }

    if (node.right.type === 'StringLiteral') {
      const leftName = extractExpressionName(node.left) || 'baseUrl';
      const rightRaw = node.right.value;
      const rawUrl = `${leftName} + '${rightRaw}'`;
      const canonicalPath = extractCanonicalPathFromUrl(rightRaw);
      return { rawUrl, canonicalPath };
    }

    const leftInfo = extractUrlInfo(node.left);
    if (leftInfo) {
      const rightName = node.right.type === 'StringLiteral' ? node.right.value : (extractExpressionName(node.right) || 'param');
      const rightCanonical = node.right.type === 'StringLiteral' ? node.right.value : `:${rightName}`;

      const rawUrl = `${leftInfo.rawUrl} + ${rightName}`;
      const combined = combineRoutePaths(leftInfo.canonicalPath, rightCanonical);
      const canonicalPath = extractCanonicalPathFromUrl(combined);
      return { rawUrl, canonicalPath };
    }
  }

  if (node.type === 'Identifier') {
    return {
      rawUrl: node.name,
      canonicalPath: `/:${node.name}`,
    };
  }

  return null;
}

/**
 * Identifica o nome da funcao, componente, hook ou metodo delimitador da chamada HTTP.
 */
export function extractCallerNameFromPath(path) {
  if (!path || typeof path !== 'object') return null;

  let current = path.parentPath;
  let detectedHook = null;

  while (current) {
    const { node } = current;
    if (!node) {
      current = current.parentPath;
      continue;
    }

    if (node.type === 'CallExpression') {
      const calleeName = extractExpressionName(node.callee);
      if (calleeName && (/^use[A-Z]/.test(calleeName) || calleeName === 'useEffect')) {
        if (!detectedHook) {
          detectedHook = calleeName;
        }
      }
    }

    if (node.type === 'FunctionDeclaration' && node.id?.name) {
      return node.id.name;
    }

    if (node.type === 'VariableDeclarator' && node.id?.name) {
      if (
        node.init &&
        (node.init.type === 'ArrowFunctionExpression' ||
         node.init.type === 'FunctionExpression' ||
         node.init.type === 'CallExpression')
      ) {
        return node.id.name;
      }
    }

    if ((node.type === 'ClassMethod' || node.type === 'ObjectMethod') && node.key) {
      return node.key.name || node.key.value || null;
    }

    if (node.type === 'ObjectProperty' && node.key) {
      if (
        node.value &&
        (node.value.type === 'ArrowFunctionExpression' || node.value.type === 'FunctionExpression')
      ) {
        return node.key.name || node.key.value || null;
      }
    }

    if (node.type === 'AssignmentExpression') {
      const leftName = extractExpressionName(node.left);
      if (leftName) return leftName;
    }

    if (node.type === 'FunctionExpression' && node.id?.name) {
      return node.id.name;
    }

    current = current.parentPath;
  }

  if (detectedHook) {
    return detectedHook;
  }

  let check = path.parentPath;
  while (check) {
    if (
      check.node?.type === 'ArrowFunctionExpression' ||
      check.node?.type === 'FunctionExpression'
    ) {
      return 'anonymous';
    }
    check = check.parentPath;
  }

  return null;
}

function extractMethodFromOptions(optionsNode, defaultMethod = 'GET') {
  if (!optionsNode || optionsNode.type !== 'ObjectExpression') return defaultMethod;

  for (const prop of optionsNode.properties) {
    if (!prop || prop.type !== 'ObjectProperty') continue;
    const keyName = prop.key?.name || (prop.key?.type === 'StringLiteral' ? prop.key.value : null);
    if (keyName && keyName.toLowerCase() === 'method') {
      if (prop.value?.type === 'StringLiteral') {
        return prop.value.value.trim().toUpperCase();
      }
    }
  }

  return defaultMethod;
}

function extractUrlFromOptions(optionsNode) {
  if (!optionsNode || optionsNode.type !== 'ObjectExpression') return null;

  for (const prop of optionsNode.properties) {
    if (!prop || prop.type !== 'ObjectProperty') continue;
    const keyName = prop.key?.name || (prop.key?.type === 'StringLiteral' ? prop.key.value : null);
    if (keyName && keyName.toLowerCase() === 'url') {
      return extractUrlInfo(prop.value);
    }
  }

  return null;
}

/**
 * Extrai chamadas de clientes HTTP (fetch e axios) a partir de uma arvore AST do Babel.
 *
 * @param {Object} astOrParseResult - AST raiz do Babel ou resultado de parseSourceToAst
 * @param {string} [filePath='client.js'] - Caminho do arquivo analisado
 * @param {Object} [options={}] - Opcoes adicionais de configuracao
 * @returns {Array<Readonly<Object>>} Lista de chamadas HTTP criadas via createHttpCall
 */
export function extractClientCalls(astOrParseResult, filePath = 'client.js', options = {}) {
  let ast = astOrParseResult;
  let resolvedFilePath = typeof filePath === 'string' && filePath.trim() ? filePath.trim() : 'client.js';

  if (astOrParseResult && typeof astOrParseResult === 'object' && 'ast' in astOrParseResult && 'ok' in astOrParseResult) {
    if (!astOrParseResult.ok || !astOrParseResult.ast) return [];
    ast = astOrParseResult.ast;
    if (typeof astOrParseResult.filePath === 'string' && astOrParseResult.filePath.trim()) {
      resolvedFilePath = astOrParseResult.filePath.trim();
    }
  }

  if (!ast || typeof ast !== 'object' || typeof ast.type !== 'string') return [];

  const customIdentifiers = Array.isArray(options?.clientIdentifiers) ? options.clientIdentifiers : [];
  const clientIdentifiers = new Set([...DEFAULT_CLIENT_IDENTIFIERS, ...customIdentifiers]);
  const rawCalls = [];

  traverse(ast, {
    VariableDeclarator(path) {
      const { node } = path;
      if (!node.id?.name || !node.init) return;

      if (node.init.type === 'CallExpression') {
        const callee = node.init.callee;
        if (callee?.type === 'MemberExpression') {
          const objName = callee.object?.name;
          const propName = callee.property?.name;
          if (objName === 'axios' && propName === 'create') {
            clientIdentifiers.add(node.id.name);
          }
        } else if (callee?.type === 'Identifier' && callee.name === 'axios') {
          clientIdentifiers.add(node.id.name);
        }
      }
    },

    CallExpression(path) {
      const { node } = path;
      const callee = node.callee;
      if (!callee) return;

      // 1. Chamadas globais de fetch(url, options) ou window.fetch(url, options)
      const isFetch =
        (callee.type === 'Identifier' && callee.name === 'fetch') ||
        (callee.type === 'MemberExpression' &&
         (callee.object?.name === 'window' || callee.object?.name === 'globalThis') &&
         callee.property?.name === 'fetch');

      if (isFetch && node.arguments.length >= 1) {
        const urlInfo = extractUrlInfo(node.arguments[0]);
        if (urlInfo) {
          const optionsNode = node.arguments[1];
          const method = extractMethodFromOptions(optionsNode, 'GET');

          if (SUPPORTED_HTTP_METHODS.includes(method)) {
            const line = callee.property?.loc?.start?.line ?? callee.loc?.start?.line ?? node.loc?.start?.line ?? 1;
            const column = callee.property?.loc?.start?.column ?? callee.loc?.start?.column ?? node.loc?.start?.column ?? 0;
            const callerName = extractCallerNameFromPath(path);

            rawCalls.push({
              method,
              canonicalPath: urlInfo.canonicalPath,
              rawUrl: urlInfo.rawUrl,
              line,
              column,
              callerName,
              clientType: 'fetch',
            });
          }
        }
        return;
      }

      // 2. Metodos de atalho do axios: client.get(url), axios.post(url, data), etc.
      if (callee.type === 'MemberExpression') {
        const propName = (callee.property?.name || callee.property?.value || '').toLowerCase();
        const objName = callee.object?.name;
        const isDefaultAxios =
          callee.object?.type === 'MemberExpression' &&
          callee.object?.object?.name === 'axios' &&
          callee.object?.property?.name === 'default';

        const isKnownClient =
          (objName && clientIdentifiers.has(objName)) ||
          isDefaultAxios ||
          (callee.object?.type === 'CallExpression' &&
           callee.object?.callee?.property?.name === 'create' &&
           callee.object?.callee?.object?.name === 'axios');

        if (isKnownClient && CLIENT_HTTP_METHODS.includes(propName) && node.arguments.length >= 1) {
          const urlInfo = extractUrlInfo(node.arguments[0]);
          if (urlInfo) {
            const method = propName.toUpperCase();
            if (SUPPORTED_HTTP_METHODS.includes(method)) {
              const line = callee.property?.loc?.start?.line ?? callee.loc?.start?.line ?? node.loc?.start?.line ?? 1;
              const column = callee.property?.loc?.start?.column ?? callee.loc?.start?.column ?? node.loc?.start?.column ?? 0;
              const callerName = extractCallerNameFromPath(path);

              rawCalls.push({
                method,
                canonicalPath: urlInfo.canonicalPath,
                rawUrl: urlInfo.rawUrl,
                line,
                column,
                callerName,
                clientType: 'axios',
              });
            }
          }
          return;
        }

        if (isKnownClient && propName === 'request' && node.arguments.length >= 1) {
          const configNode = node.arguments[0];
          const urlInfo = extractUrlFromOptions(configNode);
          if (urlInfo) {
            const method = extractMethodFromOptions(configNode, 'GET');
            if (SUPPORTED_HTTP_METHODS.includes(method)) {
              const line = callee.property?.loc?.start?.line ?? callee.loc?.start?.line ?? node.loc?.start?.line ?? 1;
              const column = callee.property?.loc?.start?.column ?? callee.loc?.start?.column ?? node.loc?.start?.column ?? 0;
              const callerName = extractCallerNameFromPath(path);

              rawCalls.push({
                method,
                canonicalPath: urlInfo.canonicalPath,
                rawUrl: urlInfo.rawUrl,
                line,
                column,
                callerName,
                clientType: 'axios',
              });
            }
          }
          return;
        }
      }

      // 3. Chamadas axios genericas configuradas: axios({ method, url }) ou axios(url, { method })
      if (callee.type === 'Identifier' && clientIdentifiers.has(callee.name) && node.arguments.length >= 1) {
        const firstArg = node.arguments[0];

        if (firstArg.type === 'ObjectExpression') {
          const urlInfo = extractUrlFromOptions(firstArg);
          if (urlInfo) {
            const method = extractMethodFromOptions(firstArg, 'GET');
            if (SUPPORTED_HTTP_METHODS.includes(method)) {
              const line = callee.loc?.start?.line ?? node.loc?.start?.line ?? 1;
              const column = callee.loc?.start?.column ?? node.loc?.start?.column ?? 0;
              const callerName = extractCallerNameFromPath(path);

              rawCalls.push({
                method,
                canonicalPath: urlInfo.canonicalPath,
                rawUrl: urlInfo.rawUrl,
                line,
                column,
                callerName,
                clientType: 'axios',
              });
            }
          }
          return;
        }

        const urlInfo = extractUrlInfo(firstArg);
        if (urlInfo) {
          const secondArg = node.arguments[1];
          const method = extractMethodFromOptions(secondArg, 'GET');
          if (SUPPORTED_HTTP_METHODS.includes(method)) {
            const line = callee.loc?.start?.line ?? node.loc?.start?.line ?? 1;
            const column = callee.loc?.start?.column ?? node.loc?.start?.column ?? 0;
            const callerName = extractCallerNameFromPath(path);

            rawCalls.push({
              method,
              canonicalPath: urlInfo.canonicalPath,
              rawUrl: urlInfo.rawUrl,
              line,
              column,
              callerName,
              clientType: 'axios',
            });
          }
        }
      }
    },
  });

  rawCalls.sort((a, b) => (a.line !== b.line ? a.line - b.line : a.column - b.column));

  return rawCalls.map((call) =>
    createHttpCall({
      method: call.method,
      canonicalPath: call.canonicalPath,
      rawUrl: call.rawUrl,
      filePath: resolvedFilePath,
      line: call.line,
      column: call.column,
      callerName: call.callerName,
      clientType: call.clientType,
    })
  );
}
