const {spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const tests=fs.readdirSync(path.join(root,'tests')).filter(n=>/^test-.*\.cjs$/.test(n)&&!n.endsWith('-live.cjs')).sort();
for(const test of tests){
  console.log('\n'+test);
  const result=spawnSync(process.execPath,[path.join(root,'tests',test)],{cwd:root,stdio:'inherit',windowsHide:true});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
console.log('\nPassed '+tests.length+' test suites.');
