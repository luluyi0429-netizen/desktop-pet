const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const {normalizeText, normalizeEndpoint, createTextSettings, requestText} = require('../selected-text.cjs');
async function main() {
  assert.equal(normalizeText('  test\r\ntext\u0000  '), 'test\ntext');
  assert.throws(() => normalizeText(' ')); assert.throws(() => normalizeText('a'.repeat(8001)));
  assert.equal(normalizeEndpoint('https://provider.example/v1/'), 'https://provider.example/v1/chat/completions');
  assert.equal(normalizeEndpoint('https://provider.example'), 'https://provider.example/v1/chat/completions');
  assert.equal(normalizeEndpoint('http://127.0.0.1:1234/v1/chat/completions'), 'http://127.0.0.1:1234/v1/chat/completions');
  for (const url of ['http://provider.example/v1','file:///private','https://name:secret@provider.example','https://provider.example?key=secret','https://provider.example/#x']) assert.throws(() => normalizeEndpoint(url));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-selected-text-test-'));
  // Fake OS vault for deterministic persistence tests; live test covers safeStorage.
  const vault = new Map(); let count = 0;
  const safeStorage = {isEncryptionAvailable: () => true, encryptString: text => { const id = String(++count); vault.set(id,text); return Buffer.from(id); }, decryptString: data => vault.get(data.toString())};
  let server;
  try {
    const store = createTextSettings(temporary, safeStorage);
    assert(!store.publicState().hasKey);
    store.save({endpoint:'https://provider.example/v1', model:'demo', apiKey:'unit-test-secret'});
    const persisted = fs.readFileSync(path.join(temporary, 'text-assistant.json'), 'utf8');
    assert(!persisted.includes('unit-test-secret')); assert(!JSON.stringify(store.publicState()).includes('unit-test-secret'));
    assert.equal(createTextSettings(temporary, safeStorage).requestConfig().apiKey, 'unit-test-secret');
    store.save({...store.publicState(), model:'new-model', apiKey:''}); assert.equal(store.requestConfig().apiKey, 'unit-test-secret');
    store.save({endpoint:'https://other.example/v1', model:'demo', apiKey:''}); assert.equal(store.requestConfig().apiKey, '');
    const unavailable = createTextSettings(temporary,{isEncryptionAvailable:()=>false});
    assert.throws(() => unavailable.save({...store.publicState(), apiKey:'secret'}), /加密/);
    store.save({...store.publicState(),apiKey:'second'}); store.save({...store.publicState(),removeKey:true}); assert(!store.publicState().hasKey);
    const requests = [];
    server = http.createServer((req, res) => {
      let body = ''; req.on('data', chunk => body += chunk); req.on('end', () => {
        const data = JSON.parse(body); requests.push({data,headers:req.headers,url:req.url});
        if (data.model === 'unauthorized') { res.writeHead(401); return res.end('do not echo this secret'); }
        if (data.model === 'limited') { res.writeHead(429); return res.end(); }
        if (data.model === 'redirect') { res.writeHead(302,{Location:'/redirect-target'}); return res.end(); }
        if (data.model === 'invalid') return res.end('not json');
        if (data.model === 'slow') return;
        if (data.model === 'huge') return res.end('x'.repeat(1024*1024+1));
        res.setHeader('Content-Type','application/json');
        res.end(JSON.stringify({choices:[{message:{content:data.model === 'empty' ? '' : '测试结果 <script>alert(1)</script>'},finish_reason:data.model === 'truncated' ? 'length':'stop'}]}));
      });
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    const config = {endpoint:'http://127.0.0.1:'+server.address().port+'/v1',model:'demo',apiKey:'fake-fixture-key'};
    for (const task of ['translate']) {
      const result = await requestText({config,text:'This is selected sample text.',task});
      assert(result.text.includes('<script>')); assert(!result.incomplete);
      const latest = requests.at(-1); assert.equal(latest.url,'/v1/chat/completions');
      assert.equal(latest.headers.authorization,'Bearer fake-fixture-key'); assert.equal(latest.data.stream,false);
      assert.equal(latest.data.messages[1].content,'This is selected sample text.');
      assert(latest.data.messages[0].content.includes('引用资料'));
    }
    for (const [model, expected] of [['unauthorized',/鉴权/],['limited',/限流/],['invalid',/JSON/],['empty',/空结果/],['huge',/过长/],['redirect',/无法连接/]]) {
      await assert.rejects(requestText({config:{...config,model},text:'test',task:'translate'}),expected);
    }
    assert.equal((await requestText({config:{...config,model:'truncated'},text:'test',task:'translate'})).incomplete,true);
    const abort = new AbortController();
    const pending = requestText({config:{...config,model:'slow'},text:'test',task:'translate',signal:abort.signal});
    setTimeout(()=>abort.abort(),50); await assert.rejects(pending,/取消/);
    await assert.rejects(requestText({config:{...config,model:'slow'},text:'test',task:'translate',timeoutMs:50}),/超过/);
    const before = requests.length;
    await assert.rejects(requestText({config,text:'test',task:'execute'}),/不支持/); assert.equal(requests.length,before);
    console.log(JSON.stringify({translationOnly:true,encryptedPersistence:true,keyNotReturnedToRenderer:true,providerChangeClearsKey:true,inputLimits:true,endpointValidation:true,errorRedaction:true,noRedirects:true,timeout:true,cancel:true,responseLimit:true}));
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(temporary,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
