// Offline only: no fetch, browser execution, account requests, or image downloads.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {JSDOM} from 'jsdom';
import {normalizeProductImages, normalizeProductImageManifest, productImageId} from '../dist/product-images.js';

const SNAPSHOT_SOURCE = 'catalog-snapshot';
const MAX_INPUT_BYTES = 10 * 1024 * 1024;
const fail = message => { throw Error(message); };

function catalogEntries(catalog, options = {}) {
  if (!Array.isArray(catalog) || catalog.length > 10000) fail('카탈로그는 최대 10,000개 상품 배열이어야 합니다.');
  const products = {};
  for (const product of catalog) {
    const id = productImageId(product?.id);
    if (!id || Object.hasOwn(products, id)) fail('잘못되거나 중복된 카탈로그 상품 ID입니다.');
    products[id] = {images: normalizeProductImages(product.images, options), source: SNAPSHOT_SOURCE};
  }
  return products;
}

function withCoverage(products, catalogCount) {
  const entries = Object.values(products), sources = new Map();
  for (const entry of entries) sources.set(entry.source, (sources.get(entry.source) || 0) + 1);
  return {
    schema: 1, products,
    coverage: {
      catalogProducts: catalogCount, indexedProducts: entries.length,
      multiImageProducts: entries.filter(entry => entry.images.length > 1).length,
      imageUrls: entries.reduce((total, entry) => total + entry.images.length, 0),
      sourceCounts: Object.fromEntries(sources),
      additionalImagesComplete: false
    }
  };
}

export function createImageManifest(catalog, options = {}) {
  const products = catalogEntries(catalog, options);
  return withCoverage(products, catalog.length);
}

function htmlRows(text) {
  const dom = new JSDOM(text); // Scripts and external resources are disabled by default.
  try {
    const roots = [dom.window.document], rows = [];
    for (let index = 0; index < roots.length; index++) {
      const root = roots[index];
      for (const template of root.querySelectorAll('template')) roots.push(template.content);
      for (const element of root.querySelectorAll('[data-product-images-id]')) {
        if (element.parentElement?.closest('[data-product-images-id]')) fail('상품 사진 수집 항목을 중첩할 수 없습니다.');
        const nodes = element.querySelectorAll('[data-product-image-url], img[data-src], img[src]');
        rows.push({
          id: element.getAttribute('data-product-images-id'),
          images: Array.from(nodes, node => node.hasAttribute('data-product-image-url')
            ? node.getAttribute('data-product-image-url')
            : node.hasAttribute('data-src') ? node.getAttribute('data-src') : node.getAttribute('src'))
        });
      }
    }
    return rows;
  } finally { dom.window.close(); }
}

function jsonRows(text) {
  const value = JSON.parse(text);
  if (Array.isArray(value)) return value;
  if (!value || value.schema !== 1 || !value.products || Array.isArray(value.products) ||
      typeof value.products !== 'object' || Object.keys(value).some(key => !['schema', 'products', 'coverage'].includes(key))) {
    fail('수집 JSON은 {id,images} 배열 또는 schema 1의 products 객체여야 합니다.');
  }
  return Object.entries(value.products).map(([id, entry]) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(key => !['images', 'source'].includes(key))) {
      fail('수집 JSON 사진 항목이 올바르지 않습니다.');
    }
    return {id, images: entry.images};
  });
}

export function readImageCollection(text, {format = 'json', source, ...options} = {}) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_INPUT_BYTES || text.includes('\0')) fail('수집 파일은 NUL 없는 10MiB 이하 UTF-8이어야 합니다.');
  if (/<!--\s*\/[\s\S]*?\/\s*-->/u.test(text)) fail('해석되지 않은 메이크샵 가상 태그가 남아 있습니다. 원본 템플릿 대신 실제 출력 결과를 입력하세요.');
  if (!['json', 'html'].includes(format)) fail('수집 형식은 json 또는 html이어야 합니다.');
  const rows = format === 'html' ? htmlRows(text) : jsonRows(text);
  if (!rows.length || rows.length > 20000) fail('수집된 상품 사진 항목이 없거나 20,000개를 초과합니다.');
  const products = {};
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        Object.keys(row).some(key => !['id', 'images', 'source'].includes(key))) fail('수집 항목에는 id와 images만 사용할 수 있습니다.');
    const id = productImageId(row.id);
    if (!id) fail('수집 상품 ID가 올바르지 않습니다.');
    const images = normalizeProductImages(row.images, {...options, allowRelative: true, allowLocal: false});
    products[id] = {
      images: [...new Set([...(products[id]?.images || []), ...images])], source
    };
  }
  const normalized = normalizeProductImageManifest({schema: 1, products}, options);
  return {...normalized, inputRows: rows.length};
}

