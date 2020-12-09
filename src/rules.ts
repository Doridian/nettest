import { networks } from './networks';

function main() {
    for (const net of Object.values(networks)) {
        if (!net.iface) {
            continue;
        }

        if (net.ipv4CIDR) {
            console.log(`ip rule add from "${net.netConf.subnet}" table "${net.iface}"`);
            console.log(`ip route add "${net.netConf.subnet}" dev "${net.iface}" table "${net.iface}"`);
            if (net.netConf.gateway) {
                console.log(`ip route add default via "${net.netConf.gateway}" dev "${net.iface}" table "${net.iface}"`);
            }
        }

        if (net.ipv6CIDR) {
            console.log(`ip -6 rule add from "${net.ipv6CIDR}" table "${net.iface}"`);
            console.log(`ip -6 route add "${net.ipv6CIDR}" dev "${net.iface}" table "${net.iface}"`);
            if (net.netConf.gateway6) {
                console.log(`ip -6 route add default via "${net.netConf.gateway6}" dev "${net.iface}" table "${net.iface}"`);
            }
        }
    }
}

main();
