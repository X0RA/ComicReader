import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundle=await build({entryPoints:['lib/transfer-cache.ts'],bundle:true,write:false,platform:'node',format:'esm'});
const {TransferCache}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].contents).toString('base64'));
test('codes expire after ten minutes and are isolated to their server instance',()=>{
  let now=1000;const cache=new TransferCache(()=>now);const other=new TransferCache(()=>now);
  const created=cache.create('j1.YWJj');assert.equal(created.expiresAt,601000);
  assert.equal(cache.read(created.code.toLowerCase()).payload,'j1.YWJj');
  assert.throws(()=>other.read(created.code),e=>e.status===404);
  now=601000;assert.throws(()=>cache.read(created.code),e=>e.status===404);
});
test('rate limits expire and storage remains bounded without evicting live codes',()=>{
  let now=0;const cache=new TransferCache(()=>now);
  for(let i=0;i<30;i++)cache.rateLimit('client');assert.throws(()=>cache.rateLimit('client'),e=>e.status===429);
  now=60000;cache.rateLimit('client');
  const first=cache.create('j1.YWJj');for(let i=1;i<128;i++)cache.create('j1.YWJj');
  assert.throws(()=>cache.create('j1.YWJj'),e=>e.status===503);assert.equal(cache.read(first.code).payload,'j1.YWJj');
  now+=600000;assert.ok(cache.create('j1.YWJj').code);
});
