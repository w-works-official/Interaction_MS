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
const draftKey='pr-studio-draft-v1',publishedKey='pr-studio-published-v1';
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
const legacy=(id,changes={})=>({id,type:'editorial',title:'기존 블록 '+id,subtitle:'기존 설명',tag:'기존 라벨',after:2,span:2,tabs:['추천'],enabled:true,tone:'cream',image:'',link:'',...changes});
async function boot({url='https://mockup.example/?view=admin&adminPage=banners',banners=[],config}={}){
 const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
 const w=dom.window,d=w.document,seed=config||{...initialConfig(),banners};
 w.localStorage.setItem(draftKey,JSON.stringify(seed));w.localStorage.setItem(publishedKey,JSON.stringify(initialConfig()));
 w.fetch=async()=>({ok:true,json:async()=>structuredClone(catalog)});w.scrollTo=()=>{};
 w.CSS??={};w.CSS.escape=value=>String(value).replace(/[^\w-]/g,'');
 w.eval(`(()=>{${model}\n${storefrontRuntime}\n${productImagesRuntime}\n${runtime}\n${app}\n})();`);await tick();
 const click=async selector=>{const node=d.querySelector(selector);assert.ok(node,selector);node.click();await tick();};
 const fill=async values=>{const form=d.querySelector('#banner-form');assert.ok(form);for(const [name,value] of Object.entries(values)){
  const control=form.querySelector(`[name="${name}"]`);assert.ok(control,name);
  if(control.type==='checkbox')control.checked=!!value;else control.value=String(value);
  control.dispatchEvent(new w.Event('input',{bubbles:true}));
 }await tick();};
 return {dom,w,d,errors,click,fill,
  rows:()=>[...d.querySelectorAll('[data-block-id]')].map(row=>row.dataset.blockId),
  saved:()=>JSON.parse(w.localStorage.getItem(draftKey)),published:()=>JSON.parse(w.localStorage.getItem(publishedKey)),
  submit:()=>click('#banner-form button[type="submit"]'),close:()=>w.close()};
}

