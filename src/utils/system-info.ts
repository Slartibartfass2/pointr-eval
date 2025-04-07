import systemInfo from "systeminformation";

export interface SystemInfo {
    cpu: string;
    cores: number;
    memory: string;
    os: string;
    node: string;
    npm: string;
}

/**
 * Get system information.
 *
 * @returns A promise that resolves to an object containing system information.
 */
export async function getSystemInfo(): Promise<SystemInfo> {
    const cpuInfo = await systemInfo.cpu();
    const memInfo = await systemInfo.mem();
    const osInfo = await systemInfo.osInfo();
    const versions = await systemInfo.versions();

    return {
        cpu: `${cpuInfo.manufacturer} ${cpuInfo.brand} (${cpuInfo.speed} GHz)`,
        cores: cpuInfo.cores,
        memory: (memInfo.total / 1024 / 1024 / 1024).toFixed(2),
        os: `${osInfo.distro} ${osInfo.release}`,
        node: versions.node,
        npm: versions.npm,
    };
}
