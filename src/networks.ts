import { config } from './config';
import { networkInterfaces as getNetworkInterfaces, hostname as getHostname } from 'os';
import CIDRMatcher from 'cidr-matcher';
import { Network } from './types';

const discardMatcher = new CIDRMatcher(['fe80::/10', '::/128', '::1/128', '127.0.0.0/8', '0.0.0.0/32', '169.254.0.0/16']);

interface InterfaceInfo {
    name: string;
    ipv4?: string;
    ipv6?: string;
    ipv4CIDR?: string;
    ipv6CIDR?: string;
}

const allAddresses: Set<string> = new Set();
export function isLocalAddress(addr: string) {
    return allAddresses.has(addr) || discardMatcher.contains(addr);
}

const networkInterfaces: InterfaceInfo[] = [];
function loadNetworkInterfaces() {
    const ifaces = getNetworkInterfaces();
    for (const name of Object.keys(ifaces)) {
        const addrs = ifaces[name]!;
        let ipv4: string | undefined;
        let ipv6: string | undefined;
        let ipv4CIDR: string | undefined;
        let ipv6CIDR: string | undefined;
        addrs.forEach((addr) => {
            if (discardMatcher.contains(addr.address)) {
                return;
            }

            allAddresses.add(addr.address);

            if (addr.family === 'IPv4' && !ipv4) {
                ipv4 = addr.address;
                ipv4CIDR = addr.cidr!;
            } else if (addr.family == 'IPv6' && !ipv6) {
                ipv6 = addr.address;
                ipv6CIDR = addr.cidr!;
            }
        });
        networkInterfaces.push({
            name,
            ipv4,
            ipv6,
            ipv4CIDR,
            ipv6CIDR,
        });
    }
}

function findNetworkInterfaceBySubnet(subnet: string) {
    const subnetMatcher = new CIDRMatcher([subnet]);
    for (const iface of networkInterfaces) {
        if (iface.ipv4 && subnetMatcher.contains(iface.ipv4)) {
            return iface;
        }
    }
}

function loadNetworks() {
    const nets: { [key: string]: Network } = {};
    for (const name of Object.keys(config.networks)) {
        const netConf = config.networks[name];
        const subnet = netConf.subnet;
        const ifaceInfo = findNetworkInterfaceBySubnet(subnet);
        if (!ifaceInfo) {
            console.warn(`Interface for network ${name} does not exist`);
            nets[name.toLowerCase()] = {
                name,
                netConf,
            };
            continue;
        }
        nets[name.toLowerCase()] = {
            name,
            netConf,
            iface: ifaceInfo.name,
            ipv4: ifaceInfo.ipv4,
            ipv6: ifaceInfo.ipv6,
            ipv4CIDR: ifaceInfo.ipv4CIDR,
            ipv6CIDR: ifaceInfo.ipv6CIDR,
        };
    }
    return nets;
}

loadNetworkInterfaces();
export const networks = loadNetworks();
export const hostname = getHostname();
