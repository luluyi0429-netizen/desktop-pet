// ==UserScript==
// @name         Danbooru Tag Tool
// @namespace    local.danbooru-tag-tool
// @version      4.0.0
// @description  Filter tags, use custom tag tabs, ten copy records and a draggable launcher.
// @match        https://danbooru.donmai.us/*
// @match        https://civitai.red/*
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      127.0.0.1
// ==/UserScript==

(function () {
  'use strict';
  // PROMPT FILTER BEGIN
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

  // PROMPT FILTER END

  const categoryNames = {
    lora:'LoRA / 模型标记', quality:'质量词', natural:'提示词自然语句', tags:'提示词字段', appearance:'角色外貌',
    hair:'头发', eyes:'眼睛', face:'脸部', skin:'肤色', body:'体型', species:'身体设定',
    identity:'角色 / 作品 / 人数', clothing:'服装', accessories:'饰品', expression:'表情',
    pose:'姿势 / 动作', artist:'画师', meta:'其他元信息', scene:'场景 / 构图'
  };
  const appearance = ['hair','eyes','face','skin','body','species'];
  const presets = {
    none:[], appearance,
    identity:[...appearance,'identity'],
    scene:[...appearance,'identity','clothing','accessories','expression','pose','artist']
  };
  const dictionary = Object.create(null);
  function register(category, words) {
    for (const tag of words.split(/\s+/).filter(Boolean)) dictionary[tag] = category;
  }
  register('hair', 'bald bangs asymmetrical_bangs blunt_bangs swept_bangs parted_bangs sidelocks ahoge antenna_hair cowlick hair_over_one_eye hair_over_eyes hair_between_eyes hair_behind_ear hair_intakes hair_flaps hair_slicked_back hair_pulled_back hair_spread_out hair_tucking braid braids single_braid twin_braids side_braid french_braid crown_braid ponytail high_ponytail low_ponytail side_ponytail twintails low_twintails short_twintails hair_bun double_bun single_hair_bun two_side_up one_side_up bob_cut hime_cut pixie_cut dreadlocks cornrows undercut widow\'s_peak temporal_hairline streaked_hair split-color_hair two-tone_hair multicolored_hair gradient_hair rainbow_hair colored_inner_hair roots');
  register('eyes', 'heterochromia slit_pupils white_pupils black_pupils colored_pupils bright_pupils horizontal_pupils no_pupils symbol-shaped_pupils heart-shaped_pupils star-shaped_pupils ringed_eyes empty_eyes glowing_eyes mismatched_sclera black_sclera colored_sclera colored_eyelashes long_eyelashes eyelashes thick_eyebrows thin_eyebrows eyebrows eyebrows_visible_through_hair');
  register('face', 'freckles mole mole_under_eye mole_under_mouth facial_hair beard mustache goatee stubble scar scar_on_face scar_across_eye nose small_nose pointy_nose lips thick_lips fangs sharp_teeth buck_teeth facial_mark facial_tattoo beauty_mark dimples');
  register('skin', 'dark_skin dark-skinned_female dark-skinned_male tan tanned pale_skin fair_skin colored_skin white_skin black_skin blue_skin green_skin red_skin grey_skin gray_skin purple_skin pink_skin shiny_skin wet_skin');
  register('body', 'breasts small_breasts medium_breasts large_breasts huge_breasts gigantic_breasts flat_chest pectorals muscular muscular_female muscular_male abs toned biceps wide_hips narrow_waist thick_thighs thin slim fat plump chubby petite tall short height_difference long_legs long_neck broad_shoulders mature_female mature_male midriff navel thighs cleavage collarbone');
  register('species', 'animal_ears cat_ears dog_ears fox_ears wolf_ears rabbit_ears bunny_ears horse_ears bear_ears elf pointy_ears horns single_horn antlers tail cat_tail fox_tail wolf_tail dog_tail multiple_tails wings feathered_wings bat_wings angel_wings demon_wings scales fur claws monster_girl monster_boy kemonomimi');
  register('identity', 'solo solo_focus multiple_girls multiple_boys male_focus female_focus genderswap genderswap_(mtf) genderswap_(ftm) twins sisters brothers siblings');
  register('clothing', 'shirt skirt miniskirt dress coat jacket hoodie pants shorts jeans suit uniform school_uniform swimsuit bikini bra panties underwear thighhighs pantyhose socks gloves shoes boots sandals sneakers kimono yukata hakama apron necktie bowtie vest cape cloak collar collared_shirt hood sleeves long_sleeves short_sleeves sleeveless detached_sleeves striped_clothes plaid_clothes no_bra no_panties naked nude topless bottomless');
  register('accessories', 'hair_ornament hair_bow hair_ribbon hairband headband hairclip hair_flower hairpin hair_stick scrunchie ribbon bow jewelry earrings necklace bracelet ring choker glasses sunglasses hat cap beret tiara crown piercing ear_piercing hair_rings');
  register('expression', 'smile smiling grin laughing blush blushing nose_blush ear_blush crying tears sobbing pout pouting frown angry embarrassed expressionless surprised scared sleepy open_mouth closed_mouth parted_lips clenched_teeth tongue tongue_out drooling saliva sweat trembling');
  register('pose', 'looking_at_viewer looking_away looking_back looking_up looking_down closed_eyes half-closed_eyes wink winking blinking squinting rolling_eyes hand_in_own_hair hands_in_hair holding_hair grabbing_another\'s_hair holding_another\'s_hair hair_pull hair_tug arched_back arm_up arms_up arms_behind_back hand_up hands_up sitting standing lying kneeling crouching walking running jumping leaning reclining on_back on_side on_stomach crossed_legs crossed_arms crossed_hands legs_up spread_legs outstretched_arms hands_on_hips hand_on_hip head_tilt facing_viewer from_behind clothes_lift shirt_lift skirt_lift dress_lift hoodie_lift');
  register('scene', 'simple_background white_background black_background grey_background gray_background blue_background green_background red_background pink_background yellow_background purple_background transparent_background gradient_background outdoors indoors sky cloud clouds sunlight sunset night tree trees forest ocean beach room bedroom window wall against_wall blurry_background depth_of_field bokeh close-up upper_body full_body cowboy_shot portrait profile from_above from_below from_side dutch_angle wide_shot motion_blur motion_lines speed_lines backlighting rim_lighting');
  register('scene', 'from_behind');
  const rules = [
    ['hair', /^(?:very_)?(?:short|medium|long|absurdly_long|straight|wavy|curly|messy|spiky|fluffy|wet|floating|disheveled|black|brown|blonde|white|grey|gray|silver|red|orange|yellow|green|blue|purple|pink|aqua)_hair$/],
    ['eyes', /^(?:black|brown|blue|green|red|yellow|orange|pink|purple|aqua|grey|gray|silver|gold|amber|multicolored|two-tone)_eyes$/],
    ['identity', /^\d+(?:girl|girls|boy|boys|other|others)$/],
    ['clothing', /^(?:(?:black|white|grey|gray|brown|red|orange|yellow|green|blue|purple|pink|striped|plaid|lace-trimmed|frilled|sleeveless|collared|hooded|cropped|pleated|long|short|open|torn|school|military|sailor)_)+(?:shirt|skirt|dress|coat|jacket|hoodie|pants|shorts|suit|uniform|swimsuit|bikini|bra|panties|underwear|thighhighs|pantyhose|socks|gloves|shoes|boots|necktie|bowtie|vest|apron)$/],
    ['accessories', /^(?:silver|gold|black|white|red|green|blue|pink|purple|hoop|heart|star|cross)_(?:earrings|necklace|bracelet|ring|choker|ribbon|bow|hair_bow|hair_ribbon|hairclip)$/]
  ];
  // Exact exceptions are checked first so gaze, accessories, and backgrounds survive hair/eye filtering.
  function classify(tag, group) {
    if (group === 'Character' || group === 'Copyright') return { category:'identity', source:'网站分类' };
    if (group === 'Artist') return { category:'artist', source:'网站分类' };
    if (group === 'Meta') return { category:'meta', source:'网站分类' };
    if (dictionary[tag]) return { category:dictionary[tag], source:'词典' };
    for (const [category, pattern] of rules) if (pattern.test(tag)) return { category, source:'规则匹配' };
    return { category:'unknown', source:'未识别' };
  }

  const storageKey = 'danbooru-tag-tool:v2';
  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      return {
        filters:Array.isArray(saved?.filters) ? [...new Set(saved.filters.filter(key => Object.hasOwn(categoryNames, key)))] : [...appearance],
        overrides:saved?.overrides && typeof saved.overrides === 'object' && !Array.isArray(saved.overrides)
          ? Object.fromEntries(Object.entries(saved.overrides).filter(([,value]) => value === 'keep' || value === 'remove')) : {},
        scope:['general','prompt','all'].includes(saved?.scope) ? saved.scope : 'general',
        format:saved?.format === 'spaces' ? 'spaces' : 'original'
      };
    } catch { return { filters:[...appearance], overrides:{}, scope:'general', format:'original' }; }
  }
  const settings = readSettings();
  let storageAvailable = true;
  function saveSettings() {
    try { localStorage.setItem(storageKey, JSON.stringify(settings)); }
    catch { storageAvailable = false; }
  }

  const css = `
    #db-tag-tool { position: fixed; z-index: 99999; right: 18px; bottom: 64px; width: min(440px, calc(100vw - 36px)); max-height:calc(100dvh - 82px); display:flex; flex-direction:column; color: #202526;
      background: #fff; border: 1px solid #b7c5c2; border-radius: 6px; box-shadow: 0 8px 30px #0004;
      font: 14px/1.45 system-ui, sans-serif; overflow: hidden; }
    #db-tag-tool[hidden] { display:none; }
    #db-tag-tool * { box-sizing: border-box; letter-spacing:0; }
    #db-tag-tool .db-head { display:flex; justify-content:space-between; align-items:center; padding:10px 12px;
      background:#177e72; color:white; font-weight:700; }
    #db-tag-tool button { font:inherit; color: #fff; background:#177e72; border:1px solid #166e64; border-radius:4px; padding:6px 9px; cursor:pointer; }
    #db-tag-tool button:hover { background:#14685f; }
    #db-tag-tool button:disabled { opacity:.5; cursor:default; }
    #db-tag-tool .db-close { background:transparent; border:0; padding:0 4px; font-size:18px; }
    #db-tag-tool .db-actions { display:flex; gap:6px; flex-wrap:wrap; padding:9px 10px; border-bottom:1px solid #dce4e2; }
    #db-tag-tool .db-actions button { flex:1; }
    #db-tag-tool .db-scroll { min-height:0; overflow:auto; }
    #db-tag-tool .db-body { min-height:150px; max-height:300px; overflow:auto; padding: 4px 10px 10px; }
    #db-tag-tool details { border-bottom:1px solid #dce4e2; padding:7px 0; }
    #db-tag-tool summary { cursor:pointer; color:#274f47; font-weight:700; }
    #db-tag-tool .db-tags { white-space:pre-wrap; overflow-wrap:anywhere; color:#45514f; padding:6px 0 2px; }
    #db-tag-tool .db-status { color:#586b65; padding:9px 10px; font-size:12px; }
    #db-tag-tool textarea { width:100%; min-height:100px; color:#202526; background:#fff; }
    #db-tag-tool select { font:inherit; padding:5px; min-width:0; max-width:100%; color:#202526; background:#fff; border:1px solid #b7c5c2; border-radius:4px; }
    #db-tag-tool .db-config { padding:10px; border-bottom:1px solid #dce4e2; }
    #db-tag-tool .db-controls { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
    #db-tag-tool .db-controls label,#db-tag-tool .db-command { display:grid; gap:3px; font-size:12px; color:#586b65; }
    #db-tag-tool .db-filters { display:grid; grid-template-columns:1fr 1fr; gap:7px; padding:8px 0; }
    #db-tag-tool .db-filters label { display:flex; align-items:center; gap:6px; font-size:13px; }
    #db-tag-tool input { accent-color:#177e72; }
    #db-tag-tool .db-tabs { display:flex; gap:4px; padding:8px 10px 0; }
    #db-tag-tool .db-tabs button { flex:1; padding:6px 4px; background:#edf2f0; border-color:#c9d6d1; color:#40574f; font-size:13px; }
    #db-tag-tool .db-tabs button[aria-selected=true] { background:#177e72; color:white; }
    #db-tag-tool .db-row { display:grid; grid-template-columns:minmax(0,1fr) 96px; gap:8px; align-items:center; padding:7px 0; border-bottom:1px solid #e3e9e6; }
    #db-tag-tool .db-tag { display:block; overflow-wrap:anywhere; font-size:13px; }
    #db-tag-tool .db-reason { display:block; color:#65746d; font-size:11px; overflow-wrap:anywhere; }
    #db-tag-tool .db-row select { font-size:12px; width:96px; }
    #db-tag-tool .db-stats { padding:8px 10px; font-size:12px; color:#586b65; }
    #db-tag-tool .db-empty { padding:16px 0; color:#65746d; }
    #db-tag-tool .db-status { flex-shrink:0; border-top:1px solid #dce4e2; background:#f5f7f6; }
    #db-tag-tool button:focus-visible,#db-tag-tool select:focus-visible { outline:2px solid #177e72; outline-offset:2px; }
    @media (max-width:430px) {
      #db-tag-tool .db-actions { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
    #db-tag-launcher { position:fixed; z-index:99999; bottom:18px; right:18px; padding:9px 16px; border:1px solid #166e64; background:#177e72; color:white; border-radius:6px; cursor:pointer; }
  `;

  const groups = [
    ['Artist', 'tag_string_artist'],
    ['Copyright', 'tag_string_copyright'],
    ['Character', 'tag_string_character'],
    ['General', 'tag_string_general'],
    ['Meta', 'tag_string_meta']
  ];

  const isCivitai=location.hostname==='civitai.red';
  const currentId=()=>location.pathname.match(isCivitai?/\/images\/(\d+)/:/\/posts\/(\d+)/)?.[1];
  let id=currentId(),polarity='positive',loadSerial=0,lastPromptFingerprint='',awaitFreshPrompt=false;
  if (!['danbooru.donmai.us','civitai.red'].includes(location.hostname)) return;
  const existing = document.getElementById('db-tag-tool');
  if (existing) { existing.dispatchEvent(new Event('db-open')); return; }

  const style = document.createElement('style');
  style.textContent = css + `#db-tag-tool {box-sizing:border-box;width:min(460px,calc(100vw - 16px));max-height:calc(100dvh - 72px);border-radius:12px;background:#fcfbf6;font-family:"Microsoft YaHei","Segoe UI",sans-serif;}
#db-tag-tool [hidden] {display:none !important;}
#db-tag-tool .db-head {background:#123d36;padding:12px 14px;}
#db-tag-tool .db-head small {font-size:11px;font-weight:400;opacity:.8;}
#db-tag-tool .db-main-tabs {display:flex;background:#e9eee7;border-bottom:1px solid #c9d6d1;padding:6px;gap:4px;flex-shrink:0;}
#db-tag-tool .db-main-tabs button {flex:1;background:transparent;color:#40574f;border-color:transparent;font-size:13px;}
#db-tag-tool .db-main-tabs button[aria-selected=true] {background:#fff;border-color:#c9d6d1;}
#db-tag-tool .db-library-tabs {display:flex;overflow:auto;gap:6px;padding:12px 12px 6px;}
#db-tag-tool .db-library-tabs button {white-space:nowrap;background:#edf2f0;color:#40574f;border-color:#c9d6d1;}
#db-tag-tool .db-library-tabs button[aria-selected=true] {background:#177e72;color:#fff;}
#db-tag-tool .db-library-tools {display:flex;flex-wrap:wrap;gap:5px;padding:6px 12px;}
#db-tag-tool .db-library-tools button,#db-tag-tool .db-group-head button {background:transparent;color:#40574f;border-color:#c9d6d1;font-size:12px;}
#db-tag-tool .db-hint {font-size:12px;color:#65746d;padding:0;margin:7px 12px;overflow-wrap:anywhere;}
#db-tag-tool .db-group {margin:10px 12px;background:#fff;border:1px solid #dce4d8;border-radius:8px;padding:10px;}
#db-tag-tool .db-group-head {display:flex;gap:5px;align-items:center;flex-wrap:wrap;}
#db-tag-tool .db-group-head strong {flex:1;overflow-wrap:anywhere;}
#db-tag-tool .db-chips {display:flex;flex-wrap:wrap;gap:6px;margin:12px 0;}
#db-tag-tool .db-chip {display:inline-flex;max-width:100%;border:1px solid #c9d6d1;border-radius:5px;overflow:hidden;}
#db-tag-tool .db-chip button {background:#f3f5f1;color:#40574f;border:0;border-radius:0;font-size:12px;overflow-wrap:anywhere;min-width:0;}
#db-tag-tool .db-chip button[aria-pressed=true] {background:#177e72;color:white;}
#db-tag-tool .db-chip button:last-child {flex-shrink:0;border-left:1px solid #c9d6d1;}
#db-tag-tool .db-add-tags {display:flex;gap:6px;align-items:stretch;margin:0;}
#db-tag-tool .db-add-tags textarea {min-height:54px;flex:1;min-width:0;border:1px solid #c9d6d1;border-radius:5px;padding:7px;resize:vertical;font:12px/1.5 "Microsoft YaHei",sans-serif;}
#db-tag-tool .db-add-tags button {flex-shrink:0;align-self:center;font-size:12px;}
#db-tag-tool .db-custom-output {padding:12px;background:#eef2ea;border-top:1px solid #dce4d8;display:flex;flex-wrap:wrap;gap:6px;}
#db-tag-tool .db-selection {width:100%;max-height:90px;overflow:auto;font-size:12px;color:#40574f;overflow-wrap:anywhere;}
#db-tag-tool .db-history-head {display:flex;align-items:center;gap:6px;justify-content:space-between;padding:12px;font-size:12px;}
#db-tag-tool .db-history-head button {font-size:12px;}
#db-tag-tool .db-record {border-top:1px solid #dce4d8;padding:12px;}
#db-tag-tool .db-record-head {display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;}
#db-tag-tool .db-record-head strong {overflow-wrap:anywhere;}
#db-tag-tool .db-record-head time {color:#65746d;}
#db-tag-tool .db-record .db-hint {margin:6px 0;}
#db-tag-tool .db-record-text {white-space:pre-wrap;overflow-wrap:anywhere;max-height:110px;overflow:auto;background:#f0f3ed;padding:8px;border-radius:5px;font:12px/1.5 Consolas,monospace;margin:8px 0;}
#db-tag-tool .db-record button {font-size:12px;}
#db-tag-tool .db-empty {padding:16px 12px;}
#db-tag-tool .db-fallback {flex-shrink:0;padding:8px 12px;border-top:1px solid #c9d6d1;font-size:12px;}
#db-tag-tool .db-fallback textarea {min-height:60px;height:60px;max-height:90px;font-size:12px;}
#db-tag-tool .db-fallback button {font-size:11px;padding:3px 6px;}
#db-tag-tool textarea:focus-visible {outline:2px solid #177e72;}
#db-tag-launcher {touch-action:none;user-select:none;font:13px/1.5 "Microsoft YaHei",sans-serif;border-radius:20px;background:#123d36;padding:8px 14px;box-shadow:0 3px 14px #123d3640;}
#db-tag-launcher:focus-visible {outline:3px solid #7db2a4;outline-offset:3px;}
`;
  document.head.appendChild(style);

  const panel = document.createElement('section');
  panel.id = 'db-tag-tool';
  panel.innerHTML = `
    <div class="db-head"><span>标签工作台 <small>v4${id ? " · #" + id : ""}</small></span><button class="db-close" title="收起" aria-label="收起">×</button></div>
    <div class="db-main-tabs" role="tablist" aria-label="工作台页面"><button role="tab" data-page="filter" aria-selected="true">过滤标签</button><button role="tab" data-page="custom" aria-selected="false">自定义标签</button><button role="tab" data-page="history" aria-selected="false">复制记录</button></div>
    <div class="db-scroll"><div data-pane="filter" role="tabpanel" aria-label="过滤标签">
      <div class="db-config">
        <div class="db-controls">
          <label>过滤预设<select data-setting="preset" aria-label="过滤预设"><option value="none">不过滤</option><option value="appearance">去外貌</option><option value="identity">去人物设定</option><option value="scene">场景与构图优先</option><option value="custom">自定义</option></select></label>
          <label>标签范围<select data-setting="scope" aria-label="标签范围"><option value="general">仅 General</option><option value="prompt">General + 角色 + 作品</option><option value="all">全部分类</option></select></label>
        </div>
        <details class="db-options"><summary>过滤类别</summary><div class="db-filters"></div></details>
        <div class="db-controls">
          <label>输出格式<select data-setting="format" aria-label="输出格式"><option value="original">保留下划线</option><option value="spaces">转换为空格</option></select></label>
          <div class="db-command"><span>个人例外</span><button data-action="reset" title="清除当前保存的逐标签例外">清空例外</button></div>
        </div>
      </div>
      <div class="db-actions"><button data-action="copy" disabled>复制过滤结果</button><button data-action="original" disabled>复制原始</button><button data-action="download" disabled>下载 TXT</button><button data-action="refresh">刷新</button></div>
      <div class="db-tabs" role="tablist" aria-label="标签预览"><button role="tab" data-view="keep" aria-selected="true">保留</button><button role="tab" data-view="remove" aria-selected="false">已过滤</button><button role="tab" data-view="original" aria-selected="false">原始</button></div>
      <div class="db-stats"></div><div class="db-body" role="tabpanel" aria-label="标签列表"></div>
    </div>
<div data-pane="custom" role="tabpanel" aria-label="自定义标签" hidden><div class="db-library-tabs" role="tablist" aria-label="自定义标签页"></div><div class="db-library-tools"><button data-custom="new-tab">＋ 标签页</button><button data-custom="rename-tab">重命名页</button><button data-custom="delete-tab">删除页</button><button data-custom="new-group">＋ 分组</button></div><p class="db-hint">点击标签选中；逗号、中文逗号或换行可批量添加。</p><div class="db-library"></div><div class="db-custom-output"><div class="db-selection"></div><button data-custom="copy">复制选中标签</button><button data-custom="merge" disabled>合并过滤结果复制</button><button data-custom="deselect">取消全选</button></div></div>
<div data-pane="history" role="tabpanel" aria-label="复制记录" hidden><div class="db-history-head"><span>最近 10 次成功复制</span><button data-history="clear">清空记录</button></div><div class="db-history"></div></div></div>
<div class="db-fallback" hidden><label>自动复制失败，可手动复制<textarea readonly aria-label="手动复制文本"></textarea></label><button data-fallback-close>关闭文本</button></div><div class="db-status" role="status">准备就绪</div>`;
  document.body.appendChild(panel);
  const siteBar=document.createElement('div');siteBar.className='db-actions';
  for(const [name,url] of [['Civitai','https://civitai.red/'],['Danbooru','https://danbooru.donmai.us/']]){const link=document.createElement('a');link.href=url;link.textContent=name+' ↗';link.target='_blank';link.rel='noopener noreferrer';siteBar.append(link);}
  panel.querySelector('.db-head').after(siteBar);
  if(isCivitai){
    const directions=document.createElement('div');directions.className='db-actions db-polarities';
    for(const [key,label] of [['positive','正向提示词'],['negative','负面提示词']]){const button=document.createElement('button');button.dataset.polarity=key;button.textContent=label;button.setAttribute('aria-pressed',String(key===polarity));directions.append(button);}siteBar.after(directions);
    panel.querySelector('[data-setting=scope]').closest('label').hidden=true;
  }
  const launcher = document.createElement('button');
  launcher.id = 'db-tag-launcher';
  launcher.textContent = '标签';
  launcher.title = '点击打开或收起；拖动调整位置';
  launcher.setAttribute('aria-controls',panel.id);
  document.body.appendChild(launcher);

  let post;
  let view = 'keep';
  let rows = [];
  const $ = selector => panel.querySelector(selector);
  const setStatus = message => { $('.db-status').textContent = message + (storageAvailable ? '' : '（浏览器未允许保存设置）'); };
  for (const [category, name] of Object.entries(categoryNames)) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox'; input.dataset.category = category;
    input.checked = settings.filters.includes(category);
    label.append(input, document.createTextNode(name));
    $('.db-filters').append(label);
  }
  $('[data-setting="scope"]').value = settings.scope;
  $('[data-setting="format"]').value = settings.format;
  function syncPreset() {
    const match = Object.keys(presets).find(key => presets[key].length === settings.filters.length && presets[key].every(category => settings.filters.includes(category)));
    $('[data-setting="preset"]').value = match || 'custom';
    panel.querySelectorAll('[data-category]').forEach(input => { input.checked = settings.filters.includes(input.dataset.category); });
  }
  syncPreset();
  const tags = value => (value || '').split(/\s+/).filter(Boolean);
  const scopedGroups = () => settings.scope === 'all' ? groups : settings.scope === 'prompt'
    ? groups.filter(([name]) => ['General','Character','Copyright'].includes(name)) : groups.filter(([name]) => name === 'General');
  const present = tag => settings.format === 'spaces' ? tag.replaceAll('_', ' ') : tag;
  function evaluateRows() {
    if(isCivitai){
      rows=(post?.promptItems||[]).filter(item=>item.polarity===polarity).map(item=>{
        const category=item.category,override=settings.overrides[polarity+':'+item.text];
        return {tag:item.text,group:polarity==='positive'?'正向':'负面',category,source:'提示词分类',override,removed:override==='remove'||(override!=='keep'&&(category==='lora'||settings.filters.includes(category)||(category==='appearance'&&appearance.some(c=>settings.filters.includes(c)))))};
      });return;
    }
    rows = scopedGroups().flatMap(([group, key]) => tags(post[key]).map(tag => {
      const info = classify(tag, group);
      const override = Object.hasOwn(settings.overrides, tag) ? settings.overrides[tag] : undefined;
      return { tag, group, ...info, override, removed:override === 'remove' || (override !== 'keep' && settings.filters.includes(info.category)) };
    }));
  }
  const resultText = () => rows.filter(row => !row.removed).map(row => present(row.tag)).join(', ');
  const originalText = () => isCivitai?(polarity==='positive'?post.positive:post.negative):scopedGroups().map(([name,key]) => `${name}: ${tags(post[key]).join(', ')}`).join('\n');

  function render() {
    const body = panel.querySelector('.db-body');
    body.replaceChildren();
    evaluateRows();
    const kept = rows.filter(row => !row.removed);
    const removed = rows.filter(row => row.removed);
    const unknown = kept.filter(row => row.category === 'unknown' && !row.override);
    $('[data-view="keep"]').textContent = `保留 (${kept.length})`;
    $('[data-view="remove"]').textContent = `已过滤 (${removed.length})`;
    $('[data-view="original"]').textContent = `原始 (${rows.length})`;
    panel.querySelectorAll('[data-view]').forEach(button => { button.setAttribute('aria-selected', String(button.dataset.view === view)); });
    $('.db-stats').textContent = `${unknown.length} 个未识别标签已保留 · ${Object.keys(settings.overrides).length} 个个人例外`;
    $('[data-action="reset"]').disabled = !Object.keys(settings.overrides).length;
    const visible = view === 'original' ? rows : view === 'keep' ? kept : removed;
    for (const row of visible) {
      const item = document.createElement('div'); item.className = 'db-row'; item.dataset.tag = row.tag;
      const text = document.createElement('div');
      const name = document.createElement('span'); name.className = 'db-tag'; name.textContent = present(row.tag);
      const reason = document.createElement('span'); reason.className = 'db-reason';
      reason.textContent = `${row.group} · ${categoryNames[row.category] || '未识别'} · ${row.override ? (row.removed ? '个人例外：过滤' : '个人例外：保留') : row.source}`;
      text.append(name, reason);
      const select = document.createElement('select'); select.dataset.override = (isCivitai?polarity+':':'')+row.tag;
      select.setAttribute('aria-label', `标签 ${row.tag} 的例外规则`);
      for (const [value, label] of [['auto','自动'],['keep','始终保留'],['remove','始终过滤']]) {
        const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
      }
      select.value = row.override || 'auto';
      item.append(text, select); body.append(item);
    }
    if (!visible.length) { const empty = document.createElement('div'); empty.className = 'db-empty'; empty.textContent = '无标签'; body.append(empty); }
  }

  panel.addEventListener('change', event => {
    const target = event.target;
    if (target.dataset.category) settings.filters = [...panel.querySelectorAll('[data-category]:checked')].map(input => input.dataset.category);
    else if (target.dataset.override) {
      if (target.value === 'auto') delete settings.overrides[target.dataset.override];
      else settings.overrides[target.dataset.override] = target.value;
    } else if (target.dataset.setting === 'preset') {
      if (target.value !== 'custom') settings.filters = [...presets[target.value]];
    } else if (target.dataset.setting) settings[target.dataset.setting] = target.value;
    else return;
    saveSettings(); syncPreset(); if (post) render(); setStatus('设置已更新');
  });

  async function load(manual=false) {
    const generation=++loadSerial,requestedId=currentId();
    if(isCivitai&&requestedId!==id)awaitFreshPrompt=Boolean(lastPromptFingerprint);
    id=requestedId;post=null;rows=[];petLink.postLoaded(null);
    setStatus('正在读取…');$('.db-body').replaceChildren();$('.db-stats').textContent='';
    panel.querySelectorAll('[data-action]').forEach(b=>{if(b.dataset.action!=='reset')b.disabled=true;});$('[data-custom=merge]').disabled=true;
    try{
      if(!id)throw Error('请打开单张图片详情页；自定义标签和复制记录仍可使用');
      if(isCivitai){
        const prompt=CivitaiPrompts.read(document),fingerprint=JSON.stringify(prompt);
        if(!prompt.positive&&!prompt.negative)throw Error('未找到提示词，请展开 Generation data 后刷新；原图可能未公开参数');
        if(awaitFreshPrompt&&!manual&&fingerprint===lastPromptFingerprint)throw Error('等待当前图片参数加载，或点击刷新确认');
        awaitFreshPrompt=false;lastPromptFingerprint=fingerprint;
        const promptItems=[...PromptFilter.parse(prompt.positive).map(i=>({...i,polarity:'positive'})),...PromptFilter.parse(prompt.negative).map(i=>({...i,polarity:'negative'}))];
        post={id,...prompt,promptItems,petTags:promptItems.filter(i=>i.polarity==='positive'&&i.category!=='lora').map(i=>i.text.trim().toLowerCase().replace(/\s+/g,'_')).filter(t=>t.length<=128)};
      }else{
        const response=await fetch('/posts/'+id+'.json',{credentials:'same-origin',signal:AbortSignal.timeout(15000)});
        if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();
        if(generation!==loadSerial||requestedId!==currentId())return;
        if(String(data.id)!==id||typeof data.tag_string_general!=='string')throw Error('帖子数据无效');post=data;
      }
      render();setStatus(isCivitai?'提示词已读取 · 正向 / 负面独立筛选、复制':'标签已读取');petLink.postLoaded(post);
      panel.querySelectorAll('[data-action]').forEach(b=>{if(b.dataset.action!=='reset')b.disabled=false;});$('[data-custom=merge]').disabled=false;
    }catch(error){if(generation!==loadSerial)return;post=null;$('.db-body').replaceChildren();setStatus('读取提示：'+error.message);}
    finally{if(generation===loadSerial)$('[data-action=refresh]').disabled=false;}
  }

  async function copyText(text, mode = '过滤结果', sourceId = id) {
    if(isCivitai&&!/^(?:正向|负面) · /.test(mode))mode=(polarity==='positive'?'正向 · ':'负面 · ')+mode;
    if (!text.trim()) { setStatus('没有可复制的标签，请先选择标签'); return false; }
    const box = $('.db-fallback'), area = box.querySelector('textarea');
    box.hidden = true;
    try {
      if (typeof GM_setClipboard === 'function') await GM_setClipboard(text,'text');
      else {
        box.hidden = false; area.value = text; area.focus(); area.select();
        if (!document.execCommand('copy')) await navigator.clipboard.writeText(text);
      }
      box.hidden = true;
      workspace.history.unshift({time:Date.now(),mode,text,postId:sourceId || ''});
      workspace.history = workspace.history.slice(0,10);
      saveWorkspace(); renderHistory(); setStatus('已复制到剪贴板 · 已保存至复制记录');
      petLink.copied(text, sourceId);
      return true;
    } catch {
      box.hidden = false; area.value = text; area.focus(); area.select();
      setStatus('自动复制失败，文本已选中，请按 Ctrl+C'); return false;
    }
  }

  panel.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.classList.contains('db-close')) { setOpen(false); return; }
    if (button.dataset.view) { view = button.dataset.view; if (post) render(); return; }
    if (button.dataset.action === 'reset') { settings.overrides = {}; saveSettings(); if (post) render(); setStatus('个人例外已清空'); return; }
    if(button.dataset.polarity){polarity=button.dataset.polarity;panel.querySelectorAll('[data-polarity]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.polarity===polarity)));if(post)render();setStatus(polarity==='positive'?'当前操作正向提示词':'当前操作负面提示词');return;}
    if (button.dataset.action === 'refresh') return load(true);
    if (!post) return;
    if (button.dataset.action === 'copy') return copyText(resultText());
    if (button.dataset.action === 'original') return copyText(originalText(), '原始标签');
    if (button.dataset.action === 'download') {
      const blob = new Blob([resultText()], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = (isCivitai?'civitai-':'danbooru-')+id+'-'+(isCivitai?polarity:'tags')+'.txt'; panel.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus('已发起 TXT 下载');
    }
  });

  // v3 library and history are separate from v2 filtering preferences.
  const workspaceKey = 'danbooru-tag-tool:workspace:v3';
  const uid = () => crypto.randomUUID();
  const newGroup = name => ({id:uid(),name,tags:[]});
  const newTab = name => ({id:uid(),name,groups:[newGroup('我的标签')]});
  function readWorkspace() {
    let saved; try { saved = JSON.parse(localStorage.getItem(workspaceKey) || 'null'); } catch { saved = null; }
    const tabs = (Array.isArray(saved?.tabs) ? saved.tabs : []).filter(t => t && typeof t.name === 'string')
      .map(t => ({id:uid(),name:t.name.slice(0,80),groups:(Array.isArray(t.groups) ? t.groups : [])
        .filter(g => g && typeof g.name === 'string').map(g => ({id:uid(),name:g.name.slice(0,80),
          tags:(Array.isArray(g.tags) ? g.tags : []).filter(x => x && typeof x.text === 'string' && x.text.trim())
            .map(x => ({text:x.text,selected:x.selected === true}))}))}));
    if (!tabs.length) tabs.push(newTab('自定义'));
    const history = (Array.isArray(saved?.history) ? saved.history : [])
      .filter(h => h && typeof h.text === 'string' && h.text.trim() && Number.isFinite(h.time)).slice(0,10)
      .map(h => ({time:h.time,text:h.text,mode:typeof h.mode === 'string' ? h.mode : '复制记录',postId:String(h.postId || '')}));
    return {tabs,history,activeIndex:Number.isInteger(saved?.activeIndex) && saved.activeIndex >= 0 && saved.activeIndex < tabs.length ? saved.activeIndex : 0,
      dock:{left:Number.isFinite(saved?.dock?.left) ? saved.dock.left : null,top:Number.isFinite(saved?.dock?.top) ? saved.dock.top : null,open:saved?.dock?.open === true}};
  }
  const workspace = readWorkspace();
  function saveWorkspace() {
    try { localStorage.setItem(workspaceKey,JSON.stringify(workspace)); } catch { storageAvailable = false; }
  }
  function element(tag,className,text) {
    const node = document.createElement(tag); if(className) node.className = className;
    if(text !== undefined) node.textContent = text; return node;
  }
  function customButton(label,action,dataset = {}) {
    const b = element('button','',label); b.type = 'button'; b.dataset.custom = action;
    Object.assign(b.dataset,dataset); return b;
  }
  const activeTab = () => workspace.tabs[workspace.activeIndex];
  const selectedTags = () => [...new Set(activeTab().groups.flatMap(g => g.tags.filter(t => t.selected).map(t => t.text)))];
  function renderSelection() {
    const selected = selectedTags();
    $('.db-selection').textContent = selected.length ? '已选 ' + selected.length + ' 个：' + selected.join(', ') : '尚未选择标签';
    $('[data-custom="copy"]').disabled = !selected.length;
    $('[data-custom="deselect"]').disabled = !selected.length;
  }
  function renderCustom() {
    const tabsBox = $('.db-library-tabs'); tabsBox.replaceChildren();
    workspace.tabs.forEach((tab,index) => {
      const b = customButton(tab.name,'switch-tab',{index:String(index)});
      b.setAttribute('role','tab'); b.setAttribute('aria-selected',String(index === workspace.activeIndex)); tabsBox.append(b);
    });
    const library = $('.db-library'); library.replaceChildren();
    for(const group of activeTab().groups) {
      const card = element('section','db-group'); card.dataset.group = group.id;
      const head = element('div','db-group-head'); head.append(element('strong','',group.name));
      head.append(customButton('重命名','rename-group',{group:group.id}),customButton('删除','delete-group',{group:group.id}));
      const chips = element('div','db-chips');
      group.tags.forEach((tag,index) => {
        const chip = element('span','db-chip');
        const b = customButton(tag.text,'toggle-tag',{group:group.id,index:String(index)});
        b.setAttribute('aria-pressed',String(tag.selected)); b.title = '点击选择或取消';
        const remove = customButton('×','delete-tag',{group:group.id,index:String(index)});
        remove.setAttribute('aria-label','删除标签 ' + tag.text); chip.append(b,remove); chips.append(chip);
      });
      if(!group.tags.length) chips.append(element('p','db-hint','还没有标签，添加你的常用词。'));
      const form = element('form','db-add-tags'); form.dataset.group = group.id;
      const input = element('textarea'); input.rows = 2; input.placeholder = '例如：soft lighting, cinematic composition';
      input.setAttribute('aria-label','添加标签：' + group.name);
      const add = element('button','','添加标签'); add.type = 'submit'; form.append(input,add);
      card.append(head,chips,form); library.append(card);
    }
    if(!activeTab().groups.length) library.append(element('p','db-hint','点击“＋ 分组”创建标签分组。'));
    renderSelection();
  }
  function renderHistory() {
    const box = $('.db-history'); box.replaceChildren();
    $('[data-history="clear"]').disabled = !workspace.history.length;
    workspace.history.forEach((record,index) => {
      const item = element('article','db-record'), head = element('div','db-record-head');
      head.append(element('strong','',record.mode),element('time','',new Date(record.time).toLocaleString('zh-CN',{hour12:false})));
      const source = element('div','db-hint',record.postId ? '帖子 #' + record.postId : '自定义标签');
      const text = element('pre','db-record-text',record.text);
      const b = element('button','','再次复制'); b.dataset.history = 'copy'; b.dataset.index = String(index);
      item.append(head,source,text,b); box.append(item);
    });
    if(!workspace.history.length) box.append(element('p','db-empty','还没有复制记录。成功复制后会自动保存，最多保留 10 条。'));
  }
  function switchPage(name) {
    panel.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== name; });
    panel.querySelectorAll('[data-page]').forEach(b => b.setAttribute('aria-selected',String(b.dataset.page === name)));
    $('.db-fallback').hidden = true; positionDock();
  }
  panel.addEventListener('submit',event => {
    const form = event.target.closest('.db-add-tags'); if(!form) return; event.preventDefault();
    const group = activeTab().groups.find(g => g.id === form.dataset.group);
    const values = [...new Set(form.querySelector('textarea').value.split(/[,，\r\n]+/).map(t => t.trim()).filter(Boolean))];
    let added = 0;
    for(const text of values) if(!group.tags.some(t => t.text === text)) { group.tags.push({text,selected:true}); added++; }
    saveWorkspace(); renderCustom(); setStatus(added ? '已添加 ' + added + ' 个标签' : '没有新标签，重复项会自动跳过');
  });
  panel.addEventListener('click',async event => {
    const b = event.target.closest('button'); if(!b || b.disabled) return;
    if(b.dataset.page) return switchPage(b.dataset.page);
    if(b.hasAttribute('data-fallback-close')) { $('.db-fallback').hidden = true; return; }
    if(b.dataset.history === 'clear') {
      if(confirm('清空最近 10 次复制记录？')) { workspace.history = []; saveWorkspace(); renderHistory(); setStatus('复制记录已清空'); } return;
    }
    if(b.dataset.history === 'copy') {
      const record = workspace.history[Number(b.dataset.index)];
      if(record) await copyText(record.text,record.mode,record.postId); return;
    }
    const action = b.dataset.custom; if(!action) return;
    const tab = activeTab(), group = tab.groups.find(g => g.id === b.dataset.group);
    const namePrompt = (label,value = '') => prompt(label,value)?.trim().slice(0,80);
    if(action === 'copy') return copyText(selectedTags().join(', '),'自定义 · ' + tab.name,'');
    if(action === 'merge') {
      if(!post) return setStatus('请先成功读取当前帖子');
      const values = [...new Set([...rows.filter(r => !r.removed).map(r => present(r.tag)),...selectedTags()])];
      return copyText(values.join(', '),'合并 · ' + tab.name);
    }
    if(action === 'new-tab') { const name = namePrompt('新标签页名称'); if(!name) return; workspace.tabs.push(newTab(name)); workspace.activeIndex = workspace.tabs.length-1; }
    if(action === 'switch-tab') workspace.activeIndex = Number(b.dataset.index);
    if(action === 'rename-tab') { const name = namePrompt('标签页名称',tab.name); if(!name) return; tab.name = name; }
    if(action === 'delete-tab') {
      if(!confirm('删除标签页“' + tab.name + '”及其中所有标签？')) return;
      workspace.tabs.splice(workspace.activeIndex,1); if(!workspace.tabs.length) workspace.tabs.push(newTab('自定义'));
      workspace.activeIndex = Math.min(workspace.activeIndex,workspace.tabs.length-1);
    }
    if(action === 'new-group') { const name = namePrompt('新分组名称'); if(!name) return; tab.groups.push(newGroup(name)); }
    if(action === 'rename-group' && group) { const name = namePrompt('分组名称',group.name); if(!name) return; group.name = name; }
    if(action === 'delete-group' && group) {
      if(!confirm('删除分组“' + group.name + '”及其中所有标签？')) return; tab.groups = tab.groups.filter(g => g !== group);
    }
    if(action === 'toggle-tag' && group) { const tag = group.tags[Number(b.dataset.index)]; tag.selected = !tag.selected; }
    if(action === 'delete-tag' && group) group.tags.splice(Number(b.dataset.index),1);
    if(action === 'deselect') tab.groups.forEach(g => g.tags.forEach(t => { t.selected = false; }));
    saveWorkspace(); renderCustom(); setStatus('自定义标签已保存');
  });
  const clamp = (n,min,max) => Math.min(Math.max(n,min),Math.max(min,max));
  function positionDock() {
    const width = launcher.offsetWidth, height = launcher.offsetHeight;
    const x = clamp(workspace.dock.left ?? innerWidth-width-18,8,innerWidth-width-8);
    const y = clamp(workspace.dock.top ?? innerHeight-height-18,8,innerHeight-height-8);
    launcher.style.left = x + 'px'; launcher.style.top = y + 'px'; launcher.style.right = 'auto'; launcher.style.bottom = 'auto';
    if(!panel.hidden) {
      const above = y-16, below = innerHeight-y-height-16;
      const openAbove = above >= below;
      panel.style.maxHeight = Math.max(100,openAbove ? above : below) + 'px';
      const w = panel.offsetWidth,h = panel.offsetHeight;
      panel.style.left = clamp(x+width-w,8,innerWidth-w-8) + 'px';
      panel.style.top = clamp(openAbove ? y-h-8 : y+height+8,8,innerHeight-h-8) + 'px';
      panel.style.right = 'auto'; panel.style.bottom = 'auto';
    }
  }
  function setOpen(open) {
    panel.hidden = !open; workspace.dock.open = open; launcher.setAttribute('aria-expanded',String(open));
    saveWorkspace(); positionDock();
  }
  let drag = null, suppressClick = false;
  launcher.addEventListener('pointerdown',event => {
    if(event.button !== 0) return; const rect = launcher.getBoundingClientRect();
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,moved:false};
    suppressClick = false; launcher.setPointerCapture(event.pointerId);
  });
  launcher.addEventListener('pointermove',event => {
    if(!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX-drag.x,dy = event.clientY-drag.y; if(Math.hypot(dx,dy)>5) drag.moved = true;
    if(!drag.moved) return; workspace.dock.left = drag.left+dx; workspace.dock.top = drag.top+dy; positionDock();
  });
  function endDrag(event) {
    if(!drag || event.pointerId !== drag.id) return; suppressClick = drag.moved;
    if(drag.moved) { const rect = launcher.getBoundingClientRect(); workspace.dock.left = rect.left; workspace.dock.top = rect.top; saveWorkspace(); }
    drag = null;
  }
  launcher.addEventListener('pointerup',endDrag); launcher.addEventListener('pointercancel',endDrag);
  launcher.addEventListener('lostpointercapture',endDrag);
  launcher.addEventListener('click',() => { if(suppressClick) { suppressClick = false; return; } setOpen(panel.hidden); });
  panel.addEventListener('db-open',() => setOpen(true));
  panel.addEventListener('keydown',event => {
    if(event.key === 'Escape') { setOpen(false); launcher.focus(); }
    const tab = event.target.closest('[role="tab"]');
    if(!tab || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const list = [...tab.parentElement.querySelectorAll('[role="tab"]')]; let index = list.indexOf(tab);
    index = event.key === 'Home' ? 0 : event.key === 'End' ? list.length-1 : (index+(event.key === 'ArrowRight' ? 1 : -1)+list.length)%list.length;
    event.preventDefault(); list[index].focus(); list[index].click();
  });
  addEventListener('resize',positionDock); new ResizeObserver(positionDock).observe(panel);
  renderCustom(); renderHistory(); setOpen(workspace.dock.open);
  if(!id) switchPage('custom');

  // DESKTOP PET LINK BEGIN
// Embedded into browser/danbooru-tag-tool.user.js by scripts/build-tag-link.cjs.
function createPetLink(panel) {
  const STORAGE = 'desktop-pet-link:v1';
  let pairing = typeof GM_getValue === 'function' ? GM_getValue(STORAGE, null) : null;
  let currentPost = null, sequence = 0, activeSince = 0, timer, inFlight = false, nextAttempt = 0, failures = 0;
  let pointer = null, lastCopy = -Infinity, copyTimer, panelSent = false;
  const clientId = crypto.randomUUID();
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid #dce4d8;flex-shrink:0;flex-wrap:wrap';
  const button = document.createElement('button'); button.type = 'button'; button.textContent = '桌宠联动';
  const label = document.createElement('span'); label.style.cssText = 'font-size:11px;color:#65746d'; label.setAttribute('role','status');
  row.append(button, label); panel.append(row);
  const foreground = () => document.visibilityState === 'visible' && document.hasFocus();
  const validPairing = value => value && value.port === 17861 && typeof value.key === 'string' && /^[a-f0-9]{64}$/.test(value.key);
  if (!validPairing(pairing)) pairing = null;
  const setLabel = text => { label.textContent = text; };
  function send(kind, tags = [], postId = currentPost?.id || 'custom', eventId, extra = {}) {
    if (!pairing || typeof GM_xmlhttpRequest !== 'function') return;
    const payload = { v:1, site:location.hostname==="civitai.red"?"civitai":"danbooru", kind, tags, postId:String(postId), clientId, seq:++sequence, eventId, ...extra };
    if (!['leave','panel'].includes(kind) && !foreground()) return;
    if (kind !== 'leave') inFlight = true;
    const fail = text => { inFlight = false; failures++; nextAttempt = Date.now() + Math.min(30000, 5000 * failures); setLabel(text); };
    try {
      GM_xmlhttpRequest({ method:'POST', url:'http://127.0.0.1:' + pairing.port + '/v1/event', timeout:2500, anonymous:true,
        headers:{'Content-Type':'application/json','Authorization':'Bearer ' + pairing.key}, data:JSON.stringify(payload),
        onload(response) { inFlight=false; if(response.status===200) { failures=0;nextAttempt=0;setLabel('已连接 · 仅当前页面'); }
          else fail(response.status===401?'配对码不匹配，请重新配对':'连接被拒绝，请检查桌宠'); },
        onerror:()=>fail('桌宠未连接，稍后自动重试'), ontimeout:()=>fail('连接超时，稍后自动重试') });
    } catch { fail('请允许标签脚本访问 127.0.0.1'); }
  }
  function view() {
    if (!pairing || !currentPost || !foreground() || !activeSince || Date.now()-activeSince<1000 || inFlight || Date.now()<nextAttempt) return;
    send('view',currentPost.tags,currentPost.id);
  }
  function visibility() {
    clearTimeout(timer);
    if (foreground()) { activeSince=Date.now(); timer=setTimeout(view,1050); }
    else { activeSince=0; clearTimeout(copyTimer); send('leave'); }
  }
  function panelGeometry() {
    if (!pairing || Date.now()<nextAttempt) return;
    const rect = panel.getBoundingClientRect();
    const visible = document.visibilityState==='visible' && !panel.hidden && rect.width > 0 && rect.height > 0 && getComputedStyle(panel).display !== 'none';
    if (!visible && !panelSent) return;
    panelSent = visible;
    let sample = null;
    if (pointer && pointer.windowX === screenX && pointer.windowY === screenY && pointer.dpr === devicePixelRatio &&
        pointer.innerWidth === innerWidth && pointer.innerHeight === innerHeight) sample = pointer.value;
    send('panel', [], currentPost?.id || 'custom', undefined, {panel: visible ? {
      left:rect.left,top:rect.top,width:rect.width,height:rect.height,innerWidth,innerHeight,
      screenX,screenY,dpr:devicePixelRatio,pointer:sample
    } : null});
  }
  function copied(text = '', postId = 'custom') {
    clearTimeout(copyTimer);
    if (!pairing || !foreground() || Date.now()<nextAttempt || Date.now()-lastCopy<450) return;
    lastCopy=Date.now();
    const tags=String(text).split(/[,，\n]+/).map(t=>t.trim().toLowerCase().replace(/\s+/g,'_')).filter(t=>t && t.length<=128).slice(0,512);
    send('copy',tags,postId||'custom',crypto.randomUUID());
  }
  function queueCopy() { clearTimeout(copyTimer); copyTimer=setTimeout(()=>copied(),100); }
  // A single physical copy can emit keydown, copy, click and the success hook.
  // Coalesce these without reading the OS clipboard or selected page text.
  document.addEventListener('keydown',event=>{
    if (!event.repeat && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && String(event.key).toLowerCase()==='c') queueCopy();
  },true);
  document.addEventListener('copy',queueCopy,true);
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('button,[role="button"],input[type="button"],a');
    if (!target || target.disabled || target===button) return;
    const label=[target.textContent,target.value,target.title,target.getAttribute('aria-label')].filter(Boolean).join(' ');
    if (/复制|\bcopy\b/i.test(label) && !target.hasAttribute('data-page')) queueCopy();
  },true);
  document.addEventListener('pointermove',event=>{
    if (!event.isTrusted) return;
    pointer={windowX:screenX,windowY:screenY,dpr:devicePixelRatio,innerWidth,innerHeight,
      value:{screenX:event.screenX,screenY:event.screenY,clientX:event.clientX,clientY:event.clientY}};
  },true);
  function configure() {
    const value = prompt('粘贴桌宠「标签联动 → 复制配对码」得到的配对码。输入 off 可关闭浏览器联动。', '');
    if(value===null) return;
    if(value.trim().toLowerCase()==='off') { send('leave');pairing=null;GM_setValue(STORAGE,null);setLabel('联动已关闭');return; }
    const match=value.trim().match(/^DPT1:(17861):([a-f0-9]{64})$/);
    if(!match) { setLabel('配对码格式不正确，请从桌宠复制');return; }
    pairing={port:Number(match[1]),key:match[2]}; GM_setValue(STORAGE,pairing);nextAttempt=0;failures=0;
    setLabel('已配对，等待当前图片标签');visibility();
  }
  button.addEventListener('click',configure);
  if(typeof GM_registerMenuCommand==='function') GM_registerMenuCommand('桌宠联动 / 配对',configure);
  document.addEventListener('visibilitychange',visibility);addEventListener('focus',visibility);addEventListener('blur',visibility);
  addEventListener('pagehide',()=>send('leave'));
  const interval=setInterval(view,2000), geometryInterval=setInterval(panelGeometry,400);
  addEventListener('pagehide',()=>{clearInterval(interval);clearInterval(geometryInterval);clearTimeout(timer);clearTimeout(copyTimer);},{once:true});
  addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
  setLabel(pairing?'已配对，等待当前图片标签':'未配对 · 点击连接桌宠');
  visibility();
  return {
    postLoaded(post) {
      if(!post){currentPost=null;send('leave');return;}
      const tags=Array.isArray(post.petTags)?post.petTags:['artist','copyright','character','general','meta'].flatMap(category=>String(post['tag_string_'+category]||'').split(/\s+/)).filter(Boolean);
      currentPost={id:String(post.id),tags:[...new Set(tags)].slice(0,512)};visibility();
    },
    copied
  };
}

  const petLink = createPetLink(panel);
  // DESKTOP PET LINK END
  load();
  let refreshTimer;
  function changed(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(isCivitai){const next=JSON.stringify(CivitaiPrompts.read(document));if(next!==lastPromptFingerprint||!post)load();}},500);}
  const observer=new MutationObserver(records=>{if(isCivitai&&records.some(r=>!panel.contains(r.target)&&r.target!==launcher))changed();});
  if(isCivitai)observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  const navigation=setInterval(()=>{if(currentId()!==id)load();},600);
  addEventListener('pagehide',()=>{observer.disconnect();clearInterval(navigation);clearTimeout(refreshTimer);},{once:true});
})();
