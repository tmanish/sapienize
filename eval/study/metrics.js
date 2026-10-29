"use strict";
function rng(seed){let n=seed>>>0;return()=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n/4294967296;};}
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;}
function bootstrap(rows,key,seed=20261029){
  const groups=new Map();for(const r of rows){if(Number.isFinite(r[key])){if(!groups.has(r.cluster))groups.set(r.cluster,[]);groups.get(r.cluster).push(r[key]);}}
  const clusters=[...groups.values()];if(clusters.length<2)return null;
  const random=rng(seed),values=[];
  for(let i=0;i<2000;i++){const sample=[];for(let j=0;j<clusters.length;j++)sample.push(...clusters[Math.floor(random()*clusters.length)]);values.push(mean(sample));}
  values.sort((a,b)=>a-b);return {low:values[49],high:values[1949],level:0.95,method:'percentile bootstrap clustered by brief; 2000 resamples',clusters:clusters.length};
}
function score(observation){return observation.normalized.aiScore;}
function flagged(observation,detector,threshold){
  if(detector==='gptzero')return observation.normalized.predictedClass==='human'?false:true; // mixed is not a successful human classification
  return score(observation)>=threshold;
}
function qualityPass(job,arm){const candidate=job[arm],s=candidate?.verification?.semanticIntegrity;const count=candidate?.text?.trim().split(/\s+/).length||0;
  return !!candidate&&!candidate.incomplete&&!!s&&!['fail','invalid','insufficient','not_applicable'].includes(s.status)&&s.criticalDifferenceCount===0&&
    job.sourceCheck?.criticalDifferenceCount===0&&candidate.verification.voiceMatch.score>=job.originalVoice-3&&count>=job.words*0.8&&count<=job.words*1.2;
}
function summarize({jobs,observations,plan}){
  const index=new Map(observations.map(x=>[x.id+'|'+x.detector,x]));
  const reports=[];
  for(const detector of plan.judges){for(const [baseline,arm] of [['original','voice'],['original','refined'],['voice','refined']]){
    const pairs=[];let missing=0,versionChanged=0;
    for(const job of jobs){
      const a=index.get(job.id+'/'+baseline+'|'+detector),b=index.get(job.id+'/'+arm+'|'+detector);
      if(!a||!b||a.status!=='complete'||b.status!=='complete'){missing++;continue;}
      if(a.observation.version==='unknown'||a.observation.version!==b.observation.version){versionChanged++;continue;}
      const before=flagged(a.observation,detector,plan.thresholds[detector]),after=flagged(b.observation,detector,plan.thresholds[detector]);
      const candidate=job[arm],quality=qualityPass(job,arm),wordCount=candidate?.text?.trim().split(/\s+/).length||0;
      pairs.push({cluster:job.caseId,model:job.model.id,domain:job.domain,length:wordCount<500?'under_500':wordCount<800?'500_to_799':'800_plus',targetLength:job.words,version:a.observation.version,
        delta:score(b.observation)-score(a.observation),before:Number(before),after:Number(after),flip:Number(before&&!after),qualityPass:quality,qualifiedSuccess:Number(!after&&quality)});
    }
    function stats(rows){const detected=rows.filter(x=>x.before);return {n:rows.length,meanScoreChange:mean(rows.map(x=>x.delta)),scoreChangeCI:bootstrap(rows,'delta',plan.seed),beforeFlagRate:mean(rows.map(x=>x.before)),afterFlagRate:mean(rows.map(x=>x.after)),initiallyFlagged:detected.length,conditionalFlipRate:mean(detected.map(x=>x.flip)),conditionalFlipCI:bootstrap(detected,'flip',plan.seed),automaticallyQualifiedPassRate:mean(rows.map(x=>x.qualifiedSuccess)),manualQualityValidatedRate:null};}
    const slices={};for(const key of ['model','domain','length','targetLength','version']){slices[key]={};for(const value of new Set(pairs.map(x=>x[key])))slices[key][value]=stats(pairs.filter(x=>x[key]===value));}
    const controls=observations.filter(x=>x.detector===detector&&x.control&&x.status==='complete');
    reports.push({detector,role:plan.heldoutJudges.includes(detector)?'held_out':'feedback_detector_not_independent',baseline,arm,planned:jobs.length,missing,versionChanged,
      ...stats(pairs),conservativeQualifiedSuccessRate:pairs.length?pairs.reduce((n,x)=>n+x.qualifiedSuccess,0)/jobs.length:null,
      humanControls:{planned:plan.controls?.length||null,measured:controls.length,flagRate:mean(controls.map(x=>Number(flagged(x.observation,detector,plan.thresholds[detector]))))},slices});
  }}
  const joint= ['voice','refined'].map(arm=>{const rows=jobs.map(job=>{const available=plan.heldoutJudges.every(d=>{const before=index.get(job.id+'/original|'+d),after=index.get(job.id+'/'+arm+'|'+d);return before?.status==='complete'&&after?.status==='complete'&&before.observation.version!=='unknown'&&before.observation.version===after.observation.version;});const pass=available&&qualityPass(job,arm)&&plan.heldoutJudges.every(d=>!flagged(index.get(job.id+'/'+arm+'|'+d).observation,d,plan.thresholds[d]));return {cluster:job.caseId,available,pass:Number(pass)};});return {arm,planned:rows.length,measured:rows.filter(r=>r.available).length,conservativeQualifiedJointPassRate:rows.some(r=>r.available)?mean(rows.map(r=>r.pass)):null,confidenceInterval:rows.some(r=>r.available)?bootstrap(rows,'pass',plan.seed):null,manualQualityValidatedRate:null};});
  return {reports,joint,limitations:['No pooled cross-vendor score: metrics retain each vendor’s scale.','Missing calls, rejected candidates and generation failures remain in the planned denominator.','Bootstrap intervals cluster repeated models/lengths by brief; a small pilot cannot establish reliability.','Automated fidelity/voice checks are not blinded human quality ratings; manual validation remains unavailable.','Human-control genre/age coverage determines whether false-positive estimates generalize.']};
}
module.exports={rng,bootstrap,summarize,flagged};
