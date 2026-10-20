import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
import {initialConfig,validateConfig,normalizeCatalog} from '../dist/model.js';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const model=fs.readFileSync(new URL('../dist/model.js',import.meta.url),'utf8').replace(/^export /gm,'');
const runtime=fs.readFileSync(new URL('../dist/customer-code.js',import.meta.url),'utf8').replace(/^export /gm,'');
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
const raw=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url),'utf8')),catalog=normalizeCatalog(raw);
const first=catalog[0],second=catalog[1],far=catalog.at(-1),categoryId='cat_machine',secret='PRIVATE_CODE_OR_NOTE_SENTINEL';
const draftKey='pr-studio-draft-v1',publishedKey='pr-studio-published-v1',tick=()=>new Promise(resolve=>setTimeout(resolve,25));
function configuration(){
 const config=initialConfig();config.categories.push({id:categoryId,label:'직접 검토할 모음',enabled:true,mode:'manual',productIds:[first.id,second.id,far.id],note:secret});
 const normalized=validateConfig(config,catalog);normalized.tabs[categoryId].pins=[first.id];normalized.tabs[categoryId].excluded=[second.id];
 normalized.ranking[categoryId].brief=secret;normalized.ranking[categoryId].rules=[{id:'style-rule',group:'style',tag:'심플',weight:5}];normalized.ranking[categoryId].combinations=[{id:'and-rule',conditions:[{group:'style',tag:'심플'},{group:'motif',tag:'하트'}],weight:10}];
 normalized.productEdits={[first.id]:{tags:{style:['심플']},note:secret,reviewStatus:'reviewed'},[second.id]:{tags:{},note:secret,reviewStatus:'needs-review'}};
 normalized.customerCode={enabled:false,html:`<main>${secret}</main>`,css:`/* ${secret} */`,js:`globalThis.${secret} = true;`};return validateConfig(normalized,catalog);
}
async function boot({config=configuration(),view='photos'}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(html,{url:`https://mockup.example/?view=admin&adminPage=workbench&adminTab=${categoryId}&workbenchView=${view}`,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
 w.localStorage.setItem(draftKey,JSON.stringify(config));w.localStorage.setItem(publishedKey,JSON.stringify(initialConfig()));w.fetch=async()=>({ok:true,json:async()=>structuredClone(raw)});w.scrollTo=()=>{};w.CSS??={};w.CSS.escape=value=>String(value).replace(/[^\w-]/g,'');
 w.eval(`(()=>{${model}\n${runtime}\n${app}\nwindow.__appendMachineAudit=appendWorkspaceAudit;window.__changeMachineDraft=index=>{draft.ranking[adminTab].diversity=index%11;workspaceRevision++;markDirty();syncWorkbenchMachine();};window.__changeMachineCode=()=>{draft.customerCode.js+='/* private next revision */';markDirty();};})();`);await tick();
 const click=async selector=>{const control=d.querySelector(selector);assert.ok(control,selector);control.click();await tick();};
 const set=async(selector,value,event='input')=>{const control=d.querySelector(selector);assert.ok(control,selector);if(control.type==='checkbox')control.checked=!!value;else control.value=String(value);control.dispatchEvent(new w.Event(event,{bubbles:true}));await tick();};
 return {w,d,errors,click,set,state:()=>JSON.parse(d.querySelector('#workbench-state').textContent),
  log:()=>d.querySelector('#workbench-log pre').textContent.split('\n').filter(Boolean).map(line=>JSON.parse(line)),
  saved:()=>JSON.parse(w.localStorage.getItem(draftKey)),published:()=>JSON.parse(w.localStorage.getItem(publishedKey)),close:()=>w.close()};
}

test('the workbench exposes a compact revisioned JSON summary without full products, saved instructions or code bodies',async()=>{
 const h=await boot();try{
  const element=h.d.querySelector('#workbench-state'),state=h.state();assert.equal(element.getAttribute('role'),'status');assert.ok(Number(element.dataset.revision)>0);
  assert.deepEqual(state.category,{id:categoryId,label:'직접 검토할 모음'});assert.equal(state.view,'photos');assert.equal(state.dirty,true);
  assert.deepEqual(state.pool,{total:3,visible:2,pins:1,excluded:1});assert.deepEqual(state.rules,{enabled:false,count:1,combinations:1,diversity:0,respectPins:true});assert.deepEqual(state.review,{unreviewed:1,reviewed:1,'needs-review':1});
  assert.deepEqual(state.selection,{id:null,compareIds:[]});assert.ok(Object.values(state.revisions).every(Number.isSafeInteger));assert.ok(element.textContent.length<1400);assert.doesNotMatch(element.textContent,new RegExp(secret));
  for(const key of ['products','catalog','customerCode','brief','note'])assert.equal(Object.hasOwn(state,key),false);assert.deepEqual(h.log(),[]);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('README and metadata log are closed by default and describe exact IDs, selectors and validate-before-apply boundaries',async()=>{
 const h=await boot();try{
  const contract=h.d.querySelector('#workbench-contract'),log=h.d.querySelector('#workbench-log');assert.equal(contract.open,false);assert.equal(log.open,false);assert.equal(contract.querySelector('summary').textContent,'README.md');assert.equal(log.querySelector('summary').textContent,'변경 로그');
  const text=contract.querySelector('pre').textContent;assert.ok(Buffer.byteLength(text,'utf8')<=2300);for(const name of ['#workbench-state','data-action','data-id','#ai-batch-json','validate-ai-batch','apply-ai-batch','#workspace-result','save-draft','preview-draft','item,material,color,shape,motif,spot,bar,style,size'])assert.ok(text.includes(name),name);
  assert.ok(contract.querySelector('a[href$="/README.md"]'));assert.equal(h.d.querySelector('[name="brief"]'),null);assert.equal(h.d.querySelector('.workbench-guide'),null);assert.doesNotMatch(contract.textContent,new RegExp(secret));assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('selection changes update the same machine summary while preserving visible photo and review controls',async()=>{
 const h=await boot();try{
  const initial=Number(h.d.querySelector('#workbench-state').dataset.revision);await h.set(`[data-compare-id="${first.id}"]`,true,'change');assert.deepEqual(h.state().selection.compareIds,[first.id]);assert.ok(Number(h.d.querySelector('#workbench-state').dataset.revision)>initial);
  await h.click(`[data-action="inspect-product"][data-id="${far.id}"]`);assert.equal(h.state().selection.id,far.id);assert.equal(h.d.querySelector('#product-review-form').dataset.productId,far.id);assert.ok(h.d.querySelector('#product-review-form [name="note"]'));
  assert.ok(h.d.querySelector('#inspection-photo'));assert.equal(h.d.querySelector('#product-review-form button[type="submit"]').closest('details'),null);for(const details of h.d.querySelectorAll('.workbench-spec'))assert.equal(details.open,false);assert.deepEqual(h.log(),[]);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('rule explanations and JSON examples are collapsed while actual edit and validation controls stay outside details',async()=>{
 const h=await boot({view:'rules'});try{
  assert.equal(h.state().view,'rules');const details=[...h.d.querySelectorAll('.workbench-spec')];assert.ok(details.length>=3);assert.ok(details.every(element=>!element.open));
  for(const selector of ['#ranking-form [name="diversity"]','#ranking-form [name="combinations"]','#ranking-form [name="rule-weight"]','#ranking-form button[type="submit"]','#ai-batch-json','[data-action="validate-ai-batch"]','[data-action="apply-ai-batch"]']){
   const control=h.d.querySelector(selector);assert.ok(control,selector);assert.equal(control.closest('details'),null,selector);
  }
  assert.equal(h.d.querySelector('#ranking-form [name="brief"]'),null);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('applying a real workspace change appends only compact metadata and leaves the published copy untouched',async()=>{
 const h=await boot();try{
  const published=h.published(),before=h.saved();await h.click('[data-action="admin-page"][data-page="overview"]');await h.set('#direction-form [name="diversity"]',6);await h.click('#direction-form button[type="submit"]');await h.click('[data-action="admin-page"][data-page="workbench"]');
  const log=h.log();assert.equal(log.length,1);assert.equal(log[0].categoryId,categoryId);assert.deepEqual(log[0].areas,['ranking']);assert.equal(log[0].productCount,0);assert.ok(Number.isFinite(Date.parse(log[0].at)));assert.ok(log[0].revisions.workspace>0);assert.equal(h.state().rules.diversity,6);
  assert.deepEqual(h.saved(),before);assert.deepEqual(h.published(),published);assert.doesNotMatch(h.d.querySelector('#workbench-log pre').textContent,new RegExp(secret));assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('audit appends are change-sensitive, bounded to twenty records and never include code or note bodies',async()=>{
 const h=await boot();try{
  assert.equal(h.w.__appendMachineAudit(),null);assert.deepEqual(h.log(),[]);const published=h.published();
  for(let index=1;index<=27;index++)h.w.__changeMachineDraft(index);
  let log=h.log();assert.equal(log.length,20);assert.equal(log[0].revisions.audit,8);assert.equal(log.at(-1).revisions.audit,27);assert.equal(h.state().revisions.audit,27);
  h.w.__changeMachineCode();log=h.log();assert.equal(log.length,20);assert.deepEqual(log.at(-1).areas,['customerCode']);assert.equal(log.at(-1).productCount,0);assert.equal(log.at(-1).revisions.audit,28);
  for(const entry of log){assert.deepEqual(Object.keys(entry),['at','categoryId','areas','productCount','revisions']);assert.ok(Number.isSafeInteger(entry.productCount));assert.ok(entry.productCount>=0);}
  assert.doesNotMatch(h.d.querySelector('#workbench-log pre').textContent,new RegExp(secret));assert.doesNotMatch(h.d.querySelector('#workbench-state').textContent,new RegExp(secret));assert.deepEqual(h.published(),published);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