test('inline content editor previews unsaved input and changes the draft only after apply',async()=>{
 const h=await boot(),{d,click,fill}=h;
 try{
  const publicBefore=h.published();
  for(const type of ['editorial','notice','image','text','spacer','divider'])assert.ok(d.querySelector(`[data-action="add-banner"][data-type="${type}"]`));
  await click('[data-action="add-banner"][data-type="text"]');
  assert.ok(d.querySelector('#banner-form'));assert.equal(d.querySelector('.drawer #banner-form'),null);
  await fill({title:'적용 전 임시 문구',subtitle:'미리보기에서만 확인'});
  assert.ok(d.querySelector('#block-live-preview').textContent.includes('적용 전 임시 문구'));
  await click('[data-action="save-draft"]');assert.deepEqual(h.saved().banners,[]);
  await click('[data-action="add-banner"][data-type="text"]');await fill({title:'적용한 텍스트 블록'});await h.submit();
  assert.equal(h.rows().length,1);const id=h.rows()[0];
  assert.ok(d.querySelector('#block-result').textContent.includes(id));assert.equal(d.querySelector('#block-result').getAttribute('role'),'status');
  await click('[data-action="save-draft"]');assert.equal(h.saved().banners[0].title,'적용한 텍스트 블록');assert.equal(h.saved().banners[0].type,'text');
  assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('editing a legacy banner preserves its ID, content, placement, tabs and span defaults',async()=>{
 const original=legacy('legacy-preserved',{after:5,link:'https://www.pink-rocket.com/'}),h=await boot({banners:[original]}),{d,click,fill}=h;
 try{
  const publicBefore=h.published(),before=h.saved().banners[0];
  await click('[data-action="edit-banner"][data-id="legacy-preserved"]');
  assert.equal(d.querySelector('#banner-form [name="widthPc"]').value,'2');assert.equal(d.querySelector('#banner-form [name="widthMobile"]').value,'full');
  assert.equal(d.querySelector('#banner-form [name="placement"]').value,'count');
  await fill({title:'기존 배너 제목 수정'});await h.submit();await click('[data-action="save-draft"]');
  const after=h.saved().banners[0];assert.equal(after.title,'기존 배너 제목 수정');
  for(const key of ['id','type','subtitle','tag','after','span','tabs','enabled','image','link'])assert.deepEqual(after[key],before[key],key);
  assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('block width and style fields persist and the actual renderer places styled content in its configured zone',async()=>{
 const h=await boot(),{d,click,fill}=h;
 try{
  await click('[data-action="add-banner"][data-type="image"]');
  await fill({title:'상단 이미지 블록',image:'https://example.invalid/block.png',zone:'top',widthPc:'2',widthMobile:'1',background:'#112233',textColor:'#abcdef',padding:24,radius:12,align:'center',imageFit:'contain',newRow:true});
  await h.submit();await click('[data-action="save-draft"]');
  const block=h.saved().banners[0];assert.ok(block,'valid styled block is applied');
  assert.equal(block.zone,'top');assert.equal(String(block.widthPc),'2');assert.equal(String(block.widthMobile),'1');
  assert.equal(block.background,'#112233');assert.equal(block.textColor,'#abcdef');assert.equal(block.padding,24);assert.equal(block.radius,12);
  assert.equal(block.align,'center');assert.equal(block.imageFit,'contain');assert.equal(block.newRow,true);
  const rendered=d.querySelector(`#block-preview-layout [data-block-zone="top"] [data-content-block="${block.id}"]`);assert.ok(rendered);
  const style=rendered.getAttribute('style')||'';assert.match(style,/(?:#112233|rgb\(17,\s*34,\s*51\))/i);assert.match(style,/(?:#abcdef|rgb\(171,\s*205,\s*239\))/i);
  assert.match(style,/24px/);assert.match(style,/12px/);assert.ok(rendered.querySelector('img'));
  const publicBefore=h.published();await click('[data-action="block-preview-mobile"]');await click('[data-action="block-preview-pc"]');
  await click('[data-action="save-draft"]');assert.deepEqual(h.saved().banners,[block]);assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('same-position priority, duplicate, hide and block undo preserve product curation and the published copy',async()=>{
 const config=initialConfig();config.tabs['추천'].pins=[catalog[0].id];config.banners=[legacy('priority-a'),legacy('priority-b')];
 const h=await boot({config}),{d,click}=h;
 try{
  const tabsBefore=h.saved().tabs,publicBefore=h.published();assert.deepEqual(h.rows(),['priority-a','priority-b']);
  await click('[data-action="move-block-up"][data-id="priority-b"]');assert.deepEqual(h.rows(),['priority-b','priority-a']);
  const previewIds=[...d.querySelectorAll('#block-preview-layout [data-preview-block]')].map(node=>node.dataset.previewBlock);
  assert.deepEqual(previewIds.filter(id=>id==='priority-a'||id==='priority-b'),['priority-b','priority-a']);
  await click('[data-action="duplicate-banner"][data-id="priority-a"]');const copy=h.rows().find(id=>!['priority-a','priority-b'].includes(id));assert.ok(copy);
  await click(`[data-action="toggle-banner"][data-id="${copy}"]`);await click('[data-action="save-draft"]');assert.equal(h.saved().banners.find(block=>block.id===copy).enabled,false);
  await click('[data-action="undo-blocks"]');await click('[data-action="save-draft"]');assert.equal(h.saved().banners.find(block=>block.id===copy).enabled,true);
  await click(`[data-action="delete-banner"][data-id="${copy}"]`);assert.ok(!h.rows().includes(copy));
  await click('[data-action="undo-blocks"]');assert.ok(h.rows().includes(copy));await click('[data-action="redo-blocks"]');assert.ok(!h.rows().includes(copy));
  await click('[data-action="save-draft"]');assert.deepEqual(h.saved().tabs,tabsBefore);assert.deepEqual(h.published(),publicBefore);
  assert.deepEqual(h.saved().banners.map(block=>block.id),['priority-b','priority-a']);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('customer draft composition respects product anchors, missing anchors and filter visibility without publishing',async()=>{
 const anchor=catalog[0].id,blocks=[
  legacy('anchored',{placement:'product',anchorId:anchor,anchorSide:'after',zone:'feed',showWhenFiltered:true}),
  legacy('missing-anchor',{placement:'product',anchorId:'999999999999',anchorSide:'before',zone:'feed',showWhenFiltered:true}),
  legacy('filter-hidden',{after:0,zone:'top',showWhenFiltered:false}),
  legacy('filter-visible',{after:0,zone:'before-feed',showWhenFiltered:true}),
  legacy('overflow-hidden',{after:4,placement:'count',overflow:'hide',zone:'feed',showWhenFiltered:true}),
  legacy('overflow-end',{after:4,placement:'count',overflow:'end',zone:'feed',showWhenFiltered:true})
 ];
 const h=await boot({url:'https://mockup.example/?view=shop&preview=1',banners:blocks}),{d,w}=h;
 try{
  const publicBefore=h.published();assert.ok(d.querySelector('[data-content-block="anchored"]'));
  assert.equal(d.querySelector('[data-content-block="missing-anchor"]'),null);assert.ok(d.querySelector('[data-block-zone="top"] [data-content-block="filter-hidden"]'));
  const search=d.querySelector('#shop-search');search.value=anchor;search.dispatchEvent(new w.Event('input',{bubbles:true}));await tick();
  assert.equal(d.querySelectorAll('[data-product]').length,1);assert.ok(d.querySelector('[data-content-block="anchored"]'));
  assert.equal(d.querySelector('[data-content-block="filter-hidden"]'),null);assert.ok(d.querySelector('[data-block-zone="before-feed"] [data-content-block="filter-visible"]'));
  assert.equal(d.querySelector('[data-content-block="overflow-hidden"]'),null);assert.ok(d.querySelector('[data-content-block="overflow-end"]'));
  search.value=catalog[1].id;search.dispatchEvent(new w.Event('input',{bubbles:true}));await tick();assert.equal(d.querySelector('[data-content-block="anchored"]'),null);
  assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('AI block IDs, explicit priority, numeric placement and preview expansion operate on the selected saved block',async()=>{
 const h=await boot({banners:[legacy('place-a'),legacy('place-b')]}),{d,w,click}=h;
 try{
  const publicBefore=h.published(),result=()=>d.querySelector('#block-result');
  for(const row of d.querySelectorAll('[data-block-id]'))for(const action of ['edit-banner','toggle-banner','duplicate-banner','delete-banner','move-block-up','move-block-down']){
   const control=row.querySelector(`[data-action="${action}"]`);assert.ok(control);assert.ok(control.getAttribute('aria-label')?.includes(row.dataset.blockId));
  }
  const rank=d.querySelector('[data-block-rank="place-a"]');assert.ok(rank);rank.value='2';
  await click('[data-action="apply-block-rank"][data-id="place-a"]');assert.deepEqual(h.rows(),['place-b','place-a']);
  await click('#block-preview-layout [data-preview-block="place-a"]');
  const beforeRevision=Number(result().dataset.revision);assert.ok(Number.isSafeInteger(beforeRevision));
  await click('[data-action="place-block"][data-after="3"]');
  assert.ok(Number(result().dataset.revision)>beforeRevision);assert.ok(result().textContent.includes('place-a'));
  await click('[data-action="save-draft"]');const placed=h.saved().banners.find(block=>block.id==='place-a');assert.equal(placed.after,3);assert.equal(placed.placement,'count');
  const maxAfter=()=>Math.max(...[...d.querySelectorAll('#block-preview-layout [data-action="place-block"][data-after]')].map(node=>Number(node.dataset.after)));
  const beforeMore=maxAfter();assert.equal(beforeMore,24);await click('[data-action="block-preview-more"]');assert.equal(maxAfter(),48);
  await click('[data-action="block-preview-more"]');assert.equal(maxAfter(),60);
  assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('all six content types render in their requested customer zones without changing the product count',async()=>{
 const specs=[['editorial','top'],['notice','after-tabs'],['image','before-feed'],['text','feed'],['spacer','feed'],['divider','bottom']];
 const banners=specs.map(([type,zone])=>legacy('type-'+type,{type,zone,after:0,image:type==='image'?'https://example.invalid/block.png':''}));
 const h=await boot({url:'https://mockup.example/?view=shop&preview=1',banners}),{d}=h;
 try{
  for(const [type,zone] of specs){
   const block=d.querySelector(`[data-block-zone="${zone}"] [data-content-block="type-${type}"]`);assert.ok(block,type+' has its configured zone');
   if(['editorial','notice','text'].includes(type))assert.ok(block.textContent.includes('기존 블록 type-'+type));
   if(type==='image')assert.equal(block.querySelector('img')?.getAttribute('src'),'https://example.invalid/block.png');
  }
  assert.equal(d.querySelectorAll('[data-content-block]').length,6);assert.equal(d.querySelectorAll('[data-product]').length,8);
  assert.deepEqual(h.published().banners,[]);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('selecting the canvas caption of a new unsaved block preserves its ID, type and temporary content',async()=>{
 const h=await boot(),{d,click,fill}=h;
 try{
  await click('[data-action="add-banner"][data-type="text"]');const id=d.querySelector('#banner-form').dataset.bannerId;
  await fill({title:'아직 적용하지 않은 텍스트'});
  await click(`#block-preview-layout [data-preview-block="${id}"]`);
  const form=d.querySelector('#banner-form');assert.equal(form.dataset.bannerId,id);assert.equal(form.elements.type.value,'text');
  assert.equal(form.elements.title.value,'아직 적용하지 않은 텍스트');assert.ok(d.querySelector('#block-live-preview').textContent.includes('아직 적용하지 않은 텍스트'));
  assert.deepEqual(h.rows(),[]);await click('[data-action="save-draft"]');assert.deepEqual(h.saved().banners,[]);
  assert.deepEqual(h.published().banners,[]);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('canvas placement updates only the saved position while retaining unapplied content in the inline editor',async()=>{
 const h=await boot({banners:[legacy('temporary-title')]}),{d,click,fill}=h;
 try{
  const originalTitle=h.saved().banners[0].title;await click('[data-action="edit-banner"][data-id="temporary-title"]');
  await fill({title:'적용 전 임시 제목'});await click('[data-action="place-block"][data-after="3"]');
  let form=d.querySelector('#banner-form');assert.equal(form.dataset.bannerId,'temporary-title');assert.equal(form.elements.title.value,'적용 전 임시 제목');assert.equal(form.elements.after.value,'3');
  await click('[data-action="save-draft"]');
  const positioned=h.saved().banners.find(block=>block.id==='temporary-title');assert.equal(positioned.title,originalTitle);assert.equal(positioned.after,3);
  form=d.querySelector('#banner-form');assert.equal(form.elements.title.value,'적용 전 임시 제목');assert.equal(form.elements.after.value,'3');
  await h.submit();await click('[data-action="save-draft"]');assert.equal(h.saved().banners[0].title,'적용 전 임시 제목');assert.equal(h.saved().banners[0].after,3);
  assert.deepEqual(h.published().banners,[]);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('empty inactive count fields do not block product-anchor or non-feed placement submission',async()=>{
 const h=await boot(),{d,click,fill}=h;
 try{
  await click('[data-action="add-banner"][data-type="text"]');await fill({title:'상품 기준 위치 테스트',after:''});
  await fill({placement:'product',anchorId:catalog[0].id});
  let form=d.querySelector('#banner-form');assert.equal(form.elements.after.disabled,true);assert.equal(form.checkValidity(),true);
  const id=form.dataset.bannerId;await h.submit();await click('[data-action="save-draft"]');
  let saved=h.saved().banners.find(block=>block.id===id);assert.ok(saved);assert.equal(saved.placement,'product');assert.equal(saved.anchorId,catalog[0].id);assert.ok(Number.isSafeInteger(saved.after));
  await click(`[data-action="edit-banner"][data-id="${id}"]`);await fill({zone:'top'});
  form=d.querySelector('#banner-form');assert.equal(form.elements.after.disabled,true);assert.equal(form.elements.anchorId.disabled,true);
  assert.equal(form.elements.placement.value,'count');assert.equal(form.checkValidity(),true);
  await h.submit();await click('[data-action="save-draft"]');saved=h.saved().banners.find(block=>block.id===id);
  assert.equal(saved.zone,'top');assert.equal(saved.placement,'count');assert.ok(Number.isSafeInteger(saved.after));
  assert.ok(d.querySelector(`#block-preview-layout [data-block-zone="top"] [data-content-block="${id}"]`));
  assert.deepEqual(h.published().banners,[]);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
