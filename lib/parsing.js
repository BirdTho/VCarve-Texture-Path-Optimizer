import Coords from './Coords.js';

/**
 *
 * @param {string[]} list
 * @param {string} first
 * @returns {Coords[]}
 */
export function convertGCodeLinesToObjects(list, first = null) {
    let last = null;
    if (first) {
        last = convertGCodeLineToObject(first, null)
    }
    return list.map((str) => {
        const coord = convertGCodeLineToObject(str, last)
        last = coord;
        return coord
    })
}

export function convertGCodeLineToObject(item, last) {
    return new Coords(item, last)
}

/**
 * @param {Coords[]} list
 * @return {string[]}
 */
export function convertObjectsToGCodeLines(list) {
    return list.map(convertObjectToGCodeLine)
}

/**
 * @param {Coords} obj
 * @return {string}
 */
export function convertObjectToGCodeLine(obj) {
    return obj.toString();
}