const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),file=path.join(root,'browser','danbooru-tag-tool.user.js');
const script=fs.readFileSync(file,'utf8');
const begin='  // DESKTOP PET LINK BEGIN',end='  // DESKTOP PET LINK END';
const first=script.indexOf(begin),last=script.indexOf(end);
if(first<0||last<first)throw Error('Desktop pet integration markers missing');
const block=begin+'\n'+fs.readFileSync(path.join(root,'browser-tag-link.js'),'utf8')+'\n  const petLink = createPetLink(panel);\n'+end;
fs.writeFileSync(file,script.slice(0,first)+block+script.slice(last+end.length));
console.log('Updated browser/danbooru-tag-tool.user.js');
