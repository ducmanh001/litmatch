import type { EntityManager } from 'typeorm';

export interface InteractionPair {
  userAId: string;
  userBId: string;
}

/** Public policy port for Matching, Messaging and Calling commit-time authorization. */
export interface InteractionSafetyPolicy {
  assertInteractionAllowed(userAId: string, userBId: string, manager?: EntityManager): Promise<void>;
  findBlockedPairs(pairs: readonly InteractionPair[], manager?: EntityManager): Promise<InteractionPair[]>;
}

export const INTERACTION_SAFETY_POLICY = Symbol('INTERACTION_SAFETY_POLICY');
