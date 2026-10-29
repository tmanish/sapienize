"use strict";
const assert = require('assert');
const {verifySemanticIntegrity:verify}=require('../src/rewrite/semantic');
function clean(a,b) {
  const r=verify(a,b);
  assert.strictEqual(r.criticalDifferenceCount,0,JSON.stringify(r.differences));
  return r;
}
function protectedChange(a,b,type) {
  const r=verify(a,b);
  assert.strictEqual(r.status,'fail',JSON.stringify({a,b,differences:r.differences}));
  if(type)assert(r.differences.some(d=>d.type===type&&d.severity==='error'),JSON.stringify(r.differences));
}
const separate='The medicine is safe for adults. The treatment is not approved for children.';
const joined='The medicine is safe for adults, but the treatment is not approved for children.';
clean(separate,joined);clean(joined,separate);
protectedChange(separate,'The medicine is not safe for adults, but the treatment is approved for children.','claim_polarity');
protectedChange(separate,joined.replace('not approved','approved'),'claim_polarity');
protectedChange(separate,joined.replace('is safe','is not safe'),'claim_polarity');
const sign='A new sign would show that somebody took an interest in the place. People would notice it from the road. They might come in who had not come in before.';
const combined='A new sign would show that somebody took an interest in the place—people would notice it from the road, and they might come in who had not come in before.';
clean(sign,combined);clean(combined,sign);
protectedChange(sign,combined.replace('had not come','had come'),'claim_polarity');
clean("There wasn't anything on his sleeve, but he brushed it anyway.",'Nothing on his sleeve, but he brushed it anyway.');
protectedChange("There wasn't anything on his sleeve, but he brushed it anyway.",'Something on his sleeve, but he brushed it anyway.','claim_polarity');
protectedChange('The medicine is safe for adults.','The medicine is safe for adults. The medicine is not safe for adults.','claim_polarity');
protectedChange('The medicine is safe for adults.','The medicine is not—although it was approved—safe for adults.','claim_polarity');

const pronouns='Mr. Vale arrived. He looked up. He brushed his sleeve.';
const repeated='Mr. Vale arrived. He looked up. Mr. Vale brushed his sleeve.';
assert(clean(pronouns,repeated).checks.named_entities.equivalentMentions.length);
clean(repeated,pronouns);
protectedChange(pronouns,repeated.replace('Mr. Vale brushed','Mr. Gray brushed'),'named_entity');
protectedChange(pronouns,repeated.replace('brushed','did not brush'),'named_entity');
protectedChange('Mr. Vale met Mr. Gray. He brushed his sleeve.','Mr. Vale met Mr. Gray. Mr. Vale brushed his sleeve.','named_entity');
protectedChange('Mr. Vale arrived. He looked up. Jack arrived. He brushed his sleeve.','Mr. Vale arrived. He looked up. Jack arrived. Mr. Vale brushed his sleeve.','named_entity');
protectedChange('Mr. Vale arrived. He looked up. A stranger arrived. He brushed his sleeve.','Mr. Vale arrived. He looked up. A stranger arrived. Mr. Vale brushed his sleeve.','named_entity');
protectedChange('Mr. Vale arrived. He waited. Mr. Gray arrived. He brushed his sleeve.','Mr. Vale arrived. He waited. Mr. Gray arrived. Mr. Vale brushed his sleeve.','named_entity');
protectedChange(pronouns,pronouns+' Mr. Vale stole a book.','named_entity');
protectedChange('Mr. Vale approved the repairs. Miss Reed rejected the sign.','Miss Reed approved the repairs. Mr. Vale rejected the sign.','named_entity');
protectedChange('Mr. Vale paid 40 pounds. Miss Reed paid 20 pounds.','Mr. Vale paid 20 pounds. Miss Reed paid 40 pounds.','named_entity');

const facts=pronouns+' Repairs cost 40 pounds on 12 November 2026. The notice said, “Come inside.” Details: https://example.org/room.';
const prose=repeated+' On 12 November 2026, repairs cost 40 pounds. The notice said, “Come inside.” Details: https://example.org/room.';
clean(facts,prose);
for(const [before,after,type]of [['40','400','number'],['12 November 2026','13 November 2026','date'],['https://example.org/room','https://example.org/other','url'],['Come inside.','Stay outside.','quotation']])protectedChange(facts,prose.replace(before,after),type);
protectedChange(facts,prose.replace('Repairs cost 40 pounds','Repairs cost 40 pounds').replace('repairs cost 40 pounds','repairs did not cost 40 pounds'),'claim_polarity');
console.log('PASS: sentence joins/splits, equivalent negatives, evidence-backed name repetition, ambiguity and fact/actor protections');
