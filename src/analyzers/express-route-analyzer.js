/**
 * Analisador AST de Declaracoes de Rotas Express
 * rest-api-matrix-analyzer
 *
 * Inspeciona arvores de sintaxe abstrata (AST) do Babel para identificar
 * rotas Express, rotas encadeadas, middlewares e prefixos de sub-roteadores.
 */

import babelTraverse from '@babel/traverse';
import { createRoute, SUPPORTED_HTTP_METHODS } from '../types/domain-contracts.js';

const traverse = babelTraverse.default || babelTraverse;

export const EXPRESS_ROUTING_METHODS = Object.freeze([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'all',
  'options',
  'head',
]);

/**
 * Combina prefixo e caminho de rota normalizando barras sem duplicatas.
 */
export function combineRoutePaths(prefix, path) {
  const normPrefix = typeof prefix === 'string' ? prefix.trim() : '';
  const normPath = typeof path === 'string' ? path.trim() : '';
  if (!normPrefix && !normPath) return '/';

  const formatSingle = (p) => {
    const formatted = p.startsWith('/') ? p : `/${p}`;
    return formatted.length > 1 && formatted.endsWith('/') ? formatted.slice(0, -1) : formatted;
  };

  if (!normPrefix) return formatSingle(normPath);
  if (!normPath || normPath === '/') return formatSingle(normPrefix);

  const cleanPrefix = normPrefix.endsWith('/') ? normPrefix.slice(0, -1) : normPrefix;
  const cleanPath = normPath.startsWith('/') ? normPath : `/${normPath}`;
  let combined = `${cleanPrefix}${cleanPath}`;
  if (combined.length > 1 && combined.endsWith('/')) combined = combined.slice(0, -1);

  return combined.startsWith('/') ? combined : `/${combined}`;
}

/**
 * Extrai a representacao textual de caminho a partir de no AST.
 */
export function extractPathFromNode(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;

  if (node.type === 'TemplateLiteral') {
    let raw = '';
    for (let i = 0; i < node.quasis.length; i += 1) {
      raw += node.quasis[i].value.raw || node.quasis[i].value.cooked || '';
      if (i < node.expressions.length) {
        const paramName = extractExpressionName(node.expressions[i]) || 'param';
        raw += `:${paramName}`;
      }
    }
    return raw;
  }

  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = extractPathFromNode(node.left);
    const right = extractPathFromNode(node.right) || (node.right?.name ? `:${node.right.name}` : ':param');
    if (left) return combineRoutePaths(left, right);
  }

  return null;
}

/**
 * Extrai nome legivel de identificadores, membros, chamadas ou funcoes.
 */
export function extractExpressionName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;

  if (node.type === 'MemberExpression') {
    const obj = extractExpressionName(node.object);
    const prop = node.property?.name || (node.property?.type === 'StringLiteral' ? node.property.value : null);
    return obj && prop ? `${obj}.${prop}` : prop || obj || null;
  }

  if (node.type === 'CallExpression') {
    const callee = extractExpressionName(node.callee);
    return callee ? `${callee}()` : null;
  }

  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return node.id?.name || 'anonymous';
  if (node.type === 'ArrowFunctionExpression') return 'anonymous';
  return null;
}

/**
 * Extrai lista de nomes de middlewares a partir de array de nos de argumentos.
 */
export function extractMiddlewareNames(nodes) {
  if (!Array.isArray(nodes)) return [];
  const list = [];
  for (const node of nodes) {
    if (!node) continue;
    if (node.type === 'ArrayExpression') {
      list.push(...extractMiddlewareNames(node.elements));
    } else {
      const name = extractExpressionName(node);
      if (name) list.push(name);
    }
  }
  return list;
}

export function extractHandlerName(node) {
  return extractExpressionName(node);
}

/**
 * Rastreia a origem de um encadeamento fluente 'router.route(path).get(...).post(...)'.
 */
function findRouteChainOrigin(callNode) {
  let current = callNode;

  while (current && current.type === 'CallExpression') {
    const callee = current.callee;
    if (callee?.type === 'MemberExpression') {
      const propName = (callee.property?.name || callee.property?.value || '').toLowerCase();
      if (propName === 'route') {
        return {
          pathArg: current.arguments[0],
          routerName: extractExpressionName(callee.object) || 'router',
        };
      }
      current = callee.object;
    } else {
      break;
    }
  }

  return null;
}

/**
 * Extrai declaracoes de montagem de sub-roteadores via app.use e router.use.
 */
export function extractRouterMounts(ast) {
  const mounts = [];
  if (!ast || typeof ast !== 'object') return mounts;

  traverse(ast, {
    CallExpression({ node }) {
      const callee = node.callee;
      if (callee?.type === 'MemberExpression' && (callee.property?.name || '').toLowerCase() === 'use' && node.arguments.length >= 2) {
        const prefix = extractPathFromNode(node.arguments[0]);
        const childRouter = extractExpressionName(node.arguments[node.arguments.length - 1]);
        const parentRouter = extractExpressionName(callee.object) || 'app';
        if (prefix && childRouter) mounts.push({ parentRouter, prefix, childRouter });
      }
    },
  });

  return mounts;
}

/**
 * Resolve os prefixos de rota acumulados para cada identificador de roteador.
 */
