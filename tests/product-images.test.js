import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createProductImageLookup, normalizeProductImages, normalizeProductImageManifest, productImageId} from '../dist/product-images.js';
import {createImageManifest, readImageCollection, mergeImageManifest} from '../scripts/product-images.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(new URL('../dist/assets/product-images.json', import.meta.url), 'utf8'));
const generator = fileURLToPath(new URL('../scripts/product-images.mjs', import.meta.url));
const image = name => 'https://www.pink-rocket.com/shopimages/curiouswiz/' + name + '.jpg';
const fixture = [
  {id: '2085891', name: '검증 갤러리', images: ['assets/product-2085891-1.jpg', 'assets/product-2085891-2.jpg', 'assets/product-2085891-3.jpg']},
  {id: '2085000', name: '대표 사진', images: [image('one')]},
  {id: '2084000', name: '다른 상품', images: [image('other')]}
];
const entry = (images, source = 'copy-skin-preview') => ({images, source});
const bundle = products => ({schema: 1, products});

function temporaryDirectory(t) {
  const root = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(root, 'pinkrocket-product-images-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(directory)), root);
    assert.match(path.basename(directory), /^pinkrocket-product-images-/);
    fs.rmSync(directory, {recursive: true, force: true});
  });
  return directory;
}

test('the checked-in manifest preserves all 2379 product image arrays and their real order', () => {
  assert.equal(catalog.length, 2379);
  assert.deepEqual(manifest, createImageManifest(catalog));
  const before = JSON.stringify(catalog), getProductImages = createProductImageLookup(catalog, manifest);
  for (const product of catalog) assert.deepEqual(getProductImages(product.id), product.images);
  assert.equal(JSON.stringify(catalog), before);
  assert.equal(Object.keys(manifest.products).length, 2379);
  assert.deepEqual(manifest.coverage, {
    catalogProducts: 2379, indexedProducts: 2379, multiImageProducts: 4, imageUrls: 2387,
    sourceCounts: {'catalog-snapshot': 2379}, additionalImagesComplete: false
  });
  assert.equal(getProductImages.report.appliedProducts, 2379);
  assert.equal(getProductImages.report.additionalImagesComplete, false);
});

test('lookup is a stable synchronous snapshot and returns independent arrays for exact product IDs', () => {
  const products = structuredClone(fixture), data = bundle({'2085000': entry([image('second'), image('first')])});
  const getProductImages = createProductImageLookup(products, data);
  const result = getProductImages('2085000');
  assert.deepEqual(result, [image('second'), image('first')]);
  result.reverse();result.push(image('caller-write'));
  data.products['2085000'].images[0] = image('later-write');products[0].images.length = 0;
  assert.deepEqual(getProductImages(2085000), [image('second'), image('first')]);
  assert.equal(getProductImages('2085891').length, 3);
  for (const id of ['', '02085000', '2085000\n', -1, 1.5, {}, null, '2085000&x=1', '9999999']) assert.deepEqual(getProductImages(id), []);
  assert.equal(Object.isFrozen(getProductImages.report), true);
});

test('missing or malformed manifests preserve existing representative photos and reviewed galleries', () => {
  for (const data of [undefined, null, {}, {schema: 2, products: {}}, {schema: 1, products: []}]) {
    const getProductImages = createProductImageLookup(fixture, data);
    for (const product of fixture) assert.deepEqual(getProductImages(product.id), product.images);
    assert.equal(getProductImages.report.state, 'fallback');
  }
  const getProductImages = createProductImageLookup(fixture, bundle({
    '2085891': entry([image('only-representative')]),
    '2085000': entry(['javascript:alert(1)']),
    '2084000': entry([image('new-first'), image('new-second')]),
    '9999999': entry([image('unknown')])
  }));
  assert.deepEqual(getProductImages('2085891'), fixture[0].images);
  assert.deepEqual(getProductImages('2085000'), fixture[1].images);
  assert.deepEqual(getProductImages('2084000'), [image('new-first'), image('new-second')]);
  assert.equal(getProductImages.report.preservedGalleries, 1);
  assert.deepEqual(getProductImages.report.invalidIds, ['2085000']);
  assert.deepEqual(getProductImages.report.unknownIds, ['9999999']);
  assert.equal(getProductImages.report.state, 'partial');
});

