import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {initialConfig} from '../dist/model.js';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const model=fs.readFileSync(new URL('../dist/model.js',import.meta.url),'utf8').replace(/^export /gm,'');
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url)));
const draftKey='pr-studio-draft-v1',publishedKey='pr-studio-published-v1';
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
const ranking=changes=>({enabled:false,brief:'',diversity:0,respectPins:true,rules:[],combinations:[],...changes});
const legacyBlock={id:'workspace-preserved-block',type:'notice',title:'기존 안내',subtitle:'유지할 안내',tag:'',after:2,span:2,tabs:['추천'],enabled:true,tone:'cream',image:'',link:''};
async function boot({url='https://mockup.example/?view=admin&adminPage=workbench',config}={}){
 const errors=[],fetchCalls=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window,d=w.document;
 w.localStorage.setItem(publishedKey,JSON.stringify(initialConfig()));if(config)w.localStorage.setItem(draftKey,JSON.stringify(config));
 w.fetch=async url=>{fetchCalls.push(String(url));return {ok:true,json:async()=>structuredClone(catalog)};};w.scrollTo=()=>{};
 w.CSS??={};w.CSS.escape=value=>String(value).replace(/[^\w-]/g,'');w.eval(`(()=>{${model}\n${app}\n})();`);await tick();
 const click=async selector=>{const control=d.querySelector(selector);assert.ok(control,selector);control.click();await tick();};
 const set=async(selector,value,event='input')=>{const control=d.querySelector(selector);assert.ok(control,selector);if(control.type==='checkbox')control.checked=!!value;else control.value=String(value);control.dispatchEvent(new w.Event(event,{bubbles:true}));await tick();};
 const fill=async(formSelector,values)=>{for(const [name,value] of Object.entries(values))await set(`${formSelector} [name="${name}"]`,value);};
 return {dom,w,d,errors,fetchCalls,click,set,fill,submit:selector=>click(`${selector} button[type="submit"]`),
  saved:()=>JSON.parse(w.localStorage.getItem(draftKey)),published:()=>JSON.parse(w.localStorage.getItem(publishedKey)),
  save:()=>click('[data-action="save-draft"]'),close:()=>w.close()};
}
async function inspect(h,id){await h.set('#workbench-search',id);await h.click(`[data-action="inspect-product"][data-id="${id}"]`);assert.equal(h.d.querySelector('#product-review-form').dataset.productId,id);}
function selectTags(h,group,values){const controls=[...h.d.querySelectorAll(`#product-review-form [name="tag-${group}"]`)];assert.ok(controls.length,group);for(const control of controls)control.checked=values.includes(control.value);}
async function batchText(h,batch){await h.set('#ai-batch-json',JSON.stringify(batch));}

