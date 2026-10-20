export const TABS = ['추천','신상','피어싱','귀걸이','반지','목걸이','팔찌','헤어'];
export const MATERIALS = ['전체','써지컬','925 실버','골드','티타늄','진주','큐빅','기타'];
export const SORTS = {recommended:'추천순',newest:'신상순',priceAsc:'낮은 가격순',priceDesc:'높은 가격순',reviews:'리뷰 많은 순'};
export const clone = value => JSON.parse(JSON.stringify(value));
export function makeshopDetailUrl(productId,platform='pc') {
  if(typeof productId==='number'){
    if(!Number.isSafeInteger(productId)||productId<=0)return null;
    productId=String(productId);
  }
  if(typeof productId!=='string'||!/^[1-9]/.test(productId)||/\D/.test(productId))return null;
  const path=platform==='pc'?'/shop/shopdetail.html':platform==='mobile'?'/m/product.html':null;
  return path?`https://www.pink-rocket.com${path}?branduid=${productId}`:null;
}
export function categoryOf(name='') {
  if (/귀걸이|이어커프/.test(name)) return '귀걸이';
  if (/반지|토우링/.test(name)) return '반지';
  if (/목걸이|초커/.test(name)) return '목걸이';
  if (/팔찌|발찌/.test(name)) return '팔찌';
  if (/헤어|머리|비녀/.test(name)) return '헤어';
  return '피어싱';
}
export function materialOf(name='') {
  if (/14K|10K|18K|골드/i.test(name)) return '골드';
  if (/925|실버/.test(name)) return '925 실버';
  return '써지컬';
}
const normalizeMaterial = value => String(value).includes('써지컬')?'써지컬':/14K|10K|골드/.test(value)?'골드':/925|실버/.test(value)?'925 실버':String(value);
export function normalizeCatalog(raw) {
  if (!Array.isArray(raw)) raw = raw.products || raw.items || [];
  const seen=new Set();
  return raw.filter(p=>p&&p.id&&!seen.has(String(p.id))&&seen.add(String(p.id))).map((p,i)=>{
    const categories=Array.isArray(p.categories)&&p.categories.length?p.categories:[p.category||categoryOf(p.name)];
    const materials=[...new Set((Array.isArray(p.materials)&&p.materials.length?p.materials:[p.material||materialOf(p.name)]).map(normalizeMaterial))];
    return {...p,id:String(p.id),name:String(p.name||'상품'),price:Number(p.price)||0,
      category:categories[0],categories,material:materials[0],materials,
      images:(p.images||[]).filter(x=>typeof x==='string'&&/^(assets\/|https:\/\/)/.test(x)),
      // Demo curation order only; release dates, sales and stock are not supplied by this snapshot.
      score:Number.isFinite(p.score)?p.score:100000-i,reviewCount:Number(p.reviewCount)||0,
      newOrder:i,isNew:!!p.isNew,soldout:!!p.soldout,
      detailUrl:makeshopDetailUrl(p.id)};
  });
}
export function migrateSavedConfig(value,catalog) {
  if(!value||value.schema!==1||!value.tabs)throw Error('지원하지 않는 구성 파일입니다.');
  const config=clone(value),defaults=initialConfig(),ids=new Set(catalog.map(p=>p.id));
  if(Array.isArray(config.categories))config.categories=config.categories.map(category=>category&&typeof category==='object'?{...category,...(Array.isArray(category.productIds)?{productIds:category.productIds.filter(id=>ids.has(id))}:{})}:category);
  config.categories=normalizeCategories(config.categories,catalog);
  for(const tab of categoryIds(config)){
    config.tabs[tab]??=defaults.tabs[tab]||defaultCategoryCuration(tab);
    for(const key of ['pins','manual','excluded'])if(Array.isArray(config.tabs[tab][key]))config.tabs[tab][key]=config.tabs[tab][key].filter(id=>ids.has(id));
  }
  if(config.productEdits&&typeof config.productEdits==='object'&&!Array.isArray(config.productEdits))config.productEdits=Object.fromEntries(Object.entries(config.productEdits).filter(([id])=>ids.has(id)));
  return validateConfig(config,catalog);
}
export function validDetail(url) {
  try {const u=new URL(url);return u.protocol==='https:'&&['www.pink-rocket.com','pink-rocket.com'].includes(u.hostname)&&/^\/(shop\/shopdetail|m\/product)\.html$/.test(u.pathname);}catch{return false;}
}
export function initialConfig() {
  return {schema:1,categories:defaultCategories(),tabs:Object.fromEntries(TABS.map(tab=>[tab,defaultCategoryCuration(tab)])),banners:[],ranking:Object.fromEntries(TABS.map(tab=>[tab,defaultRanking()])),productEdits:{}};
}
function defaultCategoryCuration(id){return {sort:id==='신상'?'newest':'recommended',manual:[],pins:[],excluded:[],hideSoldout:false};}
function defaultCategoryFilters(){return {groups:TAG_GROUPS.map(group=>group.key),material:true,price:true,photo:true};}
function defaultCategories(){return TABS.map(id=>({id,label:({반지:'반지·토우링',팔찌:'팔찌·발찌'})[id]||id,enabled:true,mode:['추천','신상'].includes(id)?'all':'legacy',...(!['추천','신상'].includes(id)?{legacyTab:id}:{}),productIds:[],note:'',filters:defaultCategoryFilters()}));}
function validCategoryId(id){return typeof id==='string'&&(TABS.includes(id)||/^cat_[a-z0-9][a-z0-9_-]{0,63}$/.test(id)&&! /[^a-z0-9_-]/.test(id));}
function normalizeCategoryFilters(value){
  if(value===undefined)return defaultCategoryFilters();
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('카테고리 필터 설정이 올바르지 않습니다.');
  const filters={...defaultCategoryFilters(),...value},keys=new Set(TAG_GROUPS.map(group=>group.key));
  if(!Array.isArray(filters.groups)||filters.groups.some(key=>!keys.has(key))||new Set(filters.groups).size!==filters.groups.length||['material','price','photo'].some(key=>typeof filters[key]!=='boolean'))throw Error('카테고리 필터 설정이 올바르지 않습니다.');
  return {...filters,groups:[...filters.groups]};
}
export function normalizeCategories(value,catalog=[]){
  if(value===undefined)return defaultCategories();
  if(!Array.isArray(value)||value.length>TABS.length+32||value.length<TABS.length)throw Error('카테고리는 기본 항목을 포함해 최대 40개까지 설정할 수 있습니다.');
  const ids=new Set(),labels=new Set(),products=new Set(catalog.map(product=>String(product.id)));
  const categories=value.map(category=>{
    if(!category||typeof category!=='object'||Array.isArray(category)||!validCategoryId(category.id)||ids.has(category.id))throw Error('카테고리 ID가 올바르지 않거나 중복됩니다.');
    const id=category.id,label=category.label,enabled=category.enabled===undefined?true:category.enabled,mode=category.mode===undefined?(TABS.includes(id)?(['추천','신상'].includes(id)?'all':'legacy'):'manual'):category.mode;
    const note=category.note===undefined?'':category.note,productIds=category.productIds===undefined?[]:category.productIds,legacyTab=category.legacyTab===undefined&&TABS.includes(id)?id:category.legacyTab;
    if(typeof label!=='string'||!label.trim()||label.trim().length>40||labels.has(label.trim())||typeof enabled!=='boolean'||!['all','legacy','manual'].includes(mode)||typeof note!=='string'||note.length>1200||!Array.isArray(productIds)||productIds.some(productId=>typeof productId!=='string'||!products.has(productId))||(legacyTab!==undefined&&!TABS.includes(legacyTab))||(mode==='legacy'&&!TABS.includes(legacyTab)))throw Error('카테고리 이름·상품 소속·분류 설정이 올바르지 않습니다.');
    ids.add(id);labels.add(label.trim());
    return {...category,id,label:label.trim(),enabled,mode,...(mode==='legacy'||category.legacyTab!==undefined?{legacyTab}:{}),productIds:[...new Set(productIds)],note,filters:normalizeCategoryFilters(category.filters)};
  });
  if(TABS.some(id=>!ids.has(id))||!categories.some(category=>category.enabled))throw Error('기본 카테고리를 유지하고 하나 이상의 카테고리를 노출해 주세요.');
  return categories;
}
export function categoryDefinitions(config){return config?.categories===undefined?defaultCategories():config.categories;}
export function categoryIds(config,{visibleOnly=false}={}){return categoryDefinitions(config).filter(category=>!visibleOnly||category.enabled).map(category=>category.id);}
export function categoryLabel(config,id){return categoryDefinitions(config).find(category=>category.id===id)?.label||id;}
export function categoryFilters(config,id){return normalizeCategoryFilters(categoryDefinitions(config).find(category=>category.id===id)?.filters);}
export function normalizeDiscoveryForCategory(discovery,config,id){
  const filters=categoryFilters(config,id),result={...emptyDiscovery(),...(discovery?clone(discovery):{})},tags=result.tags||{};
  result.tags=Object.fromEntries(filters.groups.filter(group=>Array.isArray(tags[group])).map(group=>[group,[...tags[group]]]));
  if(!filters.price){result.min='';result.max='';}
  if(!filters.photo){result.photoTone=null;result.photoPreview='';}
  if(!filters.material&&Object.hasOwn(result,'material'))result.material='전체';
  return result;
}
export function removeStarterBanners(config) {
  return {...config,banners:config.banners.filter(b=>!['edit-01','notice-01'].includes(b.id))};
}
export function poolFor(catalog,tab,config) {
  const category=categoryDefinitions(config).find(category=>category.id===tab);
  if(!category)return [];
  if(category.mode==='manual'){const ids=new Set(category.productIds);return catalog.filter(product=>ids.has(product.id));}
  const legacyTab=category.legacyTab||tab;
  return catalog.filter(p=>category.mode==='all'||['추천','신상'].includes(legacyTab)||(p.categories||[p.category]).includes(legacyTab));
}
export function sortProducts(items,sort='recommended') {
  return [...items].sort((a,b)=>{
    const difference=sort==='priceAsc'?a.price-b.price:sort==='priceDesc'?b.price-a.price:sort==='newest'?a.newOrder-b.newOrder:sort==='reviews'?b.reviewCount-a.reviewCount:b.score-a.score;
    return difference||a.id.localeCompare(b.id);
  });
}
function curationList(catalog,tab,config) {
  const c=config.tabs[tab]||defaultCategoryCuration(tab);
  const sorted=sortProducts(poolFor(catalog,tab,config).filter(p=>!c.excluded.includes(p.id)&&(!c.hideSoldout||!p.soldout)),c.sort);
  const byId=new Map(sorted.map(p=>[p.id,p]));
  const ids=[...c.pins,...c.manual,...sorted.map(p=>p.id)];
  const seen=new Set();
  return ids.filter(id=>byId.has(id)&&!seen.has(id)&&seen.add(id)).map(id=>byId.get(id));
}
export function resolveList(catalog,tab,config) {
  return rankProducts(curationList(effectiveCatalog(catalog,config),tab,config),tab,config);
}
export function filterList(items,{query='',material='전체',sort='curated',favoritesOnly=false,favorites=[]}={}) {
  const q=query.trim().toLocaleLowerCase(),exactId=items.some(p=>p.id===q);
  const out=items.filter(p=>(!q||(exactId?p.id===q:`${p.name} ${(p.categories||[p.category]).join(' ')} ${(p.materials||[p.material]).join(' ')} ${Object.values(p.tags||{}).flat().join(' ')} ${p.id}`.toLocaleLowerCase().includes(q)))&&(material==='전체'||(p.materials||[p.material]).includes(material))&&(!favoritesOnly||favorites.includes(p.id)));
  return sort==='curated'?out:sortProducts(out,sort);
}
export function reorder(config,catalog,tab,id,targetIndex) {
  if(!Number.isSafeInteger(targetIndex))return config;
  const c=config.tabs[tab],ids=resolveList(catalog,tab,config).map(p=>p.id);
  const index=ids.indexOf(id);if(index<0)return config;
  const pinSet=new Set(c.pins),pinCount=ids.filter(value=>pinSet.has(value)).length;
  const first=pinSet.has(id)?0:pinCount,last=pinSet.has(id)?pinCount-1:ids.length-1;
  const target=Math.max(first,Math.min(last,targetIndex));if(target===index)return config;
  ids.splice(index,1);ids.splice(target,0,id);

  // Reorder only visible slots; excluded and hidden products keep their latent positions.
  const fullConfig={...config,tabs:{...config.tabs,[tab]:{...c,excluded:[],hideSoldout:false}}};
  const fullIds=resolveList(catalog,tab,fullConfig).map(p=>p.id),visible=new Set(ids);
  let cursor=0;
  const fullOrder=fullIds.map(value=>visible.has(value)?ids[cursor++]:value);
  // Retain manual entries outside this category too, in case classification changes later.
  const fullSet=new Set(fullIds),manualBase=[...new Set([...c.manual,...fullIds])];
  cursor=0;c.manual=manualBase.map(value=>fullSet.has(value)?fullOrder[cursor++]:value);
  const visiblePins=ids.filter(value=>pinSet.has(value));cursor=0;
  c.pins=c.pins.map(value=>visible.has(value)?visiblePins[cursor++]:value);
  return config;
}
export function togglePin(config,tab,id) {
  const c=config.tabs[tab];c.pins=c.pins.includes(id)?c.pins.filter(x=>x!==id):[...c.pins,id];return config;
}
export function autoArrange(config,tab,sort,resetManual=false) {
  const c=config.tabs[tab];c.sort=sort;if(resetManual)c.manual=[];return config;
}
export function normalizeContentBlock(b) {
  if(!b||typeof b!=='object'||Array.isArray(b))throw Error('콘텐츠 블록 설정이 올바르지 않습니다.');
  const get=(key,fallback)=>b[key]===undefined?fallback:b[key];
  const type=b.type,title=get('title',''),subtitle=get('subtitle',''),image=get('image',''),link=get('link',''),tag=get('tag','');
  if(typeof b.id!=='string'||!b.id.trim()||b.id.length>120||!['editorial','notice','image','text','spacer','divider'].includes(type)||
    typeof title!=='string'||title.length>160||!title.trim()||
    typeof subtitle!=='string'||subtitle.length>300||typeof tag!=='string'||tag.length>70||
    typeof image!=='string'||typeof link!=='string'||!Array.isArray(b.tabs)||!b.tabs.length||b.tabs.some(tab=>!validCategoryId(tab)))throw Error('콘텐츠 블록 설정이 올바르지 않습니다.');
  if(image){
    if(!/^(assets\/|data:image\/(?:png|jpeg|webp);base64,|https:\/\/)/i.test(image))throw Error('지원하지 않는 이미지 주소입니다.');
    if(/^https:/i.test(image)){try{if(new URL(image).protocol!=='https:')throw Error();}catch{throw Error('지원하지 않는 이미지 주소입니다.');}}
  }
  if(type==='image'&&!image)throw Error('이미지 블록에는 이미지가 필요합니다.');
  if(link){try{if(new URL(link).protocol!=='https:')throw Error();}catch{throw Error('블록 링크는 https 주소여야 합니다.');}}
  const zone=get('zone','feed'),placement=get('placement','count'),anchorId=get('anchorId',''),anchorSide=get('anchorSide','after'),overflow=get('overflow','end'),after=get('after',0);
  if(!['top','after-tabs','before-feed','feed','bottom'].includes(zone)||!['count','product'].includes(placement)||
    !['before','after'].includes(anchorSide)||!['end','hide'].includes(overflow)||
    !Number.isSafeInteger(after)||after<0||after>100000||typeof anchorId!=='string'||
    (anchorId!==''&&(!/^[1-9]/.test(anchorId)||/\D/.test(anchorId)))||
    (placement==='product'&&(!anchorId||zone!=='feed')))throw Error('블록 배치 설정이 올바르지 않습니다.');
  const span=b.span===2?2:1,widthPc=get('widthPc',type==='notice'?'full':String(span)),widthMobile=get('widthMobile',type==='notice'||span===2?'full':'1');
  const newRow=get('newRow',false),showWhenFiltered=get('showWhenFiltered',true);
  if(!['1','2','full'].includes(widthPc)||!['1','2','full'].includes(widthMobile)||typeof newRow!=='boolean'||typeof showWhenFiltered!=='boolean')throw Error('블록 너비·노출 설정이 올바르지 않습니다.');
  const tone=get('tone','cream'),palette=['ink','blush','cream'].includes(tone)?({ink:'#252a21',blush:'#e9dcd6',cream:'#eef0e6'})[tone]:'#eef0e6';
  const background=get('background',type==='notice'?'#eef0e6':palette),textColor=get('textColor',type!=='notice'&&tone==='ink'?'#ffffff':'#171918');
  const padding=get('padding',20),radius=get('radius',0),align=get('align','left'),imageFit=get('imageFit','cover'),imageRatio=get('imageRatio','auto');
  if(typeof background!=='string'||background.length!==7||!/^#[\da-f]{6}$/i.test(background)||typeof textColor!=='string'||textColor.length!==7||!/^#[\da-f]{6}$/i.test(textColor)||
    !Number.isSafeInteger(padding)||padding<0||padding>64||!Number.isSafeInteger(radius)||radius<0||radius>48||
    !['left','center','right'].includes(align)||!['contain','cover'].includes(imageFit)||!['auto','3/4','1/1','16/9','21/9'].includes(imageRatio))throw Error('블록 스타일 설정이 올바르지 않습니다.');
  return {...b,type,title,subtitle,tag,image,link,tabs:[...b.tabs],enabled:!!b.enabled,span,tone,zone,placement,anchorId,anchorSide,overflow,after,widthPc,widthMobile,newRow,showWhenFiltered,background,textColor,padding,radius,align,imageFit,imageRatio};
}
function normalizedBlockPosition(items,b) {
  if(b.zone!=='feed')return null;
  if(b.placement==='product'){
    const index=items.findIndex(product=>String(product.id)===b.anchorId);
    return index<0?null:index+(b.anchorSide==='after'?1:0);
  }
  return b.after>items.length&&b.overflow==='hide'?null:Math.min(b.after,items.length);
}
export function blockPosition(items,b) {
  return normalizedBlockPosition(items,normalizeContentBlock(b));
}
export function blocksForZone(items,banners,tab,zone,{filtered=false}={}) {
  return banners.map(normalizeContentBlock).filter(b=>b.enabled&&b.tabs.includes(tab)&&b.zone===zone&&(!filtered||b.showWhenFiltered)&&(zone!=='feed'||normalizedBlockPosition(items,b)!==null));
}
export function composeFeed(items,banners,tab,{filtered=false}={}) {
  const positions=new Map();
  for(const b of blocksForZone(items,banners,tab,'feed',{filtered})){
    const position=normalizedBlockPosition(items,b);
    if(!positions.has(position))positions.set(position,[]);
    positions.get(position).push(b);
  }
  const result=[];
  for(let i=0;i<=items.length;i++){
    for(const b of positions.get(i)||[])result.push({kind:'banner',data:b});
    if(i<items.length)result.push({kind:'product',data:items[i]});
  }return result;
}
export function validateConfig(value,catalog) {
  if(!value||value.schema!==1||!value.tabs||!Array.isArray(value.banners)||value.banners.length>100)throw Error('지원하지 않는 구성 파일입니다.');
  const config=clone(value);const ids=new Set(catalog.map(p=>p.id));
  config.categories=normalizeCategories(config.categories,catalog);
  const tabs=categoryIds(config),knownTabs=new Set(tabs);
  if(Object.keys(config.tabs).some(tab=>!knownTabs.has(tab)))throw Error('알 수 없는 카테고리 진열 설정입니다.');
  for(const tab of tabs){
    if(!TABS.includes(tab)&&config.tabs[tab]===undefined)config.tabs[tab]=defaultCategoryCuration(tab);
    const c=config.tabs[tab];if(!c||!SORTS[c.sort])throw Error('탭 정렬 설정이 올바르지 않습니다.');
    for(const key of ['pins','manual','excluded']){
      if(!Array.isArray(c[key])||c[key].some(id=>typeof id!=='string'||!ids.has(id)))throw Error('상품 ID가 현재 목록과 맞지 않습니다.');
      c[key]=[...new Set(c[key])];
    }c.hideSoldout=!!c.hideSoldout;
  }
  if(config.ranking!==undefined&&(!config.ranking||typeof config.ranking!=='object'||Array.isArray(config.ranking)||Object.keys(config.ranking).some(tab=>!knownTabs.has(tab))))throw Error('점수 정렬 카테고리 설정이 올바르지 않습니다.');
  config.ranking=Object.fromEntries(tabs.map(tab=>[tab,normalizeRanking(config.ranking?.[tab])]));
  config.productEdits=normalizeProductEdits(config.productEdits,ids);
  const bannerIds=new Set();
  config.banners=config.banners.map(value=>{
    const b=normalizeContentBlock(value);
    if(b.tabs.some(tab=>!knownTabs.has(tab)))throw Error('콘텐츠 블록의 카테고리가 현재 설정에 없습니다.');
    if(bannerIds.has(b.id))throw Error('블록 ID가 중복됩니다.');
    bannerIds.add(b.id);return b;
  });return config;
}

