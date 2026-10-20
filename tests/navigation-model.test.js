import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {TABS,TAG_GROUPS,clone,initialConfig,normalizeCatalog,validateConfig,migrateSavedConfig,categoryDefinitions,categoryIds,categoryLabel,normalizeCategories,categoryFilters,normalizeDiscoveryForCategory,poolFor,resolveList,browseProducts,emptyDiscovery,normalizeContentBlock,composeFeed,defaultRanking,reorder} from '../dist/model.js';

const catalog=normalizeCatalog([
 {id:'1',name:'작은 하트',price:1000,score:40,categories:['피어싱'],materials:['써지컬'],tags:{motif:['하트'],style:['데일리']},images:['assets/one.jpg']},
 {id:'2',name:'실버 별',price:3000,score:30,categories:['피어싱','귀걸이'],materials:['925 실버'],tags:{motif:['별'],style:['포인트']},images:['assets/two.jpg']},
 {id:'3',name:'큰 하트',price:2000,score:20,categories:['피어싱'],materials:['써지컬'],tags:{motif:['하트'],style:['포인트']},images:['assets/three.jpg']},
 {id:'4',name:'하트 반지',price:500,score:10,categories:['반지'],materials:['925 실버'],tags:{motif:['하트'],style:['데일리']},images:['assets/four.jpg']}
]);
const ids=items=>items.map(product=>product.id);
const custom=(id='cat_daily',changes={})=>({id,label:id==='cat_daily'?'데일리 모음':id,enabled:true,mode:'manual',productIds:['1','2','3'],note:'',...changes});
const configured=(changes={})=>{const config=initialConfig();config.categories.push(custom('cat_daily',changes));return validateConfig(config,catalog);};
const block=(tabs=['cat_daily'])=>({id:'dynamic-block',type:'notice',title:'분류 안내',after:0,tabs,enabled:true});

test('legacy schema-1 configurations retain the eight category identities, memberships and compatible display labels',()=>{
 const legacy=initialConfig();delete legacy.categories;const before=clone(legacy),validated=validateConfig(legacy,catalog);
 assert.deepEqual(categoryIds(legacy),TABS);assert.deepEqual(categoryIds(validated),TABS);assert.deepEqual(categoryIds(validated,{visibleOnly:true}),TABS);
 assert.equal(categoryLabel(validated,'반지'),'반지·토우링');assert.equal(categoryLabel(validated,'팔찌'),'팔찌·발찌');
 assert.equal(categoryLabel(validated,'missing'),'missing');
 for(const tab of TABS){assert.deepEqual(ids(poolFor(catalog,tab,validated)),ids(poolFor(catalog,tab)));assert.deepEqual(ids(resolveList(catalog,tab,validated)),ids(resolveList(catalog,tab,legacy)));}
 assert.deepEqual(categoryFilters(validated,'추천').groups,TAG_GROUPS.map(group=>group.key));assert.deepEqual(legacy,before);
 validated.categories[0].filters.groups.pop();assert.equal(validated.categories[1].filters.groups.length,TAG_GROUPS.length);assert.equal(initialConfig().categories[0].filters.groups.length,TAG_GROUPS.length);
});

test('category identities, mutable labels, saved order and visibility are separate from product membership',()=>{
 const config=configured();config.categories.find(category=>category.id==='반지').enabled=false;
 const added=config.categories.pop();added.label='새로운 표시 이름';config.categories.splice(1,0,added);
 assert.deepEqual(categoryIds(config).slice(0,3),['추천','cat_daily','신상']);assert.ok(!categoryIds(config,{visibleOnly:true}).includes('반지'));
 assert.equal(categoryLabel(config,'cat_daily'),'새로운 표시 이름');assert.deepEqual(ids(poolFor(catalog,'cat_daily',config)),['1','2','3']);
 assert.deepEqual(ids(poolFor(catalog,'반지',config)),['4'],'hidden categories remain inspectable by the operator');
 assert.ok(config.tabs.cat_daily);assert.equal(config.tabs['새로운 표시 이름'],undefined);
});

