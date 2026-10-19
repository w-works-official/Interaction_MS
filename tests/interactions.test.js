import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const model=fs.readFileSync(new URL('../dist/model.js',import.meta.url),'utf8').replace(/^export /gm,'');
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url)));
const tick=()=>new Promise(r=>setTimeout(r,25));
async function boot({historyDenied=false,oldBanners=false,animate=false,reducedMotion=false}={}){
 const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://mockup.example/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,animations=[],scrollCalls=[];
 w.matchMedia=()=>({matches:reducedMotion});
 if(animate)w.Element.prototype.animate=function(frames,options){const animation={frames,options,cancelled:false,cancel(){this.cancelled=true;},finished:new Promise(()=>{})};animations.push(animation);return animation;};
 w.fetch=async()=>({ok:true,json:async()=>structuredClone(catalog)});
 w.scrollTo=()=>{};if(historyDenied)w.history.replaceState=()=>{throw new w.DOMException('Blocked in embedded page','SecurityError');};if(oldBanners){const config={schema:1,tabs:Object.fromEntries(['추천','신상','피어싱','귀걸이','반지','목걸이','헤어'].map(t=>[t,{sort:'recommended',manual:[],pins:[],excluded:[],hideSoldout:false}])),banners:[{id:'edit-01',type:'editorial',title:'Old banner',subtitle:'Old',after:6,span:2,tabs:['추천'],enabled:true,tone:'ink',image:'',link:''}]};w.localStorage.setItem('pr-studio-published-v1',JSON.stringify(config));w.localStorage.setItem('pr-studio-draft-v1',JSON.stringify(config));}w.CSS??={};w.CSS.escape=s=>String(s).replace(/[^\w-]/g,'');
 w.scrollTo=(...args)=>scrollCalls.push(args);
 w.eval(`(()=>{${model}\n${app}\n})();`);
 await tick();return {dom,w,d:w.document,errors,animations,scrollCalls};
}
test('real app category clicks update active tab, count and actual product IDs',async()=>{
 const {dom,d,errors}=await boot();
 try{
  assert.equal(d.querySelector('.category-tabs button.active').dataset.tab,'추천');
  for(const tab of ['반지','목걸이','팔찌','헤어','피어싱','귀걸이','추천']){
   d.querySelector(`.category-tabs [data-tab="${tab}"]`).click();await tick();
   assert.equal(d.querySelector('.category-tabs button.active').dataset.tab,tab);
   const shown=[...d.querySelectorAll('[data-product]')].map(n=>n.dataset.product);
   const expected=catalog.filter(p=>tab==='추천'||p.categories.includes(tab)).map(p=>String(p.id));
   assert.ok(shown.length>0);assert.ok(shown.every(id=>expected.includes(id)),tab);
   assert.match(d.querySelector('#result-count').textContent,new RegExp(String(expected.length)));
  }
  assert.deepEqual(errors,[]);
 }finally{dom.window.close();}
});
test('gallery navigation never changes category',async()=>{
 const {dom,d}=await boot();try{
  const card=d.querySelector('[data-product="2085891"]'),before=card.querySelector('img').getAttribute('src');
  card.querySelector('[data-action="slide"][data-delta="1"]').click();await tick();
  assert.notEqual(d.querySelector('[data-product="2085891"] img').getAttribute('src'),before);
  assert.equal(d.querySelector('.category-tabs button.active').dataset.tab,'추천');
 }finally{dom.window.close();}
});
test('operator navigation and draft preview remain connected',async()=>{
 const {dom,d}=await boot();try{
  d.querySelector('[data-action="view-admin"]').click();await tick();
  assert.equal(d.querySelector('.studio-heading h1').textContent,'메인 운영');assert.ok(d.querySelector('#direction-form'));assert.equal(d.querySelector('.product-table'),null);
  d.querySelector('[data-action="admin-page"][data-page="list"]').click();await tick();
  assert.ok(d.querySelector('.product-table'));
  d.querySelector('[data-action="admin-tab"][data-tab="반지"]').click();await tick();
  assert.equal(d.querySelectorAll('[data-row-id]').length,60);
  d.querySelector('[data-action="preview-draft"]').click();await tick();
  assert.match(d.querySelector('.preview-modal iframe').getAttribute('src'),/preview=1/);
 }finally{dom.window.close();}
});


