from pathlib import Path
import json
import zipfile

base = Path(__file__).parent
out = base.parent / 'outputs' / 'makeshop-preview-test'
out.mkdir(parents=True, exist_ok=True)
child = (base / 'child.js').read_text()
parent = (base / 'parent.js').read_text().replace('CHILD_SOURCE_PLACEHOLDER', json.dumps(child, ensure_ascii=False).replace('<', '\\u003c'))
shell = '''<!-- PINKROCKET_PREVIEW_TEST_START -->
<style>
#pr-preview-test-v1{clear:both;box-sizing:border-box;width:100%;padding:20px;background:#fff7fb;border:2px dashed #bc4c82;color:#25212a;font:14px/1.6 sans-serif;text-align:left}
#pr-preview-test-v1 *{box-sizing:border-box}
#pr-preview-test-v1 [hidden]{display:none!important}
#pr-preview-test-v1 button,#pr-preview-test-v1 a{display:inline-block;margin:4px;padding:8px 12px;border:1px solid #a33c6b;border-radius:6px;color:#712447;background:white;font:inherit;cursor:pointer}
#pr-preview-test-v1 h2{font:700 20px/1.4 sans-serif;margin:0 0 8px}
#pr-preview-test-v1 p{margin:8px 0;overflow-wrap:anywhere}
#pr-preview-test-v1 iframe[data-test-frame]{display:block;width:100%;height:650px;background:white;border:1px solid #ddd}
#pr-preview-test-v1 [data-log]{margin:12px 0;max-height:160px;overflow:auto;padding-left:24px;font-size:12px}
#pr-preview-test-v1 [data-options]{position:fixed;inset:12px;z-index:2147483000;background:white;box-shadow:0 0 0 100vmax #0008;padding:12px;display:flex;flex-direction:column;gap:6px}
#pr-preview-test-v1 [data-detail-frame]{flex:1;min-height:0;width:100%;border:1px solid #ddd}
#pr-preview-test-v1 button:disabled{opacity:.45;cursor:not-allowed}
</style>
<section id="pr-preview-test-v1">
  <h2>찜·장바구니 미리보기 테스트</h2>
  <p>원래 메인의 상품 최대 3개를 사용합니다. 실제 계정에 반영될 수 있으니 테스트 계정으로 확인하세요.</p>
  <p>대표님 목업과 별도로 만든 연결 시험 화면입니다. 아래 찜 버튼은 기존 찜 버튼을, 장바구니는 기존 상세의 옵션·담기 기능을 사용합니다.</p>
  <button type="button" data-refresh>상품 다시 읽기</button>
  <a data-native-wishlist target="_blank" rel="noopener">찜 목록에서 확인</a>
  <a data-native-cart target="_blank" rel="noopener" hidden>장바구니 목록에서 확인</a>
  <p data-status role="status" aria-live="polite">코드 준비 중…</p>
  <iframe data-test-frame title="찜·장바구니 연결 시험" sandbox="allow-scripts"></iframe>
  <ol data-log aria-label="테스트 기록"></ol>
  <div data-options hidden role="dialog" aria-modal="true" aria-label="기존 상세 옵션·장바구니 시험">
    <div><button type="button" data-close-options>닫기</button><button type="button" data-open-detail>원본 상세에서 확인</button></div>
    <p>아래는 기존 상세입니다. 옵션·수량을 선택한 다음 ‘선택한 옵션으로 담기 요청’을 누르세요. 기존 상세 버튼으로 직접 담았다면 중복해서 누르지 마세요.</p>
    <button type="button" data-execute-cart disabled>선택한 옵션으로 담기 요청</button>
    <iframe data-detail-frame title="메이크샵 기존 상세와 옵션" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"></iframe>
  </div>
</section>
<script>
PARENT_SCRIPT
</script>
<!-- PINKROCKET_PREVIEW_TEST_END -->
'''
snippet = shell.replace('PARENT_SCRIPT', parent)
(out / '01_PASTE_BEFORE_FOOTER.txt').write_text(snippet, encoding='utf-8')
for label in ['pc', 'mobile']:
    original = (base.parent / 'skin-analysis' / f'{label}_main.html').read_bytes().decode('cp949', errors='strict')
    marker = '<!--/include_footer(1)/-->'
    assert original.count(marker) == 1
    patched = original.replace(marker, snippet+'\n'+marker)
    assert patched.replace(snippet+'\n','',1) == original
    (out / f'02_{label.upper()}_MAIN_PREVIEW_ONLY.txt').write_text(patched, encoding='utf-8')
