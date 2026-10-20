import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const model=fs.readFileSync(new URL('../dist/model.js',import.meta.url),'utf8').replace(/^export /gm,'');
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url)));
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
const session='123456789-987654321-11223344-55667788',parentOrigin='https://pink-rocket.com';
async function boot({parent=parentOrigin,platform='pc',embedded=true,token=session}={}){
 const messages=[],errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const params=new URLSearchParams({frame:'1',bridge:'makeshop',parentOrigin:parent,platform,session:token});
 const dom=new JSDOM(html,{url:'https://w-works-official.github.io/Interaction_MS/?'+params,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,host={postMessage:(data,origin)=>messages.push({data,origin})};
 if(embedded)Object.defineProperty(w,'parent',{value:host,configurable:true});
 w.fetch=async()=>({ok:true,json:async()=>structuredClone(catalog)});w.scrollTo=()=>{};
 w.CSS??={};w.CSS.escape=s=>String(s).replace(/[^\w-]/g,'');
 w.localStorage.setItem('pr-studio-favorites-v1',JSON.stringify(['2085891']));
 w.localStorage.setItem('pr-studio-cart-v1',JSON.stringify([{id:'2085891',quantity:2}]));
 w.eval(`(()=>{${model}\n${app}\n})();`);await tick();
 const receive=(data,origin=parentOrigin,source=host)=>w.dispatchEvent(new w.MessageEvent('message',{data:{channel:'pinkrocket-makeshop-v1',session,...data},origin,source}));
 const init=()=>receive({action:'init',requestId:1,platform});
 return {dom,w,d:w.document,host,messages,errors,receive,init};
}
test('connected child authenticates init and sends account requests only to its exact parent',async()=>{
 const {dom,d,messages,receive,init,errors}=await boot();try{
  assert.equal(messages.length,1);assert.equal(messages[0].data.action,'hello');assert.equal(messages[0].origin,parentOrigin);
  const heart=()=>d.querySelector('[data-product="2085891"] [data-action="favorite"]');
  for(const [data,origin,source] of [[{action:'init',requestId:1,platform:'pc'},'https://other.example'],[{action:'init',requestId:1,platform:'pc'},parentOrigin,{}],[{action:'init',requestId:1,platform:'mobile'}],[{action:'init',requestId:9,platform:'pc'}],[{action:'init',requestId:1,platform:'pc',session:'wrong'}]]){
   receive(data,origin,source);heart().click();assert.equal(messages.length,1);
  }
  init();heart().click();assert.equal(messages.length,2);
  assert.equal(messages[1].data.action,'wish');assert.equal(messages[1].data.id,'2085891');assert.equal(messages[1].data.requestId,2);
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
test('bridge mode never displays local account state or mutates demo favorites/cart',async()=>{
 const {dom,w,d,init}=await boot();try{
  init();const before=w.localStorage.getItem('pr-studio-favorites-v1'),cart=w.localStorage.getItem('pr-studio-cart-v1');
  const heart=d.querySelector('[data-product="2085891"] [data-action="favorite"]');
  assert.equal(heart.classList.contains('active'),false);assert.equal(heart.hasAttribute('aria-pressed'),false);
  assert.equal(d.querySelector('.wish-count,.cart-count'),null);heart.click();
  assert.equal(w.localStorage.getItem('pr-studio-favorites-v1'),before);assert.equal(w.localStorage.getItem('pr-studio-cart-v1'),cart);
  assert.match(d.querySelector('#makeshop-connection').textContent,/연결됨/);
 }finally{dom.window.close();}
});
test('a product click opens the actual parent detail directly without a mock product drawer',async()=>{
 const {dom,d,messages,init}=await boot({platform:'mobile'});try{
  init();d.querySelector('[data-product="2085891"] [data-action="quickview"]').click();
  assert.equal(d.querySelector('#demo-quantity'),null);assert.equal(d.querySelector('[data-action="demo-add"]'),null);
  assert.equal(messages.at(-1).data.action,'product');assert.equal(messages.at(-1).data.id,'2085891');
  assert.equal(d.querySelector('.drawer'),null);
  d.querySelector('[data-product="2085889"] .product-name').click();
  assert.equal(messages.at(-1).data.action,'product');assert.equal(messages.at(-1).data.id,'2085889');
 }finally{dom.window.close();}
});
test('header account menus route to Makeshop rather than opening the demo drawer/filter',async()=>{
 const {dom,d,messages,init}=await boot();try{
  init();d.querySelector('.header-icons [data-action="toggle-favorites"]').click();
  assert.equal(messages.at(-1).data.action,'wishlist');assert.equal(d.querySelector('.catalog-heading h1').textContent,'추천 상품');
  d.querySelector('.header-icons [data-action="open-cart"]').click();
  assert.equal(messages.at(-1).data.action,'cart');assert.equal(d.querySelector('.drawer'),null);
 }finally{dom.window.close();}
});
test('an invalid or unembedded bridge fails closed without local demo fallback',async()=>{
 for(const options of [{embedded:false},{parent:'https://evil.example'},{parent:parentOrigin+'/'},{token:'bad'},{platform:'tablet'}]){
  const {dom,w,d,messages}=await boot(options);try{
   const before=w.localStorage.getItem('pr-studio-favorites-v1');
   d.querySelector('[data-action="favorite"]').click();d.querySelector('[data-action="open-cart"]').click();
   assert.equal(messages.length,0);assert.equal(w.localStorage.getItem('pr-studio-favorites-v1'),before);
   assert.equal(d.querySelector('.drawer'),null);assert.match(d.querySelector('#toast').textContent,/연결 정보/);
  }finally{dom.window.close();}
 }
});
test('only authenticated replies for pending requests can change the action feedback',async()=>{
 const {dom,d,messages,receive,init}=await boot();try{
  init();d.querySelector('[data-action="favorite"]').click();const requestId=messages.at(-1).data.requestId;
  receive({action:'accepted',requestId,message:'fake'},'https://evil.example');assert.notEqual(d.querySelector('#toast').textContent,'fake');
  receive({action:'accepted',requestId:999,message:'fake'});assert.notEqual(d.querySelector('#toast').textContent,'fake');
  receive({action:'accepted',requestId,message:'기존 상세에서 찜 버튼을 누르세요.'});assert.match(d.querySelector('#toast').textContent,/기존 상세/);
  receive({action:'status',requestId,message:'late duplicate'});assert.notEqual(d.querySelector('#toast').textContent,'late duplicate');
 }finally{dom.window.close();}
});
