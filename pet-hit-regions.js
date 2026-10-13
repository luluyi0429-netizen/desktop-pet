(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.petHitRegions=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  // Rectangles are relative to the visible (alpha-cropped) PNG, not the window.
  const CHEST={idle:[.37,.47,.64,.585],blink:[.37,.47,.64,.585],click:[
    [.30,.46,.51,.55],[.46,.49,.66,.585],[.33,.48,.56,.585],[.35,.50,.59,.59]
  ]};
  function hit({action,frame=0,rect,x,y,mirrored=false}){
    if(!rect||!(rect.width>0)||!(rect.height>0)||!Number.isFinite(x)||!Number.isFinite(y))return null;
    const region=action==='click'?CHEST.click[frame]:CHEST[action];if(!region)return null;
    let nx=(x-rect.left)/rect.width;const ny=(y-rect.top)/rect.height;if(mirrored)nx=1-nx;
    return nx>=region[0]&&nx<=region[2]&&ny>=region[1]&&ny<=region[3]?'chest':null;
  }
  return {hit,CHEST};
});
