import json,urllib.request,urllib.parse,concurrent.futures,os,lxml.html as L
from PIL import Image
ROOT='/workspace/sites/pinkrocket-browse-studio';W=ROOT+'/asset-work';A=ROOT+'/dist/assets'
sel=json.load(open(W+'/selected.json'));tasks=[]
for x in sel:
 f=W+'/detail-'+x['id']+'.html'
 if not os.path.exists(f):continue
 d=L.fromstring(open(f,'rb').read().decode('euc-kr','replace'))
 urls=d.xpath('//div[contains(@class,"ck-content")]//img/@src'); urls=[u for u in urls if '/item/' in u or '/st_cream/p/' in u]
 for i,u in enumerate(urls[1:3],2):tasks.append((x['id'],i,u))
def f(t):
 uid,i,u=t;path=W+'/extra-'+uid+'-'+str(i)+'.jpg'
 try:
  b=urllib.request.urlopen(u,timeout=30).read();open(path,'wb').write(b);im=Image.open(path);print(uid,i,im.size,flush=True)
  return {'id':uid,'index':i,'url':u,'path':path,'size':list(im.size)}
 except Exception as e:print(uid,i,str(e),flush=True);return None
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as e:r=list(e.map(f,tasks))
json.dump([x for x in r if x],open(W+'/extras.json','w'),ensure_ascii=False,indent=2)
