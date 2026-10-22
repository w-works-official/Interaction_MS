// Shared by the external storefront and the copied native responsive skin.
// Edit images, banner text and destinations here once for both screen sizes.
export const STOREFRONT_CATEGORIES = [
  {id:'추천',label:'추천'}, {id:'신상',label:'신상'}, {id:'피어싱',label:'피어싱'},
  {id:'귀걸이',label:'귀걸이'}, {id:'반지',label:'반지·토우링'},
  {id:'목걸이',label:'목걸이'}, {id:'팔찌',label:'팔찌·발찌'}, {id:'헤어',label:'헤어'},
];
export const STOREFRONT_CONFIG = {
  brand:{name:'PINKROCKET',homeHref:'/'},
  menu:STOREFRONT_CATEGORIES.map(category=>({...category,href:({
    추천:'/',신상:'/shop/shopbrand.html?type=P&xcode=044',
    피어싱:'/shop/shopbrand.html?type=Y&xcode=001',귀걸이:'/shop/shopbrand.html?type=X&xcode=019',
    반지:'/shop/shopbrand.html?type=X&xcode=010',목걸이:'/shop/shopbrand.html?type=X&xcode=060',
    팔찌:'/shop/shopbrand.html?type=X&xcode=054',헤어:'/shop/shopbrand.html?type=X&xcode=041',
  })[category.id]})),
  // Original native side-menu destinations. References share the base category setting.
  nativeSupplementalMenu:{
    before:[
      {categoryId:'신상'},
      {id:'best',label:'BEST',href:'/shop/bestseller.html?xcode=BEST'},
      {id:'new-member',label:'신규회원존 ~50%',href:'/shop/shopbrand.html?type=P&xcode=069'},
    ],
    children:{피어싱:[
      {categoryId:'피어싱',label:'전체'},
      {id:'ball',label:'볼피어싱',href:'/shop/shopbrand.html?type=N&xcode=001&mcode=001'},
      {id:'ring',label:'링피어싱',href:'/shop/shopbrand.html?type=N&xcode=001&mcode=002'},
      {id:'labret',label:'라블렛',href:'/shop/shopbrand.html?type=N&xcode=001&mcode=003'},
      {id:'drop',label:'드롭/투핀피어싱',href:'/shop/shopbrand.html?type=N&xcode=001&mcode=004'},
      {id:'etc',label:'etc.',href:'/shop/shopbrand.html?type=N&xcode=001&mcode=005'},
      {id:'piercing-set',label:'피어싱세트',href:'/shop/shopbrand.html?type=N&xcode=001&mcode=006'},
      {id:'surgical',label:'써지컬피어싱',href:'/shop/shopbrand.html?type=N&xcode=011&mcode=001'},
      {id:'silver',label:'925실버',href:'/shop/shopbrand.html?type=Y&xcode=020'},
      {id:'gold',label:'14K',href:'/shop/shopbrand.html?type=Y&xcode=026'},
      {id:'bar',label:'바변경',href:'/shop/shopbrand.html?type=N&xcode=001&mcode=007'},
      {id:'spot',label:'부위별추천',href:'/shop/shopbrand.html?type=Y&xcode=048'},
    ]},
    after:[
      {id:'parts',label:'부속품/관리용품',href:'/shop/shopbrand.html?type=X&xcode=014'},
      {id:'other',label:'기타',href:'/shop/shopbrand.html?type=X&xcode=050'},
      {id:'event',label:'EVENT',href:'/board/board.html?code=curiouswiz_board12'},
      {id:'qna',label:'Q&A',href:'/board/board.html?code=curiouswiz'},
      {id:'faq',label:'FAQ',href:'/board/board.html?code=curiouswiz_board10'},
      {id:'notice',label:'NOTICE',href:'/board/board.html?code=curiouswiz_board2'},
    ],
  },
  heroBanners:[1,2,3,4].map(number=>({
    id:'main-slide-'+number,
    image:'https://skin.makeshop.co.kr/skin/enough/images/main_slide'+number+'.png',
    eyebrow:'People & Life',title:'Where we play and perform',href:'#main-content',
  })),
  // A mobileImage is optional. The common image above is used at every width by default.
  categoryTiles:[{categoryId:'피어싱',image:'https://pink-rocket.com/design/curiouswiz/renewal/img/main_icon_surgical_p.jpg'}],
  footer:{label:'CS Center',links:[{label:'핑크로켓 카카오톡 문의',href:'https://pf.kakao.com/_lxgBed/friend'}]},
};