test('manual categories can overlap while custom all and legacy modes reuse source membership without changing source products',()=>{
 const input=clone(catalog),config=configured();config.categories.push(custom('cat_overlap',{label:'하트 비교',productIds:['1','4']}),custom('cat_all',{label:'모든 원본',mode:'all',productIds:[]}),custom('cat_ears',{label:'귀걸이 원본',mode:'legacy',legacyTab:'귀걸이',productIds:[]}));
 const normalized=validateConfig(config,catalog);
 assert.deepEqual(ids(poolFor(catalog,'cat_daily',normalized)),['1','2','3']);assert.deepEqual(ids(poolFor(catalog,'cat_overlap',normalized)),['1','4']);
 assert.deepEqual(ids(poolFor(catalog,'cat_all',normalized)),['1','2','3','4']);assert.deepEqual(ids(poolFor(catalog,'cat_ears',normalized)),['2']);
 assert.equal(poolFor(catalog,'cat_overlap',normalized)[0],catalog[0]);assert.deepEqual(catalog,input);assert.deepEqual(poolFor(catalog,'cat_missing',normalized),[]);
});

test('normalization supplies independent filter defaults, trims labels and preserves nonfunctional management notes',()=>{
 const config=initialConfig();config.categories.push(custom('cat_daily',{label:'  직접 만든 분류  ',productIds:['1','1','3'],note:'AI가 사진을 보고 검토할 지시',externalReference:'sheet-row-9'}));
 const before=clone(config),categories=normalizeCategories(config.categories,catalog),category=categories.at(-1);
 assert.equal(category.label,'직접 만든 분류');assert.deepEqual(category.productIds,['1','3']);assert.equal(category.note,'AI가 사진을 보고 검토할 지시');assert.equal(category.externalReference,'sheet-row-9');
 assert.deepEqual(category.filters,{groups:TAG_GROUPS.map(group=>group.key),material:true,price:true,photo:true});assert.deepEqual(config,before);
 category.filters.groups.pop();assert.equal(categories[0].filters.groups.length,TAG_GROUPS.length);
});

test('category validation rejects invalid identities, duplicate labels, removed defaults and fully hidden navigation',()=>{
 for(const mutate of [
  config=>config.categories.pop(),
  config=>config.categories.push({...config.categories[0]}),
  config=>config.categories.push(custom('not-prefixed')),
  config=>config.categories.push(custom('cat_BAD')),
  config=>config.categories.push(custom('cat_daily\n')),
  config=>config.categories.push(custom('cat_'+('a'.repeat(65)))),
  config=>config.categories.push(custom('cat_daily',{label:'  추천  '})),
  config=>config.categories.push(custom('cat_daily',{label:' '})),
  config=>config.categories.push(custom('cat_daily',{label:'가'.repeat(41)})),
  config=>config.categories.forEach(category=>{category.enabled=false;}),
  config=>config.categories.push(custom('cat_daily',{enabled:'yes'})),
  config=>config.categories.push(custom('cat_daily',{mode:'query'})),
  config=>config.categories.push(custom('cat_daily',{mode:'legacy',legacyTab:'없는 원본'})),
  config=>config.categories.push(custom('cat_daily',{note:'a'.repeat(1201)})),
  config=>config.categories.push(custom('cat_daily',{productIds:['999']})),
  config=>config.categories.push(custom('cat_daily',{productIds:[1]}))
 ]){const config=initialConfig();mutate(config);assert.throws(()=>validateConfig(config,catalog));}
 const maximum=initialConfig();for(let index=0;index<32;index++)maximum.categories.push(custom('cat_extra_'+index,{productIds:[]}));
 assert.equal(validateConfig(maximum,catalog).categories.length,40);maximum.categories.push(custom('cat_overflow'));assert.throws(()=>validateConfig(maximum,catalog));
});

