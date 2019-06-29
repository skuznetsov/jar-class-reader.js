class CodeReader {
    constructor(code) {
        this._reader = Buffer.from(code);
        this._pc = 0;
    }

    get pc() {
        return this._pc;
    }

    set pc(pos) {
        this._pc = pos;
    }

    get EOF() {
        return this._pc >= this._reader.length;
    }

    readByte() {
        let value = this._reader.readUInt8(this.pc, true);
        this.pc++;
        return value;
    }
    
    readUShort() {
        let value = this._reader.readUInt16BE(this.pc, true);
        this.pc += 2;
        return value;
    }

    readShort() {
        let value = this._reader.readInt16BE(this.pc, true);
        this.pc += 2;
        return value;
    }

    readInt() {
        let value = this._reader.readInt32BE(this.pc, true);
        this.pc += 4;
        return value;
    }

    readUInt() {
        let value = this._reader.readUInt32BE(this.pc, true);
        this.pc += 4;
        return value;
    }
    
    readLong() {
        let high = this.readInt()
        let low = this.readInt()
        return {low, high};
    }
    
    readULong() {
        let high = this.readUInt()
        let low = this.readUInt()
        return {low, high};
    }

    readFloat() {
        let value = this._reader.readFloatBE(this.pc, true);
        this.pc += 4;
        return value;
    }
    
    readDouble() {
        let value = this._reader.readDoubleBE(this.pc, true);
        this.pc += 8;
        return value;
    }
    
    readBytes(length) {
        let value = this._reader.slice(this.pc, this.pc + length);
        this.pc += length;
        return value;
    }

    readString(length) {
        let value = this._reader.slice(this.pc, this.pc + length).toString('utf8');
        this.pc += length;
        return value;
    }
}

module.exports = CodeReader;