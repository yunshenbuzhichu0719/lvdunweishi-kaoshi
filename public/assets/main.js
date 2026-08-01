/* 启动绿盾卫士云版前端 */
(function (global) {
  'use strict';
  var Cloud = global.LDWS_CLOUD;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { Cloud.boot(); });
  else Cloud.boot();
})(window);
