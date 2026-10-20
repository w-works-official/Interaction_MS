const CUSTOMER_CODE_CHANNEL='customer-code-v1',CUSTOMER_CODE_TIMEOUT=10000,CUSTOMER_CODE_WISH_TIMEOUT=50000;
const customerCodeMounts=new WeakMap();
const customerCodeTagKeys=['item','material','color','shape','motif','spot','bar','style','size'];
function customerCodeBytes(text){let size=0;for(let i=0;i<text.length;i++){const unit=text.charCodeAt(i);if(unit<128)size++;else if(unit<2048)size+=2;else if(unit>=0xd800&&unit<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){size+=4;i++;}else size+=3;}return size;}
function customerCodeWire(value){return JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');}
function customerCodeAttribute(value){return String(value).replace(/[&"<>]/g,char=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[char]));}
function customerCodeObject(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function customerCodeId(value){return typeof value==='string'&&/^[1-9]\d{0,31}$/.test(value);}
function customerCodeCategories(value){
 if(!Array.isArray(value)||value.length>40)throw Error('카테고리 목록을 확인하세요.');
 const seen=new Set();return Array.from(value).map(category=>{
  if(!customerCodeObject(category)||typeof category.id!=='string'||!category.id||category.id.length>80||/[\u0000-\u001f]/.test(category.id)||seen.has(category.id)||typeof category.label!=='string'||!category.label.trim()||category.label.length>80)throw Error('카테고리 ID와 이름을 확인하세요.');
  seen.add(category.id);return {id:category.id,label:category.label};
 });
}
function customerCodeOptions(value,categories,initial){
 if(!customerCodeObject(value)||Object.keys(value).some(key=>!['category','query','material','sort','offset','limit','discovery','favoritesOnly'].includes(key)))throw Error('상품 조회 조건을 확인하세요.');
 const options={category:initial.category,query:'',material:'전체',sort:'curated',offset:0,limit:24,favoritesOnly:false,...value};
 if(!categories.some(category=>category.id===options.category)||typeof options.query!=='string'||options.query.length>200||typeof options.material!=='string'||!['전체','써지컬','925 실버','골드','티타늄','진주','큐빅','기타'].includes(options.material)||!['curated','match','newest','priceAsc','priceDesc'].includes(options.sort)||!Number.isSafeInteger(options.offset)||options.offset<0||options.offset>1000000||!Number.isSafeInteger(options.limit)||options.limit<1||options.limit>60||typeof options.favoritesOnly!=='boolean')throw Error('상품 조회 조건의 범위를 확인하세요.');
 if(options.discovery!==undefined){
  const discovery=options.discovery;if(!customerCodeObject(discovery)||Object.keys(discovery).some(key=>!['tags','min','max','strict','cap'].includes(key)))throw Error('상품 필터 조건을 확인하세요.');
  const result={tags:{},min:'',max:'',strict:false,cap:0,...discovery};
  const price=value=>value===''||((typeof value==='number'||typeof value==='string'&&/^\d+(?:\.\d{1,2})?$/.test(value))&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=1000000000);
  if(!customerCodeObject(result.tags)||Object.keys(result.tags).some(key=>!customerCodeTagKeys.includes(key)||!Array.isArray(result.tags[key])||result.tags[key].length>32||new Set(result.tags[key]).size!==result.tags[key].length||Array.from(result.tags[key]).some(tag=>typeof tag!=='string'||!tag||tag.length>80||/[\u0000-\u001f]/.test(tag)))||!price(result.min)||!price(result.max)||result.min!==''&&result.max!==''&&Number(result.min)>Number(result.max)||typeof result.strict!=='boolean'||!Number.isSafeInteger(result.cap)||result.cap<0||result.cap>1000)throw Error('상품 필터 조건의 범위를 확인하세요.');
  options.discovery={...result,tags:Object.fromEntries(Object.entries(result.tags).map(([key,tags])=>[key,[...tags]]))};
 }
 return options;
}
function customerRuntimeListData(value,categories,baseUrl,fallback={}){
 if(!customerCodeObject(value))throw Error('상품 목록 응답을 확인하세요.');
 const category=value.category??fallback.category??categories[0]?.id??'',products=value.products??[],total=value.total??products.length;
 if((category&&!categories.some(item=>item.id===category))||!Array.isArray(products)||products.length>60||!Number.isSafeInteger(total)||total<products.length||total>1000000)throw Error('상품 목록 응답의 범위를 확인하세요.');
 const seen=new Set();return {category,total,products:Array.from(products).map(product=>{
  if(!customerCodeObject(product)||!customerCodeId(product.id)||seen.has(product.id)||typeof product.name!=='string'||product.name.length>1000||!Number.isFinite(product.price)||product.price<0||!Array.isArray(product.images)||product.images.length>30||Array.from(product.images).some(image=>typeof image!=='string'||image.length>4096)||(product.wished!==undefined&&product.wished!==null&&typeof product.wished!=='boolean'))throw Error('상품 ID·이름·가격·사진 응답을 확인하세요.');
  seen.add(product.id);const images=Array.from(product.images).map(image=>{const url=new URL(image,baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('상품 사진 주소를 확인하세요.');return url.href;});
  const result={id:product.id,name:product.name,price:product.price,images,wished:typeof product.wished==='boolean'?product.wished:null};
  if(product.material!==undefined){if(typeof product.material!=='string'||product.material.length>80)throw Error('상품 소재 응답을 확인하세요.');result.material=product.material;}
  if(product.materials!==undefined){if(!Array.isArray(product.materials)||product.materials.length>16||Array.from(product.materials).some(value=>typeof value!=='string'||value.length>80))throw Error('상품 소재 목록 응답을 확인하세요.');result.materials=[...product.materials];}
  if(product.tags!==undefined){if(!customerCodeObject(product.tags)||Object.keys(product.tags).some(key=>!customerCodeTagKeys.includes(key)||!Array.isArray(product.tags[key])||product.tags[key].length>32||Array.from(product.tags[key]).some(value=>typeof value!=='string'||value.length>80)))throw Error('상품 태그 응답을 확인하세요.');result.tags=Object.fromEntries(Object.entries(product.tags).map(([key,tags])=>[key,[...tags]]));}
  return result;
 })};
}
function customerCodeInput(code){
 if(!customerCodeObject(code))throw Error('고객 화면 코드를 확인하세요.');
 const limits={html:200*1024,css:100*1024,js:200*1024},result={};let total=0;
 for(const key of Object.keys(limits)){const value=code[key]??'';if(typeof value!=='string'||value.includes('\0'))throw Error('고객 화면 코드는 문자열로 입력하세요.');const size=customerCodeBytes(value);if(size>limits[key])throw Error('고객 화면 코드의 크기를 줄여주세요.');total+=size;result[key]=value;}
 if(total>500*1024)throw Error('고객 화면 코드는 합계 500KB 이하로 입력하세요.');return result;
}
function customerCodeRuntime(payload){
 'use strict';
 const channel='customer-code-v1',token=payload.token,pending=new Map();let sequence=0,disposed=false,failed=false;
 const send=data=>window.parent.postMessage({channel,token,...data},'*');
 const report=(type,message,extra={})=>send({type,message:String(message||'').slice(0,600),...extra});
 function request(action,options){
  if(disposed)return Promise.reject(Error('이 화면 연결은 종료되었습니다.'));
  if(pending.size>=16)return Promise.reject(Error('진행 중인 요청이 많습니다. 잠시 후 다시 시도하세요.'));
  const requestId=++sequence;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{if(!pending.delete(requestId))return;reject(Error('요청 결과를 확인하지 못했습니다. 자동 재요청하지 않습니다.'));report('timeout','요청 결과를 확인하지 못했습니다.',{requestId});},action==='wish'?50000:10000);
   pending.set(requestId,{resolve,reject,timer});send({type:'request',requestId,action,...options});
  });
 }
 window.addEventListener('message',event=>{
  const data=event.data;if(event.source!==window.parent||!data||data.channel!==channel||data.token!==token)return;
  if(data.type==='dispose'){
   disposed=true;for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('이 화면 연결은 종료되었습니다.'));}pending.clear();return;
  }
  if(disposed||data.type!=='response'||!Number.isSafeInteger(data.requestId)||!pending.has(data.requestId))return;
  const item=pending.get(data.requestId);pending.delete(data.requestId);clearTimeout(item.timer);
  if(data.ok===true)item.resolve(data.data);else item.reject(Error(typeof data.message==='string'?data.message:'요청을 처리하지 못했습니다.'));
 });
 window.addEventListener('error',event=>{failed=true;report('error',event.message||'고객 화면 JavaScript 오류',{line:Number.isSafeInteger(event.lineno)?event.lineno:0});});
 window.addEventListener('unhandledrejection',event=>{failed=true;report('error',event.reason?.message||String(event.reason||'처리하지 못한 요청 오류'));});
 const api=Object.freeze({initial:payload.initial,categories:payload.categories,list:(options={})=>request('list',{options}),product:id=>request('product',{id}),wish:id=>request('wish',{id}),cart:()=>request('cart'),wishlist:()=>request('wishlist')});
 Object.defineProperty(window,'Pinkrocket',{value:api,writable:false,configurable:false});
 const style=document.createElement('style');style.dataset.customerStyle='';style.textContent=payload.css;(document.head||document.documentElement).appendChild(style);
 const start=()=>{if(disposed)return;if(payload.js){const script=document.createElement('script');script.dataset.customerScript='';script.textContent=payload.js;(document.body||document.documentElement).appendChild(script);}setTimeout(()=>{if(!disposed&&!failed)report('ready','고객 화면 코드를 실행했습니다.');},0);};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}

export function buildCustomerDocument({code,token,baseUrl,initial,categories=[]}){
 const input=customerCodeInput(code),base=new URL(baseUrl);if(!['http:','https:'].includes(base.protocol)||base.username||base.password)throw Error('고객 화면 기준 주소를 확인하세요.');
 if(typeof token!=='string'||token.length<16||token.length>128||/[\u0000-\u001f]/.test(token))throw Error('고객 화면 연결 토큰을 확인하세요.');
 const navigation=customerCodeCategories(categories),list=customerRuntimeListData(initial||{},navigation,base.href),payload={token,initial:list,categories:navigation,css:input.css,js:input.js};
 const head=`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base href="${customerCodeAttribute(base.href)}"><script>(${customerCodeRuntime.toString()})(${customerCodeWire(payload)});</script>`;
 if(/<html(?:\s|>)/i.test(input.html)){
  if(/<head(?:\s[^>]*)?>/i.test(input.html))return input.html.replace(/<head(?:\s[^>]*)?>/i,match=>match+head);
  return input.html.replace(/<html(?:\s[^>]*)?>/i,match=>match+'<head>'+head+'</head>');
 }
 return '<!doctype html><html lang="ko"><head>'+head+'</head><body>'+input.html+'</body></html>';
}

export function mountCustomerCode({frame,code,baseUrl,initial,categories=[],onList,onAction,onStatus}){
 if(!frame||frame.tagName!=='IFRAME'||!frame.ownerDocument?.defaultView||!frame.contentWindow)throw Error('고객 화면 iframe을 먼저 표시하세요.');
 customerCodeMounts.get(frame)?.dispose();
 const host=frame.ownerDocument.defaultView,random=new Uint32Array(4);host.crypto.getRandomValues(random);
 const token=Array.from(random,value=>value.toString(16).padStart(8,'0')).join(''),navigation=customerCodeCategories(categories),base=new URL(baseUrl),first=customerRuntimeListData(initial||{},navigation,base.href),pending=new Map();
 let disposed=false,lastRequestId=0;const channel=CUSTOMER_CODE_CHANNEL;
 const status=value=>{try{onStatus?.(value);}catch{ /* A status consumer must not execute user code. */ }};
 const send=data=>{if(!disposed)frame.contentWindow?.postMessage({channel,token,...data},'*');};
 function settle(requestId,ok,data,message){
  const entry=pending.get(requestId);if(disposed||!entry)return;host.clearTimeout(entry.timer);pending.delete(requestId);
  send(ok?{type:'response',requestId,ok:true,data}:{type:'response',requestId,ok:false,message:String(message||'요청을 처리하지 못했습니다.').slice(0,600)});
 }
 function listener(event){
  const data=event.data;
  if(disposed||event.source!==frame.contentWindow||event.origin!=='null'||!customerCodeObject(data)||data.channel!==channel||data.token!==token)return;
  if(['ready','error','timeout'].includes(data.type)){
   if(typeof data.message!=='string'||data.message.length>600)return;
   status({type:data.type,message:data.message,...(Number.isSafeInteger(data.line)?{line:data.line}:{}),...(Number.isSafeInteger(data.requestId)?{requestId:data.requestId}:{})});return;
  }
  if(data.type!=='request'||!Number.isSafeInteger(data.requestId)||data.requestId<1||data.requestId>1000000000||data.requestId<=lastRequestId)return;
  lastRequestId=data.requestId;
  try{
   if(customerCodeBytes(JSON.stringify(data))>8192||Object.keys(data).some(key=>!['channel','token','type','requestId','action','id','options'].includes(key))||!['list','product','wish','cart','wishlist'].includes(data.action))throw Error('허용되지 않은 고객 화면 요청입니다.');
   if(pending.size>=16)throw Error('진행 중인 고객 화면 요청이 많습니다.');
   let options;
   if(data.action==='list'){if(data.id!==undefined)throw Error('상품 조회 요청을 확인하세요.');options=customerCodeOptions(data.options??{},navigation,first);}
   else if(data.action==='product'||data.action==='wish'){if(!customerCodeId(data.id)||data.options!==undefined)throw Error('상품 ID를 확인하세요.');}
   else if(data.id!==undefined||data.options!==undefined)throw Error('메뉴 요청을 확인하세요.');
   const requestId=data.requestId;
   const timer=host.setTimeout(()=>{if(!pending.has(requestId))return;settle(requestId,false,null,'요청 결과를 확인하지 못했습니다. 자동 재요청하지 않습니다.');status({type:'timeout',requestId,message:'고객 화면 요청 시간이 지났습니다.'});},data.action==='wish'?CUSTOMER_CODE_WISH_TIMEOUT:CUSTOMER_CODE_TIMEOUT);
   pending.set(requestId,{timer});
   Promise.resolve().then(()=>{
    if(disposed||!pending.has(requestId))return;
    if(data.action==='list'){if(typeof onList!=='function')throw Error('상품 목록 연결을 확인하세요.');return onList(options);}
    if(typeof onAction!=='function')throw Error('상품 기능 연결을 확인하세요.');return onAction(data.action,data.id);
   }).then(result=>{
    if(disposed||!pending.has(requestId))return;
    const value=data.action==='list'?customerRuntimeListData(result,navigation,base.href,options):result;
    const wire=JSON.stringify(value??null);
    if(typeof wire!=='string'||customerCodeBytes(wire)>1024*1024)throw Error('고객 화면 응답의 형식과 크기를 확인하세요.');
    settle(requestId,true,JSON.parse(wire));
   }).catch(error=>{if(disposed||!pending.has(requestId))return;settle(requestId,false,null,error?.message||'요청을 처리하지 못했습니다.');status({type:'error',requestId,message:String(error?.message||'요청 오류').slice(0,600)});});
  }catch(error){send({type:'response',requestId:data.requestId,ok:false,message:String(error.message||'요청을 확인하세요.').slice(0,600)});}
 }
 const controller={dispose(){
  if(disposed)return;send({type:'dispose',message:'고객 화면 연결이 종료되었습니다.'});disposed=true;host.removeEventListener('message',listener);
  for(const entry of pending.values())host.clearTimeout(entry.timer);pending.clear();if(customerCodeMounts.get(frame)===controller)customerCodeMounts.delete(frame);
 }};
 host.addEventListener('message',listener);frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('referrerpolicy','no-referrer');
 try{frame.srcdoc=buildCustomerDocument({code,token,baseUrl:base.href,initial:first,categories:navigation});}catch(error){controller.dispose();throw error;}
 customerCodeMounts.set(frame,controller);return controller;
}

export function defaultCustomerTemplate(){
 return {
  html:`<div class="pr-code-shop">
  <header>
    <strong>PINKROCKET</strong>
    <div>
      <button id="pr-wishlist" type="button">찜한 상품</button>
      <button id="pr-cart" type="button">장바구니</button>
    </div>
  </header>
  <nav id="pr-categories" aria-label="상품 카테고리"></nav>
  <div id="pr-search" role="search">
    <label>상품 검색
      <input id="pr-query" type="search" maxlength="200" placeholder="상품명 또는 ID">
    </label>
    <button id="pr-search-button" type="button">검색</button>
    <label>정렬
      <select id="pr-sort">
        <option value="curated">추천순</option>
        <option value="priceAsc">낮은 가격순</option>
        <option value="priceDesc">높은 가격순</option>
      </select>
    </label>
  </div>
  <p id="pr-status" role="status" aria-live="polite"></p>
  <main id="pr-products" aria-label="상품 목록"></main>
  <button id="pr-more" type="button">상품 더 보기</button>
  <div id="pr-sentinel" aria-hidden="true"></div>
</div>`,
  css:`* { box-sizing: border-box; }
html, body {
  margin: 0;
  min-width: 0;
  background: #fff;
  color: #252a24;
  font: 14px/1.6 system-ui, sans-serif;
}
button, input, select { font: inherit; }
button {
  min-height: 40px;
  border: 1px solid #d8dfd0;
  background: #fff;
  color: inherit;
  padding: 7px 12px;
  cursor: pointer;
}
button:disabled { opacity: .55; cursor: wait; }
button:focus-visible, input:focus-visible, select:focus-visible {
  outline: 3px solid #d84476;
  outline-offset: 2px;
}
.pr-code-shop { max-width: 1440px; margin: auto; padding: 16px; }
header { display: flex; justify-content: space-between; gap: 12px; align-items: center; }
header strong { font-size: 20px; }
header div, #pr-categories { display: flex; gap: 6px; }
#pr-categories { overflow-x: auto; padding: 18px 0; }
#pr-categories button { white-space: nowrap; }
#pr-categories .active { background: #eff2e8; border-color: #697e55; }
#pr-search { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
#pr-search label { display: flex; gap: 8px; align-items: center; }
input, select { min-height: 40px; padding: 6px; border: 1px solid #d8dfd0; max-width: 100%; }
#pr-status { min-height: 24px; font-size: 13px; }
#pr-products { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px 12px; }
.pr-product { min-width: 0; }
.pr-photo { position: relative; aspect-ratio: 3/4; background: #f5f5f2; overflow: hidden; }
.pr-photo > .pr-open { display: block; border: 0; padding: 0; width: 100%; height: 100%; }
.pr-photo img { display: block; width: 100%; height: 100%; object-fit: contain; }
.pr-photo .pr-heart {
  position: absolute;
  right: 6px;
  top: 6px;
  border: 0;
  background: #ffffffd9;
  font-size: 23px;
  padding: 2px 8px;
}
.pr-heart.active { color: #d84476; }
.pr-photo .pr-prev, .pr-photo .pr-next {
  position: absolute;
  top: 48%;
  min-height: 32px;
  padding: 1px 9px;
  background: #ffffffdb;
  border: 0;
}
.pr-prev { left: 4px; }
.pr-next { right: 4px; }
.pr-dots { display: flex; gap: 4px; position: absolute; bottom: 9px; left: 50%; transform: translateX(-50%); }
.pr-dots i { width: 5px; height: 5px; background: #c7c7c3; border-radius: 50%; }
.pr-dots .on { background: #454d3b; }
.pr-name {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  padding: 8px 0;
  line-height: 1.6;
  min-height: 0;
  overflow-wrap: anywhere;
}
.pr-price { margin: 0; }
.pr-code-shop #pr-more { display: block; margin: 28px auto; }
#pr-more[hidden] { display: none; }
@media (min-width: 38rem) {
  #pr-products { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (min-width: 62rem) {
  #pr-products { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 420px) {
  .pr-code-shop { padding: 10px; }
  header { align-items: flex-start; }
  header div { flex-wrap: wrap; justify-content: flex-end; }
  header strong { font-size: 17px; }
  #pr-search label { max-width: 100%; }
  #pr-query { width: 140px; }
}`,
  js:`(() => {
  'use strict';
  const api = window.Pinkrocket;
  const grid = document.getElementById('pr-products');
  const status = document.getElementById('pr-status');
  const more = document.getElementById('pr-more');
  const nav = document.getElementById('pr-categories');
  let category = api.initial.category;
  let total = api.initial.total;
  let offset = 0;
  let loading = false;
  let revision = 0;

  function notify(message) {
    status.textContent = String(message || '');
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  async function action(name, id) {
    try {
      const result = await api[name](id);
      if (result && result.message) notify(result.message);
      return result;
    } catch (error) {
      notify(error.message);
      return null;
    }
  }

  function renderCategories() {
    nav.replaceChildren();
    for (const item of api.categories) {
      const button = make('button', item.id === category ? 'active' : '', item.label);
      button.type = 'button';
      button.setAttribute('aria-current', item.id === category ? 'page' : 'false');
      button.onclick = () => {
        category = item.id;
        load(true);
      };
      nav.append(button);
    }
  }

  function productCard(product) {
    const item = make('article', 'pr-product');
    item.dataset.product = product.id;
    const photo = make('div', 'pr-photo');
    const open = make('button', 'pr-open');
    const image = make('img');
    const heart = make('button', 'pr-heart', '♡');
    let index = 0;
    open.type = heart.type = 'button';
    open.setAttribute('aria-label', product.name + ' 상세 보기');
    image.alt = product.name;
    image.loading = 'lazy';
    image.decoding = 'async';
    if (product.images[0]) image.src = product.images[0];
    open.append(image);
    open.onclick = () => action('product', product.id);
    photo.append(open);

    function showWished(value) {
      heart.classList.toggle('active', value === true);
      if (typeof value === 'boolean') heart.setAttribute('aria-pressed', String(value));
      else heart.removeAttribute('aria-pressed');
      heart.setAttribute('aria-label', product.name + ' ' + (
        value === true ? '찜 취소' : value === false ? '찜 추가' : '찜 상태 미확인'
      ));
    }

    showWished(product.wished);
    heart.onclick = async () => {
      heart.disabled = true;
      try {
        const result = await action('wish', product.id);
        if (result && result.confirmed === true && typeof result.selected === 'boolean') {
          showWished(result.selected);
        }
      } finally {
        heart.disabled = false;
      }
    };
    photo.append(heart);

    if (product.images.length > 1) {
      const dots = make('span', 'pr-dots');
      dots.setAttribute('role', 'img');
      product.images.forEach(() => {
        const dot = make('i');
        dot.setAttribute('aria-hidden', 'true');
        dots.append(dot);
      });
      function showPhoto() {
        image.src = product.images[index];
        dots.setAttribute('aria-label', '사진 ' + product.images.length + '장 중 ' + (index + 1) + '번째');
        Array.from(dots.children).forEach((dot, i) => dot.classList.toggle('on', i === index));
      }
      for (const [delta, label, className] of [
        [-1, '이전 사진', 'pr-prev'],
        [1, '다음 사진', 'pr-next']
      ]) {
        const button = make('button', className, delta < 0 ? '‹' : '›');
        button.type = 'button';
        button.setAttribute('aria-label', product.name + ' ' + label);
        button.onclick = () => {
          index = (index + delta + product.images.length) % product.images.length;
          showPhoto();
        };
        photo.append(button);
      }
      photo.append(dots);
      showPhoto();
    }

    const name = make('button', 'pr-name', product.name);
    const price = make('p', 'pr-price', Number(product.price).toLocaleString('ko-KR') + '원');
    name.type = 'button';
    name.onclick = () => action('product', product.id);
    item.append(photo, name, price);
    return item;
  }

  function showList(list, reset) {
    if (reset) {
      grid.replaceChildren();
      offset = 0;
    }
    for (const product of list.products) grid.append(productCard(product));
    offset += list.products.length;
    total = list.total;
    more.hidden = offset >= total;
    notify(total.toLocaleString('ko-KR') + '개의 상품');
    renderCategories();
  }

  async function load(reset) {
    if (loading && !reset) return;
    loading = true;
    more.disabled = true;
    const current = ++revision;
    if (reset) {
      grid.replaceChildren();
      offset = 0;
      renderCategories();
    }
    notify('상품을 불러오는 중입니다.');
    try {
      const list = await api.list({
        category,
        query: document.getElementById('pr-query').value,
        sort: document.getElementById('pr-sort').value,
        offset: reset ? 0 : offset,
        limit: 24
      });
      if (current === revision) showList(list, reset);
    } catch (error) {
      if (current === revision) notify(error.message);
    } finally {
      if (current === revision) {
        loading = false;
        more.disabled = false;
      }
    }
  }

  document.getElementById('pr-search-button').onclick = () => load(true);
  document.getElementById('pr-query').onkeydown = event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      load(true);
    }
  };
  document.getElementById('pr-sort').onchange = () => load(true);
  document.getElementById('pr-cart').onclick = () => action('cart');
  document.getElementById('pr-wishlist').onclick = () => action('wishlist');
  more.onclick = () => load(false);
  showList(api.initial, true);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && !more.hidden && !loading) load(false);
    }, { rootMargin: '200px' });
    observer.observe(document.getElementById('pr-sentinel'));
  }
})();`
 };
}
