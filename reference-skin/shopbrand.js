window.addEventListener('load', function () {
    // 필터 레이어 열기
    $(".btn-filter").click(function() {
        $(".layer-filter-wrap").show();
    });

    // 필터 레이어 닫기
    $(".btn-close").click(function() {
        $(".layer-filter-wrap").hide();
    });

    // 필터 목록 펼침
    $(".chk-box, .chk-color-code").hide();

    $(".opt-box > li").click(function(e) {
        if ($(e.target).closest('.chk-box, .chk-color-code').length) return;

        var $target = $(this).find(".chk-box, .chk-color-code");
        $target.toggle();
        $(this).toggleClass("active");
    });

    // BEST ITEM 슬라이더
    function initBestSlider() {
        var $bestSlider = $('.pc-best-slider-wrap .best-slider');

        if (!$bestSlider.length) return;
        if (typeof $.fn.slick === 'undefined') return;

        if ($bestSlider.hasClass('slick-initialized')) {
            $bestSlider.slick('unslick');
        }

        $bestSlider.slick({
            slidesToShow: 4,
            slidesToScroll: 1,
            infinite: true,
            swipe: true,
            draggable: true,
            touchMove: true,
            autoplay: false,
            arrows: true,
            dots: false,
            speed: 350,
            touchThreshold: 20,
            responsive: [
                {
                    breakpoint: 1024,
                    settings: {
                        slidesToShow: 3,
                        slidesToScroll: 1,
                        arrows: false,
                        swipe: true,
                        draggable: true
                    }
                },
                {
                    breakpoint: 768,
                    settings: {
                        slidesToShow: 2,
                        slidesToScroll: 1,
                        arrows: false,
                        swipe: true,
                        draggable: true
                    }
                }
            ]
        });
    }

    initBestSlider();

    // [더보기 기능 제어 함수]
    function setupMoreView(wrapperId, buttonId) {
        var $wrapper = $(wrapperId);
        var $btn = $(buttonId);

        var initShowCount = 20;
        var moreShowCount = 20;

        $wrapper.find('.itemList').hide();
        $wrapper.find('.itemList').slice(0, initShowCount).show();

        var totalItems = $wrapper.find('.itemList').length;

        if (totalItems <= initShowCount) {
            $btn.parent().hide();
        }

        $btn.on('click', function(e) {
            e.preventDefault();

            var $hiddenItems = $wrapper.find('.itemList:hidden');
            $hiddenItems.slice(0, moreShowCount).fadeIn('slow');

            if ($wrapper.find('.itemList:hidden').length === 0) {
                $btn.parent().fadeOut('fast');
            }
        });
    }
});