test('filter groups preserve explicit order or an empty selection and reject unknown groups, duplicates and nonboolean switches',()=>{
 const config=configured({filters:{groups:['style','motif'],material:false,price:true,photo:false}});
 assert.deepEqual(categoryFilters(config,'cat_daily'),{groups:['style','motif'],material:false,price:true,photo:false});
 config.categories.at(-1).filters.groups=[];assert.deepEqual(validateConfig(config,catalog).categories.at(-1).filters.groups,[]);
 for(const filters of [null,[],{groups:['unknown']},{groups:['style','style']},{groups:'style'},{material:0},{price:'false'},{photo:null}]){
  const invalid=initialConfig();invalid.categories.push(custom('cat_daily',{filters}));assert.throws(()=>validateConfig(invalid,catalog));
 }
});

test('custom categories receive curation and ranking defaults while undeclared category settings remain invalid',()=>{
 const config=initialConfig();config.categories.push(custom());const normalized=validateConfig(config,catalog);
 assert.deepEqual(normalized.tabs.cat_daily,{sort:'recommended',manual:[],pins:[],excluded:[],hideSoldout:false});assert.deepEqual(normalized.ranking.cat_daily,defaultRanking());
 normalized.tabs.cat_daily.pins.push('2');normalized.ranking.cat_daily.rules.push({id:'custom-rule',group:'motif',tag:'별',weight:10});
 assert.deepEqual(normalized.tabs['추천'].pins,[]);assert.deepEqual(normalized.ranking['추천'].rules,[]);
 for(const mutate of [value=>{value.tabs.cat_daily.sort='invalid';},value=>{value.tabs.cat_missing=value.tabs.cat_daily;},value=>{value.ranking.cat_missing=defaultRanking();},value=>{delete value.tabs['추천'];}]){
  const invalid=clone(normalized);mutate(invalid);assert.throws(()=>validateConfig(invalid,catalog));
 }
});

test('migration drops disappeared manual members and saved product references without discarding category instructions or curation',()=>{
 const saved=configured();saved.categories.at(-1).productIds=['1','2','999'];saved.categories.at(-1).note='원본 분류는 그대로 둔다';
 saved.tabs.cat_daily={sort:'priceAsc',pins:['999','2'],manual:['3','999','1'],excluded:['999','1'],hideSoldout:false};saved.productEdits['999']={tags:{style:['데일리']}};
 const before=clone(saved);assert.throws(()=>validateConfig(saved,catalog));const migrated=migrateSavedConfig(saved,catalog);
 assert.deepEqual(migrated.categories.at(-1).productIds,['1','2']);assert.equal(migrated.categories.at(-1).note,'원본 분류는 그대로 둔다');
 assert.deepEqual(migrated.tabs.cat_daily,{sort:'priceAsc',pins:['2'],manual:['3','1'],excluded:['1'],hideSoldout:false});assert.equal(migrated.productEdits['999'],undefined);assert.deepEqual(saved,before);
});

test('content blocks support declared custom category IDs and keep the existing composition API',()=>{
 const config=configured();config.banners=[block()];const normalized=validateConfig(config,catalog),items=resolveList(catalog,'cat_daily',normalized);
 assert.deepEqual(composeFeed(items,normalized.banners,'cat_daily').map(entry=>entry.kind==='product'?entry.data.id:entry.data.id),['dynamic-block','1','2','3']);
 assert.equal(normalizeContentBlock(block(['cat_not_declared'])).tabs[0],'cat_not_declared');
 const unknown=configured();unknown.banners=[block(['cat_not_declared'])];assert.throws(()=>validateConfig(unknown,catalog));
 for(const tab of ['custom','cat_BAD','cat_daily\n'])assert.throws(()=>normalizeContentBlock(block([tab])));
});

