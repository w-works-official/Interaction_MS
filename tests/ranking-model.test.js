import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TABS,TAG_GROUPS,TAG_WEIGHTS,initialConfig,defaultRanking,normalizeRanking,validateConfig,migrateSavedConfig,normalizeCatalog,effectiveCatalog,rankProducts,resolveList,browseProducts,filterList,discoverProducts,emptyDiscovery,tagScore} from '../dist/model.js';

const fixtures=()=>normalizeCatalog([
 {id:'1',name:'하트 기본',price:1000,score:40,category:'피어싱',materials:['써지컬'],tags:{motif:['하트'],style:['데일리'],size:['작은'],material:['써지컬스틸']},images:['assets/one.jpg']},
 {id:'2',name:'하트 실버',price:3000,score:30,category:'피어싱',materials:['925 실버'],tags:{motif:['하트'],style:['데일리'],size:['큰'],material:['925실버']},images:[]},
 {id:'3',name:'별 실버',price:2000,score:20,category:'피어싱',materials:['925 실버'],tags:{motif:['별'],style:['포인트'],size:['작은'],material:['925실버']},images:[]},
 {id:'4',name:'무태그 반지',price:500,score:10,category:'반지',materials:['써지컬'],tags:{},images:[]}
]);
const active=(changes={})=>{const c=initialConfig();c.ranking['추천']={...defaultRanking(),enabled:true,...changes};return c;};
const ids=items=>items.map(product=>product.id);
const rule=(id,group,tag,weight)=>({id,group,tag,weight});

test('legacy schema-1 drafts gain independent disabled ranking defaults without changing curation or blocks',()=>{
 const catalog=fixtures(),legacy=initialConfig();delete legacy.ranking;delete legacy.productEdits;
 legacy.tabs['추천'].pins=['2'];legacy.tabs['추천'].manual=['3','1'];legacy.tabs['추천'].excluded=['4'];
 legacy.banners=[{id:'kept',type:'notice',title:'기존 안내',subtitle:'',after:0,span:2,tabs:['추천'],enabled:true}];
 const before=structuredClone(legacy),expected=ids(resolveList(catalog,'추천',legacy));
 const migrated=migrateSavedConfig(legacy,catalog);
 assert.equal(migrated.schema,1);assert.deepEqual(migrated.tabs,before.tabs);assert.equal(migrated.banners[0].id,'kept');assert.deepEqual(migrated.productEdits,{});
 for(const tab of TABS)assert.deepEqual(migrated.ranking[tab],defaultRanking());
 assert.deepEqual(ids(resolveList(catalog,'추천',migrated)),expected);assert.deepEqual(legacy,before);
 const defaults=initialConfig();defaults.ranking['추천'].rules.push(rule('one','style','심플',1));assert.deepEqual(defaults.ranking['반지'].rules,[]);
});

test('ranking validation rejects unknown tags, malformed weights, duplicate IDs and oversized settings',()=>{
 const valid={enabled:true,brief:'사람이 설정한 방향',diversity:10,respectPins:false,rules:[rule('heart','motif','하트',100)],combinations:[{id:'combo',conditions:[{group:'motif',tag:'하트'},{group:'style',tag:'데일리'}],weight:-100}]};
 assert.deepEqual(normalizeRanking(valid),valid);
 const bad=[null,[],{enabled:'yes'},{respectPins:0},{brief:'x'.repeat(1201)},{diversity:-1},{diversity:11},{diversity:1.5},{rules:[rule('bad','unknown','하트',1)]},{rules:[rule('bad','style','미정',1)]},{rules:[rule('bad','style','심플',101)]},{rules:[rule('bad','style','심플',1.5)]},{rules:[rule('','style','심플',1)]},{rules:[rule('x'.repeat(121),'style','심플',1)]},{rules:[rule('same','style','심플',1),rule('same','size','작은',1)]},{rules:[rule('combo','style','심플',1)],combinations:valid.combinations},{combinations:[{...valid.combinations[0],conditions:[{group:'style',tag:'심플'}]}]},{combinations:[{...valid.combinations[0],conditions:Array.from({length:9},()=>({group:'style',tag:'심플'}))}]},{rules:Array.from({length:101},(_,i)=>rule('rule-'+i,'style','심플',1))},{combinations:Array.from({length:31},(_,i)=>({...valid.combinations[0],id:'combo-'+i}))}];
 for(const value of bad)assert.throws(()=>normalizeRanking(value));
});

