"use strict";
const {ProviderAdapter,requestJson}=require('../providers/base');
const {createDetectorObservation,isJsonSafeValue}=require('./adapter');
function normalize(raw){
  const ai=raw && raw.results && raw.results.ai;
  if(!isJsonSafeValue(raw)||!raw||!ai||!Number.isFinite(ai.ai_assisted_percent)||ai.ai_assisted_percent<0||ai.ai_assisted_percent>100||typeof ai.prediction_label!=='string')throw Error('Originality.ai returned unsupported v3 response data');
  return {aiScore:ai.ai_assisted_percent/100,aiAssistedPercent:ai.ai_assisted_percent,predictedClass:ai.prediction_label,predictedAi:null,
    scoreScale:{min:0,max:1,higherMeans:'larger vendor-reported AI-assisted percentage'},
    semantics:'Originality.ai v3 results.ai.ai_assisted_percent divided by 100; not a calibrated authorship probability. Preserve the vendor prediction_label separately.'};
}
function createOriginalityDetector(options={}){
  if(!options.apiKey)throw Error('Originality.ai requires ORIGINALITY_API_KEY');
  const model=options.model||'model-5.0';
  if(!['model-5.0','model-5.0-max'].includes(model))throw Error('Unsupported Originality.ai study model');
  const transport=new ProviderAdapter({name:'originality',apiKey:options.apiKey,fetch:options.fetch,timeoutMs:options.timeoutMs});
  return {name:'originality',async analyze(text){
    if(typeof text!=='string'||!text.trim())throw Error('Originality.ai requires nonempty text');
    const raw=await requestJson(transport,'https://api.originality.ai/api/v3/scan',{
      method:'POST',redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json','X-OAI-API-KEY':options.apiKey},
      body:JSON.stringify({title:'Sapienize independent study',content:text,aiModelVersion:model,check_ai:true,check_ai_allowance:false,
        check_plagiarism:false,check_facts:false,check_readability:false,check_grammar:false,check_contentQuality:false,storeScan:false})});
    const normalized=normalize(raw);
    if(JSON.stringify(raw).includes(options.apiKey))throw Error('Originality.ai returned an unsafe response');
    return createDetectorObservation({name:'Originality.ai',version:typeof raw.results.ai.model==='string'?raw.results.ai.model:'unknown',date:new Date(),raw,normalized,calibrated:false,
      limitations:['API v3 Model 5.0 contract; schema drift fails closed. Model label may not identify the exact deployment build.','No Sapienize accuracy/calibration claim; a score is not proof of authorship. Raw responses may contain submitted text.']});
  }};
}
module.exports={createOriginalityDetector,normalize};
