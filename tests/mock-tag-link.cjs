const link = require('../tag-link.cjs');
module.exports = { ...link, createLinkStore: () => ({ read:link.defaults, write:link.normalizeConfig }), readPairingKey:()=> 'a'.repeat(64),
  createTagBridge:()=>({start(){},stop(){},status:()=>({listening:true,error:'',port:17861})}) };
