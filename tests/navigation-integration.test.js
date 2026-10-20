import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {initialConfig,normalizeCatalog,validateConfig} from '../dist/model.js';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const model=fs.readFileSync(new URL('../dist/model.js',import.meta.url),'utf8').replace(/^export /gm,'');
const runtime=fs.readFileSync(new URL('../dist/customer-code.js',import.meta.url),'utf8').replace(/^export /gm,'');
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const raw=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url),'utf8')),catalog=normalizeCatalog(raw);
const first=catalog[0],second=catalog[1],far=catalog.at(-1),customId='cat_photo_picks',members=[first.id,second.id,far.id];
const draftKey='pr-studio-draft-v1',publishedKey='pr-studio-published-v1',tick=()=>new Promise(resolve=>setTimeout(resolve,25));
function configWithCategory({id=customId,label='직접 고른 상품',productIds=members,changes={}}={}){
 const config=initialConfig();config.categories.push({id,label,enabled:true,mode:'manual',productIds:[...productIds],note:'실제 상품 ID와 사진으로 검토',...changes});
 return validateConfig(config,catalog);
}
async function boot({url='https://mockup.example/?view=shop',draft=initialConfig(),published=initialConfig()}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
 w.localStorage.setItem(draftKey,JSON.stringify(draft));w.localStorage.setItem(publishedKey,JSON.stringify(published));
 w.fetch=async()=>({ok:true,json:async()=>structuredClone(raw)});w.scrollTo=()=>{};w.matchMedia=()=>({matches:true});w.CSS??={};w.CSS.escape=value=>String(value).replace(/[^\w-]/g,'');
 w.eval(`(()=>{${model}\n${runtime}\n${app}\n})();`);await tick();
 const click=async selector=>{const control=d.querySelector(selector);assert.ok(control,selector);control.click();await tick();};
 const set=async(selector,value,event='input')=>{const control=d.querySelector(selector);assert.ok(control,selector);if(control.type==='checkbox')control.checked=!!value;else control.value=String(value);control.dispatchEvent(new w.Event(event,{bubbles:true}));await tick();};
 return {w,d,errors,click,set,products:()=>[...d.querySelectorAll('#product-feed [data-product]')].map(node=>node.dataset.product),
  rows:()=>[...d.querySelectorAll('[data-row-id]')].map(node=>node.dataset.rowId),
  saved:()=>JSON.parse(w.localStorage.getItem(draftKey)),published:()=>JSON.parse(w.localStorage.getItem(publishedKey)),
  update:async(key,config)=>{w.localStorage.setItem(key,JSON.stringify(config));w.dispatchEvent(new w.StorageEvent('storage',{key,newValue:JSON.stringify(config)}));await tick();},
  close:()=>w.close()};
}

