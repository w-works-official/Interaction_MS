import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';
import {STOREFRONT_CONFIG,STOREFRONT_CATEGORIES} from '../dist/storefront.js';

const root=fileURLToPath(new URL('../',import.meta.url)),localOriginal='C:/2026_Work/Makeshop/반응형';
const hasOriginal=fs.existsSync(localOriginal),sourceDir=hasOriginal?localOriginal:path.join(root,'integration-responsive/source-utf8');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'pinkrocket-responsive-'));
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const read=(directory,file)=>fs.readFileSync(path.join(directory,file),'utf8');
const sourceFiles=['common.css','common.js','header.1.html','header.1.css','header.1.js','footer.1.html','footer.1.css','footer.1.js','main.html','main.css','main.js','shopbrand.html','shopbrand.css','shopbrand.js'].sort();
const originalHashes=Object.fromEntries(sourceFiles.map(file=>[file,digest(fs.readFileSync(path.join(sourceDir,file)))]));
function python(args){const result=spawnSync('python',['-B','-X','utf8',...args],{cwd:root,encoding:'utf8'});assert.equal(result.status,0,result.stderr||result.stdout);return result.stdout;}
const output=path.join(temporary,'native');
python(['integration-responsive/build.py','--source-dir',sourceDir,'--output-dir',output]);
const apply=path.join(output,'apply'),snapshots=path.join(output,'source-utf8'),manifest=JSON.parse(read(output,'SOURCE_MANIFEST.json'));
after(()=>{assert.equal(path.dirname(temporary),os.tmpdir());assert.ok(path.basename(temporary).startsWith('pinkrocket-responsive-'));fs.rmSync(temporary,{recursive:true,force:true});});

function boot({width=1280,viewport='',platform='pc',menu}={}){
 const header=read(apply,'header.1.html').replaceAll('<!--/link_home/-->','/shop/main.html')
  .replace('<!--/form_search/-->','<form id="native-search" action="/shop/shopbrand.html">')
  .replace('<!--/input_search_word(search_auto_completion)/-->','<input name="search" value="before">')
  .replace('<!--/end_form/-->','</form>');
 const dom=new JSDOM(`<!doctype html><head>${viewport}</head><body>${header}${read(apply,'main.html')}${read(apply,'footer.1.html')}</body>`,{url:'https://www.pink-rocket.com/shop/main.html',runScripts:'outside-only'});
 const w=dom.window;Object.defineProperty(w,'innerWidth',{value:width,writable:true});
 let network=0;w.fetch=()=>{network++;throw Error('No account fetch in the native content adapter');};w.XMLHttpRequest=function(){network++;throw Error('No account XHR in the native content adapter');};
 let common=read(apply,'common.js'),firstOriginal=read(snapshots,'common.js').split('\n')[0];
 common=common.slice(0,common.indexOf(firstOriginal));
 if(menu)common=common.replace('const platform = "pc";',`STOREFRONT_CONFIG.menu=${JSON.stringify(menu)};\nconst platform = "pc";`);
 if(platform==='mobile')common=common.replace('const platform = "pc";','const platform = "mobile";');
 w.eval(common);w.PRStorefrontNative.apply();
 return {w,d:w.document,network:()=>network,close:()=>w.close()};
}

test('the native package preserves all 14 original byte hashes and records separate UTF-8/apply hashes',()=>{
 assert.equal(manifest.files.length,14);assert.equal(manifest.nativePlatform,'pc');
 assert.deepEqual(fs.readdirSync(apply).sort(),sourceFiles);assert.deepEqual(fs.readdirSync(snapshots).sort(),sourceFiles);
 for(const entry of manifest.files){
  assert.equal(hasOriginal?entry.originalSha256:entry.snapshotSha256,originalHashes[entry.file]);
  assert.equal(digest(fs.readFileSync(path.join(sourceDir,entry.file))),originalHashes[entry.file]);
  assert.equal(entry.snapshotSha256,digest(fs.readFileSync(path.join(output,entry.snapshot))));
  assert.equal(entry.applySha256,digest(fs.readFileSync(path.join(output,entry.apply))));
  assert.ok(['cp949','utf-8'].includes(entry.sourceEncoding));
  assert.ok(!read(apply,entry.file).includes('\uFFFD'));assert.ok(!read(apply,entry.file).includes('\r'));
 }
 assert.ok(!fs.existsSync(path.join(output,'OPTIONAL_MAIN_IFRAME.txt')));
});

