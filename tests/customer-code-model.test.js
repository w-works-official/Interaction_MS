import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {initialConfig,normalizeCustomerCode,validateConfig,migrateSavedConfig,normalizeCatalog,resolveList,clone} from '../dist/model.js';

const defaults={enabled:false,html:'',css:'',js:''};
const catalog=normalizeCatalog([{id:'1',name:'원본 피어싱',price:6100,categories:['피어싱'],materials:['써지컬'],tags:{style:['데일리']},images:['assets/one.jpg']},{id:'2',name:'원본 반지',price:12000,categories:['반지'],materials:['925 실버'],tags:{motif:['하트']},images:['assets/two.jpg']}]);
const valid={enabled:true,html:'<main><h1>상품 모음</h1><div data-product-list></div></main>',css:'main { color: #123456; }',js:'document.querySelector("main").dataset.ready = "yes";'};

test('customer code defaults are disabled, independent and added to legacy schema-1 data without changing saved behavior',()=>{
 const first=initialConfig(),second=initialConfig();assert.deepEqual(first.customerCode,defaults);first.customerCode.html='임시 입력';assert.deepEqual(second.customerCode,defaults);assert.deepEqual(normalizeCustomerCode(),defaults);
 const legacy=initialConfig();delete legacy.customerCode;legacy.tabs['추천'].pins=['2'];legacy.ranking['추천'].brief='보존할 운영 지시';legacy.productEdits={'1':{tags:{style:['심플']},note:'보존할 검토',reviewStatus:'reviewed'}};
 legacy.banners=[{id:'existing',type:'notice',title:'보존할 안내',after:0,tabs:['추천'],enabled:true}];
 const before=clone(legacy),expected=resolveList(catalog,'추천',legacy),validated=validateConfig(legacy,catalog),migrated=migrateSavedConfig(legacy,catalog);
 assert.deepEqual(validated.customerCode,defaults);assert.deepEqual(migrated.customerCode,defaults);assert.deepEqual(resolveList(catalog,'추천',migrated),expected);
 for(const key of ['categories','tabs','ranking','productEdits'])assert.deepEqual(migrated[key],before[key]);assert.equal(migrated.banners[0].title,'보존할 안내');assert.deepEqual(legacy,before);
});

test('partial plain records receive missing defaults while an explicit disabled design retains its exact source',()=>{
 assert.deepEqual(normalizeCustomerCode({}),defaults);assert.deepEqual(normalizeCustomerCode({html:'  '}),{...defaults,html:'  '});
 const input={enabled:false,html:'',css:'/* 검토 중 */\nmain {}',js:'throw new Error("실행하면 안 됨");'},before=structuredClone(input);
 const result=normalizeCustomerCode(input);assert.deepEqual(result,input);assert.notEqual(result,input);assert.deepEqual(input,before);
 assert.deepEqual(normalizeCustomerCode(Object.assign(Object.create(null),valid)),valid);
});

test('enabled customer code survives normalization, JSON round-trip and migration without executing HTML or JavaScript',()=>{
 const key='__pinkrocketCustomerCodeModelExecuted';delete globalThis[key];
 const code={...valid,html:`<main>검토 🙂</main><script>globalThis.${key} = true;</script>`,js:`globalThis.${key} = true;\nthrow new Error('저장만 해야 함');`};
 const config=initialConfig();config.customerCode=code;const before=clone(config),normalized=normalizeCustomerCode(code),validated=validateConfig(config,catalog),roundTrip=JSON.parse(JSON.stringify(validated)),migrated=migrateSavedConfig(roundTrip,catalog);
 assert.deepEqual(normalized,code);assert.deepEqual(validated.customerCode,code);assert.deepEqual(migrated.customerCode,code);assert.deepEqual(config,before);assert.equal(globalThis[key],undefined);
});

test('customer code rejects non-record values, unknown fields and invalid explicit field types',()=>{
 class CodeRecord{constructor(){this.enabled=false;this.html='';}}
 const symbol=Symbol('unknown'),hidden={...defaults};Object.defineProperty(hidden,'extra',{value:'not permitted'});
 for(const value of [null,false,'html',[],new Date(),new CodeRecord(),{...defaults,extra:'x'},{...defaults,[symbol]:'x'},hidden,
  {...defaults,enabled:1},{...defaults,enabled:'true'},{...defaults,enabled:undefined},
  ...['html','css','js'].flatMap(key=>[null,undefined,false,10,[],{}].map(value=>({...defaults,[key]:value})))]){
  assert.throws(()=>normalizeCustomerCode(value));
 }
});

