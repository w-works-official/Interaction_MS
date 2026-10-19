import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {makeshopDetailUrl} from '../dist/model.js';

const pastePath=new URL('../integration-poc/01_PASTE_BEFORE_FOOTER.txt',import.meta.url);
const escapeAttribute=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function card(uid,href='/shop/shopdetail.html?branduid=9999'){
 const image='<img src="/product.jpg" alt="">';
 return `<div class="productWrap"><div class="listPic">${href===null?image:`<a href="${escapeAttribute(href)}">${image}</a>`}<span class="my-wish-list" data-uid="${escapeAttribute(uid)}"><img src="/heart_off.png" alt=""></span></div><p class="listName">상품 ${escapeAttribute(uid)}</p></div>`;
}
function boot({url='https://preview.example/shop/main.html',header='',cards=[card('1001')]}={}){
 const errors=[],messages=[],wishCalls=[],cartCalls=[],opened=[];
 const console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(`<!doctype html><meta charset="utf-8">${header}${cards.join('')}${fs.readFileSync(pastePath,'utf8')}`,{
  url,runScripts:'outside-only',virtualConsole:console
 });
 const w=dom.window,d=w.document,frame=d.querySelector('[data-test-frame]'),detail=d.querySelector('[data-detail-frame]');
 let requestId=0;
 w.Date.now=()=>10000;
 w.open=(...args)=>{opened.push(args);};
 d.querySelectorAll('.my-wish-list').forEach(node=>node.addEventListener('click',()=>wishCalls.push(node.dataset.uid)));
 const scripts=[...d.querySelectorAll('script')];assert.equal(scripts.length,1,'paste artifact contains one standalone script');
 w.eval(scripts[0].textContent);
 const configMatch=frame.srcdoc.match(/const config = (\{[^\n]+\});/);
 assert.ok(configMatch,'child receives its generated session configuration');
 assert.doesNotMatch(frame.srcdoc,/CONFIG_PLACEHOLDER/,'runtime child configuration is fully resolved');
 const config=JSON.parse(configMatch[1]);
 frame.contentWindow.postMessage=data=>messages.push(data);
 const send=(action,uid,overrides={})=>w.dispatchEvent(new w.MessageEvent('message',{
  source:frame.contentWindow,origin:'null',data:{channel:'pinkrocket-preview-v1',token:config.token,requestId:++requestId,action,uid,...overrides}
 }));
 send('ready');
 return {dom,w,d,detail,errors,messages,wishCalls,cartCalls,opened,send,
  execute:d.querySelector('[data-execute-cart]'),
  catalog:()=>messages.filter(message=>message.action==='catalog').at(-1)?.products,
  close:()=>dom.window.close()};
}
function loadDetail(href,harness,{form=true,mobile=false}={}){
 const {detail,w,cartCalls}=harness;
 detail.src=href;
 const doc=detail.contentDocument;
 doc.open();doc.write(`<!doctype html><body>${form?'<form id="native-product">':''}<select name="option"><option value="silver">실버</option></select><input name="quantity" value="2"><div class="shopdetailButtonTop"><a ${mobile?'class="cart"':'id="cartBtn"'} href="#">담기</a></div>${form?'</form>':''}</body>`);doc.close();
 const button=doc.querySelector('a');
 button.addEventListener('click',event=>{event.preventDefault();cartCalls.push({uid:new URL(doc.URL).searchParams.get('branduid'),option:doc.querySelector('select').value,quantity:doc.querySelector('input').value});});
 detail.dispatchEvent(new w.Event('load'));
 return {doc,button};
}
function expectedDetail(origin,uid,platform){
 const canonical=new URL(makeshopDetailUrl(uid,platform));
 return new URL(canonical.pathname+canonical.search,origin).href;
}

test('standalone iframe paste artifact embeds the shared detail helper without unresolved placeholders',()=>{
 const paste=fs.readFileSync(pastePath,'utf8');
 assert.ok(paste.replaceAll('\r\n','\n').includes(makeshopDetailUrl.toString().replaceAll('\r\n','\n')),'generated helper is the actual shared model function');
 assert.doesNotMatch(paste,/(?:DETAIL_URL_HELPER|CHILD_SOURCE)_PLACEHOLDER/);
});

