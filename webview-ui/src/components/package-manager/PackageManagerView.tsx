import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react";
import { useExtensionState } from "../../context/ExtensionStateContext";
import { useAppTranslation } from "../../i18n/TranslationContext";
import { Tab, TabContent, TabHeader } from "../common/Tab";
import { vscode } from "@/utils/vscode";
import { PackageManagerItem, PackageManagerSource } from "../../../../src/services/package-manager/types";

type PackageManagerViewProps = {
  onDone: () => void;
};


const PackageManagerView = ({ onDone }: PackageManagerViewProps) => {
  const { packageManagerSources, setPackageManagerSources } = useExtensionState();
  console.log("DEBUG: PackageManagerView initialized with sources:", packageManagerSources);
  const { t } = useAppTranslation();
  const [items, setItems] = useState<PackageManagerItem[]>([]);
  const [activeTab, setActiveTab] = useState<"browse" | "sources">("browse");
  const [refreshingUrls, setRefreshingUrls] = useState<string[]>([]);

  // Track activeTab changes
  useEffect(() => {
    console.log("DEBUG: activeTab changed to", activeTab);
  }, [activeTab]);
  const [filters, setFilters] = useState({ type: "", search: "" });
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Debug state changes
  useEffect(() => {
    console.log("DEBUG: items state changed", {
      itemsLength: items.length,
      isFetching
    });
  }, [items]);

  // Track if we're currently fetching items to prevent duplicate requests
  const [isFetching, setIsFetching] = useState(false);

  // Use a ref to track if we've already fetched items
  const hasInitialFetch = useRef(false);

  // Fetch function without debounce for immediate execution
  const fetchPackageManagerItems = useCallback(() => {
    console.log("DEBUG: fetchPackageManagerItems called");
    // Only send fetch request if we're not already fetching
    if (!isFetching) {
      setIsFetching(true);
      try {
        // Request items from extension with explicit fetch
        vscode.postMessage({
          type: "fetchPackageManagerItems",
          forceRefresh: true // Add a flag to force refresh
        } as any);
        console.log("Explicitly fetching package manager items with force refresh...");
      } catch (error) {
        console.error("Failed to fetch package manager items:", error);
        setIsFetching(false);
      }
    } else {
      console.log("DEBUG: Skipping fetch because already in progress");
    }
  }, [isFetching]);

  // Always fetch items when component mounts, regardless of other conditions
  useEffect(() => {
    console.log("DEBUG: PackageManagerView mount effect triggered");

    // Force fetch on mount, ignoring all conditions
    setTimeout(() => {
      console.log("DEBUG: Forcing fetch on component mount");
      setIsFetching(false); // Reset fetching state first
      fetchPackageManagerItems();
      hasInitialFetch.current = true;
    }, 500); // Small delay to ensure component is fully mounted


  }, []); // Empty dependency array means this runs once on mount

  // Additional effect for when packageManagerSources changes
  useEffect(() => {
    console.log("DEBUG: PackageManagerView packageManagerSources effect triggered", {
      hasInitialFetch: hasInitialFetch.current,
      packageManagerSources,
      isFetching,
      itemsLength: items.length
    });

    // Only fetch if packageManagerSources changes and we're not already fetching
    if (packageManagerSources && hasInitialFetch.current && !isFetching) {
      console.log("DEBUG: Calling fetchPackageManagerItems due to sources change");
      fetchPackageManagerItems();
    }
  }, [packageManagerSources, fetchPackageManagerItems, isFetching]);

  // Handle message from extension
  useEffect(() => {
    console.log("DEBUG: Setting up message handler");

    const handleMessage = (event: MessageEvent) => {
      console.log("DEBUG: Message received in PackageManagerView", event.data);
      console.log("DEBUG: Message type:", event.data.type);
      console.log("DEBUG: Message state:", event.data.state ? "exists" : "undefined");
      const message = event.data;

      // Handle action messages - specifically for packageManagerButtonClicked
      if (message.type === "action" && message.action === "packageManagerButtonClicked") {
        console.log("DEBUG: Received packageManagerButtonClicked action, triggering fetch");
        // Directly trigger a fetch when the package manager tab is clicked
        setTimeout(() => {
          vscode.postMessage({
            type: "fetchPackageManagerItems",
            forceRefresh: true
          } as any);
        }, 100);
      }
      // Handle repository refresh completion
      if (message.type === "repositoryRefreshComplete" && message.url) {
        console.log(`DEBUG: Repository refresh complete for ${message.url}`);
        console.log(`DEBUG: Current refreshingUrls before update:`, refreshingUrls);
        setRefreshingUrls(prev => {
          const updated = prev.filter(url => url !== message.url);
          console.log(`DEBUG: Updated refreshingUrls:`, updated);
          return updated;
        });
      }

      // Handle state messages with packageManagerItems
      if (message.type === "state" && message.state) {
        console.log("DEBUG: Received state message", message.state);
        console.log("DEBUG: State has packageManagerItems:", message.state.packageManagerItems ? "yes" : "no");
        if (message.state.packageManagerItems) {
          console.log("DEBUG: packageManagerItems length:", message.state.packageManagerItems.length);
        }

        // Check for packageManagerItems
        if (message.state.packageManagerItems) {
          const receivedItems = message.state.packageManagerItems || [];
          console.log("DEBUG: Received packageManagerItems", receivedItems.length);
          console.log("DEBUG: Full message state:", message.state);

          if (receivedItems.length > 0) {
            console.log("DEBUG: First item:", receivedItems[0]);
            console.log("DEBUG: All items:", JSON.stringify(receivedItems));

            // Force a new array reference to ensure React detects the change
            setItems([...receivedItems]);
            setIsFetching(false);
            console.log("DEBUG: States updated - items:", receivedItems.length, "isFetching: false");
          } else {
            console.log("DEBUG: Received empty items array");
            setItems([]);
            setIsFetching(false);
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Filter items based on filters
  console.log("DEBUG: Filtering items", { itemsCount: items.length, filters });
  console.log("DEBUG: Items before filtering:", items.map(item => ({ name: item.name, type: item.type })));
  const filteredItems = items.filter(item => {
    // Filter by type
    if (filters.type && item.type !== filters.type) {
      return false;
    }

    // Filter by search term
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      const nameMatch = item.name.toLowerCase().includes(searchTerm);
      const descMatch = item.description.toLowerCase().includes(searchTerm);
      const authorMatch = item.author?.toLowerCase().includes(searchTerm);

      if (!nameMatch && !descMatch && !authorMatch) {
        return false;
      }
    }

    return true;
  });
  console.log("DEBUG: After filtering", { filteredItemsCount: filteredItems.length });

  // Sort items
  console.log("DEBUG: Sorting items", { filteredItemsCount: filteredItems.length, sortBy, sortOrder });
  const sortedItems = [...filteredItems].sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "author":
        comparison = (a.author || "").localeCompare(b.author || "");
        break;
      case "lastUpdated":
        comparison = (a.lastUpdated || "").localeCompare(b.lastUpdated || "");
        break;
      case "stars":
        comparison = (a.stars || 0) - (b.stars || 0);
        break;
      case "downloads":
        comparison = (a.downloads || 0) - (b.downloads || 0);
        break;
      default:
        comparison = a.name.localeCompare(b.name);
    }

    return sortOrder === "asc" ? comparison : -comparison;
  });
  console.log("DEBUG: Final sorted items", {
    sortedItemsCount: sortedItems.length,
    firstItem: sortedItems.length > 0 ? sortedItems[0].name : 'none'
  });

  // Add debug logging right before rendering
  useEffect(() => {
    console.log("DEBUG: Rendering with", {
      sortedItemsCount: sortedItems.length,
      firstItem: sortedItems.length > 0 ? `${sortedItems[0].name} (${sortedItems[0].type})` : 'none'
    });
  }, [sortedItems]);

  // Log right before rendering
  console.log("DEBUG: About to render with", {
    itemsLength: items.length,
    filteredItemsLength: filteredItems.length,
    sortedItemsLength: sortedItems.length,
    activeTab
  });

  return (
    <Tab>
      <TabHeader className="flex justify-between items-center">
        <div className="flex items-center">
          <h3 className="text-vscode-foreground m-0">Package Manager</h3>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeTab === "browse" ? "default" : "secondary"}
            onClick={() => setActiveTab("browse")}
          >
            Browse
          </Button>
          <Button
            variant={activeTab === "sources" ? "default" : "secondary"}
            onClick={() => setActiveTab("sources")}
          >
            Sources
          </Button>
          <Button onClick={onDone}>Done</Button>
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
              <div className="flex justify-between mt-2">
                <div>
                  <label className="mr-2">Filter by type:</label>
                  <select
                    value={filters.type}
                    onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                    className="p-1 bg-vscode-dropdown-background text-vscode-dropdown-foreground border border-vscode-dropdown-border rounded"
                  >
                    <option value="">All types</option>
                    <option value="role">Role</option>
                    <option value="mcp-server">MCP Server</option>
                    <option value="storage">Storage</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="mr-2">Sort by:</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="p-1 bg-vscode-dropdown-background text-vscode-dropdown-foreground border border-vscode-dropdown-border rounded mr-2"
                  >
                    <option value="name">Name</option>
                    <option value="author">Author</option>
                    <option value="lastUpdated">Last Updated</option>
                    <option value="stars">Stars</option>
                    <option value="downloads">Downloads</option>
                  </select>
                  <button
                    onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                    className="p-1 bg-vscode-button-secondaryBackground text-vscode-button-secondaryForeground rounded"
                  >
                    {sortOrder === "asc" ? "↑" : "↓"}
                  </button>
                </div>
              </div>
            </div>

            {console.log("DEBUG: Rendering condition", {
              sortedItemsLength: sortedItems.length,
              condition: sortedItems.length === 0 ? "empty" : "has items"
            })}

            {sortedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-vscode-descriptionForeground">
                <p>No package manager items found</p>
                <Button
                  onClick={() => {
                    vscode.postMessage({
                      type: "fetchPackageManagerItems",
                      forceRefresh: true
                    } as any);
                  }}
                  className="mt-4"
                >
                  <span className="codicon codicon-refresh mr-2"></span>
                  Refresh
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
                      vscode.postMessage({
                        type: "fetchPackageManagerItems",
                        forceRefresh: true
                      } as any);
                    }}
                    size="sm"
                  >
                    <span className="codicon codicon-refresh mr-2"></span>
                    Refresh
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  {sortedItems.map((item) => (
                    <PackageManagerItemCard key={`${item.repoUrl}-${item.name}`} item={item} />
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
              setPackageManagerSources(sources);
              vscode.postMessage({ type: "packageManagerSources", sources });
            }}
          />
        )}
      </TabContent>
    </Tab>
  );
};

