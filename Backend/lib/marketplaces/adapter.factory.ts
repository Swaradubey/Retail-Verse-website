import fs from 'fs';
import path from 'path';
import { MarketplaceConnector } from './connector.interface';

class AdapterFactory {
  private connectors: Map<string, MarketplaceConnector> = new Map();

  constructor() {
    this.registerConnectors();
  }

  private registerConnectors() {
    try {
      const baseDir = __dirname;
      const dirs = fs.readdirSync(baseDir).filter(f => {
        return fs.statSync(path.join(baseDir, f)).isDirectory();
      });

      for (const dir of dirs) {
        try {
          const connectorPath = path.join(baseDir, dir);
          const indexFilePath = path.join(connectorPath, 'index.ts');
          if (fs.existsSync(indexFilePath) || fs.existsSync(path.join(connectorPath, 'index.js'))) {
            // Load connector module dynamically
            const module = require(connectorPath);
            const ConnectorClass = module.default || module[Object.keys(module)[0]];
            if (ConnectorClass && typeof ConnectorClass === 'function') {
              this.connectors.set(dir.toLowerCase(), new ConnectorClass());
              console.log(`[AdapterFactory] Dynamic connector registered for: ${dir}`);
            }
          }
        } catch (err: any) {
          console.error(`[AdapterFactory] Failed to load connector in directory "${dir}":`, err.message);
        }
      }
    } catch (err: any) {
      console.error('[AdapterFactory] Error scanning connector directories:', err.message);
    }
  }

  getConnector(marketplace: string): MarketplaceConnector {
    const connector = this.connectors.get(marketplace.toLowerCase());
    if (!connector) {
      throw new Error(`Marketplace connector not registered for: ${marketplace}`);
    }
    return connector;
  }
}

export const adapterFactory = new AdapterFactory();
export default adapterFactory;