test('native product, price, soldout, include and company/account virtual tags survive content consolidation',()=>{
 const macros=text=>text.match(/<!--\/[\s\S]*?\/-->/g)||[];
 assert.deepEqual(macros(read(apply,'main.html')),macros(read(snapshots,'main.html')));
 for(const file of ['main.html','shopbrand.html'])for(const tag of ['<!--/include_header(1)/-->','<!--/include_footer(1)/-->'])assert.ok(read(apply,file).includes(tag));
 for(const tag of ['<!--/loop_product_list(40)/-->','<!--/number/product_list@price_sell/-->','<!--/if_product_list@is_soldout/-->','<!--/select_sort/-->'])assert.ok(read(apply,'shopbrand.html').includes(tag),tag);
 for(const tag of ['<!--/company_name/-->','<!--/company_number/-->','<!--/company_addr/-->','<!--/loop_shop_cs/-->','<!--/loop_shop_account/-->','<!--/link_privacy/-->'])assert.ok(read(apply,'footer.1.html').includes(tag));
 assert.ok(read(apply,'header.1.html').includes('<!--/form_search/-->'));
 assert.ok(read(apply,'header.1.html').includes('<!--/link_login/-->'));
 assert.equal(read(apply,'shopbrand.html').match(/<!--\/select_sort\/-->/g).length,1);
 assert.ok(!read(apply,'shopbrand.html').includes('class="only-pc"'));
});

test('one shared configuration renders the same brand/menu and one image per banner at both widths',()=>{
 for(const width of [390,1280]){const h=boot({width});try{
  assert.equal(h.d.querySelectorAll('#header .logo a').length,1);
  assert.equal(h.d.querySelector('#header .logo').textContent,STOREFRONT_CONFIG.brand.name);
  const top=[...h.d.querySelectorAll('[data-storefront-menu="desktop"] a')].map(a=>({id:a.dataset.storefrontCategory,label:a.textContent,href:a.getAttribute('href')}));
  assert.deepEqual(top.map(item=>item.id),STOREFRONT_CATEGORIES.map(item=>item.id));
  for(const item of top){const side=h.d.querySelector(`[data-storefront-menu="side"] a[data-storefront-category="${item.id}"]`);assert.ok(side);assert.equal(side.textContent.replace(/\s+/g,''),item.label.replace(/\s+/g,''));assert.equal(side.getAttribute('href'),item.href);}
  assert.equal(h.d.querySelectorAll('#mainBnr').length,1);assert.equal(h.d.querySelectorAll('#cateSwiper').length,1);
  assert.equal(h.d.querySelectorAll('#mainBnr .swiper-slide img').length,4);assert.equal(h.d.querySelectorAll('#mainBnr picture').length,0);
  assert.ok(!h.d.querySelector('#mainBnr').innerHTML.includes('m_main_slide'));
  assert.equal(h.network(),0);
 }finally{h.close();}}
});

