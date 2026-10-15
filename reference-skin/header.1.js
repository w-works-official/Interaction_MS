(function($) {
    //헤더 커스텀
    $('body').css('padding-top', $('#header').outerHeight());
    $('.searchBtn, .search_close').click(function() {
        $('.searchArea').toggleClass('active');
        $('body').toggleClass('oh');
    });

    var savedSearchHtml = '';
    if (jQuery('.searchArea .search').length) {
        jQuery('.searchArea input').attr('placeholder', '검색어를 입력해 주세요');
        savedSearchHtml = jQuery('.searchArea .search').html();
    }
    jQuery('#header .gnb a.searchBtn').on('click', function() {
        jQuery('#header .search .searchBox').empty();
        if (savedSearchHtml) {
            jQuery('.searchArea .search').html(savedSearchHtml);
        }
    });
    jQuery('#header .search_button img').on('click', function() {
        jQuery('.searchArea .search').empty();
        $('#header .search_button').toggleClass('active');
        $('#header .search').toggleClass('active');
        if (savedSearchHtml) {
            jQuery('#header .search .searchBox').html(savedSearchHtml);
        }

    });


// 다찾다 검색 파인더 레이어 열기 닫기
    jQuery('.all-finder-open').click(function(e){
        e.preventDefault();
        jQuery('body, html').css('overflow-y', 'hidden');
        jQuery('#all-finder-layer').show();
    });
    jQuery('.all-finder-close').click(function(e){
        e.preventDefault();
        jQuery('body, html').css('overflow-y', 'visible');
        jQuery('#all-finder-layer').hide();
    });

// 다찾다 검색 파인더 레이어 옵션 열기 닫기
    jQuery('.all-finder-layer .finder-opt dl dt').click(function(e){
        if (e.target.classList.contains('finder-tooltip-btn') || findParentElementClassName(e.target, 'finder-comm-layer')) {
            e.preventDefault();
            return;
        }
        if ( jQuery(this).find('span').hasClass('fa-angle-down') ){
            jQuery(this).find('span').addClass('fa-angle-up').removeClass('fa-angle-down');
        } else {
            jQuery(this).find('span').addClass('fa-angle-down').removeClass('fa-angle-up');
        }
        jQuery(this).next('dd').toggle();
        jQuery('.all-finder-layer').scrollTop(0).stop().animate({ scrollTop: jQuery(this).offset().top - 120 }, 0);
    });

    function findParentElementClassName(el, className) {
        return (el.classList.contains(className)) ? el : (el.parentElement !== null) ? findParentElementClassName(el.parentElement, className) : null;
    }
})(jQuery);

//헤더높이설정
function setHeaderPadding() {
    var headerHeight = jQuery('#header').outerHeight();
    jQuery('body').css('padding-top', headerHeight + 'px');
}
setHeaderPadding();
var resizeTimer;
jQuery(window).on('resize orientationchange', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(setHeaderPadding, 100);
});

jQuery(document).ready(function() {

    // [PC 및 모바일 통합 대응] 새 클래스 menu-2를 바인딩하여 width 제한 없이 사이드 메뉴 연동 보정
    jQuery("#header .menu-2").click(function(e){
        e.preventDefault();
        jQuery("#aside").addClass("active");
        jQuery("body").addClass("oh");
    });
    
    jQuery("#aside .aside_close").click(function(e){
        e.preventDefault();
        jQuery("#aside").removeClass("active");
        jQuery("body").removeClass("oh");
    });


    jQuery("#aside .navCategory nav > ul > li > .shop").click(function(e){
        e.preventDefault()
        jQuery(this).toggleClass("on");
        jQuery(this).parent().children('ul').slideToggle();

    })
});

document.addEventListener("DOMContentLoaded", function () {
    // 다찾다 검색 파인더
    const sfinderMenu = document.querySelector('.side-sfinder-wrap');
    const sfinderOpen = document.querySelectorAll('.side-sfinder-open, .btn-smart-finder');
    const sfinderClose = document.querySelector('.side-sfinder-close');
    const sfinderOverlay = document.querySelector('.side-overlay');

    const sfinderScroll_off = () => {
        document.documentElement.classList.add('no-scroll');
        document.body.classList.add('no-scroll');
    };

    const sfinderScroll_on = () => {
        document.documentElement.classList.remove('no-scroll');
        document.body.classList.remove('no-scroll');
    };

    const openfinderMenu = (e) => {
        sfinderMenu?.classList.add('active');
        sfinderOverlay?.classList.add('active');
        sfinderScroll_off();
    };

    const closefinderMenu = () => {
        sfinderMenu?.classList.remove('active');
        sfinderOverlay?.classList.remove('active');
        sfinderScroll_on();
    };

    // 여러 버튼 이벤트 처리
    sfinderOpen.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            openfinderMenu();
        });
    });

    sfinderClose?.addEventListener('click', closefinderMenu);
    sfinderOverlay?.addEventListener('click', closefinderMenu);

    const toggleOnClick = (selector) => {
        document.querySelectorAll(selector).forEach(el =>
            el?.addEventListener('click', () => el.classList.toggle('on'))
        );
    };

    toggleOnClick('.side-sfinder-wrap .finder-options');
    toggleOnClick('.side-sfinder-wrap .option-title');
});

 // 상단 타이틀 변경
function changeNaviTitleText(newText) {
    const naviTitleElement = document.querySelector('.navi-title span');
    if (naviTitleElement) {
        naviTitleElement.textContent = newText;
    }
}