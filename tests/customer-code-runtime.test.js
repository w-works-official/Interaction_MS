import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {defaultCustomerTemplate,buildCustomerDocument,mountCustomerCode} from '../dist/customer-code.js';

const categories=[{id:'추천',label:'추천 상품'},{id:'cat_other',label:'다른 상품'}];
const first={id:'2085891',name:'실제 이름 <안전>',price:12000,images:['https://images.example/one.jpg','https://images.example/two.jpg','https://images.example/three.jpg'],wished:null};
const second={id:'2085889',name:'사진 한 장',price:8000,images:['https://images.example/single.jpg'],wished:false};
const initial={category:'추천',products:[first,second],total:3},baseUrl='https://w-works-official.github.io/Interaction_MS/';
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
function hostHarness({code={html:'<p>고객 코드</p>',css:'',js:''},onList,onAction,fast=false,clock=false}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM('<div id="host">호스트</div><iframe></iframe>',{url:baseUrl,runScripts:'outside-only',virtualConsole:vc}),w=dom.window,frame=w.document.querySelector('iframe'),child=frame.contentWindow,sent=[],statuses=[],lists=[],actions=[];
 let now=0,timerId=0;const timers=new Map();
 if(clock){w.setTimeout=(fn,delay)=>{const id=++timerId;timers.set(id,{fn,at:now+delay});return id;};w.clearTimeout=id=>timers.delete(id);}
 else if(fast){const timer=w.setTimeout.bind(w);w.setTimeout=(fn,delay,...args)=>timer(fn,(delay===10000||delay===50000)?3:delay,...args);}
 child.postMessage=(data,origin)=>sent.push({data,origin});
 const mount=()=>mountCustomerCode({frame,code,baseUrl,initial,categories,onList:options=>{lists.push(options);return onList?onList(options):{category:options.category,products:[second],total:1};},onAction:(action,id)=>{actions.push({action,id});return onAction?onAction(action,id):{message:'모의 연결 결과'};},onStatus:value=>statuses.push(value)});
 const controller=mount(),token=frame.srcdoc.match(/"token":"([a-f0-9]{32})"/)[1];
 const receive=(data,{origin='null',source=child,nonce=token}={})=>w.dispatchEvent(new w.MessageEvent('message',{data:{channel:'customer-code-v1',token:nonce,...data},origin,source}));
 return {dom,w,frame,child,sent,statuses,lists,actions,controller,token,receive,mount,errors,advance(ms){now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}}};
}
async function coupled({onList,onAction}={}){
 const host=hostHarness({code:defaultCustomerTemplate(),onList,onAction});let childDom;
 const parent={postMessage:data=>queueMicrotask(()=>host.receive(data))},vc=new VirtualConsole();vc.on('jsdomError',()=>{});
 host.child.postMessage=(data,origin)=>{host.sent.push({data,origin});queueMicrotask(()=>childDom?.window.dispatchEvent(new childDom.window.MessageEvent('message',{source:parent,data})));};
 childDom=new JSDOM(host.frame.srcdoc,{url:'https://isolated-runtime.example/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse:w=>Object.defineProperty(w,'parent',{value:parent})});
 await tick();return {...host,c:childDom.window,cd:childDom.window.document,close(){host.controller.dispose();childDom.window.close();host.dom.window.close();}};
}

test('builder escapes bootstrap data and executes HTML CSS JS only in the child document',async()=>{
 const sent=[],parent={postMessage:data=>sent.push(data)},payload='</script><script>window.injected=true</script>\u2028\u2029';
 const source=buildCustomerDocument({code:{html:'<main id="custom">사용자 화면</main>',css:'body::before{content:"</style><script>window.cssInjected=true</script>"}',js:'window.customerRan=true;window.literal='+JSON.stringify(payload)+';'},token:'a'.repeat(32),baseUrl,initial:{category:'추천',products:[{...first,name:payload}],total:1},categories});
 assert.match(source,/\\u003c\/script>/);assert.ok(!source.includes('"name":"</script>'));
 const vc=new VirtualConsole();vc.on('jsdomError',()=>{});
 const child=new JSDOM(source,{url:baseUrl,runScripts:'dangerously',virtualConsole:vc,beforeParse:w=>Object.defineProperty(w,'parent',{value:parent})});
 try{await tick();const w=child.window;
  assert.equal(w.customerRan,true);assert.equal(w.literal,payload);assert.equal(w.injected,undefined);assert.equal(w.cssInjected,undefined);
  assert.equal(w.Pinkrocket.initial.products[0].name,payload);assert.equal(w.document.querySelectorAll('style[data-customer-style]').length,1);
  assert.match(w.document.querySelector('style').textContent,/<\/style>/);assert.equal(sent[0].type,'ready');
  assert.equal(w.document.querySelector('base').href,baseUrl);
 }finally{child.window.close();}
 const h=hostHarness({code:{html:'<script>window.hostInjected=true</script>',css:'',js:'window.hostInjected=true;'}});
 try{assert.equal(h.w.hostInjected,undefined);assert.equal(h.w.document.querySelector('#host').textContent,'호스트');assert.equal(h.frame.getAttribute('sandbox'),'allow-scripts');assert.equal(h.frame.hasAttribute('allow-same-origin'),false);}finally{h.controller.dispose();h.dom.window.close();}
});

test('a complete HTML document keeps its head and receives the API before inline customer scripts',async()=>{
 const source=buildCustomerDocument({code:{html:'<!doctype html><html lang="ko"><head><title>내 화면</title><script>window.sawApi=typeof Pinkrocket.list===\'function\';</script></head><body><p id="body-content">유지</p></body></html>',css:'',js:''},token:'b'.repeat(32),baseUrl,initial,categories});
 const child=new JSDOM(source,{url:baseUrl,runScripts:'dangerously'});try{await tick();assert.equal(child.window.document.title,'내 화면');assert.equal(child.window.sawApi,true);assert.equal(child.window.document.querySelector('#body-content').textContent,'유지');}finally{child.window.close();}
});

test('host accepts only its opaque frame nonce and monotonic whitelisted RPC requests',async()=>{
 const h=hostHarness();try{
  const request={type:'request',requestId:1,action:'list',options:{category:'cat_other',query:'사진',sort:'priceAsc',offset:0,limit:24}};
  for(const overrides of [{origin:baseUrl.slice(0,-1)},{origin:'https://evil.example'},{source:{}},{nonce:'wrong'}])h.receive(request,overrides);
  await tick();assert.equal(h.lists.length,0);assert.equal(h.sent.length,0);
  h.receive(request);await tick();assert.equal(h.lists.length,1);assert.equal(h.lists[0].category,'cat_other');assert.equal(h.lists[0].material,'전체');
  assert.equal(h.sent.at(-1).data.ok,true);assert.equal(h.sent.at(-1).data.data.products[0].id,second.id);assert.equal(h.sent.at(-1).origin,'*');
  h.receive(request);h.receive({...request,requestId:0});await tick();assert.equal(h.lists.length,1);
  h.receive({type:'request',requestId:2,action:'wish',id:first.id});h.receive({type:'request',requestId:3,action:'product',id:second.id});h.receive({type:'request',requestId:4,action:'cart'});h.receive({type:'request',requestId:5,action:'wishlist'});await tick();
  assert.deepEqual(h.actions,[{action:'wish',id:first.id},{action:'product',id:second.id},{action:'cart',id:undefined},{action:'wishlist',id:undefined}]);
 }finally{h.controller.dispose();h.dom.window.close();}
});

test('invalid list conditions IDs payloads and actions cannot reach host callbacks',async()=>{
 const h=hostHarness();try{
  const bad=[{action:'delete',id:first.id},{action:'wish',id:'01'},{action:'product',id:2085891},{action:'wish',id:'1;alert(1)'},{action:'cart',id:first.id},{action:'list',options:{category:'missing'}},{action:'list',options:{limit:61}},{action:'list',options:{offset:-1}},{action:'list',options:{offset:1.5}},{action:'list',options:{query:'x'.repeat(201)}},{action:'list',options:{material:'unknown'}},{action:'list',options:{sort:'eval'}},{action:'list',options:{injected:true}},{action:'list',options:{},extra:'x'.repeat(9000)}];
  bad.forEach((data,index)=>h.receive({type:'request',requestId:index+1,...data}));await tick();
  assert.equal(h.lists.length,0);assert.equal(h.actions.length,0);assert.equal(h.sent.length,bad.length);assert.ok(h.sent.every(item=>item.data.ok===false));
 }finally{h.controller.dispose();h.dom.window.close();}
});

test('unsafe or duplicate product responses are errors and never become successful list data',async()=>{
 for(const products of [[{...first,images:['javascript:alert(1)']}],[first,first],[{...first,id:'bad'}],Array(1),[{...first,images:Array(1)}]]){
  const h=hostHarness({onList:()=>({category:'추천',products,total:products.length})});try{
   h.receive({type:'request',requestId:1,action:'list',options:{}});await tick();assert.equal(h.sent.at(-1).data.ok,false);assert.equal(h.statuses.at(-1).type,'error');
  }finally{h.controller.dispose();h.dom.window.close();}
 }
 assert.throws(()=>buildCustomerDocument({code:{html:'x'.repeat(204801)},token:'c'.repeat(32),baseUrl,initial,categories}),/크기/);
});

test('host timeouts and dispose ignore late results without repeating callbacks',async()=>{
 let resolve;const h=hostHarness({fast:true,onAction:()=>new Promise(done=>{resolve=done;})});try{
  h.receive({type:'request',requestId:1,action:'wish',id:first.id});await tick();assert.equal(h.actions.length,1);assert.equal(h.sent.at(-1).data.ok,false);assert.equal(h.statuses.at(-1).type,'timeout');
  const count=h.sent.length;resolve({confirmed:true,selected:true});await tick();assert.equal(h.sent.length,count);
  h.receive({type:'request',requestId:2,action:'wish',id:first.id});await Promise.resolve();h.controller.dispose();const disposedCount=h.sent.length;resolve({confirmed:true,selected:true});await tick();assert.equal(h.sent.length,disposedCount);assert.equal(h.sent.at(-1).data.type,'dispose');
  h.receive({type:'request',requestId:3,action:'cart'});await tick();assert.equal(h.actions.length,2);
 }finally{h.controller.dispose();h.dom.window.close();}
});

test('remount creates a new nonce and rejects messages from the old customer document',async()=>{
 const h=hostHarness();try{
  const oldToken=h.token,next=h.mount(),newToken=h.frame.srcdoc.match(/"token":"([a-f0-9]{32})"/)[1];assert.notEqual(oldToken,newToken);
  h.receive({type:'request',requestId:1,action:'cart'});await tick();assert.equal(h.actions.length,0);
  h.receive({type:'request',requestId:1,action:'cart'},{nonce:newToken});await tick();assert.equal(h.actions.length,1);next.dispose();
 }finally{h.controller.dispose();h.dom.window.close();}
});

test('child RPC resolves only its parent reply and dispose rejects outstanding promises',async()=>{
 const sent=[],parent={postMessage:data=>sent.push(data)},source=buildCustomerDocument({code:{html:'<p>API</p>',css:'',js:''},token:'d'.repeat(32),baseUrl,initial,categories});
 const child=new JSDOM(source,{url:baseUrl,runScripts:'dangerously',beforeParse:w=>Object.defineProperty(w,'parent',{value:parent})});
 try{
  await tick();const w=child.window,promise=w.Pinkrocket.list({limit:12}),message=sent.at(-1);let settled=false;promise.then(()=>{settled=true;});
  const reply={channel:'customer-code-v1',token:'d'.repeat(32),type:'response',requestId:message.requestId,ok:true,data:{products:[]}};
  w.dispatchEvent(new w.MessageEvent('message',{source:{},data:reply}));w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{...reply,token:'wrong'}}));await tick();assert.equal(settled,false);
  w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:reply}));assert.deepEqual(await promise,{products:[]});
  const pending=w.Pinkrocket.wish(first.id),rejected=assert.rejects(pending,/종료/);w.dispatchEvent(new w.MessageEvent('message',{source:parent,data:{channel:'customer-code-v1',token:'d'.repeat(32),type:'dispose'}}));await rejected;await assert.rejects(w.Pinkrocket.cart(),/종료/);
 }finally{child.window.close();}
});

