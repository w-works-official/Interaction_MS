import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {STOREFRONT_CONFIG,STOREFRONT_CATEGORIES,storefrontCategories,renderStorefrontBrand,renderStorefrontMenu,renderStorefrontHero,renderStorefrontCategoryTiles,renderStorefrontFooter} from '../dist/storefront.js';

function documentFor(html){return new JSDOM(html).window.document;}

test('one shared setting retains four original banners and defaults to one image for all viewport widths',()=>{
 assert.equal(STOREFRONT_CONFIG.brand.name,'PINKROCKET');assert.equal(STOREFRONT_CONFIG.heroBanners.length,4);
 for(const [index,banner]of STOREFRONT_CONFIG.heroBanners.entries()){
  assert.equal(banner.image,`https://skin.makeshop.co.kr/skin/enough/images/main_slide${index+1}.png`);
  assert.equal(Object.hasOwn(banner,'mobileImage'),false);assert.equal(banner.href,'#main-content');assert.equal(banner.eyebrow,'People & Life');assert.equal(banner.title,'Where we play and perform');
 }
 const d=documentFor(renderStorefrontHero());assert.equal(d.querySelectorAll('.swiper-wrapper>.swiper-slide').length,4);assert.equal(d.querySelectorAll('img').length,4);assert.equal(d.querySelectorAll('picture,source').length,0);
 assert.equal(d.querySelector('img').getAttribute('loading'),'eager');assert.ok([...d.querySelectorAll('img')].every(image=>image.draggable===false));assert.ok([...d.querySelectorAll('.swiper-slide>a')].every(link=>link.getAttribute('href')==='#main-content'));
 assert.deepEqual([...d.querySelectorAll('[data-action="storefront-hero"]')].map(button=>button.dataset.index),['0','1','2','3']);assert.equal(d.querySelector('[aria-pressed=true]').dataset.index,'0');
});

test('an optional mobile asset uses picture within the same banner record and supports a native content anchor',()=>{
 const config={...STOREFRONT_CONFIG,heroBanners:[{id:'one',image:'https://images.example/common.png',mobileImage:'https://images.example/narrow.png',title:'공통 배너',href:'#main-content',crop:'50% 35%'}]};
 const before=structuredClone(config),d=documentFor(renderStorefrontHero(config,{mainAnchor:'#contentWrapper',activeIndex:90}));
 assert.equal(d.querySelectorAll('.swiper-slide').length,1);assert.equal(d.querySelectorAll('img').length,1);assert.equal(d.querySelectorAll('source').length,1);assert.equal(d.querySelector('source').getAttribute('media'),'(max-width:1024px)');
 assert.equal(d.querySelector('source').getAttribute('srcset'),'https://images.example/narrow.png');assert.equal(d.querySelector('img').getAttribute('src'),'https://images.example/common.png');assert.match(d.querySelector('img').getAttribute('style'),/50% 35%/);assert.equal(d.querySelector('.swiper-slide>a').getAttribute('href'),'#contentWrapper');assert.deepEqual(config,before);
});

test('the app menu preserves supplied category IDs labels and order while native links use the same settings',()=>{
 const categories=[{id:'반지',label:'내가 정한 반지 이름'},{id:'cat_daily',label:'새 모음'},{id:'신상',label:'새 상품'},{id:'헤어',label:'숨긴 항목',enabled:false}];
 const before=structuredClone(categories),d=documentFor(renderStorefrontMenu(categories,{activeId:'cat_daily'}));
 assert.ok(d.querySelector('nav.category-tabs[data-tab-swipe]'));assert.deepEqual([...d.querySelectorAll('[data-tab]')].map(button=>[button.dataset.tab,button.textContent]),[['반지','내가 정한 반지 이름'],['cat_daily','새 모음'],['신상','새 상품']]);assert.equal(d.querySelector('[aria-current=page]').dataset.tab,'cat_daily');assert.ok([...d.querySelectorAll('button')].every(button=>button.dataset.action==='tab'));
 const native=documentFor(renderStorefrontMenu(categories,{native:true,activeId:'반지'}));assert.equal(native.querySelector('nav'),null);assert.equal(native.querySelector('button'),null);assert.equal(native.querySelector('a[data-storefront-category="반지"]').getAttribute('href'),'/shop/shopbrand.html?type=X&xcode=010');assert.equal(native.querySelector('a[data-storefront-category="cat_daily"]').getAttribute('href'),'#main-content');assert.deepEqual(categories,before);
 assert.deepEqual(storefrontCategories().map(category=>category.id),STOREFRONT_CATEGORIES.map(category=>category.id));assert.equal(renderStorefrontMenu([],{}).includes('<button'),false);
});