test('a custom customer category composes its complete saved membership before progressive reveal, including the final snapshot product',async()=>{
 const ordered=[far.id,...catalog.slice(0,11).map(product=>product.id)],config=configWithCategory({productIds:ordered});config.tabs[customId].manual=[...ordered];
 const before=structuredClone(config),h=await boot({url:`https://mockup.example/?view=shop&preview=1&tab=${customId}`,draft:config});
 try{
  assert.equal(catalog.length,2379);assert.equal(h.d.querySelector('.category-tabs .active').dataset.tab,customId);assert.equal(h.d.querySelector('#main-content h1').textContent,'직접 고른 상품');
  assert.deepEqual(h.products(),ordered.slice(0,8));assert.match(h.d.querySelector('#result-count').textContent,/12개의 상품/);assert.ok(h.products().includes(far.id));
  await h.click('[data-action="load-more"]');assert.deepEqual(h.products(),ordered);assert.equal(h.d.querySelector('[data-action="load-more"]'),null);
  assert.deepEqual(h.saved(),before);assert.deepEqual(h.published().categories.map(category=>category.id),initialConfig().categories.map(category=>category.id));assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('custom names and membership are isolated between the published customer page and draft preview',async()=>{
 const published=configWithCategory({label:'공개된 모음',productIds:[first.id]}),draft=configWithCategory({label:'편집 중인 모음',productIds:[far.id]});
 for(const preview of [false,true]){
  const h=await boot({url:`https://mockup.example/?view=shop&tab=${customId}${preview?'&preview=1':''}`,draft,published});try{
   assert.equal(h.d.querySelector('#main-content h1').textContent,preview?'편집 중인 모음':'공개된 모음');assert.deepEqual(h.products(),[preview?far.id:first.id]);
   assert.equal(h.d.querySelector('.preview-ribbon')!==null,preview);assert.deepEqual(h.saved(),draft);assert.deepEqual(h.published(),published);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
 const h=await boot({url:`https://mockup.example/?view=shop&tab=${customId}`,draft});try{
  assert.equal(h.d.querySelector(`.category-tabs [data-tab="${customId}"]`),null);assert.equal(h.d.querySelector('.category-tabs .active').dataset.tab,'추천');assert.equal(new URL(h.w.location.href).searchParams.get('tab'),'추천');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('renamed, reordered and hidden categories drive customer URL fallbacks and dynamic Home/End navigation',async()=>{
 const config=configWithCategory({label:'이름을 바꾼 모음'});config.categories.push({id:'cat_last',label:'맨 앞에 놓은 모음',enabled:true,mode:'manual',productIds:[far.id]});
 const normalized=validateConfig(config,catalog),last=normalized.categories.pop();normalized.categories.unshift(last);for(const category of normalized.categories)if(!['cat_last','추천',customId].includes(category.id))category.enabled=false;
 for(const requested of ['신상','cat_missing']){
  const h=await boot({url:`https://mockup.example/?view=shop&preview=1&tab=${encodeURIComponent(requested)}`,draft:normalized});try{
   const tabs=[...h.d.querySelectorAll('.category-tabs [data-tab]')];assert.deepEqual(tabs.map(node=>node.dataset.tab),['cat_last','추천',customId]);assert.deepEqual(tabs.map(node=>node.textContent),['맨 앞에 놓은 모음','추천','이름을 바꾼 모음']);
   assert.equal(h.d.querySelector('.category-tabs .active').dataset.tab,'cat_last');assert.equal(new URL(h.w.location.href).searchParams.get('tab'),'cat_last');
   h.d.querySelector('.category-tabs .active').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));await tick();assert.equal(h.d.querySelector('.category-tabs .active').dataset.tab,customId);
   assert.equal(h.d.querySelector('#main-content h1').textContent,'이름을 바꾼 모음');
   h.d.querySelector('.category-tabs .active').dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));await tick();assert.equal(h.d.querySelector('.category-tabs .active').dataset.tab,'cat_last');assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('a published category hidden by a storage update falls back to the first visible category without a blank feed',async()=>{
 const published=configWithCategory(),h=await boot({url:`https://mockup.example/?view=shop&tab=${customId}`,published,draft:published});
 try{
  assert.equal(h.d.querySelector('.category-tabs .active').dataset.tab,customId);const changed=structuredClone(published);changed.categories.find(category=>category.id===customId).enabled=false;
  await h.update(publishedKey,changed);assert.equal(h.d.querySelector('.category-tabs .active').dataset.tab,'추천');assert.ok(h.products().length);assert.equal(h.d.querySelector(`.category-tabs [data-tab="${customId}"]`),null);assert.equal(new URL(h.w.location.href).searchParams.get('tab'),'추천');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('custom categories connect operator pinning to the same photo pool and draft/public result comparison',async()=>{
 const config=configWithCategory();config.tabs[customId].manual=[far.id,first.id,second.id];
 const h=await boot({url:`https://mockup.example/?view=admin&adminPage=list&adminTab=${customId}`,draft:config});
 try{
  assert.deepEqual(h.rows(),[far.id,first.id,second.id]);await h.click(`[data-action="pin"][data-id="${second.id}"]`);assert.deepEqual(h.rows(),[second.id,far.id,first.id]);
  await h.click('[data-action="save-draft"]');assert.deepEqual(h.saved().tabs[customId].pins,[second.id]);assert.equal(h.published().tabs[customId],undefined);
  await h.click('[data-action="admin-page"][data-page="workbench"]');assert.deepEqual([...h.d.querySelectorAll('[data-photo-product]')].map(node=>node.dataset.photoProduct),members);
  for(const id of [first.id,far.id])await h.set(`[data-compare-id="${id}"]`,true,'change');assert.deepEqual([...h.d.querySelectorAll('[data-compare-product]')].map(node=>node.dataset.compareProduct),[first.id,far.id]);
  await h.click(`[data-action="inspect-product"][data-id="${far.id}"]`);assert.equal(h.d.querySelector('#product-review-form').dataset.productId,far.id);assert.equal(h.d.querySelector('#inspection-photo').getAttribute('src'),far.images[0]);
  await h.click('[data-action="workbench-view"][data-workbench-view="results"]');await h.click('[data-action="rank-result-view"][data-result-view="side"]');
  assert.deepEqual([...h.d.querySelectorAll('[data-result-copy="draft"] [data-rank-product]')].map(node=>node.dataset.rankProduct),[second.id,far.id,first.id]);assert.equal(h.d.querySelectorAll('[data-result-copy="published"] [data-rank-product]').length,0);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('AI workbench batches accept exact IDs within a custom category and reject an outside product atomically',async()=>{
 const config=configWithCategory(),h=await boot({url:`https://mockup.example/?view=admin&adminPage=workbench&workbenchView=rules&adminTab=${customId}`,draft:config});
 try{
  const publicBefore=h.published(),before=h.saved(),batch={version:1,tab:customId,summary:'추가 분류의 사진 검토',productEdits:[{id:catalog[5].id,tags:{style:['심플']},note:'범위 밖 상품',reviewStatus:'reviewed'}]};
  await h.set('#ai-batch-json',JSON.stringify(batch));await h.click('[data-action="validate-ai-batch"]');assert.equal(h.d.querySelector('[data-action="apply-ai-batch"]').disabled,true);assert.deepEqual(h.saved(),before);
  batch.productEdits[0]={id:far.id,tags:{style:['심플']},note:'실제 사진을 보고 검토',reviewStatus:'reviewed'};
  await h.set('#ai-batch-json',JSON.stringify(batch));await h.click('[data-action="validate-ai-batch"]');assert.equal(h.d.querySelector('[data-action="apply-ai-batch"]').disabled,false);assert.deepEqual(h.saved(),before);
  await h.click('[data-action="apply-ai-batch"]');await h.click('[data-action="save-draft"]');assert.equal(h.saved().productEdits[far.id].reviewStatus,'reviewed');assert.deepEqual(h.saved().categories,config.categories);assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('custom categories remain valid banner targets in the existing editor and customer draft composition',async()=>{
 const config=configWithCategory();config.banners=[{id:'custom-only',type:'notice',title:'이 분류의 안내',after:0,zone:'before-feed',tabs:[customId],enabled:true}];
 const normalized=validateConfig(config,catalog),editor=await boot({url:`https://mockup.example/?view=admin&adminPage=banners&adminTab=${customId}`,draft:normalized});
 try{
  await editor.click('[data-action="edit-banner"][data-id="custom-only"]');const checkbox=editor.d.querySelector(`#banner-form [name="tabs"][value="${customId}"]`);assert.ok(checkbox);assert.equal(checkbox.checked,true);assert.match(checkbox.closest('label').textContent,/직접 고른 상품/);
  await editor.click('#banner-form button[type="submit"]');await editor.click('[data-action="save-draft"]');assert.deepEqual(editor.saved().banners[0].tabs,[customId]);assert.equal(editor.published().banners.length,0);assert.deepEqual(editor.errors,[]);
 }finally{editor.close();}
 const customer=await boot({url:`https://mockup.example/?view=shop&preview=1&tab=${customId}`,draft:normalized});try{assert.ok(customer.d.querySelector('[data-block-zone="before-feed"] [data-content-block="custom-only"]'));assert.deepEqual(customer.products(),members);assert.deepEqual(customer.errors,[]);}finally{customer.close();}
});

test('custom filter visibility removes latent material, price and hidden-group constraints from results and banner state',async()=>{
 const config=configWithCategory();config.productEdits={[first.id]:{tags:{style:['심플']},reviewStatus:'reviewed'},[second.id]:{tags:{style:['화려']},reviewStatus:'reviewed'},[far.id]:{tags:{style:['심플']},reviewStatus:'reviewed'}};
 config.banners=[{id:'unfiltered-only',type:'notice',title:'조건 없는 목록 안내',after:0,zone:'before-feed',tabs:[customId],showWhenFiltered:false,enabled:true}];
 const normalized=validateConfig(config,catalog),h=await boot({url:`https://mockup.example/?view=shop&preview=1&tab=${customId}`,draft:normalized});
 try{
  assert.ok(h.d.querySelector('#discovery-photo'));assert.ok(h.d.querySelector('#discovery-min'));assert.ok(h.d.querySelector('.filter-chips'));
  await h.click('[data-action="open-filters"]');await h.click('[data-action="discovery-tag"][data-group="motif"][data-tag="별"]');await h.set('#discovery-strict',true,'change');await h.set('#discovery-min','999999');await h.click('[data-action="material"][data-material="925 실버"]');assert.deepEqual(h.products(),[]);
  const hidden=structuredClone(normalized);hidden.categories.find(category=>category.id===customId).filters={groups:['style'],material:false,price:false,photo:false};await h.update(draftKey,hidden);
  assert.equal(h.d.querySelector('#discovery-photo'),null);assert.equal(h.d.querySelector('#discovery-min'),null);assert.equal(h.d.querySelector('.filter-chips').hidden,true);assert.deepEqual([...new Set([...h.d.querySelectorAll('.discovery [data-group]')].map(node=>node.dataset.group))],['style']);
  assert.deepEqual(h.products(),members);assert.ok(h.d.querySelector('[data-content-block="unfiltered-only"]'));assert.equal(h.d.querySelector('#discovery-summary').hidden,true);
  await h.click('[data-action="discovery-tag"][data-group="style"][data-tag="심플"]');assert.deepEqual(h.products(),[first.id,far.id]);assert.equal(h.d.querySelector('[data-content-block="unfiltered-only"]'),null);
  await h.click('[data-action="reset-discovery"]');assert.deepEqual(h.products(),members);assert.ok(h.d.querySelector('[data-content-block="unfiltered-only"]'));assert.equal(h.published().categories.some(category=>category.id===customId),false);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
