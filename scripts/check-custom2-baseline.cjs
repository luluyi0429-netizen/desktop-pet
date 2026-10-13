const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const baseline=require('./custom2-baseline.json');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function list(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(path.join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]);}
function verify(root=path.resolve(__dirname,'..'),options={}){
 for(const [file,expected] of Object.entries(baseline.runtimeFiles))assert.equal(hash(path.join(root,file)),expected,'Runtime differs from custom.2 baseline: '+file);
 const expected=Object.keys(baseline.runtimeFiles).sort();
 if(options.strict)assert.deepEqual(list(root).filter(f=>f!=='package.json').sort(),expected,'Packaged runtime file set differs');
 else assert.deepEqual(list(path.join(root,'assets'),'assets/').sort(),expected.filter(f=>f.startsWith('assets/')),'Source asset set differs');
 assert.equal(hash(options.browser||path.join(root,'browser/danbooru-tag-tool.user.js')),baseline.browserSha256,'Browser bundle differs from custom.2');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));assert.equal(pkg.version,baseline.version);
 if(pkg.devDependencies)assert.equal(pkg.devDependencies.electron,baseline.electron);
 return {runtimeFiles:expected.length,browserMatches:true,version:baseline.version};
}
if(require.main===module)console.log(JSON.stringify(verify()));
module.exports={verify};