test('runtime reports customer script errors and unhandled rejections through status messages',async()=>{
 const h=hostHarness({code:{html:'<p>오류 확인</p>',css:'',js:'throw Error("사용자 코드 오류");'}});let child;
 const parent={postMessage:data=>queueMicrotask(()=>h.receive(data))},vc=new VirtualConsole();vc.on('jsdomError',()=>{});
 try{
  child=new JSDOM(h.frame.srcdoc,{url:baseUrl,runScripts:'dangerously',virtualConsole:vc,beforeParse:w=>Object.defineProperty(w,'parent',{value:parent})});await tick();
  assert.equal(h.statuses.some(value=>value.type==='ready'),false,'failed customer code must never validate as ready');assert.ok(h.statuses.some(value=>value.type==='error'&&value.message.includes('사용자 코드 오류')));
  const event=new child.window.Event('unhandledrejection');Object.defineProperty(event,'reason',{value:Error('처리되지 않은 요청')});child.window.dispatchEvent(event);await tick();assert.match(h.statuses.at(-1).message,/처리되지 않은/);
 }finally{h.controller.dispose();child?.window.close();h.dom.window.close();}
});

test('starter renders real galleries and uses host list and account actions without optimistic hearts',async()=>{
 let wishes=0;const h=await coupled({onList:options=>({category:options.category,products:[second],total:1}),onAction:(action)=>action==='wish'?(++wishes===1?{confirmed:false,selected:true,message:'미리보기에서는 실제 요청을 하지 않습니다.'}:{confirmed:true,selected:true,message:'등록 확인'}):{message:'연결된 화면을 확인하세요.'}});
 try{
  const card=h.cd.querySelector('[data-product="2085891"]'),heart=card.querySelector('.pr-heart'),before=card.querySelector('img').src;
  assert.equal(h.cd.querySelectorAll('.pr-product').length,2);assert.equal(h.cd.querySelector('[data-product="2085889"] .pr-dots'),null);assert.equal(card.querySelector('.pr-dots').getAttribute('aria-label'),'사진 3장 중 1번째');
  card.querySelector('.pr-next').click();assert.notEqual(card.querySelector('img').src,before);assert.equal(card.querySelectorAll('.pr-dots .on').length,1);assert.equal(h.cd.querySelector('#pr-categories .active').textContent,'추천 상품');
  heart.click();await tick();assert.equal(heart.classList.contains('active'),false);assert.match(h.cd.querySelector('#pr-status').textContent,/미리보기/);
  heart.click();await tick();assert.equal(heart.classList.contains('active'),true);assert.equal(heart.getAttribute('aria-pressed'),'true');
  card.querySelector('.pr-open').click();h.cd.querySelector('#pr-cart').click();h.cd.querySelector('#pr-wishlist').click();await tick();assert.ok(h.actions.some(value=>value.action==='product'&&value.id===first.id));assert.ok(h.actions.some(value=>value.action==='cart'));assert.ok(h.actions.some(value=>value.action==='wishlist'));
  h.cd.querySelectorAll('#pr-categories button')[1].click();await tick();assert.equal(h.lists.at(-1).category,'cat_other');assert.equal(h.cd.querySelectorAll('.pr-product').length,1);assert.equal(h.cd.querySelector('.pr-product').dataset.product,second.id);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('starter search button and Enter request a fresh list without sandboxed form submission',async()=>{
 const h=await coupled({onList:options=>({category:options.category,products:options.query===first.id?[first]:[],total:options.query===first.id?1:0})});try{
  const query=h.cd.querySelector('#pr-query'),search=h.cd.querySelector('#pr-search-button');
  assert.equal(h.frame.getAttribute('sandbox'),'allow-scripts');assert.equal(h.cd.querySelector('form'),null);assert.equal(h.cd.querySelector('#pr-search').getAttribute('role'),'search');assert.equal(search.type,'button');
  query.value=first.id;search.click();await tick();
  assert.equal(h.lists.length,1);assert.equal(h.lists[0].query,first.id);assert.equal(h.lists[0].offset,0);assert.deepEqual([...h.cd.querySelectorAll('.pr-product')].map(item=>item.dataset.product),[first.id]);assert.equal(h.cd.querySelector('#pr-status').textContent,'1개의 상품');
  query.value='없는 상품';const enter=new h.c.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});query.dispatchEvent(enter);await tick();
  assert.equal(enter.defaultPrevented,true);assert.equal(h.lists.length,2);assert.equal(h.lists[1].query,'없는 상품');assert.equal(h.lists[1].offset,0);assert.equal(h.cd.querySelectorAll('.pr-product').length,0);assert.equal(h.cd.querySelector('#pr-status').textContent,'0개의 상품');
  query.dispatchEvent(new h.c.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));query.dispatchEvent(new h.c.KeyboardEvent('keydown',{key:'a',bubbles:true}));await tick();assert.equal(h.lists.length,2);
 }finally{h.close();}
});

