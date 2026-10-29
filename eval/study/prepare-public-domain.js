#!/usr/bin/env node
"use strict";
// No network: consumes downloaded Gutenberg plain-text books, retaining originals.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {datasetFingerprint}=require('../dataset');
const {validateDatasetManifest,LEAKAGE_GROUP_KEYS,auditDatasetManifest}=require('../manifest');
const root=path.resolve(__dirname,'../..'),dir=path.join(root,'eval/.local/effectiveness');
const books=[
 {id:20203,author:'Benjamin Franklin',domain:'historical_prose',split:'voice_reference',start:'Dear son: I have ever had pleasure'},
 {id:34901,author:'John Stuart Mill',domain:'historical_prose',split:'human_control',start:'The subject of this Essay is not'},
 {id:1228,author:'Charles Darwin',domain:'scientific_exposition',split:'voice_reference',start:'When on board H.M.S.'},
 {id:14474,author:'Michael Faraday',domain:'scientific_exposition',split:'human_control',start:'I purpose, in return for the honour'},
 {id:84,author:'Mary Shelley',domain:'fiction',split:'voice_reference',start:'I am by birth a Genevese'},
 {id:113,author:'Frances Hodgson Burnett',domain:'fiction',split:'human_control',start:'When Mary Lennox was sent'}
];
const records=[],entries=[],sources=[],collection=[];
for(const book of books){
 const raw=fs.readFileSync(path.join(dir,'books',book.id+'.txt'),'utf8').replace(/\r\n?/g,'\n');
 const start=raw.indexOf(book.start);if(start<0)throw Error('Body anchor missing for '+book.id);
 const body=raw.slice(start).split('*** END OF THE PROJECT GUTENBERG')[0];
 const paragraphs=body.split(/\n\s*\n/).map(s=>s.replace(/\n/g,' ').trim()).filter(s=>s.split(/\s+/).length>8&&!/^\[|^Footnote|^NOTE/i.test(s))
  .map(s=>s.replace(/\[Illustration:[\s\S]*?\]/g,'').replace(/\[\d+\]/g,'').replace(/_/g,'').trim()).filter(Boolean);
 let cursor=0;const lengths=book.split==='voice_reference'?[900]:[350,700,350,700];
 lengths.forEach((target,index)=>{const selected=[];let words=0;while(words<target&&cursor<paragraphs.length){const p=paragraphs[cursor++];selected.push(p);words+=p.split(/\s+/).length;}if(words<target)throw Error('Insufficient text');const id='pg-'+book.id+'-'+(index+1),text=selected.join('\n\n');
  records.push({id,text,source_type:'human',author_id:book.author,domain:book.domain,metadata:{synthetic:false,source_url:'https://www.gutenberg.org/ebooks/'+book.id,source_sha256:crypto.createHash('sha256').update(raw).digest('hex'),book_id:book.id,word_count:words,pilot_only:true}});
  entries.push({id,source_id:'pg-'+book.id,domain:book.domain,language:'en',author_group:book.author,lineage_group:'book-'+book.id,source_document_group:'book-'+book.id,lineage:[{sequence:1,actor_type:'human',operation:'historical_authorship'},{sequence:2,actor_type:'tool',operation:'deterministic_excerpt_and_format_cleanup'}]});
  collection.push({id,split:book.split,wordCount:words,author:book.author,bodyAnchor:book.start,paragraphEnd:cursor});
 });
 sources.push({id:'pg-'+book.id,license:{identifier:'public-domain-US',scope:'Historical underlying work; retain Gutenberg original and notices locally',url:'https://www.gutenberg.org/ebooks/'+book.id},consent:{status:'not_applicable_public_domain',basis:'Gutenberg catalog identifies this historical work as public domain in the USA.'},rights:{permitted_uses:['evaluation'],redistribution:{status:'conditional',conditions:'Underlying public-domain work; Gutenberg edition/notice terms must be considered separately before redistribution.'},attribution:{required:true,instructions:'Record author and Gutenberg catalog URL.'},withdrawal:{supported:true,handling:'Remove local pilot corpus if provenance is challenged.'}},collection:{method:'public_domain_excerpt',description:'Body anchor and paragraph boundaries retained in collection.json. Single line wrapping, underscore emphasis and numeric footnote markers removed; illustration and standalone note blocks omitted.'},privacy:{classification:'public',contains_personal_data:false,storage:'eval/.local/',handling:'Historic non-private excerpts; full downloads and provenance retained locally.'}});
}
const manifest={schema_version:1,dataset:{id:'public-domain-pilot-humans-v1',version:'1',description:'Historical pilot only; separate authors for references and human controls, not representative of modern institutional text',record_count:records.length,fingerprint:{algorithm:'sha256',value:datasetFingerprint(records)}},sources,records:entries,split_policy:{frozen:true,assignment:'exactly_once',leakage_group_keys:LEAKAGE_GROUP_KEYS},splits:['voice_reference','human_control'].map(name=>({name,purpose:name==='voice_reference'?'Reference profiles only; never human-control scoring':'Human false-positive controls; never used for voice or refinement',record_ids:collection.filter(r=>r.split===name).map(r=>r.id)}))};
validateDatasetManifest(manifest,records);
for(const name of ['human.jsonl','human.manifest.json','collection.json'])if(fs.existsSync(path.join(dir,name)))throw Error('Prepared corpus already exists; preserve it and use a new version for changes');
fs.writeFileSync(path.join(dir,'human.jsonl'),records.map(r=>JSON.stringify(r)).join('\n')+'\n',{mode:0o600});
fs.writeFileSync(path.join(dir,'human.manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600});
fs.writeFileSync(path.join(dir,'collection.json'),JSON.stringify(collection,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({records:records.length,references:3,controls:12,fingerprint:datasetFingerprint(records),audit:auditDatasetManifest(manifest,records).status,collection},null,2));
