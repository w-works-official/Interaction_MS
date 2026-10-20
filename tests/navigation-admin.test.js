import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {initialConfig,TABS,TAG_GROUPS} from '../dist/model.js';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const model=fs.readFileSync(new URL('../dist/model.js',import.meta.url),'utf8').replace(/^export /gm,'');
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url)));
const draftKey='pr-studio-draft-v1',publishedKey='pr-studio-published-v1';
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
const action=(name,id,extra='')=>`[data-action="${name}"]${id?`[data-category-id="${id}"]`:''}${extra}`;
const field=name=>`#category-form [name="${name}"]`;
const category=(config,id)=>config.categories.find(item=>item.id===id);
const customId='cat_ui_daily';

async function boot({config=initialConfig(),url='https://mockup.example/?view=admin&adminPage=categories'}={}){
 const errors=[],fetchCalls=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
 const w=dom.window,d=w.document;
 w.localStorage.setItem(draftKey,JSON.stringify(config));w.localStorage.setItem(publishedKey,JSON.stringify(initialConfig()));
 w.fetch=async url=>{fetchCalls.push(String(url));return {ok:true,json:async()=>structuredClone(catalog)};};w.scrollTo=()=>{};
 w.CSS??={};w.CSS.escape=value=>String(value).replace(/[^\w-]/g,'');
 w.eval(`(()=>{${model}\n${app}\n})();`);await tick();
 const click=async selector=>{const control=d.querySelector(selector);assert.ok(control,selector);control.click();await tick();};
 const set=async(selector,value,event='input')=>{const control=d.querySelector(selector);assert.ok(control,selector);if(control.type==='checkbox')control.checked=!!value;else control.value=String(value);control.dispatchEvent(new w.Event(event,{bubbles:true}));await tick();};
 const page=name=>click(`.studio-nav [data-page="${name}"]`);
 return {w,d,errors,fetchCalls,click,set,page,save:()=>click('[data-action="save-draft"]'),
  saved:()=>JSON.parse(w.localStorage.getItem(draftKey)),published:()=>JSON.parse(w.localStorage.getItem(publishedKey)),
  rows:()=>[...d.querySelectorAll('[data-nav-category]')].map(row=>row.dataset.navCategory),
  close:()=>w.close()};
}
async function startCustom(h,id=customId,label='사진으로 고른 모음'){
 await h.set('#category-new-id',id);await h.set('#category-new-label',label);await h.click(action('nav-add-category'));
 assert.equal(h.d.querySelector('#category-form').dataset.categoryId,id);
}
async function exportCategories(h){await h.click(action('nav-export-categories'));return JSON.parse(h.d.querySelector('#category-batch-json').value);}
async function submitJson(h,value){await h.set('#category-batch-json',JSON.stringify(value));await h.click(action('nav-validate-batch'));}

