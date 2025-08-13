/**
 * API Base Prefix
 * 
 * This script intercepts fetch calls to '/api/' endpoints and automatically
 * prefixes them with window.API_BASE at runtime.
 * 
 * This allows existing code using relative API paths to work in both
 * development (where frontend and API run on different ports) and
 * production environments without modification.
 */

(function(){
  const originalFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      let url = typeof input === 'string' ? input : (input && input.url);
      if (typeof url === 'string' && url.startsWith('/api/')) {
        const fullUrl = `${window.API_BASE}${url}`;
        if (typeof input === 'string') {
          return originalFetch(fullUrl, init);
        } else {
          const requestInit = { ...input, url: undefined };
          return originalFetch(new Request(fullUrl, requestInit), init);
        }
      }
    } catch (e) {
      // fall back if anything unexpected
    }
    return originalFetch(input, init);
  };
})();
