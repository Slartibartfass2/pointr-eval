export function replacer(key, value) {
    if (value instanceof Map) {
        return [...value];
    } else if (typeof value === "bigint") {
        return parseInt(value.toString());
    } else {
        return value;
    }
}
