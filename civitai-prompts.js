(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CivitaiPrompts=factory();})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function textWithoutControls(node){
    if(node.nodeType===3)return node.textContent;
    if(node.nodeType!==1)return '';
    if(node.matches('button,svg,[role="button"]')||/^(?:Show more|Show less|显示更多|收起|\.\.\.)$/i.test(node.textContent.trim()))return '';
    return [...node.childNodes].map(textWithoutControls).join('');
  }
  function read(doc){
    let positive='',negative='';
    const headings=[...doc.querySelectorAll('p,h2,h3,h4,label')].filter(e=>!e.closest('#db-tag-tool')&&/^(?:Prompt|Positive prompt|Negative prompt|Negative Prompt|正向提示词|负面提示词)$/i.test(e.textContent.trim())&&e.getClientRects().length);
    for(const heading of headings){
      let parent=heading.parentElement,content=null;
      for(let depth=0;depth<3&&parent;depth++,parent=parent.parentElement){
        const candidate=parent.querySelector('[data-line-clamp]');
        if(candidate&&!candidate.contains(heading)){content=candidate;break;}
        if(parent.children.length===2&&parent.firstElementChild.contains(heading)&&parent.lastElementChild.matches('textarea,pre,[data-prompt],.break-words')){content=parent.lastElementChild;break;}
      }
      if(!content)continue;
      const value=(content.value||textWithoutControls(content)).trim().slice(0,32000);
      if(/negative|负/i.test(heading.textContent))negative=value;else positive=value;
    }
    return {positive,negative};
  }
  return {read,textWithoutControls};
});
