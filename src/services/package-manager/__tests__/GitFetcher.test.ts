import { GitFetcher } from '../GitFetcher';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { PackageManagerItem, PackageManagerRepository } from '../types';

// Mock the exec function
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

// Mock promisify to return our mocked exec function
jest.mock('util', () => ({
  promisify: jest.fn().mockImplementation(() => {
    return jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
  })
}));

// Mock fs.promises
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockImplementation((path) => {
    const pathStr = path.toString();
    if (pathStr.includes('roles')) {
      return Promise.resolve(['developer-role']);
    }
    if (pathStr.includes('mcp-servers')) {
      return Promise.resolve(['file-analyzer']);
    }
    if (pathStr.includes('storage-systems')) {
      return Promise.resolve(['github-storage']);
    }
    if (pathStr.includes('items')) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }),
  stat: jest.fn().mockImplementation((path) => {
    const pathStr = path.toString();
    if (pathStr.includes('.git') ||
        pathStr.includes('roles') ||
        pathStr.includes('mcp-servers') ||
        pathStr.includes('storage-systems') ||
        pathStr.includes('developer-role') ||
        pathStr.includes('file-analyzer') ||
        pathStr.includes('github-storage')) {
      return Promise.resolve({ isDirectory: () => true });
    }
    if (pathStr.includes('metadata.yml')) {
      return Promise.resolve({ isFile: () => true });
    }
    return Promise.reject(new Error('File not found'));
  }),
  readFile: jest.fn().mockImplementation((path, encoding) => {
    const pathStr = path.toString();
    if (pathStr.includes('metadata.yml') &&
        !pathStr.includes('developer-role') &&
        !pathStr.includes('file-analyzer') &&
        !pathStr.includes('github-storage')) {
      return Promise.resolve('name: "Example Package Manager Repository"\ndescription: "A collection of example package manager items for Roo-Code"\nauthor: "Roo Team"\nversion: "1.0.0"\nlastUpdated: "2025-04-08"');
    }
    if (pathStr.includes('developer-role/metadata.yml')) {
      return Promise.resolve('name: "Full-Stack Developer Role"\ndescription: "A role for a full-stack developer"\ntype: "role"\nauthor: "Roo Team"\nversion: "1.0.0"\ntags: ["developer", "full-stack"]');
    }
    if (pathStr.includes('file-analyzer/metadata.yml')) {
      return Promise.resolve('name: "File Analyzer MCP Server"\ndescription: "An MCP server that analyzes files"\ntype: "mcp-server"\nauthor: "Roo Team"\nversion: "1.0.0"\ntags: ["file-analyzer", "code-quality"]');
    }
    if (pathStr.includes('github-storage/metadata.yml')) {
      return Promise.resolve('name: "GitHub Storage System"\ndescription: "A storage system that uses GitHub repositories"\ntype: "storage"\nauthor: "Roo Team"\nversion: "1.0.0"\ntags: ["storage", "github"]');
    }
    return Promise.reject(new Error('File not found'));
  })
}));
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock vscode
jest.mock('vscode', () => ({
  window: {
    showErrorMessage: jest.fn(),
  },
  Uri: {
    parse: jest.fn().mockImplementation((url) => ({ toString: () => url })),
  }
}));