test('URL validation rejects executable, foreign, credentialed and traversing paths without dropping individual bad URLs', () => {
  const bad = [
    'http://www.pink-rocket.com/a.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA',
    'https://evil.example/a.jpg', 'https://www.pink-rocket.com.evil.example/a.jpg',
    'https://user:pass@www.pink-rocket.com/a.jpg', 'https://www.pink-rocket.com:444/a.jpg',
    'https://www.pink-rocket.com/a.jpg#fragment', ' https://www.pink-rocket.com/a.jpg',
    'https://www.pink-rocket.com/a\nb.jpg', 'https://www.pink-rocket.com\\@evil.example/a.jpg',
    'assets/../other.jpg', 'assets/%2e%2e/other.jpg', 'assets/a.svg', '<!--/product@image_s/-->', '', null
  ];
  for (const value of bad) {
    assert.throws(() => normalizeProductImages([image('valid'), value]));
    const getProductImages = createProductImageLookup(fixture, bundle({'2085891': entry([image('valid'), value])}));
    assert.deepEqual(getProductImages('2085891'), fixture[0].images);
  }
  assert.throws(() => normalizeProductImages(Array(1)));
  assert.throws(() => normalizeProductImages(Array.from({length: 41}, (_, index) => image(String(index)))));
  assert.deepEqual(normalizeProductImages([image('a'), image('b'), image('a')]), [image('a'), image('b')]);
  const cdn = 'https://images.example/real.jpg';
  assert.throws(() => normalizeProductImages([cdn]));
  assert.deepEqual(normalizeProductImages([cdn], {allowedHosts: ['images.example']}), [cdn]);
});

