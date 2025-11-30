/**
 * Vector stores barrel export
 *
 * Note: IVectorStore is a TypeScript-only interface and does not
 * exist at runtime in the compiled JavaScript. Export it as a `type`
 * to make this explicit and avoid confusion about missing runtime exports.
 */

export type { IVectorStore } from "./IVectorStore.js";
export { PineconeVectorStore } from "./PineconeVectorStore.js";
export { QdrantVectorStore } from "./QdrantVectorStore.js";
