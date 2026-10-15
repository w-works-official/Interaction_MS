import json,urllib.request,urllib.parse,concurrent.futures,os,re,lxml.html as L
from PIL import Image
ROOT='/workspace/sites/pinkrocket-browse-studio'; WORK=ROOT+'/asset-work'; ASSETS=ROOT+'/dist/assets'
p=json.load(open(WORK+'/candidates.json')); ids=[0,2,10,11,16,25,48,60,64,66,69,80,81,88,89,93,104,107]
selected=[p[i] for i in ids]
def get(url,path):
 try:
  b=urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=40).read();open(path,'wb').write(b);return True
 except Exception as e: return str(e)
def thumb(x):
 path=ASSETS+'/product-'+x['id']+'-1.jpg'; tmp=path+'.tmp';r=get(x['thumb'],tmp)
 if r is True:
  try:
   im=Image.open(tmp); im.convert('RGB').save(path,quality=91);x['images']=['assets/'+os.path.basename(path)];x['originalImageSize']=list(im.size);os.unlink(tmp)
  except Exception as e: print(x['id'],'image failed',str(e),flush=True)
 print('thumb',x['id'],r,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as e:list(e.map(thumb,selected))
json.dump(selected,open(WORK+'/selected.json','w'),ensure_ascii=False,indent=2)
def detail(x):
 path=WORK+'/detail-'+x['id']+'.html';r=get(x['detailUrl'],path);print('detail',x['id'],r,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as e:list(e.map(detail,selected[:8]+[selected[11],selected[13],selected[16],selected[17]]))
