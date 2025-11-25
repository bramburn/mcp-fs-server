import { QdrantOllamaConfig } from '../webviews/protocol.js';

/**
 * Configuration paths for VS Code settings
 */
export const ConfigPath = {
    GENERAL: 'qdrant',
    INDEXING: 'qdrant.indexing',
    SEARCH: 'qdrant.search',
    TRACE: 'qdrant.search.trace'
} as const;

/**
 * Strongly typed configuration model
 */
export interface Configuration {
    general: {
        trace: boolean;
    };
    indexing: {
        enabled: boolean;
        maxFiles: number;
        excludePatterns: string[];
        includeExtensions: string[];
    };
    search: {
        limit: number;
        threshold: number;
    };
    qdrantConfig?: QdrantOllamaConfig;
}

/**
 * Default configuration values
 */
export const DefaultConfiguration: Configuration = {
    general: {
        trace: false
    },
    indexing: {
        enabled: true,
        maxFiles: 500,
        excludePatterns: ['**/{node_modules,.git,out,dist,build,.svelte-kit}/**'],
        includeExtensions: ['ts', 'js', 'svelte', 'json', 'md', 'txt', 'html', 'css']
    },
    search: {
        limit: 10,
        threshold: 0.7
    }
};

/**
 * Factory class to create Configuration from VS Code workspace configuration
 */
export class ConfigurationFactory {
    /**
     * Create a typed Configuration from VS Code workspace configuration
     */
    public static from(vscodeConfig: any): Configuration {
        return {
            general: {
                trace: vscodeConfig.get(ConfigPath.TRACE, DefaultConfiguration.general.trace)
            },
            indexing: {
                enabled: vscodeConfig.get(ConfigPath.INDEXING + '.enabled', DefaultConfiguration.indexing.enabled),
                maxFiles: vscodeConfig.get(ConfigPath.INDEXING + '.maxFiles', DefaultConfiguration.indexing.maxFiles),
                excludePatterns: vscodeConfig.get(ConfigPath.INDEXING + '.excludePatterns', DefaultConfiguration.indexing.excludePatterns),
                includeExtensions: vscodeConfig.get(ConfigPath.INDEXING + '.includeExtensions', DefaultConfiguration.indexing.includeExtensions)
            },
            search: {
                limit: vscodeConfig.get(ConfigPath.SEARCH + '.limit', DefaultConfiguration.search.limit),
                threshold: vscodeConfig.get(ConfigPath.SEARCH + '.threshold', DefaultConfiguration.search.threshold)
            },
            qdrantConfig: undefined // Will be loaded separately from file
        };
    }

    /**
     * Validate configuration structure
     */
    public static validate(config: Configuration): boolean {
        if (!config || typeof config !== 'object') {
            return false;
        }

        // Validate general section
        if (!config.general || typeof config.general.trace !== 'boolean') {
            return false;
        }

        // Validate indexing section
        if (!config.indexing || 
            typeof config.indexing.enabled !== 'boolean' ||
            typeof config.indexing.maxFiles !== 'number' ||
            !Array.isArray(config.indexing.excludePatterns) ||
            !Array.isArray(config.indexing.includeExtensions)) {
            return false;
        }

        // Validate search section
        if (!config.search ||
            typeof config.search.limit !== 'number' ||
            typeof config.search.threshold !== 'number') {
            return false;
        }

        // Validate qdrantConfig presence if indexing is enabled
        if (config.indexing.enabled && !config.qdrantConfig) {
            return false;
        }

        return true;
    }
}