/**
 * Validation utilities for package manager sources
 */
import { PackageManagerSource } from "./types"

/**
 * Error type for package manager source validation
 */
export interface ValidationError {
	field: string
	message: string
}

/**
 * Validates a package manager source URL
 * @param url The URL to validate
 * @returns An array of validation errors, empty if valid
 */
/**
 * Checks if a URL is a valid Git repository URL
 * @param url The URL to validate
 * @returns True if the URL is a valid Git repository URL, false otherwise
 */
export function isValidGitRepositoryUrl(url: string): boolean {
	// Trim the URL to remove any leading/trailing whitespace
	const trimmedUrl = url.trim()

	// HTTPS pattern (GitHub, GitLab, Bitbucket, etc.)
	// Examples:
	// - https://github.com/username/repo
	// - https://github.com/username/repo.git
	// - https://gitlab.com/username/repo
	// - https://bitbucket.org/username/repo
	const httpsPattern =
		/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org|dev\.azure\.com)\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\/.+)*(\.git)?$/

	// SSH pattern
	// Examples:
	// - git@github.com:username/repo.git
	// - git@gitlab.com:username/repo.git
	const sshPattern = /^git@(github\.com|gitlab\.com|bitbucket\.org):([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(\.git)?$/

	// Git protocol pattern
	// Examples:
	// - git://github.com/username/repo.git
	const gitProtocolPattern =
		/^git:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\.git)?$/

	return httpsPattern.test(trimmedUrl) || sshPattern.test(trimmedUrl) || gitProtocolPattern.test(trimmedUrl)
}

export function validateSourceUrl(url: string): ValidationError[] {
	const errors: ValidationError[] = []

	// Check if URL is empty
	if (!url) {
		errors.push({
			field: "url",
			message: "URL cannot be empty",
		})
		return errors // Return early if URL is empty
	}

	// Check if URL is valid format
	try {
		new URL(url)
	} catch (e) {
		errors.push({
			field: "url",
			message: "Invalid URL format",
		})
		return errors // Return early if URL is not valid
	}

	// Check for non-visible characters (except spaces)
	const nonVisibleCharRegex = /[^\S ]/
	if (nonVisibleCharRegex.test(url)) {
		errors.push({
			field: "url",
			message: "URL contains non-visible characters other than spaces",
		})
	}

	// Check if URL is a valid Git repository URL
	if (!isValidGitRepositoryUrl(url)) {
		errors.push({
			field: "url",
			message: "URL must be a valid Git repository URL (e.g., https://github.com/username/repo)",
		})
	}

	return errors
}

/**
 * Validates a package manager source name
 * @param name The name to validate
 * @returns An array of validation errors, empty if valid
 */
export function validateSourceName(name?: string): ValidationError[] {
	const errors: ValidationError[] = []

	// Skip validation if name is not provided
	if (!name) {
		return errors
	}

	// Check name length
	if (name.length > 20) {
		errors.push({
			field: "name",
			message: "Name must be 20 characters or less",
		})
	}

	// Check for non-visible characters (except spaces)
	const nonVisibleCharRegex = /[^\S ]/
	if (nonVisibleCharRegex.test(name)) {
		errors.push({
			field: "name",
			message: "Name contains non-visible characters other than spaces",
		})
	}

	return errors
}

/**
 * Validates a list of package manager sources for duplicates
 * @param sources The list of sources to validate
 * @param newSource The new source to check against the list (optional)
 * @returns An array of validation errors, empty if valid
 */
export function validateSourceDuplicates(
	sources: PackageManagerSource[],
	newSource?: PackageManagerSource,
): ValidationError[] {
	const errors: ValidationError[] = []
	const normalizedUrls: { url: string; index: number }[] = []
	const normalizedNames: { name: string; index: number }[] = []

	// Process existing sources
	sources.forEach((source, index) => {
		// Normalize URL (case and whitespace insensitive)
		const normalizedUrl = source.url.toLowerCase().replace(/\s+/g, "")
		normalizedUrls.push({ url: normalizedUrl, index })

		// Normalize name if it exists (case and whitespace insensitive)
		if (source.name) {
			const normalizedName = source.name.toLowerCase().replace(/\s+/g, "")
			normalizedNames.push({ name: normalizedName, index })
		}
	})

	// Check for duplicates within the existing sources
	normalizedUrls.forEach((item, index) => {
		const duplicates = normalizedUrls.filter((other, otherIndex) => other.url === item.url && otherIndex !== index)

		if (duplicates.length > 0) {
			errors.push({
				field: "url",
				message: `Source #${item.index + 1} has a duplicate URL with Source #${duplicates[0].index + 1} (case and whitespace insensitive match)`,
			})
		}
	})

	normalizedNames.forEach((item, index) => {
		const duplicates = normalizedNames.filter(
			(other, otherIndex) => other.name === item.name && otherIndex !== index,
		)

		if (duplicates.length > 0) {
			errors.push({
				field: "name",
				message: `Source #${item.index + 1} has a duplicate name with Source #${duplicates[0].index + 1} (case and whitespace insensitive match)`,
			})
		}
	})

	// Check new source against existing sources if provided
	if (newSource) {
		// Validate URL
		if (newSource.url) {
			const normalizedNewUrl = newSource.url.toLowerCase().replace(/\s+/g, "")
			const duplicateUrl = normalizedUrls.find((item) => item.url === normalizedNewUrl)

			if (duplicateUrl) {
				errors.push({
					field: "url",
					message: `URL is a duplicate of Source #${duplicateUrl.index + 1} (case and whitespace insensitive match)`,
				})
			}
		}

		// Validate name
		if (newSource.name) {
			const normalizedNewName = newSource.name.toLowerCase().replace(/\s+/g, "")
			const duplicateName = normalizedNames.find((item) => item.name === normalizedNewName)

			if (duplicateName) {
				errors.push({
					field: "name",
					message: `Name is a duplicate of Source #${duplicateName.index + 1} (case and whitespace insensitive match)`,
				})
			}
		}
	}

	return errors
}

/**
 * Validates a package manager source
 * @param source The source to validate
 * @param existingSources Existing sources to check for duplicates
 * @returns An array of validation errors, empty if valid
 */
export function validateSource(
	source: PackageManagerSource,
	existingSources: PackageManagerSource[] = [],
): ValidationError[] {
	// Combine all validation errors
	return [
		...validateSourceUrl(source.url),
		...validateSourceName(source.name),
		...validateSourceDuplicates(existingSources, source),
	]
}

/**
 * Validates a list of package manager sources
 * @param sources The sources to validate
 * @returns An array of validation errors, empty if valid
 */
export function validateSources(sources: PackageManagerSource[]): ValidationError[] {
	const errors: ValidationError[] = []

	// Validate each source individually
	sources.forEach((source, index) => {
		const sourceErrors = [...validateSourceUrl(source.url), ...validateSourceName(source.name)]

		// Add index to error messages
		sourceErrors.forEach((error) => {
			errors.push({
				field: error.field,
				message: `Source #${index + 1}: ${error.message}`,
			})
		})
	})

	// Check for duplicates across all sources
	const duplicateErrors = validateSourceDuplicates(sources)
	errors.push(...duplicateErrors)

	return errors
}
