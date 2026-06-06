// ABOUTME: Hardened fetch of an arbitrary (untrusted) source URL → branded UntrustedSourceText. (Fetch logic: Phase 4.)
// ABOUTME: The brand encodes G15 at the type level — page text may flow ONLY to the verbatim check, never to a model.
declare const __brand: unique symbol;
export type UntrustedSourceText = string & { readonly [__brand]: "UntrustedSourceText" };
