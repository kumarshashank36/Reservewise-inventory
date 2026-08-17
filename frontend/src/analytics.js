// GA4 page-view tracking for the SPA, strictly opt-in: only active when the
// deployer configures VITE_GA_MEASUREMENT_ID. Without it every call here is a
// no-op and no script loads, so local runs and reviewers are never tracked
// without explicit consent from whoever runs the app.
const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

let loaded = false;
let lastPath = null;

function loadAnalytics() {
  if (!MEASUREMENT_ID || loaded) return;
  loaded = true;
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
}

// Call on every route change. `config` with a page_path is GA4's documented
// SPA pattern and emits one page_view. The last-path guard also absorbs React
// StrictMode's dev double-mount so first loads aren't double-counted.
export function trackPageView(path) {
  if (!MEASUREMENT_ID || path === lastPath) return;
  lastPath = path;
  loadAnalytics();
  window.gtag?.('config', MEASUREMENT_ID, { page_path: path, page_title: document.title });
}
