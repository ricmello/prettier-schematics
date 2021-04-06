import { get } from 'http';
import { SchematicContext, SchematicsException, Tree } from '@angular-devkit/schematics';

export interface NpmRegistryPackage {
  name: string;
  version: string;
}

export function getLatestNodeVersion(packageName: string): Promise<NpmRegistryPackage> {
  const DEFAULT_VERSION = 'latest';

  return new Promise((resolve) => {
    return get(`http://registry.npmjs.org/${packageName}`, (res: any) => {
      let rawData = '';
      res.on('data', (chunk: string) => (rawData += chunk));
      res.on('end', () => {
        try {
          const response = JSON.parse(rawData);
          const version = response && response['dist-tags'] || {};

          resolve(buildPackage(packageName, version.latest));
        } catch (e) {
          resolve(buildPackage(packageName));
        }
      });
    }).on('error', () => resolve(buildPackage(packageName)));
  });

  function buildPackage(name: string, version: string = DEFAULT_VERSION): NpmRegistryPackage {
    return {name, version};
  }
}


export function getFileAsJson(tree: Tree, path: string): any {
  if (tree.exists(path)) {
    const sourceText = tree.read(path)!.toString('utf-8');
    return JSON.parse(sourceText);
  } else {

    throw new SchematicsException(`Could not find (${path})`);
  }
}


export function addPackageToPackageJson(tree: Tree, context: SchematicContext, type: string, pkg: string, version: string): Tree {
  context.logger.debug(`adding ${pkg} version ${version}`);

  const json = getFileAsJson(tree, 'package.json');
  if (!json[type]) {
    json[type] = {};
  }

  if (!json[type][pkg]) {
    json[type][pkg] = version;
  }

  tree.overwrite('package.json', JSON.stringify(json, null, 2));

  return tree;
}


export function addPropertyToPackageJson(tree: Tree, context: SchematicContext, name: string, value: { [key: string]: any }): Tree {
  const json = getFileAsJson(tree, 'package.json');
  if (json[name]) {
    context.logger.debug(`overwriting ${name} with ${value}`);

    json[name] = {...json[name], ...value};
  } else {
    context.logger.debug(`creating ${name} with ${value}`);

    json[name] = value;
  }

  tree.overwrite('package.json', JSON.stringify(json, null, 2));

  return tree;
}