function resolveRouterPrefixes(mounts, basePrefix = '') {
  const prefixMap = new Map();
  const allChildren = new Set(mounts.map((m) => m.childRouter));

  for (const m of mounts) {
    if (!allChildren.has(m.parentRouter)) {
      prefixMap.set(m.parentRouter, [basePrefix]);
    }
  }

  let changed = true;
  for (let iter = 0; changed && iter < 10; iter += 1) {
    changed = false;
    for (const { parentRouter, prefix, childRouter } of mounts) {
      if (!prefixMap.has(parentRouter)) continue;
      const parents = prefixMap.get(parentRouter);
      const existing = prefixMap.get(childRouter) || [];
      const updated = parents
        .map((p) => combineRoutePaths(p, prefix))
        .filter((comp) => !existing.includes(comp));

      if (updated.length > 0) {
        prefixMap.set(childRouter, [...existing, ...updated]);
        changed = true;
      }
    }
  }

  return prefixMap;
}

/**
 * Extrai declaracoes de rotas Express a partir de uma arvore AST do Babel.
 *
 * @param {Object} astOrParseResult - AST raiz do Babel ou resultado de parseSourceToAst
 * @param {string} [filePath='server.js'] - Caminho do arquivo analisado
 * @param {Object} [options={}] - Opcoes adicionais de prefixo e escaneamento
 * @returns {Array<Readonly<Object>>} Lista de rotas criadas via createRoute
 */
export function extractExpressRoutes(astOrParseResult, filePath = 'server.js', options = {}) {
  let ast = astOrParseResult;
  let resolvedFilePath = typeof filePath === 'string' && filePath.trim() ? filePath.trim() : 'server.js';

  if (astOrParseResult && typeof astOrParseResult === 'object' && 'ast' in astOrParseResult && 'ok' in astOrParseResult) {
    if (!astOrParseResult.ok || !astOrParseResult.ast) return [];
    ast = astOrParseResult.ast;
    if (typeof astOrParseResult.filePath === 'string' && astOrParseResult.filePath.trim()) {
      resolvedFilePath = astOrParseResult.filePath.trim();
    }
  }

  if (!ast || typeof ast !== 'object' || typeof ast.type !== 'string') return [];

  const basePrefix = typeof options?.prefix === 'string' ? options.prefix.trim() : '';
  const mounts = extractRouterMounts(ast);
  const routerPrefixMap = resolveRouterPrefixes(mounts, basePrefix);
  const rawDeclarations = [];

  traverse(ast, {
    CallExpression({ node }) {
      const callee = node.callee;
      if (callee?.type !== 'MemberExpression') return;

      const propName = (callee.property?.name || callee.property?.value || '').toLowerCase();
      if (!EXPRESS_ROUTING_METHODS.includes(propName)) return;

      const line = callee.property?.loc?.start?.line ?? node.loc?.start?.line ?? 1;
      const column = callee.property?.loc?.start?.column ?? node.loc?.start?.column ?? 0;

      // Caso 1: Rota encadeada router.route('/path').get(...).post(...)
      const chainOrigin = findRouteChainOrigin(node);
      if (chainOrigin) {
        const rawPath = extractPathFromNode(chainOrigin.pathArg);
        if (rawPath && node.arguments.length >= 1) {
          rawDeclarations.push({
            methodName: propName,
            rawPath,
            routerName: chainOrigin.routerName,
            line,
            column,
            middlewares: extractMiddlewareNames(node.arguments.slice(0, -1)),
            handlerName: extractHandlerName(node.arguments[node.arguments.length - 1]),
          });
          return;
        }
      }

      // Caso 2: Chamada direta app.get('/path', ...middlewares, handler)
      if (node.arguments.length >= 2) {
        const pathArg = node.arguments[0];
        const rawPaths = pathArg?.type === 'ArrayExpression'
          ? pathArg.elements.map(extractPathFromNode).filter(Boolean)
          : [extractPathFromNode(pathArg)].filter(Boolean);

        if (rawPaths.length > 0) {
          const middlewares = extractMiddlewareNames(node.arguments.slice(1, -1));
          const handlerName = extractHandlerName(node.arguments[node.arguments.length - 1]);
          const routerName = extractExpressionName(callee.object) || 'app';

          for (const rawPath of rawPaths) {
            rawDeclarations.push({
              methodName: propName,
              rawPath,
              routerName,
              line,
              column,
              middlewares,
              handlerName,
            });
          }
        }
      }
    },
  });

  // Ordena deterministicamente por linha e coluna do arquivo
  rawDeclarations.sort((a, b) => (a.line !== b.line ? a.line - b.line : a.column - b.column));

  const routes = [];

  for (const decl of rawDeclarations) {
    const prefixes = routerPrefixMap.get(decl.routerName) || [basePrefix];
    const targetMethods = decl.methodName === 'all'
      ? [...SUPPORTED_HTTP_METHODS]
      : (SUPPORTED_HTTP_METHODS.includes(decl.methodName.toUpperCase()) ? [decl.methodName.toUpperCase()] : []);

    for (const prefix of prefixes) {
      const fullPath = combineRoutePaths(prefix, decl.rawPath);
      for (const method of targetMethods) {
        routes.push(
          createRoute({
            method,
            canonicalPath: fullPath,
            rawPath: fullPath,
            filePath: resolvedFilePath,
            line: decl.line,
            column: decl.column,
            middlewares: decl.middlewares,
            handlerName: decl.handlerName,
          })
        );
      }
    }
  }

  return routes;
}
