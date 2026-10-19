import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialConfig,normalizeCatalog,resolveList,reorder,togglePin,autoArrange,composeFeed,filterList,validateConfig,validDetail,makeshopDetailUrl,removeStarterBanners,migrateSavedConfig} from '../dist/model.js';
const withBanners=()=>({...initialConfig(),banners:[{id:'custom-edit',type:'editorial',title:'Edit',subtitle:'Description',after:6,span:2,tabs:['추천'],enabled:true,tone:'ink',image:'',link:''},{id:'custom-notice',type:'notice',title:'Notice',subtitle:'Description',after:12,span:1,tabs:['추천'],enabled:true,tone:'cream',image:'',link:''}]});
const rawCatalog=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url)));
const data=normalizeCatalog(rawCatalog);
test('Makeshop detail URLs follow the approved PC and mobile rules by product ID',()=>{
 assert.equal(makeshopDetailUrl('2085889'),'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085889');
 assert.equal(makeshopDetailUrl('2085889','pc'),'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085889');
 assert.equal(makeshopDetailUrl(2085889,'mobile'),'https://www.pink-rocket.com/m/product.html?branduid=2085889');
});
test('detail URL construction rejects malformed IDs and unsupported platforms',()=>{
 for(const id of [undefined,null,'',0,'0',-1,'-1',1.5,'1.5',NaN,Infinity,Number.MAX_SAFE_INTEGER+1,true,{},[],['2085889'],' 2085889','2085889 ','2085889\n','2085889\r\n','02085889','2e6','2085889&x=1','2085889#x','2085889/other','https://evil.example'])assert.equal(makeshopDetailUrl(id),null);
 for(const platform of ['desktop','m','PC','',null,{},0])assert.equal(makeshopDetailUrl('2085889',platform),null);
});
test('catalog derives details from IDs when legacy URLs are missing, stale or untrusted',()=>{
 const product={id:2085889,name:'Legacy product',price:1000,images:[],customField:'retained'};
 for(const legacyUrl of [undefined,null,'https://www.pink-rocket.com/shop/shopdetail.html?branduid=1','https://pink-rocket.com/m/product.html?branduid=2085889','https://evil.example/shop/shopdetail.html?branduid=2085889']){
  const input={...product,...(legacyUrl===undefined?{}:{detailUrl:legacyUrl})},before=structuredClone(input);
  for(const wrapped of [[input],{products:[input]},{items:[input]}]){
   const [result]=normalizeCatalog(wrapped);
   assert.equal(result.id,'2085889');assert.equal(result.detailUrl,'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085889');assert.equal(result.customField,'retained');
  }
  assert.deepEqual(input,before);
 }
 assert.equal(normalizeCatalog([{...product,id:'not-a-product',detailUrl:'https://www.pink-rocket.com/shop/shopdetail.html?branduid=2085889'}])[0].detailUrl,null);
});
test('all 2379 catalog links match the former per-product PC URLs without storing them',()=>{
 assert.equal(rawCatalog.length,2379);assert.equal(data.length,rawCatalog.length);
 rawCatalog.forEach((raw,index)=>{
  assert.equal(Object.hasOwn(raw,'detailUrl'),false);
  assert.equal(data[index].id,raw.id);
  assert.equal(data[index].detailUrl,'https://www.pink-rocket.com/shop/shopdetail.html?branduid='+raw.id);
  assert.equal(makeshopDetailUrl(raw.id,'mobile'),'https://www.pink-rocket.com/m/product.html?branduid='+raw.id);
 });
});
test('actual product snapshot has valid images, distinct IDs and approved detail links',()=>{
 assert.equal(data.length,2379);assert.equal(new Set(data.map(p=>p.id)).size,2379);
 for(const p of data){assert.ok(p.price>0);assert.ok(validDetail(p.detailUrl));for(const image of p.images){if(image.startsWith('assets/'))assert.ok(fs.existsSync(new URL('../dist/'+image,import.meta.url)));else assert.match(image,/^https:\/\/www\.pink-rocket\.com\/shopimages\/curiouswiz\/[\w.%-]+$/);}}
 assert.ok(data.filter(p=>p.images.length>=3).length>=4);
});
test('manual changes never modify the published snapshot',()=>{
 const published=initialConfig(),draft=structuredClone(published),before=JSON.stringify(published);
 reorder(draft,data,'추천',data[3].id,0);togglePin(draft,'추천',data[2].id);
 assert.equal(JSON.stringify(published),before);assert.notEqual(JSON.stringify(draft),before);
});
test('sort without manual changes affects the entire product pool',()=>{
 const c=initialConfig();autoArrange(c,'추천','priceAsc');const rows=resolveList(data,'추천',c);
 assert.equal(rows.length,data.length);assert.ok(rows.every((p,i)=>i===0||rows[i-1].price<=p.price));
});
test('manual order, pin, exclusions survive changing automatic sort',()=>{
 const c=initialConfig();reorder(c,data,'추천',data[4].id,0);togglePin(c,'추천',data[2].id);
 c.tabs['추천'].excluded.push(data[1].id);autoArrange(c,'추천','priceAsc');
 const result=resolveList(data,'추천',c);
 assert.equal(result[0].id,data[2].id);assert.equal(result[1].id,data[4].id);assert.ok(!result.some(p=>p.id===data[1].id));
 assert.equal(new Set(result.map(p=>p.id)).size,result.length);
});
test('new catalog entries append without losing manually ordered positions',()=>{
 const c=initialConfig();reorder(c,data,'추천',data[4].id,0);
 const added={...data[0],id:'new-fixture',newOrder:-1,score:9999};
 const out=resolveList([...data,added],'추천',c);assert.equal(out[0].id,data[4].id);assert.equal(out.at(-1).id,'new-fixture');
});
test('reset manual order keeps pinned and excluded products',()=>{
 const c=initialConfig();reorder(c,data,'추천',data[4].id,0);togglePin(c,'추천',data[2].id);c.tabs['추천'].excluded.push(data[1].id);
 autoArrange(c,'추천','priceAsc',true);const out=resolveList(data,'추천',c);
 assert.equal(out[0].id,data[2].id);assert.ok(!out.some(p=>p.id===data[1].id));assert.ok(out.slice(1).every((p,i,a)=>i===0||a[i-1].price<=p.price));
});
test('category, material, search and favorite selection compose correctly',()=>{
 const c=initialConfig(),rings=resolveList(data,'반지',c);assert.equal(rings.length,79);assert.ok(rings.every(p=>p.category==='반지'));
 assert.equal(filterList(data,{query:data[0].id}).length,1);
 assert.equal(filterList(data,{favoritesOnly:true,favorites:[data[0].id]}).length,1);
 assert.ok(filterList(data,{material:'써지컬'}).every(p=>p.materials.includes('써지컬')));
 assert.equal(filterList(data,{query:'no-matching-fixture'}).length,0);
});
test('banner positions count products instead of other inserted banners',()=>{
 const c=withBanners();const feed=composeFeed(data,c.banners,'추천');const first=feed.findIndex(b=>b.kind==='banner');
 assert.equal(feed.slice(0,first).filter(b=>b.kind==='product').length,6);
 const second=feed.findIndex(b=>b.kind==='banner'&&b.data.type==='notice');assert.equal(feed.slice(0,second).filter(b=>b.kind==='product').length,12);
 const short=composeFeed(data.slice(0,2),c.banners,'추천');assert.equal(short.filter(b=>b.kind==='banner').length,2);
 assert.equal(composeFeed(data,c.banners,'헤어').filter(b=>b.kind==='banner').length,0);
});
test('import rejects executable URLs, malformed IDs and invalid positions',()=>{
 for(const mutation of [c=>c.banners[0].link='javascript:alert(1)',c=>c.banners[0].image='javascript:alert(1)',c=>c.tabs['추천'].pins=['not-in-catalog'],c=>c.banners[0].after=-1,c=>c.banners[0].tabs=['unknown'],c=>c.banners.push(structuredClone(c.banners[0]))]){
  const c=withBanners();mutation(c);assert.throws(()=>validateConfig(c,data));
 }
 assert.deepEqual(validateConfig(initialConfig(),data),initialConfig());
 assert.equal(validDetail('https://evil.example/shop/shopdetail.html?branduid=1'),false);
});

