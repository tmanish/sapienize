#!/usr/bin/env node
"use strict";
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const core=require('../../src/core');
const providers=require('../../src/providers');
const {createGPTZeroDetector}=require('../../src/detectors/gptzero');
const {createCopyleaksDetector}=require('../../src/detectors/copyleaks');
const {createOriginalityDetector}=require('../../src/detectors/originality');
const {parseDataset,datasetFingerprint}=require('../dataset');
const manifests=require('../manifest');
const {auditDuplicates}=require('../duplicates');
const {rng,summarize}=require('./metrics');
const ROOT=path.resolve(__dirname,'../..');
const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
function write(file,value){fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{mode:0o600});}
function sourceHash(){const files=[];function walk(dir){for(const f of fs.readdirSync(dir).sort()){if(f.startsWith('.'))continue;const p=path.join(dir,f);if(fs.statSync(p).isDirectory())walk(p);else if(/\.(js|json)$/.test(p))files.push([path.relative(ROOT,p),fs.readFileSync(p,'utf8')]);}}walk(path.join(ROOT,'src'));walk(path.join(ROOT,'eval'));return sha(files);}
function privateDir(dir){const target=path.resolve(ROOT,dir),base=path.join(ROOT,'eval/.local')+path.sep;if(!target.startsWith(base))throw Error('Study runs must be stored under ignored eval/.local/');return target;}
function validate(config){
  if(config.schemaVersion!==1||config.feedbackDetector!=='gptzero')throw Error('Unsupported study configuration');
  if(!Array.isArray(config.models)||config.models.length<2||new Set(config.models.map(x=>x.id)).size!==config.models.length)throw Error('At least two distinct model configurations are required');
  for(const m of config.models)if(!/^[a-z0-9-]+$/.test(m.id)||!['anthropic','openai','openrouter'].includes(m.provider)||!m.modelEnv||!m.keyEnv)throw Error('Invalid model configuration');
  if(!Number.isInteger(config.repeats)||config.repeats<1||!Number.isInteger(config.seed))throw Error('Invalid repeats or seed');
  if(!Array.isArray(config.lengths)||!config.lengths.length||config.lengths.some(n=>!Number.isInteger(n)||n<300||n>2000))throw Error('Study lengths must be 300–2000 words');
  if(!Array.isArray(config.cases)||!config.cases.length||new Set(config.cases.map(c=>c.id)).size!==config.cases.length)throw Error('Missing/duplicate case IDs');
  for(const c of config.cases)if(!/^[a-z0-9-]+$/.test(c.id)||!c.brief||!c.facts||!c.domain||!['fiction','factual'].includes(c.contentMode))throw Error('Invalid case');
  if(JSON.stringify(config.judges)!==JSON.stringify(['gptzero','copyleaks','originality'])||JSON.stringify(config.heldoutJudges)!==JSON.stringify(['copyleaks','originality']))throw Error('Study v1 fixes GPTZero feedback and two held-out judges');
  for(const d of config.judges)if(!Number.isFinite(config.thresholds[d])||config.thresholds[d]<0||config.thresholds[d]>1)throw Error('Thresholds must be frozen numbers in [0,1]');
  return config;
}
function preflight(config,env=process.env){
  validate(config);const required=[...config.models.map(m=>m.keyEnv),'GPTZERO_API_KEY','COPYLEAKS_EMAIL','COPYLEAKS_API_KEY','ORIGINALITY_API_KEY'];
  const cases=config.cases.length*config.lengths.length*config.models.length*config.repeats;
  const humanManifest=path.resolve(ROOT,config.humanManifest);
  const controlCount=fs.existsSync(humanManifest)?read(humanManifest).splits?.find(s=>s.name===config.controlSplit)?.record_ids?.length:null;
  return {study:config.id,cases,arms:['original','voice','refined'],maximumWritingCalls:cases*3,maximumFeedbackCalls:cases*2,maximumCandidateJudgingCalls:cases*9,maximumJudgingCalls:Number.isInteger(controlCount)?cases*9+controlCount*3:null,
    additionalHumanControlCalls:Number.isInteger(controlCount)?controlCount*3:null,credentials:Object.fromEntries([...new Set(required)].map(k=>[k,!!env[k]])),
    missingModels:config.models.filter(m=>!env[m.modelEnv]).map(m=>m.modelEnv),
    humanInputs:[config.humanDataset,config.humanManifest].map(p=>({path:p,exists:fs.existsSync(path.resolve(ROOT,p))})),
    note:'No network calls. These are call ceilings, not dollar estimates. Provider defaults are retained in captured requests; seed controls order, not model determinism.'};
}
function freeze(config,dir,env=process.env){
  validate(config);dir=privateDir(dir);if(fs.existsSync(dir))throw Error('Use a new run directory; frozen studies are not overwritten');
  const humans=parseDataset(fs.readFileSync(path.resolve(ROOT,config.humanDataset),'utf8'));
  const manifest=read(path.resolve(ROOT,config.humanManifest));manifests.validateDatasetManifest(manifest,humans);
  if(humans.some(r=>r.source_type!=='human'||r.metadata?.synthetic===true))throw Error('Human samples/controls must be authentic, not synthetic fixtures');
  const refs=manifests.selectDatasetSplit(humans,manifest,config.referenceSplit),controls=manifests.selectDatasetSplit(humans,manifest,config.controlSplit);
  const profiles={};
  for(const domain of new Set(config.cases.map(c=>c.domain))){const samples=refs.filter(r=>r.domain===domain);if(!samples.length)throw Error('Missing authentic voice references for domain '+domain);const profile=core.createVoiceProfile(samples.map(r=>r.text));if(!profile.sample.meetsRecommendedMinimum)throw Error('Reference domain '+domain+' has fewer than 300 words');profiles[domain]=profile;}
  if(!controls.length)throw Error('Human controls are required');
  const models=config.models.map(m=>{if(!env[m.modelEnv])throw Error('Set explicit model ID in '+m.modelEnv);return {...m,model:env[m.modelEnv]};});
  const tasks=[];for(const c of config.cases)for(const words of config.lengths)for(const model of models)for(let repeat=1;repeat<=config.repeats;repeat++)tasks.push({id:`${c.id}-${words}-${model.id}-${repeat}`,caseId:c.id,domain:c.domain,words,model,repeat,brief:c.brief,facts:c.facts,contentMode:c.contentMode});
  const random=rng(config.seed);for(let i=tasks.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[tasks[i],tasks[j]]=[tasks[j],tasks[i]];}
  const plan={...config,models,tasks,humans,humanManifest:manifest,profiles,controls,codeHash:sourceHash(),frozenAt:new Date().toISOString(),humanFingerprint:datasetFingerprint(humans)};
  write(path.join(dir,'plan.json'),plan);write(path.join(dir,'plan.sha256.json'),{hash:sha(plan)});return {dir,hash:sha(plan),...preflight(config,env)};
}
function load(dir){dir=privateDir(dir);const plan=read(path.join(dir,'plan.json'));if(sha(plan)!==read(path.join(dir,'plan.sha256.json')).hash)throw Error('Frozen plan changed');if(plan.codeHash!==sourceHash())throw Error('Study implementation changed since freeze; create a new run');return {dir,plan};}
function need(env,names){const missing=[...new Set(names)].filter(k=>!env[k]);if(missing.length)throw Error('Missing credentials: '+missing.join(', '));}
function safe(value,env){let text=JSON.stringify(value);for(const key of Object.keys(env).filter(k=>/API_KEY|TOKEN|COPYLEAKS_EMAIL/.test(k))){if(env[key])text=text.split(JSON.stringify(env[key]).slice(1,-1)).join('[REDACTED]');}return JSON.parse(text);}
function arm(result){return {text:result.text,verification:result.verification,incomplete:result.incomplete,accepted:result.accepted,provider:result.provider,model:result.model,detectorRefinement:result.detectorRefinement||null};}
async function produce(runDir,{live=false,env=process.env,createProvider=providers.createProvider,feedbackFetch}={}){
  if(!live)throw Error('Production calls require --live; first inspect the frozen plan and account spending limits');
  const {dir,plan}=load(runDir);if(fs.existsSync(path.join(dir,'candidates.seal.json')))throw Error('Candidates are sealed; production cannot run after independent judging');
  need(env,[...plan.models.map(m=>m.keyEnv),'GPTZERO_API_KEY']);
  for(const task of plan.tasks){
    const file=path.join(dir,'jobs',task.id+'.json');if(fs.existsSync(file))continue; // no silent retries of billable/uncertain calls
    const state={...task,status:'inflight',startedAt:new Date().toISOString(),trace:[]};write(file,state);
    try{
      const transport=createProvider(task.model.provider,{apiKey:env[task.model.keyEnv],model:task.model.model});
      const provider={name:transport.name,model:transport.model,rewrite:async(prompt,context)=>{
        const result=await transport.rewrite(prompt,context);state.trace.push({prompt,context,result,at:new Date().toISOString()});write(file,safe(state,env));return result;}};
      const sourcePrompt=`Write approximately ${task.words} words. ${task.brief}\nSource facts to preserve:\n${task.facts}\nReturn only the text.`;
      const original=await provider.rewrite(sourcePrompt,{wordCount:task.words,pass:1});
      if(original.incomplete||original.truncated||original.refused||!original.text?.trim())throw Error('Original generation incomplete');
      state.original=original.text;state.originalVoice=core.compareVoice(original.text,plan.profiles[task.domain]).score;
      state.sourceCheck=core.verifyGeneration(task.facts,original.text,{contentMode:task.contentMode});
      const voiceSamples=manifests.selectDatasetSplit(plan.humans,plan.humanManifest,plan.referenceSplit).filter(r=>r.domain===task.domain).map(r=>r.text);
      const voice=await core.rewrite(original.text,{provider,voiceProfile:plan.profiles[task.domain],voiceSamples,maxPasses:1});state.voice=arm(voice);write(file,safe(state,env));
      // Start refinement from the SAME real voice draft, not another stochastic rewrite.
      let first=true;const reuse={name:provider.name,model:provider.model,rewrite:async(p,c)=>{if(first){first=false;return {text:voice.text,incomplete:voice.incomplete,truncated:voice.truncated,refused:voice.refused,completionStatus:voice.completionStatus};}return provider.rewrite(p,c);}};
      state.refined=arm(await core.rewrite(original.text,{provider:reuse,voiceProfile:plan.profiles[task.domain],voiceSamples,maxPasses:1,detectorRefinement:{apiKey:env.GPTZERO_API_KEY,maxPasses:2,fetch:feedbackFetch}}));
      state.status='complete';
    }catch(_){state.status='failed';state.error='Generation/refinement failed; inspect sanitized captured outputs and provider account logs. No automatic retry.';}
    state.finishedAt=new Date().toISOString();write(file,safe(state,env));
  }
  return seal(dir,plan);
}
function seal(dir,plan){
  const jobs=plan.tasks.map(t=>read(path.join(dir,'jobs',t.id+'.json')));
  if(jobs.some(j=>j.status==='inflight'))throw Error('An interrupted billable task is unresolved. Do not retry silently; review it before creating a new run');
  const records=[],metadata=[];
  for(const j of jobs)for(const a of ['original','voice','refined']){
    const text=a==='original'?j.original:j[a]?.text;if(!text)continue;
    const id=j.id+'/'+a;records.push({id,text,source_type:'ai',model:j.model.model,domain:j.domain,metadata:{synthetic:false,origin:'live_api',arm:a,case_id:j.caseId,repeat:j.repeat}});
    metadata.push({id,source_id:'study-live-model-outputs',domain:j.domain,language:'en',model_group:j.model.id,lineage_group:j.id,source_document_group:j.id,generation:{provider:j.model.provider,model:j.model.model,version:j.trace?.[0]?.result?.raw?.model||'unknown'},lineage:[{sequence:1,actor_type:'ai',operation:'live_generation'},...(a==='original'?[]:[{sequence:2,actor_type:'ai',operation:a==='voice'?'sample_guided_rewrite':'gptzero_refinement'}])]});
  }
  for(const r of plan.controls){records.push(r);metadata.push(plan.humanManifest.records.find(m=>m.id===r.id));}
  const source={id:'study-live-model-outputs',license:{identifier:'provider-terms-internal-evaluation',scope:'Locally retained study outputs; no public redistribution assertion'},consent:{status:'license_authorized',basis:'Account owner authorized model generation for internal evaluation; provider terms apply.'},rights:{permitted_uses:['evaluation'],redistribution:{status:'prohibited',conditions:'Do not publish raw corpus without a separate rights review.'},attribution:{required:false,instructions:'Retain requested/returned model metadata.'},withdrawal:{supported:true,handling:'Remove local run artifacts on owner request.'}},collection:{method:'live_provider_api',description:'Captured original model responses, prompts and derived candidate lineage.'},privacy:{classification:'private_local',contains_personal_data:false,storage:'eval/.local/',handling:'Local ignored artifacts; do not commit credentials or private texts.'}};
  const manifest={schema_version:1,dataset:{id:plan.id,version:'1',description:'Sealed paired live study; no accuracy claim implied',record_count:records.length,fingerprint:{algorithm:'sha256',value:datasetFingerprint(records)}},sources:[...plan.humanManifest.sources,source],records:metadata,split_policy:{frozen:true,assignment:'exactly_once',leakage_group_keys:manifests.LEAKAGE_GROUP_KEYS},splits:[{name:'evaluation',purpose:'All paired variants stay together; no tuning from independent judge results',record_ids:records.map(r=>r.id)}]};
  manifests.validateDatasetManifest(manifest,records);
  const references=manifests.selectDatasetSplit(plan.humans,plan.humanManifest,plan.referenceSplit);
  const assignments=new Map([...records.map(r=>[r.id,'evaluation']),...references.map(r=>[r.id,'voice_reference'])]);
  const audit=auditDuplicates([...records,...references],assignments);
  write(path.join(dir,'candidates.json'),{jobs,records,manifest,audit});
  write(path.join(dir,'candidates.seal.json'),{hash:sha({jobs,records,manifest,audit}),planHash:sha(plan),at:new Date().toISOString()});
  // Give reviewers no model, arm or detector labels. Keep the decoding key separate.
  const review=[],reviewKey=[];
  for(const record of records.filter(r=>r.source_type==='ai')){
    const job=jobs.find(j=>record.id.startsWith(j.id+'/'));
    const reviewId=sha(plan.seed+'|blind|'+record.id).slice(0,20);
    review.push({reviewId,brief:job.brief,sourceFacts:job.facts,original:job.original,text:record.text,
      referenceSamples:references.filter(r=>r.domain===job.domain).map(r=>r.text),
      rating:{criticalMeaningChange:null,unsupportedClaims:null,voiceSimilarity1to5:null,readability1to5:null,notes:''}});
    reviewKey.push({reviewId,recordId:record.id});
  }
  review.sort((a,b)=>a.reviewId.localeCompare(b.reviewId));
  write(path.join(dir,'blind-review.json'),{instructions:'Review without detector scores or the decoding key. Null ratings mean unreviewed. At least two independent raters should assess meaning, unsupported claims, voice and readability; adjudicate disagreements.',items:review});
  write(path.join(dir,'blind-review-key.json'),reviewKey);
  return {planned:jobs.length,complete:jobs.filter(j=>j.status==='complete').length,failed:jobs.filter(j=>j.status!=='complete').length,duplicatePairs:audit.pairs.length,sealed:true};
}
function detector(name,env,plan){if(name==='gptzero')return createGPTZeroDetector({apiKey:env.GPTZERO_API_KEY});if(name==='copyleaks')return createCopyleaksDetector({apiKey:env.COPYLEAKS_API_KEY,email:env.COPYLEAKS_EMAIL});return createOriginalityDetector({apiKey:env.ORIGINALITY_API_KEY,model:plan.originalityModel});}
async function judge(runDir,{live=false,env=process.env,createDetector=detector}={}){
  if(!live)throw Error('Judging sends texts to paid detector APIs; --live is required');
  const {dir,plan}=load(runDir),candidates=read(path.join(dir,'candidates.json'));
  if(sha(candidates)!==read(path.join(dir,'candidates.seal.json')).hash)throw Error('Candidates changed after sealing');
  need(env,['GPTZERO_API_KEY','COPYLEAKS_API_KEY','COPYLEAKS_EMAIL','ORIGINALITY_API_KEY']);
  const adapters=Object.fromEntries(plan.judges.map(d=>[d,createDetector(d,env,plan)]));
  const work=[];for(const record of candidates.records)for(const d of plan.judges)work.push({record,detector:d});
  const random=rng(plan.seed+1);for(let i=work.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[work[i],work[j]]=[work[j],work[i]];}
  for(const item of work){const file=path.join(dir,'observations',sha(item.record.id+'|'+item.detector)+'.json');if(fs.existsSync(file))continue;
    const value={id:item.record.id,textHash:sha(item.record.text),detector:item.detector,control:item.record.source_type==='human',status:'inflight'};write(file,value);
    try{value.observation=await adapters[item.detector].analyze(item.record.text);value.status='complete';}catch(_){value.status='failed';value.error='Detector unavailable or unsupported response; no score substituted.';}
    write(file,safe(value,env));
  }
  return report(dir);
}
function report(runDir){const {dir,plan}=load(runDir),candidates=read(path.join(dir,'candidates.json'));if(sha(candidates)!==read(path.join(dir,'candidates.seal.json')).hash)throw Error('Candidate seal mismatch');const obsDir=path.join(dir,'observations');const observations=fs.existsSync(obsDir)?fs.readdirSync(obsDir).filter(n=>n.endsWith('.json')).map(n=>read(path.join(obsDir,n))):[];
  const result={study:plan.id,status:observations.length===candidates.records.length*plan.judges.length&&observations.every(o=>o.status==='complete')?'measurements_complete':'partial',validity:candidates.audit.crossSplitPairCount?'reference_overlap_requires_review':'requires_human_quality_review',planHash:sha(plan),candidateHash:sha(candidates),codeHash:plan.codeHash,observations:observations.length,duplicates:candidates.audit,
    ...summarize({jobs:candidates.jobs,observations,plan})};write(path.join(dir,'report.json'),result);return result;
}
async function main(){const [command,input,directory,...rest]=process.argv.slice(2);if(command==='plan')console.log(JSON.stringify(preflight(read(path.resolve(ROOT,input||'eval/study/pilot.json'))),null,2));else if(command==='freeze')console.log(JSON.stringify(freeze(read(path.resolve(ROOT,input)),directory),null,2));else if(command==='produce')console.log(JSON.stringify(await produce(input,{live:directory==='--live'||rest.includes('--live')}),null,2));else if(command==='judge')console.log(JSON.stringify(await judge(input,{live:directory==='--live'||rest.includes('--live')}),null,2));else if(command==='report')console.log(JSON.stringify(report(input),null,2));else throw Error('Usage: study plan CONFIG | freeze CONFIG RUN_DIR | produce RUN_DIR --live | judge RUN_DIR --live | report RUN_DIR');}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={validate,preflight,freeze,load,produce,judge,report,seal,sha,sourceHash};
