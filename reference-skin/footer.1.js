jQuery(function() {
    var top_scroll = jQuery('.scroll_bt_tll');
    jQuery(window).scroll(function () {
        var winTop = jQuery(this).scrollTop();
        if (winTop >= 200 ) {
            top_scroll.fadeIn('fast');
        } else if (winTop <= 200 ) {
            top_scroll.fadeOut('fast');
        }
    });

    // 탑 이동버튼
    jQuery(document).ready(function(){
        jQuery('.-top_sc').click(function(){
            jQuery('html, body').animate({
                scrollTop:0
            },500);
        });
    });

    // 하단 및 퀵메뉴 데이터 바인딩 (장바구니 0개일 때 원형 배지 미노출 조건 추가)
    jQuery(document).ready(function() {
        var cscontent = jQuery('#footer .left .mid p').html();
        jQuery('.aside_bottom p').html(cscontent);
        
        // 1. 상단 원본 장바구니 영역에서 수량 텍스트 추출
        var baketcount = jQuery('.baket_count').html();
        
        if (baketcount) {
            // 2. 괄호 ( ) 와 앞뒤 불필요한 공백 제거
            baketcount = baketcount.replace(/\(|\)/g, '').trim();
            
            // 3. 값이 비어있지 않고, 숫자 '0'이 아닐 때만 하단 퀵메뉴에 빨간 원 배지 추가
            if (baketcount !== '' && baketcount !== '0') {
                jQuery('.scroll_bt_tll .-basket_sc').append('<span class="baket_count">' + baketcount + '</span>');
            }
        }
    });
});