test('iframe resolves PC and mobile detail targets on the parent origin using parent platform signals',()=>{
 for(const fixture of [
  {url:'https://preview.example/shop/main.html',platform:'pc'},
  {url:'https://www.pink-rocket.com/shop/main.html',platform:'pc'},
  {url:'http://127.0.0.1:4173/m/',platform:'mobile'},
  {url:'https://preview.example/shop/main.html?dgnset_type=MOBILE',platform:'mobile'},
  {url:'https://preview.example/shop/main.html',header:'<a class="cart_icon" href="/m/basket.html">장바구니</a>',platform:'mobile'}
 ]){
  const h=boot(fixture);
  try{
   assert.equal(h.catalog().length,1);
   assert.deepEqual(h.wishCalls,[]);assert.deepEqual(h.cartCalls,[]);
   h.send('options','1001');
   const expected=expectedDetail(new URL(fixture.url).origin,'1001',fixture.platform);
   assert.equal(h.detail.src,expected);
   h.d.querySelector('[data-open-detail]').click();
   assert.deepEqual(h.opened,[[expected,'_blank','noopener']]);
   assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('iframe derives details from native wish IDs when main anchors are missing, foreign, stale or javascript',()=>{
 for(const href of [null,'https://foreign.example/shop/shopdetail.html?branduid=8888','/shop/shopdetail.html?branduid=8888','javascript:throw new Error("must not run")']){
  const h=boot({cards:[card('1001',href)]});
  try{
   assert.deepEqual([...h.catalog()].map(product=>product.uid),['1001']);
   h.send('options','1001');assert.equal(h.detail.src,'https://preview.example/shop/shopdetail.html?branduid=1001');
   assert.deepEqual(h.wishCalls,[]);assert.deepEqual(h.cartCalls,[]);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('iframe excludes malformed native IDs and keeps the existing three-product limit',()=>{
 const invalid=['','0','01','-1','1.5',' 1001','1001 ','1001\n','1001&x=1','https://foreign.example'];
 const h=boot({cards:[...invalid.map(uid=>card(uid)),...['1001','1002','1003','1004'].map(uid=>card(uid,null))]});
 try{
  assert.deepEqual([...h.catalog()].map(product=>product.uid),['1001','1002','1003']);
  for(const uid of [...invalid,'1004'])h.send('wish',uid);
  assert.deepEqual(h.wishCalls,[]);
  h.send('wish','1001');assert.deepEqual(h.wishCalls,['1001']);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('native detail loading only enables the matching product form and preserves selected native options',()=>{
 for(const platform of ['pc','mobile']){
  const h=boot({url:platform==='mobile'?'https://preview.example/m/':'https://preview.example/shop/main.html'});
  try{
   h.send('options','1001');
   const {button}=loadDetail(h.detail.src,h,{mobile:platform==='mobile'});
   assert.equal(h.execute.disabled,false);assert.deepEqual(h.cartCalls,[]);
   h.execute.click();assert.deepEqual(h.cartCalls,[{uid:'1001',option:'silver',quantity:'2'}]);
   assert.equal(button.closest('form').id,'native-product');assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('detail redirects, wrong paths, wrong IDs, duplicate IDs and missing native forms cannot execute cart',()=>{
 for(const target of [
  'https://foreign.example/shop/shopdetail.html?branduid=1001',
  'https://preview.example/shop/member.html?branduid=1001',
  'https://preview.example/other/shopdetail.html?branduid=1001',
  'https://preview.example/shop/shopdetail.html?branduid=1002',
  'https://preview.example/shop/shopdetail.html?branduid=1001&branduid=1001',
  'https://preview.example/shop/shopdetail.html?branduid=1001&branduid=1002',
  'https://preview.example/shop/shopdetail.html'
 ]){
  const h=boot();
  try{
   h.send('options','1001');loadDetail(target,h);
   assert.equal(h.execute.disabled,true,target);h.execute.click();assert.deepEqual(h.cartCalls,[]);
   assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
 const h=boot();
 try{h.send('options','1001');loadDetail(h.detail.src,h,{form:false});assert.equal(h.execute.disabled,true);h.execute.click();assert.deepEqual(h.cartCalls,[]);}finally{h.close();}
});

test('cart execution revalidates native document, button form and product ID after a successful load',()=>{
 for(const mutate of [
  h=>{h.detail.src='https://preview.example/shop/shopdetail.html?branduid=1002';},
  (h,{button})=>button.remove(),
  (h,{doc,button})=>doc.body.append(button),
  h=>{h.d.querySelector('.my-wish-list').dataset.uid='1002';}
 ]){
  const h=boot();
  try{
   h.send('options','1001');const loaded=loadDetail(h.detail.src,h);assert.equal(h.execute.disabled,false);
   mutate(h,loaded);h.execute.click();assert.deepEqual(h.cartCalls,[]);
   assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('changed or detached native wish elements cannot be invoked from cached iframe product IDs',()=>{
 for(const mutate of [node=>{node.dataset.uid='1002';},node=>node.remove()]){
  const h=boot();
  try{
   mutate(h.d.querySelector('.my-wish-list'));h.send('wish','1001');h.send('options','1001');
   assert.deepEqual(h.wishCalls,[]);assert.equal(h.d.querySelector('[data-options]').hidden,true);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('switching or closing option requests cannot reuse a previous native cart document',()=>{
 const h=boot({cards:[card('1001'),card('1002')]});
 try{
  h.send('options','1001');const first=loadDetail(h.detail.src,h);assert.equal(h.execute.disabled,false);
  h.send('options','1002');assert.equal(h.execute.disabled,true);
  h.execute.click();assert.deepEqual(h.cartCalls,[]);
  loadDetail('https://preview.example/shop/shopdetail.html?branduid=1001',h);assert.equal(h.execute.disabled,true);
  h.send('options','1002');loadDetail(h.detail.src,h);assert.equal(h.execute.disabled,false);
  h.d.querySelector('[data-close-options]').click();
  assert.equal(h.execute.disabled,true);assert.equal(h.d.querySelector('[data-options]').hidden,true);
  loadDetail('https://preview.example/shop/shopdetail.html?branduid=1002',h);h.execute.click();assert.deepEqual(h.cartCalls,[]);
  assert.notEqual(first.doc,h.detail.contentDocument);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
