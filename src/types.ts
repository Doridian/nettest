export interface Network {
    iface?: string;
    name: string;
    ipv4?: string;
    ipv6?: string;
}

export interface InfoCallback {
    networks: { [key: string]: Network };
    hostname: string;
}
