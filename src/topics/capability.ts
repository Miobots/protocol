export type CapabilityState = "available"| "unavailable" | "degraded"

export interface CapabilityStatus{
    state : CapabilityState,
    reason?: string,
    note?:string;
}

export interface CapabilityManifestPayload{
    capabilities:Record<string,CapabilityStatus>
}
