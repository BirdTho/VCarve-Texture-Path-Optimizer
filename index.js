import fs from 'fs';
import {convertGCodeLinesToObjects, convertObjectsToGCodeLines} from "./lib/parsing.js";
import {measure} from "./lib/measurement.js";

const args = process.argv;

if (args.length !== 4) {
    console.log('Args should be "node index.js <input file path gcode> <output file path gcode>')
    process.exit(0);
}
const inputFile = args[2];
const outputFile = args[3];

// fetch file
const inputData = fs.readFileSync(inputFile, {encoding: 'utf-8'});

let splitter = '\n';
if (inputData.indexOf('\r\n') >= 0) {
    splitter = '\r\n';
}
let inputInstructions = inputData.split(splitter);

// get measurement system
const UNITS = {
    'in': 'in',
    'mm': 'mm',
};
let unit;

let unitCode = inputInstructions.find((line) => line === 'G20' || line === 'G21');
let minMove = 0.1;

if (unitCode === 'G20') {
    unit = UNITS.in;
} else if (unitCode === 'G21') {
    unit = UNITS.mm;
    minMove = 2.54;
} else {
    console.log('Didn\'t find unit code for inches or mm');
    process.exit(0);
}

const zMoveRegex = /^G0.*Z[\d.]+$/gm;

let lastZMoveIndex = -1;

let firstMoves = []

const zTravelMoves = inputInstructions.reduce((accum, line, index, arr) => {
    if (zMoveRegex.test(line)) {
        if (/^(M03|G[01][XYZ])/.test(arr[index - 1] || '')) {
            if (/^G[01]/.test(arr[index + 1] || '')) {
                accum.push(index)
            } else {
                lastZMoveIndex = index;
            }
        } else if (accum.length === 0) {
            firstMoves.push(line);
        }
    }
    return accum
}, []);

let headerMove = null;
if (firstMoves.length) {
    firstMoves = convertGCodeLinesToObjects(firstMoves);
    headerMove = firstMoves[firstMoves.length - 1];
}

if (zTravelMoves.length > 0) {
    console.log('Found ' + zTravelMoves.length + ' G0Z---- moves, last Z-move is on line ' + (lastZMoveIndex + 1));
} else {
    console.log('Is this even a GCode file?');
}

if (inputInstructions.length - lastZMoveIndex > 30) {
    console.log('Concerned lastZMoveIndex is not correct because the index is more than 30 lines before the end of the file');
    console.log('lastMoveZIndex on line ' + (lastZMoveIndex + 1) + ', length of file is ' + inputInstructions.length + ' lines.');
}

// Split header and tail from main machine program code.
const header = inputInstructions.slice(0, zTravelMoves[0]);
const tail = inputInstructions.slice(lastZMoveIndex);
const middle = convertGCodeLinesToObjects(inputInstructions.slice(zTravelMoves[0], lastZMoveIndex), headerMove);
inputInstructions = null;
console.log('Previous travel distance', measure(middle).toFixed(3) + unit)

// // chunk code

let subArr = []

let lastInstruction = null;

/**
 *
 * @type {Coords[][]}
 */
let chunks = middle.reduce(
    /**
     *
     * @param {Coords[][]} accum
     * @param {Coords} gcode
     * @param {number} index
     * @param {Coords[]} arr
     */
    (accum, gcode, index, arr) => {
        if (lastInstruction?.instruction === 'G1' && gcode.instruction === 'G0') {
            accum.push(subArr);
            subArr = [];
        }
        subArr.push(gcode);
        if (index === arr.length - 1) {
            accum.push(subArr);
        }
        lastInstruction = gcode;
        return accum;
    }, []);

console.log('Number of chunks: ', chunks.length);

// Verify chunks
const failResult = chunks.findIndex((value, index, arr) => {
    let i = 0;
    if (value[i].instruction !== 'G0') {
        return true;
    }
    while (value[++i].instruction === 'G0') {}
    if (i >= value.length || value[i].instruction !== 'G1') {
        return true;
    }
    while (value[++i]?.instruction === 'G1') {}
    return i !== value.length;
})

if (failResult > -1) {
    console.error('Bad chunk found at index ', failResult);
} else {
    console.log('All chunks check out ok');
}

let newChunkOrder = new Array(chunks.length);
let chunkOrderIndex = 0;

/**
 * @typedef {Object} setCoords
 * @property {Coords[]} chunk
 * @property {Coords} startCoord
 * @property {Coords} firstCut
 * @property {Coords} lastCut
 */

/**
 *
 * @type {setCoords[]}
 */
let remaining = new Array(chunks.length - 1);

// Expand chunk data for indexability
chunks = chunks.map((chunk) => {
    let i = 0;
    while (chunk[i].instruction === 'G0') {
        i++;
    }

    return {
        chunk,
        startCoord: chunk[i - 1],
        firstCut: chunk[i],
        lastCut: chunk[chunk.length - 1]
    };
});

console.log('Prepping Set')

let remIndex = 0;

chunks.forEach((chunk, i) => {
    if (i === 0) {
        newChunkOrder[chunkOrderIndex++] = chunk;
    } else {
        remaining[remIndex++] = chunk;
    }
});

console.log('Set is good to go.')

// sort code

/**
 *
 * @type {setCoords}
 */
let thisCoord = newChunkOrder[0];

while (chunkOrderIndex < newChunkOrder.length) {
    // Scan for nearest coord
    let closestCoord = null;
    let shortestDistance = Number.MAX_VALUE;

    /**
     * @type {setCoords}
     */
    remIndex = 0;
    for (remIndex = 0; remIndex < remaining.length; ++remIndex) {
        let coord = remaining[remIndex];
        if (coord) {
            const dist = coord.startCoord.horizontalDist(thisCoord.lastCut);
            if (dist < shortestDistance) {
                closestCoord = remIndex;
                shortestDistance = dist;
            }
        }
    }

    // remove from set, add to newChunkOrder
    newChunkOrder[chunkOrderIndex++] = remaining[closestCoord];

    // update thisCoord
    thisCoord = remaining[closestCoord];
    remaining[closestCoord] = null;
}

newChunkOrder = newChunkOrder.map(coords => coords.chunk).reduce((accum, arr) => {
    if (accum.length === 0) {
        arr[0].prev = headerMove
    } else {
        arr[0].prev = accum[accum.length - 1];
    }

    const prev = arr[0].prev;
    let present = arr[0];
    let idx = 0;
    if (arr[1].instruction === 'G0') {
        present = arr[1];
        idx = 1;
    }

    // optimize Z moves by distance between
    // - if move is less than 0.1 inches, only lift by 0.1 inches
    // prev is the last G1 move of the last chunk
    // nextCoord is the first G1 move of the current chunk
    const hDist = present && prev && present.horizontalDist(prev) || null
    if (hDist !== null && hDist <= minMove) {
        const nextCoord = arr[idx + 1];
        present.z = Math.max(nextCoord.z, prev.z) + minMove;
    }

    return accum.concat(arr)
}, []);

console.log('New travel distance ', measure(newChunkOrder).toFixed(3) + unit);

remaining = null;

// write out transformed code
let outputLines = header.concat(convertObjectsToGCodeLines(newChunkOrder), tail).join(splitter);

// save to file
fs.writeFileSync(outputFile, outputLines, { encoding: 'utf-8' });