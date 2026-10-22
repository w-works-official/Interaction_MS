# 상품 ID별 사진 목록

`dist/assets/product-images.json`은 기존 카탈로그의 사진 URL을 상품 ID별로 조회하는 정적 목록입니다. 최초 데이터는 기존 2,379개 상품의 사진 URL 2,387개를 그대로 보존합니다. 이 중 실제 다중 사진은 4개 상품이며 각 3장입니다. 나머지 2,375개 상품은 대표 사진 1장입니다.

**메이크샵 전체 상품의 추가 사진을 수집하거나 동기화한 결과가 아닙니다.** `coverage.additionalImagesComplete`는 항상 `false`입니다. URL을 기록했다고 현재 원격 이미지의 응답·상품의 판매 상태까지 확인한 것은 아닙니다. 생성기와 조회 함수는 네트워크·계정 기능·이미지 다운로드를 실행하지 않습니다.

## JSON과 조회 API

```json
{
  "schema": 1,
  "products": {
    "2085891": {
      "images": ["assets/product-2085891-1.jpg", "assets/product-2085891-2.jpg", "assets/product-2085891-3.jpg"],
      "source": "catalog-snapshot"
    }
  },
  "coverage": {
    "catalogProducts": 2379,
    "indexedProducts": 2379,
    "multiImageProducts": 4,
    "imageUrls": 2387,
    "sourceCounts": {"catalog-snapshot": 2379},
    "additionalImagesComplete": false
  }
}
```

위 예시는 한 항목만 보여줍니다. 실제 파일에는 2,379개 항목이 있습니다. `source`는 입력 자료의 출처 표시이며, URL 실재나 전체 수집 완료를 인증하지 않습니다. 최초 목록은 `catalog-snapshot`, 이후 입력은 사용자가 지정한 출처를 기록합니다. 생성 시간은 넣지 않아 같은 입력에서 같은 파일을 생성합니다.

```js
import {createProductImageLookup} from './product-images.js?v=1';

// catalog와 JSON은 앱 시작 시 각각 한 번 읽습니다.
// JSON 요청 실패 때는 manifest=null로 조회 함수를 만들면 됩니다.
const getProductImages = createProductImageLookup(catalog, manifest);
catalog = catalog.map(product => ({...product, images: getProductImages(product.id)}));

const images = getProductImages('2085891'); // 동기 배열 반환, 조회마다 네트워크 요청 없음
console.log(getProductImages.report);
```

준비 단계는 카탈로그와 목록 크기에 비례하고, 이후 조회는 Map을 사용합니다. 반환 배열을 수정해도 다른 조회 결과·입력 카탈로그·JSON은 변하지 않습니다. 원본 상품 순서·이름·태그·분류·가격·고정/제외·초안/공개 설정은 이 모듈에서 바꾸지 않습니다.

- 상품 ID는 양의 숫자 문자열입니다. 앞자리 0·공백·쿼리·소수는 거부하며, 안전한 양의 정수 인수는 문자열로 변환합니다.
- 누락/잘못된 JSON은 기존 `catalog.images`로 돌아갑니다. 일부 항목만 잘못되면 해당 상품만 기존 사진을 유지합니다.
- 카탈로그에 없는 ID는 새 상품으로 추가하지 않습니다. 조회 결과는 `[]`, 보고에는 `unknownIds`로 표시합니다.
- 새 자료에 사진 1장만 있는데 기존 사진이 여러 장이면 기존 갤러리를 유지합니다. 2장 이상의 유효한 새 목록은 그 순서로 교체합니다.
- 같은 URL은 처음 등장한 순서대로 한 번만 보관합니다. 이미지 파일을 복제하거나 추가 사진 URL을 추측하지 않습니다. 서로 다른 URL이 같은 사진인지는 다운로드하지 않으므로 판별하지 못합니다.
- 기본 원격 호스트는 `pink-rocket.com`, `www.pink-rocket.com`이며 HTTPS만 허용합니다. 로컬 `assets/`의 일반 이미지 경로도 허용합니다. 인증정보·위험한 스킴·임의 호스트·포트·fragment·공백/제어 문자·경로 탈출은 거부합니다.
- 확인한 외부 CDN이 필요하면 조회 옵션 `allowedHosts:['검증한-CDN-호스트']`를 명시하고 아래 생성기에도 같은 호스트를 전달합니다. JSON의 출처 문자열이 허용 호스트를 추가하지는 않습니다.

`getProductImages.report`는 `state`, `catalogProducts`, `appliedProducts`, `preservedGalleries`, `invalidIds`, `unknownIds`, `additionalImagesComplete`를 제공합니다. 잘못된 원본 카탈로그 이미지까지 안전하지 않은 형태로 유지하지는 않습니다.

## 최초 JSON 생성

저장소 루트에서 실행합니다. 기존 `npm ci`로 설치하는 jsdom을 HTML의 비활성 파서로만 사용합니다. 별도 라이브러리 설치나 프레임워크 빌드는 없습니다.

```powershell
node scripts/product-images.mjs init --catalog dist/assets/catalog.json --output dist/assets/product-images.json
```

기존 출력 파일이 있으면 초기화를 거부합니다. 승인된 초기화가 필요한 경우에만 `--force`를 추가합니다. 이후 수집한 자료를 유지하려면 초기화 대신 병합을 사용합니다. 카탈로그·수집 원본 파일을 출력 대상으로 덮어쓰는 것은 거부합니다.

