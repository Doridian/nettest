import { config } from './config';
import { networkInterfaces as getNetworkInterfaces, hostname as getHostname } from 'os';
import CIDRMatcher from 'cidr-matcher';
import { Network } from './types';

const discardMatcher = new CIDRMatcher(['fe80::/10', '::/128', '::1/128', '127.0.0.0/8', '0.0.0.0/32', '169.254.0.0/16']);

interface InterfaceInfo {
    name: string;
    ipv4?: string;
    ipv6?: string;
}

const networkInterfaces: InterfaceInfo[] = [];
function loadNetworkInterfaces() {
    const ifaces = getNetworkInterfaces();
    for (const name of Object.keys(ifaces)) {
        const addrs = ifaces[name]!;
        let ipv4: string | undefined;
        let ipv6: string | undefined;
        addrs.forEach((addr) => {
            if (discardMatcher.contains(addr.address)) {
                return;
            }

            if (addr.family === 'IPv4' && !ipv4) {
                ipv4 = addr.address;
            } else if (addr.family == 'IPv6' && !ipv6) {
                ipv6 = addr.address;
            }
        });
        networkInterfaces.push({
            name,
            ipv4,
            ipv6,
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
        const subnet = config.networks[name].subnet;
        const ifaceInfo = findNetworkInterfaceBySubnet(subnet);
        if (!ifaceInfo) {
            console.warn(`Interface for network ${name} does not exist`);
            nets[name.toLowerCase()] = {
                name,
            };
            continue;
        }
        nets[name.toLowerCase()] = {
            name,
            iface: ifaceInfo.name,
            ipv4: ifaceInfo.ipv4,
            ipv6: ifaceInfo.ipv6,
        };
    }
    return nets;
}

loadNetworkInterfaces();
export const networks = loadNetworks();
export const hostname = getHostname();
