import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';

const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const code=['model','storefront','product-images','customer-code','app'].map(name=>
 fs.readFileSync(new URL('../dist/'+name+'.js',import.meta.url),'utf8')
  .replace(/^export /gm,'').replace(/^import .*;\r?\n/gm,'')).join('\n');
const catalog=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url)));
const manifest=fs.readFileSync(new URL('../dist/assets/product-images.json',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));

function boot({unavailable=false}={}){
 const errors=[],requests=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM(html,{url:'https://preview.example/?frame=1',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
 const w=dom.window;let release;
 const delayed=new Promise(resolve=>{release=resolve;});
 const initial=structuredClone(catalog);initial[0].images=initial[0].images.slice(0,1);
 w.fetch=async url=>{
  requests.push(String(url));
  if(String(url).includes('product-images.json')){
   if(unavailable)throw Error('metadata unavailable');
   await delayed;return {ok:true,json:async()=>w.JSON.parse(manifest)};
  }
  return {ok:true,json:async()=>w.JSON.parse(JSON.stringify(initial))};
 };
 w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});w.CSS={escape:value=>String(value)};
 w.eval(`(()=>{${code}\n})();`);
 return {dom,w,d:w.document,errors,requests,release};
}

test('a delayed photo manifest does not block the product feed and hydrates actual gallery URLs by ID',async()=>{
 const h=boot();try{
  await tick();const card=()=>h.d.querySelector(`[data-product="${catalog[0].id}"]`);
  assert.ok(card());assert.equal(card().querySelectorAll('[data-action="slide"]').length,0);
  h.release();await tick();
  assert.equal(card().querySelectorAll('[data-action="slide"]').length,2);
  assert.equal(card().querySelectorAll('.photo-dots i').length,catalog[0].images.length);
  assert.deepEqual(h.requests,['./assets/catalog.json?v=9','./assets/product-images.json?v=1']);
  assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});

test('an unavailable photo manifest keeps the existing representative image and browsing usable',async()=>{
 const h=boot({unavailable:true});try{
  await tick();const card=h.d.querySelector(`[data-product="${catalog[0].id}"]`);
  assert.equal(card.querySelector('img').getAttribute('src'),catalog[0].images[0]);
  h.d.querySelector('.category-tabs [data-tab="귀걸이"]').click();await tick();
  assert.equal(h.d.querySelector('.category-tabs button.active').dataset.tab,'귀걸이');
  assert.ok(h.d.querySelectorAll('[data-product]').length>0);assert.deepEqual(h.errors,[]);
 }finally{h.dom.window.close();}
});
