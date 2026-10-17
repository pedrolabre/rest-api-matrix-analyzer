import { describe, it, expect, vi } from 'vitest';
import JSZip from 'jszip';
import {
  extractProjectFromZip,
  getCommonRootPrefix,
  isZipFile,
} from '../../src/parsers/zip-extractor.js';

describe('isZipFile', () => {
  it('identifica extensoes .zip como verdadeiras independentemente de maiusculas', () => {
    expect(isZipFile('project.zip')).toBe(true);
    expect(isZipFile('PROJECT.ZIP')).toBe(true);
    expect(isZipFile('archive.Zip')).toBe(true);
    expect(isZipFile('/path/to/archive.zip')).toBe(true);
  });

  it('rejeita extensoes que nao sao .zip', () => {
    expect(isZipFile('project.tar.gz')).toBe(false);
    expect(isZipFile('project.rar')).toBe(false);
    expect(isZipFile('project.7z')).toBe(false);
    expect(isZipFile('app.js')).toBe(false);
    expect(isZipFile('archive.zip.bak')).toBe(false);
  });

  it('valida objetos File ou Blob pelo nome ou tipo MIME', () => {
    expect(isZipFile({ name: 'code.zip', type: '' })).toBe(true);
    expect(isZipFile({ name: 'code.tar', type: 'application/zip' })).toBe(true);
    expect(isZipFile({ name: 'upload', type: 'application/x-zip-compressed' })).toBe(true);
    expect(isZipFile({ name: 'upload', type: 'application/x-zip' })).toBe(true);
    expect(isZipFile({ name: 'script.js', type: 'text/javascript' })).toBe(false);
  });

  it('retorna false para valores nulos, vazios ou indefinidos', () => {
    expect(isZipFile(null)).toBe(false);
    expect(isZipFile(undefined)).toBe(false);
    expect(isZipFile('')).toBe(false);
    expect(isZipFile({})).toBe(false);
  });
});

describe('getCommonRootPrefix', () => {
  it('retorna o prefixo comum quando todos os arquivos compartilham a mesma pasta raiz', () => {
    const paths = [
      'repo-main/package.json',
      'repo-main/src/index.js',
      'repo-main/src/controllers/userController.js',
    ];
    expect(getCommonRootPrefix(paths)).toBe('repo-main');
  });

  it('retorna string vazia quando ha arquivos na raiz sem pasta pai', () => {
    const paths = [
      'package.json',
      'src/index.js',
      'README.md',
    ];
    expect(getCommonRootPrefix(paths)).toBe('');
  });

  it('retorna string vazia quando existem multiplas raizes distintas', () => {
    const paths = [
      'project-a/index.js',
      'project-b/index.js',
    ];
    expect(getCommonRootPrefix(paths)).toBe('');
  });

  it('retorna string vazia para arrays vazios ou entradas invalidas', () => {
    expect(getCommonRootPrefix([])).toBe('');
    expect(getCommonRootPrefix(null)).toBe('');
    expect(getCommonRootPrefix(undefined)).toBe('');
  });

  it('normaliza barras invertidas do Windows ao calcular a raiz', () => {
    const paths = [
      'my-app\\package.json',
      'my-app\\src\\index.js',
    ];
    expect(getCommonRootPrefix(paths)).toBe('my-app');
  });
});

