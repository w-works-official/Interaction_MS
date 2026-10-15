const {chromium}=require('playwright');
const fs=require('node:fs');
const http=require('node:http');
const assert=require('node:assert/strict');
const path=require('node:path');
const snippet=fs.readFileSync(path.join(__dirname,'../outputs/makeshop-preview-test/01_PASTE_BEFORE_FOOTER.txt'),'utf8');
function fixture(mobile){
  const prefix=mobile?'/m/product.html':'/shop/shopdetail.html';
  let html='<!doctype html><meta charset="utf-8"><title>Local fixture</title>';
  html += mobile?'<a class="cart_icon" href="/m/basket.html">cart</a>':'<li class="basket"><a href="/shop/basket.html">cart</a></li>';
  for(let n=1;n<=4;n++){
    const inside=`<div class="listPic"><a href="${prefix}?branduid=${1000+n}"><img src="/product.svg" alt=""></a><span class="my-wish-list" data-uid="${1000+n}"><img src="/design/heart_off.png"></span></div><p class="listName">테스트 상품 ${n}</p>`;
    html+=mobile?`<ul class="items"><li>${inside}</li></ul>`:`<div class="productWrap"><figure>${inside}</figure></div>`;
  }
  html+=`<div class="productWrap"><div class="listPic"><a href="https://bad.invalid/shop/shopdetail.html?branduid=9999">x</a><span class="my-wish-list" data-uid="9999"></span></div></div>`;
  html+=`<script>window.fixtureCalls=[];document.querySelectorAll('.my-wish-list').forEach(n=>n.addEventListener('click',()=>{window.fixtureCalls.push(n.dataset.uid);const i=n.querySelector('img');if(i)i.src=i.src.includes('heart_off')?'/design/heart_on.png':'/design/heart_off.png'}));</script>`;
  return html+snippet;
}
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(u.pathname==='/pc'||u.pathname==='/m/')return res.end(fixture(u.pathname==='/m/'));
  if(u.pathname.endsWith('/shopdetail.html')||u.pathname.endsWith('/product.html')){
    const mobile=u.pathname.startsWith('/m/');
    return res.end(`<!doctype html><meta charset="utf-8"><form id="product"><select name="option"><option value="">선택</option><option value="silver">실버</option></select><input name="quantity" value="1"><div class="shopdetailButtonTop"><a ${mobile?'class="cart"':'id="cartBtn"'} href="#" onclick="event.preventDefault();window.cartResult={option:document.querySelector('select').value,quantity:document.querySelector('input').value};">장바구니</a></div></form>`);
  }
  if(u.pathname==='/product.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="pink"/></svg>')}
  res.end('fixture');
});
if(process.argv.includes('--serve')) {
  server.listen(8765,'0.0.0.0',()=>console.log('Local test fixture: http://127.0.0.1:8765/pc'));
} else (async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true});
  try{
    for(const mobile of [false,true]){
      const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1400,height:1000}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
      await page.goto(origin+(mobile?'/m/':'/pc'));
      const child=page.frameLocator('[data-test-frame]');
      await child.locator('article').first().waitFor();
      assert.equal(await child.locator('article').count(),3);
      assert.deepEqual(await page.evaluate(()=>fixtureCalls),[]);
      const config=await page.locator('[data-test-frame]').evaluate(e=>JSON.parse(e.srcdoc.match(/const config = (\{[^\n]+\});/)[1]));
      await page.evaluate(cfg=>window.postMessage({channel:'pinkrocket-preview-v1',token:cfg.token,action:'wish',uid:'1001',requestId:2},location.origin),config);
      const cf=page.frames().find(f=>f.url()==='about:srcdoc');
      await cf.evaluate(cfg=>{
        parent.postMessage({channel:'pinkrocket-preview-v1',token:'wrong',action:'wish',uid:'1001',requestId:50},cfg.parentOrigin);
        parent.postMessage({channel:'pinkrocket-preview-v1',token:cfg.token,action:'wish',uid:'9999',requestId:50},cfg.parentOrigin);
      },config);
      await child.locator('button').first().click();
      await page.waitForFunction(()=>fixtureCalls.length===1);
      assert.deepEqual(await page.evaluate(()=>fixtureCalls),['1001']);
      await child.locator('article').first().locator('[data-uid]').filter({hasText:'켜짐'}).waitFor();
      await cf.evaluate(cfg=>parent.postMessage({channel:'pinkrocket-preview-v1',token:cfg.token,action:'wish',uid:'1001',requestId:2},cfg.parentOrigin),config);
      assert.equal(await page.evaluate(()=>fixtureCalls.length),1);
      await page.waitForTimeout(1250);
      await child.locator('button').first().click();
      await page.waitForFunction(()=>fixtureCalls.length===2);
      await child.locator('article').first().locator('[data-uid]').filter({hasText:'꺼짐'}).waitFor();
      await child.getByText('옵션 선택·장바구니 테스트').first().click();
      const native=page.frameLocator('[data-detail-frame]');
      await native.locator('select').selectOption('silver');
      await native.locator('input').fill('2');
      await page.locator('[data-execute-cart]:not([disabled])').waitFor();
      await page.waitForTimeout(1250);
      await page.locator('[data-execute-cart]').click();
      assert.deepEqual(await page.locator('[data-detail-frame]').evaluate(e=>e.contentWindow.cartResult),{option:'silver',quantity:'2'});
      await page.locator('[data-close-options]').click();
      assert.equal(await page.locator('[data-options]').isVisible(),false);
      assert.equal(await page.locator('[data-native-cart]').getAttribute('href'),origin+(mobile?'/m/basket.html':'/shop/basket.html'));
      await page.locator('[data-refresh]').click();
      assert.equal(await child.locator('article').count(),3);
      await page.screenshot({path:path.join(__dirname,`qa-${mobile?'mobile':'pc'}.png`),fullPage:true});
      assert.deepEqual(errors,[]);
      console.log(`${mobile?'Mobile':'PC'} PASS: catalog, no auto write, source/token/UID/replay checks, wish toggle, native options/cart button, navigation links, refresh, no JS errors`);
      await page.close();
    }
  }finally{await browser.close();server.close()}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
