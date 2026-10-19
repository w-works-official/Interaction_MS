import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const model=fs.readFileSync(new URL('../dist/model.js',import.meta.url),'utf8').replace(/^export /gm,'');
const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url)));
const draftKey='pr-studio-draft-v1',publishedKey='pr-studio-published-v1';
const tick=()=>new Promise(resolve=>setTimeout(resolve,25));
async function boot({url='https://mockup.example/?view=admin&adminPage=list',withModelContext=false}={}){
 const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
 const w=dom.window,d=w.document,tools=new Map();
 if(withModelContext)d.modelContext={registerTool:async tool=>{tools.set(tool.name,tool);}};
 w.fetch=async()=>({ok:true,json:async()=>structuredClone(catalog)});w.scrollTo=()=>{};
 w.CSS??={};w.CSS.escape=value=>String(value).replace(/[^\w-]/g,'');
 w.eval(`(()=>{${model}\n${app}\n})();`);await tick();
 const click=async selector=>{const node=d.querySelector(selector);assert.ok(node,selector);node.click();await tick();};
 const search=async value=>{const input=d.querySelector('#admin-search');input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));await tick();};
 const changeRank=async(id,value)=>{const input=d.querySelector(`[data-rank="${id}"]`);assert.ok(input);input.value=String(value);input.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();};
 return {dom,w,d,errors,tools,click,search,changeRank,
  rows:()=>[...d.querySelectorAll('[data-row-id]')].map(row=>row.dataset.rowId),
  count:id=>Number(d.querySelector('#'+id)?.textContent.match(/\d+/)?.[0]||0),
  saved:()=>JSON.parse(w.localStorage.getItem(draftKey)),
  published:()=>JSON.parse(w.localStorage.getItem(publishedKey)),
  close:()=>w.close()};
}