test('discovery and favorites options reach the host while optional product metadata stays available',async()=>{
 const rich={...first,material:'925 실버',materials:['925 실버','써지컬'],tags:{motif:['하트'],style:['심플']}};
 const h=hostHarness({onList:options=>({category:options.category,products:[rich],total:1})});try{
  const discovery={tags:{motif:['하트'],style:['심플']},min:'1000',max:20000,strict:true,cap:500};
  h.receive({type:'request',requestId:1,action:'list',options:{favoritesOnly:true,discovery}});await tick();
  assert.equal(h.lists[0].favoritesOnly,true);assert.deepEqual(h.lists[0].discovery,discovery);
  const product=h.sent.at(-1).data.data.products[0];assert.equal(product.material,'925 실버');assert.deepEqual(product.materials,rich.materials);assert.deepEqual(product.tags,rich.tags);
  const bad=[{favoritesOnly:'true'},{discovery:{tags:{unknown:['a']}}},{discovery:{tags:{motif:['하트','하트']}}},{discovery:{min:'100',max:'10'}},{discovery:{strict:'true'}},{discovery:{cap:1001}},{discovery:{extra:'no'}},{discovery:{tags:{motif:Array(1)}}}];
  bad.forEach((options,index)=>h.receive({type:'request',requestId:index+2,action:'list',options}));await tick();assert.equal(h.lists.length,1);assert.ok(h.sent.slice(1).every(item=>item.data.ok===false));
 }finally{h.controller.dispose();h.dom.window.close();}
});

