(() => {
  'use strict';
  const root = document.getElementById('pr-preview-test-v1');
  if (!root || root.dataset.started) return;
  root.dataset.started = '1';
  const frame = root.querySelector('[data-test-frame]');
  const status = root.querySelector('[data-status]');
  const log = root.querySelector('[data-log]');
  const dialog = root.querySelector('[data-options]');
  const detail = root.querySelector('[data-detail-frame]');
  const executeCart = root.querySelector('[data-execute-cart]');
  const nativeWishLink = root.querySelector('[data-native-wishlist]');
  const nativeCartLink = root.querySelector('[data-native-cart]');
  const channel = 'pinkrocket-preview-v1';
  if (!window.crypto || !crypto.getRandomValues || location.origin === 'null') {
    status.textContent = '메이크샵 HTTPS 메인 미리보기에서 실행하세요.'; return;
  }
  const token = Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
  const products = new Map();
  const observer = new MutationObserver(updateWishStates);
  let childReady = false;
  let activeProduct = null;
  let activeCart = null;
  let lastAction = 0;
  let lastRequest = 0;
  const mobile = /^\/m(?:\/|$)/.test(location.pathname) ||
    !!document.querySelector('a.cart_icon') || new URLSearchParams(location.search).get('dgnset_type') === 'MOBILE';
  nativeWishLink.href = mobile ? '/m/wishlist.html' : '/shop/mypage.html?mypage_type=mywishlist';
  function note(message) {
    status.textContent = message;
    const item = document.createElement('li');
    item.textContent = new Date().toLocaleTimeString()+' '+message;
    log.prepend(item); while (log.children.length > 15) log.lastElementChild.remove();
    send({action:'status',message});
  }
  function send(data) {
    // srcdoc is sandboxed without allow-same-origin, so its origin is opaque.
    // '*' is needed only for this isolated test child; receiver checks source + random token.
    if (childReady) frame.contentWindow.postMessage(Object.assign({channel, token},data),'*');
  }
  function safeSameOrigin(href) {
    try { const url = new URL(href, location.href);
      return /^https?:$/.test(url.protocol) && url.origin === location.origin ? url : null;
    } catch (_) { return null; }
  }
  function state(node) {
    const image = node.querySelector('img');
    const src = image ? image.getAttribute('src') || '' : '';
    if (/heart_(on|y)\./i.test(src)) return '켜짐';
    if (/heart_(off|n)\./i.test(src)) return '꺼짐';
    return '판별 불가';
  }
  function readProducts() {
    observer.disconnect(); products.clear();
    document.querySelectorAll('.my-wish-list[data-uid]').forEach(node => {
      if (root.contains(node) || products.size >= 3) return;
      const uid = node.getAttribute('data-uid');
      if (!/^\d+$/.test(uid || '') || products.has(uid)) return;
      const card = node.closest('.productWrap') || node.closest('li');
      const pic = node.closest('.listPic');
      if (!card || !pic) return;
      const anchor = Array.from(pic.querySelectorAll('a[href]')).find(a => {
        const url = safeSameOrigin(a.getAttribute('href'));
        return url && /\/(shopdetail|product)\.html$/.test(url.pathname);
      });
      if (!anchor) return;
      const url = safeSameOrigin(anchor.getAttribute('href'));
      if (url.searchParams.get('branduid') !== uid) return;
      const title = card.querySelector('.listName');
      const image = Array.from(pic.querySelectorAll('img')).find(img => !img.closest('.my-wish-list'));
      let imageUrl = null;
      try { const u = new URL(image && (image.currentSrc || image.src), location.href);
        if (/^https?:$/.test(u.protocol)) imageUrl = u.href;
      } catch (_) {}
      products.set(uid,{uid,node,url:url.href,image:imageUrl,
        name:title ? title.textContent.trim() : '상품 '+uid});
      observer.observe(node,{subtree:true,childList:true,attributes:true});
    });
    const cart = document.querySelector('.basket a[href], a.cart_icon[href], .basketCount');
    const link = cart && (cart.tagName === 'A' ? cart : cart.closest('a'));
    const cartUrl = link && safeSameOrigin(link.getAttribute('href'));
    nativeCartLink.hidden = !cartUrl;
    if (cartUrl) nativeCartLink.href = cartUrl.href;
    sendCatalog();
    note('원래 메인에서 상품 '+products.size+'개를 읽었습니다. 담기·찜은 버튼을 눌러야 실행됩니다.');
  }
  function sendCatalog() {
    send({action:'catalog',products:Array.from(products.values(),p =>
      ({uid:p.uid,name:p.name,image:p.image,wish:state(p.node)}))});
  }
  function updateWishStates() {
    products.forEach(p => send({action:'wish-state',uid:p.uid,wish:state(p.node)}));
  }
  function closeOptions() {
    dialog.hidden = true; executeCart.disabled = true;
    activeProduct = null; activeCart = null; detail.src = 'about:blank';
  }
  function openOptions(product) {
    activeProduct = product; activeCart = null; executeCart.disabled = true;
    dialog.hidden = false; detail.src = product.url;
    root.querySelector('[data-close-options]').focus();
    note('기존 상세를 열었습니다. 상세 안에서 옵션·수량을 선택한 뒤 담기 요청 버튼을 누르세요.');
  }
  detail.addEventListener('load', () => {
    if (!activeProduct) return;
    activeCart = null; executeCart.disabled = true;
    try {
      const url = safeSameOrigin(detail.contentWindow.location.href);
      if (!url || url.searchParams.get('branduid') !== activeProduct.uid ||
          !/\/(shopdetail|product)\.html$/.test(url.pathname)) {
        note('상세가 다른 페이지로 이동했습니다. 장바구니 목록에서 결과를 확인하세요.'); return;
      }
      const doc = detail.contentDocument;
      const button = doc.querySelector('a#cartBtn, .shopdetailButtonTop a.cart');
      if (!button || !button.closest('form')) {
        note('기존 상세의 장바구니 버튼·상품 폼을 찾지 못했습니다. 품절 또는 스킨 구조를 확인하세요.'); return;
      }
      activeCart = button; executeCart.disabled = false;
      note('기존 상세의 상품 폼과 장바구니 버튼을 찾았습니다. 옵션 선택 후 직접 담기를 요청하세요.');
    } catch (_) {
      note('상세 iframe 접근이 제한됐습니다. 원본 상세에서 확인을 이용하세요.');
    }
  });
  executeCart.addEventListener('click', () => {
    if (!activeProduct || !activeCart || !activeCart.isConnected) return;
    if (Date.now()-lastAction < 1200) return;
    lastAction = Date.now();
    try {
      activeCart.click();
      note('기존 장바구니 버튼에 클릭을 전달했습니다. 옵션 검증 안내와 장바구니 목록에서 실제 결과를 확인하세요.');
    } catch (_) { note('기존 장바구니 버튼 호출이 실패했습니다. 원본 상세에서 확인하세요.'); }
  });
  root.querySelector('[data-open-detail]').addEventListener('click', () => {
    if (activeProduct) window.open(activeProduct.url,'_blank','noopener');
  });
  root.querySelector('[data-close-options]').addEventListener('click',closeOptions);
  root.querySelector('[data-refresh]').addEventListener('click',readProducts);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dialog.hidden) closeOptions();
  });
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== frame.contentWindow || event.origin !== 'null' || !data ||
        data.channel !== channel || data.token !== token || !Number.isSafeInteger(data.requestId) ||
        data.requestId <= lastRequest || !['ready','wish','options'].includes(data.action)) return;
    if (data.action === 'ready') { lastRequest = data.requestId; childReady = true; readProducts(); return; }
    const product = products.get(data.uid);
    if (!product || !product.node.isConnected) return;
    lastRequest = data.requestId;
    if (data.action === 'options') { openOptions(product); return; }
    if (Date.now()-lastAction < 1200) { note('연속 클릭을 피하도록 잠시 기다린 뒤 다시 눌러주세요.'); return; }
    lastAction = Date.now();
    try { product.node.click(); updateWishStates();
      note('기존 찜 버튼에 클릭을 전달했습니다. 실제 반영은 찜 목록에서 확인하세요.');
    } catch (_) { note('기존 찜 버튼 호출이 실패했습니다.'); }
  });
  const config = {token,parentOrigin:location.origin};
  const childJs = CHILD_SOURCE_PLACEHOLDER.replace('CONFIG_PLACEHOLDER',JSON.stringify(config).replace(/</g,'\\u003c'));
  frame.srcdoc = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<style>body{font:14px/1.5 sans-serif;margin:16px;color:#25212a}#products{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}article{border:1px solid #ddd;border-radius:12px;padding:12px}img{width:100%;height:140px;object-fit:contain}h3{font-size:14px}button{display:block;width:100%;margin-top:8px;padding:10px;background:#fff;border:1px solid #aaa;border-radius:6px;cursor:pointer}button:focus{outline:3px solid #bc4c82}p{overflow-wrap:anywhere}</style></head><body><h2>iframe 연동 시험</h2><p id="status">연결 중…</p><div id="products"></div><script>'+childJs+'</scr'+'ipt></body></html>';
  note('테스트 iframe을 준비했습니다. 자동 찜·장바구니 요청은 없습니다.');
})();
