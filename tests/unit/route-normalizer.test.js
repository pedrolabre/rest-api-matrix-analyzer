/**
 * Testes Unitarios - Algoritmo de Normalizacao e Canonizacao de Rotas
 * rest-api-matrix-analyzer
 */

import { describe, it, expect } from 'vitest';
import {
  CANONICAL_PARAM_PLACEHOLDER,
  canonicalizeRoutePath,
  splitRouteSegments,
  isParamSegment,
  areRoutesEquivalent,
  extractRouteParameters,
  normalizeBaseUrl,
} from '../../src/analyzers/route-normalizer.js';

describe('route-normalizer', () => {
  describe('CANONICAL_PARAM_PLACEHOLDER', () => {
    it('deve exportar a constante imutavel de placeholder de parametro', () => {
      expect(CANONICAL_PARAM_PLACEHOLDER).toBe(':param');
    });
  });

  describe('canonicalizeRoutePath', () => {
    describe('caminhos estaticos simples', () => {
      it('deve preservar caminhos estaticos padrao', () => {
        expect(canonicalizeRoutePath('/api/users')).toBe('/api/users');
        expect(canonicalizeRoutePath('/api/v1/auth/login')).toBe('/api/v1/auth/login');
      });

      it('deve adicionar barra inicial caso omitida', () => {
        expect(canonicalizeRoutePath('api/users')).toBe('/api/users');
        expect(canonicalizeRoutePath('health')).toBe('/health');
      });

      it('deve remover barras finais redundantes preservando o recurso', () => {
        expect(canonicalizeRoutePath('/api/users/')).toBe('/api/users');
        expect(canonicalizeRoutePath('/api/v1/posts/')).toBe('/api/v1/posts');
      });

      it('deve colapsar multiplas barras consecutivas', () => {
        expect(canonicalizeRoutePath('///api///users///')).toBe('/api/users');
        expect(canonicalizeRoutePath('/api//v1///products')).toBe('/api/v1/products');
      });

      it('deve preservar estritamente a rota raiz', () => {
        expect(canonicalizeRoutePath('/')).toBe('/');
        expect(canonicalizeRoutePath('///')).toBe('/');
        expect(canonicalizeRoutePath('')).toBe('/');
        expect(canonicalizeRoutePath('   ')).toBe('/');
      });

      it('deve lidar defensivamente com entradas nao-string', () => {
        expect(canonicalizeRoutePath(null)).toBe('/');
        expect(canonicalizeRoutePath(undefined)).toBe('/');
        expect(canonicalizeRoutePath(123)).toBe('/');
        expect(canonicalizeRoutePath({})).toBe('/');
      });

      it('deve sanitizar espacos em branco nas extremidades', () => {
        expect(canonicalizeRoutePath('  /api/users  ')).toBe('/api/users');
      });
    });

    describe('parametros Express', () => {
      it('deve harmonizar um parametro Express :id para :param', () => {
        expect(canonicalizeRoutePath('/api/users/:id')).toBe('/api/users/:param');
      });

      it('deve harmonizar identificadores express customizados (:userId, :orderId)', () => {
        expect(canonicalizeRoutePath('/api/users/:userId')).toBe('/api/users/:param');
        expect(canonicalizeRoutePath('/api/orders/:orderId')).toBe('/api/orders/:param');
      });

      it('deve harmonizar multiplos parametros Express no mesmo caminho', () => {
        expect(
          canonicalizeRoutePath('/api/orgs/:orgId/teams/:teamId/members/:memberId')
        ).toBe('/api/orgs/:param/teams/:param/members/:param');
      });

      it('deve harmonizar parametros Express com regex inline (:id(\\d+))', () => {
        expect(canonicalizeRoutePath('/api/users/:id(\\d+)')).toBe('/api/users/:param');
      });

      it('deve harmonizar parametros opcionais do Express (:id?)', () => {
        expect(canonicalizeRoutePath('/api/users/:id?')).toBe('/api/users/:param');
      });

      it('deve converter wildcards de rota (*) para :param', () => {
        expect(canonicalizeRoutePath('/api/files/*')).toBe('/api/files/:param');
        expect(canonicalizeRoutePath('/*')).toBe('/:param');
      });
    });

    describe('template literals interpolados do frontend', () => {
      it('deve converter interpolacao simples ${id} para :param', () => {
        expect(canonicalizeRoutePath('/api/users/${id}')).toBe('/api/users/:param');
      });

      it('deve converter interpolacao com nomes compostos ${userId}', () => {
        expect(canonicalizeRoutePath('/api/users/${userId}/profile')).toBe(
          '/api/users/:param/profile'
        );
      });

      it('deve converter multiplas interpolacoes no mesmo caminho', () => {
        expect(
          canonicalizeRoutePath('/api/users/${userId}/posts/${postId}/comments')
        ).toBe('/api/users/:param/posts/:param/comments');
      });
    });

    describe('concatenacoes de strings (+ id)', () => {
      it('deve normalizar padrao de concatenacao textual simples', () => {
        expect(canonicalizeRoutePath('/api/users/ + id')).toBe('/api/users/:param');
      });

      it('deve normalizar concatenacao com identificador de variavel longo', () => {
        expect(canonicalizeRoutePath('/api/products/ + productId')).toBe(
          '/api/products/:param'
        );
      });

      it('deve normalizar concatenacao entre aspas', () => {
        expect(canonicalizeRoutePath("'/api/users/' + id")).toBe('/api/users/:param');
      });

      it('deve normalizar concatenacao com sub-rotas intermediarias', () => {
        expect(canonicalizeRoutePath('/api/users/ + id + /details')).toBe(
          '/api/users/:param/details'
        );
      });
    });

    describe('truncamento de query strings e hashes', () => {
      it('deve truncar query strings simples a partir do caractere ?', () => {
        expect(canonicalizeRoutePath('/api/users?page=1')).toBe('/api/users');
      });

      it('deve truncar query strings complexas com multiplos parametros', () => {
        expect(
          canonicalizeRoutePath('/api/products?category=electronics&sort=desc&limit=20')
        ).toBe('/api/products');
      });

      it('deve truncar fragmentos de hash (#)', () => {
        expect(canonicalizeRoutePath('/api/docs#section-auth')).toBe('/api/docs');
      });

      it('deve truncar query string seguida de fragmento de hash', () => {
        expect(canonicalizeRoutePath('/api/items?tab=all#overview')).toBe('/api/items');
      });

      it('deve truncar query string anexada a um parametro dinamico', () => {
        expect(canonicalizeRoutePath('/api/users/:userId?fields=email,name')).toBe(
          '/api/users/:param'
        );
        expect(canonicalizeRoutePath('/api/users/${id}?active=true')).toBe(
          '/api/users/:param'
        );
      });
    });

    describe('URLs absolutas com protocolo e dominio', () => {
      it('deve extrair o caminho canonico de URL absoluta HTTP', () => {
        expect(canonicalizeRoutePath('http://localhost:3000/api/users/:id')).toBe(
          '/api/users/:param'
        );
      });

      it('deve extrair o caminho canonico de URL absoluta HTTPS', () => {
        expect(canonicalizeRoutePath('https://api.domain.com/v1/auth/login')).toBe(
          '/v1/auth/login'
        );
      });

      it('deve tratar URL absoluta com porta, query string e parametro interpolado', () => {
        expect(
          canonicalizeRoutePath('http://127.0.0.1:8080/api/users/${id}?role=admin#main')
        ).toBe('/api/users/:param');
      });

      it('deve retornar rota raiz para URLs absolutas sem caminho posterior', () => {
        expect(canonicalizeRoutePath('https://api.example.com')).toBe('/');
        expect(canonicalizeRoutePath('https://api.example.com/')).toBe('/');
      });
    });
  });

  describe('splitRouteSegments', () => {
    it('deve retornar array vazio para rota raiz', () => {
      expect(splitRouteSegments('/')).toEqual([]);
      expect(splitRouteSegments('')).toEqual([]);
      expect(splitRouteSegments('///')).toEqual([]);
    });

    it('deve decompor rota simples em segmentos de caminho', () => {
      expect(splitRouteSegments('/api/users')).toEqual(['api', 'users']);
    });

    it('deve decompor rota com parametros canonizados', () => {
      expect(splitRouteSegments('/api/users/:id/orders')).toEqual([
        'api',
        'users',
        ':param',
        'orders',
      ]);
    });

    it('deve tratar defensivamente entradas invalidas retornando array vazio', () => {
      expect(splitRouteSegments(null)).toEqual([]);
      expect(splitRouteSegments(undefined)).toEqual([]);
    });
  });

  describe('isParamSegment', () => {
    it('deve identificar :param como segmento parametrizado', () => {
      expect(isParamSegment(':param')).toBe(true);
    });

    it('deve identificar parametros Express nomeados (:id, :userId)', () => {
      expect(isParamSegment(':id')).toBe(true);
      expect(isParamSegment(':userId')).toBe(true);
    });

    it('deve identificar wildcard * como parametro', () => {
      expect(isParamSegment('*')).toBe(true);
    });

    it('deve identificar template interpolado ${id} como parametro', () => {
      expect(isParamSegment('${id}')).toBe(true);
    });

    it('deve retornar false para segmentos estaticos convencionais', () => {
      expect(isParamSegment('users')).toBe(false);
      expect(isParamSegment('api')).toBe(false);
      expect(isParamSegment('v1')).toBe(false);
    });

    it('deve retornar false para entradas invalidas', () => {
      expect(isParamSegment(null)).toBe(false);
      expect(isParamSegment(undefined)).toBe(false);
      expect(isParamSegment(42)).toBe(false);
    });
  });

  describe('areRoutesEquivalent', () => {
    it('deve considerar equivalentes rotas express e chamadas interpoladas correspondentes', () => {
      expect(areRoutesEquivalent('/api/users/:id', '/api/users/${userId}')).toBe(true);
    });

    it('deve considerar equivalentes rotas com concatenacao e express', () => {
      expect(areRoutesEquivalent('/api/users/:id', '/api/users/ + id')).toBe(true);
    });

    it('deve considerar equivalentes URLs absolutas e caminhos relativos correspondentes', () => {
      expect(
        areRoutesEquivalent(
          '/api/users/:id/orders',
          'http://localhost:3000/api/users/${userId}/orders?sort=desc'
        )
      ).toBe(true);
    });

    it('deve retornar false para rotas com recursos ou estruturas diferentes', () => {
      expect(areRoutesEquivalent('/api/users', '/api/users/:id')).toBe(false);
      expect(areRoutesEquivalent('/api/users', '/api/products')).toBe(false);
      expect(areRoutesEquivalent('/api/users/:id', '/api/users/:id/details')).toBe(false);
    });
  });

  describe('extractRouteParameters', () => {
    it('deve extrair nomes de parametros Express', () => {
      expect(extractRouteParameters('/api/users/:userId/orders/:orderId')).toEqual([
        'userId',
        'orderId',
      ]);
    });

    it('deve extrair nomes de variaveis de template literals', () => {
      expect(
        extractRouteParameters('/api/orgs/${orgId}/teams/${teamId}/members/${memberId}')
      ).toEqual(['orgId', 'teamId', 'memberId']);
    });

    it('deve extrair nomes de variaveis em concatenacoes', () => {
      expect(extractRouteParameters('/api/users/ + userId + /orders/ + orderId')).toEqual([
        'userId',
        'orderId',
      ]);
    });

    it('deve desduplicar nomes repetidos de parametros', () => {
      expect(extractRouteParameters('/api/users/:id/posts/:id')).toEqual(['id']);
    });

    it('deve retornar array vazio para rotas estaticas sem parametros', () => {
      expect(extractRouteParameters('/api/users/list')).toEqual([]);
      expect(extractRouteParameters('/')).toEqual([]);
    });

    it('deve retornar array vazio para entradas invalidas', () => {
      expect(extractRouteParameters(null)).toEqual([]);
      expect(extractRouteParameters('')).toEqual([]);
      expect(extractRouteParameters(undefined)).toEqual([]);
    });
  });

  describe('normalizeBaseUrl', () => {
    it('deve extrair caminho limpo de URL base com protocolo', () => {
      expect(normalizeBaseUrl('https://api.example.com/v1/')).toBe('/v1');
      expect(normalizeBaseUrl('http://localhost:8080/api')).toBe('/api');
    });

    it('deve normalizar prefixos relativos de sub-roteadores', () => {
      expect(normalizeBaseUrl('/api/v1/')).toBe('/api/v1');
      expect(normalizeBaseUrl('api/v2')).toBe('/api/v2');
      expect(normalizeBaseUrl('///api///')).toBe('/api');
    });

    it('deve retornar rota raiz para base URLs vazias ou sem caminho', () => {
      expect(normalizeBaseUrl('https://api.example.com')).toBe('/');
      expect(normalizeBaseUrl('/')).toBe('/');
      expect(normalizeBaseUrl('')).toBe('/');
      expect(normalizeBaseUrl(null)).toBe('/');
    });
  });
});