test('admin selection counts, hidden selections and displayed select-all stay synchronized through search and more rows',async()=>{
 const h=await boot(),{d,click,search}=h;
 try{
  const first=h.rows()[0],last=catalog.at(-1).id;
  assert.equal(h.rows().length,60);assert.equal(d.querySelector('[data-action="bulk-pin"]').disabled,true);
  await click(`[data-row-select="${first}"]`);
  assert.equal(h.count('admin-selection-count'),1);assert.equal(d.querySelector('[data-select-all]').indeterminate,true);
  await search(last);assert.deepEqual(h.rows(),[last]);assert.equal(h.count('admin-hidden-selection'),1);
  assert.equal(d.querySelector('[data-select-all]').checked,false);
  await click(`[data-row-select="${last}"]`);
  assert.equal(h.count('admin-selection-count'),2);assert.equal(h.count('admin-hidden-selection'),1);
  assert.equal(d.querySelector('[data-select-all]').checked,true);
  await click('[data-action="clear-selection"]');
  assert.equal(h.count('admin-selection-count'),0);assert.equal(h.count('admin-hidden-selection'),0);
  assert.equal(d.querySelector('[data-row-select]').checked,false);
  await search('');await click('[data-select-all]');
  assert.equal(h.count('admin-selection-count'),60);assert.equal(d.querySelector('[data-select-all]').checked,true);
  await click('[data-action="admin-more"]');
  assert.equal(h.rows().length,120);assert.equal(h.count('admin-selection-count'),60);
  assert.equal(d.querySelector('[data-select-all]').checked,false);assert.equal(d.querySelector('[data-select-all]').indeterminate,true);
  await search(first);await click('[data-action="admin-filter"][data-filter="pinned"]');
  assert.equal(d.querySelector('#admin-search').value,first);assert.equal(h.count('admin-selection-count'),0);
  assert.equal(h.rows().length,0);
  await click('[data-action="admin-tab"][data-tab="반지"]');
  assert.equal(d.querySelector('#admin-search').value,'');assert.ok(h.rows().length>0);
  assert.equal(h.count('admin-selection-count'),0);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('batch pin follows display order rather than click order and batch unpin only updates the local draft tab',async()=>{
 const h=await boot(),{click,d}=h;
 try{
  const baseline=h.saved(),publicBefore=h.published(),[first,,third]=h.rows();
  await click(`[data-row-select="${third}"]`);await click(`[data-row-select="${first}"]`);
  await click('[data-action="bulk-pin"]');
  assert.deepEqual(h.rows().slice(0,2),[first,third]);assert.equal(h.count('admin-selection-count'),0);
  await click('[data-action="save-draft"]');
  assert.deepEqual(h.saved().tabs['추천'].pins,[first,third]);assert.deepEqual(h.published(),publicBefore);
  await click('[data-action="admin-filter"][data-filter="pinned"]');
  assert.deepEqual(h.rows(),[first,third]);assert.equal(d.querySelector('[data-action="bulk-unpin"]').disabled,true);
  await click('[data-select-all]');await click('[data-action="bulk-unpin"]');
  assert.equal(h.rows().length,0);assert.equal(h.count('admin-selection-count'),0);
  await click('[data-action="save-draft"]');
  const saved=h.saved();assert.deepEqual(saved.tabs['추천'],baseline.tabs['추천']);
  for(const tab of Object.keys(baseline.tabs).filter(tab=>tab!=='추천'))assert.deepEqual(saved.tabs[tab],baseline.tabs[tab]);
  assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('excluded view searches full product IDs, restores individual and selected rows, and preserves a hidden pin through reordering',async()=>{
 const h=await boot(),{click,search,d}=h;
 try{
  const publicBefore=h.published(),[,second,third,fourth]=h.rows(),product=catalog.find(product=>product.id===third);
  await click(`[data-action="pin"][data-id="${third}"]`);await click(`[data-action="exclude"][data-id="${third}"]`);
  await click(`[data-row-select="${second}"]`);await click('[data-action="bulk-exclude"]');
  assert.ok(!h.rows().includes(third)&&!h.rows().includes(second));
  await h.changeRank(fourth,1);
  await click('[data-action="save-draft"]');assert.ok(h.saved().tabs['추천'].pins.includes(third));
  await click('[data-action="admin-filter"][data-filter="excluded"]');await search(third);
  assert.deepEqual(h.rows(),[third]);
  const row=d.querySelector(`[data-row-id="${third}"]`);
  assert.ok(row.textContent.includes(product.displayName||product.name));assert.ok(row.textContent.includes(third));
  await click(`[data-action="restore-product"][data-id="${third}"]`);assert.equal(h.rows().length,0);
  await search('');assert.deepEqual(h.rows(),[second]);
  assert.equal(d.querySelector('[data-action="bulk-restore"]').disabled,true);
  await click('[data-select-all]');await click('[data-action="bulk-restore"]');assert.equal(h.rows().length,0);
  await click('[data-action="admin-filter"][data-filter="pinned"]');assert.deepEqual(h.rows(),[third]);
  await click('[data-action="save-draft"]');
  assert.deepEqual(h.saved().tabs['추천'].pins,[third]);assert.deepEqual(h.saved().tabs['추천'].excluded,[]);
  assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('rank controls enforce pin boundaries while filtered ranks still address the whole display list',async()=>{
 const h=await boot(),{click,search,d}=h;
 try{
  const [first,,third,fourth]=h.rows(),last=catalog.at(-1).id,publicBefore=h.published();
  await click(`[data-row-select="${fourth}"]`);await click(`[data-row-select="${third}"]`);await click('[data-action="bulk-pin"]');
  const pinnedRank=d.querySelector(`[data-rank="${third}"]`),normalRank=d.querySelector(`[data-rank="${first}"]`);
  assert.equal(pinnedRank.min,'1');assert.equal(pinnedRank.max,'2');assert.equal(normalRank.min,'3');
  assert.equal(d.querySelector(`[data-action="move-up"][data-id="${third}"]`).disabled,true);
  assert.equal(d.querySelector(`[data-action="move-down"][data-id="${fourth}"]`).disabled,true);
  assert.equal(d.querySelector(`[data-action="move-up"][data-id="${first}"]`).disabled,true);
  await h.changeRank(third,3);assert.deepEqual(h.rows().slice(0,3),[third,fourth,first]);
  await h.changeRank(first,2);assert.deepEqual(h.rows().slice(0,3),[third,fourth,first]);
  await search(last);assert.deepEqual(h.rows(),[last]);assert.equal(d.querySelector('[data-rank]').min,'3');
  await h.changeRank(last,3);await search('');assert.deepEqual(h.rows().slice(0,3),[third,fourth,last]);
  await click('[data-action="save-draft"]');assert.deepEqual(h.saved().tabs['추천'].pins,[third,fourth]);
  assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('curation undo and redo follow recent tab changes without touching other tabs or the published copy',async()=>{
 const h=await boot(),{click,d}=h;
 try{
  const baseline=h.saved(),publicBefore=h.published(),first=h.rows()[0];
  assert.equal(d.querySelector('[data-action="undo-curation"]').disabled,true);
  assert.equal(d.querySelector('[data-action="redo-curation"]').disabled,true);
  await click(`[data-action="pin"][data-id="${first}"]`);
  await click('[data-action="admin-tab"][data-tab="반지"]');const ring=h.rows()[0];
  await click(`[data-action="exclude"][data-id="${ring}"]`);await click('[data-action="save-draft"]');
  assert.ok(h.saved().tabs['반지'].excluded.includes(ring));
  await click('[data-action="undo-curation"]');await click('[data-action="save-draft"]');
  assert.equal(d.querySelector('[data-action="admin-tab"].active').dataset.tab,'반지');
  assert.deepEqual(h.saved().tabs['반지'],baseline.tabs['반지']);assert.deepEqual(h.saved().tabs['추천'].pins,[first]);
  await click('[data-action="redo-curation"]');await click('[data-action="save-draft"]');assert.ok(h.saved().tabs['반지'].excluded.includes(ring));
  await click('[data-action="undo-curation"]');await click('[data-action="undo-curation"]');await click('[data-action="save-draft"]');
  assert.equal(d.querySelector('[data-action="admin-tab"].active').dataset.tab,'추천');assert.deepEqual(h.saved().tabs,baseline.tabs);
  await click('[data-action="redo-curation"]');await click('[data-action="save-draft"]');
  assert.deepEqual(h.saved().tabs['추천'].pins,[first]);assert.deepEqual(h.saved().tabs['반지'],baseline.tabs['반지']);
  assert.deepEqual(h.saved().banners,baseline.banners);assert.deepEqual(h.published(),publicBefore);
  await click('[data-action="admin-page"][data-page="history"]');await click('[data-action="load-draft"]');
  await click('[data-action="admin-page"][data-page="list"]');
  assert.equal(d.querySelector('[data-action="undo-curation"]').disabled,true);
  assert.equal(d.querySelector('[data-action="redo-curation"]').disabled,true);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('admin URL restores category, status and search, keeps them synchronized, and replaces invalid state with defaults',async()=>{
 const h=await boot({url:'https://mockup.example/?view=admin&adminPage=list&adminTab='+encodeURIComponent('반지')+'&adminFilter=excluded&adminQ=2084730'});
 try{
  const {d,click,search}=h;
  const params=()=>new URL(h.w.location.href).searchParams;
  assert.equal(d.querySelector('[data-action="admin-tab"][aria-pressed="true"]').dataset.tab,'반지');
  assert.equal(d.querySelector('[data-action="admin-filter"][aria-pressed="true"]').dataset.filter,'excluded');
  assert.equal(d.querySelector('#admin-search').value,'2084730');
  assert.equal(params().get('adminTab'),'반지');assert.equal(params().get('adminFilter'),'excluded');assert.equal(params().get('adminQ'),'2084730');
  await click('[data-action="admin-filter"][data-filter="all"]');
  assert.deepEqual(h.rows(),['2084730']);assert.equal(params().get('adminFilter'),'all');assert.equal(params().get('adminQ'),'2084730');
  await search('써지컬 리플');assert.equal(params().get('adminQ'),'써지컬 리플');
  await click('[data-action="admin-tab"][data-tab="추천"]');
  assert.equal(params().get('adminTab'),'추천');assert.equal(params().get('adminFilter'),'all');assert.equal(params().get('adminQ'),null);
  assert.equal(d.querySelector('#admin-search').value,'');assert.deepEqual(h.errors,[]);
 }finally{h.close();}
 const fallback=await boot({url:'https://mockup.example/?view=admin&adminPage=list&adminTab=unknown&adminFilter=unknown'});
 try{
  const params=new URL(fallback.w.location.href).searchParams;
  assert.equal(fallback.d.querySelector('[data-action="admin-tab"][aria-pressed="true"]').dataset.tab,'추천');
  assert.equal(fallback.d.querySelector('[data-action="admin-filter"][aria-pressed="true"]').dataset.filter,'all');
  assert.equal(fallback.d.querySelector('#admin-search').value,'');assert.ok(fallback.rows().length>0);
  assert.ok([null,'추천'].includes(params.get('adminTab')));assert.ok([null,'all'].includes(params.get('adminFilter')));
  assert.deepEqual(fallback.errors,[]);
 }finally{fallback.close();}
});

test('AI browser controls expose exact product IDs and report revisioned draft results without publishing',async()=>{
 const h=await boot(),{d,click}=h;
 try{
  const publicBefore=h.published(),[,second,third]=h.rows();
  for(const row of d.querySelectorAll('[data-row-id]')){
   const id=row.dataset.rowId;
   for(const selector of ['[data-row-select]','[data-rank]','[data-action="pin"]','[data-action="move-up"]','[data-action="move-down"]','[data-action="exclude"]']){
    const control=row.querySelector(selector);assert.ok(control,selector);assert.ok(control.getAttribute('aria-label')?.includes(id),`${selector} identifies ${id}`);
   }
  }
  const result=()=>d.querySelector('#admin-result');
  assert.equal(result().getAttribute('role'),'status');
  let revision=Number(result().dataset.revision);assert.ok(Number.isSafeInteger(revision));
  const checkResult=(id,operation)=>{
   const status=result(),next=Number(status.dataset.revision);
   assert.ok(next>revision,'curation revision increases after the requested change');revision=next;
   assert.equal(status.getAttribute('role'),'status');assert.ok(status.textContent.includes(id));assert.match(status.textContent,operation);
   assert.deepEqual(h.published(),publicBefore);
  };
  await click(`[data-action="pin"][data-id="${third}"]`);checkResult(third,/고정/);
  await h.changeRank(second,4);checkResult(second,/순서/);
  await click(`[data-action="exclude"][data-id="${third}"]`);checkResult(third,/제외/);
  await click('[data-action="admin-filter"][data-filter="excluded"]');
  const excluded=d.querySelector(`[data-row-id="${third}"]`);assert.ok(excluded);
  for(const selector of ['[data-row-select]','[data-action="restore-product"]'])assert.ok(excluded.querySelector(selector).getAttribute('aria-label').includes(third));
  await click(`[data-action="restore-product"][data-id="${third}"]`);checkResult(third,/복원/);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('optional browser tools use the same draft, result, pin limits and undo history as visible admin controls',async()=>{
 const h=await boot({withModelContext:true}),{click,d}=h;
 try{
  assert.deepEqual([...h.tools.keys()],['read_curation_state','move_curation_product']);
  const read=h.tools.get('read_curation_state').execute,move=h.tools.get('move_curation_product').execute;
  const baseline=await read(),publicBefore=h.published(),last=baseline.visible.at(-1).id;
  const snapshot=value=>JSON.parse(JSON.stringify(value));
  await click('[data-action="view-shop"]');assert.equal(d.querySelector('.product-table'),null);
  const result=await move({tab:'추천',id:last,position:2});
  assert.ok(d.querySelector('.product-table'));assert.equal(d.querySelector('[data-action="undo-curation"]').disabled,false);
  assert.equal(result.updated,true);assert.equal(result.draftOnly,true);assert.equal(result.mode,'local-demo');
  assert.equal(result.actualPosition,2);assert.equal(result.requestedPosition,2);assert.equal(h.rows()[1],last);
  let state=await read();assert.ok(state.revision>baseline.revision);assert.ok(state.lastResult.includes(last));assert.equal(state.dirty,true);
  assert.equal(Number(d.querySelector('#admin-result').dataset.revision),state.revision);
  assert.deepEqual(snapshot(state.config.tabs['반지']),snapshot(baseline.config.tabs['반지']));
  await click('[data-action="save-draft"]');assert.deepEqual(h.saved(),snapshot(state.config));assert.deepEqual(h.published(),publicBefore);
  await click('[data-action="undo-curation"]');state=await read();assert.deepEqual(snapshot(state.config),snapshot(baseline.config));
  await click('[data-action="redo-curation"]');assert.equal(h.rows()[1],last);
  const unchanged=await move({tab:'추천',id:last,position:2});assert.equal(unchanged.updated,false);assert.equal(unchanged.actualPosition,2);
  const first=h.rows()[0];await click(`[data-action="pin"][data-id="${first}"]`);
  const beforeRejected=await read();
  await assert.rejects(()=>move({tab:'추천',id:last,position:1}),/Position must be within/);
  const afterRejected=await read();assert.equal(afterRejected.revision,beforeRejected.revision);
  assert.deepEqual(snapshot(afterRejected.config),snapshot(beforeRejected.config));assert.deepEqual(h.published(),publicBefore);
  assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('explicit rank apply and Enter commit filled values without input or change events',async()=>{
 const h=await boot(),{d,w,click}=h;
 try{
  const before=h.rows(),[first,,,,fifth]=before,publicBefore=h.published();
  const revision=()=>Number(d.querySelector('#admin-result').dataset.revision);
  const initialRevision=revision(),rank=d.querySelector(`[data-rank="${fifth}"]`);
  rank.value='2';
  assert.deepEqual(h.rows(),before,'setting the input value alone does not reorder the draft');
  const apply=d.querySelector(`[data-action="apply-rank"][data-id="${fifth}"]`);
  assert.ok(apply);assert.ok(apply.getAttribute('aria-label').includes(fifth));assert.match(apply.getAttribute('aria-label'),/순번 적용/);
  await click(`[data-action="apply-rank"][data-id="${fifth}"]`);
  assert.equal(h.rows()[1],fifth);assert.ok(revision()>initialRevision);
  assert.ok(d.querySelector('#admin-result').textContent.includes(fifth));
  const afterApply=h.rows(),appliedRevision=revision(),keyboardRank=d.querySelector(`[data-rank="${first}"]`);
  keyboardRank.value='4';
  const enter=new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});
  keyboardRank.dispatchEvent(enter);await tick();
  assert.equal(enter.defaultPrevented,true);assert.equal(h.rows()[3],first);assert.ok(revision()>appliedRevision);
  assert.ok(d.querySelector('#admin-result').textContent.includes(first));
  await click('[data-action="undo-curation"]');assert.deepEqual(h.rows(),afterApply);
  assert.deepEqual(h.published(),publicBefore);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});
