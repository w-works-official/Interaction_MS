(() => {
  'use strict';
  const config = CONFIG_PLACEHOLDER;
  let nextId = 0;
  function send(action, uid) {
    parent.postMessage({channel:'pinkrocket-preview-v1', token:config.token,
      action, uid, requestId:++nextId}, config.parentOrigin);
  }
  function el(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  }
  const status = document.getElementById('status');
  const list = document.getElementById('products');
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== parent || event.origin !== config.parentOrigin ||
        !data || data.channel !== 'pinkrocket-preview-v1' || data.token !== config.token) return;
    if (data.action === 'catalog') {
      list.replaceChildren();
      data.products.forEach(product => {
        const card = el('article');
        if (product.image) {
          const img = el('img'); img.src = product.image; img.alt = ''; card.append(img);
        }
        card.append(el('h3', product.name), el('p', '상품 ID: '+product.uid));
        const state = el('p', '찜 표시: '+product.wish); state.dataset.uid = product.uid;
        card.append(state);
        const wish = el('button', '찜 추가·취소 요청');
        wish.onclick = () => send('wish', product.uid);
        const cart = el('button', '옵션 선택·장바구니 테스트');
        cart.onclick = () => send('options', product.uid);
        card.append(wish, cart); list.append(card);
      });
      status.textContent = data.products.length ? '통신 연결됨 · 아래 버튼을 직접 눌러 시험하세요.' :
        '상품을 찾지 못했습니다. 원래 상품 목록이 있는 메인에서 실행한 후 상품 다시 읽기를 누르세요.';
    }
    if (data.action === 'status') status.textContent = data.message;
    if (data.action === 'wish-state') {
      list.querySelectorAll('[data-uid]').forEach(node => {
        if (node.dataset.uid === data.uid) node.textContent = '찜 표시: '+data.wish+' · 실제 반영은 찜 목록에서 확인';
      });
    }
  });
  send('ready');
})();
