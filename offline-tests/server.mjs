import http from 'node:http';

// Firefox's automation offline switch does not cut off service-worker fetches.
// This test-only proxy also disconnects those requests, keyed by browser context.
http.createServer((request, response) => {
  if (request.headers.cookie?.includes('offline-test-network=disconnected')) {
    request.socket.destroy();
    return;
  }
  const upstream = http.request({ hostname: '127.0.0.1', port: 4321, path: request.url, method: request.method, headers: request.headers }, result => {
    response.writeHead(result.statusCode, result.headers);
    result.pipe(response);
  });
  upstream.on('error', () => { response.writeHead(502); response.end(); });
  request.pipe(upstream);
}).listen(4322, '127.0.0.1');
