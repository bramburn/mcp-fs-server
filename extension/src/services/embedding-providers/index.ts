/**
 * Embedding providers barrel export
 *
 * Note: IEmbeddingProvider is a TypeScript-only interface and does not
 * exist at runtime in the compiled JavaScript. Export it as a `type`
 * to make this explicit and avoid confusion about missing runtime exports.
 */

export type { IEmbeddingProvider } from "./IEmbeddingProvider.js";
export { OllamaEmbeddingProvider } from "./OllamaEmbeddingProvider.js";
export { OpenAIEmbeddingProvider } from "./OpenAIEmbeddingProvider.js";
export { GeminiEmbeddingProvider } from "./GeminiEmbeddingProvider.js";