test('new and previously saved customer configs have no starter editorial banners',()=>{
 assert.equal(initialConfig().banners.length,0);
 const c=withBanners();c.banners.push({...c.banners[0],id:'edit-01'},{...c.banners[1],id:'notice-01'});
 assert.deepEqual(removeStarterBanners(c).banners.map(b=>b.id),['custom-edit','custom-notice']);
});

test('source import keeps valid records and quarantines missing names and prices',()=>{
 const meta=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog-meta.json',import.meta.url)));
 const excluded=JSON.parse(fs.readFileSync(new URL('../scripts/catalog-excluded.json',import.meta.url)));
 assert.equal(meta.totalSource,2449);assert.equal(meta.accepted+excluded.length,2449);assert.equal(excluded.length,70);
 const ids=new Set(data.map(p=>p.id));assert.ok(excluded.every(p=>!ids.has(p.id)));
 assert.ok(data.every(p=>p.name!=='(상품명 없음)'&&p.price>0&&p.stockStatus==='unknown'));
 assert.equal(data.filter(p=>p.classificationSource==='unclassified').length,38);
});
test('snapshot tags support overlapping categories, materials and tag searches',()=>{
 const p=data.find(p=>p.categories.includes('피어싱')&&p.categories.includes('귀걸이'));
 assert.ok(p);const c=initialConfig();for(const tab of ['피어싱','귀걸이'])assert.ok(resolveList(data,tab,c).some(x=>x.id===p.id));
 const multi=data.find(p=>p.materials.includes('써지컬')&&p.materials.includes('큐빅'));assert.ok(multi);
 for(const material of multi.materials)assert.equal(filterList([multi],{material}).length,1);
 assert.ok(resolveList(data,'팔찌',c).length===42);
 assert.equal(filterList([multi],{query:'큐빅'}).length,1);
});
test('saved curation gains the new tab and retains valid settings across catalog updates',()=>{
 const old=initialConfig();delete old.tabs['팔찌'];old.tabs['추천'].pins=['2085891','16'];old.tabs['추천'].manual=['2085889'];old.tabs['추천'].excluded=['2085879'];
 const current=migrateSavedConfig(old,data);
 assert.deepEqual(current.tabs['추천'].pins,['2085891']);assert.deepEqual(current.tabs['추천'].manual,['2085889']);assert.deepEqual(current.tabs['추천'].excluded,['2085879']);
 assert.ok(current.tabs['팔찌']);assert.equal(old.tabs['추천'].pins.length,2);assert.equal(old.tabs['팔찌'],undefined);
});

