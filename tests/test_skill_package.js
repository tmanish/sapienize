"use strict";
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
const {spawnSync}=require('child_process');
const repo=path.resolve(__dirname,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'sapienize-skill-'));
try {
  const extracted=spawnSync('python3',['-c','import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])',path.join(repo,'sapienize.skill'),temp],{encoding:'utf8'});
  assert.strictEqual(extracted.status,0,extracted.stderr);
  const skill=path.join(temp,'sapienize'),work=path.join(temp,'user-work');fs.mkdirSync(work);
  const guard=path.join(temp,'no-network.cjs');fs.writeFileSync(guard,"global.fetch=()=>{throw Error('NETWORK_MUST_NOT_RUN');};\n");
  const env={...process.env};
  for(const name of ['OPENAI_API_KEY','ANTHROPIC_API_KEY','OPENROUTER_API_KEY','GPTZERO_API_KEY'])delete env[name];
  function run(script,args) {
    return spawnSync(process.execPath,['--require',guard,path.join(skill,'scripts',script),...args],{cwd:work,env,encoding:'utf8',timeout:15000});
  }
  const text=('Mr. Vale arrived on Monday. He brushed his sleeve. Repairs cost 40 pounds. The notice said, “Come inside.”\n\n').repeat(18);
  fs.writeFileSync(path.join(work,'sample.txt'),text);fs.writeFileSync(path.join(work,'original.txt'),text);fs.writeFileSync(path.join(work,'good.txt'),text);
  fs.writeFileSync(path.join(work,'bad.txt'),text.replaceAll('40 pounds','400 pounds'));
  const help=run('sapienize.cjs',['--help']);assert.strictEqual(help.status,0,help.stderr);assert(help.stdout.includes('Sapienize v2'));
  const scan=run('sapienize.cjs',['scan','original.txt']);assert.strictEqual(scan.status,0,scan.stderr);assert.strictEqual(JSON.parse(scan.stdout).detectorEstimate.status,'unavailable');
  const profile=run('sapienize.cjs',['profile','sample.txt','--output','profile.json']);assert.strictEqual(profile.status,0,profile.stderr);
  const request={mode:'rewrite',originalPath:'original.txt',samplePaths:['sample.txt'],candidatePaths:['bad.txt','good.txt']};
  function check(spec) {fs.writeFileSync(path.join(work,'request.json'),JSON.stringify(spec));return run('check.cjs',[path.join(work,'request.json')]);}
  const checked=check(request);assert.strictEqual(checked.status,0,checked.stderr);
  const result=JSON.parse(checked.stdout);assert.strictEqual(result.networkCalls,0);assert.strictEqual(result.selectedPath,'good.txt');assert.strictEqual(result.voiceRefinement.selectedScore,100);assert(result.candidates.some(c=>!c.ranking.eligible));assert.strictEqual(result.detectorObservation,null);
  const failed=check({...request,candidatePaths:['bad.txt']});assert.strictEqual(failed.status,3,failed.stderr);assert.strictEqual(JSON.parse(failed.stdout).accepted,false);
  const savedProfile={...request,profilePath:'profile.json'};delete savedProfile.samplePaths;assert.strictEqual(check(savedProfile).status,0);
  fs.writeFileSync(path.join(work,'facts.txt'),'The room reopened on Monday. Repairs cost 40 pounds.');
  fs.writeFileSync(path.join(work,'scene.txt'),'The room reopened on Monday. Repairs cost 40 pounds.\n\n“Dry at last,” she said.');
  const generation={mode:'generation',sourceFactsPath:'facts.txt',samplePaths:['sample.txt'],candidatePaths:['scene.txt'],contentMode:'fiction'};
  const generated=check(generation);assert.strictEqual(generated.status,4,generated.stderr);
  const draft=JSON.parse(generated.stdout);assert.strictEqual(draft.accepted,false);assert.strictEqual(draft.candidates[0].verification.semanticIntegrity.criticalDifferenceCount,0);assert(draft.candidates[0].verification.semanticIntegrity.permittedAdditions.length);
  const ungrounded={...generation};delete ungrounded.sourceFactsPath;
  const missingFacts=check(ungrounded);assert.strictEqual(missingFacts.status,4);assert.strictEqual(JSON.parse(missingFacts.stdout).candidates[0].verification.semanticIntegrity.status,'not_applicable');
  assert.strictEqual(check({...request,provider:'openrouter'}).status,1,'local helper must not accept network configuration');
  assert.strictEqual(check({...request,candidatePaths:[]}).status,1);
  assert.strictEqual(check({...request,profilePath:'profile.json'}).status,1);
  const noDetector=run('sapienize.cjs',['detect','original.txt']);assert.strictEqual(noDetector.status,1);assert(noDetector.stderr.includes('GPTZERO_API_KEY'));assert(!noDetector.stderr.includes('NETWORK_MUST_NOT_RUN'));

  // Exercise the package's real CLI/provider contract with injected fixture output.
  const mockScript=path.join(temp,'mock-write.cjs');
  fs.writeFileSync(mockScript,`const cli=require(${JSON.stringify(path.join(skill,'runtime/src/cli/sapienize.js'))});const fs=require('fs');cli.run(['rewrite','original.txt','--samples','sample.txt'],undefined,{provider:{rewrite:async()=>({text:fs.readFileSync('original.txt','utf8'),completionStatus:'complete'})}}).then(code=>{process.exitCode=code});`);
  const mocked=spawnSync(process.execPath,['--require',guard,mockScript],{cwd:work,env,encoding:'utf8',timeout:15000});assert.strictEqual(mocked.status,0,mocked.stderr);assert.strictEqual(JSON.parse(mocked.stdout).voiceRefinement.targetMet,true);
  console.log('PASS: extracted Claude skill runs independently; local scores, ranking, fiction, protected facts, missing detector access and mocked provider path');
} finally {fs.rmSync(temp,{recursive:true,force:true});}
