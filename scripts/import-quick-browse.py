"""Convert the approved public snapshot without executing its JavaScript.
Run from the checkout; --source-html is a locally fetched copy of the pinned index.html.
This imports a snapshot, not a Makeshop crawler or scheduled synchronization.
"""
import argparse,collections,hashlib,json,re
from pathlib import Path
from urllib.parse import quote

parser=argparse.ArgumentParser()
parser.add_argument('--source-html',required=True)
parser.add_argument('--source-commit',required=True)
args=parser.parse_args()
text=Path(args.source_html).read_text(encoding='utf8')
rows=json.loads(re.search(r'window.QB_PRODUCTS=(\[.*?\]);',text,re.S).group(1))
tags=json.loads(re.search(r'window.QB_TAGS=(\{.*?\});',text,re.S).group(1))
overrides=json.loads(Path('scripts/gallery-overrides.json').read_text())
by_id={str(p['id']):p for p in overrides}
item_map={'피어싱':['피어싱'],'피어싱귀걸이':['피어싱','귀걸이'],'귀걸이/귀찌':['귀걸이'],'반지/토우링':['반지'],'목걸이':['목걸이'],'팔찌/발찌':['팔찌'],'헤어':['헤어']}
material_map={'써지컬스틸':'써지컬','925실버':'925 실버','14K골드':'골드'}
accepted=[];excluded=[];seen=set()
for row in rows:
 reasons=[]
 if len(row)!=13:raise ValueError('Unexpected source row schema')
 uid,name,price,list_price,image,colors,*bits=row
 uid=str(uid);name=str(name).strip()
 if not uid.isdigit() or uid in seen:reasons.append('invalid-or-duplicate-id')
 if not name or name=='(상품명 없음)':reasons.append('missing-name')
 if not isinstance(price,(int,float)) or price<=0:reasons.append('missing-or-invalid-price')
 if not image or not re.fullmatch(r'[\w.\-]+',image):reasons.append('missing-or-invalid-image')
 seen.add(uid)
 if reasons:excluded.append({'id':uid,'name':name,'price':price,'reasons':reasons});continue
 labels={key:[label for i,label in enumerate(tags[key]) if bits[j]&(1<<i)] for j,key in enumerate(['item','material','color','shape','motif','spot','bar'])}
 categories=list(dict.fromkeys(c for label in labels['item'] for c in item_map.get(label,[])))
 classification='snapshot-tags'
 if not categories:
  categories=[by_id.get(uid,{}).get('category','미분류')]
  classification='previous-preview-inference' if uid in by_id else 'unclassified'
 materials=[material_map.get(x,x) for x in labels['material']] or ['기타']
 images=by_id.get(uid,{}).get('images') or ['https://www.pink-rocket.com/shopimages/curiouswiz/'+quote(image)]
 accepted.append({'id':uid,'name':name,'price':price,'listPrice':list_price,'images':images,'category':categories[0],'categories':categories,'classificationSource':classification,'material':materials[0],'materials':materials,'tags':labels,'colors':colors,'source':'quick-browse-snapshot','sourceCollectedAt':'2026-10-13','stockStatus':'unknown'})
# Keep the already reviewed gallery examples at the front; this is demo curation, not sales rank.
order={p['id']:i for i,p in enumerate(overrides)}
accepted.sort(key=lambda p:(0,order[p['id']]) if p['id'] in order else (1,-int(p['id'])))
meta={'repository':'https://github.com/kakamail80-cell/pinkrocket-quick-browse','commit':args.source_commit,'sourcePath':'index.html','sourceSha256':hashlib.sha256(text.encode()).hexdigest(),'collectedAt':'2026-10-13','dateEvidence':'source HTML comment; not independently verified','totalSource':len(rows),'accepted':len(accepted),'excluded':len(excluded),'unclassified':sum(p['classificationSource']=='unclassified' for p in accepted),'categoryCounts':{c:sum(c in p['categories'] for p in accepted) for c in ['피어싱','귀걸이','반지','목걸이','팔찌','헤어']},'ranking':'Existing reviewed gallery examples first, remaining IDs descending. Demo curation only. No release date, review, sales or stock feed.','imagePolicy':'Existing verified local galleries preserved by ID; all other products have one remote representative image.'}
Path('dist/assets/catalog.json').write_text(json.dumps(accepted,ensure_ascii=False,separators=(',',':'))+'\n')
Path('dist/assets/catalog-meta.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
Path('scripts/catalog-excluded.json').write_text(json.dumps(excluded,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(meta,ensure_ascii=False))
