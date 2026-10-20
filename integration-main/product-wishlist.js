/**
 * Product-level bridge to the shop's own wishlist engine.
 * Do not call init(): it attaches UI observers and click handlers to the page.
 */
export function createProductWishlistAdapter({ window: win, timeoutMs = 10000 } = {}) {
  const waitMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 60000) : 10000;
  const schedule = win && typeof win.setTimeout === 'function' ? win.setTimeout.bind(win) : setTimeout;
  const unschedule = win && typeof win.clearTimeout === 'function' ? win.clearTimeout.bind(win) : clearTimeout;
  const uncertainIds = new Set();
  let active = false;
  let instance = null;
  let requestGeneration = 0;

  // Share one classic-script load across adapter instances in the same window.
  // A failed load is retained: a user action must never silently start retries.
  if (!createProductWishlistAdapter.scriptLoads) {
    Object.defineProperty(createProductWishlistAdapter, 'scriptLoads', { value: new WeakMap() });
  }
  const scriptLoads = createProductWishlistAdapter.scriptLoads;
  const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const validId = (value) => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) && !/\D/.test(value);
  const nativeSuccess = (response) => response && typeof response === 'object' && !Array.isArray(response)
    && (response.result === true || response.result === 1);
  const busyResult = () => ({ state: 'busy', message: '다른 찜 작업이 진행 중입니다. 잠시 기다려 주세요.' });
  const unknownResult = (id) => ({
    state: 'unknown', id,
    message: '찜 처리 결과를 확인할 수 없습니다. 같은 상품을 다시 요청하지 말고 원본 찜 목록에서 확인해 주세요.',
  });
  const problem = (message) => new Error(message);
  const errorResult = (error, id) => ({
    state: 'error', ...(id === undefined ? {} : { id }),
    message: error && typeof error.message === 'string' ? error.message : '찜 정보를 확인하지 못했습니다.',
  });
  const serverMessage = (response, fallback) => {
    if (!response || typeof response !== 'object') return fallback;
    for (const key of ['message', 'msg', 'error']) {
      if (!hasOwn(response, key) || typeof response[key] !== 'string') continue;
      const value = response[key].replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/\s+/g, ' ').trim().slice(0, 200);
      if (value) return value;
    }
    return fallback;
  };

  function bounded(promise, message) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = schedule(() => {
        if (settled) return;
        settled = true;
        reject(problem(message));
      }, waitMs);
      Promise.resolve(promise).then((value) => {
        if (settled) return;
        settled = true;
        unschedule(timer);
        resolve(value);
      }, () => {
        if (settled) return;
        settled = true;
        unschedule(timer);
        reject(problem('원본 찜 기능을 불러오지 못했습니다. 새로고침 후 확인해 주세요.'));
      });
    });
  }

  function loadNativeScript() {
    if (!win || !win.document || !win.location) {
      return Promise.reject(problem('메이크샵 원본 화면에서 찜 기능을 사용해 주세요.'));
    }
    let record = scriptLoads.get(win);
    if (!record) {
      record = {};
      scriptLoads.set(win, record);
      record.promise = new Promise((resolve, reject) => {
        const doc = win.document;
        let script;
        let settled = false;
        let timer;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) unschedule(timer);
          if (script) {
            script.removeEventListener('load', loaded);
            script.removeEventListener('error', failed);
          }
          if (error) reject(error);
          else resolve();
        };
        const loaded = () => finish(typeof win.makeshopWishlist === 'function'
          ? null : problem('원본 찜 기능을 확인하지 못했습니다.'));
        const failed = () => finish(problem('원본 찜 기능을 불러오지 못했습니다.'));
        try {
          const url = new URL('/js/wishlist.js', win.location.href);
          if (!/^https?:$/.test(url.protocol) || url.origin !== win.location.origin) {
            finish(problem('메이크샵과 같은 출처에서 찜 기능을 사용해 주세요.'));
            return;
          }
          script = Array.from(doc.scripts || []).find((candidate) => {
            try {
              const source = new URL(candidate.src, win.location.href);
              return source.origin === url.origin && source.pathname === url.pathname;
            } catch {
              return false;
            }
          });
          const existing = Boolean(script);
          if (!script) {
            script = doc.createElement('script');
            script.type = 'text/javascript';
            script.async = true;
            script.src = url.href;
          }
          script.addEventListener('load', loaded);
          script.addEventListener('error', failed);
          timer = schedule(() => finish(problem('원본 찜 기능을 불러오는 시간이 초과됐습니다.')), waitMs);
          // Defer append until record.promise has been assigned for reentrant callers.
          record.start = () => {
            if (existing || settled) return;
            const parent = doc.head || doc.body || doc.documentElement;
            if (!parent) {
              finish(problem('원본 찜 기능을 불러올 위치가 없습니다.'));
              return;
            }
            try { parent.appendChild(script); } catch { failed(); }
          };
        } catch {
          finish(problem('원본 찜 기능을 불러오지 못했습니다.'));
        }
      });
      if (record.start) record.start();
    }
    return bounded(record.promise, '원본 찜 기능을 불러오는 시간이 초과됐습니다.');
  }

  async function nativeEngine() {
    if (instance) return instance;
    if (!win || typeof win.makeshopWishlist !== 'function') await loadNativeScript();
    if (!win || typeof win.makeshopWishlist !== 'function') {
      throw problem('원본 찜 기능을 확인하지 못했습니다.');
    }
    let candidate;
    try { candidate = new win.makeshopWishlist(); } catch {
      throw problem('원본 찜 기능을 준비하지 못했습니다.');
    }
    if (!candidate || typeof candidate.send !== 'function' || typeof candidate.isLogin !== 'function') {
      throw problem('원본 찜 기능의 형식을 확인하지 못했습니다.');
    }
    instance = candidate;
    return instance;
  }

  function loggedIn(engine) {
    let value;
    try { value = engine.isLogin(); } catch {
      throw problem('로그인 상태를 확인하지 못했습니다.');
    }
    if (value !== true && value !== false) throw problem('로그인 상태를 확인하지 못했습니다.');
    return value;
  }

  function send(engine, data) {
    return new Promise((resolve, reject) => {
      const generation = ++requestGeneration;
      let settled = false;
      const finish = (error, response) => {
        if (settled || generation !== requestGeneration) return;
        settled = true;
        unschedule(timer);
        if (error) reject(error);
        else resolve(response);
      };
      const timer = schedule(() => finish(problem('원본 찜 응답 대기 시간이 초과됐습니다.')), waitMs);
      try {
        engine.send((response) => finish(null, response), data);
      } catch {
        finish(problem('원본 찜 요청을 완료하지 못했습니다.'));
      }
    });
  }

  async function readIds(engine) {
    const response = await send(engine, 'mode=wishlist');
    if (!nativeSuccess(response)) {
      throw problem(serverMessage(response, '원본 찜 목록을 확인하지 못했습니다.'));
    }
    if (!Array.isArray(response.data) || response.data.length > 10000) {
      throw problem('원본 찜 목록의 형식을 확인하지 못했습니다.');
    }
    const ids = new Set();
    for (const row of response.data) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || !hasOwn(row, 'uid')) {
        throw problem('원본 찜 목록에 올바르지 않은 상품 번호가 있습니다.');
      }
      const rawId = row.uid;
      const id = typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId > 0 ? String(rawId) : rawId;
      if (!validId(id)) throw problem('원본 찜 목록에 올바르지 않은 상품 번호가 있습니다.');
      ids.add(id);
    }
    return [...ids];
  }

  async function refresh() {
    if (active) return busyResult();
    active = true;
    try {
      const engine = await nativeEngine();
      if (!loggedIn(engine)) return { state: 'login', ids: [] };
      const ids = await readIds(engine);
      return { state: 'ready', ids };
    } catch (error) {
      return errorResult(error);
    } finally {
      active = false;
    }
  }

  async function toggle(id) {
    if (active) return busyResult();
    if (!validId(id)) return errorResult(problem('올바른 상품 번호를 확인해 주세요.'));
    if (uncertainIds.has(id)) return unknownResult(id);
    active = true;
    let sent = false;
    try {
      const engine = await nativeEngine();
      if (!loggedIn(engine)) return { state: 'login', ids: [] };
      const beforeIds = await readIds(engine);
      const beforeSelected = beforeIds.includes(id);
      if (!loggedIn(engine)) return { state: 'login', ids: [] };
      // Native XHR cannot be aborted. From this point all failures lock this ID.
      sent = true;
      const response = await send(engine, `mode=wish&uid=${id}`);
      if (!nativeSuccess(response)) {
        uncertainIds.add(id);
        return errorResult(problem(serverMessage(response, '원본 찜 요청이 처리되지 않았습니다. 결과를 원본 목록에서 확인해 주세요.')), id);
      }
      if (!loggedIn(engine)) {
        uncertainIds.add(id);
        return unknownResult(id);
      }
      const ids = await readIds(engine);
      const selected = ids.includes(id);
      const actionSelected = response.action !== 'remove';
      if (selected === beforeSelected || selected !== actionSelected) {
        uncertainIds.add(id);
        return unknownResult(id);
      }
      return { state: 'ready', ids, id, selected, changed: true };
    } catch (error) {
      if (sent) {
        uncertainIds.add(id);
        return unknownResult(id);
      }
      return errorResult(error, id);
    } finally {
      active = false;
    }
  }

  return { refresh, toggle, get busy() { return active; } };
}
