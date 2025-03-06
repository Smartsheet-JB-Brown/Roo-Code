/**
 * Creates a cache point message for use with AWS Bedrock prompt caching
 * This allows us to cache the system prompt and other common prompt blocks
 */
export function createCachePointMessage() {
	return {
		role: "user",
		content: [{ type: "cache_point" } as any],
	}
}