readme = '''메이크샵 찜·장바구니 미리보기 테스트 v1

사용법
1. 현재 메인 HTML은 별도로 복사해 둡니다.
2. 01_PASTE_BEFORE_FOOTER.txt 전체를 메인 HTML의 include_footer(1) 가상태그 바로 위에 붙여넣습니다.
3. 저장·쇼핑몰 적용 없이 ‘미리보기’만 누릅니다. PC/모바일은 각각 진행합니다.
4. 아래 ‘iframe 연동 시험’에 원래 메인 상품 최대 3개가 나타나는지 봅니다.
5. 테스트 계정으로 찜 버튼을 1회 누르고, 새 탭의 찜 목록에서 해당 상품을 확인합니다. 취소도 시험합니다.
6. ‘옵션 선택·장바구니 테스트’를 누릅니다. 기존 상세 안에서 옵션·수량을 선택하고 위의 ‘선택한 옵션으로 담기 요청’을 1회 누릅니다.
7. 메이크샵 안내를 확인한 뒤 기존 장바구니 목록에서 상품·옵션·수량을 확인합니다.
8. 완료 후 편집창을 닫거나 추가한 START~END 부분을 지웁니다. 테스트용 찜/장바구니 항목도 필요하면 정리합니다.

파일 선택
- 01은 추가할 부분만 담은 권장 파일입니다. 현재 편집 소스에 추가하세요.
- 02_PC/02_MOBILE은 2026-10-15 드라이브 백업 메인 전체에 같은 코드를 추가한 편의 파일입니다.
  이후 다른 수정이 있었다면 전체 교체하지 말고 01만 사용하세요. 이 파일들은 미리보기 전용이며 자동 적용되지 않습니다.
- 텍스트는 UTF-8입니다. 파일을 열어 복사·붙여넣기 하세요. 메이크샵 업로드용 tar 파일은 아닙니다.

확인된 소스 재사용
- 찜: 원래 메인의 .my-wish-list[data-uid] 요소 자체를 클릭합니다. API/비공개 함수명을 추측하지 않습니다.
- 상품: 기존 .listPic의 링크·이미지와 .listName을 읽습니다. 숫자 상품 ID와 상세 URL의 branduid가 일치하는 것만 사용합니다.
- 장바구니: PC 상세 #cartBtn 또는 모바일 .shopdetailButtonTop a.cart와 실제 상품 폼을 사용합니다.
- 옵션: 기존 상세 iframe 안에서 직접 선택합니다. 필수옵션·수량·가격·품절 검증을 새로 구현하거나 우회하지 않습니다.
- 목록: 찜 경로는 확인한 PC/모바일 헤더 경로를 사용하고, 장바구니 경로는 현재 헤더의 실제 링크를 읽습니다.

검증 범위와 제한
- 대표님 GitHub 목업의 버튼은 수정하지 않았으며 자동 연결되지 않습니다. 이 파일은 연결 가능성을 시험하는 독립 테스트 iframe입니다.
- 테스트 iframe은 srcdoc와 sandbox를 사용합니다. 서로 다른 출처 사이의 메시지 전달과 기존 메이크샵 버튼 호출을 시험합니다.
  실제 GitHub 주소에 연결할 때는 목업 쪽도 수정하고 정확한 origin과 프레임 검증으로 전환해야 합니다.
- 실행 직후 자동으로 찜/장바구니를 변경하지 않습니다. 직접 누른 요청만 처리하며 자동 재시도하지 않습니다.
- ‘클릭 전달’이나 하트 이미지 변화는 서버 저장 성공의 증거가 아닙니다. 실제 목록의 상품/옵션/수량으로 판정합니다.
- 백업에는 메이크샵이 서버에서 생성하는 실제 처리 함수와 전체 런타임이 없어, 실제 연결 성공은 상점 미리보기에서 확인해야 합니다.
- 로컬에서는 JavaScript 문법과 원본 메인 보존·가상태그 보존을 검사했습니다.
  브라우저 실행 파일을 설치할 수 없었고 원격 브라우저도 로컬 서버에 연결할 수 없어 브라우저 실행 검증은 완료하지 못했습니다.
  실제 상점이나 사용자 계정의 찜/장바구니에는 접근하거나 쓰지 않았습니다. 실제 미리보기 시험이 남아 있습니다.
- 상세를 iframe으로 열 수 없는 정책, 다른 도메인 이동, 메인 상품 미노출, 달라진 스킨 구조는 실패 이유로 표시됩니다.
- 기존 상세를 재사용하므로 ‘상세를 전혀 거치지 않는 독자 옵션 UI’까지 검증한 것은 아닙니다.
- 모바일은 메이크샵 모바일 미리보기에서도 확인하고 가능하면 실제 휴대폰에서도 시험하세요.

참고 원본
Drive: 2026_Work/Makeshop/PC 및 Mobile, main.html·header.1.html·shopdetail.html.
PC main: https://drive.google.com/file/d/11ATrpGup3KRMqFmKFmpW3yrH_D4YfcOl/view
Mobile main: https://drive.google.com/file/d/11G27WlsrQdfLZOLxz5WrurvE2e4oL2wV/view
PC detail: https://drive.google.com/file/d/1KITJgbRqniomv_1Y9BdS3yK2XXNfUfLD/view
Mobile detail: https://drive.google.com/file/d/1o-4-H6yVj7f7I1siu97FAnXPYOb3K7nZ/view
'''
(out / '00_README_KO.txt').write_text(readme,encoding='utf-8')
# The archive is the sole delivery file; rebuild after verification.
with zipfile.ZipFile(out.parent/'pinkrocket_makeshop_preview_test_v1.zip','w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(out.iterdir()): z.write(f, f.name)
print(out)
