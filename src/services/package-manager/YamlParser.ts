import { XMLParser } from "fast-xml-parser"
import { validateAnyMetadata } from "./schemas"

/**
 * Utility class for parsing and validating YAML content
 */
export class YamlParser {
	private static parser = new XMLParser({
		ignoreAttributes: false,
		parseAttributeValue: true,
		parseTagValue: true,
		trimValues: true,
		preserveOrder: true,
	})

	/**
	 * Parse YAML content into an object and validate against schema
	 * @param content YAML content to parse
	 * @param validate Whether to validate against schema (default: true)
	 * @returns Parsed and validated object
	 * @throws Error if parsing or validation fails
	 */
	static parse<T>(content: string, validate: boolean = true): T {
		if (!content.trim()) {
			return {} as T
		}

		try {
			// Remove comments
			const noComments = content.replace(/#[^\n]*/g, "")

			// Handle multi-line strings
			const processedContent = this.processMultilineStrings(noComments)

			// Convert YAML to JSON-like structure
			const jsonContent = processedContent
				// Handle arrays with proper indentation
				.replace(/^(\s*)-\s+(?=\S)/gm, (match, indent) => `${indent}array_item: `)
				// Handle quoted strings
				.replace(/^(\s*)([^:\n]+):\s*(['"])(.*?)\3\s*$/gm, (_, indent, key, quote, value) => {
					const safeKey = this.sanitizeKey(key)
					return `${indent}${safeKey}: ${value}`
				})
				// Handle unquoted key-value pairs
				.replace(/^(\s*)([^:\n]+):\s*([^\n]*)$/gm, (_, indent, key, value) => {
					const safeKey = this.sanitizeKey(key)
					return `${indent}${safeKey}: ${value.trim()}`
				})

			// Parse as XML-like structure
			const parsed = this.parser.parse(`<root>${jsonContent}</root>`)

			// Convert array_item markers back to arrays and process nested structures
			const result = this.processStructure(parsed.root || {})

			// Validate against schema if requested
			if (validate) {
				return validateAnyMetadata(result) as T
			} else {
				return result as T
			}
		} catch (error) {
			console.error("Failed to parse YAML:", error)
			throw new Error(`Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/**
	 * Process multi-line strings in YAML content
	 * @param content YAML content
	 * @returns Processed content
	 */
	private static processMultilineStrings(content: string): string {
		return content.replace(/^(\s*[^:\n]+):\s*\|\s*\n((?:\s+[^\n]*\n?)*)/gm, (_, key, value) => {
			const indentLevel = value.match(/^\s+/)?.[0].length || 0
			const processedValue = value
				.split("\n")
				.map((line: string) => line.slice(indentLevel))
				.join("\n")
				.trim()
			return `${key}: "${processedValue.replace(/"/g, '\\"')}"`
		})
	}

	/**
	 * Sanitize YAML key for XML compatibility
	 * @param key Key to sanitize
	 * @returns Sanitized key
	 */
	private static sanitizeKey(key: string): string {
		return key
			.trim()
			.replace(/[^\w-]/g, "_")
			.replace(/^(\d)/, "_$1") // Prefix numbers with underscore
	}

	/**
	 * Process nested structures and arrays
	 * @param obj Object to process
	 * @returns Processed object
	 */
	private static processStructure(obj: any): any {
		if (typeof obj !== "object" || obj === null) {
			return obj
		}

		if (Array.isArray(obj)) {
			return obj.map((item) => this.processStructure(item))
		}

		const result: any = {}
		const arrays: { [key: string]: any[] } = {}

		// First pass: collect array items
		for (const [key, value] of Object.entries(obj)) {
			if (key === "array_item") {
				return this.processStructure(value)
			}

			const match = key.match(/^(.+?)_(\d+)$/)
			if (match) {
				const [, baseKey, index] = match
				if (!arrays[baseKey]) {
					arrays[baseKey] = []
				}
				arrays[baseKey][parseInt(index)] = this.processStructure(value)
				continue
			}

			result[key] = this.processStructure(value)
		}

		// Second pass: merge arrays into result
		for (const [key, value] of Object.entries(arrays)) {
			result[key] = value.filter((item) => item !== undefined)
		}

		return result
	}
}