function storefrontEscape(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function storefrontUrl(value,{image=false,fallback=''}={}){
  if(typeof value!=='string'||value!==value.trim()||/[\u0000-\u001f\u007f]/.test(value))return fallback;
  if(!image&&/^#[A-Za-z][\w:.-]*$/.test(value))return value;
  try{
    const url=new URL(value,'https://pink-rocket.com/');
    if(url.protocol!=='https:'||url.username||url.password)return fallback;
    if(value.startsWith('/')&&!value.startsWith('//'))return url.pathname+url.search+url.hash;
    return url.href;
  }catch{return fallback;}
}
function storefrontCrop(value){return typeof value==='string'&&/^[\d.% a-z-]{1,50}$/i.test(value)?value:'center';}

export function storefrontCategories(categories,config=STOREFRONT_CONFIG){
  const menu=Array.isArray(config.menu)?config.menu:[],input=Array.isArray(categories)?categories:menu,seen=new Set();
  return input.filter(category=>category&&typeof category.id==='string'&&category.id&&!seen.has(category.id)&&category.enabled!==false&&seen.add(category.id)).map(category=>{
    const setting=menu.find(item=>item.id===category.id)||{};
    return {id:category.id,label:String(category.label||setting.label||category.id),href:storefrontUrl(category.href||setting.href,{fallback:'#main-content'})};
  });
}

export function renderStorefrontBrand(config=STOREFRONT_CONFIG,{native=false,homeHref}={}){
  const name=storefrontEscape(config.brand?.name||'PINKROCKET');
  if(native)return `<a class="storefront-brand" href="${storefrontEscape(storefrontUrl(homeHref||config.brand?.homeHref,{fallback:'/'}))}" aria-label="${name} 홈">${name}</a>`;
  return `<button class="storefront-brand wordmark" type="button" data-action="home" aria-label="${name} 홈">${name}</button>`;
}

export function renderStorefrontMenu(categories,{config=STOREFRONT_CONFIG,activeId='',native=false}={}){
  const items=storefrontCategories(categories,config).map(category=>{
    const id=storefrontEscape(category.id),label=storefrontEscape(category.label),active=category.id===activeId;
    return native
      ?`<a href="${storefrontEscape(category.href)}" data-storefront-category="${id}" class="${active?'active':''}" aria-current="${active?'page':'false'}">${label}</a>`
      :`<button type="button" data-action="tab" data-tab="${id}" class="${active?'active':''}" aria-current="${active?'page':'false'}">${label}</button>`;
  }).join('');
  return native?items:`<nav class="storefront-menu category-tabs" aria-label="상품 카테고리" data-tab-swipe>${items}</nav>`;
}

export function renderStorefrontHero(config=STOREFRONT_CONFIG,{mainAnchor='#main-content',activeIndex=0}={}){
  const banners=(Array.isArray(config.heroBanners)?config.heroBanners:[]).filter(banner=>banner&&storefrontUrl(banner.image,{image:true}));
  if(!banners.length)return '';
  const current=Number.isSafeInteger(activeIndex)?Math.max(0,Math.min(banners.length-1,activeIndex)):0;
  const slides=banners.map((banner,index)=>{
    const image=storefrontUrl(banner.image,{image:true}),mobileImage=storefrontUrl(banner.mobileImage,{image:true});
    const href=storefrontUrl(banner.href==='#main-content'?mainAnchor:banner.href,{fallback:'#main-content'});
    const img=`<img src="${storefrontEscape(image)}" alt="${storefrontEscape(banner.alt||'')}" loading="${index===0?'eager':'lazy'}" decoding="async" draggable="false" ${index===0?'fetchpriority="high"':''} style="object-position:${storefrontEscape(storefrontCrop(banner.crop))}">`;
    const picture=mobileImage&&mobileImage!==image?`<picture><source media="(max-width:1024px)" srcset="${storefrontEscape(mobileImage)}">${img}</picture>`:img;
    return `<div class="storefront-hero-slide swiper-slide" data-hero-index="${index}"><a href="${storefrontEscape(href)}">${picture}<div class="storefront-hero-copy txt">${banner.eyebrow?`<p>${storefrontEscape(banner.eyebrow)}</p>`:''}${banner.title?`<h2>${storefrontEscape(banner.title)}</h2>`:''}</div></a></div>`;
  }).join('');
  const controls=banners.map((banner,index)=>`<button type="button" class="${index===current?'active':''}" data-action="storefront-hero" data-index="${index}" aria-label="${index+1}번 배너 보기" aria-pressed="${index===current}"><span>${index+1}</span></button>`).join('');
  return `<section id="mainBnr" class="storefront-hero swiper-container" aria-label="메인 배너" data-storefront-hero data-hero-count="${banners.length}"><div class="storefront-hero-track swiper-wrapper" style="transform:translateX(-${current*100}%)">${slides}</div><div class="storefront-hero-pagination swiper-pagination-wrap"><div class="swiper-pagination" aria-label="배너 선택">${controls}</div><div class="page-numbers"><span class="current-page">${current+1}</span> / <span class="total-pages">${banners.length}</span></div></div></section>`;
}

export function renderStorefrontCategoryTiles(categories,{config=STOREFRONT_CONFIG,activeId='',native=false}={}){
  const tiles=Array.isArray(config.categoryTiles)?config.categoryTiles:[];
  const items=storefrontCategories(categories,config).map(category=>{
    const tile=tiles.find(item=>item.categoryId===category.id)||{},image=storefrontUrl(tile.image,{image:true});
    const contents=`<span class="storefront-category-art">${image?`<img src="${storefrontEscape(image)}" alt="" loading="lazy" decoding="async">`:`<span aria-hidden="true">${storefrontEscape(category.label)}</span>`}</span><span class="storefront-category-label">${storefrontEscape(category.label)}</span>`;
    const attrs=`class="storefront-category-tile ${category.id===activeId?'active':''}"`;
    const control=native?`<a ${attrs} href="${storefrontEscape(category.href)}" data-storefront-category="${storefrontEscape(category.id)}">${contents}</a>`:`<button type="button" ${attrs} data-action="tab" data-tab="${storefrontEscape(category.id)}" aria-pressed="${category.id===activeId}">${contents}</button>`;
    return `<div class="swiper-slide">${control}</div>`;
  }).join('');
  return items?`<section id="cateSwiper" class="storefront-category-tiles swiper-container" aria-label="카테고리 바로가기" data-storefront-category-tiles><div class="storefront-category-track swiper-wrapper">${items}</div></section>`:'';
}

export function renderStorefrontFooter(config=STOREFRONT_CONFIG){
  const links=(Array.isArray(config.footer?.links)?config.footer.links:[]).map(link=>{
    const href=storefrontUrl(link?.href);return href?`<a href="${storefrontEscape(href)}" target="_blank" rel="noopener">${storefrontEscape(link.label)}</a>`:'';
  }).join('');
  return `<footer class="storefront-footer"><strong>${storefrontEscape(config.brand?.name||'PINKROCKET')}</strong><div>${config.footer?.label?`<p>${storefrontEscape(config.footer.label)}</p>`:''}<nav aria-label="고객 문의">${links}</nav></div></footer>`;
}
