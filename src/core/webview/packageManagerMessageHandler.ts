import * as vscode from "vscode"
import { ClineProvider } from "./ClineProvider"
import { WebviewMessage } from "../../shared/WebviewMessage"
import { ExtensionMessage } from "../../shared/ExtensionMessage"
import { PackageManagerManager } from "../../services/package-manager"
import { PackageManagerItem, PackageManagerSource } from "../../services/package-manager/types"
import { GlobalState } from "../../schemas"

/**
 * Handle package manager-related messages from the webview
 */
export async function handlePackageManagerMessages(
  provider: ClineProvider,
  message: WebviewMessage,
  packageManagerManager: PackageManagerManager
): Promise<boolean> {
  // Utility function for updating global state
  const updateGlobalState = async <K extends keyof GlobalState>(key: K, value: GlobalState[K]) =>
    await provider.contextProxy.setValue(key, value)

  switch (message.type) {
    case "webviewDidLaunch": {
      // For webviewDidLaunch, we don't do anything - package manager items will be loaded by explicit fetchPackageManagerItems
      console.log("Package Manager: webviewDidLaunch received, but skipping fetch (will be triggered by explicit fetchPackageManagerItems)");
      return true;
    }
    case "fetchPackageManagerItems": {
      // Check if we need to force refresh using type assertion
      const forceRefresh = (message as any).forceRefresh === true;
      console.log(`Package Manager: Fetch requested with forceRefresh=${forceRefresh}`);
      try {
        console.log("Package Manager: Received request to fetch package manager items")
        console.log("DEBUG: Processing package manager request")

        // Wrap the entire initialization in a try-catch block
        try {
          // Initialize default sources if none exist
          let sources = await provider.contextProxy.getValue("packageManagerSources") as PackageManagerSource[] || []

          if (!sources || sources.length === 0) {
            console.log("Package Manager: No sources found, initializing default sources")
            sources = [
              {
                url: "https://github.com/Smartsheet-JB-Brown/Package-Manager-Test",
                name: "Official Roo-Code Package Manager",
                enabled: true
              }
          ];

          // Save the default sources
          await provider.contextProxy.setValue("packageManagerSources", sources)
          console.log("Package Manager: Default sources initialized")
        }

        console.log(`Package Manager: Fetching items from ${sources.length} sources`)
        console.log(`DEBUG: PackageManagerManager instance: ${packageManagerManager ? "exists" : "null"}`)

        // Add timing information
        const startTime = Date.now()

        // Simplify the initialization by limiting the number of items and adding more error handling
        let items: PackageManagerItem[] = [];

        try {
          console.log("DEBUG: Starting to fetch items from sources");
          // Only fetch from the first enabled source to reduce complexity
          const enabledSources = sources.filter(s => s.enabled);
          if (enabledSources.length > 0) {
            const firstSource = enabledSources[0];
            console.log(`Package Manager: Fetching items from first source: ${firstSource.url}`);

            // Get items from the first source only
            const sourceItems = await packageManagerManager.getPackageManagerItems([firstSource]);
            items = sourceItems;
            console.log("DEBUG: Successfully fetched items:", items.length);
          } else {
            console.log("DEBUG: No enabled sources found");
          }
        } catch (fetchError) {
          console.error("Failed to fetch package manager items:", fetchError);
          // Continue with empty items array
          items = [];
        }

        console.log("DEBUG: Fetch completed, preparing to send items to webview");
        const endTime = Date.now()

        console.log(`Package Manager: Found ${items.length} items in ${endTime - startTime}ms`)
        console.log(`Package Manager: First item:`, items.length > 0 ? items[0] : 'No items')

        // Send the items to the webview
        console.log("DEBUG: Creating message to send items to webview");

        // Get the current state to include apiConfiguration to prevent welcome screen from showing
        const currentState = await provider.getState();

        const message = {
          type: "state",
          state: {
            // Include the current apiConfiguration to prevent welcome screen from showing
            // This is critical because ExtensionStateContext checks apiConfiguration to determine if welcome screen should be shown
            apiConfiguration: currentState.apiConfiguration,
            packageManagerItems: items
          }
        } as ExtensionMessage;

        console.log(`Package Manager: Sending message to webview:`, message);
        console.log("DEBUG: About to call postMessageToWebview with apiConfiguration:",
          currentState.apiConfiguration ? "present" : "missing");
        provider.postMessageToWebview(message);
        console.log("DEBUG: Called postMessageToWebview");
        console.log(`Package Manager: Message sent to webview`);

        } catch (initError) {
          console.error("Error in package manager initialization:", initError);
          // Send an empty items array to the webview to prevent the spinner from spinning forever
          // Get the current state to include apiConfiguration to prevent welcome screen from showing
          const currentState = await provider.getState();

          provider.postMessageToWebview({
            type: "state",
            state: {
              // Include the current apiConfiguration to prevent welcome screen from showing
              // This is critical because ExtensionStateContext checks apiConfiguration to determine if welcome screen should be shown
              apiConfiguration: currentState.apiConfiguration,
              packageManagerItems: []
            }
          } as any); // Use type assertion to bypass TypeScript checking
          vscode.window.showErrorMessage(`Package manager initialization failed: ${initError instanceof Error ? initError.message : String(initError)}`);
        }
      } catch (error) {
        console.error("Failed to fetch package manager items:", error);
        vscode.window.showErrorMessage(`Failed to fetch package manager items: ${error instanceof Error ? error.message : String(error)}`)
      }
      return true
    }
    case "packageManagerSources": {
      if (message.sources) {
        // Enforce maximum of 10 sources
        const MAX_SOURCES = 10;
        let updatedSources: PackageManagerSource[];

        if (message.sources.length > MAX_SOURCES) {
          // Truncate to maximum allowed and show warning
          updatedSources = message.sources.slice(0, MAX_SOURCES);
          vscode.window.showWarningMessage(`Maximum of ${MAX_SOURCES} package manager sources allowed. Additional sources have been removed.`);
        } else {
          updatedSources = message.sources;
        }

        // Update the global state with the new sources
        await updateGlobalState("packageManagerSources", updatedSources);

        // Clean up cache directories for repositories that are no longer in the sources list
        try {
          console.log("Package Manager: Cleaning up cache directories for removed sources");
          await packageManagerManager.cleanupCacheDirectories(updatedSources);
          console.log("Package Manager: Cache cleanup completed");
        } catch (error) {
          console.error("Package Manager: Error during cache cleanup:", error);
        }

        // Update the webview with the new state
        await provider.postStateToWebview();
      }
      return true;
    }
    case "openExternal": {
      if (message.url) {
        console.log(`Package Manager: Opening external URL: ${message.url}`);
        try {
          vscode.env.openExternal(vscode.Uri.parse(message.url));
          console.log(`Package Manager: Successfully opened URL: ${message.url}`);
        } catch (error) {
          console.error(`Package Manager: Failed to open URL: ${error instanceof Error ? error.message : String(error)}`);
          vscode.window.showErrorMessage(`Failed to open URL: ${error instanceof Error ? error.message : String(error)}`);
        }
      } else {
        console.error("Package Manager: openExternal called without a URL");
      }
      return true;
    }

    case "refreshPackageManagerSource": {
      if (message.url) {
        try {
          console.log(`Package Manager: Received request to refresh source ${message.url}`);

          // Get the current sources
          const sources = await provider.contextProxy.getValue("packageManagerSources") as PackageManagerSource[] || [];

          // Find the source with the matching URL
          const source = sources.find(s => s.url === message.url);

          if (source) {
            try {
              // Refresh the repository
              await packageManagerManager.refreshRepository(message.url);
              vscode.window.showInformationMessage(`Successfully refreshed package manager source: ${source.name || message.url}`);

              // Trigger a fetch to update the UI with the refreshed data
              const currentState = await provider.getState();
              provider.postMessageToWebview({
                type: "state",
                state: {
                  apiConfiguration: currentState.apiConfiguration,
                  packageManagerItems: await packageManagerManager.getPackageManagerItems(sources.filter(s => s.enabled))
                }
              } as ExtensionMessage);
            } finally {
              // Always notify the webview that the refresh is complete, even if it failed
              console.log(`Package Manager: Sending repositoryRefreshComplete message for ${message.url}`);
              provider.postMessageToWebview({
                type: "repositoryRefreshComplete",
                url: message.url
              });
            }
          } else {
            console.error(`Package Manager: Source URL not found: ${message.url}`);
            vscode.window.showErrorMessage(`Source URL not found: ${message.url}`);
          }
        } catch (error) {
          console.error(`Package Manager: Failed to refresh source: ${error instanceof Error ? error.message : String(error)}`);
          vscode.window.showErrorMessage(`Failed to refresh source: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      return true;
    }


    default:
      return false
  }
}