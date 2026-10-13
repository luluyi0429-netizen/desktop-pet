(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PromptFilter=factory();})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const labels={lora:'LoRA / 模型标记',quality:'质量词',appearance:'角色外貌',tags:'提示词字段',natural:'提示词自然语句'};
  function category(text){
    const clean=text.toLowerCase().replace(/_/g,' ').replace(/^[([]+|[)\]]+$/g,'').replace(/:\s*[\d.]+$/,'').trim();
    if(/^<(?:lora|lyco|hypernet)\b/i.test(text))return 'lora';
    if(/^(?:newest|year \d{4}|dynamic composition|dynamic angle|dramatic lighting|cinematic lighting|volumetric lighting|rim lighting|depth of field|sharp focus|intricate details|beautiful detailed eyes|vibrant colors|strong color contrast)$/.test(clean))return 'quality';
    if(/^(?:masterpiece|best quality|high quality|ultra quality|worst quality|low quality|normal quality|very aesthetic|absurdres|highres|lowres|ultra.?detailed|highly detailed|amazing quality|rating[: ]\w+|score[ _]?\d+(?:[ _]up)?|[248]k|[248]k resolution|高清|杰作|最佳质量|高质量|高分辨率|高细节|超精细)(?:\b|$)/i.test(clean)&&clean.split(/\s+/).length<10)return 'quality';
    if(/[。！？]/.test(text)||/\b(?:is|are|was|wears|wearing|stands|sits|has|holding|looks|gazes|she|he|they|her|his|their|with|while|the)\b/i.test(clean)&&clean.split(/\s+/).length>=7||clean.split(/\s+/).length>=14)return 'natural';
    if(/\b(?:hair|eyes?|bangs|ponytail|twintails|braids?|eyebrows?|eyelashes|freckles|skin|face|height|body|breasts?|hips|thighs|muscular|slim|petite|tall|short|horns?|ears?|tail|wings|heterochromia|ahoge)\b|发色|头发|眼睛|瞳色|肤色|身材|长发|短发/.test(clean))return 'appearance';
    return 'tags';
  }
  // Commas inside weighted/nested expressions belong to that expression.
  function split(text){
    const parts=[];let current='',round=0,square=0,escaped=false;
    for(const char of String(text||'')){
      if(escaped){current+=char;escaped=false;continue;}
      if(char==='\\'){current+=char;escaped=true;continue;}
      if(char==='(')round++;if(char===')')round=Math.max(0,round-1);
      if(char==='[')square++;if(char===']')square=Math.max(0,square-1);
      if((char===','||char==='，'||char==='\n')&&!round&&!square){if(current.trim())parts.push(current.trim());current='';}else current+=char;
    }
    if(current.trim())parts.push(current.trim());return parts;
  }
  function parse(input){
    const source=String(input||'').replace(/\r\n?/g,'\n').slice(0,32000);
    let polarity='positive',serial=0;const items=[];
    function add(text,kind){if(text.trim())items.push({id:'p'+(++serial),text:text.trim(),category:kind||category(text.trim()),polarity,selected:kind!=='lora'});}
    for(let line of source.split('\n')){
      const header=line.match(/^\s*(negative prompt|negative|负面提示词|负向提示词|正向提示词|positive prompt|positive|prompt)(?:\s*[:：]\s*|\s*$)(.*)$/i);
      if(header){polarity=/negative|负/i.test(header[1])?'negative':'positive';line=header[2];}
      if(/^\s*(?:Steps|Sampler|CFG scale|Seed|Size|Model hash)\s*:/i.test(line))continue;
      // Isolate model markup anywhere, preserving text around it.
      const clean=line.replace(/<(?:lora|lyco|hypernet)\b[^>]*>/gi,token=>{add(token,'lora');return '';});
      // A complete descriptive paragraph stays intact, including its commas.
      const natural=category(clean)==='natural'&&/(?:[.!?](?:\s|$)|[。！？])/.test(clean);
      for(const part of natural?[clean]:split(clean))add(part);
    }
    return items;
  }
  function output(items,polarity){return items.filter(i=>i.selected&&(polarity?i.polarity===polarity:true)).map(i=>i.text).join(', ');}
  function sections(items){const positive=output(items,'positive'),negative=output(items,'negative');return negative?'Positive prompt:\n'+positive+'\n\nNegative prompt:\n'+negative:positive;}
  return {labels,category,split,parse,output,sections};
});