export function swipeThresholds(width=240) {
  const w=Number.isFinite(width)&&width>0?width:240;
  return {photo:Math.max(24,Math.min(64,w*.16))};
}
export function swipeIntent(dx,dy,{gallery=false,width=240,count=1}={}) {
  const distance=Math.abs(dx);
  if(distance<=Math.abs(dy)*1.5)return 'none';
  if(!gallery)return distance>55?'tab':'none';
  const limits=swipeThresholds(width);
  return count>1&&distance>=limits.photo?'photo':'none';
}

export const TAG_GROUPS = [
  {key:'item',label:'종류',options:['피어싱','피어싱귀걸이','귀걸이/귀찌','반지/토우링','목걸이','팔찌/발찌','헤어']},
  {key:'material',label:'소재',options:['써지컬스틸','925실버','14K골드','티타늄','진주','큐빅','기타']},
  {key:'color',label:'컬러',options:['실버','옐로우골드','로즈골드','블랙','화이트','크리스탈']},
  {key:'shape',label:'피어싱 형태',options:['볼피어싱','링피어싱','라블렛피어싱','드롭/투핀','세트']},
  {key:'motif',label:'모양',options:['큐빅','진주','하트','리본','별','달','꽃','나비','체인','도형','원석','십자가','스마일']},
  {key:'spot',label:'착용 부위',options:['귓볼','귓바퀴','아웃컨츠','이너컨츠','트라거스','헬릭스']},
  {key:'bar',label:'바 옵션',options:['바길이 변경 가능','얇은바','라블렛 변경 가능','두꺼운바']},
  {key:'style',label:'스타일',options:['심플','화려','데일리','포인트','레이어드']},
  {key:'size',label:'크기',options:['작은','중간','큰']}
];
export const TAG_WEIGHTS={item:5,material:3,color:2,shape:3,motif:3,spot:3,bar:3,style:2,size:2};
export function emptyDiscovery(){return {tags:{},min:'',max:'',strict:false,cap:0,photoTone:null,photoPreview:''};}
export function hasDiscovery(d){return TAG_GROUPS.some(g=>d.tags[g.key]?.length)||d.min!==''||d.max!==''||!!d.photoTone;}
export function colorTone(colors=[]) {
  for(const value of colors){
    const m=/^#?([0-9a-f]{6})$/i.exec(value);if(!m)continue;
    const n=parseInt(m[1],16),r=(n>>16)/255,g=(n>>8&255)/255,b=(n&255)/255,max=Math.max(r,g,b),min=Math.min(r,g,b),df=max-min;
    if(df<.25)continue;
    const h=max===r?((g-b)/df)%6:max===g?(b-r)/df+2:(r-g)/df+4;
    return {hue:(h*60+360)%360,grey:false};
  }return {hue:0,grey:true};
}
export function tagScore(p,d) {
  let score=0;
  for(const group of TAG_GROUPS)if(d.tags[group.key]?.some(tag=>(p.tags?.[group.key]||[]).includes(tag)))score+=TAG_WEIGHTS[group.key];
  if(d.photoTone){const tone=colorTone(p.colors);if(d.photoTone.grey){if(tone.grey)score+=4;}else if(!tone.grey){let distance=Math.abs(tone.hue-d.photoTone.hue);distance=Math.min(distance,360-distance);score+=Math.max(0,5-distance/12);}}
  return score;
}
function discoveryCandidates(items,d) {
  const min=d.min===''?null:Number(d.min),max=d.max===''?null:Number(d.max);
  if((min!==null&&!Number.isFinite(min))||(max!==null&&!Number.isFinite(max))||(min!==null&&max!==null&&min>max))return [];
  return items.filter(p=>(min===null||p.price>=min)&&(max===null||p.price<=max)&&(!d.strict||TAG_GROUPS.every(g=>!d.tags[g.key]?.length||d.tags[g.key].some(tag=>(p.tags?.[g.key]||[]).includes(tag)))));
}
export function discoverProducts(items,d,{sort='curated'}={}) {
  let rows=discoveryCandidates(items,d);
  if(sort==='match'||sort==='curated'&&hasDiscovery(d))rows=rows.map((p,i)=>({p,i,score:tagScore(p,d)})).sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.p);
  else if(sort!=='curated')rows=sortProducts(rows,sort);
  return d.cap>0?rows.slice(0,d.cap):rows;
}