test('wish retains its request beyond a normal ten-second RPC timeout and still accepts confirmation',async()=>{
 const deferred=new Map(),h=hostHarness({clock:true,onAction:()=>new Promise(resolve=>deferred.set('wish',resolve)),onList:()=>new Promise(resolve=>deferred.set('list',resolve))});try{
  h.receive({type:'request',requestId:1,action:'wish',id:first.id});h.receive({type:'request',requestId:2,action:'list',options:{}});await tick();
  h.advance(10000);assert.equal(h.sent.length,1);assert.equal(h.sent[0].data.requestId,2);assert.equal(h.sent[0].data.ok,false);
  h.advance(35000);assert.equal(h.sent.length,1,'the native wish must remain pending during the existing 45-second bridge wait');
  deferred.get('wish')({confirmed:true,selected:true});await tick();assert.equal(h.sent.at(-1).data.requestId,1);assert.equal(h.sent.at(-1).data.ok,true);assert.equal(h.sent.at(-1).data.data.selected,true);
  assert.equal(h.actions.length,1);
 }finally{h.controller.dispose();h.dom.window.close();}
});

test('inline startup errors block ready and late errors remain visible after a successful ready',async()=>{
 for(const [html,inlineError]of [['<script>throw Error("HTML 초기 오류")</script>',true],['<p>정상 시작</p>',false]]){
  const h=hostHarness({code:{html,css:'',js:''}}),parent={postMessage:data=>queueMicrotask(()=>h.receive(data))},vc=new VirtualConsole();vc.on('jsdomError',()=>{});let child;
  try{
   child=new JSDOM(h.frame.srcdoc,{url:baseUrl,runScripts:'dangerously',virtualConsole:vc,beforeParse:w=>Object.defineProperty(w,'parent',{value:parent})});await tick();
   assert.equal(h.statuses.some(value=>value.type==='ready'),!inlineError);
   if(inlineError)assert.match(h.statuses.at(-1).message,/HTML 초기 오류/);
   else{child.window.dispatchEvent(new child.window.ErrorEvent('error',{message:'나중 오류'}));await tick();assert.equal(h.statuses.at(-1).type,'error');assert.equal(h.statuses.at(-1).message,'나중 오류');}
  }finally{h.controller.dispose();child?.window.close();h.dom.window.close();}
 }
});

