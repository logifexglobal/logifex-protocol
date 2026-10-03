/**
 * Contract
 * --------
 * A formal specification of the shape, behavior, and guarantees of an
 * interface, independent of any specific implementation.
 *
 * In Logifex Protocol v1, Contract is deliberately compile-time only.
 * Core does not bundle a runtime schema/validation library — that would
 * make a tooling choice part of the architectural foundation. Instead,
 * Core owns the *boundary and semantics* of a Contract; a validator
 * (Zod, Valibot, custom, or none) is an implementation detail that may
 * be attached at a governed trust boundary (external input, plugin-to-
 * plugin, AI output crossing into execution). Internal, statically-typed
 * code paths are not required to carry runtime validation.
 *
 * ContractMeta gives a Contract stable identity and version without
 * requiring a schema library. Contract version is authoritative for
 * schema/compatibility — Event and other primitives do not carry their
 * own independent version in v1.
 */

export interface ContractMeta {
  readonly name: string;
  readonly version: string;
}

/**
 * A typed marker for a Contract. `__shape` never exists at runtime —
 * it exists purely so TypeScript can infer and check the shape a
 * Contract describes. defineContract() does not validate anything.
 */
export type Contract<Shape> = ContractMeta & {
  readonly __shape?: Shape;
};

export function defineContract<Shape>(meta: ContractMeta): Contract<Shape> {
  return meta;
}
