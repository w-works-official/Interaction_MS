// Static image metadata only. These helpers never fetch images or product details.
const IMAGE_HOSTS = ['pink-rocket.com', 'www.pink-rocket.com'];
const MAX_IMAGES = 40;
const MAX_PRODUCTS = 10000;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function isProductImageRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (prototype === Object.prototype || prototype === null) &&
    Object.values(Object.getOwnPropertyDescriptors(value)).every(item => own(item, 'value'));
}

export function productImageId(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) return null;
    value = String(value);
  }
  return typeof value === 'string' && /^[1-9][0-9]{0,31}$/.test(value) ? value : null;
}

export function normalizeProductImages(images, options = {}) {
  const {allowedHosts = [], baseUrl, allowRelative = false, allowLocal = true} = options;
  if (!Array.isArray(images) || !images.length || images.length > MAX_IMAGES) {
    throw Error('사진 목록은 1~40개의 URL 배열이어야 합니다.');
  }
  const hosts = new Set([...IMAGE_HOSTS, ...allowedHosts].map(host => {
    if (typeof host !== 'string' || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) || host.includes('..')) {
      throw Error('허용 이미지 호스트가 올바르지 않습니다.');
    }
    return host.toLowerCase();
  }));
  const normalized = [];
  for (const image of Array.from(images)) {
    if (typeof image !== 'string' || !image || image.length > 2048 || image.trim() !== image || /[\s<>\\\u0000-\u001f\u007f]/u.test(image)) {
      throw Error('빈 값·공백·마크업·제어 문자를 포함한 이미지 URL은 사용할 수 없습니다.');
    }
    let url = image;
    if (image.startsWith('assets/')) {
      if (!allowLocal || !/^assets\/(?:[a-z0-9_-]+\/)*[a-z0-9][a-z0-9._-]*\.(?:jpe?g|png|webp|gif|avif)$/i.test(image)) {
        throw Error('로컬 이미지 경로가 올바르지 않습니다.');
      }
    } else {
      if (!image.startsWith('https://')) {
        if (!allowRelative || !baseUrl || /^[a-z][a-z0-9+.-]*:/i.test(image)) {
          throw Error('원격 이미지는 HTTPS URL이어야 합니다.');
        }
        try { url = new URL(image, baseUrl).href; } catch { throw Error('상대 이미지 URL을 해석하지 못했습니다.'); }
      }
      let parsed;
      try { parsed = new URL(url); } catch { throw Error('이미지 URL이 올바르지 않습니다.'); }
      if (parsed.protocol !== 'https:' || !hosts.has(parsed.hostname) || parsed.username || parsed.password ||
          (parsed.port && parsed.port !== '443') || parsed.hash || parsed.pathname === '/') {
        throw Error('허용된 HTTPS 이미지 호스트와 경로만 사용할 수 있습니다.');
      }
    }
    if (!normalized.includes(url)) normalized.push(url);
  }
  return normalized;
}

function imageEntry(value, options) {
  if (!isProductImageRecord(value) || Object.keys(value).some(key => !['images', 'source'].includes(key)) ||
      typeof value.source !== 'string' || !value.source.trim() || value.source !== value.source.trim() ||
      value.source.length > 200 || /[\u0000-\u001f\u007f]/u.test(value.source)) {
    throw Error('사진 항목에는 images 배열과 200자 이하의 출처 source가 필요합니다.');
  }
  return {images: normalizeProductImages(value.images, options), source: value.source};
}

function manifestProducts(value) {
  if (!isProductImageRecord(value) || value.schema !== 1 || !isProductImageRecord(value.products) ||
      Object.keys(value).some(key => !['schema', 'products', 'coverage'].includes(key)) ||
      Object.keys(value.products).length > MAX_PRODUCTS) {
    throw Error('schema 1의 상품 ID별 사진 목록이 필요합니다.');
  }
  return value.products;
}

// Strict validator for offline imports. One invalid entry rejects the whole import.
export function normalizeProductImageManifest(value, options = {}) {
  const products = {};
  for (const [id, entry] of Object.entries(manifestProducts(value))) {
    if (productImageId(id) !== id) throw Error('올바르지 않은 상품 ID: ' + id);
    products[id] = imageEntry(entry, options);
  }
  return {schema: 1, products};
}

// Build once after loading the JSON; every later lookup is synchronous and O(1).
export function createProductImageLookup(catalog, manifest, options = {}) {
  const imagesById = new Map();
  for (const product of Array.isArray(catalog) ? catalog : []) {
    if (!isProductImageRecord(product)) continue;
    const id = productImageId(product.id);
    if (!id || imagesById.has(id)) continue;
    try { imagesById.set(id, normalizeProductImages(product.images, options)); }
    catch { imagesById.set(id, []); }
  }
  const report = {
    state: 'fallback', catalogProducts: imagesById.size, appliedProducts: 0,
    preservedGalleries: 0, invalidIds: [], unknownIds: [], additionalImagesComplete: false
  };
  if (manifest !== undefined && manifest !== null) {
    try {
      const products = manifestProducts(manifest);
      report.state = 'ready';
      for (const [id, value] of Object.entries(products)) {
        if (productImageId(id) !== id) { report.invalidIds.push(id); continue; }
        let entry;
        try { entry = imageEntry(value, options); }
        catch { report.invalidIds.push(id); continue; }
        if (!imagesById.has(id)) { report.unknownIds.push(id); continue; }
        // A list page showing one representative image must not erase a reviewed gallery.
        if (imagesById.get(id).length > 1 && entry.images.length === 1) {
          report.preservedGalleries++;
          continue;
        }
        imagesById.set(id, entry.images);
        report.appliedProducts++;
      }
      if (report.invalidIds.length || report.unknownIds.length) report.state = 'partial';
    } catch { report.state = 'fallback'; }
  }
  const getProductImages = id => [...(imagesById.get(productImageId(id)) || [])];
  Object.freeze(report.invalidIds);
  Object.freeze(report.unknownIds);
  Object.defineProperty(getProductImages, 'report', {value: Object.freeze(report)});
  return getProductImages;
}
