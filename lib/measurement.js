/**
 * Measure the travel distance of the GCode instructions
 * @param {Coords[]} list
 */
export function measure(list) {
    let total = 0;
    list.forEach(coord => total += coord.distFromPrev())
    return total;
}