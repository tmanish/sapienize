"use strict";
// Node-only study integration; credentials/token never enter browser artifacts.
const crypto = require('crypto');
const { ProviderAdapter, requestJson } = require('../providers/base');
const { createDetectorObservation, isJsonSafeValue } = require('./adapter');
function normalize(raw) {
  if (!isJsonSafeValue(raw) || !raw || !raw.summary || !Array.isArray(raw.results) ||
      !['ai','human'].every(k=>Number.isFinite(raw.summary[k]) && raw.summary[k]>=0 && raw.summary[k]<=1) ||
      Math.abs(raw.summary.ai+raw.summary.human-1)>0.01) throw Error('Copyleaks returned unsupported response data');
  return { aiScore:raw.summary.ai, humanWordShare:raw.summary.human, predictedAi:null,
    scoreScale:{min:0,max:1,higherMeans:'larger share of words classified as AI-generated'},
    semantics:'Copyleaks summary.ai is a word share, not an authorship probability. Study thresholds must be declared separately.' };
}
function createCopyleaksDetector(options={}) {
  if (!options.apiKey || !options.email) throw Error('Copyleaks requires COPYLEAKS_API_KEY and COPYLEAKS_EMAIL');
  const transport = new ProviderAdapter({name:'copyleaks',apiKey:options.apiKey,fetch:options.fetch,timeoutMs:options.timeoutMs});
  let token, expires=0;
  return {name:'copyleaks',async analyze(text){
    if(typeof text!=='string'||text.length<255||text.length>100000)throw Error('Copyleaks requires 255–100000 characters; input was not truncated');
    if(!token||Date.now()>=expires){
      const auth=await requestJson(transport,'https://id.copyleaks.com/v3/account/login/api',{method:'POST',redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:options.email,key:options.apiKey})});
      if(!auth||typeof auth.access_token!=='string'||!auth.access_token)throw Error('Copyleaks authentication returned no token');
      token=auth.access_token;expires=Date.now()+47*3600000;
    }
    const raw=await requestJson(transport,'https://api.copyleaks.com/v2/writer-detector/'+crypto.randomUUID()+'/check',{
      method:'POST',redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({text,sandbox:false,language:'en',sensitivity:2})});
    const normalized=normalize(raw);
    if([options.apiKey,token].some(secret=>JSON.stringify(raw).includes(secret)))throw Error('Copyleaks returned an unsafe response');
    return createDetectorObservation({name:'Copyleaks',version:typeof raw.modelVersion==='string'?raw.modelVersion:'unknown',date:new Date(),raw,normalized,calibrated:false,
      limitations:['Production API; not sandbox. Score is a word share and is not comparable to GPTZero class probabilities.','No Sapienize accuracy/calibration claim. Raw responses can contain submitted text.']});
  }};
}
module.exports={createCopyleaksDetector,normalize};
