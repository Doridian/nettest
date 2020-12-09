import got from 'got';
import { config } from './config';
import { isLocalAddress, networks } from './networks';
import { InfoCallback, Network } from './types';
import clc from 'cli-color';

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
    UNKNOWN = 'Unknown',
    REACHABLE = 'Reachable',
    UNREACHABLE = 'Unreachable',
};

const reachabilityMatrix: { [key: string]: NetReachability } = {};
const expectedReachabilityMatrix: { [key: string]: NetReachability } = {};

const remoteCheckers: { [key: string]: CheckerInfo } = {};

async function fetchNode(node: string) {
    if (isLocalAddress(node)) {
        return;
    }

    const url = `http://${node}:${config.listenport}`;
    const infoRes = await got(`${url}/info`);
    const info = JSON.parse(infoRes.body) as InfoCallback;
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

async function runCheck(srcAddr: string, node: NodeInfo) {
    try {
        await got(node.url, {
            timeout: 1000,
            localAddress: srcAddr,
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
        srcNetwork: networks[srcName],
        destNetwork: networks[destName],
    };
}

async function main() {
    let promises: Promise<void>[] = [];

    // Load remote nodes to get full VLAN coverage
    for (const node of config.remoteNodes) {
        promises.push(fetchNode(node).catch((e) => {
            console.warn(`Error contacting node ${node}: ${e}`);
        }));
    }

    await Promise.all(promises);
    promises = [];

    // Initialize expected reachability to defaults and run reachability tests
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

            const matrixHasV4 = srcNetwork.ipv4 && checker && checker.ipv4;
            const matrixHasV6 = srcNetwork.ipv6 && checker && checker.ipv6;
            
            const expectedReachDefault = (srcNetwork === destNetwork) ? Reachability.REACHABLE : Reachability.UNREACHABLE;
            expectedReachabilityMatrix[reachKey] = {
                ipv4: matrixHasV4 ? expectedReachDefault : Reachability.UNKNOWN,
                ipv6: matrixHasV6 ? expectedReachDefault : Reachability.UNKNOWN,
            };

            if (matrixHasV4) {
                promises.push(runCheck(srcNetwork.ipv4!, checker.ipv4!).then(r => {
                    netReach.ipv4 = r;
                }));
            }
            if (matrixHasV6) {
                promises.push(runCheck(srcNetwork.ipv6!, checker.ipv6!).then(r => {
                    netReach.ipv6 = r;
                }));
            }
        }
    }

    await Promise.all(promises);
    promises = [];

    // Adjust expected reachability according to rules
    for (const rule of config.network_routes) {
        const srcStr = rule.src as string;
        const destStr = rule.dest as string;
        const setReach = rule.unreachable ? Reachability.UNREACHABLE : Reachability.REACHABLE;

        let srcs: string[] = [srcStr];
        let dests: string[] = [destStr];
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
    
    // Verify expected and actual match
    for (const key of Object.keys(reachabilityMatrix)) {
        const actualReach = reachabilityMatrix[key];
        const expectedReach = expectedReachabilityMatrix[key];

        const { srcNetwork, destNetwork } = getNetworksFromReachabilityKey(key);

        const ipv4ok = actualReach.ipv4 === expectedReach.ipv4;
        const ipv6ok = actualReach.ipv6 === expectedReach.ipv6;
        const allok = ipv4ok && ipv6ok;

        console.info(clc.blue(`${srcNetwork.name} -> ${destNetwork.name}: v4=${actualReach.ipv4};v6=${actualReach.ipv6}`));
        if (!allok) {
            if (!ipv4ok) {
                console.warn(clc.red(`${srcNetwork.name} -> ${destNetwork.name}: ERROR v4 expected=${expectedReach.ipv4}`));
            }
            if (!ipv6ok) {
                console.warn(clc.red(`${srcNetwork.name} -> ${destNetwork.name}: ERROR v6 expected=${expectedReach.ipv6}`));
            }            
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
