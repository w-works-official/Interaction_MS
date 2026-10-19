import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,validateConfig,migrateSavedConfig,normalizeContentBlock,blockPosition,blocksForZone,composeFeed} from '../dist/model.js';

const products=[{id:'1'},{id:'2'},{id:'3'}];
const block=(id,overrides={})=>({id,type:'editorial',title:'안내 '+id,subtitle:'설명',after:1,span:2,tabs:['추천'],enabled:true,tone:'cream',image:'',link:'',...overrides});
const config=banners=>({...initialConfig(),banners});
const feedIds=feed=>feed.map(entry=>entry.kind==='product'?'product:'+entry.data.id:'block:'+entry.data.id);

test('legacy schema-1 banners gain compatible defaults without mutating original data or unknown fields',()=>{
 const legacy=block('legacy',{custom:{campaign:'kept'}}),before=structuredClone(legacy),normalized=normalizeContentBlock(legacy);
 assert.deepEqual(legacy,before);assert.deepEqual(normalized.custom,{campaign:'kept'});
 assert.equal(normalized.zone,'feed');assert.equal(normalized.placement,'count');assert.equal(normalized.after,1);
 assert.equal(normalized.overflow,'end');assert.equal(normalized.showWhenFiltered,true);assert.equal(normalized.anchorSide,'after');assert.equal(normalized.anchorId,'');
 assert.equal(normalized.widthPc,'2');assert.equal(normalized.widthMobile,'full');assert.equal(normalized.newRow,false);
 assert.equal(normalized.background,'#eef0e6');assert.equal(normalized.textColor,'#171918');
 assert.equal(normalized.padding,20);assert.equal(normalized.radius,0);assert.equal(normalized.align,'left');assert.equal(normalized.imageFit,'cover');assert.equal(normalized.imageRatio,'auto');
 const input=config([legacy]);input.unknownConfig={value:1};const inputBefore=structuredClone(input),migrated=migrateSavedConfig(input,products);
 assert.equal(migrated.schema,1);assert.equal(migrated.banners[0].id,'legacy');assert.deepEqual(migrated.unknownConfig,{value:1});assert.deepEqual(migrated.tabs,input.tabs);assert.deepEqual(input,inputBefore);
});

test('legacy widths and tone defaults retain one-column, notice and image-backed treatments',()=>{
 const single=normalizeContentBlock(block('one',{span:1}));assert.equal(single.widthPc,'1');assert.equal(single.widthMobile,'1');
 const notice=normalizeContentBlock(block('notice',{type:'notice',span:1,tone:'ink'}));assert.equal(notice.widthPc,'full');assert.equal(notice.widthMobile,'full');assert.equal(notice.background,'#eef0e6');assert.equal(notice.textColor,'#171918');
 const ink=normalizeContentBlock(block('ink',{tone:'ink'}));assert.equal(ink.background,'#252a21');assert.equal(ink.textColor,'#ffffff');
 assert.equal(normalizeContentBlock(block('blush',{tone:'blush'})).background,'#e9dcd6');
 assert.equal(normalizeContentBlock(block('photo',{image:'assets/banner.jpg'})).textColor,'#171918');
 assert.equal(normalizeContentBlock(block('photo-blush',{image:'assets/banner.jpg',tone:'blush'})).textColor,'#171918');
 assert.equal(normalizeContentBlock(block('photo-explicit-white',{image:'assets/banner.jpg',textColor:'#ffffff'})).textColor,'#ffffff');
});

test('explicit responsive widths and visual styles survive normalization and validation',()=>{
 const input=block('styled',{widthPc:'full',widthMobile:'2',newRow:true,background:'#112233',textColor:'#abcdef',padding:24,radius:12,align:'center',imageFit:'contain',imageRatio:'3/4',showWhenFiltered:false,overflow:'hide'});
 const result=validateConfig(config([input]),products).banners[0];
 for(const key of ['widthPc','widthMobile','newRow','background','textColor','padding','radius','align','imageFit','imageRatio','showWhenFiltered','overflow'])assert.equal(result[key],input[key]);
});

test('independent zones ignore product counts and stay ordered, active and scoped to their tabs',()=>{
 const banners=[block('top-first',{zone:'top',after:100000,overflow:'hide'}),block('feed'),block('top-second',{zone:'top',after:99}),block('off',{zone:'top',enabled:false}),block('other-tab',{zone:'top',tabs:['반지']})];
 assert.deepEqual(blocksForZone([],banners,'추천','top').map(b=>b.id),['top-first','top-second']);
 for(const zone of ['top','after-tabs','before-feed','bottom']){
  const independent=block(zone,{zone,after:100000,overflow:'hide'});
  assert.equal(blockPosition(products,independent),null);
  assert.deepEqual(blocksForZone([], [independent],'추천',zone).map(b=>b.id),[zone]);
 }
 assert.deepEqual(feedIds(composeFeed(products,banners,'추천')),['product:1','block:feed','product:2','product:3']);
});

test('count placements honor start, last-product, legacy end-clamp and explicit hide overflow',()=>{
 const banners=[block('start',{after:0}),block('last',{after:3}),block('legacy-end',{after:99}),block('hidden',{after:4,overflow:'hide'})];
 assert.equal(blockPosition(products,banners[0]),0);assert.equal(blockPosition(products,banners[1]),3);assert.equal(blockPosition(products,banners[2]),3);assert.equal(blockPosition(products,banners[3]),null);
 assert.deepEqual(feedIds(composeFeed(products,banners,'추천')),['block:start','product:1','product:2','product:3','block:last','block:legacy-end']);
 assert.deepEqual(blocksForZone(products,banners,'추천','feed').map(b=>b.id),['start','last','legacy-end']);
});

