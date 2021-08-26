const instructionRegexp = /(G[01])(X-?[\d.]+)?(Y-?[\d.]+)?(Z-?[\d.]+)?(F-?[\d.]+)?/g

export default class Coords {
    /**
     *
     * @param {string|Coords} gcode
     * @param {Coords} prev
     */
    constructor(gcode, prev) {
        if (gcode instanceof Coords) {
            this.instruction = gcode.instruction;
            this.prev = gcode.prev;
            if (gcode._x != null) {
                this._x = gcode._x;
            }
            if (gcode._y != null) {
                this._y = gcode._y;
            }
            if (gcode._z != null) {
                this._z = gcode._z;
            }
            if (gcode._f != null) {
                this._f = gcode._f;
            }
        } else {
            this.prev = prev || null;
            this.instruction = '';

            const matches = gcode.matchAll(instructionRegexp).next().value

            for (let i = 1; i < matches.length; ++i) {
                /**
                 * @type {string}
                 */
                const match = matches[i];
                if (match) {
                    const leadChar = match[0];
                    switch (leadChar) {
                        case 'G':
                            this.instruction = match;
                            break;
                        case 'X':
                            this._x = parseFloat(match.substring(1));
                            break;
                        case 'Y':
                            this._y = parseFloat(match.substring(1));
                            break;
                        case 'Z':
                            this._z = parseFloat(match.substring(1));
                            break;
                        case 'F':
                            this._f = parseFloat(match.substring(1));
                            break;
                    }
                }
            }
        }
    }

    toString() {
        let outStr = this.instruction;
        if (this._x) {
            outStr += 'X' + this.x.toFixed(3);
        }
        if (this._y) {
            outStr += 'Y' + this.y.toFixed(3);
        }
        if (this._z) {
            outStr += 'Z' + this.z.toFixed(3);
        }
        if (this._f) {
            outStr += 'F' + this.f.toFixed(3);
        }
        return outStr;
    }

    get x() {
        return this._x != null ? this._x : (this.prev?.x || 0);
    }

    get y() {
        return this._y != null ? this._y : (this.prev?.y || 0);
    }

    get z() {
        return this._z != null ? this._z : (this.prev?.z || 0);
    }

    get f() {
        return this._f != null ? this._f : (this.prev?.f || 0);
    }

    set x(val) {
        if (this._x != null) {
            this._x = val;
        } else {
            this.prev.x = val;
        }
    }

    set y(val) {
        if (this._y != null) {
            this._y = val;
        } else {
            this.prev.y = val;
        }
    }

    set z(val) {
        if (this._z != null) {
            this._z = val;
        } else {
            this.prev.z = val;
        }
    }

    set f(val) {
        if (this._f != null) {
            this._f = val;
        } else {
            this.prev.f = val;
        }
    }

    distFromPrev() {
        if (this.prev) {
            const {
                x,
                y,
                z
            } = this.prev;
            return Math.sqrt((this.z - z) ** 2 + (this.y - y) ** 2 + (this.x - x) ** 2);
        } else {
            return Math.sqrt(this.x ** 2 + this.y ** 2 + this.z ** 2)
        }
    }

    horizontalDist(other) {
        return Math.sqrt((other.y - this.y) ** 2 + (other.x - this.x) ** 2);
    }
}