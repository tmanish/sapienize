# Configured stylistic signals: contextual reference

This is the host-readable companion to the executable `SAPIENIZE_TELLS` library. It supports explanation and revision; it is not an AI detector, a list of forbidden phrases, or evidence of authorship. Every pattern can occur in genuine human writing, and domain context, quotations, and an authentic `VoiceProfile` take precedence over generic advice.

## Contents

- [Phrase-level signals](#1-phrase-level-signals)
- [Document-level signals](#2-document-level-signals)
- [Manual/context-only guidance](#3-manualcontext-only-guidance)
- [What not to change automatically](#4-what-not-to-change-automatically)

The legacy severity value is a review-priority weight used by the backward-compatible style heuristic:

- **3:** review first because the pattern is highly formulaic in the curated library.
- **2:** review in context.
- **1:** weak/context-sensitive observation, usually relevant only when repeated or mismatched with the requested voice.

Severity is not statistical confidence or probability. A finding may be intentionally kept. The replacement column offers revision ideas, not mandatory substitutions. Entries added in 2025-2026 maintenance have not been established as calibrated evidence of model generation either; they are review prompts like the rest.

## 1. Phrase-level signals

The tables below are generated from `src/engine.js`, so labels and severities match what the analyzer reports. When one span matches more than one entry, the analyzer keeps the higher severity, then the longer match, then the entry listed first.

<!-- BEGIN GENERATED: SAPIENIZE_TELLS. Edit src/engine.js and run `npm run build`; do not edit by hand. -->

162 executable entries. Rows are ordered by severity, then library order. Examples are regression fixtures: the first quoted example is flagged with that label, and a "not flagged" example must not be.

### Lexical (`lexical`)

Stock words and phrases. Domain usage can be correct; judge each in context.

| Tell | Sev | Replace with | Example |
|---|---|---|---|
| delve | 3 | dig into / look at / examine | "We delve into the logs." |
| tapestry | 3 | mix / range / variety | "A rich tapestry of sounds." |
| a testament to | 3 | shows / proves | "The bridge is a testament to her skill." |
| ever-evolving | 3 | changing / cut it | "An ever-evolving field." |
| in today's [adjective] world | 3 | cut the opener, start with the point | "In today's digital world, we adapt."; not flagged: "In today's meeting we covered budgets." |
| navigate the complexities | 3 | handle / deal with / work through | "Teams navigate the complexities of tax law."; not flagged: "Navigate the menu to find settings." |
| game-changer | 3 | name the specific change | "This tool is a game-changer." |
| treasure trove | 3 | a lot of / a stack of | "The archive is a treasure trove." |
| double-edged sword | 3 | state the tradeoff directly | "Speed is a double-edged sword." |
| paradigm shift | 3 | big change, then say what changed | "It marks a paradigm shift." |
| unlock the potential | 3 | say what becomes possible | "Unlock the potential of your data."; not flagged: "Unlock the door before noon." |
| it's important to note that | 3 | delete it, note the thing directly | "It's important to note that rates rose."; not flagged: "It's important to sleep." |
| it should be noted that | 3 | delete it | "It should be noted that rates rose." |
| elevate your | 3 | improve / sharpen | "Elevate your cooking." |
| seamless | 3 | smooth / without extra steps | "A seamless checkout." |
| synergy | 3 | say how the parts help each other | "The teams found synergy." |
| stands as a | 3 | is | "It stands as a warning."; not flagged: "She stands as tall as her father." |
| plays a vital role | 3 | matters because... / does X | "Water plays a vital role here." |
| in the realm of | 3 | in | "Work in the realm of physics." |
| plethora | 3 | plenty / a lot | "A plethora of options." |
| harness the | 3 | use | "We harness the wind."; not flagged: "The dog pulled at its harness." |
| embark on | 3 | start | "We embark on a trip." |
| unleash | 3 | release / enable | "Unleash the hounds." |
| beacon of | 3 | example of | "A beacon of hope." |
| nestled | 3 | sits / located | "A cabin nestled in pines." |
| cannot be overstated | 3 | state it at normal volume | "Its value cannot be overstated." |
| actionable insights | 3 | things you can act on, or name one | "The report offers actionable insights." |
| multifaceted | 3 | name two of the facets instead | "A multifaceted issue." |
| at the intersection of | 3 | combining X and Y | "Work at the intersection of art and code." |
| in a world where | 3 | cut the movie-trailer opener | "In a world where data is cheap, storage wins." |
| look no further | 3 | cut | "Look no further." |
| a symphony of | 3 | a mix of, or list what's there | "A symphony of colors." |
| indelible mark | 3 | say what lasted | "It left an indelible mark." |
| holistic | 2 | whole / end-to-end | "A holistic plan." |
| serves as a | 2 | is / works as | "It serves as a guide."; not flagged: "The table serves as many as ten." |
| boasts | 2 | has | "The hotel boasts a pool." |
| myriad | 2 | many | "A myriad of options." |
| underscore | 2 | show / highlight | "The data underscores the risk."; not flagged: "Use an underscore in the file name." |
| leverage (verb) | 2 | use | "Teams can leverage the API."; not flagged: "The union had leverage in the talks." |
| foster | 2 | build / encourage | "We foster collaboration."; not flagged: "She has been a foster parent for years." |
| pivotal | 2 | key / decisive | "A pivotal moment." |
| cutting-edge | 2 | new / latest, or name the technique | "A cutting-edge lab." |
| state-of-the-art | 2 | best available / newest | "A state-of-the-art lab." |
| revolutionize | 2 | change / replace, then say how | "It will revolutionize retail." |
| transformative | 2 | say what it transforms into | "A transformative year." |
| empower | 2 | let / help / give X the ability to | "We empower teams." |
| streamline | 2 | simplify / cut steps | "We streamline billing." |
| comprehensive guide | 2 | guide | "A comprehensive guide to tea." |
| dive into | 2 | look at / start with | "We dive into the data." |
| deep dive | 2 | close look | "We did a deep dive on costs." |
| let's explore | 2 | here's how X works | "Let's explore the options." |
| at its core | 2 | basically / fundamentally, or cut | "At its core, it is a cache." |
| in essence | 2 | cut, or 'basically' | "In essence, it is a cache." |
| the key takeaway | 2 | the point is | "The key takeaway is simple." |
| when it comes to | 2 | for / with | "When it comes to tea, I drink green." |
| a wide range of | 2 | many / several, or list three | "A wide range of tools." |
| needless to say | 2 | cut it, then say it anyway or don't | "Needless to say, we left." |
| the world of | 2 | cut: 'the world of crypto' is 'crypto' | "She loves the world of jazz." |
| vibrant | 2 | lively, or describe what you actually see | "A vibrant market." |
| bustling | 2 | busy / crowded | "A bustling market." |
| meticulous | 2 | careful / exact | "Meticulous notes." |
| intricate | 2 | detailed / complex | "An intricate lock." |
| fast-paced | 2 | cut, or name the actual speed | "A fast-paced job." |
| utilize | 2 | use | "We utilize Python." |
| facilitate | 2 | help / make possible | "We facilitate meetings." |
| showcase | 2 | show | "The demo will showcase it." |
| unprecedented | 2 | new / first, with evidence | "An unprecedented year." |
| key insights/considerations | 2 | name them | "Two key considerations apply."; not flagged: "Put the key in the lock." |
| innovative | 2 | say what is new about it | "An innovative design." |
| in an era of | 2 | now / today, or cut | "We live in an era of cheap storage." |
| at the end of the day | 2 | in the end, or cut | "At the end of the day, it works." |
| masterclass in | 2 | a strong example of | "It was a masterclass in timing." |
| secret sauce | 2 | name the actual ingredient | "Speed is our secret sauce." |
| future-proof | 2 | durable / built to last, with evidence | "Future-proof your stack." |
| supercharge | 2 | speed up / boost, with a number | "Supercharge your build." |
| democratize | 2 | make X available to Y | "We democratize finance." |
| frictionless | 2 | easy / one step | "A frictionless signup." |
| here to stay | 2 | not going away, or evidence it persists | "Remote work is here to stay." |
| perfect storm | 2 | list the two or three causes | "A perfect storm of delays." |
| checks all the boxes | 2 | name the boxes | "This laptop checks all the boxes." |
| more than meets the eye | 2 | say what the hidden part is | "There is more than meets the eye." |
| blazing-fast | 2 | give the milliseconds | "A blazing-fast server." |
| does the heavy lifting | 2 | say what it actually does | "The cache does the heavy lifting." |
| quietly [became/powerful] | 2 | drop 'quietly' | "The app quietly became a habit."; not flagged: "She quietly left the room." |
| stark reminder | 2 | reminder, or state the fact | "A stark reminder of risk." |
| crucially, | 2 | cut; if it's crucial, the sentence should show it | "Crucially, it failed."; not flagged: "It was crucially timed." |
| ever-changing | 2 | changing, or cut | "An ever-changing market." |
| rapidly evolving | 2 | say what changed and when | "A rapidly evolving field." |
| shed light on | 2 | explain / show | "These results shed light on the cause." |
| pave the way | 2 | make X possible, and say how | "This will pave the way for reform." |
| the intricacies of | 2 | the details of, or name one | "She knows the intricacies of tax law." |
| valuable insights | 2 | state the insight | "It gave valuable insights." |
| tailored to your needs | 2 | say what is adjusted and for whom | "Plans tailored to your needs."; not flagged: "He wore a tailored suit." |
| unwavering | 2 | steady, or show the evidence | "Unwavering support." |
| labyrinthine | 2 | confusing / complicated | "A labyrinthine process." |
| captivating | 2 | say what holds attention | "A captivating story." |
| nuanced understanding | 2 | name the nuance | "A nuanced understanding of risk."; not flagged: "A nuanced argument about risk." |
| underpin | 1 | supports / is behind | "Two ideas underpin the plan." |
| crucial | 1 | fine once; swap repeats for 'key' or specifics | "Sleep is crucial."; not flagged: "Crucially, it failed." |
| robust | 1 | sturdy / reliable, or name the property | "A robust design." |
| that being said | 1 | still / but | "That being said, we agree." |
| ultimately | 1 | in the end, or cut | "Ultimately, we left." |
| swiftly and | 1 | fast | "They moved swiftly and calmly." |
| significant | 1 | give the number instead | "Costs rose significantly."; not flagged: "The change was insignificant." |
| delightful | 1 | say what's good about it | "A delightful meal." |
| stakeholders | 1 | name the actual people | "Tell the stakeholders." |
| best practices | 1 | fine in dev docs; elsewhere name the practice | "Follow best practices." |
| optimize | 1 | fine in code; in prose, improve / tune / speed up | "We optimize queries." |
| in a nutshell | 1 | in short, or cut | "In a nutshell, it works." |
| grapple with | 1 | struggle with / work through | "We grapple with debt." |
| resonate | 1 | land / connect / ring true | "The talk will resonate." |
| journey (metaphorical) | 1 | process / path, or the literal thing | "Our journey to profit was long." |
| ecosystem | 1 | fine in biology; elsewhere, platform / toolchain / market | "The plugin ecosystem grew." |
| landscape (metaphorical) | 1 | market / field / space, or cut | "The vendor landscape is crowded." |
| silver bullet | 1 | single fix / cure-all | "There is no silver bullet." |
| table stakes | 1 | the minimum / expected baseline | "Uptime is table stakes." |
| notably, | 1 | cut, or make the point carry its own weight | "Notably, it failed."; not flagged: "It was notably faster." |
| importantly, | 1 | cut | "Importantly, it failed."; not flagged: "It matters importantly to few." |
| arguably | 1 | commit or attribute the argument | "It is arguably the best." |
| garner | 1 | get / earn / draw | "It may garner votes." |
| in the grand scheme of things | 1 | overall, or cut | "In the grand scheme of things, it is minor." |

### Structural (`structure`)

Templated sentence frames, hooks, and signposting.

| Tell | Sev | Replace with | Example |
|---|---|---|---|
| whether you're X or Y | 3 | pick one reader and write to them | "Whether you're a cook or a baker, read on."; not flagged: "Whether you're ready matters less." |
| that's not X, that's Y | 3 | state Y directly | "That's not a bug, that's a feature."; not flagged: "That's not true." |
| it's not just X, it's Y | 3 | state Y directly | "It's not just a tool, it's a mindset."; not flagged: "It's not just a tool." |
| in conclusion | 3 | just conclude | "In conclusion, it works." |
| without further ado | 3 | cut | "Without further ado, the results." |
| not because X, but because Y | 3 | give the real reason once, plainly | "We left not because of rain, but because of cost."; not flagged: "We left because of cost." |
| No X. No Y. Just Z. | 3 | one plain sentence about what it is | "No ads. No tracking. Just mail." |
| picture this | 3 | open with the specific scene itself | "Picture this: a quiet office." |
| let that sink in | 3 | trust the reader; cut | "Let that sink in." |
| imagine a world | 3 | describe the concrete case instead | "Imagine a world without passwords." |
| not only... but also | 2 | split into two claims or keep the stronger one | "It is not only cheap but also fast."; not flagged: "Not only that, it shipped late." |
| in summary | 2 | cut, or 'so:' | "In summary, it works." |
| firstly | 2 | first | "Firstly, check the cable." |
| hope this helps / finds you well | 2 | cut or personalize | "Hope this helps!" |
| not by X, but by Y | 2 | keep the second half only | "Win not by force, but by patience." |
| And the X? Y. | 2 | join it to the sentence it answers | "And the price? Zero."; not flagged: "Bread, milk, and the rest? Later." |
| The result? (rhetorical fragment) | 2 | just state the result | "The result? Chaos."; not flagged: "The result was chaos." |
| here's the kicker | 2 | delete the drumroll, keep the point | "Here's the catch: it leaks." |
| as a [role], you know... | 2 | say the thing without deputizing the reader | "As a parent, you know the feeling."; not flagged: "As a rule, check twice." |
| sound familiar? | 2 | cut | "Sound familiar?" |
| one thing is clear | 2 | state the clear thing | "One thing is clear: it works." |
| in this article, we will | 2 | start with the first real point | "In this article, we will cover caching."; not flagged: "In this article, the author argues for caching." |
| let's break it down | 2 | just explain it | "Let's break it down." |
| not just X, but Y | 2 | state Y directly | "It's not just a library, but a platform."; not flagged: "We are not just yet ready." |
| here are some... | 1 | go straight to the first item | "Here are some options." |
| let's be honest / face it | 1 | just be honest without announcing it | "Let's be honest, it was slow." |
| whether we like it or not | 1 | cut | "Whether we like it or not, prices rose." |
| pro tip: | 1 | just give the tip | "Pro tip: save often." |
| spoiler: | 1 | cut the wind-up | "Spoiler: it works."; not flagged: "The car has a rear spoiler." |
| think of it as | 1 | use the comparison only if it explains something | "Think of it as a cache." |

### Rhythm (`rhythm`)

Connector and opener habits that flatten cadence.

| Tell | Sev | Replace with | Example |
|---|---|---|---|
| Moreover/Furthermore/Additionally opener | 2 | and / also / plus, or no connector at all | "The tool is fine. Moreover, it is cheap."; not flagged: "It was moreover, in a sense, cheap." |
| however, it is... | 1 | but it's | "However, it is late."; not flagged: "However, they were late." |

### Chat-assistant residue (`residue`)

These phrases usually survive when text is pasted out of a chat assistant's reply. They say nothing about whether the surrounding prose is the author's; they mean a conversational wrapper was left in. Confirm with the author before deleting, and never treat them as proof of authorship.

| Tell | Sev | Replace with | Example |
|---|---|---|---|
| as an AI language model | 3 | delete the disclaimer; it isn't part of the draft | "As an AI language model, I cannot say." |
| as of my last knowledge update | 3 | delete it and check the fact against a current source | "As of my last knowledge update, the law stood." |
| great question | 3 | cut; answer the question | "Great question! The answer is two." |
| you're absolutely right | 2 | cut, or say what specifically was right | "You're absolutely right, the date is wrong." |
| Certainly! (chat opener) | 2 | cut; start with the content | "Certainly! Here is the summary."; not flagged: "He was certainly! not pleased." |
| I'd be happy to help | 2 | cut, or offer something specific | "I'd be happy to help with that." |
| don't hesitate to reach out | 2 | say how to reach you, once | "Don't hesitate to reach out." |
| let me know if you have any... | 1 | fine in email; elsewhere cut | "Let me know if you have any questions." |
| feel free to | 1 | just give the instruction, or cut | "Feel free to edit the file." |

<!-- END GENERATED: SAPIENIZE_TELLS -->

## 2. Document-level signals

These are computed over the whole text rather than matched as phrases.

- **Low sentence-length variation** (sev 3, or 1 when modest): sentence lengths barely vary. Report the measured distribution and compare it with the authentic profile; do not manufacture a short/long sentence quota when the author's cadence is genuinely even.
- **Monotone stretches** (sev 2): 3+ consecutive sentences within a few words of the same length. Break one.
- **Repeated openers** (sev 1): 3+ sentences starting with the same non-trivial word.
- **Rule-of-three density** (sev 2): repeated "X, Y, and Z" constructions can sound templated. Compare the frequency with the authentic profile and revise only when it is out of character or obscures the point.
- **Uniform paragraph blocks** (sev 2): similarly sized paragraphs are worth reviewing, but may be correct for a constrained format. Let the idea and the author's profile determine paragraph shape.
- **Contraction behavior** (sev 3 when near-total expansions trigger the rule, 1 when low): compare "do not," "it is," and similar forms with the requested register and authentic profile. Formal expansions may be genuine voice; do not contract by default.
- **Em dash frequency** (sev 3 above the configured threshold, 1 when elevated): report density and compare it with the authentic profile. There is no universal zero-em-dash rule. Keep or revise each dash according to meaning and the author's punctuation habits.
- **Semicolon density** (sev 1): contextual, especially across technical, legal, academic, and casual registers.
- **Invisible or directional characters**: report these through document integrity. They may be intentional formatting, accidental residue, or suspicious manipulation, but they are not evidence of a watermark or AI authorship. Do not remove them merely to change provenance; surface them for review.

## 3. Manual/context-only guidance

None of these is an executable `SAPIENIZE_TELLS` check. They are host guidance for a human or assistant reviewing the draft.

- **Manual/context-only — bold-label bullet formatting** where prose was requested: convert to sentences only when the requested format calls for prose.
- **Manual/context-only — abstract intensifiers**: phrases such as "greatly enhanced" or "vastly improved" need evidence-aware review. Prefer a number or concrete effect when the source supports one.
- **Manual/context-only — no first person in a personal piece**: ask the author about a possible mismatch; never invent an experience, action, or opinion.
- **Manual/context-only — repeated hedged balance**: hedging can be essential, so preserve the original certainty and compare it with the author's register.

## 4. What not to change automatically

- Domain vocabulary that overlaps the list: "robust" in statistics, "leverage" in finance, "pivotal" in a history of hinges. Judgment beats the table.
- The author's measured habits and genuine idioms, even when they overlap a configured signal. The goal is their voice, not generic casual prose.
- Facts, numbers, names, links, quotes. Never paraphrase a quotation.
- Correctness. Never introduce an error to sound casual.
- Negation, uncertainty, modality, conditions, or claim scope.
- Punctuation merely to improve the legacy style heuristic.

This library is not a detector surrogate. Explicit detector-aware refinement requires actual configured vendor observations and protected-content/voice gates; never infer detector scores from these tells. Provenance signals do not belong in rewrite objectives.
