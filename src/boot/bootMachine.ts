import { setup } from 'xstate';

/** Phase timings (ms). Total ceremony = 2200 — the hard budget from the spec. */
export const BOOT_TIMINGS = { disintegrate: 650, reassemble: 750, ignite: 450, reveal: 350 } as const;
export const BOOT_WORD = 'ASAP';

export const bootMachine = setup({
  types: {
    context: {} as { skip: boolean },
    input: {} as { skip: boolean },
    events: {} as { type: 'SKIP' },
  },
  guards: { shouldSkip: ({ context }) => context.skip },
}).createMachine({
  id: 'boot',
  context: ({ input }) => ({ skip: input.skip }),
  initial: 'deciding',
  states: {
    deciding: { always: [{ guard: 'shouldSkip', target: 'reveal' }, { target: 'disintegrate' }] },
    disintegrate: { after: { [BOOT_TIMINGS.disintegrate]: 'reassemble' }, on: { SKIP: 'reveal' } },
    reassemble:   { after: { [BOOT_TIMINGS.reassemble]: 'ignite' },       on: { SKIP: 'reveal' } },
    ignite:       { after: { [BOOT_TIMINGS.ignite]: 'reveal' },           on: { SKIP: 'reveal' } },
    reveal:       { after: { [BOOT_TIMINGS.reveal]: 'done' } },
    done: { type: 'final' },
  },
});
