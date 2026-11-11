// Render Web Service (Node.js, no dependencies): server.js
// Echo services that report the IP address they see = this service's egress IP.
import http from 'node:http';

const SOURCES = [
  'https://ipecho.net/plain',
  'https://checkip.amazonaws.com',
];

async function checkIp(req) {
  let functionIp = null;
  let source = null;
  let error = null;

  for (const url of SOURCES) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'render-ip-check/1.0' },
        signal: AbortSignal.timeout(5000), // don't hang if one service is slow
      });
      if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
      functionIp = (await r.text()).trim();
      source = url;
      break; // got an answer, stop trying
    } catch (err) {
      error = String(err); // try the next source
    }
  }

  return {
    workerIp: functionIp, // IP the echo service saw = Render egress IP
    source, // which echo service answered
    service: process.env.RENDER_SERVICE_NAME ?? null, // Render service name
    instance: process.env.RENDER_INSTANCE_ID ?? null, // changes when a new instance starts
    yourIp: req.headers['x-forwarded-for']?.split(',')[0].trim() ?? null, // your own IP
    commit: process.env.RENDER_GIT_COMMIT?.slice(0, 8) ?? null, // short deploy commit
    error: functionIp ? null : error,
  };
}

const server = http.createServer(async (req, res) => {
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  };

  if (req.url === '/healthz') { // health check path for Render
    res.writeHead(200, headers);
    return res.end('{"ok":true}');
  }

  const result = await checkIp(req);
  console.log(JSON.stringify(result)); // Render Dashboard -> your service -> Logs
  res.writeHead(result.workerIp ? 200 : 502, headers);
  res.end(JSON.stringify(result));
});

const port = process.env.PORT || 10000; // Render sets PORT for you
server.listen(port, '0.0.0.0', () => console.log(`listening on ${port}`));