test('category tiles share category state and use only configured images without inventing sample promotions',()=>{
 const categories=[{id:'피어싱',label:'피어싱'},{id:'cat_no_image',label:'내 모음'}],d=documentFor(renderStorefrontCategoryTiles(categories,{activeId:'피어싱'}));
 assert.equal(d.querySelectorAll('[data-action="tab"]').length,2);assert.equal(d.querySelectorAll('img').length,1);assert.equal(d.querySelector('img').getAttribute('src'),STOREFRONT_CONFIG.categoryTiles[0].image);assert.equal(d.querySelector('[aria-pressed=true]').dataset.tab,'피어싱');assert.match(d.querySelector('[data-tab="cat_no_image"]').textContent,/내 모음/);
 const native=documentFor(renderStorefrontCategoryTiles(categories,{native:true}));assert.equal(native.querySelectorAll('button').length,0);assert.equal(native.querySelectorAll('a[data-storefront-category]').length,2);assert.doesNotMatch(native.body.textContent,/COUPON|SAMPLE|BRAND|EVENT/);assert.equal(renderStorefrontCategoryTiles([]),'');
});

test('shared renderers escape text and reject executable destinations without mutating configuration',()=>{
 const config=structuredClone(STOREFRONT_CONFIG);config.brand.name='<img src=x onerror=alert(1)>';config.heroBanners=[{image:'javascript:alert(1)',title:'숨길 이미지'},{image:'https://images.example/real.png',title:'<script>alert(1)</script>',href:'javascript:alert(1)',crop:'center;position:fixed'}];
 config.footer.links=[{label:'<b>문의</b>',href:'javascript:alert(1)'},{label:'실제 문의',href:'https://pf.kakao.com/_lxgBed/friend'}];const before=structuredClone(config);
 const d=documentFor(renderStorefrontBrand(config)+renderStorefrontHero(config)+renderStorefrontFooter(config));assert.equal(d.querySelector('script'),null);assert.equal(d.querySelector('[onerror]'),null);assert.equal(d.querySelectorAll('.storefront-hero-slide').length,1);assert.equal(d.querySelector('.storefront-hero-slide>a').getAttribute('href'),'#main-content');assert.match(d.querySelector('.storefront-hero-copy').textContent,/<script>/);assert.equal(d.querySelector('.storefront-hero-slide img').style.objectPosition,'center');assert.equal(d.querySelectorAll('.storefront-footer nav a').length,1);assert.deepEqual(config,before);
});

test('native supplemental routes refer to base categories and pure helpers can be inlined beside the existing app modules',()=>{
 const config=structuredClone(STOREFRONT_CONFIG),ids=new Set(config.menu.map(category=>category.id));
 for(const reference of config.nativeSupplementalMenu.before.filter(item=>item.categoryId))assert.ok(ids.has(reference.categoryId));
 for(const [id,children]of Object.entries(config.nativeSupplementalMenu.children)){assert.ok(ids.has(id));for(const child of children)if(child.categoryId)assert.ok(ids.has(child.categoryId));}
 assert.ok(config.nativeSupplementalMenu.before.some(item=>item.id==='best'));assert.ok(config.nativeSupplementalMenu.after.some(item=>item.id==='notice'));
 const read=name=>fs.readFileSync(new URL('../dist/'+name,import.meta.url),'utf8').replace(/^export /gm,'').replace(/^import .*;\r?\n/gm,'');
 assert.doesNotThrow(()=>new Function(read('model.js')+'\n'+read('customer-code.js')+'\n'+read('storefront.js')+'\n'+read('app.js')));
 const before=JSON.stringify(config);renderStorefrontBrand(config);renderStorefrontMenu(undefined,{config});renderStorefrontHero(config);renderStorefrontCategoryTiles(undefined,{config});renderStorefrontFooter(config);assert.equal(JSON.stringify(config),before);
});
