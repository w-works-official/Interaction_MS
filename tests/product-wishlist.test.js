import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM,VirtualConsole} from 'jsdom';
import {createProductWishlistAdapter} from '../integration-main/product-wishlist.js';

const id='2085891',otherId='2085889';
const listed=(ids=[],result=true)=>({result,data:ids.map(uid=>({uid}))});
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
function fixture({engine=true,login=true,timeoutMs=25}={}){
 const errors=[],calls=[],timers=new Map(),forbidden=[],vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM('<!doctype html><body><main id="main"></main></body>',{url:'https://www.pink-rocket.com/shop/main.html',runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window;let timerId=0,constructed=0;
 w.setTimeout=callback=>{timers.set(++timerId,callback);return timerId;};w.clearTimeout=key=>timers.delete(key);
 w.XMLHttpRequest=function(){throw Error('The adapter must use native send rather than its own XHR');};
 w.fetch=()=>{throw Error('The adapter must not create a separate fetch request');};
 w.MutationObserver=function(){throw Error('The adapter must not install a wishlist observer');};
 class NativeWishlist{
  constructor(){constructed++;}
  isLogin(){return login;}
  send(callback,data){assert.equal(typeof callback,'function');assert.equal(typeof data,'string');calls.push({callback,data,params:new URLSearchParams(data)});}
  init(){forbidden.push('init');throw Error('Do not bind original main controls');}
  observe(){forbidden.push('observe');throw Error('Do not observe original main controls');}
  display(){forbidden.push('display');throw Error('Do not render original main controls');}
 }
 if(engine)w.makeshopWishlist=NativeWishlist;
 const adapter=createProductWishlistAdapter({window:w,timeoutMs});
 return {w,adapter,calls,timers,errors,forbidden,get constructed(){return constructed;},
  install:()=>{w.makeshopWishlist=NativeWishlist;},
  setLogin:value=>{login=value;},
  respond:async(index,response)=>{assert.ok(calls[index],`native send ${index} exists`);calls[index].callback(response);await settle();},
  expire:async()=>{for(const [key,callback] of [...timers]){timers.delete(key);callback();}await settle();},
  close:()=>w.close()};
}
function assertModes(h,modes){assert.deepEqual(h.calls.map(call=>call.params.get('mode')),modes);}
async function beginToggle(h,productId=id){const pending=h.adapter.toggle(productId);await settle();return {pending};}
async function completeToggle(h,{before=[],response={result:true,action:'add'},after=[id],productId=id}={}){
 const start=h.calls.length,{pending}=await beginToggle(h,productId);
 await h.respond(start,listed(before));await h.respond(start+1,response);await h.respond(start+2,listed(after));return pending;
}

test('refresh uses only native read mode and normalizes distinct product IDs without binding original main UI',async()=>{
 const h=fixture();try{
  assert.deepEqual(h.calls,[],'constructing the adapter performs no account or read request');
  const pending=h.adapter.refresh();await settle();assert.equal(h.calls.length,1);assert.equal(h.calls[0].data,'mode=wishlist');
  await h.respond(0,listed([id,Number(otherId),id],1));const result=await pending;
  assert.equal(result.state,'ready');assert.deepEqual([...result.ids],[id,otherId]);assertModes(h,['wishlist']);
  assert.ok(h.constructed>=1);assert.deepEqual(h.forbidden,[]);assert.equal(h.w.document.querySelector('.my-wish-list'),null);assert.deepEqual(h.errors,[]);
 }finally{h.close();}
});

test('a guest returns login without any native read or write and never initializes the native engine UI',async()=>{
 const h=fixture({login:false});try{
  const refreshed=await h.adapter.refresh(),toggled=await h.adapter.toggle(id);
  assert.equal(refreshed.state,'login');assert.equal(toggled.state,'login');assert.deepEqual([...refreshed.ids],[]);assert.deepEqual(h.calls,[]);assert.deepEqual(h.forbidden,[]);
 }finally{h.close();}
});

test('losing login before the native write prevents it and losing login afterward leaves the product locked as unknown',async()=>{
 for(const afterWrite of [false,true]){
  const h=fixture();try{
   const {pending}=await beginToggle(h);
   if(afterWrite){await h.respond(0,listed([]));h.setLogin(false);await h.respond(1,{result:true,action:'add'});}
   else{h.setLogin(false);await h.respond(0,listed([]));}
   assert.equal((await pending).state,afterWrite?'unknown':'login');assertModes(h,afterWrite?['wishlist','wish']:['wishlist']);
   if(afterWrite){h.setLogin(true);assert.equal((await h.adapter.toggle(id)).state,'unknown');assert.equal(h.calls.length,2);}
  }finally{h.close();}
 }
});

test('toggle rejects invalid IDs before creating a wishlist request',async()=>{
 const h=fixture();try{
  for(const invalid of [undefined,null,2085891,'','0','01','-1','1.2',' 2085891','2085891 ','2085891\n','2085891&uid=2085889','12345678901']){
   const result=await h.adapter.toggle(invalid);assert.equal(result.state,'error',String(invalid));
  }
  assert.deepEqual(h.calls,[]);assert.deepEqual(h.forbidden,[]);
 }finally{h.close();}
});

test('read mode rejects unsuccessful, malformed and oversized native inventories without attempting a write',async()=>{
 for(const response of [{result:false,data:[]},{result:'true',data:[]},{result:2,data:[]},{result:true,data:null},{result:true,data:{}},
  listed(['bad']),listed(['01']),listed([0]),{result:true,data:[null]},listed(Array(10001).fill(id))]){
  const h=fixture();try{
   const pending=h.adapter.refresh();await settle();await h.respond(0,response);assert.equal((await pending).state,'error');assertModes(h,['wishlist']);
  }finally{h.close();}
 }
});

test('product add needs pre-read, one native product write and opposite membership in the post-read',async()=>{
 for(const response of [{result:true,action:'add'},{result:1,action:'server-specific-add'},{result:true}]){
  const h=fixture();try{
   const result=await completeToggle(h,{response});assert.equal(result.state,'ready');assert.equal(result.id,id);assert.equal(result.selected,true);assert.equal(result.changed,true);assert.deepEqual([...result.ids],[id]);
   assertModes(h,['wishlist','wish','wishlist']);assert.deepEqual([...h.calls[1].params],[['mode','wish'],['uid',id]]);assert.equal(h.calls[1].data,`mode=wish&uid=${id}`);
   assert.deepEqual(h.forbidden,[]);assert.equal(h.timers.size,0);assert.deepEqual(h.errors,[]);
  }finally{h.close();}
 }
});

test('native remove is confirmed only by removal from the post-read inventory',async()=>{
 const h=fixture();try{
  const result=await completeToggle(h,{before:[otherId,id],response:{result:true,action:'remove'},after:[otherId]});
  assert.equal(result.state,'ready');assert.equal(result.id,id);assert.equal(result.selected,false);assert.equal(result.changed,true);assert.deepEqual([...result.ids],[otherId]);assertModes(h,['wishlist','wish','wishlist']);
 }finally{h.close();}
});

test('membership and native action contradictions remain unknown and permanently lock that product against another toggle',async()=>{
 for(const scenario of [
  {before:[],response:{result:true,action:'add'},after:[]},
  {before:[id],response:{result:true,action:'remove'},after:[id]},
  {before:[],response:{result:true,action:'remove'},after:[id]},
  {before:[id],response:{result:true,action:'add'},after:[]}
 ]){
  const h=fixture();try{
   assert.equal((await completeToggle(h,scenario)).state,'unknown');const count=h.calls.length;
   assert.equal((await h.adapter.toggle(id)).state,'unknown');assert.equal(h.calls.length,count);assertModes(h,['wishlist','wish','wishlist']);
  }finally{h.close();}
 }
});

test('a failed native product write is not retried even when its server response reports an error',async()=>{
 const h=fixture();try{
  const {pending}=await beginToggle(h);await h.respond(0,listed([]));await h.respond(1,{result:false,message:'등록하지 못했습니다.'});
  assert.equal((await pending).state,'error');assertModes(h,['wishlist','wish']);assert.equal((await h.adapter.toggle(id)).state,'unknown');assert.equal(h.calls.length,2);
 }finally{h.close();}
});

test('pre-read failure allows another read attempt but never runs a product write from unverified state',async()=>{
 const h=fixture();try{
  const first=await beginToggle(h);await h.respond(0,{result:false,data:[]});assert.equal((await first.pending).state,'error');assertModes(h,['wishlist']);
  const next=await beginToggle(h);await h.respond(1,listed([]));await h.respond(2,{result:true,action:'add'});await h.respond(3,listed([id]));
  assert.equal((await next.pending).state,'ready');assertModes(h,['wishlist','wishlist','wish','wishlist']);
 }finally{h.close();}
});

test('concurrent same-product, other-product and refresh requests are busy without a second native operation',async()=>{
 const h=fixture();try{
  const {pending}=await beginToggle(h);assert.equal(h.calls.length,1);
  for(const next of [()=>h.adapter.toggle(id),()=>h.adapter.toggle(otherId),()=>h.adapter.refresh()])assert.equal((await next()).state,'busy');
  assert.equal(h.calls.length,1);await h.respond(0,listed([]));assert.equal((await h.adapter.toggle(id)).state,'busy');assert.equal(h.calls.length,2);
  await h.respond(1,{result:true,action:'add'});assert.equal((await h.adapter.refresh()).state,'busy');await h.respond(2,listed([id]));assert.equal((await pending).state,'ready');assertModes(h,['wishlist','wish','wishlist']);
 }finally{h.close();}
});

test('duplicate native callbacks cannot repeat a product write or its verification read',async()=>{
 const h=fixture();try{
  const {pending}=await beginToggle(h);await h.respond(0,listed([]));await h.respond(0,listed([]));assertModes(h,['wishlist','wish']);
  await h.respond(1,{result:true,action:'add'});await h.respond(1,{result:true,action:'add'});assertModes(h,['wishlist','wish','wishlist']);
  await h.respond(2,listed([id]));const result=await pending;await h.respond(2,listed([]));assert.equal(result.state,'ready');assert.equal(result.selected,true);assert.deepEqual([...result.ids],[id]);assert.equal(h.calls.length,3);
 }finally{h.close();}
});

test('a timed-out write remains unknown and a late native callback cannot start another read or unlock a toggle',async()=>{
 const h=fixture();try{
  const {pending}=await beginToggle(h);await h.respond(0,listed([]));assertModes(h,['wishlist','wish']);await h.expire();
  const result=await pending;assert.equal(result.state,'unknown');await h.respond(1,{result:true,action:'add'});assertModes(h,['wishlist','wish']);
  assert.equal((await h.adapter.toggle(id)).state,'unknown');assert.equal(h.calls.length,2);assert.equal(result.state,'unknown');
 }finally{h.close();}
});

test('a timed-out post-read stays unknown despite late inventory and a normal refresh does not clear its lock',async()=>{
 const h=fixture();try{
  const {pending}=await beginToggle(h);await h.respond(0,listed([]));await h.respond(1,{result:true,action:'add'});await h.expire();assert.equal((await pending).state,'unknown');
  await h.respond(2,listed([id]));const refresh=h.adapter.refresh();await settle();await h.respond(3,listed([id]));assert.equal((await refresh).state,'ready');
  assert.equal((await h.adapter.toggle(id)).state,'unknown');assertModes(h,['wishlist','wish','wishlist','wishlist']);
 }finally{h.close();}
});

test('an unsuccessful or malformed verification inventory never confirms a successful native write',async()=>{
 for(const response of [{result:false,data:[]},{result:true,data:null},listed(['bad'])]){
  const h=fixture();try{
   const {pending}=await beginToggle(h);await h.respond(0,listed([]));await h.respond(1,{result:true,action:'add'});await h.respond(2,response);
   assert.equal((await pending).state,'unknown');assert.equal((await h.adapter.toggle(id)).state,'unknown');assertModes(h,['wishlist','wish','wishlist']);
  }finally{h.close();}
 }
});

test('read timeout is bounded and does not lock a product before a native write was issued',async()=>{
 const h=fixture();try{
  const {pending}=await beginToggle(h);await h.expire();assert.equal((await pending).state,'error');assertModes(h,['wishlist']);
  await h.respond(0,listed([id]));const next=await beginToggle(h);await h.respond(1,listed([]));await h.respond(2,{result:true,action:'add'});await h.respond(3,listed([id]));assert.equal((await next.pending).state,'ready');
 }finally{h.close();}
});

test('a missing native engine loads its same-origin script once and never initializes or binds the engine UI',async()=>{
 const h=fixture({engine:false});try{
  const pending=h.adapter.refresh();await settle();const scripts=[...h.w.document.scripts];assert.equal(scripts.length,1);const url=new URL(scripts[0].src);
  assert.equal(url.origin,h.w.location.origin);assert.equal(url.pathname,'/js/wishlist.js');assert.equal((await h.adapter.refresh()).state,'busy');assert.equal(h.w.document.scripts.length,1);
  h.install();scripts[0].dispatchEvent(new h.w.Event('load'));await settle();await h.respond(0,listed([id]));assert.equal((await pending).state,'ready');
  const next=h.adapter.refresh();await settle();await h.respond(1,listed([]));assert.equal((await next).state,'ready');assert.equal(h.w.document.scripts.length,1);assert.deepEqual(h.forbidden,[]);
 }finally{h.close();}
});

test('separate adapters in the same window share one native script load without sharing read results',async()=>{
 const h=fixture({engine:false});try{
  const second=createProductWishlistAdapter({window:h.w,timeoutMs:25}),firstPending=h.adapter.refresh(),secondPending=second.refresh();await settle();
  assert.equal(h.w.document.scripts.length,1);assert.deepEqual(h.calls,[]);h.install();h.w.document.scripts[0].dispatchEvent(new h.w.Event('load'));await settle();
  assertModes(h,['wishlist','wishlist']);await h.respond(0,listed([id]));await h.respond(1,listed([otherId]));
  assert.deepEqual([...(await firstPending).ids],[id]);assert.deepEqual([...(await secondPending).ids],[otherId]);assert.equal(h.w.document.scripts.length,1);assert.deepEqual(h.forbidden,[]);
 }finally{h.close();}
});

test('native script error, load without a constructor and loader timeout fail without requests or an automatic reload',async()=>{
 for(const failure of ['error','missing-constructor','timeout']){
  const h=fixture({engine:false});try{
   const pending=h.adapter.refresh();await settle();const script=h.w.document.querySelector('script');assert.ok(script);
   if(failure==='timeout')await h.expire();else{script.dispatchEvent(new h.w.Event(failure==='error'?'error':'load'));await settle();}
   assert.equal((await pending).state,'error');assert.equal((await h.adapter.refresh()).state,'error');assert.equal(h.w.document.scripts.length,1);assert.deepEqual(h.calls,[]);assert.deepEqual(h.forbidden,[]);
  }finally{h.close();}
 }
});