function swipe(w,node,dx,dy=0){node.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:180,clientY:180}));node.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,button:0,clientX:180+dx,clientY:180+dy}));}
function assertPhotoDots(gallery,index,count=3){const dots=gallery.querySelector('.photo-dots');assert.ok(dots);assert.equal(dots.getAttribute('role'),'img');assert.equal(dots.getAttribute('aria-label'),`사진 ${count}장 중 ${index+1}번째`);assert.equal(dots.children.length,count);assert.equal(dots.querySelectorAll('.on').length,1);assert.equal([...dots.children].findIndex(dot=>dot.classList.contains('on')),index);assert.equal(gallery.querySelector('.photo-counter'),null);}
test('horizontal category swipe changes tab; vertical gesture does not',async()=>{
 const {dom,w,d}=await boot();try{
  swipe(w,d.querySelector('.catalog-heading'),-100);await tick();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'신상');
  swipe(w,d.querySelector('.catalog-heading'),5,120);await tick();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'신상');
  swipe(w,d.querySelector('.catalog-heading'),100);await tick();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');
 }finally{dom.window.close();}
});
test('swiping a product photo changes only its image, then category buttons still work',async()=>{
 const {dom,w,d}=await boot();try{
  const photo=d.querySelector('[data-gallery="2085891"]'),before=photo.querySelector('img').getAttribute('src');
  swipe(w,photo,-100);await tick();
  assert.notEqual(d.querySelector('[data-gallery="2085891"] img').getAttribute('src'),before);
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');
  await new Promise(r=>setTimeout(r,260));
  d.querySelector('.category-tabs [data-tab="반지"]').click();await tick();
  assert.equal(d.querySelectorAll('[data-product]').length,8);
 }finally{dom.window.close();}
});
test('category tab strip swipes, arrow controls and keyboard all navigate',async()=>{
 const {dom,w,d}=await boot();try{
  swipe(w,d.querySelector('.category-tabs'),-100);await tick();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'신상');
  await new Promise(r=>setTimeout(r,260));
  d.querySelector('[data-action="next-tab"]').click();await tick();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'피어싱');
  d.querySelector('.category-tabs .active').dispatchEvent(new w.KeyboardEvent('keydown',{key:'End',bubbles:true}));await tick();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'헤어');
 }finally{dom.window.close();}
});
test('restricted embedded history cannot break category clicks',async()=>{
 const {dom,d}=await boot({historyDenied:true});try{
  d.querySelector('.category-tabs [data-tab="귀걸이"]').click();await tick();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'귀걸이');
  assert.equal(d.querySelectorAll('[data-product]').length,8);
 }finally{dom.window.close();}
});
test('default banners are removed even from previous browser saves; original-style header remains',async()=>{
 const {dom,d,w}=await boot({oldBanners:true});try{
  assert.equal(d.querySelector('.wordmark img').alt,'PINKROCKET');
  assert.match(d.querySelector('.wordmark img').getAttribute('src'),/logo-pc/);
  assert.match(d.querySelector('.wordmark source').getAttribute('srcset'),/logo-mobile/);
  assert.equal(d.querySelectorAll('.edit-intro,.feed-banner,.feed-notice').length,0);
  assert.equal(JSON.parse(w.localStorage.getItem('pr-studio-published-v1')).banners.length,0);
 }finally{dom.window.close();}
});