export function mergeImageManifest(catalog, manifest, collection, options = {}) {
  const fallback = catalogEntries(catalog, options);
  const previous = normalizeProductImageManifest(manifest, options);
  const incoming = normalizeProductImageManifest({schema: 1, products: collection.products}, options);
  const products = {}, report = {
    inputRows: collection.inputRows ?? Object.keys(incoming.products).length,
    inputProducts: Object.keys(incoming.products).length,
    importedProducts: 0, preservedGalleries: 0, ignoredUnknownIds: []
  };
  for (const [id, baseline] of Object.entries(fallback)) {
    const entry = previous.products[id];
    products[id] = !entry || (baseline.images.length > 1 && entry.images.length === 1) ? baseline : entry;
  }
  for (const [id, entry] of Object.entries(incoming.products)) {
    if (!Object.hasOwn(products, id)) { report.ignoredUnknownIds.push(id); continue; }
    if (products[id].images.length > 1 && entry.images.length === 1) {
      report.preservedGalleries++;
      continue;
    }
    products[id] = entry;
    report.importedProducts++;
  }
  const result = withCoverage(products, catalog.length);
  return {manifest: result, report: {...report, coverage: result.coverage}};
}

function parseArgs(argv) {
  const command = argv.shift(), options = {allowedHosts: []};
  const keys = {'--catalog': 'catalog', '--manifest': 'manifest', '--input': 'input', '--output': 'output', '--source': 'source', '--base-url': 'baseUrl', '--format': 'format'};
  while (argv.length) {
    const key = argv.shift();
    if (key === '--force') { options.force = true; continue; }
    const value = argv.shift();
    if (!value || value.startsWith('--')) fail('옵션 값이 필요합니다: ' + key);
    if (key === '--allow-host') options.allowedHosts.push(value);
    else if (keys[key] && options[keys[key]] === undefined) options[keys[key]] = value;
    else fail('알 수 없거나 중복된 옵션: ' + key);
  }
  return {command, options};
}

function readJson(filename) {
  const stat = fs.statSync(filename);
  if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) fail('입력은 10MiB 이하 파일이어야 합니다.');
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function writeManifest(filename, value) {
  const temporary = path.resolve(filename) + '.tmp-' + randomUUID();
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
    fs.renameSync(temporary, filename);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function runProductImages(argv) {
  if (!argv.length || argv[0] === '--help') {
    console.log('Usage: node scripts/product-images.mjs init|merge --catalog FILE --output FILE [--manifest FILE --input FILE --source LABEL --base-url HTTPS_URL --allow-host HOST --force]');
    return;
  }
  const {command, options} = parseArgs([...argv]);
  if (!['init', 'merge'].includes(command) || !options.catalog || !options.output) fail('init 또는 merge와 --catalog, --output이 필요합니다.');
  if (path.resolve(options.output) === path.resolve(options.catalog) ||
      (options.input && path.resolve(options.output) === path.resolve(options.input))) fail('카탈로그·수집 원본 파일을 출력으로 덮어쓸 수 없습니다.');
  if (command === 'init' && fs.existsSync(options.output) && !options.force) fail('출력 파일이 이미 있습니다. 초기화로 기존 수집 결과를 지우려면 --force가 필요합니다.');
  const catalog = readJson(options.catalog);
  if (command === 'init') {
    const manifest = createImageManifest(catalog, options);
    writeManifest(options.output, manifest);
    console.log(JSON.stringify({operation: 'init', coverage: manifest.coverage}));
    return;
  }
  if (!options.input || !options.source) fail('merge에는 --input과 실제 수집 출처 --source가 필요합니다.');
  const stat = fs.statSync(options.input);
  if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) fail('수집 파일은 10MiB 이하 파일이어야 합니다.');
  const text = fs.readFileSync(options.input, 'utf8');
  const format = options.format || (path.extname(options.input).toLowerCase() === '.json' ? 'json' : 'html');
  const collection = readImageCollection(text, {...options, format});
  const manifest = options.manifest ? readJson(options.manifest) : createImageManifest(catalog, options);
  const result = mergeImageManifest(catalog, manifest, collection, options);
  writeManifest(options.output, result.manifest);
  console.log(JSON.stringify({operation: 'merge', ...result.report}));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runProductImages(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
