import {TABS,SORTS,clone,normalizeCatalog,initialConfig,poolFor,resolveList,filterList,reorder,togglePin,autoArrange,composeFeed,blocksForZone,blockPosition,normalizeContentBlock,validateConfig,validDetail,removeStarterBanners,MATERIALS,migrateSavedConfig,swipeThresholds,swipeIntent,TAG_GROUPS,emptyDiscovery,hasDiscovery,discoverProducts,defaultRanking,normalizeRanking,effectiveCatalog,rankProducts,browseProducts,makeshopDetailUrl} from './model.js?v=12';

const app=document.getElementById('app'),overlay=document.getElementById('overlay-root');
const KEYS={published:'pr-studio-published-v1',draft:'pr-studio-draft-v1',history:'pr-studio-history-v1',favorites:'pr-studio-favorites-v1',cart:'pr-studio-cart-v1'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>Number(n).toLocaleString('ko-KR')+'원';
const icons={search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',bag:'<path d="M5 7h14l1 14H4L5 7Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',left:'<path d="m15 5-7 7 7 7"/>',right:'<path d="m9 5 7 7-7 7"/>',up:'<path d="m5 15 7-7 7 7"/>',down:'<path d="m5 9 7 7 7-7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',plus:'<path d="M12 4v16M4 12h16"/>',grid:'<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',banner:'<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="8" cy="9" r="1"/><path d="m3 17 5-5 4 4 4-5 5 5"/>',history:'<path d="M3 11a9 9 0 1 1 2 6M3 4v7h7M12 7v5l4 2"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',pin:'<path d="m8 3 8 0-1 6 4 4H5l4-4-1-6Zm4 10v8"/>',eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',save:'<path d="M4 3h13l3 3v15H4V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',home:'<path d="m3 10 9-8 9 8v11h-7v-7h-4v7H3V10Z"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.grid}</svg>`;
const button=(text,action,cls='',attrs='')=>`<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>`;
let catalog=[],published,draft,history=[],favorites=[],cart=[],dirty=false,view='shop',adminPage='overview',adminTab='추천',adminQuery='',adminFilter='all',adminLimit=60,selected=new Set(),tab='추천',previewMode=false,frameMode=false,observer,photoState=new Map(),lastFocus=null;
const curationPast=[],curationFuture=[];
let curationRevision=0,curationResult='상품 ID와 진열 상태를 확인한 뒤 초안을 편집하세요.';
const blockPast=[],blockFuture=[];
let blockSelection=null,blockEditing=null,blockPreviewLimit=24,blockPreviewDevice='pc',blockRevision=0,blockResult='블록을 추가하거나 선택한 뒤 위치와 모양을 편집하세요.';
const BLOCK_TYPES={editorial:'이미지와 문구',notice:'안내 카드',image:'이미지',text:'텍스트',spacer:'여백',divider:'구분선'};
const BLOCK_ZONES={top:'헤더 위','after-tabs':'카테고리 아래','before-feed':'상품 목록 위',feed:'상품 사이',bottom:'상품 목록 아래'};
const workspacePast=[],workspaceFuture=[],compareIds=new Set(),reviewEdits=new Map(),directionEdits=new Map(),rankingEdits=new Map();
const browseCache=new Map(),workspaceRankCache=new Map();
let workbenchView='photos',workbenchQuery='',photoReviewFilter='all',photoLimit=12,inspectedId=null,inspectedPhoto=0,workspaceRevision=0,workspaceResult='진열 방향과 사진 검토 결과를 같은 초안에서 관리합니다.',batchText='',validatedBatch=null,resultLimit=12,resultView='draft';
const REVIEW_LABELS={unreviewed:'미검토',reviewed:'검토 완료','needs-review':'확인 필요'};
const tabStates=Object.fromEntries(TABS.map(t=>[t,{query:'',material:'전체',sort:'curated',limit:8,scroll:0,favoritesOnly:false,discovery:emptyDiscovery()}]));
let toastTimer,nativeDetailTimer, feedRevision=0,photoReadToken=0,discoveryOpen=false;
const makeshopBridge=createMakeshopBridge();
// Account actions stay on Makeshop. A missing/invalid bridge must never become a demo write.
function createMakeshopBridge(){
 const params=new URLSearchParams(location.search),enabled=params.get('bridge')==='makeshop';
 const bridge={enabled,ready:false,platform:params.get('platform'),message:'메이크샵 연결 확인 중',wishlistState:'unknown',wishlistIds:[],wishBusy:false,request};
 if(!enabled)return bridge;
 const parentOrigin=params.get('parentOrigin'),session=params.get('session'),channel='pinkrocket-makeshop-v1';
 const allowedParents=['https://pink-rocket.com','https://www.pink-rocket.com'];
 const valid=window.parent!==window&&allowedParents.includes(parentOrigin)&&['pc','mobile'].includes(bridge.platform)&&/^\d{1,10}(?:-\d{1,10}){3}$/.test(session||'');
 let sequence=0,helloId=0,helloTimer,attempts=0,latestWishId=0,initialSnapshotOpen=true;
 const pending=new Map();
 function update(message){bridge.message=message;const el=document.getElementById('makeshop-connection');if(el)el.textContent=message;app.dataset.makeshop=bridge.ready?'connected':'unavailable';}
 function send(data){window.parent.postMessage({channel,session,...data},parentOrigin);}
 function request(action,id){
  if(!bridge.ready){toast(bridge.message);return false;}
  if(!['product','detail','wish','options','wishlist','cart'].includes(action))return false;
  if(['product','detail','wish','options'].includes(action)&&!catalog.some(p=>p.id===id))return false;
  if(action==='wish'&&bridge.wishBusy)return false;
  const requestId=++sequence;
  const entry={action,id,timer:null,accepted:false,snapshot:false};
  entry.timer=setTimeout(()=>{
   if(!pending.delete(requestId))return;
   if(action==='wish'){bridge.wishBusy=false;bridge.wishlistState='unknown';bridge.wishlistIds=[];syncMakeshopHearts();}
   toast('메이크샵의 응답을 확인하지 못했습니다. 열린 상세나 목록을 확인하세요.');
  },action==='wish'?45000:8000);
  pending.set(requestId,entry);
  if(action==='wish'){latestWishId=requestId;initialSnapshotOpen=false;bridge.wishBusy=true;syncMakeshopHearts();}
  send({action,requestId,...(id?{id}:{})});return true;
 }
 function receiveWishlist(data){
  const entry=pending.get(data.requestId),initial=data.requestId===helloId&&initialSnapshotOpen&&!latestWishId;
  if(data.platform!==bridge.platform||(!initial&&!(entry?.action==='wish'&&data.requestId===latestWishId)))return;
  if(!['ready','login','busy','error','unknown'].includes(data.state))return;
  const known=data.state==='ready'||data.state==='login';
  if(known){
   if(!Array.isArray(data.ids)||Array.from(data.ids).some(id=>typeof id!=='string'||!/^[1-9]\d*$/.test(id))||new Set(data.ids).size!==data.ids.length)return;
   if(data.state==='login'&&data.ids.length)return;
  }else if(data.ids!==undefined)return;
  if(data.id!==undefined&&(initial||data.id!==entry.id))return;
  if(data.selected!==undefined&&(!known||data.id!==entry?.id||typeof data.selected!=='boolean'||data.selected!==(data.state==='ready'&&data.ids.includes(data.id))))return;
  bridge.wishlistState=data.state;bridge.wishlistIds=known?[...data.ids]:[];
  if(initial&&data.state!=='busy')initialSnapshotOpen=false;
  if(entry&&data.state!=='busy')entry.snapshot=true;
  const messages={ready:'실제 관심상품 상태를 불러왔습니다.',login:'찜하려면 로그인이 필요합니다.',busy:'찜을 처리하는 중입니다.',error:'찜 상태를 확인하지 못했습니다. 실제 목록에서 확인하세요.',unknown:'찜 상태를 확인하지 못했습니다. 실제 목록에서 확인하세요.'};
  update('메이크샵 연결됨 · '+messages[data.state]);syncMakeshopHearts();
 }
 if(!valid){update('메이크샵 메인용 코드에서 연결 정보를 확인하세요.');return bridge;}
 window.addEventListener('message',event=>{
  const data=event.data;
  if(event.source!==window.parent||event.origin!==parentOrigin||!data||data.channel!==channel||data.session!==session||!Number.isSafeInteger(data.requestId))return;
  if(data.action==='init'){
   if(data.requestId!==helloId||data.platform!==bridge.platform)return;
   clearTimeout(helloTimer);bridge.ready=true;update('메이크샵 연결됨 · 찜 상태를 확인하는 중입니다.');return;
  }
  if(bridge.ready&&data.action==='wishlist-state'){receiveWishlist(data);return;}
  if(!bridge.ready||!['accepted','status'].includes(data.action)||!pending.has(data.requestId))return;
  const entry=pending.get(data.requestId);
  if(data.action==='accepted'&&entry.action==='wish'){
   if(entry.accepted)return;
   entry.accepted=true;
  }else{
   clearTimeout(entry.timer);pending.delete(data.requestId);
   if(entry.action==='wish'){
    bridge.wishBusy=false;
    if(!entry.snapshot){bridge.wishlistState='unknown';bridge.wishlistIds=[];}
    syncMakeshopHearts();
   }
  }
  if(typeof data.message==='string')toast(data.message.slice(0,300));
 });
 function hello(){
  if(bridge.ready)return;
  if(attempts++>=5){update('메이크샵 연결을 확인하지 못했습니다. 부모 메인용 코드를 확인하고 새로고침하세요.');return;}
  if(!helloId)helloId=++sequence;
  send({action:'hello',requestId:helloId});helloTimer=setTimeout(hello,1000);
 }
 hello();return bridge;
}
function favoritePresentation(p){
 const native=makeshopBridge.enabled,state=native?makeshopBridge.wishlistState:'ready',known=state==='ready'||state==='login',selected=native?state==='ready'&&makeshopBridge.wishlistIds.includes(p.id):favorites.includes(p.id);
 const label=native?(state==='login'?'로그인 후 찜하기':state==='busy'?'메이크샵 찜 처리 중':known?(selected?'찜 취소':'찜 추가'):'메이크샵 찜 상태 미확인'):(selected?'찜 취소':'찜 추가');
 return {state,known,selected,disabled:native&&makeshopBridge.wishBusy,label:(p.displayName||p.name)+' '+label};
}
function favoriteButtonHTML(p){const f=favoritePresentation(p);return `<button class="photo-heart ${f.selected?'active':''}" data-action="favorite" data-id="${p.id}" data-wishlist-state="${f.state}" aria-label="${esc(f.label)}" ${f.known?`aria-pressed="${f.selected}"`:''} ${f.disabled?'disabled':''}>${icon('heart')}</button>`;}
function syncMakeshopHearts(){
 document.querySelectorAll('[data-action="favorite"][data-id]').forEach(button=>{
  const p=catalog.find(item=>item.id===button.dataset.id);if(!p)return;const f=favoritePresentation(p);
  button.classList.toggle('active',f.selected);button.dataset.wishlistState=f.state;button.setAttribute('aria-label',f.label);button.disabled=f.disabled;
  if(f.known)button.setAttribute('aria-pressed',String(f.selected));else button.removeAttribute('aria-pressed');
 });
}
function currentFavorites(){return makeshopBridge.enabled?(makeshopBridge.wishlistState==='ready'?makeshopBridge.wishlistIds:[]):favorites;}
function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3300);}
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function write(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{toast('브라우저 저장 공간이 부족합니다. 작은 이미지를 쓰거나 구성 파일을 내보내세요.');return false;}}
function markDirty(){dirty=JSON.stringify(draft)!==JSON.stringify(published);}
function loadConfig(key,fallback){try{return migrateSavedConfig(read(key,fallback),catalog);}catch{return clone(fallback);}}
function currentConfig(){return previewMode?draft:published;}
function labbar(){return frameMode?'':`<div class="labbar"><div class="lab-title"><i class="signal"></i><span>INTERACTIVE PROTOTYPE</span><span class="subtext">/ 상품 ${catalog.length.toLocaleString('ko-KR')}개 · 10/13 수집본</span></div><div class="lab-actions"><button data-action="view-shop" class="${view==='shop'?'active':''}">고객 화면</button><button data-action="view-admin" class="${view==='admin'?'active':''}">운영자 화면</button><button data-action="open-guide" class="help-btn" aria-label="목업 안내">${icon('info')}</button></div></div>`;}
function render({keepAdminPosition=false}={}){const filterScroll=app.querySelector('.discovery-body')?.scrollTop||0;const tableScroll=app.querySelector('.table-wrap')?.scrollTop||0;const focus=document.activeElement;const focusTag=focus?.dataset.group?{group:focus.dataset.group,tag:focus.dataset.tag}:null;const adminFocus=keepAdminPosition&&focus?.closest('[data-row-id]')?{id:focus.closest('[data-row-id]').dataset.rowId,action:focus.dataset.action,rank:focus.hasAttribute('data-rank')}:null;app.classList.toggle('shop-view',view==='shop');observer?.disconnect();app.innerHTML=labbar()+(view==='admin'?adminHTML():shopHTML());if(view==='shop')renderFeed();else if(adminPage==='list')renderAdminRows();else if(adminPage==='banners')syncBlockEditor();else if(adminPage==='workbench'&&workbenchView==='photos')renderPhotoGrid();bindDrag();syncFilterSheet();const sheet=app.querySelector('.discovery-body');if(sheet)sheet.scrollTop=filterScroll;if(discoveryOpen&&focusTag)app.querySelector(`[data-group="${focusTag.group}"][data-tag="${CSS.escape(focusTag.tag)}"]`)?.focus({preventScroll:true});if(keepAdminPosition&&view==='admin'){const table=app.querySelector('.table-wrap');if(table)table.scrollTop=tableScroll;if(adminFocus){const row=app.querySelector(`[data-row-id="${CSS.escape(adminFocus.id)}"]`);row?.querySelector(adminFocus.rank?'[data-rank]':`[data-action="${adminFocus.action}"]`)?.focus({preventScroll:true});}}if(view==='admin')updateAdminURL();}
function shopHTML(){const s=tabStates[tab];return `${previewMode?'<div class="preview-ribbon">편집 중인 초안 미리보기'+(frameMode?'':'<button data-action="return-admin">편집으로 돌아가기</button>')+'</div>':''}
${blockZoneHTML('top')}<header class="shop-header"><div class="header-main"><button class="wordmark" data-action="home" aria-label="핑크로켓 홈"><picture><source media="(max-width: 60rem)" srcset="./assets/skin/logo-mobile.png"><img src="./assets/skin/logo-pc.png" alt="PINKROCKET" draggable="false"></picture></button><div class="catalog-search"><div class="searchbox">${icon('search')}<label class="sr-only" for="shop-search">상품 검색</label><input type="search" id="shop-search" aria-label="상품 검색" placeholder="상품 검색" value="${esc(s.query)}"><button data-action="open-filters" aria-label="사진 색감과 태그로 찾기">${icon('grid')}</button></div></div><div class="header-icons"><button class="text-button wish-trigger ${s.favoritesOnly?'active':''}" data-action="toggle-favorites" aria-label="찜한 상품 보기">${icon('heart')}${!makeshopBridge.enabled&&favorites.length?'<span class="wish-count">'+favorites.length+'</span>':''}</button><button class="text-button cart-trigger" data-action="open-cart" aria-label="${makeshopBridge.enabled?'메이크샵 장바구니 열기':'데모 장바구니 열기'}">${icon('bag')}${!makeshopBridge.enabled&&cart.length?'<span class="cart-count">'+cart.reduce((n,x)=>n+x.quantity,0)+'</span>':''}</button></div></div><nav class="category-tabs" aria-label="상품 카테고리" data-tab-swipe>${TABS.map(t=>`<button data-action="tab" data-tab="${t}" aria-current="${t===tab?'page':'false'}" class="${t===tab?'active':''}">${({반지:'반지·토우링',팔찌:'팔찌·발찌'})[t]||t}</button>`).join('')}</nav></header>${blockZoneHTML('after-tabs')}
<main id="main-content" class="shop-main"><div class="catalog-heading" data-tab-swipe><div><h1>${s.favoritesOnly?'관심상품':tab==='추천'?'추천 상품':tab==='신상'?'신상품':esc(tab)}</h1><p id="category-description">${s.favoritesOnly?'찜한 상품':tab==='추천'?'추천 상품':tab==='신상'?'신상품':esc(tab)+' 상품'}</p></div><div class="tab-step"><button data-action="previous-tab" aria-label="이전 카테고리" ${TABS.indexOf(tab)===0?'disabled':''}>${icon('left')}</button><span>${TABS.indexOf(tab)+1} / ${TABS.length}</span><button data-action="next-tab" aria-label="다음 카테고리" ${TABS.indexOf(tab)===TABS.length-1?'disabled':''}>${icon('right')}</button></div></div>
<div class="browse-tools">${discoveryHTML(s)}<div class="filter-chips" aria-label="소재 필터">${MATERIALS.map(m=>`<button class="chip ${m===s.material?'active':''}" data-action="material" data-material="${m}" aria-pressed="${m===s.material}">${m==='전체'?'모든 소재':m}</button>`).join('')}</div></div><div class="filter-bar"><span id="result-count" class="result-count" aria-live="polite"></span><label class="sort-label"><span class="sr-only">상품 정렬</span><select id="shop-sort" class="sort-select" aria-label="상품 정렬">${Object.entries({curated:'추천순',match:'태그 추천순',newest:'신상품순 · 시연',priceAsc:'낮은 가격순',priceDesc:'높은 가격순'}).map(([value,label])=>`<option value="${value}" ${s.sort===value?'selected':''}>${label}</option>`).join('')}</select></label></div>${blockZoneHTML('before-feed')}<div class="catalog-grid"><div id="product-feed" data-block-zone="feed" class="feed" aria-label="${esc(tab)} 상품 목록" data-tab-swipe></div></div><div id="more-wrap" class="more-wrap"></div>${blockZoneHTML('bottom')}</main>
<footer class="shop-footer"><div><img class="footer-logo" src="./assets/skin/logo-pc.png" alt="PINKROCKET"><p>CS Center<br><a href="https://pf.kakao.com/_lxgBed/friend" target="_blank" rel="noopener">핑크로켓 카카오톡 ↗</a></p></div><div><p>${makeshopBridge.enabled?'메이크샵 미리보기 · 상품 정보는 조회 시점의 사본입니다.<br>옵션·현재 가격·찜·장바구니는 메이크샵에서 확인합니다.':'상품 목록은 조회 시점의 사본이며 상세는 실제 메이크샵 화면입니다.<br>목록의 찜·장바구니 표시는 이 브라우저의 데모입니다.'}</p>${makeshopBridge.enabled?`<p id="makeshop-connection" role="status">${esc(makeshopBridge.message)}</p>`:''}<button data-action="view-admin" style="margin-top:.7rem;text-decoration:underline">메인 운영자 화면</button></div></footer><nav class="bottom-nav" aria-label="빠른 메뉴"><button data-action="home" class="${tab==='추천'&&!s.favoritesOnly?'active':''}">${icon('home')}<span>추천</span></button><button data-action="open-categories">${icon('grid')}<span>카테고리</span></button><button data-action="toggle-favorites" class="${s.favoritesOnly?'active':''}">${icon('heart')}<span>찜</span></button><button data-action="open-cart">${icon('bag')}<span>장바구니</span></button></nav>`;}
function cachedList(cache,key,compute){if(cache.has(key))return cache.get(key);const result=compute();cache.set(key,result);if(cache.size>4)cache.delete(cache.keys().next().value);return result;}
function visibleProducts(){const config=currentConfig(),s=tabStates[tab],favorites=currentFavorites(),{photoPreview,...discovery}=s.discovery,key=JSON.stringify([tab,config.tabs[tab],rankingFor(config,tab),config.productEdits,s.query,s.material,s.sort,s.favoritesOnly,favorites,discovery]);return cachedList(browseCache,key,()=>browseProducts(catalog,tab,config,{...s,favorites}));}
function workspaceList(config){const key=JSON.stringify([adminTab,config.tabs[adminTab],rankingFor(config),config.productEdits]);return cachedList(workspaceRankCache,key,()=>resolveList(catalog,adminTab,config));}
function discoveryHTML(s){const d=s.discovery;return `<details class="discovery" ${discoveryOpen?'open':''}><summary aria-label="상세 필터 열기">${icon('grid')}<span>필터</span><span id="discovery-summary"></span></summary><div class="filter-backdrop" data-action="close-filters"></div><div class="discovery-body" role="dialog" aria-modal="true" aria-label="상품 필터"><div class="filter-sheet-heading"><div><h2>상품 필터</h2></div><button data-action="close-filters" aria-label="필터 닫기">${icon('close')}</button></div>${TAG_GROUPS.map(g=>`<div class="tag-row"><h2>${g.label}</h2><div class="tag-options">${g.options.map(tag=>`<button data-action="discovery-tag" data-group="${g.key}" data-tag="${esc(tag)}" class="tag-option ${d.tags[g.key]?.includes(tag)?'selected':''}" aria-pressed="${!!d.tags[g.key]?.includes(tag)}">${esc(tag)}</button>`).join('')}</div></div>`).join('')}<div class="tag-row"><h2>가격 범위</h2><div class="price-inputs"><label><span class="sr-only">최저 가격</span><input id="discovery-min" type="number" min="0" inputmode="numeric" placeholder="최저 가격" value="${esc(d.min)}"></label><span>~</span><label><span class="sr-only">최고 가격</span><input id="discovery-max" type="number" min="0" inputmode="numeric" placeholder="최고 가격" value="${esc(d.max)}"></label><span>원</span>${[['5천 원 이하','5000'],['1만 원 이하','10000']].map(([label,max])=>`<button class="tag-option" data-action="price-preset" data-max="${max}">${label}</button>`).join('')}</div></div><div class="tag-row"><h2>사진 색감</h2><div class="photo-discovery"><label class="photo-upload">사진으로 비슷한 색 찾기<input id="discovery-photo" type="file" accept="image/*" aria-label="색감으로 찾을 사진 선택"></label>${d.photoPreview?`<img src="${esc(d.photoPreview)}" alt="선택한 색감 참고 사진"><button class="tag-option" data-action="clear-photo">사진 빼기 ×</button>`:''}<span>사진은 이 브라우저에서만 처리합니다.</span></div></div><div class="discovery-actions"><label><input type="checkbox" id="discovery-strict" ${d.strict?'checked':''}>선택한 태그가 일치하는 상품만</label><label>추천 범위 <select id="discovery-cap" aria-label="추천 상품 수">${[[0,'전체'],[500,'500개'],[1000,'1,000개']].map(([n,label])=>`<option value="${n}" ${d.cap===n?'selected':''}>${label}</option>`).join('')}</select></label><button class="tag-reset" data-action="reset-discovery">탐색 조건 초기화</button></div><p class="discovery-note">기본은 선택 조건과 가까운 순서입니다. 여러 태그를 고를 수 있고, 가격 범위는 목록에 적용됩니다. 사진 검색은 색감을 비교합니다.</p><div class="filter-apply"><button data-action="reset-discovery">초기화</button><button class="apply-filters" data-action="close-filters"><span id="filter-preview-count"></span> 상품 보기</button></div></div></details>`;}
function updateDiscoverySummary(){const d=tabStates[tab].discovery,el=app.querySelector('#discovery-summary');if(!el)return;const tags=TAG_GROUPS.flatMap(g=>d.tags[g.key]||[]);const count=tags.length+(d.min!==''||d.max!==''?1:0)+(d.photoTone?1:0);el.textContent=count||'';el.hidden=!count;el.title=[...tags,d.min!==''||d.max!==''?'가격 조건':'',d.photoTone?'사진 색감':''].filter(Boolean).join(' · ');}
function productHTML(p){const index=photoState.get(p.id)||0;return `<article class="product-card" data-product="${p.id}"><div class="product-photo" data-gallery="${p.id}"><button class="photo-link" data-action="quickview" data-id="${p.id}" aria-label="${esc(p.displayName||p.name)} 상세 보기"><img src="${esc(p.images[index]||p.images[0]||'')}" alt="${esc(p.name)} 사진 ${index+1}" loading="lazy" decoding="async" draggable="false"></button>${favoriteButtonHTML(p)}${p.images.length>1?`<button class="photo-arrow prev" data-action="slide" data-id="${p.id}" data-delta="-1" aria-label="이전 사진">${icon('left')}</button><button class="photo-arrow next" data-action="slide" data-id="${p.id}" data-delta="1" aria-label="다음 사진">${icon('right')}</button><span class="photo-dots" role="img" aria-label="사진 ${p.images.length}장 중 ${index+1}번째">${p.images.map((_,i)=>`<i class="${i===index?'on':''}" aria-hidden="true"></i>`).join('')}</span>`:''}${p.soldout?'<span class="soldout">SOLD OUT</span>':''}</div><div class="product-meta"><button class="product-name" data-action="quickview" data-id="${p.id}">${esc(p.displayName||p.name)}</button><div class="product-bottom"><span class="price">${won(p.price)}</span><button class="quick-add" data-action="quickview" data-id="${p.id}" aria-label="${esc(p.displayName||p.name)} 상세 보기">${icon('plus')}<span>상세 보기</span></button></div></div></article>`;}
function blockZoneHTML(zone){return `<section class="block-zone" data-block-zone="${zone}" hidden><div class="block-zone-grid"></div></section>`;}
function bannerHTML(value){
 const b=normalizeContentBlock(value),classes=`content-block block-type-${b.type} block-width-pc-${b.widthPc} block-width-mobile-${b.widthMobile}${b.newRow?' block-new-row':''}`;
 const style=`--block-bg:${b.background};--block-color:${b.textColor};--block-padding:${b.padding}px;--block-radius:${b.radius}px;--block-align:${b.align};--block-fit:${b.imageFit};--block-ratio:${b.imageRatio==='auto'?'auto':b.imageRatio}`;
 const image=b.image?`<img class="content-block-image" src="${esc(b.image)}" alt="${b.type==='image'?esc(b.title):''}" loading="lazy" decoding="async">`:'';
 const link=b.link?`<a class="content-block-link" href="${esc(b.link)}" target="_blank" rel="noopener">자세히 보기 ${icon('arrow')}</a>`:'';
 const copy=`<div class="content-block-copy">${b.tag?`<span class="content-block-tag">${esc(b.tag)}</span>`:''}<h3 class="content-block-title">${esc(b.title)}</h3>${b.subtitle?`<p class="content-block-description">${esc(b.subtitle)}</p>`:''}${link}</div>`;
 const content=b.type==='image'?(b.link?`<a href="${esc(b.link)}" target="_blank" rel="noopener">${image}</a>`:image):b.type==='spacer'?'':b.type==='divider'?'<hr>':(b.type==='editorial'?image:'')+copy;
 return `<aside class="${classes}" data-content-block="${esc(b.id)}" style="${style}" ${['spacer','divider'].includes(b.type)?'aria-hidden="true"':`aria-label="${esc(b.title)}"`}>${content}</aside>`;
}
function renderFeed(){
 if(view!=='shop')return;const revision=++feedRevision,list=visibleProducts(),s=tabStates[tab],feed=app.querySelector('#product-feed');
 const filtered=!!s.query.trim()||s.material!=='전체'||s.favoritesOnly||hasDiscovery(s.discovery);let seen=0;const nodes=[];
 for(const block of composeFeed(list,currentConfig().banners,tab,{filtered})){if(block.kind==='product'){if(seen>=s.limit)break;seen++;nodes.push(productHTML(block.data));}else nodes.push(bannerHTML(block.data));}
 feed.innerHTML=nodes.join('')+(!list.length?`<div class="empty"><h3>아직 이 조건에 맞는 상품이 없어요.</h3><p>${s.favoritesOnly?'찜한 상품이 없습니다.':'다른 소재를 선택하거나 검색어를 바꿔보세요.'}</p><button class="btn" data-action="clear-filters" style="margin-top:1rem">조건 초기화</button></div>`:'');
 for(const zone of ['top','after-tabs','before-feed','bottom']){const wrapper=app.querySelector(`[data-block-zone="${zone}"]`),blocks=blocksForZone(list,currentConfig().banners,tab,zone,{filtered});wrapper.hidden=!blocks.length;wrapper.querySelector('.block-zone-grid').innerHTML=blocks.map(bannerHTML).join('');}
 app.querySelector('#result-count').textContent=`${list.length}개의 상품${s.favoritesOnly?' · 찜한 상품':''}`;
 app.querySelector('#more-wrap').innerHTML=seen<list.length?`<button class="more-btn" data-action="load-more">상품 더 보기 · ${seen} / ${list.length} ${icon('down')}</button><p class="end-copy">아래로 내려가면 다음 상품이 이어집니다.</p><div id="feed-sentinel" aria-hidden="true"></div>`:`<p class="end-copy">${list.length?'모든 상품을 확인했습니다.':''}</p>`;
 updateDiscoverySummary();const previewCount=app.querySelector('#filter-preview-count');if(previewCount)previewCount.textContent=list.length.toLocaleString('ko-KR')+'개';observer?.disconnect();const sentinel=app.querySelector('#feed-sentinel');if(sentinel&&'IntersectionObserver'in window){observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();setTimeout(()=>{if(view==='shop'&&revision===feedRevision){s.limit+=6;renderFeed();}},250);}},{rootMargin:'0px 0px 150px 0px'});observer.observe(sentinel);}updateURL();
}
function updateAdminURL(){if(frameMode||view!=='admin')return;const url=new URL(location.href);url.searchParams.set('view','admin');url.searchParams.set('adminTab',adminTab);url.searchParams.set('adminPage',adminPage);if(adminPage==='workbench')url.searchParams.set('workbenchView',workbenchView);else url.searchParams.delete('workbenchView');url.searchParams.set('adminFilter',adminFilter);if(adminQuery)url.searchParams.set('adminQ',adminQuery);else url.searchParams.delete('adminQ');historyReplace(url);}
function updateURL(){if(frameMode)return;if(view==='admin')return updateAdminURL();const s=tabStates[tab],url=new URL(location.href);url.searchParams.set('view',view);url.searchParams.set('tab',tab);for(const key of ['q','material','sort','adminTab','adminPage','adminFilter','adminQ','workbenchView'])url.searchParams.delete(key);if(s.query)url.searchParams.set('q',s.query);if(s.material!=='전체')url.searchParams.set('material',s.material);if(s.sort!=='curated')url.searchParams.set('sort',s.sort);historyReplace(url);}
function historyReplace(url){try{window.history.replaceState(null,'',url);}catch{ /* Embedding may restrict history; local navigation must still work. */ }}
function setTab(next){
 if(!TABS.includes(next)||next===tab)return;
 const direction=TABS.indexOf(next)>TABS.indexOf(tab)?1:-1,revision=(setTab.revision||0)+1;
 setTab.revision=revision;setTab.animation?.cancel();setTab.animation=null;app.classList.remove('category-transition');
 tabStates[tab].scroll=window.scrollY;
 const navScroll=app.querySelector('.category-tabs')?.scrollLeft||0;
 tab=next;render();
 const nav=app.querySelector('.category-tabs');
 if(nav){nav.scrollLeft=navScroll;const active=nav.querySelector('.active');if(active&&nav.clientWidth&&active.offsetLeft+active.offsetWidth>nav.scrollLeft+nav.clientWidth)nav.scrollLeft=active.offsetLeft-nav.offsetLeft;if(active&&active.offsetLeft<nav.scrollLeft)nav.scrollLeft=active.offsetLeft-nav.offsetLeft;}
 requestAnimationFrame(()=>{
  if(revision!==setTab.revision||tab!==next||view!=='shop')return;
  window.scrollTo({top:tabStates[next].scroll,behavior:'instant'});
  const main=app.querySelector('.shop-main');
  if(!main?.animate||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||discoveryOpen)return;
  const offset=Math.min(96,(main.clientWidth||window.innerWidth||640)*.14)*direction;
  app.classList.add('category-transition');
  const animation=main.animate([{transform:`translateX(${offset}px)`,opacity:.82},{transform:'translateX(0)',opacity:1}],{duration:240,easing:'cubic-bezier(.22,.7,.2,1)'});
  setTab.animation=animation;
  const finish=()=>{if(revision===setTab.revision){app.classList.remove('category-transition');setTab.animation=null;}};
  animation?.finished?.then(finish,finish);
 });
}
function adjacentTab(delta){const next=TABS[TABS.indexOf(tab)+delta];if(next)setTab(next);}
function slide(id,delta){const p=catalog.find(p=>p.id===id);if(!p||p.images.length<2)return;photoState.set(id,((photoState.get(id)||0)+delta+p.images.length)%p.images.length);const card=app.querySelector(`[data-product="${CSS.escape(id)}"]`);if(card){const wrap=document.createElement('div');wrap.innerHTML=productHTML(p);card.replaceWith(wrap.firstElementChild);}}