test('validation rejects accessors and unsupported record prototypes before JSON cloning can erase or execute them',()=>{
 let reads=0;const accessor={...defaults};Object.defineProperty(accessor,'js',{enumerable:true,get(){reads++;return 'executed getter';}});
 assert.throws(()=>normalizeCustomerCode(accessor));assert.equal(reads,0);
 const config=initialConfig();config.customerCode=accessor;assert.throws(()=>validateConfig(config,catalog));assert.throws(()=>migrateSavedConfig(config,catalog));assert.equal(reads,0);
 const withUndefined={...defaults,html:undefined};config.customerCode=withUndefined;assert.throws(()=>validateConfig(config,catalog));assert.throws(()=>migrateSavedConfig(config,catalog));
 class CodeRecord{constructor(){Object.assign(this,defaults);}}
 config.customerCode=new CodeRecord();assert.throws(()=>validateConfig(config,catalog));assert.throws(()=>migrateSavedConfig(config,catalog));
});

test('NUL characters are rejected in every code field and enabled code requires nonblank HTML',()=>{
 for(const key of ['html','css','js'])assert.throws(()=>normalizeCustomerCode({...valid,[key]:'before\0after'}));
 for(const html of ['', ' \n\t\r ', '\u00a0\uFEFF'])assert.throws(()=>normalizeCustomerCode({...valid,html}),/HTML/);
 assert.deepEqual(normalizeCustomerCode({enabled:false,html:'',css:'',js:''}),defaults);assert.equal(normalizeCustomerCode({enabled:true,html:'상품'}).html,'상품');
});

test('HTML, CSS and JavaScript each accept their exact UTF-8 limit and reject one additional ASCII byte',()=>{
 for(const [key,limit] of [['html',200*1024],['css',100*1024],['js',200*1024]]){
  const text='x'.repeat(limit);assert.equal(Buffer.byteLength(text),limit);assert.equal(normalizeCustomerCode({...defaults,[key]:text})[key],text);
  assert.throws(()=>normalizeCustomerCode({...defaults,[key]:text+'x'}),/500KB/);
 }
});

test('Unicode byte limits count Korean, supplementary characters and lone surrogates as UTF-8 rather than string length',()=>{
 for(const [key,unit,bytes,limit] of [['html','한',3,200*1024],['css','🙂',4,100*1024],['js','\ud800',3,200*1024]]){
  const text=unit.repeat(Math.floor(limit/bytes))+'x'.repeat(limit%bytes);assert.equal(Buffer.byteLength(text,'utf8'),limit);assert.ok(text.length<limit);
  assert.equal(normalizeCustomerCode({...defaults,[key]:text})[key],text);assert.throws(()=>normalizeCustomerCode({...defaults,[key]:text+'x'}));
 }
});

test('the complete customer-code record accepts at most 500 KiB of source even when disabled',()=>{
 const maximum={enabled:false,html:'h'.repeat(200*1024),css:'c'.repeat(100*1024),js:'j'.repeat(200*1024)};
 assert.equal(Buffer.byteLength(maximum.html+maximum.css+maximum.js),500*1024);assert.deepEqual(normalizeCustomerCode(maximum),maximum);
 for(const key of ['html','css','js'])assert.throws(()=>normalizeCustomerCode({...maximum,[key]:maximum[key]+'x'}));
});

test('customer code changes preserve the complete source catalog, IDs, photographs and independent operating configuration',()=>{
 const raw=JSON.parse(fs.readFileSync(new URL('../dist/assets/catalog.json',import.meta.url),'utf8')),products=normalizeCatalog(raw),sourceBefore=clone(products),config=initialConfig();
 config.tabs['추천'].pins=[products[0].id];config.ranking['추천'].brief='기존 규칙을 보존';const before=clone(config);config.customerCode={...valid};
 const validated=validateConfig(config,products),{customerCode,...rest}=validated;
 const normalizedBefore=validateConfig(before,products);delete normalizedBefore.customerCode;
 assert.deepEqual(rest,normalizedBefore);assert.deepEqual(customerCode,valid);assert.equal(products.length,2379);assert.deepEqual(products,sourceBefore);assert.deepEqual(validated.tabs['추천'].pins,[products[0].id]);
});