test('strict manifest validation rejects malformed entries, ID keys and accessor objects atomically', () => {
  for (const value of [
    bundle({'01': entry([image('a')])}), bundle({'0': entry([image('a')])}),
    bundle({'2085000': {images: [image('a')]}}), bundle({'2085000': entry([])}),
    bundle({'2085000': {...entry([image('a')]), html: '<img>'}}),
    bundle({'2085000': entry([image('a')], 'unresolved\0source')})
  ]) assert.throws(() => normalizeProductImageManifest(value));
  let read = false;
  const accessors = {schema: 1, get products() { read = true; return {}; }};
  assert.throws(() => normalizeProductImageManifest(accessors));
  assert.equal(read, false);
  assert.equal(productImageId(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(productImageId('2e6'), null);
});

test('offline JSON imports deduplicate URLs in observed order and merge only known IDs', () => {
  const text = JSON.stringify([
    {id: '2085000', images: [image('first'), image('second'), image('first')]},
    {id: '2085000', images: [image('third')]},
    {id: '2085891', images: [image('representative-only')]},
    {id: '9999999', images: [image('unknown')]}
  ]);
  const collection = readImageCollection(text, {source: 'copied-main-output'});
  const baseline = createImageManifest(fixture), before = JSON.stringify(baseline);
  const {manifest: result, report} = mergeImageManifest(fixture, baseline, collection);
  assert.deepEqual(result.products['2085000'].images, [image('first'), image('second'), image('third')]);
  assert.equal(result.products['2085000'].source, 'copied-main-output');
  assert.deepEqual(result.products['2085891'].images, fixture[0].images);
  assert.equal(Object.hasOwn(result.products, '9999999'), false);
  assert.equal(report.inputRows, 4);assert.equal(report.inputProducts, 3);assert.equal(report.importedProducts, 1);
  assert.equal(report.preservedGalleries, 1);assert.deepEqual(report.ignoredUnknownIds, ['9999999']);
  assert.equal(result.coverage.additionalImagesComplete, false);
  assert.deepEqual(result.coverage.sourceCounts, {'catalog-snapshot': 2, 'copied-main-output': 1});
  assert.equal(JSON.stringify(baseline), before);
});

test('HTML collection parses inert template markers and real gallery img URLs without executing scripts', () => {
  const html = `<script>throw Error('this must never execute')</script>
    <template><div data-product-images-id="2085000">
      <span data-product-image-url="/shopimages/curiouswiz/one.jpg"></span>
      <span data-product-image-url="//www.pink-rocket.com/shopimages/curiouswiz/two.jpg"></span>
      <img src="/shopimages/curiouswiz/fallback.jpg" data-src="/shopimages/curiouswiz/three.jpg">
      <img src="/shopimages/curiouswiz/one.jpg">
      <a href="https://evil.example/not-an-image">상세 링크는 수집하지 않음</a>
    </div></template>`;
  const result = readImageCollection(html, {format: 'html', source: 'copied-skin-output', baseUrl: 'https://www.pink-rocket.com/'});
  assert.equal(result.inputRows, 1);
  assert.deepEqual(result.products['2085000'].images, [image('one'), image('two'), image('three')]);
  assert.equal(result.products['2085000'].source, 'copied-skin-output');
});

test('unrendered Makeshop tags, empty captures, bad sources and unsafe partial imports are rejected', () => {
  const invalid = [
    {text: '<div data-product-images-id="<!--/new_product@uid/-->"><img src="<!--/new_product@image_s/-->"></div>', format: 'html'},
    {text: JSON.stringify([{id: '2085000', images: ['<!--/list_photo_gallery/-->']}])},
    {text: '<div data-product-images-id="2085000"></div>', format: 'html'},
    {text: '<div data-product-images-id="2085000"><div data-product-images-id="2084000"><img src="' + image('one') + '"></div></div>', format: 'html'},
    {text: JSON.stringify([{id: '2085000', images: [image('one')]}, {id: '2084000', images: ['https://evil.example/two.jpg']}])},
    {text: JSON.stringify([{id: '2085000', images: ['assets/product-2085891-1.jpg']}])},
    {text: '[]'}, {text: '{"schema":2,"products":{}}'}
  ];
  for (const item of invalid) assert.throws(() => readImageCollection(item.text, {format: item.format, source: 'test'}));
  assert.throws(() => readImageCollection(JSON.stringify([{id: '2085000', images: [image('one')]}]), {}));
});

test('schema JSON collection is accepted and later sparse imports preserve earlier galleries', () => {
  const collection = readImageCollection(JSON.stringify(bundle({'2085000': entry([image('a'), image('b')])})), {source: 'first-capture'});
  const first = mergeImageManifest(fixture, createImageManifest(fixture), collection).manifest;
  const sparse = readImageCollection(JSON.stringify([{id: '2084000', images: [image('fresh')]}]), {source: 'second-capture'});
  const second = mergeImageManifest(fixture, first, sparse).manifest;
  assert.deepEqual(second.products['2085000'], entry([image('a'), image('b')], 'first-capture'));
  assert.deepEqual(second.products['2084000'], entry([image('fresh')], 'second-capture'));
  assert.deepEqual(second.products['2085891'].images, fixture[0].images);
});

test('CLI init is deterministic and refuses accidental reinitialization or catalog overwrites', t => {
  const directory = temporaryDirectory(t), input = path.join(directory, 'catalog.json'), output = path.join(directory, 'images.json'), second = path.join(directory, 'second.json');
  fs.writeFileSync(input, JSON.stringify(fixture));
  const run = outputPath => spawnSync(process.execPath, [generator, 'init', '--catalog', input, '--output', outputPath], {encoding: 'utf8'});
  assert.equal(run(output).status, 0);assert.equal(run(second).status, 0);
  assert.equal(fs.readFileSync(output, 'utf8'), fs.readFileSync(second, 'utf8'));
  assert.notEqual(run(output).status, 0);
  const before = fs.readFileSync(input, 'utf8');assert.notEqual(run(input).status, 0);assert.equal(fs.readFileSync(input, 'utf8'), before);
});

test('CLI rejects an unresolved import without modifying an existing manifest or leaving temporary files', t => {
  const directory = temporaryDirectory(t), catalogPath = path.join(directory, 'catalog.json'), output = path.join(directory, 'images.json'), collected = path.join(directory, 'collected.html');
  fs.writeFileSync(catalogPath, JSON.stringify(fixture));fs.writeFileSync(output, JSON.stringify(createImageManifest(fixture)));
  fs.writeFileSync(collected, '<div data-product-images-id="2085000"><img src="<!--/list_photo_gallery/-->"></div>');
  const before = fs.readFileSync(output, 'utf8');
  const result = spawnSync(process.execPath, [generator, 'merge', '--catalog', catalogPath, '--manifest', output, '--input', collected, '--output', output, '--source', 'copied-preview'], {encoding: 'utf8'});
  assert.notEqual(result.status, 0);assert.match(result.stderr, /해석되지 않은 메이크샵/);
  assert.equal(fs.readFileSync(output, 'utf8'), before);assert.equal(fs.readdirSync(directory).some(name => name.includes('.tmp-')), false);
});

test('CLI merges a real-shaped local capture and reports partial coverage without altering its inputs', t => {
  const directory = temporaryDirectory(t), catalogPath = path.join(directory, 'catalog.json'), output = path.join(directory, 'images.json'), collected = path.join(directory, 'collected.json');
  fs.writeFileSync(catalogPath, JSON.stringify(fixture));
  const text = JSON.stringify([{id: '2085000', images: ['/shopimages/curiouswiz/a.jpg', '/shopimages/curiouswiz/b.jpg']}, {id: '9999999', images: [image('unknown')]}]);
  fs.writeFileSync(collected, text);
  const result = spawnSync(process.execPath, [generator, 'merge', '--catalog', catalogPath, '--input', collected, '--output', output, '--source', 'copied-main-preview', '--base-url', 'https://www.pink-rocket.com/'], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout), data = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(report.importedProducts, 1);assert.deepEqual(report.ignoredUnknownIds, ['9999999']);
  assert.equal(report.coverage.catalogProducts, 3);assert.equal(report.coverage.additionalImagesComplete, false);
  assert.deepEqual(data.products['2085000'].images, [image('a'), image('b')]);assert.deepEqual(data.products['2085891'].images, fixture[0].images);
  assert.equal(fs.readFileSync(collected, 'utf8'), text);assert.deepEqual(JSON.parse(fs.readFileSync(catalogPath, 'utf8')), fixture);
});