function categoryTabsHTML(){return `<div class="studio-tabbar" role="group" aria-label="편집할 카테고리">${TABS.map(t=>button(t,'admin-tab',adminTab===t?'active':'',`data-tab="${t}" aria-pressed="${adminTab===t}"`)).join('')}</div>`;}
function adminHTML(){
 const ai=adminPage==='workbench',pages=[['overview','메인 운영','home'],['workbench','AI 작업대','grid'],['list','상품 진열 편집','pin'],['banners','배너·안내','banner'],['history','저장·공개 이력','history'],['guide','이용 안내','info']];
 return `<div class="studio-shell"><aside class="studio-sidebar"><div class="studio-logo">PINKROCKET<small>CURATION STUDIO</small></div><div class="studio-mode-switch" aria-label="운영 화면 선택">${button('사람용 운영','admin-mode',!ai?'active':'',`data-mode="operator" aria-pressed="${!ai}"`)}${button('AI 작업대','admin-mode',ai?'active':'',`data-mode="ai" aria-pressed="${ai}"`)}</div><nav class="studio-nav" aria-label="운영자 메뉴">${pages.map(([id,label,ico])=>`<button data-action="admin-page" data-page="${id}" class="${adminPage===id?'active':''}">${icon(ico)}${label}</button>`).join('')}</nav><div class="studio-sidebar-note">같은 상품 · 같은 초안<br>상품 데이터: 메이크샵</div></aside><main id="main-content" class="studio-main"><div class="studio-heading"><div><div class="eyebrow">CURATION STUDIO / ${adminPage.toUpperCase()}</div><h1>${{overview:'메인 운영',workbench:'AI 작업대',list:'상품 진열',banners:'배너·안내 배치',history:'저장·공개 이력',guide:'이용 안내'}[adminPage]}</h1><p>${ai?'사진을 확인하고 태그·점수 규칙을 편집합니다.':adminPage==='overview'?'진열 방향을 정하고 사진으로 결과를 확인합니다.':'상품 순서·고정·제외·배너를 설정합니다.'}</p></div><div class="studio-toolbar"><span class="status-pill ${dirty?'dirty':''}">${dirty?'편집 중 · 미공개':'공개본과 동일'}</span>${button(icon('save')+'초안 저장','save-draft')}${button(icon('eye')+'고객 초안 미리보기','preview-draft')}${button('목업에 공개','publish','primary')}</div></div>${adminPage==='list'&&rankingFor().enabled?'<p class="workspace-result">점수 정렬을 사용 중입니다. 수동 순서는 동점 기준이며 직접 순번 이동은 점수 정렬을 끈 뒤 사용할 수 있습니다. 고정 우선 여부는 진열 방향에서 설정합니다.</p>':''}${adminPage==='overview'?operatorHTML():adminPage==='workbench'?workbenchHTML():adminPage==='list'?adminListHTML():adminPage==='banners'?adminBannersHTML():adminPage==='history'?adminHistoryHTML():guideHTML()+browserGuideHTML()}</main></div>`;
}
function adminData(){
  const c=draft.tabs[adminTab],list=workspaceList(draft);
  const pinned=list.filter(p=>c.pins.includes(p.id));
  const excluded=poolFor(catalog,adminTab).filter(p=>c.excluded.includes(p.id));
  const source=adminFilter==='excluded'?excluded:adminFilter==='pinned'?pinned:list;
  const q=adminQuery.trim().toLowerCase(),exactId=source.some(p=>p.id===q);
  const rows=source.filter(p=>exactId?p.id===q:!q||`${p.name} ${p.displayName||''} ${p.id}`.toLowerCase().includes(q));
  return {c,list,pinned,excluded,source,rows,positions:new Map(list.map((p,i)=>[p.id,i]))};
}
function adminListHTML(){
  const {c,list,pinned,excluded}=adminData(),isExcluded=adminFilter==='excluded';
  return `<div class="studio-tabbar" aria-label="편집할 카테고리">${TABS.map(t=>`<button data-action="admin-tab" data-tab="${t}" aria-pressed="${t===adminTab}" class="${t===adminTab?'active':''}">${t}</button>`).join('')}</div>
  <div class="curation-heading"><p><strong>${esc(adminTab)}</strong> 카테고리의 초안을 편집합니다. 변경 후 미리보기로 확인하세요.</p><div class="curation-history">${button('실행 취소','undo-curation','small',curationPast.length?'':'disabled')}${button('다시 실행','redo-curation','small',curationFuture.length?'':'disabled')}</div></div><p id="admin-result" class="admin-result" role="status" aria-live="polite" data-revision="${curationRevision}">${esc(curationResult)}</p>
  <div class="studio-grid"><section class="panel curation-panel"><div class="panel-header"><h2>상품 진열 관리</h2><span class="curation-mode">${c.manual.length?'수동 순서 사용 중':'자동 정렬 사용 중'}</span></div>
    <div class="admin-status-tabs" aria-label="진열 상태">${[['all','전체 진열',list.length],['pinned','상단 고정',pinned.length],['excluded','제외',excluded.length]].map(([value,label,count])=>`<button data-action="admin-filter" data-filter="${value}" aria-label="${label} 보기" aria-pressed="${adminFilter===value}" class="${adminFilter===value?'active':''}">${label}<span>${count.toLocaleString('ko-KR')}</span></button>`).join('')}</div>
    <div class="list-toolbar"><label class="list-search">${icon('search')}<input id="admin-search" type="search" value="${esc(adminQuery)}" placeholder="상품명 또는 ID 검색" aria-label="편집 목록 검색"></label><span class="admin-scope">${isExcluded?'제외된 상품을 검색·복원합니다.':'순번은 검색 전 전체 진열 기준입니다.'}</span></div>
    <div class="admin-bulkbar"><div class="selection-summary"><strong id="admin-selection-count" aria-live="polite"></strong><span id="admin-hidden-selection"></span>${button('선택 해제','clear-selection','small','data-selection-action')}</div><div class="admin-bulk-actions">${isExcluded?button('선택 복원','bulk-restore','small','data-selection-action'):button('선택 고정','bulk-pin','small','data-selection-action')+button('선택 고정 해제','bulk-unpin','small','data-selection-action')+button('선택 제외','bulk-exclude','small danger','data-selection-action')}</div></div>
    <div class="table-wrap"><table class="product-table" aria-label="${esc(adminTab)} ${isExcluded?'제외 상품':'진열 상품'} 목록"><thead><tr><th><input type="checkbox" data-select-all aria-label="표시 상품 전체 선택"></th><th>진열 순번</th><th>상품 / 메이크샵 ID</th><th>가격</th><th>${isExcluded?'복원':'진열 편집'}</th></tr></thead><tbody id="admin-rows"></tbody></table></div><div id="admin-more" class="admin-more" aria-live="polite"></div>
  </section><aside class="studio-aside"><section class="panel side-card"><div class="panel-header"><h2>진열 규칙</h2></div><div class="panel-body"><div class="stat-row"><span>진열 중</span><strong>${list.length.toLocaleString('ko-KR')}개</strong></div><div class="stat-row"><span>진열 중 상단 고정</span><strong>${pinned.length}개</strong></div><div class="stat-row"><span>제외</span><strong>${excluded.length}개</strong></div><div class="helper-box">상단 고정 → 수동 순서 → 자동 정렬 순으로 표시합니다.<br>순번 이동은 고정 상품끼리, 일반 상품끼리 가능합니다. 고정을 해제하면 일반 구간에서 순번을 바꿀 수 있습니다.</div><p class="admin-local-note">초안은 이 브라우저에 저장됩니다. 실제 메이크샵 진열에는 반영되지 않습니다.</p></div></section>
    <section class="panel side-card"><div class="panel-header"><h2>자동 진열 기준</h2></div><div class="panel-body"><label class="field"><span class="field-label">기본 정렬</span><select id="admin-sort" aria-label="운영자 기본 정렬">${Object.entries(SORTS).filter(([k])=>k!=='reviews'||catalog.some(p=>p.reviewCount)).map(([k,v])=>`<option value="${k}" ${c.sort===k?'selected':''}>${v}${k==='newest'?' · 시연':''}</option>`).join('')}</select></label><label class="check-label"><input type="checkbox" id="hide-soldout" ${c.hideSoldout?'checked':''} ${catalog.every(p=>p.stockStatus==='unknown')?'disabled':''}>품절 상품 숨기기 · 상태 수집 전</label>${button('정렬 기준 적용','apply-sort','accent full-btn')}<p style="margin-top:.6rem">고정·수동 순서·제외 설정을 유지합니다. 수동 순서가 없을 때 선택 기준으로 정렬됩니다.</p>${button('수동 순서 초기화 후 자동 정렬','reset-order','small full-btn','style="margin-top:.7rem"')}</div></section>
  </aside></div>`;
}
function syncAdminSelection(){
  const boxes=[...app.querySelectorAll('[data-row-select]')],visibleIds=new Set(boxes.map(box=>box.dataset.rowSelect));
  boxes.forEach(box=>{box.checked=selected.has(box.dataset.rowSelect);box.closest('tr').classList.toggle('is-selected',box.checked);});
  const count=boxes.filter(box=>box.checked).length,all=app.querySelector('[data-select-all]');
  if(all){all.checked=boxes.length>0&&count===boxes.length;all.indeterminate=count>0&&count<boxes.length;all.disabled=!boxes.length;}
  const label=app.querySelector('#admin-selection-count');if(label)label.textContent=`선택 ${selected.size}개`;
  const hidden=app.querySelector('#admin-hidden-selection'),hiddenCount=[...selected].filter(id=>!visibleIds.has(id)).length;
  if(hidden){hidden.textContent=hiddenCount?`현재 화면 밖 ${hiddenCount}개 포함`:'';hidden.hidden=!hiddenCount;}
  app.querySelectorAll('[data-selection-action]').forEach(button=>button.disabled=!selected.size);
}
function renderAdminRows(){
  const {c,list,pinned,source,rows,positions}=adminData(),isExcluded=adminFilter==='excluded';
  const allowed=new Set(source.map(p=>p.id));selected.forEach(id=>{if(!allowed.has(id))selected.delete(id);});
  const body=app.querySelector('#admin-rows');if(!body)return;
  body.innerHTML=rows.length?rows.slice(0,adminLimit).map(p=>{
    const pos=positions.get(p.id),isPinned=c.pins.includes(p.id),min=isPinned?1:pinned.length+1,max=isPinned?pinned.length:list.length;
    const rank=isExcluded?'<span class="excluded-rank">—</span>':`<div class="rank-editor"><input class="rank-input" type="number" min="${min}" max="${max}" value="${pos+1}" data-rank="${p.id}" aria-label="상품 ID ${p.id} ${esc(p.displayName||p.name)} 순번" title="${isPinned?'고정':'일반'} 구간 ${min}~${max}번 · Enter 또는 이동으로 적용"><button type="button" data-action="apply-rank" data-id="${p.id}" aria-label="상품 ID ${p.id} 순번 적용">이동</button></div><small class="rank-range">${isPinned?'고정':'일반'} ${min}~${max}</small>`;
    return `<tr draggable="${!isExcluded}" data-row-id="${p.id}" aria-label="상품 ID ${p.id}" data-row-state="${isExcluded?'excluded':isPinned?'pinned':'normal'}" class="${isPinned?'pinned':''}"><td><input type="checkbox" data-row-select="${p.id}" aria-label="상품 ID ${p.id} ${esc(p.displayName||p.name)} 선택"></td><td>${rank}</td><td><div class="table-product"><img src="${esc(p.images[0]||'')}" alt="" loading="lazy" draggable="false"><div><div class="name">${esc(p.displayName||p.name)}</div><small>상품 ID <span class="product-id">${p.id}</span> · ${esc(p.material)}</small><span class="curation-badge ${isExcluded?'excluded':isPinned?'pinned':''}">${isExcluded?(isPinned?'제외 · 복원 시 고정':'제외'):isPinned?(rankingFor().enabled&&!rankingFor().respectPins?'고정 설정 · 점수순':'상단 고정'):'일반 진열'}</span></div></div></td><td>${won(p.price)}</td><td><div class="row-actions curation-row-actions">${isExcluded?`<button data-action="restore-product" data-id="${p.id}" aria-label="상품 ID ${p.id} ${esc(p.displayName||p.name)} 제외 취소">복원</button>`:`<button data-action="pin" data-id="${p.id}" class="${isPinned?'on':''}" aria-label="상품 ID ${p.id} ${esc(p.displayName||p.name)} 상단 고정 전환" aria-pressed="${isPinned}">${isPinned?'고정 해제':'고정'}</button><button class="icon-action" data-action="move-up" data-id="${p.id}" aria-label="상품 ID ${p.id} ${esc(p.displayName||p.name)} 위로 이동" ${pos+1<=min?'disabled':''}>${icon('up')}</button><button class="icon-action" data-action="move-down" data-id="${p.id}" aria-label="상품 ID ${p.id} ${esc(p.displayName||p.name)} 아래로 이동" ${pos+1>=max?'disabled':''}>${icon('down')}</button><button data-action="exclude" data-id="${p.id}" aria-label="상품 ID ${p.id} ${esc(p.displayName||p.name)} 목록에서 제외">제외</button>`}</div></td></tr>`;
  }).join(''):`<tr><td colspan="5" class="admin-empty">${adminQuery?'검색 결과가 없습니다.':isExcluded?'제외한 상품이 없습니다.':adminFilter==='pinned'?'상단 고정 상품이 없습니다.':'진열할 상품이 없습니다.'}${adminQuery&&adminFilter!=='excluded'?'<small>제외한 상품은 ‘제외’에서 찾을 수 있습니다.</small>':''}</td></tr>`;
  if(rankingFor().enabled){body.querySelectorAll('[data-rank],[data-action=apply-rank],[data-action=move-up],[data-action=move-down]').forEach(el=>el.disabled=true);body.querySelectorAll('[data-row-id]').forEach(el=>el.draggable=false);body.querySelectorAll('.rank-range').forEach(el=>el.textContent='점수 정렬');}
  const more=app.querySelector('#admin-more');if(more)more.innerHTML=`<span>${Math.min(rows.length,adminLimit)} / ${rows.length.toLocaleString('ko-KR')}개 표시</span>${rows.length>adminLimit?button('다음 60개 표시','admin-more','small'):''}`;
  syncAdminSelection();bindDrag();updateAdminURL();
}
function rankingFor(config=draft,targetTab=adminTab){return config.ranking?.[targetTab]||defaultRanking();}
function workspaceControlsHTML(){return `<div class="workspace-actions">${button('작업 실행 취소','undo-workspace','small',workspacePast.length?'':'disabled')}${button('작업 다시 실행','redo-workspace','small',workspaceFuture.length?'':'disabled')}<span>사진·태그·점수 규칙 전용 · 최근 20단계</span></div><p id="workspace-result" class="workspace-result" role="status" aria-live="polite" data-revision="${workspaceRevision}">${esc(workspaceResult)}</p>`;}
function rankPreviewHTML(config=draft,limit=12,list=workspaceList(config)){
 const old=workspaceList(published),positions=new Map(old.map((p,i)=>[p.id,i+1]));
 return `<div class="rank-preview-grid">${list.slice(0,limit).map((p,i)=>{const before=positions.get(p.id),delta=before?before-i-1:null,r=p._rank;return `<article class="rank-preview-card" data-rank-product="${p.id}" data-score="${r?.score??0}"><button type="button" class="rank-photo" data-action="inspect-from-result" data-id="${p.id}" aria-label="상품 ID ${p.id} 사진·태그 검토"><img src="${esc(p.images[0]||'')}" alt="${esc(p.name)}" loading="lazy"></button><div class="rank-badge"><strong>${i+1}번</strong><span>${r?'규칙 점수 '+Number(r.score).toFixed(1):'기본 진열'}</span></div><h3>${esc(p.displayName||p.name)}</h3><p>상품 ID ${p.id} · ${won(p.price)}</p><p class="rank-diff" data-rank-delta="${delta??'new'}">${before?`공개본 ${before}번 → 초안 ${i+1}번${delta?' · '+(delta>0?'↑ '+delta:'↓ '+Math.abs(delta)): ' · 동일'}`:'공개본 진열에 없는 상품'}</p>${r?`<details class="rank-reasons"><summary>점수 근거 보기</summary><ul>${r.reasons.map(reason=>`<li>${esc(reason.label)} <strong>${Number(reason.points)>0?'+':''}${Number(reason.points).toFixed(1)}</strong></li>`).join('')||'<li>일치하는 점수 규칙 없음 · 기본 점수 0</li>'}</ul><p>규칙·검색 점수 ${Number(r.baseScore).toFixed(1)} − 반복 감점 ${Number(r.penalty).toFixed(1)}</p></details>`:''}</article>`;}).join('')}</div>`;
}
function operatorHTML(){
 const cfg=rankingFor(),editing=directionEdits.get(adminTab)||cfg,products=poolFor(catalog,adminTab),reviews=products.filter(p=>draft.productEdits?.[p.id]?.reviewStatus==='reviewed').length,needs=products.filter(p=>draft.productEdits?.[p.id]?.reviewStatus==='needs-review').length;
 const edited=products.filter(p=>JSON.stringify(draft.productEdits?.[p.id]||{})!==JSON.stringify(published.productEdits?.[p.id]||{})).length;
 return `<div class="operator-overview">${categoryTabsHTML()}${workspaceControlsHTML()}<div class="operator-grid"><section class="operator-goal panel"><h2>진열 방향</h2><p>큰 방향을 적어두면 AI가 이 지시와 실제 사진을 확인해 세부 태그와 점수 규칙을 편집할 수 있습니다.</p><form id="direction-form"><label class="field"><span class="field-label">AI에게 전달할 작업 지시</span><textarea name="brief" maxlength="1200" placeholder="예: 작은 데일리 피어싱 중심. 실버 색상을 우선하고 비슷한 모양이 연속해서 나오지 않게.">${esc(editing.brief)}</textarea></label><label class="field"><span class="field-label">상품 종류의 다양성</span><select name="diversity">${[[0,'점수 순서 우선'],[3,'비슷한 상품 반복 조금 줄이기'],[6,'종류를 고르게 섞기'],[10,'다양성 우선'],...([0,3,6,10].includes(editing.diversity)?[]:[[editing.diversity,'AI 세부 설정 · '+editing.diversity]])].map(([n,label])=>`<option value="${n}" ${editing.diversity===n?'selected':''}>${label}</option>`).join('')}</select></label><label class="check-label"><input type="checkbox" name="respectPins" ${editing.respectPins?'checked':''}>고정 상품은 맨 앞에 유지</label><label class="check-label"><input type="checkbox" name="enabled" ${editing.enabled?'checked':''}>점수 기반 정렬 사용</label><button type="submit" class="btn primary">진열 방향 적용</button></form><p class="field-note">작업 지시를 저장한 뒤 AI 작업대에서 세부 규칙을 조정합니다. 이 화면의 문장이 자동으로 태그나 가중치를 생성하지는 않습니다.</p>${button('AI 작업대로 이동','admin-mode','','data-mode="ai"')}</section><section class="operator-summary panel"><h2>현재 초안 상태</h2><dl class="operator-stats"><div><dt>진열 방식</dt><dd>${cfg.enabled?'점수 기반':'기존 고정·수동 순서'}</dd></div><div><dt>점수 규칙</dt><dd>${cfg.rules.length}개 · 조합 ${cfg.combinations.length}개</dd></div><div><dt>사진 검토 완료</dt><dd>${reviews} / ${products.length}개</dd></div><div><dt>추가 확인 필요</dt><dd>${needs}개</dd></div><div><dt>공개본과 검토 내용 다름</dt><dd>${edited}개</dd></div></dl><p>사진·태그 검토와 점수 규칙은 같은 초안에 반영됩니다. 저장 후 고객 초안 미리보기에서 검색·태그·무한 스크롤까지 확인하세요.</p><div class="workspace-actions">${button('사진 검토','open-workbench','','data-workbench-view="photos"')}${button('정렬 결과 비교','open-workbench','','data-workbench-view="results"')}${button('상품 고정·제외 관리','admin-page','','data-page="list"')}${button('배너·안내 배치','admin-page','','data-page="banners"')}</div></section></div><section class="operator-preview panel"><h2>${esc(adminTab)} · 초안 진열 결과</h2><p>공개본과 비교한 순번입니다. 사진을 누르면 해당 상품의 검토 작업대로 이동합니다.</p>${rankPreviewHTML()}</section></div>`;
}
function workbenchHTML(){return `<div class="ai-workbench">${categoryTabsHTML()}${workspaceControlsHTML()}<div class="workbench-tabs" role="group" aria-label="AI 작업대 도구">${[['photos','사진·태그 검토'],['rules','점수 규칙'],['results','결과 비교']].map(([id,label])=>button(label,'workbench-view',workbenchView===id?'active':'',`data-workbench-view="${id}" aria-pressed="${workbenchView===id}"`)).join('')}</div><p class="workbench-guide">${rankingFor().brief?'<strong>작업 지시</strong> '+esc(rankingFor().brief):'사람용 운영 화면에서 진열 방향을 남기거나 여기에서 작업을 시작하세요.'}<br>브라우저 AI 또는 담당자가 실제 사진을 확인하고 태그·규칙을 편집하는 작업대입니다. 자동 이미지 분석은 연결되어 있지 않습니다.</p>${workbenchView==='photos'?photosWorkbenchHTML():workbenchView==='rules'?rulesWorkbenchHTML():resultsWorkbenchHTML()}</div>`;}
function photoProducts(){const effective=effectiveCatalog(catalog,draft),source=poolFor(effective,adminTab),q=workbenchQuery.trim().toLowerCase(),exact=source.some(p=>p.id===q);return source.filter(p=>(!q||(exact?p.id===q:`${p.id} ${p.name} ${Object.values(p.tags||{}).flat().join(' ')}`.toLowerCase().includes(q)))&&(photoReviewFilter==='all'||(draft.productEdits?.[p.id]?.reviewStatus||'unreviewed')===photoReviewFilter));}
function photosWorkbenchHTML(){return `<div class="workbench-toolbar"><label class="field"><span class="field-label">상품 ID·이름·태그 검색</span><input type="search" id="workbench-search" value="${esc(workbenchQuery)}" placeholder="상품 ID·이름·태그 검색"></label><label class="field"><span class="field-label">사진 검토 상태</span><select id="photo-review-filter">${[['all','전체'],...Object.entries(REVIEW_LABELS)].map(([v,label])=>`<option value="${v}" ${photoReviewFilter===v?'selected':''}>${label}</option>`).join('')}</select></label><div><span id="photo-selection-count" role="status">비교 선택 ${compareIds.size} / 4개</span>${button('비교 선택 해제','clear-photo-compare','small')}</div></div><div id="photo-compare">${photoCompareHTML()}</div><div class="photo-workspace"><section class="photo-catalog panel"><h2>사진 목록</h2><div id="photo-grid" class="photo-grid"></div><div id="photo-more"></div></section><section class="photo-inspector panel" aria-label="선택 상품 사진과 태그"><div id="photo-inspector">${photoInspectorHTML()}</div></section></div>`;}
function photoCompareHTML(){if(!compareIds.size)return '';const products=effectiveCatalog(catalog,draft).filter(p=>compareIds.has(p.id));return `<section class="photo-compare panel"><h2>선택 상품 사진 비교</h2><p>사진과 상품 ID를 함께 확인하세요. 각 상품을 누르면 추가 사진과 태그를 검토할 수 있습니다.</p><div class="compare-grid">${products.map(p=>`<article class="compare-card" data-compare-product="${p.id}"><button type="button" data-action="inspect-product" data-id="${p.id}" aria-label="상품 ID ${p.id} 사진·태그 검토"><img src="${esc(p.images[0]||'')}" alt="${esc(p.name)}" loading="lazy"><strong>${esc(p.displayName||p.name)}</strong></button><p>상품 ID ${p.id} · 실제 사진 ${p.images.length}장</p></article>`).join('')}</div></section>`;}
function renderPhotoGrid(){const grid=app.querySelector('#photo-grid');if(!grid)return;const rows=photoProducts();grid.innerHTML=rows.slice(0,photoLimit).map(p=>{const status=draft.productEdits?.[p.id]?.reviewStatus||'unreviewed';return `<article class="photo-card ${inspectedId===p.id?'active':''}" data-photo-product="${p.id}"><label class="photo-compare-check"><input type="checkbox" data-compare-id="${p.id}" ${compareIds.has(p.id)?'checked':''} aria-label="상품 ID ${p.id} 비교 선택">비교 선택</label><button type="button" class="photo-inspect-button" data-action="inspect-product" data-id="${p.id}" aria-label="상품 ID ${p.id} ${esc(p.name)} 사진·태그 검토"><img src="${esc(p.images[0]||'')}" alt="${esc(p.name)}" loading="lazy"><strong>${esc(p.displayName||p.name)}</strong></button><p>상품 ID ${p.id} · ${won(p.price)}</p><span class="visual-review-badge ${status}">${REVIEW_LABELS[status]}</span><p>${p.images.length?'실제 사진 '+p.images.length+'장':'사진 없음'}</p><div class="photo-tag-list">${Object.values(p.tags||{}).flat().map(tag=>`<span>${esc(tag)}</span>`).join('')}</div>${button('크게 보기','open-inspection','small',`data-id="${p.id}" aria-label="상품 ID ${p.id} 사진 크게 보기"`)}</article>`;}).join('')||'<p class="block-empty">이 조건에 맞는 상품이 없습니다.</p>';app.querySelector('#photo-more').innerHTML=`<p class="field-note">${Math.min(photoLimit,rows.length)} / ${rows.length}개 표시</p>${rows.length>photoLimit?button('다음 사진 12개','photo-more','small'):''}`;}
function reviewFormValue(){const form=app.querySelector('#product-review-form');if(!form)return null;const p=catalog.find(p=>p.id===form.dataset.productId);if(!p)return null;const data=new FormData(form),tags={};for(const g of TAG_GROUPS){const selected=data.getAll('tag-'+g.key),original=p.tags?.[g.key]||[];if(JSON.stringify([...selected].sort())!==JSON.stringify([...original].sort()))tags[g.key]=selected;}return {tags,note:String(data.get('note')||''),reviewStatus:String(data.get('reviewStatus'))};}
function photoInspectorHTML(){const p=catalog.find(p=>p.id===inspectedId);if(!p)return '<h2>사진·태그 검토</h2><p class="block-empty">상품 사진을 선택하면 큰 사진과 태그 편집이 열립니다. 비교할 상품은 최대 4개 선택할 수 있습니다.</p>';const edit=reviewEdits.get(p.id)||draft.productEdits?.[p.id]||{tags:{},note:'',reviewStatus:'unreviewed'},tags={...p.tags,...edit.tags};inspectedPhoto=Math.min(inspectedPhoto,Math.max(0,p.images.length-1));return `<h2>${esc(p.displayName||p.name)}</h2><p class="photo-product-id">상품 ID ${p.id} · ${won(p.price)}</p>${p.images.length?`<button type="button" class="inspector-photo-button" data-action="open-inspection" data-id="${p.id}" aria-label="상품 ID ${p.id} 선택 사진 크게 보기"><img id="inspection-photo" class="inspection-photo" src="${esc(p.images[inspectedPhoto])}" alt="${esc(p.name)} 사진 ${inspectedPhoto+1}"></button><div class="photo-thumbnails">${p.images.map((image,i)=>`<button type="button" data-action="inspect-photo" data-index="${i}" aria-label="상품 ID ${p.id} 사진 ${i+1} 보기" aria-pressed="${i===inspectedPhoto}"><img src="${esc(image)}" alt=""></button>`).join('')}</div>`:'<p class="block-warning">사진이 없어 시각 검토를 진행할 수 없습니다.</p>'}<p class="field-note">사진에서 확인한 특징만 태그로 남기세요. 소재·정확한 크기는 상품 정보와 대조하세요. 스타일·크기 태그는 시각 검토용 분류입니다.</p><form id="product-review-form" data-product-id="${p.id}">${TAG_GROUPS.map(g=>`<fieldset class="review-tag-group"><legend>${esc(g.label)}</legend><div class="tab-checks">${g.options.map(t=>`<label class="check-label"><input type="checkbox" name="tag-${g.key}" value="${esc(t)}" ${(tags[g.key]||[]).includes(t)?'checked':''}>${esc(t)}</label>`).join('')}</div></fieldset>`).join('')}<label class="field"><span class="field-label">검토 상태</span><select name="reviewStatus">${Object.entries(REVIEW_LABELS).map(([v,label])=>`<option value="${v}" ${edit.reviewStatus===v?'selected':''}>${label}</option>`).join('')}</select></label><label class="field"><span class="field-label">판단 근거·추가 확인 사항</span><textarea name="note" maxlength="600">${esc(edit.note)}</textarea></label><button type="submit" class="btn primary">사진·태그 검토 적용</button></form>`;}
function selectPhotoProduct(id){if(!catalog.some(p=>p.id===id))return;inspectedId=id;inspectedPhoto=0;view='admin';adminPage='workbench';workbenchView='photos';render();}
function openInspection(id){
 const p=catalog.find(p=>p.id===id);if(!p?.images.length)return toast('확인할 상품 사진이 없습니다.');const index=id===inspectedId?Math.min(inspectedPhoto,p.images.length-1):0;
 openDrawer('상품 ID '+id+' · 사진 검토',`<div class="inspection-full"><img id="inspection-full-image" src="${esc(p.images[index])}" alt="${esc(p.name)} 사진 ${index+1}"><h3>${esc(p.name)}</h3><p>상품 ID ${id} · 실제 사진 ${p.images.length}장</p><div class="photo-thumbnails">${p.images.map((src,i)=>button('사진 '+(i+1),'inspect-full-photo','small',`data-id="${id}" data-index="${i}" aria-pressed="${i===index}"`)).join('')}</div></div>`,true);
}
function ruleEdit(){if(!rankingEdits.has(adminTab)){const cfg=clone(rankingFor());rankingEdits.set(adminTab,{...cfg,comboText:JSON.stringify(cfg.combinations,null,2)});}return rankingEdits.get(adminTab);}
function ruleRowHTML(rule){const group=TAG_GROUPS.find(g=>g.key===rule.group)||TAG_GROUPS[0];return `<div class="ranking-rule-row" data-rule-id="${esc(rule.id)}"><label class="field"><span class="field-label">태그 그룹</span><select name="rule-group">${TAG_GROUPS.map(g=>`<option value="${g.key}" ${g.key===group.key?'selected':''}>${g.label}</option>`).join('')}</select></label><label class="field"><span class="field-label">태그</span><select name="rule-tag">${group.options.map(t=>`<option value="${esc(t)}" ${t===rule.tag?'selected':''}>${esc(t)}</option>`).join('')}</select></label><label class="field"><span class="field-label">가중치 −100~100</span><input name="rule-weight" type="number" min="-100" max="100" step="1" required value="${rule.weight}" aria-label="규칙 ${esc(rule.id)} 가중치"></label>${button('규칙 삭제','remove-ranking-rule','small',`data-rule-id="${esc(rule.id)}" aria-label="규칙 ${esc(rule.id)} 삭제"`)}</div>`;}
function rulesWorkbenchHTML(){const cfg=ruleEdit();return `<div class="ranking-workspace"><section class="ranking-rules panel"><h2>${esc(adminTab)} 점수 규칙</h2><p>일치하는 태그의 점수를 더합니다. 조합 규칙은 모든 조건이 일치할 때 추가합니다. 음수는 감점입니다.</p><form id="ranking-form"><label class="field"><span class="field-label">작업 지시</span><textarea name="brief" maxlength="1200">${esc(cfg.brief)}</textarea></label><div class="block-form-grid"><label class="field"><span class="field-label">다양성 감점 강도 · 0~10</span><input type="number" name="diversity" min="0" max="10" step="1" value="${cfg.diversity}" required></label><div><label class="check-label"><input type="checkbox" name="enabled" ${cfg.enabled?'checked':''}>점수 기반 정렬 사용</label><label class="check-label"><input type="checkbox" name="respectPins" ${cfg.respectPins?'checked':''}>고정 상품 우선</label></div></div><h3>태그별 가중치</h3><div id="rule-rows">${cfg.rules.map(ruleRowHTML).join('')}</div>${button('태그 점수 규칙 추가','add-ranking-rule','small')}<label class="field combo-editor"><span class="field-label">태그 조합 규칙 · JSON 배열</span><textarea name="combinations" spellcheck="false">${esc(cfg.comboText)}</textarea><span class="field-note">예: [{"id":"silver-heart","conditions":[{"group":"color","tag":"실버"},{"group":"motif","tag":"하트"}],"weight":5}]</span></label><button type="submit" class="btn primary">점수 규칙 적용</button></form></section><section class="ranking-summary panel"><h2>점수 계산과 노출</h2><ol><li>카테고리·제외·검색·가격 조건을 적용합니다.</li><li>태그 가중치와 조합 점수, 고객이 선택한 태그 일치 점수를 더합니다.</li><li>다양성 설정에 따라 최근 상품과 비슷한 모티브·형태·스타일에 감점을 적용합니다.</li><li>고정 우선 설정과 동점 기준을 적용한 전체 순서에서 상품을 이어서 표시합니다.</li></ol><p>점수 모드에서는 수동 순서가 동점 기준입니다. 직접 순번을 옮기려면 점수 정렬을 꺼주세요.</p>${button('적용한 결과 비교','workbench-view','','data-workbench-view="results"')}<div id="ranking-live-summary" class="field-note">입력 중인 규칙은 적용 버튼을 누를 때 초안에 반영됩니다.</div></section></div>${batchWorkbenchHTML()}`;}
function readRankingForm(){const form=app.querySelector('#ranking-form');if(!form)return ruleEdit();const data=new FormData(form);return {enabled:data.has('enabled'),brief:String(data.get('brief')),respectPins:data.has('respectPins'),diversity:data.get('diversity')===''?NaN:Number(data.get('diversity')),rules:[...form.querySelectorAll('.ranking-rule-row[data-rule-id]')].map(row=>({id:row.dataset.ruleId,group:row.querySelector('[name=rule-group]').value,tag:row.querySelector('[name=rule-tag]').value,weight:row.querySelector('[name=rule-weight]').value===''?NaN:Number(row.querySelector('[name=rule-weight]').value)})),comboText:String(data.get('combinations'))};}
function batchWorkbenchHTML(){return `<section class="ai-batch panel"><h2>AI 작업 묶음</h2><p>사진 검토 결과와 점수 규칙을 한 번에 제안할 수 있습니다. 현재 카테고리의 상품 ID와 태그를 사용하고, 검증 결과를 확인한 뒤 초안에 적용하세요.</p><div class="workspace-actions">${button('현재 초안으로 작업 양식 만들기','prepare-ai-batch','small')}${button('상품·사진 작업 자료 JSON','export-workbench','small')}</div><label class="field"><span class="field-label">작업 JSON · version, tab, summary, ranking 또는 productEdits</span><textarea id="ai-batch-json" spellcheck="false" placeholder="작업 양식을 만들거나 AI가 작성한 JSON을 붙여넣으세요.">${esc(batchText)}</textarea></label><div class="workspace-actions">${button('작업 묶음 검증','validate-ai-batch')}${button('검증한 작업 초안 적용','apply-ai-batch','primary',validatedBatch?'':'disabled')}</div><div id="batch-preview" class="batch-preview" role="status">${validatedBatch?esc(validatedBatch.description):'아직 검증한 작업이 없습니다.'}</div></section>`;}
function resultsWorkbenchHTML(){const products=workspaceList(draft),old=workspaceList(published),cfg=rankingFor();return `<section class="ranking-results panel"><h2>공개본과 초안 결과 비교</h2><p>전체 ${products.length}개 · ${cfg.enabled?'점수 정렬 적용':'기존 진열 적용'} · 사진을 누르면 검토 화면으로 이동합니다. 점수는 설정한 진열 규칙의 계산 결과이며 판매 예측값이 아닙니다.</p><div class="workspace-actions" role="group" aria-label="진열 결과 비교 방식">${[['draft','초안'],['published','공개본'],['side','나란히 비교']].map(([id,label])=>button(label,'rank-result-view',resultView===id?'accent':'',`data-result-view="${id}" aria-pressed="${resultView===id}"`)).join('')}</div>${resultView==='side'?`<div class="rank-comparison"><section data-result-copy="published"><h3>현재 공개본</h3>${rankPreviewHTML(published,resultLimit,old)}</section><section data-result-copy="draft"><h3>편집 중인 초안</h3>${rankPreviewHTML(draft,resultLimit,products)}</section></div>`:`<div data-result-copy="${resultView}">${rankPreviewHTML(resultView==='published'?published:draft,resultLimit,resultView==='published'?old:products)}</div>`}${resultLimit<Math.max(products.length,old.length)?button('다음 결과 12개','ranking-results-more','small'):''}</section>`;}
function workspaceParts(config=draft){return {ranking:clone(config.ranking||Object.fromEntries(TABS.map(t=>[t,defaultRanking()]))),productEdits:clone(config.productEdits||{})};}
function resetWorkspaceHistory(){workspacePast.length=0;workspaceFuture.length=0;directionEdits.clear();rankingEdits.clear();reviewEdits.clear();compareIds.clear();inspectedId=null;validatedBatch=null;workspaceRevision++;workspaceResult='구성을 새로 불러왔습니다. 작업 지시와 검토 상태를 확인하세요.';}
function mutateWorkspace(parts,message,ids=[]){const before=workspaceParts(),next=validateConfig({...clone(draft),...parts},catalog),after=workspaceParts(next),changed=JSON.stringify(before)!==JSON.stringify(after);if(changed){workspacePast.push({before,after,tab:adminTab,ids});if(workspacePast.length>20)workspacePast.shift();workspaceFuture.length=0;workspaceRevision++;draft.ranking=next.ranking;draft.productEdits=next.productEdits;}validatedBatch=null;for(const t of TABS)if(JSON.stringify(before.ranking[t])!==JSON.stringify(after.ranking[t])){directionEdits.delete(t);rankingEdits.delete(t);}ids.forEach(id=>reviewEdits.delete(id));workspaceResult=`${adminTab} · ${ids.length?'상품 ID '+ids.slice(0,6).join(', ')+(ids.length>6?' 외 '+(ids.length-6)+'개':'')+' · ':''}${changed?message:'변경 없음 · 현재 초안과 같습니다.'}`;markDirty();render();toast(workspaceResult);}
function replayWorkspace(redo=false){const source=redo?workspaceFuture:workspacePast,target=redo?workspacePast:workspaceFuture,entry=source.pop();if(!entry)return;Object.assign(draft,clone(redo?entry.after:entry.before));target.push(entry);adminTab=entry.tab;directionEdits.clear();rankingEdits.clear();reviewEdits.clear();validatedBatch=null;workspaceRevision++;workspaceResult=`${adminTab} · ${entry.ids.length?'상품 ID '+entry.ids.slice(0,6).join(', ')+' · ':''}${redo?'작업을 다시 적용했습니다.':'직전 사진·규칙 작업을 취소했습니다.'}`;markDirty();render();toast(workspaceResult);}
function stageBatch(){
 if(batchText.length>1500000)throw Error('작업 JSON은 1.5MB 이하여야 합니다.');const value=JSON.parse(batchText);
 if(!value||value.version!==1||value.tab!==adminTab||typeof value.summary!=='string'||!value.summary.trim()||value.summary.length>400)throw Error('version 1, 현재 카테고리 tab, 400자 이내 summary를 확인하세요.');
 if(Object.keys(value).some(key=>!['version','tab','summary','ranking','productEdits'].includes(key))||(!value.ranking&&!Array.isArray(value.productEdits)))throw Error('ranking 또는 productEdits 작업을 포함하세요.');
 const parts=workspaceParts();if(value.ranking)parts.ranking[adminTab]=normalizeRanking(value.ranking);
 const patches=value.productEdits??[];if(!Array.isArray(patches)||patches.length>catalog.length)throw Error('productEdits는 상품 검토 배열이어야 합니다.');const ids=new Set(),allowed=new Set(poolFor(catalog,adminTab).map(p=>p.id));
 for(const edit of patches){if(!edit||typeof edit.id!=='string'||ids.has(edit.id)||!allowed.has(edit.id))throw Error('상품 ID가 중복되거나 현재 카테고리 목록에 없습니다.');if(Object.keys(edit).some(k=>!['id','tags','note','reviewStatus'].includes(k)))throw Error('상품 검토에는 id, tags, note, reviewStatus만 사용하세요.');ids.add(edit.id);if(Object.hasOwn(edit,'tags')&&(!edit.tags||typeof edit.tags!=='object'||Array.isArray(edit.tags)))throw Error('tags는 그룹별 태그 배열이어야 합니다.');const {id,...patch}=edit,previous=parts.productEdits[id]||{tags:{},note:'',reviewStatus:'unreviewed'};parts.productEdits[id]={...previous,...patch,tags:patch.tags?{...previous.tags,...patch.tags}:previous.tags};}
 const normalized=workspaceParts(validateConfig({...clone(draft),...parts},catalog));return {text:batchText,tab:adminTab,base:JSON.stringify(workspaceParts()),parts:normalized,ids:[...ids],description:`${value.summary.trim()} · ${adminTab} · 검토 상품 ${ids.size}개 · 태그 규칙 ${normalized.ranking[adminTab].rules.length}개 · 조합 ${normalized.ranking[adminTab].combinations.length}개`};
}
function applyBatch(){if(!validatedBatch||validatedBatch.text!==batchText||validatedBatch.tab!==adminTab||validatedBatch.base!==JSON.stringify(workspaceParts()))throw Error('작업 내용이나 초안이 바뀌었습니다. 작업 묶음을 다시 검증하세요.');const staged=validatedBatch;mutateWorkspace(staged.parts,staged.description,staged.ids);}
function updateWorkspaceInput(t){
 if(t.closest('#direction-form')){const f=t.closest('form'),d=new FormData(f);directionEdits.set(adminTab,{...rankingFor(),brief:String(d.get('brief')),diversity:Number(d.get('diversity')),enabled:d.has('enabled'),respectPins:d.has('respectPins')});}
 if(t.closest('#product-review-form'))reviewEdits.set(t.closest('form').dataset.productId,reviewFormValue());
 if(t.closest('#ranking-form')){if(t.name==='rule-group'){const row=t.closest('[data-rule-id]'),group=TAG_GROUPS.find(g=>g.key===t.value);row.querySelector('[name=rule-tag]').innerHTML=group.options.map(tag=>`<option>${esc(tag)}</option>`).join('');}rankingEdits.set(adminTab,readRankingForm());}
 if(t.id==='ai-batch-json'){batchText=t.value;validatedBatch=null;const apply=app.querySelector('[data-action=apply-ai-batch]');if(apply)apply.disabled=true;app.querySelector('#batch-preview').textContent='입력이 바뀌었습니다. 작업 묶음을 다시 검증하세요.';}
 if(t.id==='workbench-search'){workbenchQuery=t.value;photoLimit=12;renderPhotoGrid();}
}
function blockLocation(b){return BLOCK_ZONES[b.zone]+(b.zone==='feed'?' · '+(b.placement==='product'?`상품 ${b.anchorId} ${b.anchorSide==='before'?'앞':'뒤'}`:`상품 ${b.after}개 뒤`):'');}
function adminBannersHTML(){
 return `<div class="block-toolbar"><div>${button('실행 취소','undo-blocks','',blockPast.length?'':'disabled')}${button('다시 실행','redo-blocks','',blockFuture.length?'':'disabled')}</div><span>블록 ${draft.banners.length} / 100개 · 변경 적용 후 초안을 저장하세요.</span></div><p id="block-result" class="block-result" role="status" aria-live="polite" data-revision="${blockRevision}">${esc(blockResult)}</p><div class="block-workspace"><section class="block-library panel" aria-label="콘텐츠 블록 목록"><h2>블록 추가</h2><div class="block-add-buttons">${Object.entries(BLOCK_TYPES).map(([type,label])=>button(icon('plus')+label,'add-banner','small',`data-type="${type}"`)).join('')}</div><h2>배치한 블록</h2><p class="field-note">같은 위치에서는 위 순서대로 표시합니다. 다른 위치의 블록은 각자의 배치를 따릅니다.</p><div class="block-list">${draft.banners.map((value,i)=>{const b=normalizeContentBlock(value),attrs=`data-id="${esc(b.id)}"`;const actionButton=(label,action,extra='')=>button(label,action,'small',`${attrs} aria-label="블록 ${esc(b.id)} ${label}" ${extra}`);return `<article class="block-list-item ${blockSelection===b.id?'active':''}" data-block-id="${esc(b.id)}" draggable="true"><div class="block-item-header"><strong>${esc(b.title)}</strong><span>${b.enabled?'노출':'숨김'}</span></div><p class="block-item-meta">${esc(BLOCK_TYPES[b.type])} · ${esc(blockLocation(b))}<br>${esc(b.tabs.join(' / '))}<br><code>${esc(b.id)}</code></p><div class="block-priority"><label>우선순위 <input type="number" min="1" max="${draft.banners.length}" value="${i+1}" data-block-rank="${esc(b.id)}" aria-label="블록 ${esc(b.id)} 우선순위"></label>${actionButton('순위 적용','apply-block-rank')}${actionButton('위로','move-block-up',i===0?'disabled':'')}${actionButton('아래로','move-block-down',i===draft.banners.length-1?'disabled':'')}</div><div class="block-item-actions">${actionButton('편집','edit-banner')}${actionButton(b.enabled?'숨기기':'노출하기','toggle-banner')}${actionButton('복제','duplicate-banner')}${actionButton('삭제','delete-banner')}</div></article>`;}).join('')||'<p class="block-empty">아직 배치한 블록이 없습니다. 필요한 콘텐츠를 추가하세요.</p>'}</div></section><section class="block-canvas panel" aria-label="페이지 배치 미리보기"><div class="block-device-bar"><h2>배치 미리보기</h2><div>${button('PC','block-preview-pc','small',`aria-pressed="${blockPreviewDevice==='pc'}"`)}${button('모바일','block-preview-mobile','small',`aria-pressed="${blockPreviewDevice==='mobile'}"`)}</div></div><div class="studio-tabs" role="group" aria-label="블록 미리보기 카테고리">${TABS.map(t=>button(t,'admin-tab',adminTab===t?'active small':'small',`data-tab="${t}" aria-pressed="${adminTab===t}"`)).join('')}</div><p class="field-note">${esc(adminTab)} · 실제 초안의 상품 순서입니다. 블록을 선택한 뒤 ‘여기에 배치’를 누르거나 목록에서 끌어오세요. 적용 전 입력도 미리 보입니다.</p><div class="block-preview-viewport ${blockPreviewDevice==='mobile'?'is-mobile':''}" data-device="${blockPreviewDevice}"><div id="block-preview-layout"></div></div><div id="block-preview-more"></div></section><section class="block-properties panel" aria-label="선택한 블록 속성">${blockEditorHTML()}</section></div>`;
}
function blockEditorHTML(){
 const b=blockEditing;if(!b)return '<h2>블록 속성</h2><p class="block-empty">왼쪽에서 블록을 추가하거나 배치 미리보기에서 편집할 블록을 선택하세요.</p>';
 const input=(name,label,type='text',extra='')=>`<label class="field"><span class="field-label">${label}</span><input name="${name}" type="${type}" value="${esc(b[name])}" ${extra}></label>`;
 const select=(name,label,options)=>`<label class="field"><span class="field-label">${label}</span><select name="${name}">${Object.entries(options).map(([v,t])=>`<option value="${v}" ${String(b[name])===v?'selected':''}>${t}</option>`).join('')}</select></label>`;
 const check=(name,label)=>`<label class="check-label"><input type="checkbox" name="${name}" ${b[name]?'checked':''}>${label}</label>`;
 return `<h2>${draft.banners.some(x=>x.id===b.id)?'블록 편집':'새 블록'}</h2><p class="field-note">ID <code>${esc(b.id)}</code> · 입력은 적용 버튼을 누를 때 초안에 반영됩니다.</p><form id="banner-form" data-banner-id="${esc(b.id)}">${select('type','콘텐츠 유형',BLOCK_TYPES)}${input('title','제목 · 여백/구분선은 관리용 이름','text','required maxlength="160"')}<div data-block-types="editorial notice text"><label class="field"><span class="field-label">설명</span><textarea name="subtitle" maxlength="300">${esc(b.subtitle)}</textarea></label>${input('tag','작은 라벨','text','maxlength="70"')}</div><div data-block-types="editorial image">${input('image','이미지 주소 · https 또는 업로드')}<label class="field"><span class="field-label">이미지 파일 · PNG/JPEG/WebP 800KB 이하</span><input type="file" id="banner-image-file" accept="image/png,image/jpeg,image/webp"></label><div class="block-form-grid">${select('imageFit','이미지 맞춤',{cover:'영역 채우기',contain:'이미지 전체 보기'})}${select('imageRatio','이미지 비율',{auto:'원본 비율','3/4':'3:4','1/1':'1:1','16/9':'16:9','21/9':'21:9'})}</div></div><div data-block-types="editorial notice image text">${input('link','이동 링크 · 선택 사항','url','placeholder="https://…"')}</div><h3>배치</h3>${select('zone','페이지 영역',BLOCK_ZONES)}<div data-feed-options>${select('placement','위치 기준',{count:'상품 개수',product:'특정 상품 ID'})}<div data-count-options>${input('after','상품 몇 개 뒤 · 0이면 목록 시작','number','min="0" max="100000" step="1" required')}${select('overflow','상품이 지정 개수보다 적을 때',{hide:'이 블록 숨기기',end:'목록 끝에 표시'})}</div><div data-anchor-options>${input('anchorId','기준 상품 ID','text','inputmode="numeric" pattern="[1-9][0-9]*"')}${select('anchorSide','기준 상품과의 위치',{before:'상품 앞',after:'상품 뒤'})}<p class="field-note">해당 상품이 제외되거나 검색 결과에 없으면 블록도 숨깁니다.</p></div></div><div class="block-form-grid">${select('widthPc','PC 너비',{'1':'1칸','2':'2칸',full:'전체 폭'})}${select('widthMobile','모바일 너비',{'1':'1칸','2':'2칸',full:'전체 폭'})}</div>${check('newRow','새 행에서 시작')}<h3>모양</h3>${select('tone','기본 색상',{cream:'라이트 세이지',ink:'잉크 블랙',blush:'뮤트 블러시'})}<div class="block-form-grid">${input('background','배경색','color')}${input('textColor','글자색','color')}${input('padding','안쪽 여백 · px','number','min="0" max="64" step="1" required')}${input('radius','모서리 · px','number','min="0" max="48" step="1" required')}</div>${select('align','문구 정렬',{left:'왼쪽',center:'가운데',right:'오른쪽'})}<h3>노출</h3><div class="tab-checks">${TABS.map(t=>`<label class="check-label"><input type="checkbox" name="tabs" value="${t}" ${b.tabs.includes(t)?'checked':''}>${t}</label>`).join('')}</div>${check('showWhenFiltered','검색·소재·찜·태그 조건 적용 중에도 표시')}${check('enabled','노출하기')}<div id="block-editor-warning" class="block-warning" role="status"></div><div class="block-editor-actions"><button type="submit" class="btn primary">블록 변경 적용</button>${button('편집 닫기','cancel-block')}</div><h3>선택 블록 미리보기</h3><div id="block-live-preview"></div></form>`;
}
function newBlockId(){return 'block-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9));}
function bannerEditor(id,type='editorial'){
 if(id&&blockEditing?.id===id)return render();
 const old=draft.banners.find(b=>b.id===id);blockSelection=old?.id||null;
 blockEditing=old?normalizeContentBlock(old):{id:newBlockId(),type:BLOCK_TYPES[type]?type:'editorial',title:'새 '+(BLOCK_TYPES[type]||'블록'),subtitle:'',tag:'',after:4,span:2,tabs:[adminTab],enabled:true,tone:'cream',image:'',link:'',zone:'feed',placement:'count',anchorId:'',anchorSide:'after',overflow:'hide',widthPc:['notice','text','spacer','divider'].includes(type)?'full':'2',widthMobile:'full',newRow:false,showWhenFiltered:false,background:'#eef0e6',textColor:'#171918',padding:20,radius:0,align:'left',imageFit:'cover',imageRatio:'auto'};
 render();
}
function readBlockForm(){
 const form=app.querySelector('#banner-form');if(!form)return null;const data=new FormData(form),value={...blockEditing,id:form.dataset.bannerId};
 for(const key of ['type','title','subtitle','tag','zone','placement','anchorId','anchorSide','overflow','widthPc','widthMobile','tone','background','textColor','align','imageFit','imageRatio','image','link'])value[key]=String(data.has(key)?data.get(key):value[key]??'');
 for(const key of ['after','padding','radius'])value[key]=data.get(key)===null?value[key]:data.get(key)===''?NaN:Number(data.get(key));
 for(const key of ['enabled','newRow','showWhenFiltered'])value[key]=data.has(key);value.tabs=data.getAll('tabs');
 for(const key of ['title','image','link','anchorId'])value[key]=value[key].trim();if(value.zone!=='feed')value.placement='count';
 if(value.zone!=='feed'||value.placement!=='count'){if(!Number.isSafeInteger(value.after)||value.after<0||value.after>100000)value.after=0;}
 if(value.zone!=='feed'||value.placement!=='product'){if(value.anchorId&&!/^[1-9][0-9]*$/.test(value.anchorId))value.anchorId='';}
 return value;
}
function normalizedEditing(){try{return blockEditing?normalizeContentBlock(blockEditing):null;}catch{return null;}}
function syncBlockEditor(){
 if(!app.querySelector('#block-preview-layout'))return;
 const b=blockEditing,form=app.querySelector('#banner-form');
 if(form&&b){form.querySelectorAll('[data-block-types]').forEach(el=>el.hidden=!el.dataset.blockTypes.split(' ').includes(b.type));form.querySelector('[data-feed-options]').hidden=b.zone!=='feed';form.querySelector('[data-count-options]').hidden=b.placement!=='count';form.querySelector('[data-anchor-options]').hidden=b.placement!=='product';form.elements.after.disabled=b.zone!=='feed'||b.placement!=='count';form.elements.anchorId.disabled=b.zone!=='feed'||b.placement!=='product';form.elements.anchorId.required=b.zone==='feed'&&b.placement==='product';
  const normalized=normalizedEditing();form.querySelector('#block-live-preview').innerHTML=normalized?bannerHTML(normalized):'<p class="block-empty">제목·이미지·위치를 입력하면 미리보기가 나타납니다.</p>';
  let warning='';try{normalizeContentBlock(b);}catch(error){warning=error.message;}
  if(!warning&&!b.tabs.includes(adminTab))warning='이 블록은 현재 미리보기 카테고리에 표시되지 않습니다.';
  if(!warning&&!b.enabled)warning='숨김 상태입니다. 아래 단독 미리보기에서 모양만 확인할 수 있습니다.';
  if(!warning&&normalized?.zone==='feed'){const position=blockPosition(workspaceList(draft),normalized);if(position===null)warning=b.placement==='product'?'기준 상품이 현재 진열에 없어 이 블록은 숨겨집니다.':'상품 수가 지정한 위치보다 적어 이 블록은 숨겨집니다.';else if(position>Math.min(60,blockPreviewLimit))warning='펼친 상품 범위 뒤에 배치됩니다. 숫자 위치는 적용되며 고객 초안 미리보기에서 이어서 확인할 수 있습니다.';}
  form.querySelector('#block-editor-warning').textContent=warning;
 }
 renderBlockPreview();
}
function updateBlockInput(target){
 if(!target.closest('#banner-form')||target.type==='file')return;blockEditing=readBlockForm();
 if(target.name==='tone'){const colors={ink:['#252a21','#ffffff'],cream:['#eef0e6','#171918'],blush:['#e9dcd6','#171918']}[target.value];if(colors){[blockEditing.background,blockEditing.textColor]=colors;const f=app.querySelector('#banner-form');f.elements.background.value=colors[0];f.elements.textColor.value=colors[1];}}
 if(target.name==='zone'&&blockEditing.zone!=='feed')app.querySelector('#banner-form').elements.placement.value='count';syncBlockEditor();
}
function previewBlockHTML(b){return `<div class="block-preview-item block-preview-selected-wrapper block-width-pc-${b.widthPc} block-width-mobile-${b.widthMobile}${b.newRow?' block-new-row':''}"><button type="button" class="block-preview-caption ${blockSelection===b.id?'block-preview-selected':''}" data-action="edit-banner" data-id="${esc(b.id)}" data-preview-block="${esc(b.id)}" aria-label="블록 ${esc(b.id)} ${esc(b.title)} 편집">${esc(b.title)} · ${esc(b.id)}${blockEditing?.id===b.id?' · 편집 중':''}</button>${bannerHTML(b)}</div>`;}
function renderBlockPreview(){
 const layout=app.querySelector('#block-preview-layout');if(!layout)return;const items=workspaceList(draft),temp=normalizedEditing();let banners=draft.banners;
 if(temp)banners=banners.some(b=>b.id===temp.id)?banners.map(b=>b.id===temp.id?temp:b):[...banners,temp];
 const zoneHTML=zone=>{const blocks=blocksForZone(items,banners,adminTab,zone);return `<section class="block-preview-zone" data-block-zone="${zone}"><p class="block-preview-zone-label">${BLOCK_ZONES[zone]}${blocks.length?'':'<span>블록 없음</span>'}</p>${blocks.length?`<div class="block-preview-grid">${blocks.map(previewBlockHTML).join('')}</div>`:''}</section>`;};
 let seen=0,nodes=[];const place=n=>button(`상품 ${n}개 뒤에 배치`,'place-block','block-placement-target small',`data-after="${n}" ${blockSelection||blockEditing?'':'disabled'} aria-label="선택 블록을 상품 ${n}개 뒤에 배치"`);
 nodes.push(`<div class="block-placement-start">${place(0)}</div>`);
 for(const b of composeFeed(items,banners,adminTab)){if(b.kind==='banner'){nodes.push(previewBlockHTML(b.data));continue;}if(seen>=Math.min(60,blockPreviewLimit))break;seen++;const p=b.data;nodes.push(`<div class="block-preview-cell"><article class="block-preview-item"><img src="${esc(p.images[0]||'')}" alt="${esc(p.name)}" loading="lazy"><div class="block-preview-caption">${seen}. ${esc(p.displayName||p.name)}<br>상품 ID ${p.id}</div></article>${place(seen)}</div>`);}
 layout.innerHTML=zoneHTML('top')+'<div class="block-preview-zone-label">로고 · 검색 · 카테고리</div>'+zoneHTML('after-tabs')+zoneHTML('before-feed')+`<section class="block-preview-zone" data-block-zone="feed"><p class="block-preview-zone-label">상품 사이</p><div class="block-preview-grid">${nodes.join('')}</div></section>`+zoneHTML('bottom');
 app.querySelector('#block-preview-more').innerHTML=`<p class="field-note">상품 ${seen} / ${items.length.toLocaleString('ko-KR')}개 표시 · 배치 편집에서는 최대 60개를 펼칩니다. 더 뒤의 위치는 숫자나 상품 ID로 지정하세요.</p>${seen<Math.min(60,items.length)?button('다음 상품 펼치기','block-preview-more','small'):''}`;
 bindBlockDrag();
}
function resetBlockHistory(){resetWorkspaceHistory();blockPast.length=0;blockFuture.length=0;blockSelection=null;blockEditing=null;blockRevision++;blockResult='초안을 새로 불러왔습니다. 블록을 선택해 편집하세요.';}
function mutateBlocks(fn,message,ids=[]){
 const before=clone(draft.banners);fn();const after=clone(draft.banners),changed=JSON.stringify(before)!==JSON.stringify(after);
 if(changed){blockPast.push({before,after,ids});if(blockPast.length>20)blockPast.shift();blockFuture.length=0;blockRevision++;}
 if(blockSelection&&!draft.banners.some(b=>b.id===blockSelection)){blockSelection=null;blockEditing=null;}
 else if(blockSelection&&blockEditing?.id!==blockSelection)blockEditing=normalizeContentBlock(draft.banners.find(b=>b.id===blockSelection));
 blockResult=`${ids.length?'블록 '+ids.join(', ')+' · ':''}${changed?message:'변경 없음 · 현재 설정과 같습니다.'}`;markDirty();render();toast(blockResult);
}
function replayBlocks(redo=false){const entry=(redo?blockFuture:blockPast).pop();if(!entry)return;(redo?blockPast:blockFuture).push(entry);draft.banners=clone(redo?entry.after:entry.before);blockSelection=null;blockEditing=null;blockRevision++;blockResult=`${entry.ids.length?'블록 '+entry.ids.join(', ')+' · ':''}${redo?'블록 변경을 다시 적용했습니다.':'블록 변경을 취소했습니다.'}`;markDirty();render();toast(blockResult);}
function moveBlock(id,position){const index=draft.banners.findIndex(b=>b.id===id);if(index<0||!Number.isSafeInteger(position)||position<0||position>=draft.banners.length)return toast('유효한 블록 우선순위를 입력하세요.');mutateBlocks(()=>{const [b]=draft.banners.splice(index,1);draft.banners.splice(position,0,b);},'우선순위를 변경했습니다.',[id]);}
function placeBlock(after,id=blockSelection){
 if(!Number.isSafeInteger(after)||after<0||after>100000)return;
 if(!id&&blockEditing){Object.assign(blockEditing,{zone:'feed',placement:'count',after});return render();}
 const b=draft.banners.find(b=>b.id===id);if(!b)return;blockSelection=id;
 if(blockEditing?.id===id)Object.assign(blockEditing,{zone:'feed',placement:'count',after});
 mutateBlocks(()=>Object.assign(b,{zone:'feed',placement:'count',after}),`상품 ${after}개 뒤에 배치했습니다.`,[id]);
}
function bindBlockDrag(){
 app.querySelectorAll('[data-block-id]').forEach(row=>{row.addEventListener('dragstart',event=>{if(event.target.closest('input,button'))return event.preventDefault();event.dataTransfer.setData('application/x-pinkrocket-block',row.dataset.blockId);event.dataTransfer.effectAllowed='move';});});
 app.querySelectorAll('[data-action="place-block"]').forEach(target=>{target.addEventListener('dragover',event=>{if(!Array.from(event.dataTransfer.types).includes('application/x-pinkrocket-block'))return;event.preventDefault();target.classList.add('is-drop-target');});target.addEventListener('dragleave',()=>target.classList.remove('is-drop-target'));target.addEventListener('drop',event=>{event.preventDefault();target.classList.remove('is-drop-target');placeBlock(Number(target.dataset.after),event.dataTransfer.getData('application/x-pinkrocket-block'));});});
}
function adminHistoryHTML(){return `<div class="studio-toolbar" style="margin-bottom:1.2rem">${button('구성 JSON 내보내기','export-config')}${button('구성 JSON 가져오기','import-config')}${button('초안 불러오기','load-draft')}<input type="file" id="config-file" class="file-input" accept="application/json"></div><div class="history-list">${history.length?history.map(h=>`<section class="panel history-item"><div><h3>${esc(h.label)}</h3><p>${new Date(h.time).toLocaleString('ko-KR')} · ${h.type==='published'?'목업 공개본':'저장한 초안'}</p></div>${button('이 구성을 초안으로 복구','restore-history','','data-id="'+h.id+'"')}</section>`).join(''):'<section class="panel guide-step"><h2>아직 저장된 이력이 없습니다.</h2><p>초안을 저장하거나 목업에 공개하면 최근 8개의 구성이 여기에 남습니다.</p></section>'}</div>`;}
function browserGuideHTML(){return `<section class="panel browser-admin-guide"><h2>브라우저로 진열 편집하기</h2><ol><li>카테고리와 전체 진열·상단 고정·제외 상태를 선택합니다. 상품 ID를 검색하면 해당 상품만 찾을 수 있습니다.</li><li>행의 상품 ID와 버튼 이름에 포함된 ID를 맞춰 대상을 확인합니다. 순번 입력 후 ‘이동’ 또는 Enter로 적용하고, 고정·제외·복원 버튼으로 드래그 없이 편집할 수 있습니다.</li><li>일괄 작업 전에 선택 개수와 ‘현재 화면 밖’ 개수를 확인합니다. ‘표시 상품 전체 선택’은 현재 표시된 행만 선택합니다.</li><li>순번은 검색 전 전체 진열 기준이며, 고정·일반 구간 안에서 이동합니다. 작업 후 위의 처리 결과와 해당 행의 순번·상태를 확인합니다.</li><li>실행 취소·다시 실행은 최근 진열 편집 20단계를 처리합니다. 초안 불러오기·구성 가져오기·이력 복구·목업 공개 시 실행 취소 기록이 초기화됩니다.</li><li>초안 저장 후 미리보기로 확인합니다. ‘목업에 공개’는 별도 동작이며, 실제 메이크샵 진열은 변경하지 않습니다.</li></ol><p>현재 주소에는 편집 카테고리·화면·상태·검색 조건이 담깁니다. 편집 내용은 주소에 담기지 않으므로 이동 전 초안을 저장하세요. 초안과 목업 공개본은 이 브라우저에만 저장됩니다.</p></section>`;}
function guideHTML(){return `<div class="guide-grid">${[['01','상품은 메이크샵에서','대표님 공개 저장소의 상품 2,449개 중 이름·가격이 없는 70개를 제외한 2,379개를 사용합니다. 10/13 수집본이며 실시간 갱신은 연결 전입니다. 분류·소재 태그를 가져왔고 미분류 상품 38개는 전체 목록에서 확인할 수 있습니다.'],['02','탐색은 새로운 프론트에서','카테고리 탭, 소재 필터, 검색, 정렬, 상품 추가 표시와 3:4 카드 슬라이드를 체험합니다. 전체 수집본에서 상품을 이어서 표시합니다. 신상순은 등록일이 없는 시연 정렬입니다.'],['03','진열은 운영 스튜디오에서','자동 정렬과 별개로 순서를 옮기고, 상단에 고정하고, 상품을 제외할 수 있습니다. 배너는 상품 몇 개 뒤에 넣을지 지정합니다.'],['04','확인 후 목업에 공개','초안은 공개본과 분리됩니다. 미리보기로 확인한 뒤 목업에 공개하세요. 브라우저 저장만 사용하며 같은 브라우저의 탭 사이에 공유됩니다.'],['05','구매는 기존 상세로','상품 미리보기의 ‘메이크샵 상세 열기’로 실제 상세에 이동합니다. 이 사이트 안의 찜·장바구니는 데모이며 실제 메이크샵 계정에는 반영되지 않습니다.'],['06','브라우저 자동화에 맞게','상품 ID, 이름이 있는 버튼, 순번 입력과 일괄 동작을 제공합니다. 드래그 없이도 목록을 편집할 수 있습니다. 실제 운영에는 로그인·권한·공유 저장소를 연결해야 합니다.']].map(([n,t,p])=>`<section class="panel guide-step"><div class="num">${n}</div><h2>${t}</h2><p>${p}</p></section>`).join('')}</div>`;}

function openDrawer(title,html,wide=false){clearTimeout(nativeDetailTimer);lastFocus=document.activeElement;overlay.innerHTML=`<div class="overlay-backdrop" data-dismiss><section class="drawer ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="drawer-header"><h2>${esc(title)}</h2><button class="close-button" data-action="close" aria-label="닫기">${icon('close')}</button></div>${html}</section></div>`;document.body.style.overflow='hidden';overlay.querySelector('button,input,select,a,textarea')?.focus();}
function closeOverlay(){clearTimeout(nativeDetailTimer);overlay.innerHTML='';document.body.style.overflow='';lastFocus?.isConnected&&lastFocus.focus();}
function openQuickview(id){
 const p=catalog.find(p=>p.id===id);if(!p)return;
 if(makeshopBridge.enabled)return makeshopBridge.request('product',id);
 const platform=window.innerWidth<768?'mobile':'pc',canonical=makeshopDetailUrl(id,platform);if(!canonical)return;
 const target=new URL(canonical),url=new URL(target.pathname+target.search,'https://pink-rocket.com').href;
 openDrawer('상품 상세',`<div class="native-detail-toolbar"><a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">새 창에서 열기 ↗</a><p data-detail-status role="status">메이크샵 상세를 불러오는 중입니다.</p></div><iframe class="native-product-frame" title="메이크샵 실제 상품 상세 · ${esc(p.name)}" src="${esc(url)}" referrerpolicy="strict-origin-when-cross-origin"></iframe>`,true);
 overlay.querySelector('.drawer').classList.add('native-detail-drawer');
 const frame=overlay.querySelector('.native-product-frame'),status=overlay.querySelector('[data-detail-status]');
 const note=message=>{if(frame.isConnected&&overlay.contains(frame))status.textContent=message;};
 nativeDetailTimer=setTimeout(()=>note('상세 표시가 지연되면 새 창에서 열기를 이용하세요.'),12000);
 frame.addEventListener('load',()=>{if(!frame.isConnected||!overlay.contains(frame))return;clearTimeout(nativeDetailTimer);note('실제 메이크샵 상세입니다. 로그인이나 화면 표시가 제한되면 새 창에서 열기를 이용하세요.');});
 frame.addEventListener('error',()=>{if(!frame.isConnected||!overlay.contains(frame))return;clearTimeout(nativeDetailTimer);note('상세를 불러오지 못했습니다. 새 창에서 열기를 이용하세요.');});
}
function openCart(){if(makeshopBridge.enabled)return makeshopBridge.request('cart');openDrawer('장바구니 · 로컬 데모',`<div class="demo-note">이 브라우저의 목업 장바구니입니다. 실제 주문·결제는 연결하지 않았습니다.</div>${cart.length?cart.map(item=>{const p=catalog.find(p=>p.id===item.id);if(!p)return '';return `<div class="cart-item"><img src="${esc(p.images[0])}" alt=""><div class="cart-info"><p>${esc(p.displayName||p.name)}</p><p>${won(p.price)}</p><div class="quantity"><button data-action="cart-minus" data-id="${item.id}" aria-label="수량 줄이기">−</button><span>${item.quantity}</span><button data-action="cart-plus" data-id="${item.id}" aria-label="수량 늘리기">+</button><button data-action="cart-remove" data-id="${item.id}" aria-label="${esc(p.name)} 삭제">×</button></div></div></div>`;}).join('')+`<div class="cart-footer"><span>데모 합계</span><strong>${won(cart.reduce((sum,item)=>sum+(catalog.find(p=>p.id===item.id)?.price||0)*item.quantity,0))}</strong></div>`:'<div class="empty"><h3>아직 담은 상품이 없어요.</h3><p>상품 미리보기에서 데모로 담아보세요.</p></div>'}`);}
function record(label,type,config){history=[{id:String(Date.now()),time:new Date().toISOString(),label,type,config:clone(config)},...history].slice(0,8);write(KEYS.history,history);}
function saveDraft(){if(write(KEYS.draft,draft)){record('편집 중인 구성 저장','draft',draft);toast('초안을 저장했습니다. 공개본은 바뀌지 않았습니다.');render();}}
function publish(){try{const value=validateConfig(draft,catalog);if(write(KEYS.published,value)){published=clone(value);resetBlockHistory();resetCurationHistory('목업 공개본을 업데이트했습니다. 이후 편집은 새 초안 변경으로 처리합니다.');write(KEYS.draft,draft);record('목업 공개본 업데이트','published',published);dirty=false;toast('목업 고객 화면에 반영했습니다. 실제 메이크샵은 변경되지 않습니다.');render();}}catch(error){toast(error.message);}}
function previewDraft(){write(KEYS.draft,draft);lastFocus=document.activeElement;const url=new URL(location.href);url.search='?view=shop&preview=1&frame=1&tab='+encodeURIComponent(adminTab);overlay.innerHTML=`<section class="preview-modal" role="dialog" aria-modal="true" aria-label="편집 중인 화면 미리보기"><div class="preview-modal-bar"><span>초안 미리보기 · ${esc(adminTab)}</span><div class="studio-toolbar">${button('모바일 폭','preview-mobile','small')}${button('전체 폭','preview-full','small')}${button('닫기','close','small')}</div></div><iframe title="초안 고객 화면" src="${esc(url.href)}"></iframe></section>`;document.body.style.overflow='hidden';overlay.querySelector('button')?.focus();}
function mutate(fn,message){fn();markDirty();render();if(message)toast(message);}
function resetCurationHistory(message='초안 구성을 새로 불러왔습니다. 상품 ID와 진열 상태를 다시 확인하세요.'){curationPast.length=0;curationFuture.length=0;selected.clear();curationRevision++;curationResult=message;}
function mutateCuration(fn,message,ids=[]){
  const before=clone(draft.tabs[adminTab]);fn();const after=clone(draft.tabs[adminTab]);
  const changed=JSON.stringify(before)!==JSON.stringify(after);
  const affected=[...new Set([...ids,...['pins','excluded'].flatMap(key=>[...before[key].filter(id=>!after[key].includes(id)),...after[key].filter(id=>!before[key].includes(id))])])];
  if(changed){curationPast.push({tab:adminTab,before,after,ids:affected});if(curationPast.length>20)curationPast.shift();curationFuture.length=0;curationRevision++;}
  curationResult=`${adminTab} · ${affected.length?'상품 ID '+affected.slice(0,6).join(', ')+(affected.length>6?` 외 ${affected.length-6}개`:'')+' · ':''}${changed?(message||'진열 순서를 변경했습니다.'):'변경 없음 · 현재 설정과 같습니다.'}`;
  markDirty();render({keepAdminPosition:true});toast(curationResult);
}
function replayCuration(redo=false){
  const source=redo?curationFuture:curationPast,target=redo?curationPast:curationFuture,entry=source.pop();if(!entry)return;
  draft.tabs[entry.tab]=clone(redo?entry.after:entry.before);target.push(entry);adminTab=entry.tab;adminPage='list';adminFilter='all';adminQuery='';adminLimit=60;selected.clear();curationRevision++;curationResult=`${adminTab} · ${entry.ids.length?'상품 ID '+entry.ids.slice(0,6).join(', ')+' · ':''}${redo?'진열 편집을 다시 적용했습니다.':'직전 진열 편집을 취소했습니다.'}`;markDirty();render();toast(curationResult);
}
function move(id,direction){if(rankingFor().enabled)return toast('순번을 직접 옮기려면 점수 기반 정렬을 꺼주세요.');const items=resolveList(catalog,adminTab,draft),index=items.findIndex(p=>p.id===id);if(index<0)return;mutateCuration(()=>reorder(draft,catalog,adminTab,id,index+direction),null,[id]);}
function applyAdminRank(input){
  if(rankingFor().enabled)return toast('순번을 직접 옮기려면 점수 기반 정렬을 꺼주세요.');
  if(!input)return;const value=Number(input.value),min=Number(input.min),max=Number(input.max),id=input.dataset.rank;
  if(Number.isSafeInteger(value)&&value>=min&&value<=max)return mutateCuration(()=>reorder(draft,catalog,adminTab,id,value-1),'진열 순서를 변경했습니다.',[id]);
  curationResult=`상품 ID ${id} · 순번을 적용하지 않았습니다. 같은 진열 구간의 ${min}~${max}번을 입력하세요.`;renderAdminRows();const result=app.querySelector('#admin-result');if(result)result.textContent=curationResult;toast(curationResult);
}

async function action(target){const a=target.dataset.action,id=target.dataset.id;
  if(a==='close')return closeOverlay();
  if(a==='admin-mode'){view='admin';adminPage=target.dataset.mode==='ai'?'workbench':'overview';return render();}
  if(a==='open-workbench'||a==='workbench-view'){view='admin';adminPage='workbench';workbenchView=['photos','rules','results'].includes(target.dataset.workbenchView)?target.dataset.workbenchView:'photos';return render();}
  if(a==='undo-workspace'||a==='redo-workspace')return replayWorkspace(a==='redo-workspace');
  if(a==='photo-more'){photoLimit+=12;return renderPhotoGrid();}
  if(a==='clear-photo-compare'){compareIds.clear();return render();}
  if(a==='inspect-product'||a==='inspect-from-result')return selectPhotoProduct(id);
  if(a==='open-inspection')return openInspection(id);
  if(a==='inspect-photo'){const p=catalog.find(p=>p.id===inspectedId),index=Number(target.dataset.index);if(!p?.images[index])return;inspectedPhoto=index;app.querySelector('#photo-inspector').innerHTML=photoInspectorHTML();return;}
  if(a==='inspect-full-photo'){const p=catalog.find(p=>p.id===id),index=Number(target.dataset.index);if(!p?.images[index])return;const image=overlay.querySelector('#inspection-full-image');image.src=p.images[index];image.alt=p.name+' 사진 '+(index+1);overlay.querySelectorAll('[data-action=inspect-full-photo]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.index)===index)));return;}
  if(a==='add-ranking-rule'){const edit=readRankingForm();if(edit.rules.length>=100)return toast('태그 규칙은 최대 100개입니다.');edit.rules.push({id:newBlockId().replace('block-','rule-'),group:'color',tag:'실버',weight:5});rankingEdits.set(adminTab,edit);return render();}
  if(a==='remove-ranking-rule'){const edit=readRankingForm();edit.rules=edit.rules.filter(r=>r.id!==target.dataset.ruleId);rankingEdits.set(adminTab,edit);return render();}
  if(a==='ranking-results-more'){resultLimit+=12;return render();}
  if(a==='rank-result-view'){if(['draft','published','side'].includes(target.dataset.resultView))resultView=target.dataset.resultView;return render();}
  if(a==='prepare-ai-batch'){batchText=JSON.stringify({version:1,tab:adminTab,summary:'',ranking:clone(rankingFor()),productEdits:[]},null,2);validatedBatch=null;return render();}
  if(a==='validate-ai-batch'){validatedBatch=null;try{validatedBatch=stageBatch();app.querySelector('#batch-preview').textContent=validatedBatch.description;app.querySelector('[data-action=apply-ai-batch]').disabled=false;}catch(error){app.querySelector('#batch-preview').textContent=error.message;app.querySelector('[data-action=apply-ai-batch]').disabled=true;toast(error.message);}return;}
  if(a==='apply-ai-batch')return applyBatch();
  if(a==='export-workbench'){const products=poolFor(effectiveCatalog(catalog,draft),adminTab).map(p=>({id:p.id,name:p.name,price:p.price,categories:p.categories,materials:p.materials,tags:p.tags||{},images:p.images.map(src=>new URL(src,location.href).href),review:draft.productEdits?.[p.id]||null}));const blob=new Blob([JSON.stringify({version:1,tab:adminTab,ranking:rankingFor(),products},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pinkrocket-workbench-'+adminTab+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  if(a==='view-shop'||a==='home'){closeOverlay();view='shop';previewMode=false;if(a==='home'){tab='추천';tabStates[tab].favoritesOnly=false;}render();updateURL();return window.scrollTo(0,0);}
  if(a==='view-admin'||a==='return-admin'){tabStates[tab].scroll=scrollY;closeOverlay();view='admin';previewMode=false;render();updateURL();return window.scrollTo(0,0);}
  if(a==='open-guide')return openDrawer('이 목업에서 확인할 수 있는 것',`<div class="demo-note">실제 메이크샵에는 어떤 변경도 보내지 않습니다.</div>${guideHTML()}`,true);
  if(a==='tab'){closeOverlay();return setTab(target.dataset.tab);}
  if(a==='previous-tab'||a==='next-tab')return adjacentTab(a==='next-tab'?1:-1);
  if(a==='open-categories')return openDrawer('카테고리',`<nav class="category-drawer">${TABS.map(t=>`<button class="btn full-btn ${t===tab?'primary':''}" data-action="tab" data-tab="${t}">${t}</button>`).join('')}</nav>`);
  if(a==='discovery-tag'){const s=tabStates[tab],g=target.dataset.group,t=target.dataset.tag;if(!TAG_GROUPS.find(x=>x.key===g)?.options.includes(t))return;const old=s.discovery.tags[g]||[];s.discovery.tags[g]=old.includes(t)?old.filter(x=>x!==t):[...old,t];s.sort='match';s.limit=8;discoveryOpen=true;return render();}
  if(a==='price-preset'){const s=tabStates[tab];s.discovery.min='0';s.discovery.max=target.dataset.max;s.sort='match';s.limit=8;discoveryOpen=true;return render();}
  if(a==='reset-discovery'){photoReadToken++;tabStates[tab].discovery=emptyDiscovery();tabStates[tab].sort='curated';tabStates[tab].limit=8;return render();}
  if(a==='clear-photo'){photoReadToken++;const d=tabStates[tab].discovery;d.photoTone=null;d.photoPreview='';return render();}
  if(a==='material'){tabStates[tab].material=target.dataset.material;tabStates[tab].limit=8;return render();}
  if(a==='clear-filters'){photoReadToken++;Object.assign(tabStates[tab],{query:'',material:'전체',sort:'curated',favoritesOnly:false,limit:8,discovery:emptyDiscovery()});return render();}
  if(a==='focus-search'){app.querySelector('.shop-header')?.classList.add('search-open');app.querySelector('#shop-search')?.focus();return;}
  if(a==='focus-filters'||a==='open-filters'){setFiltersOpen(true);return;}
  if(a==='close-filters'){setFiltersOpen(false);return;}
  if(a==='native-options'||a==='native-detail'){if(makeshopBridge.request(a==='native-options'?'options':'detail',id))closeOverlay();return;}
  if(a==='toggle-favorites'&&makeshopBridge.enabled)return makeshopBridge.request('wishlist');
  if(a==='favorite'&&makeshopBridge.enabled)return makeshopBridge.request('wish',id);
  if(a==='open-cart'&&makeshopBridge.enabled)return makeshopBridge.request('cart');
  if(a==='demo-add'&&makeshopBridge.enabled)return toast('메이크샵 상세에서 옵션을 선택하세요.');
  if(a?.startsWith('cart-')&&makeshopBridge.enabled)return;
  if(a==='toggle-favorites'){tabStates[tab].favoritesOnly=!tabStates[tab].favoritesOnly;tabStates[tab].limit=8;return render();}
  if(a==='favorite'){favorites=favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id];write(KEYS.favorites,favorites);if(view==='shop')render();toast(favorites.includes(id)?'찜한 상품에 담았습니다. · 로컬 데모':'찜을 해제했습니다. · 로컬 데모');return;}
  if(a==='slide')return slide(id,Number(target.dataset.delta));
  if(a==='load-more'){tabStates[tab].limit+=6;return renderFeed();}
  if(a==='quickview')return openQuickview(id);
  if(a==='gallery-thumb'){const p=catalog.find(p=>p.id===id),i=Number(target.dataset.index);if(!p?.images[i])return;photoState.set(id,i);overlay.querySelector('#quickview-image').src=p.images[i];overlay.querySelectorAll('.gallery-thumbs button').forEach(b=>b.classList.toggle('active',b===target));return;}
  if(a==='open-cart')return openCart();
  if(a==='demo-add'){const quantity=Number(overlay.querySelector('#demo-quantity')?.value);if(!Number.isInteger(quantity)||quantity<1||quantity>99)return toast('수량은 1~99 사이로 입력하세요.');const item=cart.find(x=>x.id===id);if(item)item.quantity=Math.min(99,item.quantity+quantity);else cart.push({id,quantity});write(KEYS.cart,cart);closeOverlay();render();return toast('데모 장바구니에 담았습니다. 실제 주문에는 반영되지 않습니다.');}
  if(a?.startsWith('cart-')){const item=cart.find(x=>x.id===id);if(!item)return;if(a==='cart-remove')cart=cart.filter(x=>x.id!==id);else item.quantity=Math.max(1,Math.min(99,item.quantity+(a==='cart-plus'?1:-1)));write(KEYS.cart,cart);render();return openCart();}
  if(a==='admin-page'){adminPage=target.dataset.page;selected.clear();return render();}
  if(a==='admin-more'){adminLimit+=60;return renderAdminRows();}
  if(a==='admin-tab'){adminLimit=60;adminTab=target.dataset.tab;selected.clear();compareIds.clear();inspectedId=null;workbenchQuery='';photoLimit=12;validatedBatch=null;adminQuery='';adminFilter='all';return render();}
  if(a==='admin-filter'){adminFilter=target.dataset.filter;adminLimit=60;selected.clear();return render();}
  if(a==='clear-selection'){selected.clear();return syncAdminSelection();}
  if(a==='undo-curation')return replayCuration();
  if(a==='redo-curation')return replayCuration(true);
  if(a==='pin')return mutateCuration(()=>togglePin(draft,adminTab,id),'상단 고정 설정을 바꿨습니다.');
  if(a==='apply-rank')return applyAdminRank(app.querySelector(`[data-rank="${CSS.escape(id)}"]`));
  if(a==='move-up'||a==='move-down')return move(id,a==='move-up'?-1:1);
  if(a==='exclude')return mutateCuration(()=>{draft.tabs[adminTab].excluded=[...new Set([...draft.tabs[adminTab].excluded,id])];selected.delete(id);},'목록에서 제외했습니다. ‘제외’에서 복원할 수 있습니다.');
  if(a==='restore-product')return mutateCuration(()=>draft.tabs[adminTab].excluded=draft.tabs[adminTab].excluded.filter(x=>x!==id),'상품을 복원했습니다. 기존 고정·순서 설정을 유지합니다.');
  if(['bulk-pin','bulk-unpin','bulk-exclude','bulk-restore'].includes(a)){
    const ids=adminData().source.filter(p=>selected.has(p.id)).map(p=>p.id);if(!ids.length)return toast('먼저 상품을 선택하세요.');
    return mutateCuration(()=>{const c=draft.tabs[adminTab];if(a==='bulk-pin')c.pins=[...new Set([...c.pins,...ids])];if(a==='bulk-unpin')c.pins=c.pins.filter(id=>!selected.has(id));if(a==='bulk-exclude')c.excluded=[...new Set([...c.excluded,...ids])];if(a==='bulk-restore')c.excluded=c.excluded.filter(id=>!selected.has(id));selected.clear();},`${ids.length}개 상품을 ${({'bulk-pin':'상단 고정','bulk-unpin':'고정 해제','bulk-exclude':'제외','bulk-restore':'복원'})[a]}했습니다.`);
  }
  if(a==='apply-sort'||a==='reset-order'){const sort=app.querySelector('#admin-sort').value;return mutateCuration(()=>autoArrange(draft,adminTab,sort,a==='reset-order'),a==='reset-order'?'상단 고정·제외는 유지하고 수동 순서를 초기화했습니다.':'정렬 기준을 적용했습니다. 수동 편집은 유지됩니다.');}
  if(a==='save-draft')return saveDraft();
  if(a==='load-draft'){draft=loadConfig(KEYS.draft,published);resetCurationHistory();resetBlockHistory();markDirty();render();return toast('저장된 초안을 불러왔습니다.');}
  if(a==='publish')return publish();
  if(a==='preview-draft')return previewDraft();
  if(a==='preview-mobile'||a==='preview-full'){const iframe=overlay.querySelector('iframe');iframe.style.maxWidth=a==='preview-mobile'?'390px':'100%';iframe.style.margin='0 auto';return;}
  if(a==='add-banner'||a==='edit-banner'){if(a==='add-banner'&&draft.banners.length>=100)return toast('블록은 최대 100개까지 추가할 수 있습니다.');return bannerEditor(id,target.dataset.type);}
  if(a==='cancel-block'){blockEditing=null;blockSelection=null;return render();}
  if(a==='undo-blocks'||a==='redo-blocks')return replayBlocks(a==='redo-blocks');
  if(a==='block-preview-more'){blockPreviewLimit=Math.min(60,blockPreviewLimit+24);return renderBlockPreview();}
  if(a==='block-preview-pc'||a==='block-preview-mobile'){blockPreviewDevice=a==='block-preview-mobile'?'mobile':'pc';return render();}
  if(a==='place-block')return placeBlock(Number(target.dataset.after));
  if(a==='move-block-up'||a==='move-block-down')return moveBlock(id,draft.banners.findIndex(b=>b.id===id)+(a==='move-block-up'?-1:1));
  if(a==='apply-block-rank')return moveBlock(id,Number(app.querySelector(`[data-block-rank="${CSS.escape(id)}"]`)?.value)-1);
  if(a==='toggle-banner'){const b=draft.banners.find(b=>b.id===id);if(b)return mutateBlocks(()=>{b.enabled=!b.enabled;if(blockEditing?.id===id)blockEditing.enabled=b.enabled;},b.enabled?'숨겼습니다.':'노출했습니다.',[id]);return;}
  if(a==='delete-banner')return mutateBlocks(()=>draft.banners=draft.banners.filter(b=>b.id!==id),'삭제했습니다. 실행 취소로 복구할 수 있습니다.',[id]);
  if(a==='duplicate-banner'){const original=draft.banners.find(b=>b.id===id);if(!original)return;if(draft.banners.length>=100)return toast('블록은 최대 100개까지 추가할 수 있습니다.');const b=clone(original);b.id=newBlockId();b.title=b.title.slice(0,153)+' · 복제';blockSelection=b.id;return mutateBlocks(()=>draft.banners.splice(draft.banners.indexOf(original)+1,0,b),'복제했습니다.',[b.id]);}
  if(a==='restore-history'){const h=history.find(h=>h.id===id);if(h){draft=validateConfig(h.config,catalog);resetCurationHistory();resetBlockHistory();markDirty();render();toast('선택한 구성을 초안으로 복구했습니다.');}return;}
  if(a==='export-config'){const blob=new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pinkrocket-main-config.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  if(a==='import-config')return app.querySelector('#config-file').click();
}
document.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(target){event.preventDefault();Promise.resolve(action(target)).catch(error=>toast(error.message||'작업을 완료하지 못했습니다.'));}else if(event.target.matches('[data-dismiss]'))closeOverlay();});
document.addEventListener('input',event=>{const t=event.target;updateBlockInput(t);updateWorkspaceInput(t);if(t.id==='shop-search'){tabStates[tab].query=t.value;tabStates[tab].limit=8;renderFeed();}if(t.id==='admin-search'){adminQuery=t.value;adminLimit=60;renderAdminRows();}});
document.addEventListener('change',async event=>{const t=event.target;updateBlockInput(t);updateWorkspaceInput(t);if(t.id==='shop-sort'){tabStates[tab].sort=t.value;tabStates[tab].limit=8;renderFeed();}if(t.id==='hide-soldout')mutateCuration(()=>draft.tabs[adminTab].hideSoldout=t.checked);if(t.dataset.rowSelect){t.checked?selected.add(t.dataset.rowSelect):selected.delete(t.dataset.rowSelect);syncAdminSelection();}if(t.hasAttribute('data-select-all')){app.querySelectorAll('[data-row-select]').forEach(c=>{c.checked=t.checked;t.checked?selected.add(c.dataset.rowSelect):selected.delete(c.dataset.rowSelect);});syncAdminSelection();}if(t.dataset.rank)applyAdminRank(t);if(t.id==='config-file'&&t.files[0]){try{if(t.files[0].size>1500000)throw Error('구성 파일은 1.5MB 이하여야 합니다.');draft=validateConfig(JSON.parse(await t.files[0].text()),catalog);resetCurationHistory();resetBlockHistory();markDirty();render();toast('구성을 초안으로 가져왔습니다.');}catch(error){toast(error.message);}}if(t.id==='banner-image-file'&&t.files[0]){const f=t.files[0];if(!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>800000){toast('PNG/JPEG/WebP 800KB 이하 파일을 선택하세요.');t.value='';return;}const uploadBlockId=app.querySelector('#banner-form')?.dataset.bannerId,reader=new FileReader();reader.onload=()=>{const input=app.querySelector('#banner-form [name="image"]');if(!input||input.form.dataset.bannerId!==uploadBlockId)return;input.value=reader.result;updateBlockInput(input);toast('이미지를 준비했습니다. 블록 변경 적용을 눌러주세요.');};reader.readAsDataURL(f);}});
document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-block-rank]')){event.preventDefault();moveBlock(event.target.dataset.blockRank,Number(event.target.value)-1);}if(event.key==='Enter'&&event.target.matches('[data-rank]')){event.preventDefault();applyAdminRank(event.target);}});
function syncFilterSheet(){const open=view==='shop'&&!!app.querySelector('.discovery[open]');document.body.classList.toggle('filters-open',open);if(open)document.body.style.overflow='hidden';else if(!overlay.children.length)document.body.style.overflow='';}
function setFiltersOpen(open){discoveryOpen=open;const details=app.querySelector('.discovery');if(!details)return;details.open=open;syncFilterSheet();if(open)app.querySelector('[aria-label="필터 닫기"]')?.focus();else details.querySelector('summary')?.focus();}
document.addEventListener('toggle',event=>{if(event.target.matches?.('.discovery')&&event.target.isConnected){discoveryOpen=event.target.open;syncFilterSheet();if(discoveryOpen&&!document.activeElement?.closest('.discovery-body'))app.querySelector('[aria-label="필터 닫기"]')?.focus();}},true);
document.addEventListener('keydown',event=>{if(!document.body.classList.contains('filters-open'))return;if(event.key==='Escape'){event.preventDefault();setFiltersOpen(false);}if(event.key==='Tab'){const items=[...app.querySelectorAll('.discovery-body button,.discovery-body input,.discovery-body select')].filter(el=>!el.disabled);const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
document.addEventListener('input',event=>{if(['discovery-min','discovery-max'].includes(event.target.id)){const s=tabStates[tab];s.discovery[event.target.id==='discovery-min'?'min':'max']=event.target.value;s.limit=8;renderFeed();}});
document.addEventListener('change',event=>{
 const s=tabStates[tab];if(event.target.id==='discovery-strict'){s.discovery.strict=event.target.checked;s.limit=8;renderFeed();}
 if(event.target.id==='discovery-cap'){s.discovery.cap=Number(event.target.value);s.limit=8;renderFeed();}
 if(event.target.id==='discovery-photo'&&event.target.files[0])readDiscoveryPhoto(event.target.files[0]);
});
function readDiscoveryPhoto(file){
 if(!file.type.startsWith('image/'))return toast('이미지 파일을 선택해 주세요.');
 if(file.size>15000000)return toast('15MB 이하 사진을 선택해 주세요.');
 const targetTab=tab,token=++photoReadToken,reader=new FileReader();
 reader.onerror=()=>toast('사진을 읽지 못했습니다.');
 reader.onload=()=>{const img=new Image();img.onerror=()=>toast('이 사진 형식을 읽지 못했습니다.');img.onload=()=>{
  if(token!==photoReadToken||tab!==targetTab)return;
  try{const canvas=document.createElement('canvas');canvas.width=canvas.height=48;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,48,48);const pixels=ctx.getImageData(0,0,48,48).data;let sx=0,sy=0,weight=0;
  for(let i=0;i<pixels.length;i+=4){const r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),df=max-min;if(df<.12||pixels[i+3]<128)continue;const h=(max===r?((g-b)/df)%6:max===g?(b-r)/df+2:(r-g)/df+4)*Math.PI/3;sx+=Math.cos(h)*df;sy+=Math.sin(h)*df;weight+=df;}
  const d=tabStates[targetTab].discovery;d.photoTone={grey:weight<20,hue:(Math.atan2(sy,sx)*180/Math.PI+360)%360};d.photoPreview=reader.result;tabStates[targetTab].sort='match';tabStates[targetTab].limit=8;discoveryOpen=true;if(view==='shop')render();
  }catch{toast('사진의 색감을 읽지 못했습니다.');}
 };img.src=reader.result;};reader.readAsDataURL(file);
}
document.addEventListener('submit',event=>{
 if(['direction-form','ranking-form','product-review-form'].includes(event.target.id)){
  event.preventDefault();try{
   const form=event.target,parts=workspaceParts();
   if(form.id==='direction-form'){const data=new FormData(form);parts.ranking[adminTab]=normalizeRanking({...rankingFor(),brief:String(data.get('brief')),diversity:Number(data.get('diversity')),enabled:data.has('enabled'),respectPins:data.has('respectPins')});return mutateWorkspace(parts,'진열 방향을 초안에 적용했습니다.');}
   if(form.id==='ranking-form'){const input=readRankingForm();let combinations;try{combinations=JSON.parse(input.comboText);}catch{throw Error('태그 조합 규칙은 JSON 배열로 입력하세요.');}const {comboText,...cfg}=input;parts.ranking[adminTab]=normalizeRanking({...cfg,combinations});return mutateWorkspace(parts,'점수 규칙을 초안에 적용했습니다.');}
   const id=form.dataset.productId;parts.productEdits[id]=reviewFormValue();return mutateWorkspace(parts,'사진·태그 검토를 초안에 적용했습니다.',[id]);
  }catch(error){workspaceResult='적용하지 않았습니다. '+error.message;const result=app.querySelector('#workspace-result');if(result)result.textContent=workspaceResult;toast(error.message);}return;
 }
 if(event.target.id!=='banner-form')return;event.preventDefault();
 try{const b=readBlockForm(),next=clone(draft);if(!b) return;
  if(next.banners.some(x=>x.id===b.id))next.banners=next.banners.map(x=>x.id===b.id?b:x);else next.banners.push(b);
  const validated=validateConfig(next,catalog);blockSelection=b.id;blockEditing=clone(validated.banners.find(x=>x.id===b.id));
  mutateBlocks(()=>draft.banners=validated.banners,'변경을 초안에 적용했습니다.',[b.id]);
 }catch(error){const el=app.querySelector('#block-editor-warning');if(el)el.textContent=error.message;toast(error.message);}
});
document.addEventListener('change',event=>{
 const t=event.target;if(t.id==='photo-review-filter'){photoReviewFilter=t.value;photoLimit=12;renderPhotoGrid();}
 if(t.dataset.compareId){const id=t.dataset.compareId;if(!catalog.some(p=>p.id===id))return;if(t.checked&&compareIds.size>=4&&!compareIds.has(id)){t.checked=false;return toast('사진 비교는 최대 4개까지 선택할 수 있습니다.');}t.checked?compareIds.add(id):compareIds.delete(id);app.querySelector('#photo-selection-count').textContent=`비교 선택 ${compareIds.size} / 4개`;app.querySelector('#photo-compare').innerHTML=photoCompareHTML();}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.children.length)closeOverlay();if(event.key==='Tab'&&overlay.children.length){const elements=[...overlay.querySelectorAll('button:not(:disabled),a[href],input:not([type="file"]),select,textarea,iframe')].filter(e=>e.offsetParent!==null);if(!elements.length)return;const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
let pointer=null,suppressClick=false,clickTimer;
document.addEventListener('error',event=>{const img=event.target;if(img.classList?.contains('gesture-neighbor')){img.style.visibility='hidden';return;}if(img.tagName==='IMG'&&img.closest('.product-photo,.quickview-photo')){img.style.visibility='hidden';img.parentElement.classList.add('image-missing');}},true);
function resetSwipe(gesture=pointer){
  if(!gesture?.gallery)return;
  const gallery=gesture.gallery;
  gallery.classList.remove('swiping');gallery.querySelector('.gesture-neighbor')?.remove();gallery.querySelector('.swipe-cue')?.remove();
  const img=gallery.querySelector('.photo-link img');if(img){img.style.removeProperty('transform');img.style.removeProperty('transition');}
}
function blockDragClick(){clearTimeout(clickTimer);suppressClick=true;clickTimer=setTimeout(()=>suppressClick=false,250);}
function cancelSwipe(){resetSwipe();pointer=null;}
document.addEventListener('pointerdown',event=>{
  if(event.isPrimary===false){cancelSwipe();return;}
  cancelSwipe();suppressClick=false;
  if(event.button!==0||view!=='shop'||overlay.children.length||document.body.classList.contains('filters-open'))return;
  const target=event.target;
  if(target.closest('.labbar,input,select,textarea,[contenteditable="true"]'))return;
  const gallery=target.closest('[data-gallery]');
  pointer={id:gallery?.dataset.gallery,gallery,width:gallery?.getBoundingClientRect().width||240,pointerId:event.pointerId,x:event.clientX,y:event.clientY};
});
document.addEventListener('pointermove',event=>{
  if(!pointer||event.pointerId!==pointer.pointerId)return;
  const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;
  if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)*1.2){cancelSwipe();return;}
  if(!pointer.gallery||Math.abs(dx)<8||Math.abs(dx)<=Math.abs(dy)*1.5)return;
  const g=pointer.gallery,p=catalog.find(p=>p.id===pointer.id),delta=dx<0?1:-1;
  const intent=swipeIntent(dx,dy,{gallery:true,width:pointer.width,count:p.images.length});
  g.classList.add('swiping');const img=g.querySelector('.photo-link img');
  const offset=p.images.length>1?Math.max(-pointer.width*.92,Math.min(pointer.width*.92,dx)):Math.max(-20,Math.min(20,dx*.2));
  img.style.transition='none';img.style.transform=`translateX(${offset}px)`;
  if(p.images.length>1){
    let ghost=g.querySelector('.gesture-neighbor');if(!ghost){ghost=img.cloneNode(false);ghost.className='gesture-neighbor';ghost.loading='eager';ghost.alt='';ghost.setAttribute('aria-hidden','true');g.querySelector('.photo-link').appendChild(ghost);}
    const index=((photoState.get(p.id)||0)+delta+p.images.length)%p.images.length;
    if(ghost.getAttribute('src')!==p.images[index])ghost.src=p.images[index];
    ghost.style.transform=`translateX(${delta*pointer.width+offset}px)`;
  }
  let cue=g.querySelector('.swipe-cue');if(!cue){cue=document.createElement('span');cue.className='swipe-cue';cue.setAttribute('aria-hidden','true');g.appendChild(cue);}
  cue.textContent=p.images.length>1?'사진 넘기기':'등록된 사진 1장';
  
});
document.addEventListener('pointerup',event=>{
  if(!pointer||event.pointerId!==pointer.pointerId)return;
  const gesture=pointer;pointer=null;
  const dx=event.clientX-gesture.x,dy=event.clientY-gesture.y,p=catalog.find(p=>p.id===gesture.id);
  resetSwipe(gesture);
  if(view!=='shop'||overlay.children.length)return;
  const intent=swipeIntent(dx,dy,{gallery:!!gesture.gallery,width:gesture.width,count:p?.images.length||1}),delta=dx<0?1:-1;
  if(intent==='photo'){
    slide(p.id,delta);
    const gallery=app.querySelector(`[data-gallery="${CSS.escape(p.id)}"]`);
    gallery.style.setProperty('--photo-arrive-from',`${delta*gesture.width+Math.max(-gesture.width*.92,Math.min(gesture.width*.92,dx))}px`);gallery.classList.add('photo-arrive');
    setTimeout(()=>gallery.classList.remove('photo-arrive'),200);
  }else if(intent==='tab')adjacentTab(delta);
  if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.5)blockDragClick();
});
document.addEventListener('pointercancel',cancelSwipe);
window.addEventListener('blur',cancelSwipe);
document.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopImmediatePropagation();suppressClick=false;}},true);
document.addEventListener('keydown',event=>{const tabButton=event.target.closest('.category-tabs [data-tab]');if(!tabButton||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?TABS[0]:event.key==='End'?TABS.at(-1):TABS[TABS.indexOf(tabButton.dataset.tab)+(event.key==='ArrowRight'?1:-1)];if(next){setTab(next);app.querySelector(`.category-tabs [data-tab="${next}"]`)?.focus();}});
function bindDrag(){
  let dragged=null;
  app.querySelectorAll('[data-row-id][draggable="true"]').forEach(row=>{
    row.ondragstart=event=>{if(event.target.closest('input,button,a'))return event.preventDefault();dragged=row.dataset.rowId;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',dragged);};
    row.ondragover=event=>{event.preventDefault();row.classList.add('drag-over');};
    row.ondragleave=()=>row.classList.remove('drag-over');
    row.ondragend=()=>{dragged=null;app.querySelectorAll('.drag-over').forEach(row=>row.classList.remove('drag-over'));};
    row.ondrop=event=>{
      event.preventDefault();row.classList.remove('drag-over');if(!dragged)return;
      const {c,list}=adminData(),id=dragged;dragged=null;
      if(c.pins.includes(id)!==c.pins.includes(row.dataset.rowId))return toast('고정 상품과 일반 상품은 각각의 구간에서 이동하세요.');
      const index=list.findIndex(p=>p.id===row.dataset.rowId);mutateCuration(()=>reorder(draft,catalog,adminTab,id,index),'진열 순서를 변경했습니다.',[id]);
    };
  });
}
window.addEventListener('storage',event=>{if(event.key===KEYS.published){published=removeStarterBanners(loadConfig(KEYS.published,published));if(view==='shop'&&!previewMode)render();}if(event.key===KEYS.favorites){favorites=read(KEYS.favorites,[]).filter(id=>catalog.some(p=>p.id===id));if(view==='shop'&&!makeshopBridge.enabled)render();}if(event.key===KEYS.draft&&previewMode){draft=removeStarterBanners(loadConfig(KEYS.draft,draft));render();}});
async function registerBrowserTools(){
  const registry=document.modelContext;if(typeof registry?.registerTool!=='function')return;
  try{
    await registry.registerTool({name:'read_curation_state',description:'Read local mockup curation state. No real Makeshop account is connected.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:async()=>({mode:'local-demo',tab:adminTab,filter:adminFilter,query:adminQuery,selected:[...selected],revision:curationRevision,lastResult:curationResult,dirty,visible:resolveList(catalog,adminTab,draft).map(p=>({id:p.id,name:p.name})),config:clone(draft)})});
    await registry.registerTool({name:'move_curation_product',description:'Move a product within its pinned or normal group in the local demo draft. Same limits and undo history as the visible rank input.',inputSchema:{type:'object',properties:{tab:{type:'string',enum:TABS},id:{type:'string'},position:{type:'integer',minimum:1}},required:['tab','id','position'],additionalProperties:false},execute:async input=>{
      if(!input||!TABS.includes(input.tab)||typeof input.id!=='string'||!Number.isSafeInteger(input.position))throw Error('Invalid input');if(rankingFor(draft,input.tab).enabled)throw Error('순번을 직접 옮기려면 점수 기반 정렬을 꺼주세요.');
      const list=resolveList(catalog,input.tab,draft),before=list.findIndex(p=>p.id===input.id),c=draft.tabs[input.tab],pins=list.filter(p=>c.pins.includes(p.id)).length;
      if(before<0)throw Error('Product not found');
      const min=c.pins.includes(input.id)?1:pins+1,max=c.pins.includes(input.id)?pins:list.length;
      if(input.position<min||input.position>max)throw Error(`Position must be within ${min}..${max}`);
      closeOverlay();view='admin';previewMode=false;adminTab=input.tab;adminPage='list';adminFilter='all';adminQuery='';selected.clear();
      mutateCuration(()=>reorder(draft,catalog,input.tab,input.id,input.position-1),'진열 순서를 변경했습니다.',[input.id]);
      const order=resolveList(catalog,input.tab,draft).map(p=>p.id),actualPosition=order.indexOf(input.id)+1;
      return {updated:actualPosition!==before+1,mode:'local-demo',draftOnly:true,tab:input.tab,id:input.id,requestedPosition:input.position,actualPosition,revision:curationRevision,order};
    }});
  }catch(error){console.info('Optional browser tools unavailable:',error.message);}
}
async function init(){try{const response=await fetch('./assets/catalog.json?v=9');if(!response.ok)throw Error('상품 파일을 불러오지 못했습니다.');catalog=normalizeCatalog(await response.json());if(!catalog.length)throw Error('상품 데이터가 비어 있습니다.');const base=initialConfig();published=removeStarterBanners(loadConfig(KEYS.published,base));draft=removeStarterBanners(loadConfig(KEYS.draft,published));write(KEYS.published,published);write(KEYS.draft,draft);history=read(KEYS.history,[]).map(h=>{try{return {...h,config:migrateSavedConfig(h.config,catalog)};}catch{return null;}}).filter(Boolean).slice(0,8);favorites=read(KEYS.favorites,[]).filter(id=>catalog.some(p=>p.id===id));cart=read(KEYS.cart,[]).filter(x=>catalog.some(p=>p.id===x.id)&&Number.isInteger(x.quantity)&&x.quantity>0&&x.quantity<=99);const params=new URLSearchParams(location.search);view=params.get('view')==='admin'?'admin':'shop';previewMode=params.get('preview')==='1';frameMode=params.get('frame')==='1';tab=TABS.includes(params.get('tab'))?params.get('tab'):'추천';adminTab=TABS.includes(params.get('adminTab'))?params.get('adminTab'):tab;adminFilter=['all','pinned','excluded'].includes(params.get('adminFilter'))?params.get('adminFilter'):'all';adminPage=['overview','workbench','list','banners','history','guide'].includes(params.get('adminPage'))?params.get('adminPage'):'overview';workbenchView=['photos','rules','results'].includes(params.get('workbenchView'))?params.get('workbenchView'):'photos';adminQuery=params.get('adminQ')||'';tabStates[tab].query=params.get('q')||'';tabStates[tab].material=MATERIALS.includes(params.get('material'))?params.get('material'):'전체';tabStates[tab].sort=['curated','match','newest','priceAsc','priceDesc'].includes(params.get('sort'))?params.get('sort'):'curated';markDirty();render();registerBrowserTools();}catch(error){app.innerHTML=`<main class="empty"><h1>화면을 준비하지 못했습니다.</h1><p>${esc(error.message)}</p><button class="btn" onclick="location.reload()">다시 시도</button></main>`;}}
init();
