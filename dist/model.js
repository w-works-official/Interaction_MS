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
  for(const tab of TABS){
    config.tabs[tab]??=defaults.tabs[tab];
    for(const key of ['pins','manual','excluded'])if(Array.isArray(config.tabs[tab][key]))config.tabs[tab][key]=config.tabs[tab][key].filter(id=>ids.has(id));
  }
  return validateConfig(config,catalog);
}
export function validDetail(url) {
  try {const u=new URL(url);return u.protocol==='https:'&&['www.pink-rocket.com','pink-rocket.com'].includes(u.hostname)&&/^\/(shop\/shopdetail|m\/product)\.html$/.test(u.pathname);}catch{return false;}
}
export function initialConfig() {
  return {schema:1,tabs:Object.fromEntries(TABS.map(tab=>[tab,{sort:tab==='신상'?'newest':'recommended',manual:[],pins:[],excluded:[],hideSoldout:false}])),banners:[]};
}
export function removeStarterBanners(config) {
  return {...config,banners:config.banners.filter(b=>!['edit-01','notice-01'].includes(b.id))};
}
export function poolFor(catalog,tab) {
  return catalog.filter(p=>tab==='추천'||tab==='신상'||(p.categories||[p.category]).includes(tab));
}
export function sortProducts(items,sort='recommended') {
  return [...items].sort((a,b)=>{
    const difference=sort==='priceAsc'?a.price-b.price:sort==='priceDesc'?b.price-a.price:sort==='newest'?a.newOrder-b.newOrder:sort==='reviews'?b.reviewCount-a.reviewCount:b.score-a.score;
    return difference||a.id.localeCompare(b.id);
  });
}
export function resolveList(catalog,tab,config) {
  const c=config.tabs[tab]||initialConfig().tabs[tab];
  const sorted=sortProducts(poolFor(catalog,tab).filter(p=>!c.excluded.includes(p.id)&&(!c.hideSoldout||!p.soldout)),c.sort);
  const byId=new Map(sorted.map(p=>[p.id,p]));
  const ids=[...c.pins,...c.manual,...sorted.map(p=>p.id)];
  const seen=new Set();
  return ids.filter(id=>byId.has(id)&&!seen.has(id)&&seen.add(id)).map(id=>byId.get(id));
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
export function composeFeed(items,banners,tab) {
  const active=banners.filter(b=>b.enabled&&b.tabs.includes(tab));
  const result=[];
  for(let i=0;i<=items.length;i++){
    active.filter(b=>Math.min(b.after,items.length)===i).forEach(b=>result.push({kind:'banner',data:b}));
    if(i<items.length)result.push({kind:'product',data:items[i]});
  }return result;
}
export function validateConfig(value,catalog) {
  if(!value||value.schema!==1||!value.tabs||!Array.isArray(value.banners)||value.banners.length>30)throw Error('지원하지 않는 구성 파일입니다.');
  const config=clone(value);const ids=new Set(catalog.map(p=>p.id));
  for(const tab of TABS){
    const c=config.tabs[tab];if(!c||!SORTS[c.sort])throw Error('탭 정렬 설정이 올바르지 않습니다.');
    for(const key of ['pins','manual','excluded']){
      if(!Array.isArray(c[key])||c[key].some(id=>typeof id!=='string'||!ids.has(id)))throw Error('상품 ID가 현재 목록과 맞지 않습니다.');
      c[key]=[...new Set(c[key])];
    }c.hideSoldout=!!c.hideSoldout;
  }
  const bannerIds=new Set();
  for(const b of config.banners){
    if(!b||typeof b.id!=='string'||bannerIds.has(b.id)||!['notice','editorial'].includes(b.type)||typeof b.title!=='string'||!b.title.trim()||b.title.length>160||typeof b.subtitle!=='string'||b.subtitle.length>300||!Array.isArray(b.tabs)||b.tabs.some(t=>!TABS.includes(t))||!Number.isInteger(b.after)||b.after<0||b.after>500)throw Error('배너 설정이 올바르지 않습니다.');
    bannerIds.add(b.id);b.enabled=!!b.enabled;b.span=b.span===2?2:1;
    if(b.image&&!/^(assets\/|data:image\/(?:png|jpeg|webp);base64,|https:\/\/)/i.test(b.image))throw Error('지원하지 않는 이미지 주소입니다.');
    if(b.link){try{const u=new URL(b.link);if(u.protocol!=='https:')throw Error();}catch{throw Error('배너 링크는 https 주소여야 합니다.');}}
  }return config;
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
  {key:'bar',label:'바 옵션',options:['바길이 변경 가능','얇은바','라블렛 변경 가능','두꺼운바']}
];
export const TAG_WEIGHTS={item:5,material:3,color:2,shape:3,motif:3,spot:3,bar:3};
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
export function discoverProducts(items,d,{sort='curated'}={}) {
  const min=d.min===''?null:Number(d.min),max=d.max===''?null:Number(d.max);
  if((min!==null&&!Number.isFinite(min))||(max!==null&&!Number.isFinite(max))||(min!==null&&max!==null&&min>max))return [];
  let rows=items.filter(p=>(min===null||p.price>=min)&&(max===null||p.price<=max)&&(!d.strict||TAG_GROUPS.every(g=>!d.tags[g.key]?.length||d.tags[g.key].some(tag=>(p.tags?.[g.key]||[]).includes(tag)))));
  if(sort==='match'||sort==='curated'&&hasDiscovery(d))rows=rows.map((p,i)=>({p,i,score:tagScore(p,d)})).sort((a,b)=>b.score-a.score||a.i-b.i).map(x=>x.p);
  else if(sort!=='curated')rows=sortProducts(rows,sort);
  return d.cap>0?rows.slice(0,d.cap):rows;
}
