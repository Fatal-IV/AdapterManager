let dict = {};

async function loadI18n() {
  const res = await fetch(`i18n/${window.api.locale}.json`);
  dict = await res.json();
}

function t(key) {
  return dict[key] || key;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}
