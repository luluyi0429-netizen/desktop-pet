const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),file=path.join(root,'browser','danbooru-tag-tool.user.js'),nl=String.fromCharCode(10);
let script=fs.readFileSync(file,'utf8');
function embed(begin,end,body){const first=script.indexOf(begin),last=script.indexOf(end);if(first<0||last<first)throw Error('Missing markers '+begin);script=script.slice(0,first)+[begin,body,end].join(nl)+script.slice(last+end.length);}
embed('  // PROMPT FILTER BEGIN','  // PROMPT FILTER END',['prompt-filter.js','civitai-prompts.js'].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join(nl));
embed('  // DESKTOP PET LINK BEGIN','  // DESKTOP PET LINK END',fs.readFileSync(path.join(root,'browser-tag-link.js'),'utf8')+nl+'  const petLink = createPetLink(panel);');
fs.writeFileSync(file,script);console.log('Built browser userscript for both sites');