test('whole customer surface switches tabs, including filters, header, footer and page gaps',async()=>{
 const {dom,w,d}=await boot();try{
  for(const selector of ['.filter-chips button','.shop-header','.shop-footer','body']){
   const before=d.querySelector('.category-tabs .active').dataset.tab;
   swipe(w,d.querySelector(selector),-100);await tick();
   assert.notEqual(d.querySelector('.category-tabs .active').dataset.tab,before,selector);
  }
 }finally{dom.window.close();}
});
test('single-image thumbnail never changes tabs even on a long swipe',async()=>{
 const {dom,w,d}=await boot();try{
  const photo=d.querySelector('[data-gallery="2085674"] .photo-link');
  swipe(w,photo,-500);await tick();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');
  photo.click();assert.equal(d.querySelector('#overlay-root').children.length,0);
 }finally{dom.window.close();}
});
test('long photo gestures cycle photos in both directions without changing categories',async()=>{
 const {dom,w,d}=await boot();try{
  const photo=()=>d.querySelector('[data-gallery="2085891"]');
  for(let i=0;i<3;i++){swipe(w,photo(),-500);await tick();assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');}
  assertPhotoDots(photo(),0);
  swipe(w,photo(),500);await tick();assertPhotoDots(photo(),2);
 }finally{dom.window.close();}
});
test('search controls, overlays and operator view do not switch customer tabs',async()=>{
 const {dom,w,d}=await boot();try{
  for(const selector of ['#shop-search','#shop-sort','.labbar']){
   swipe(w,d.querySelector(selector),-100);await tick();
   assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');
  }
  d.querySelector('.photo-link').click();await tick();
  swipe(w,d.querySelector('.drawer'),-100);await tick();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');
  d.querySelector('.close-button').click();
  d.querySelector('[data-action="view-admin"]').click();await tick();
  assert.equal(d.querySelector('.studio-heading h1').textContent,'메인 운영');assert.ok(d.querySelector('#direction-form'));assert.equal(d.querySelector('.product-table'),null);
  d.querySelector('[data-action="admin-page"][data-page="list"]').click();await tick();
  swipe(w,d.querySelector('.studio-main'),-100);await tick();
  assert.ok(d.querySelector('.product-table'));assert.ok(!d.querySelector('.shop-header'));
 }finally{dom.window.close();}
});
test('vertical scroll locks, cancelled gestures and short movements never switch tabs',async()=>{
 const {dom,w,d}=await boot();try{
  const node=d.querySelector('.shop-main');
  const fire=(type,x,y)=>node.dispatchEvent(new w.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));
  fire('pointerdown',180,180);fire('pointermove',185,230);fire('pointerup',70,230);
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');
  fire('pointerdown',180,180);fire('pointercancel',180,180);fire('pointerup',70,180);
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');
  swipe(w,node,-30);assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');
 }finally{dom.window.close();}
});

test('full snapshot counts, price sort, cross-catalog search and progressive reveal work',async()=>{
 const {dom,w,d}=await boot();try{
  assert.match(d.querySelector('#result-count').textContent,/2379/);
  assert.equal(d.querySelectorAll('[data-product]').length,8);
  d.querySelector('[data-action="load-more"]').click();await tick();assert.equal(d.querySelectorAll('[data-product]').length,14);
  const sort=d.querySelector('#shop-sort');sort.value='priceAsc';sort.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();
  const visible=[...d.querySelectorAll('[data-product]')].map(x=>catalog.find(p=>p.id===x.dataset.product).price);
  assert.equal(visible[0],Math.min(...catalog.map(p=>p.price)));assert.ok(visible.every((p,i)=>i===0||visible[i-1]<=p));
  const wanted=catalog.at(-1),search=d.querySelector('#shop-search');search.value=wanted.id;search.dispatchEvent(new w.Event('input',{bubbles:true}));await tick();
  assert.ok(d.querySelector(`[data-product="${wanted.id}"]`));
 }finally{dom.window.close();}
});
test('operator rows are bounded but search and ranks address the whole catalog',async()=>{
 const {dom,w,d}=await boot();try{
  d.querySelector('[data-action="view-admin"]').click();await tick();
  assert.equal(d.querySelector('.studio-heading h1').textContent,'메인 운영');assert.ok(d.querySelector('#direction-form'));assert.equal(d.querySelector('.product-table'),null);
  d.querySelector('[data-action="admin-page"][data-page="list"]').click();await tick();assert.equal(d.querySelectorAll('[data-row-id]').length,60);
  d.querySelector('[data-action="admin-more"]').click();await tick();assert.equal(d.querySelectorAll('[data-row-id]').length,120);
  const wanted=catalog.at(-1),search=d.querySelector('#admin-search');search.value=wanted.id;search.dispatchEvent(new w.Event('input',{bubbles:true}));await tick();
  const rank=d.querySelector(`[data-rank="${wanted.id}"]`);assert.ok(rank);rank.value='1';rank.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();
  const reset=d.querySelector('#admin-search');reset.value='';reset.dispatchEvent(new w.Event('input',{bubbles:true}));await tick();
  assert.equal(d.querySelector('[data-row-id]').dataset.rowId,wanted.id);
 }finally{dom.window.close();}
});
test('remote image failure leaves an accessible product card and detail flow',async()=>{
 const {dom,w,d}=await boot();try{
  const photo=d.querySelector('.photo-link');photo.querySelector('img').dispatchEvent(new w.Event('error'));
  assert.ok(photo.classList.contains('image-missing'));photo.click();await tick();
  assert.ok(d.querySelector('.drawer a[href*="branduid="]'));
 }finally{dom.window.close();}
});