test('product tag edits replace specified groups, preserve unedited groups and never change source catalog facts',()=>{
 const catalog=fixtures(),before=structuredClone(catalog),c=initialConfig();c.productEdits={'1':{tags:{motif:[],style:['심플','심플'],size:['중간']},note:'사진을 보고 검토함',reviewStatus:'reviewed'}};
 const valid=validateConfig(c,catalog),effective=effectiveCatalog(catalog,valid);
 assert.deepEqual(effective[0].tags.motif,[]);assert.deepEqual(effective[0].tags.style,['심플']);assert.deepEqual(effective[0].tags.size,['중간']);
 assert.deepEqual(effective[0].tags.material,catalog[0].tags.material);assert.equal(effective[0].note,'사진을 보고 검토함');assert.equal(effective[0].reviewStatus,'reviewed');
 for(const key of ['price','images','categories','materials','detailUrl'])assert.deepEqual(effective[0][key],catalog[0][key]);
 assert.deepEqual(catalog,before);assert.equal(effective[1],catalog[1]);
});

test('unknown edit IDs are rejected on direct import but dropped during catalog migration',()=>{
 const catalog=fixtures(),c=initialConfig();c.productEdits={'1':{tags:{style:['데일리']},note:'유효',reviewStatus:'needs-review'},'999':{tags:{size:['큰']}}};
 assert.throws(()=>validateConfig(c,catalog));const migrated=migrateSavedConfig(c,catalog);assert.deepEqual(Object.keys(migrated.productEdits),['1']);assert.ok(c.productEdits['999']);
 for(const edit of [{tags:{style:['없는 태그']}},{tags:{unknown:[]}},{tags:{style:'심플'}},{note:'x'.repeat(601)},{reviewStatus:'approved'}]){
  const invalid=initialConfig();invalid.productEdits={'1':edit};assert.throws(()=>validateConfig(invalid,catalog));
 }
});

test('additive positive and negative rules, AND combinations and discovery reasons have exact score decomposition',()=>{
 const catalog=fixtures(),c=active({rules:[rule('heart','motif','하트',10),rule('large','size','큰',-4)],combinations:[{id:'daily-heart',conditions:[{group:'motif',tag:'하트'},{group:'style',tag:'데일리'}],weight:20}]}),before=structuredClone(catalog);
 const d=emptyDiscovery();d.tags={size:['작은']};const ranked=rankProducts(catalog,'추천',c,{discovery:d}),scores=new Map(ranked.map(product=>[product.id,product._rank.score]));
 assert.equal(scores.get('1'),32);assert.equal(scores.get('2'),26);assert.equal(scores.get('3'),2);assert.equal(scores.get('4'),0);
 for(const product of ranked){assert.equal(product._rank.reasons.reduce((sum,reason)=>sum+reason.points,0),product._rank.score);assert.equal(product._rank.baseScore-product._rank.penalty,product._rank.score);}
 assert.equal(ranked.find(p=>p.id==='3')._rank.reasons.some(reason=>reason.label.startsWith('조합')),false);assert.deepEqual(catalog,before);
});

test('equal scores retain curated manual order while respected pins lead independently of their score',()=>{
 const catalog=fixtures(),c=active({rules:[rule('penalty','motif','별',-50)]});c.tabs['추천'].manual=['4','2','1','3'];c.tabs['추천'].pins=['3'];
 const before=structuredClone(c),pinned=resolveList(catalog,'추천',c);
 assert.deepEqual(ids(pinned),['3','4','2','1']);assert.equal(pinned[0]._rank.score,-50);assert.deepEqual(c,before);
 c.ranking['추천'].respectPins=false;assert.deepEqual(ids(resolveList(catalog,'추천',c)),['4','2','1','3']);
 c.ranking['추천'].enabled=false;assert.deepEqual(ids(resolveList(catalog,'추천',c)),['3','4','2','1']);
});

test('diversity reduces recent motif/style repetition and reports the applied penalty',()=>{
 const catalog=fixtures().slice(0,3),c=active({diversity:5,rules:[rule('hearts','motif','하트',10),rule('stars','motif','별',8)]});
 const ranked=rankProducts(catalog,'추천',c);
 assert.deepEqual(ids(ranked),['1','3','2']);assert.equal(ranked[2]._rank.baseScore,10);assert.equal(ranked[2]._rank.penalty,10);assert.equal(ranked[2]._rank.score,0);
 assert.equal(ranked[2]._rank.reasons.reduce((sum,reason)=>sum+reason.points,0),0);
 c.ranking['추천'].diversity=0;assert.deepEqual(ids(rankProducts(catalog,'추천',c)),['1','2','3']);
});

