import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {initialConfig} from '../dist/model.js';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const model=fs.readFileSync(new URL('../dist/model.js',import.meta.url),'utf8').replace(/^export /gm,'');
const runtime=fs.readFileSync(new URL('../dist/customer-code.js',import.meta.url),'utf8').replace(/^export /gm,'');
const storefrontRuntime=fs.readFileSync(new URL('../dist/storefront.js',import.meta.url),'utf8').replace(/^export /gm,'');
const productImagesRuntime=fs.readFileSync(new URL('../dist/product-images.js',import.meta.url),'utf8').replace(/^export /gm,'');
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url)));
const draftKey='pr-studio-draft-v1',publishedKey='pr-studio-published-v1',workingKey='pr-studio-code-working-v1';
const action=name=>`[data-action="${name}"]`,tick=()=>new Promise(resolve=>setTimeout(resolve,25));

async function boot({config=initialConfig(),working,resize=false}={}){
 const errors=[],fetchCalls=[],observers=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(html,{url:'https://mockup.example/?view=admin&adminPage=code',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window,d=w.document;
 w.localStorage.setItem(draftKey,JSON.stringify(config));w.localStorage.setItem(publishedKey,JSON.stringify(initialConfig()));
 if(working)w.localStorage.setItem(workingKey,JSON.stringify(working));
 w.fetch=async url=>{fetchCalls.push(String(url));return {ok:true,json:async()=>structuredClone(catalog)};};w.scrollTo=()=>{};
 if(resize)w.ResizeObserver=class{constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}observe(target){this.target=target;}disconnect(){this.disconnected=true;}};
 w.CSS??={};w.CSS.escape=value=>String(value).replace(/[^\w-]/g,'');
 w.eval(`(()=>{${model}\n${storefrontRuntime}\n${productImagesRuntime}\n${runtime}\n${app}\n})();`);await tick();
 const click=async selector=>{const control=d.querySelector(selector);assert.ok(control,selector);control.click();await tick();};
 const set=async(selector,value,event='input')=>{const control=d.querySelector(selector);assert.ok(control,selector);if(control.type==='checkbox')control.checked=!!value;else control.value=String(value);control.dispatchEvent(new w.Event(event,{bubbles:true}));await tick();};
 const session=()=>{
  const frame=d.querySelector('#customer-code-preview'),token=frame.srcdoc.match(/"token":"([a-f0-9]{32})"/)?.[1];assert.ok(token,'preview has a runtime nonce');
  return {frame,token,receive:(data,overrides={})=>w.dispatchEvent(new w.MessageEvent('message',{data:{channel:'customer-code-v1',token,...data},source:frame.contentWindow,origin:'null',...overrides}))};
 };
 return {dom,w,d,errors,fetchCalls,observers,click,set,session,input:()=>d.querySelector('#customer-code-input'),save:()=>click(action('save-draft')),
  saved:()=>JSON.parse(w.localStorage.getItem(draftKey)),published:()=>JSON.parse(w.localStorage.getItem(publishedKey)),working:()=>JSON.parse(w.localStorage.getItem(workingKey)),close:()=>w.close()};
}
async function code(h,language,value){await h.click(`${action('code-language')}[data-language="${language}"]`);await h.set('#customer-code-input',value);}
async function runReady(h){await h.click(action('code-run'));const session=h.session();session.receive({type:'ready',message:'실행 확인'});await tick();return session;}

test('editor language tabs preserve separate buffers and local working save never applies or publishes code',async()=>{
 const h=await boot();try{
  const before=h.saved(),published=h.published();assert.ok(h.d.querySelector('.customer-code-editor'));assert.equal(h.d.querySelectorAll('#customer-code-input').length,1);
  assert.equal(h.d.querySelector('#customer-code-auto').checked,false);assert.equal(h.d.querySelector('#customer-code-enabled').checked,false);assert.equal(h.d.querySelector(action('code-apply')).disabled,true);
  assert.ok(!h.d.querySelector('#customer-code-preview').srcdoc.includes('"token"'),'opening editor does not execute customer code');
  await code(h,'html','<main id="my-layout">직접 편집한 화면</main>');await code(h,'css','main { color: #123456; }');await code(h,'js','window.customerMarker = 7;');
  await h.click(`${action('code-language')}[data-language="html"]`);assert.equal(h.input().value,'<main id="my-layout">직접 편집한 화면</main>');
  await h.click(action('code-save'));assert.deepEqual(h.working(),{enabled:false,html:'<main id="my-layout">직접 편집한 화면</main>',css:'main { color: #123456; }',js:'window.customerMarker = 7;'});
  await h.save();assert.deepEqual(h.saved(),before);assert.deepEqual(h.published(),published);assert.equal(h.w.customerMarker,undefined);assert.equal(h.fetchCalls.length,2);assert.match(h.fetchCalls[1],/assets\/product-images\.json/);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
 const stored={enabled:true,html:'<p>저장한 편집본 우선</p>',css:'p{color:red}',js:''},loaded=await boot({working:stored});try{assert.equal(loaded.input().value,stored.html);assert.equal(loaded.d.querySelector('#customer-code-enabled').checked,true);assert.equal(loaded.saved().customerCode.enabled,false);}finally{loaded.close();}
});

test('same-source ready enables explicit apply, then only draft save and publish update their respective records',async()=>{
 const config=initialConfig();config.tabs['추천'].pins=[catalog[0].id];const h=await boot({config});try{
  const before=h.saved(),published=h.published();await code(h,'html','<section>적용할 고객 화면</section>');await runReady(h);
  await h.set('#customer-code-enabled',true,'change');assert.equal(h.d.querySelector(action('code-apply')).disabled,false);
  await h.click(action('code-apply'));assert.deepEqual(h.saved(),before);assert.deepEqual(h.published(),published);
  await h.save();const saved=h.saved();assert.equal(saved.customerCode.enabled,true);assert.equal(saved.customerCode.html,'<section>적용할 고객 화면</section>');assert.deepEqual(saved.tabs,before.tabs);assert.deepEqual(h.published(),published);
  await h.click(action('publish'));assert.deepEqual(h.published().customerCode,saved.customerCode);
  await h.click(action('code-disable'));await h.save();assert.equal(h.saved().customerCode.enabled,false);assert.equal(h.saved().customerCode.html,saved.customerCode.html);assert.equal(h.published().customerCode.enabled,true);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('input and runtime status update in place while stale, failed and obsolete runs cannot authorize apply',async()=>{
 const h=await boot();try{
  await code(h,'html','<main>첫 실행</main>');const first=await runReady(h),input=h.input();input.focus();
  assert.equal(h.d.querySelector(action('code-apply')).disabled,false);assert.equal(h.input(),input);assert.equal(h.d.activeElement,input);
  await h.set('#customer-code-input','<main>실행 뒤 바뀐 입력</main>');assert.equal(h.input(),input);assert.equal(h.d.activeElement,input);assert.equal(h.d.querySelector(action('code-apply')).disabled,true);
  first.receive({type:'ready',message:'이전 입력 ready'});assert.equal(h.d.querySelector(action('code-apply')).disabled,true);
  await h.click(action('code-run'));const second=h.session();first.receive({type:'ready',message:'오래된 실행'});assert.equal(h.d.querySelector(action('code-apply')).disabled,true);
  second.receive({type:'error',message:'사용자 JavaScript 오류',line:3});second.receive({type:'ready',message:'오류 후 ready'});
  assert.equal(h.d.querySelector(action('code-apply')).disabled,true);assert.equal(h.d.querySelector('#customer-code-result').dataset.state,'error');
  const third=await runReady(h);assert.equal(h.d.querySelector(action('code-apply')).disabled,false);third.receive({type:'error',message:'실행 후 오류'});assert.equal(h.d.querySelector(action('code-apply')).disabled,true);
  assert.match(h.d.querySelector('#customer-code-result').textContent,/실행 후 오류/);assert.equal(h.w.document.querySelector('#main-content').contains(input),true);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('code shortcuts preserve selected source, save working buffers, run preview and keep device changes out of the draft',async()=>{
 const h=await boot();try{
  const before=h.saved();await code(h,'html','<p>첫째</p>\n<p>둘째</p>');const input=h.input();input.focus();input.setSelectionRange(0,input.value.length);
  const tab=new h.w.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});input.dispatchEvent(tab);assert.equal(tab.defaultPrevented,true);assert.equal(input.value,'  <p>첫째</p>\n  <p>둘째</p>');
  const save=new h.w.KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true,cancelable:true});input.dispatchEvent(save);await tick();assert.equal(save.defaultPrevented,true);assert.equal(h.working().html,input.value);
  const run=new h.w.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true});input.dispatchEvent(run);await tick();assert.equal(run.defaultPrevented,true);const session=h.session();assert.equal(session.frame.getAttribute('sandbox'),'allow-scripts');
  await h.click(`${action('code-device')}[data-device="mobile"]`);assert.equal(session.frame.style.width,'390px');assert.equal(h.input(),input);
  await h.click(`${action('code-device')}[data-device="tablet"]`);assert.equal(session.frame.style.width,'800px');await h.click(`${action('code-device')}[data-device="pc"]`);assert.equal(session.frame.style.width,'1280px');
  assert.deepEqual(h.saved(),before);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('auto preview is opt-in, debounces edits and stops after leaving the editor',async()=>{
 const h=await boot();try{
  await code(h,'html','<p>자동 실행 전</p>');await new Promise(resolve=>setTimeout(resolve,380));assert.ok(!h.d.querySelector('#customer-code-preview').srcdoc.includes('"token"'));
  await h.set('#customer-code-auto',true,'change');await h.set('#customer-code-input','<p>자동 하나</p>');await h.set('#customer-code-input','<p>자동 둘</p>');
  await new Promise(resolve=>setTimeout(resolve,380));const latest=h.session();assert.match(latest.frame.srcdoc,/<p>자동 둘<\/p>/);const token=latest.token;
  await new Promise(resolve=>setTimeout(resolve,380));assert.equal(h.session().token,token,'one debounced edit performs one run');
  await h.set('#customer-code-input','<p>이동 전에 입력</p>');await h.click('.studio-nav [data-page="categories"]');await new Promise(resolve=>setTimeout(resolve,380));assert.equal(h.d.querySelector('#customer-code-preview'),null);assert.equal(h.d.querySelector('.studio-heading h1').textContent,'카테고리·필터');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('preview RPC receives real catalog results while product, wish, wishlist and cart remain preview-only',async()=>{
 const h=await boot();try{
  const before=h.saved(),published=h.published();const session=await runReady(h),sent=[];session.frame.contentWindow.postMessage=data=>sent.push(data);
  const favorites=h.w.localStorage.getItem('pr-studio-favorites-v1'),cart=h.w.localStorage.getItem('pr-studio-cart-v1');
  session.receive({type:'request',requestId:1,action:'list',options:{category:'추천',query:catalog[0].id,offset:0,limit:24}});await tick();const listed=sent.find(item=>item.requestId===1);assert.equal(listed.ok,true);assert.deepEqual(Array.from(listed.data.products,item=>item.id),[catalog[0].id]);
  for(const [index,actionName]of ['product','wish','wishlist','cart'].entries())session.receive({type:'request',requestId:index+2,action:actionName,...(['product','wish'].includes(actionName)?{id:catalog[0].id}:{})});
  await tick();for(const requestId of [2,3,4,5]){const result=sent.find(item=>item.requestId===requestId);assert.equal(result.ok,true);assert.equal(result.data.preview,true);assert.equal(result.data.confirmed,false);}
  assert.equal(h.d.querySelector('#overlay-root').children.length,0);assert.equal(h.w.localStorage.getItem('pr-studio-favorites-v1'),favorites);assert.equal(h.w.localStorage.getItem('pr-studio-cart-v1'),cart);assert.deepEqual(h.saved(),before);assert.deepEqual(h.published(),published);assert.equal(h.fetchCalls.length,2);assert.match(h.fetchCalls[1],/assets\/product-images\.json/);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('preview keeps its real device viewport while fitting the stage and disconnects its resize observer on exit',async()=>{
 const h=await boot({resize:true});try{
  const stage=h.d.querySelector('#customer-code-preview-stage'),frame=h.d.querySelector('#customer-code-preview');let width=640,height=600;
  Object.defineProperties(stage,{clientWidth:{get:()=>width,configurable:true},clientHeight:{get:()=>height,configurable:true}});
  await h.click(`${action('code-device')}[data-device="pc"]`);assert.equal(frame.style.width,'1280px');assert.equal(Number(frame.style.zoom),.5);assert.equal(frame.style.height,'1200px');assert.match(h.d.querySelector('#customer-code-scale').textContent,/1280px · 50%/);
  const observer=h.observers.at(-1);assert.equal(observer.target,stage);width=800;observer.callback();assert.equal(Number(frame.style.zoom),.625);assert.equal(frame.style.height,'960px');
  await h.click(`${action('code-device')}[data-device="tablet"]`);assert.equal(frame.style.width,'800px');assert.equal(Number(frame.style.zoom),1);assert.equal(frame.style.height,'600px');
  await h.click(`${action('code-device')}[data-device="mobile"]`);assert.equal(frame.style.width,'390px');assert.equal(Number(frame.style.zoom),1,'small views are not enlarged');
  width=300;observer.callback();assert.equal(Number(frame.style.zoom),300/390);assert.equal(Number.parseFloat(frame.style.height),780);
  await h.click('.studio-nav [data-page="categories"]');assert.equal(observer.disconnected,true);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