test('human overview and AI workbench share a draft while legacy list links keep the curation screen',async()=>{
 const h=await boot({url:'https://mockup.example/?view=admin'}),{d,click}=h;
 try{
  const before=h.saved(),publicBefore=h.published();assert.equal(d.querySelector('.studio-heading h1').textContent,'메인 운영');assert.ok(d.querySelector('#direction-form'));assert.equal(d.querySelector('.product-table'),null);
  await click('[data-action="admin-mode"][data-mode="ai"]');assert.equal(d.querySelector('.studio-heading h1').textContent,'AI 작업대');assert.ok(d.querySelector('#workbench-search'));
  for(const view of ['photos','rules','results'])assert.ok(d.querySelector(`[data-action="workbench-view"][data-workbench-view="${view}"]`));
  await click('[data-action="admin-mode"][data-mode="operator"]');assert.ok(d.querySelector('#direction-form'));
  await h.save();assert.deepEqual(h.saved(),before);assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
 const legacy=await boot({url:'https://mockup.example/?view=admin&adminPage=list'});
 try{assert.ok(legacy.d.querySelector('.product-table'));assert.equal(legacy.d.querySelectorAll('[data-row-id]').length,60);assert.deepEqual(legacy.errors,[]);}finally{legacy.close();}
});

test('human direction applies only an explicit local draft change and never calls a model API',async()=>{
 const config=initialConfig();config.tabs['추천'].pins=[catalog[0].id];config.banners=[legacyBlock];
 const h=await boot({url:'https://mockup.example/?view=admin',config}),{d}=h;
 try{
  const before=h.saved(),publicBefore=h.published();
  await h.fill('#direction-form',{brief:'데일리 상품을 먼저 확인',diversity:3,enabled:true,respectPins:true});
  assert.deepEqual(h.saved(),before);await h.submit('#direction-form');await h.save();
  assert.equal(h.saved().ranking['추천'].brief,'데일리 상품을 먼저 확인');assert.equal(h.saved().ranking['추천'].diversity,3);assert.equal(h.saved().ranking['추천'].enabled,true);
  assert.deepEqual(h.saved().tabs,before.tabs);assert.deepEqual(h.saved().banners,before.banners);assert.deepEqual(h.published(),publicBefore);
  assert.equal(d.querySelector('#workspace-result').getAttribute('role'),'status');assert.equal(h.fetchCalls.length,1);assert.match(h.fetchCalls[0],/assets\/catalog\.json/);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('photo review edits exact product metadata without changing the catalog snapshot or publishing',async()=>{
 const h=await boot(),{d}=h,id=catalog[0].id,original=structuredClone(catalog[0]);
 try{
  const publicBefore=h.published();await inspect(h,id);selectTags(h,'style',['심플','데일리']);selectTags(h,'size',['작은']);
  await h.fill('#product-review-form',{note:'사진을 보고 직접 검토한 메모',reviewStatus:'reviewed'});await h.submit('#product-review-form');await h.save();
  const edit=h.saved().productEdits[id];assert.ok(edit);assert.deepEqual(edit.tags.style,['심플','데일리']);assert.deepEqual(edit.tags.size,['작은']);assert.equal(edit.reviewStatus,'reviewed');assert.equal(edit.note,'사진을 보고 직접 검토한 메모');
  assert.ok(d.querySelector('#workspace-result').textContent.includes(id));assert.deepEqual(catalog[0],original);assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('photo review filters reflect needs-review and reviewed edits from the entire searchable catalog',async()=>{
 const h=await boot(),id=catalog.at(-1).id;
 try{
  await inspect(h,id);await h.fill('#product-review-form',{reviewStatus:'needs-review',note:'다른 사진과 다시 비교'});await h.submit('#product-review-form');
  await h.set('#workbench-search','');await h.set('#photo-review-filter','needs-review','change');
  assert.deepEqual([...h.d.querySelectorAll('[data-photo-product]')].map(card=>card.dataset.photoProduct),[id]);
  await h.click(`[data-action="inspect-product"][data-id="${id}"]`);await h.fill('#product-review-form',{reviewStatus:'reviewed'});await h.submit('#product-review-form');
  assert.equal(h.d.querySelector(`[data-photo-product="${id}"]`),null);
  await h.set('#photo-review-filter','reviewed','change');assert.ok(h.d.querySelector(`[data-photo-product="${id}"]`));assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('photo comparison limits selection to four products and gallery controls use real unique photos',async()=>{
 const h=await boot(),{d,click}=h;
 try{
  const ids=[...d.querySelectorAll('[data-compare-id]')].slice(0,5).map(control=>control.dataset.compareId);assert.equal(ids.length,5);
  for(const id of ids)await click(`[data-compare-id="${id}"]`);
  assert.equal(d.querySelectorAll('.compare-card[data-compare-product]').length,4);assert.equal(d.querySelector(`[data-compare-id="${ids[4]}"]`).checked,false);
  const product=catalog.find(product=>product.id==='2085891');assert.equal(new Set(product.images).size,3);await inspect(h,product.id);
  const buttons=[...d.querySelectorAll('[data-action="inspect-photo"][data-index]')];assert.equal(buttons.length,product.images.length);
  await click('[data-action="inspect-photo"][data-index="1"]');
  const selected=d.querySelector('#inspection-photo');assert.ok(selected);assert.equal(selected.getAttribute('src'),product.images[1]);
  await inspect(h,catalog.at(-1).id);assert.equal(d.querySelectorAll('[data-action="inspect-photo"][data-index]').length,1);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('score rule and combination forms feed explained draft results while keeping pinned curation intact',async()=>{
 const config=initialConfig(),target=catalog.at(-1).id,pinned=catalog[0].id;config.tabs['추천'].pins=[pinned];config.productEdits={[target]:{tags:{motif:['하트'],style:['심플']},note:'점수 검증용 검토',reviewStatus:'reviewed'}};
 const h=await boot({config}),{d,click}=h;
 try{
  const publicBefore=h.published(),tabsBefore=h.saved().tabs;await click('[data-action="workbench-view"][data-workbench-view="rules"]');
  await click('[data-action="add-ranking-rule"]');let row=d.querySelector('#rule-rows .ranking-rule-row');assert.ok(row);const id=row.dataset.ruleId;
  await h.set(`[data-rule-id="${id}"] [name="rule-group"]`,'motif','change');await h.set(`[data-rule-id="${id}"] [name="rule-tag"]`,'하트','change');await h.set(`[data-rule-id="${id}"] [name="rule-weight"]`,15);
  const combinations=[{id:'heart-simple',conditions:[{group:'motif',tag:'하트'},{group:'style',tag:'심플'}],weight:25}];
  await h.fill('#ranking-form',{enabled:true,brief:'하트와 심플 조합 우선',diversity:0,respectPins:true,combinations:JSON.stringify(combinations)});await h.submit('#ranking-form');await h.save();
  const saved=h.saved().ranking['추천'];assert.equal(saved.rules.length,1);assert.equal(saved.rules[0].tag,'하트');assert.equal(saved.rules[0].weight,15);assert.deepEqual(saved.combinations,combinations);
  await click('[data-action="workbench-view"][data-workbench-view="results"]');const results=[...d.querySelectorAll('[data-rank-product]')];assert.ok(results.length);assert.equal(results[0].dataset.rankProduct,pinned);
  const targetRow=d.querySelector(`[data-rank-product="${target}"]`);assert.ok(targetRow);assert.ok(Number(targetRow.dataset.score)>=40);assert.ok(targetRow.textContent.includes('하트'));assert.ok(targetRow.textContent.includes('심플'));assert.ok(targetRow.querySelector('[data-rank-delta]'));
  assert.deepEqual(h.saved().tabs,tabsBefore);assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('validated AI batches stay preview-only until applied and editing their JSON requires revalidation',async()=>{
 const h=await boot(),{d,click}=h,id=catalog[0].id;
 try{
  const before=h.saved(),publicBefore=h.published(),batch={version:1,tab:'추천',ranking:ranking({enabled:true,brief:'직접 검토한 초안'}),productEdits:[{id,tags:{style:['심플']},note:'AI 작업대 검토 초안',reviewStatus:'reviewed'}],summary:'사진 검토 결과를 확인하고 적용'};
  await click('[data-action="workbench-view"][data-workbench-view="rules"]');await batchText(h,batch);
  assert.equal(d.querySelector('[data-action="apply-ai-batch"]').disabled,true);await click('[data-action="validate-ai-batch"]');assert.equal(d.querySelector('[data-action="apply-ai-batch"]').disabled,false);
  await h.save();assert.deepEqual(h.saved(),before);
  batch.summary='수정한 검토 초안';await batchText(h,batch);assert.equal(d.querySelector('[data-action="apply-ai-batch"]').disabled,true);
  await click('[data-action="apply-ai-batch"]');await h.save();assert.deepEqual(h.saved(),before);
  await click('[data-action="validate-ai-batch"]');await click('[data-action="apply-ai-batch"]');await h.save();
  assert.equal(h.saved().ranking['추천'].brief,'직접 검토한 초안');assert.equal(h.saved().productEdits[id].reviewStatus,'reviewed');assert.ok(d.querySelector('#workspace-result').textContent.includes(id));assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('AI batch validation rejects wrong tabs, unknown products and invalid weights atomically',async()=>{
 const h=await boot(),{d,click}=h,id=catalog[0].id;
 try{
  const before=h.saved(),publicBefore=h.published();await click('[data-action="workbench-view"][data-workbench-view="rules"]');
  const valid={version:1,tab:'추천',ranking:ranking({enabled:true}),productEdits:[{id,tags:{style:['데일리']},note:'검증 메모',reviewStatus:'reviewed'}],summary:'적용 전 전체 검증'};
  for(const invalid of [
   {...valid,tab:'반지'},
   {...valid,productEdits:[{...valid.productEdits[0],id:'999999999999'}]},
   {...valid,ranking:ranking({enabled:true,rules:[{id:'bad-weight',group:'motif',tag:'하트',weight:101}]})}
  ]){
   await batchText(h,invalid);await click('[data-action="validate-ai-batch"]');assert.equal(d.querySelector('[data-action="apply-ai-batch"]').disabled,true);
   await click('[data-action="apply-ai-batch"]');await h.save();assert.deepEqual(h.saved(),before);assert.deepEqual(h.published(),publicBefore);
  }
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('workspace undo and redo span direction and photo metadata without altering blocks, curation or public data',async()=>{
 const config=initialConfig();config.tabs['추천'].pins=[catalog[0].id];config.banners=[legacyBlock];
 const h=await boot({url:'https://mockup.example/?view=admin',config}),{click,d}=h,id=catalog[1].id;
 try{
  const before=h.saved(),publicBefore=h.published();await h.fill('#direction-form',{brief:'임시 진열 방향'});await h.submit('#direction-form');
  await click('[data-action="admin-mode"][data-mode="ai"]');await inspect(h,id);await h.fill('#product-review-form',{note:'임시 사진 메모',reviewStatus:'needs-review'});await h.submit('#product-review-form');await h.save();assert.ok(h.saved().productEdits[id]);
  await click('[data-action="undo-workspace"]');await h.save();assert.equal(h.saved().productEdits[id],undefined);assert.equal(h.saved().ranking['추천'].brief,'임시 진열 방향');
  await click('[data-action="undo-workspace"]');await h.save();assert.deepEqual(h.saved().ranking,before.ranking);assert.deepEqual(h.saved().productEdits,before.productEdits);
  await click('[data-action="redo-workspace"]');await h.save();assert.equal(h.saved().ranking['추천'].brief,'임시 진열 방향');assert.equal(h.saved().productEdits[id],undefined);
  assert.deepEqual(h.saved().tabs,before.tabs);assert.deepEqual(h.saved().banners,before.banners);assert.deepEqual(h.published(),publicBefore);assert.equal(d.querySelector('#workspace-result').getAttribute('role'),'status');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('malformed combination JSON cannot partially save score rules and rule removal remains a temporary edit',async()=>{
 const h=await boot(),{d,click}=h;
 try{
  const before=h.saved(),publicBefore=h.published();await click('[data-action="workbench-view"][data-workbench-view="rules"]');
  await click('[data-action="add-ranking-rule"]');const id=d.querySelector('.ranking-rule-row').dataset.ruleId;
  await h.fill('#ranking-form',{brief:'적용되면 안 되는 규칙',combinations:'{invalid-json'});await h.submit('#ranking-form');await h.save();assert.deepEqual(h.saved(),before);
  await click(`[data-action="remove-ranking-rule"][data-rule-id="${id}"]`);assert.equal(d.querySelector(`[data-rule-id="${id}"]`),null);
  await h.save();assert.deepEqual(h.saved(),before);assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('clearing a saved visual tag survives switching photos and preserves source tags, note and review status',async()=>{
 const product=catalog[0],id=product.id,sourceTags=structuredClone(product.tags),config=initialConfig();
 config.productEdits={[id]:{tags:{style:['심플']},note:'기존 사진 검토 근거',reviewStatus:'reviewed'}};
 const h=await boot({config}),{d,click}=h;
 try{
  assert.ok(product.images.length>1);const publicBefore=h.published();await inspect(h,id);
  const selector='#product-review-form [name="tag-style"][value="심플"]';assert.equal(d.querySelector(selector).checked,true);
  await h.set(selector,false);await click('[data-action="inspect-photo"][data-index="1"]');
  assert.equal(d.querySelector(selector).checked,false);assert.equal(d.querySelector('#inspection-photo').getAttribute('src'),product.images[1]);
  assert.equal(d.querySelector('#product-review-form [name="note"]').value,'기존 사진 검토 근거');assert.equal(d.querySelector('#product-review-form [name="reviewStatus"]').value,'reviewed');
  await h.submit('#product-review-form');await h.save();
  const edit=h.saved().productEdits[id];assert.ok(edit.tags.style===undefined||edit.tags.style.length===0);assert.equal(edit.note,'기존 사진 검토 근거');assert.equal(edit.reviewStatus,'reviewed');
  for(const [group,values] of Object.entries(sourceTags)){
   const selected=[...d.querySelectorAll(`#product-review-form [name="tag-${group}"]:checked`)].map(control=>control.value);
   assert.deepEqual([...selected].sort(),[...values].sort(),group+' source tags remain selected');
  }
  assert.deepEqual(catalog[0].tags,sourceTags);assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('opening another product in the large-photo drawer does not retarget the selected review form or gallery',async()=>{
 const h=await boot(),{d,click}=h,a=catalog.find(product=>product.id==='2085891'),b=catalog.find(product=>product.id==='2085674');
 try{
  assert.ok(a&&b);await inspect(h,a.id);await h.set('#workbench-search',b.id);
  await click(`[data-action="open-inspection"][data-id="${b.id}"]`);
  assert.ok(d.querySelector('#inspection-full-image'));await click('#overlay-root .close-button');
  assert.equal(d.querySelector('#product-review-form').dataset.productId,a.id);
  await click('[data-action="inspect-photo"][data-index="1"]');
  assert.equal(d.querySelector('#product-review-form').dataset.productId,a.id);assert.equal(d.querySelector('#inspection-photo').getAttribute('src'),a.images[1]);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('applying photo metadata preserves unapplied score weights and the human direction brief',async()=>{
 const config=initialConfig(),id=catalog[0].id;
 config.ranking={...config.ranking,'추천':ranking({brief:'저장된 방향',rules:[{id:'pending-rule',group:'motif',tag:'하트',weight:5}]})};
 const h=await boot({url:'https://mockup.example/?view=admin',config}),{d,click}=h;
 try{
  const publicBefore=h.published();await h.fill('#direction-form',{brief:'적용 전 사람의 방향 메모'});
  await click('[data-action="admin-mode"][data-mode="ai"]');await click('[data-action="workbench-view"][data-workbench-view="rules"]');
  await h.set('[data-rule-id="pending-rule"] [name="rule-weight"]',99);
  await click('[data-action="workbench-view"][data-workbench-view="photos"]');await inspect(h,id);
  await h.fill('#product-review-form',{note:'저장할 사진 검토 메모',reviewStatus:'reviewed'});await h.submit('#product-review-form');
  await click('[data-action="workbench-view"][data-workbench-view="rules"]');assert.equal(d.querySelector('[data-rule-id="pending-rule"] [name="rule-weight"]').value,'99');
  await h.save();assert.equal(h.saved().ranking['추천'].rules[0].weight,5);assert.equal(h.saved().ranking['추천'].brief,'저장된 방향');assert.equal(h.saved().productEdits[id].note,'저장할 사진 검토 메모');
  await click('[data-action="admin-mode"][data-mode="operator"]');assert.equal(d.querySelector('#direction-form [name="brief"]').value,'적용 전 사람의 방향 메모');
  await click('[data-action="admin-mode"][data-mode="ai"]');await click('[data-action="workbench-view"][data-workbench-view="rules"]');
  await h.submit('#ranking-form');await h.save();assert.equal(h.saved().ranking['추천'].rules[0].weight,99);
  assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('published and draft result views compare different photo orders without changing either saved configuration',async()=>{
 const target=catalog.at(-1).id,first=catalog[0].id,config=initialConfig();
 config.ranking={...config.ranking,'추천':ranking({enabled:true,rules:[{id:'comparison-simple',group:'style',tag:'심플',weight:100}]})};
 config.productEdits={[target]:{tags:{style:['심플']},note:'비교할 진열 초안',reviewStatus:'reviewed'}};
 const h=await boot({config}),{d,click}=h;
 try{
  const before=h.saved(),publicBefore=h.published();await click('[data-action="workbench-view"][data-workbench-view="results"]');
  assert.equal(d.querySelector('[data-result-copy="draft"] [data-rank-product]').dataset.rankProduct,target);
  await click('[data-action="rank-result-view"][data-result-view="side"]');
  const published=d.querySelector('[data-result-copy="published"]'),draft=d.querySelector('[data-result-copy="draft"]');assert.ok(published&&draft);
  assert.equal(published.querySelector('[data-rank-product]').dataset.rankProduct,first);assert.equal(draft.querySelector('[data-rank-product]').dataset.rankProduct,target);
  for(const copy of [published,draft]){assert.ok(copy.querySelector('[data-rank-product] img'));assert.ok(copy.querySelector('[data-rank-delta]'));}
  assert.ok(draft.querySelector('[data-rank-product] .rank-reasons').textContent.includes('심플'));
  await click('[data-action="rank-result-view"][data-result-view="published"]');assert.equal(d.querySelector('[data-result-copy="draft"]'),null);assert.equal(d.querySelector('[data-result-copy="published"] [data-rank-product]').dataset.rankProduct,first);
  await h.save();assert.deepEqual(h.saved(),before);assert.deepEqual(h.published(),publicBefore);
  await click('[data-action="rank-result-view"][data-result-view="draft"]');assert.equal(d.querySelector('[data-result-copy="published"]'),null);assert.equal(d.querySelector('[data-result-copy="draft"] [data-rank-product]').dataset.rankProduct,target);
  await h.save();assert.deepEqual(h.saved(),before);assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
