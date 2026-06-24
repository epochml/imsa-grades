(function () {
  var storageKey = 'imsa-grades-theme';
  var darkQuery = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');

  function storedTheme() {
    try {
      return localStorage.getItem(storageKey);
    } catch (err) {
      return null;
    }
  }

  function preferredTheme() {
    return storedTheme() || (darkQuery && darkQuery.matches ? 'dark' : 'light');
  }

  function setStoredTheme(theme) {
    try {
      localStorage.setItem(storageKey, theme);
    } catch (err) {
      // Ignore storage failures; the toggle still works for the current page.
    }
  }

  function applyChartTheme(theme) {
    if (!window.Chart) return;
    var textColor = theme === 'dark' ? '#e7edf6' : '#222';
    var gridColor = theme === 'dark' ? 'rgba(231, 237, 246, 0.18)' : 'rgba(0, 0, 0, 0.1)';

    Chart.defaults.global.defaultFontColor = textColor;

    Object.keys(Chart.instances || {}).forEach(function (key) {
      var chart = Chart.instances[key].chart || Chart.instances[key];
      if (!chart || !chart.options) return;
      var scales = chart.options.scales || {};
      ['xAxes', 'yAxes'].forEach(function (axisKey) {
        (scales[axisKey] || []).forEach(function (axis) {
          axis.ticks = axis.ticks || {};
          axis.ticks.fontColor = textColor;
          axis.gridLines = axis.gridLines || {};
          axis.gridLines.color = gridColor;
          axis.scaleLabel = axis.scaleLabel || {};
          axis.scaleLabel.fontColor = textColor;
        });
      });
      chart.options.legend = chart.options.legend || {};
      chart.options.legend.labels = chart.options.legend.labels || {};
      chart.options.legend.labels.fontColor = textColor;
      chart.update(0);
    });
  }

  function updateToggle(theme) {
    var button = document.getElementById('themeToggle');
    if (!button) return;
    var next = theme === 'dark' ? 'light' : 'dark';
    button.textContent = theme === 'dark' ? '\u2600' : '\u263E';
    button.setAttribute('aria-label', 'Switch to ' + next + ' mode');
    button.setAttribute('title', 'Switch to ' + next + ' mode');
  }

  function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) setStoredTheme(theme);
    updateToggle(theme);
    applyChartTheme(theme);
  }

  function init() {
    var theme = document.documentElement.getAttribute('data-theme') || preferredTheme();
    applyTheme(theme, false);
    var button = document.getElementById('themeToggle');
    if (!button) return;
    button.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme') || preferredTheme();
      applyTheme(current === 'dark' ? 'light' : 'dark', true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
