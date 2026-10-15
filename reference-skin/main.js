(function ($) {


// 磋 메인 목록 다중 이미지 bxSlider 구동 (이미지가 2장 이상일 때만 자동 작동)
jQuery('.prd-img-slider').each(function () {
    var imageCount = jQuery(this).find('img').length;
    if (imageCount > 1) {
        jQuery(this).bxSlider({
            pager: true,
            controls: false, // 좌우 화살표는 숨기고 도트 위주로 심플하게 제어
            touchEnabled: true,
            oneToOneTouch: true
        });
    }
});

// 화살표 앵커 튕김 현상 방지 오버라이딩
jQuery('.bx-controls-direction a').on('click', function() {
    return false;
});

    // 1. 메인 상단 배너 (기존 유지)
    var swiper01 = new Swiper('#mainBnr', {
        slidesPerView: 1,
        spaceBetween: 0,
        autoplay: {
            delay: 2500,
            disableOnInteraction: false,
        },
        speed: 1500,
        loop: true,
        pagination: {
            el: '.swiper-pagination',
            clickable: true,
        },
        on: {
            init: function() {
                $('.current-page').text(this.realIndex + 1);
                $('.total-pages').text(this.slides.length);
            },
            slideChange: function() {
                $('.current-page').text(this.realIndex + 1);
            },
        },
    });

// 2. 카테고리 슬라이더 (자동 이동은 없되, 손으로 넘길 때 무한 반복 루프 가능)
    var swiper02 = new Swiper("#cateSwiper", {
        loop: true,              // 드래그 및 스와이프 시 무한 루프 활성화
        slidesPerView: 6,        // PC 버전 한 화면 노출 개수
        spaceBetween: 40,
        autoplay: false,         // PC 버전 자동 재생 완전히 차단
        breakpoints: {
            0: {
                slidesPerView: "auto",
                loop: true,      // 모바일 버전 무한 루프 활성화
                spaceBetween: 0,
                autoplay: false  // 모바일 버전 자동 롤링 완벽 차단
            },
            1024: {
                slidesPerView: 6,
                spaceBetween: 40,
                autoplay: false
            }
        }
    });

})(jQuery);


/* ==========================================================================
   磋 메인 카테고리 진열 무한 복사 대응 공용 더보기 엔진
   ========================================================================== */
jQuery(document).ready(function() {
    
    // [공통 세팅] 처음에 노출할 개수와 더보기 클릭 시 추가할 개수 정의
    var initShowCount = 12;  
    var moreShowCount = 8;  

    // 카테고리별 독립 실행 공용 함수 정의
    function setupMoreView(wrapId, btnId) {
        var $wrapper = jQuery(wrapId); 
        var $btn = jQuery(btnId);
        
        var $items = $wrapper.find('.more-view-item'); 
        var totalItems = $items.length;

        // 초기 수량만 강제 노출
        $items.slice(0, initShowCount).show();
        
        // 상품 수가 세팅 수량보다 적으면 더보기 버튼 숨김
        if (totalItems <= initShowCount) {
            $btn.parent('.more-btn-wrap').hide();
        }

        // 해당 버튼 클릭 이벤트 매핑
        $btn.on('click', function(e) {
            e.preventDefault();
            
            var $hiddenItems = $wrapper.find('.more-view-item:hidden');
            $hiddenItems.slice(0, moreShowCount).fadeIn('slow');
            
            if ($wrapper.find('.more-view-item:hidden').length === 0) {
                $btn.parent('.more-btn-wrap').fadeOut('fast');
            }
        });
    }

    // [활성화 부서] 카테고리 추가 시 아이디 매핑 등록판
    setupMoreView('#mainNew', '#btnMoreNew');
    setupMoreView('#mainBest', '#btnMoreBest');

});




// 이미지 슬라이더
jQuery(document).ready(function(){
    jQuery('.prd-img-slider').each(function () {
       const imageCount = jQuery(this).find('img').length;
       if (imageCount > 1) {
           jQuery(this).bxSlider({
               pager: true,
               controls: true,
               touchEnabled: true
            });
        }
    });
    jQuery('.bx-controls-direction a').on('click', function() {
        return false;
    });   
}); 