test('undoing category creation and redoing restores its latest curation and ranking without stale block history',async()=>{
 const h=await boot();try{
  const id=catalog[0].id;await startCustom(h);await h.set(field('productText'),id);await h.click(action('nav-apply-category',customId));
  await h.page('list');await h.click(`[data-action="admin-tab"][data-tab="${customId}"]`);await h.click(`[data-action="pin"][data-id="${id}"]`);
  await h.page('overview');await h.set('#direction-form [name="brief"]','복구할 작업 지시');await h.click('#direction-form button[type="submit"]');
  await h.page('categories');await h.click(action('nav-undo'));await h.save();assert.ok(!category(h.saved(),customId));
  await h.click(action('nav-redo'));await h.save();assert.deepEqual(h.saved().tabs[customId].pins,[id]);assert.equal(h.saved().ranking[customId].brief,'복구할 작업 지시');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('category editor boots from its URL and validates a new manual category atomically before draft-only apply/save',async()=>{
 const h=await boot();try{
  const before=h.saved(),published=h.published();
  assert.equal(h.d.querySelector('.studio-heading h1').textContent,'카테고리·필터');assert.deepEqual(h.rows(),TABS);
  assert.equal(h.d.querySelector('#category-result').getAttribute('role'),'status');assert.equal(h.d.querySelector('#category-form').dataset.categoryId,'추천');
  await startCustom(h);assert.deepEqual(h.saved(),before);assert.ok(!h.rows().includes(customId));
  await h.set(field('productText'),`${catalog[0].id},9999999999`);await h.click(action('nav-apply-category',customId));
  assert.equal(h.d.querySelector('#category-result').dataset.state,'error');assert.match(h.d.querySelector('#category-result').textContent,/상품 ID/);
  await h.save();assert.deepEqual(h.saved(),before);assert.ok(!h.rows().includes(customId));
  await h.set(field('productText'),`${catalog[0].id}, ${catalog[1].id}\n${catalog[0].id}`);await h.click(action('nav-apply-category',customId));
  assert.ok(h.rows().includes(customId));assert.deepEqual(h.saved(),before,'apply does not silently save');
  await h.save();assert.deepEqual(category(h.saved(),customId).productIds,[catalog[0].id,catalog[1].id]);assert.equal(category(h.saved(),customId).mode,'manual');
  assert.deepEqual(h.published(),published);assert.equal(h.fetchCalls.length,1);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('exact product-ID photo search edits only the input list until explicit category apply',async()=>{
 const h=await boot();try{
  await startCustom(h);const selectedId=catalog.at(-1).id;
  await h.set('#category-product-search',selectedId);
  assert.deepEqual([...h.d.querySelectorAll('[data-nav-product-card]')].map(node=>node.dataset.navProductCard),[selectedId]);
  assert.equal(h.d.querySelector('.navigation-product img').getAttribute('src'),catalog.at(-1).images[0]);
  await h.set(`[data-nav-product="${selectedId}"]`,true,'change');await h.click(action('nav-add-products',customId));
  assert.equal(h.d.querySelector(field('productText')).value,selectedId);await h.save();assert.equal(category(h.saved(),customId),undefined);
  await h.click(action('nav-apply-category',customId));await h.save();assert.deepEqual(category(h.saved(),customId).productIds,[selectedId]);
  await h.set('#category-product-search',selectedId);await h.set(`[data-nav-product="${selectedId}"]`,true,'change');await h.click(action('nav-remove-products',customId));
  assert.equal(h.d.querySelector(field('productText')).value,'');await h.save();assert.deepEqual(category(h.saved(),customId).productIds,[selectedId]);
  await h.click(action('nav-apply-category',customId));await h.save();assert.deepEqual(category(h.saved(),customId).productIds,[]);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('rename, category order and filter visibility/order persist by ID and appear in customer draft preview',async()=>{
 const h=await boot();try{
  const groups=TAG_GROUPS.map(group=>group.key),first=groups[0],second=groups[1];
  await h.set(field('label'),'먼저 보는 상품');await h.click(action('nav-filter-down','추천',`[data-group="${first}"]`));
  await h.set(`[data-nav-filter="${groups.at(-1)}"]`,false,'change');
  for(const name of ['filter-material','filter-price','filter-photo'])await h.set(field(name),false,'change');
  await h.click(action('nav-apply-category','추천'));await h.click(action('nav-category-up','신상'));await h.save();
  const saved=h.saved(),settings=category(saved,'추천');
  assert.equal(saved.categories[0].id,'신상');assert.equal(settings.label,'먼저 보는 상품');assert.deepEqual(settings.filters.groups,[second,first,...groups.slice(2,-1)]);
  assert.equal(settings.filters.material,false);assert.equal(settings.filters.price,false);assert.equal(settings.filters.photo,false);
  await h.click(action('nav-select-category','헤어'));await h.set(field('enabled'),false,'change');await h.click(action('nav-apply-category','헤어'));await h.save();
  assert.equal(category(h.saved(),'헤어').enabled,false);assert.ok(h.rows().includes('헤어'),'hidden categories stay editable');
  const preview=await boot({config:h.saved(),url:'https://mockup.example/?preview=1&tab=추천'});try{
   assert.deepEqual([...preview.d.querySelectorAll('.category-tabs [data-tab]')].map(node=>node.dataset.tab),h.saved().categories.filter(item=>item.enabled).map(item=>item.id));
   assert.equal(preview.d.querySelector('.category-tabs [data-tab="추천"]').textContent,'먼저 보는 상품');
   assert.equal(preview.d.querySelector('.filter-chips').hidden,true);assert.equal(preview.d.querySelector('#discovery-min'),null);assert.equal(preview.d.querySelector('#discovery-photo'),null);
   assert.deepEqual([...preview.d.querySelectorAll('.discovery-body .tag-row')].map(row=>row.querySelector('[data-group]')?.dataset.group).filter(Boolean),settings.filters.groups);
   assert.deepEqual(preview.errors,[]);
  }finally{preview.close();}
  await h.click('[data-action="preview-draft"]');const source=h.d.querySelector('.preview-modal iframe').getAttribute('src');assert.match(source,/preview=1/);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('category JSON export validates an impact preview before applying and preserves published state',async()=>{
 const h=await boot();try{
  const before=h.saved(),published=h.published(),value=await exportCategories(h);
  assert.deepEqual(Object.keys(value),['categories']);assert.deepEqual(value.categories,before.categories);
  value.categories[0].label='JSON으로 바꾼 이름';value.categories[1].enabled=false;
  await submitJson(h,value);assert.equal(h.d.querySelector('#category-result').dataset.state,'validated');
  assert.ok(h.d.querySelector('[data-nav-diff-id="추천"]'));assert.ok(h.d.querySelector('[data-nav-diff-id="신상"]'));
  assert.match(h.d.querySelector('.navigation-diff').textContent,/아직 초안에 적용하지 않았습니다/);assert.equal(h.d.querySelector(action('nav-apply-batch')).disabled,false);
  await h.save();assert.deepEqual(h.saved(),before);await h.click(action('nav-apply-batch'));await h.save();
  assert.equal(category(h.saved(),'추천').label,'JSON으로 바꾼 이름');assert.equal(category(h.saved(),'신상').enabled,false);assert.deepEqual(h.published(),published);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('JSON approval expires after a separate draft mutation and cannot overwrite the newer draft',async()=>{
 const h=await boot();try{
  const value=await exportCategories(h);value.categories[0].label='오래된 검증 이름';await submitJson(h,value);
  await h.page('list');await h.set('#admin-search',catalog[0].id);await h.click(`[data-action="pin"][data-id="${catalog[0].id}"]`);await h.save();
  const newer=h.saved();await h.page('categories');const apply=h.d.querySelector(action('nav-apply-batch'));assert.equal(apply.disabled,true);
  apply.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));await tick();
  assert.equal(h.d.querySelector('#category-result').dataset.state,'error');assert.match(h.d.querySelector('#category-result').textContent,/다시 검증/);
  await h.save();assert.deepEqual(h.saved(),newer);assert.ok(h.saved().tabs['추천'].pins.includes(catalog[0].id));
  await submitJson(h,value);await h.set('#category-batch-json',JSON.stringify({...value,categories:value.categories.map(item=>({...item,label:item.id==='추천'?'입력도 바뀜':item.label}))}));
  assert.equal(h.d.querySelector(action('nav-apply-batch')).disabled,true);await h.save();assert.deepEqual(h.saved(),newer);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('category undo changes categories only and preserves later curation, ranking, blocks and other tabs',async()=>{
 const config=initialConfig();config.tabs['반지'].pins=[catalog[1].id];config.ranking['반지'].brief='다른 탭의 지시';
 config.banners=[{id:'nav-preserved-block',type:'notice',title:'기존 안내',subtitle:'유지',after:1,span:2,tabs:['추천'],enabled:true,tone:'cream',image:'',link:''}];
 const h=await boot({config});try{
  const before=h.saved();await h.set(field('label'),'카테고리만 취소');await h.click(action('nav-apply-category','추천'));
  await h.page('list');await h.set('#admin-search',catalog[0].id);await h.click(`[data-action="pin"][data-id="${catalog[0].id}"]`);
  await h.page('overview');await h.set('#direction-form [name="brief"]','취소 뒤에도 남을 새 지시');await h.click('#direction-form button[type="submit"]');
  await h.page('banners');await h.click('[data-action="edit-banner"][data-id="nav-preserved-block"]');await h.set('#banner-form [name="title"]','나중에 수정한 안내');await h.click('#banner-form button[type="submit"]');
  await h.save();const newer=h.saved();await h.page('categories');await h.click(action('nav-undo'));await h.save();const undone=h.saved();
  assert.deepEqual(undone.categories,before.categories);assert.deepEqual(undone.tabs,newer.tabs);assert.deepEqual(undone.ranking,newer.ranking);assert.deepEqual(undone.banners,newer.banners);
  assert.deepEqual(undone.tabs['반지'],before.tabs['반지']);assert.deepEqual(undone.ranking['반지'],before.ranking['반지']);assert.ok(undone.tabs['추천'].pins.includes(catalog[0].id));
  assert.equal(undone.ranking['추천'].brief,'취소 뒤에도 남을 새 지시');assert.equal(undone.banners[0].title,'나중에 수정한 안내');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('undo cannot remove a custom category that a subsequently applied block references',async()=>{
 const h=await boot();try{
  await startCustom(h);await h.set(field('productText'),catalog[0].id);await h.click(action('nav-apply-category',customId));
  await h.page('banners');await h.click('[data-action="add-banner"][data-type="text"]');await h.set('#banner-form [name="title"]','이 카테고리를 사용하는 안내');
  const tabs=[...h.d.querySelectorAll('#banner-form [name="tabs"]')];for(const input of tabs)input.checked=input.value===customId;
  await h.click('#banner-form button[type="submit"]');await h.save();const before=h.saved(),block=before.banners.find(item=>item.tabs.includes(customId));assert.ok(block);
  await h.page('categories');await h.click(action('nav-undo'));assert.equal(h.d.querySelector('#category-result').dataset.state,'error');assert.ok(h.d.querySelector('#category-result').textContent.includes(block.id));
  await h.save();assert.deepEqual(h.saved(),before);assert.ok(h.rows().includes(customId));assert.equal(h.d.querySelector(action('nav-undo')).disabled,false,'blocked undo retains its history');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('unapplied category input survives switching while clean undo and redo synchronize the visible form',async()=>{
 const h=await boot();try{
  const before=h.saved();await h.set(field('label'),'보관된 미적용 이름');await h.set(field('note'),'작성 중인 운영 지시');await h.set(field('filter-photo'),false,'change');
  await h.click(action('nav-select-category','신상'));await h.set(field('note'),'다른 카테고리의 미적용 지시');await h.click(action('nav-select-category','추천'));
  assert.equal(h.d.querySelector(field('label')).value,'보관된 미적용 이름');assert.equal(h.d.querySelector(field('note')).value,'작성 중인 운영 지시');assert.equal(h.d.querySelector(field('filter-photo')).checked,false);
  await h.save();assert.deepEqual(h.saved(),before);await h.click(action('nav-apply-category','추천'));await h.click(action('nav-undo'));
  assert.equal(h.d.querySelector(field('label')).value,category(before,'추천').label);assert.equal(h.d.querySelector(field('note')).value,category(before,'추천').note);assert.equal(h.d.querySelector(field('filter-photo')).checked,true);
  await h.click(action('nav-redo'));assert.equal(h.d.querySelector(field('label')).value,'보관된 미적용 이름');assert.equal(h.d.querySelector(field('note')).value,'작성 중인 운영 지시');
  await h.click(action('nav-select-category','신상'));assert.equal(h.d.querySelector(field('note')).value,'다른 카테고리의 미적용 지시');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
