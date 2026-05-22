// Strakudos thin JavaScript entrypoint.
// Production bot logic is Kotlin StrategyEngine + dom_adapter.js.
(function () {
  console.log('[Strakudos] thin bot.js loaded');
  if (window.StrakudosDom && window.StrakudosDom.version >= 3) {
    console.log('[Strakudos] DOM adapter already loaded');
    return;
  }

  var existing = document.querySelector('script[data-strakudos-dom-adapter="true"]');
  if (existing) existing.remove();

  var script = document.createElement('script');
  script.src = 'file:///android_asset/dom_adapter.js?ts=' + Date.now();
  script.setAttribute('data-strakudos-dom-adapter', 'true');
  script.onload = function () {
    console.log('[Strakudos] DOM adapter loaded from thin bot.js');
  };
  script.onerror = function () {
    console.log('[Strakudos] DOM adapter load failed from thin bot.js');
    if (window.AndroidApp && window.AndroidApp.reportError) {
      window.AndroidApp.reportError('dom_adapter.js load failed');
    }
  };
  document.documentElement.appendChild(script);
})();
