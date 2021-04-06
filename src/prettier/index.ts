import { apply, chain, mergeWith, move, Rule, SchematicContext, Tree, url } from '@angular-devkit/schematics';
import { JsonObject } from "@angular-devkit/core";
import { NodePackageInstallTask } from "@angular-devkit/schematics/tasks";
import { from, Observable } from "rxjs";
import {
  addPackageToPackageJson,
  addPropertyToPackageJson,
  getFileAsJson,
  getLatestNodeVersion,
  NpmRegistryPackage
} from "../utils/utils";
import { concatMap, map } from "rxjs/operators";

export function prettier(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    return chain([
      addDependencies(),
      addPrettierFiles(),
      installPackages(),
      modifyTsLint(),
      addLintStagedConfig(),
      updateGitIgnore(),
      addScripts(),
    ])(tree, context);
  };
}

const prettierWriteCommand = 'prettier --write --ignore-unknown';
const prettierCheckCommand = 'prettier --check --ignore-unknown';
const tslintConfigPackage = 'tslint-config-prettier';
const packages = [tslintConfigPackage, 'prettier', 'lint-staged']

function addDependencies(): Rule {
  return (tree: Tree, context: SchematicContext): Observable<Tree> => {

    addPackageToPackageJson(tree, context, 'devDependencies', 'husky', '^4.3.0')

    return from(packages).pipe(
      concatMap((pkg: string) => getLatestNodeVersion(pkg)),
      map((packageFromRegistry: NpmRegistryPackage) => {
        const {name, version} = packageFromRegistry;

        addPackageToPackageJson(tree, context, 'devDependencies', name, version);

        return tree;
      })
    );
  };
}

function installPackages(): Rule {
  return (tree: Tree, context: SchematicContext): Tree => {
    return context.addTask(new NodePackageInstallTask()) && tree;
  };
}

function addPrettierFiles(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const templateSource = apply(url('./files'), [move('./'),]);

    return chain([mergeWith(templateSource)])(tree, context);
  };
}

function modifyTsLint(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const tslintPath = 'tslint.json';
    if (tree.exists(tslintPath)) {
      const tslint = getFileAsJson(tree, tslintPath) as JsonObject;

      if (!tslint) return tree;

      if (Array.isArray(tslint.extends)) {
        // should be added last https://github.com/prettier/tslint-config-prettier
        tslint.extends = tslint.extends.filter(key => key === tslintConfigPackage)
        tslint.extends.push(tslintConfigPackage)
      } else if (typeof tslint.extends === 'string') {
        tslint.extends = [tslint.extends, tslintConfigPackage];
      } else {
        tslint.extends = tslintConfigPackage;
      }

      tree.overwrite(tslintPath, JSON.stringify(tslint, null, 2));
    } else {
      context.logger.info(
        `unable to locate tslint file at ${tslintPath}, conflicting styles may exists`
      );
    }

    return tree;
  };
}

function addLintStagedConfig() {
  return (tree: Tree, context: SchematicContext) => {
    addPropertyToPackageJson(tree, context, 'husky', {
      hooks: {'pre-commit': 'lint-staged'},
    });

    addPropertyToPackageJson(tree, context, 'lint-staged', {
      ['**/*']: [prettierWriteCommand],
    });
    return tree;
  };
}

function addScripts() {
  return (tree: Tree, context: SchematicContext) => {
    addPropertyToPackageJson(tree, context, 'scripts', {
      'prettier': `${prettierWriteCommand} .`,
      'prettier:check': `${prettierCheckCommand} .`,
    });
    return tree;
  };
}

function updateGitIgnore(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const gitignorePath = '.gitignore';
    const husky = '/.husky';

    if (tree.exists(gitignorePath)) {
      const gitIgnoreBuffer = tree.read(gitignorePath);

      if (gitIgnoreBuffer === null) {
        context.logger.info(
          `Could not modify .gitignore at ${gitignorePath}. Please add a new entry for ${husky}`
        );
      } else {
        const gitignoreArray = gitIgnoreBuffer.toString().split('\n');

        if (!gitignoreArray.includes(husky)) {
          gitignoreArray.push('# Husky hooks')
          gitignoreArray.push(husky)
          const modifiedGitIgnore = gitignoreArray.join('\n');

          tree.overwrite(gitignorePath, modifiedGitIgnore);
        }
      }
    }
    return tree;
  };
}