test('hidden discovery groups, prices, photos and material values are removed without mutating customer state',()=>{
 const config=configured({filters:{groups:['style'],material:false,price:false,photo:false}}),discovery={...emptyDiscovery(),tags:{motif:['별'],style:['포인트'],unknown:['x']},min:'2500',max:'3500',strict:true,photoTone:{hue:20,grey:false},photoPreview:'data:image/png;base64,abc',material:'925 실버'};
 const before=clone(discovery),normalized=normalizeDiscoveryForCategory(discovery,config,'cat_daily');
 assert.deepEqual(normalized.tags,{style:['포인트']});assert.equal(normalized.min,'');assert.equal(normalized.max,'');assert.equal(normalized.photoTone,null);assert.equal(normalized.photoPreview,'');assert.equal(normalized.material,'전체');assert.deepEqual(discovery,before);
 assert.deepEqual(ids(browseProducts(catalog,'cat_daily',config,{material:'925 실버',discovery})),['2','3']);
});

test('category filtering applies to the complete membership before score sorting and recommendation caps',()=>{
 const config=configured({filters:{groups:['motif'],material:true,price:true,photo:true}});
 config.ranking.cat_daily={...defaultRanking(),enabled:true,rules:[{id:'star-first',group:'motif',tag:'별',weight:50}]};
 const discovery={...emptyDiscovery(),tags:{motif:['별']},strict:true,min:'2500',max:'3500',cap:1};
 assert.deepEqual(ids(browseProducts(catalog,'cat_daily',config,{discovery})),['2']);assert.deepEqual(ids(browseProducts(catalog,'cat_daily',config,{material:'써지컬',discovery})),[]);
 assert.deepEqual(ids(browseProducts(catalog,'cat_daily',config,{query:'반지'})),[],'search never escapes custom category membership');
 assert.deepEqual(ids(browseProducts(catalog,'cat_daily',config,{favoritesOnly:true,favorites:['2','4']})),['2']);
});

test('hidden filter settings do not disable operator score rules and management notes never generate ranking rules',()=>{
 const config=configured({note:'하트 상품을 맨 앞으로',filters:{groups:[],material:false,price:false,photo:false}}),discovery={...emptyDiscovery(),tags:{motif:['하트']},strict:true,min:'999999',photoTone:{hue:10,grey:false}};
 assert.deepEqual(ids(browseProducts(catalog,'cat_daily',config,{material:'925 실버',discovery})),['1','2','3']);
 config.ranking.cat_daily={...defaultRanking(),enabled:true,rules:[{id:'star-first',group:'motif',tag:'별',weight:50}]};
 const ranked=browseProducts(catalog,'cat_daily',config,{discovery});assert.deepEqual(ids(ranked),['2','1','3']);assert.equal(ranked[0]._rank.baseScore,50);assert.equal(ranked[1]._rank.baseScore,0);
});

test('manual categories retain pin boundaries and excluded latent positions during reordering',()=>{
 const config=configured();config.tabs.cat_daily.pins=['2'];config.tabs.cat_daily.excluded=['1'];
 reorder(config,catalog,'cat_daily','3',0);assert.deepEqual(ids(resolveList(catalog,'cat_daily',config)),['2','3']);assert.deepEqual(config.tabs.cat_daily.pins,['2']);
 config.tabs.cat_daily.excluded=[];assert.deepEqual(ids(resolveList(catalog,'cat_daily',config)),['2','1','3']);
});

test('the complete snapshot preserves original IDs, photographs and legacy browse output with default categories',()=>{
 const raw=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url),'utf8')),products=normalizeCatalog(raw),before=clone(products),config=initialConfig(),legacy=clone(config);delete legacy.categories;
 for(const tab of TABS)assert.deepEqual(browseProducts(products,tab,config),browseProducts(products,tab,legacy));
 assert.equal(products.length,2379);assert.deepEqual(products,before);assert.deepEqual(config.categories.map(category=>category.id),TABS);assert.equal(categoryDefinitions(config).length,8);
});
