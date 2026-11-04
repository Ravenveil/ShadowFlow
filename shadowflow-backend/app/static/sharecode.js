/* 公网分享链接的 sharecode 处理 —— 四个页面共用。
 *
 * 背景：把应用挂到公网后，反代用 `?sharecode=xxx` 做访问校验。
 * 这个参数只出现在分享链接里，页面内的 fetch / EventSource 不会自动带上：
 *   · fetch 不带 → 数据全拉不到，页面空着
 *   · EventSource 更麻烦，它连自定义 header 都设不了
 *
 * 所以这里的做法是：读到 sharecode 就存进 sessionStorage，之后每个请求自己拼上。
 * 存 sessionStorage 而不是 localStorage：换个标签页重新访问分享链接时会再读一次，
 * 而关掉标签页就没了 —— 不留痕是分享链接该有的样子。
 */
(function () {
  if (window.sfShareCode) return;
  var SC = '';
  try {
    var qs = new URLSearchParams(location.search);
    SC = qs.get('sharecode') || sessionStorage.getItem('sf_sharecode') || '';
    if (qs.get('sharecode')) sessionStorage.setItem('sf_sharecode', SC);
  } catch (e) { SC = ''; }
  window.sfShareCode = SC;
  if (!SC) return;

  function withSC(u) {
    try {
      var abs = new URL(u, location.href);
      if (abs.origin !== location.origin) return u;
      abs.searchParams.set('sharecode', SC);
      return abs.toString();
    } catch (e) { return u; }
  }
  window.sfWithShareCode = withSC;

  var orig = window.fetch;
  window.fetch = function (input, init) {
    init = init || {};
    var h = new Headers(init.headers || {});
    init.headers = h;
    var url = (typeof input === 'string') ? withSC(input) : input;
    return orig(url, init);
  };

  var origES = window.EventSource;
  window.EventSource = function (u, opts) {
    return new origES(withSC(u), opts);
  };
  window.EventSource.prototype = origES.prototype;
})();