test('bounded diversity work scales with a forty-candidate window rather than the entire remaining list',()=>{
 let reads=0;const count=800;
 const catalog=Array.from({length:count},(_,index)=>({id:String(index+1),get tags(){reads++;return {motif:[index%2?'하트':'별'],style:['데일리']};}}));
 const c=active({diversity:1}),ranked=rankProducts(catalog,'추천',c);
 assert.equal(ranked.length,count);assert.equal(new Set(ids(ranked)).size,count);assert.ok(reads<count*400,'tag comparisons stay bounded by the candidate window');
});

test('disabled browse output matches the existing discovery pipeline across search, favorites, strict tags and sorts',()=>{
 const catalog=fixtures(),c=initialConfig();c.tabs['추천'].pins=['3'];c.tabs['추천'].manual=['2','1'];
 const d=emptyDiscovery();d.tags={motif:['하트']};d.strict=true;d.min='900';d.max='3500';d.cap=1;
 for(const options of [{},{query:'하트'},{material:'925 실버'},{favoritesOnly:true,favorites:['1','3']},{discovery:d},{sort:'priceAsc',discovery:d},{sort:'match',discovery:d},{sort:'newest'}]){
  const discovery=options.discovery||emptyDiscovery(),sort=options.sort||'curated';
  const expected=discoverProducts(filterList(resolveList(catalog,'추천',c),{...options,sort:'curated'}),discovery,{sort});
  assert.deepEqual(browseProducts(catalog,'추천',c,options),expected);
 }
});

test('enabled browse scores the full filtered pool before caps, honors pins and keeps explicit price sorting',()=>{
 const catalog=fixtures(),c=active({rules:[rule('star','motif','별',50)]}),d=emptyDiscovery();d.cap=1;
 assert.deepEqual(ids(browseProducts(catalog,'추천',c,{discovery:d})),['3']);
 c.tabs['추천'].pins=['2'];assert.deepEqual(ids(browseProducts(catalog,'추천',c,{discovery:d})),['2']);
 assert.deepEqual(ids(browseProducts(catalog,'추천',c,{sort:'priceAsc',discovery:d})),['4']);
 assert.deepEqual(ids(browseProducts(catalog,'추천',c,{query:'별',discovery:d})),['3']);
 assert.deepEqual(ids(browseProducts(catalog,'추천',c,{material:'925 실버',favoritesOnly:true,favorites:['3'],discovery:d})),['3']);
 const strict=emptyDiscovery();strict.tags={style:['데일리']};strict.strict=true;assert.deepEqual(ids(browseProducts(catalog,'추천',c,{discovery:strict})),['2','1']);
});

test('new visual style and size tags connect edits to discovery without inventing rules from a brief',()=>{
 assert.deepEqual(TAG_GROUPS.find(group=>group.key==='style').options,['심플','화려','데일리','포인트','레이어드']);assert.deepEqual(TAG_GROUPS.find(group=>group.key==='size').options,['작은','중간','큰']);assert.equal(TAG_WEIGHTS.style,2);assert.equal(TAG_WEIGHTS.size,2);
 const catalog=fixtures(),c=active({brief:'별을 위로, AI가 자동 해석한 것처럼 보이지 않게'});assert.deepEqual(ids(resolveList(catalog,'추천',c)),['1','2','3','4']);assert.ok(resolveList(catalog,'추천',c).every(product=>product._rank.score===0));
 c.productEdits={'4':{tags:{style:['심플'],size:['작은']},note:'시각 태그만 편집',reviewStatus:'reviewed'}};
 const d=emptyDiscovery();d.tags={style:['심플'],size:['작은']};d.strict=true;
 assert.equal(tagScore(effectiveCatalog(catalog,c)[3],d),4);assert.deepEqual(ids(browseProducts(catalog,'추천',c,{discovery:d})),['4']);
});

test('ranking a complete snapshot is deterministic, retains every product and does not mutate persisted config',()=>{
 const catalog=normalizeCatalog(JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url))));
 const c=active({diversity:2,rules:[rule('heart','motif','하트',10)]}),before=JSON.stringify(c);
 const first=resolveList(catalog,'추천',c),second=resolveList(catalog,'추천',c);
 assert.equal(first.length,2379);assert.equal(new Set(ids(first)).size,2379);assert.deepEqual(ids(first),ids(second));assert.equal(JSON.stringify(c),before);
 for(const product of first)assert.equal(product._rank.reasons.reduce((sum,reason)=>sum+reason.points,0),product._rank.score);
});