## 메이크샵에서 얻은 출력 자료

공식 갤러리 태그는 지원되는 **메이크샵 상품 루프 안에서 서버가 해석한 결과**가 필요합니다. Cloudflare 같은 외부 프론트에서 가상 태그를 직접 해석하지 않습니다. 기존 반응형 원본 메인에는 대표 이미지가 있고 전체 추가 사진 출력은 없으므로 원본 파일만으로 2,379개의 전체 갤러리를 복원할 수 없습니다.

복사 스킨에서 실제 출력된 상품 ID와 URL을 다음 데이터 마크업으로 감쌉니다. 아래의 `실제 출력된 ...` 부분은 형식 설명용이며 URL이 아닙니다. 이 문서는 가상 태그의 특정 루프 문법을 새로 가정하거나 메이크샵 화면을 저장하지 않습니다. 별도 복붙 출력 코드가 같은 marker를 사용하면 가져오기 생성기를 재사용할 수 있습니다.

```html
<template>
  <div data-product-images-id="실제 출력된 상품 ID">
    <span data-product-image-url="실제 출력된 첫 이미지 URL"></span>
    <span data-product-image-url="실제 출력된 두 번째 이미지 URL"></span>
  </div>
</template>
```

marker는 `<template>` 자체가 아니라 내부 요소에 둡니다. 그 안의 원본 갤러리 `img[src]`와 `img[data-src]`도 읽습니다. `data-product-image-url`을 우선하고, 그 외 img에서는 `data-src`를 `src`보다 우선합니다. `a[href]`는 상세 링크일 수 있어 수집하지 않습니다. `<template>`/URL 속성 출력은 숨긴 `<img src>`가 방문자 브라우저에서 불필요한 이미지 다운로드를 시작하는 문제도 피할 수 있습니다. 단순히 `display:none`으로 숨기는 것만으로 다운로드가 방지되는 것은 아닙니다.

또는 다음 JSON을 전달합니다. URL은 설명용 값이므로 실제 출력 URL로 대체해야 합니다.

```json
[
  {"id":"2085891","images":["실제 첫 이미지의 HTTPS URL","실제 두 번째 이미지의 HTTPS URL"]}
]
```

`{schema:1,products:{상품ID:{images:[...],source:"..."}}}` 형식도 받습니다. 명령의 `--source`를 이번 입력 전체의 출처로 사용합니다. 같은 상품이 여러 루프에 나왔으면 사진 URL을 등장 순서대로 합칩니다.

## 검증 후 병합

```powershell
node scripts/product-images.mjs merge --catalog dist/assets/catalog.json --manifest dist/assets/product-images.json --input collected-gallery.html --source copied-skin-preview --base-url https://www.pink-rocket.com/ --output dist/assets/product-images.json
```

수집 JSON 파일도 `--input collected-gallery.json`으로 전달합니다. 확장자와 다르면 `--format html` 또는 `--format json`을 명시합니다. 상대 경로·`//` URL은 `--base-url`을 기준으로 HTTPS URL로 바꿉니다. 수집 자료가 로컬 `assets/` URL을 주장하는 것은 거부하며, 기존 카탈로그의 로컬 갤러리는 유지합니다. 확인한 CDN은 `--allow-host 확인한-CDN-호스트`를 필요한 만큼 추가합니다.

- 수집 파일은 최대 10MiB, 상품 사진은 ID당 최대 40장입니다.
- 미해석 `<!--/.../-->` 태그·빈 사진 목록·잘못된 ID/URL·중첩 상품 marker가 있으면 **입력 전체를 거부**합니다. 기존 JSON 파일은 그대로 남습니다.
- 유효한 입력만 검사 완료 후 임시 파일에서 교체합니다. 이름/ID만 바뀐 가짜 URL이나 누락 사진을 임의 생성하지 않습니다.
- 기존 JSON과 카탈로그에 있는 나머지 상품은 보존합니다. 기존 JSON에 없는 상품도 카탈로그 사진으로 유지합니다.
- 카탈로그에 없는 수집 ID는 무시하고 `ignoredUnknownIds`로 보고합니다. 상품 추가는 별도 카탈로그 갱신 범위입니다.
- 결과 보고의 `inputRows`, `inputProducts`, `importedProducts`, `preservedGalleries`, `ignoredUnknownIds`와 `coverage.sourceCounts`를 확인합니다. `indexedProducts:2379`는 대표 사진을 포함한 목록 수이며 전체 추가 사진 수집 완료라는 의미가 아닙니다.

이 도구는 부모→iframe 사진 메시지를 추가하거나 실시간 동기화를 수행하지 않습니다. 부모에서 전달하려면 기존 origin/source/session 검증을 유지한 별도 bridge 액션이 필요합니다. 브라우저가 모든 상세를 미리 열어 사진을 모으는 방식은 사용하지 않습니다.

## 검증

```powershell
node --check dist/product-images.js
node --check scripts/product-images.mjs
node --test tests/product-images.test.js
```

단위 테스트는 기존 2,379개 사진 배열의 순서 일치, fallback·ID/URL 검증·다중 사진 보존, 비활성 HTML/JSON 파싱과 원자적 CLI 병합을 확인합니다. 로컬 fixture 테스트는 실제 메이크샵 출력·전체 원격 이미지 접근·모바일 실기기·계정 저장 검증을 대체하지 않습니다.
