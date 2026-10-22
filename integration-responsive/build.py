"""Prepare UTF-8 copies of the supplied native responsive skin; never contact a shop."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import runpy


BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
DEFAULT_SOURCE = Path('C:/2026_Work/Makeshop/반응형')
SOURCE_FILES = tuple(sorted([
    'common.css', 'common.js', 'header.1.html', 'header.1.css', 'header.1.js',
    'footer.1.html', 'footer.1.css', 'footer.1.js', 'main.html', 'main.css',
    'main.js', 'shopbrand.html', 'shopbrand.css', 'shopbrand.js',
]))


def normalized_text(data):
    try:
        text, encoding = data.decode('utf-8'), 'utf-8'
    except UnicodeDecodeError:
        text, encoding = data.decode('cp949'), 'cp949'
    return text.replace('\r\n', '\n').replace('\r', '\n'), encoding


def replace_once(text, pattern, replacement, label):
    result, count = re.subn(pattern, lambda _: replacement, text, flags=re.DOTALL)
    if count != 1:
        raise ValueError(f'Expected exactly one {label}; supplied source may have changed ({count})')
    return result


def replace_div(text, element_id, replacement):
    starts = list(re.finditer(r'<div\b[^>]*\bid="' + re.escape(element_id) + r'"[^>]*>', text))
    if len(starts) != 1:
        raise ValueError(f'Expected exactly one div #{element_id}')
    start, depth = starts[0].start(), 0
    for token in re.finditer(r'<div\b[^>]*>|</div\s*>', text[start:]):
        depth += -1 if token.group().startswith('</') else 1
        if depth == 0:
            return text[:start] + replacement + text[start + token.end():]
    raise ValueError(f'Unclosed source div #{element_id}')


def classic_storefront():
    source = (ROOT / 'dist' / 'storefront.js').read_text(encoding='utf-8')
    if re.search(r'^\s*import\b', source, re.MULTILINE):
        raise ValueError('The shared storefront module must remain standalone for a native skin')
    source = re.sub(r'^export (?=(?:const|function)\b)', '', source, flags=re.MULTILINE)
    if re.search(r'^\s*export\b', source, re.MULTILINE):
        raise ValueError('Unsupported storefront export; update the classic-source adapter explicitly')
    return '// Shared source: dist/storefront.js. Edit that module and regenerate.\n' + source.rstrip() + '\n'


def render_native(originals, platform='pc'):
    if platform not in ('pc', 'mobile'):
        raise ValueError('Choose the native route explicitly: pc or mobile; viewport guessing is not supported')
    result = dict(originals)
    header = originals['header.1.html']
    header = replace_once(header, r'<div class="logo">.*?</div>',
                          '<div class="logo" data-storefront-brand data-home-href="<!--/link_home/-->"></div>', 'header logo')
    header = replace_once(header, r'<div class="menu">.*?</div>',
                          '<div class="menu" data-storefront-menu="desktop"></div>', 'desktop menu')
    header = replace_once(header, r'<div class="navCategory">.*?</nav>\s*</div>',
                          '<div class="navCategory" data-storefront-menu="side"></div>', 'side menu')
    header = replace_once(header, r'<a href="javascript:void\(0\);" class="searchBtn">.*?</a>', '', 'old desktop search toggle')
    header = replace_once(header, r'<div class="search_button only-mo">.*?</div>',
                          '<button type="button" class="search-toggle" aria-controls="storefront-search" aria-expanded="false">검색</button>', 'single search toggle')
    header = replace_once(header, r'<div class="search">\s*<div class="searchBox"></div>\s*</div>', '', 'unused copied-search container')
    header = header.replace('<div class="searchArea">', '<div class="searchArea" id="storefront-search">')
    result['header.1.html'] = header
    header_js = replace_once(originals['header.1.js'], r"    var savedSearchHtml = '';.*?\n    \}\);", '', 'copied-search handlers')
    # The source has a second handler immediately after the first one.
    header_js = replace_once(header_js, r"    jQuery\('#header \.search_button img'\).*?\n    \}\);", '', 'mobile copied-search handler')
    header_js = header_js.replace("$('.searchBtn, .search_close')", "$('.search-toggle, .search_close')")
    result['header.1.js'] = 'window.PRStorefrontNative?.apply();\n' + header_js

    main = replace_once(originals['main.html'],
                        r'<div class="swiper-container" id="mainBnr">.*?<!-- //메인 비쥬얼 배너 -->',
                        '<div class="shop-view" data-native-storefront-hero></div>\n        <!-- //메인 비쥬얼 배너 -->', 'hero banner markup')
    main = replace_div(main, 'cateSwiper', '<div class="shop-view" data-native-storefront-category-tiles></div>')
    result['main.html'] = main
    result['main.js'] = 'jQuery(function () {\nwindow.PRStorefrontNative?.apply();\n' + originals['main.js'].rstrip() + '\n});\n'

    category = replace_once(originals['shopbrand.html'], r'<ul class="only-pc">.*?</ul>\s*<div class="only-mo">\s*<!--/select_sort/-->\s*</div>',
                            '<div class="storefront-sort"><!--/select_sort/--></div>', 'single native sort control')
    result['shopbrand.html'] = category

    footer = replace_once(originals['footer.1.html'], r'<div class="logo">.*?</div>',
                          '<div class="logo" data-storefront-brand data-home-href="<!--/link_home/-->"></div>', 'footer brand')
    footer = replace_once(footer, r'<h1>CUSTOMER CENTER</h1><br>\s*<h1>.*?</h1><br>',
                          '<div class="shop-view" data-storefront-footer></div>', 'shared footer contact')
    footer = replace_once(footer, r'<div class="scroll_bt_tll">.*?</div>',
                          '<div class="scroll_bt_tll">\n'
                          '    <a href="<!--/link_basket/-->" class="-basket_sc" data-native-basket>장바구니</a>\n'
                          '    <button type="button" class="-top_sc" aria-label="맨 위로">↑</button>\n'
                          '</div>', 'single basket and top control')
    result['footer.1.html'] = footer
    runtime = (BASE / 'runtime.js').read_text(encoding='utf-8')
    if runtime.count('NATIVE_PLATFORM_PLACEHOLDER') != 1:
        raise ValueError('Expected one explicit native platform marker')
    runtime = runtime.replace('NATIVE_PLATFORM_PLACEHOLDER', json.dumps(platform))
    result['common.js'] = '(() => {\n' + classic_storefront() + '\n' + runtime.rstrip() + '\n})();\n\n' + originals['common.js']
    result['common.css'] = originals['common.css'].rstrip() + '\n\n' + (ROOT / 'dist' / 'storefront.css').read_text(encoding='utf-8').rstrip() + '\n\n' + (BASE / 'overrides.css').read_text(encoding='utf-8').rstrip() + '\n'
    return {name: text.rstrip() + '\n' for name, text in result.items()}


def generate(source_dir=DEFAULT_SOURCE, output_dir=BASE, platform='pc', frontend_url=None):
    source_dir, output_dir = Path(source_dir).resolve(), Path(output_dir).resolve()
    if not source_dir.is_dir() and source_dir == DEFAULT_SOURCE.resolve():
        source_dir = (BASE / 'source-utf8').resolve()
    if source_dir == output_dir or source_dir in output_dir.parents:
        raise ValueError('The output must be outside the original skin directory')
    snapshot_input = source_dir == (BASE / 'source-utf8').resolve()
    baseline = json.loads((BASE / 'SOURCE_MANIFEST.json').read_text(encoding='utf-8')) if snapshot_input else None
    baseline_files = {entry['file']: entry for entry in baseline['files']} if baseline else {}
    originals, entries = {}, []
    for name in SOURCE_FILES:
        data = (source_dir / name).read_bytes()
        text, encoding = normalized_text(data)
        originals[name] = text
        entry = {'file': name, 'originalBytes': len(data), 'originalSha256': hashlib.sha256(data).hexdigest(),
                 'sourceEncoding': encoding, 'snapshot': 'source-utf8/' + name, 'apply': 'apply/' + name}
        if snapshot_input:
            recorded = baseline_files[name]
            if hashlib.sha256(data).hexdigest() != recorded['snapshotSha256']:
                raise ValueError(f'The preserved UTF-8 source changed: {name}')
            for key in ('originalBytes', 'originalSha256', 'sourceEncoding'):
                entry[key] = recorded[key]
        entries.append(entry)
    generated = render_native(originals, platform)
    for directory in ('source-utf8', 'apply'):
        (output_dir / directory).mkdir(parents=True, exist_ok=True)
    for entry in entries:
        name = entry['file']
        (output_dir / entry['snapshot']).write_text(originals[name], encoding='utf-8', newline='\n')
        content = generated[name].encode('utf-8')
        (output_dir / entry['apply']).write_bytes(content)
        entry['snapshotSha256'] = hashlib.sha256(originals[name].encode('utf-8')).hexdigest()
        entry['applySha256'] = hashlib.sha256(content).hexdigest()
    manifest = {'schema': 1, 'sourceDirectory': baseline['sourceDirectory'] if baseline else str(source_dir), 'nativePlatform': platform,
                'sharedStorefrontSha256': hashlib.sha256((ROOT / 'dist' / 'storefront.js').read_bytes()).hexdigest(),
                'sharedStylesSha256': hashlib.sha256((ROOT / 'dist' / 'storefront.css').read_bytes()).hexdigest(),
                'files': entries}
    (output_dir / 'SOURCE_MANIFEST.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    if frontend_url is not None:
        bridge = runpy.run_path(str(ROOT / 'integration-main' / 'build.py'))
        shell = bridge['render_shell'](platform, frontend_url)
        viewport = '<script>if(!document.querySelector(\'meta[name="viewport"]\')){var m=document.createElement(\'meta\');m.name=\'viewport\';m.content=\'width=device-width,initial-scale=1\';document.head.appendChild(m);}</script>\n'
        (output_dir / 'OPTIONAL_MAIN_IFRAME.txt').write_text(viewport + shell, encoding='utf-8', newline='\n')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--output-dir', type=Path, default=BASE)
    parser.add_argument('--native-platform', choices=('pc', 'mobile'), default='pc')
    parser.add_argument('--frontend-url', default=os.environ.get('PINKROCKET_FRONTEND_URL'),
                        help='Optional HTTPS iframe alternative, explicitly ending in /')
    options = parser.parse_args()
    info = generate(options.source_dir, options.output_dir, options.native_platform, options.frontend_url)
    print(f"Prepared {len(info['files'])} native files; original skin unchanged; platform={info['nativePlatform']}")
