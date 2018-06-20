import { exec } from 'child_process';
import { MarketplaceService } from './marketplace.service';
import { existsSync, mkdir, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as rimraf from 'rimraf';

const testDirectory = 'test';
export namespace ProjectService {

    export async function testPlugin(plugin: MarketplaceService.PluginModel) {
        try {
            await _checkTestDirectory();
            let projectName = 'test' + plugin.name;
            // NativeScript max project name length
            projectName = projectName.substr(0, 30);
            await _createProject(projectName);
            await _installPlugin(plugin.name, projectName, _isDev(plugin.name));
            const platform = _getPlatform(plugin);
            if (platform) {
                const result = await _buildProject(projectName, platform);
                return result;
            } else {
                console.error('plugin has no platform');
            }
        } catch (errExec) {
            console.error(JSON.stringify(errExec));
        }
        return false;
    }

    async function _buildProject(name: string, platform: string) {
        console.debug(`building project for ${platform} ...`);
        const result = await _execPromise(name, `tns build ${platform} --bundle`);
        return result;
    }

    function _getPlatform(plugin: MarketplaceService.PluginModel): string {
        const platform = plugin.badges && plugin.badges.androidVersion ? 'android' : plugin.badges && plugin.badges.iosVersion ? 'ios' : '';
        return platform;
    }

    function _isDev(name: string): boolean {
        return name && name.indexOf('-dev-') !== -1;
    }

    async function _installPlugin(name: string, projectName: string, isDev: boolean) {
        console.debug(`installing ${name} plugin ...`);
        const command = isDev ? `npm i ${name} --save-dev` : `tns plugin add ${name}`;
        await _execPromise(projectName, command);
        if (!isDev) {
            // Install webpack, modify project to include plugin code
            await _execPromise(projectName, 'npm i --save-dev nativescript-dev-webpack');
            await _execPromise(projectName, 'npm i');
            _modifyProject(path.join(testDirectory, projectName), name);
        }
    }

    function _modifyProject(appRoot: string, name: string) {
        const mainTsPath = path.join(appRoot, 'app', 'main-view-model.ts')
        let mainTs = readFileSync(mainTsPath, 'utf8');
        mainTs = `import * as testPlugin from '${name}';\n` + mainTs;
        mainTs = mainTs.replace('public onTap() {', 'public onTap() {\nfor (let testExport in testPlugin) {console.log(testExport);}\n');
        if (mainTs.indexOf('testExport') === -1) {
            throw new Error('Template content has changed! Plugin test script needs to be updated.')
        }
        writeFileSync(mainTsPath, mainTs, 'utf8');
    }

    async function _createProject(name: string) {
        /*
            Local tgz template vs installing from npm:
            local
                1:22 min for tns create
                2:18 min for tns build
            from npm (preferred)
                0:14 min for tns create
                1:42 min for tns build
        */
        console.debug(`creating project ${name} ...`);
        await _execPromise(null, `tns create ${name} --tsc`);
    }

    function _execPromise(project: string, command: string) {
        const cwd = project ? path.join(testDirectory, project) : testDirectory;
        const cp = exec(command, { cwd: cwd });

        return new Promise((resolve, reject) => {
            cp.addListener('error', reject);
            cp.addListener('exit', (code, signal) => {
                resolve(code === 0);
            });
            let hasError = false;
            cp.stderr.on('data', function (data) {
                if (!hasError) {
                    console.error(`error while executing ${command}:`);
                    hasError = true;
                }
                console.error(data);
            });
        });
    }

    async function _checkTestDirectory() {
        if (existsSync(testDirectory)) {
            return new Promise((resolve, reject) => {
                console.debug(`removing ${testDirectory} project root`);
                rimraf(testDirectory, errR => {
                    if (errR) {
                        return reject(errR);
                    }

                    _createTestDirectory().then(resolve).catch(reject);
                });
            });
        } else {
            return await _createTestDirectory();
        }

    }

    async function _createTestDirectory() {
        console.debug(`creating ${testDirectory} project root`);
        return new Promise((resolve, reject) => {
            mkdir(testDirectory, errM => {
                return errM ? reject(errM) : resolve();
            });
        });
    }
}