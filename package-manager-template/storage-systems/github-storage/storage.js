/**
 * GitHub Storage System
 *
 * This storage system uses GitHub repositories to store and retrieve data.
 */

class GitHubStorage {
	/**
	 * Constructor for the GitHub Storage System
	 * @param {Object} config - Configuration object
	 * @param {string} config.owner - GitHub repository owner
	 * @param {string} config.repo - GitHub repository name
	 * @param {string} config.token - GitHub personal access token
	 * @param {string} config.branch - GitHub branch to use (default: main)
	 */
	constructor(config) {
		this.owner = config.owner
		this.repo = config.repo
		this.token = config.token
		this.branch = config.branch || "main"
		this.baseUrl = `https://api.github.com/repos/${this.owner}/${this.repo}`
		this.headers = {
			Authorization: `token ${this.token}`,
			Accept: "application/vnd.github.v3+json",
			"Content-Type": "application/json",
		}
	}

	/**
	 * Store data in the GitHub repository
	 * @param {string} path - Path to store the data at
	 * @param {any} data - Data to store
	 * @param {string} message - Commit message
	 * @returns {Promise<Object>} - Result of the operation
	 */
	async store(path, data, message = "Update data") {
		try {
			// Convert data to string if it's not already
			const content = typeof data === "string" ? data : JSON.stringify(data, null, 2)

			// Encode content to base64
			const encodedContent = Buffer.from(content).toString("base64")

			// Check if file exists
			let sha
			try {
				const response = await fetch(`${this.baseUrl}/contents/${path}?ref=${this.branch}`, {
					headers: this.headers,
				})

				if (response.ok) {
					const fileData = await response.json()
					sha = fileData.sha
				}
			} catch (error) {
				// File doesn't exist, which is fine
			}

			// Create or update file
			const body = {
				message,
				content: encodedContent,
				branch: this.branch,
			}

			if (sha) {
				body.sha = sha
			}

			const response = await fetch(`${this.baseUrl}/contents/${path}`, {
				method: "PUT",
				headers: this.headers,
				body: JSON.stringify(body),
			})

			if (!response.ok) {
				throw new Error(`Failed to store data: ${response.statusText}`)
			}

			return await response.json()
		} catch (error) {
			throw new Error(`Error storing data: ${error.message}`)
		}
	}

	/**
	 * Retrieve data from the GitHub repository
	 * @param {string} path - Path to retrieve the data from
	 * @returns {Promise<any>} - Retrieved data
	 */
	async retrieve(path) {
		try {
			const response = await fetch(`${this.baseUrl}/contents/${path}?ref=${this.branch}`, {
				headers: this.headers,
			})

			if (!response.ok) {
				throw new Error(`Failed to retrieve data: ${response.statusText}`)
			}

			const data = await response.json()
			const content = Buffer.from(data.content, "base64").toString("utf-8")

			// Try to parse as JSON, return as string if not valid JSON
			try {
				return JSON.parse(content)
			} catch (error) {
				return content
			}
		} catch (error) {
			throw new Error(`Error retrieving data: ${error.message}`)
		}
	}

	/**
	 * Delete data from the GitHub repository
	 * @param {string} path - Path to delete
	 * @param {string} message - Commit message
	 * @returns {Promise<Object>} - Result of the operation
	 */
	async delete(path, message = "Delete data") {
		try {
			// Get the file's SHA
			const response = await fetch(`${this.baseUrl}/contents/${path}?ref=${this.branch}`, {
				headers: this.headers,
			})

			if (!response.ok) {
				throw new Error(`Failed to get file info: ${response.statusText}`)
			}

			const data = await response.json()

			// Delete the file
			const deleteResponse = await fetch(`${this.baseUrl}/contents/${path}`, {
				method: "DELETE",
				headers: this.headers,
				body: JSON.stringify({
					message,
					sha: data.sha,
					branch: this.branch,
				}),
			})

			if (!deleteResponse.ok) {
				throw new Error(`Failed to delete data: ${deleteResponse.statusText}`)
			}

			return await deleteResponse.json()
		} catch (error) {
			throw new Error(`Error deleting data: ${error.message}`)
		}
	}

	/**
	 * List files in a directory
	 * @param {string} path - Directory path
	 * @returns {Promise<Array>} - List of files
	 */
	async list(path = "") {
		try {
			const response = await fetch(`${this.baseUrl}/contents/${path}?ref=${this.branch}`, {
				headers: this.headers,
			})

			if (!response.ok) {
				throw new Error(`Failed to list files: ${response.statusText}`)
			}

			const data = await response.json()
			return Array.isArray(data) ? data : [data]
		} catch (error) {
			throw new Error(`Error listing files: ${error.message}`)
		}
	}
}

module.exports = GitHubStorage
