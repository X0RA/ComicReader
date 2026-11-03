import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!window.storageTest); });

test('JSON and links round-trip Unicode, merge bookmarks, and preserve further progress in another browser', async ({ page, browser }) => {
  const exported = await page.evaluate(async () => {
    const t = window.storageTest;
    localStorage.setItem('comic-reader-view-options', JSON.stringify({ zoom: 125, upscaleAhead: 20, crop: true })); localStorage.setItem('theme', 'gruvbox');
    await t.saveBookmark({ comicId:'a/日本', comicName:'漫画 🌧️', page:12, note:'Imported note' });
    await t.saveBookmark({ comicId:'b', comicName:'B', page:5, note:'日本語 💙\nSecond line' });
    await t.db.markComicStatus('a/日本', 'in_progress', 20, 100); await t.db.markComicStatus('b', 'completed', 50, 50);
    await t.db.lastReadComic.put({id:'b',timestamp:100});
    const backup = await t.exportBackup();
    return { json:JSON.stringify(backup), token:await t.encodeBackup(backup), link:await t.backupLink(backup, location.origin) };
  });
  expect(exported.link).toContain('/import#');
  const context = await browser.newContext(); const other = await context.newPage();
  try {
    await other.goto('/'); await other.waitForFunction(() => !!window.storageTest);
    const imported = await other.evaluate(async ({ json, token }) => {
      const t=window.storageTest;
      await t.saveBookmark({ comicId:'a/日本', comicName:'My title', page:12, note:'Keep my existing note' });
      await t.saveBookmark({ comicId:'local', comicName:'Local', page:9, note:'Only here' });
      await t.db.markComicStatus('a/日本','in_progress',30,100); await t.db.markComicStatus('local','completed',10,10);
      await t.db.lastReadComic.put({id:'local',timestamp:200});
      const first=await t.importBackup(t.parseBackup(json));
      const second=await t.importBackup(await t.decodeBackup(token));
      return { first,second,rows:await t.db.bookmarks.toArray(),progress:await t.db.readComics.toArray(),settings:JSON.parse(localStorage.getItem('comic-reader-view-options')!),theme:localStorage.getItem('theme'),last:await t.db.getLastReadComic() };
    }, exported);
    expect(imported.first).toEqual({bookmarksAdded:1,bookmarksKept:1,progressUpdated:1});
    expect(imported.second).toEqual({bookmarksAdded:0,bookmarksKept:2,progressUpdated:0});
    expect(imported.rows).toHaveLength(3);
    expect(imported.rows.find((r:any)=>r.comicId==='a/日本').note).toBe('Keep my existing note');
    expect(imported.rows.find((r:any)=>r.comicId==='b').note).toBe('日本語 💙\nSecond line');
    expect(imported.progress.find((r:any)=>r.id==='a/日本').lastPage).toBe(30);
    expect(imported.progress.find((r:any)=>r.id==='b').status).toBe('completed');
    expect(imported.settings.zoom).toBe(125); expect(imported.settings.upscaleAhead).toBe(20); expect(imported.theme).toBe('gruvbox'); expect(imported.last).toBe('local');
    await other.reload(); await other.waitForFunction(()=>!!window.storageTest);
    expect(await other.evaluate(()=>window.storageTest.db.bookmarks.count())).toBe(3);
  } finally { await context.close(); }
});

test('invalid backup rows and versions change nothing; repeat rows never duplicate a bookmark', async ({ page }) => {
  const result=await page.evaluate(async()=>{
    const t=window.storageTest; const backup=await t.exportBackup(); const original=JSON.stringify(await t.exportBackup());
    const mark={comicId:'a',comicName:'A',page:2,note:'First',createdAt:1,updatedAt:2};
    let rejected=0;
    for(const value of [{...backup,version:2},{...backup,bookmarks:[mark,{...mark,page:-1}]},{...backup,progress:[{id:'bad',lastPage:99,totalPages:1,status:'in_progress'}]}]) {
      try{await t.importBackup(value);}catch{rejected++;}
    }
    const empty=await t.db.bookmarks.count(); const result=await t.importBackup({...backup,bookmarks:[mark,{...mark,note:'Second'}]});
    return {rejected,empty,result,note:(await t.db.bookmarks.get(['a',2])).note,settingsUnchanged:localStorage.getItem('theme')==='light',original:!!original};
  });
  expect(result.rejected).toBe(3); expect(result.empty).toBe(0); expect(result.result.bookmarksAdded).toBe(1); expect(result.note).toBe('First');
});

