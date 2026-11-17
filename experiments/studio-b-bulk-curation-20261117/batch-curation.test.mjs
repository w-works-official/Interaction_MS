import test from "node:test";
import assert from "node:assert/strict";
import {planBatchMove,applyBatchToDraft,comparePublished} from "./batch-curation.mjs";

test("stable selection follows current full order, not selection-click order",()=>{
 const p=planBatchMove({visibleOrder:["a","b","c","d","e"],selectedIds:["e","d"],targetId:"b",placement:"after",pinnedIds:["a"]});
 assert.deepEqual(p.nextOrder,["a","b","d","e","c"]);
 assert.equal(p.changed,true);
});
test("cross pinned boundary rejected",()=>{
 assert.throws(()=>planBatchMove({visibleOrder:["a","b","c"],selectedIds:["a"],targetId:"c",pinnedIds:["a"]}),/고정 상품/);
});
test("ranking mode rejects manual move",()=>{
 assert.throws(()=>planBatchMove({visibleOrder:["a","b","c"],selectedIds:["b"],targetId:"a",rankingEnabled:true}),/점수 기반/);
});
test("selected target rejected",()=>{
 assert.throws(()=>planBatchMove({visibleOrder:["a","b","c"],selectedIds:["b"],targetId:"b"}),/기준 상품/);
});
test("latent/excluded order and unrelated config preserved without mutation",()=>{
 const cfg={tabs:{추천:{manual:["outside"],pins:["a"],excluded:["hidden"],sort:"recommended",hideSoldout:false},반지:{manual:["z"],pins:[],excluded:[]}}};
 const result=applyBatchToDraft({config:cfg,tab:"추천",oldVisibleOrder:["a","b","c","d"],nextVisibleOrder:["a","d","b","c"],fullOrder:["a","b","hidden","c","d"]});
 assert.deepEqual(result.tabs.추천.manual,["outside","a","d","hidden","b","c"]);
 assert.deepEqual(result.tabs.추천.excluded,["hidden"]);
 assert.deepEqual(result.tabs.반지,cfg.tabs.반지);
 assert.deepEqual(cfg.tabs.추천.manual,["outside"]);
});
test("published vs draft diff includes unknown products",()=>{
 const result=comparePublished({publishedOrder:["a","b","c"],draftOrder:["b","a","d"]});
 assert.equal(result.changedCount,3);
 assert.equal(result.rows.find(x=>x.id==="d").publishedRank,null);
});
test("duplicate or missing IDs fail closed",()=>{
 assert.throws(()=>planBatchMove({visibleOrder:["a","a"],selectedIds:["a"],targetId:"a"}),/duplicate/);
 assert.throws(()=>planBatchMove({visibleOrder:["a","b"],selectedIds:["x"],targetId:"a"}),/범위 밖/);
});
