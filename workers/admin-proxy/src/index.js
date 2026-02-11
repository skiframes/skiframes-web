/**
 * Admin Proxy Worker
 * Proxies requests from admin.skiframes.com to S3 bucket
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Default to index.html for directory requests
    let pathname = url.pathname;
    if (pathname.endsWith('/')) {
      pathname += 'index.html';
    }

    // Fetch through CloudFront (S3 bucket is restricted to CloudFront only)
    const originUrl = `https://skiframes.com${pathname}${url.search}`;

    // Fetch from origin
    const response = await fetch(originUrl);

    // Return response with CORS headers
    const newResponse = new Response(response.body, response);

    // Set correct content type for common files
    const path = url.pathname.toLowerCase();
    if (path.endsWith('.html')) {
      newResponse.headers.set('Content-Type', 'text/html; charset=utf-8');
    } else if (path.endsWith('.css')) {
      newResponse.headers.set('Content-Type', 'text/css; charset=utf-8');
    } else if (path.endsWith('.js')) {
      newResponse.headers.set('Content-Type', 'application/javascript; charset=utf-8');
    } else if (path.endsWith('.json')) {
      newResponse.headers.set('Content-Type', 'application/json; charset=utf-8');
    } else if (path.endsWith('.png')) {
      newResponse.headers.set('Content-Type', 'image/png');
    } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      newResponse.headers.set('Content-Type', 'image/jpeg');
    } else if (path.endsWith('.svg')) {
      newResponse.headers.set('Content-Type', 'image/svg+xml');
    }

    return newResponse;
  },
};