test('a settings storage failure rolls back database changes and restores previous settings', async ({ page }) => {
  const result=await page.evaluate(async()=>{
    const t=window.storageTest;
    localStorage.setItem('theme','dark'); localStorage.setItem('comic-reader-view-options','{"zoom":115}');
    const backup=await t.exportBackup(); backup.settings.theme='gruvbox'; backup.settings.reader.zoom=150;
    backup.bookmarks=[{comicId:'a',comicName:'A',page:1,note:'No partial writes',createdAt:1,updatedAt:1}];
    backup.progress=[{id:'a',status:'in_progress',lastPage:5,totalPages:10}];
    const original=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key==='theme'&&value==='gruvbox')throw new DOMException('full','QuotaExceededError'); return original.call(this,key,value);};
    let failed=false;try{await t.importBackup(backup);}catch{failed=true;}finally{Storage.prototype.setItem=original;}
    return{failed,bookmarks:await t.db.bookmarks.count(),progress:await t.db.readComics.count(),theme:localStorage.getItem('theme'),reader:localStorage.getItem('comic-reader-view-options')};
  });
  expect(result).toEqual({failed:true,bookmarks:0,progress:0,theme:'dark',reader:'{"zoom":115}'});
});

test('links reject corrupt encodings and bounded decompression rejects oversized data', async ({ page }) => {
  const result=await page.evaluate(async()=>{
    const t=window.storageTest;let invalid=0;
    for(const token of ['!bad','j1.a','g1.bm90Z3ppcA','j1.'+'a'.repeat(128001)])try{await t.decodeBackup(token);}catch{invalid++;}
    const bytes=new Uint8Array(t.MAX_BACKUP_BYTES+1);const zip=await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    let binary='';for(const byte of new Uint8Array(zip))binary+=String.fromCharCode(byte);
    let oversized='';try{await t.decodeBackup('g1.'+btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,''));}catch(error){oversized=String(error);}
    return{invalid,oversized};
  });
  expect(result.invalid).toBe(4);expect(result.oversized).toContain('too large');
});

test('temporary transfer code moves a backup between isolated browsers and responses are not cached', async ({ page, browser }) => {
  const created=await page.evaluate(async()=>{
    const t=window.storageTest;await t.saveBookmark({comicId:'code',comicName:'Code',page:3,note:'Transfer this'});
    const response=await fetch('/api/transfer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create',payload:await t.encodeBackup(await t.exportBackup())})});
    return{status:response.status,cache:response.headers.get('cache-control'),...await response.json()};
  });
  expect(created.status).toBe(200);expect(created.code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);expect(created.cache).toContain('no-store');
  const context=await browser.newContext();const other=await context.newPage();
  try{await other.goto('/');await other.waitForFunction(()=>!!window.storageTest);
    const result=await other.evaluate(async code=>{const response=await fetch('/api/transfer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'read',code:code.toLowerCase()})});const data=await response.json();const t=window.storageTest;return t.importBackup(await t.decodeBackup(data.payload));},created.code);
    expect(result.bookmarksAdded).toBe(1);
  }finally{await context.close();}
});

test('transfer endpoint rejects invalid, oversized and foreign-origin requests', async ({ request }) => {
  const invalid=await request.post('/api/transfer',{data:{action:'read',code:'bad'}});expect(invalid.status()).toBe(400);
  const missing=await request.post('/api/transfer',{data:{action:'read',code:'00000-00000'}});expect(missing.status()).toBe(404);expect(await missing.text()).toContain('another instance');
  const oversized=await request.post('/api/transfer',{data:{action:'create',payload:'j1.'+'a'.repeat(131000)}});expect(oversized.status()).toBe(413);
  const proxied=await request.post('/api/transfer',{headers:{Origin:'https://comics.example','x-forwarded-host':'comics.example','x-forwarded-proto':'https'},data:{action:'create',payload:'j1.YWJj'}});expect(proxied.status()).toBe(200);
  const foreign=await request.post('/api/transfer',{headers:{Origin:'https://unrelated.example'},data:{action:'read',code:'00000-00000'}});expect(foreign.status()).toBe(403);
});
