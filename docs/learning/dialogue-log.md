# Learning dialogue log

Running record of Jeremy's Mandarin study sessions with Claude (in this workspace, outside the app).
Purpose: (1) track what's been learned, (2) periodically analyze to inform app features
(reading/writing mode, translation lookups, mnemonic style, etc.).

Format per entry: date · English → 汉字 · pinyin · notes/mnemonics · (any follow-up questions)

---

## App insights (updated periodically)

- 2026-09-03: User wants an English → 汉字 + pinyin lookup with per-character breakdown and
  mnemonics/etymology. Candidate feature: "translate & explain" side-channel (writing/reading
  counterpart to the existing hold-E English question).
- 2026-09-03: Teach tone sandhi rules (3rd+3rd → 2nd+3rd; 不/一 tone changes) as explicit tips —
  the STT/TTS loop won't surface these on its own.
- 2026-09-03: Present multiple register variants (textbook / natural / casual) per phrase, not one answer.
- 2026-09-03: Mnemonic style that works: radical decomposition + phonetic-component explanation
  (e.g. 马 as a sound-lender in 吗/妈). Consider a per-character "why it looks like that" card.

---

## Entries

### 2026-09-03

**"How's it going?"**
- 你好吗？ nǐ hǎo ma — textbook, slightly formal
- 最近怎么样？ zuìjìn zěnmeyàng — natural, what people actually say
- 你怎么样？ nǐ zěnmeyàng — casual
- Breakdown: 你 nǐ you · 好 hǎo good (woman 女 + child 子) · 吗 ma question particle (mouth 口 + horse 马)
  · 最近 zuìjìn recently · 怎么样 zěnmeyàng "how / what's it like"
- Mnemonics: 好 = 女 woman + 子 child = "good"; 吗 = 口 mouth + 马 horse — horse lends the sound "ma",
  mouth marks it as a spoken particle (same pattern as 妈 mā mom = 女 + 马)
- 最近 = 最 zuì "most" + 近 jìn "near" → "the nearest time"; 怎么样 = 怎么 "how" + 样 "appearance/kind"
- 怎么样 is a fixed chunk — memorize whole; alone it means "how about it? / what do you think?"
- Tone sandhi: two 3rd tones in a row → first becomes 2nd. 你好 nǐ hǎo is spoken *ní hǎo*.
- User instruction: log everything — any detail may feed tutoring/teaching in the app.

**"He is correct" — 他对 vs 他是对?**
- 他是对的 tā shì duì de — natural, complete
- 他对 tā duì — grammatical but clipped; ok as a quick reply
- 他是对 ✗ — 是 can't attach directly to an adjective; needs 是…的 frame
- 他说得对 tā shuō de duì — "what he said is right"; often the intended meaning
- Grammar: adjectives are stative verbs; no 是 needed (他很高, not 他是高). 是…的 nominalizes for emphasis.
- App insight: user's instinct is to insert 是 ("is") before adjectives — a classic English-transfer error.
  Tutor should watch for 是+adjective and correct with the 是…的 / 很+adj alternatives.

**Follow-up: why are adjectives verbs?**
- Stative verbs: 对 = "to be correct", 高 = "to be tall", 忙 = "to be busy". The "is" is baked in.
- Evidence: negate with 不 (他不忙), take 了 (他高了), verb-not-verb questions (忙不忙?)
- 是 links noun to noun (他是老师). With adjectives, 是…的 nominalizes: 他是对的 "he is [a correct one]"
- Bare adjective in a statement implies contrast; 很 is default glue with weakened "very" meaning (他很忙 = he's busy)
- App insight: user needed the *why* behind a grammar rule, not just the correction. Tutor corrections
  should offer a one-line rule + a "want the reason?" expansion. Concept card candidate: "stative verbs / 很 as glue".

**我** (user typed a single character)
- 我 wǒ — I/me, 3rd tone. Etymology: 手 hand + 戈 spear → "hand holding a weapon" = me. Compare 找 zhǎo.
- 我们 wǒmen we · 我的 wǒ de my
- App insight: user may enter single characters/fragments — reading/writing mode should accept partial
  input and respond with a character card (meaning, tone, radical breakdown, common compounds) rather than
  demanding a full sentence.

**Novel recommendations for Chengdu/Chongqing trip (context, not language)**
- Trip: Chengdu (成都 Chéngdū) + Chongqing (重庆 Chóngqìng). Interests: fiction, fantasy, sci-fi, popular old + new.
- Recs: Three-Body Problem (刘慈欣), Folding Beijing, Invisible Planets; Journey to the West (西游记),
  Romance of the Three Kingdoms (三国演义 — Chengdu = Shu Han capital, Wuhou Shrine), Legends of the Condor
  Heroes (金庸); To Live (活着), Red Sorghum, Wild Swans (author from Chengdu), Fortress Besieged (围城).
- App insight: user is traveling to Sichuan soon — a "travel phrases" deck (ordering food, hotpot, taxis,
  directions, Sichuan-specific vocab) would be immediately useful. Also: cultural-context asides (Three
  Kingdoms, 西游记 figures) are good hooks for vocabulary/mnemonics. Note Sichuan Mandarin accent differs
  (no retroflex, tone shifts) — STT/TTS is standard Putonghua; maybe flag this in-app.
- User has already read Three-Body. Revised pick: Wild Swans + Waste Tide (陈楸帆); alts Ball Lightning,
  Supernova Era, Condor Heroes, Monkey.
- Final reading list: Wild Swans, Waste Tide; then Condor Heroes, To Live, Monkey.
