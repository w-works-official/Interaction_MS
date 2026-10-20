(() => {
  'use strict';
  const root = document.getElementById('pr-makeshop-main');
  if (!root || root.dataset.started) return;
  const frame = root.querySelector('[data-shop-frame]');
  const dialog = root.querySelector('[data-native-dialog]');
  let nativeFrame = root.querySelector('[data-native-frame]');
  const status = root.querySelector('[data-native-status]');
  const mainStatus = root.querySelector('[data-main-status]');
  const close = root.querySelector('[data-native-close]');
  const open = root.querySelector('[data-native-open]');
  const wishlist = root.querySelector('[data-native-wishlist]');
  const cart = root.querySelector('[data-native-cart]');
  const auth = root.querySelector('[data-native-auth]');
  const login = root.querySelector('[data-native-login]');
  const retry = root.querySelector('[data-native-retry]');
  if (![frame, dialog, nativeFrame, status, mainStatus, close, open, wishlist, cart, auth, login, retry].every(Boolean)) return;
  const nativeTemplate = nativeFrame.cloneNode(false);
  nativeTemplate.removeAttribute('src');
  root.dataset.started = '1';
  frame.inert = true;

  const channel = 'pinkrocket-makeshop-v1';
  const frontend = new URL('https://w-works-official.github.io/Interaction_MS/');
  const parentOrigins = ['https://www.pink-rocket.com', 'https://pink-rocket.com'];
  const makeshopDetailUrl = DETAIL_URL_HELPER_PLACEHOLDER;
  const detailViewCss = DETAIL_VIEW_CSS_PLACEHOLDER;
  const createProductWishlistAdapter = PRODUCT_WISHLIST_ADAPTER_PLACEHOLDER;
  if (!parentOrigins.includes(location.origin) || !window.crypto?.getRandomValues ||
      !['pc', 'mobile'].includes(root.dataset.platform)) {
    root.dataset.bridgeState = 'blocked';
    mainStatus.hidden = false;
    mainStatus.textContent = '메이크샵 HTTPS 미리보기와 PC·모바일용 연결 코드 설정을 확인하세요.';
    return;
  }
  const platform = root.dataset.platform;
  const mobile = platform === 'mobile';
  const wishUrl = new URL(mobile ? '/m/wishlist.html' : '/shop/mypage.html?mypage_type=mywishlist', location.origin);
  const loginUrl = new URL(mobile ? '/m/login.html' : '/shop/member.html', location.origin);
  // Verified in the original PC/mobile basket links and native basket_url selection.
  const canonicalCartUrl = new URL(mobile ? '/m/basket.html' : '/shop/basket.html', location.origin);
  const actions = ['hello', 'product', 'detail', 'wish', 'options', 'wishlist', 'cart'];
  const productActions = ['product', 'detail', 'wish', 'options'];
  let session = '', lastRequest = 0, ready = false, expectedLoad = false;
  let active = null, nativeTimer = null, handshakeTimer = null, noticeTimer = null;
  let wishRequest = null, initialWishlist = null;
  const productWishlist = createProductWishlistAdapter({window});
  wishlist.setAttribute('href', wishUrl.href);
  login.setAttribute('href', loginUrl.href);
  login.setAttribute('target', '_blank');
  login.setAttribute('rel', 'noopener');
  if ([null, '', '<!--/link_basket/-->'].includes(cart.getAttribute('href'))) cart.setAttribute('href', canonicalCartUrl.href);
  const authGuarded = new WeakSet();

  function sameOrigin(href) {
    try {
      const url = new URL(href, location.href);
      return url.protocol === 'https:' && url.origin === location.origin && !url.username && !url.password ? url : null;
    } catch (_) { return null; }
  }
  function detailUrl(id) {
    if (typeof id !== 'string' || !makeshopDetailUrl(id, platform)) return null;
    const canonical = new URL(makeshopDetailUrl(id, platform));
    return sameOrigin(canonical.pathname + canonical.search);
  }
  function cartUrl() {
    const href = cart.getAttribute('href');
    if ([null, '', '<!--/link_basket/-->'].includes(href)) return canonicalCartUrl;
    if (!href || href !== href.trim() || /[<>\\\u0000-\u0020]/.test(href) ||
        !/^(?:\/(?!\/)|https:\/\/)/.test(href)) return null;
    const url = sameOrigin(href);
    return url && url.pathname === canonicalCartUrl.pathname ? canonicalCartUrl : null;
  }
  function reply(action, request, message, extra = {}) {
    if (!request || request.session !== session) return;
    const data = {channel, session, requestId: request.requestId, action, platform, message, ...extra};
    if (request.id) data.id = request.id;
    frame.contentWindow.postMessage(data, frontend.origin);
  }
  function note(request, message) {
    status.textContent = message;
    status.hidden = false;
    reply('status', request, message);
  }
  function mainNotice(message) {
    if (noticeTimer !== null) window.clearTimeout(noticeTimer);
    mainStatus.hidden = false;
    mainStatus.textContent = message;
    noticeTimer = window.setTimeout(() => { if (ready && !wishRequest && !active) mainStatus.hidden = true; }, 6000);
  }
  function revealNative(request, message) {
    if (active !== request || request.session !== session) return;
    request.wishManual = true;
    if (nativeTimer !== null) window.clearTimeout(nativeTimer);
    nativeTimer = null;
    mainStatus.hidden = true;
    dialog.hidden = false;
    frame.inert = true;
    close.focus();
    note(request, message);
  }
  function isLoginPath(path) {
    return /^\/(?:shop\/member\.html|m\/(?:login|member)\.html|list\/API\/login_[a-z]+\.html)$/.test(path);
  }
  function authDestination(href, base) {
    try {
      const url = new URL(href, base);
      return url.protocol === 'https:' && !url.username && !url.password &&
        ((url.origin === location.origin && isLoginPath(url.pathname)) ||
          ['nid.naver.com', 'kauth.kakao.com', 'accounts.kakao.com'].includes(url.hostname));
    } catch (_) { return false; }
  }
  function handoffLogin(request) {
    if (active !== request || request.session !== session || request.authHandoff) return;
    request.authHandoff = true;
    request.wishManual = true;
    request.wishAttempted = true;
    request.cleanupWish?.();
    if (nativeTimer !== null) window.clearTimeout(nativeTimer);
    nativeTimer = null;
    // Remove the authentication browsing context instead of displaying a blocked provider page.
    const next = nativeTemplate.cloneNode(false);
    next.hidden = true;
    bindNativeFrame(next);
    const previous = nativeFrame;
    nativeFrame = next;
    previous.replaceWith(next);
    auth.hidden = false;
    mainStatus.hidden = true;
    dialog.hidden = false;
    frame.inert = true;
    note(request, '로그인은 새 창에서 진행해주세요. 로그인 후 돌아와 상품을 다시 열거나 하트를 다시 눌러주세요.');
    login.focus();
  }
  function guardAuthentication(doc, request) {
    if (authGuarded.has(doc)) return;
    authGuarded.add(doc);
    doc.addEventListener('click', event => {
      if (active !== request || request.session !== session) return;
      const anchor = event.target?.closest?.('a[href]');
      const href = anchor?.getAttribute('href') || '';
      if (!/^javascript:\s*login_chk_wish\s*\(\s*\)\s*;?\s*$/.test(href) && !authDestination(href, doc.URL)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      handoffLogin(request);
    }, true);
    doc.addEventListener('submit', event => {
      if (active !== request || !authDestination(event.target?.getAttribute?.('action') || '', doc.URL)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      handoffLogin(request);
    }, true);
  }
  function styleDetail(doc) {
    if (!doc.querySelector('#productDetail, .shopdetail')) return false;
    doc.documentElement.setAttribute('data-pr-detail-view', platform);
    let style = doc.querySelector('style[data-pr-detail-style]');
    if (!style) {
      style = doc.createElement('style');
      style.setAttribute('data-pr-detail-style', '');
      (doc.head || doc.documentElement).appendChild(style);
    }
    style.textContent = detailViewCss;
    try { doc.defaultView.dispatchEvent(new doc.defaultView.Event('resize')); } catch (_) {}
    return true;
  }
  function closeNative(message, notify = true) {
    const previous = active;
    active = null;
    previous?.cleanupWish?.();
    if (nativeTimer !== null) window.clearTimeout(nativeTimer);
    nativeTimer = null;
    dialog.hidden = true;
    auth.hidden = true;
    if (ready) mainStatus.hidden = true;
    open.removeAttribute('href');
    frame.inert = !ready;
    if (previous && ready) frame.focus();
    if (previous && notify) note(previous, message || '원본 상세 창을 닫았습니다. 실제 반영 여부는 메이크샵 목록에서 확인하세요.');
  }
  function verifiedDocument(request = active) {
    if (!request || request !== active || request.session !== session) return null;
    try {
      const expected = detailUrl(request.id);
      const current = sameOrigin(nativeFrame.contentWindow.location.href);
      if (!expected || !current || current.pathname !== expected.pathname ||
          current.searchParams.getAll('branduid').length !== 1 || current.searchParams.get('branduid') !== request.id) return null;
      const doc = nativeFrame.contentDocument;
      return doc && doc.defaultView === nativeFrame.contentWindow ? doc : null;
    } catch (_) { return null; }
  }
  function controlsFor(doc) {
    const cartButtons = Array.from(doc.querySelectorAll('a#cartBtn, .shopdetailButtonTop a.cart')).filter(node =>
      node.closest('form') && /^javascript:\s*send_multi\s*\(\s*(?:''|"")\s*,\s*(?:''|"")\s*\)\s*;?\s*$/.test(node.getAttribute('href') || ''));
    const wishButtons = Array.from(doc.querySelectorAll('a.btn_wish, p.d_wish a, a[href]')).filter(node =>
      /^javascript:\s*(?:login_chk_wish\s*\(\s*\)|send_wish\s*\(\s*(?:(?:''|"")\s*(?:,\s*(?:''|"")\s*(?:,\s*(?:'PS'|"PS")\s*)?)?)?\))\s*;?\s*$/.test(node.getAttribute('href') || ''));
    return {cartButtons, wishButtons};
  }
  function visibleControl(nodes) {
    return nodes.find(node => {
      try { return node.getClientRects().length && window.getComputedStyle(node).visibility !== 'hidden'; }
      catch (_) { return false; }
    }) || nodes[0];
  }
  function nativeControlValid(node, doc) {
    if (!node || !doc || !node.isConnected || node.ownerDocument !== doc) return false;
    const controls = controlsFor(doc);
    return controls.cartButtons.includes(node) ? !!node.closest('form') : controls.wishButtons.includes(node);
  }
  function wishlistSnapshot(request, result) {
    if (!ready || !root.isConnected || request.session !== session) return;
    const extra = {state: result.state};
    if (result.state === 'ready' || result.state === 'login') extra.ids = result.ids;
    if (result.id) extra.id = result.id;
    if (typeof result.selected === 'boolean') extra.selected = result.selected;
    reply('wishlist-state', request, '', extra);
  }
  function refreshWishlist(request) {
    if (initialWishlist === session) return;
    initialWishlist = session;
    productWishlist.refresh().then(result => wishlistSnapshot(request, result)).catch(() => {
      wishlistSnapshot(request, {state: 'error'});
    });
  }
  async function toggleProductWish(request) {
    if (wishRequest || productWishlist.busy) {
      wishlistSnapshot(request, {state: 'busy', id: request.id});
      note(request, '찜 정보를 처리하고 있습니다. 잠시 후 다시 눌러주세요.');
      return;
    }
    closeNative('상품 찜을 처리합니다.');
    wishRequest = request;
    frame.inert = true;
    mainNotice('메이크샵의 상품 찜을 처리하는 중입니다.');
    let result;
    try { result = await productWishlist.toggle(request.id); }
    catch (_) { result = {state: 'unknown', id: request.id}; }
    if (wishRequest !== request || request.session !== session || !ready || !root.isConnected) return;
    wishRequest = null;
    frame.inert = !!active;
    wishlistSnapshot(request, result);
    if (result.state === 'login') {
      active = request;
      open.setAttribute('href', detailUrl(request.id).href);
      handoffLogin(request);
      return;
    }
    const message = result.state === 'ready' && result.changed ?
      (result.selected ? '메이크샵 찜 목록에 등록된 것을 확인했습니다.' : '메이크샵 찜 목록에서 해제된 것을 확인했습니다.') :
      result.message || '찜 처리 결과를 확인하지 못했습니다. 자동으로 다시 요청하지 않습니다. 실제 찜 목록을 확인해주세요.';
    mainNotice(message);
    note(request, message);
  }
  function openNative(request) {
    closeNative('다른 상품 요청으로 원본 상세 창을 바꿨습니다.');
    active = request;
    auth.hidden = true;
    const url = detailUrl(request.id);
    open.setAttribute('href', url.href);
    dialog.hidden = false;
    frame.inert = true;
    const next = nativeTemplate.cloneNode(false);
    next.hidden = false;
    bindNativeFrame(next);
    next.src = url.href;
    const previous = nativeFrame;
    nativeFrame = next;
    previous.replaceWith(next);
    close.focus();
    note(request, '메이크샵 상품 상세를 불러오는 중입니다.');
    nativeTimer = window.setTimeout(() => {
      if (active === request) revealNative(request, '상세를 불러오지 못했습니다. 원본 상세 열기로 확인해주세요.');
    }, 12000);
  }
  function bindNativeFrame(target) {
  target.addEventListener('load', event => {
    if (event.currentTarget !== nativeFrame || !active || active.session !== session) return;
    const request = active;
    if (!request || request.authHandoff) return;
    try {
      nativeFrame.contentDocument?.addEventListener('keydown', event => {
        if (event.key === 'Escape' && active === request) closeNative();
      });
    } catch (_) {}
    let currentUrl = null, currentDoc = null;
    try {
      currentUrl = new URL(nativeFrame.contentWindow.location.href);
      currentDoc = nativeFrame.contentDocument;
    } catch (_) {}
    // A fresh browsing context can emit a transient blank load before its detail response.
    if (currentUrl?.href === 'about:blank') return;
    if (nativeTimer !== null) window.clearTimeout(nativeTimer);
    nativeTimer = null;
    if ((currentUrl?.origin === location.origin && isLoginPath(currentUrl.pathname)) ||
        currentDoc?.querySelector('form[name="form1"] input[name="passwd"], form[name="login_form"] input[name="passwd"]')) {
      handoffLogin(request);
      return;
    }
    const doc = verifiedDocument(request);
    if (!doc) {
      if (!currentUrl || currentUrl.origin !== location.origin) handoffLogin(request);
      else revealNative(request, '요청한 상품 상세를 확인하지 못했습니다. 원본 상세 열기로 확인해주세요.');
      return;
    }
    guardAuthentication(doc, request);
    styleDetail(doc);
    if (request.action === 'product') {
      try { nativeFrame.contentWindow.scrollTo(0, 0); } catch (_) {}
      note(request, '상품 ID ' + request.id + '의 메이크샵 원본 상품 상세입니다. 실제 옵션·현재 가격·품절 여부를 이 화면에서 확인하세요.');
      status.hidden = true;
      return;
    }
    const controls = controlsFor(doc);
    const button = visibleControl(controls.cartButtons);
    if (!nativeControlValid(button, doc)) {
      revealNative(request, '원본 장바구니 버튼과 상품 폼을 찾지 못했습니다. 품절 또는 스킨 구조를 원본 상세에서 확인하세요.');
      return;
    }
    // The customer uses the original control. Observing that click never means server success.
    doc.addEventListener('click', event => {
      const clicked = [...controls.wishButtons, ...controls.cartButtons].find(node => node.contains(event.target));
      if (!clicked) return;
      const current = verifiedDocument(request);
      const fresh = current && controlsFor(current);
      if (current !== doc || !nativeControlValid(clicked, current) ||
          ![...(fresh?.wishButtons || []), ...(fresh?.cartButtons || [])].includes(clicked)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (active === request) note(request, '원본 상세 또는 상품 폼이 바뀌었습니다. 상세를 다시 열어 확인하세요.');
        return;
      }
      note(request, '메이크샵 원본 버튼을 직접 눌렀습니다. 로그인·옵션 안내와 찜/장바구니 목록에서 실제 반영을 확인하세요.');
    }, true);
    try { button.scrollIntoView?.({block: 'center'}); button.focus({preventScroll: true}); } catch (_) {}
    note(request, '원본 상세에서 옵션·수량을 선택한 뒤 원본 장바구니 버튼을 직접 눌러주세요. 실제 상품·옵션·수량은 장바구니 목록에서 확인하세요.');
  });
  target.addEventListener('error', event => {
    if (event.currentTarget !== nativeFrame || !active || active.session !== session) return;
    if (nativeTimer !== null) window.clearTimeout(nativeTimer);
    nativeTimer = null;
    if (active) revealNative(active, '상세 iframe을 불러오지 못했습니다. 원본 상세 열기로 확인하세요.');
  });
  }
  bindNativeFrame(nativeFrame);
  close.addEventListener('click', () => closeNative());
  retry.addEventListener('click', () => {
    if (!active?.authHandoff || active.session !== session) return;
    const request = {session: active.session, requestId: active.requestId, id: active.id, action: 'product'};
    openNative(request);
  });
  open.addEventListener('click', event => {
    event.preventDefault();
    const url = active && detailUrl(active.id);
    if (url) location.assign(url.href);
  });
  wishlist.addEventListener('click', event => { event.preventDefault(); location.assign(wishUrl.href); });
  cart.addEventListener('click', event => {
    event.preventDefault();
    const url = cartUrl();
    if (url) location.assign(url.href);
    else status.textContent = '메이크샵의 원본 장바구니 링크를 확인하지 못했습니다.';
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dialog.hidden) closeNative();
  });

  function startSession() {
    ready = false;
    closeNative('메인 화면을 다시 연결하며 이전 상품 요청을 닫았습니다.');
    wishRequest = null;
    initialWishlist = null;
    session = Array.from(window.crypto.getRandomValues(new Uint32Array(4))).join('-');
    lastRequest = 0; ready = false; expectedLoad = true;
    root.dataset.bridgeState = 'loading';
    mainStatus.hidden = false;
    mainStatus.textContent = '메이크샵 원본 기능과 연결하는 중입니다.';
    frame.inert = true;
    if (handshakeTimer !== null) window.clearTimeout(handshakeTimer);
    const pendingSession = session;
    handshakeTimer = window.setTimeout(() => {
      if (session !== pendingSession || ready) return;
      root.dataset.bridgeState = 'blocked';
      mainStatus.hidden = false;
      mainStatus.textContent = '메인 화면의 연결 응답이 없습니다. 연결용 프론트 배포와 네트워크를 확인한 뒤 새로고침하세요.';
      frame.inert = true;
    }, 9000);
    const url = new URL(frontend.href);
    url.searchParams.set('frame', '1');
    url.searchParams.set('bridge', 'makeshop');
    url.searchParams.set('parentOrigin', location.origin);
    url.searchParams.set('platform', platform);
    url.searchParams.set('session', session);
    frame.src = url.href;
  }
  frame.addEventListener('load', () => {
    // hello may arrive before the load event; keep an already established initial handshake.
    if (expectedLoad) { expectedLoad = false; return; }
    startSession();
  });
  frame.addEventListener('error', () => {
    ready = false; root.dataset.bridgeState = 'blocked';
    closeNative('메인 연결이 끊겨 이전 상품 요청을 닫았습니다.');
    mainStatus.hidden = false;
    mainStatus.textContent = '메인 화면을 불러오지 못했습니다. 네트워크와 외부 iframe 허용 여부를 확인하세요.';
  });
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== frame.contentWindow || event.origin !== frontend.origin || !data ||
        data.channel !== channel || data.session !== session || !Number.isSafeInteger(data.requestId) ||
        data.requestId < 1 || !actions.includes(data.action)) return;
    const request = {session, requestId: data.requestId, action: data.action, id: data.id};
    if (data.action === 'hello') {
      if (data.requestId !== 1 || lastRequest > 1) return;
      lastRequest = 1; ready = true; root.dataset.bridgeState = 'ready';
      if (handshakeTimer !== null) window.clearTimeout(handshakeTimer);
      handshakeTimer = null; mainStatus.hidden = true; frame.inert = !!active;
      reply('init', request, '메이크샵 원본 기능과 연결됐습니다. 실제 반영은 원본 목록에서 확인하세요.');
      refreshWishlist(request);
      return;
    }
    if (!ready || data.requestId <= lastRequest) return;
    lastRequest = data.requestId;
    if (productActions.includes(data.action) && !detailUrl(data.id)) {
      note(request, '상품 ID가 올바르지 않아 요청하지 않았습니다.'); return;
    }
    if (data.action === 'wish') {
      reply('accepted', request, '상품 찜 요청을 받았습니다.');
      toggleProductWish(request); return;
    }
    if (data.action === 'product' || data.action === 'options') {
      reply('accepted', request, '상품 ID ' + data.id + '의 요청을 받았습니다. 실제 계정 반영을 뜻하지 않습니다.');
      openNative(request); return;
    }
    const url = data.action === 'detail' ? detailUrl(data.id) : data.action === 'wishlist' ? wishUrl : cartUrl();
    if (!url) { note(request, '메이크샵의 원본 장바구니 링크를 확인하지 못해 이동하지 않았습니다.'); return; }
    reply('accepted', request, '메이크샵 원본 페이지로 이동합니다. 실제 계정 반영을 뜻하지 않습니다.');
    closeNative('메이크샵 원본 페이지로 이동합니다.'); location.assign(url.href);
  });
  startSession();
})();
