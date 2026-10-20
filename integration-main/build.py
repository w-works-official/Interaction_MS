"""Generate the copied Makeshop main-page preview shells without changing a shop."""

from pathlib import Path
import json
import re
import zipfile


BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
OUTPUT = ROOT / 'outputs' / 'makeshop-main-preview'
ARCHIVE = ROOT / 'outputs' / 'pinkrocket_makeshop_main_preview.zip'
PLATFORMS = [('pc', '01_MAIN_IFRAME_PC.txt'), ('mobile', '02_MAIN_IFRAME_MOBILE.txt')]


def generate():
    model = (ROOT / 'dist' / 'model.js').read_text(encoding='utf-8')
    # The shared exported helper ends with an unindented closing brace.
    # Fail visibly if its source layout changes rather than copy a second URL rule.
    matches = re.findall(
        r'^export (function makeshopDetailUrl\([^\n]*\)\s*\{\n.*?^\})$',
        model,
        re.MULTILINE | re.DOTALL,
    )
    if len(matches) != 1:
        raise ValueError('Expected one exported makeshopDetailUrl in dist/model.js')
    parent = (BASE / 'parent.js').read_text(encoding='utf-8')
    helper_marker = 'DETAIL_URL_HELPER_PLACEHOLDER'
    if parent.count(helper_marker) != 1:
        raise ValueError('Expected exactly one DETAIL_URL_HELPER_PLACEHOLDER in parent.js')
    parent = parent.replace(helper_marker, matches[0])
    css_marker = 'DETAIL_VIEW_CSS_PLACEHOLDER'
    if parent.count(css_marker) != 1:
        raise ValueError('Expected one DETAIL_VIEW_CSS_PLACEHOLDER in parent.js')
    parent = parent.replace(css_marker, json.dumps((BASE / 'detail-view.css').read_text(encoding='utf-8'), ensure_ascii=False))
    wish_marker = 'PRODUCT_WISHLIST_ADAPTER_PLACEHOLDER'
    if parent.count(wish_marker) != 1:
        raise ValueError('Expected one PRODUCT_WISHLIST_ADAPTER_PLACEHOLDER in parent.js')
    wish_source = (BASE / 'product-wishlist.js').read_text(encoding='utf-8')
    export_pattern = r'^export (?=function createProductWishlistAdapter\()'
    if len(re.findall(export_pattern, wish_source, re.MULTILINE)) != 1:
        raise ValueError('Expected the standalone product wishlist adapter export')
    parent = parent.replace(wish_marker, re.sub(export_pattern, '', wish_source, flags=re.MULTILINE).rstrip())
    parent = re.sub(r'</script', r'<\\/script', parent, flags=re.IGNORECASE)

    shell = (BASE / 'shell.html').read_text(encoding='utf-8')
    for marker in ['PLATFORM_PLACEHOLDER', 'PARENT_SCRIPT']:
        if shell.count(marker) != 1:
            raise ValueError(f'Expected exactly one {marker} in shell.html')
    if '<!--/include_header' in shell or '<!--/include_footer' in shell:
        raise ValueError('The replacement shell must not include the old main header/footer')
    files = {}
    for platform, name in PLATFORMS:
        content = shell.replace('PLATFORM_PLACEHOLDER', platform).replace('PARENT_SCRIPT', parent)
        if any(marker in content for marker in [helper_marker, css_marker, wish_marker, 'PLATFORM_PLACEHOLDER', 'PARENT_SCRIPT']):
            raise ValueError(f'Unresolved generation marker in {name}')
        if content.count(f'id="pr-makeshop-main" data-platform="{platform}"') != 1:
            raise ValueError(f'Platform marker is missing or duplicated in {name}')
        content = content.rstrip() + '\n'
        (BASE / name).write_text(content, encoding='utf-8', newline='\n')
        files[name] = content.encode('utf-8')

    readme = (BASE / '00_README_KO.txt').read_text(encoding='utf-8').rstrip() + '\n'
    files['00_README_KO.txt'] = readme.encode('utf-8')
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (OUTPUT / name).write_bytes(data)
    # Fixed names, ordering, timestamps and permissions make repeat builds identical.
    with zipfile.ZipFile(ARCHIVE, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(files):
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            entry.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(entry, files[name], compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    print('Generated copied-skin preview shells: ' + ', '.join(files))
    print('Archive: outputs/pinkrocket_makeshop_main_preview.zip')


if __name__ == '__main__':
    generate()
