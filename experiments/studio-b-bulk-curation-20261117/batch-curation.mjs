// Isolated, review-only Studio B batch curation helper.
// No DB, API, session, storage, or network access. Integrate only after comparing current local Codex worktrees.
export function assertUniqueIds(ids,name){
  if(!Array.isArray(ids)||ids.some(x=>typeof x!=="string"||!x))throw new Error(`${name}: invalid ids`);
  if(new Set(ids).size!==ids.length)throw new Error(`${name}: duplicate ids`);
}

export function planBatchMove({visibleOrder,selectedIds,targetId,placement="before",pinnedIds=[],rankingEnabled=false}){
  assertUniqueIds(visibleOrder,"visibleOrder");
  assertUniqueIds(selectedIds,"selectedIds");
  assertUniqueIds(pinnedIds,"pinnedIds");
  if(rankingEnabled)throw new Error("점수 기반 정렬 중에는 순번 이동을 사용할 수 없습니다.");
  if(placement!=="before"&&placement!=="after")throw new Error("잘못된 이동 방향");
  if(typeof targetId!=="string"||!visibleOrder.includes(targetId))throw new Error("이동 기준 상품을 찾지 못했습니다.");
  if(selectedIds.length===0)throw new Error("이동할 상품을 선택하세요.");
  const visible=new Set(visibleOrder), selected=new Set(selectedIds), pinned=new Set(pinnedIds);
  if(selectedIds.some(id=>!visible.has(id)))throw new Error("현재 진열 범위 밖의 상품이 포함되어 있습니다.");
  if(selected.has(targetId))throw new Error("이동 기준 상품은 선택 대상에서 제외하세요.");
  const inPinnedSegment=pinned.has(targetId);
  if(selectedIds.some(id=>pinned.has(id)!==inPinnedSegment))throw new Error("고정 상품과 일반 상품은 같은 구간 안에서만 이동할 수 있습니다.");
  let seenOrdinary=false;
  for(const id of visibleOrder){if(!pinned.has(id))seenOrdinary=true;else if(seenOrdinary)throw new Error("현재 목록의 고정/일반 순서가 섞여 있습니다.");}
  const moving=visibleOrder.filter(id=>selected.has(id));
  const remaining=visibleOrder.filter(id=>!selected.has(id));
  let at=remaining.indexOf(targetId);
  if(placement==="after")at++;
  const nextOrder=[...remaining.slice(0,at),...moving,...remaining.slice(at)];
  const beforePositions=new Map(visibleOrder.map((id,i)=>[id,i+1]));
  const affected=nextOrder.map((id,i)=>({id,before:beforePositions.get(id),after:i+1})).filter(x=>x.before!==x.after);
  return {nextOrder,moving,affected,changed:affected.length>0,pinnedSegment:inPinnedSegment};
}

export function applyBatchToDraft({config,tab,oldVisibleOrder,nextVisibleOrder,fullOrder}){
  if(!config||!config.tabs||!config.tabs[tab])throw new Error("카테고리 진열 초안이 없습니다.");
  for(const [arr,name] of [[oldVisibleOrder,"oldVisibleOrder"],[nextVisibleOrder,"nextVisibleOrder"],[fullOrder,"fullOrder"]])assertUniqueIds(arr,name);
  if(oldVisibleOrder.length!==nextVisibleOrder.length||oldVisibleOrder.some(id=>!nextVisibleOrder.includes(id)))throw new Error("진열 상품 집합이 달라졌습니다.");
  if(oldVisibleOrder.some(id=>!fullOrder.includes(id)))throw new Error("전체 순서에서 현재 상품을 찾지 못했습니다.");
  const before=config.tabs[tab];
  if(!Array.isArray(before.manual)||!Array.isArray(before.pins))throw new Error("기존 진열 설정 형식이 올바르지 않습니다.");
  const pinned=new Set(before.pins);
  const oldPinned=oldVisibleOrder.filter(id=>pinned.has(id));
  const nextPinned=nextVisibleOrder.filter(id=>pinned.has(id));
  if(oldPinned.length!==nextPinned.length||nextVisibleOrder.slice(0,nextPinned.length).some(id=>!pinned.has(id)))throw new Error("고정/일반 진열 경계를 변경할 수 없습니다.");
  const visible=new Set(oldVisibleOrder);
  let cursor=0;
  const reconstructed=fullOrder.map(id=>visible.has(id)?nextVisibleOrder[cursor++]:id);
  const fullSet=new Set(fullOrder);
  const manualBase=[...new Set([...before.manual,...fullOrder])];
  cursor=0;
  const manual=manualBase.map(id=>fullSet.has(id)?reconstructed[cursor++]:id);
  cursor=0;
  const pins=before.pins.map(id=>visible.has(id)?nextPinned[cursor++]:id);
  return {...config,tabs:{...config.tabs,[tab]:{...before,manual,pins}}};
}

export function comparePublished({publishedOrder=[],draftOrder=[],limit=30}){
  assertUniqueIds(publishedOrder,"publishedOrder");
  assertUniqueIds(draftOrder,"draftOrder");
  if(!Number.isInteger(limit)||limit<1||limit>1000)throw new Error("invalid limit");
  const published=new Map(publishedOrder.map((id,i)=>[id,i+1]));
  const changeRows=draftOrder.map((id,i)=>({id,publishedRank:published.get(id)??null,draftRank:i+1,delta:published.has(id)?published.get(id)-(i+1):null})).filter(x=>x.delta===null||x.delta!==0);
  return {changedCount:changeRows.length,rows:changeRows.slice(0,limit),truncated:changeRows.length>limit};
}