describe('extractProjectFromZip', () => {
  it('lanca TypeError caso zipInput seja nulo ou indefinido', async () => {
    await expect(extractProjectFromZip(null)).rejects.toThrow(TypeError);
    await expect(extractProjectFromZip(undefined)).rejects.toThrow(TypeError);
    await expect(extractProjectFromZip(123)).rejects.toThrow(TypeError);
  });

  it('lanca Error com mensagem descritiva caso os bytes nao formem um ZIP valido', async () => {
    const invalidBuffer = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    await expect(extractProjectFromZip(invalidBuffer)).rejects.toThrow(
      /Falha ao descompactar arquivo ZIP/
    );
  });

  it('retorna array vazio para um arquivo ZIP sem arquivos', async () => {
    const zip = new JSZip();
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    const result = await extractProjectFromZip(zipBuffer);
    expect(result).toEqual([]);
  });

  it('extrai arquivos de codigo JavaScript validos e ignora manifestos e documentacao', async () => {
    const zip = new JSZip();
    zip.file('src/index.js', 'export const a = 1;');
    zip.file('src/components/App.jsx', 'export function App() { return null; }');
    zip.file('server/api.cjs', 'module.exports = {};');
    zip.file('server/utils.mjs', 'export const b = 2;');
    zip.file('package.json', '{"name": "test"}');
    zip.file('README.md', '# Readme');
    zip.file('styles.css', 'body { margin: 0; }');

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const files = await extractProjectFromZip(zipBuffer);

    expect(files).toHaveLength(4);

    const relativePaths = files.map((f) => f.relativePath).sort();
    expect(relativePaths).toEqual([
      'server/api.cjs',
      'server/utils.mjs',
      'src/components/App.jsx',
      'src/index.js',
    ]);

    const indexFile = files.find((f) => f.relativePath === 'src/index.js');
    expect(indexFile).toBeDefined();
    expect(indexFile.name).toBe('index.js');
    expect(typeof indexFile.text).toBe('function');
    expect(await indexFile.text()).toBe('export const a = 1;');
  });

  it('descarta entradas explicitas de diretorio', async () => {
    const zip = new JSZip();
    zip.folder('src');
    zip.folder('src/empty-folder');
    zip.file('package.json', '{}');
    zip.file('src/index.js', 'console.log("hello");');

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const files = await extractProjectFromZip(zipBuffer);

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('src/index.js');
  });

  it('remove automaticamente o prefixo da pasta raiz comum (stripRoot = true)', async () => {
    const zip = new JSZip();
    zip.file('rest-api-repo-main/package.json', '{}');
    zip.file('rest-api-repo-main/src/server.js', 'const express = require("express");');
    zip.file('rest-api-repo-main/src/routes/users.js', 'const router = express.Router();');

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const files = await extractProjectFromZip(zipBuffer, { stripRoot: true });

    expect(files).toHaveLength(2);
    const sorted = [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    expect(sorted.map((f) => f.relativePath)).toEqual([
      'src/routes/users.js',
      'src/server.js',
    ]);
    expect(sorted[0].name).toBe('users.js');
    expect(sorted[1].name).toBe('server.js');
  });

  it('preserva o prefixo da pasta raiz quando stripRoot = false', async () => {
    const zip = new JSZip();
    zip.file('rest-api-repo-main/src/server.js', 'const express = require("express");');

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const files = await extractProjectFromZip(zipBuffer, { stripRoot: false });

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('rest-api-repo-main/src/server.js');
    expect(files[0].name).toBe('server.js');
  });

  it('descarta pastas ignoradas como node_modules, dist, build, .git e coverage', async () => {
    const zip = new JSZip();
    zip.file('package.json', '{}');
    zip.file('src/app.js', 'console.log("app");');
    zip.file('node_modules/express/index.js', 'module.exports = {};');
    zip.file('dist/bundle.js', 'var x = 1;');
    zip.file('build/main.js', 'var y = 2;');
    zip.file('.git/hooks/pre-commit.js', 'console.log("hook");');
    zip.file('coverage/lcov-report/index.js', 'console.log("report");');
    zip.file('.next/server/pages/index.js', 'console.log("next");');

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const files = await extractProjectFromZip(zipBuffer);

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('src/app.js');
  });

  it('descarta arquivos de credenciais e segredos (.env)', async () => {
    const zip = new JSZip();
    zip.file('package.json', '{}');
    zip.file('src/index.js', 'console.log("app");');
    zip.file('.env', 'DATABASE_URL=postgres://');
    zip.file('.env.local', 'SECRET_KEY=123');
    zip.file('.env.production', 'API_KEY=abc');
    zip.file('.env.example', 'DATABASE_URL=');

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const files = await extractProjectFromZip(zipBuffer);

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('src/index.js');
  });

  it('descarta arquivos minificados e bundles pre-compilados', async () => {
    const zip = new JSZip();
    zip.file('package.json', '{}');
    zip.file('src/app.js', 'console.log("app");');
    zip.file('src/vendor.min.js', 'minified code');
    zip.file('src/bundle.js', 'bundled code');
    zip.file('src/app.bundle.js', 'bundled code');

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const files = await extractProjectFromZip(zipBuffer);

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('src/app.js');
  });

  it('ignora artefatos de sistema operacional como __MACOSX e .DS_Store', async () => {
    const zip = new JSZip();
    zip.file('__MACOSX/._app.js', 'apple metadata');
    zip.file('project/package.json', '{}');
    zip.file('project/.DS_Store', 'binary metadata');
    zip.file('project/Thumbs.db', 'windows thumbnail');
    zip.file('project/src/index.js', 'export default {};');

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const files = await extractProjectFromZip(zipBuffer);

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('src/index.js');
  });

  it('invoca o callback onFileFound para cada arquivo valido processado', async () => {
    const zip = new JSZip();
    zip.file('package.json', '{}');
    zip.file('src/a.js', 'const a = 1;');
    zip.file('src/b.js', 'const b = 2;');
    zip.file('node_modules/c.js', 'const c = 3;');

    const onFileFound = vi.fn();
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });

    await extractProjectFromZip(zipBuffer, { onFileFound });

    expect(onFileFound).toHaveBeenCalledTimes(2);
    expect(onFileFound).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'a.js',
        relativePath: 'src/a.js',
      })
    );
    expect(onFileFound).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'b.js',
        relativePath: 'src/b.js',
      })
    );
  });

  it('respeita a opcao maxFiles e interrompe a extracao ao atingir o teto', async () => {
    const zip = new JSZip();
    zip.file('package.json', '{}');
    zip.file('src/a.js', 'const a = 1;');
    zip.file('src/b.js', 'const b = 2;');
    zip.file('src/c.js', 'const c = 3;');

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    const files = await extractProjectFromZip(zipBuffer, { maxFiles: 2 });

    expect(files).toHaveLength(2);
  });

  it('suporta entrada no formato Uint8Array', async () => {
    const zip = new JSZip();
    zip.file('package.json', '{}');
    zip.file('src/index.js', 'console.log("uint8array");');

    const buffer = await zip.generateAsync({ type: 'arraybuffer' });
    const uint8 = new Uint8Array(buffer);

    const files = await extractProjectFromZip(uint8);
    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('src/index.js');
    expect(await files[0].text()).toBe('console.log("uint8array");');
  });

  it('suporta entrada no formato Blob', async () => {
    const zip = new JSZip();
    zip.file('package.json', '{}');
    zip.file('src/index.js', 'console.log("blob");');

    const blob = await zip.generateAsync({ type: 'blob' });
    const files = await extractProjectFromZip(blob);

    expect(files).toHaveLength(1);
    expect(files[0].relativePath).toBe('src/index.js');
    expect(await files[0].text()).toBe('console.log("blob");');
  });
});
