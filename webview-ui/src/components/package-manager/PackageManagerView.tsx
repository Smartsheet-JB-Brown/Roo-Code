import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Tab, TabContent, TabHeader } from "../common/Tab"
import { cn } from "@/lib/utils"
import { PackageManagerSource } from "../../../../src/services/package-manager/types"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk"
import { isFilterActive as checkFilterActive } from "./selectors"
import { PackageManagerItemCard } from "./components/PackageManagerItemCard"
import { useStateManager } from "./useStateManager"

interface PackageManagerViewProps {
	onDone?: () => void
}

const PackageManagerView: React.FC<PackageManagerViewProps> = ({ onDone }) => {
	const [state, manager] = useStateManager()

	const [tagSearch, setTagSearch] = useState("")
	const [isTagInputActive, setIsTagInputActive] = useState(false)

	// Debug logging for state changes
	useEffect(() => {
		console.log("State updated:", {
			allItems: state.allItems,
			displayItems: state.displayItems,
			itemsLength: state.allItems.length,
			displayItemsLength: state.displayItems?.length,
			showingEmptyState: (state.displayItems || state.allItems).length === 0,
			filters: state.filters,
		})
	}, [state.allItems, state.displayItems, state.filters])

	// Fetch items on mount
	useEffect(() => {
		manager.transition({ type: "FETCH_ITEMS" })
	}, [manager])

	// Compute all available tags
	const allTags = Array.from(new Set(state.allItems.flatMap((item) => item.tags || []))).sort()

	return (
		<Tab>
			<TabHeader className="flex justify-between items-center sticky top-0 z-10 bg-vscode-editor-background border-b border-vscode-panel-border">
				<div className="flex items-center">
					<h3 className="text-vscode-foreground m-0">Package Manager</h3>
				</div>
				<div className="flex gap-2">
					<Button
						variant={state.activeTab === "browse" ? "default" : "secondary"}
						className={cn(
							state.activeTab === "browse" &&
								"bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground",
						)}
						onClick={() => manager.transition({ type: "SET_ACTIVE_TAB", payload: { tab: "browse" } })}>
						Browse
					</Button>
					<Button
						variant={state.activeTab === "sources" ? "default" : "secondary"}
						className={cn(
							state.activeTab === "sources" &&
								"bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground",
						)}
						onClick={() => manager.transition({ type: "SET_ACTIVE_TAB", payload: { tab: "sources" } })}>
						Sources
					</Button>
				</div>
			</TabHeader>

			<TabContent>
				{state.activeTab === "browse" ? (
					<>
						<div className="mb-4">
							<input
								type="text"
								placeholder="Search package manager items..."
								value={state.filters.search}
								onChange={(e) =>
									manager.transition({
										type: "UPDATE_FILTERS",
										payload: { filters: { search: e.target.value } },
									})
								}
								className="w-full p-2 bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded"
							/>
							<div className="flex flex-col gap-3 mt-2">
								<div className="flex flex-wrap justify-between gap-2">
									<div className="whitespace-nowrap">
										<label className="mr-2">Filter by type:</label>
										<select
											value={state.filters.type}
											onChange={(e) =>
												manager.transition({
													type: "UPDATE_FILTERS",
													payload: { filters: { type: e.target.value } },
												})
											}
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
											value={state.sortConfig.by}
											onChange={(e) =>
												manager.transition({
													type: "UPDATE_SORT",
													payload: { sortConfig: { by: e.target.value as any } },
												})
											}
											className="p-1 bg-vscode-dropdown-background text-vscode-dropdown-foreground border border-vscode-dropdown-border rounded mr-2">
											<option value="name">Name</option>
											<option value="lastUpdated">Last Updated</option>
										</select>
										<button
											onClick={() =>
												manager.transition({
													type: "UPDATE_SORT",
													payload: {
														sortConfig: {
															order: state.sortConfig.order === "asc" ? "desc" : "asc",
														},
													},
												})
											}
											className="p-1 bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground rounded">
											{state.sortConfig.order === "asc" ? "↑" : "↓"}
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
											{state.filters.tags.length > 0 && (
												<button
													onClick={() =>
														manager.transition({
															type: "UPDATE_FILTERS",
															payload: { filters: { tags: [] } },
														})
													}
													className="p-1 bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground rounded text-xs">
													Clear tags ({state.filters.tags.length})
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
																		const isSelected =
																			state.filters.tags.includes(tag)
																		if (isSelected) {
																			manager.transition({
																				type: "UPDATE_FILTERS",
																				payload: {
																					filters: {
																						tags: state.filters.tags.filter(
																							(t) => t !== tag,
																						),
																					},
																				},
																			})
																		} else {
																			manager.transition({
																				type: "UPDATE_FILTERS",
																				payload: {
																					filters: {
																						tags: [
																							...state.filters.tags,
																							tag,
																						],
																					},
																				},
																			})
																		}
																	}}
																	className={`flex items-center gap-2 p-1 cursor-pointer text-sm hover:bg-vscode-button-secondaryBackground ${
																		state.filters.tags.includes(tag)
																			? "bg-vscode-button-background text-vscode-button-foreground"
																			: "text-vscode-dropdown-foreground"
																	}`}
																	onMouseDown={(e) => {
																		e.preventDefault()
																	}}>
																	<span
																		className={`codicon ${state.filters.tags.includes(tag) ? "codicon-check" : ""}`}
																	/>
																	{tag}
																</CommandItem>
															))}
													</CommandGroup>
												</CommandList>
											)}
										</Command>
										<div className="text-xs text-vscode-descriptionForeground mt-1">
											{state.filters.tags.length > 0
												? `Showing items with any of the selected tags (${state.filters.tags.length} selected)`
												: "Click tags to filter items"}
										</div>
									</div>
								)}
							</div>
						</div>

						{(() => {
							// Debug log state
							const items = checkFilterActive(state.filters)
								? state.displayItems || []
								: state.allItems || []
							const isEmpty = items.length === 0
							const isLoading = state.isFetching
							console.log("=== Rendering PackageManagerView ===")
							console.log("Component state:", {
								allItems: items,
								itemCount: items.length,
								isEmpty,
								isLoading,
								activeTab: state.activeTab,
								filters: state.filters,
							})

							// Show loading state if fetching and not filtering
							if (isLoading && !checkFilterActive(state.filters)) {
								console.log("Rendering loading state due to isFetching=true")
								return (
									<div className="flex flex-col items-center justify-center h-64 text-vscode-descriptionForeground">
										<p>Loading items...</p>
									</div>
								)
							}

							// Show empty state if no items
							if (isEmpty) {
								console.log("Showing empty state")
								return (
									<div className="flex flex-col items-center justify-center h-64 text-vscode-descriptionForeground">
										<p>No package manager items found</p>
									</div>
								)
							}

							// Show items view
							console.log("Showing items view with items:", items)
							return (
								<div>
									<p className="text-vscode-descriptionForeground mb-4">
										{checkFilterActive(state.filters)
											? `${items.length} items found (filtered)`
											: `${items.length} ${items.length === 1 ? "item" : "items"} total`}
									</p>
									<div className="grid grid-cols-1 gap-4 pb-4">
										{items.map((item) => (
											<PackageManagerItemCard
												key={`${item.repoUrl}-${item.name}`}
												item={item}
												filters={state.filters}
												setFilters={(filters) =>
													manager.transition({ type: "UPDATE_FILTERS", payload: { filters } })
												}
												activeTab={state.activeTab}
												setActiveTab={(tab) =>
													manager.transition({ type: "SET_ACTIVE_TAB", payload: { tab } })
												}
											/>
										))}
									</div>
								</div>
							)
						})()}
					</>
				) : (
					<PackageManagerSourcesConfig
						sources={state.sources}
						refreshingUrls={state.refreshingUrls}
						onRefreshSource={(url) => manager.transition({ type: "REFRESH_SOURCE", payload: { url } })}
						onSourcesChange={(sources) =>
							manager.transition({ type: "UPDATE_SOURCES", payload: { sources } })
						}
					/>
				)}
			</TabContent>
		</Tab>
	)
}

interface PackageManagerSourcesConfigProps {
	sources: PackageManagerSource[]
	refreshingUrls: string[]
	onRefreshSource: (url: string) => void
	onSourcesChange: (sources: PackageManagerSource[]) => void
}

const PackageManagerSourcesConfig: React.FC<PackageManagerSourcesConfigProps> = ({
	sources,
	refreshingUrls,
	onRefreshSource,
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
									onClick={() => onRefreshSource(source.url)}
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