test('product anchors follow identity before or after reorder and never fall back when missing',()=>{
 const before=block('before',{placement:'product',anchorId:'2',anchorSide:'before'}),after=block('after',{placement:'product',anchorId:'2'});
 assert.deepEqual(feedIds(composeFeed(products,[before,after],'추천')),['product:1','block:before','product:2','block:after','product:3']);
 const reordered=[products[2],products[1],products[0]];
 assert.deepEqual(feedIds(composeFeed(reordered,[before,after],'추천')),['product:3','block:before','product:2','block:after','product:1']);
 const missing=block('missing',{placement:'product',anchorId:'999',overflow:'end'});
 assert.doesNotThrow(()=>validateConfig(config([missing]),products));assert.equal(blockPosition(products,missing),null);
 assert.deepEqual(blocksForZone(products,[missing],'추천','feed'),[]);
 assert.deepEqual(feedIds(composeFeed([products[0]],[before,after,missing],'추천')),['product:1']);
});

test('blocks sharing a count or product insertion slot retain the saved array order',()=>{
 const banners=[block('before-two',{placement:'product',anchorId:'2',anchorSide:'before'}),block('count-one',{after:1}),block('after-one',{placement:'product',anchorId:'1',anchorSide:'after'})];
 assert.deepEqual(feedIds(composeFeed(products,banners,'추천')),['product:1','block:before-two','block:count-one','block:after-one','product:2','product:3']);
 assert.deepEqual(feedIds(composeFeed(products,[...banners].reverse(),'추천')),['product:1','block:after-one','block:count-one','block:before-two','product:2','product:3']);
});

test('filtered context guards every zone while legacy blocks remain visible by default',()=>{
 const banners=[block('legacy'),block('hide-feed',{showWhenFiltered:false}),block('hide-top',{zone:'top',showWhenFiltered:false}),block('keep-top',{zone:'top'})];
 assert.deepEqual(blocksForZone(products,banners,'추천','feed',{filtered:true}).map(b=>b.id),['legacy']);
 assert.deepEqual(blocksForZone(products,banners,'추천','top',{filtered:true}).map(b=>b.id),['keep-top']);
 assert.deepEqual(blocksForZone(products,banners,'추천','top').map(b=>b.id),['hide-top','keep-top']);
 assert.deepEqual(feedIds(composeFeed(products,banners,'추천',{filtered:true})),['product:1','block:legacy','product:2','product:3']);
});

test('empty result sets permit count-zero and end-clamped blocks but hide unresolved anchors and overflow',()=>{
 const banners=[block('zero',{after:0,overflow:'hide'}),block('end',{after:100}),block('hide',{after:1,overflow:'hide'}),block('anchor',{placement:'product',anchorId:'1'})];
 assert.deepEqual(feedIds(composeFeed([],banners,'추천')),['block:zero','block:end']);
 const before=structuredClone(banners);composeFeed(products,banners,'추천');blocksForZone(products,banners,'추천','feed');assert.deepEqual(banners,before);
});

test('all block types retain a required management title, with images required for image blocks',()=>{
 for(const type of ['image','text','spacer','divider']){
  const candidate=block(type,{type,title:'관리 이름 '+type,subtitle:type==='text'?'직접 입력한 안내':'',image:type==='image'?'https://images.example/banner.png':''});
  const result=validateConfig(config([candidate]),products).banners[0];assert.equal(result.type,type);assert.equal(result.title,candidate.title);
 }
 assert.throws(()=>normalizeContentBlock(block('missing-image',{type:'image'})));
 for(const type of ['editorial','notice','image','text','spacer','divider'])assert.throws(()=>normalizeContentBlock(block('no-title',{type,title:' ',image:'assets/banner.jpg'})));
});

test('invalid placement, field types and styles are rejected instead of silently falling back',()=>{
 const changes=[{id:'x'.repeat(121)},{tabs:[]},{zone:'header'},{zone:null},{placement:'absolute'},{placement:'product'},{placement:'product',anchorId:'0'},{placement:'product',anchorId:'2\n'},{placement:'product',anchorId:2},{placement:'product',anchorId:'2',zone:'top'},{anchorSide:'middle'},{overflow:'wrap'},{after:-1},{after:1.5},{after:100001},{after:'2'},{after:Number.MAX_SAFE_INTEGER+1},{widthPc:2},{widthMobile:'3'},{newRow:1},{showWhenFiltered:'false'},{background:'#fff'},{background:'#112233\n'},{textColor:'red'},{textColor:'#1234567'},{padding:-1},{padding:65},{padding:1.5},{radius:49},{radius:'4'},{align:'justify'},{imageFit:'stretch'},{imageRatio:'4/3'},{tabs:['unknown']},{type:'html'},{image:'javascript:alert(1)'},{image:'data:image/svg+xml;base64,AAAA'},{link:'http://example.com'},{link:'javascript:alert(1)'}];
 for(const change of changes)assert.throws(()=>validateConfig(config([block('invalid',change)]),products),JSON.stringify(change));
 assert.doesNotThrow(()=>normalizeContentBlock(block('x'.repeat(120),{after:100000,padding:64,radius:48})));
});

test('schema-1 block limit is 100 and duplicate stable IDs remain invalid',()=>{
 const hundred=Array.from({length:100},(_,index)=>block('block-'+index));
 assert.equal(validateConfig(config(hundred),products).banners.length,100);
 assert.throws(()=>validateConfig(config([...hundred,block('one-too-many')]),products));
 assert.throws(()=>validateConfig(config([block('duplicate'),block('duplicate')]),products));
});
