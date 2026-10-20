import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {makeshopDetailUrl} from '../dist/model.js';

const channel='pinkrocket-makeshop-v1',childOrigin='https://w-works-official.github.io';
const source=fs.readFileSync(new URL('../integration-main/parent.js',import.meta.url),'utf8');
assert.equal(source.match(/DETAIL_URL_HELPER_PLACEHOLDER/g)?.length,1);
const script=source.replace('DETAIL_URL_HELPER_PLACEHOLDER',makeshopDetailUrl.toString());
const escapeAttribute=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function boot({url='https://www.pink-rocket.com/shop/main.html',cartHref,header='',crypto=true,platform}={}){
 const page=new URL(url),mobile=page.pathname.startsWith('/m/');
 if(platform===undefined)platform=mobile?'mobile':'pc';
 if(cartHref===undefined)cartHref=mobile?'/m/basket.html':'/shop/basket.html';
 const errors=[],messages=[],navigations=[],timers=new Map(),vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(`<!doctype html>${header}<main id="pr-makeshop-main" data-platform="${escapeAttribute(platform)}"><p data-main-status></p><iframe data-shop-frame></iframe><section data-native-dialog hidden><p data-native-status></p><button data-native-close>닫기</button><a data-native-open>상세</a><a data-native-wishlist>찜</a><a data-native-cart href="${escapeAttribute(cartHref)}">장바구니</a><iframe data-native-frame></iframe></section></main>`,{url,runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window,d=w.document,root=d.querySelector('#pr-makeshop-main'),frame=d.querySelector('[data-shop-frame]'),native=d.querySelector('[data-native-frame]');
 let nextRequest=0,nextTimer=0;
 if(!crypto)Object.defineProperty(w,'crypto',{value:null});
 w.setTimeout=callback=>{timers.set(++nextTimer,callback);return nextTimer;};w.clearTimeout=id=>timers.delete(id);
 const locationFacade={href:page.href,origin:page.origin,pathname:page.pathname,search:page.search,assign:href=>navigations.push(String(href))};
 w.Function('location',script)(locationFacade);
 const session=()=>new URL(frame.src).searchParams.get('session');
 const send=(action,id,overrides={},event={})=>{
  const requestId=overrides.requestId??++nextRequest;nextRequest=Math.max(nextRequest,requestId||0);
  frame.contentWindow.postMessage=(data,targetOrigin)=>messages.push({data,targetOrigin});
  w.dispatchEvent(new w.MessageEvent('message',{source:frame.contentWindow,origin:childOrigin,...event,
   data:{channel,session:session(),requestId,action,...(id===undefined?{}:{id}),...overrides}}));
  return requestId;
 };
 const hello=()=>send('hello',undefined,{requestId:1});
 return {w,d,root,frame,native,errors,messages,navigations,timers,session,send,hello,
  status:()=>d.querySelector('[data-native-status]').textContent,
  mainStatus:()=>d.querySelector('[data-main-status]'),
  dialog:()=>d.querySelector('[data-native-dialog]'),
  last:action=>messages.filter(item=>item.data.action===action).at(-1)?.data,
  close:()=>w.close()};
}
function loadNative(h,{href=h.native.src,mobile=false,form=true,wish=true,cart=true,wishOutside=false,duplicateCart=false,beforeLoad}={}){
 h.native.src=href;
 const doc=h.native.contentDocument,calls=[];
 const wishMarkup=wish?'<a data-wish class="btn_wish" href="javascript:login_chk_wish();">원본 찜</a>':'';
 const cartMarkup=cart?`<a ${mobile?'class="cart"':'id="cartBtn"'} href="javascript:send_multi(\'\', \'\');">원본 담기</a>`:'';
 doc.open();doc.write(`<!doctype html><body>${wishOutside?wishMarkup:''}${form?'<form id="product" name="form_product">':''}<label>옵션<select name="option"><option value="">선택</option><option value="silver">실버</option></select></label><input name="quantity" value="1">${wishOutside?'':wishMarkup}${duplicateCart?`<div class="buy_on" style="display:none"><div class="shopdetailButtonTop">${cartMarkup}</div></div>`:''}<div class="shopdetailButton"><div class="shopdetailButtonTop">${cartMarkup}</div></div>${form?'</form>':''}</body>`);doc.close();
 const wishButton=doc.querySelector('[data-wish]'),cartButton=doc.querySelector('#cartBtn, a.cart');
 for(const node of doc.querySelectorAll('[data-wish], #cartBtn, a.cart'))node.addEventListener('click',event=>{event.preventDefault();calls.push({kind:node.matches('[data-wish]')?'wish':'cart',option:doc.querySelector('select').value,quantity:doc.querySelector('input').value});});
 beforeLoad?.(doc);
 h.native.dispatchEvent(new h.w.Event('load'));
 return {doc,wishButton,cartButton,calls};
}

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
  h.send('wish','2085891');assert.equal(h.native.src,'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085891');assert.equal(h.dialog().hidden,false);
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

test('native cart navigation rejects unresolved virtual tags, foreign/javascript links and malformed paths',()=>{
 for(const cartHref of ['<!--/link_basket/-->','javascript:alert(1)','https://foreign.example/shop/basket.html','','#cart','/',' /shop/basket.html','/shop/\nbasket.html','https://user:password@www.pink-rocket.com/shop/basket.html']){
  const h=boot({cartHref});try{h.hello();h.send('cart');assert.equal(h.last('accepted'),undefined,'invalid native URL is rejected before accepted');h.d.querySelector('[data-native-cart]').click();assert.deepEqual(h.navigations,[],cartHref);assert.match(h.status(),/장바구니 링크/);assert.deepEqual(h.errors,[]);}finally{h.close();}
 }
 const h=boot({cartHref:'/shop/native_basket.html?from=skin'});try{h.hello();h.send('cart');assert.deepEqual(h.navigations,['https://www.pink-rocket.com/shop/native_basket.html?from=skin']);}finally{h.close();}
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

test('wish outside the product form remains available when sold-out detail has no cart control',()=>{
 const h=boot({url:'https://www.pink-rocket.com/m/'});try{
  h.hello();h.send('wish','2085891');const loaded=loadNative(h,{mobile:true,wishOutside:true,cart:false,form:false});
  assert.equal(loaded.wishButton.closest('form'),null);assert.match(h.status(),/원본 찜 버튼을 직접/);assert.deepEqual(loaded.calls,[]);
  loaded.wishButton.click();assert.equal(loaded.calls[0].kind,'wish');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('native wish/cart controls and form values are reused only by a customer click, never automatically',()=>{
 for(const action of ['wish','options'])for(const mobile of [false,true]){
  const h=boot({url:mobile?'https://www.pink-rocket.com/m/':'https://www.pink-rocket.com/shop/main.html'});try{
   h.hello();const requestId=h.send(action,'2085891'),loaded=loadNative(h,{mobile,wishOutside:mobile});assert.deepEqual(loaded.calls,[]);
   if(mobile)assert.equal(loaded.wishButton.closest('form'),null,'actual mobile wish control sits outside the product form');
   assert.match(h.status(),/직접 눌러주세요/);assert.equal(h.last('status').requestId,requestId);assert.equal(h.timers.size,0);
   loaded.doc.querySelector('select').value='silver';loaded.doc.querySelector('input').value='2';
   (action==='wish'?loaded.wishButton:loaded.cartButton).click();
   assert.deepEqual(loaded.calls,[{kind:action==='wish'?'wish':'cart',option:'silver',quantity:'2'}]);
   assert.match(h.status(),/실제 반영을 확인/);assert.doesNotMatch(h.status(),/성공|완료|저장됐/);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('native redirects, duplicate/wrong product IDs, missing forms and missing buttons are reported without account writes',()=>{
 const cases=[
  {href:'https://foreign.example/shop/shopdetail.html?branduid=2085891'},
  {href:'https://www.pink-rocket.com/shop/member.html?branduid=2085891',login:true},
  {href:'https://www.pink-rocket.com/other/shopdetail.html?branduid=2085891'},
  {href:'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085889'},
  {href:'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085891&branduid=2085891'},
  {form:false},{cart:false}
 ];
 for(const fixture of cases){
  const h=boot();try{h.hello();h.send('options','2085891');const loaded=loadNative(h,fixture);assert.deepEqual(loaded.calls,[]);assert.match(h.status(),fixture.login?/로그인/:/확인|찾지 못/);assert.equal(h.d.querySelector('[data-native-open]').href,'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085891');assert.deepEqual(h.errors,[]);}finally{h.close();}
 }
 const h=boot();try{h.hello();h.send('wish','2085891');loadNative(h,{wish:false});assert.match(h.status(),/찜 버튼을 찾지 못/);}finally{h.close();}
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

test('native wish href changes cannot be reported or invoked as the verified original wish request',()=>{
 const h=boot({url:'https://www.pink-rocket.com/m/'});try{
  h.hello();h.send('wish','2085891');const loaded=loadNative(h,{mobile:true,wishOutside:true});
  loaded.wishButton.setAttribute('href','javascript:other_function();');loaded.wishButton.click();
  assert.deepEqual(loaded.calls,[]);assert.match(h.status(),/바뀌었습니다/);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('replacement, closing and iframe reload invalidate old native requests and rotate the session safely',()=>{
 const h=boot();try{
  h.hello();h.frame.dispatchEvent(new h.w.Event('load'));h.send('options','2085891');const first=loadNative(h);
  h.send('wish','2085889');assert.match(h.native.src,/branduid=2085889$/);assert.deepEqual(first.calls,[]);
  h.d.querySelector('[data-native-close]').click();assert.equal(h.dialog().hidden,true);assert.equal(h.native.src,'about:blank');assert.equal(h.timers.size,0);
  assert.equal(h.frame.inert,false);assert.equal(h.d.activeElement,h.frame);
  const previous=h.session();h.send('options','2085891');h.frame.dispatchEvent(new h.w.Event('load'));assert.notEqual(h.session(),previous);assert.equal(h.root.dataset.bridgeState,'loading');assert.equal(h.dialog().hidden,true);
  h.send('hello',undefined,{requestId:1,session:previous});assert.equal(h.root.dataset.bridgeState,'loading');
  h.hello();const next=h.session();h.frame.dispatchEvent(new h.w.Event('load'));assert.equal(h.session(),next);assert.equal(h.root.dataset.bridgeState,'ready');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
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
  h.hello();h.send('wish','2085891');const loaded=loadNative(h,{mobile:true,wishOutside:true});
  loaded.doc.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(h.dialog().hidden,true);assert.equal(h.frame.inert,false);assert.equal(h.d.activeElement,h.frame);assert.equal(h.native.src,'about:blank');assert.deepEqual(loaded.calls,[]);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('a detail loading timeout reports the fallback and native navigation links stay on the parent origin',()=>{
 const h=boot();try{
  h.hello();h.send('options','2085891');assert.equal(h.timers.size,1);for(const callback of h.timers.values())callback();assert.match(h.status(),/iframe 표시가 제한/);
  h.d.querySelector('[data-native-open]').click();h.d.querySelector('[data-native-wishlist]').click();h.d.querySelector('[data-native-cart]').click();
  assert.deepEqual(h.navigations,['https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085891','https://www.pink-rocket.com/shop/mypage.html?mypage_type=mywishlist','https://www.pink-rocket.com/shop/basket.html']);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
