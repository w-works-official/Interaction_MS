/* Native responsive adapter. Account forms and product loops remain Makeshop. */
(() => {
  'use strict';
  const platform = NATIVE_PLATFORM_PLACEHOLDER;
  const categories = storefrontCategories(undefined, STOREFRONT_CONFIG);
  function nativeSideMenu() {
    const base = storefrontCategories(categories, STOREFRONT_CONFIG), settings = STOREFRONT_CONFIG.nativeSupplementalMenu || {};
    const after = settings.after || [], leading = [], following = new Map();
    let anchorId = null;
    for (const record of settings.before || []) {
      if (record.categoryId) { anchorId = base.some(item => item.id === record.categoryId) ? record.categoryId : null; continue; }
      if (!anchorId) leading.push(record);
      else { if (!following.has(anchorId)) following.set(anchorId, []); following.get(anchorId).push(record); }
    }
    const resolve = record => {
      const original = base.find(item => item.id === record.categoryId);
      if (record.categoryId && !original) return null;
      return {id:record.id || record.categoryId, label:record.label || original?.label || record.id,
        href:record.href || original?.href};
    };
    const anchor = record => { const item = resolve(record); return item ? renderStorefrontMenu([item], {config:STOREFRONT_CONFIG,native:true}) : ''; };
    const row = record => { const link = anchor(record); return link ? '<li>' + link + '</li>' : ''; };
    const middle = base.map(item => {
      const children = settings.children?.[item.id] || [];
      const extras = (following.get(item.id) || []).map(row).join('');
      if (!children.length) return row(item) + extras;
      const parent = anchor(item).replace('class=""', 'class="shop"').replace('</a>', '<span class="toggle_state"><span></span><span></span></span></a>');
      return '<li>' + parent + '<ul>' + children.map(row).join('') + '</ul></li>' + extras;
    }).join('');
    return '<nav><ul>' + leading.map(row).join('') + middle + after.map(row).join('') + '</ul></nav>';
  }
  function fill(selector, render) {
    document.querySelectorAll(selector).forEach(node => {
      if (node.dataset.storefrontReady) return;
      node.innerHTML = render(node);
      node.dataset.storefrontReady = '1';
    });
  }
  function apply() {
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) { viewport = document.createElement('meta'); viewport.name = 'viewport'; document.head.appendChild(viewport); }
    viewport.content = 'width=device-width,initial-scale=1';
    fill('[data-storefront-brand]', node => renderStorefrontBrand(STOREFRONT_CONFIG, {native:true,homeHref:node.dataset.homeHref || '/'}));
    fill('[data-storefront-menu]', node => {
      return node.dataset.storefrontMenu === 'side' ? nativeSideMenu() : renderStorefrontMenu(categories, {config:STOREFRONT_CONFIG,native:true});
    });
    fill('[data-native-storefront-hero]', () => renderStorefrontHero(STOREFRONT_CONFIG, {mainAnchor:'#contentWrapper'}));
    fill('[data-native-storefront-category-tiles]', () => renderStorefrontCategoryTiles(categories, {config:STOREFRONT_CONFIG,native:true}));
    fill('[data-storefront-footer]', () => renderStorefrontFooter(STOREFRONT_CONFIG));
    document.querySelectorAll('[data-native-basket]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || /<!--\//.test(href)) link.setAttribute('href', platform === 'mobile' ? '/m/basket.html' : '/shop/basket.html');
    });
    document.documentElement.dataset.nativePlatform = platform;
  }
  window.PRStorefrontNative = Object.freeze({apply, platform});
  document.addEventListener('click', event => {
    const toggle = event.target.closest?.('.search-toggle, .search_close');
    if (!toggle) return;
    const expanded = document.querySelector('.searchArea')?.classList.contains('active') || false;
    // Existing native header handler changes the one form's visibility.
    document.querySelector('.search-toggle')?.setAttribute('aria-expanded', String(expanded));
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, {once:true});
  else apply();
})();
