import { z } from "zod";

const PhraseSchema = z.object({
  hanzi: z.string().min(1),
  pinyin: z.string().min(1),
  english: z.string().min(1),
});

const PairSchema = z
  .object({
    id: z.string().min(1),
    q: PhraseSchema.optional(),
    a: PhraseSchema.optional(),
    statement: PhraseSchema.optional(),
    tags: z.array(z.string()).default([]),
    notes: z.string().optional(),
  })
  .refine(
    (p) => (p.q && p.a) || p.statement,
    "Pair must have q+a OR statement"
  );

export const DeckSchema = z.object({
  deck: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    source: z.string().min(1),
  }),
  pairs: z.array(PairSchema).min(1),
});

export type Phrase = z.infer<typeof PhraseSchema>;
export type Pair = z.infer<typeof PairSchema>;
export type Deck = z.infer<typeof DeckSchema>;
