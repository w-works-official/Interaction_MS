import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {makeshopDetailUrl} from '../dist/model.js';

const channel='pinkrocket-makeshop-v1',childOrigin='https://w-works-official.github.io';
const source=fs.readFileSync(new URL('../integration-main/parent.js',import.meta.url),'utf8');
assert.equal(source.match(/DETAIL_URL_HELPER_PLACEHOLDER/g)?.length,1);
assert.equal(source.match(/DETAIL_VIEW_CSS_PLACEHOLDER/g)?.length,1);
const detailCss=fs.readFileSync(new URL('../integration-main/detail-view.css',import.meta.url),'utf8').replaceAll('\r\n','\n');
assert.equal(source.match(/PRODUCT_WISHLIST_ADAPTER_PLACEHOLDER/g)?.length,1);
const adapterSource=fs.readFileSync(new URL('../integration-main/product-wishlist.js',import.meta.url),'utf8').replace(/^export /m,'').trim();
const template=source.replace('DETAIL_URL_HELPER_PLACEHOLDER',makeshopDetailUrl.toString()).replace('DETAIL_VIEW_CSS_PLACEHOLDER',JSON.stringify(detailCss).replaceAll('<','\\u003c'));
const script=template.replace('PRODUCT_WISHLIST_ADAPTER_PLACEHOLDER',adapterSource);
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const escapeAttribute=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function boot({url='https://www.pink-rocket.com/shop/main.html',cartHref,header='',crypto=true,platform,adapter}={}){
 const page=new URL(url),mobile=page.pathname.startsWith('/m/');
 if(platform===undefined)platform=mobile?'mobile':'pc';
 if(cartHref===undefined)cartHref=mobile?'/m/basket.html':'/shop/basket.html';
 const cartAttribute=cartHref===null?'':` href="${escapeAttribute(cartHref)}"`;
 const errors=[],messages=[],navigations=[],nativeNavigations=[],timers=new Map(),vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(`<!doctype html>${header}<main id="pr-makeshop-main" data-platform="${escapeAttribute(platform)}"><p data-main-status></p><iframe data-shop-frame></iframe><section data-native-dialog hidden><p data-native-status></p><button data-native-close>닫기</button><a data-native-open>상세</a><a data-native-wishlist>찜</a><a data-native-cart${cartAttribute}>장바구니</a><section data-native-auth hidden><a data-native-login>로그인</a><button data-native-retry>상세 다시 확인</button></section><iframe data-native-frame></iframe></section></main>`,{url,runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window,d=w.document,root=d.querySelector('#pr-makeshop-main'),frame=d.querySelector('[data-shop-frame]');
 const nativeSrc=Object.getOwnPropertyDescriptor(w.HTMLIFrameElement.prototype,'src');
 Object.defineProperty(w.HTMLIFrameElement.prototype,'src',{...nativeSrc,set(value){if(this.hasAttribute('data-native-frame'))nativeNavigations.push(String(value));nativeSrc.set.call(this,value);}});
 let nextRequest=0,nextTimer=0;
 if(!crypto)Object.defineProperty(w,'crypto',{value:null});
 w.setTimeout=callback=>{timers.set(++nextTimer,callback);return nextTimer;};w.clearTimeout=id=>timers.delete(id);
 const locationFacade={href:page.href,origin:page.origin,pathname:page.pathname,search:page.search,assign:href=>navigations.push(String(href))};
 const adapterCalls=[];
 const wishlistAdapter=adapter||{busy:false,refresh:async()=>({state:'ready',ids:[]}),toggle:async id=>({state:'ready',ids:[id],id,selected:true,changed:true})};
 const wrappedAdapter={get busy(){return wishlistAdapter.busy;},refresh(){adapterCalls.push({action:'refresh'});return wishlistAdapter.refresh();},toggle(id){adapterCalls.push({action:'toggle',id});return wishlistAdapter.toggle(id);}};
 w.Function('location','createAdapter',template.replace('PRODUCT_WISHLIST_ADAPTER_PLACEHOLDER','createAdapter'))(locationFacade,()=>wrappedAdapter);
 const session=()=>new URL(frame.src).searchParams.get('session');
 const send=(action,id,overrides={},event={})=>{
  const requestId=overrides.requestId??++nextRequest;nextRequest=Math.max(nextRequest,requestId||0);
  frame.contentWindow.postMessage=(data,targetOrigin)=>messages.push({data,targetOrigin});
  w.dispatchEvent(new w.MessageEvent('message',{source:frame.contentWindow,origin:childOrigin,...event,
   data:{channel,session:session(),requestId,action,...(id===undefined?{}:{id}),...overrides}}));
  return requestId;
 };
 const hello=()=>send('hello',undefined,{requestId:1});
 return {w,d,root,frame,adapterCalls,get native(){return root.querySelector('[data-native-frame]');},errors,messages,navigations,nativeNavigations,timers,session,send,hello,
  status:()=>d.querySelector('[data-native-status]').textContent,
  mainStatus:()=>d.querySelector('[data-main-status]'),
  dialog:()=>d.querySelector('[data-native-dialog]'),
  auth:()=>d.querySelector('[data-native-auth]'),
  last:action=>messages.filter(item=>item.data.action===action).at(-1)?.data,
  close:()=>w.close()};
}
function loadNative(h,{href=h.native.src,mobile=false,form=true,wish=true,cart=true,wishOutside=false,duplicateCart=false,beforeLoad,
 wishHref='javascript:send_wish();',formId='form1',formName='form1',productIds,detailRoot=true,jquery=true,onWish}={}){
 h.native.src=href;
 const doc=h.native.contentDocument,calls=[],alerts=[],ajaxHandlers=new Map(),uid=new URL(href).searchParams.get('branduid');
 const wishMarkup=wish?`<a data-wish class="btn_wish" href="${escapeAttribute(wishHref)}">원본 찜</a>`:'';
 const cartMarkup=cart?`<a ${mobile?'class="cart"':'id="cartBtn"'} href="javascript:send_multi(\'\', \'\');">원본 담기</a>`:'';
 const hiddenIds=(productIds??[uid]).map(id=>`<input type="hidden" name="branduid" value="${escapeAttribute(id)}">`).join('');
 doc.open();doc.write(`<!doctype html><body>${detailRoot?`<main ${mobile?'class="shopdetail"':'id="productDetail"'}>`:''}${wishOutside?wishMarkup:''}${form?`<form id="${escapeAttribute(formId)}" name="${escapeAttribute(formName)}">${hiddenIds}`:''}<label>옵션<select name="option"><option value="">선택</option><option value="silver">실버</option></select></label><input name="quantity" value="1">${wishOutside?'':wishMarkup}${duplicateCart?`<div class="buy_on" style="display:none"><div class="shopdetailButtonTop">${cartMarkup}</div></div>`:''}<div class="shopdetailButton"><div class="shopdetailButtonTop">${cartMarkup}</div></div>${form?'</form>':''}${detailRoot?'</main>':''}</body>`);doc.close();
 const originalAlert=message=>alerts.push(String(message));doc.defaultView.alert=originalAlert;
 if(jquery)doc.defaultView.jQuery=target=>{
  assert.equal(target,doc);
  const api={on(event,handler){ajaxHandlers.set(event,handler);return api;},off(event){for(const key of ajaxHandlers.keys())if(!event||key===event||key.endsWith(event))ajaxHandlers.delete(key);return api;}};
  return api;
 };
 const ajaxSettings=settings=>({type:'POST',url:mobile?'/m/wish.action.html':'/shop/wish.action.html',data:new URLSearchParams({branduid:uid,wish_action_type:'insert',wish_data_type:'ones'}).toString(),...settings});
 let lastAjaxXhr=null;
 const emitAjaxSend=(settings={},xhr={})=>{
  lastAjaxXhr=xhr;
  for(const [name,handler] of [...ajaxHandlers])if(name.split('.')[0]==='ajaxSend')handler.call(doc,{type:'ajaxSend',target:doc},xhr,ajaxSettings(settings));
  return xhr;
 };
 const emitAjaxComplete=(xhr,settings={},response={success:true,data:{id:uid}},properties={})=>{
  Object.assign(xhr,{status:200,responseText:JSON.stringify(response)},properties);
  for(const [name,handler] of [...ajaxHandlers])if(name.split('.')[0]==='ajaxComplete')handler.call(doc,{type:'ajaxComplete',target:doc},xhr,ajaxSettings(settings));
  return xhr;
 };
 const emitAjax=(settings={},response={success:true,data:{id:uid}},properties={})=>emitAjaxComplete(lastAjaxXhr??emitAjaxSend(settings),settings,response,properties);
 const wishButton=doc.querySelector('[data-wish]'),cartButton=doc.querySelector('#cartBtn, a.cart');
 for(const node of doc.querySelectorAll('[data-wish], #cartBtn, a.cart'))node.addEventListener('click',event=>{event.preventDefault();const kind=node.matches('[data-wish]')?'wish':'cart';calls.push({kind,option:doc.querySelector('select').value,quantity:doc.querySelector('[name="quantity"]').value});if(kind==='wish')onWish?.({doc,frame:h.native,emitAjaxSend,emitAjax,calls,alerts});});
 beforeLoad?.(doc);
 h.native.dispatchEvent(new h.w.Event('load'));
 return {doc,wishButton,cartButton,calls,alerts,ajaxHandlers,emitAjaxSend,emitAjaxComplete,emitAjax,originalAlert};
}
function assertLoginHandoff(h,mobile=false){
 const link=h.d.querySelector('[data-native-login]'),origin=new URL(h.frame.src).searchParams.get('parentOrigin');
 assert.equal(h.auth().hidden,false);assert.equal(h.dialog().hidden,false);assert.equal(h.native.hidden,true);assert.equal(h.native.hasAttribute('src'),false);
 assert.equal(h.frame.inert,true);assert.equal(link.href,origin+(mobile?'/m/login.html':'/shop/member.html'));
 assert.equal(link.target,'_blank');assert.ok(link.rel.split(/\s+/).includes('noopener'));assert.equal(new URL(link.href).search,'');assert.deepEqual(h.navigations,[]);
}

test('hello reads account wishlist once without loading product detail or executing an account toggle',async()=>{
 const h=boot({adapter:{busy:false,refresh:async()=>({state:'ready',ids:['2085891']}),toggle:()=>{throw Error('unexpected toggle');}}});
 try{
  h.hello();h.hello();await settle();
  assert.deepEqual(h.adapterCalls,[{action:'refresh'}]);assert.deepEqual(h.nativeNavigations,[]);
  const snapshot=h.last('wishlist-state');assert.equal(snapshot.requestId,1);assert.equal(snapshot.platform,'pc');assert.equal(snapshot.state,'ready');assert.deepEqual(snapshot.ids,['2085891']);
  assert.equal(h.dialog().hidden,true);assert.equal(h.frame.inert,false);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('main wish uses the product adapter without product form, native detail click, or option validation',async()=>{
 for(const mobile of [false,true]){
  let finish;const adapter={busy:false,refresh:async()=>({state:'ready',ids:[]}),toggle:id=>new Promise(resolve=>{finish=resolve;})};
  const h=boot({url:mobile?'https://pink-rocket.com/m/':'https://www.pink-rocket.com/shop/main.html',adapter});
  try{
   h.hello();await settle();const original=h.native,requestId=h.send('wish','2085891');
   assert.equal(h.native,original);assert.equal(h.native.hasAttribute('src'),false);assert.deepEqual(h.nativeNavigations,[]);assert.equal(h.dialog().hidden,true);assert.equal(h.frame.inert,true);
   h.send('wish','2085891');h.send('wish','2085889');h.send('wish','2085891',{requestId});
   assert.deepEqual(h.adapterCalls.filter(x=>x.action==='toggle'),[{action:'toggle',id:'2085891'}]);
   finish({state:'ready',ids:['2085891'],id:'2085891',selected:true,changed:true});await settle();
   assert.equal(h.frame.inert,false);assert.equal(h.dialog().hidden,true);assert.match(h.mainStatus().textContent,/登録|등록된 것을 확인/);
   const snapshot=h.last('wishlist-state');assert.equal(snapshot.requestId,requestId);assert.equal(snapshot.selected,true);assert.deepEqual(snapshot.ids,['2085891']);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('verified removal is reported as removal rather than registration',async()=>{
 const h=boot({adapter:{busy:false,refresh:async()=>({state:'ready',ids:['2085891']}),toggle:async id=>({state:'ready',ids:[],id,selected:false,changed:true})}});
 try{h.hello();await settle();h.send('wish','2085891');await settle();assert.match(h.mainStatus().textContent,/해제된 것을 확인/);assert.doesNotMatch(h.mainStatus().textContent,/등록된 것을 확인/);assert.equal(h.last('wishlist-state').selected,false);assert.equal(h.frame.inert,false);}finally{h.close();}
});

test('guest product wishlist hands off to plain login without opening detail and retry only opens the product',async()=>{
 for(const mobile of [false,true]){
  const h=boot({url:mobile?'https://www.pink-rocket.com/m/':'https://www.pink-rocket.com/shop/main.html',adapter:{busy:false,refresh:async()=>({state:'login',ids:[]}),toggle:async()=>({state:'login',ids:[]})}});
  try{
   h.hello();await settle();h.send('wish','2085891');await settle();assert.deepEqual(h.nativeNavigations,[]);assertLoginHandoff(h,mobile);
   h.d.querySelector('[data-native-retry]').click();const fresh=loadNative(h,{mobile,beforeLoad:doc=>doc.defaultView.scrollTo=()=>{}});
   assert.deepEqual(fresh.calls,[]);assert.equal(h.adapterCalls.filter(x=>x.action==='toggle').length,1);assert.equal(h.dialog().hidden,false);assert.equal(h.auth().hidden,true);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('wishlist uncertainty never opens or clicks detail, reports no success and carries no invented account IDs',async()=>{
 for(const state of ['unknown','error','busy']){
  const h=boot({adapter:{busy:false,refresh:async()=>({state:'ready',ids:[]}),toggle:async id=>({state,id,message:'처리 결과를 확인하지 못했습니다.',ids:['2085891']})}});
  try{h.hello();await settle();h.send('wish','2085891');await settle();assert.deepEqual(h.nativeNavigations,[]);assert.equal(h.dialog().hidden,true);assert.equal(h.frame.inert,false);const snapshot=h.last('wishlist-state');assert.equal(snapshot.state,state);assert.equal('ids' in snapshot,false);assert.doesNotMatch(h.mainStatus().textContent,/등록된 것을 확인|해제된 것을 확인/);assert.deepEqual(h.errors,[]);}finally{h.close();}
 }
});

test('an old wishlist completion cannot update a new bridge session or execute a second toggle',async()=>{
 let finish;const h=boot({adapter:{busy:false,refresh:async()=>({state:'ready',ids:[]}),toggle:id=>new Promise(resolve=>finish=resolve)}});
 try{
  h.hello();await settle();h.frame.dispatchEvent(new h.w.Event('load'));h.send('wish','2085891');const old=h.session();h.frame.dispatchEvent(new h.w.Event('load'));assert.notEqual(h.session(),old);h.hello();await settle();const count=h.messages.length;
  finish({state:'ready',ids:['2085891'],id:'2085891',selected:true,changed:true});await settle();
  assert.equal(h.messages.length,count);assert.equal(h.adapterCalls.filter(x=>x.action==='toggle').length,1);assert.doesNotMatch(h.mainStatus().textContent,/등록된 것을 확인/);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('main parent creates a fixed HTTPS child with explicit origin, platform and a fresh per-page session',()=>{
 for(const fixture of [
  {url:'https://www.pink-rocket.com/shop/main.html',platform:'pc'},
  {url:'https://pink-rocket.com/m/',platform:'mobile'},
  {url:'https://www.pink-rocket.com/preview/main.html',platform:'mobile'},
  {url:'https://www.pink-rocket.com/m/',platform:'pc'}
 ]){
  const h=boot(fixture);
  try{
   const url=new URL(h.frame.src);assert.equal(url.origin,childOrigin);assert.equal(url.pathname,'/Interaction_MS/');
   assert.equal(url.searchParams.get('parentOrigin'),new URL(fixture.url).origin);assert.equal(url.searchParams.get('platform'),fixture.platform);
   assert.equal(url.searchParams.get('frame'),'1');assert.equal(url.searchParams.get('bridge'),'makeshop');assert.match(h.session(),/^\d{1,10}(?:-\d{1,10}){3}$/);
   assert.equal(h.root.dataset.bridgeState,'loading');assert.equal(h.frame.inert,true);assert.equal(h.mainStatus().hidden,false);assert.equal(h.dialog().hidden,true);assert.deepEqual(h.navigations,[]);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
 const first=boot(),second=boot();try{assert.notEqual(first.session(),second.session());}finally{first.close();second.close();}
});

test('unsupported parents and missing crypto do not load an external child or start native requests',()=>{
 for(const fixture of [{url:'https://other.example/'},{url:'http://www.pink-rocket.com/'},{crypto:false},{platform:'mo'},{platform:''}]){
  const h=boot(fixture);try{assert.equal(h.root.dataset.bridgeState,'blocked');assert.equal(h.frame.hasAttribute('src'),false);assert.equal(h.frame.inert,true);assert.deepEqual(h.navigations,[]);assert.match(h.mainStatus().textContent,/HTTPS/);}finally{h.close();}
 }
});

test('hello retries are idempotent and the initial load cannot erase a completed early handshake',()=>{
 const h=boot();try{
  h.hello();assert.equal(h.root.dataset.bridgeState,'ready');assert.equal(h.last('init').requestId,1);assert.equal(h.last('init').platform,'pc');
  assert.equal(h.frame.inert,false);assert.equal(h.mainStatus().hidden,true);assert.equal(h.timers.size,0);
  h.hello();assert.equal(h.messages.filter(item=>item.data.action==='init').length,2);
  h.frame.dispatchEvent(new h.w.Event('load'));assert.equal(h.root.dataset.bridgeState,'ready');
  h.send('options','2085891');assert.equal(h.dialog().hidden,false);assert.equal(h.frame.inert,true);
  const accepted=h.messages.length;h.hello();assert.equal(h.messages.length,accepted,'old hello cannot reset request ordering');
  assert.ok(h.messages.every(item=>item.targetOrigin===childOrigin));assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('foreign origins, wrong source/session/channel, unsupported actions and replayed requests cannot navigate or open detail',()=>{
 const h=boot();try{
  h.send('options','2085891');assert.equal(h.dialog().hidden,true,'no actions before hello');h.hello();
  for(const [overrides,event] of [
   [{},{origin:'null'}],[{},{origin:'https://foreign.example'}],[{},{source:h.w}],
   [{session:'1-2-3-4'},{}],[{channel:'pinkrocket-preview-v1'},{}],[{action:'execute-cart'},{}],
   [{requestId:1.5},{}],[{requestId:Number.MAX_SAFE_INTEGER+1},{}],[{requestId:-1},{}]
  ])h.send('options','2085891',overrides,event);
  assert.equal(h.dialog().hidden,true);assert.deepEqual(h.navigations,[]);
  h.send('options','2085891',{requestId:50});const count=h.messages.length;
  h.send('detail','2085889',{requestId:50});h.send('cart',undefined,{requestId:49});
  assert.equal(h.messages.length,count);assert.deepEqual(h.navigations,[]);assert.match(h.native.src,/branduid=2085891$/);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('product actions require strict string IDs and use canonical URLs without original main product nodes',()=>{
 const h=boot();try{
  h.hello();for(const id of [undefined,null,2085891,'','0','01','-1','1.2',' 2085891','2085891 ','2085891\n','2085891&x=1','https://bad.example'])h.send('options',id);
  assert.equal(h.dialog().hidden,true);assert.deepEqual(h.navigations,[]);
  h.send('product','2085891');assert.equal(h.native.src,'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085891');assert.equal(h.dialog().hidden,false);
  assert.equal(h.d.querySelector('.my-wish-list'),null);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('PC and mobile detail/wishlist/cart requests navigate only the parent native routes',()=>{
 for(const mobile of [false,true]){
  const h=boot({url:mobile?'https://pink-rocket.com/m/':'https://www.pink-rocket.com/shop/main.html'});try{
   h.hello();const origin=new URL(h.frame.src).searchParams.get('parentOrigin');
   h.send('detail','2085891');h.send('wishlist');h.send('cart');
   assert.deepEqual(h.navigations,[origin+(mobile?'/m/product.html':'/shop/shopdetail.html')+'?branduid=2085891',origin+(mobile?'/m/wishlist.html':'/shop/mypage.html?mypage_type=mywishlist'),origin+(mobile?'/m/basket.html':'/shop/basket.html')]);
   assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('product requests display the verified PC/mobile native detail from its top without requiring action controls',()=>{
 for(const mobile of [false,true]){
  const h=boot({url:mobile?'https://www.pink-rocket.com/m/':'https://www.pink-rocket.com/shop/main.html'});try{
   h.hello();const requestId=h.send('product','2085891'),url='https://www.pink-rocket.com'+(mobile?'/m/product.html':'/shop/shopdetail.html')+'?branduid=2085891',scrolls=[];
   assert.equal(h.native.src,url);assert.equal(h.dialog().hidden,false);assert.deepEqual(h.navigations,[]);
   const loaded=loadNative(h,{mobile,form:false,wish:false,cart:false,beforeLoad:doc=>{doc.defaultView.scrollTo=(...args)=>scrolls.push(args);}});
   assert.equal(loaded.doc.URL,url);assert.deepEqual(scrolls,[[0,0]]);assert.equal(loaded.doc.activeElement,loaded.doc.body);
   assert.match(h.status(),/2085891.*원본 상품 상세/);assert.doesNotMatch(h.status(),/버튼.*찾지 못|성공|저장됐/);
   assert.equal(h.last('status').requestId,requestId);assert.deepEqual(loaded.calls,[]);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('native cart navigation rejects foreign/javascript links and explicitly malformed paths',()=>{
 for(const cartHref of ['javascript:alert(1)','https://foreign.example/shop/basket.html','#cart','/','/shop/native_basket.html?from=skin','/m/basket.html',' /shop/basket.html','/shop/\nbasket.html','<!--/another_tag/-->','https://user:password@www.pink-rocket.com/shop/basket.html']){
  const h=boot({cartHref});try{h.hello();h.send('cart');assert.equal(h.last('accepted'),undefined,'invalid native URL is rejected before accepted');h.d.querySelector('[data-native-cart]').click();assert.deepEqual(h.navigations,[],cartHref);assert.match(h.status(),/장바구니 링크/);assert.deepEqual(h.errors,[]);}finally{h.close();}
 }
 for(const mobile of [false,true]){
  const path=mobile?'/m/basket.html':'/shop/basket.html',h=boot({url:mobile?'https://www.pink-rocket.com/m/':'https://www.pink-rocket.com/shop/main.html',cartHref:path+'?from=skin#cart'});
  try{h.hello();h.send('cart');assert.deepEqual(h.navigations,['https://www.pink-rocket.com'+path]);assert.deepEqual(h.errors,[]);}finally{h.close();}
 }
});

test('missing, empty and exactly unresolved cart links use only the canonical parent-origin PC/mobile cart route',()=>{
 for(const mobile of [false,true])for(const cartHref of [null,'','<!--/link_basket/-->']){
  const h=boot({url:mobile?'https://pink-rocket.com/m/':'https://www.pink-rocket.com/shop/main.html',cartHref});try{
   const expected=(mobile?'https://pink-rocket.com/m/basket.html':'https://www.pink-rocket.com/shop/basket.html');
   assert.equal(h.d.querySelector('[data-native-cart]').href,expected);h.hello();h.send('cart');assert.deepEqual(h.navigations,[expected]);assert.ok(h.last('accepted'));assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('mobile visible cart controls are preferred over hidden duplicates and every native cart candidate is observed',()=>{
 const h=boot({url:'https://www.pink-rocket.com/m/'});try{
  h.hello();h.send('options','2085891');
  const loaded=loadNative(h,{mobile:true,duplicateCart:true,beforeLoad:doc=>{
   const buttons=[...doc.querySelectorAll('a.cart')];buttons[0].getClientRects=()=>[];buttons[1].getClientRects=()=>[{width:80,height:30}];
  }}),buttons=[...loaded.doc.querySelectorAll('a.cart')];
  assert.equal(loaded.doc.activeElement,buttons[1]);assert.deepEqual(loaded.calls,[]);
  buttons[1].click();assert.equal(loaded.calls.length,1);assert.match(h.status(),/원본 버튼을 직접 눌렀/);
  buttons[0].click();assert.equal(loaded.calls.length,2);assert.match(h.status(),/원본 버튼을 직접 눌렀/);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('options preserve native form values and never invoke a cart or wish button automatically',()=>{
 for(const mobile of [false,true]){
  const h=boot({url:mobile?'https://www.pink-rocket.com/m/':'https://www.pink-rocket.com/shop/main.html'});try{
   h.hello();const requestId=h.send('options','2085891'),loaded=loadNative(h,{mobile,wishOutside:mobile});assert.deepEqual(loaded.calls,[]);
   if(mobile)assert.equal(loaded.wishButton.closest('form'),null,'actual mobile wish control sits outside the product form');
   assert.match(h.status(),/직접 눌러주세요/);assert.equal(h.last('status').requestId,requestId);assert.equal(h.timers.size,0);
   loaded.doc.querySelector('select').value='silver';loaded.doc.querySelector('[name="quantity"]').value='2';
   loaded.cartButton.click();
   assert.deepEqual(loaded.calls,[{kind:'cart',option:'silver',quantity:'2'}]);
   assert.match(h.status(),/실제 반영을 확인/);assert.doesNotMatch(h.status(),/성공|완료|저장됐/);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('retry after login opens only fresh product detail and never repeats the pending wish automatically',()=>{
 for(const mobile of [false,true]){
  const h=boot({url:mobile?'https://www.pink-rocket.com/m/':'https://www.pink-rocket.com/shop/main.html'});try{
   h.hello();h.send('options','2085891');const guest=loadNative(h,{mobile,href:'https://www.pink-rocket.com/shop/member.html'});assertLoginHandoff(h,mobile);
   const placeholder=h.native;h.nativeNavigations.length=0;h.d.querySelector('[data-native-retry]').click();
   const expected='https://www.pink-rocket.com'+(mobile?'/m/product.html':'/shop/shopdetail.html')+'?branduid=2085891';
   assert.notEqual(h.native,placeholder);assert.equal(placeholder.isConnected,false);assert.deepEqual(h.nativeNavigations,[expected]);
   assert.equal(h.auth().hidden,true);assert.equal(h.native.hidden,false);assert.equal(h.dialog().hidden,false);
   const fresh=loadNative(h,{mobile,beforeLoad:doc=>{doc.defaultView.scrollTo=()=>{};}});
   assert.deepEqual(fresh.calls,[]);assert.deepEqual(guest.calls,[]);assert.equal(fresh.ajaxHandlers.size,0);assert.equal(fresh.doc.URL,expected);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('login routes and cross-origin OAuth responses are removed from the native frame without copying their URLs',()=>{
 for(const mobile of [false,true])for(const path of ['/shop/member.html?type=wish&branduid=2085891','/m/login.html?return_url=bad','/m/member.html','/list/API/login_naver.html','https://nid.naver.com/oauth2.0/authorize?client_id=mock','https://foreign.example/provider/callback']){
  const h=boot({url:mobile?'https://www.pink-rocket.com/m/':'https://www.pink-rocket.com/shop/main.html'});try{
   h.hello();h.send('options','2085891');const loaded=loadNative(h,{mobile,href:new URL(path,'https://www.pink-rocket.com').href});
   assert.deepEqual(loaded.calls,[]);assertLoginHandoff(h,mobile);assert.equal(loaded.doc.querySelector('style[data-pr-detail-style]'),null);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('native password-login forms trigger a parent handoff before product styling or account actions',()=>{
 for(const name of ['form1','login_form']){
  const h=boot();try{
   h.hello();h.send('options','2085891');const loaded=loadNative(h,{beforeLoad:doc=>{
    const form=doc.createElement('form');form.name=name;form.innerHTML='<input type="password" name="passwd">';doc.body.prepend(form);
   }});
   assert.deepEqual(loaded.calls,[]);assertLoginHandoff(h);assert.equal(loaded.doc.documentElement.hasAttribute('data-pr-detail-view'),false);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('known login and provider anchors in a verified product document are captured before iframe navigation',()=>{
 for(const href of ['/shop/member.html?type=wish&branduid=2085891','/m/login.html','/list/API/login_kakao.html','https://nid.naver.com/oauth2.0/authorize','https://kauth.kakao.com/oauth/authorize','https://accounts.kakao.com/login','javascript:login_chk_wish();']){
  const h=boot();try{
   h.hello();h.send('product','2085891');const loaded=loadNative(h,{beforeLoad:doc=>{doc.defaultView.scrollTo=()=>{};}}),anchor=loaded.doc.createElement('a');
   anchor.href=href;anchor.textContent='로그인';loaded.doc.body.append(anchor);
   const event=new h.w.MouseEvent('click',{bubbles:true,cancelable:true});anchor.dispatchEvent(event);
   assert.equal(event.defaultPrevented,true,href);assertLoginHandoff(h);assert.deepEqual(loaded.calls,[]);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('known login form submissions are captured while unrelated origins, paths and javascript links stay untouched',()=>{
 for(const action of ['/shop/member.html','/m/login.html','https://nid.naver.com/oauth2.0/authorize']){
  const h=boot();try{
   h.hello();h.send('product','2085891');const loaded=loadNative(h,{beforeLoad:doc=>{doc.defaultView.scrollTo=()=>{};}}),form=loaded.doc.createElement('form');
   form.action=action;loaded.doc.body.append(form);const event=new h.w.Event('submit',{bubbles:true,cancelable:true});form.dispatchEvent(event);
   assert.equal(event.defaultPrevented,true);assertLoginHandoff(h);assert.deepEqual(loaded.calls,[]);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
 for(const href of ['/shop/not-member.html','https://foreign.example/shop/member.html','https://nid.naver.com.evil.example/login','https://nid.naver.com@foreign.example/login','http://nid.naver.com/login','javascript:other_function();']){
  const h=boot();try{
   h.hello();h.send('product','2085891');const loaded=loadNative(h,{beforeLoad:doc=>{doc.defaultView.scrollTo=()=>{};}}),anchor=loaded.doc.createElement('a');
   anchor.href=href;loaded.doc.body.append(anchor);let intercepted;
   anchor.addEventListener('click',event=>{intercepted=event.defaultPrevented;event.preventDefault();});
   anchor.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true,cancelable:true}));
   assert.equal(intercepted,false,href);assert.equal(h.auth().hidden,true);assert.equal(h.native.hidden,false);assert.deepEqual(loaded.calls,[]);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('closing or rotating the login handoff invalidates retry and stale native events',()=>{
 const h=boot();try{
  h.hello();h.frame.dispatchEvent(new h.w.Event('load'));h.send('options','2085891');const stale=h.native,guest=loadNative(h,{href:'https://www.pink-rocket.com/shop/member.html'});assertLoginHandoff(h);
  h.d.querySelector('[data-native-close]').click();const count=h.nativeNavigations.length;h.d.querySelector('[data-native-retry]').click();
  assert.equal(h.nativeNavigations.length,count);assert.equal(h.auth().hidden,true);assert.equal(h.dialog().hidden,true);
  stale.dispatchEvent(new h.w.Event('load'));assert.deepEqual(guest.calls,[]);
  h.send('options','2085891');loadNative(h,{href:'https://www.pink-rocket.com/shop/member.html'});h.frame.dispatchEvent(new h.w.Event('load'));
  const rotated=h.nativeNavigations.length;h.d.querySelector('[data-native-retry]').click();assert.equal(h.nativeNavigations.length,rotated);assert.equal(h.auth().hidden,true);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('detail CSS and its marker are applied only to verified supported product documents',()=>{
 for(const fixture of [{},{mobile:true},{detailRoot:false},{href:'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085889'}]){
  const h=boot({url:fixture.mobile?'https://www.pink-rocket.com/m/':'https://www.pink-rocket.com/shop/main.html'});try{
   h.hello();h.send('options','2085891');let resizes=0;
   const loaded=loadNative(h,{...fixture,beforeLoad:doc=>doc.defaultView.addEventListener('resize',()=>resizes++)});
   const styled=fixture.detailRoot!==false&&!fixture.href,style=loaded.doc.querySelector('style[data-pr-detail-style]');
   assert.equal(loaded.doc.documentElement.hasAttribute('data-pr-detail-view'),styled);
   if(styled){assert.equal(style.textContent,detailCss);assert.equal(resizes,1);h.native.dispatchEvent(new h.w.Event('load'));assert.equal(loaded.doc.querySelectorAll('style[data-pr-detail-style]').length,1);}
   else assert.equal(style,null);
   assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('native redirects, duplicate/wrong product IDs, missing forms and missing buttons are reported without account writes',()=>{
 const cases=[
  {href:'https://foreign.example/shop/shopdetail.html?branduid=2085891',login:true},
  {href:'https://www.pink-rocket.com/shop/member.html?branduid=2085891',login:true},
  {href:'https://www.pink-rocket.com/other/shopdetail.html?branduid=2085891'},
  {href:'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085889'},
  {href:'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085891&branduid=2085891'},
  {form:false},{cart:false}
 ];
 for(const fixture of cases){
  const h=boot();try{h.hello();h.send('options','2085891');const loaded=loadNative(h,fixture);assert.deepEqual(loaded.calls,[]);assert.match(h.status(),fixture.login?/로그인/:/확인|찾지 못/);assert.equal(h.d.querySelector('[data-native-open]').href,'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085891');assert.deepEqual(h.errors,[]);}finally{h.close();}
 }
});

test('a changed product form is blocked before its original account handler can run',()=>{
 for(const mutate of [
  ({doc,cartButton})=>doc.body.append(cartButton),
  ({doc,cartButton})=>{cartButton.removeAttribute('id');},
  ({cartButton})=>cartButton.setAttribute('href','javascript:other_function();'),
  ({doc})=>doc.defaultView.history.replaceState(null,'','/shop/shopdetail.html?branduid=2085889')
 ]){
  const h=boot();try{h.hello();h.send('options','2085891');const loaded=loadNative(h);mutate(loaded);loaded.cartButton.click();assert.deepEqual(loaded.calls,[]);assert.match(h.status(),/바뀌었습니다/);assert.deepEqual(h.errors,[]);}finally{h.close();}
 }
});

test('replacement, closing and iframe reload invalidate old native requests and rotate the session safely',()=>{
 const h=boot();try{
  h.hello();h.frame.dispatchEvent(new h.w.Event('load'));h.send('options','2085891');const first=loadNative(h);
  h.send('options','2085889');assert.match(h.native.src,/branduid=2085889$/);assert.deepEqual(first.calls,[]);
  h.d.querySelector('[data-native-close]').click();assert.equal(h.dialog().hidden,true);assert.match(h.native.src,/branduid=2085889$/);assert.equal(h.timers.size,0);
  assert.equal(h.frame.inert,false);assert.equal(h.d.activeElement,h.frame);
  const previous=h.session();h.send('options','2085891');h.frame.dispatchEvent(new h.w.Event('load'));assert.notEqual(h.session(),previous);assert.equal(h.root.dataset.bridgeState,'loading');assert.equal(h.dialog().hidden,true);
  h.send('hello',undefined,{requestId:1,session:previous});assert.equal(h.root.dataset.bridgeState,'loading');
  h.hello();const next=h.session();h.frame.dispatchEvent(new h.w.Event('load'));assert.equal(h.session(),next);assert.equal(h.root.dataset.bridgeState,'ready');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('each open uses a fresh native context and obsolete frame events cannot affect its request',()=>{
 const h=boot();try{
  assert.deepEqual(h.nativeNavigations,[],'initial session leaves the unused detail frame alone');
  const initial=h.native;h.hello();h.send('options','2085891');assert.notEqual(h.native,initial);assert.equal(initial.isConnected,false);
  assert.deepEqual(h.nativeNavigations,['https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085891']);
  const previous=h.native,old=loadNative(h);h.nativeNavigations.length=0;h.send('options','2085889');
  assert.deepEqual(h.nativeNavigations,['https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085889']);
  assert.notEqual(h.native,previous);assert.equal(previous.isConnected,false);assert.notEqual(h.native.contentDocument,old.doc);
  const loading=h.status();previous.dispatchEvent(new h.w.Event('load'));previous.dispatchEvent(new h.w.Event('error'));
  assert.equal(h.status(),loading);assert.equal(h.timers.size,1,'obsolete load/error cannot clear the current timeout');assert.deepEqual(old.calls,[]);
  const next=loadNative(h);h.nativeNavigations.length=0;h.d.querySelector('[data-native-close]').click();
  assert.deepEqual(h.nativeNavigations,[],'closing invalidates the request without navigating the hidden frame');
  assert.equal(h.dialog().hidden,true);next.wishButton.click();assert.deepEqual(next.calls,[],'closed request cannot invoke an old native control');
  h.d.querySelector('[data-native-close]').click();assert.deepEqual(h.nativeNavigations,[],'closing an already closed dialog does not navigate');
  const closed=h.native;h.send('options','2085891');assert.notEqual(h.native,closed);assert.equal(closed.isConnected,false);
  assert.deepEqual(h.nativeNavigations,['https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085891']);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('PC/mobile paste artifacts embed the current parent and shared helper without stale build placeholders',()=>{
 for(const [file,platform] of [['01_MAIN_IFRAME_PC.txt','pc'],['02_MAIN_IFRAME_MOBILE.txt','mobile']]){
  const paste=fs.readFileSync(new URL('../integration-main/'+file,import.meta.url),'utf8');
  const dom=new JSDOM(paste);
  try{
   const d=dom.window.document,scripts=[...d.querySelectorAll('script')];assert.equal(scripts.length,1,file);
   assert.equal(scripts[0].textContent.trim().replaceAll('\r\n','\n'),script.trim().replaceAll('\r\n','\n'),file+' must be regenerated after parent/helper changes');
   assert.equal(d.querySelector('#pr-makeshop-main').dataset.platform,platform);assert.ok(d.querySelector('[data-main-status]'));
   assert.ok(d.querySelector('[data-native-cart]'));assert.ok(d.querySelector('[data-native-auth] [data-native-login]'));assert.ok(d.querySelector('[data-native-auth] [data-native-retry]'));
   assert.equal(d.querySelector('[data-native-cart]').hasAttribute('href'),false,'cart starts without a template URL and is set by the verified platform rule');
   assert.match(paste,/PINKROCKET_MAIN_IFRAME_PREVIEW_START/);assert.match(paste,/PINKROCKET_MAIN_IFRAME_PREVIEW_END/);
   assert.doesNotMatch(paste,/PRODUCT_WISHLIST_ADAPTER_PLACEHOLDER|DETAIL_URL_HELPER_PLACEHOLDER|DETAIL_VIEW_CSS_PLACEHOLDER|PLATFORM_PLACEHOLDER|PARENT_SCRIPT|pinkrocket-preview-v1|pr-preview-test-v1/);
  }finally{dom.window.close();}
 }
});

test('handshake timeout and frame errors keep the main inert and a late valid hello can recover',()=>{
 const h=boot();try{
  assert.equal(h.timers.size,1);for(const callback of [...h.timers.values()])callback();
  assert.equal(h.root.dataset.bridgeState,'blocked');assert.equal(h.mainStatus().hidden,false);assert.equal(h.frame.inert,true);
  h.hello();assert.equal(h.root.dataset.bridgeState,'ready');assert.equal(h.mainStatus().hidden,true);assert.equal(h.frame.inert,false);
  h.send('options','2085891');h.frame.dispatchEvent(new h.w.Event('error'));
  assert.equal(h.root.dataset.bridgeState,'blocked');assert.equal(h.dialog().hidden,true);assert.equal(h.frame.inert,true);assert.equal(h.mainStatus().hidden,false);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('Escape from inside the same-origin native detail closes the modal and restores iframe focus',()=>{
 const h=boot();try{
  h.hello();h.send('options','2085891');const loaded=loadNative(h,{mobile:true,wishOutside:true});
  loaded.doc.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(h.dialog().hidden,true);assert.equal(h.frame.inert,false);assert.equal(h.d.activeElement,h.frame);assert.match(h.native.src,/branduid=2085891$/);assert.deepEqual(loaded.calls,[]);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('a detail loading timeout reports the fallback and native navigation links stay on the parent origin',()=>{
 const h=boot();try{
  h.hello();h.send('options','2085891');assert.equal(h.timers.size,1);for(const callback of [...h.timers.values()])callback();assert.match(h.status(),/원본 상세 열기/);assert.equal(h.dialog().hidden,false);
  h.d.querySelector('[data-native-open]').click();h.d.querySelector('[data-native-wishlist]').click();h.d.querySelector('[data-native-cart]').click();
  assert.deepEqual(h.navigations,['https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085891','https://www.pink-rocket.com/shop/mypage.html?mypage_type=mywishlist','https://www.pink-rocket.com/shop/basket.html']);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