test('native side menus retain all supplied category, subcategory and board destinations',()=>{
 const original=new JSDOM(read(snapshots,'header.1.html'));
 const urls=[...original.window.document.querySelectorAll('#aside .navCategory a')].map(a=>a.getAttribute('href')).filter(href=>/^\/(?:shop|board)\//.test(href));
 const canonical=href=>{const url=new URL(href,'https://www.pink-rocket.com');return url.pathname+'?'+url.searchParams.toString();};
 const h=boot();try{
  const actual=new Set([...h.d.querySelectorAll('[data-storefront-menu="side"] a')].map(a=>canonical(a.getAttribute('href'))));
  for(const href of urls)assert.ok(actual.has(canonical(href)),`Original native destination missing: ${href}`);
  const parent=h.d.querySelector('[data-storefront-menu="side"] a.shop[data-storefront-category="피어싱"]');assert.ok(parent?.querySelector('.toggle_state'));assert.ok(parent.nextElementSibling?.matches('ul'));
 }finally{original.window.close();h.close();}
});

test('common menu label, order and destination edits reach native top, side and tiles',()=>{
 const menu=STOREFRONT_CONFIG.menu.map(item=>({...item})).reverse();
 Object.assign(menu.find(item=>item.id==='귀걸이'),{label:'변경한 귀걸이 이름',href:'/shop/shopbrand.html?type=X&xcode=019&test=changed'});
 const h=boot({menu});try{
  const expected=menu.map(item=>item.id),ids=nodes=>[...nodes].map(node=>node.dataset.storefrontCategory);
  const top=h.d.querySelectorAll('[data-storefront-menu="desktop"] a');
  const side=h.d.querySelectorAll('[data-storefront-menu="side"]>nav>ul>li>a');
  const tiles=h.d.querySelectorAll('#cateSwiper a');
  assert.deepEqual(ids(top),expected);assert.deepEqual(ids(side).filter(id=>expected.includes(id)),expected);assert.deepEqual(ids(tiles),expected);
  for(const selector of ['[data-storefront-menu="desktop"]','[data-storefront-menu="side"]','#cateSwiper']){
   const link=h.d.querySelector(`${selector} a[data-storefront-category="귀걸이"]`);
   assert.ok(link.textContent.includes('변경한 귀걸이 이름'));assert.equal(link.getAttribute('href'),menu.find(item=>item.id==='귀걸이').href);
  }
  assert.equal(h.d.querySelectorAll('[data-storefront-menu="side"]>nav>ul>li>a[data-storefront-category="신상"]').length,1);
 }finally{h.close();}
});

test('disabled common categories stay hidden even when native supplements reference them',()=>{
 const hidden=new Set(['신상','피어싱']),menu=STOREFRONT_CONFIG.menu.map(item=>({...item,enabled:!hidden.has(item.id)}));
 const h=boot({menu});try{
  for(const id of hidden)assert.equal(h.d.querySelectorAll(`a[data-storefront-category="${id}"]`).length,0,`Hidden category leaked through a native reference: ${id}`);
  assert.equal(h.d.querySelectorAll('[data-storefront-menu="desktop"] a').length,6);assert.equal(h.d.querySelectorAll('#cateSwiper a').length,6);
  assert.equal(h.d.querySelectorAll('[data-storefront-menu="side"] a.shop').length,0);
  for(const id of ['best','new-member','parts','other','event','qna','faq','notice'])assert.ok(h.d.querySelector(`[data-storefront-menu="side"] a[data-storefront-category="${id}"]`),`Unrelated native destination lost: ${id}`);
 }finally{h.close();}
});

test('repeated native apply keeps one live search form and stable hero/menu nodes',()=>{
 const h=boot({viewport:'<meta name="viewport" content="width=1024">'});try{
  const form=h.d.querySelector('#native-search'),input=form.querySelector('input'),hero=h.d.querySelector('#mainBnr');input.value='edited in one form';
  for(let i=0;i<4;i++)h.w.PRStorefrontNative.apply();
  assert.equal(h.d.querySelectorAll('#native-search').length,1);assert.equal(h.d.querySelector('#native-search'),form);assert.equal(input.value,'edited in one form');
  assert.equal(h.d.querySelector('#mainBnr'),hero);assert.equal(h.d.querySelectorAll('#mainBnr').length,1);
  assert.equal(h.d.querySelectorAll('meta[name="viewport"]').length,1);assert.equal(h.d.querySelector('meta[name="viewport"]').content,'width=device-width,initial-scale=1');
  assert.ok(!read(apply,'header.1.js').includes('savedSearchHtml'));assert.ok(!read(apply,'header.1.js').includes('.searchBox'));
  assert.equal(h.d.querySelectorAll('.search-toggle').length,1);assert.equal(h.d.querySelectorAll('.scroll_bt_tll .-top_sc').length,1);
 }finally{h.close();}
});

test('native basket fallback follows an explicit route, never screen width',()=>{
 for(const [width,platform,expected] of [[390,'pc','/shop/basket.html'],[1280,'mobile','/m/basket.html']]){
  const h=boot({width,platform});try{assert.equal(h.d.querySelector('[data-native-basket]').getAttribute('href'),expected);assert.equal(h.d.documentElement.dataset.nativePlatform,platform);}finally{h.close();}
 }
 const h=boot();try{const link=h.d.querySelector('[data-native-basket]');link.href='/verified/native/basket';h.w.PRStorefrontNative.apply();assert.equal(link.getAttribute('href'),'/verified/native/basket');}finally{h.close();}
});

test('gallery collector outputs only inert ID/URL attributes and declares its limited main coverage',()=>{
 const collector=read(path.join(root,'integration-responsive'),'GALLERY_MAIN_COLLECTOR.html'),dom=new JSDOM(collector);
 const template=dom.window.document.querySelector('template');assert.ok(template);
 assert.equal(template.dataset.coverage,'main-new-special-best-only');
 assert.equal(template.content.querySelectorAll('[data-product-images-id]').length,3);
 assert.equal(template.content.querySelectorAll('img,iframe,script,link,video,audio,source,[src],[srcset],[style]').length,0);
 assert.equal(collector.match(/loop_(?:new|special|best)_product@list_photo_gallery/g).length,3);
 assert.ok(!collector.includes('multi_image_list'));assert.ok(!collector.includes('loop_add'));
 assert.ok(read(path.join(root,'integration-responsive'),'README_KO.md').includes('전체 2,379개 상품 수집이 아닙니다'));
 dom.window.close();
});

test('regeneration is deterministic and never changes the original skin',()=>{
 const before=read(output,'SOURCE_MANIFEST.json');
 python(['integration-responsive/build.py','--source-dir',sourceDir,'--output-dir',output]);
 assert.equal(read(output,'SOURCE_MANIFEST.json'),before);
 for(const entry of manifest.files)assert.equal(digest(fs.readFileSync(path.join(sourceDir,entry.file))),originalHashes[entry.file]);
});

test('checked-in native paste files match the current shared module, styles and generator',()=>{
 const checkedIn=path.join(root,'integration-responsive');
 assert.equal(read(checkedIn,'SOURCE_MANIFEST.json'),read(output,'SOURCE_MANIFEST.json'),'Regenerate the native package after shared source changes');
 assert.equal(manifest.sharedStorefrontSha256,digest(fs.readFileSync(path.join(root,'dist/storefront.js'))));
 assert.equal(manifest.sharedStylesSha256,digest(fs.readFileSync(path.join(root,'dist/storefront.css'))));
 for(const file of sourceFiles){
  assert.equal(read(path.join(checkedIn,'apply'),file),read(apply,file),`Stale apply/${file}`);
  assert.equal(read(path.join(checkedIn,'source-utf8'),file),read(snapshots,file),`Changed source-utf8/${file}`);
 }
});

test('the verified UTF-8 snapshots regenerate the same package without private Windows originals',()=>{
 const portable=path.join(temporary,'portable');
 python(['integration-responsive/build.py','--source-dir',path.join(root,'integration-responsive/source-utf8'),'--output-dir',portable]);
 assert.equal(read(portable,'SOURCE_MANIFEST.json'),read(output,'SOURCE_MANIFEST.json'));
 for(const file of sourceFiles)assert.equal(read(path.join(portable,'apply'),file),read(apply,file));
});

test('the shared bridge renderer retains default artifacts and explicitly validates new HTTPS asset roots',()=>{
 const result=JSON.parse(python(['-c',`import json,runpy
b=runpy.run_path('integration-main/build.py')
good='https://preview.example.test/store/'
bad=['http://preview.example.test/','https://user:pass@preview.example.test/','https://preview.example.test/?x=1','https://preview.example.test/#x','https://preview.example.test','https://preview.example.test/store','https://preview.example.test/../','https://preview.example.test:444/','https://bad<host/','https://preview.example.test/\\\\evil/']
rejected=[]
for url in bad:
 try:b['validate_frontend_url'](url)
 except ValueError:rejected.append(url)
print(json.dumps({'pc':b['render_shell']('pc'),'mobile':b['render_shell']('mobile'),'custom':b['render_shell']('pc',good),'rejected':rejected,'bad':bad}))` ]));
 assert.equal(result.pc,read(path.join(root,'integration-main'),'01_MAIN_IFRAME_PC.txt'));
 assert.equal(result.mobile,read(path.join(root,'integration-main'),'02_MAIN_IFRAME_MOBILE.txt'));
 assert.deepEqual(result.rejected,result.bad);
 assert.ok(result.custom.includes('new URL("https://preview.example.test/store/")'));
 assert.ok(!result.custom.includes('new URL(\'https://w-works-official.github.io/Interaction_MS/\')'));
 for(const marker of ['DETAIL_URL_HELPER_PLACEHOLDER','DETAIL_VIEW_CSS_PLACEHOLDER','PRODUCT_WISHLIST_ADAPTER_PLACEHOLDER'])assert.ok(!result.custom.includes(marker));
});

test('an explicit optional iframe reuses the shared bridge and never replaces the native package',()=>{
 const custom=path.join(temporary,'custom');python(['integration-responsive/build.py','--source-dir',sourceDir,'--output-dir',custom,'--frontend-url','https://preview.example.test/store/']);
 const html=read(custom,'OPTIONAL_MAIN_IFRAME.txt');assert.ok(html.includes('new URL("https://preview.example.test/store/")'));
 assert.ok(html.includes('function makeshopDetailUrl('));assert.ok(html.includes('function createProductWishlistAdapter('));
 assert.equal(html.match(/function makeshopDetailUrl\(/g).length,1);assert.equal(html.match(/function createProductWishlistAdapter\(/g).length,1);
 assert.equal(fs.readdirSync(path.join(custom,'apply')).length,14);assert.ok(read(path.join(custom,'apply'),'main.html').includes('<!--/loop_new_product(80)/-->'));
});
