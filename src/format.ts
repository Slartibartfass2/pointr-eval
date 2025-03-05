export function padding(key: string, length: number) {
    return " ".repeat(length - key.length);
}

export function padP(value: number) {
    return value < 0 ? "" : " " + String(asPercentage(value)).padEnd(7);
}

export function asPercentage(num: number): string {
    if (isNaN(num)) {
        return "??%";
    }
    return `${roundTo(num * 100, 3)}%`;
}

export function roundTo(num: number, digits = 4): number {
    const factor = Math.pow(10, digits);
    return Math.round(num * factor) / factor;
}