export function defaultRanking(){return {enabled:false,brief:'',diversity:0,respectPins:true,rules:[],combinations:[]};}
function validRankingId(id){return typeof id==='string'&&!!id.trim()&&id.length<=120;}
function validTagCondition(condition){return !!condition&&TAG_GROUPS.some(group=>group.key===condition.group&&group.options.includes(condition.tag));}
export function normalizeRanking(value) {
  if(value===undefined)return defaultRanking();
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('점수 정렬 설정이 올바르지 않습니다.');
  const result={...defaultRanking(),...value};
  if(typeof result.enabled!=='boolean'||typeof result.respectPins!=='boolean'||typeof result.brief!=='string'||result.brief.length>1200||!Number.isSafeInteger(result.diversity)||result.diversity<0||result.diversity>10||!Array.isArray(result.rules)||result.rules.length>100||!Array.isArray(result.combinations)||result.combinations.length>30)throw Error('점수 정렬 설정이 올바르지 않습니다.');
  const ids=new Set(),weightValid=weight=>Number.isSafeInteger(weight)&&weight>=-100&&weight<=100;
  result.rules=result.rules.map(rule=>{
    if(!rule||!validRankingId(rule.id)||ids.has(rule.id)||!validTagCondition(rule)||!weightValid(rule.weight))throw Error('가중치 규칙이 올바르지 않습니다.');
    ids.add(rule.id);return {...rule};
  });
  result.combinations=result.combinations.map(combination=>{
    if(!combination||!validRankingId(combination.id)||ids.has(combination.id)||!weightValid(combination.weight)||!Array.isArray(combination.conditions)||combination.conditions.length<2||combination.conditions.length>8||combination.conditions.some(condition=>!validTagCondition(condition)))throw Error('태그 조합 규칙이 올바르지 않습니다.');
    ids.add(combination.id);return {...combination,conditions:combination.conditions.map(condition=>({...condition}))};
  });return result;
}
function normalizeProductEdits(value,ids) {
  if(value===undefined)return {};
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('상품 태그 편집 설정이 올바르지 않습니다.');
  return Object.fromEntries(Object.entries(value).map(([id,edit])=>{
    if(!ids.has(id)||!edit||typeof edit!=='object'||Array.isArray(edit))throw Error('편집 상품 ID가 현재 목록과 맞지 않습니다.');
    const tags=edit.tags===undefined?{}:edit.tags,note=edit.note===undefined?'':edit.note,reviewStatus=edit.reviewStatus===undefined?'unreviewed':edit.reviewStatus;
    if(!tags||typeof tags!=='object'||Array.isArray(tags)||typeof note!=='string'||note.length>600||!['unreviewed','reviewed','needs-review'].includes(reviewStatus))throw Error('상품 태그·검토 설정이 올바르지 않습니다.');
    const normalizedTags=Object.fromEntries(Object.entries(tags).map(([key,values])=>{
      const group=TAG_GROUPS.find(group=>group.key===key);
      if(!group||!Array.isArray(values)||values.some(tag=>!group.options.includes(tag)))throw Error('알 수 없는 상품 분류 태그입니다.');
      return [key,[...new Set(values)]];
    }));
    return [id,{...edit,tags:normalizedTags,note,reviewStatus}];
  }));
}
export function effectiveCatalog(catalog,config) {
  const edits=config.productEdits||{};if(!Object.keys(edits).length)return catalog;
  return catalog.map(product=>{
    const edit=edits[product.id];if(!edit)return product;
    const tags={...(product.tags||{})};for(const [group,values] of Object.entries(edit.tags||{}))tags[group]=[...values];
    return {...product,tags,note:edit.note||'',reviewStatus:edit.reviewStatus||'unreviewed'};
  });
}
export function rankProducts(items,tab,config,{discovery=null}={}) {
  const ranking=normalizeRanking(config.ranking?.[tab]);if(!ranking.enabled)return items;
  const context=discovery?{...emptyDiscovery(),...discovery,tags:discovery.tags||{}}:null;
  const entries=items.map((product,index)=>{
    const reasons=[];
    for(const rule of ranking.rules)if((product.tags?.[rule.group]||[]).includes(rule.tag)&&rule.weight!==0)reasons.push({label:`규칙 · ${TAG_GROUPS.find(group=>group.key===rule.group).label} ${rule.tag}`,points:rule.weight});
    for(const combination of ranking.combinations)if(combination.weight!==0&&combination.conditions.every(condition=>(product.tags?.[condition.group]||[]).includes(condition.tag)))reasons.push({label:'조합 · '+combination.conditions.map(condition=>condition.tag).join(' + '),points:combination.weight});
    const discoveryScore=context?tagScore(product,context):0;if(discoveryScore)reasons.push({label:context.photoTone?'탐색 태그·사진 색감':'탐색 태그 일치',points:discoveryScore});
    return {product,index,baseScore:reasons.reduce((sum,reason)=>sum+reason.points,0),reasons};
  });
  const pinnedIds=ranking.respectPins?[...new Set(config.tabs?.[tab]?.pins||[])]:[],pinSet=new Set(pinnedIds),byId=new Map(entries.map(entry=>[entry.product.id,entry]));
  const pinned=pinnedIds.filter(id=>byId.has(id)).map(id=>byId.get(id));
  const normal=entries.filter(entry=>!pinSet.has(entry.product.id)).sort((a,b)=>b.baseScore-a.baseScore||a.index-b.index),recent=[],result=[];
  const penaltyFor=entry=>ranking.diversity*recent.reduce((sum,previous)=>sum+['motif','shape','style'].filter(group=>(entry.product.tags?.[group]||[]).some(tag=>(previous.tags?.[group]||[]).includes(tag))).length,0);
  const emit=(entry,penalty)=>{
    const reasons=entry.reasons.map(reason=>({...reason}));if(penalty)reasons.push({label:'최근 3개 상품과 모양·형태·스타일 중복',points:-penalty});
    const product={...entry.product,_rank:{score:entry.baseScore-penalty,baseScore:entry.baseScore,penalty,reasons}};
    result.push(product);recent.push(product);if(recent.length>3)recent.shift();
  };
  for(const entry of pinned)emit(entry,penaltyFor(entry));
  if(!ranking.diversity){for(const entry of normal)emit(entry,0);return result;}
  const window=normal.slice(0,40);let next=window.length;
  while(window.length){
    let best=0,penalty=penaltyFor(window[0]),score=window[0].baseScore-penalty;
    for(let i=1;i<window.length;i++){const candidatePenalty=penaltyFor(window[i]),candidateScore=window[i].baseScore-candidatePenalty;if(candidateScore>score||(candidateScore===score&&window[i].index<window[best].index)){best=i;penalty=candidatePenalty;score=candidateScore;}}
    emit(window.splice(best,1)[0],penalty);if(next<normal.length)window.push(normal[next++]);
  }return result;
}
export function browseProducts(catalog,tab,config,options={}) {
  const {sort='curated'}=options,discovery=normalizeDiscoveryForCategory(options.discovery,config,tab),filters=categoryFilters(config,tab);
  const base=filterList(curationList(effectiveCatalog(catalog,config),tab,config),{...options,material:filters.material?(options.material||'전체'):'전체',sort:'curated'});
  if(config.ranking?.[tab]?.enabled&&['curated','match'].includes(sort)){
    const rows=rankProducts(discoveryCandidates(base,discovery),tab,config,{discovery});
    return discovery.cap>0?rows.slice(0,discovery.cap):rows;
  }
  return discoverProducts(base,discovery,{sort});
}