test('gallery origin always wins over drag distance; outside-photo gestures switch tabs',async()=>{
 const {swipeThresholds,swipeIntent}=await import('../dist/model.js');
 for(const width of [150,200,320,600]){
  const {photo}=swipeThresholds(width);
  assert.equal(swipeIntent(photo-1,0,{gallery:true,width,count:3}),'none');
  for(const dx of [photo+1,width,width*3,-width*3]){
   assert.equal(swipeIntent(dx,0,{gallery:true,width,count:3}),'photo');
   assert.equal(swipeIntent(dx,0,{gallery:true,width,count:1}),'none');
  }
  assert.equal(swipeIntent(width,width,{gallery:true,width,count:3}),'none');
  assert.equal(swipeIntent(100,0,{gallery:false,width,count:3}),'tab');
 }
});
test('tag ranking uses weighted group matches, OR within groups, strict AND across groups and stable ties',async()=>{
 const {emptyDiscovery,discoverProducts}=await import('../dist/model.js');
 const products=[{id:'plain',price:500,tags:{}},{id:'heart',price:700,tags:{motif:['하트'],material:['써지컬스틸']}},{id:'star',price:900,tags:{motif:['별'],material:['써지컬스틸']}},{id:'type',price:1000,tags:{item:['피어싱'],material:['925실버']}}];
 const d=emptyDiscovery();d.tags={motif:['하트','별'],material:['써지컬스틸'],item:['피어싱']};
 assert.deepEqual(discoverProducts(products,d).map(p=>p.id),['heart','star','type','plain']);
 delete d.tags.item;d.strict=true;assert.deepEqual(discoverProducts(products,d).map(p=>p.id),['heart','star']);
 d.min='800';d.max='950';assert.deepEqual(discoverProducts(products,d).map(p=>p.id),['star']);
 d.min='1000';d.max='500';assert.deepEqual(discoverProducts(products,d),[]);
});
test('photo color ranking and recommendation caps stay deterministic and do not fabricate product data',async()=>{
 const {emptyDiscovery,discoverProducts}=await import('../dist/model.js');
 const products=[{id:'blue',price:10,colors:['0000ff']},{id:'red',price:20,colors:['ff0000']},{id:'grey',price:30,colors:['eeeeee']}];
 const before=JSON.stringify(products),d=emptyDiscovery();d.photoTone={grey:false,hue:359};d.cap=2;
 assert.equal(discoverProducts(products,d)[0].id,'red');assert.equal(discoverProducts(products,d).length,2);
 d.photoTone={grey:true,hue:0};assert.equal(discoverProducts(products,d)[0].id,'grey');
 assert.deepEqual(discoverProducts(products,d,{sort:'priceAsc'}).map(p=>p.id),['blue','red']);assert.equal(JSON.stringify(products),before);
});
