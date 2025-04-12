import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { useExtensionState } from "../../context/ExtensionStateContext"
import { Tab, TabContent, TabHeader } from "../common/Tab"
import { vscode } from "@/utils/vscode"
import { PackageManagerItem, PackageManagerSource } from "../../../../src/services/package-manager/types"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk"

interface PackageManagerViewProps {
	onDone?: () => void
}

interface PackageManagerItemCardProps {
	item: PackageManagerItem
	filters: { type: string; search: string; tags: string[] }
	setFilters: React.Dispatch<React.SetStateAction<{ type: string; search: string; tags: string[] }>>
	activeTab: "browse" | "sources"
	setActiveTab: React.Dispatch<React.SetStateAction<"browse" | "sources">>
}

const PackageManagerItemCard: React.FC<PackageManagerItemCardProps> = ({
	item,
	filters,
	setFilters,
	activeTab,
	setActiveTab,
}) => {
	const isValidUrl = (urlString: string): boolean => {
		try {
			new URL(urlString)
			return true
		} catch (e) {
			return false
		}
	}

	const getTypeLabel = (type: string) => {
		switch (type) {
			case "mode":
				return "Mode"
			case "mcp server":
				return "MCP Server"
			case "prompt":
				return "Prompt"
			case "package":
				return "Package"
			default:
				return "Other"
		}
	}

	const getTypeColor = (type: string) => {
		switch (type) {
			case "mode":
				return "bg-blue-600"
			case "mcp server":
				return "bg-green-600"
			case "prompt":
				return "bg-purple-600"
			case "package":
				return "bg-orange-600"
			default:
				return "bg-gray-600"
		}
	}

	const handleOpenUrl = () => {
		const urlToOpen = item.sourceUrl && isValidUrl(item.sourceUrl) ? item.sourceUrl : item.repoUrl
		vscode.postMessage({
			type: "openExternal",
			url: urlToOpen,
		})
	}

	return (
		<div className="border border-vscode-panel-border rounded-md p-4 bg-vscode-panel-background">
			<div className="flex justify-between items-start">
				<div>
					<h3 className="text-lg font-semibold text-vscode-foreground">{item.name}</h3>
					{item.author && <p className="text-sm text-vscode-descriptionForeground">{`by ${item.author}`}</p>}
				</div>
				<span className={`px-2 py-1 text-xs text-white rounded-full ${getTypeColor(item.type)}`}>
					{getTypeLabel(item.type)}
				</span>
			</div>

			<p className="my-2 text-vscode-foreground">{item.description}</p>

			{item.tags && item.tags.length > 0 && (
				<div className="flex flex-wrap gap-1 my-2">
					{item.tags.map((tag) => (
						<button
							key={tag}
							className={`px-2 py-1 text-xs rounded-full hover:bg-vscode-button-secondaryBackground ${
								filters.tags.includes(tag)
									? "bg-vscode-button-background text-vscode-button-foreground"
									: "bg-vscode-badge-background text-vscode-badge-foreground"
							}`}
							onClick={() => {
								if (filters.tags.includes(tag)) {
									setFilters({
										...filters,
										tags: filters.tags.filter((t) => t !== tag),
									})
								} else {
									setFilters({
										...filters,
										tags: [...filters.tags, tag],
									})
									if (activeTab !== "browse") {
										setActiveTab("browse")
									}
								}
							}}
							title={filters.tags.includes(tag) ? `Remove tag filter: ${tag}` : `Filter by tag: ${tag}`}>
							{tag}
						</button>
					))}
				</div>
			)}

			<div className="flex justify-between items-center mt-4">
				<div className="flex items-center gap-4 text-sm text-vscode-descriptionForeground">
					{item.version && (
						<span className="flex items-center">
							<span className="codicon codicon-tag mr-1"></span>
							{item.version}
						</span>
					)}
					{item.lastUpdated && (
						<span className="flex items-center">
							<span className="codicon codicon-calendar mr-1"></span>
							{new Date(item.lastUpdated).toLocaleDateString(undefined, {
								year: "numeric",
								month: "short",
								day: "numeric",
							})}
						</span>
					)}
				</div>

				<Button onClick={handleOpenUrl}>
					<span className="codicon codicon-link-external mr-2"></span>
					{item.sourceUrl ? "View" : item.sourceName || "Source"}
				</Button>
			</div>
		</div>
	)
}

