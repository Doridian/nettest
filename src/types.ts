export interface Network {
    iface?: string;
    name: string;
    ipv4?: string;
    ipv6?: string;
    ipv4CIDR?: string;
    ipv6CIDR?: string;
    netConf: {
        gateway?: string;
        gateway6?: string;
        subnet: string;
    }
}

export interface InfoCallback {
    networks: { [key: string]: Network };
    hostname: string;
}