test('drag follows the finger, previews the actual next photo and distinguishes short from long',async()=>{
 const {dom,w,d}=await boot();try{
  const photo=()=>d.querySelector('[data-gallery="2085891"]');
  photo().getBoundingClientRect=()=>({width:200});
  const fire=(type,x,y=180)=>photo().dispatchEvent(new w.MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:y}));
  fire('pointerdown',180);fire('pointermove',130);
  assert.ok(photo().classList.contains('swiping'));
  assert.match(photo().querySelector('.photo-link img').style.transform,/-50px/);
  assert.notEqual(photo().querySelector('.gesture-neighbor').src,photo().querySelector('.photo-link img').src);
  fire('pointerup',130);await tick();assertPhotoDots(photo(),1);
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');assert.equal(d.querySelectorAll('.gesture-neighbor').length,0);
  photo().getBoundingClientRect=()=>({width:200});fire('pointerdown',180);fire('pointermove',40);
  assert.match(photo().querySelector('.swipe-cue').textContent,/사진 넘기기/);
  fire('pointerup',40);await tick();assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');assertPhotoDots(photo(),2);
 }finally{dom.window.close();}
});
test('short drags on a single photo do not switch tabs or open quickview',async()=>{
 const {dom,w,d}=await boot();try{
  const photo=d.querySelector('[data-gallery="2085674"] .photo-link');swipe(w,photo,-60);await tick();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');photo.click();assert.equal(d.querySelector('#overlay-root').children.length,0);
  assert.equal(photo.parentElement.querySelector('.photo-counter'),null);assert.equal(photo.parentElement.querySelector('.photo-dots'),null);
 }finally{dom.window.close();}
});
test('tags rerank immediately, strict matching filters, price bounds and reset compose',async()=>{
 const {dom,w,d}=await boot();try{
  d.querySelector('[data-group="motif"][data-tag="하트"]').click();await tick();
  const shown=[...d.querySelectorAll('[data-product]')].map(x=>catalog.find(p=>p.id===x.dataset.product));
  assert.ok(shown.every(p=>p.tags.motif.includes('하트')));
  assert.equal(d.querySelector('[data-group="motif"][data-tag="하트"]').getAttribute('aria-pressed'),'true');
  const strict=d.querySelector('#discovery-strict');strict.checked=true;strict.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();
  const expected=catalog.filter(p=>p.tags.motif.includes('하트')).length;assert.match(d.querySelector('#result-count').textContent,new RegExp(String(expected)));
  const max=d.querySelector('#discovery-max');max.value='5000';max.dispatchEvent(new w.Event('input',{bubbles:true}));await tick();
  assert.ok([...d.querySelectorAll('[data-product]')].every(x=>catalog.find(p=>p.id===x.dataset.product).price<=5000));
  d.querySelector('[data-action="reset-discovery"]').click();await tick();assert.match(d.querySelector('#result-count').textContent,/2379/);
 }finally{dom.window.close();}
});
test('recommendation limits and tag choices are remembered separately per category',async()=>{
 const {dom,w,d}=await boot();try{
  const cap=d.querySelector('#discovery-cap');cap.value='500';cap.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();assert.match(d.querySelector('#result-count').textContent,/500/);
  d.querySelector('[data-group="material"][data-tag="써지컬스틸"]').click();await tick();
  d.querySelector('.category-tabs [data-tab="팔찌"]').click();await tick();assert.equal(d.querySelector('#discovery-cap').value,'0');
  d.querySelector('.category-tabs [data-tab="추천"]').click();await tick();assert.equal(d.querySelector('#discovery-cap').value,'500');
  assert.equal(d.querySelector('[data-group="material"][data-tag="써지컬스틸"]').getAttribute('aria-pressed'),'true');
 }finally{dom.window.close();}
});

