import fetch from 'node-fetch';
import { config } from './config';
import { networks } from './networks';
import { InfoCallback, Network } from './types';

interface NodeInfo {
    hostname: string;
    url: string;
}

interface CheckerInfo {
    ipv4?: NodeInfo;
    ipv6?: NodeInfo;
}

interface NetReachability {
    ipv4: Reachability;
    ipv6: Reachability;
}

enum Reachability {
    UNKNOWN,
    REACHABLE,
    UNREACHABLE,
};

const reachabilityMatrix: { [key: string]: NetReachability } = {};
const expectedReachabilityMatrix: { [key: string]: NetReachability } = {};

const remoteCheckers: { [key: string]: CheckerInfo } = {};

async function fetchNode(node: string) {
    const url = `http://${node}:${config.listenport}`;
    const infoRes = await fetch(`${url}/info`);
    const info = (await infoRes.json()) as InfoCallback;
    for (const netName of Object.keys(info.networks)) {
        const netNameLower = netName.toLowerCase();
        let curChecker = remoteCheckers[netNameLower];
        if (!curChecker) {
            curChecker = {};
            remoteCheckers[netNameLower] = curChecker;
        }
        const netInfo = info.networks[netName];
        if (!curChecker.ipv4 && netInfo.ipv4) {
            curChecker.ipv4 = {
                hostname: info.hostname,
                url: `http://${netInfo.ipv4}:${config.listenport}/ip`,
            };
        }
        if (!curChecker.ipv6 && netInfo.ipv6) {
            curChecker.ipv6 = {
                hostname: info.hostname,
                url: `http://[${netInfo.ipv6}]:${config.listenport}/ip`,
            }; 
        }
    }
}

async function runCheck(node: NodeInfo) {
    try {
        await fetch(node.url, {
            timeout: 1000,
        });
        return Reachability.REACHABLE;
    } catch {
        return Reachability.UNREACHABLE;
    }
}

function makeReachabilityKey(src: Network, dest: Network) {
    return `${src.name.toLowerCase()}|${dest.name.toLowerCase()}`;
}

function getNetworksFromReachabilityKey(key: string) {
    const [srcName, destName] = key.split('|');
    return {
        src: networks[srcName],
        dest: networks[destName],
    };
}

async function main() {
    let promises: Promise<void>[] = [];

    for (const node of config.remoteNodes) {
        promises.push(fetchNode(node).catch((e) => {
            console.warn(`Error contacting node ${node}: ${e}`);
        }));
    }

    await Promise.all(promises);
    promises = [];

    for (const destName of Object.keys(networks)) {
        const destNetwork = networks[destName];
        const checker = remoteCheckers[destName.toLowerCase()];

        for (const srcName of Object.keys(networks)) {
            const srcNetwork = networks[srcName];

            const reachKey = makeReachabilityKey(srcNetwork, destNetwork);
            const netReach = {
                ipv4: Reachability.UNKNOWN,
                ipv6: Reachability.UNKNOWN,
            };
            reachabilityMatrix[reachKey] = netReach;

            const matrixHasV4 = srcNetwork.ipv4 && destNetwork.ipv4;
            const matrixHasV6 = srcNetwork.ipv6 && destNetwork.ipv6;
            
            const expectedReachDefault = (srcNetwork === destNetwork) ? Reachability.REACHABLE : Reachability.UNREACHABLE;
            expectedReachabilityMatrix[reachKey] = {
                ipv4: matrixHasV4 ? expectedReachDefault : Reachability.UNKNOWN,
                ipv6: matrixHasV6 ? expectedReachDefault : Reachability.UNKNOWN,
            };

            if (!checker) {
                continue;
            }
            if (checker.ipv4 && matrixHasV4) {
                promises.push(runCheck(checker.ipv4).then(r => {
                    netReach.ipv4 = r;
                }));
            }
            if (checker.ipv6 && matrixHasV6) {
                promises.push(runCheck(checker.ipv6).then(r => {
                    netReach.ipv6 = r;
                }));
            }
        }
    }

    await Promise.all(promises);
    promises = [];

    for (const rule of config.network_routes) {
        const srcStr = rule.src as string;
        const destStr = rule.dest as string;
        const setReach = rule.unreachable ? Reachability.UNREACHABLE : Reachability.REACHABLE;

        let srcs: string[] = [];
        let dests: string[] = [];
        if (srcStr === '*') {
            srcs = Object.keys(networks);
        }
        if (destStr === '*') {
            dests = Object.keys(networks);
        }

        for (const destName of dests) {
            const destNetwork = networks[destName.toLowerCase()];
            for (const srcName of srcs) {
                const srcNetwork = networks[srcName.toLowerCase()];

                const reachKey = makeReachabilityKey(srcNetwork, destNetwork);
                const expectedReach = expectedReachabilityMatrix[reachKey];
                if (expectedReach.ipv4 !== Reachability.UNKNOWN) {
                    expectedReach.ipv4 = setReach;
                }
                if (expectedReach.ipv6 !== Reachability.UNKNOWN) {
                    expectedReach.ipv6 = setReach;
                }
            }
        }
    }
    
    console.log(expectedReachabilityMatrix);
    console.log(reachabilityMatrix);

    for (const destName of Object.keys(networks)) {
        for (const srcName of Object.keys(networks)) {
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