test('new category requests supersede a slow old request without showing its old products or errors',async()=>{
 const deferred=[],h=await coupled({onList:options=>new Promise(resolve=>deferred.push({options,resolve}))});try{
  h.cd.querySelectorAll('#pr-categories button')[1].click();await tick();h.cd.querySelectorAll('#pr-categories button')[0].click();await tick();
  assert.equal(deferred.length,2);assert.equal(deferred[0].options.category,'cat_other');assert.equal(deferred[1].options.category,'추천');
  deferred[1].resolve({category:'추천',products:[first],total:1});await tick();deferred[0].resolve({category:'cat_other',products:[second],total:1});await tick();
  assert.equal(h.cd.querySelector('#pr-categories .active').textContent,'추천 상품');assert.equal(h.cd.querySelector('.pr-product').dataset.product,first.id);
 }finally{h.close();}
});

test('starter more button requests the real next offset and host bounds concurrent callbacks',async()=>{
 const third={...second,id:'2085875'},h=await coupled({onList:options=>({category:options.category,products:[third],total:3})});try{
  h.cd.querySelector('#pr-more').click();await tick();assert.equal(h.lists.at(-1).offset,2);assert.equal(h.lists.at(-1).limit,24);
  assert.deepEqual([...h.cd.querySelectorAll('.pr-product')].map(item=>item.dataset.product),[first.id,second.id,third.id]);assert.equal(h.cd.querySelector('#pr-more').hidden,true);
 }finally{h.close();}
 const bounded=hostHarness({onAction:()=>new Promise(()=>{})});try{
  for(let requestId=1;requestId<=17;requestId++)bounded.receive({type:'request',requestId,action:'wish',id:first.id});await tick();
  assert.equal(bounded.actions.length,16);assert.equal(bounded.sent.length,1);assert.equal(bounded.sent[0].data.requestId,17);assert.equal(bounded.sent[0].data.ok,false);
 }finally{bounded.controller.dispose();bounded.dom.window.close();}
});
