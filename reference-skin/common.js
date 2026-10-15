// 입력폼 class 추가
document.addEventListener("DOMContentLoaded", () => {
    const labels = document.querySelectorAll('label');
    if (labels.length) {
      labels.forEach(label => label.classList.add('form-check-label'));
    }

    const inputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
    if (inputs.length) {
      inputs.forEach(input => input.classList.add('form-check-input'));
    }

    const textInputs = document.querySelectorAll('input[type="text"],input[type="password"], input[type="date"], textarea');
    if (textInputs.length) {
      textInputs.forEach(textfield => textfield.classList.add('cw-textfield'));
    }

    const selects = document.querySelectorAll('select');
    if (selects.length) {
      selects.forEach(select => select.classList.add('cw-select-box'));
    }
});

 /* dc percent */

 function updatePrices() { 
         jQuery('.price a .dc_per').each(function() {
             var tmp1 = jQuery(this).next().text().replace(/[^0-9]/g, '');
             var tmp2 = jQuery(this).next().next().text().replace(/[^0-9]/g, '');
             if (tmp1 == tmp2) {
                 jQuery(this).hide();
                 jQuery(this).next().next().hide();
             } else if (tmp2 > 0) {
                 var tmp_price = parseInt((Number(tmp2) - Number(tmp1)) / Number(tmp2) * 100);
                 jQuery(this).text(tmp_price.toString().replace(/(\d)(?=(?:\d{3})+(?!\d))/g, '$1,') + '%');
             }
         }); 
 }

 jQuery(document).ready(function() {
     updatePrices(); 
 });

// AJAX 완료 후 재실행
jQuery(document).ajaxComplete(function () {
    setTimeout(() => {
     updatePrices();
    }, 100);
});