describe('GitFetcher', () => {
  let gitFetcher: GitFetcher;

  const mockContext = {
    globalStorageUri: { fsPath: '/mock/storage/path' }
  } as unknown as vscode.ExtensionContext;

  beforeEach(() => {
    gitFetcher = new GitFetcher(mockContext);
    jest.clearAllMocks();

    // Setup path.join to work normally
    jest.spyOn(path, 'join').mockImplementation((...args) => args.join('/'));
  });

  describe('fetchRepository', () => {
    it('should fetch repository successfully', async () => {
      const repoUrl = 'https://github.com/Smartsheet-JB-Brown/Package-Manager-Test';

      // Mock execAsync for git operations
      const mockExecPromise = jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
      (promisify as unknown as jest.Mock).mockReturnValue(mockExecPromise);

      // Call the method
      const result = await gitFetcher.fetchRepository(repoUrl);

      // Assertions
      expect(result).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.name).toBe('Example Package Manager Repository');
      expect(result.items).toHaveLength(3); // One role, one MCP server, one storage system

      // Check role item
      const roleItem = result.items.find((item: PackageManagerItem) => item.type === 'role');
      expect(roleItem).toBeDefined();
      expect(roleItem?.name).toBe('Full-Stack Developer Role');
      expect(roleItem?.tags).toContain('developer');
      expect(roleItem?.url).toBe('https://github.com/Smartsheet-JB-Brown/Package-Manager-Test/tree/main/roles/developer-role');

      // Check MCP server item
      const mcpServerItem = result.items.find((item: PackageManagerItem) => item.type === 'mcp-server');
      expect(mcpServerItem).toBeDefined();
      expect(mcpServerItem?.name).toBe('File Analyzer MCP Server');
      expect(mcpServerItem?.tags).toContain('file-analyzer');
      expect(mcpServerItem?.url).toBe('https://github.com/Smartsheet-JB-Brown/Package-Manager-Test/tree/main/mcp-servers/file-analyzer');

      // Check storage system item
      const storageItem = result.items.find((item: PackageManagerItem) => item.type === 'storage');
      expect(storageItem).toBeDefined();
      expect(storageItem?.name).toBe('GitHub Storage System');
      expect(storageItem?.tags).toContain('storage');
      expect(storageItem?.url).toBe('https://github.com/Smartsheet-JB-Brown/Package-Manager-Test/tree/main/storage-systems/github-storage');

      // Verify file system operations
      expect(mockedFs.mkdir).toHaveBeenCalledWith('/mock/storage/path/package-manager-cache', { recursive: true });
      expect(mockedFs.stat).toHaveBeenCalledWith('/mock/storage/path/package-manager-cache/Package-Manager-Test/.git');
      expect(mockedFs.stat).toHaveBeenCalledWith('/mock/storage/path/package-manager-cache/Package-Manager-Test/metadata.yml');
      expect(mockedFs.readFile).toHaveBeenCalledWith('/mock/storage/path/package-manager-cache/Package-Manager-Test/metadata.yml', 'utf-8');

      // Verify that readdir was called for each item directory type
      expect(mockedFs.readdir).toHaveBeenCalledWith('/mock/storage/path/package-manager-cache/Package-Manager-Test/roles');
      expect(mockedFs.readdir).toHaveBeenCalledWith('/mock/storage/path/package-manager-cache/Package-Manager-Test/mcp-servers');
      expect(mockedFs.readdir).toHaveBeenCalledWith('/mock/storage/path/package-manager-cache/Package-Manager-Test/storage-systems');
    });

    it('should handle errors when fetching repository', async () => {
      const repoUrl = 'https://github.com/Smartsheet-JB-Brown/Package-Manager-Test';

      // Mock stat to throw an error for the .git directory check
      mockedFs.stat.mockImplementation((path) => {
        const pathStr = path.toString();
        if (pathStr.includes('.git')) {
          return Promise.reject(new Error('Directory not found'));
        }
        return Promise.resolve({ isDirectory: () => false, isFile: () => false } as any);
      });

      // Mock readFile to throw an error for metadata.yml
      mockedFs.readFile.mockImplementation((path) => {
        return Promise.reject(new Error('File not found'));
      });

      // Mock exec to throw an error
      const mockExecPromise = jest.fn().mockRejectedValue(new Error('Git error'));
      (promisify as unknown as jest.Mock).mockReturnValue(mockExecPromise);

      // Call the method
      const result = await gitFetcher.fetchRepository(repoUrl);

      // Assertions
      expect(result).toEqual({ metadata: {}, items: [], url: repoUrl });
      expect(vscode.window.showErrorMessage).toHaveBeenCalled();
    });
  });

  describe('getRepoNameFromUrl', () => {
    it('should extract repository name from GitHub URL', () => {
      const url = 'https://github.com/Smartsheet-JB-Brown/Package-Manager-Test';
      const result = gitFetcher['getRepoNameFromUrl'](url);

      expect(result).toBe('Package-Manager-Test');
    });
    it('should handle GitHub URLs with trailing slash', () => {
      const url = 'https://github.com/Smartsheet-JB-Brown/Package-Manager-Test/';
      // Call the actual method on gitFetcher
      const result = gitFetcher['getRepoNameFromUrl'](url);

      expect(result).toBe('Package-Manager-Test');
    });

    it('should sanitize repository names', () => {
      const url = 'https://github.com/Smartsheet-JB-Brown/Package Manager Test';
      // Call the actual method on gitFetcher
      const result = gitFetcher['getRepoNameFromUrl'](url);

      expect(result).toBe('Package-Manager-Test');
    });
  });
});