const PackageManagerView: React.FC<PackageManagerViewProps> = ({ onDone }) => {
	const { packageManagerSources, setPackageManagerSources } = useExtensionState()
	const [items, setItems] = useState<PackageManagerItem[]>([])
	const [activeTab, setActiveTab] = useState<"browse" | "sources">("browse")
	const [refreshingUrls, setRefreshingUrls] = useState<string[]>([])
	const [filters, setFilters] = useState({ type: "", search: "", tags: [] as string[] })
	const [tagSearch, setTagSearch] = useState("")
	const [isTagInputActive, setIsTagInputActive] = useState(false)
	const [sortBy, setSortBy] = useState("name")
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
	const [isFetching, setIsFetching] = useState(false)
	const isManualRefresh = useRef(false)
	const hasInitialFetch = useRef(false)
	const lastSourcesKey = useRef<string | null>(null)

	const fetchPackageManagerItems = useCallback(() => {
		if (!isFetching) {
			setIsFetching(true)
			try {
				vscode.postMessage({
					type: "fetchPackageManagerItems",
					forceRefresh: true,
				} as any)
			} catch (error) {
				console.error("Failed to fetch package manager items:", error)
				setIsFetching(false)
			}
		}
	}, [isFetching])

	useEffect(() => {
		fetchPackageManagerItems()
	}, [fetchPackageManagerItems])

	// Set hasInitialFetch after the first fetch completes
	useEffect(() => {
		if (!isFetching) {
			hasInitialFetch.current = true
		}
	}, [isFetching])

	useEffect(() => {
		if (packageManagerSources && !isFetching && packageManagerSources.length > 0) {
			const sourcesKey = JSON.stringify(packageManagerSources.map((s) => s.url))
			if (sourcesKey !== lastSourcesKey.current && !isManualRefresh.current) {
				lastSourcesKey.current = sourcesKey
				// Don't fetch if this is the initial sources load
				if (hasInitialFetch.current) {
					fetchPackageManagerItems()
				}
			}
		}
	}, [packageManagerSources, fetchPackageManagerItems, isFetching])

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data

			if (message.type === "action" && message.action === "packageManagerButtonClicked") {
				setTimeout(() => {
					vscode.postMessage({
						type: "fetchPackageManagerItems",
						forceRefresh: true,
					} as any)
				}, 100)
			}

			if (message.type === "repositoryRefreshComplete" && message.url) {
				setRefreshingUrls((prev) => prev.filter((url) => url !== message.url))
			}

			if (message.type === "state" && message.state?.packageManagerItems) {
				const receivedItems = message.state.packageManagerItems || []
				setItems([...receivedItems])
				setTimeout(() => {
					setIsFetching(false)
					isManualRefresh.current = false
				}, 0)
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const filteredItems = items.filter((item) => {
		if (filters.type && item.type !== filters.type) {
			return false
		}

		if (filters.search) {
			const searchTerm = filters.search.toLowerCase()
			const nameMatch = item.name.toLowerCase().includes(searchTerm)
			const descMatch = item.description.toLowerCase().includes(searchTerm)
			const authorMatch = item.author?.toLowerCase().includes(searchTerm)

			if (!nameMatch && !descMatch && !authorMatch) {
				return false
			}
		}

		if (filters.tags.length > 0) {
			if (!item.tags || !item.tags.some((tag) => filters.tags.includes(tag))) {
				return false
			}
		}

		return true
	})

	const sortedItems = [...filteredItems].sort((a, b) => {
		let comparison = 0

		switch (sortBy) {
			case "name":
				comparison = a.name.localeCompare(b.name)
				break
			case "author":
				comparison = (a.author || "").localeCompare(b.author || "")
				break
			case "lastUpdated":
				comparison = (a.lastUpdated || "").localeCompare(b.lastUpdated || "")
				break
			default:
				comparison = a.name.localeCompare(b.name)
		}

		return sortOrder === "asc" ? comparison : -comparison
	})

	const allTags = useMemo(() => {
		const tagSet = new Set<string>()
		items.forEach((item) => {
			if (item.tags) {
				item.tags.forEach((tag) => tagSet.add(tag))
			}
		})
		return Array.from(tagSet).sort()
	}, [items])

	return (
		<Tab>
			<TabHeader className="flex justify-between items-center">
				<div className="flex items-center">
					<h3 className="text-vscode-foreground m-0">Package Manager</h3>
				</div>
				<div className="flex gap-2">
					<Button
						variant={activeTab === "browse" ? "default" : "secondary"}
						onClick={() => setActiveTab("browse")}>
						Browse
					</Button>
					<Button
						variant={activeTab === "sources" ? "default" : "secondary"}
						onClick={() => setActiveTab("sources")}>
						Sources
					</Button>
				</div>
			</TabHeader>

			<TabContent>
				{activeTab === "browse" ? (
					<>
						<div className="mb-4">
							<input
								type="text"
								placeholder="Search package manager items..."
								value={filters.search}
								onChange={(e) => setFilters({ ...filters, search: e.target.value })}
								className="w-full p-2 bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded"
							/>
							<div className="flex flex-col gap-3 mt-2">
								<div className="flex flex-wrap justify-between gap-2">
									<div className="whitespace-nowrap">
										<label className="mr-2">Filter by type:</label>
										<select
											value={filters.type}
											onChange={(e) => setFilters({ ...filters, type: e.target.value })}
											className="p-1 bg-vscode-dropdown-background text-vscode-dropdown-foreground border border-vscode-dropdown-border rounded">
											<option value="">All types</option>
											<option value="mode">Mode</option>
											<option value="mcp server">MCP Server</option>
											<option value="prompt">Prompt</option>
											<option value="package">Package</option>
										</select>
									</div>

									<div className="whitespace-nowrap">
										<label className="mr-2">Sort by:</label>
										<select
											value={sortBy}
											onChange={(e) => setSortBy(e.target.value)}
											className="p-1 bg-vscode-dropdown-background text-vscode-dropdown-foreground border border-vscode-dropdown-border rounded mr-2">
											<option value="name">Name</option>
											<option value="author">Author</option>
											<option value="lastUpdated">Last Updated</option>
										</select>
										<button
											onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
											className="p-1 bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground rounded">
											{sortOrder === "asc" ? "↑" : "↓"}
										</button>
									</div>
								</div>

								{allTags.length > 0 && (
									<div>
										<div className="flex items-center justify-between mb-1">
											<div className="flex items-center">
												<label className="mr-2">Filter by tags:</label>
												<span className="text-xs text-vscode-descriptionForeground">
													({allTags.length} available)
												</span>
											</div>
											{filters.tags.length > 0 && (
												<button
													onClick={() => setFilters({ ...filters, tags: [] })}
													className="p-1 bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground rounded text-xs">
													Clear tags ({filters.tags.length})
												</button>
											)}
										</div>
										<Command className="rounded-lg border border-vscode-dropdown-border">
											<CommandInput
												placeholder="Type to search and select tags..."
												value={tagSearch}
												onValueChange={setTagSearch}
												onFocus={() => setIsTagInputActive(true)}
												onBlur={(e) => {
													if (!e.relatedTarget?.closest("[cmdk-list]")) {
														setIsTagInputActive(false)
													}
												}}
												className="w-full p-1 bg-vscode-input-background text-vscode-input-foreground border-b border-vscode-dropdown-border"
											/>
											{(isTagInputActive || tagSearch) && (
												<CommandList className="max-h-[200px] overflow-y-auto bg-vscode-dropdown-background">
													<CommandEmpty className="p-2 text-sm text-vscode-descriptionForeground">
														No matching tags found
													</CommandEmpty>
													<CommandGroup>
														{allTags
															.filter((tag) =>
																tag.toLowerCase().includes(tagSearch.toLowerCase()),
															)
															.map((tag) => (
																<CommandItem
																	key={tag}
																	onSelect={() => {
																		const isSelected = filters.tags.includes(tag)
																		if (isSelected) {
																			setFilters({
																				...filters,
																				tags: filters.tags.filter(
																					(t) => t !== tag,
																				),
																			})
																		} else {
																			setFilters({
																				...filters,
																				tags: [...filters.tags, tag],
																			})
																		}
																	}}
																	className={`flex items-center gap-2 p-1 cursor-pointer text-sm hover:bg-vscode-button-secondaryBackground ${
																		filters.tags.includes(tag)
																			? "bg-vscode-button-background text-vscode-button-foreground"
																			: "text-vscode-dropdown-foreground"
																	}`}
																	onMouseDown={(e) => {
																		e.preventDefault()
																	}}>
																	<span
																		className={`codicon ${filters.tags.includes(tag) ? "codicon-check" : ""}`}
																	/>
																	{tag}
																</CommandItem>
															))}
													</CommandGroup>
												</CommandList>
											)}
										</Command>
										<div className="text-xs text-vscode-descriptionForeground mt-1">
											{filters.tags.length > 0
												? `Showing items with any of the selected tags (${filters.tags.length} selected)`
												: "Click tags to filter items"}
										</div>
									</div>
								)}
							</div>
						</div>

						{sortedItems.length === 0 ? (
							<div className="flex flex-col items-center justify-center h-64 text-vscode-descriptionForeground">
								<p>No package manager items found</p>
								<Button
									onClick={() => {
										isManualRefresh.current = true
										setIsFetching(false)
										fetchPackageManagerItems()
									}}
									className="mt-4"
									disabled={isFetching}>
									<span
										className={`codicon ${isFetching ? "codicon-sync codicon-modifier-spin" : "codicon-refresh"} mr-2`}></span>
									{isFetching ? "Refreshing..." : "Refresh"}
								</Button>
							</div>
						) : (
							<div>
								<div className="flex justify-between mb-4">
									<p className="text-vscode-descriptionForeground">
										{`${sortedItems.length} items found`}
									</p>
									<Button
										onClick={() => {
											isManualRefresh.current = true
											setIsFetching(false)
											fetchPackageManagerItems()
										}}
										size="sm"
										disabled={isFetching}>
										<span
											className={`codicon ${isFetching ? "codicon-sync codicon-modifier-spin" : "codicon-refresh"} mr-2`}></span>
										{isFetching ? "Refreshing..." : "Refresh"}
									</Button>
								</div>
								<div className="grid grid-cols-1 gap-4">
									{sortedItems.map((item) => (
										<PackageManagerItemCard
											key={`${item.repoUrl}-${item.name}`}
											item={item}
											filters={filters}
											setFilters={setFilters}
											activeTab={activeTab}
											setActiveTab={setActiveTab}
										/>
									))}
								</div>
							</div>
						)}
					</>
				) : (
					<PackageManagerSourcesConfig
						sources={packageManagerSources || []}
						refreshingUrls={refreshingUrls}
						setRefreshingUrls={setRefreshingUrls}
						onSourcesChange={(sources) => {
							setPackageManagerSources(sources)
							vscode.postMessage({ type: "packageManagerSources", sources })
						}}
					/>
				)}
			</TabContent>
		</Tab>
	)
}

interface PackageManagerSourcesConfigProps {
	sources: PackageManagerSource[]
	refreshingUrls: string[]
	setRefreshingUrls: React.Dispatch<React.SetStateAction<string[]>>
	onSourcesChange: (sources: PackageManagerSource[]) => void
}

const PackageManagerSourcesConfig: React.FC<PackageManagerSourcesConfigProps> = ({
	sources,
	refreshingUrls,
	setRefreshingUrls,
	onSourcesChange,
}) => {
	const [newSourceUrl, setNewSourceUrl] = useState("")
	const [newSourceName, setNewSourceName] = useState("")
	const [error, setError] = useState("")

	const handleAddSource = () => {
		if (!newSourceUrl) {
			setError("URL cannot be empty")
			return
		}

		try {
			new URL(newSourceUrl)
		} catch (e) {
			setError("Invalid URL format")
			return
		}

		const nonVisibleCharRegex = /[^\S ]/
		if (nonVisibleCharRegex.test(newSourceUrl)) {
			setError("URL contains non-visible characters other than spaces")
			return
		}

		if (!isValidGitRepositoryUrl(newSourceUrl)) {
			setError("URL must be a valid Git repository URL (e.g., https://github.com/username/repo)")
			return
		}

		const normalizedNewUrl = newSourceUrl.toLowerCase().replace(/\s+/g, "")
		if (sources.some((source) => source.url.toLowerCase().replace(/\s+/g, "") === normalizedNewUrl)) {
			setError("This URL is already in the list (case and whitespace insensitive match)")
			return
		}

		if (newSourceName) {
			if (newSourceName.length > 20) {
				setError("Name must be 20 characters or less")
				return
			}

			if (nonVisibleCharRegex.test(newSourceName)) {
				setError("Name contains non-visible characters other than spaces")
				return
			}

			const normalizedNewName = newSourceName.toLowerCase().replace(/\s+/g, "")
			if (
				sources.some(
					(source) => source.name && source.name.toLowerCase().replace(/\s+/g, "") === normalizedNewName,
				)
			) {
				setError("This name is already in use (case and whitespace insensitive match)")
				return
			}
		}

		const MAX_SOURCES = 10
		if (sources.length >= MAX_SOURCES) {
			setError(`Maximum of ${MAX_SOURCES} sources allowed`)
			return
		}

		const newSource: PackageManagerSource = {
			url: newSourceUrl,
			name: newSourceName || undefined,
			enabled: true,
		}

		onSourcesChange([...sources, newSource])

		setNewSourceUrl("")
		setNewSourceName("")
		setError("")
	}

	const handleToggleSource = (index: number) => {
		const updatedSources = [...sources]
		updatedSources[index].enabled = !updatedSources[index].enabled
		onSourcesChange(updatedSources)
	}

	const handleRemoveSource = (index: number) => {
		const updatedSources = sources.filter((_, i) => i !== index)
		onSourcesChange(updatedSources)
	}

	const handleRefreshSource = (url: string) => {
		setRefreshingUrls((prev) => [...prev, url])
		vscode.postMessage({
			type: "refreshPackageManagerSource",
			url,
		})
	}

	return (
		<div>
			<h4 className="text-vscode-foreground mb-2">Configure Package Manager Sources</h4>
			<p className="text-vscode-descriptionForeground mb-4">
				Add Git repositories that contain package manager items. These repositories will be fetched when
				browsing the package manager.
			</p>

			<div className="mb-6">
				<h5 className="text-vscode-foreground mb-2">Add New Source</h5>
				<div className="flex flex-col gap-2 mb-2">
					<input
						type="text"
						placeholder="Git repository URL (e.g., https://github.com/username/repo)"
						value={newSourceUrl}
						onChange={(e) => {
							setNewSourceUrl(e.target.value)
							setError("")
						}}
						className="p-2 bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded"
					/>
					<p className="text-xs text-vscode-descriptionForeground mt-1 mb-2">
						Supported formats: HTTPS (https://github.com/username/repo), SSH
						(git@github.com:username/repo.git), or Git protocol (git://github.com/username/repo.git)
					</p>
					<input
						type="text"
						placeholder="Display name (optional, max 20 chars)"
						value={newSourceName}
						onChange={(e) => {
							setNewSourceName(e.target.value.slice(0, 20))
							setError("")
						}}
						maxLength={20}
						className="p-2 bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded"
					/>
				</div>
				{error && <p className="text-red-500 mb-2">{error}</p>}
				<Button onClick={handleAddSource}>
					<span className="codicon codicon-add mr-2"></span>
					Add Source
				</Button>
			</div>
			<h5 className="text-vscode-foreground mb-2">
				Current Sources{" "}
				<span className="text-vscode-descriptionForeground text-sm">({sources.length}/10 max)</span>
			</h5>
			{sources.length === 0 ? (
				<p className="text-vscode-descriptionForeground">No sources configured. Add a source to get started.</p>
			) : (
				<div className="grid grid-cols-1 gap-2">
					{sources.map((source, index) => (
						<div
							key={source.url}
							className="flex items-center justify-between p-3 border border-vscode-panel-border rounded-md bg-vscode-panel-background">
							<div className="flex-1">
								<div className="flex items-center">
									<input
										type="checkbox"
										checked={source.enabled}
										onChange={() => handleToggleSource(index)}
										className="mr-2"
									/>
									<div>
										<p className="text-vscode-foreground font-medium">
											{source.name || source.url}
										</p>
										{source.name && (
											<p className="text-xs text-vscode-descriptionForeground">{source.url}</p>
										)}
									</div>
								</div>
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="ghost"
									size="icon"
									onClick={() => handleRefreshSource(source.url)}
									title="Refresh this source"
									className="text-vscode-foreground"
									disabled={refreshingUrls.includes(source.url)}>
									<span
										className={`codicon ${refreshingUrls.includes(source.url) ? "codicon-sync codicon-modifier-spin" : "codicon-refresh"}`}></span>
								</Button>
								<Button
									variant="ghost"
									size="icon"
									onClick={() => handleRemoveSource(index)}
									className="text-red-500">
									<span className="codicon codicon-trash"></span>
								</Button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	)
}

const isValidGitRepositoryUrl = (url: string): boolean => {
	const trimmedUrl = url.trim()

	const httpsPattern =
		/^https?:\/\/(github\.com|gitlab\.com|bitbucket\.org|dev\.azure\.com)\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\/.+)*(\.git)?$/
	const sshPattern = /^git@(github\.com|gitlab\.com|bitbucket\.org):([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(\.git)?$/
	const gitProtocolPattern =
		/^git:\/\/(github\.com|gitlab\.com|bitbucket\.org)\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(\.git)?$/

	return httpsPattern.test(trimmedUrl) || sshPattern.test(trimmedUrl) || gitProtocolPattern.test(trimmedUrl)
}

export default PackageManagerView