test('local photo upload computes a tone, enables matching, and clears without persisting the photo',async()=>{
 const {dom,w,d}=await boot();try{
  const src='data:image/png;base64,iVBORw0KGgo=';
  w.FileReader=class{readAsDataURL(){this.result=src;this.onload();}};
  w.Image=class{set src(value){this.onload();}};
  w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},getImageData(){const pixels=new Uint8ClampedArray(48*48*4);for(let i=0;i<pixels.length;i+=4){pixels[i]=255;pixels[i+3]=255;}return {data:pixels};}});
  const input=d.querySelector('#discovery-photo');Object.defineProperty(input,'files',{value:[{type:'image/png',size:100}]});input.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();
  assert.equal(d.querySelector('.photo-discovery>img').getAttribute('src'),src);assert.equal(d.querySelector('#shop-sort').value,'match');
  assert.match(d.querySelector('#discovery-summary').title,/사진 색감/);
  for(let i=0;i<w.localStorage.length;i++)assert.ok(!w.localStorage.getItem(w.localStorage.key(i)).includes(src));
  d.querySelector('[data-action="clear-photo"]').click();await tick();assert.equal(d.querySelector('.photo-discovery>img'),null);
 }finally{dom.window.close();}
});

test('a drag started on a thumbnail and released over the page cannot switch categories',async()=>{
 const {dom,w,d}=await boot();try{
  const photo=d.querySelector('[data-gallery="2085891"]');
  photo.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:400,clientY:180}));
  d.body.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,button:0,clientX:10,clientY:180}));await tick();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'추천');
  assertPhotoDots(d.querySelector('[data-gallery="2085891"]'),1);
 }finally{dom.window.close();}
});
test('filter sheet opens, keeps selections, applies and closes with focus restored',async()=>{
 const {dom,w,d}=await boot();try{
  d.querySelector('[data-action="open-filters"]').click();await tick();
  assert.ok(d.querySelector('.discovery').open);assert.equal(d.body.style.overflow,'hidden');assert.ok(d.querySelector('.discovery-body[role="dialog"]'));
  d.querySelector('[data-group="motif"][data-tag="하트"]').click();await tick();
  assert.ok(d.querySelector('.discovery').open);assert.match(d.querySelector('#filter-preview-count').textContent,/개/);
  d.querySelector('.apply-filters').click();await tick();
  assert.equal(d.querySelector('.discovery').open,false);assert.equal(d.body.style.overflow,'');
  assert.equal(d.activeElement,d.querySelector('.discovery summary'));
  assert.equal(d.querySelector('[data-group="motif"][data-tag="하트"]').getAttribute('aria-pressed'),'true');
  d.querySelector('[data-action="open-filters"]').click();await tick();
  d.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await tick();assert.equal(d.querySelector('.discovery').open,false);
 }finally{dom.window.close();}
});

test('category motion follows navigation direction and rapid taps cancel stale animation and scroll work',async()=>{
 const {dom,d,animations,scrollCalls}=await boot({animate:true});
 try{
  d.querySelector('[data-action="tab"][data-tab="신상"]').click();await tick();
  assert.equal(animations.length,1);assert.match(animations[0].frames[0].transform,/translateX\([1-9]/);assert.equal(animations[0].options.duration,240);
  d.querySelector('[data-action="tab"][data-tab="추천"]').click();await tick();
  assert.equal(animations[0].cancelled,true);assert.equal(animations.length,2);assert.match(animations[1].frames[0].transform,/translateX\(-/);
  const scrollBefore=scrollCalls.length;
  for(const tab of ['신상','피어싱','귀걸이'])d.querySelector(`[data-action="tab"][data-tab="${tab}"]`).click();
  await tick();assert.equal(animations[1].cancelled,true);assert.equal(animations.length,3);
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'귀걸이');assert.equal(scrollCalls.length,scrollBefore+1);
  assert.ok(d.querySelectorAll('[data-product]').length>0);
 }finally{dom.window.close();}
});

test('reduced motion keeps category updates immediate without scheduling a slide animation',async()=>{
 const {dom,d,animations}=await boot({animate:true,reducedMotion:true});
 try{
  d.querySelector('[data-action="tab"][data-tab="반지"]').click();
  assert.equal(d.querySelector('.category-tabs .active').dataset.tab,'반지');assert.ok(d.querySelectorAll('[data-product]').length>0);
  await tick();assert.equal(animations.length,0);assert.equal(d.querySelector('#app').classList.contains('category-transition'),false);
 }finally{dom.window.close();}
});