const PackageManagerItemCard = ({ item }: { item: PackageManagerItem }) => {
  const { t } = useAppTranslation();

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "role":
        return "Role";
      case "mcp-server":
        return "MCP Server";
      case "storage":
        return "Storage";
      default:
        return "Other";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "role":
        return "bg-blue-600";
      case "mcp-server":
        return "bg-green-600";
      case "storage":
        return "bg-purple-600";
      default:
        return "bg-gray-600";
    }
  };

  const handleOpenUrl = () => {
    console.log(`PackageManagerItemCard: Opening URL: ${item.url}`);
    vscode.postMessage({
      type: "openExternal",
      url: item.url
    });
    console.log(`PackageManagerItemCard: Sent openExternal message with URL: ${item.url}`);
  };

  return (
    <div className="border border-vscode-panel-border rounded-md p-4 bg-vscode-panel-background">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-vscode-foreground">{item.name}</h3>
          {item.author && (
            <p className="text-sm text-vscode-descriptionForeground">
              {`by ${item.author}`}
            </p>
          )}
        </div>
        <span className={`px-2 py-1 text-xs text-white rounded-full ${getTypeColor(item.type)}`}>
          {getTypeLabel(item.type)}
        </span>
      </div>

      <p className="my-2 text-vscode-foreground">{item.description}</p>

      {item.tags && item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 my-2">
          {item.tags.map(tag => (
            <span
              key={tag}
              className="px-2 py-1 text-xs bg-vscode-badge-background text-vscode-badge-foreground rounded-full"
            >
              {tag}
            </span>
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
              {item.lastUpdated}
            </span>
          )}
          {item.stars !== undefined && (
            <span className="flex items-center">
              <span className="codicon codicon-star-full mr-1"></span>
              {item.stars}
            </span>
          )}
          {item.downloads !== undefined && (
            <span className="flex items-center">
              <span className="codicon codicon-cloud-download mr-1"></span>
              {item.downloads}
            </span>
          )}
        </div>

        <Button onClick={handleOpenUrl}>
          <span className="codicon codicon-link-external mr-2"></span>
          View on GitHub
        </Button>
      </div>
    </div>
  );
};

const PackageManagerSourcesConfig = ({
  sources,
  refreshingUrls,
  setRefreshingUrls,
  onSourcesChange
}: {
  sources: PackageManagerSource[];
  refreshingUrls: string[];
  setRefreshingUrls: React.Dispatch<React.SetStateAction<string[]>>;
  onSourcesChange: (sources: PackageManagerSource[]) => void;
}) => {
  const { t } = useAppTranslation();
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceName, setNewSourceName] = useState("");
  const [error, setError] = useState("");

  const handleAddSource = () => {
    // Validate URL
    if (!newSourceUrl) {
      setError("URL cannot be empty");
      return;
    }

    try {
      new URL(newSourceUrl);
    } catch (e) {
      setError("Invalid URL format");
      return;
    }

    // Check if URL already exists
    if (sources.some(source => source.url === newSourceUrl)) {
      setError("This URL is already in the list");
      return;
    }

    // Check if maximum number of sources has been reached
    const MAX_SOURCES = 10;
    if (sources.length >= MAX_SOURCES) {
      setError(`Maximum of ${MAX_SOURCES} sources allowed`);
      return;
    }

    // Add new source
    const newSource: PackageManagerSource = {
      url: newSourceUrl,
      name: newSourceName || undefined,
      enabled: true
    };

    onSourcesChange([...sources, newSource]);

    // Reset form
    setNewSourceUrl("");
    setNewSourceName("");
    setError("");
  };

  const handleToggleSource = (index: number) => {
    const updatedSources = [...sources];
    updatedSources[index].enabled = !updatedSources[index].enabled;
    onSourcesChange(updatedSources);
  };

  const handleRemoveSource = (index: number) => {
    const updatedSources = sources.filter((_, i) => i !== index);
    onSourcesChange(updatedSources);
  };

  const handleRefreshSource = (url: string) => {
    // Add URL to refreshing list
    setRefreshingUrls(prev => [...prev, url]);

    // Send message to refresh this specific source
    vscode.postMessage({
      type: "refreshPackageManagerSource",
      url
    });
  };

  return (
    <div>
      <h4 className="text-vscode-foreground mb-2">Configure Package Manager Sources</h4>
      <p className="text-vscode-descriptionForeground mb-4">
        Add Git repositories that contain package manager items. These repositories will be fetched when browsing the package manager.
      </p>

      <div className="mb-6">
        <h5 className="text-vscode-foreground mb-2">Add New Source</h5>
        <div className="flex flex-col gap-2 mb-2">
          <input
            type="text"
            placeholder="Git repository URL (e.g., https://github.com/username/repo)"
            value={newSourceUrl}
            onChange={(e) => {
              setNewSourceUrl(e.target.value);
              setError("");
            }}
            className="p-2 bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded"
          />
          <input
            type="text"
            placeholder="Display name (optional)"
            value={newSourceName}
            onChange={(e) => setNewSourceName(e.target.value)}
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
        Current Sources <span className="text-vscode-descriptionForeground text-sm">({sources.length}/10 max)</span>
      </h5>
      {sources.length === 0 ? (
        <p className="text-vscode-descriptionForeground">
          No sources configured. Add a source to get started.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {sources.map((source, index) => (
            <div
              key={source.url}
              className="flex items-center justify-between p-3 border border-vscode-panel-border rounded-md bg-vscode-panel-background"
            >
              <div className="flex-1">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={() => handleToggleSource(index)}
                    className="mr-2"
                  />
                  <div>
                    <p className="text-vscode-foreground font-medium">{source.name || source.url}</p>
                    {source.name && <p className="text-xs text-vscode-descriptionForeground">{source.url}</p>}
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
                  disabled={refreshingUrls.includes(source.url)}
                >
                  <span className={`codicon ${refreshingUrls.includes(source.url) ? 'codicon-sync codicon-modifier-spin' : 'codicon-refresh'}`}></span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveSource(index)}
                  className="text-red-500"
                >
                  <span className="codicon codicon-trash"></span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PackageManagerView;