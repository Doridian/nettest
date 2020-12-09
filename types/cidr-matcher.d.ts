declare module 'cidr-matcher' {
    export default class CIDRMatcher {
        constructor(subnet: string[]);
        contains(ip: string): boolean;
        containsAny(ips: string[]): boolean;
    }
}
